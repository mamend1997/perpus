import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ message: 'Email atau kata sandi tidak valid.' });
  }

  try {
    const [admins] = await pool.execute(
      'SELECT id, name, email, password FROM super_admins WHERE email = ? LIMIT 1',
      [email]
    );
    const admin = admins[0];
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ message: 'Email atau kata sandi salah.' });
    }

    const token = jwt.sign(
      { scope: 'super_admin', name: admin.name, email: admin.email },
      process.env.JWT_SECRET,
      { subject: String(admin.id), expiresIn: '8h' }
    );
    return res.json({
      token,
      admin: { id: admin.id, name: admin.name, email: admin.email }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
