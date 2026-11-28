import { pool } from '../config/database.js';

export const defaultPlatformAiAssistantSettings = {
  enabled: true,
  title: 'Asisten AI Perpustakaan',
  welcomeMessage: 'Halo! Saya bisa membantu menemukan menu yang Anda butuhkan. Apa yang ingin Anda lakukan?',
  suggestions: ['Saya ingin mencari buku', 'Bagaimana mencatat peminjaman?', 'Saya ingin mengelola data siswa']
};

export function normalizePlatformAiAssistantSettings(input) {
  if (!input || typeof input.enabled !== 'boolean'
      || typeof input.title !== 'string' || input.title.trim().length < 2 || input.title.trim().length > 60
      || typeof input.welcomeMessage !== 'string' || input.welcomeMessage.trim().length < 5 || input.welcomeMessage.trim().length > 300
      || !Array.isArray(input.suggestions) || input.suggestions.length > 5
      || input.suggestions.some((suggestion) => typeof suggestion !== 'string' || suggestion.trim().length > 100)) {
    return null;
  }
  return {
    enabled: input.enabled,
    title: input.title.trim(),
    welcomeMessage: input.welcomeMessage.trim(),
    suggestions: input.suggestions.map((suggestion) => suggestion.trim()).filter(Boolean)
  };
}

export async function readPlatformAiAssistantSettings() {
  const [rows] = await pool.execute(
    'SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1',
    ['ai_assistant']
  );
  if (!rows[0]) return defaultPlatformAiAssistantSettings;
  try {
    return normalizePlatformAiAssistantSettings(JSON.parse(rows[0].value)) || defaultPlatformAiAssistantSettings;
  } catch {
    return defaultPlatformAiAssistantSettings;
  }
}