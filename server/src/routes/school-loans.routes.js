import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';
import { readLibrarySettings } from '../utils/school-settings.js';

const router = Router();

const validId = (value) => /^[1-9]\d*$/.test(String(value ?? ''));
const roleCanManageLoans = (req) => req.school.role !== 'member';

function parsePageValue(value, fallback, maximum) {
  const parsed = value == null ? fallback : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function loanRecord(row) {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    member_name: row.member_name,
    nis_nisn: row.nis_nisn,
    book_title: row.book_title,
    serial_number: row.serial_number,
    borrow_date: row.borrow_date,
    due_date: row.due_date,
    return_date: row.return_date,
    status: row.display_status,
    fine_amount: Number(row.fine_amount || 0),
    display_fine: Number(row.display_fine || 0),
    fine_status: row.fine_status,
    renewal_count: Number(row.renewal_count || 0)
  };
}

async function lockBookAndCopy(connection, schoolId, bookItemId) {
  const [references] = await connection.execute(
    'SELECT book_id FROM book_items WHERE id = ? AND school_id = ? LIMIT 1',
    [bookItemId, schoolId]
  );
  if (!references[0]) return null;

  const [books] = await connection.execute(
    'SELECT id FROM books WHERE id = ? AND school_id = ? FOR UPDATE',
    [references[0].book_id, schoolId]
  );
  if (!books[0]) return null;

  const [items] = await connection.execute(
    `SELECT id, book_id, serial_number, status FROM book_items
     WHERE id = ? AND school_id = ? FOR UPDATE`,
    [bookItemId, schoolId]
  );
  return items[0] || null;
}

async function removeLoanRows(connection, schoolId, ids, finesOnly = false) {
  const placeholders = ids.map(() => '?').join(', ');
  const [loanReferences] = await connection.execute(
    `SELECT id, book_item_id FROM loans WHERE school_id = ? AND id IN (${placeholders})`,
    [schoolId, ...ids]
  );
  if (loanReferences.length !== ids.length) {
    return { status: 404, message: 'Sebagian transaksi tidak ditemukan di sekolah ini.' };
  }

  const itemIds = [...new Set(loanReferences.map((loan) => String(loan.book_item_id)))];
  const itemPlaceholders = itemIds.map(() => '?').join(', ');
  const [references] = await connection.execute(
    `SELECT id, book_id FROM book_items
     WHERE school_id = ? AND id IN (${itemPlaceholders})
     ORDER BY book_id, id`,
    [schoolId, ...itemIds]
  );
  if (references.length !== itemIds.length) {
    return { status: 404, message: 'Sebagian eksemplar transaksi tidak ditemukan.' };
  }

  const bookIds = [...new Set(references.map((item) => String(item.book_id)))].sort();
  const bookPlaceholders = bookIds.map(() => '?').join(', ');
  const [books] = await connection.execute(
    `SELECT id FROM books WHERE school_id = ? AND id IN (${bookPlaceholders}) ORDER BY id FOR UPDATE`,
    [schoolId, ...bookIds]
  );
  if (books.length !== bookIds.length) {
    return { status: 404, message: 'Sebagian buku transaksi tidak ditemukan.' };
  }
  const [items] = await connection.execute(
    `SELECT id FROM book_items
     WHERE school_id = ? AND id IN (${itemPlaceholders}) ORDER BY id FOR UPDATE`,
    [schoolId, ...itemIds]
  );
  if (items.length !== itemIds.length) {
    return { status: 404, message: 'Sebagian eksemplar transaksi tidak ditemukan.' };
  }

  const [loans] = await connection.execute(
    `SELECT id, book_item_id, status, fine_amount
     FROM loans WHERE school_id = ? AND id IN (${placeholders}) FOR UPDATE`,
    [schoolId, ...ids]
  );
  if (loans.length !== ids.length) {
    return { status: 404, message: 'Sebagian transaksi tidak ditemukan di sekolah ini.' };
  }
  if (finesOnly && loans.some((loan) => loan.status !== 'Returned' || Number(loan.fine_amount) <= 0)) {
    return { status: 409, message: 'Sebagian transaksi bukan denda yang dapat dihapus.' };
  }

  const [deleted] = await connection.execute(
    `DELETE FROM loans WHERE school_id = ? AND id IN (${placeholders})`,
    [schoolId, ...ids]
  );
  const borrowedItemIds = [...new Set(loans
    .filter((loan) => loan.status === 'Borrowed')
    .map((loan) => String(loan.book_item_id)))];
  if (borrowedItemIds.length) {
    await connection.execute(
      `UPDATE book_items SET status = 'Tersedia'
       WHERE school_id = ? AND id IN (${borrowedItemIds.map(() => '?').join(', ')})
         AND status = 'Dipinjam'
         AND NOT EXISTS (
           SELECT 1 FROM loans active_loan
           WHERE active_loan.school_id = book_items.school_id
             AND active_loan.book_item_id = book_items.id
             AND active_loan.status IN ('Pending', 'Borrowed')
         )`,
      [schoolId, ...borrowedItemIds]
    );
  }
  return { deleted: deleted.affectedRows };
}

