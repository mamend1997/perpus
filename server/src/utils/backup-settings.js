import { pool } from '../config/database.js';
import { decryptSchoolSecret, encryptSchoolSecret } from './school-settings.js';

const settingsKey = 'backup_telegram_settings';
const defaults = {
  enabled: false,
  frequency: 'daily',
  dayOfWeek: 1,
  time: '02:00',
  chatId: '',
  tokenEncrypted: '',
  lastRunAt: null,
  lastRunStatus: ''
};

function parseSettings(raw) {
  if (!raw) return { ...defaults };
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Pengaturan backup Telegram tersimpan dalam format yang tidak valid.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Pengaturan backup Telegram tersimpan tidak valid.');
  }
  return { ...defaults, ...value };
}

export async function readBackupSettings(scope, schoolId = null, database = pool) {
  let rows;
  if (scope === 'school') {
    [rows] = await database.execute(
      'SELECT `value` FROM school_settings WHERE school_id = ? AND `key` = ? LIMIT 1',
      [schoolId, settingsKey]
    );
  } else {
    [rows] = await database.execute(
      'SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1',
      [settingsKey]
    );
  }
  return parseSettings(rows[0]?.value);
}

export async function writeBackupSettings(scope, settings, schoolId = null, database = pool) {
  const value = JSON.stringify(settings);
  if (scope === 'school') {
    await database.execute(
      `INSERT INTO school_settings (school_id, \`key\`, \`value\`)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
      [schoolId, settingsKey, value]
    );
  } else {
    await database.execute(
      `INSERT INTO platform_settings (key_name, value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [settingsKey, value]
    );
  }
}

export function publicBackupSettings(settings) {
  return {
    enabled: Boolean(settings.enabled),
    frequency: settings.frequency,
    dayOfWeek: Number(settings.dayOfWeek),
    time: settings.time,
    chatId: settings.chatId,
    telegramConfigured: Boolean(settings.tokenEncrypted),
    lastRunAt: settings.lastRunAt || null,
    lastRunStatus: settings.lastRunStatus || ''
  };
}

export async function updateBackupSettings(scope, input, schoolId = null, database = pool) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || typeof input.enabled !== 'boolean'
      || !['daily', 'weekly'].includes(input.frequency)
      || !Number.isInteger(Number(input.dayOfWeek)) || Number(input.dayOfWeek) < 0 || Number(input.dayOfWeek) > 6
      || typeof input.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)
      || typeof input.chatId !== 'string' || input.chatId.trim().length > 120
      || (input.telegramToken != null && typeof input.telegramToken !== 'string')
      || (input.clearTelegramToken != null && typeof input.clearTelegramToken !== 'boolean')) {
    const error = new Error('Pengaturan jadwal atau konfigurasi Telegram tidak valid.');
    error.status = 400;
    throw error;
  }
  const current = await readBackupSettings(scope, schoolId, database);
  const token = typeof input.telegramToken === 'string' ? input.telegramToken.trim() : '';
  const settings = {
    ...current,
    enabled: input.enabled,
    frequency: input.frequency,
    dayOfWeek: Number(input.dayOfWeek),
    time: input.time,
    chatId: input.chatId.trim(),
    tokenEncrypted: input.clearTelegramToken
      ? ''
      : token
        ? encryptSchoolSecret(token)
        : current.tokenEncrypted
  };
  if (settings.enabled && (!settings.chatId || !settings.tokenEncrypted)) {
    const error = new Error('Isi Chat ID dan token bot Telegram sebelum mengaktifkan autobackup.');
    error.status = 400;
    throw error;
  }
  await writeBackupSettings(scope, settings, schoolId, database);
  return settings;
}

export function decryptBackupToken(settings) {
  if (!settings.tokenEncrypted) return '';
  return decryptSchoolSecret(settings.tokenEncrypted);
}
