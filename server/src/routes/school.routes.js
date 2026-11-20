import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { requireSchool } from '../middleware/require-school.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';
import schoolBookRoutes from './school-books.routes.js';
import schoolLoanRoutes from './school-loans.routes.js';
import schoolProcurementRoutes from './school-procurements.routes.js';
import schoolCirculationAnalyticsRoutes from './school-circulation-analytics.routes.js';
import schoolVisitorsRoutes from './school-visitors.routes.js';
import schoolAnnouncementsRoutes from './school-announcements.routes.js';
import schoolReportsRoutes from './school-reports.routes.js';
import schoolYearsRoutes from './school-years.routes.js';
import schoolSettingsRoutes from './school-settings.routes.js';
import schoolReservationsRoutes from './school-reservations.routes.js';
import schoolReviewsRoutes from './school-reviews.routes.js';
import schoolStudentsRoutes from './school-students.routes.js';
import schoolSupportRoutes from './school-support.routes.js';
import schoolSubscriptionRoutes from './school-subscription.routes.js';
import {
  defaultSchoolPermissions, schoolPermissionFeatureKeys, schoolPermissionFeatures,
  schoolPermissionRoles
} from '../utils/school-permissions.js';
import {
  parseSchoolLetterhead, validateSchoolLetterhead
} from '../utils/school-letterhead.js';
import { classDetailsFromRombel } from '../utils/school-year-promotion.js';

const router = Router();
const masterCategoryTypes = new Set([
  'bahasa', 'jenis', 'koleksi', 'klasifikasi', 'topik',
  'rak', 'pengarang', 'penerbit', 'agen'
]);

router.use(requireSchool);
router.use((req, res, next) => {
  const loggedInHistory = ['/books/stock', '/books/rack-transfers', '/books/destructions'].includes(req.path);
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
      || req.path === '/books/activity-logs/page-view' || loggedInHistory) {
    return next();
  }
  res.once('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 400) return;
    const route = `${req.baseUrl}${req.path}`.slice(0, 255);
    const activity = `${req.school.supportMode ? '[MODE PEMELIHARAAN SUPER ADMIN] ' : ''}${req.method} ${route}`.slice(0, 500);
    pool.execute(
      `INSERT INTO school_activity_logs (school_id, user_id, event_type, activity, route, ip_address)
       VALUES (?, ?, 'change', ?, ?, ?)`,
      [req.school.id, req.school.userId, activity, route, req.ip || null]
    ).catch((error) => console.error('Gagal mencatat perubahan data sekolah:', error));
  });
  return next();
});
router.use('/books', schoolBookRoutes);
router.use('/loans', schoolLoanRoutes);
router.use('/procurements', schoolProcurementRoutes);
router.use('/circulation/analytics', schoolCirculationAnalyticsRoutes);
router.use('/visitors', schoolVisitorsRoutes);
router.use('/announcements', schoolAnnouncementsRoutes);
router.use('/reports', schoolReportsRoutes);
router.use('/academic-years', schoolYearsRoutes);
router.use('/settings', schoolSettingsRoutes);
router.use('/reservations', schoolReservationsRoutes);
router.use('/reviews', schoolReviewsRoutes);
router.use('/students', schoolStudentsRoutes);
router.use('/support', schoolSupportRoutes);
router.use('/subscription', schoolSubscriptionRoutes);

