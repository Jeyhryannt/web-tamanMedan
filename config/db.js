require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.connect((err) => {
  if (err) {
    console.error('❌ Gagal terhubung ke PostgreSQL:', err.message);
  } else {
    console.log('✅ Terhubung ke PostgreSQL');
  }
});

module.exports = pool;
