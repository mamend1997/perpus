import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { pool } from '../config/database.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const storageRoot = fileURLToPath(new URL('../../storage/books/', import.meta.url));
const maxArchiveBytes = 250 * 1024 * 1024;
const maxUploadBytes = 100 * 1024 * 1024;
const schoolExcludedTables = new Set([
  'billing_check_runs', 'platform_settings', 'super_admins',
  'tenant_invoices', 'platform_tickets', 'audit_logs'
]);
const schoolIdentityColumns = [
  'name', 'npsn', 'education_level', 'phone', 'email', 'website', 'address',
  'principal_name', 'principal_nip', 'librarian_name', 'librarian_nip', 'logo', 'fine_per_day'
];

function quoteIdentifier(value) {
  return `\`${String(value).replace(/`/g, '``')}\``;
}

function encodeValue(value) {
  if (Buffer.isBuffer(value)) return { $backupType: 'buffer', value: value.toString('base64') };
  if (value instanceof Date) return { $backupType: 'date', value: value.toISOString() };
  return value;
}

function decodeValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (value.$backupType === 'buffer' && typeof value.value === 'string') {
    return Buffer.from(value.value, 'base64');
  }
  if (value.$backupType === 'date' && typeof value.value === 'string') {
    const date = new Date(value.value);
    if (Number.isNaN(date.getTime())) throw new Error('Tanggal pada arsip backup tidak valid.');
    return date;
  }
  throw new Error('Tipe data arsip backup tidak valid.');
}

