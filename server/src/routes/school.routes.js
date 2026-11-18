import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSchool } from '../middleware/require-school.js';

const router = Router();

router.use(requireSchool);

router.get('/dashboard', async (req, res, next) => {
  try {
    const schoolId = req.school.id;
    const [[stats]] = await pool.execute(
      `SELECT
         (SELECT COUNT(*) FROM visitors WHERE school_id = ?) AS total_visitors,
         (SELECT COUNT(*) FROM book_items
          WHERE school_id = ? AND status IN ('Tersedia', 'Dipinjam')) AS active_books,
         (SELECT COUNT(*) FROM loans
          WHERE school_id = ? AND status = 'Borrowed') AS active_loans,
         (SELECT COUNT(*) FROM procurements
          WHERE school_id = ? AND status = 'Pending') AS pending_procurements`,
      [schoolId, schoolId, schoolId, schoolId]
    );
    const [recentProcurements] = await pool.execute(
      `SELECT p.id, p.title, p.author, p.publisher, p.request_date, p.status, u.name AS requester
       FROM procurements p
       JOIN users u ON u.id = p.user_id AND u.school_id = p.school_id
       WHERE p.school_id = ?
       ORDER BY p.created_at DESC
       LIMIT 5`,
      [schoolId]
    );
    const [availabilityByCategory] = await pool.execute(
      `SELECT mc.id, mc.name,
              COUNT(bi.id) AS total_items,
              SUM(CASE WHEN bi.status = 'Tersedia' THEN 1 ELSE 0 END) AS available_items
       FROM master_categories mc
       LEFT JOIN books b ON b.school_id = mc.school_id AND b.collection_id = mc.id
       LEFT JOIN book_items bi ON bi.school_id = b.school_id AND bi.book_id = b.id
       WHERE mc.school_id = ? AND mc.type = 'koleksi' AND mc.status = 'active'
       GROUP BY mc.id, mc.name
       ORDER BY mc.name`,
      [schoolId]
    );

    return res.json({
      school: {
        id: req.school.id,
        name: req.school.name,
        code: req.school.code,
        packageType: req.school.packageType,
        status: req.school.status
      },
      stats: {
        visitors: Number(stats.total_visitors),
        activeBooks: Number(stats.active_books),
        activeLoans: Number(stats.active_loans),
        pendingProcurements: Number(stats.pending_procurements)
      },
      recentProcurements,
      availabilityByCategory: availabilityByCategory.map((category) => ({
        ...category,
        total_items: Number(category.total_items),
        available_items: Number(category.available_items)
      }))
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
