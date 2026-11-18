import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSuperAdmin } from '../middleware/require-super-admin.js';

const router = Router();
router.use(requireSuperAdmin);

router.get('/me', (req, res) => res.json({ admin: req.admin }));

router.get('/dashboard', async (req, res, next) => {
  try {
    const [[schoolStats]] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(status = 'active') AS active,
        SUM(status = 'pending') AS pending,
        SUM(status = 'suspended') AS suspended,
        SUM(package_type = 'trial' AND status = 'active') AS trials,
        SUM(package_type = 'lifetime' AND status = 'active') AS lifetime,
        COALESCE(SUM(students_count), 0) AS students
      FROM tenants_schools
    `);
    const [[invoiceStats]] = await pool.query(`
      SELECT
        SUM(status = 'pending_verification') AS pending_verification,
        COALESCE(SUM(CASE WHEN status = 'unpaid' THEN amount ELSE 0 END), 0) AS open_amount
      FROM tenant_invoices
    `);
    const [[ticketStats]] = await pool.query(`
      SELECT COUNT(*) AS new_tickets FROM platform_tickets WHERE status = 'open'
    `);
    const [latestSchools] = await pool.query(`
      SELECT id, name, package_type, status, created_at
      FROM tenants_schools
      ORDER BY created_at DESC
      LIMIT 5
    `);
    const [actions] = await pool.query(`
      SELECT 'invoice' AS type, i.id, s.name AS school_name,
             CONCAT('Verifikasi pembayaran #', i.id) AS description,
             i.created_at
      FROM tenant_invoices i
      JOIN tenants_schools s ON s.id = i.school_id
      WHERE i.status = 'pending_verification'
      UNION ALL
      SELECT 'ticket' AS type, t.id, s.name AS school_name,
             t.subject AS description, t.created_at
      FROM platform_tickets t
      JOIN tenants_schools s ON s.id = t.school_id
      WHERE t.status = 'open'
      ORDER BY created_at DESC
      LIMIT 6
    `);
    const [activities] = await pool.query(`
      SELECT a.id, a.activity, a.ip_address, a.created_at, sa.name AS admin_name
      FROM audit_logs a
      LEFT JOIN super_admins sa ON sa.id = a.admin_id
      ORDER BY a.created_at DESC
      LIMIT 6
    `);

    const total = Number(schoolStats.total || 0);
    return res.json({
      stats: {
        schools: total,
        activeSchools: Number(schoolStats.active || 0),
        pendingSchools: Number(schoolStats.pending || 0),
        suspendedSchools: Number(schoolStats.suspended || 0),
        trialSchools: Number(schoolStats.trials || 0),
        lifetimeSchools: Number(schoolStats.lifetime || 0),
        students: Number(schoolStats.students || 0),
        averageStudents: total ? Math.round(Number(schoolStats.students || 0) / total) : 0,
        pendingVerification: Number(invoiceStats.pending_verification || 0),
        openAmount: Number(invoiceStats.open_amount || 0),
        newTickets: Number(ticketStats.new_tickets || 0)
      },
      latestSchools,
      actions,
      activities
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/billing-check', async (req, res, next) => {
  try {
    const [[result]] = await pool.query(`
      SELECT
        COUNT(*) AS open_invoices,
        COALESCE(SUM(amount), 0) AS open_amount,
        SUM(due_date < CURRENT_DATE AND status = 'unpaid') AS overdue_invoices
      FROM tenant_invoices
      WHERE status IN ('unpaid', 'pending_verification')
    `);
    return res.json({
      checkedAt: new Date().toISOString(),
      openInvoices: Number(result.open_invoices || 0),
      openAmount: Number(result.open_amount || 0),
      overdueInvoices: Number(result.overdue_invoices || 0),
      message: 'Pemeriksaan selesai. Ini hanya ringkasan; tidak membuat tagihan atau menangguhkan sekolah.'
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
