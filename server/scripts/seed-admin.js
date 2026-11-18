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

try {
  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);
  await pool.execute(
    `INSERT INTO super_admins (name, email, password)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password)`,
    [SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, passwordHash]
  );
  console.log(`Super Admin ready: ${SUPER_ADMIN_EMAIL}`);
} finally {
  await pool.end();
}