router.get('/platform-documents', async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT key_name, value FROM platform_settings
       WHERE key_name IN ('legal_documents', 'user_guide')`
    );
    const saved = Object.fromEntries(rows.map((row) => [row.key_name, JSON.parse(row.value)]));
    return res.json({
      legalDocuments: saved.legal_documents || {
        terms: { title: 'Syarat & Ketentuan Layanan', content: '', updatedAt: null },
        sla: { title: 'Service Level Agreement', content: '', updatedAt: null }
      },
      userGuide: saved.user_guide || {
        title: 'Buku Petunjuk Pengguna',
        content: '',
        pdfUrl: '',
        videoUrl: '',
        updatedAt: null
      }
    });
  } catch (error) {
    return next(error);
  }
});

function requireSchoolAdmin(req, res, next) {
  if (req.school.role !== 'admin') {
    return res.status(403).json({ message: 'Pengaturan akun dan hak akses hanya tersedia untuk Admin sekolah.' });
  }
  return next();
}

function requireMasterCategoryPermission(action) {
  return requireSchoolPermission((req) => {
    const type = req.method === 'GET' ? req.query.type : req.body?.type;
    return masterCategoryTypes.has(type) ? `master.${type}` : null;
  }, action);
}

async function getPermissionsForRole(schoolId, role) {
  const permissions = defaultSchoolPermissions();
  const [rows] = await pool.execute(
    `SELECT feature_key, can_view, can_edit, can_delete
     FROM school_role_permissions
     WHERE school_id = ? AND role = ?`,
    [schoolId, role]
  );
  rows.forEach((row) => {
    if (!schoolPermissionFeatureKeys.has(row.feature_key)) return;
    permissions[row.feature_key] = {
      view: Boolean(row.can_view),
      edit: Boolean(row.can_edit),
      delete: Boolean(row.can_delete)
    };
  });
  return permissions;
}

function validRole(role) {
  return schoolPermissionRoles.includes(role);
}

function normalizeMasterCategory(body, type) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Data Master Data tidak valid.' };
  }
  const textFields = ['code', 'name', 'description', 'email', 'phone', 'address', 'status'];
  if (textFields.some((field) => body[field] != null && typeof body[field] !== 'string')) {
    return { error: 'Semua nilai Master Data harus berupa teks.' };
  }
  const code = type === 'jenis' || type === 'koleksi' || type === 'topik' || type === 'penerbit' ? '' : typeof body?.code === 'string' ? body.code.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const address = typeof body?.address === 'string' ? body.address.trim() : '';
  const status = typeof body?.status === 'string' && body.status ? body.status : 'active';
  const capacityRaw = body?.capacity;
  const capacity = type === 'rak' && capacityRaw != null && capacityRaw !== '' ? Number(capacityRaw) : null;

  if (!masterCategoryTypes.has(type)) {
    return { error: 'Jenis Master Data tidak valid.' };
  }
  if (type === 'rak' && capacity != null && (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100000)) {
    return { error: 'Kapasitas rak harus berupa angka bulat antara 1 dan 100.000.' };
  }
  if (type === 'agen') {
    if (name.length < 1 || name.length > 180 || email.length > 190 || phone.length > 30 || address.length > 65535) {
      return { error: 'Nama wajib diisi; email, nomor telepon, atau alamat melebihi batas karakter.' };
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: 'Format email agen tidak valid.' };
    }
    if (!['active', 'inactive'].includes(status)) {
      return { error: 'Status data tidak valid.' };
    }
    return {
      value: {
        type,
        code: null,
        name,
        description: null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        capacity: null,
        status
      }
    };
  }
  if (email || phone || address) {
    return { error: 'Informasi kontak hanya dapat diisi pada data agen.' };
  }
  if (code.length > 50 || name.length < 1 || name.length > 180 || description.length > 65535) {
    return { error: 'Kode maksimal 50 karakter, nama wajib diisi maksimal 180 karakter, dan keterangan maksimal 65.535 karakter.' };
  }
  if (!['active', 'inactive'].includes(status)) {
    return { error: 'Status data tidak valid.' };
  }
  return {
    value: {
      type, code: code || null, name, description: description || null,
      email: null, phone: null, address: null,
      capacity: type === 'rak' ? capacity : null,
      status
    }
  };
}

function normalizeCategoryIds(ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 500) return null;
  const normalized = ids.map((id) => String(id));
  if (normalized.some((id) => !/^[1-9]\d*$/.test(id))) return null;
  return [...new Set(normalized)];
}

router.get('/permissions/me', async (req, res, next) => {
  try {
    const permissions = req.school.role === 'admin'
      ? Object.fromEntries(schoolPermissionFeatures.map(({ key }) => [
        key, { view: true, edit: true, delete: true }
      ]))
      : await getPermissionsForRole(req.school.id, req.school.role);
    return res.json({ role: req.school.role, permissions });
  } catch (error) {
    return next(error);
  }
});

router.get('/permissions/:role', requireSchoolAdmin, async (req, res, next) => {
  if (!validRole(req.params.role)) {
    return res.status(400).json({ message: 'Role hak akses tidak valid.' });
  }
  try {
    return res.json({
      role: req.params.role,
      permissions: await getPermissionsForRole(req.school.id, req.params.role)
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/permissions/:role', requireSchoolAdmin, async (req, res, next) => {
  const { role } = req.params;
  if (!validRole(role)) {
    return res.status(400).json({ message: 'Role hak akses tidak valid.' });
  }
  const submitted = req.body?.permissions;
  if (!Array.isArray(submitted) || submitted.length > schoolPermissionFeatures.length) {
    return res.status(400).json({ message: 'Daftar hak akses tidak valid.' });
  }

  const permissions = defaultSchoolPermissions();
  const seenFeatures = new Set();
  for (const item of submitted) {
    const featureKey = item?.featureKey;
    if (!schoolPermissionFeatureKeys.has(featureKey) || seenFeatures.has(featureKey)
        || typeof item.view !== 'boolean' || typeof item.edit !== 'boolean' || typeof item.delete !== 'boolean') {
      return res.status(400).json({ message: 'Setiap fitur harus memiliki satu nilai Lihat, Edit, dan Hapus yang valid.' });
    }
    seenFeatures.add(featureKey);
    permissions[featureKey] = {
      view: item.view,
      edit: item.edit,
      delete: item.delete
    };
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    await connection.execute(
      'DELETE FROM school_role_permissions WHERE school_id = ? AND role = ?',
      [req.school.id, role]
    );
    const values = [];
    for (const { key } of schoolPermissionFeatures) {
      const permission = permissions[key];
      values.push(req.school.id, role, key, permission.view, permission.edit, permission.delete);
    }
    const placeholders = schoolPermissionFeatures.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    await connection.execute(
      `INSERT INTO school_role_permissions
       (school_id, role, feature_key, can_view, can_edit, can_delete)
       VALUES ${placeholders}`,
      values
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({ role, permissions });
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        return next(rollbackError);
      }
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.get('/users', requireSchoolAdmin, async (req, res, next) => {
  try {
    const [users] = await pool.execute(
      `SELECT id, role, name, email, phone, nis_nisn, rombel, gender, status, is_library_member, created_at
       FROM users
       WHERE school_id = ? AND (role <> 'member' OR is_library_member = 1)
       ORDER BY FIELD(role, 'admin', 'kepsek', 'kapus', 'member'), name ASC`,
      [req.school.id]
    );
    return res.json({ users });
  } catch (error) {
    return next(error);
  }
});

router.post('/users', requireSchoolAdmin, async (req, res, next) => {
  const body = req.body || {};
  const role = body.role;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const nisNisn = typeof body.nis_nisn === 'string' ? body.nis_nisn.trim() : '';
  const rombel = typeof body.rombel === 'string' ? body.rombel.trim() : '';
  const gender = body.gender === undefined || body.gender === null || body.gender === '' ? null : body.gender;
  const password = body.password;

  if (!validRole(role)
      || ['phone', 'nis_nisn', 'rombel'].some((field) => body[field] != null && typeof body[field] !== 'string')
      || name.length < 2 || name.length > 180
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190
      || phone.length > 30 || nisNisn.length > 40 || rombel.length > 80
      || (gender !== null && !['male', 'female', 'other'].includes(gender))
      || typeof password !== 'string' || password.length < 8
      || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9\s]/.test(password)) {
    return res.status(400).json({
      message: 'Periksa nama, email, dan kata sandi (minimal 8 karakter, huruf besar, angka, serta simbol).'
    });
  }
  if (role === 'member') {
    return res.status(400).json({ message: 'Daftarkan siswa melalui menu Member terlebih dahulu sebelum mengatur akunnya.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [result] = await connection.execute(
      `INSERT INTO users (school_id, role, is_library_member, name, email, password, phone, nis_nisn, rombel, gender, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [req.school.id, role, 0, name, email, passwordHash, phone || null, nisNisn || null, rombel || null, gender]
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({
      user: {
        id: result.insertId, role, name, email, phone: phone || null,
        is_library_member: false,
        nis_nisn: nisNisn || null, rombel: rombel || null, gender, status: 'active'
      }
    });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email atau NIS/NISN tersebut sudah digunakan di sekolah ini.' });
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/users/:id', requireSchoolAdmin, async (req, res, next) => {
  const id = String(req.params.id);
  if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ message: 'ID akun tidak valid.' });
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ message: 'Data akun tidak valid.' });
  }

  const role = body.role;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const nisNisn = typeof body.nis_nisn === 'string' ? body.nis_nisn.trim() : '';
  const rombel = typeof body.rombel === 'string' ? body.rombel.trim() : '';
  const gender = body.gender == null || body.gender === '' ? null : body.gender;
  const status = body.status;
  const password = body.password == null ? '' : body.password;

  if ((body.email != null && typeof body.email !== 'string')
      || !validRole(role) || name.length < 2 || name.length > 180
      || (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190))
      || ['phone', 'nis_nisn', 'rombel'].some((field) => body[field] != null && typeof body[field] !== 'string')
      || phone.length > 30 || nisNisn.length > 40 || rombel.length > 80
      || (gender !== null && !['male', 'female', 'other'].includes(gender))
      || !['active', 'inactive', 'blocked'].includes(status)
      || typeof password !== 'string'
      || (password && (password.length < 8 || password.length > 128 || !/[A-Z]/.test(password)
        || !/\d/.test(password) || !/[^A-Za-z0-9\s]/.test(password)))) {
    return res.status(400).json({ message: 'Periksa nama, email, role, status, dan format akun.' });
  }

  try {
    const [targets] = await pool.execute(
      'SELECT id, role, is_library_member FROM users WHERE id = ? AND school_id = ? LIMIT 1',
      [id, req.school.id]
    );
    if (!targets[0]) return res.status(404).json({ message: 'Akun pengguna tidak ditemukan.' });
    if (targets[0].role === 'admin' || String(req.school.userId) === id) {
      return res.status(409).json({ message: 'Akun Admin sekolah tidak dapat diedit dari menu ini.' });
    }
    if (role === 'member' && (targets[0].role !== 'member' || !targets[0].is_library_member)) {
      return res.status(409).json({ message: 'Siswa harus terdaftar sebagai member sebelum akunnya dapat diatur.' });
    }

    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    if (role === 'member') {
      const [schools] = await pool.execute(
        'SELECT education_level FROM tenants_schools WHERE id = ? LIMIT 1',
        [req.school.id]
      );
      const classDetails = classDetailsFromRombel(rombel, schools[0]?.education_level);
      if (classDetails) {
        await pool.execute(
          `INSERT IGNORE INTO school_classes (school_id, grade_level, name, class_name)
           VALUES (?, ?, ?, ?)`,
          [req.school.id, classDetails.gradeLevel, classDetails.name, classDetails.className]
        );
      }
    }
    await pool.execute(
      `UPDATE users
       SET role = ?, name = ?, email = ?, phone = ?, nis_nisn = ?, rombel = ?, gender = ?, status = ?,
           is_library_member = CASE WHEN ? = 'member' THEN is_library_member ELSE 0 END,
           password = COALESCE(?, password)
       WHERE id = ? AND school_id = ? AND role <> 'admin'`,
      [
        role, name, email || null, phone || null,
        role === 'member' ? nisNisn || null : null,
        role === 'member' ? rombel || null : null,
        role === 'member' ? gender : null,
        status, role, passwordHash, id, req.school.id
      ]
    );
    return res.json({
      user: {
        id,
        role,
        is_library_member: role === 'member' && Boolean(targets[0].is_library_member),
        name,
        email: email || null,
        phone: phone || null,
        nis_nisn: role === 'member' ? nisNisn || null : null,
        rombel: role === 'member' ? rombel || null : null,
        gender: role === 'member' ? gender : null,
        status
      },
      message: 'Akun pengguna berhasil diperbarui.'
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email atau NIS/NISN tersebut sudah digunakan akun lain.' });
    }
    return next(error);
  }
});

