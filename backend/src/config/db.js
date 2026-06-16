const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'zesto_db_2',
  connectionLimit: 5,
  acquireTimeout: 10000
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MariaDB connected successfully');
    conn.release();
  } catch (err) {
    console.error('❌ MariaDB connection failed:', err.message);
    process.exit(1); // stop server cleanly
  }
}

async function query(sql, params) {
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query(sql, params);
    
    // MariaDB promise mode returns [rows, metadata] for SELECT
    // or an object with insertId for INSERT/UPDATE/DELETE
    // Handle both cases
    if (Array.isArray(result)) {
      // If it's [rows, metadata], result[0] is the rows array
      if (Array.isArray(result[0])) {
        return result[0];
      }
      // If result is already the rows array
      return result;
    }
    
    // For INSERT/UPDATE/DELETE, return the result object (has insertId, affectedRows, etc)
    return result;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { query, testConnection };
