import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { requireSuperAdmin } from '../middleware/require-super-admin.js';
import createBackupRouter from './backup.routes.js';

const router = Router();
router.use(requireSuperAdmin);
router.use('/backups', createBackupRouter('platform'));

async function loadAdminProfile(adminId) {
  const [[admin]] = await pool.execute(
    `SELECT id, name, username, email, phone, last_login_at
     FROM super_admins
     WHERE id = ?
     LIMIT 1`,
    [adminId]
  );
  if (!admin) return null;
  const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM super_admins');
  return {
    id: admin.id,
    name: admin.name,
    username: admin.username,
    email: admin.email,
    phone: admin.phone,
    lastLoginAt: admin.last_login_at,
    totalAdmins: Number(count.total || 0)
  };
}

router.get('/me', async (req, res, next) => {
  try {
    const admin = await loadAdminProfile(req.admin.id);
    if (!admin) return res.status(404).json({ message: 'Akun Super Admin tidak ditemukan.' });
    return res.json({ admin });
  } catch (error) {
    return next(error);
  }
});

router.put('/profile', async (req, res, next) => {
  const { name, username, email, phone } = req.body || {};
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedPhone = typeof phone === 'string' ? phone.trim().replace(/[\s()-]/g, '') : '';

  if (normalizedName.length < 2 || normalizedName.length > 150
      || !/^[a-z0-9._-]{3,32}$/.test(normalizedUsername)
      || (normalizedEmail && (normalizedEmail.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)))
      || (normalizedPhone && !/^\+?\d{8,15}$/.test(normalizedPhone))) {
    return res.status(400).json({ message: 'Periksa nama, username, email, dan nomor WhatsApp.' });
  }

  try {
    await pool.execute(
      `UPDATE super_admins
       SET name = ?, username = ?, email = ?, phone = ?
       WHERE id = ?`,
      [normalizedName, normalizedUsername, normalizedEmail || null, normalizedPhone || null, req.admin.id]
    );
    const admin = await loadAdminProfile(req.admin.id);
    if (!admin) return res.status(404).json({ message: 'Akun Super Admin tidak ditemukan.' });
    return res.json({ message: 'Profil berhasil diperbarui.', admin });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const usernameConflict = error.message.includes('uq_super_admins_username');
      return res.status(409).json({
        message: usernameConflict ? 'Username sudah digunakan.' : 'Email sudah digunakan.'
      });
    }
    return next(error);
  }
});

router.post('/profile/password', async (req, res, next) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || !currentPassword
      || typeof newPassword !== 'string' || newPassword.length < 8
      || newPassword === currentPassword) {
    return res.status(400).json({ message: 'Kata sandi baru minimal 8 karakter dan harus berbeda dari kata sandi lama.' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT password FROM super_admins WHERE id = ? LIMIT 1',
      [req.admin.id]
    );
    const admin = rows[0];
    if (!admin || !(await bcrypt.compare(currentPassword, admin.password))) {
      return res.status(401).json({ message: 'Kata sandi lama tidak sesuai.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.execute('UPDATE super_admins SET password = ? WHERE id = ?', [passwordHash, req.admin.id]);
    return res.json({ message: 'Kata sandi berhasil diperbarui.' });
  } catch (error) {
    return next(error);
  }
});

const defaultLegalDocuments = {
  terms: {
    title: 'Syarat & Ketentuan Layanan',
    content: '',
    updatedAt: null
  },
  sla: {
    title: 'Service Level Agreement',
    content: '',
    updatedAt: null
  }
};

router.get('/legal-documents', async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1',
      ['legal_documents']
    );
    const documents = rows[0] ? JSON.parse(rows[0].value) : defaultLegalDocuments;
    return res.json({ documents });
  } catch (error) {
    return next(error);
  }
});

