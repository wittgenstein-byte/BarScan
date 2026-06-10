-- ═══════════════════════════════════════════════════════
--  BarScan — MySQL Schema Setup
--  รัน script นี้ครั้งเดียวเพื่อสร้าง tables ทั้งหมด
-- ═══════════════════════════════════════════════════════

-- ถ้ายังไม่มี
CREATE DATABASE IF NOT EXISTS barscan
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE barscan;

-- ── scans ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS scans (
  id     BIGINT AUTO_INCREMENT PRIMARY KEY,
  serial VARCHAR(255) NOT NULL,
  model  VARCHAR(255) DEFAULT '',
  type   VARCHAR(50)  DEFAULT 'scanned',
  ts     DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ts (ts),
  INDEX idx_serial (serial)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── models ────────────────────────────────────
CREATE TABLE IF NOT EXISTS models (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── settings (single row, id = 1) ────────────
CREATE TABLE IF NOT EXISTS settings (
  id             INT PRIMARY KEY DEFAULT 1,
  double_scan_ms INT DEFAULT 2000,
  hw_group_ms    INT DEFAULT 500
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default settings row
INSERT INTO settings (id, double_scan_ms, hw_group_ms)
VALUES (1, 2000, 500)
ON DUPLICATE KEY UPDATE id = id;
