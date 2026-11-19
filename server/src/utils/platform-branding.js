import { pool } from '../config/database.js';

export const defaultPlatformBranding = {
  title: 'MACA',
  subtitle: 'PLATFORM ADMIN',
  primaryColor: '#f97316',
  logo: ''
};

export function normalizePlatformBranding(saved = {}) {
  const branding = { ...defaultPlatformBranding, ...saved };
  if (typeof branding.title !== 'string' || !branding.title.trim()) branding.title = 'MACA';
  else if (branding.title.trim().toLowerCase() === 'perpuskita') branding.title = 'MACA';
  else branding.title = branding.title.trim();
  return branding;
}

export async function readPlatformBranding(connection = pool) {
  const [rows] = await connection.execute(
    'SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1',
    ['platform_branding']
  );
  return normalizePlatformBranding(rows[0] ? JSON.parse(rows[0].value) : {});
}
