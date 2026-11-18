import { Router } from 'express';
import { pool } from '../config/database.js';

const router = Router();
const validSchoolCode = (value) => /^[A-Z0-9]{4}$/.test(value);

function availabilityQuery() {
  return `(
    SELECT COUNT(*)
    FROM book_items bi
    WHERE bi.school_id = b.school_id AND bi.book_id = b.id AND bi.status = 'Tersedia'
      AND NOT EXISTS (
        SELECT 1 FROM loans l
        WHERE l.school_id = bi.school_id AND l.book_item_id = bi.id
          AND l.status IN ('Pending', 'Borrowed')
      )
  )`;
}

router.get('/:schoolCode', async (req, res, next) => {
  const schoolCode = String(req.params.schoolCode || '').toUpperCase();
  if (!validSchoolCode(schoolCode)) return res.status(400).json({ message: 'Kode sekolah tidak valid.' });
  try {
    const [schools] = await pool.execute(
      `SELECT school_code, name, logo FROM tenants_schools
       WHERE school_code = ? AND status = 'active' LIMIT 1`,
      [schoolCode]
    );
    if (!schools[0]) return res.status(404).json({ message: 'Portal perpustakaan tidak ditemukan atau tidak aktif.' });
    return res.json({ school: schools[0] });
  } catch (error) {
    return next(error);
  }
});

router.get('/:schoolCode/books', async (req, res, next) => {
  const schoolCode = String(req.params.schoolCode || '').toUpperCase();
  const barcode = typeof req.query.barcode === 'string' ? req.query.barcode.trim() : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (!validSchoolCode(schoolCode)) return res.status(400).json({ message: 'Kode sekolah tidak valid.' });
  if (barcode.length > 100 || search.length > 100 || (!barcode && !search)) {
    return res.status(400).json({ message: 'Pindai barcode atau masukkan nama buku (maksimal 100 karakter).' });
  }

  const barcodeConditions = [
    'b.kode_buku = ?',
    'b.nomor_induk = ?',
    `EXISTS (
      SELECT 1 FROM book_items bi
      WHERE bi.school_id = b.school_id AND bi.book_id = b.id AND bi.serial_number = ?
    )`
  ];
  const barcodeValues = [barcode, barcode, barcode];
  if (/^B[1-9]\d*$/.test(barcode)) {
    barcodeConditions.push('b.id = ?');
    barcodeValues.push(barcode.slice(1));
  }
  const exactFilter = barcode
    ? `AND (${barcodeConditions.join(' OR ')})`
    : 'AND b.title LIKE ?';
  const filterValues = barcode ? barcodeValues : [`%${search}%`];
  try {
    const [books] = await pool.execute(
      `SELECT b.id, b.title, b.kode_buku, b.nomor_induk, b.cover_image,
              ${availabilityQuery()} AS available_count,
              (SELECT COUNT(*) FROM book_items total_items
               WHERE total_items.school_id = b.school_id AND total_items.book_id = b.id) AS total_count
       FROM books b
       JOIN tenants_schools s ON s.id = b.school_id
       WHERE s.school_code = ? AND s.status = 'active' ${exactFilter}
       ORDER BY b.title ASC
       LIMIT ?`,
      [schoolCode, ...filterValues, barcode ? 2 : 30]
    );
    if (barcode && books.length > 1) {
      return res.status(409).json({ message: 'Barcode cocok dengan beberapa judul. Silakan hubungi petugas perpustakaan.' });
    }
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

export default router;
