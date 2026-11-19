import { randomUUID } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import multer from 'multer';
import { pool } from '../config/database.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';
import { barcodeValueFromItemId, readBarcodeLabelSettings } from '../utils/barcode-label-settings.js';

const router = Router();
const MAX_BOOK_QUANTITY = 10000;
const bookStorageRoot = fileURLToPath(new URL('../../storage/books/', import.meta.url));
const categoryFields = {
  author_id: 'pengarang',
  publisher_id: 'penerbit',
  agent_id: 'agen',
  topic_id: 'topik',
  collection_id: 'koleksi',
  type_id: 'jenis',
  language_id: 'bahasa',
  rack_id: 'rak'
};
const importedCategoryFields = [
  ['author_id', 'author_name', 'pengarang', 'Pengarang'],
  ['publisher_id', 'publisher_name', 'penerbit', 'Penerbit'],
  ['agent_id', 'agent_name', 'agen', 'Agen'],
  ['topic_id', 'topic_name', 'topik', 'Topik'],
  ['collection_id', 'collection_name', 'koleksi', 'Koleksi'],
  ['type_id', 'type_name', 'jenis', 'Jenis'],
  ['language_id', 'language_name', 'bahasa', 'Bahasa'],
  ['rack_id', 'rack_name', 'rak', 'Rak']
];
const manualCategoryFields = [
  ['author_id', 'pengarang', 'Pengarang'],
  ['publisher_id', 'penerbit', 'Penerbit'],
  ['agent_id', 'agen', 'Agen'],
  ['topic_id', 'topik', 'Topik'],
  ['collection_id', 'koleksi', 'Koleksi'],
  ['type_id', 'jenis', 'Jenis'],
  ['language_id', 'bahasa', 'Bahasa']
];

const storage = multer.diskStorage({
  destination(req, _file, callback) {
    const destination = path.join(bookStorageRoot, String(req.school.id));
    mkdir(destination, { recursive: true }).then(
      () => callback(null, destination),
      callback
    );
  },
  filename(_req, file, callback) {
    const extensions = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'application/pdf': '.pdf'
    };
    callback(null, `${randomUUID()}${extensions[file.mimetype]}`);
  }
});

const upload = multer({
  storage,
  limits: { files: 2, fileSize: 20 * 1024 * 1024 },
  fileFilter(_req, file, callback) {
    const allowedTypes = file.fieldname === 'cover'
      ? ['image/jpeg', 'image/png', 'image/webp']
      : file.fieldname === 'digitalAttachment'
        ? ['application/pdf']
        : [];
    if (!allowedTypes.includes(file.mimetype)) {
      const error = new Error(file.fieldname === 'cover'
        ? 'Foto sampul harus berformat JPG, PNG, atau WebP.'
        : 'Lampiran digital harus berupa PDF.');
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  }
});

function uploadBookAssets(req, res, next) {
  upload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'digitalAttachment', maxCount: 1 }
  ])(req, res, (error) => {
    if (!error) return next();
    if (!(error instanceof multer.MulterError) && !error.status) return next(error);
    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? 'Ukuran file maksimal 20 MB.'
      : error.message || 'File tidak dapat diunggah.';
    return res.status(error.status || 400).json({ message });
  });
}

function uploadedFile(req, field) {
  return req.files?.[field]?.[0] || null;
}

