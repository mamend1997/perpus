import { Router } from 'express';
import { pool } from '../config/database.js';
import { verifyKaseraWebhook } from '../utils/kasera-payment.js';
import { readPlatformKaseraCredentials } from '../utils/platform-kasera.js';

const router = Router();

router.post('/webhook', async (req, res, next) => {
  let credentials;
  try {
    credentials = await readPlatformKaseraCredentials();
  } catch (error) {
    return next(error);
  }
  const secret = credentials.webhookSecret;
  const signature = req.get('Kasera-Signature-V1');
  if (!verifyKaseraWebhook(req.body, signature, secret)) {
    return res.status(400).json({ message: 'Signature webhook Kasera tidak valid.' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ message: 'Payload webhook Kasera tidak valid.' });
  }

  const eventId = req.get('Kasera-Event-Id') || event.id;
  const invoiceMatch = /^school-invoice-(\d+)$/.exec(event.data?.external_id || '');
  const apiKey = credentials.apiKey;
  const liveKey = apiKey.startsWith('kp_live_');
  if (typeof eventId !== 'string' || eventId.length > 80 || !invoiceMatch
      || (event.id && event.id !== eventId)
      || !['payment.paid', 'payment.expired', 'payment.failed'].includes(event.type)
      || !event.data || event.data.currency !== 'IDR'
      || (!liveKey && !apiKey.startsWith('kp_test_'))
      || typeof event.livemode !== 'boolean' || event.livemode !== liveKey) {
    console.warn('Webhook Kasera diabaikan karena tidak cocok dengan invoice sekolah.');
    return res.status(200).json({ received: true });
  }

  const nextStatus = {
    'payment.paid': 'paid',
    'payment.expired': 'expired',
    'payment.failed': 'failed'
  }[event.type];
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [invoices] = await connection.execute(
      `SELECT id, school_id, amount, status, package_type, billing_period, provider_payment_id
       FROM tenant_invoices WHERE id = ? FOR UPDATE`,
      [invoiceMatch[1]]
    );
    const invoice = invoices[0];
    if (!invoice) {
      await connection.rollback();
      console.warn(`Webhook Kasera ${eventId} merujuk invoice yang tidak ditemukan.`);
      return res.status(200).json({ received: true });
    }

    if (Number(invoice.amount) !== Number(event.data.amount)
        || (invoice.provider_payment_id && invoice.provider_payment_id !== event.data.payment_request_id)) {
      await connection.rollback();
      console.error(`Data invoice tidak cocok untuk webhook Kasera ${eventId}.`);
      return res.status(400).json({ message: 'Data pembayaran tidak cocok dengan invoice.' });
    }

    try {
      await connection.execute('INSERT INTO kasera_webhook_events (event_id) VALUES (?)', [eventId]);
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      await connection.rollback();
      return res.json({ received: true, duplicate: true });
    }

    if (invoice.status !== 'paid') {
      await connection.execute(
        `UPDATE tenant_invoices
         SET status = ?, provider_payment_id = COALESCE(provider_payment_id, ?),
             paid_at = CASE WHEN ? IS NOT NULL THEN ? ELSE paid_at END
         WHERE id = ?`,
        [
          nextStatus,
          event.data.payment_request_id || null,
          nextStatus === 'paid' ? event.data.paid_at || new Date() : null,
          nextStatus === 'paid' ? event.data.paid_at ? new Date(event.data.paid_at) : new Date() : null,
          invoice.id
        ]
      );

      if (nextStatus === 'paid' && invoice.package_type && invoice.billing_period) {
        if (invoice.billing_period === 'once') {
          await connection.execute(
            `UPDATE tenants_schools
             SET package_type = 'lifetime', subscription_expires_at = NULL
             WHERE id = ?`,
            [invoice.school_id]
          );
        } else {
          const months = { monthly: 1, semester: 6, yearly: 12 }[invoice.billing_period];
          if (!months) throw new Error(`Periode langganan tidak dikenali: ${invoice.billing_period}`);
          await connection.execute(
            `UPDATE tenants_schools
             SET package_type = ?, subscription_expires_at =
               DATE_ADD(GREATEST(COALESCE(subscription_expires_at, NOW()), NOW()), INTERVAL ${months} MONTH)
             WHERE id = ?`,
            [invoice.package_type, invoice.school_id]
          );
        }
      }
    }

    await connection.commit();
    return res.json({ received: true });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

export default router;
