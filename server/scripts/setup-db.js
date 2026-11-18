import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { generateSchoolCode } from '../src/utils/school-code.js';

const connectionString = process.env.DATABASE_URL || process.env.MYSQL_URL;
const databaseUrl = connectionString ? new URL(connectionString) : null;
const connection = connectionString
  ? await mysql.createConnection({
      host: databaseUrl.hostname,
      port: Number(databaseUrl.port || 3306),
      user: decodeURIComponent(databaseUrl.username),
      password: decodeURIComponent(databaseUrl.password),
      database: decodeURIComponent(databaseUrl.pathname.replace(/^\//, '')),
      multipleStatements: true
    })
  : await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'e_perpustakaan',
      multipleStatements: true
    });

try {
  const schemaUrl = new URL('../sql/schema.sql', import.meta.url);
  const schema = await readFile(fileURLToPath(schemaUrl), 'utf8');
  await connection.query(schema);

  const [settingsValueColumns] = await connection.execute(
    `SELECT DATA_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_settings'
       AND COLUMN_NAME = 'value'`
  );
  if (settingsValueColumns[0]?.DATA_TYPE === 'text') {
    await connection.query('ALTER TABLE platform_settings MODIFY `value` MEDIUMTEXT NULL');
  }

  const [adminColumnRows] = await connection.execute(
    `SELECT COLUMN_NAME, IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'super_admins'`
  );
  const adminColumns = new Map(adminColumnRows.map((column) => [column.COLUMN_NAME, column.IS_NULLABLE]));
  if (!adminColumns.has('username')) {
    await connection.query('ALTER TABLE super_admins ADD COLUMN username VARCHAR(32) NULL AFTER name');
  }
  if (!adminColumns.has('phone')) {
    await connection.query('ALTER TABLE super_admins ADD COLUMN phone VARCHAR(30) NULL AFTER email');
  }
  if (!adminColumns.has('last_login_at')) {
    await connection.query('ALTER TABLE super_admins ADD COLUMN last_login_at DATETIME NULL AFTER password');
  }
  if (adminColumns.get('email') === 'NO') {
    await connection.query('ALTER TABLE super_admins MODIFY email VARCHAR(190) NULL');
  }

  const [adminRows] = await connection.query(
    'SELECT id, username, email FROM super_admins ORDER BY id'
  );
  const usedUsernames = new Set();
  for (const admin of adminRows) {
    const storedUsername = typeof admin.username === 'string' ? admin.username : '';
    let username = storedUsername.toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username) || usedUsernames.has(username) || storedUsername !== username) {
      const emailName = typeof admin.email === 'string' ? admin.email.split('@')[0] : '';
      const emailBase = emailName.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32);
      const base = emailBase.length >= 3 ? emailBase : `admin${admin.id}`;
      username = base;
      let suffix = 1;
      while (usedUsernames.has(username)) {
        const suffixText = String(suffix);
        username = `${base.slice(0, 32 - suffixText.length)}${suffixText}`;
        suffix += 1;
      }
      await connection.execute(
        'UPDATE super_admins SET username = ? WHERE id = ?',
        [username, admin.id]
      );
    }
    usedUsernames.add(username);
  }

  const [adminIndexes] = await connection.execute(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'super_admins'
       AND INDEX_NAME = 'uq_super_admins_username'`
  );
  if (adminIndexes.length === 0) {
    await connection.query(
      'ALTER TABLE super_admins ADD UNIQUE KEY uq_super_admins_username (username)'
    );
  }
  await connection.query('ALTER TABLE super_admins MODIFY username VARCHAR(32) NOT NULL');

  const [columns] = await connection.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants_schools'
       AND COLUMN_NAME = 'school_code'`
  );
  if (columns.length === 0) {
    await connection.query(
      'ALTER TABLE tenants_schools ADD COLUMN school_code CHAR(4) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER name'
    );
  }

  const [schools] = await connection.query(
    'SELECT id, school_code FROM tenants_schools ORDER BY id'
  );
  const usedCodes = new Set();
  for (const school of schools) {
    let code = school.school_code;
    if (!code || !/^[A-Z0-9]{4}$/.test(code) || usedCodes.has(code)) {
      do {
        code = generateSchoolCode();
      } while (usedCodes.has(code));
      await connection.execute(
        'UPDATE tenants_schools SET school_code = ? WHERE id = ?',
        [code, school.id]
      );
    }
    usedCodes.add(code);
  }

  const [indexes] = await connection.execute(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants_schools'
       AND INDEX_NAME = 'uq_tenants_schools_school_code'`
  );
  if (indexes.length === 0) {
    await connection.query(
      'ALTER TABLE tenants_schools ADD UNIQUE KEY uq_tenants_schools_school_code (school_code)'
    );
  }
  await connection.query(
    'ALTER TABLE tenants_schools MODIFY school_code CHAR(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL'
  );
  console.log('Database schema created/updated successfully.');
} finally {
  await connection.end();
}
