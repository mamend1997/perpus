import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';
import { readLibrarySettings } from '../utils/school-settings.js';

const router = Router();
const isMember = (req) => req.school.role === 'member';
const validId = (value) => /^[1-9]\d*$/.test(String(value ?? ''));
const validPage = (value, fallback, maximum) => {
  const parsed = value == null ? fallback : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
};

router.get('/notifications', requireSchoolPermission('reservations', 'view'), async (req, res, next) => {
  try {
    const [notifications] = await pool.execute(
      `SELECT id, type, title, message, link, read_at, created_at
       FROM school_notifications
       WHERE school_id = ? AND user_id = ? AND type <> 'announcement_dismissed'
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [req.school.id, req.school.userId]
    );
    return res.json({ notifications });
  } catch (error) {
    return next(error);
  }
});

router.post('/notifications/:id/read', requireSchoolPermission('reservations', 'view'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID notifikasi tidak valid.' });
  try {
    const [result] = await pool.execute(
      `UPDATE school_notifications SET read_at = COALESCE(read_at, NOW())
       WHERE id = ? AND school_id = ? AND user_id = ?`,
      [id, req.school.id, req.school.userId]
    );
    if (!result.affectedRows) {
      const [rows] = await pool.execute(
        'SELECT id FROM school_notifications WHERE id = ? AND school_id = ? AND user_id = ? LIMIT 1',
        [id, req.school.id, req.school.userId]
      );
      if (!rows[0]) return res.status(404).json({ message: 'Notifikasi tidak ditemukan.' });
    }
    return res.json({ message: 'Notifikasi ditandai telah dibaca.' });
  } catch (error) {
    return next(error);
  }
});

router.get('/books', requireSchoolPermission('reservations', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search.length > 100) return res.status(400).json({ message: 'Pencarian buku maksimal 100 karakter.' });
  try {
    const [books] = await pool.execute(
      `SELECT b.id, b.title, b.kode_buku, b.cover_image,
              (SELECT COUNT(*) FROM book_items available
               WHERE available.school_id = b.school_id AND available.book_id = b.id
                 AND available.status = 'Tersedia'
                 AND NOT EXISTS (
                   SELECT 1 FROM loans l
                   WHERE l.school_id = available.school_id AND l.book_item_id = available.id
                     AND l.status IN ('Pending', 'Borrowed')
                 )) AS available_count,
              (SELECT COUNT(*) FROM book_items total_items
               WHERE total_items.school_id = b.school_id AND total_items.book_id = b.id) AS total_count,
              (SELECT COUNT(*) FROM book_reservations br
               WHERE br.school_id = b.school_id AND br.book_id = b.id AND br.status = 'Active') AS active_reservations
       FROM books b
       WHERE b.school_id = ?
         AND (? = '' OR b.title LIKE ? OR b.kode_buku LIKE ? OR b.nomor_induk LIKE ?)
       ORDER BY b.title ASC
       LIMIT 50`,
      [req.school.id, search, `%${search}%`, `%${search}%`, `%${search}%`]
    );
    return res.json({
      books: books.map((book) => ({
        ...book,
        id: String(book.id),
        available_count: Number(book.available_count),
        total_count: Number(book.total_count)
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/', requireSchoolPermission('reservations', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const page = validPage(req.query.page, 1, 1000000);
  const limit = validPage(req.query.limit, 25, 100);
  if (search.length > 100) return res.status(400).json({ message: 'Pencarian maksimal 100 karakter.' });
  if (!page || !limit) return res.status(400).json({ message: 'Halaman atau jumlah data tidak valid.' });
  if (!['', 'Active', 'Fulfilled', 'Cancelled'].includes(status)) {
    return res.status(400).json({ message: 'Filter status booking tidak valid.' });
  }

  try {
    await pool.execute(
      `UPDATE book_reservations
       SET status = 'Cancelled'
       WHERE school_id = ? AND status = 'Active'
         AND expired_date IS NOT NULL AND expired_date <= NOW()`,
      [req.school.id]
    );

    const conditions = ['br.school_id = ?'];
    const values = [req.school.id];
    if (isMember(req)) {
      conditions.push('br.user_id = ?');
      values.push(req.school.userId);
    }
    if (status) {
      conditions.push('br.status = ?');
      values.push(status);
    }
    if (search) {
      conditions.push('(b.title LIKE ? OR u.name LIKE ? OR CAST(br.id AS CHAR) LIKE ?)');
      values.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const from = `FROM book_reservations br
      JOIN books b ON b.school_id = br.school_id AND b.id = br.book_id
      JOIN users u ON u.school_id = br.school_id AND u.id = br.user_id`;
    const where = conditions.join(' AND ');
    const [[count], [rows]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, values),
      pool.execute(
        `SELECT br.id, br.book_id, br.user_id, br.quantity, br.notes, br.reservation_date, br.status,
                br.expired_date, br.ready_notified_at, b.title AS book_title,
                b.cover_image, u.name AS member_name, u.nis_nisn
         ${from}
         WHERE ${where}
         ORDER BY FIELD(br.status, 'Active', 'Fulfilled', 'Cancelled'),
                  br.reservation_date DESC, br.id DESC
         LIMIT ? OFFSET ?`,
        [...values, limit, (page - 1) * limit]
      )
    ]);
    const total = Number(count.total);
    return res.json({
      reservations: rows.map((row) => ({ ...row, id: String(row.id), book_id: String(row.book_id), user_id: String(row.user_id) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/bulk', requireSchoolPermission('reservations', 'delete'), async (req, res, next) => {
  const rawIds = req.body?.ids;
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 500) {
    return res.status(400).json({ message: 'Pilih 1 sampai 500 booking untuk dihapus.' });
  }
  if (isMember(req)) return res.status(403).json({ message: 'Hanya petugas yang dapat menghapus booking.' });
  const ids = [...new Set(rawIds.map(String))];
  if (ids.some((id) => !validId(id))) {
    return res.status(400).json({ message: 'Daftar ID booking tidak valid.' });
  }
  try {
    const placeholders = ids.map(() => '?').join(', ');
    const [result] = await pool.execute(
      `DELETE FROM book_reservations
       WHERE school_id = ? AND id IN (${placeholders})`,
      [req.school.id, ...ids]
    );
    return res.json({
      deleted: result.affectedRows,
      message: `${result.affectedRows} booking berhasil dihapus.`
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireSchoolPermission('reservations', 'edit'), async (req, res, next) => {
  const bookId = String(req.body?.bookId ?? '');
  const quantity = req.body?.quantity == null ? 1 : Number(req.body.quantity);
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
  if (!validId(bookId)) return res.status(400).json({ message: 'Pilih buku yang valid.' });
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
    return res.status(400).json({ message: 'Jumlah booking harus antara 1 dan 100 eksemplar.' });
  }
  if (notes.length > 1000) return res.status(400).json({ message: 'Keterangan booking maksimal 1.000 karakter.' });

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [books] = await connection.execute(
      'SELECT id FROM books WHERE id = ? AND school_id = ? FOR UPDATE',
      [bookId, req.school.id]
    );
    if (!books[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Buku tidak ditemukan di sekolah ini.' });
    }
    const [members] = await connection.execute(
      `SELECT id FROM users
       WHERE id = ? AND school_id = ? AND role = 'member' AND is_library_member = 1 AND status = 'active'
       FOR UPDATE`,
      [req.school.userId, req.school.id]
    );
    if (!members[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(403).json({ message: 'Hanya anggota aktif yang dapat membuat booking.' });
    }
    const settings = await readLibrarySettings(req.school.id, connection);
    if (quantity > Number(settings.max_loans_per_member)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(400).json({
        message: `Jumlah booking tidak boleh melebihi batas maksimal ${settings.max_loans_per_member} buku per anggota.`
      });
    }
    const [existing] = await connection.execute(
      `SELECT id FROM book_reservations
       WHERE school_id = ? AND book_id = ? AND user_id = ? AND status = 'Active'
       LIMIT 1 FOR UPDATE`,
      [req.school.id, bookId, req.school.userId]
    );
    if (existing.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Anda sudah memiliki booking aktif untuk buku ini.' });
    }
    const [result] = await connection.execute(
      `INSERT INTO book_reservations (school_id, book_id, user_id, quantity, notes, status)
       VALUES (?, ?, ?, ?, ?, 'Active')`,
      [req.school.id, bookId, req.school.userId, quantity, notes || null]
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({
      reservation: { id: String(result.insertId), book_id: bookId, user_id: String(req.school.userId), quantity, notes: notes || null, status: 'Active' },
      message: 'Booking buku berhasil dibuat.'
    });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.post('/:id/cancel', requireSchoolPermission('reservations', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID booking tidak valid.' });
  try {
    const [result] = await pool.execute(
      `UPDATE book_reservations SET status = 'Cancelled'
       WHERE id = ? AND school_id = ? AND status = 'Active'
         AND (? = 0 OR user_id = ?)`,
      [id, req.school.id, isMember(req) ? 1 : 0, req.school.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Booking aktif tidak ditemukan atau tidak dapat dibatalkan.' });
    return res.json({ message: 'Booking berhasil dibatalkan.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/ready', requireSchoolPermission('reservations', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID booking tidak valid.' });
  if (isMember(req)) return res.status(403).json({ message: 'Hanya petugas yang dapat mengirim notifikasi ketersediaan.' });

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [references] = await connection.execute(
      'SELECT book_id FROM book_reservations WHERE id = ? AND school_id = ? LIMIT 1',
      [id, req.school.id]
    );
    if (!references[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Booking tidak ditemukan.' });
    }
    const [books] = await connection.execute(
      'SELECT id FROM books WHERE id = ? AND school_id = ? FOR UPDATE',
      [references[0].book_id, req.school.id]
    );
    if (!books[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Buku tidak ditemukan.' });
    }
    const [reservations] = await connection.execute(
      `SELECT id, book_id, user_id, quantity, status, ready_notified_at
       FROM book_reservations WHERE id = ? AND school_id = ? FOR UPDATE`,
      [id, req.school.id]
    );
    const reservation = reservations[0];
    if (!reservation || reservation.status !== 'Active') {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Hanya booking aktif yang dapat diberi notifikasi.' });
    }
    if (reservation.ready_notified_at) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Notifikasi ketersediaan sudah pernah dikirim untuk booking ini.' });
    }
    const [copies] = await connection.execute(
      `SELECT bi.id FROM book_items bi
       WHERE bi.school_id = ? AND bi.book_id = ? AND bi.status = 'Tersedia'
         AND NOT EXISTS (
           SELECT 1 FROM loans l WHERE l.school_id = bi.school_id
             AND l.book_item_id = bi.id AND l.status IN ('Pending', 'Borrowed')
         )
       ORDER BY bi.id LIMIT ? FOR UPDATE`,
      [req.school.id, reservation.book_id, reservation.quantity]
    );
    if (copies.length < Number(reservation.quantity)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: `Belum tersedia ${reservation.quantity} eksemplar untuk memenuhi booking.` });
    }
    await connection.execute(
      `UPDATE book_reservations
       SET ready_notified_at = NOW(), expired_date = DATE_ADD(NOW(), INTERVAL 2 DAY)
       WHERE id = ? AND school_id = ?`,
      [id, req.school.id]
    );
    await connection.execute(
      `INSERT IGNORE INTO school_notifications
       (school_id, user_id, type, title, message, link, dedupe_key)
       VALUES (?, ?, 'reservation_ready', 'Buku booking Anda tersedia',
               ?, 
               '/reservations', ?)`,
      [req.school.id, reservation.user_id, `Buku yang Anda booking (${reservation.quantity} eksemplar) sudah tersedia. Silakan ambil dalam 2 hari.`, `reservation:${reservation.id}`]
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({ message: 'Notifikasi ketersediaan berhasil dikirim.', expiresInDays: 2 });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.post('/:id/fulfill', requireSchoolPermission('reservations', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID booking tidak valid.' });
  if (isMember(req)) return res.status(403).json({ message: 'Hanya petugas yang dapat memenuhi booking.' });

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [references] = await connection.execute(
      'SELECT book_id FROM book_reservations WHERE id = ? AND school_id = ? LIMIT 1',
      [id, req.school.id]
    );
    if (!references[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Booking tidak ditemukan.' });
    }
    const [books] = await connection.execute(
      'SELECT id FROM books WHERE id = ? AND school_id = ? FOR UPDATE',
      [references[0].book_id, req.school.id]
    );
    if (!books[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Buku tidak ditemukan.' });
    }
    const [reservations] = await connection.execute(
      `SELECT id, book_id, user_id, quantity, status, ready_notified_at, expired_date,
              (expired_date > NOW()) AS is_unexpired
       FROM book_reservations WHERE id = ? AND school_id = ? FOR UPDATE`,
      [id, req.school.id]
    );
    const reservation = reservations[0];
    if (!reservation || reservation.status !== 'Active') {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Hanya booking aktif yang dapat dipenuhi.' });
    }
    if (!reservation.ready_notified_at || !reservation.is_unexpired) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Booking belum diberi notifikasi atau masa pengambilannya telah berakhir.' });
    }
    const [members] = await connection.execute(
      `SELECT id FROM users
       WHERE id = ? AND school_id = ? AND role = 'member' AND is_library_member = 1 AND status = 'active'
       FOR UPDATE`,
      [reservation.user_id, req.school.id]
    );
    if (!members[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Akun anggota booking tidak aktif.' });
    }
    const settings = await readLibrarySettings(req.school.id, connection);
    const [activeLoans] = await connection.execute(
      `SELECT COUNT(*) AS total FROM loans
       WHERE school_id = ? AND user_id = ? AND status IN ('Pending', 'Borrowed')`,
      [req.school.id, reservation.user_id]
    );
    const maxLoans = Number(settings.max_loans_per_member);
    if (Number(activeLoans[0].total) + Number(reservation.quantity) > maxLoans) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: `Jumlah booking melampaui batas maksimal ${maxLoans} peminjaman aktif per anggota.` });
    }
    const [items] = await connection.execute(
      `SELECT bi.id FROM book_items bi
       WHERE bi.school_id = ? AND bi.book_id = ? AND bi.status = 'Tersedia'
         AND NOT EXISTS (
           SELECT 1 FROM loans l WHERE l.school_id = bi.school_id
             AND l.book_item_id = bi.id AND l.status IN ('Pending', 'Borrowed')
         )
       ORDER BY bi.id LIMIT ? FOR UPDATE`,
      [req.school.id, reservation.book_id, reservation.quantity]
    );
    if (items.length < Number(reservation.quantity)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Eksemplar tersedia tidak cukup untuk memenuhi jumlah booking.' });
    }
    const loanPlaceholders = items.map(() => (
      `(?, ?, ?, CURRENT_DATE, DATE_ADD(CURRENT_DATE, INTERVAL ${Number(settings.loan_duration_days)} DAY), 'Borrowed')`
    )).join(', ');
    const loanValues = items.flatMap((item) => [req.school.id, item.id, reservation.user_id]);
    const [result] = await connection.execute(
      `INSERT INTO loans (school_id, book_item_id, user_id, borrow_date, due_date, status)
       VALUES ${loanPlaceholders}`,
      loanValues
    );
    const itemIds = items.map((item) => String(item.id));
    const [itemUpdate] = await connection.execute(
      `UPDATE book_items SET status = 'Dipinjam'
       WHERE school_id = ? AND status = 'Tersedia' AND id IN (${itemIds.map(() => '?').join(', ')})`,
      [req.school.id, ...itemIds]
    );
    if (itemUpdate.affectedRows !== items.length) throw new Error('Eksemplar berubah saat booking dipenuhi.');
    await connection.execute(
      `UPDATE book_reservations SET status = 'Fulfilled'
       WHERE id = ? AND school_id = ? AND status = 'Active'`,
      [id, req.school.id]
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({
      loan: {
        id: String(result.insertId),
        bookItemIds: itemIds,
        quantity: Number(reservation.quantity),
        status: 'Borrowed',
        dueInDays: Number(settings.loan_duration_days)
      },
      message: `Booking untuk ${reservation.quantity} eksemplar dipenuhi dan peminjaman berhasil dicatat.`
    });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

export default router;
