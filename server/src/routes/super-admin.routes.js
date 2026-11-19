import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { requireSuperAdmin } from '../middleware/require-super-admin.js';
import createBackupRouter from './backup.routes.js';
import { encryptSchoolSecret } from '../utils/school-settings.js';
import { readPlatformWhatsAppSettings, sendPlatformWhatsAppMessage } from '../utils/platform-whatsapp.js';

const router = Router();
router.use(requireSuperAdmin);
router.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
      || req.path === '/audit-logs/page-view') {
    return next();
  }
  res.once('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 400) return;
    const activity = `${req.method} ${req.baseUrl}${req.path}`.slice(0, 500);
    pool.execute(
      'INSERT INTO audit_logs (admin_id, activity, ip_address) VALUES (?, ?, ?)',
      [req.admin.id, activity, req.ip || null]
    ).catch((error) => console.error('Gagal mencatat aktivitas Super Admin:', error));
  });
  return next();
});
router.use('/backups', createBackupRouter('platform'));

router.post('/audit-logs/page-view', async (req, res, next) => {
  const pageName = typeof req.body?.pageName === 'string' ? req.body.pageName.trim() : '';
  if (!pageName || pageName.length > 100) return res.status(400).json({ message: 'Nama halaman tidak valid.' });
  try {
    await pool.execute(
      'INSERT INTO audit_logs (admin_id, activity, ip_address) VALUES (?, ?, ?)',
      [req.admin.id, `Membuka halaman ${pageName}`.slice(0, 500), req.ip || null]
    );
    return res.status(201).json({ logged: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/audit-logs', async (req, res, next) => {
  const page = req.query.page == null ? 1 : Number(req.query.page);
  const limit = req.query.limit == null ? 25 : Number(req.query.limit);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ message: 'Nomor halaman atau jumlah log tidak valid.' });
  }
  try {
    const [[count], [logs]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM audit_logs'),
      pool.execute(
        `SELECT a.id, a.activity, a.ip_address, a.created_at,
                COALESCE(sa.name, 'Akun dihapus') AS admin_name
         FROM audit_logs a
         LEFT JOIN super_admins sa ON sa.id = a.admin_id
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ? OFFSET ?`,
        [limit, (page - 1) * limit]
      )
    ]);
    const total = Number(count.total);
    return res.json({
      logs: logs.map((log) => ({ ...log, id: String(log.id) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/tickets', async (req, res, next) => {
  const page = req.query.page == null ? 1 : Number(req.query.page);
  const limit = req.query.limit == null ? 20 : Number(req.query.limit);
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
      || !['all', 'open', 'responded', 'closed'].includes(status)) {
    return res.status(400).json({ message: 'Filter atau pagination tiket tidak valid.' });
  }
  const where = status === 'all' ? '' : 'WHERE t.status = ?';
  const values = status === 'all' ? [] : [status];
  try {
    const [[count], [tickets]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total FROM platform_tickets t ${where}`, values),
      pool.execute(
        `SELECT t.id, t.school_id, s.name AS school_name, t.subject, t.status, t.created_at,
                (SELECT m.message FROM platform_ticket_messages m
                 WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_message
         FROM platform_tickets t
         JOIN tenants_schools s ON s.id = t.school_id
         ${where}
         ORDER BY FIELD(t.status, 'open', 'responded', 'closed'), t.created_at DESC, t.id DESC
         LIMIT ? OFFSET ?`,
        [...values, limit, (page - 1) * limit]
      )
    ]);
    const total = Number(count.total);
    return res.json({
      tickets: tickets.map((ticket) => ({ ...ticket, id: String(ticket.id), school_id: String(ticket.school_id) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/tickets/:id', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) {
    return res.status(400).json({ message: 'ID tiket tidak valid.' });
  }
  try {
    const [[ticket]] = await pool.execute(
      `SELECT t.id, t.school_id, s.name AS school_name, t.subject, t.status, t.created_at
       FROM platform_tickets t
       JOIN tenants_schools s ON s.id = t.school_id
       WHERE t.id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!ticket) return res.status(404).json({ message: 'Tiket tidak ditemukan.' });
    const [messages] = await pool.execute(
      `SELECT m.id, m.sender_type, m.message, m.created_at,
              CASE WHEN m.sender_type = 'school' THEN COALESCE(u.name, 'Pengguna sekolah')
                   ELSE COALESCE(sa.name, 'Super Admin') END AS sender_name
       FROM platform_ticket_messages m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN super_admins sa ON sa.id = m.admin_id
       WHERE m.ticket_id = ? AND m.school_id = ?
       ORDER BY m.id ASC`,
      [ticket.id, ticket.school_id]
    );
    return res.json({
      ticket: { ...ticket, id: String(ticket.id), school_id: String(ticket.school_id) },
      messages: messages.map((message) => ({ ...message, id: String(message.id) }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/tickets/:id/messages', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) {
    return res.status(400).json({ message: 'ID tiket tidak valid.' });
  }
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (message.length < 10 || message.length > 5000) {
    return res.status(400).json({ message: 'Balasan harus terdiri dari 10 sampai 5.000 karakter.' });
  }
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [[ticket]] = await connection.execute(
      'SELECT id, school_id, status FROM platform_tickets WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!ticket) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Tiket tidak ditemukan.' });
    }
    if (ticket.status === 'closed') {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Tiket sudah ditutup. Buka kembali sebelum membalas.' });
    }
    const [result] = await connection.execute(
      `INSERT INTO platform_ticket_messages (ticket_id, school_id, sender_type, admin_id, message)
       VALUES (?, ?, 'admin', ?, ?)`,
      [ticket.id, ticket.school_id, req.admin.id, message]
    );
    await connection.execute(
      "UPDATE platform_tickets SET status = 'responded' WHERE id = ?",
      [ticket.id]
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({
      message: { id: String(result.insertId), sender_type: 'admin', message },
      ticketStatus: 'responded'
    });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/tickets/:id/status', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) {
    return res.status(400).json({ message: 'ID tiket tidak valid.' });
  }
  const status = req.body?.status;
  if (!['open', 'closed'].includes(status)) {
    return res.status(400).json({ message: 'Status tiket harus dibuka atau ditutup.' });
  }
  try {
    const [result] = await pool.execute(
      'UPDATE platform_tickets SET status = ? WHERE id = ?',
      [status, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Tiket tidak ditemukan.' });
    return res.json({ status, message: status === 'closed' ? 'Tiket berhasil ditutup.' : 'Tiket berhasil dibuka kembali.' });
  } catch (error) {
    return next(error);
  }
});

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
const defaultUserGuide = {
  title: 'Buku Petunjuk Pengguna',
  content: '',
  pdfUrl: '',
  videoUrl: '',
  updatedAt: null
};
const defaultPlatformBranding = {
  title: 'PerpusKita',
  subtitle: 'PLATFORM ADMIN',
  primaryColor: '#f97316',
  logo: ''
};
const defaultPlatformPaymentSettings = {
  qrisEnabled: false,
  merchantName: '',
  instructions: '',
  qrisImage: ''
};
const defaultSubscriptionPackages = [
  {
    id: 'basic',
    name: 'Basic',
    description: '',
    enabled: true,
    prices: { monthly: 0, semester: 0, yearly: 0 }
  },
  {
    id: 'premium',
    name: 'Premium',
    description: '',
    enabled: true,
    prices: { monthly: 0, semester: 0, yearly: 0 }
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    description: '',
    enabled: true,
    prices: { once: 0 }
  }
];
const platformThemeColors = new Set([
  '#f97316', '#2563eb', '#16a34a', '#7c3aed', '#0f766e', '#dc2626'
]);

function isValidGuideUrl(value, type) {
  if (value === '') return true;
  if (typeof value !== 'string' || value.length > 2048) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return false;
  if (type === 'pdf') return true;
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (hostname === 'youtu.be') return /^[A-Za-z0-9_-]{11}$/.test(url.pathname.split('/').filter(Boolean)[0] || '');
  if (hostname === 'youtube.com' || hostname === 'youtube-nocookie.com') {
    const videoId = url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
    return /^[A-Za-z0-9_-]{11}$/.test(videoId || '');
  }
  if (hostname === 'vimeo.com' || hostname === 'player.vimeo.com') {
    return url.pathname.split('/').some((part) => /^\d+$/.test(part));
  }
  return /\.(mp4|webm|ogg)$/i.test(url.pathname);
}

function isValidPlatformLogo(logo) {
  if (logo === '') return true;
  if (typeof logo !== 'string' || logo.length > 1400000) return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(logo);
  if (!match) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 1024 * 1024 || bytes.toString('base64') !== match[2]) return false;
  if (match[1] === 'png') {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (match[1] === 'jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP';
}

router.get('/branding', async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1',
      ['platform_branding']
    );
    const saved = rows[0] ? JSON.parse(rows[0].value) : {};
    return res.json({ branding: { ...defaultPlatformBranding, ...saved } });
  } catch (error) {
    return next(error);
  }
});

router.put('/branding', async (req, res, next) => {
  const { title, subtitle, primaryColor, logo } = req.body || {};
  if (typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 60
      || typeof subtitle !== 'string' || subtitle.trim().length < 2 || subtitle.trim().length > 100
      || typeof primaryColor !== 'string' || !platformThemeColors.has(primaryColor.toLowerCase())
      || !isValidPlatformLogo(logo)) {
    return res.status(400).json({ message: 'Judul, subjudul, warna, atau logo aplikasi tidak valid.' });
  }
  const branding = {
    title: title.trim(),
    subtitle: subtitle.trim(),
    primaryColor: primaryColor.toLowerCase(),
    logo
  };
  try {
    await pool.execute(
      `INSERT INTO platform_settings (key_name, value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      ['platform_branding', JSON.stringify(branding)]
    );
    return res.json({ branding, message: 'Tema dan branding platform berhasil disimpan.' });
  } catch (error) {
    return next(error);
  }
});

router.get('/payment-settings', async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1',
      ['platform_payment_settings']
    );
    const saved = rows[0] ? JSON.parse(rows[0].value) : {};
    return res.json({ settings: { ...defaultPlatformPaymentSettings, ...saved } });
  } catch (error) {
    return next(error);
  }
});

router.put('/payment-settings', async (req, res, next) => {
  const { qrisEnabled, merchantName, instructions, qrisImage } = req.body || {};
  if (typeof qrisEnabled !== 'boolean'
      || typeof merchantName !== 'string' || merchantName.trim().length > 120
      || typeof instructions !== 'string' || instructions.length > 2000
      || !isValidPlatformLogo(qrisImage)
      || (qrisEnabled && !qrisImage)) {
    return res.status(400).json({ message: 'Periksa status QRIS, nama merchant, instruksi, dan gambar QRIS.' });
  }
  const settings = {
    qrisEnabled,
    merchantName: merchantName.trim(),
    instructions: instructions.trim(),
    qrisImage
  };
  try {
    await pool.execute(
      `INSERT INTO platform_settings (key_name, value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      ['platform_payment_settings', JSON.stringify(settings)]
    );
    return res.json({ settings, message: 'Pengaturan QRIS berhasil disimpan.' });
  } catch (error) {
    return next(error);
  }
});

router.get('/subscription-packages', async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1',
      ['subscription_packages']
    );
    const packages = rows[0] ? JSON.parse(rows[0].value) : defaultSubscriptionPackages;
    return res.json({ packages });
  } catch (error) {
    return next(error);
  }
});

router.put('/subscription-packages', async (req, res, next) => {
  const packages = req.body?.packages;
  const expectedPackages = new Map(defaultSubscriptionPackages.map((item) => [item.id, item]));
  if (!Array.isArray(packages) || packages.length !== defaultSubscriptionPackages.length) {
    return res.status(400).json({ message: 'Data paket langganan tidak lengkap.' });
  }
  const normalizedPackages = [];
  for (const item of packages) {
    const defaults = expectedPackages.get(item?.id);
    if (!defaults || normalizedPackages.some((existing) => existing.id === item.id)
        || typeof item.name !== 'string' || item.name.trim().length < 2 || item.name.trim().length > 40
        || typeof item.description !== 'string' || item.description.length > 500
        || typeof item.enabled !== 'boolean'
        || !item.prices || typeof item.prices !== 'object' || Array.isArray(item.prices)) {
      return res.status(400).json({ message: 'Nama, deskripsi, status, atau harga paket tidak valid.' });
    }
    const priceFields = Object.keys(defaults.prices);
    if (priceFields.some((field) => !Number.isSafeInteger(item.prices[field])
        || item.prices[field] < 0 || item.prices[field] > 1000000000)) {
      return res.status(400).json({ message: 'Harga harus berupa bilangan Rupiah antara 0 dan 1.000.000.000.' });
    }
    normalizedPackages.push({
      id: item.id,
      name: item.name.trim(),
      description: item.description.trim(),
      enabled: item.enabled,
      prices: Object.fromEntries(priceFields.map((field) => [field, item.prices[field]]))
    });
  }
  if (normalizedPackages.length !== expectedPackages.size) {
    return res.status(400).json({ message: 'Semua paket langganan harus disertakan.' });
  }
  try {
    await pool.execute(
      `INSERT INTO platform_settings (key_name, value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      ['subscription_packages', JSON.stringify(normalizedPackages)]
    );
    return res.json({ packages: normalizedPackages, message: 'Paket dan harga langganan berhasil disimpan.' });
  } catch (error) {
    return next(error);
  }
});

router.get('/whatsapp-gateway', async (_req, res, next) => {
  try {
    const settings = await readPlatformWhatsAppSettings();
    const { tokenConfigured, enabled, registrationOtpEnabled, paymentRemindersEnabled, reminderDaysBefore, reminderDaysAfter } = settings;
    return res.json({
      settings: { tokenConfigured, enabled, registrationOtpEnabled, paymentRemindersEnabled, reminderDaysBefore, reminderDaysAfter }
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/whatsapp-gateway', async (req, res, next) => {
  const { enabled, registrationOtpEnabled, paymentRemindersEnabled, reminderDaysBefore, reminderDaysAfter } = req.body || {};
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const clearToken = req.body?.clearToken === true;
  if ([enabled, registrationOtpEnabled, paymentRemindersEnabled].some((value) => typeof value !== 'boolean')
      || !Number.isSafeInteger(reminderDaysBefore) || reminderDaysBefore < 1 || reminderDaysBefore > 30
      || !Number.isSafeInteger(reminderDaysAfter) || reminderDaysAfter < 1 || reminderDaysAfter > 30
      || (req.body?.token != null && (typeof req.body.token !== 'string' || req.body.token.length > 500))
      || (req.body?.clearToken != null && typeof req.body.clearToken !== 'boolean')
      || (token && clearToken)
      || (!enabled && (registrationOtpEnabled || paymentRemindersEnabled))) {
    return res.status(400).json({ message: 'Pengaturan koneksi, OTP, pengingat, atau token Fonnte tidak valid.' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1',
      ['platform_whatsapp_gateway']
    );
    const current = rows[0] ? JSON.parse(rows[0].value) : {};
    const tokenEncrypted = clearToken ? '' : token ? encryptSchoolSecret(token) : current.tokenEncrypted || '';
    if ((enabled || registrationOtpEnabled || paymentRemindersEnabled) && !tokenEncrypted) {
      return res.status(400).json({ message: 'Masukkan token Fonnte sebelum mengaktifkan gateway atau fitur notifikasi.' });
    }
    const settings = {
      enabled,
      registrationOtpEnabled,
      paymentRemindersEnabled,
      reminderDaysBefore,
      reminderDaysAfter,
      tokenEncrypted
    };
    await pool.execute(
      `INSERT INTO platform_settings (key_name, value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      ['platform_whatsapp_gateway', JSON.stringify(settings)]
    );
    return res.json({
      settings: {
        enabled,
        registrationOtpEnabled,
        paymentRemindersEnabled,
        reminderDaysBefore,
        reminderDaysAfter,
        tokenConfigured: Boolean(tokenEncrypted)
      },
      message: 'Pengaturan WhatsApp Gateway berhasil disimpan.'
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/whatsapp-gateway/test', async (req, res, next) => {
  const target = typeof req.body?.target === 'string' ? req.body.target.trim() : '';
  if (!/^\+?[1-9]\d{7,14}$/.test(target)) {
    return res.status(400).json({ message: 'Masukkan nomor tujuan dengan kode negara, misalnya +6281234567890.' });
  }
  try {
    await sendPlatformWhatsAppMessage(
      target.replace(/^\+/, ''),
      `Tes koneksi WhatsApp PerpusKita berhasil. Pesan ini dikirim oleh Super Admin ${req.admin.name}.`
    );
    return res.json({ message: 'Pesan tes berhasil dikirim melalui Fonnte.' });
  } catch (error) {
    return res.status(502).json({ message: error.message || 'Pesan tes gagal dikirim.' });
  }
});

router.get('/user-guide', async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1',
      ['user_guide']
    );
    return res.json({ guide: rows[0] ? JSON.parse(rows[0].value) : defaultUserGuide });
  } catch (error) {
    return next(error);
  }
});

router.put('/user-guide', async (req, res, next) => {
  const { title, content, pdfUrl = '', videoUrl = '' } = req.body || {};
  if (typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 200
      || typeof content !== 'string' || content.length > 30000
      || !isValidGuideUrl(pdfUrl, 'pdf') || !isValidGuideUrl(videoUrl, 'video')) {
    return res.status(400).json({ message: 'Judul, isi, atau tautan PDF/video tidak valid. Gunakan URL HTTPS yang didukung.' });
  }
  const guide = {
    title: title.trim(),
    content,
    pdfUrl: pdfUrl.trim(),
    videoUrl: videoUrl.trim(),
    updatedAt: new Date().toISOString()
  };
  try {
    await pool.execute(
      `INSERT INTO platform_settings (key_name, value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      ['user_guide', JSON.stringify(guide)]
    );
    return res.json({ guide, message: 'Buku petunjuk pengguna berhasil disimpan.' });
  } catch (error) {
    return next(error);
  }
});

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
         (SELECT COUNT(*) FROM book_items WHERE school_id = ? AND destroyed_at IS NULL) AS book_items,
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

router.post('/schools/:id/support-session', async (req, res, next) => {
  const schoolId = String(req.params.id);
  if (!/^[1-9]\d*$/.test(schoolId)) return res.status(400).json({ message: 'ID sekolah tidak valid.' });
  try {
    const [admins] = await pool.execute(
      `SELECT s.id AS school_id, s.name AS school_name, u.id AS user_id
       FROM tenants_schools s
       JOIN users u ON u.school_id = s.id
       WHERE s.id = ? AND s.status = 'active' AND u.role = 'admin' AND u.status = 'active'
       ORDER BY u.id
       LIMIT 1`,
      [schoolId]
    );
    if (!admins[0]) {
      return res.status(409).json({ message: 'Sekolah harus aktif dan memiliki akun admin aktif untuk dibuka.' });
    }

    await pool.execute(
      'DELETE FROM school_support_sessions WHERE expires_at < NOW() OR used_at < DATE_SUB(NOW(), INTERVAL 1 DAY)'
    );
    const code = randomBytes(32).toString('hex');
    await pool.execute(
      `INSERT INTO school_support_sessions
       (school_id, user_id, created_by_admin_id, code_hash, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 2 MINUTE))`,
      [admins[0].school_id, admins[0].user_id, req.admin.id, createHash('sha256').update(code).digest('hex')]
    );
    return res.status(201).json({
      code,
      expiresInSeconds: 120,
      schoolName: admins[0].school_name
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
