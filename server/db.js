/* ─────────────────────────────────────────────
   db.js — MySQL connection pool (mysql2/promise)
   ───────────────────────────────────────────── */
'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3306', 10),
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASS     || '',
  database: process.env.DB_NAME     || 'barscan',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  // SSL — เปิดใช้สำหรับ cloud databases ที่ต้องการ
  ...(process.env.DB_SSL === 'true' && {
    ssl: { rejectUnauthorized: false },
  }),
});

module.exports = pool;
