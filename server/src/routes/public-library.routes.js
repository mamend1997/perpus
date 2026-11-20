import { Router } from 'express';
import { pool } from '../config/database.js';
import { readPlatformBranding } from '../utils/platform-branding.js';

const router = Router();
const validSchoolCode = (value) => /^[A-Z0-9]{4}$/.test(value);

function availabilityQuery() {
  return `(
    SELECT COUNT(*)
    FROM book_items bi
    WHERE bi.school_id = b.school_id AND bi.book_id = b.id
      AND bi.status = 'Tersedia' AND bi.destroyed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM loans l
        WHERE l.school_id = bi.school_id AND l.book_item_id = bi.id
          AND l.status IN ('Pending', 'Borrowed')
      )
  )`;
}

router.get('/platform-branding', async (_req, res, next) => {
  try {
    const branding = await readPlatformBranding();
    return res.json({ title: branding.title, logo: branding.logo });
  } catch (error) {
    return next(error);
  }
});

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
      WHERE bi.school_id = b.school_id AND bi.book_id = b.id
        AND (bi.serial_number = ? OR bi.barcode_value = ?)
    )`
  ];
  const barcodeValues = [barcode, barcode, barcode, barcode];
  if (/^B[1-9]\d*$/.test(barcode)) {
    barcodeConditions.push('b.id = ?');
    barcodeValues.push(barcode.slice(1));
  }
  const exactFilter = barcode
    ? `AND (${barcodeConditions.join(' OR ')})`
    : `AND (
         b.title LIKE ? OR b.kode_buku LIKE ? OR b.nomor_induk LIKE ?
         OR EXISTS (
           SELECT 1 FROM book_items bi
           WHERE bi.school_id = b.school_id AND bi.book_id = b.id
             AND (bi.serial_number LIKE ? OR bi.barcode_value LIKE ?)
         )
       )`;
  const searchTerm = `%${search}%`;
  const filterValues = barcode ? barcodeValues : Array(5).fill(searchTerm);
  try {
    const [books] = await pool.execute(
      `SELECT b.id, b.no_terima, b.received_date, b.nomor_induk, b.kode_buku,
              b.title, b.physical_description, b.isbn, b.year, b.city, b.source,
              b.price, b.qty, b.pages, b.gmd, b.description, b.synopsis,
              a.name AS author_name, p.name AS publisher_name, ag.name AS agent_name,
              t.name AS topic_name, c.name AS collection_name, j.name AS type_name,
              l.name AS language_name, r.name AS rack_name,
              ${availabilityQuery()} AS available_count,
              (SELECT COUNT(*) FROM book_items total_items
               WHERE total_items.school_id = b.school_id AND total_items.book_id = b.id
                 AND total_items.destroyed_at IS NULL AND total_items.status <> 'Hilang') AS total_count
       FROM books b
       JOIN tenants_schools s ON s.id = b.school_id
       LEFT JOIN master_categories a ON a.school_id = b.school_id AND a.id = b.author_id AND a.type = 'pengarang'
       LEFT JOIN master_categories p ON p.school_id = b.school_id AND p.id = b.publisher_id AND p.type = 'penerbit'
       LEFT JOIN master_categories ag ON ag.school_id = b.school_id AND ag.id = b.agent_id AND ag.type = 'agen'
       LEFT JOIN master_categories t ON t.school_id = b.school_id AND t.id = b.topic_id AND t.type = 'topik'
       LEFT JOIN master_categories c ON c.school_id = b.school_id AND c.id = b.collection_id AND c.type = 'koleksi'
       LEFT JOIN master_categories j ON j.school_id = b.school_id AND j.id = b.type_id AND j.type = 'jenis'
       LEFT JOIN master_categories l ON l.school_id = b.school_id AND l.id = b.language_id AND l.type = 'bahasa'
       LEFT JOIN master_categories r ON r.school_id = b.school_id AND r.id = b.rack_id AND r.type = 'rak'
       WHERE s.school_code = ? AND s.status = 'active' ${exactFilter}
       ORDER BY b.title ASC
       LIMIT ?`,
      [schoolCode, ...filterValues, barcode ? 2 : 30]
    );
    if (barcode && books.length > 1) {
      return res.status(409).json({ message: 'Barcode cocok dengan beberapa judul. Silakan hubungi petugas perpustakaan.' });
    }
    let racksByBook = new Map();
    if (books.length) {
      const placeholders = books.map(() => '?').join(', ');
      const [rackRows] = await pool.execute(
        `SELECT bi.book_id, bi.rack_id, COALESCE(r.name, 'Belum ditempatkan') AS rack_name,
                r.code AS rack_code, COUNT(CASE WHEN bi.status <> 'Hilang' THEN 1 END) AS total_count,
                SUM(CASE WHEN bi.status = 'Tersedia' AND NOT EXISTS (
                  SELECT 1 FROM loans l
                  WHERE l.school_id = bi.school_id AND l.book_item_id = bi.id
                    AND l.status IN ('Pending', 'Borrowed')
                ) THEN 1 ELSE 0 END) AS available_count,
                SUM(CASE WHEN bi.status = 'Dipinjam' OR EXISTS (
                  SELECT 1 FROM loans l
                  WHERE l.school_id = bi.school_id AND l.book_item_id = bi.id
                    AND l.status IN ('Pending', 'Borrowed')
                ) THEN 1 ELSE 0 END) AS borrowed_count,
                SUM(CASE WHEN bi.status = 'Rusak' THEN 1 ELSE 0 END) AS damaged_count
         FROM book_items bi
         JOIN tenants_schools s ON s.id = bi.school_id
         LEFT JOIN master_categories r ON r.school_id = bi.school_id AND r.id = bi.rack_id AND r.type = 'rak'
         WHERE s.school_code = ? AND bi.book_id IN (${placeholders})
           AND bi.destroyed_at IS NULL AND bi.status <> 'Hilang'
         GROUP BY bi.book_id, bi.rack_id, r.name, r.code
         ORDER BY bi.book_id ASC, r.name ASC`,
        [schoolCode, ...books.map((book) => String(book.id))]
      );
      racksByBook = rackRows.reduce((result, rack) => {
        const key = String(rack.book_id);
        const rows = result.get(key) || [];
        rows.push({
          rack_id: rack.rack_id == null ? null : String(rack.rack_id),
          rack_name: rack.rack_name,
          rack_code: rack.rack_code,
          total_count: Number(rack.total_count),
          available_count: Number(rack.available_count),
          borrowed_count: Number(rack.borrowed_count),
          damaged_count: Number(rack.damaged_count)
        });
        result.set(key, rows);
        return result;
      }, new Map());
    }
    return res.json({
      books: books.map((book) => ({
        ...book,
        id: String(book.id),
        available_count: Number(book.available_count),
        total_count: Number(book.total_count),
        rack_distribution: racksByBook.get(String(book.id)) || []
      }))
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
