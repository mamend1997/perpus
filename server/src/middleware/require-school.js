import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';

export async function requireSchool(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ message: 'Silakan masuk ke akun sekolah.' });
  }

  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Sesi sekolah tidak valid atau telah berakhir.' });
  }
  if (claims.scope !== 'school' || !claims.schoolId || !claims.sub) {
    return res.status(403).json({ message: 'Akses khusus akun sekolah.' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.role, s.id AS school_id, s.name AS school_name,
              s.school_code, s.package_type, s.status AS school_status
       FROM users u
       JOIN tenants_schools s ON s.id = u.school_id
       WHERE u.id = ? AND u.school_id = ? AND u.status = 'active' AND s.status = 'active'
         AND (u.role <> 'member' OR u.is_library_member = 1)
       LIMIT 1`,
      [claims.sub, claims.schoolId]
    );
    if (!rows[0]) {
      return res.status(401).json({ message: 'Akun sekolah tidak aktif.' });
    }

    req.school = {
      id: rows[0].school_id,
      name: rows[0].school_name,
      code: rows[0].school_code,
      packageType: rows[0].package_type,
      status: rows[0].school_status,
      userId: rows[0].id,
      userName: rows[0].name,
      email: rows[0].email,
      role: rows[0].role
    };
    return next();
  } catch (error) {
    return next(error);
  }
}
