import { Router } from 'express';
import { pool } from '../config/database.js';
import { defaultSubscriptionPackages } from '../utils/platform-subscription-packages.js';
import { createKaseraPayment } from '../utils/kasera-payment.js';
import { isPlatformKaseraConfigured, readPlatformKaseraCredentials } from '../utils/platform-kasera.js';

const router = Router();

function requireSchoolAdmin(req, res, next) {
  if (req.school.role !== 'admin') {
    return res.status(403).json({ message: 'Layanan dan perpanjangan hanya tersedia untuk Admin sekolah.' });
  }
  return next();
}

async function getPlatformSetting(key) {
  const [rows] = await pool.execute(
    'SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1',
    [key]
  );
  return rows[0] ? JSON.parse(rows[0].value) : null;
}

function todayInJakarta() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

router.get('/', requireSchoolAdmin, async (req, res, next) => {
  try {
    await pool.execute(
      `UPDATE tenant_invoices SET status = 'expired'
       WHERE school_id = ? AND payment_provider = 'kasera' AND status = 'unpaid'
         AND expires_at IS NOT NULL AND expires_at <= NOW()`,
      [req.school.id]
    );
    const [schoolResult, packageResult, paymentResult, invoiceResult, credentials] = await Promise.all([
      pool.execute(
        `SELECT s.package_type, s.subscription_expires_at, s.status AS school_status
         FROM tenants_schools s WHERE s.id = ? LIMIT 1`,
        [req.school.id]
      ),
      pool.execute('SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1', ['subscription_packages']),
      pool.execute('SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1', ['platform_payment_settings']),
      pool.execute(
        `SELECT id, amount, status, package_type, billing_period, checkout_url,
                expires_at, paid_at, created_at
         FROM tenant_invoices WHERE school_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`,
        [req.school.id]
      ),
      readPlatformKaseraCredentials()
    ]);
    const [schoolRows] = schoolResult;
    const [packageSettings] = packageResult;
    const [paymentSettings] = paymentResult;
    const [invoices] = invoiceResult;

    if (!schoolRows[0]) return res.status(404).json({ message: 'Data sekolah tidak ditemukan.' });
    const packages = packageSettings[0] ? JSON.parse(packageSettings[0].value) : defaultSubscriptionPackages;
    const payments = paymentSettings[0] ? JSON.parse(paymentSettings[0].value) : {};
    const currentPackage = packages.find((item) => item.id === schoolRows[0].package_type) || null;
    return res.json({
      subscription: {
        packageType: schoolRows[0].package_type,
        package: currentPackage,
        expiresAt: schoolRows[0].subscription_expires_at,
        schoolStatus: schoolRows[0].school_status
      },
      packages: packages.filter((item) => item.enabled),
      kaseraEnabled: payments.kaseraEnabled === true && isPlatformKaseraConfigured(credentials),
      invoices
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/renew', requireSchoolAdmin, async (req, res, next) => {
  const packageId = typeof req.body?.packageId === 'string' ? req.body.packageId : '';
  const period = typeof req.body?.period === 'string' ? req.body.period : '';
  let credentials;
  try {
    credentials = await readPlatformKaseraCredentials();
  } catch (error) {
    return next(error);
  }
  if (!isPlatformKaseraConfigured(credentials)) {
    return res.status(503).json({ message: 'Gateway Kasera belum dikonfigurasi oleh Super Admin.' });
  }

  let invoiceId;
  try {
    const [settingsRows] = await pool.execute(
      'SELECT value FROM platform_settings WHERE key_name = ? LIMIT 1',
      ['platform_payment_settings']
    );
    const paymentSettings = settingsRows[0] ? JSON.parse(settingsRows[0].value) : {};
    if (paymentSettings.kaseraEnabled !== true) {
      return res.status(503).json({ message: 'Pembayaran Kasera sedang dinonaktifkan.' });
    }

    const packages = await getPlatformSetting('subscription_packages') || defaultSubscriptionPackages;
    const selectedPackage = packages.find((item) => item.id === packageId && item.enabled);
    if (!selectedPackage || !Object.hasOwn(selectedPackage.prices || {}, period)) {
      return res.status(400).json({ message: 'Paket atau periode perpanjangan tidak tersedia.' });
    }
    const amount = Number(selectedPackage.prices[period]);
    if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 1000000000) {
      return res.status(400).json({ message: 'Harga paket belum valid untuk pembayaran Kasera.' });
    }
    if (selectedPackage.id === 'lifetime' && period !== 'once'
        || selectedPackage.id !== 'lifetime' && period === 'once') {
      return res.status(400).json({ message: 'Periode pembayaran tidak sesuai dengan paket.' });
    }

    const [schoolRows] = await pool.execute(
      `SELECT s.package_type
       FROM tenants_schools s WHERE s.id = ? LIMIT 1`,
      [req.school.id]
    );
    const schools = schoolRows[0];
    if (!schools) return res.status(404).json({ message: 'Data sekolah tidak ditemukan.' });
    if (schools.package_type === 'lifetime') {
      return res.status(409).json({ message: 'Paket Lifetime tidak memerlukan perpanjangan.' });
    }
    if (amount > 1000000 && !req.school.email) {
      return res.status(400).json({ message: 'Lengkapi email admin sekolah sebelum membuat pembayaran di atas Rp1.000.000.' });
    }

    const [insertResult] = await pool.execute(
      `INSERT INTO tenant_invoices
       (school_id, amount, status, due_date, package_type, billing_period, payment_provider)
       VALUES (?, ?, 'unpaid', DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), ?, ?, 'kasera')`,
      [req.school.id, amount, selectedPackage.id, period]
    );
    invoiceId = insertResult.insertId;

    const payment = await createKaseraPayment({
      invoiceId,
      amount,
      description: `Langganan ${selectedPackage.name} - ${req.school.name}`,
      ...(amount > 1000000 ? {
        customer: { name: req.school.userName, email: req.school.email },
        deliveryDate: todayInJakarta()
      } : {})
    });
    await pool.execute(
      `UPDATE tenant_invoices
       SET provider_payment_id = ?, checkout_url = ?, expires_at = ?
       WHERE id = ? AND status <> 'paid'`,
      [payment.paymentId, payment.checkoutUrl, payment.expiresAt ? new Date(payment.expiresAt) : null, invoiceId]
    );
    return res.status(201).json({
      invoice: {
        id: invoiceId,
        amount,
        checkoutUrl: payment.checkoutUrl,
        expiresAt: payment.expiresAt
      },
      message: 'Tagihan berhasil dibuat. Lanjutkan pembayaran melalui Kasera.'
    });
  } catch (error) {
    if (invoiceId) {
      await pool.execute(
        `UPDATE tenant_invoices SET status = 'failed' WHERE id = ? AND status = 'unpaid'`,
        [invoiceId]
      ).catch((updateError) => console.error('Gagal memperbarui status invoice Kasera:', updateError));
    }
    return next(error);
  }
});

export default router;
