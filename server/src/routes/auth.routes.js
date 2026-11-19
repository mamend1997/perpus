import { Router } from 'express';
import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';
import { generateSchoolCode } from '../utils/school-code.js';
import { readPlatformWhatsAppSettings, sendPlatformWhatsAppMessage } from '../utils/platform-whatsapp.js';

const router = Router();

router.get('/school/registration-settings', async (_req, res, next) => {
  try {
    const settings = await readPlatformWhatsAppSettings();
    return res.json({ otpRequired: settings.enabled && settings.registrationOtpEnabled });
  } catch (error) {
    return next(error);
  }
});

router.post('/school/register-otp', async (req, res, next) => {
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  if (!/^\+62\d{8,13}$/.test(phone)) {
    return res.status(400).json({ message: 'Nomor WhatsApp pendaftaran tidak valid.' });
  }

  let verificationId;
  let verificationCreated = false;
  try {
    const settings = await readPlatformWhatsAppSettings();
    if (!settings.enabled || !settings.registrationOtpEnabled) {
      return res.status(409).json({ message: 'Verifikasi OTP pendaftaran tidak sedang diaktifkan.' });
    }
    const [[rate]] = await pool.execute(
      `SELECT COUNT(*) AS recent_count, MAX(created_at) AS last_sent
       FROM school_registration_otps
       WHERE phone = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      [phone]
    );
    if (Number(rate.recent_count) >= 5
        || (rate.last_sent && Date.now() - new Date(rate.last_sent).getTime() < 60000)) {
      return res.status(429).json({ message: 'Terlalu banyak permintaan OTP. Coba kembali beberapa saat lagi.' });
    }

    await pool.execute(
      'DELETE FROM school_registration_otps WHERE expires_at < NOW() OR used_at < DATE_SUB(NOW(), INTERVAL 1 DAY)'
    );
    verificationId = randomBytes(16).toString('hex');
    const code = String(randomInt(100000, 1000000));
    const codeHash = createHmac('sha256', process.env.JWT_SECRET)
      .update(`${verificationId}:${code}`)
      .digest('hex');
    await pool.execute(
      `INSERT INTO school_registration_otps (id, phone, code_hash, expires_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
      [verificationId, phone, codeHash]
    );
    verificationCreated = true;
    await sendPlatformWhatsAppMessage(
      phone.slice(1),
      `Kode OTP pendaftaran PerpusKita: ${code}. Kode berlaku selama 5 menit dan hanya dapat digunakan sekali. Jangan bagikan kode ini kepada siapa pun.`
    );
    return res.status(201).json({ verificationId, expiresInSeconds: 300, message: 'Kode OTP berhasil dikirim ke WhatsApp.' });
  } catch (error) {
    if (verificationCreated) {
      await pool.execute('DELETE FROM school_registration_otps WHERE id = ?', [verificationId]).catch(() => {});
      return res.status(502).json({ message: `Kode OTP gagal dikirim melalui Fonnte: ${error.message}` });
    }
    return next(error);
  }
});

router.post('/school/support-session/exchange', async (req, res, next) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  if (!/^[a-f0-9]{64}$/.test(code)) {
    return res.status(400).json({ message: 'Kode sesi pemeliharaan tidak valid.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [sessions] = await connection.execute(
      `SELECT ss.id, ss.school_id, ss.user_id, s.school_code, s.name AS school_name,
              u.name AS user_name, u.email
       FROM school_support_sessions ss
       JOIN tenants_schools s ON s.id = ss.school_id
       JOIN users u ON u.id = ss.user_id AND u.school_id = ss.school_id
       WHERE ss.code_hash = ? AND ss.used_at IS NULL AND ss.expires_at > NOW()
         AND s.status = 'active' AND u.status = 'active' AND u.role = 'admin'
       LIMIT 1 FOR UPDATE`,
      [createHash('sha256').update(code).digest('hex')]
    );
    const session = sessions[0];
    if (!session) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(401).json({ message: 'Kode sesi sudah dipakai atau kedaluwarsa. Minta kode baru dari detail sekolah.' });
    }

    await connection.execute(
      'UPDATE school_support_sessions SET used_at = NOW() WHERE id = ? AND used_at IS NULL',
      [session.id]
    );
    await connection.execute(
      `INSERT INTO school_activity_logs
       (school_id, user_id, event_type, activity, route, ip_address)
       VALUES (?, ?, 'login', 'Sesi pemeliharaan dibuka oleh Super Admin', '/api/auth/school/support-session/exchange', ?)`,
      [session.school_id, session.user_id, req.ip || null]
    );
    const token = jwt.sign(
      {
        scope: 'school',
        schoolId: session.school_id,
        schoolCode: session.school_code,
        role: 'admin',
        name: session.user_name,
        email: session.email,
        supportMode: true
      },
      process.env.JWT_SECRET,
      { subject: String(session.user_id), expiresIn: '1h' }
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({
      token,
      account: {
        id: session.user_id,
        name: session.user_name,
        email: session.email,
        role: 'admin',
        supportMode: true,
        school: { id: session.school_id, name: session.school_name, code: session.school_code }
      }
    });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.post('/school/register', async (req, res, next) => {
  const { schoolName, adminName, email, phone, password, npsn, address, otpVerificationId, otpCode } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedNpsn = typeof npsn === 'string' && npsn.trim() ? npsn.trim() : null;
  const normalizedPhone = typeof phone === 'string' ? phone : '';

  if (typeof schoolName !== 'string' || schoolName.trim().length < 2 || schoolName.trim().length > 180
      || typeof adminName !== 'string' || adminName.trim().length < 2 || adminName.trim().length > 180
      || normalizedEmail.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
      || !/^\+62\d{8,13}$/.test(normalizedPhone)
      || typeof password !== 'string' || password.length < 8
      || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9\s]/.test(password)
      || (normalizedNpsn && !/^\d{8}$/.test(normalizedNpsn))
      || typeof address !== 'string' || address.trim().length < 3 || address.length > 1000) {
    return res.status(400).json({
      message: 'Periksa data sekolah, nomor WhatsApp Indonesia yang valid, dan kata sandi (minimal 8 karakter, huruf besar, angka, dan simbol).'
    });
  }

  let connection;
  let transactionStarted = false;
  try {
    const whatsappSettings = await readPlatformWhatsAppSettings();
    const otpRequired = whatsappSettings.enabled && whatsappSettings.registrationOtpEnabled;
    if (otpRequired && (!/^[a-f0-9]{32}$/.test(otpVerificationId || '') || !/^\d{6}$/.test(otpCode || ''))) {
      return res.status(400).json({ message: 'Masukkan kode OTP WhatsApp sebelum menyelesaikan pendaftaran.' });
    }
    connection = await pool.getConnection();
    const passwordHash = await bcrypt.hash(password, 12);
    await connection.beginTransaction();
    transactionStarted = true;

    if (otpRequired) {
      const [verifications] = await connection.execute(
        `SELECT id, code_hash, attempts
         FROM school_registration_otps
         WHERE id = ? AND phone = ? AND used_at IS NULL AND expires_at > NOW() AND attempts < 5
         LIMIT 1 FOR UPDATE`,
        [otpVerificationId, normalizedPhone]
      );
      const verification = verifications[0];
      const submittedHash = createHmac('sha256', process.env.JWT_SECRET)
        .update(`${otpVerificationId}:${otpCode}`)
        .digest('hex');
      if (!verification || verification.code_hash !== submittedHash) {
        if (verification) {
          await connection.execute(
            'UPDATE school_registration_otps SET attempts = attempts + 1 WHERE id = ?',
            [verification.id]
          );
          await connection.commit();
          transactionStarted = false;
          return res.status(400).json({ message: 'Kode OTP salah. Periksa kembali atau minta kode baru.' });
        }
        await connection.rollback();
        transactionStarted = false;
        return res.status(400).json({ message: 'Kode OTP sudah kedaluwarsa atau batas percobaan tercapai. Minta kode baru.' });
      }
      await connection.execute('UPDATE school_registration_otps SET used_at = NOW() WHERE id = ?', [verification.id]);
    }

    let schoolId;
    let schoolCode;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      schoolCode = generateSchoolCode();
      try {
        const [schoolResult] = await connection.execute(
          `INSERT INTO tenants_schools (name, school_code, npsn, address, package_type, status)
           VALUES (?, ?, ?, ?, 'trial', 'active')`,
          [schoolName.trim(), schoolCode, normalizedNpsn, address?.trim() || null]
        );
        schoolId = schoolResult.insertId;
        break;
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY' && error.message.includes('uq_tenants_schools_school_code')) {
          continue;
        }
        throw error;
      }
    }

    if (!schoolId) {
      const error = new Error('Tidak dapat membuat kode sekolah yang unik. Silakan coba kembali.');
      error.statusCode = 503;
      throw error;
    }

    const [adminResult] = await connection.execute(
      `INSERT INTO users (school_id, role, name, email, phone, password, status)
       VALUES (?, 'admin', ?, ?, ?, ?, 'active')`,
      [schoolId, adminName.trim(), normalizedEmail, normalizedPhone, passwordHash]
    );
    await connection.commit();
    transactionStarted = false;

    const school = {
      id: schoolId,
      name: schoolName.trim(),
      address: address.trim(),
      code: schoolCode
    };
    const account = {
      id: adminResult.insertId,
      name: adminName.trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      role: 'admin',
      school: { id: schoolId, name: school.name, code: schoolCode }
    };
    const token = jwt.sign(
      {
        scope: 'school',
        schoolId,
        schoolCode,
        role: account.role,
        name: account.name,
        email: account.email
      },
      process.env.JWT_SECRET,
      { subject: String(account.id), expiresIn: '8h' }
    );

    return res.status(201).json({
      message: 'Pendaftaran sekolah berhasil.',
      token,
      school,
      account
    });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'NPSN tersebut sudah terdaftar.' });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.post('/school/login', async (req, res, next) => {
  const { schoolCode, identifier, email, password } = req.body || {};
  const code = typeof schoolCode === 'string' ? schoolCode.trim().toUpperCase() : '';
  const loginName = typeof identifier === 'string' ? identifier.trim().toLowerCase()
    : typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!/^[A-Z0-9]{4}$/.test(code)
      || (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginName) && !/^[a-z0-9._-]{3,32}$/.test(loginName))
      || typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ message: 'Kode sekolah, username/email, atau kata sandi tidak valid.' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.school_id, u.name, u.email, u.password, u.role,
              u.is_library_member,
              s.name AS school_name, s.school_code, s.logo AS school_logo,
              s.status AS school_status
       FROM users u
       JOIN tenants_schools s ON s.id = u.school_id
       WHERE s.school_code = ? AND (u.email = ? OR (u.role = 'member' AND u.username = ? AND u.is_library_member = 1))
         AND u.status = 'active'
       LIMIT 1`,
      [code, loginName, loginName]
    );
    const account = rows[0];
    if (!account || (account.role === 'member' && !account.is_library_member)
      || !account.password || !(await bcrypt.compare(password, account.password))) {
      return res.status(401).json({ message: 'Kode sekolah, username/email, atau kata sandi salah.' });
    }
    if (account.school_status !== 'active') {
      return res.status(403).json({ message: 'Akun sekolah sedang tidak aktif. Hubungi administrator platform.' });
    }
    await pool.execute(
      `INSERT INTO school_activity_logs (school_id, user_id, event_type, activity, route, ip_address)
       VALUES (?, ?, 'login', 'Login sekolah berhasil', '/api/auth/school/login', ?)`,
      [account.school_id, account.id, req.ip || null]
    );

    const token = jwt.sign(
      {
        scope: 'school',
        schoolId: account.school_id,
        schoolCode: account.school_code,
        role: account.role,
        name: account.name,
        email: account.email
      },
      process.env.JWT_SECRET,
      { subject: String(account.id), expiresIn: '8h' }
    );
    return res.json({
      token,
      account: {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        supportMode: false,
        school: { id: account.school_id, name: account.school_name, code: account.school_code, logo: account.school_logo }
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/school/me', async (req, res, next) => {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Sesi sekolah tidak ditemukan.' });

  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Sesi sekolah sudah berakhir. Silakan masuk kembali.' });
  }
  if (claims.scope !== 'school' || !claims.schoolId || !claims.sub) {
    return res.status(401).json({ message: 'Sesi sekolah tidak valid.' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.role, s.id AS school_id, s.name AS school_name,
              s.school_code, s.logo AS school_logo, s.status AS school_status
       FROM users u
       JOIN tenants_schools s ON s.id = u.school_id
       WHERE u.id = ? AND u.school_id = ? AND u.status = 'active' AND s.status = 'active'
         AND (u.role <> 'member' OR u.is_library_member = 1)
       LIMIT 1`,
      [claims.sub, claims.schoolId]
    );
    const account = rows[0];
    if (!account) return res.status(401).json({ message: 'Akun sekolah tidak aktif.' });
    return res.json({
      account: {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        school: { id: account.school_id, name: account.school_name, code: account.school_code, logo: account.school_logo }
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  const { identifier, email, password } = req.body || {};
  const loginName = typeof identifier === 'string' ? identifier.trim().toLowerCase()
    : typeof email === 'string' ? email.trim().toLowerCase() : '';
  if ((!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginName) && !/^[a-z0-9._-]{3,32}$/.test(loginName))
      || typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ message: 'Username/email atau kata sandi tidak valid.' });
  }

  try {
    const [admins] = await pool.execute(
      `SELECT id, name, username, email, phone, password
       FROM super_admins
       WHERE username = ? OR email = ?
       LIMIT 1`,
      [loginName, loginName]
    );
    const admin = admins[0];
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ message: 'Username/email atau kata sandi salah.' });
    }
    await pool.execute('UPDATE super_admins SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);
    await pool.execute(
      'INSERT INTO audit_logs (admin_id, activity, ip_address) VALUES (?, ?, ?)',
      [admin.id, 'Login Super Admin berhasil', req.ip || null]
    );

    const token = jwt.sign(
      {
        scope: 'super_admin',
        name: admin.name,
        username: admin.username,
        email: admin.email
      },
      process.env.JWT_SECRET,
      { subject: String(admin.id), expiresIn: '8h' }
    );
    return res.json({
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        username: admin.username,
        email: admin.email,
        phone: admin.phone
      }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
