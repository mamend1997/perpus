import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/database.js';

const { SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD } = process.env;
if (!SUPER_ADMIN_NAME || !SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
  throw new Error('Set SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD in .env.');
}
if (SUPER_ADMIN_PASSWORD.length < 12) {
  throw new Error('SUPER_ADMIN_PASSWORD must contain at least 12 characters.');
}
const username = SUPER_ADMIN_EMAIL.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32);
if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
  throw new Error('The local part of SUPER_ADMIN_EMAIL must produce a username of 3-32 valid characters.');
}

try {
  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);
  const email = SUPER_ADMIN_EMAIL.trim().toLowerCase();
  const [rows] = await pool.execute('SELECT id FROM super_admins WHERE email = ? LIMIT 1', [email]);
  if (rows[0]) {
    await pool.execute(
      'UPDATE super_admins SET name = ?, password = ? WHERE id = ?',
      [SUPER_ADMIN_NAME, passwordHash, rows[0].id]
    );
  } else {
    await pool.execute(
      'INSERT INTO super_admins (name, username, email, password) VALUES (?, ?, ?, ?)',
      [SUPER_ADMIN_NAME, username, email, passwordHash]
    );
  }
  console.log(`Super Admin ready: ${email}`);
} finally {
  await pool.end();
}
