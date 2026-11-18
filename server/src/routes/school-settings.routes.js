import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSchool } from '../middleware/require-school.js';
import { encryptSchoolSecret, readLibrarySettings } from '../utils/school-settings.js';

const router = Router();
router.use(requireSchool);

const mobileNavbarOptions = [
  'Dashboard', 'Daftar Pustaka', 'Tambah Stok Buku', 'Pindah Rak', 'Eksemplar',
  'Pengadaan Buku', 'Analitik Sirkulasi', 'Peminjaman', 'Denda', 'Identitas Sekolah',
  'Kop Sekolah', 'Tahun Pelajaran', 'Data Siswa & Rombel', 'Bahasa', 'Jenis',
  'Koleksi', 'Klasifikasi', 'Topik', 'Rak', 'Pengarang', 'Penerbit', 'Agen',
  'Buku Tamu Digital', 'Booking Buku', 'Ulasan & Rating', 'Portal Publik',
  'Pengumuman', 'Laporan', 'Pengaturan'
];
const defaultMobileNavbarSettings = {
  items: ['Dashboard', 'Daftar Pustaka', 'Buku Tamu Digital', 'Peminjaman', 'Denda'],
  highlight: 'Buku Tamu Digital'
};

function isBoolean(value) {
  return typeof value === 'boolean';
}

function validMobileNavbarSettings(settings) {
  return settings && Array.isArray(settings.items) && settings.items.length === 5
    && settings.items.every((item) => mobileNavbarOptions.includes(item))
    && new Set(settings.items).size === 5
    && settings.items.includes(settings.highlight);
}

router.get('/mobile-navbar', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT `value` FROM school_settings WHERE school_id = ? AND `key` = ? LIMIT 1',
      [req.school.id, 'mobile_navbar']
    );
    if (!rows[0]) return res.json({ settings: defaultMobileNavbarSettings });
    let settings;
    try {
      settings = JSON.parse(rows[0].value);
    } catch {
      return res.status(500).json({ message: 'Pengaturan navbar ponsel tersimpan dalam format yang tidak valid.' });
    }
    if (!validMobileNavbarSettings(settings)) {
      return res.status(500).json({ message: 'Konfigurasi navbar ponsel tidak valid. Hubungi admin sekolah.' });
    }
    return res.json({ settings });
  } catch (error) {
    return next(error);
  }
});

