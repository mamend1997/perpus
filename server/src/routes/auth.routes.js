import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';
import { generateSchoolCode } from '../utils/school-code.js';

const router = Router();

router.post('/school/register', async (req, res, next) => {
  const { schoolName, adminName, email, phone, password, npsn, address } = req.body || {};
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
    connection = await pool.getConnection();
    const passwordHash = await bcrypt.hash(password, 12);
    await connection.beginTransaction();
    transactionStarted = true;

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
  const { schoolCode, email, password } = req.body || {};
  const code = typeof schoolCode === 'string' ? schoolCode.trim().toUpperCase() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!/^[A-Z0-9]{4}$/.test(code)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
      || typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ message: 'Kode sekolah, email, atau kata sandi tidak valid.' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.school_id, u.name, u.email, u.password, u.role,
              s.name AS school_name, s.school_code, s.logo AS school_logo,
              s.status AS school_status
       FROM users u
       JOIN tenants_schools s ON s.id = u.school_id
       WHERE s.school_code = ? AND u.email = ? AND u.status = 'active'
       LIMIT 1`,
      [code, normalizedEmail]
    );
    const account = rows[0];
    if (!account || !(await bcrypt.compare(password, account.password))) {
      return res.status(401).json({ message: 'Kode sekolah, email, atau kata sandi salah.' });
    }
    if (account.school_status !== 'active') {
      return res.status(403).json({ message: 'Akun sekolah sedang tidak aktif. Hubungi administrator platform.' });
    }

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
