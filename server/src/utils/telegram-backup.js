import { pool } from '../config/database.js';
import { createBackupArchive } from './backup-archive.js';
import {
  decryptBackupToken, readBackupSettings, writeBackupSettings
} from './backup-settings.js';
import { readPlatformBranding } from './platform-branding.js';

const telegramMaxBytes = 49 * 1024 * 1024;
const timeZone = 'Asia/Jakarta';
const weekdayNumbers = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localScheduleParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    dayOfWeek: weekdayNumbers[values.weekday]
  };
}

async function updateRunStatus(scope, schoolId, status) {
  const settings = await readBackupSettings(scope, schoolId);
  await writeBackupSettings(scope, {
    ...settings,
    lastRunAt: new Date().toISOString(),
    lastRunStatus: status
  }, schoolId);
}

async function sendDocument(token, chatId, archive, fileName, caption) {
  if (archive.length > telegramMaxBytes) {
    throw new Error('Arsip melebihi batas pengiriman Telegram sebesar 49 MB.');
  }
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', caption.slice(0, 900));
  form.append('document', new Blob([archive], { type: 'application/gzip' }), fileName);
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(120000)
    });
  } catch {
    throw new Error('Tidak dapat terhubung ke Telegram untuk mengirim backup.');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error('Telegram menolak pengiriman backup. Periksa token bot, Chat ID, dan batas ukuran arsip.');
  }
}

export async function sendConfiguredBackup(scope, schoolId = null, schoolName = '') {
  const settings = await readBackupSettings(scope, schoolId);
  if (!settings.tokenEncrypted || !settings.chatId) {
    throw new Error('Konfigurasi Telegram belum lengkap.');
  }
  try {
    const archive = await createBackupArchive(scope, schoolId);
    const fileName = `maca-${scope === 'school' ? `sekolah-${schoolId}` : 'platform'}-${new Date().toISOString().slice(0, 10)}.json.gz`;
    const branding = scope === 'platform' ? await readPlatformBranding() : null;
    const caption = scope === 'school'
      ? `Backup data sekolah: ${schoolName || `ID ${schoolId}`}`
      : `Backup database ${branding.title} seluruh platform`;
    await sendDocument(decryptBackupToken(settings), settings.chatId, archive, fileName, caption);
    await updateRunStatus(scope, schoolId, 'Berhasil dikirim ke Telegram');
    return { message: 'Backup berhasil dikirim ke Telegram.' };
  } catch (error) {
    await updateRunStatus(scope, schoolId, error.message);
    throw error;
  }
}

export async function sendTelegramTest(scope, schoolId = null) {
  const settings = await readBackupSettings(scope, schoolId);
  if (!settings.tokenEncrypted || !settings.chatId) {
    const error = new Error('Simpan token bot dan Chat ID terlebih dahulu.');
    error.status = 400;
    throw error;
  }
  const branding = await readPlatformBranding();
  await sendDocument(
    decryptBackupToken(settings),
    settings.chatId,
    Buffer.from(`Tes koneksi backup ${branding.title}.`),
    `tes-backup-${scope}.txt`,
    `Tes koneksi bot Telegram ${branding.title}.`
  );
  return { message: 'Pesan tes berhasil dikirim ke Telegram.' };
}

function isScheduleDue(settings, now) {
  if (!settings.enabled || settings.frequency === 'weekly' && Number(settings.dayOfWeek) !== now.dayOfWeek) return false;
  if (now.time < settings.time) return false;
  if (!settings.lastRunAt) return true;
  const lastRun = localScheduleParts(new Date(settings.lastRunAt));
  return lastRun.date !== now.date;
}

let backupRunInProgress = false;

async function runDueBackups() {
  if (backupRunInProgress) return;
  backupRunInProgress = true;
  try {
    const now = localScheduleParts();
    const [platformRows] = await pool.execute(
      'SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1',
      ['backup_telegram_settings']
    );
    if (platformRows[0]) {
      const { readBackupSettings: readSettings } = await import('./backup-settings.js');
      const settings = await readSettings('platform');
      if (isScheduleDue(settings, now)) {
        await sendConfiguredBackup('platform').catch((error) => {
          console.error('Platform Telegram backup failed:', error.message);
        });
      }
    }

    const [schoolRows] = await pool.execute(
      'SELECT school_id, `value` FROM school_settings WHERE `key` = ?',
      ['backup_telegram_settings']
    );
    for (const row of schoolRows) {
      let settings;
      try {
        settings = JSON.parse(row.value);
      } catch {
        console.error(`School Telegram backup configuration is invalid for school ${row.school_id}.`);
        continue;
      }
      if (!isScheduleDue(settings, now)) continue;
      const [[school]] = await pool.execute(
        'SELECT name FROM tenants_schools WHERE id = ? LIMIT 1',
        [row.school_id]
      );
      await sendConfiguredBackup('school', String(row.school_id), school?.name || '').catch((error) => {
        console.error(`School Telegram backup failed for school ${row.school_id}:`, error.message);
      });
    }
  } finally {
    backupRunInProgress = false;
  }
}

let schedulerTimer;

export function startBackupScheduler() {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => {
    runDueBackups().catch((error) => console.error('Backup scheduler failed:', error.message));
  }, 60000);
  schedulerTimer.unref();
  runDueBackups().catch((error) => console.error('Backup scheduler failed:', error.message));
}
