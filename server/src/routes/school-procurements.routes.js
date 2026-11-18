import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';

const router = Router();
const maximumNotesLength = 5000;
const sortColumns = {
  title: 'p.title',
  date: 'p.request_date',
  status: 'CAST(p.status AS CHAR)',
  requester: 'u.name'
};

function parsePageValue(raw, fallback, maximum) {
  if (raw == null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) return null;
  return value;
}

function normalizeRequestDate(value) {
  if (value == null || value === '') return { value: null };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { error: 'Tanggal pengajuan harus menggunakan format YYYY-MM-DD.' };
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || Number.isNaN(parsed.getTime())
      || parsed.getUTCFullYear() !== year
      || parsed.getUTCMonth() !== month - 1
      || parsed.getUTCDate() !== day) {
    return { error: 'Tanggal pengajuan tidak valid.' };
  }
  return { value };
}

function requireProcurementReviewer(req, res, next) {
  if (!['admin', 'kapus'].includes(req.school.role)) {
    return res.status(403).json({ message: 'Hanya Admin atau Kepala Perpustakaan yang dapat memvalidasi usulan.' });
  }
  return next();
}

async function findOrCreateCategory(connection, schoolId, type, rawName) {
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name) return null;
  const [categories] = await connection.execute(
    `SELECT id FROM master_categories
     WHERE school_id = ? AND type = ? AND name = ?
     ORDER BY id LIMIT 1`,
    [schoolId, type, name]
  );
  if (categories[0]) return categories[0].id;

  const [result] = await connection.execute(
    `INSERT INTO master_categories (school_id, type, code, name, status)
     VALUES (?, ?, NULL, ?, 'active')`,
    [schoolId, type, name]
  );
  return result.insertId;
}

