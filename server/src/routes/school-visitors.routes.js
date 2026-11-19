import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';

const router = Router();
function parsePageValue(value, fallback, maximum) {
  const parsed = value == null ? fallback : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

router.get('/members', requireSchoolPermission('visitors', 'edit'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search.length > 100) return res.status(400).json({ message: 'Pencarian anggota maksimal 100 karakter.' });

  try {
    if (req.school.role === 'member') {
      const [members] = await pool.execute(
        `SELECT id, name, nis_nisn, member_code, rombel FROM users
         WHERE id = ? AND school_id = ? AND role = 'member' AND is_library_member = 1 AND status = 'active'
         LIMIT 1`,
        [req.school.userId, req.school.id]
      );
      return res.json({ members });
    }

    const [members] = await pool.execute(
      `SELECT id, name, nis_nisn, member_code, rombel FROM users
       WHERE school_id = ? AND role = 'member' AND is_library_member = 1 AND status = 'active'
         AND (? = '' OR name LIKE ? OR nis_nisn LIKE ? OR member_code LIKE ?)
       ORDER BY name ASC
       LIMIT 20`,
      [req.school.id, search, `%${search}%`, `%${search}%`, `%${search}%`]
    );
    return res.json({ members });
  } catch (error) {
    return next(error);
  }
});

router.get('/', requireSchoolPermission('visitors', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const date = typeof req.query.date === 'string' ? req.query.date : '';
  const page = parsePageValue(req.query.page, 1, 1000000);
  const limit = parsePageValue(req.query.limit, 25, 100);
  if (search.length > 100) return res.status(400).json({ message: 'Kata pencarian maksimal 100 karakter.' });
  if (!page || !limit) return res.status(400).json({ message: 'Halaman atau jumlah data tidak valid.' });
  if (date && !isValidDate(date)) return res.status(400).json({ message: 'Tanggal kunjungan tidak valid.' });

  const conditions = ['v.school_id = ?'];
  const values = [req.school.id];
  if (req.school.role === 'member') {
    conditions.push('v.user_id = ?');
    values.push(req.school.userId);
  }
  if (date) {
    conditions.push('v.visit_date >= ? AND v.visit_date < DATE_ADD(?, INTERVAL 1 DAY)');
    values.push(date, date);
  }
  if (search) {
    conditions.push(`(
      u.name LIKE ? OR COALESCE(u.nis_nisn, '') LIKE ? OR COALESCE(u.member_code, '') LIKE ?
      OR COALESCE(u.rombel, '') LIKE ? OR COALESCE(v.purpose, '') LIKE ?
    )`);
    values.push(...Array(5).fill(`%${search}%`));
  }

  const from = `FROM visitors v
    LEFT JOIN users u ON u.school_id = v.school_id AND u.id = v.user_id`;
  const where = conditions.join(' AND ');
  try {
    const [[count], [rows]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, values),
      pool.execute(
        `SELECT v.id, v.visit_date, v.purpose, u.name AS visitor_name,
                u.nis_nisn, u.member_code, u.rombel
         ${from}
         WHERE ${where}
         ORDER BY v.visit_date DESC, v.id DESC
         LIMIT ? OFFSET ?`,
        [...values, limit, (page - 1) * limit]
      )
    ]);
    const total = Number(count.total);
    return res.json({
      visits: rows.map((row) => ({
        id: String(row.id),
        visit_date: row.visit_date,
        visitor_name: row.visitor_name || 'Pengunjung',
        nis_nisn: row.nis_nisn,
        member_code: row.member_code,
        rombel: row.rombel,
        purpose: row.purpose || '—'
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/bulk', requireSchoolPermission('visitors', 'delete'), async (req, res, next) => {
  const rawIds = req.body?.ids;
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 500) {
    return res.status(400).json({ message: 'Pilih 1 sampai 500 kunjungan untuk dihapus.' });
  }
  const ids = [...new Set(rawIds.map(String))];
  if (ids.some((id) => !/^[1-9]\d*$/.test(id))) {
    return res.status(400).json({ message: 'Daftar ID kunjungan tidak valid.' });
  }
  try {
    const placeholders = ids.map(() => '?').join(', ');
    const [result] = await pool.execute(
      `DELETE FROM visitors WHERE school_id = ? AND id IN (${placeholders})`,
      [req.school.id, ...ids]
    );
    return res.json({
      deleted: result.affectedRows,
      message: `${result.affectedRows} kunjungan berhasil dihapus.`
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireSchoolPermission('visitors', 'edit'), async (req, res, next) => {
  const userId = req.school.role === 'member'
    ? String(req.school.userId)
    : String(req.body?.userId ?? '');
  const purpose = typeof req.body?.purpose === 'string' ? req.body.purpose.trim() : '';
  if (!/^[1-9]\d*$/.test(userId) || !purpose || purpose.length > 255) {
    return res.status(400).json({ message: 'Pilih anggota dan keperluan kunjungan yang valid.' });
  }

  try {
    const [members] = await pool.execute(
      `SELECT id, name, nis_nisn, member_code, rombel FROM users
       WHERE id = ? AND school_id = ? AND role = 'member' AND is_library_member = 1 AND status = 'active'
       LIMIT 1`,
      [userId, req.school.id]
    );
    const member = members[0];
    if (!member) return res.status(404).json({ message: 'Anggota aktif tidak ditemukan di sekolah ini.' });

    const [result] = await pool.execute(
      `INSERT INTO visitors (school_id, user_id, visit_date, purpose)
       VALUES (?, ?, CURRENT_TIMESTAMP, ?)`,
      [req.school.id, member.id, purpose]
    );
    const [visits] = await pool.execute(
      `SELECT id, visit_date FROM visitors
       WHERE id = ? AND school_id = ? LIMIT 1`,
      [result.insertId, req.school.id]
    );
    return res.status(201).json({
      visit: {
        id: String(result.insertId),
        visit_date: visits[0].visit_date,
        visitor_name: member.name,
        nis_nisn: member.nis_nisn,
        member_code: member.member_code,
        rombel: member.rombel,
        purpose
      },
      message: `Selamat datang, ${member.name}! Kunjungan berhasil dicatat.`
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
