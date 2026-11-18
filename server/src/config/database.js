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

  const host = process.env.DB_HOST || process.env.MYSQLHOST;
  const name = process.env.DB_NAME || process.env.MYSQLDATABASE;
  const user = process.env.DB_USER || process.env.MYSQLUSER;
  if (!host || !name || !user) {
    throw new Error(
      'MySQL configuration is missing. Set DATABASE_URL/MYSQL_URL, DB_HOST/DB_NAME/DB_USER, or Railway MYSQLHOST/MYSQLDATABASE/MYSQLUSER variables.'
    );
  }

  return {
    host,
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user,
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: name,
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true
  };
}

export const pool = mysql.createPool(getDatabaseConfig());
