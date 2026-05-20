// config/db.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.connect((err) => {
  if (err) {
    console.error('❌ Gagal terhubung ke PostgreSQL:', err.message);
  } else {
    console.log('✅ Terhubung ke PostgreSQL');
  }
});

module.exports = pool;
