import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { requireSuperAdmin } from '../middleware/require-super-admin.js';

const router = Router();
router.use(requireSuperAdmin);

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
      activities
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
  if (status !== 'all' && !statusFilters[status]) {
    return res.status(400).json({ message: 'Filter status sekolah tidak valid.' });
  }

  const conditions = [];
  const values = [];
  if (search) {
    conditions.push('(s.name LIKE ? OR s.school_code LIKE ? OR admin.admin_email LIKE ?)');
    const term = `%${search}%`;
    values.push(term, term, term);
  }
  if (statusFilters[status]) conditions.push(statusFilters[status]);

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

router.get('/billing', async (req, res, next) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const statusFilters = {
    pending: 'pending_verification',
    approved: 'paid',
    rejected: 'rejected'
  };
  if (status !== 'all' && !statusFilters[status]) {
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
    const values = statusFilters[status] ? [statusFilters[status]] : [];
    const [invoices] = await pool.execute(`
      SELECT i.id, i.school_id, s.name AS school_name, s.package_type,
             i.amount, i.status, i.due_date, i.created_at
      FROM tenant_invoices i
      JOIN tenants_schools s ON s.id = i.school_id
      ${statusFilters[status] ? 'WHERE i.status = ?' : ''}
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
  try {
    const [[result]] = await pool.query(`
      SELECT
        COUNT(*) AS open_invoices,
        COALESCE(SUM(amount), 0) AS open_amount,
        SUM(due_date < CURRENT_DATE AND status = 'unpaid') AS overdue_invoices
      FROM tenant_invoices
      WHERE status IN ('unpaid', 'pending_verification')
    `);
    return res.json({
      checkedAt: new Date().toISOString(),
      openInvoices: Number(result.open_invoices || 0),
      openAmount: Number(result.open_amount || 0),
      overdueInvoices: Number(result.overdue_invoices || 0),
      message: 'Pemeriksaan selesai. Ini hanya ringkasan; tidak membuat tagihan atau menangguhkan sekolah.'
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
