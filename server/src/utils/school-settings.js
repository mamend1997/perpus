import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { pool } from '../config/database.js';

export const defaultLibrarySettings = {
  max_loans_per_member: '3',
  loan_duration_days: '7',
  renewals_enabled: '0',
  max_renewals: '1',
  fine_per_day: '1000',
  automatic_fines: '1',
  whatsapp_enabled: '0',
  whatsapp_reminders: '0',
  whatsapp_fine_notifications: '0',
  whatsapp_otp: '0'
};

function encryptionKey() {
  const configured = process.env.SCHOOL_SETTINGS_ENCRYPTION_KEY;
  if (!configured || configured.length < 32) {
    const error = new Error('SCHOOL_SETTINGS_ENCRYPTION_KEY harus diatur dengan minimal 32 karakter untuk menyimpan secret integrasi.');
    error.code = 'SECRET_ENCRYPTION_KEY_MISSING';
    throw error;
  }
  return createHash('sha256').update(configured).digest();
}

export function encryptSchoolSecret(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSchoolSecret(value) {
  const [prefix, version, ivValue, tagValue, encryptedValue] = String(value).split(':');
  if (prefix !== 'enc' || version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('Format secret integrasi tersimpan tidak valid.');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

export async function readLibrarySettings(schoolId, connection = pool) {
  const [rows] = await connection.execute(
    `SELECT \`key\`, \`value\` FROM school_settings
     WHERE school_id = ? AND \`key\` IN (
       'max_loans_per_member', 'loan_duration_days', 'renewals_enabled', 'max_renewals',
       'fine_per_day', 'automatic_fines', 'whatsapp_enabled', 'whatsapp_reminders',
       'whatsapp_fine_notifications', 'whatsapp_otp', 'whatsapp_token'
     )`,
    [schoolId]
  );
  const settings = { ...defaultLibrarySettings };
  for (const row of rows) settings[row.key] = row.value;

  const numericKeys = ['max_loans_per_member', 'loan_duration_days', 'max_renewals', 'fine_per_day'];
  for (const key of numericKeys) {
    if (!/^\d+$/.test(String(settings[key]))) {
      throw new Error(`Nilai pengaturan ${key} di database tidak valid.`);
    }
  }
  for (const key of [
    'renewals_enabled', 'automatic_fines', 'whatsapp_enabled',
    'whatsapp_reminders', 'whatsapp_fine_notifications', 'whatsapp_otp'
  ]) {
    if (!['0', '1'].includes(String(settings[key]))) {
      throw new Error(`Nilai pengaturan ${key} di database tidak valid.`);
    }
  }
  return settings;
}
