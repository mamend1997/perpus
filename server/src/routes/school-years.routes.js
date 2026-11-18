import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';

const router = Router();
const validId = (value) => /^[1-9]\d*$/.test(String(value ?? ''));
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function readInput(body) {
  const label = typeof body?.label === 'string' ? body.label.trim() : '';
  const startDate = body?.startDate;
  const endDate = body?.endDate;
  if (!label || label.length > 40 || !validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    return { error: 'Nama tahun pelajaran dan rentang tanggal harus diisi dengan format yang valid.' };
  }
  return { value: { label, startDate, endDate, isActive: Boolean(body.isActive) } };
}

router.get('/', requireSchoolPermission('master.academic-years', 'view'), async (req, res, next) => {
  try {
    const [years] = await pool.execute(
      `SELECT id, label, start_date, end_date, is_active, created_at
       FROM school_years WHERE school_id = ?
       ORDER BY start_date DESC, id DESC`,
      [req.school.id]
    );
    return res.json({
      years: years.map((year) => ({
        id: String(year.id),
        label: year.label,
        startDate: year.start_date,
        endDate: year.end_date,
        isActive: Boolean(year.is_active),
        createdAt: year.created_at
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireSchoolPermission('master.academic-years', 'edit'), async (req, res, next) => {
  const { value, error } = readInput(req.body);
  if (error) return res.status(400).json({ message: error });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [overlaps] = await connection.execute(
      `SELECT id FROM school_years
       WHERE school_id = ? AND start_date <= ? AND end_date >= ?
       LIMIT 1 FOR UPDATE`,
      [req.school.id, value.endDate, value.startDate]
    );
    if (overlaps.length) {
      await connection.rollback();
      return res.status(409).json({ message: 'Rentang tanggal bertabrakan dengan tahun pelajaran yang sudah ada.' });
    }
    if (value.isActive) {
      await connection.execute('UPDATE school_years SET is_active = 0 WHERE school_id = ?', [req.school.id]);
    }
    const [result] = await connection.execute(
      `INSERT INTO school_years (school_id, label, start_date, end_date, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.school.id, value.label, value.startDate, value.endDate, value.isActive ? 1 : 0, req.school.userId]
    );
    await connection.commit();
    return res.status(201).json({
      year: {
        id: String(result.insertId),
        label: value.label,
        startDate: value.startDate,
        endDate: value.endDate,
        isActive: value.isActive
      },
      message: 'Tahun pelajaran berhasil ditambahkan.'
    });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Nama tahun pelajaran sudah digunakan.' });
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/:id/activate', requireSchoolPermission('master.academic-years', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID tahun pelajaran tidak valid.' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [years] = await connection.execute(
      'SELECT id FROM school_years WHERE id = ? AND school_id = ? FOR UPDATE',
      [id, req.school.id]
    );
    if (!years[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Tahun pelajaran tidak ditemukan.' });
    }
    await connection.execute('UPDATE school_years SET is_active = 0 WHERE school_id = ?', [req.school.id]);
    await connection.execute(
      'UPDATE school_years SET is_active = 1 WHERE id = ? AND school_id = ?',
      [id, req.school.id]
    );
    await connection.commit();
    return res.json({ message: 'Tahun pelajaran aktif berhasil diperbarui.' });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.delete('/:id', requireSchoolPermission('master.academic-years', 'delete'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID tahun pelajaran tidak valid.' });
  try {
    const [result] = await pool.execute(
      'DELETE FROM school_years WHERE id = ? AND school_id = ? AND is_active = 0',
      [id, req.school.id]
    );
    if (!result.affectedRows) {
      const [years] = await pool.execute(
        'SELECT id, is_active FROM school_years WHERE id = ? AND school_id = ? LIMIT 1',
        [id, req.school.id]
      );
      if (!years[0]) return res.status(404).json({ message: 'Tahun pelajaran tidak ditemukan.' });
      return res.status(409).json({ message: 'Tahun pelajaran aktif tidak dapat dihapus.' });
    }
    return res.json({ message: 'Tahun pelajaran berhasil dihapus.' });
  } catch (error) {
    return next(error);
  }
});

export default router;