router.put('/mobile-navbar', canManageSettings, async (req, res, next) => {
  const settings = req.body;
  if (!validMobileNavbarSettings(settings)) {
    return res.status(400).json({
      message: 'Pilih tepat lima menu yang berbeda dan tandai salah satunya sebagai tombol highlight.'
    });
  }
  try {
    await pool.execute(
      `INSERT INTO school_settings (school_id, \`key\`, \`value\`)
       VALUES (?, 'mobile_navbar', ?)
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
      [req.school.id, JSON.stringify(settings)]
    );
    return res.json({ settings, message: 'Pengaturan navbar ponsel berhasil disimpan.' });
  } catch (error) {
    return next(error);
  }
});

function readInput(body) {
  const maxLoansPerMember = Number(body?.maxLoansPerMember);
  const loanDurationDays = Number(body?.loanDurationDays);
  const maxRenewals = Number(body?.maxRenewals);
  const finePerDay = Number(body?.finePerDay);
  const booleans = [
    body?.renewalsEnabled,
    body?.automaticFines,
    body?.whatsappEnabled,
    body?.whatsappReminders,
    body?.whatsappFineNotifications,
    body?.whatsappOtp
  ];

  if (!Number.isSafeInteger(maxLoansPerMember) || maxLoansPerMember < 1 || maxLoansPerMember > 50
    || !Number.isSafeInteger(loanDurationDays) || loanDurationDays < 1 || loanDurationDays > 60
    || !Number.isSafeInteger(maxRenewals) || maxRenewals < 0 || maxRenewals > 5
    || !Number.isSafeInteger(finePerDay) || finePerDay < 0 || finePerDay > 1000000
    || booleans.some((value) => !isBoolean(value))) {
    return { error: 'Periksa batas pinjaman, durasi, perpanjangan, tarif denda, dan pilihan notifikasi.' };
  }
  if (body?.whatsappToken != null
    && (typeof body.whatsappToken !== 'string' || body.whatsappToken.length > 500)) {
    return { error: 'Token WhatsApp harus berupa teks maksimal 500 karakter.' };
  }
  if (body?.clearWhatsappToken != null && typeof body.clearWhatsappToken !== 'boolean') {
    return { error: 'Pilihan hapus token WhatsApp tidak valid.' };
  }

  return {
    value: {
      maxLoansPerMember: String(maxLoansPerMember),
      loanDurationDays: String(loanDurationDays),
      renewalsEnabled: body.renewalsEnabled,
      maxRenewals: String(maxRenewals),
      finePerDay: String(finePerDay),
      automaticFines: body.automaticFines,
      whatsappEnabled: body.whatsappEnabled,
      whatsappReminders: body.whatsappReminders,
      whatsappFineNotifications: body.whatsappFineNotifications,
      whatsappOtp: body.whatsappOtp,
      whatsappToken: body.whatsappToken?.trim() || '',
      clearWhatsappToken: body.clearWhatsappToken === true
    }
  };
}

function canManageSettings(req, res, next) {
  if (req.school.role !== 'admin') {
    return res.status(403).json({ message: 'Hanya Admin sekolah yang dapat mengubah pengaturan perpustakaan.' });
  }
  return next();
}

router.get('/library', canManageSettings, async (req, res, next) => {
  try {
    const stored = await readLibrarySettings(req.school.id);
    return res.json({
      settings: {
        maxLoansPerMember: Number(stored.max_loans_per_member),
        loanDurationDays: Number(stored.loan_duration_days),
        renewalsEnabled: stored.renewals_enabled === '1',
        maxRenewals: Number(stored.max_renewals),
        finePerDay: Number(stored.fine_per_day),
        automaticFines: stored.automatic_fines === '1',
        whatsappEnabled: stored.whatsapp_enabled === '1',
        whatsappReminders: stored.whatsapp_reminders === '1',
        whatsappFineNotifications: stored.whatsapp_fine_notifications === '1',
        whatsappOtp: stored.whatsapp_otp === '1',
        whatsappTokenConfigured: Boolean(stored.whatsapp_token)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/library', canManageSettings, async (req, res, next) => {
  const { value, error } = readInput(req.body);
  if (error) return res.status(400).json({ message: error });

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const existing = await readLibrarySettings(req.school.id, connection);
    const hasNewToken = Boolean(value.whatsappToken);
    if (value.clearWhatsappToken && hasNewToken) {
      await connection.rollback();
      return res.status(400).json({ message: 'Pilih isi token baru atau hapus token, bukan keduanya.' });
    }
    if (value.whatsappEnabled && !hasNewToken && !existing.whatsapp_token && !value.clearWhatsappToken) {
      await connection.rollback();
      return res.status(400).json({ message: 'Simpan token WhatsApp terlebih dahulu sebelum mengaktifkan integrasi.' });
    }
    if (value.whatsappEnabled && value.clearWhatsappToken) {
      await connection.rollback();
      return res.status(400).json({ message: 'Integrasi WhatsApp tidak dapat diaktifkan tanpa token.' });
    }

    const settingsToSave = {
      max_loans_per_member: value.maxLoansPerMember,
      loan_duration_days: value.loanDurationDays,
      renewals_enabled: value.renewalsEnabled ? '1' : '0',
      max_renewals: value.maxRenewals,
      fine_per_day: value.finePerDay,
      automatic_fines: value.automaticFines ? '1' : '0',
      whatsapp_enabled: value.whatsappEnabled ? '1' : '0',
      whatsapp_reminders: value.whatsappReminders ? '1' : '0',
      whatsapp_fine_notifications: value.whatsappFineNotifications ? '1' : '0',
      whatsapp_otp: value.whatsappOtp ? '1' : '0'
    };
    for (const [key, settingValue] of Object.entries(settingsToSave)) {
      await connection.execute(
        `INSERT INTO school_settings (school_id, \`key\`, \`value\`)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
        [req.school.id, key, settingValue]
      );
    }
    if (value.clearWhatsappToken) {
      await connection.execute(
        'DELETE FROM school_settings WHERE school_id = ? AND `key` = ?',
        [req.school.id, 'whatsapp_token']
      );
    } else if (hasNewToken) {
      const encryptedToken = encryptSchoolSecret(value.whatsappToken);
      await connection.execute(
        `INSERT INTO school_settings (school_id, \`key\`, \`value\`)
         VALUES (?, 'whatsapp_token', ?)
         ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
        [req.school.id, encryptedToken]
      );
    }
    await connection.execute(
      'UPDATE tenants_schools SET fine_per_day = ? WHERE id = ?',
      [value.finePerDay, req.school.id]
    );
    await connection.commit();
    return res.json({
      settings: {
        maxLoansPerMember: Number(value.maxLoansPerMember),
        loanDurationDays: Number(value.loanDurationDays),
        renewalsEnabled: value.renewalsEnabled,
        maxRenewals: Number(value.maxRenewals),
        finePerDay: Number(value.finePerDay),
        automaticFines: value.automaticFines,
        whatsappEnabled: value.whatsappEnabled,
        whatsappReminders: value.whatsappReminders,
        whatsappFineNotifications: value.whatsappFineNotifications,
        whatsappOtp: value.whatsappOtp,
        whatsappTokenConfigured: value.clearWhatsappToken
          ? false
          : hasNewToken || Boolean(existing.whatsapp_token)
      },
      message: 'Pengaturan perpustakaan berhasil disimpan.'
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

export default router;