async function deleteLoanBatch(req, res, next, finesOnly = false) {
  const rawIds = req.body?.ids;
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 500) {
    return res.status(400).json({ message: 'Pilih 1 sampai 500 transaksi untuk dihapus.' });
  }
  const ids = [...new Set(rawIds.map(String))];
  if (ids.some((id) => !validId(id))) {
    return res.status(400).json({ message: 'Daftar ID transaksi tidak valid.' });
  }
  if (!roleCanManageLoans(req)) {
    return res.status(403).json({ message: 'Anggota tidak dapat menghapus transaksi perpustakaan.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await removeLoanRows(connection, req.school.id, ids, finesOnly);
    if (result.status) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(result.status).json({ message: result.message });
    }
    await connection.commit();
    transactionStarted = false;
    return res.json({
      deleted: result.deleted,
      message: finesOnly
        ? `${result.deleted} transaksi denda beserta riwayat pembayarannya berhasil dihapus.`
        : `${result.deleted} transaksi peminjaman berhasil dihapus.`
    });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        return next(error);
      }
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
}

router.get('/members', requireSchoolPermission('circulation.loans', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search.length > 100) return res.status(400).json({ message: 'Pencarian anggota maksimal 100 karakter.' });

  try {
    if (req.school.role === 'member') {
      const [members] = await pool.execute(
        `SELECT id, name, nis_nisn, member_code, role FROM users
         WHERE id = ? AND school_id = ? AND status = 'active' AND role = 'member' AND is_library_member = 1
         LIMIT 1`,
        [req.school.userId, req.school.id]
      );
      return res.json({ members });
    }

    const [members] = await pool.execute(
      `SELECT id, name, nis_nisn, member_code, role FROM users
       WHERE school_id = ? AND role = 'member' AND is_library_member = 1 AND status = 'active'
         AND (? = '' OR name LIKE ? OR nis_nisn LIKE ? OR member_code LIKE ?)
       ORDER BY name ASC
       LIMIT 20`,
      [req.school.id, search, `%${search}%`, `%${search}%`, `%${search}%`]
    );
    return res.json({ members });
  } catch (error) {
    return next(error);
  }
});

router.get('/items', requireSchoolPermission('circulation.loans', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search.length > 100) return res.status(400).json({ message: 'Pencarian eksemplar maksimal 100 karakter.' });

  try {
    const [items] = await pool.execute(
      `SELECT bi.id, bi.book_id, bi.serial_number, bi.barcode_value, b.title AS book_title,
              b.kode_buku, b.nomor_induk,
              (SELECT COUNT(*) FROM book_items available
               WHERE available.school_id = bi.school_id AND available.book_id = bi.book_id
                 AND available.status = 'Tersedia'
                 AND NOT EXISTS (
                   SELECT 1 FROM loans active_loan
                   WHERE active_loan.school_id = available.school_id
                     AND active_loan.book_item_id = available.id
                     AND active_loan.status IN ('Pending', 'Borrowed')
                 )) AS available_count
       FROM book_items bi
       JOIN books b ON b.school_id = bi.school_id AND b.id = bi.book_id
       WHERE bi.school_id = ? AND bi.status = 'Tersedia'
         AND (? = '' OR b.title LIKE ? OR bi.serial_number LIKE ? OR bi.barcode_value LIKE ?
              OR b.kode_buku LIKE ? OR b.nomor_induk LIKE ?)
         AND NOT EXISTS (
           SELECT 1 FROM loans l
           WHERE l.school_id = bi.school_id AND l.book_item_id = bi.id
             AND l.status IN ('Pending', 'Borrowed')
         )
       ORDER BY CASE WHEN bi.barcode_value = ? OR bi.serial_number = ? THEN 0 ELSE 1 END,
                b.title ASC, bi.serial_number ASC
       LIMIT 20`,
      [req.school.id, search, ...Array(5).fill(`%${search}%`), search, search]
    );
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
});

