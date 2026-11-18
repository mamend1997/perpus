import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { requireSchool } from '../middleware/require-school.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';
import schoolBookRoutes from './school-books.routes.js';
import {
  defaultSchoolPermissions, schoolPermissionFeatureKeys, schoolPermissionFeatures,
  schoolPermissionRoles
} from '../utils/school-permissions.js';

const router = Router();
const masterCategoryTypes = new Set([
  'bahasa', 'jenis', 'koleksi', 'klasifikasi', 'topik',
  'rak', 'pengarang', 'penerbit', 'agen'
]);

router.use(requireSchool);
router.use('/books', schoolBookRoutes);

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
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const address = typeof body?.address === 'string' ? body.address.trim() : '';
  const status = typeof body?.status === 'string' && body.status ? body.status : 'active';

  if (!masterCategoryTypes.has(type)) {
    return { error: 'Jenis Master Data tidak valid.' };
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
      email: null, phone: null, address: null, status
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
      `SELECT id, role, name, email, phone, nis_nisn, rombel, gender, status, created_at
       FROM users
       WHERE school_id = ?
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

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      `INSERT INTO users (school_id, role, name, email, password, phone, nis_nisn, rombel, gender, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [req.school.id, role, name, email, passwordHash, phone || null, nisNisn || null, rombel || null, gender]
    );
    return res.status(201).json({
      user: {
        id: result.insertId, role, name, email, phone: phone || null,
        nis_nisn: nisNisn || null, rombel: rombel || null, gender, status: 'active'
      }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email atau NIS/NISN tersebut sudah digunakan di sekolah ini.' });
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
      `SELECT id, type, code, name, description, email, phone, address, status, created_at
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
      `INSERT INTO master_categories (school_id, type, code, name, description, email, phone, address, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.school.id, value.type, value.code, value.name, value.description, value.email, value.phone, value.address, value.status]
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
    const [result] = await pool.execute(
      `UPDATE master_categories
       SET code = ?, name = ?, description = ?, email = ?, phone = ?, address = ?, status = ?
       WHERE id = ? AND school_id = ? AND type = ?`,
      [value.code, value.name, value.description, value.email, value.phone, value.address, value.status, id, req.school.id, value.type]
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
              COUNT(bi.id) AS total_items,
              SUM(CASE WHEN bi.status = 'Tersedia' THEN 1 ELSE 0 END) AS available_items
       FROM master_categories mc
       LEFT JOIN books b ON b.school_id = mc.school_id AND b.collection_id = mc.id
       LEFT JOIN book_items bi ON bi.school_id = b.school_id AND bi.book_id = b.id
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
