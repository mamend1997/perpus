import 'dotenv/config';
import mysql from 'mysql2/promise';
import { databasePath, initializeDatabase, sqliteDb } from '../src/config/database.js';

function quoteIdentifier(value) {
  return `\`${String(value).replace(/`/g, '``')}\``;
}

function getMySqlConfig() {
  const connectionString = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (connectionString) {
    const url = new URL(connectionString);
    if (!['mysql:', 'mysql2:'].includes(url.protocol)) {
      throw new Error('MYSQL_URL or DATABASE_URL must use the mysql:// protocol.');
    }
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: true
    };
  }

  const host = process.env.DB_HOST || process.env.MYSQLHOST;
  const database = process.env.DB_NAME || process.env.MYSQLDATABASE;
  const user = process.env.DB_USER || process.env.MYSQLUSER;
  if (!host || !database || !user) {
    throw new Error(
      'Set MYSQL_URL or the MySQL DB_HOST, DB_NAME, and DB_USER variables before migrating.'
    );
  }
  return {
    host,
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user,
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true
  };
}

let source;
let sqliteTransactionStarted = false;
let sourceTransactionStarted = false;

try {
  await initializeDatabase();
  const existingTables = sqliteDb.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  ).all();
  const existingRows = existingTables.reduce((sum, { name }) => (
    sum + sqliteDb.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)}`).get().count
  ), 0);
  if (existingRows > 0) {
    throw new Error(
      `The SQLite database at ${databasePath} is not empty. Back it up and use a new DB_PATH before migrating.`
    );
  }

  source = await mysql.createConnection(getMySqlConfig());
  await source.beginTransaction();
  sourceTransactionStarted = true;
  const [sourceTables] = await source.execute(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`
  );
  const targetTables = new Map();
  for (const { name } of existingTables) {
    const columns = sqliteDb.prepare(`PRAGMA table_info(${quoteIdentifier(name)})`).all();
    targetTables.set(name, new Set(columns.map((column) => column.name)));
  }

  sqliteDb.pragma('foreign_keys = OFF');
  sqliteDb.exec('BEGIN IMMEDIATE');
  sqliteTransactionStarted = true;
  let totalRows = 0;
  for (const { TABLE_NAME: tableName } of sourceTables) {
    const targetColumns = targetTables.get(tableName);
    if (!targetColumns) {
      throw new Error(`MySQL table "${tableName}" has no matching SQLite table; migration stopped without committing.`);
    }
    const [sourceColumns] = await source.execute(`SHOW COLUMNS FROM ${quoteIdentifier(tableName)}`);
    const sourceColumnNames = sourceColumns.map((column) => column.Field);
    const unsupportedColumns = sourceColumnNames.filter((column) => !targetColumns.has(column));
    if (unsupportedColumns.length) {
      throw new Error(
        `MySQL table "${tableName}" has columns missing from SQLite (${unsupportedColumns.join(', ')}); migration stopped without committing.`
      );
    }
    const columns = sourceColumnNames;
    if (!columns.length) {
      throw new Error(`MySQL table "${tableName}" has no columns compatible with SQLite.`);
    }
    const columnSql = columns.map(quoteIdentifier).join(', ');
    const insert = sqliteDb.prepare(
      `INSERT INTO ${quoteIdentifier(tableName)} (${columnSql})
       VALUES (${columns.map(() => '?').join(', ')})`
    );
    let offset = 0;
    while (true) {
      const [rows] = await source.execute(
        `SELECT ${columnSql} FROM ${quoteIdentifier(tableName)} LIMIT 500 OFFSET ?`,
        [offset]
      );
      if (!rows.length) break;
      const insertBatch = sqliteDb.transaction((batch) => {
        for (const row of batch) insert.run(...columns.map((column) => row[column]));
      });
      insertBatch(rows);
      totalRows += rows.length;
      offset += rows.length;
    }
    console.log(`Migrated ${tableName}.`);
  }

  const violations = sqliteDb.pragma('foreign_key_check');
  if (violations.length) {
    throw new Error(`SQLite foreign key validation failed for ${violations.length} row(s); migration was rolled back.`);
  }
  sqliteDb.exec('COMMIT');
  sqliteTransactionStarted = false;
  sqliteDb.pragma('foreign_keys = ON');
  await source.commit();
  sourceTransactionStarted = false;
  console.log(`Migrated ${totalRows} rows from MySQL to ${databasePath}.`);
} catch (error) {
  if (sqliteTransactionStarted) sqliteDb.exec('ROLLBACK');
  sqliteDb.pragma('foreign_keys = ON');
  if (sourceTransactionStarted) await source.rollback();
  throw error;
} finally {
  if (source) await source.end();
  sqliteDb.close();
}