router.delete('/users/bulk', requireSchoolAdmin, async (req, res, next) => {
  const rawIds = req.body?.ids;
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 500) {
    return res.status(400).json({ message: 'Pilih 1 sampai 500 akun untuk dihapus.' });
  }
  const ids = [...new Set(rawIds.map(String))];
  if (ids.some((id) => !/^[1-9]\d*$/.test(id))) {
    return res.status(400).json({ message: 'Daftar ID akun tidak valid.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const placeholders = ids.map(() => '?').join(', ');
    const [targets] = await connection.execute(
      `SELECT id, role, is_library_member FROM users
       WHERE school_id = ? AND id IN (${placeholders}) FOR UPDATE`,
      [req.school.id, ...ids]
    );
    if (targets.length !== ids.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Sebagian akun tidak ditemukan di sekolah ini.' });
    }
    if (targets.some((user) => user.role === 'admin'
        || String(user.id) === String(req.school.userId)
        || (user.role === 'member' && !user.is_library_member))) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Akun Admin atau siswa yang belum terdaftar sebagai member tidak dapat dihapus dari menu ini.' });
    }
    const [result] = await connection.execute(
      `DELETE FROM users
       WHERE school_id = ? AND id IN (${placeholders}) AND role <> 'admin' AND id <> ?`,
      [req.school.id, ...ids, req.school.userId]
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({ deleted: result.affectedRows, message: `${result.affectedRows} akun berhasil dihapus.` });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    if (error.errno === 1451 || error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: 'Sebagian akun memiliki riwayat transaksi dan tidak dapat dihapus.' });
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.delete('/users/:id', requireSchoolAdmin, async (req, res, next) => {
  const id = String(req.params.id);
  if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ message: 'ID akun tidak valid.' });
  try {
    const [targets] = await pool.execute(
      'SELECT id, role, is_library_member FROM users WHERE id = ? AND school_id = ? LIMIT 1',
      [id, req.school.id]
    );
    if (!targets[0]) return res.status(404).json({ message: 'Akun pengguna tidak ditemukan.' });
    if (targets[0].role === 'admin' || String(req.school.userId) === id) {
      return res.status(409).json({ message: 'Akun Admin sekolah tidak dapat dihapus.' });
    }
    if (targets[0].role === 'member' && !targets[0].is_library_member) {
      return res.status(409).json({ message: 'Siswa harus terdaftar sebagai member sebelum akunnya dapat dihapus dari menu ini.' });
    }
    const [result] = await pool.execute(
      'DELETE FROM users WHERE id = ? AND school_id = ? AND role <> \'admin\'',
      [id, req.school.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Akun pengguna tidak ditemukan.' });
    return res.json({ message: 'Akun pengguna berhasil dihapus.' });
  } catch (error) {
    if (error.errno === 1451 || error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: 'Akun memiliki riwayat transaksi dan tidak dapat dihapus.' });
    }
    return next(error);
  }
});

router.get('/identity', requireSchoolPermission('master.identity', 'view'), async (req, res, next) => {
  try {
    const [[rows], [letterheadRows]] = await Promise.all([
      pool.execute(
        `SELECT name, npsn, education_level, phone, email, website, address,
                principal_name, principal_nip, librarian_name, librarian_nip, logo
         FROM tenants_schools WHERE id = ? LIMIT 1`,
        [req.school.id]
      ),
      pool.execute(
        'SELECT `value` FROM school_settings WHERE school_id = ? AND `key` = ? LIMIT 1',
        [req.school.id, 'school_letterhead']
      )
    ]);
    if (!rows[0]) return res.status(404).json({ message: 'Data identitas sekolah tidak ditemukan.' });
    const letterhead = parseSchoolLetterhead(letterheadRows[0]?.value);
    return res.json({ identity: { ...rows[0], letterhead } });
  } catch (error) {
    return next(error);
  }
});

router.patch('/identity', requireSchoolPermission('master.identity', 'edit'), async (req, res, next) => {
  const fields = [
    'name', 'npsn', 'education_level', 'phone', 'email', 'website', 'address',
    'principal_name', 'principal_nip', 'librarian_name', 'librarian_nip'
  ];
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
      || fields.some((field) => typeof req.body[field] !== 'string')) {
    return res.status(400).json({ message: 'Lengkapi identitas sekolah dengan format yang valid.' });
  }

  const identity = Object.fromEntries(fields.map((field) => [field, req.body[field].trim()]));
  identity.npsn = identity.npsn || null;
  const validEducationLevels = new Set(['SD', 'MI', 'SMP', 'MTs', 'SMA', 'MA', 'SMK']);
  identity.education_level = identity.education_level || null;
  identity.phone = identity.phone || null;
  identity.email = identity.email.toLowerCase() || null;
  identity.website = identity.website || null;
  identity.address = identity.address || null;
  identity.principal_name = identity.principal_name || null;
  identity.principal_nip = identity.principal_nip || null;
  identity.librarian_name = identity.librarian_name || null;
  identity.librarian_nip = identity.librarian_nip || null;
  const logo = req.body.logo === '' || req.body.logo == null ? null : req.body.logo;
  const letterhead = req.body.letterhead === undefined
    ? null
    : validateSchoolLetterhead(req.body.letterhead);
  if (req.body.letterhead !== undefined && !letterhead) {
    return res.status(400).json({ message: 'Pengaturan kop manual tidak valid. Pastikan tersedia lima baris dan format tiap baris sesuai.' });
  }

  let validWebsite = true;
  if (identity.website) {
    const hasUnsupportedProtocol = /^[a-z][a-z\d+.-]*:/i.test(identity.website)
      && !/^https?:\/\//i.test(identity.website);
    if (hasUnsupportedProtocol) {
      validWebsite = false;
    } else {
      const websiteValue = identity.website
        .replace(/^https?:\/\//i, '')
        .replace(/\/+$/, '');
      try {
        const websiteUrl = new URL(`https://${websiteValue}`);
        validWebsite = Boolean(websiteUrl.hostname)
          && websiteUrl.pathname === '/'
          && !websiteUrl.search
          && !websiteUrl.hash
          && !websiteUrl.username
          && !websiteUrl.password;
        if (validWebsite) identity.website = websiteUrl.host;
      } catch {
        validWebsite = false;
      }
    }
  }
  const validLogo = logo === null || (typeof logo === 'string'
    && logo.length <= 700000
    && (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo)
      || /^https?:\/\/\S+$/i.test(logo)));
  if (identity.name.length < 2 || identity.name.length > 180
      || (identity.npsn && !/^\d{8}$/.test(identity.npsn))
      || (identity.education_level && !validEducationLevels.has(identity.education_level))
      || (identity.phone && identity.phone.length > 30)
      || (identity.email && (identity.email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)))
      || (identity.website && (identity.website.length > 255 || !validWebsite))
      || (identity.address && identity.address.length > 65535)
      || (identity.principal_name && identity.principal_name.length > 180)
      || (identity.principal_nip && identity.principal_nip.length > 30)
      || (identity.librarian_name && identity.librarian_name.length > 180)
      || (identity.librarian_nip && identity.librarian_nip.length > 30)
      || !validLogo) {
    return res.status(400).json({ message: 'Nama, kontak, NPSN, alamat, data pimpinan, atau logo sekolah tidak valid.' });
  }

  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
      `UPDATE tenants_schools
       SET name = ?, npsn = ?, education_level = ?, phone = ?, email = ?, website = ?, address = ?,
           principal_name = ?, principal_nip = ?, librarian_name = ?, librarian_nip = ?, logo = ?
       WHERE id = ?`,
      [
        identity.name, identity.npsn, identity.education_level, identity.phone, identity.email, identity.website,
        identity.address, identity.principal_name, identity.principal_nip,
        identity.librarian_name, identity.librarian_nip, logo, req.school.id
      ]
      );
      const [savedRows] = await connection.execute(
        `SELECT name, npsn, education_level, phone, email, website, address,
                principal_name, principal_nip, librarian_name, librarian_nip, logo
         FROM tenants_schools WHERE id = ? LIMIT 1`,
        [req.school.id]
      );
      const savedIdentity = savedRows[0];
      const persisted = savedIdentity
        && fields.every((field) => (savedIdentity[field] ?? null) === (identity[field] ?? null))
        && (savedIdentity.logo ?? null) === logo;
      if (!persisted) {
        await connection.rollback();
        return res.status(409).json({ message: 'Data identitas sekolah tidak berhasil dipastikan tersimpan. Silakan coba lagi.' });
      }
      if (letterhead) {
        await connection.execute(
          `INSERT INTO school_settings (school_id, \`key\`, \`value\`)
           VALUES (?, 'school_letterhead', ?)
           ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
          [req.school.id, JSON.stringify(letterhead)]
        );
      }
      await connection.commit();
      return res.json({
        identity: { ...savedIdentity, ...(letterhead ? { letterhead } : {}) },
        message: 'Identitas sekolah berhasil disimpan.'
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'NPSN tersebut sudah digunakan sekolah lain.' });
    }
    return next(error);
  }
});

router.get('/profile', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, avatar FROM users WHERE id = ? AND school_id = ? LIMIT 1',
      [req.school.userId, req.school.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Profil tidak ditemukan.' });
    return res.json({ profile: rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.patch('/profile', async (req, res, next) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const avatar = req.body?.avatar === null ? null : req.body?.avatar;
  if (name.length < 2 || name.length > 180
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190
      || (avatar !== null && (typeof avatar !== 'string'
        || avatar.length > 700000
        || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar)))) {
    return res.status(400).json({ message: 'Nama, email, atau foto profil tidak valid.' });
  }

  try {
    await pool.execute(
      'UPDATE users SET name = ?, email = ?, avatar = ? WHERE id = ? AND school_id = ?',
      [name, email, avatar, req.school.userId, req.school.id]
    );
    return res.json({ profile: { id: req.school.userId, name, email, avatar } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email tersebut sudah digunakan akun lain di sekolah ini.' });
    }
    return next(error);
  }
});

router.post('/profile/password', async (req, res, next) => {
  const currentPassword = req.body?.currentPassword;
  const newPassword = req.body?.newPassword;
  if (typeof currentPassword !== 'string' || !currentPassword
      || typeof newPassword !== 'string' || newPassword.length < 8
      || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9\s]/.test(newPassword)) {
    return res.status(400).json({
      message: 'Kata sandi baru minimal 8 karakter dan harus memiliki huruf besar, angka, serta simbol.'
    });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT password FROM users WHERE id = ? AND school_id = ? LIMIT 1',
      [req.school.userId, req.school.id]
    );
    if (!rows.length || !(await bcrypt.compare(currentPassword, rows[0].password))) {
      return res.status(400).json({ message: 'Kata sandi saat ini tidak sesuai.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.execute(
      'UPDATE users SET password = ? WHERE id = ? AND school_id = ?',
      [passwordHash, req.school.userId, req.school.id]
    );
    return res.json({ message: 'Kata sandi berhasil diubah.' });
  } catch (error) {
    return next(error);
  }
});

router.get('/master-categories', requireMasterCategoryPermission('view'), async (req, res, next) => {
  const type = typeof req.query.type === 'string' ? req.query.type : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (!masterCategoryTypes.has(type)) {
    return res.status(400).json({ message: 'Jenis Master Data tidak valid.' });
  }
  if (search.length > 100) {
    return res.status(400).json({ message: 'Kata pencarian maksimal 100 karakter.' });
  }

  try {
    const values = [req.school.id, type];
    let searchCondition = '';
    if (search) {
      searchCondition = 'AND (code LIKE ? OR name LIKE ? OR description LIKE ? OR email LIKE ? OR phone LIKE ? OR address LIKE ?)';
      values.push(...Array(6).fill(`%${search}%`));
    }
    const [categories] = await pool.execute(
      `SELECT id, type, code, name, description, email, phone, address, capacity, status, created_at
       FROM master_categories
       WHERE school_id = ? AND type = ? ${searchCondition}
       ORDER BY name ASC, id ASC`,
      values
    );
    return res.json({ categories });
  } catch (error) {
    return next(error);
  }
});

router.post('/master-categories', requireMasterCategoryPermission('edit'), async (req, res, next) => {
  const { value, error } = normalizeMasterCategory(req.body, req.body?.type);
  if (error) return res.status(400).json({ message: error });

  try {
    const [result] = await pool.execute(
      `INSERT INTO master_categories (school_id, type, code, name, description, email, phone, address, capacity, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.school.id, value.type, value.code, value.name, value.description, value.email, value.phone, value.address, value.capacity, value.status]
    );
    return res.status(201).json({ category: { id: result.insertId, ...value } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: value.type === 'agen'
          ? 'Data agen dengan nilai tersebut sudah terdaftar.'
          : 'Kode tersebut sudah digunakan pada jenis Master Data ini.'
      });
    }
    return next(error);
  }
});