async function removeUploadedFiles(req) {
  const files = Object.values(req.files || {}).flat();
  for (const file of files) {
    try {
      await unlink(file.path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

async function hasExpectedSignature(file) {
  const handle = await open(file.path, 'r');
  const header = Buffer.alloc(12);
  try {
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    if (file.fieldname === 'digitalAttachment') return bytes.subarray(0, 5).toString() === '%PDF-';
    if (file.mimetype === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (file.mimetype === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (file.mimetype === 'image/webp') {
      return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    }
    return false;
  } finally {
    await handle.close();
  }
}

async function validateUploadedFiles(req) {
  const cover = uploadedFile(req, 'cover');
  const digital = uploadedFile(req, 'digitalAttachment');
  if (cover && cover.size > 5 * 1024 * 1024) return 'Ukuran foto sampul maksimal 5 MB.';
  if (cover && !(await hasExpectedSignature(cover))) return 'Isi file foto sampul tidak sesuai dengan formatnya.';
  if (digital && !(await hasExpectedSignature(digital))) return 'Isi file lampiran tidak sesuai dengan format PDF.';
  return '';
}

function textValue(body, key, label, maxLength, { required = false } = {}) {
  const raw = body[key];
  if (raw == null) {
    return required ? { error: `${label} wajib diisi.` } : { value: null };
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return { error: `${label} harus berupa teks.` };
  }
  const value = String(raw).trim();
  if (required && !value) return { error: `${label} wajib diisi.` };
  if (value.length > maxLength) return { error: `${label} maksimal ${maxLength} karakter.` };
  return { value: value || null };
}

function idValue(body, key, label, { required = false } = {}) {
  const raw = body[key];
  if (raw == null || raw === '') {
    return required ? { error: `${label} wajib diisi.` } : { value: null };
  }
  const value = String(raw).trim();
  if (!/^[1-9]\d*$/.test(value)) return { error: `${label} tidak valid.` };
  return { value };
}

function numberValue(body, key, label, { minimum = 0, maximum, integer = false, optional = false, required = false } = {}) {
  const raw = body[key];
  if ((raw == null || raw === '') && optional) return { value: null };
  if ((raw == null || raw === '') && required) return { error: `${label} wajib diisi.` };
  if (raw == null || raw === '') return { value: minimum };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum || (maximum != null && value > maximum) || (integer && !Number.isInteger(value))) {
    return { error: `${label} tidak valid.` };
  }
  return { value };
}

function normalizeDate(body, key, label) {
  const raw = body[key];
  if (raw == null || raw === '') return { value: null };
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { error: `${label} harus menggunakan format YYYY-MM-DD.` };
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    return { error: `${label} tidak valid.` };
  }
  return { value: raw };
}

function normalizeBook(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Data buku tidak valid.' };
  }

  const fields = [
    ['no_terima', 'Nomor terima', 60],
    ['nomor_induk', 'Nomor induk', 60, true],
    ['kode_buku', 'Kode/nomor panggil', 80],
    ['title', 'Judul buku', 255, true],
    ['physical_description', 'Deskripsi fisik', 16000],
    ['gmd', 'GMD', 100],
    ['isbn', 'ISBN', 20],
    ['city', 'Kota terbit', 120],
    ['source', 'Asal barang', 120],
    ['description', 'Deskripsi', 16000],
    ['synopsis', 'Sinopsis', 16000]
  ];
  const value = {};
  for (const [key, label, maxLength, required] of fields) {
    const result = textValue(body, key, label, maxLength, { required: Boolean(required) });
    if (result.error) return result;
    value[key] = result.value;
  }

  const receivedDate = normalizeDate(body, 'received_date', 'Tanggal terima');
  if (receivedDate.error) return receivedDate;
  value.received_date = receivedDate.value;

  for (const [key, label] of Object.entries(categoryFields)) {
    const result = idValue(body, key, label, { required: key === 'rack_id' });
    if (result.error) return result;
    value[key] = result.value;
  }

  const year = numberValue(body, 'year', 'Tahun terbit', { minimum: 1000, maximum: 9999, integer: true, required: true });
  const pages = numberValue(body, 'pages', 'Jumlah halaman', { minimum: 1, maximum: 65535, integer: true, required: true });
  const qty = numberValue(body, 'qty', 'Jumlah buku', { minimum: 0, maximum: MAX_BOOK_QUANTITY, integer: true });
  const price = numberValue(body, 'price', 'Harga', { minimum: 0, maximum: 9999999999.99 });
  for (const result of [year, pages, qty, price]) {
    if (result.error) return result;
  }
  value.year = year.value;
  value.pages = pages.value;
  value.qty = qty.value;
  value.price = price.value;
  return { value };
}

async function validateCategoryReferences(connection, schoolId, book) {
  const references = Object.entries(categoryFields)
    .filter(([field]) => book[field] != null);
  if (!references.length) return '';

  const ids = [...new Set(references.map(([field]) => book[field]))];
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT id, type FROM master_categories
     WHERE school_id = ? AND id IN (${placeholders})`,
    [schoolId, ...ids]
  );
  const byId = new Map(rows.map((row) => [String(row.id), row.type]));
  for (const [field, type] of references) {
    if (byId.get(String(book[field])) !== type) {
      return `Pilihan ${type} tidak ditemukan pada sekolah ini.`;
    }
  }
  return '';
}

async function resolveManualCategories(connection, schoolId, book, rawNames) {
  let names = rawNames;
  if (typeof names === 'string') {
    try {
      names = names ? JSON.parse(names) : {};
    } catch {
      return 'Data nama kategori buku tidak valid.';
    }
  }
  if (!names || typeof names !== 'object' || Array.isArray(names)) {
    return 'Data nama kategori buku tidak valid.';
  }

  for (const [field, type, label] of manualCategoryFields) {
    if (book[field]) continue;
    const legacyAuthor = field === 'author_id' ? book.author_name : '';
    const rawName = names[field] ?? legacyAuthor;
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (!name || name.length > 180) return `${label} wajib dipilih atau diisi (maksimal 180 karakter).`;
    const [matches] = await connection.execute(
      `SELECT id FROM master_categories
       WHERE school_id = ? AND type = ? AND name = ?
       ORDER BY id ASC LIMIT 1`,
      [schoolId, type, name]
    );
    if (matches[0]) {
      book[field] = String(matches[0].id);
      continue;
    }
    const [result] = await connection.execute(
      `INSERT INTO master_categories (school_id, type, code, name, status)
       VALUES (?, ?, NULL, ?, 'active')`,
      [schoolId, type, name]
    );
    book[field] = String(result.insertId);
  }
  return '';
}

function normalizeBookIds(ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 500) return null;
  const normalized = ids.map((id) => String(id));
  if (normalized.some((id) => !/^[1-9]\d*$/.test(id))) return null;
  return [...new Set(normalized)];
}

function parsePageValue(raw, fallback, maximum) {
  if (raw == null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) return null;
  return value;
}

function bookSelectSql() {
  return `SELECT b.id, b.no_terima, b.received_date, b.nomor_induk, b.kode_buku,
                 b.title, b.physical_description, b.isbn, b.year, b.city, b.source,
                 b.price, b.qty, b.pages, b.gmd, b.description, b.synopsis,
                 b.cover_image IS NOT NULL AS has_cover,
                 b.file_digital IS NOT NULL AS has_digital_attachment,
                 a.name AS author_name, p.name AS publisher_name, ag.name AS agent_name,
                 t.name AS topic_name, c.name AS collection_name, j.name AS type_name,
                 l.name AS language_name, r.name AS rack_name,
                 (SELECT COUNT(*) FROM book_items bi
                  WHERE bi.school_id = b.school_id AND bi.book_id = b.id AND bi.status = 'Tersedia') AS available_qty
          FROM books b
          LEFT JOIN master_categories a ON a.school_id = b.school_id AND a.id = b.author_id
          LEFT JOIN master_categories p ON p.school_id = b.school_id AND p.id = b.publisher_id
          LEFT JOIN master_categories ag ON ag.school_id = b.school_id AND ag.id = b.agent_id
          LEFT JOIN master_categories t ON t.school_id = b.school_id AND t.id = b.topic_id
          LEFT JOIN master_categories c ON c.school_id = b.school_id AND c.id = b.collection_id
          LEFT JOIN master_categories j ON j.school_id = b.school_id AND j.id = b.type_id
          LEFT JOIN master_categories l ON l.school_id = b.school_id AND l.id = b.language_id
          LEFT JOIN master_categories r ON r.school_id = b.school_id AND r.id = b.rack_id`;
}

async function loadImportCategories(connection, schoolId) {
  const types = [...new Set(importedCategoryFields.map(([, , type]) => type))];
  const [rows] = await connection.execute(
    `SELECT id, type, name FROM master_categories
     WHERE school_id = ? AND type IN (${types.map(() => '?').join(', ')})`,
    [schoolId, ...types]
  );
  return rows;
}

function resolveImportedBook(row, categories, rowNumber) {
  const resolved = { ...row };
  for (const [idField, nameField, type, label] of importedCategoryFields) {
    const rawName = row[nameField];
    if (rawName == null || rawName === '') {
      resolved[idField] = null;
      continue;
    }
    if (typeof rawName !== 'string' && typeof rawName !== 'number') {
      return { error: `Baris ${rowNumber}: ${label} harus berupa teks.` };
    }
    const normalizedName = String(rawName).trim().toLocaleLowerCase('id-ID');
    const matches = categories.filter((category) => (
      category.type === type && category.name.trim().toLocaleLowerCase('id-ID') === normalizedName
    ));
    if (matches.length !== 1) {
      return {
        error: matches.length
          ? `Baris ${rowNumber}: nama ${label} "${rawName}" tidak unik.`
          : `Baris ${rowNumber}: ${label} "${rawName}" belum terdaftar pada Master Data sekolah.`
      };
    }
    resolved[idField] = String(matches[0].id);
  }
  const normalized = normalizeBook(resolved);
  if (normalized.error) return { error: `Baris ${rowNumber}: ${normalized.error}` };
  return { value: normalized.value };
}

async function insertBook(connection, schoolId, book, files = {}) {
  const columns = [
    'no_terima', 'received_date', 'nomor_induk', 'kode_buku', 'title',
    'physical_description', 'author_id', 'publisher_id', 'agent_id', 'topic_id',
    'collection_id', 'type_id', 'language_id', 'gmd', 'isbn', 'year', 'city',
    'source', 'price', 'qty', 'pages', 'rack_id', 'description', 'synopsis',
    'cover_image', 'file_digital'
  ];
  const values = [
    ...columns.slice(0, 24).map((column) => book[column]),
    files.cover?.filename || null,
    files.digitalAttachment?.filename || null
  ];
  const [result] = await connection.execute(
    `INSERT INTO books (school_id, ${columns.join(', ')})
     VALUES (${columns.map(() => '?').join(', ')}, ?)`,
    [schoolId, ...values]
  );
  await synchronizeBookItems(connection, schoolId, String(result.insertId), book.qty, book.rack_id);
  return result.insertId;
}

async function lockBookSerialSequence(connection, schoolId) {
  await connection.execute(
    `INSERT INTO school_settings (school_id, \`key\`, \`value\`)
     VALUES (?, 'book_serial_sequence', '0')
     ON DUPLICATE KEY UPDATE \`value\` = \`value\``,
    [schoolId]
  );
  const [[row]] = await connection.execute(
    `SELECT \`value\` FROM school_settings
     WHERE school_id = ? AND \`key\` = 'book_serial_sequence' FOR UPDATE`,
    [schoolId]
  );
  return BigInt(row.value);
}

async function synchronizeBookItems(connection, schoolId, bookId, desiredQuantity, defaultRackId = null) {
  const [items] = await connection.execute(
    `SELECT id, serial_number, status FROM book_items
     WHERE school_id = ? AND book_id = ? ORDER BY id FOR UPDATE`,
    [schoolId, bookId]
  );
  const difference = desiredQuantity - items.length;
  if (difference < 0) {
    const removable = items.filter((item) => item.status === 'Tersedia').slice(difference);
    if (removable.length < Math.abs(difference)) {
      const error = new Error('Jumlah tidak dapat dikurangi karena sebagian eksemplar sedang dipinjam atau rusak.');
      error.status = 409;
      throw error;
    }
    const ids = removable.map((item) => String(item.id));
    await connection.execute(
      `DELETE FROM book_items WHERE school_id = ? AND book_id = ?
       AND id IN (${ids.map(() => '?').join(', ')})`,
      [schoolId, bookId, ...ids]
    );
    return;
  }
  if (!difference) return;

  const { serialPrefix } = await readBarcodeLabelSettings(connection, schoolId);
  let sequence = await lockBookSerialSequence(connection, schoolId);
  const [schoolSerials] = await connection.execute(
    `SELECT serial_number FROM book_items
     WHERE school_id = ? AND serial_number LIKE ? FOR UPDATE`,
    [schoolId, `${serialPrefix}%`]
  );
  const escapedPrefix = serialPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const serialPattern = new RegExp(`^${escapedPrefix}(\\d+)$`, 'i');
  const existingSequence = schoolSerials.reduce((maximum, item) => {
    const match = String(item.serial_number).match(serialPattern);
    if (!match) return maximum;
    const sequence = BigInt(match[1]);
    return sequence > maximum ? sequence : maximum;
  }, -1n);
  if (existingSequence > sequence) sequence = existingSequence;
  const existingSerials = new Set(schoolSerials.map((item) => String(item.serial_number).toUpperCase()));
  const rows = [];
  while (rows.length < difference) {
    sequence += 1n;
    const serialNumber = `${serialPrefix}${sequence.toString().padStart(2, '0')}`;
    if (serialNumber.length > 50) {
      const error = new Error('Prefix serial dan nomor urut melebihi panjang maksimal 50 karakter.');
      error.status = 400;
      throw error;
    }
    if (existingSerials.has(serialNumber.toUpperCase())) continue;
    existingSerials.add(serialNumber.toUpperCase());
    rows.push([schoolId, bookId, serialNumber, `TMP${bookId}-${serialNumber}`, defaultRackId || null, 'Tersedia']);
  }
  const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  await connection.execute(
    `INSERT INTO book_items (school_id, book_id, serial_number, barcode_value, rack_id, status) VALUES ${placeholders}`,
    rows.flat()
  );

  const [createdItems] = await connection.execute(
    `SELECT id FROM book_items
     WHERE school_id = ? AND book_id = ? AND barcode_value LIKE ?
     ORDER BY id FOR UPDATE`,
    [schoolId, bookId, `TMP${bookId}-%`]
  );
  for (let offset = 0; offset < createdItems.length; offset += 500) {
    const chunk = createdItems.slice(offset, offset + 500);
    const cases = chunk.map(() => 'WHEN ? THEN ?').join(' ');
    const ids = chunk.map((item) => String(item.id));
    const placeholdersForIds = ids.map(() => '?').join(', ');
    const values = chunk.flatMap((item) => [
      String(item.id),
      barcodeValueFromItemId(item.id)
    ]);
    await connection.execute(
      `UPDATE book_items
       SET barcode_value = CASE id ${cases} ELSE barcode_value END
       WHERE school_id = ? AND id IN (${placeholdersForIds})`,
      [...values, schoolId, ...ids]
    );
  }
  await connection.execute(
    `UPDATE school_settings SET \`value\` = ?
     WHERE school_id = ? AND \`key\` = 'book_serial_sequence'`,
    [String(sequence), schoolId]
  );
}

router.get('/meta', requireSchoolPermission('books.catalog', 'view'), async (req, res, next) => {
  try {
    const [otherCategories] = await pool.execute(
      `SELECT id, type, code, name, capacity, status FROM master_categories
       WHERE school_id = ? AND type IN ('bahasa', 'jenis', 'koleksi', 'rak', 'agen', 'pengarang', 'penerbit', 'topik')
       ORDER BY name`,
      [req.school.id]
    );
    const grouped = Object.fromEntries(
      [...new Set(importedCategoryFields.map(([, , type]) => type))]
        .map((type) => [type, otherCategories.filter((category) => category.type === type)])
    );
    return res.json({
      school: { id: req.school.id, name: req.school.name },
      categories: grouped
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/rack-transfers/options', requireSchoolPermission('books.stock', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search.length > 100) return res.status(400).json({ message: 'Pencarian buku maksimal 100 karakter.' });
  try {
    const [racks] = await pool.execute(
      `SELECT r.id, r.name, r.capacity,
              COUNT(CASE WHEN bi.status = 'Tersedia' THEN 1 END) AS used
       FROM master_categories r
       LEFT JOIN book_items bi ON bi.school_id = r.school_id AND bi.rack_id = r.id
       WHERE r.school_id = ? AND r.type = 'rak' AND r.status = 'active'
       GROUP BY r.id, r.name, r.capacity
       ORDER BY r.name ASC`,
      [req.school.id]
    );
    const [bookStocks] = search.length < 2 ? [[]] : await pool.execute(
      `SELECT b.id AS book_id, b.title, b.kode_buku, b.nomor_induk,
              bi.rack_id, COALESCE(r.name, 'Belum ditentukan') AS rack_name,
              MIN(bi.serial_number) AS serial_number, COUNT(*) AS available_qty
       FROM books b
       JOIN book_items bi ON bi.school_id = b.school_id AND bi.book_id = b.id
       LEFT JOIN master_categories r ON r.school_id = bi.school_id AND r.id = bi.rack_id AND r.type = 'rak'
       WHERE b.school_id = ? AND bi.status = 'Tersedia'
         AND NOT EXISTS (
           SELECT 1 FROM loans l
           WHERE l.school_id = bi.school_id AND l.book_item_id = bi.id
             AND l.status IN ('Pending', 'Borrowed')
         )
         AND (b.title LIKE ? OR b.kode_buku LIKE ? OR b.nomor_induk LIKE ? OR bi.serial_number LIKE ?)
       GROUP BY b.id, b.title, b.kode_buku, b.nomor_induk, bi.rack_id, r.name
       ORDER BY b.title ASC, bi.rack_id ASC
       LIMIT 100`,
      [req.school.id, ...Array(4).fill(`%${search}%`)]
    );
    return res.json({
      racks: racks.map((rack) => ({
        id: String(rack.id),
        name: rack.name,
        capacity: rack.capacity == null ? null : Number(rack.capacity),
        used: Number(rack.used)
      })),
      books: bookStocks.map((stock) => ({
        book_id: String(stock.book_id),
        title: stock.title,
        kode_buku: stock.kode_buku,
        nomor_induk: stock.nomor_induk,
        rack_id: stock.rack_id == null ? 'none' : String(stock.rack_id),
        rack_name: stock.rack_name,
        serial_number: stock.serial_number,
        available_qty: Number(stock.available_qty)
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/rack-transfers/history', requireSchoolPermission('books.stock', 'view'), async (req, res, next) => {
  try {
    const [transfers] = await pool.execute(
      `SELECT t.id, t.quantity, t.note, t.moved_at, b.title AS book_title,
              b.kode_buku,               COALESCE(source.name, 'Belum ditentukan') AS from_rack, target.name AS to_rack, u.name AS moved_by
       FROM book_rack_transfers t
       JOIN books b ON b.school_id = t.school_id AND b.id = t.book_id
       LEFT JOIN master_categories source ON source.school_id = t.school_id AND source.id = t.from_rack_id
       JOIN master_categories target ON target.school_id = t.school_id AND target.id = t.to_rack_id
       LEFT JOIN users u ON u.id = t.moved_by
       WHERE t.school_id = ?
       ORDER BY t.moved_at DESC, t.id DESC
       LIMIT 100`,
      [req.school.id]
    );
    return res.json({ transfers: transfers.map((transfer) => ({ ...transfer, id: String(transfer.id), quantity: Number(transfer.quantity) })) });
  } catch (error) {
    return next(error);
  }
});

router.post('/rack-transfers', requireSchoolPermission('books.stock', 'edit'), async (req, res, next) => {
  const bookId = String(req.body?.bookId ?? '');
  const fromRackId = String(req.body?.fromRackId ?? '');
  const sourceIsUnassigned = fromRackId === 'none';
  const sourceRackId = sourceIsUnassigned ? null : fromRackId;
  const toRackId = String(req.body?.toRackId ?? '');
  const quantity = Number(req.body?.quantity);
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  if (!/^[1-9]\d*$/.test(bookId) || (!sourceIsUnassigned && !/^[1-9]\d*$/.test(fromRackId))
    || !/^[1-9]\d*$/.test(toRackId) || (!sourceIsUnassigned && fromRackId === toRackId)
    || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_BOOK_QUANTITY
    || note.length > 500) {
    return res.status(400).json({ message: 'Buku, rak asal/tujuan, jumlah, atau keterangan pindah rak tidak valid.' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [books] = await connection.execute(
      'SELECT id, title FROM books WHERE id = ? AND school_id = ? FOR UPDATE',
      [bookId, req.school.id]
    );
    if (!books[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Buku tidak ditemukan pada sekolah ini.' });
    }

    const rackIds = sourceIsUnassigned ? [toRackId] : [fromRackId, toRackId];
    const [racks] = await connection.execute(
      `SELECT id, name, capacity, status FROM master_categories
       WHERE school_id = ? AND type = 'rak' AND id IN (${rackIds.map(() => '?').join(', ')})
       ORDER BY id FOR UPDATE`,
      [req.school.id, ...rackIds]
    );
    const sourceRack = sourceIsUnassigned ? null : racks.find((rack) => String(rack.id) === fromRackId);
    const targetRack = racks.find((rack) => String(rack.id) === toRackId);
    if ((!sourceIsUnassigned && !sourceRack) || !targetRack || targetRack.status !== 'active') {
      await connection.rollback();
      return res.status(404).json({ message: 'Rak asal atau tujuan tidak aktif atau tidak ditemukan.' });
    }

    const sourceCondition = sourceIsUnassigned ? 'bi.rack_id IS NULL' : 'bi.rack_id = ?';
    const sourceValues = sourceIsUnassigned ? [] : [fromRackId];
    const [items] = await connection.execute(
      `SELECT bi.id FROM book_items bi
       WHERE bi.school_id = ? AND bi.book_id = ? AND ${sourceCondition}
         AND bi.status = 'Tersedia'
         AND NOT EXISTS (
           SELECT 1 FROM loans l
           WHERE l.school_id = bi.school_id AND l.book_item_id = bi.id
             AND l.status IN ('Pending', 'Borrowed')
         )
       ORDER BY bi.id ASC LIMIT ? FOR UPDATE`,
      [req.school.id, bookId, ...sourceValues, quantity]
    );
    if (items.length < quantity) {
      await connection.rollback();
      return res.status(409).json({ message: `Stok tersedia di rak asal hanya ${items.length} eksemplar.` });
    }

    if (targetRack.capacity != null) {
      const [[targetUsage]] = await connection.execute(
        `SELECT COUNT(*) AS used FROM book_items
         WHERE school_id = ? AND rack_id = ? AND status = 'Tersedia'`,
        [req.school.id, toRackId]
      );
      if (Number(targetUsage.used) + quantity > Number(targetRack.capacity)) {
        await connection.rollback();
        return res.status(409).json({
          message: `Kapasitas rak tujuan tersisa ${Math.max(Number(targetRack.capacity) - Number(targetUsage.used), 0)} eksemplar.`
        });
      }
    }

    const itemIds = items.map((item) => String(item.id));
    const updateSource = sourceIsUnassigned ? 'rack_id IS NULL' : 'rack_id = ?';
    await connection.execute(
      `UPDATE book_items SET rack_id = ?
       WHERE school_id = ? AND book_id = ? AND ${updateSource}
         AND id IN (${itemIds.map(() => '?').join(', ')})`,
      [toRackId, req.school.id, bookId, ...sourceValues, ...itemIds]
    );
    const [[rackSummary]] = await connection.execute(
      `SELECT COUNT(DISTINCT rack_id) AS rack_count, COUNT(*) - COUNT(rack_id) AS unassigned, MIN(rack_id) AS only_rack
       FROM book_items WHERE school_id = ? AND book_id = ?`,
      [req.school.id, bookId]
    );
    await connection.execute(
      'UPDATE books SET rack_id = ? WHERE id = ? AND school_id = ?',
      [Number(rackSummary.rack_count) === 1 && Number(rackSummary.unassigned) === 0 ? rackSummary.only_rack : null, bookId, req.school.id]
    );
    const [result] = await connection.execute(
      `INSERT INTO book_rack_transfers
       (school_id, book_id, from_rack_id, to_rack_id, moved_by, quantity, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.school.id, bookId, sourceRackId, toRackId, req.school.userId, quantity, note || null]
    );
    await connection.commit();
    return res.status(201).json({
      transfer: { id: String(result.insertId), bookTitle: books[0].title, quantity, fromRack: sourceRack?.name || 'Belum ditentukan', toRack: targetRack.name },
      message: `${quantity} eksemplar buku berhasil dipindahkan dari ${sourceRack?.name || 'Belum ditentukan'} ke ${targetRack.name}.`
    });
  } catch (error) {
    try { if (connection) await connection.rollback(); } catch (rollbackError) { return next(rollbackError); }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.get('/', requireSchoolPermission('books.catalog', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const page = parsePageValue(req.query.page, 1, 1000000);
  const limit = parsePageValue(req.query.limit, 25, 100);
  if (search.length > 100) return res.status(400).json({ message: 'Kata pencarian maksimal 100 karakter.' });
  if (!page || !limit) return res.status(400).json({ message: 'Halaman atau jumlah data tidak valid.' });

  const filters = [
    ['authorId', 'author_id'],
    ['publisherId', 'publisher_id'],
    ['agentId', 'agent_id'],
    ['topicId', 'topic_id'],
    ['collectionId', 'collection_id'],
    ['typeId', 'type_id'],
    ['languageId', 'language_id'],
    ['rackId', 'rack_id']
  ];
  const conditions = ['b.school_id = ?'];
  const values = [req.school.id];
  for (const [queryKey, column] of filters) {
    const raw = req.query[queryKey];
    if (raw == null || raw === '') continue;
    const id = String(raw);
    if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ message: `Filter ${queryKey} tidak valid.` });
    conditions.push(`b.${column} = ?`);
    values.push(id);
  }
  if (search) {
    const searchColumns = [
      'b.title', 'b.no_terima', 'b.nomor_induk', 'b.kode_buku', 'b.isbn',
      'b.physical_description', 'b.gmd', 'b.city', 'b.source', 'b.description', 'b.synopsis',
      'a.name', 'p.name', 'ag.name', 't.name', 'c.name', 'j.name', 'l.name', 'r.name'
    ];
    conditions.push(`(${searchColumns.map((column) => `${column} LIKE ?`).join(' OR ')})`);
    values.push(...Array(searchColumns.length).fill(`%${search}%`));
  }

  try {
    const where = conditions.join(' AND ');
    const countSql = `SELECT COUNT(*) AS total FROM books b
      LEFT JOIN master_categories a ON a.school_id = b.school_id AND a.id = b.author_id
      LEFT JOIN master_categories p ON p.school_id = b.school_id AND p.id = b.publisher_id
      LEFT JOIN master_categories ag ON ag.school_id = b.school_id AND ag.id = b.agent_id
      LEFT JOIN master_categories t ON t.school_id = b.school_id AND t.id = b.topic_id
      LEFT JOIN master_categories c ON c.school_id = b.school_id AND c.id = b.collection_id
      LEFT JOIN master_categories j ON j.school_id = b.school_id AND j.id = b.type_id
      LEFT JOIN master_categories l ON l.school_id = b.school_id AND l.id = b.language_id
      LEFT JOIN master_categories r ON r.school_id = b.school_id AND r.id = b.rack_id
      WHERE ${where}`;
    const [[count]] = await pool.execute(countSql, values);
    const offset = (page - 1) * limit;
    const [books] = await pool.execute(
      `${bookSelectSql()} WHERE ${where} ORDER BY b.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    return res.json({
      books,
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

router.get('/items/books', requireSchoolPermission('books.items', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search.length > 100) return res.status(400).json({ message: 'Pencarian buku maksimal 100 karakter.' });
  if (search.length < 2) return res.json({ books: [] });
  try {
    const [books] = await pool.execute(
      `SELECT CAST(b.id AS CHAR) AS id, b.title, b.nomor_induk, b.kode_buku,
              COUNT(bi.id) AS item_count
       FROM books b
       JOIN book_items bi ON bi.school_id = b.school_id AND bi.book_id = b.id
       WHERE b.school_id = ? AND (
         b.title LIKE ? OR b.nomor_induk LIKE ? OR b.kode_buku LIKE ? OR b.isbn LIKE ?
       )
       GROUP BY b.id, b.title, b.nomor_induk, b.kode_buku
       ORDER BY b.title ASC
       LIMIT 20`,
      [req.school.id, ...Array(4).fill(`%${search}%`)]
    );
    return res.json({ books });
  } catch (error) {
    return next(error);
  }
});

router.get('/items', requireSchoolPermission('books.items', 'view'), async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const bookId = req.query.bookId == null ? '' : String(req.query.bookId);
  const page = parsePageValue(req.query.page, 1, 1000000);
  const limit = parsePageValue(req.query.limit, 25, 100);
  const sort = req.query.sort == null ? 'serial' : req.query.sort;
  const direction = req.query.direction == null ? 'asc' : req.query.direction;
  const status = req.query.status == null ? '' : req.query.status;
  if (search.length > 100) return res.status(400).json({ message: 'Kata pencarian maksimal 100 karakter.' });
  if (bookId && !/^[1-9]\d*$/.test(bookId)) return res.status(400).json({ message: 'ID buku tidak valid.' });
  if (!page || !limit) return res.status(400).json({ message: 'Halaman atau jumlah data tidak valid.' });
  if (!['serial', 'title'].includes(sort) || !['asc', 'desc'].includes(direction)) {
    return res.status(400).json({ message: 'Pengurutan eksemplar tidak valid.' });
  }
  if (status && !['Tersedia', 'Dipinjam', 'Rusak'].includes(status)) {
    return res.status(400).json({ message: 'Filter status eksemplar tidak valid.' });
  }

  const conditions = ['bi.school_id = ?'];
  const values = [req.school.id];
  if (status) {
    conditions.push('bi.status = ?');
    values.push(status);
  }
  if (bookId) {
    conditions.push('bi.book_id = ?');
    values.push(bookId);
  }
  if (search) {
    conditions.push('(bi.serial_number LIKE ? OR bi.barcode_value LIKE ? OR b.title LIKE ? OR b.nomor_induk LIKE ? OR b.kode_buku LIKE ?)');
    values.push(...Array(5).fill(`%${search}%`));
  }

  try {
    const where = conditions.join(' AND ');
    const from = `FROM book_items bi
      JOIN books b ON b.school_id = bi.school_id AND b.id = bi.book_id
      LEFT JOIN master_categories r ON r.school_id = bi.school_id AND r.id = bi.rack_id AND r.type = 'rak'`;
    const [[count]] = await pool.execute(
      `SELECT COUNT(*) AS total ${from} WHERE ${where}`,
      values
    );
    const orderColumn = sort === 'title' ? 'b.title' : 'bi.serial_number';
    const orderDirection = direction.toUpperCase();
    const offset = (page - 1) * limit;
    const [items] = await pool.execute(
      `SELECT bi.id, bi.book_id, bi.serial_number, bi.barcode_value, bi.status, bi.\`condition\`,
              b.title AS book_title, b.nomor_induk, b.kode_buku,
              r.name AS rack_name, r.code AS rack_code
       ${from}
       WHERE ${where}
       ORDER BY ${orderColumn} ${orderDirection}, bi.serial_number ASC, bi.id ASC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    return res.json({
      items,
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

router.patch('/items/:id', requireSchoolPermission('books.items', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ message: 'ID eksemplar tidak valid.' });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ message: 'Data eksemplar tidak valid.' });
  }

  const serialNumber = typeof req.body.serial_number === 'string' ? req.body.serial_number.trim().toUpperCase() : '';
  const status = req.body.status;
  if (!/^[A-Z0-9][A-Z0-9._-]{0,49}$/.test(serialNumber)) {
    return res.status(400).json({ message: 'Serial number hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung (maksimal 50 karakter).' });
  }
  if (!['Tersedia', 'Rusak'].includes(status)) {
    return res.status(400).json({ message: 'Status hanya dapat diubah menjadi Tersedia atau Rusak. Status Dipinjam mengikuti transaksi peminjaman.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [references] = await connection.execute(
      `SELECT bi.book_id, b.title AS book_title
       FROM book_items bi
       JOIN books b ON b.school_id = bi.school_id AND b.id = bi.book_id
       WHERE bi.id = ? AND bi.school_id = ? LIMIT 1`,
      [id, req.school.id]
    );
    if (!references[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Eksemplar tidak ditemukan.' });
    }

    const [books] = await connection.execute(
      'SELECT id FROM books WHERE id = ? AND school_id = ? FOR UPDATE',
      [references[0].book_id, req.school.id]
    );
    if (!books[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Buku induk tidak ditemukan.' });
    }
    const [items] = await connection.execute(
      `SELECT id, book_id, serial_number, status FROM book_items
       WHERE id = ? AND school_id = ? FOR UPDATE`,
      [id, req.school.id]
    );
    const item = items[0];
    if (!item) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Eksemplar tidak ditemukan.' });
    }

    const [activeLoans] = await connection.execute(
      `SELECT id FROM loans
       WHERE school_id = ? AND book_item_id = ? AND status IN ('Pending', 'Borrowed')
       LIMIT 1`,
      [req.school.id, id]
    );
    if (activeLoans.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Eksemplar sedang terkait peminjaman aktif dan tidak dapat diubah.' });
    }
    if (serialNumber !== item.serial_number) {
      const [loanHistory] = await connection.execute(
        'SELECT id FROM loans WHERE school_id = ? AND book_item_id = ? LIMIT 1',
        [req.school.id, id]
      );
      if (loanHistory.length) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({ message: 'Serial number tidak dapat diubah karena eksemplar memiliki riwayat peminjaman.' });
      }
      await lockBookSerialSequence(connection, req.school.id);
      const [duplicates] = await connection.execute(
        `SELECT id FROM book_items
         WHERE school_id = ? AND serial_number = ? AND id <> ? LIMIT 1 FOR UPDATE`,
        [req.school.id, serialNumber, id]
      );
      if (duplicates.length) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({ message: 'Serial number sudah digunakan eksemplar lain di sekolah ini.' });
      }
    }

    await connection.execute(
      `UPDATE book_items SET serial_number = ?, status = ?
       WHERE id = ? AND school_id = ?`,
      [serialNumber, status, id, req.school.id]
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({
      item: {
        id,
        book_id: String(item.book_id),
        serial_number: serialNumber,
        status,
        book_title: references[0].book_title
      }
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
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Serial number tersebut sudah digunakan untuk buku yang sama.' });
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/items/:id/condition', requireSchoolPermission('books.items', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  const condition = req.body?.condition;
  if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ message: 'ID eksemplar tidak valid.' });
  if (!['Baik', 'Rusak Ringan', 'Rusak Berat'].includes(condition)) {
    return res.status(400).json({ message: 'Kondisi buku tidak valid.' });
  }
  try {
    const [result] = await pool.execute(
      'UPDATE book_items SET `condition` = ? WHERE id = ? AND school_id = ?',
      [condition, id, req.school.id]
    );
    if (!result.affectedRows) {
      const [items] = await pool.execute(
        'SELECT id FROM book_items WHERE id = ? AND school_id = ? LIMIT 1',
        [id, req.school.id]
      );
      if (!items.length) return res.status(404).json({ message: 'Eksemplar tidak ditemukan.' });
    }
    return res.json({ item: { id, condition } });
  } catch (error) {
    return next(error);
  }
});

router.delete('/items/:id', requireSchoolPermission('books.items', 'delete'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ message: 'ID eksemplar tidak valid.' });

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [references] = await connection.execute(
      'SELECT book_id FROM book_items WHERE id = ? AND school_id = ? LIMIT 1',
      [id, req.school.id]
    );
    if (!references[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Eksemplar tidak ditemukan.' });
    }

    const [books] = await connection.execute(
      'SELECT id, qty FROM books WHERE id = ? AND school_id = ? FOR UPDATE',
      [references[0].book_id, req.school.id]
    );
    if (!books[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Buku induk tidak ditemukan.' });
    }
    const [items] = await connection.execute(
      `SELECT id, status FROM book_items
       WHERE id = ? AND school_id = ? FOR UPDATE`,
      [id, req.school.id]
    );
    const item = items[0];
    if (!item) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Eksemplar tidak ditemukan.' });
    }
    if (item.status === 'Dipinjam') {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Eksemplar yang sedang dipinjam tidak dapat dihapus.' });
    }
    const [loanHistory] = await connection.execute(
      'SELECT id FROM loans WHERE school_id = ? AND book_item_id = ? LIMIT 1',
      [req.school.id, id]
    );
    if (loanHistory.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Eksemplar memiliki riwayat peminjaman sehingga tidak dapat dihapus.' });
    }

    await connection.execute(
      'DELETE FROM book_items WHERE id = ? AND school_id = ?',
      [id, req.school.id]
    );
    const resultingQty = Math.max(Number(books[0].qty) - 1, 0);
    await connection.execute(
      'UPDATE books SET qty = ? WHERE id = ? AND school_id = ?',
      [resultingQty, books[0].id, req.school.id]
    );
    await connection.commit();
    transactionStarted = false;
    return res.json({ deleted: 1, book: { id: String(books[0].id), qty: resultingQty } });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        return next(error);
      }
    }
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: 'Eksemplar memiliki riwayat peminjaman sehingga tidak dapat dihapus.' });
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.get('/stock/books', requireSchoolPermission('books.stock', 'view'), async (req, res, next) => {
  const barcode = typeof req.query.barcode === 'string' ? req.query.barcode.trim() : '';
  if (barcode.length > 100) return res.status(400).json({ message: 'Kode barcode maksimal 100 karakter.' });
  if (barcode) {
    try {
      const [books] = await pool.execute(
        `SELECT b.id, b.title, b.nomor_induk, b.kode_buku, b.qty
         FROM books b
         WHERE b.school_id = ? AND (b.nomor_induk = ? OR b.kode_buku = ?)
         ORDER BY CASE WHEN b.nomor_induk = ? THEN 0 ELSE 1 END, b.title
         LIMIT 10`,
        [req.school.id, barcode, barcode, barcode]
      );
      if (books.length) return res.json({ books });

      const [itemMatches] = await pool.execute(
        `SELECT DISTINCT b.id, b.title, b.nomor_induk, b.kode_buku, b.qty
         FROM book_items bi
         JOIN books b ON b.school_id = bi.school_id AND b.id = bi.book_id
         WHERE bi.school_id = ? AND (bi.barcode_value = ? OR bi.serial_number = ?)
         ORDER BY b.title
         LIMIT 10`,
        [req.school.id, barcode, barcode]
      );
      return res.json({ books: itemMatches });
    } catch (error) {
      return next(error);
    }
  }

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search.length > 100) return res.status(400).json({ message: 'Kata pencarian maksimal 100 karakter.' });
  if (search.length < 3) return res.json({ books: [] });

  const pattern = `%${search}%`;
  try {
    const [books] = await pool.execute(
      `SELECT DISTINCT b.id, b.title, b.nomor_induk, b.kode_buku, b.qty
       FROM books b
       LEFT JOIN book_items bi ON bi.school_id = b.school_id AND bi.book_id = b.id
       WHERE b.school_id = ? AND (
         b.title LIKE ? OR b.nomor_induk LIKE ? OR b.kode_buku LIKE ?
         OR bi.serial_number LIKE ? OR bi.barcode_value LIKE ?
       )
       ORDER BY b.title
       LIMIT 10`,
      [req.school.id, pattern, pattern, pattern, pattern, pattern]
    );
    return res.json({ books });
  } catch (error) {
    return next(error);
  }
});

router.get('/stock/history', requireSchoolPermission('books.stock', 'view'), async (req, res, next) => {
  const page = parsePageValue(req.query.page, 1, 1000000);
  const limit = parsePageValue(req.query.limit, 25, 100);
  if (!page || !limit) return res.status(400).json({ message: 'Nomor halaman atau jumlah data riwayat tidak valid.' });
  try {
    const [[count], [history]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM book_stock_movements WHERE school_id = ?', [req.school.id]),
      pool.execute(
        `SELECT m.id, m.book_id, b.title AS book_title, m.actor_id, u.name AS actor_name,
                m.quantity_added, m.previous_qty, m.resulting_qty,
                DATE_FORMAT(m.stock_date, '%Y-%m-%d') AS stock_date, m.note, m.created_at
         FROM book_stock_movements m
         JOIN books b ON b.school_id = m.school_id AND b.id = m.book_id
         LEFT JOIN users u ON u.id = m.actor_id
         WHERE m.school_id = ?
         ORDER BY m.stock_date DESC, m.id DESC
         LIMIT ? OFFSET ?`,
        [req.school.id, limit, (page - 1) * limit]
      )
    ]);
    const total = Number(count.total);
    return res.json({
      history: history.map((movement) => ({
        ...movement,
        id: String(movement.id),
        book_id: String(movement.book_id),
        quantity_added: Number(movement.quantity_added),
        previous_qty: Number(movement.previous_qty),
        resulting_qty: Number(movement.resulting_qty)
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/stock', requireSchoolPermission('books.stock', 'edit'), async (req, res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ message: 'Data penambahan stok tidak valid.' });
  }
  const { bookId, quantity, note } = req.body;
  const stockDateResult = normalizeDate(req.body, 'stockDate', 'Tanggal');
  if (stockDateResult.error) return res.status(400).json({ message: stockDateResult.error });
  if (!stockDateResult.value) return res.status(400).json({ message: 'Tanggal penambahan stok wajib diisi.' });
  const stockDate = stockDateResult.value;
  const id = typeof bookId === 'string' || typeof bookId === 'number' ? String(bookId) : '';
  if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ message: 'Buku yang dipilih tidak valid.' });
  if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_BOOK_QUANTITY) {
    return res.status(400).json({ message: `Jumlah tambahan harus berupa bilangan bulat antara 1 dan ${MAX_BOOK_QUANTITY}.` });
  }
  if (note != null && typeof note !== 'string') {
    return res.status(400).json({ message: 'Keterangan harus berupa teks.' });
  }
  const normalizedNote = typeof note === 'string' ? note.trim() : '';
  if (normalizedNote.length > 1000) {
    return res.status(400).json({ message: 'Keterangan maksimal 1000 karakter.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.execute(
      `SELECT id, title, qty, rack_id FROM books
       WHERE id = ? AND school_id = ? FOR UPDATE`,
      [id, req.school.id]
    );
    const book = rows[0];
    if (!book) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Buku tidak ditemukan pada katalog sekolah ini.' });
    }

    const previousQty = Number(book.qty);
    const resultingQty = previousQty + quantity;
    if (resultingQty > MAX_BOOK_QUANTITY) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({
        message: `Jumlah stok buku maksimal ${MAX_BOOK_QUANTITY}. Stok saat ini ${previousQty}.`
      });
    }

    await connection.execute(
      'UPDATE books SET qty = ? WHERE id = ? AND school_id = ?',
      [resultingQty, id, req.school.id]
    );
    await synchronizeBookItems(connection, req.school.id, id, resultingQty, book.rack_id);
    const [movement] = await connection.execute(
      `INSERT INTO book_stock_movements
       (school_id, book_id, actor_id, quantity_added, previous_qty, resulting_qty, stock_date, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.school.id, id, req.school.userId, quantity, previousQty, resultingQty, stockDate, normalizedNote || null]
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({
      book: { id, title: book.title, qty: resultingQty },
      movement: {
        id: String(movement.insertId),
        quantity_added: quantity,
        previous_qty: previousQty,
        resulting_qty: resultingQty,
        stock_date: stockDate,
        note: normalizedNote || null
      }
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
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/stock/history/:id', requireSchoolPermission('books.stock', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ message: 'ID riwayat stok tidak valid.' });
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !Number.isSafeInteger(body.quantity) || body.quantity < 1 || body.quantity > MAX_BOOK_QUANTITY
    || (body.note != null && typeof body.note !== 'string')) {
    return res.status(400).json({ message: `Data riwayat tidak valid. Jumlah harus antara 1 dan ${MAX_BOOK_QUANTITY}.` });
  }
  const stockDateResult = normalizeDate(body, 'stockDate', 'Tanggal');
  if (stockDateResult.error) return res.status(400).json({ message: stockDateResult.error });
  if (!stockDateResult.value) return res.status(400).json({ message: 'Tanggal penambahan stok wajib diisi.' });
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 1000) return res.status(400).json({ message: 'Keterangan maksimal 1000 karakter.' });

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [movements] = await connection.execute(
      `SELECT id, book_id, quantity_added, previous_qty
       FROM book_stock_movements
       WHERE id = ? AND school_id = ? FOR UPDATE`,
      [id, req.school.id]
    );
    const movement = movements[0];
    if (!movement) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Riwayat penambahan stok tidak ditemukan.' });
    }
    const [books] = await connection.execute(
      'SELECT id, qty, rack_id FROM books WHERE id = ? AND school_id = ? FOR UPDATE',
      [movement.book_id, req.school.id]
    );
    if (!books[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Buku pada riwayat stok tidak ditemukan.' });
    }
    const delta = body.quantity - Number(movement.quantity_added);
    const resultingBookQty = Number(books[0].qty) + delta;
    if (resultingBookQty < 0 || resultingBookQty > MAX_BOOK_QUANTITY) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Jumlah stok setelah perubahan berada di luar batas yang diizinkan.' });
    }
    await connection.execute(
      'UPDATE books SET qty = ? WHERE id = ? AND school_id = ?',
      [resultingBookQty, movement.book_id, req.school.id]
    );
    await synchronizeBookItems(connection, req.school.id, String(movement.book_id), resultingBookQty, books[0].rack_id);
    await connection.execute(
      `UPDATE book_stock_movements
       SET quantity_added = ?, resulting_qty = previous_qty + ?, stock_date = ?, note = ?
       WHERE id = ? AND school_id = ?`,
      [body.quantity, body.quantity, stockDateResult.value, note || null, id, req.school.id]
    );
    if (delta) {
      await connection.execute(
        `UPDATE book_stock_movements
         SET previous_qty = previous_qty + ?, resulting_qty = resulting_qty + ?
         WHERE school_id = ? AND book_id = ? AND id > ?`,
        [delta, delta, req.school.id, movement.book_id, id]
      );
    }
    await connection.commit();
    transactionStarted = false;
    return res.json({
      message: 'Riwayat penambahan stok berhasil diperbarui.',
      book: { id: String(movement.book_id), qty: resultingBookQty }
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
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.delete('/stock/history', requireSchoolPermission('books.stock', 'delete'), async (req, res, next) => {
  const rawIds = req.body?.movementIds;
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 500) {
    return res.status(400).json({ message: 'Pilih 1 sampai 500 riwayat stok untuk dihapus.' });
  }
  const ids = [...new Set(rawIds.map(String))];
  if (ids.length !== rawIds.length || ids.some((id) => !/^[1-9]\d*$/.test(id))) {
    return res.status(400).json({ message: 'Daftar riwayat stok yang dipilih tidak valid.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const placeholders = ids.map(() => '?').join(', ');
    const [movements] = await connection.execute(
      `SELECT id, book_id, quantity_added
       FROM book_stock_movements
       WHERE school_id = ? AND id IN (${placeholders})
       ORDER BY book_id, id FOR UPDATE`,
      [req.school.id, ...ids]
    );
    if (movements.length !== ids.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Sebagian riwayat sudah tidak tersedia. Segarkan daftar lalu coba lagi.' });
    }

    const groups = new Map();
    movements.forEach((movement) => {
      const bookId = String(movement.book_id);
      if (!groups.has(bookId)) groups.set(bookId, []);
      groups.get(bookId).push(movement);
    });
    for (const [bookId, bookMovements] of groups) {
      const [books] = await connection.execute(
        'SELECT id, qty, rack_id FROM books WHERE id = ? AND school_id = ? FOR UPDATE',
        [bookId, req.school.id]
      );
      if (!books[0]) {
        const error = new Error('Buku pada riwayat stok tidak ditemukan.');
        error.status = 409;
        throw error;
      }
      const removedQuantity = bookMovements.reduce((total, movement) => total + Number(movement.quantity_added), 0);
      const resultingQty = Number(books[0].qty) - removedQuantity;
      if (resultingQty < 0) {
        const error = new Error('Stok buku tidak mencukupi untuk menghapus riwayat yang dipilih.');
        error.status = 409;
        throw error;
      }
      await connection.execute(
        'UPDATE books SET qty = ? WHERE id = ? AND school_id = ?',
        [resultingQty, bookId, req.school.id]
      );
      await synchronizeBookItems(connection, req.school.id, bookId, resultingQty, books[0].rack_id);
      for (const movement of bookMovements) {
        await connection.execute(
          `UPDATE book_stock_movements
           SET previous_qty = previous_qty - ?, resulting_qty = resulting_qty - ?
           WHERE school_id = ? AND book_id = ? AND id > ?`,
          [movement.quantity_added, movement.quantity_added, req.school.id, bookId, movement.id]
        );
      }
      const bookMovementIds = bookMovements.map((movement) => String(movement.id));
      await connection.execute(
        `DELETE FROM book_stock_movements
         WHERE school_id = ? AND book_id = ? AND id IN (${bookMovementIds.map(() => '?').join(', ')})`,
        [req.school.id, bookId, ...bookMovementIds]
      );
    }
    await connection.commit();
    transactionStarted = false;
    return res.json({ deleted: movements.length, message: `${movements.length} riwayat penambahan stok berhasil dihapus.` });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        return next(error);
      }
    }
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.get('/:id/assets/:kind', requireSchoolPermission('books.catalog', 'view'), async (req, res, next) => {
  const id = String(req.params.id);
  const column = req.params.kind === 'cover' ? 'cover_image'
    : req.params.kind === 'digital' ? 'file_digital' : null;
  if (!/^[1-9]\d*$/.test(id) || !column) {
    return res.status(404).json({ message: 'File buku tidak ditemukan.' });
  }
  try {
    const [rows] = await pool.execute(
      `SELECT ${column} AS filename FROM books WHERE id = ? AND school_id = ? LIMIT 1`,
      [id, req.school.id]
    );
    const filename = rows[0]?.filename;
    if (!filename || path.basename(filename) !== filename || !/^[a-f0-9-]+\.(jpg|png|webp|pdf)$/i.test(filename)) {
      return res.status(404).json({ message: 'File buku tidak ditemukan.' });
    }
    const filePath = path.join(bookStorageRoot, String(req.school.id), filename);
    const headers = req.params.kind === 'digital'
      ? { 'Content-Disposition': 'attachment' }
      : { 'Content-Disposition': 'inline' };
    return res.sendFile(filePath, { headers }, (error) => {
      if (!error || res.headersSent) return;
      if (error.code === 'ENOENT') return res.status(404).json({ message: 'File buku tidak ditemukan.' });
      return next(error);
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', requireSchoolPermission('books.catalog', 'view'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ message: 'ID buku tidak valid.' });
  try {
    const [books] = await pool.execute(
      `${bookSelectSql()} WHERE b.id = ? AND b.school_id = ? LIMIT 1`,
      [id, req.school.id]
    );
    if (!books[0]) return res.status(404).json({ message: 'Buku tidak ditemukan.' });
    return res.json({ book: books[0] });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireSchoolPermission('books.catalog', 'edit'), uploadBookAssets, async (req, res, next) => {
  let connection;
  let transactionStarted = false;
  let filesSaved = false;
  try {
    const fileError = await validateUploadedFiles(req);
    if (fileError) {
      await removeUploadedFiles(req);
      return res.status(400).json({ message: fileError });
    }
    const normalized = normalizeBook(req.body);
    if (normalized.error) {
      await removeUploadedFiles(req);
      return res.status(400).json({ message: normalized.error });
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const categoryError = await resolveManualCategories(connection, req.school.id, normalized.value, req.body.category_names);
    if (categoryError) {
      await connection.rollback();
      transactionStarted = false;
      await removeUploadedFiles(req);
      return res.status(400).json({ message: categoryError });
    }
    const referenceError = await validateCategoryReferences(connection, req.school.id, normalized.value);
    if (referenceError) {
      await connection.rollback();
      transactionStarted = false;
      await removeUploadedFiles(req);
      return res.status(400).json({ message: referenceError });
    }
    const id = await insertBook(connection, req.school.id, normalized.value, {
      cover: uploadedFile(req, 'cover'),
      digitalAttachment: uploadedFile(req, 'digitalAttachment')
    });
    await connection.commit();
    transactionStarted = false;
    filesSaved = true;
    return res.status(201).json({ book: { id: String(id), ...normalized.value } });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error = rollbackError;
      }
    }
    if (!filesSaved) {
      try {
        await removeUploadedFiles(req);
      } catch (cleanupError) {
        return next(cleanupError);
      }
    }
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Nomor induk tersebut sudah digunakan pada katalog sekolah ini.' });
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/:id', requireSchoolPermission('books.catalog', 'edit'), uploadBookAssets, async (req, res, next) => {
  const id = String(req.params.id);
  if (!/^[1-9]\d*$/.test(id)) {
    try {
      await removeUploadedFiles(req);
    } catch (error) {
      return next(error);
    }
    return res.status(400).json({ message: 'ID buku tidak valid.' });
  }

  let connection;
  let transactionStarted = false;
  let filesSaved = false;
  let replacedFiles = null;
  try {
    const fileError = await validateUploadedFiles(req);
    if (fileError) {
      await removeUploadedFiles(req);
      return res.status(400).json({ message: fileError });
    }
    const normalized = normalizeBook(req.body);
    if (normalized.error) {
      await removeUploadedFiles(req);
      return res.status(400).json({ message: normalized.error });
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [existingRows] = await connection.execute(
      `SELECT no_terima, received_date, kode_buku, source, qty, cover_image, file_digital FROM books
       WHERE id = ? AND school_id = ? FOR UPDATE`,
      [id, req.school.id]
    );
    const existing = existingRows[0];
    if (!existing) {
      await connection.rollback();
      transactionStarted = false;
      await removeUploadedFiles(req);
      return res.status(404).json({ message: 'Buku tidak ditemukan.' });
    }
    const categoryError = await resolveManualCategories(connection, req.school.id, normalized.value, req.body.category_names);
    if (categoryError) {
      await connection.rollback();
      transactionStarted = false;
      await removeUploadedFiles(req);
      return res.status(400).json({ message: categoryError });
    }
    const referenceError = await validateCategoryReferences(connection, req.school.id, normalized.value);
    if (referenceError) {
      await connection.rollback();
      transactionStarted = false;
      await removeUploadedFiles(req);
      return res.status(400).json({ message: referenceError });
    }
    const book = {
      ...normalized.value,
      no_terima: existing.no_terima,
      received_date: existing.received_date,
      kode_buku: existing.kode_buku,
      source: existing.source,
      qty: Number(existing.qty)
    };
    const cover = uploadedFile(req, 'cover');
    const digitalAttachment = uploadedFile(req, 'digitalAttachment');
    const removeCover = req.body.remove_cover === 'true';
    const removeDigital = req.body.remove_digital === 'true';
    const nextCover = cover ? cover.filename : removeCover ? null : existing.cover_image;
    const nextDigital = digitalAttachment ? digitalAttachment.filename : removeDigital ? null : existing.file_digital;
    replacedFiles = [
      cover || removeCover ? existing.cover_image : null,
      digitalAttachment || removeDigital ? existing.file_digital : null
    ].filter(Boolean);

    const columns = [
      'no_terima', 'received_date', 'nomor_induk', 'kode_buku', 'title',
      'physical_description', 'author_id', 'publisher_id', 'agent_id', 'topic_id',
      'collection_id', 'type_id', 'language_id', 'gmd', 'isbn', 'year', 'city',
      'source', 'price', 'qty', 'pages', 'rack_id', 'description', 'synopsis'
    ];
    await connection.execute(
      `UPDATE books SET ${columns.map((column) => `${column} = ?`).join(', ')},
       cover_image = ?, file_digital = ? WHERE id = ? AND school_id = ?`,
      [
        ...columns.map((column) => book[column]),
        nextCover, nextDigital, id, req.school.id
      ]
    );
    await synchronizeBookItems(connection, req.school.id, id, book.qty, book.rack_id);
    await connection.commit();
    transactionStarted = false;
    filesSaved = true;
    let fileCleanupWarning = '';
    for (const filename of replacedFiles) {
      try {
        await unlink(path.join(bookStorageRoot, String(req.school.id), filename));
      } catch (error) {
        if (error.code !== 'ENOENT') fileCleanupWarning = 'Perubahan tersimpan, tetapi file lama gagal dibersihkan.';
      }
    }
    return res.json({
      book: { id, ...book, has_cover: Boolean(nextCover), has_digital_attachment: Boolean(nextDigital) },
      warning: fileCleanupWarning
    });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error = rollbackError;
      }
    }
    if (!filesSaved) {
      try {
        await removeUploadedFiles(req);
      } catch (cleanupError) {
        return next(cleanupError);
      }
    }
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Nomor induk tersebut sudah digunakan pada katalog sekolah ini.' });
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.post('/import', requireSchoolPermission('books.catalog', 'edit'), async (req, res, next) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) {
    return res.status(400).json({ message: 'Impor harus berisi 1 sampai 500 baris buku.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    const categories = await loadImportCategories(pool, req.school.id);
    const books = [];
    const bookNumbers = new Set();
    let copyTotal = 0;
    for (let index = 0; index < rows.length; index += 1) {
      if (!rows[index] || typeof rows[index] !== 'object' || Array.isArray(rows[index])) {
        return res.status(400).json({ message: `Baris ${index + 2}: format data tidak valid.` });
      }
      const resolved = resolveImportedBook(rows[index], categories, index + 2);
      if (resolved.error) return res.status(400).json({ message: resolved.error });
      const book = resolved.value;
      if (book.nomor_induk) {
        const key = book.nomor_induk.toLocaleLowerCase('id-ID');
        if (bookNumbers.has(key)) {
          return res.status(400).json({ message: `Baris ${index + 2}: nomor induk duplikat di dalam file.` });
        }
        bookNumbers.add(key);
      }
      copyTotal += book.qty;
      if (copyTotal > 10000) {
        return res.status(400).json({ message: 'Total jumlah eksemplar dalam satu impor maksimal 10.000.' });
      }
      books.push(book);
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    for (const book of books) {
      await insertBook(connection, req.school.id, book);
    }
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({ imported: books.length });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error = rollbackError;
      }
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Impor dibatalkan karena nomor induk sudah terdaftar.' });
    }
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.delete('/', requireSchoolPermission('books.catalog', 'delete'), async (req, res, next) => {
  const ids = normalizeBookIds(req.body?.ids);
  if (!ids) return res.status(400).json({ message: 'Daftar ID buku tidak valid.' });

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const placeholders = ids.map(() => '?').join(', ');
    const [books] = await connection.execute(
      `SELECT id, cover_image, file_digital FROM books
       WHERE school_id = ? AND id IN (${placeholders}) FOR UPDATE`,
      [req.school.id, ...ids]
    );
    const [result] = await connection.execute(
      `DELETE FROM books WHERE school_id = ? AND id IN (${placeholders})`,
      [req.school.id, ...ids]
    );
    await connection.commit();
    transactionStarted = false;

    for (const book of books) {
      for (const filename of [book.cover_image, book.file_digital].filter(Boolean)) {
        try {
          await unlink(path.join(bookStorageRoot, String(req.school.id), filename));
        } catch (error) {
          if (error.code !== 'ENOENT') {
            return res.status(500).json({ message: 'Buku terhapus, tetapi file lampiran gagal dibersihkan.' });
          }
        }
      }
    }
    return res.json({ deleted: result.affectedRows });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error = rollbackError;
      }
    }
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: 'Buku tidak dapat dihapus karena eksemplarnya memiliki riwayat peminjaman.' });
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

export default router;
