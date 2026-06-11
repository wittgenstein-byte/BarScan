/**
 * init-db.js — สร้าง Tables ใน Database ที่กำหนดใน .env
 * รัน: node init-db.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const queries = [
  `CREATE TABLE IF NOT EXISTS scans (
    id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    serial VARCHAR(255) NOT NULL,
    model  VARCHAR(255) DEFAULT '',
    type   VARCHAR(50)  DEFAULT 'scanned',
    ts     DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ts (ts),
    INDEX idx_serial (serial)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS models (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS settings (
    id             INT PRIMARY KEY DEFAULT 1,
    double_scan_ms INT DEFAULT 2000,
    hw_group_ms    INT DEFAULT 500
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `INSERT INTO settings (id, double_scan_ms, hw_group_ms)
   VALUES (1, 2000, 500)
   ON DUPLICATE KEY UPDATE id = id;`
];

async function initializeDatabase() {
  console.log('\n⚙️  กำลังเชื่อมต่อฐานข้อมูลเพื่อติดตั้ง Tables...');
  console.log(`   Host: ${process.env.DB_HOST}`);
  console.log(`   DB:   ${process.env.DB_NAME}\n`);

  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT || '3306', 10),
    user:     process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ...(process.env.DB_SSL === 'true' && {
      ssl: { rejectUnauthorized: false },
    }),
  });

  try {
    for (let i = 0; i < queries.length; i++) {
      console.log(`Executing step ${i + 1}/${queries.length}...`);
      await conn.query(queries[i]);
    }
    console.log('\n✅Created table: scans, models, and settings');
  } catch (err) {
    console.error('\n❌ เกิดข้อผิดพลาดในการสร้างตาราง:');
    console.error(err.message);
  } finally {
    await conn.end();
  }
}

initializeDatabase().catch(console.error);
