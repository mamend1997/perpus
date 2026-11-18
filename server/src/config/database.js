import mysql from 'mysql2/promise';

function getDatabaseConfig() {
  const connectionString = process.env.DATABASE_URL || process.env.MYSQL_URL;
  if (connectionString) {
    const url = new URL(connectionString);
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      waitForConnections: true,
      connectionLimit: 10,
      decimalNumbers: true
    };
  }

  const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  if (!DB_HOST || !DB_NAME || !DB_USER) {
    throw new Error('Set DATABASE_URL (Railway) or DB_HOST, DB_NAME, and DB_USER.');
  }

  return {
    host: DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: DB_USER,
    password: DB_PASSWORD || '',
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true
  };
}

export const pool = mysql.createPool(getDatabaseConfig());
