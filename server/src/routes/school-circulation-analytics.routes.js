import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';

const router = Router();
const maximumRangeDays = 366 * 5 + 2;

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function formatBucketLabel(bucket, granularity) {
  const [year, month, day] = bucket.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day || 1));
  return granularity === 'month'
    ? new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date)
    : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date);
}

function createBuckets(startDate, endDate, granularity) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (granularity === 'month') start.setUTCDate(1);
  const buckets = [];
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + (granularity === 'month' ? 0 : 1))) {
    const bucket = granularity === 'month'
      ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
      : date.toISOString().slice(0, 10);
    buckets.push(bucket);
    if (granularity === 'month') date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return buckets;
}

router.get('/', requireSchoolPermission('circulation.analytics', 'view'), async (req, res, next) => {
  const { startDate, endDate } = req.query;
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return res.status(400).json({ message: 'Tanggal mulai dan tanggal akhir harus valid dengan format YYYY-MM-DD.' });
  }
  const days = (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86400000 + 1;
  if (days < 1) return res.status(400).json({ message: 'Tanggal mulai tidak boleh melewati tanggal akhir.' });
  if (days > maximumRangeDays) return res.status(400).json({ message: 'Rentang analitik maksimal lima tahun.' });

  const granularity = days > 92 ? 'month' : 'day';
  const sqlDateFormat = granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';
  const schoolId = req.school.id;
  const dateValues = [schoolId, startDate, endDate];

  try {
    const [
      [[borrowedRow]],
      [[returnRow]],
      [[copyRow]],
      [borrowTrend],
      [returnTrend],
      [topCollections],
      [topMembers]
    ] = await Promise.all([
      pool.execute(
        `SELECT COUNT(*) AS total_borrowed
         FROM loans
         WHERE school_id = ? AND status IN ('Borrowed', 'Returned')
           AND borrow_date >= ? AND borrow_date < DATE_ADD(?, INTERVAL 1 DAY)`,
        dateValues
      ),
      pool.execute(
        `SELECT
           SUM(CASE WHEN return_date <= due_date THEN 1 ELSE 0 END) AS returned_on_time,
           SUM(CASE WHEN return_date > due_date THEN 1 ELSE 0 END) AS returned_late,
           COALESCE(SUM(fine_amount), 0) AS fine_amount,
           COALESCE(SUM(CASE WHEN fine_status = 'paid' THEN fine_amount ELSE 0 END), 0) AS fine_paid
         FROM loans
         WHERE school_id = ? AND status = 'Returned'
           AND return_date >= ? AND return_date < DATE_ADD(?, INTERVAL 1 DAY)`,
        dateValues
      ),
      pool.execute(
        `SELECT COUNT(*) AS total_copies FROM book_items
         WHERE school_id = ? AND status <> 'Rusak'`,
        [schoolId]
      ),
      pool.execute(
        `SELECT DATE_FORMAT(borrow_date, '${sqlDateFormat}') AS bucket, COUNT(*) AS total
         FROM loans
         WHERE school_id = ? AND status IN ('Borrowed', 'Returned')
           AND borrow_date >= ? AND borrow_date < DATE_ADD(?, INTERVAL 1 DAY)
         GROUP BY bucket ORDER BY bucket`,
        dateValues
      ),
      pool.execute(
        `SELECT DATE_FORMAT(return_date, '${sqlDateFormat}') AS bucket, COUNT(*) AS total
         FROM loans
         WHERE school_id = ? AND status = 'Returned'
           AND return_date >= ? AND return_date < DATE_ADD(?, INTERVAL 1 DAY)
         GROUP BY bucket ORDER BY bucket`,
        dateValues
      ),
      pool.execute(
        `SELECT COALESCE(mc.name, 'Tanpa koleksi') AS name, COUNT(*) AS borrow_count
         FROM loans l
         JOIN book_items bi ON bi.school_id = l.school_id AND bi.id = l.book_item_id
         JOIN books b ON b.school_id = bi.school_id AND b.id = bi.book_id
         LEFT JOIN master_categories mc ON mc.school_id = b.school_id AND mc.id = b.collection_id
           AND mc.type = 'koleksi'
         WHERE l.school_id = ? AND l.status IN ('Borrowed', 'Returned')
           AND l.borrow_date >= ? AND l.borrow_date < DATE_ADD(?, INTERVAL 1 DAY)
         GROUP BY mc.id, mc.name
         ORDER BY borrow_count DESC, name ASC
         LIMIT 8`,
        dateValues
      ),
      pool.execute(
        `SELECT u.id, u.name, u.role, COUNT(*) AS borrow_count
         FROM loans l
         JOIN users u ON u.school_id = l.school_id AND u.id = l.user_id
         WHERE l.school_id = ? AND l.status IN ('Borrowed', 'Returned')
           AND l.borrow_date >= ? AND l.borrow_date < DATE_ADD(?, INTERVAL 1 DAY)
         GROUP BY u.id, u.name, u.role
         ORDER BY borrow_count DESC, u.name ASC
         LIMIT 10`,
        dateValues
      )
    ]);

    const borrowedByBucket = new Map(borrowTrend.map((row) => [row.bucket, Number(row.total)]));
    const returnedByBucket = new Map(returnTrend.map((row) => [row.bucket, Number(row.total)]));
    const trend = createBuckets(startDate, endDate, granularity).map((bucket) => ({
      bucket,
      label: formatBucketLabel(bucket, granularity),
      borrowed: borrowedByBucket.get(bucket) || 0,
      returned: returnedByBucket.get(bucket) || 0
    }));
    const totalBorrowed = Number(borrowedRow.total_borrowed);
    const totalCopies = Number(copyRow.total_copies);

    return res.json({
      period: { startDate, endDate, days, granularity },
      stats: {
        totalBorrowed,
        returnedOnTime: Number(returnRow.returned_on_time || 0),
        returnedLate: Number(returnRow.returned_late || 0),
        fineAmount: Number(returnRow.fine_amount || 0),
        finePaidAmount: Number(returnRow.fine_paid || 0),
        totalCopies,
        turnoverRate: totalCopies ? Math.round((totalBorrowed / totalCopies) * 10000) / 100 : 0
      },
      trend,
      topCollections: topCollections.map((row) => ({ name: row.name, borrowCount: Number(row.borrow_count) })),
      topMembers: topMembers.map((row) => ({
        id: String(row.id),
        name: row.name,
        role: row.role,
        borrowCount: Number(row.borrow_count)
      }))
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
