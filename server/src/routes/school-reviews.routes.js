import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';

const router = Router();
const isMember = (req) => req.school.role === 'member';
const validId = (value) => /^[1-9]\d*$/.test(String(value ?? ''));
const validPage = (value, fallback, maximum) => {
  const parsed = value == null ? fallback : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
};

router.get('/eligible-books', requireSchoolPermission('reviews', 'view'), async (req, res, next) => {
  if (!isMember(req)) return res.status(403).json({ message: 'Daftar buku yang dapat diulas hanya tersedia untuk anggota.' });
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search.length > 100) return res.status(400).json({ message: 'Pencarian buku maksimal 100 karakter.' });
  try {
    const [books] = await pool.execute(
      `SELECT b.id, b.title, MAX(l.return_date) AS last_returned_at
       FROM loans l
       JOIN book_items bi ON bi.school_id = l.school_id AND bi.id = l.book_item_id
       JOIN books b ON b.school_id = bi.school_id AND b.id = bi.book_id
       WHERE l.school_id = ? AND l.user_id = ? AND l.status = 'Returned'
         AND NOT EXISTS (
           SELECT 1 FROM book_reviews r
           WHERE r.school_id = l.school_id AND r.book_id = b.id AND r.user_id = l.user_id
         )
         AND (? = '' OR b.title LIKE ?)
       GROUP BY b.id, b.title
       ORDER BY last_returned_at DESC, b.title ASC
       LIMIT 100`,
      [req.school.id, req.school.userId, search, `%${search}%`]
    );
    return res.json({ books: books.map((book) => ({ ...book, id: String(book.id) })) });
  } catch (error) {
    return next(error);
  }
});

router.get('/', requireSchoolPermission('reviews', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const rating = req.query.rating == null || req.query.rating === '' ? '' : String(req.query.rating);
  const bookId = req.query.bookId == null || req.query.bookId === '' ? '' : String(req.query.bookId);
  const page = validPage(req.query.page, 1, 1000000);
  const limit = validPage(req.query.limit, 25, 100);
  if (search.length > 100) return res.status(400).json({ message: 'Pencarian maksimal 100 karakter.' });
  if (!page || !limit) return res.status(400).json({ message: 'Halaman atau jumlah data tidak valid.' });
  if (rating && !/^[1-5]$/.test(rating)) return res.status(400).json({ message: 'Filter rating harus bernilai 1 sampai 5.' });
  if (bookId && !validId(bookId)) return res.status(400).json({ message: 'ID buku tidak valid.' });

  const conditions = ['r.school_id = ?'];
  const values = [req.school.id];
  if (bookId) {
    conditions.push('r.book_id = ?');
    values.push(bookId);
  }
  if (rating) {
    conditions.push('r.rating = ?');
    values.push(rating);
  }
  if (search) {
    conditions.push('(b.title LIKE ? OR u.name LIKE ? OR r.review LIKE ?)');
    values.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const from = `FROM book_reviews r
    JOIN books b ON b.school_id = r.school_id AND b.id = r.book_id
    JOIN users u ON u.school_id = r.school_id AND u.id = r.user_id`;
  const where = conditions.join(' AND ');
  try {
    const [[count], [reviews], [aggregateRows]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, values),
      pool.execute(
        `SELECT r.id, r.book_id, r.user_id, r.rating, r.review, r.created_at,
                b.title AS book_title, u.name AS reviewer_name, u.rombel,
                EXISTS (
                  SELECT 1 FROM loans l
                  JOIN book_items bi ON bi.school_id = l.school_id AND bi.id = l.book_item_id
                  WHERE l.school_id = r.school_id AND l.user_id = r.user_id
                    AND bi.book_id = r.book_id AND l.status = 'Returned'
                ) AS verified
         ${from}
         WHERE ${where}
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT ? OFFSET ?`,
        [...values, limit, (page - 1) * limit]
      ),
      pool.execute(
        `SELECT COUNT(*) AS total, COALESCE(AVG(r.rating), 0) AS average_rating
         FROM book_reviews r
         WHERE r.school_id = ?${bookId ? ' AND r.book_id = ?' : ''}`,
        bookId ? [req.school.id, bookId] : [req.school.id]
      )
    ]);
    const total = Number(count.total);
    return res.json({
      reviews: reviews.map((review) => ({
        ...review,
        id: String(review.id),
        book_id: String(review.book_id),
        user_id: String(review.user_id),
        rating: Number(review.rating),
        verified: Boolean(review.verified)
      })),
      aggregate: {
        total: Number(aggregateRows[0].total),
        averageRating: Number(Number(aggregateRows[0].average_rating).toFixed(2))
      },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireSchoolPermission('reviews', 'edit'), async (req, res, next) => {
  if (!isMember(req)) return res.status(403).json({ message: 'Ulasan hanya dapat dikirim oleh anggota.' });
  const bookId = String(req.body?.bookId ?? '');
  const rating = Number(req.body?.rating);
  const review = typeof req.body?.review === 'string' ? req.body.review.trim() : '';
  if (!validId(bookId)) return res.status(400).json({ message: 'Pilih judul buku yang valid.' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating harus bernilai 1 sampai 5.' });
  }
  if (review.length > 2000) return res.status(400).json({ message: 'Ulasan maksimal 2.000 karakter.' });

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
    const [returnedLoans] = await connection.execute(
      `SELECT l.id FROM loans l
       JOIN book_items bi ON bi.school_id = l.school_id AND bi.id = l.book_item_id
       WHERE l.school_id = ? AND l.user_id = ? AND bi.book_id = ? AND l.status = 'Returned'
       LIMIT 1`,
      [req.school.id, req.school.userId, bookId]
    );
    if (!returnedLoans.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(403).json({ message: 'Ulasan dapat diberikan setelah Anda mengembalikan buku ini.' });
    }
    const [existing] = await connection.execute(
      'SELECT id FROM book_reviews WHERE school_id = ? AND book_id = ? AND user_id = ? LIMIT 1 FOR UPDATE',
      [req.school.id, bookId, req.school.userId]
    );
    if (existing.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Anda sudah pernah mengulas buku ini.' });
    }
    const [result] = await connection.execute(
      `INSERT INTO book_reviews (school_id, book_id, user_id, rating, review)
       VALUES (?, ?, ?, ?, ?)`,
      [req.school.id, bookId, req.school.userId, rating, review || null]
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({
      review: { id: String(result.insertId), book_id: bookId, rating, review: review || null, verified: true },
      message: 'Ulasan berhasil dikirim.'
    });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Anda sudah pernah mengulas buku ini.' });
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.delete('/:id', requireSchoolPermission('reviews', 'delete'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID ulasan tidak valid.' });
  if (isMember(req)) return res.status(403).json({ message: 'Hanya petugas yang dapat memoderasi ulasan.' });
  try {
    const [result] = await pool.execute(
      'DELETE FROM book_reviews WHERE id = ? AND school_id = ?',
      [id, req.school.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Ulasan tidak ditemukan.' });
    return res.json({ message: 'Ulasan berhasil dihapus.' });
  } catch (error) {
    return next(error);
  }
});

export default router;