router.put('/legal-documents', async (req, res, next) => {
  const { type, title, content } = req.body || {};
  if (!['terms', 'sla'].includes(type)
      || typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 200
      || typeof content !== 'string' || content.length > 30000) {
    return res.status(400).json({ message: 'Judul atau isi dokumen tidak valid.' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1',
      ['legal_documents']
    );
    const documents = rows[0] ? JSON.parse(rows[0].value) : defaultLegalDocuments;
    documents[type] = {
      title: title.trim(),
      content,
      updatedAt: new Date().toISOString()
    };
    await pool.execute(
      `INSERT INTO platform_settings (key_name, value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      ['legal_documents', JSON.stringify(documents)]
    );
    return res.json({ message: 'Dokumen berhasil disimpan.', documents });
  } catch (error) {
    return next(error);
  }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const [[schoolStats]] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(status = 'active') AS active,
        SUM(status = 'pending') AS pending,
        SUM(status = 'suspended') AS suspended,
        SUM(package_type = 'trial' AND status = 'active') AS trials,
        SUM(package_type = 'lifetime' AND status = 'active') AS lifetime,
        COALESCE(SUM(students_count), 0) AS students
      FROM tenants_schools
    `);
    const [[invoiceStats]] = await pool.query(`
      SELECT
        SUM(status = 'pending_verification') AS pending_verification,
        COALESCE(SUM(CASE WHEN status = 'unpaid' THEN amount ELSE 0 END), 0) AS open_amount
      FROM tenant_invoices
    `);
    const [[ticketStats]] = await pool.query(`
      SELECT COUNT(*) AS new_tickets FROM platform_tickets WHERE status = 'open'
    `);
    const [latestSchools] = await pool.query(`
      SELECT id, name, package_type, status, created_at
      FROM tenants_schools
      ORDER BY created_at DESC
      LIMIT 5
    `);
    const [actions] = await pool.query(`
      SELECT 'invoice' AS type, i.id, s.name AS school_name,
             CONCAT('Verifikasi pembayaran #', i.id) AS description,
             i.created_at
      FROM tenant_invoices i
      JOIN tenants_schools s ON s.id = i.school_id
      WHERE i.status = 'pending_verification'
      UNION ALL
      SELECT 'ticket' AS type, t.id, s.name AS school_name,
             t.subject AS description, t.created_at
      FROM platform_tickets t
      JOIN tenants_schools s ON s.id = t.school_id
      WHERE t.status = 'open'
      ORDER BY created_at DESC
      LIMIT 6
    `);
    const [activities] = await pool.query(`
      SELECT a.id, a.activity, a.ip_address, a.created_at, sa.name AS admin_name
      FROM audit_logs a
      LEFT JOIN super_admins sa ON sa.id = a.admin_id
      ORDER BY a.created_at DESC
      LIMIT 6
    `);
    const [billingRuns] = await pool.query(`
      SELECT checked_at AS checkedAt, new_invoice_count AS newInvoices,
             suspended_school_count AS suspendedSchools
      FROM billing_check_runs
      ORDER BY checked_at DESC, id DESC
      LIMIT 1
    `);

    const total = Number(schoolStats.total || 0);
    return res.json({
      stats: {
        schools: total,
        activeSchools: Number(schoolStats.active || 0),
        pendingSchools: Number(schoolStats.pending || 0),
        suspendedSchools: Number(schoolStats.suspended || 0),
        trialSchools: Number(schoolStats.trials || 0),
        lifetimeSchools: Number(schoolStats.lifetime || 0),
        students: Number(schoolStats.students || 0),
        averageStudents: total ? Math.round(Number(schoolStats.students || 0) / total) : 0,
        pendingVerification: Number(invoiceStats.pending_verification || 0),
        openAmount: Number(invoiceStats.open_amount || 0),
        newTickets: Number(ticketStats.new_tickets || 0)
      },
      latestSchools,
      actions,
      activities,
      lastBillingCheck: billingRuns[0] || null
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/schools', async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const statusFilters = {
    active: "s.status = 'active' AND s.package_type NOT IN ('trial', 'lifetime')",
    trial: "s.status = 'active' AND s.package_type = 'trial'",
    suspended: "s.status = 'suspended'",
    pending: "s.status = 'pending'",
    lifetime: "s.status = 'active' AND s.package_type = 'lifetime'"
  };
  if (status !== 'all' && !Object.prototype.hasOwnProperty.call(statusFilters, status)) {
    return res.status(400).json({ message: 'Filter status sekolah tidak valid.' });
  }

  const conditions = [];
  const values = [];
  if (search) {
    conditions.push('(s.name LIKE ? OR s.school_code LIKE ? OR admin.admin_email LIKE ?)');
    const term = `%${search}%`;
    values.push(term, term, term);
  }
  if (Object.prototype.hasOwnProperty.call(statusFilters, status)) conditions.push(statusFilters[status]);

  try {
    const [[summary]] = await pool.query(`
      SELECT COUNT(*) AS total,
             SUM(status = 'active' AND package_type NOT IN ('trial', 'lifetime')) AS active,
             SUM(status = 'active' AND package_type = 'trial') AS trials,
             SUM(status = 'suspended') AS suspended
      FROM tenants_schools
    `);
    const [schools] = await pool.execute(`
      SELECT s.id, s.name, s.school_code, s.npsn, s.address, s.package_type, s.status,
             s.students_count, s.created_at,
             admin.admin_name, admin.admin_email, admin.admin_phone
      FROM tenants_schools s
      LEFT JOIN (
        SELECT school_id, MAX(name) AS admin_name, MAX(email) AS admin_email, MAX(phone) AS admin_phone
        FROM users
        WHERE role = 'admin'
        GROUP BY school_id
      ) admin ON admin.school_id = s.id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY s.created_at DESC, s.id DESC
    `, values);
    return res.json({
      summary: {
        total: Number(summary.total || 0),
        active: Number(summary.active || 0),
        trials: Number(summary.trials || 0),
        suspended: Number(summary.suspended || 0)
      },
      schools
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/schools/:id', async (req, res, next) => {
  const schoolId = String(req.params.id);
  if (!/^[1-9]\d*$/.test(schoolId)) return res.status(400).json({ message: 'ID sekolah tidak valid.' });

  try {
    const [schools] = await pool.execute(
      `SELECT id, name, school_code, npsn, phone, email, website, address,
              principal_name, principal_nip, librarian_name, librarian_nip,
              package_type, status, students_count, fine_per_day, created_at
       FROM tenants_schools WHERE id = ? LIMIT 1`,
      [schoolId]
    );
    const school = schools[0];
    if (!school) return res.status(404).json({ message: 'Sekolah tidak ditemukan.' });

    const [admins] = await pool.execute(
      `SELECT id, name, email, phone, status, created_at
       FROM users
       WHERE school_id = ? AND role = 'admin'
       ORDER BY status = 'active' DESC, name, id`,
      [schoolId]
    );
    const [[counts]] = await pool.execute(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE school_id = ?) AS total_users,
         (SELECT COUNT(*) FROM users WHERE school_id = ? AND role = 'member' AND is_library_member = 1 AND status = 'active') AS active_members,
         (SELECT COUNT(*) FROM books WHERE school_id = ?) AS book_titles,
         (SELECT COALESCE(SUM(qty), 0) FROM books WHERE school_id = ?) AS book_stock,
         (SELECT COUNT(*) FROM book_items WHERE school_id = ?) AS book_items,
         (SELECT COUNT(*) FROM loans WHERE school_id = ? AND status = 'Borrowed') AS active_loans,
         (SELECT COUNT(*) FROM procurements WHERE school_id = ? AND status = 'Pending') AS pending_procurements,
         (SELECT COUNT(*) FROM visitors WHERE school_id = ?) AS total_visitors`,
      Array(8).fill(schoolId)
    );

    return res.json({
      school: { ...school, id: String(school.id) },
      admins: admins.map((admin) => ({ ...admin, id: String(admin.id) })),
      summary: {
        totalUsers: Number(counts.total_users || 0),
        activeMembers: Number(counts.active_members || 0),
        bookTitles: Number(counts.book_titles || 0),
        bookStock: Number(counts.book_stock || 0),
        bookItems: Number(counts.book_items || 0),
        activeLoans: Number(counts.active_loans || 0),
        pendingProcurements: Number(counts.pending_procurements || 0),
        totalVisitors: Number(counts.total_visitors || 0)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/schools/:id', async (req, res, next) => {
  const schoolId = String(req.params.id);
  const schoolCode = typeof req.body?.schoolCode === 'string'
    ? req.body.schoolCode.trim().toUpperCase()
    : '';
  if (!/^[1-9]\d*$/.test(schoolId)) return res.status(400).json({ message: 'ID sekolah tidak valid.' });
  if (!/^[A-Z0-9]{4}$/.test(schoolCode)) {
    return res.status(400).json({ message: 'Kode sekolah harus terdiri dari 4 huruf atau angka.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.execute(
      'SELECT id, school_code FROM tenants_schools WHERE id = ? FOR UPDATE',
      [schoolId]
    );
    if (!rows[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Sekolah tidak ditemukan.' });
    }

    const previousCode = rows[0].school_code;
    if (previousCode !== schoolCode) {
      await connection.execute(
        'UPDATE tenants_schools SET school_code = ? WHERE id = ?',
        [schoolCode, schoolId]
      );
      await connection.execute(
        'INSERT INTO audit_logs (admin_id, activity, ip_address) VALUES (?, ?, ?)',
        [req.admin.id, `Mengubah kode sekolah ${schoolId} dari ${previousCode} menjadi ${schoolCode}`, req.ip]
      );
    }
    await connection.commit();
    transactionStarted = false;
    return res.json({
      message: previousCode === schoolCode ? 'Kode sekolah tidak berubah.' : 'Kode sekolah berhasil diperbarui.',
      school: { id: schoolId, school_code: schoolCode }
    });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        return next(error);
      }
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Kode sekolah sudah digunakan sekolah lain.' });
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.post('/schools/:schoolId/admins/:adminId/password-reset', async (req, res, next) => {
  const schoolId = String(req.params.schoolId);
  const adminId = String(req.params.adminId);
  if (!/^[1-9]\d*$/.test(schoolId) || !/^[1-9]\d*$/.test(adminId)) {
    return res.status(400).json({ message: 'ID sekolah atau akun admin tidak valid.' });
  }

  const temporaryPassword = `${randomBytes(18).toString('hex')}A1!`;
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [admins] = await connection.execute(
      `SELECT id, name FROM users
       WHERE id = ? AND school_id = ? AND role = 'admin'
       LIMIT 1 FOR UPDATE`,
      [adminId, schoolId]
    );
    const admin = admins[0];
    if (!admin) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Akun admin sekolah tidak ditemukan.' });
    }

    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    await connection.execute(
      'UPDATE users SET password = ? WHERE id = ? AND school_id = ? AND role = ?',
      [passwordHash, adminId, schoolId, 'admin']
    );
    await connection.execute(
      'INSERT INTO audit_logs (admin_id, activity, ip_address) VALUES (?, ?, ?)',
      [req.admin.id, `Mereset kata sandi admin sekolah ${schoolId} (akun ${adminId})`, req.ip]
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({
      message: 'Kata sandi admin berhasil direset.',
      admin: { id: String(admin.id), name: admin.name },
      temporaryPassword
    });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        return next(error);
      }
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.get('/billing', async (req, res, next) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const statusFilters = {
    pending: 'pending_verification',
    approved: 'paid',
    rejected: 'rejected'
  };
  if (status !== 'all' && !Object.prototype.hasOwnProperty.call(statusFilters, status)) {
    return res.status(400).json({ message: 'Filter status pembayaran tidak valid.' });
  }

  try {
    const [[summary]] = await pool.query(`
      SELECT
        SUM(status = 'pending_verification') AS pending_verification,
        SUM(status = 'paid') AS approved,
        SUM(status = 'unpaid') AS open_invoices,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS approved_amount,
        COALESCE(SUM(CASE WHEN status = 'unpaid' THEN amount ELSE 0 END), 0) AS open_amount
      FROM tenant_invoices
    `);
    const filterValue = Object.prototype.hasOwnProperty.call(statusFilters, status) ? statusFilters[status] : null;
    const values = filterValue ? [filterValue] : [];
    const [invoices] = await pool.execute(`
      SELECT i.id, i.school_id, s.name AS school_name, s.package_type,
             i.amount, i.status, i.due_date, i.created_at
      FROM tenant_invoices i
      JOIN tenants_schools s ON s.id = i.school_id
      ${filterValue ? 'WHERE i.status = ?' : ''}
      ORDER BY i.created_at DESC, i.id DESC
    `, values);
    return res.json({
      summary: {
        pendingVerification: Number(summary.pending_verification || 0),
        approved: Number(summary.approved || 0),
        openInvoices: Number(summary.open_invoices || 0),
        approvedAmount: Number(summary.approved_amount || 0),
        openAmount: Number(summary.open_amount || 0)
      },
      invoices
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/billing-check', async (req, res, next) => {
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [[result]] = await connection.query(`
      SELECT
        COUNT(*) AS open_invoices,
        COALESCE(SUM(amount), 0) AS open_amount,
        SUM(due_date < CURRENT_DATE AND status = 'unpaid') AS overdue_invoices
      FROM tenant_invoices
      WHERE status IN ('unpaid', 'pending_verification')
    `);
    const openInvoices = Number(result.open_invoices || 0);
    const openAmount = Number(result.open_amount || 0);
    const overdueInvoices = Number(result.overdue_invoices || 0);
    await connection.execute(
      `INSERT INTO billing_check_runs
       (admin_id, open_invoice_count, overdue_invoice_count, open_amount, new_invoice_count, suspended_school_count)
       VALUES (?, ?, ?, ?, 0, 0)`,
      [req.admin.id, openInvoices, overdueInvoices, openAmount]
    );
    await connection.execute(
      'INSERT INTO audit_logs (admin_id, activity, ip_address) VALUES (?, ?, ?)',
      [req.admin.id, 'Menjalankan pemeriksaan tagihan (read-only)', req.ip]
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({
      checkedAt: new Date().toISOString(),
      openInvoices,
      openAmount,
      overdueInvoices,
      newInvoices: 0,
      suspendedSchools: 0,
      message: 'Pemeriksaan tersimpan. Otomatisasi pembuatan tagihan dan penangguhan belum aktif; tidak ada perubahan pada sekolah atau invoice.'
    });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

export default router;
