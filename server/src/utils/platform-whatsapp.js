import { pool } from '../config/database.js';
import { decryptSchoolSecret } from './school-settings.js';

export const defaultPlatformWhatsAppSettings = {
  enabled: false,
  registrationOtpEnabled: false,
  paymentRemindersEnabled: false,
  reminderDaysBefore: 3,
  reminderDaysAfter: 7
};

export async function readPlatformWhatsAppSettings(connection = pool) {
  const [rows] = await connection.execute(
    'SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1',
    ['platform_whatsapp_gateway']
  );
  const saved = rows[0] ? JSON.parse(rows[0].value) : {};
  return {
    ...defaultPlatformWhatsAppSettings,
    ...saved,
    tokenConfigured: Boolean(saved.tokenEncrypted)
  };
}

export async function sendPlatformWhatsAppMessage(target, message, connection = pool) {
  const settings = await readPlatformWhatsAppSettings(connection);
  if (!settings.enabled || !settings.tokenEncrypted) {
    throw new Error('Gateway WhatsApp platform belum aktif atau belum memiliki token.');
  }
  const token = decryptSchoolSecret(settings.tokenEncrypted);
  const body = new URLSearchParams({
    target,
    message,
    countryCode: '0',
    connectOnly: 'true'
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body,
      signal: controller.signal
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || result.status !== true) {
      const providerMessage = typeof result?.reason === 'string' ? result.reason.slice(0, 250) : '';
      throw new Error(providerMessage || `Fonnte menolak pengiriman pesan (HTTP ${response.status}).`);
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendDuePaymentReminders() {
  const connection = await pool.getConnection();
  let lockAcquired = false;
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK('perpuskita_payment_reminder_scheduler', 0) AS acquired");
    lockAcquired = Number(lock.acquired) === 1;
    if (!lockAcquired) return;

    const settings = await readPlatformWhatsAppSettings(connection);
    if (!settings.enabled || !settings.paymentRemindersEnabled || !settings.tokenConfigured) return;
    const [invoices] = await connection.execute(
      `SELECT i.id, i.amount, DATE_FORMAT(i.due_date, '%Y-%m-%d') AS due_date,
              DATEDIFF(i.due_date, CURRENT_DATE) AS days_until_due,
              s.name AS school_name, u.phone, u.name AS admin_name
       FROM tenant_invoices i
       JOIN tenants_schools s ON s.id = i.school_id AND s.status = 'active'
       JOIN users u ON u.id = (
         SELECT ua.id FROM users ua
         WHERE ua.school_id = s.id AND ua.role = 'admin' AND ua.status = 'active'
         ORDER BY ua.id LIMIT 1
       )
       WHERE i.status = 'unpaid'
         AND DATEDIFF(i.due_date, CURRENT_DATE) IN (?, ?)
         AND u.phone IS NOT NULL AND u.phone <> ''
         AND NOT EXISTS (
           SELECT 1 FROM platform_payment_reminder_logs l
           WHERE l.invoice_id = i.id
             AND l.reminder_kind = CASE
               WHEN DATEDIFF(i.due_date, CURRENT_DATE) > 0 THEN 'before_due'
               ELSE 'overdue'
             END
         )
       ORDER BY i.due_date, i.id
       LIMIT 50`,
      [settings.reminderDaysBefore, -settings.reminderDaysAfter]
    );

    for (const invoice of invoices) {
      const daysUntilDue = Number(invoice.days_until_due);
      const reminderKind = daysUntilDue > 0 ? 'before_due' : 'overdue';
      const dueDate = new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(new Date(`${invoice.due_date}T00:00:00Z`));
      const amount = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
      }).format(Number(invoice.amount));
      const timing = reminderKind === 'before_due'
        ? `akan jatuh tempo pada ${dueDate}`
        : `telah melewati jatuh tempo ${dueDate}`;
      const message = `Halo ${invoice.admin_name}, pengingat tagihan PerpusKita untuk ${invoice.school_name}. Tagihan #${invoice.id} sebesar ${amount} ${timing}. Silakan lakukan pembayaran melalui akun sekolah.`;
      try {
        await sendPlatformWhatsAppMessage(invoice.phone, message, connection);
        await connection.execute(
          `INSERT IGNORE INTO platform_payment_reminder_logs (invoice_id, reminder_kind, recipient)
           VALUES (?, ?, ?)`,
          [invoice.id, reminderKind, invoice.phone]
        );
      } catch (error) {
        console.error(`Gagal mengirim pengingat invoice ${invoice.id}:`, error.message);
      }
    }
  } finally {
    if (lockAcquired) {
      await connection.query("SELECT RELEASE_LOCK('perpuskita_payment_reminder_scheduler')").catch(() => {});
    }
    connection.release();
  }
}

let schedulerTimer;

export function startPlatformWhatsAppScheduler() {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => {
    sendDuePaymentReminders().catch((error) => console.error('Penjadwal pengingat pembayaran gagal:', error.message));
  }, 30 * 60 * 1000);
  schedulerTimer.unref();
  sendDuePaymentReminders().catch((error) => console.error('Penjadwal pengingat pembayaran gagal:', error.message));
}