router.get('/fines/rule', requireSchoolPermission('circulation.fines', 'view'), async (req, res, next) => {
  try {
    const settings = await readLibrarySettings(req.school.id);
    return res.json({
      finePerDay: Number(settings.fine_per_day),
      automaticFines: settings.automatic_fines === '1'
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/fines/rule', requireSchoolPermission('circulation.fines', 'edit'), async (req, res, next) => {
  const finePerDay = Number(req.body?.finePerDay);
  if (!Number.isSafeInteger(finePerDay) || finePerDay < 0 || finePerDay > 1000000) {
    return res.status(400).json({ message: 'Tarif denda harus berupa bilangan bulat antara Rp0 dan Rp1.000.000 per hari.' });
  }

  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO school_settings (school_id, \`key\`, \`value\`)
         VALUES (?, 'fine_per_day', ?)
         ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
        [req.school.id, String(finePerDay)]
      );
      await connection.execute(
        'UPDATE tenants_schools SET fine_per_day = ? WHERE id = ?',
        [finePerDay, req.school.id]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return res.json({ finePerDay, message: 'Tarif denda per hari berhasil diperbarui.' });
  } catch (error) {
    return next(error);
  }
});

router.get('/fines', requireSchoolPermission('circulation.fines', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const page = parsePageValue(req.query.page, 1, 1000000);
  const limit = parsePageValue(req.query.limit, 25, 100);
  if (search.length > 100) return res.status(400).json({ message: 'Kata pencarian maksimal 100 karakter.' });
  if (!page || !limit) return res.status(400).json({ message: 'Halaman atau jumlah data tidak valid.' });
  if (!['', 'unpaid', 'paid', 'waived'].includes(status)) {
    return res.status(400).json({ message: 'Filter status pembayaran denda tidak valid.' });
  }

  const conditions = [
    'l.school_id = ?',
    "l.status = 'Returned'",
    'l.fine_amount > 0'
  ];
  const values = [req.school.id];
  if (status) {
    conditions.push('l.fine_status = ?');
    values.push(status);
  }
  if (search) {
    conditions.push(`(
      CAST(l.id AS CHAR) LIKE ? OR u.name LIKE ? OR COALESCE(u.nis_nisn, '') LIKE ?
      OR b.title LIKE ?
    )`);
    values.push(...Array(4).fill(`%${search}%`));
  }

  const from = `FROM loans l
    JOIN users u ON u.school_id = l.school_id AND u.id = l.user_id
    JOIN book_items bi ON bi.school_id = l.school_id AND bi.id = l.book_item_id
    JOIN books b ON b.school_id = bi.school_id AND b.id = bi.book_id
    LEFT JOIN loan_fine_payments fp ON fp.school_id = l.school_id AND fp.loan_id = l.id
    LEFT JOIN users payer ON payer.school_id = l.school_id AND payer.id = fp.paid_by`;
  const where = conditions.join(' AND ');

  try {
    const [[count], [rows], settings] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, values),
      pool.execute(
        `SELECT l.id, u.name AS member_name, u.nis_nisn, b.title AS book_title,
                l.due_date, l.return_date,
                GREATEST(DATEDIFF(COALESCE(l.return_date, CURRENT_DATE), l.due_date), 0) AS days_late,
                l.fine_amount, l.fine_status,
                fp.amount AS paid_amount, fp.payment_method, fp.note AS payment_note,
                fp.paid_at, payer.name AS paid_by
         ${from}
         WHERE ${where}
         ORDER BY FIELD(l.fine_status, 'unpaid', 'paid', 'waived'), l.return_date DESC, l.id DESC
         LIMIT ? OFFSET ?`,
        [...values, limit, (page - 1) * limit]
      ),
      readLibrarySettings(req.school.id)
    ]);
    const total = Number(count.total);
    return res.json({
      fines: rows.map((row) => ({
        id: String(row.id),
        member_name: row.member_name,
        nis_nisn: row.nis_nisn,
        book_title: row.book_title,
        due_date: row.due_date,
        return_date: row.return_date,
        days_late: Number(row.days_late),
        fine_amount: Number(row.fine_amount),
        fine_status: row.fine_status,
        payment: row.paid_at ? {
          amount: Number(row.paid_amount),
          method: row.payment_method,
          note: row.payment_note,
          paid_at: row.paid_at,
          paid_by: row.paid_by
        } : null
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      finePerDay: Number(settings.fine_per_day)
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/fines/bulk', requireSchoolPermission('circulation.fines', 'delete'), (req, res, next) => (
  deleteLoanBatch(req, res, next, true)
));

router.get('/', requireSchoolPermission('circulation.loans', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const page = parsePageValue(req.query.page, 1, 1000000);
  const limit = parsePageValue(req.query.limit, 25, 100);
  const validStatuses = ['', 'Pending', 'Dipinjam', 'Terlambat', 'Dikembalikan', 'Ditolak'];

  if (search.length > 100) return res.status(400).json({ message: 'Kata pencarian maksimal 100 karakter.' });
  if (!page || !limit) return res.status(400).json({ message: 'Halaman atau jumlah data tidak valid.' });
  if (!validStatuses.includes(status)) return res.status(400).json({ message: 'Filter status peminjaman tidak valid.' });

  const conditions = ['l.school_id = ?'];
  const values = [req.school.id];
  if (req.school.role === 'member') {
    conditions.push('l.user_id = ?');
    values.push(req.school.userId);
  }
  if (search) {
    conditions.push(`(
      CAST(l.id AS CHAR) LIKE ? OR u.name LIKE ? OR COALESCE(u.nis_nisn, '') LIKE ?
      OR b.title LIKE ? OR bi.serial_number LIKE ?
    )`);
    values.push(...Array(5).fill(`%${search}%`));
  }
  if (status === 'Pending') conditions.push("l.status = 'Pending'");
  if (status === 'Dipinjam') conditions.push("l.status = 'Borrowed' AND l.due_date >= CURRENT_DATE");
  if (status === 'Terlambat') conditions.push("l.status = 'Borrowed' AND l.due_date < CURRENT_DATE");
  if (status === 'Dikembalikan') conditions.push("l.status = 'Returned'");
  if (status === 'Ditolak') conditions.push("l.status = 'Rejected'");

  const from = `FROM loans l
    JOIN users u ON u.school_id = l.school_id AND u.id = l.user_id
    JOIN book_items bi ON bi.school_id = l.school_id AND bi.id = l.book_item_id
    JOIN books b ON b.school_id = bi.school_id AND b.id = bi.book_id`;
  const where = conditions.join(' AND ');

  try {
    const settings = await readLibrarySettings(req.school.id);
    const finePerDay = Number(settings.fine_per_day);
    const loanDurationDays = Number(settings.loan_duration_days);
    const [[count]] = await pool.execute(
      `SELECT COUNT(*) AS total ${from} WHERE ${where}`,
      values
    );
    const offset = (page - 1) * limit;
    const [rows] = await pool.execute(
      `SELECT l.id, l.user_id, u.name AS member_name, u.nis_nisn,
              b.title AS book_title, bi.serial_number,
              l.borrow_date, l.due_date, l.return_date,
              l.renewal_count,
              CASE
                WHEN l.status = 'Borrowed' AND l.due_date < CURRENT_DATE THEN 'Terlambat'
                WHEN l.status = 'Borrowed' THEN 'Dipinjam'
                WHEN l.status = 'Returned' THEN 'Dikembalikan'
                WHEN l.status = 'Rejected' THEN 'Ditolak'
                ELSE l.status
              END AS display_status,
              l.fine_amount, l.fine_status,
              CASE
                WHEN l.status = 'Borrowed' AND l.due_date < CURRENT_DATE
                  THEN DATEDIFF(CURRENT_DATE, l.due_date) * ?
                ELSE l.fine_amount
              END AS display_fine
       ${from}
       WHERE ${where}
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT ? OFFSET ?`,
      [finePerDay, ...values, limit, offset]
    );
    return res.json({
      loans: rows.map(loanRecord),
      pagination: {
        page,
        limit,
        total: Number(count.total),
        totalPages: Math.ceil(Number(count.total) / limit)
      },
      finePerDay,
      loanDurationDays,
      renewalsEnabled: settings.renewals_enabled === '1',
      maxRenewals: Number(settings.max_renewals)
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/bulk', requireSchoolPermission('circulation.loans', 'delete'), (req, res, next) => (
  deleteLoanBatch(req, res, next)
));

router.post('/', requireSchoolPermission('circulation.loans', 'edit'), async (req, res, next) => {
  const bookItemId = String(req.body?.bookItemId ?? '');
  const quantity = req.body?.quantity == null ? 1 : Number(req.body.quantity);
  const requestedDuration = req.body?.durationDays == null ? null : Number(req.body.durationDays);
  const userId = req.school.role === 'member'
    ? String(req.school.userId)
    : String(req.body?.userId ?? '');
  if (!validId(bookItemId) || !validId(userId)) {
    return res.status(400).json({ message: 'Pilih anggota dan eksemplar buku yang valid.' });
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
    return res.status(400).json({ message: 'Jumlah peminjaman harus antara 1 dan 100 eksemplar.' });
  }
  if (requestedDuration != null && (!Number.isSafeInteger(requestedDuration) || requestedDuration < 1 || requestedDuration > 365)) {
    return res.status(400).json({ message: 'Durasi peminjaman harus antara 1 sampai 365 hari.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [members] = await connection.execute(
      `SELECT id, name, role, status, is_library_member FROM users
       WHERE id = ? AND school_id = ? FOR UPDATE`,
      [userId, req.school.id]
    );
    const member = members[0];
    if (!member || member.role !== 'member' || !member.is_library_member || member.status !== 'active') {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Anggota aktif tidak ditemukan di sekolah ini.' });
    }

    const item = await lockBookAndCopy(connection, req.school.id, bookItemId);
    if (!item) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Eksemplar tidak ditemukan di sekolah ini.' });
    }
    if (item.status !== 'Tersedia') {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Eksemplar buku tidak tersedia untuk dipinjam.' });
    }

    const [availableItems] = await connection.execute(
      `SELECT bi.id FROM book_items bi
       WHERE bi.school_id = ? AND bi.book_id = ? AND bi.status = 'Tersedia'
         AND NOT EXISTS (
           SELECT 1 FROM loans l
           WHERE l.school_id = bi.school_id AND l.book_item_id = bi.id
             AND l.status IN ('Pending', 'Borrowed')
         )
       ORDER BY (bi.id = ?) DESC, bi.id ASC
       LIMIT ? FOR UPDATE`,
      [req.school.id, item.book_id, bookItemId, quantity]
    );
    if (availableItems.length < quantity) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: `Jumlah buku yang tersedia tidak cukup. Hanya ${availableItems.length} eksemplar yang tersedia.` });
    }

    const settings = await readLibrarySettings(req.school.id, connection);
    const maximumLoans = Number(settings.max_loans_per_member);
    const loanDurationDays = requestedDuration || Number(settings.loan_duration_days);
    const [memberLoans] = await connection.execute(
      `SELECT COUNT(*) AS total FROM loans
       WHERE school_id = ? AND user_id = ? AND status IN ('Pending', 'Borrowed')`,
      [req.school.id, userId]
    );
    if (Number(memberLoans[0].total) + quantity > maximumLoans) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({
        message: `Jumlah peminjaman melampaui batas maksimal ${maximumLoans} buku aktif per anggota.`
      });
    }

    const loanStatus = req.school.role === 'member' ? 'Pending' : 'Borrowed';
    const placeholders = availableItems
      .map(() => `(?, ?, ?, CURRENT_DATE, DATE_ADD(CURRENT_DATE, INTERVAL ${loanDurationDays} DAY), ?)`)
      .join(', ');
    const loanValues = availableItems.flatMap((availableItem) => [
      req.school.id, availableItem.id, userId, loanStatus
    ]);
    const [result] = await connection.execute(
      `INSERT INTO loans
       (school_id, book_item_id, user_id, borrow_date, due_date, status)
       VALUES ${placeholders}`,
      loanValues
    );
    if (loanStatus === 'Borrowed') {
      const itemIds = availableItems.map((availableItem) => String(availableItem.id));
      await connection.execute(
        `UPDATE book_items SET status = 'Dipinjam'
         WHERE school_id = ? AND status = 'Tersedia' AND id IN (${itemIds.map(() => '?').join(', ')})`,
        [req.school.id, ...itemIds]
      );
    }

    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({
      count: quantity,
      firstLoanId: String(result.insertId),
      message: loanStatus === 'Pending'
        ? `${quantity} permintaan peminjaman dikirim dan menunggu persetujuan petugas.`
        : `${quantity} eksemplar berhasil dicatat sebagai peminjaman dengan durasi ${loanDurationDays} hari.`
    });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        return next(error);
      }
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/:id/status', requireSchoolPermission('circulation.loans', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  const status = req.body?.status;
  if (!validId(id)) return res.status(400).json({ message: 'ID peminjaman tidak valid.' });
  if (!['Borrowed', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status permintaan harus Dipinjam atau Ditolak.' });
  }
  if (!roleCanManageLoans(req)) {
    return res.status(403).json({ message: 'Anggota tidak dapat menyetujui atau menolak permintaan peminjaman.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [references] = await connection.execute(
      'SELECT book_item_id FROM loans WHERE id = ? AND school_id = ? LIMIT 1',
      [id, req.school.id]
    );
    if (!references[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Transaksi peminjaman tidak ditemukan.' });
    }
    const item = await lockBookAndCopy(connection, req.school.id, references[0].book_item_id);
    if (!item) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Eksemplar buku tidak ditemukan.' });
    }

    const [loans] = await connection.execute(
      'SELECT id, book_item_id, status FROM loans WHERE id = ? AND school_id = ? FOR UPDATE',
      [id, req.school.id]
    );
    const loan = loans[0];
    if (!loan || loan.status !== 'Pending') {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Hanya permintaan Pending yang dapat diproses.' });
    }
    if (status === 'Borrowed') {
      if (item.status !== 'Tersedia') {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({ message: 'Eksemplar sudah tidak tersedia.' });
      }
      const [otherActiveLoans] = await connection.execute(
        `SELECT id FROM loans
         WHERE school_id = ? AND book_item_id = ? AND id <> ?
           AND status IN ('Pending', 'Borrowed')
         LIMIT 1`,
        [req.school.id, loan.book_item_id, id]
      );
      if (otherActiveLoans.length) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({ message: 'Eksemplar sudah diproses pada transaksi lain.' });
      }
      await connection.execute(
        `UPDATE book_items SET status = 'Dipinjam'
         WHERE id = ? AND school_id = ? AND status = 'Tersedia'`,
        [loan.book_item_id, req.school.id]
      );
    }
    await connection.execute(
      'UPDATE loans SET status = ? WHERE id = ? AND school_id = ?',
      [status, id, req.school.id]
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({ loan: { id, status }, message: status === 'Borrowed' ? 'Permintaan disetujui.' : 'Permintaan ditolak.' });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        return next(error);
      }
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.post('/:id/renew', requireSchoolPermission('circulation.loans', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID peminjaman tidak valid.' });
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [references] = await connection.execute(
      'SELECT book_item_id FROM loans WHERE id = ? AND school_id = ? LIMIT 1',
      [id, req.school.id]
    );
    if (!references[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Transaksi peminjaman tidak ditemukan.' });
    }
    const item = await lockBookAndCopy(connection, req.school.id, references[0].book_item_id);
    if (!item) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Eksemplar buku tidak ditemukan.' });
    }
    const [loans] = await connection.execute(
      `SELECT id, user_id, due_date, status, renewal_count,
              (due_date < CURRENT_DATE) AS is_overdue
       FROM loans WHERE id = ? AND school_id = ? FOR UPDATE`,
      [id, req.school.id]
    );
    const loan = loans[0];
    if (!loan || loan.status !== 'Borrowed' || item.status !== 'Dipinjam') {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Hanya peminjaman aktif yang dapat diperpanjang.' });
    }
    if (req.school.role === 'member' && String(loan.user_id) !== String(req.school.userId)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Transaksi peminjaman tidak ditemukan.' });
    }
    if (Boolean(loan.is_overdue)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Peminjaman yang sudah terlambat tidak dapat diperpanjang.' });
    }
    const settings = await readLibrarySettings(req.school.id, connection);
    const maxRenewals = Number(settings.max_renewals);
    const loanDurationDays = Number(settings.loan_duration_days);
    if (settings.renewals_enabled !== '1' || maxRenewals < 1) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Perpanjangan masa pinjam tidak diaktifkan.' });
    }
    if (Number(loan.renewal_count) >= maxRenewals) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: `Batas ${maxRenewals} kali perpanjangan sudah tercapai.` });
    }
    const [reservations] = await connection.execute(
      `SELECT id FROM book_reservations
       WHERE school_id = ? AND book_id = ? AND status = 'Active'
         AND user_id <> ? LIMIT 1`,
      [req.school.id, item.book_id, loan.user_id]
    );
    if (reservations.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Buku memiliki antrean booking aktif dan tidak dapat diperpanjang.' });
    }
    await connection.execute(
      `UPDATE loans
       SET due_date = DATE_ADD(due_date, INTERVAL ${loanDurationDays} DAY),
           renewal_count = renewal_count + 1
       WHERE id = ? AND school_id = ?`,
      [id, req.school.id]
    );
    const [updated] = await connection.execute(
      'SELECT due_date, renewal_count FROM loans WHERE id = ? AND school_id = ? LIMIT 1',
      [id, req.school.id]
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({
      loan: { id, dueDate: updated[0].due_date, renewalCount: Number(updated[0].renewal_count) },
      message: 'Masa pinjam berhasil diperpanjang.'
    });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        return next(error);
      }
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.post('/:id/return', requireSchoolPermission('circulation.loans', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID peminjaman tidak valid.' });
  if (!roleCanManageLoans(req)) {
    return res.status(403).json({ message: 'Anggota tidak dapat memproses pengembalian.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [references] = await connection.execute(
      'SELECT book_item_id FROM loans WHERE id = ? AND school_id = ? LIMIT 1',
      [id, req.school.id]
    );
    if (!references[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Transaksi peminjaman tidak ditemukan.' });
    }
    const item = await lockBookAndCopy(connection, req.school.id, references[0].book_item_id);
    if (!item) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Eksemplar buku tidak ditemukan.' });
    }

    const [loans] = await connection.execute(
      `SELECT id, book_item_id, status, due_date,
              GREATEST(DATEDIFF(CURRENT_DATE, due_date), 0) AS days_late
       FROM loans WHERE id = ? AND school_id = ? FOR UPDATE`,
      [id, req.school.id]
    );
    const loan = loans[0];
    if (!loan || loan.status !== 'Borrowed') {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Hanya transaksi berstatus Dipinjam yang dapat dikembalikan.' });
    }
    if (item.status !== 'Dipinjam') {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Status eksemplar tidak sesuai dengan transaksi peminjaman.' });
    }

    const settings = await readLibrarySettings(req.school.id, connection);
    const finePerDay = Number(settings.fine_per_day);
    const daysLate = Number(loan.days_late);
    const fineAmount = settings.automatic_fines === '1' ? daysLate * finePerDay : 0;
    const fineStatus = fineAmount > 0 ? 'unpaid' : 'waived';
    await connection.execute(
      `UPDATE loans
       SET status = 'Returned', return_date = CURRENT_DATE, fine_amount = ?, fine_status = ?
       WHERE id = ? AND school_id = ?`,
      [fineAmount, fineStatus, id, req.school.id]
    );
    await connection.execute(
      `UPDATE book_items SET status = 'Tersedia'
       WHERE id = ? AND school_id = ? AND status = 'Dipinjam'`,
      [loan.book_item_id, req.school.id]
    );
    const [waitingReservations] = await connection.execute(
      `SELECT br.id, br.user_id
       FROM book_reservations br
       WHERE br.school_id = ? AND br.book_id = ? AND br.status = 'Active'
         AND br.ready_notified_at IS NULL
       ORDER BY br.reservation_date ASC, br.id ASC
       LIMIT 1 FOR UPDATE`,
      [req.school.id, item.book_id]
    );
    if (waitingReservations[0]) {
      const reservation = waitingReservations[0];
      await connection.execute(
        `UPDATE book_reservations
         SET ready_notified_at = NOW(), expired_date = DATE_ADD(NOW(), INTERVAL 2 DAY)
         WHERE id = ? AND school_id = ? AND status = 'Active'`,
        [reservation.id, req.school.id]
      );
      await connection.execute(
        `INSERT IGNORE INTO school_notifications
         (school_id, user_id, type, title, message, link, dedupe_key)
         VALUES (?, ?, 'reservation_ready', 'Buku booking Anda tersedia',
                 'Buku yang Anda booking sudah tersedia. Silakan ambil dalam 2 hari.',
                 '/reservations', ?)`,
        [req.school.id, reservation.user_id, `reservation:${reservation.id}`]
      );
    }
    await connection.commit();
    transactionStarted = false;
    return res.json({
      loan: { id, status: 'Returned', daysLate, fineAmount, fineStatus },
      message: daysLate > 0
        ? `Buku berhasil dikembalikan. Denda ${daysLate} hari: Rp${fineAmount.toLocaleString('id-ID')}.`
        : 'Buku berhasil dikembalikan tepat waktu.'
    });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        return next(error);
      }
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/:id/fine-status', requireSchoolPermission('circulation.fines', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  const fineStatus = req.body?.status;
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  if (!validId(id)) return res.status(400).json({ message: 'ID peminjaman tidak valid.' });
  if (!['paid', 'waived'].includes(fineStatus)) {
    return res.status(400).json({ message: 'Status denda harus dibayar atau dibebaskan.' });
  }
  if (req.body?.note != null && typeof req.body.note !== 'string') {
    return res.status(400).json({ message: 'Catatan pembayaran harus berupa teks.' });
  }
  if (note.length > 500) return res.status(400).json({ message: 'Catatan pembayaran maksimal 500 karakter.' });
  if (!roleCanManageLoans(req)) {
    return res.status(403).json({ message: 'Anggota tidak dapat mengubah status pembayaran denda.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [loans] = await connection.execute(
      `SELECT id, fine_amount, fine_status FROM loans
       WHERE id = ? AND school_id = ? AND status = 'Returned' FOR UPDATE`,
      [id, req.school.id]
    );
    const loan = loans[0];
    if (!loan) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Transaksi peminjaman tidak ditemukan.' });
    }
    if (Number(loan.fine_amount) <= 0 || loan.fine_status !== 'unpaid') {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Denda tidak ada atau statusnya sudah diproses.' });
    }

    if (fineStatus === 'paid') {
      await connection.execute(
        `INSERT INTO loan_fine_payments
         (school_id, loan_id, paid_by, amount, payment_method, note)
         VALUES (?, ?, ?, ?, 'cash', ?)`,
        [req.school.id, id, req.school.userId, loan.fine_amount, note || null]
      );
    }
    await connection.execute(
      `UPDATE loans SET fine_status = ?
       WHERE id = ? AND school_id = ? AND fine_status = 'unpaid'`,
      [fineStatus, id, req.school.id]
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({
      loan: { id, fineStatus },
      message: fineStatus === 'paid' ? 'Pembayaran denda berhasil dicatat dan ditandai lunas.' : 'Denda berhasil dibebaskan.'
    });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        return next(error);
      }
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

export default router;
