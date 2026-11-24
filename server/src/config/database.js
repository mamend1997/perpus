import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = fileURLToPath(new URL('../../', import.meta.url));
export const databasePath = path.resolve(
  process.env.DB_PATH || path.join(serverRoot, 'storage', 'database.sqlite')
);
mkdirSync(path.dirname(databasePath), { recursive: true });

export const sqliteDb = new Database(databasePath);
sqliteDb.pragma('foreign_keys = ON');
sqliteDb.pragma('journal_mode = WAL');
sqliteDb.pragma('busy_timeout = 5000');
sqliteDb.function('concat', { varargs: true }, (...values) => (
  values.some((value) => value == null) ? null : values.join('')
));
sqliteDb.function('greatest', { varargs: true }, (...values) => {
  if (values.some((value) => value == null)) return null;
  if (values.every((value) => typeof value === 'string')) {
    return values.reduce((maximum, value) => (value > maximum ? value : maximum));
  }
  return Math.max(...values);
});
sqliteDb.function('field', { varargs: true }, (value, ...choices) => {
  const index = choices.findIndex((choice) => choice === value);
  return index < 0 ? 0 : index + 1;
});
sqliteDb.function('datediff', (firstValue, secondValue) => {
  if (firstValue == null || secondValue == null) return null;
  const firstDate = new Date(`${String(firstValue).slice(0, 10)}T00:00:00Z`);
  const secondDate = new Date(`${String(secondValue).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(firstDate.getTime()) || Number.isNaN(secondDate.getTime())) return null;
  return Math.trunc((firstDate.getTime() - secondDate.getTime()) / (24 * 60 * 60 * 1000));
});
sqliteDb.function('date_add', (value, amount, unit) => adjustDate(value, amount, unit));
sqliteDb.function('date_sub', (value, amount, unit) => adjustDate(value, -amount, unit));
sqliteDb.function('date_format', (value, format) => {
  if (value == null) return null;
  const date = String(value).replace('T', ' ');
  const parts = {
    '%Y': date.slice(0, 4),
    '%m': date.slice(5, 7),
    '%d': date.slice(8, 10),
    '%H': date.slice(11, 13) || '00',
    '%i': date.slice(14, 16) || '00',
    '%s': date.slice(17, 19) || '00'
  };
  return String(format).replace(/%[YmdHis]/g, (token) => parts[token]);
});

function adjustDate(value, amount, unit) {
  if (value == null) return null;
  const dateText = String(value);
  const match = dateText.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/);
  if (!match) return null;
  const [, originalDate, time = '00:00:00', fraction = '', timezone = 'Z'] = match;
  const date = new Date(`${originalDate}T${time}${fraction}${timezone}`);
  const normalizedUnit = String(unit).toLowerCase();
  const interval = Number(amount);
  if (!Number.isFinite(interval)) return null;

  if (normalizedUnit === 'month' || normalizedUnit === 'year') {
    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    if (normalizedUnit === 'month') date.setUTCMonth(date.getUTCMonth() + interval);
    else date.setUTCFullYear(date.getUTCFullYear() + interval);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(originalDay, lastDay));
  } else {
    const milliseconds = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000
    }[normalizedUnit];
    if (!milliseconds) return null;
    date.setTime(date.getTime() + interval * milliseconds);
  }

  const adjustedDate = date.toISOString();
  const result = `${adjustedDate.slice(0, 10)}${match[2] ? ` ${adjustedDate.slice(11, 19)}${fraction}` : ''}`;
  return result;
}

function acquireLock() {
  const previous = lockTail;
  let release;
  lockTail = new Promise((resolve) => { release = resolve; });
  return previous.then(() => release);
}

let lockTail = Promise.resolve();

function rewriteSql(source) {
  let sql = source
    .replace(/\bINSERT\s+IGNORE\b/gi, 'INSERT OR IGNORE')
    .replace(/\s+FOR\s+UPDATE\b/gi, '')
    .replace(/\bNOW\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bGREATEST\s*\(/gi, 'greatest(')
    .replace(/\bDATEDIFF\s*\(/gi, 'datediff(')
    .replace(/\bDATE_FORMAT\s*\(/gi, 'date_format(')
    .replace(/\bFIELD\s*\(/gi, 'field(');

  sql = rewriteDateIntervals(sql);
  sql = sql.replace(
    /ON\s+DUPLICATE\s+KEY\s+UPDATE\s+([\s\S]+)$/i,
    (_, assignments) => `ON CONFLICT DO UPDATE SET ${assignments.replace(/\bVALUES\s*\(\s*([^)]+)\s*\)/gi, 'excluded.$1')}`
  );
  return sql;
}

function rewriteDateIntervals(sql) {
  const matches = [...sql.matchAll(/\bDATE_(ADD|SUB)\s*\(/gi)];
  for (const match of matches.reverse()) {
    const openingIndex = match.index + match[0].lastIndexOf('(');
    let depth = 1;
    let quote = null;
    let closingIndex = openingIndex + 1;
    let separatorIndex = -1;
    for (; closingIndex < sql.length && depth > 0; closingIndex += 1) {
      const character = sql[closingIndex];
      if (quote) {
        if (character === quote) {
          if (quote === "'" && sql[closingIndex + 1] === "'") closingIndex += 1;
          else quote = null;
        }
      } else if (character === "'" || character === '"' || character === '`') quote = character;
      else if (character === '(') depth += 1;
      else if (character === ')') depth -= 1;
      else if (character === ',' && depth === 1 && separatorIndex < 0) separatorIndex = closingIndex;
    }
    if (depth !== 0 || separatorIndex < 0) continue;

    const expression = sql.slice(openingIndex + 1, separatorIndex).trim();
    const interval = sql.slice(separatorIndex + 1, closingIndex - 1).trim()
      .match(/^INTERVAL\s+(\d+)\s+(SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|YEAR)$/i);
    if (!interval) continue;
    const [, amount, unit] = interval;
    const operation = match[1].toUpperCase();
    const signedAmount = operation === 'ADD' ? amount : `-${amount}`;
    const replacement = `date_add(${expression}, ${signedAmount}, '${unit.toLowerCase()}')`;
    sql = `${sql.slice(0, match.index)}${replacement}${sql.slice(closingIndex)}`;
  }
  return sql;
}

