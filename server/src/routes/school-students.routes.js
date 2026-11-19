import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';
import { classDetailsFromRombel, classGradeLevels } from '../utils/school-year-promotion.js';

const router = Router();
const validId = (value) => /^[1-9]\d*$/.test(String(value ?? ''));
const validStatuses = new Set(['active', 'inactive']);
const validGenders = new Set(['', 'male', 'female', 'other']);
const memberCodeFor = (schoolCode, userId) => `MBR${schoolCode}-${userId}`;

function parsePage(value, fallback, maximum) {
  const parsed = value == null ? fallback : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function normalizeSchoolClass(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Data kelas tidak valid.' };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const gradeLevel = typeof body.gradeLevel === 'string' ? body.gradeLevel.trim() : '';
  if (!name || name.length > 80 || !gradeLevel) return { error: 'Nama kelas dan tingkat kelas wajib diisi.' };
  const className = `${gradeLevel} ${name}`;
  if (className.length > 80) return { error: 'Nama lengkap kelas maksimal 80 karakter.' };
  return { value: { name, gradeLevel, className } };
}

async function ensureSchoolClass(connection, schoolId, educationLevel, rombel) {
  const classDetails = classDetailsFromRombel(rombel, educationLevel);
  if (!classDetails) return;
  await connection.execute(
    `INSERT IGNORE INTO school_classes (school_id, grade_level, name, class_name)
     VALUES (?, ?, ?, ?)`,
    [schoolId, classDetails.gradeLevel, classDetails.name, classDetails.className]
  );
}

function normalizeClassIds(rawIds) {
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 500) return null;
  const ids = [...new Set(rawIds.map(String))];
  return ids.length === rawIds.length && ids.every(validId) ? ids : null;
}

async function removeSchoolClasses(schoolId, ids) {
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    await connection.execute(
      'SELECT id FROM tenants_schools WHERE id = ? FOR UPDATE',
      [schoolId]
    );
    const placeholders = ids.map(() => '?').join(', ');
    const [classes] = await connection.execute(
      `SELECT id, class_name FROM school_classes
       WHERE school_id = ? AND id IN (${placeholders}) FOR UPDATE`,
      [schoolId, ...ids]
    );
    if (classes.length !== ids.length) {
      await connection.rollback();
      transactionStarted = false;
      return { error: 'Sebagian kelas tidak ditemukan atau bukan milik sekolah ini.', status: 404 };
    }
    const classNames = classes.map((item) => item.class_name);
    await connection.execute(
      `UPDATE users SET rombel = NULL
       WHERE school_id = ? AND role = 'member' AND TRIM(rombel) IN (${classNames.map(() => '?').join(', ')})`,
      [schoolId, ...classNames]
    );
    await connection.execute(
      `DELETE FROM school_classes WHERE school_id = ? AND id IN (${placeholders})`,
      [schoolId, ...ids]
    );
    await connection.commit();
    transactionStarted = false;
    return { deleted: classes.length };
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function normalizeStudent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Data siswa tidak valid.' };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const nis = typeof body.nis_nisn === 'string' ? body.nis_nisn.trim() : '';
  const rombel = typeof body.rombel === 'string' ? body.rombel.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const gender = body.gender == null ? '' : String(body.gender);
  const status = body.status || 'active';
  const photo = body.photo == null || body.photo === '' ? null : body.photo;
  if (photo !== null && (typeof photo !== 'string' || photo.length > 700000
    || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo))) {
    return { error: 'Foto siswa harus berupa gambar JPG, PNG, atau WebP dengan ukuran hasil kompresi maksimal 500 KB.' };
  }
  if (!name || name.length > 180 || !nis || nis.length > 40
    || rombel.length > 80 || phone.length > 30
    || !validGenders.has(gender) || !validStatuses.has(status)) {
    return { error: 'Nama, NIS/NISN, kelas, kontak, jenis kelamin, atau status siswa tidak valid.' };
  }
  return {
    value: {
      name,
      nis,
      rombel: rombel || null,
      phone: phone || null,
      gender: gender || null,
      status,
      photo
    }
  };
}