async function loadTableMetadata(connection) {
  const [tables] = await connection.execute(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`
  );
  const metadata = new Map();
  for (const { TABLE_NAME: tableName } of tables) {
    const [columns] = await connection.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [tableName]
    );
    metadata.set(tableName, columns.map((column) => column.COLUMN_NAME));
  }
  return metadata;
}

function tableBelongsToSchool(tableName, columns) {
  return !schoolExcludedTables.has(tableName) && columns.includes('school_id');
}

async function readAssets(schoolIds) {
  const assets = [];
  let totalBytes = 0;
  for (const schoolId of schoolIds) {
    const schoolDirectory = path.join(storageRoot, String(schoolId));
    let entries;
    try {
      entries = await readdir(schoolDirectory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !/^[A-Za-z0-9._-]{1,180}$/.test(entry.name)) continue;
      const filePath = path.join(schoolDirectory, entry.name);
      const data = await readFile(filePath);
      totalBytes += data.length;
      if (totalBytes > maxArchiveBytes) {
        const error = new Error('Ukuran file backup melebihi batas 250 MB.');
        error.status = 413;
        throw error;
      }
      assets.push({ schoolId: String(schoolId), name: entry.name, data: data.toString('base64') });
    }
  }
  return assets;
}

export async function createBackupArchive(scope, schoolId = null, database = pool) {
  if (!['platform', 'school'].includes(scope) || (scope === 'school' && !/^[1-9]\d*$/.test(String(schoolId)))) {
    throw new Error('Cakupan backup tidak valid.');
  }
  const connection = await database.getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const metadata = await loadTableMetadata(connection);
    const tables = {};
    for (const [tableName, columns] of metadata) {
      if (scope === 'school') {
        if (tableName === 'tenants_schools') {
          const [rows] = await connection.execute(
            `SELECT * FROM ${quoteIdentifier(tableName)} WHERE id = ?`,
            [schoolId]
          );
          tables[tableName] = rows.map((row) => Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key, encodeValue(value)])
          ));
          continue;
        }
        if (!tableBelongsToSchool(tableName, columns)) continue;
        const [rows] = await connection.execute(
          `SELECT * FROM ${quoteIdentifier(tableName)} WHERE school_id = ?`,
          [schoolId]
        );
        tables[tableName] = rows.map((row) => Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key, encodeValue(value)])
        ));
        continue;
      }
      const [rows] = await connection.query(`SELECT * FROM ${quoteIdentifier(tableName)}`);
      tables[tableName] = rows.map((row) => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, encodeValue(value)])
      ));
    }
    await connection.commit();
    const schoolIds = scope === 'school'
      ? [String(schoolId)]
      : (tables.tenants_schools || []).map((school) => String(school.id));
    const archive = {
      format: 'perpuskita-backup',
      version: 1,
      scope,
      schoolId: scope === 'school' ? String(schoolId) : null,
      createdAt: new Date().toISOString(),
      tables,
      assets: await readAssets(schoolIds)
    };
    const json = Buffer.from(JSON.stringify(archive));
    if (json.length > maxArchiveBytes) {
      const error = new Error('Ukuran data backup melebihi batas 250 MB.');
      error.status = 413;
      throw error;
    }
    return gzipAsync(json, { level: 6 });
  } catch (error) {
    try { await connection.rollback(); } catch { /* transaction may already be committed */ }
    throw error;
  } finally {
    connection.release();
  }
}

function validateArchive(archive, scope, schoolId, metadata) {
  if (!archive || archive.format !== 'perpuskita-backup' || archive.version !== 1
      || archive.scope !== scope || !archive.tables || typeof archive.tables !== 'object'
      || Array.isArray(archive.tables) || !Array.isArray(archive.assets)) {
    throw new Error('Format arsip backup tidak sesuai dengan cakupan pemulihan.');
  }
  if (scope === 'school' && String(archive.schoolId) !== String(schoolId)) {
    throw new Error('Backup ini berasal dari sekolah yang berbeda.');
  }
  const expectedTables = [...metadata].filter(([tableName, columns]) => (
    scope === 'platform'
      || tableName === 'tenants_schools'
      || tableBelongsToSchool(tableName, columns)
  )).map(([tableName]) => tableName);
  if (expectedTables.some((tableName) => !Object.prototype.hasOwnProperty.call(archive.tables, tableName))
      || Object.keys(archive.tables).some((tableName) => !expectedTables.includes(tableName))) {
    throw new Error('Arsip tidak berisi semua tabel yang diperlukan untuk pemulihan.');
  }
  if (scope === 'school' && archive.tables.tenants_schools.length !== 1) {
    throw new Error('Arsip tidak berisi data sekolah yang diperlukan.');
  }
  const assetSchoolIds = scope === 'school'
    ? new Set([String(schoolId)])
    : new Set((archive.tables.tenants_schools || []).map((school) => String(school.id)));
  for (const [tableName, rows] of Object.entries(archive.tables)) {
    const columns = metadata.get(tableName);
    if (!columns || !Array.isArray(rows)) throw new Error('Arsip berisi tabel atau data yang tidak dikenal.');
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)
          || Object.keys(row).some((column) => !columns.includes(column))) {
        throw new Error('Struktur baris pada arsip backup tidak valid.');
      }
      if (scope === 'school' && tableName === 'tenants_schools') {
        if (String(row.id) !== String(schoolId)) throw new Error('Arsip berisi data sekolah yang tidak sesuai.');
      } else if (scope === 'school' && (!tableBelongsToSchool(tableName, columns)
          || String(row.school_id) !== String(schoolId))) {
        throw new Error('Arsip sekolah berisi data di luar cakupannya.');
      }
    }
  }
  for (const asset of archive.assets) {
    if (!asset || !/^[1-9]\d*$/.test(String(asset.schoolId))
        || !assetSchoolIds.has(String(asset.schoolId))
        || typeof asset.name !== 'string' || !/^[A-Za-z0-9._-]{1,180}$/.test(asset.name)
        || typeof asset.data !== 'string' || asset.data.length > maxArchiveBytes * 2) {
      throw new Error('File pada arsip backup tidak valid.');
    }
  }
}

async function insertRows(connection, tableName, rows) {
  if (!rows.length) return;
  const identifiers = Object.keys(rows[0]);
  const columnSql = identifiers.map(quoteIdentifier).join(', ');
  const batchSize = Math.max(1, Math.floor(40000 / identifiers.length));
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const rowSql = `(${identifiers.map(() => '?').join(', ')})`;
    const values = batch.flatMap((row) => identifiers.map((key) => decodeValue(row[key])));
    await connection.execute(
      `INSERT INTO ${quoteIdentifier(tableName)} (${columnSql})
       VALUES ${batch.map(() => rowSql).join(', ')}`,
      values
    );
  }
}

export async function restoreBackupArchive(buffer, scope, schoolId = null, database = pool) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > maxUploadBytes) {
    const error = new Error('Arsip backup kosong atau melebihi batas unggah 100 MB.');
    error.status = 413;
    throw error;
  }
  let archive;
  try {
    archive = JSON.parse((await gunzipAsync(buffer, { maxOutputLength: maxArchiveBytes + 1 })).toString('utf8'));
  } catch (error) {
    if (error.status) throw error;
    throw new Error('File backup tidak dapat dibuka atau formatnya rusak.');
  }
  const connection = await database.getConnection();
  let transactionStarted = false;
  let foreignKeyChecksDisabled = false;
  try {
    const metadata = await loadTableMetadata(connection);
    validateArchive(archive, scope, schoolId, metadata);
    if (scope === 'school') {
      const [school] = await connection.execute('SELECT id FROM tenants_schools WHERE id = ? LIMIT 1', [schoolId]);
      if (!school[0]) {
        const error = new Error('Data sekolah tujuan pemulihan tidak ditemukan.');
        error.status = 404;
        throw error;
      }
    }
    await connection.beginTransaction();
    transactionStarted = true;
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    foreignKeyChecksDisabled = true;
    if (scope === 'platform') {
      for (const tableName of metadata.keys()) {
        await connection.query(`DELETE FROM ${quoteIdentifier(tableName)}`);
      }
    } else {
      for (const [tableName, columns] of metadata) {
        if (tableBelongsToSchool(tableName, columns)) {
          await connection.execute(`DELETE FROM ${quoteIdentifier(tableName)} WHERE school_id = ?`, [schoolId]);
        }
      }
    }
    for (const [tableName, rows] of Object.entries(archive.tables)) {
      if (tableName === 'tenants_schools' && scope === 'school') {
        const row = rows[0];
        if (!row) continue;
        const values = schoolIdentityColumns.filter((column) => Object.prototype.hasOwnProperty.call(row, column));
        if (values.length) {
          await connection.execute(
            `UPDATE tenants_schools SET ${values.map((column) => `${quoteIdentifier(column)} = ?`).join(', ')}
             WHERE id = ?`,
            [...values.map((column) => decodeValue(row[column])), schoolId]
          );
        }
        continue;
      }
      const columns = metadata.get(tableName);
      await insertRows(connection, tableName, rows);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    foreignKeyChecksDisabled = false;
    await connection.commit();
    transactionStarted = false;
    for (const asset of archive.assets) {
      const destination = path.join(storageRoot, String(asset.schoolId));
      await mkdir(destination, { recursive: true });
      await writeFile(path.join(destination, asset.name), Buffer.from(asset.data, 'base64'), { flag: 'w' });
    }
    return { message: scope === 'school' ? 'Data dan file sekolah berhasil dipulihkan.' : 'Database dan file platform berhasil dipulihkan.' };
  } catch (error) {
    if (transactionStarted) {
      try { await connection.rollback(); } catch (rollbackError) { error.rollbackError = rollbackError; }
    }
    if (foreignKeyChecksDisabled) {
      try { await connection.query('SET FOREIGN_KEY_CHECKS = 1'); } catch (restoreError) { error.restoreError = restoreError; }
    }
    throw error;
  } finally {
    connection.release();
  }
}

export const backupLimits = { maxArchiveBytes, maxUploadBytes };
