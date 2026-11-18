import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';

const router = Router();
const validId = (value) => /^[1-9]\d*$/.test(String(value ?? ''));
const validStatuses = new Set(['active', 'inactive', 'blocked']);
const validGenders = new Set(['', 'male', 'female', 'other']);

function parsePage(value, fallback, maximum) {
  const parsed = value == null ? fallback : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function normalizeStudent(body, { passwordRequired = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Data siswa tidak valid.' };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const nis = typeof body.nis_nisn === 'string' ? body.nis_nisn.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const rombel = typeof body.rombel === 'string' ? body.rombel.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const gender = body.gender == null ? '' : String(body.gender);
  const status = body.status || 'active';
  const password = body.password == null ? '' : String(body.password);
  if (!name || name.length > 180 || !nis || nis.length > 40 || email.length > 190
    || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    || rombel.length > 80 || phone.length > 30
    || !validGenders.has(gender) || !validStatuses.has(status)) {
    return { error: 'Nama, NIS/NISN, kelas, kontak, jenis kelamin, atau status siswa tidak valid.' };
  }
  if (passwordRequired || password) {
    if (password.length < 8 || password.length > 128 || !/[A-Z]/.test(password)
      || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return { error: 'Kata sandi harus memiliki 8-128 karakter, huruf besar, angka, dan simbol.' };
    }
  }
  return {
    value: {
      name,
      nis,
      email: email || null,
      rombel: rombel || null,
      phone: phone || null,
      gender: gender || null,
      status,
      password
    }
  };
}

function staffOnly(req, res, next) {
  if (req.school.role === 'member') {
    return res.status(403).json({ message: 'Data siswa hanya dapat dikelola oleh petugas sekolah.' });
  }
  return next();
}

router.get('/academic-years', staffOnly, requireSchoolPermission('master.students', 'view'), async (req, res, next) => {
  try {
    const [years] = await pool.execute(
      `SELECT y.id, y.label, y.is_active,
              (y.students_archived_at IS NOT NULL OR EXISTS (
                SELECT 1 FROM school_year_student_archives a
                WHERE a.school_id = y.school_id AND a.school_year_id = y.id
              )) AS has_archive
       FROM school_years y
       WHERE y.school_id = ?
       ORDER BY y.start_date DESC, y.id DESC`,
      [req.school.id]
    );
    return res.json({
      years: years.map((year) => ({
        id: String(year.id),
        label: year.label,
        isActive: Boolean(year.is_active),
        hasArchive: Boolean(year.has_archive)
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/archives', staffOnly, requireSchoolPermission('master.students', 'view'), async (req, res, next) => {
  const schoolYearId = typeof req.query.schoolYearId === 'string' ? req.query.schoolYearId : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const page = parsePage(req.query.page, 1, 1000000);
  const limit = parsePage(req.query.limit, 25, 100);
  if (!validId(schoolYearId)) return res.status(400).json({ message: 'Pilih tahun pelajaran arsip yang valid.' });
  if (search.length > 100) return res.status(400).json({ message: 'Pencarian arsip maksimal 100 karakter.' });
  if (!page || !limit) return res.status(400).json({ message: 'Nomor halaman atau jumlah data tidak valid.' });

  try {
    const [years] = await pool.execute(
      `SELECT id, label, is_active FROM school_years
       WHERE id = ? AND school_id = ? LIMIT 1`,
      [schoolYearId, req.school.id]
    );
    if (!years[0]) return res.status(404).json({ message: 'Tahun pelajaran arsip tidak ditemukan.' });

    const conditions = ['school_id = ?', 'school_year_id = ?'];
    const values = [req.school.id, schoolYearId];
    if (search) {
      conditions.push('(name LIKE ? OR nis_nisn LIKE ? OR COALESCE(rombel, \'\') LIKE ?)');
      values.push(...Array(3).fill(`%${search}%`));
    }
    const where = conditions.join(' AND ');
    const [[count], [students]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total FROM school_year_student_archives WHERE ${where}`, values),
      pool.execute(
        `SELECT id, student_id, nis_nisn, name, email, rombel, phone, gender, status,
                promotion_status, next_rombel, archived_at
         FROM school_year_student_archives
         WHERE ${where}
         ORDER BY rombel ASC, name ASC, id ASC
         LIMIT ? OFFSET ?`,
        [...values, limit, (page - 1) * limit]
      )
    ]);
    const total = Number(count.total);
    return res.json({
      schoolYear: { id: String(years[0].id), label: years[0].label, isActive: Boolean(years[0].is_active) },
      students: students.map((student) => ({
        ...student,
        id: String(student.id),
        student_id: String(student.student_id)
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/classes', staffOnly, requireSchoolPermission('master.students', 'view'), async (req, res, next) => {
  try {
    const [classes] = await pool.execute(
      `SELECT COALESCE(NULLIF(TRIM(rombel), ''), 'Belum diatur') AS class_name,
              COUNT(*) AS student_count,
              SUM(status = 'active') AS active_count
       FROM users
       WHERE school_id = ? AND role = 'member'
       GROUP BY COALESCE(NULLIF(TRIM(rombel), ''), 'Belum diatur')
       ORDER BY class_name ASC`,
      [req.school.id]
    );
    return res.json({
      classes: classes.map((item) => ({
        className: item.class_name,
        studentCount: Number(item.student_count),
        activeCount: Number(item.active_count)
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/', staffOnly, requireSchoolPermission('master.students', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const rombel = typeof req.query.rombel === 'string' ? req.query.rombel.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const page = parsePage(req.query.page, 1, 1000000);
  const limit = parsePage(req.query.limit, 25, 100);
  if (search.length > 100 || rombel.length > 80) return res.status(400).json({ message: 'Filter pencarian terlalu panjang.' });
  if (!page || !limit) return res.status(400).json({ message: 'Nomor halaman atau jumlah data tidak valid.' });
  if (status && !validStatuses.has(status)) return res.status(400).json({ message: 'Filter status siswa tidak valid.' });

  const conditions = ['school_id = ?', "role = 'member'"];
  const values = [req.school.id];
  if (search) {
    conditions.push('(name LIKE ? OR nis_nisn LIKE ?)');
    values.push(`%${search}%`, `%${search}%`);
  }
  if (rombel) {
    conditions.push("COALESCE(NULLIF(TRIM(rombel), ''), 'Belum diatur') = ?");
    values.push(rombel);
  }
  if (status) {
    conditions.push('status = ?');
    values.push(status);
  }
  const where = conditions.join(' AND ');
  try {
    const [[count], [students]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total FROM users WHERE ${where}`, values),
      pool.execute(
        `SELECT id, nis_nisn, name, email, rombel, gender, phone, status, created_at
         FROM users WHERE ${where}
         ORDER BY name ASC, id ASC LIMIT ? OFFSET ?`,
        [...values, limit, (page - 1) * limit]
      )
    ]);
    const total = Number(count.total);
    return res.json({
      students: students.map((student) => ({ ...student, id: String(student.id) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', staffOnly, requireSchoolPermission('master.students', 'edit'), async (req, res, next) => {
  const { value, error } = normalizeStudent(req.body, { passwordRequired: true });
  if (error) return res.status(400).json({ message: error });
  try {
    const passwordHash = await bcrypt.hash(value.password, 12);
    const [result] = await pool.execute(
      `INSERT INTO users (school_id, role, name, email, password, nis_nisn, rombel, phone, gender, status)
       VALUES (?, 'member', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.school.id, value.name, value.email, passwordHash, value.nis, value.rombel, value.phone, value.gender, value.status]
    );
    return res.status(201).json({
      student: {
        id: String(result.insertId),
        nis_nisn: value.nis,
        name: value.name,
        email: value.email,
        rombel: value.rombel,
        gender: value.gender,
        phone: value.phone,
        status: value.status
      },
      message: 'Data siswa berhasil ditambahkan.'
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'NIS/NISN atau email sudah terdaftar di sekolah ini.' });
    }
    return next(error);
  }
});

router.post('/import', staffOnly, requireSchoolPermission('master.students', 'edit'), async (req, res, next) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) {
    return res.status(400).json({ message: 'File harus berisi 1 sampai 500 baris siswa.' });
  }
  const normalized = [];
  const nisValues = new Set();
  const emailValues = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const result = normalizeStudent(rows[index], { passwordRequired: true });
    if (result.error) return res.status(400).json({ message: `Baris ${index + 2}: ${result.error}` });
    const student = result.value;
    const normalizedNis = student.nis.toLocaleLowerCase('id-ID');
    const normalizedEmail = student.email?.toLocaleLowerCase('id-ID');
    if (nisValues.has(normalizedNis) || (normalizedEmail && emailValues.has(normalizedEmail))) {
      return res.status(400).json({ message: `Baris ${index + 2}: NIS/NISN atau email duplikat di dalam file.` });
    }
    nisValues.add(normalizedNis);
    if (normalizedEmail) emailValues.add(normalizedEmail);
    normalized.push(student);
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    for (let index = 0; index < normalized.length; index += 1) {
      const student = normalized[index];
      const passwordHash = await bcrypt.hash(student.password, 12);
      await connection.execute(
        `INSERT INTO users (school_id, role, name, email, password, nis_nisn, rombel, phone, gender, status)
         VALUES (?, 'member', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.school.id, student.name, student.email, passwordHash, student.nis, student.rombel, student.phone, student.gender, student.status]
      );
    }
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({ imported: normalized.length, message: `${normalized.length} data siswa berhasil diimpor.` });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'NIS/NISN atau email salah satu siswa sudah terdaftar di sekolah ini; tidak ada data yang diimpor.' });
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/:id', staffOnly, requireSchoolPermission('master.students', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID siswa tidak valid.' });
  const { value, error } = normalizeStudent(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const [result] = await pool.execute(
      `UPDATE users SET name = ?, email = ?, nis_nisn = ?, rombel = ?, phone = ?, gender = ?, status = ?
       WHERE id = ? AND school_id = ? AND role = 'member'`,
      [value.name, value.email, value.nis, value.rombel, value.phone, value.gender, value.status, id, req.school.id]
    );
    if (!result.affectedRows) {
      const [rows] = await pool.execute(
        `SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'member' LIMIT 1`,
        [id, req.school.id]
      );
      if (!rows[0]) return res.status(404).json({ message: 'Data siswa tidak ditemukan.' });
    }
    if (value.password) {
      const passwordHash = await bcrypt.hash(value.password, 12);
      await pool.execute(
        `UPDATE users SET password = ? WHERE id = ? AND school_id = ? AND role = 'member'`,
        [passwordHash, id, req.school.id]
      );
    }
    return res.json({ message: 'Data siswa berhasil diperbarui.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'NIS/NISN atau email sudah digunakan siswa lain.' });
    return next(error);
  }
});

router.delete('/bulk', staffOnly, requireSchoolPermission('master.students', 'delete'), async (req, res, next) => {
  const rawIds = req.body?.ids;
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 500) {
    return res.status(400).json({ message: 'Pilih 1 sampai 500 siswa untuk dihapus.' });
  }
  const ids = [...new Set(rawIds.map(String))];
  if (ids.some((id) => !validId(id))) return res.status(400).json({ message: 'Daftar ID siswa tidak valid.' });
  try {
    const placeholders = ids.map(() => '?').join(', ');
    const [result] = await pool.execute(
      `DELETE FROM users WHERE school_id = ? AND role = 'member' AND id IN (${placeholders})`,
      [req.school.id, ...ids]
    );
    return res.json({ deleted: result.affectedRows, message: `${result.affectedRows} siswa berhasil dihapus.` });
  } catch (error) {
    if (error.errno === 1451) {
      return res.status(409).json({ message: 'Sebagian siswa memiliki riwayat transaksi dan tidak dapat dihapus.' });
    }
    return next(error);
  }
});

router.delete('/:id', staffOnly, requireSchoolPermission('master.students', 'delete'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID siswa tidak valid.' });
  try {
    const [result] = await pool.execute(
      `DELETE FROM users WHERE id = ? AND school_id = ? AND role = 'member'`,
      [id, req.school.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Data siswa tidak ditemukan.' });
    return res.json({ message: 'Data siswa berhasil dihapus.' });
  } catch (error) {
    if (error.errno === 1451) return res.status(409).json({ message: 'Siswa memiliki riwayat transaksi sehingga tidak dapat dihapus.' });
    return next(error);
  }
});

export default router;