function normalizeMemberCredentials(body, { passwordRequired = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Data akun member tidak valid.' };
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^[a-z0-9._-]{3,32}$/.test(username)
      || (email && (email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
      || phone.length > 30
      || (passwordRequired && !password)
      || (password && (password.length < 8 || password.length > 128 || !/[A-Z]/.test(password)
        || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)))) {
    return { error: 'Username wajib 3-32 karakter. Periksa email, nomor telepon, dan kata sandi (minimal 8 karakter, huruf besar, angka, dan simbol).' };
  }
  return { value: { username, email: email || null, phone: phone || null, password } };
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

router.get('/inactive', staffOnly, requireSchoolPermission('master.students', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const page = parsePage(req.query.page, 1, 1000000);
  const limit = parsePage(req.query.limit, 25, 100);
  if (search.length > 100) return res.status(400).json({ message: 'Pencarian siswa nonaktif maksimal 100 karakter.' });
  if (!page || !limit) return res.status(400).json({ message: 'Nomor halaman atau jumlah data tidak valid.' });

  const conditions = [
    'u.school_id = ?',
    "u.role = 'member'",
    "u.status IN ('inactive', 'blocked')"
  ];
  const values = [req.school.id];
  if (search) {
    conditions.push('(u.name LIKE ? OR COALESCE(u.nis_nisn, \'\') LIKE ? OR COALESCE(u.rombel, \'\') LIKE ?)');
    values.push(...Array(3).fill(`%${search}%`));
  }
  const where = conditions.join(' AND ');

  try {
    const [[count], [students]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total FROM users u WHERE ${where}`, values),
      pool.execute(
        `SELECT u.id, u.nis_nisn, u.name, u.photo, u.rombel, u.gender, u.phone, u.status,
                CASE WHEN EXISTS (
                  SELECT 1 FROM school_year_student_archives a
                  WHERE a.school_id = u.school_id AND a.student_id = u.id
                    AND a.promotion_status = 'graduated'
                ) THEN 'graduated' ELSE 'inactive' END AS inactive_reason,
                (SELECT y.label
                 FROM school_year_student_archives a
                 JOIN school_years y ON y.school_id = a.school_id AND y.id = a.school_year_id
                 WHERE a.school_id = u.school_id AND a.student_id = u.id
                   AND a.promotion_status = 'graduated'
                 ORDER BY a.archived_at DESC, a.id DESC
                 LIMIT 1) AS graduation_year
         FROM users u
         WHERE ${where}
         ORDER BY u.name ASC, u.id ASC
         LIMIT ? OFFSET ?`,
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

router.get('/classes', staffOnly, requireSchoolPermission('master.students', 'view'), async (req, res, next) => {
  try {
    const [[classes], [unassignedRows], [schools]] = await Promise.all([
      pool.execute(
        `SELECT c.id, c.grade_level, c.name, c.class_name,
                COUNT(u.id) AS student_count,
                COALESCE(SUM(u.status = 'active'), 0) AS active_count
         FROM school_classes c
         LEFT JOIN users u ON u.school_id = c.school_id AND u.role = 'member'
           AND TRIM(u.rombel) = c.class_name
         WHERE c.school_id = ?
         GROUP BY c.id, c.grade_level, c.name, c.class_name`,
        [req.school.id]
      ),
      pool.execute(
        `SELECT COUNT(*) AS student_count,
                COALESCE(SUM(status = 'active'), 0) AS active_count
         FROM users
         WHERE school_id = ? AND role = 'member'
           AND (rombel IS NULL OR TRIM(rombel) = '')`,
        [req.school.id]
      ),
      pool.execute('SELECT education_level FROM tenants_schools WHERE id = ? LIMIT 1', [req.school.id])
    ]);
    const educationLevel = schools[0]?.education_level || '';
    const gradeLevels = classGradeLevels(educationLevel);
    const result = classes.map((item) => ({
      id: String(item.id),
      gradeLevel: item.grade_level,
      name: item.name,
      className: item.class_name,
      studentCount: Number(item.student_count),
      activeCount: Number(item.active_count)
    }));
    const rank = new Map(gradeLevels.map((level, index) => [level, index]));
    result.sort((left, right) => (rank.get(left.gradeLevel) ?? gradeLevels.length)
      - (rank.get(right.gradeLevel) ?? gradeLevels.length)
      || left.name.localeCompare(right.name, 'id'));
    const unassignedCount = Number(unassignedRows[0]?.student_count || 0);
    if (unassignedCount > 0) {
      result.push({
        id: null,
        gradeLevel: null,
        name: '',
        className: 'Belum diatur',
        studentCount: unassignedCount,
        activeCount: Number(unassignedRows[0]?.active_count || 0),
        isUnassigned: true
      });
    }
    return res.json({
      educationLevel,
      gradeLevels,
      classes: result
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/classes', staffOnly, requireSchoolPermission('master.students', 'edit'), async (req, res, next) => {
  const { value, error } = normalizeSchoolClass(req.body);
  if (error) return res.status(400).json({ message: error });
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [schools] = await connection.execute(
      'SELECT education_level FROM tenants_schools WHERE id = ? FOR UPDATE',
      [req.school.id]
    );
    const gradeLevels = classGradeLevels(schools[0]?.education_level);
    if (!gradeLevels.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(400).json({ message: 'Atur jenjang pendidikan sekolah terlebih dahulu di menu Identitas Sekolah.' });
    }
    if (!gradeLevels.includes(value.gradeLevel)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(400).json({ message: 'Tingkat kelas tidak sesuai dengan jenjang pendidikan sekolah.' });
    }
    const [result] = await connection.execute(
      `INSERT INTO school_classes (school_id, grade_level, name, class_name)
       VALUES (?, ?, ?, ?)`,
      [req.school.id, value.gradeLevel, value.name, value.className]
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({
      class: { id: String(result.insertId), ...value },
      message: 'Kelas berhasil ditambahkan.'
    });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Nama kelas tersebut sudah digunakan.' });
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/classes/:id', staffOnly, requireSchoolPermission('master.students', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID kelas tidak valid.' });
  const { value, error } = normalizeSchoolClass(req.body);
  if (error) return res.status(400).json({ message: error });
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [schools] = await connection.execute(
      'SELECT education_level FROM tenants_schools WHERE id = ? FOR UPDATE',
      [req.school.id]
    );
    const gradeLevels = classGradeLevels(schools[0]?.education_level);
    if (!gradeLevels.includes(value.gradeLevel)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(400).json({
        message: gradeLevels.length
          ? 'Tingkat kelas tidak sesuai dengan jenjang pendidikan sekolah.'
          : 'Atur jenjang pendidikan sekolah terlebih dahulu di menu Identitas Sekolah.'
      });
    }
    const [classes] = await connection.execute(
      'SELECT class_name FROM school_classes WHERE id = ? AND school_id = ? FOR UPDATE',
      [id, req.school.id]
    );
    if (!classes[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Kelas tidak ditemukan.' });
    }
    await connection.execute(
      `UPDATE school_classes SET grade_level = ?, name = ?, class_name = ?
       WHERE id = ? AND school_id = ?`,
      [value.gradeLevel, value.name, value.className, id, req.school.id]
    );
    await connection.execute(
      `UPDATE users SET rombel = ?
       WHERE school_id = ? AND role = 'member' AND TRIM(rombel) = ?`,
      [value.className, req.school.id, classes[0].class_name]
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({ class: { id, ...value }, message: 'Kelas berhasil diperbarui.' });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Nama kelas tersebut sudah digunakan.' });
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.get('/classes/:id/students', staffOnly, requireSchoolPermission('master.students', 'view'), async (req, res, next) => {
  const id = String(req.params.id);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const page = parsePage(req.query.page, 1, 1000000);
  const limit = parsePage(req.query.limit, 25, 100);
  if (!validId(id)) return res.status(400).json({ message: 'ID kelas tidak valid.' });
  if (search.length > 100) return res.status(400).json({ message: 'Pencarian siswa maksimal 100 karakter.' });
  if (!page || !limit) return res.status(400).json({ message: 'Nomor halaman atau jumlah data tidak valid.' });
  try {
    const [classes] = await pool.execute(
      'SELECT class_name FROM school_classes WHERE id = ? AND school_id = ? LIMIT 1',
      [id, req.school.id]
    );
    if (!classes[0]) return res.status(404).json({ message: 'Kelas tidak ditemukan.' });
    const conditions = ['school_id = ?', "role = 'member'"];
    const values = [req.school.id];
    if (search) {
      conditions.push('(name LIKE ? OR nis_nisn LIKE ? OR COALESCE(rombel, \'\') LIKE ?)');
      values.push(...Array(3).fill(`%${search}%`));
    }
    const where = conditions.join(' AND ');
    const [[count], [students]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total FROM users WHERE ${where}`, values),
      pool.execute(
        `SELECT id, name, nis_nisn, rombel,
                (TRIM(COALESCE(rombel, '')) = ?) AS assigned,
                (TRIM(COALESCE(rombel, '')) <> '' AND TRIM(COALESCE(rombel, '')) <> ?) AS assigned_elsewhere
         FROM users WHERE ${where}
         ORDER BY name ASC, id ASC LIMIT ? OFFSET ?`,
        [classes[0].class_name, classes[0].class_name, ...values, limit, (page - 1) * limit]
      )
    ]);
    const total = Number(count.total);
    return res.json({
      className: classes[0].class_name,
      students: students.map((student) => ({
        ...student,
        id: String(student.id),
        assigned: Boolean(student.assigned),
        assignedElsewhere: Boolean(student.assigned_elsewhere)
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/classes/:id/students', staffOnly, requireSchoolPermission('master.students', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID kelas tidak valid.' });
  const rawAssignIds = req.body?.assignIds ?? [];
  const rawUnassignIds = req.body?.unassignIds ?? [];
  if (!Array.isArray(rawAssignIds) || !Array.isArray(rawUnassignIds)
      || rawAssignIds.length + rawUnassignIds.length < 1
      || rawAssignIds.length + rawUnassignIds.length > 500) {
    return res.status(400).json({ message: 'Pilih 1 sampai 500 perubahan siswa.' });
  }
  const assignIds = rawAssignIds.length ? normalizeClassIds(rawAssignIds) : [];
  const unassignIds = rawUnassignIds.length ? normalizeClassIds(rawUnassignIds) : [];
  if (!assignIds || !unassignIds || assignIds.some((studentId) => unassignIds.includes(studentId))) {
    return res.status(400).json({ message: 'Daftar siswa yang dipilih tidak valid.' });
  }
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [classes] = await connection.execute(
      'SELECT class_name FROM school_classes WHERE id = ? AND school_id = ? FOR UPDATE',
      [id, req.school.id]
    );
    if (!classes[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Kelas tidak ditemukan.' });
    }
    const allIds = [...assignIds, ...unassignIds];
    const placeholders = allIds.map(() => '?').join(', ');
    const [students] = await connection.execute(
      `SELECT id, rombel FROM users
       WHERE school_id = ? AND role = 'member' AND id IN (${placeholders}) FOR UPDATE`,
      [req.school.id, ...allIds]
    );
    if (students.length !== allIds.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Sebagian siswa tidak ditemukan di sekolah ini.' });
    }
    const className = classes[0].class_name;
    const studentsToUnassign = students.filter((student) => unassignIds.includes(String(student.id)));
    if (studentsToUnassign.some((student) => String(student.rombel || '').trim() !== className)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Sebagian siswa sudah tidak berada di kelas ini. Muat ulang daftar siswa.' });
    }
    const studentsToAssign = students.filter((student) => assignIds.includes(String(student.id)));
    if (studentsToAssign.some((student) => {
      const currentClass = String(student.rombel || '').trim();
      return currentClass && currentClass !== className;
    })) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Sebagian siswa sudah terdaftar di rombel lain. Lepaskan penetapan kelas sebelumnya terlebih dahulu.' });
    }
    if (assignIds.length) {
      await connection.execute(
        `UPDATE users SET rombel = ?
         WHERE school_id = ? AND role = 'member' AND id IN (${assignIds.map(() => '?').join(', ')})`,
        [className, req.school.id, ...assignIds]
      );
    }
    if (unassignIds.length) {
      await connection.execute(
        `UPDATE users SET rombel = NULL
         WHERE school_id = ? AND role = 'member' AND id IN (${unassignIds.map(() => '?').join(', ')})`,
        [req.school.id, ...unassignIds]
      );
    }
    await connection.commit();
    transactionStarted = false;
    return res.json({
      message: `Penetapan ${allIds.length} siswa ke kelas ${className} berhasil disimpan.`,
      updated: allIds.length
    });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.delete('/classes/bulk', staffOnly, requireSchoolPermission('master.students', 'delete'), async (req, res, next) => {
  const ids = normalizeClassIds(req.body?.ids);
  if (!ids) return res.status(400).json({ message: 'Pilih 1 sampai 500 kelas yang valid untuk dihapus.' });
  try {
    const result = await removeSchoolClasses(req.school.id, ids);
    if (result.error) return res.status(result.status).json({ message: result.error });
    return res.json({ deleted: result.deleted, message: `${result.deleted} kelas berhasil dihapus. Siswa terkait menjadi belum diatur.` });
  } catch (error) {
    return next(error);
  }
});

router.delete('/classes/:id', staffOnly, requireSchoolPermission('master.students', 'delete'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID kelas tidak valid.' });
  try {
    const result = await removeSchoolClasses(req.school.id, [id]);
    if (result.error) return res.status(result.status).json({ message: result.error });
    return res.json({ deleted: 1, message: 'Kelas berhasil dihapus. Siswa terkait menjadi belum diatur.' });
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
    conditions.push('(name LIKE ? OR nis_nisn LIKE ? OR member_code LIKE ?)');
    values.push(...Array(3).fill(`%${search}%`));
  }
  if (rombel) {
    conditions.push("COALESCE(NULLIF(TRIM(rombel), ''), 'Belum diatur') = ?");
    values.push(rombel);
  }
  if (status) {
    if (status === 'inactive') {
      conditions.push("status IN ('inactive', 'blocked')");
    } else {
      conditions.push('status = ?');
      values.push(status);
    }
  }
  const where = conditions.join(' AND ');
  try {
    const [[count], [students]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total FROM users WHERE ${where}`, values),
      pool.execute(
        `SELECT id, nis_nisn, name, member_code, photo, rombel, gender, phone,
                CASE WHEN status = 'blocked' THEN 'inactive' ELSE status END AS status,
                created_at
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

router.get('/members', staffOnly, requireSchoolPermission('master.students', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const page = parsePage(req.query.page, 1, 1000000);
  const limit = parsePage(req.query.limit, 25, 100);
  if (search.length > 100) return res.status(400).json({ message: 'Pencarian member maksimal 100 karakter.' });
  if (!page || !limit) return res.status(400).json({ message: 'Nomor halaman atau jumlah data tidak valid.' });
  const conditions = ['school_id = ?', "role = 'member'", 'is_library_member = 1'];
  const values = [req.school.id];
  if (search) {
    conditions.push('(name LIKE ? OR nis_nisn LIKE ? OR member_code LIKE ? OR COALESCE(username, \'\') LIKE ? OR COALESCE(email, \'\') LIKE ?)');
    values.push(...Array(5).fill(`%${search}%`));
  }
  const where = conditions.join(' AND ');
  try {
    const [[count], [members]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total FROM users WHERE ${where}`, values),
      pool.execute(
        `SELECT id, nis_nisn, name, member_code, photo, rombel, username, email, phone,
                CASE WHEN status = 'blocked' THEN 'inactive' ELSE status END AS status,
                (password IS NOT NULL AND password <> '') AS has_login_password
         FROM users WHERE ${where}
         ORDER BY name ASC, id ASC LIMIT ? OFFSET ?`,
        [...values, limit, (page - 1) * limit]
      )
    ]);
    const total = Number(count.total);
    return res.json({
      members: members.map((member) => ({ ...member, id: String(member.id), has_login_password: Boolean(member.has_login_password) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/members/candidates', staffOnly, requireSchoolPermission('master.students', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const rombel = typeof req.query.rombel === 'string' ? req.query.rombel.trim() : '';
  if (search.length > 100 || rombel.length > 80) return res.status(400).json({ message: 'Filter siswa terlalu panjang.' });
  const conditions = ['school_id = ?', "role = 'member'", 'is_library_member = 0'];
  const values = [req.school.id];
  if (search) {
    conditions.push('(name LIKE ? OR nis_nisn LIKE ? OR member_code LIKE ?)');
    values.push(...Array(3).fill(`%${search}%`));
  }
  if (rombel) {
    conditions.push("COALESCE(NULLIF(TRIM(rombel), ''), 'Belum diatur') = ?");
    values.push(rombel);
  }
  try {
    const [students] = await pool.execute(
      `SELECT id, nis_nisn, name, member_code, photo, rombel, status
       FROM users WHERE ${conditions.join(' AND ')}
       ORDER BY name ASC, id ASC LIMIT 100`,
      values
    );
    return res.json({ students: students.map((student) => ({ ...student, id: String(student.id) })) });
  } catch (error) {
    return next(error);
  }
});

router.post('/members', staffOnly, requireSchoolPermission('master.students', 'edit'), async (req, res, next) => {
  const rawIds = req.body?.studentIds;
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 500) {
    return res.status(400).json({ message: 'Pilih 1 sampai 500 siswa untuk dijadikan member.' });
  }
  const ids = [...new Set(rawIds.map(String))];
  if (ids.length !== rawIds.length || ids.some((id) => !validId(id))) {
    return res.status(400).json({ message: 'Daftar siswa yang dipilih tidak valid.' });
  }
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const placeholders = ids.map(() => '?').join(', ');
    const [students] = await connection.execute(
      `SELECT id FROM users
       WHERE school_id = ? AND role = 'member' AND is_library_member = 0
         AND id IN (${placeholders}) FOR UPDATE`,
      [req.school.id, ...ids]
    );
    if (students.length !== ids.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Sebagian siswa sudah menjadi member atau tidak ditemukan. Segarkan daftar lalu coba lagi.' });
    }
    await connection.execute(
      `UPDATE users SET is_library_member = 1
       WHERE school_id = ? AND role = 'member' AND is_library_member = 0
         AND id IN (${placeholders})`,
      [req.school.id, ...ids]
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({ message: `${ids.length} siswa berhasil ditambahkan sebagai member. Atur akun loginnya melalui tombol Edit.` });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.delete('/members', staffOnly, requireSchoolPermission('master.students', 'delete'), async (req, res, next) => {
  const rawIds = req.body?.studentIds;
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 500) {
    return res.status(400).json({ message: 'Pilih 1 sampai 500 member untuk dihapus keanggotaannya.' });
  }
  const ids = [...new Set(rawIds.map(String))];
  if (ids.length !== rawIds.length || ids.some((id) => !validId(id))) {
    return res.status(400).json({ message: 'Daftar member yang dipilih tidak valid.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const placeholders = ids.map(() => '?').join(', ');
    const [members] = await connection.execute(
      `SELECT id FROM users
       WHERE school_id = ? AND role = 'member' AND is_library_member = 1
         AND id IN (${placeholders}) FOR UPDATE`,
      [req.school.id, ...ids]
    );
    if (members.length !== ids.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Sebagian siswa sudah bukan member atau tidak ditemukan. Segarkan daftar lalu coba lagi.' });
    }
    await connection.execute(
      `UPDATE users SET is_library_member = 0
       WHERE school_id = ? AND role = 'member' AND is_library_member = 1
         AND id IN (${placeholders})`,
      [req.school.id, ...ids]
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({
      removed: ids.length,
      message: `${ids.length} keanggotaan berhasil dihapus. Data siswa dan akun tetap tersimpan.`
    });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/members/:id/credentials', staffOnly, requireSchoolPermission('master.students', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID member tidak valid.' });
  try {
    const [members] = await pool.execute(
      `SELECT id, password FROM users
       WHERE id = ? AND school_id = ? AND role = 'member' AND is_library_member = 1
       LIMIT 1`,
      [id, req.school.id]
    );
    if (!members[0]) return res.status(404).json({ message: 'Member tidak ditemukan.' });
    const { value, error } = normalizeMemberCredentials(req.body, { passwordRequired: !members[0].password });
    if (error) return res.status(400).json({ message: error });
    const passwordHash = value.password ? await bcrypt.hash(value.password, 12) : null;
    await pool.execute(
      `UPDATE users
       SET username = ?, email = ?, phone = ?, password = COALESCE(?, password)
       WHERE id = ? AND school_id = ? AND role = 'member' AND is_library_member = 1`,
      [value.username, value.email, value.phone, passwordHash, id, req.school.id]
    );
    return res.json({
      member: { id, username: value.username, email: value.email, phone: value.phone, has_login_password: true },
      message: 'Akun login member berhasil disimpan.'
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Username atau email tersebut sudah digunakan akun lain di sekolah ini.' });
    }
    return next(error);
  }
});

router.post('/', staffOnly, requireSchoolPermission('master.students', 'edit'), async (req, res, next) => {
  const { value, error } = normalizeStudent(req.body);
  if (error) return res.status(400).json({ message: error });
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [schools] = await connection.execute(
      'SELECT education_level FROM tenants_schools WHERE id = ? FOR UPDATE',
      [req.school.id]
    );
    await ensureSchoolClass(connection, req.school.id, schools[0]?.education_level, value.rombel);
    const [result] = await connection.execute(
      `INSERT INTO users (school_id, role, is_library_member, name, password, photo, nis_nisn, rombel, phone, gender, status)
       VALUES (?, 'member', 0, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      [req.school.id, value.name, value.photo, value.nis, value.rombel, value.phone, value.gender, value.status]
    );
    const memberCode = memberCodeFor(req.school.code, result.insertId);
    await connection.execute(
      'UPDATE users SET member_code = ? WHERE id = ? AND school_id = ?',
      [memberCode, result.insertId, req.school.id]
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({
      student: {
        id: String(result.insertId),
        member_code: memberCode,
        photo: value.photo,
        nis_nisn: value.nis,
        name: value.name,
        rombel: value.rombel,
        gender: value.gender,
        phone: value.phone,
        status: value.status
      },
      message: 'Data siswa berhasil ditambahkan.'
    });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'NIS/NISN sudah terdaftar di sekolah ini.' });
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.post('/import', staffOnly, requireSchoolPermission('master.students', 'edit'), async (req, res, next) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) {
    return res.status(400).json({ message: 'File harus berisi 1 sampai 500 baris siswa.' });
  }
  const normalized = [];
  const nisValues = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const result = normalizeStudent(rows[index]);
    if (result.error) return res.status(400).json({ message: `Baris ${index + 2}: ${result.error}` });
    const student = result.value;
    const normalizedNis = student.nis.toLocaleLowerCase('id-ID');
    if (nisValues.has(normalizedNis)) return res.status(400).json({ message: `Baris ${index + 2}: NIS/NISN duplikat di dalam file.` });
    nisValues.add(normalizedNis);
    normalized.push(student);
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [schools] = await connection.execute(
      'SELECT education_level FROM tenants_schools WHERE id = ? FOR UPDATE',
      [req.school.id]
    );
    for (let index = 0; index < normalized.length; index += 1) {
      const student = normalized[index];
      await ensureSchoolClass(connection, req.school.id, schools[0]?.education_level, student.rombel);
      const [result] = await connection.execute(
        `INSERT INTO users (school_id, role, is_library_member, name, password, photo, nis_nisn, rombel, phone, gender, status)
         VALUES (?, 'member', 0, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        [req.school.id, student.name, student.photo, student.nis, student.rombel, student.phone, student.gender, student.status]
      );
      await connection.execute(
        'UPDATE users SET member_code = ? WHERE id = ? AND school_id = ?',
        [memberCodeFor(req.school.code, result.insertId), result.insertId, req.school.id]
      );
    }
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({ imported: normalized.length, message: `${normalized.length} data siswa berhasil diimpor.` });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'NIS/NISN salah satu siswa sudah terdaftar di sekolah ini; tidak ada data yang diimpor.' });
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
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [schools] = await connection.execute(
      'SELECT education_level FROM tenants_schools WHERE id = ? FOR UPDATE',
      [req.school.id]
    );
    await ensureSchoolClass(connection, req.school.id, schools[0]?.education_level, value.rombel);
    const [students] = await connection.execute(
      'SELECT id FROM users WHERE id = ? AND school_id = ? AND role = \'member\' FOR UPDATE',
      [id, req.school.id]
    );
    if (!students[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Data siswa tidak ditemukan.' });
    }
    await connection.execute(
      `UPDATE users SET name = ?, photo = ?, nis_nisn = ?, rombel = ?, phone = ?, gender = ?, status = ?
       WHERE id = ? AND school_id = ? AND role = 'member'`,
      [value.name, value.photo, value.nis, value.rombel, value.phone, value.gender, value.status, id, req.school.id]
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({ message: 'Data siswa berhasil diperbarui.' });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'NIS/NISN atau email sudah digunakan siswa lain.' });
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/:id/activate', staffOnly, requireSchoolPermission('master.students', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID siswa tidak valid.' });
  try {
    const [result] = await pool.execute(
      `UPDATE users SET status = 'active'
       WHERE id = ? AND school_id = ? AND role = 'member' AND status IN ('inactive', 'blocked')`,
      [id, req.school.id]
    );
    if (!result.affectedRows) {
      const [[student]] = await pool.execute(
        'SELECT id FROM users WHERE id = ? AND school_id = ? AND role = ? LIMIT 1',
        [id, req.school.id, 'member']
      );
      if (!student) return res.status(404).json({ message: 'Data siswa tidak ditemukan.' });
      return res.status(409).json({ message: 'Siswa sudah berstatus aktif.' });
    }
    return res.json({ message: 'Siswa berhasil diaktifkan kembali.' });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/deactivate', staffOnly, requireSchoolPermission('master.students', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID siswa tidak valid.' });
  try {
    const [result] = await pool.execute(
      `UPDATE users SET status = 'inactive'
       WHERE id = ? AND school_id = ? AND role = 'member' AND status = 'active'`,
      [id, req.school.id]
    );
    if (!result.affectedRows) {
      const [[student]] = await pool.execute(
        'SELECT id FROM users WHERE id = ? AND school_id = ? AND role = ? LIMIT 1',
        [id, req.school.id, 'member']
      );
      if (!student) return res.status(404).json({ message: 'Data siswa tidak ditemukan.' });
      return res.status(409).json({ message: 'Siswa sudah berstatus nonaktif.' });
    }
    return res.json({ message: 'Siswa berhasil dinonaktifkan.' });
  } catch (error) {
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
