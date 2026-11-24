import 'dotenv/config';
import { initializeDatabase, pool } from '../src/config/database.js';

try {
  await initializeDatabase();
  console.log('SQLite database schema is ready.');
} finally {
  await pool.end();
}