router.post('/master-categories/import', requireMasterCategoryPermission('edit'), async (req, res, next) => {
  const type = typeof req.body?.type === 'string' ? req.body.type : '';
  const rows = req.body?.rows;
  if (!masterCategoryTypes.has(type)) {
    return res.status(400).json({ message: 'Jenis Master Data tidak valid.' });
  }
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) {
    return res.status(400).json({ message: 'File harus berisi 1 sampai 500 baris data.' });
  }

  const normalizedRows = [];
  const codes = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const normalized = normalizeMasterCategory(rows[index], type);
    if (normalized.error) {
      return res.status(400).json({ message: `Baris ${index + 2}: ${normalized.error}` });
    }
    if (normalized.value.code) {
      const codeKey = normalized.value.code.toLowerCase();
      if (codes.has(codeKey)) {
        return res.status(400).json({ message: `Baris ${index + 2}: kode duplikat di dalam file.` });
      }
      codes.add(codeKey);
    }
    normalizedRows.push(normalized.value);
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    for (const category of normalizedRows) {
      await connection.execute(
        `INSERT INTO master_categories (school_id, type, code, name, description, email, phone, address, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.school.id, category.type, category.code, category.name, category.description, category.email, category.phone, category.address, category.status]
      );
    }
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({ imported: normalizedRows.length });
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        return next(rollbackError);
      }
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: type === 'agen'
          ? 'Impor dibatalkan karena ada data agen yang sudah terdaftar.'
          : 'Impor dibatalkan karena ada kode yang sudah terdaftar.'
      });
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/master-categories/:id', requireMasterCategoryPermission('edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({ message: 'ID Master Data tidak valid.' });
  }
  const { value, error } = normalizeMasterCategory(req.body, req.body?.type);
  if (error) return res.status(400).json({ message: error });

  try {
    if (value.type === 'rak' && value.capacity != null) {
      const [[usage]] = await pool.execute(
        `SELECT COUNT(*) AS used FROM book_items
         WHERE school_id = ? AND rack_id = ? AND status = 'Tersedia'`,
        [req.school.id, id]
      );
      if (Number(usage.used) > value.capacity) {
        return res.status(409).json({ message: `Kapasitas tidak dapat kurang dari ${Number(usage.used)} eksemplar yang sedang berada di rak ini.` });
      }
    }
    const [result] = await pool.execute(
      `UPDATE master_categories
       SET code = ?, name = ?, description = ?, email = ?, phone = ?, address = ?, capacity = ?, status = ?
       WHERE id = ? AND school_id = ? AND type = ?`,
      [value.code, value.name, value.description, value.email, value.phone, value.address, value.capacity, value.status, id, req.school.id, value.type]
    );
    if (result.affectedRows === 0) {
      const [existing] = await pool.execute(
        `SELECT id FROM master_categories
         WHERE id = ? AND school_id = ? AND type = ?
         LIMIT 1`,
        [id, req.school.id, value.type]
      );
      if (!existing.length) return res.status(404).json({ message: 'Data Master Data tidak ditemukan.' });
    }
    return res.json({ category: { id, ...value } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: value.type === 'agen'
          ? 'Data agen dengan nilai tersebut sudah terdaftar.'
          : 'Kode tersebut sudah digunakan pada jenis Master Data ini.'
      });
    }
    return next(error);
  }
});

router.delete('/master-categories', requireMasterCategoryPermission('delete'), async (req, res, next) => {
  const type = typeof req.body?.type === 'string' ? req.body.type : '';
  const ids = normalizeCategoryIds(req.body?.ids);
  if (!masterCategoryTypes.has(type) || !ids) {
    return res.status(400).json({ message: 'Jenis Master Data atau daftar ID tidak valid.' });
  }

  try {
    const placeholders = ids.map(() => '?').join(', ');
    const [result] = await pool.execute(
      `DELETE FROM master_categories
       WHERE school_id = ? AND type = ? AND id IN (${placeholders})`,
      [req.school.id, type, ...ids]
    );
    return res.json({ deleted: result.affectedRows });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: 'Sebagian data tidak dapat dihapus karena masih digunakan oleh katalog buku.' });
    }
    return next(error);
  }
});

router.get('/dashboard', requireSchoolPermission('dashboard', 'view'), async (req, res, next) => {
  try {
    const schoolId = req.school.id;
    const [[stats]] = await pool.execute(
      `SELECT
         (SELECT COUNT(*) FROM visitors WHERE school_id = ?) AS total_visitors,
         (SELECT COUNT(*) FROM book_items
          WHERE school_id = ? AND status IN ('Tersedia', 'Dipinjam')) AS active_books,
         (SELECT COUNT(*) FROM loans
          WHERE school_id = ? AND status = 'Borrowed') AS active_loans,
         (SELECT COUNT(*) FROM procurements
          WHERE school_id = ? AND status = 'Pending') AS pending_procurements`,
      [schoolId, schoolId, schoolId, schoolId]
    );
    const [recentProcurements] = await pool.execute(
      `SELECT p.id, p.title, p.author, p.publisher, p.request_date, p.status, u.name AS requester
       FROM procurements p
       JOIN users u ON u.id = p.user_id AND u.school_id = p.school_id
       WHERE p.school_id = ?
       ORDER BY p.created_at DESC
       LIMIT 5`,
      [schoolId]
    );
    const [availabilityByCategory] = await pool.execute(
      `SELECT mc.id, mc.name,
              COUNT(CASE WHEN bi.status <> 'Hilang' THEN 1 END) AS total_items,
              SUM(CASE WHEN bi.status = 'Tersedia' THEN 1 ELSE 0 END) AS available_items
       FROM master_categories mc
       LEFT JOIN books b ON b.school_id = mc.school_id AND b.collection_id = mc.id
       LEFT JOIN book_items bi ON bi.school_id = b.school_id AND bi.book_id = b.id AND bi.destroyed_at IS NULL
       WHERE mc.school_id = ? AND mc.type = 'koleksi' AND mc.status = 'active'
       GROUP BY mc.id, mc.name
       ORDER BY mc.name`,
      [schoolId]
    );

    return res.json({
      school: {
        id: req.school.id,
        name: req.school.name,
        code: req.school.code,
        packageType: req.school.packageType,
        status: req.school.status
      },
      stats: {
        visitors: Number(stats.total_visitors),
        activeBooks: Number(stats.active_books),
        activeLoans: Number(stats.active_loans),
        pendingProcurements: Number(stats.pending_procurements)
      },
      recentProcurements,
      availabilityByCategory: availabilityByCategory.map((category) => ({
        ...category,
        total_items: Number(category.total_items),
        available_items: Number(category.available_items)
      }))
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
