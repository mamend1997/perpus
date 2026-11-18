import jwt from 'jsonwebtoken';

export function requireSuperAdmin(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ message: 'Silakan masuk untuk melanjutkan.' });
  }

  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    if (claims.scope !== 'super_admin') {
      return res.status(403).json({ message: 'Akses khusus Super Admin.' });
    }
    req.admin = { id: claims.sub, name: claims.name, email: claims.email };
    return next();
  } catch {
    return res.status(401).json({ message: 'Sesi tidak valid atau telah berakhir.' });
  }
}
