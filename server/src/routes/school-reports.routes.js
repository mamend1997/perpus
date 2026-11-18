import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';

const router = Router();
const reportTypes = new Set(['loans', 'fines', 'visitors', 'inventory']);
const validId = (value) => /^[1-9]\d*$/.test(String(value ?? ''));
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parsePage(value, fallback, maximum) {
  const parsed = value == null ? fallback : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function parseDateRange(query) {
  const today = new Date();
  const todayString = today.toISOString().slice(0, 10);
  const monthStart = `${todayString.slice(0, 8)}01`;
  const startDate = typeof query.startDate === 'string' ? query.startDate : monthStart;
  const endDate = typeof query.endDate === 'string' ? query.endDate : todayString;
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) return null;
  return { startDate, endDate };
}

router.get('/', requireSchoolPermission('reports.monthly', 'view'), async (req, res, next) => {
  const type = typeof req.query.type === 'string' ? req.query.type : 'loans';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const className = typeof req.query.className === 'string' ? req.query.className.trim() : '';
  const academicYearId = typeof req.query.academicYearId === 'string' ? req.query.academicYearId : '';
  const page = parsePage(req.query.page, 1, 1000000);
  const limit = parsePage(req.query.limit, 25, 100);
  if (!reportTypes.has(type)) return res.status(400).json({ message: 'Jenis laporan tidak valid.' });
  if (search.length > 100 || className.length > 80) {
    return res.status(400).json({ message: 'Pencarian atau nama kelas terlalu panjang.' });
  }
  if (!page || !limit) return res.status(400).json({ message: 'Nomor halaman atau jumlah baris tidak valid.' });
  if (academicYearId && !validId(academicYearId)) {
    return res.status(400).json({ message: 'Tahun pelajaran tidak valid.' });
  }

  let dateRange = parseDateRange(req.query);
  if (!dateRange) return res.status(400).json({ message: 'Rentang tanggal laporan tidak valid.' });

  try {
    if (academicYearId) {
      const [years] = await pool.execute(
        `SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
         FROM school_years WHERE id = ? AND school_id = ? LIMIT 1`,
        [academicYearId, req.school.id]
      );
      if (!years[0]) return res.status(404).json({ message: 'Tahun pelajaran tidak ditemukan.' });
      dateRange = {
        startDate: years[0].start_date,
        endDate: years[0].end_date
      };
    }

    const values = [req.school.id];
    let from;
    let conditions = [];
    let countSql;
    let rowsSql;
    let summarySql;
    let columns;

    if (type === 'loans') {
      from = `FROM loans l
        JOIN users u ON u.school_id = l.school_id AND u.id = l.user_id
        JOIN book_items bi ON bi.school_id = l.school_id AND bi.id = l.book_item_id
        JOIN books b ON b.school_id = bi.school_id AND b.id = bi.book_id`;
      conditions = ['l.school_id = ?', 'l.borrow_date BETWEEN ? AND ?'];
      values.push(dateRange.startDate, dateRange.endDate);
      if (className) {
        conditions.push('u.rombel = ?');
        values.push(className);
      }
      if (search) {
        conditions.push('(CAST(l.id AS CHAR) LIKE ? OR u.name LIKE ? OR COALESCE(u.nis_nisn, \'\') LIKE ? OR b.title LIKE ?)');
        values.push(...Array(4).fill(`%${search}%`));
      }
      countSql = `SELECT COUNT(*) AS total ${from} WHERE ${conditions.join(' AND ')}`;
      rowsSql = `SELECT l.id, u.name AS member_name, u.nis_nisn, u.rombel, b.title AS book_title,
          bi.serial_number, l.borrow_date, l.due_date, l.return_date,
          CASE WHEN l.status = 'Borrowed' AND l.due_date < CURRENT_DATE THEN 'Terlambat'
               WHEN l.status = 'Borrowed' THEN 'Dipinjam'
               WHEN l.status = 'Returned' THEN 'Dikembalikan'
               WHEN l.status = 'Rejected' THEN 'Ditolak' ELSE l.status END AS status,
          l.fine_amount, l.fine_status
        ${from} WHERE ${conditions.join(' AND ')}
        ORDER BY l.borrow_date DESC, l.id DESC LIMIT ? OFFSET ?`;
      summarySql = `SELECT COUNT(*) AS total,
          SUM(l.status IN ('Pending', 'Borrowed')) AS active,
          SUM(l.status = 'Returned') AS returned,
          SUM(l.status = 'Borrowed' AND l.due_date < CURRENT_DATE) AS overdue
        ${from} WHERE ${conditions.join(' AND ')}`;
      columns = [
        ['id', 'ID Transaksi'], ['member_name', 'Nama Anggota'], ['nis_nisn', 'NIS/NISN'],
        ['rombel', 'Kelas'], ['book_title', 'Judul Buku'], ['serial_number', 'Nomor Eksemplar'],
        ['borrow_date', 'Tanggal Pinjam'], ['due_date', 'Batas Kembali'], ['return_date', 'Tanggal Kembali'],
        ['status', 'Status'], ['fine_amount', 'Denda'], ['fine_status', 'Status Denda']
      ];
    } else if (type === 'fines') {
      from = `FROM loans l
        JOIN users u ON u.school_id = l.school_id AND u.id = l.user_id
        JOIN book_items bi ON bi.school_id = l.school_id AND bi.id = l.book_item_id
        JOIN books b ON b.school_id = bi.school_id AND b.id = bi.book_id`;
      conditions = [
        'l.school_id = ?',
        "l.status = 'Returned'",
        'l.fine_amount > 0',
        'l.return_date BETWEEN ? AND ?'
      ];
      values.push(dateRange.startDate, dateRange.endDate);
      if (className) {
        conditions.push('u.rombel = ?');
        values.push(className);
      }
      if (search) {
        conditions.push('(CAST(l.id AS CHAR) LIKE ? OR u.name LIKE ? OR COALESCE(u.nis_nisn, \'\') LIKE ? OR b.title LIKE ?)');
        values.push(...Array(4).fill(`%${search}%`));
      }
      countSql = `SELECT COUNT(*) AS total ${from} WHERE ${conditions.join(' AND ')}`;
      rowsSql = `SELECT l.id, u.name AS member_name, u.nis_nisn, u.rombel, b.title AS book_title,
          l.return_date, GREATEST(DATEDIFF(l.return_date, l.due_date), 0) AS days_late,
          l.fine_amount, l.fine_status
        ${from} WHERE ${conditions.join(' AND ')}
        ORDER BY l.return_date DESC, l.id DESC LIMIT ? OFFSET ?`;
      summarySql = `SELECT COUNT(*) AS total,
          COALESCE(SUM(l.fine_amount), 0) AS total_fine,
          COALESCE(SUM(CASE WHEN l.fine_status = 'paid' THEN l.fine_amount ELSE 0 END), 0) AS collected,
          COALESCE(SUM(CASE WHEN l.fine_status = 'unpaid' THEN l.fine_amount ELSE 0 END), 0) AS outstanding
        ${from} WHERE ${conditions.join(' AND ')}`;
      columns = [
        ['id', 'ID Transaksi'], ['member_name', 'Nama Anggota'], ['nis_nisn', 'NIS/NISN'],
        ['rombel', 'Kelas'], ['book_title', 'Judul Buku'], ['return_date', 'Tanggal Kembali'],
        ['days_late', 'Terlambat (Hari)'], ['fine_amount', 'Jumlah Denda'], ['fine_status', 'Status Pembayaran']
      ];
    } else if (type === 'visitors') {
      from = `FROM visitors v
        LEFT JOIN users u ON u.school_id = v.school_id AND u.id = v.user_id`;
      conditions = ['v.school_id = ?', 'v.visit_date >= ?', 'v.visit_date < DATE_ADD(?, INTERVAL 1 DAY)'];
      values.push(dateRange.startDate, dateRange.endDate);
      if (className) {
        conditions.push('u.rombel = ?');
        values.push(className);
      }
      if (search) {
        conditions.push('(u.name LIKE ? OR COALESCE(u.nis_nisn, \'\') LIKE ? OR v.purpose LIKE ?)');
        values.push(...Array(3).fill(`%${search}%`));
      }
      countSql = `SELECT COUNT(*) AS total ${from} WHERE ${conditions.join(' AND ')}`;
      rowsSql = `SELECT v.id, v.visit_date, COALESCE(u.name, 'Pengunjung') AS member_name,
          u.nis_nisn, u.rombel, v.purpose
        ${from} WHERE ${conditions.join(' AND ')}
        ORDER BY v.visit_date DESC, v.id DESC LIMIT ? OFFSET ?`;
      summarySql = `SELECT COUNT(*) AS total, COUNT(DISTINCT v.user_id) AS unique_visitors
        ${from} WHERE ${conditions.join(' AND ')}`;
      columns = [
        ['visit_date', 'Waktu Masuk'], ['member_name', 'Nama Pengunjung'], ['nis_nisn', 'NIS/NISN'],
        ['rombel', 'Kelas'], ['purpose', 'Keperluan']
      ];
    } else {
      from = `FROM books b
        LEFT JOIN master_categories author ON author.school_id = b.school_id AND author.id = b.author_id
        LEFT JOIN master_categories publisher ON publisher.school_id = b.school_id AND publisher.id = b.publisher_id
        LEFT JOIN book_items bi ON bi.school_id = b.school_id AND bi.book_id = b.id`;
      conditions = ['b.school_id = ?'];
      if (search) {
        conditions.push('(b.title LIKE ? OR COALESCE(author.name, \'\') LIKE ? OR COALESCE(publisher.name, \'\') LIKE ? OR COALESCE(b.nomor_induk, \'\') LIKE ?)');
        values.push(...Array(4).fill(`%${search}%`));
      }
      countSql = `SELECT COUNT(DISTINCT b.id) AS total ${from} WHERE ${conditions.join(' AND ')}`;
      rowsSql = `SELECT b.id, b.title AS book_title, author.name AS author_name,
          publisher.name AS publisher_name, b.\`year\`, b.nomor_induk,
          COUNT(bi.id) AS total_items,
          SUM(bi.status = 'Tersedia') AS available_items,
          SUM(bi.status = 'Dipinjam') AS borrowed_items,
          SUM(bi.status = 'Rusak') AS damaged_items
        ${from} WHERE ${conditions.join(' AND ')}
        GROUP BY b.id, b.title, author.name, publisher.name, b.\`year\`, b.nomor_induk
        ORDER BY b.title ASC LIMIT ? OFFSET ?`;
      summarySql = `SELECT COUNT(DISTINCT b.id) AS total_titles,
          COUNT(bi.id) AS total_items,
          SUM(bi.status = 'Tersedia') AS available_items,
          SUM(bi.status = 'Dipinjam') AS borrowed_items,
          SUM(bi.status = 'Rusak') AS damaged_items
        ${from} WHERE ${conditions.join(' AND ')}`;
      columns = [
        ['book_title', 'Judul Buku'], ['author_name', 'Pengarang'], ['publisher_name', 'Penerbit'],
        ['year', 'Tahun Terbit'], ['nomor_induk', 'Nomor Induk'], ['total_items', 'Total Eksemplar'],
        ['available_items', 'Tersedia'], ['borrowed_items', 'Dipinjam'], ['damaged_items', 'Rusak']
      ];
    }

    const [countRows, rows, summaryRows, schoolRows] = await Promise.all([
      pool.execute(countSql, values),
      pool.execute(rowsSql, [...values, limit, (page - 1) * limit]),
      pool.execute(summarySql, values),
      pool.execute(
        `SELECT name, npsn, address, principal_name, principal_nip, librarian_name, librarian_nip, logo
         FROM tenants_schools WHERE id = ? LIMIT 1`,
        [req.school.id]
      )
    ]);
    if (!schoolRows[0][0]) return res.status(404).json({ message: 'Data sekolah tidak ditemukan.' });
    const total = Number(countRows[0][0].total);
    return res.json({
      type,
      dateRange,
      columns: columns.map(([key, label]) => ({ key, label })),
      rows: rows[0].map((row) => ({
        ...row,
        id: row.id == null ? undefined : String(row.id),
        fine_amount: row.fine_amount == null ? undefined : Number(row.fine_amount),
        total_items: row.total_items == null ? undefined : Number(row.total_items),
        available_items: row.available_items == null ? undefined : Number(row.available_items),
        borrowed_items: row.borrowed_items == null ? undefined : Number(row.borrowed_items),
        damaged_items: row.damaged_items == null ? undefined : Number(row.damaged_items),
        days_late: row.days_late == null ? undefined : Number(row.days_late)
      })),
      summary: Object.fromEntries(
        Object.entries(summaryRows[0][0]).map(([key, value]) => [key, Number(value || 0)])
      ),
      school: schoolRows[0][0],
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
