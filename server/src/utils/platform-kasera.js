import { pool } from '../config/database.js';
import { decryptSchoolSecret, encryptSchoolSecret } from './school-settings.js';

export async function readPlatformKaseraCredentials(connection = pool) {
  const [rows] = await connection.execute(
    'SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1',
    ['platform_kasera_credentials']
  );
  const saved = rows[0] ? JSON.parse(rows[0].value) : {};
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    throw new Error('Pengaturan kredensial Kasera tersimpan tidak valid.');
  }
  return {
    apiKey: saved.apiKeyEncrypted
      ? decryptSchoolSecret(saved.apiKeyEncrypted)
      : process.env.KASERA_API_KEY?.trim() || '',
    webhookSecret: saved.webhookSecretEncrypted
      ? decryptSchoolSecret(saved.webhookSecretEncrypted)
      : process.env.KASERA_WEBHOOK_SECRET?.trim() || ''
  };
}

export function isPlatformKaseraConfigured(credentials) {
  return /^(kp_test_|kp_live_)/.test(credentials.apiKey) && Boolean(credentials.webhookSecret);
}

export function platformKaseraMode(credentials) {
  if (credentials.apiKey.startsWith('kp_test_')) return 'sandbox';
  if (credentials.apiKey.startsWith('kp_live_')) return 'live';
  return 'unknown';
}

export async function savePlatformKaseraCredentials(credentials, connection = pool) {
  const value = JSON.stringify({
    apiKeyEncrypted: credentials.apiKey ? encryptSchoolSecret(credentials.apiKey) : '',
    webhookSecretEncrypted: credentials.webhookSecret ? encryptSchoolSecret(credentials.webhookSecret) : ''
  });
  await connection.execute(
    `INSERT INTO platform_settings (key_name, value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    ['platform_kasera_credentials', value]
  );
}