function normalizeValue(value) {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  return value;
}

function execute(sql, params = []) {
  const normalizedSql = rewriteSql(sql);
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(normalizedSql)) {
    const result = sqliteDb.exec(normalizedSql);
    return [result, undefined];
  }
  if (/^\s*PRAGMA\b/i.test(normalizedSql) && normalizedSql.includes('=')) {
    sqliteDb.exec(normalizedSql);
    return [{ affectedRows: 0, insertId: 0, changes: 0 }, undefined];
  }

  const statement = sqliteDb.prepare(normalizedSql);
  const values = params.map(normalizeValue);
  if (statement.reader) return [statement.all(...values), undefined];
  const result = statement.run(...values);
  return [{
    affectedRows: result.changes,
    changes: result.changes,
    insertId: Number(result.lastInsertRowid) || 0
  }, undefined];
}

async function withLock(callback) {
  const release = await acquireLock();
  try {
    return callback();
  } finally {
    release();
  }
}

export const pool = {
  query: (sql, params = []) => withLock(() => execute(sql, params)),
  execute: (sql, params = []) => withLock(() => execute(sql, params)),
  async getConnection() {
    const releaseLock = await acquireLock();
    let activeTransaction = false;
    let released = false;
    return {
      query: async (sql, params = []) => execute(sql, params),
      execute: async (sql, params = []) => execute(sql, params),
      beginTransaction: async () => {
        sqliteDb.exec('BEGIN IMMEDIATE');
        activeTransaction = true;
      },
      commit: async () => {
        sqliteDb.exec('COMMIT');
        activeTransaction = false;
      },
      rollback: async () => {
        if (activeTransaction) sqliteDb.exec('ROLLBACK');
        activeTransaction = false;
      },
      release: () => {
        if (released) return;
        if (activeTransaction) sqliteDb.exec('ROLLBACK');
        activeTransaction = false;
        released = true;
        releaseLock();
      }
    };
  },
  async end() {
    await withLock(() => sqliteDb.close());
  }
};

export async function initializeDatabase(schemaPath = path.join(serverRoot, 'sql', 'schema.sql')) {
  const { readFileSync } = await import('node:fs');
  sqliteDb.exec(readFileSync(schemaPath, 'utf8'));
}
