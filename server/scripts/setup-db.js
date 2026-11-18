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
