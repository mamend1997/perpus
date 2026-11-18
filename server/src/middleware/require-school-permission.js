import { pool } from '../config/database.js';

const permissionColumns = {
  view: 'can_view',
  edit: 'can_edit',
  delete: 'can_delete'
};

export function requireSchoolPermission(feature, action) {
  return async (req, res, next) => {
    const featureKey = typeof feature === 'function' ? feature(req) : feature;
    const permissionColumn = permissionColumns[action];
    if (!featureKey || !permissionColumn) {
      return res.status(400).json({ message: 'Hak akses yang diminta tidak valid.' });
    }
    if (req.school.role === 'admin') return next();

    try {
      const [rows] = await pool.execute(
        `SELECT ${permissionColumn} AS allowed
         FROM school_role_permissions
         WHERE school_id = ? AND role = ? AND feature_key = ?
         LIMIT 1`,
        [req.school.id, req.school.role, featureKey]
      );
      const allowed = rows.length > 0
        ? Boolean(rows[0].allowed)
        : featureKey === 'dashboard' && action === 'view';
      if (!allowed) {
        return res.status(403).json({ message: 'Anda tidak memiliki izin untuk tindakan ini.' });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
