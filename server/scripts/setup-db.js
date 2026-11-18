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

  const [userColumns] = await connection.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`
  );
  const userColumnNames = new Set(userColumns.map((column) => column.COLUMN_NAME));
  if (!userColumnNames.has('avatar')) {
    await connection.query('ALTER TABLE users ADD COLUMN avatar MEDIUMTEXT NULL AFTER email');
  }

  const [masterCategoryColumns] = await connection.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'master_categories'`
  );
  const masterCategoryColumnNames = new Set(masterCategoryColumns.map((column) => column.COLUMN_NAME));
  if (!masterCategoryColumnNames.has('email')) {
    await connection.query(
      'ALTER TABLE master_categories ADD COLUMN email VARCHAR(190) NULL AFTER description'
    );
  }
  if (!masterCategoryColumnNames.has('phone')) {
    await connection.query(
      'ALTER TABLE master_categories ADD COLUMN phone VARCHAR(30) NULL AFTER email'
    );
  }
  if (!masterCategoryColumnNames.has('address')) {
    await connection.query(
      'ALTER TABLE master_categories ADD COLUMN address TEXT NULL AFTER phone'
    );
  }

  const [bookColumns] = await connection.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'books'`
  );
  const bookColumnNames = new Set(bookColumns.map((column) => column.COLUMN_NAME));
  if (!bookColumnNames.has('collection_id')) {
    await connection.query(
      'ALTER TABLE books ADD COLUMN collection_id BIGINT UNSIGNED NULL AFTER publisher_id'
    );
  }
  const catalogColumns = [
    ['received_date', 'DATE NULL AFTER no_terima'],
    ['physical_description', 'TEXT NULL AFTER title'],
    ['agent_id', 'BIGINT UNSIGNED NULL AFTER publisher_id'],
    ['topic_id', 'BIGINT UNSIGNED NULL AFTER agent_id'],
    ['type_id', 'BIGINT UNSIGNED NULL AFTER collection_id'],
    ['language_id', 'BIGINT UNSIGNED NULL AFTER type_id'],
    ['gmd', 'VARCHAR(100) NULL AFTER language_id'],
    ['cover_image', 'VARCHAR(100) NULL AFTER synopsis']
  ];
  for (const [columnName, definition] of catalogColumns) {
    if (!bookColumnNames.has(columnName)) {
      await connection.query(`ALTER TABLE books ADD COLUMN ${columnName} ${definition}`);
    }
  }
  const [bookYearType] = await connection.execute(
    `SELECT DATA_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'books' AND COLUMN_NAME = 'year'`
  );
  if (bookYearType[0]?.DATA_TYPE === 'year') {
    await connection.query('ALTER TABLE books MODIFY `year` SMALLINT UNSIGNED NULL');
  }
  const [bookIndexes] = await connection.execute(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'books'
       AND INDEX_NAME = 'idx_books_collection'`
  );
  if (bookIndexes.length === 0) {
    await connection.query(
      'ALTER TABLE books ADD KEY idx_books_collection (school_id, collection_id)'
    );
  }
  const [bookConstraints] = await connection.execute(
    `SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'books'
       AND CONSTRAINT_NAME = 'fk_books_collection'`
  );
  if (bookConstraints.length === 0) {
    await connection.query(
      `ALTER TABLE books ADD CONSTRAINT fk_books_collection
       FOREIGN KEY (school_id, collection_id) REFERENCES master_categories (school_id, id)
       ON DELETE RESTRICT`
    );
  }
  const catalogReferences = [
    ['agent_id', 'idx_books_agent', 'fk_books_agent'],
    ['topic_id', 'idx_books_topic', 'fk_books_topic'],
    ['type_id', 'idx_books_type', 'fk_books_type'],
    ['language_id', 'idx_books_language', 'fk_books_language']
  ];
  for (const [columnName, indexName, constraintName] of catalogReferences) {
    const [indexes] = await connection.execute(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'books' AND INDEX_NAME = ?`,
      [indexName]
    );
    if (indexes.length === 0) {
      await connection.query(`ALTER TABLE books ADD KEY ${indexName} (school_id, ${columnName})`);
    }
    const [constraints] = await connection.execute(
      `SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'books' AND CONSTRAINT_NAME = ?`,
      [constraintName]
    );
    if (constraints.length === 0) {
      await connection.query(
        `ALTER TABLE books ADD CONSTRAINT ${constraintName}
         FOREIGN KEY (school_id, ${columnName}) REFERENCES master_categories (school_id, id)
         ON DELETE RESTRICT`
      );
    }
  }

  const [loanColumns] = await connection.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'loans'`
  );
  if (!loanColumns.some((column) => column.COLUMN_NAME === 'fine_status')) {
    await connection.query(
      `ALTER TABLE loans ADD COLUMN fine_status
       ENUM('unpaid', 'paid', 'waived') NOT NULL DEFAULT 'unpaid' AFTER fine_amount`
    );
  }
  for (const [indexName, columnName] of [
    ['idx_loans_school_borrow_date', 'borrow_date'],
    ['idx_loans_school_return_date', 'return_date']
  ]) {
    const [indexes] = await connection.execute(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'loans' AND INDEX_NAME = ?`,
      [indexName]
    );
    if (indexes.length === 0) {
      await connection.query(`ALTER TABLE loans ADD KEY ${indexName} (school_id, ${columnName})`);
    }
  }

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
