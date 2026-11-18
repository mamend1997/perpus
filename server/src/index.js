import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './config/database.js';
import authRoutes from './routes/auth.routes.js';
import schoolRoutes from './routes/school.routes.js';
import superAdminRoutes from './routes/super-admin.routes.js';
import publicLibraryRoutes from './routes/public-library.routes.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters.');
}

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(error);
  }
});
app.use('/api/auth', authRoutes);
app.use('/api/public/library', publicLibraryRoutes);
app.use('/api/school', schoolRoutes);
app.use('/api/super-admin', superAdminRoutes);

const clientDistPath = fileURLToPath(new URL('../../client/dist/', import.meta.url));
app.use(express.static(clientDistPath));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Ukuran permintaan maksimal 5 MB.' });
  }
  res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`e-Perpustakaan API listening on http://localhost:${port}`));
