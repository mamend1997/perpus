import { pool } from '../config/database.js';

const retentionInterval = 24 * 60 * 60 * 1000;

async function deleteExpiredActivityLogs() {
  const [result] = await pool.execute(
    'DELETE FROM school_activity_logs WHERE created_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)'
  );
  if (result.affectedRows > 0) {
    console.info(`Log aktivitas kedaluwarsa dihapus: ${result.affectedRows} baris.`);
  }
}

export function startActivityLogCleanupScheduler() {
  deleteExpiredActivityLogs().catch((error) => {
    console.error('Pembersihan log aktivitas gagal:', error.message);
  });
  const timer = setInterval(() => {
    deleteExpiredActivityLogs().catch((error) => {
      console.error('Pembersihan log aktivitas gagal:', error.message);
    });
  }, retentionInterval);
  timer.unref();
}
