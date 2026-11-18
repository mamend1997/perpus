import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';

const router = Router();
const validId = (value) => /^[1-9]\d*$/.test(String(value ?? ''));
const validTargets = new Set(['all', 'students', 'staff']);
const validStatuses = new Set(['Draft', 'Published']);

function normalizeDateTime(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return undefined;
  const [, datePart, hours, minutes, seconds = '00'] = match;
  const [year, month, day] = datePart.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
    || Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59) return undefined;
  return `${datePart} ${hours}:${minutes}:${seconds}`;
}

function announcementInput(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  const category = typeof body?.category === 'string' ? body.category.trim() : '';
  const targetAudience = body?.targetAudience;
  const status = body?.status;
  const startDate = normalizeDateTime(body?.startDate);
  const endDate = normalizeDateTime(body?.endDate);
  const banner = body?.banner || null;

  if (!title || title.length > 255 || !content || content.length > 20000
    || !category || category.length > 80 || !validTargets.has(targetAudience)
    || !validStatuses.has(status)) {
    return { error: 'Judul, isi, kategori, target, atau status pengumuman tidak valid.' };
  }
  if (startDate === undefined || endDate === undefined
    || (startDate && endDate && startDate > endDate)) {
    return { error: 'Jadwal tayang pengumuman tidak valid.' };
  }
  if (banner != null && (typeof banner !== 'string'
    || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(banner)
    || banner.length > 2_000_000)) {
    return { error: 'Banner harus berupa gambar JPG, PNG, atau WebP maksimal 1,5 MB.' };
  }
  return {
    value: {
      title,
      content,
      category,
      targetAudience,
      status,
      startDate,
      endDate,
      banner
    }
  };
}

async function notifyAudience(connection, schoolId, announcementId, announcement) {
  let audienceCondition = '1 = 1';
  if (announcement.targetAudience === 'students') audienceCondition = "role = 'member'";
  if (announcement.targetAudience === 'staff') audienceCondition = "role <> 'member'";
  await connection.execute(
    `INSERT IGNORE INTO school_notifications
       (school_id, user_id, type, title, message, link, dedupe_key)
     SELECT ?, id, 'announcement', ?, ?, ?, CONCAT('announcement:', ?)
     FROM users
     WHERE school_id = ? AND status = 'active' AND ${audienceCondition}`,
    [
      schoolId,
      announcement.title,
      announcement.content.slice(0, 480),
      `/announcements/${announcementId}`,
      announcementId,
      schoolId
    ]
  );
}

router.get('/', requireSchoolPermission('announcements', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  if (search.length > 100 || category.length > 80) {
    return res.status(400).json({ message: 'Pencarian atau kategori pengumuman terlalu panjang.' });
  }
  if (status && !validStatuses.has(status)) {
    return res.status(400).json({ message: 'Filter status pengumuman tidak valid.' });
  }

  const values = [req.school.id];
  const conditions = ['a.school_id = ?'];
  const isStaff = req.school.role !== 'member';
  if (!isStaff) {
    conditions.push("a.status = 'Published'");
    conditions.push('(a.start_date IS NULL OR a.start_date <= NOW())');
    conditions.push('(a.end_date IS NULL OR a.end_date >= NOW())');
    conditions.push("(a.target_audience = 'all' OR a.target_audience = 'students')");
  } else {
    if (status) {
      conditions.push('a.status = ?');
      values.push(status);
    }
    if (category) {
      conditions.push('a.category = ?');
      values.push(category);
    }
  }
  if (search) {
    conditions.push('(a.title LIKE ? OR a.content LIKE ? OR a.category LIKE ?)');
    values.push(...Array(3).fill(`%${search}%`));
  }
  try {
    const [announcements] = await pool.execute(
      `SELECT a.id, a.title, a.content, a.category, a.target_audience, a.status,
              a.start_date, a.end_date, a.banner, a.created_at, a.updated_at,
              u.name AS author_name
       FROM announcements a
       LEFT JOIN users u ON u.id = a.admin_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY COALESCE(a.start_date, a.created_at) DESC, a.id DESC`,
      values
    );
    return res.json({
      announcements: announcements.map((row) => ({
        ...row,
        id: String(row.id),
        targetAudience: row.target_audience,
        startDate: row.start_date,
        endDate: row.end_date,
        authorName: row.author_name
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireSchoolPermission('announcements', 'edit'), async (req, res, next) => {
  const { value, error } = announcementInput(req.body);
  if (error) return res.status(400).json({ message: error });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO announcements
       (school_id, admin_id, title, content, category, target_audience, status, start_date, end_date, banner)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.school.id,
        req.school.userId,
        value.title,
        value.content,
        value.category,
        value.targetAudience,
        value.status,
        value.startDate,
        value.endDate,
        value.banner
      ]
    );
    if (value.status === 'Published') {
      await notifyAudience(connection, req.school.id, result.insertId, value);
    }
    await connection.commit();
    return res.status(201).json({ id: String(result.insertId), message: 'Pengumuman berhasil disimpan.' });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/:id', requireSchoolPermission('announcements', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  const { value, error } = announcementInput(req.body);
  if (!validId(id)) return res.status(400).json({ message: 'ID pengumuman tidak valid.' });
  if (error) return res.status(400).json({ message: error });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [currentRows] = await connection.execute(
      'SELECT status FROM announcements WHERE id = ? AND school_id = ? FOR UPDATE',
      [id, req.school.id]
    );
    if (!currentRows[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Pengumuman tidak ditemukan.' });
    }
    await connection.execute(
      `UPDATE announcements
       SET title = ?, content = ?, category = ?, target_audience = ?, status = ?,
           start_date = ?, end_date = ?, banner = ?
       WHERE id = ? AND school_id = ?`,
      [
        value.title,
        value.content,
        value.category,
        value.targetAudience,
        value.status,
        value.startDate,
        value.endDate,
        value.banner,
        id,
        req.school.id
      ]
    );
    if (currentRows[0].status !== 'Published' && value.status === 'Published') {
      await notifyAudience(connection, req.school.id, id, value);
    }
    await connection.commit();
    return res.json({ message: 'Pengumuman berhasil diperbarui.' });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.delete('/:id', requireSchoolPermission('announcements', 'delete'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID pengumuman tidak valid.' });
  try {
    const [result] = await pool.execute(
      'DELETE FROM announcements WHERE id = ? AND school_id = ?',
      [id, req.school.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Pengumuman tidak ditemukan.' });
    return res.json({ message: 'Pengumuman berhasil dihapus.' });
  } catch (error) {
    return next(error);
  }
});

export default router;