router.get('/', requireSchoolPermission('procurements', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const page = parsePageValue(req.query.page, 1, 1000000);
  const limit = parsePageValue(req.query.limit, 25, 100);
  const sort = req.query.sort == null ? 'date' : req.query.sort;
  const direction = req.query.direction == null ? 'desc' : req.query.direction;
  if (search.length > 100) return res.status(400).json({ message: 'Kata pencarian maksimal 100 karakter.' });
  if (!page || !limit) return res.status(400).json({ message: 'Halaman atau jumlah data tidak valid.' });
  if (status && !['Pending', 'Diterima', 'Ditolak'].includes(status)) {
    return res.status(400).json({ message: 'Filter status pengadaan tidak valid.' });
  }
  if (!Object.prototype.hasOwnProperty.call(sortColumns, sort) || !['asc', 'desc'].includes(direction)) {
    return res.status(400).json({ message: 'Pengurutan data pengadaan tidak valid.' });
  }

  const conditions = ['p.school_id = ?'];
  const values = [req.school.id];
  if (status) {
    conditions.push('p.status = ?');
    values.push(status);
  }
  if (search) {
    conditions.push('(p.title LIKE ? OR p.author LIKE ? OR p.publisher LIKE ? OR p.notes LIKE ? OR p.review_notes LIKE ? OR u.name LIKE ?)');
    values.push(...Array(6).fill(`%${search}%`));
  }

  try {
    const where = conditions.join(' AND ');
    const from = `FROM procurements p
      JOIN users u ON u.id = p.user_id AND u.school_id = p.school_id`;
    const [[count]] = await pool.execute(
      `SELECT COUNT(*) AS total ${from} WHERE ${where}`,
      values
    );
    const offset = (page - 1) * limit;
    const orderDirection = direction.toUpperCase();
    const [requests] = await pool.execute(
      `SELECT p.id, p.title, p.author, p.publisher, p.\`year\`, p.quantity_needed,
              p.estimated_price, p.request_date, p.status, p.notes, p.review_notes,
              p.user_id, u.name AS requester, u.role AS requester_role
       ${from}
       WHERE ${where}
       ORDER BY ${sortColumns[sort]} ${orderDirection}, p.id DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    return res.json({
      requests,
      pagination: {
        page,
        limit,
        total: Number(count.total),
        totalPages: Math.ceil(Number(count.total) / limit)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/bulk', requireSchoolPermission('procurements', 'delete'), async (req, res, next) => {
  const rawIds = req.body?.ids;
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 500) {
    return res.status(400).json({ message: 'Pilih 1 sampai 500 usulan untuk dihapus.' });
  }
  const ids = [...new Set(rawIds.map(String))];
  if (ids.some((id) => !/^[1-9]\d*$/.test(id))) {
    return res.status(400).json({ message: 'Daftar ID usulan tidak valid.' });
  }
  try {
    const placeholders = ids.map(() => '?').join(', ');
    const [result] = await pool.execute(
      `DELETE FROM procurements
       WHERE school_id = ? AND id IN (${placeholders})`,
      [req.school.id, ...ids]
    );
    return res.json({
      deleted: result.affectedRows,
      message: `${result.affectedRows} usulan berhasil dihapus.`
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireSchoolPermission('procurements', 'edit'), async (req, res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ message: 'Data usulan pengadaan tidak valid.' });
  }
  const {
    title, author, publisher, year, quantityNeeded, estimatedPrice, requestDate, notes
  } = req.body;
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 255) {
    return res.status(400).json({ message: 'Judul buku wajib diisi maksimal 255 karakter.' });
  }
  if ((author != null && typeof author !== 'string') || (publisher != null && typeof publisher !== 'string')) {
    return res.status(400).json({ message: 'Pengarang dan penerbit harus berupa teks.' });
  }
  const normalizedAuthor = typeof author === 'string' ? author.trim() : '';
  const normalizedPublisher = typeof publisher === 'string' ? publisher.trim() : '';
  if (normalizedAuthor.length > 180 || normalizedPublisher.length > 180) {
    return res.status(400).json({ message: 'Pengarang dan penerbit maksimal 180 karakter.' });
  }
  if (year != null && year !== '' && !['string', 'number'].includes(typeof year)) {
    return res.status(400).json({ message: 'Tahun terbit harus berupa angka.' });
  }
  const normalizedYear = year == null || year === '' ? null : Number(year);
  if (normalizedYear != null && (!Number.isInteger(normalizedYear) || normalizedYear < 1000 || normalizedYear > 9999)) {
    return res.status(400).json({ message: 'Tahun terbit harus berupa tahun yang valid.' });
  }
  if (quantityNeeded != null && quantityNeeded !== '' && !['string', 'number'].includes(typeof quantityNeeded)) {
    return res.status(400).json({ message: 'Jumlah kebutuhan harus berupa angka.' });
  }
  const normalizedQuantity = quantityNeeded == null || quantityNeeded === '' ? 1 : Number(quantityNeeded);
  if (!Number.isSafeInteger(normalizedQuantity) || normalizedQuantity < 1 || normalizedQuantity > 10000) {
    return res.status(400).json({ message: 'Jumlah kebutuhan harus antara 1 dan 10000 eksemplar.' });
  }
  let normalizedEstimatedPrice = null;
  if (estimatedPrice != null && estimatedPrice !== '') {
    if (!['string', 'number'].includes(typeof estimatedPrice)) {
      return res.status(400).json({ message: 'Estimasi harga harus berupa angka.' });
    }
    normalizedEstimatedPrice = Number(estimatedPrice);
    if (!Number.isFinite(normalizedEstimatedPrice)
        || normalizedEstimatedPrice < 0
        || normalizedEstimatedPrice > 9999999999.99
        || Math.abs(normalizedEstimatedPrice * 100 - Math.round(normalizedEstimatedPrice * 100)) > 0.00001) {
      return res.status(400).json({ message: 'Estimasi harga tidak valid (maksimal dua angka desimal).' });
    }
  }
  if (notes != null && typeof notes !== 'string') {
    return res.status(400).json({ message: 'Alasan pengajuan harus berupa teks.' });
  }
  const normalizedNotes = typeof notes === 'string' ? notes.trim() : '';
  if (normalizedNotes.length > maximumNotesLength) {
    return res.status(400).json({ message: `Alasan pengajuan maksimal ${maximumNotesLength} karakter.` });
  }
  const normalizedDate = normalizeRequestDate(requestDate);
  if (normalizedDate.error) return res.status(400).json({ message: normalizedDate.error });

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [result] = await connection.execute(
      `INSERT INTO procurements
       (school_id, user_id, title, author, publisher, \`year\`, quantity_needed,
        estimated_price, request_date, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_DATE()), 'Pending', ?)`,
      [
        req.school.id,
        req.school.userId,
        title.trim(),
        normalizedAuthor || null,
        normalizedPublisher || null,
        normalizedYear,
        normalizedQuantity,
        normalizedEstimatedPrice,
        normalizedDate.value,
        normalizedNotes || null
      ]
    );
    const [[request]] = await connection.execute(
      `SELECT id, title, author, publisher, \`year\`, quantity_needed, estimated_price,
              request_date, status, notes, review_notes
       FROM procurements WHERE id = ? AND school_id = ?`,
      [result.insertId, req.school.id]
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({
      request: { ...request, id: String(request.id), user_id: String(req.school.userId), requester: req.school.userName }
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

router.patch('/:id', requireSchoolPermission('procurements', 'edit'), requireProcurementReviewer, async (req, res, next) => {
  const id = String(req.params.id);
  if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ message: 'ID usulan tidak valid.' });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ message: 'Data validasi pengadaan tidak valid.' });
  }
  const { status, addToCatalog = false } = req.body;
  const reviewNotes = Object.prototype.hasOwnProperty.call(req.body, 'reviewNotes')
    ? req.body.reviewNotes
    : req.body.notes;
  if (!['Pending', 'Diterima', 'Ditolak'].includes(status)) {
    return res.status(400).json({ message: 'Pilih status Pending, Diterima, atau Ditolak.' });
  }
  if (reviewNotes != null && typeof reviewNotes !== 'string') {
    return res.status(400).json({ message: 'Catatan peninjau harus berupa teks.' });
  }
  if (typeof addToCatalog !== 'boolean') {
    return res.status(400).json({ message: 'Pilihan penambahan ke katalog tidak valid.' });
  }
  const normalizedReviewNotes = typeof reviewNotes === 'string' ? reviewNotes.trim() : '';
  if (normalizedReviewNotes.length > maximumNotesLength) {
    return res.status(400).json({ message: `Catatan peninjau maksimal ${maximumNotesLength} karakter.` });
  }
  if (addToCatalog && status !== 'Diterima') {
    return res.status(400).json({ message: 'Usulan hanya dapat ditambahkan ke katalog setelah diterima.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.execute(
      `SELECT id, title, author, publisher, \`year\`, quantity_needed, estimated_price,
              request_date, status, notes, review_notes
       FROM procurements WHERE id = ? AND school_id = ? FOR UPDATE`,
      [id, req.school.id]
    );
    const request = rows[0];
    if (!request) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Usulan pengadaan tidak ditemukan.' });
    }

    let catalogBook = null;
    if (addToCatalog) {
      await connection.execute(
        'SELECT id FROM tenants_schools WHERE id = ? FOR UPDATE',
        [req.school.id]
      );
      const [existingBooks] = await connection.execute(
        'SELECT id FROM books WHERE school_id = ? AND title = ? ORDER BY id LIMIT 1 FOR UPDATE',
        [req.school.id, request.title]
      );
      if (existingBooks[0]) {
        catalogBook = { id: String(existingBooks[0].id), created: false };
      } else {
        const authorId = await findOrCreateCategory(connection, req.school.id, 'pengarang', request.author);
        const publisherId = await findOrCreateCategory(connection, req.school.id, 'penerbit', request.publisher);
        const [bookResult] = await connection.execute(
          `INSERT INTO books
           (school_id, title, author_id, publisher_id, \`year\`, price, source, qty)
           VALUES (?, ?, ?, ?, ?, ?, 'Usulan pengadaan', 0)`,
          [
            req.school.id,
            request.title,
            authorId,
            publisherId,
            request.year,
            request.estimated_price ?? 0
          ]
        );
        catalogBook = { id: String(bookResult.insertId), created: true };
      }
    }

    await connection.execute(
      'UPDATE procurements SET status = ?, review_notes = ? WHERE id = ? AND school_id = ?',
      [status, normalizedReviewNotes || null, id, req.school.id]
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({
      request: {
        id,
        title: request.title,
        author: request.author,
        publisher: request.publisher,
        year: request.year,
        quantity_needed: request.quantity_needed,
        estimated_price: request.estimated_price,
        request_date: request.request_date,
        status,
        notes: request.notes,
        review_notes: normalizedReviewNotes || null
      },
      catalogBook
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
