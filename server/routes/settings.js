/* ─────────────────────────────────────────────
   routes/settings.js — Read / Write settings
   ───────────────────────────────────────────── */
'use strict';

const express = require('express');
const router  = express.Router();
const pool    = require('../db');

// ── GET /api/settings ─────────────────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM settings WHERE id = 1'
    );
    if (rows.length === 0) {
      return res.json({ id: 1, double_scan_ms: 2000, hw_group_ms: 500 });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /api/settings]', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// ── PUT /api/settings ─────────────────────────
router.put('/', async (req, res) => {
  const { double_scan_ms, hw_group_ms } = req.body ?? {};

  const dms = parseInt(double_scan_ms, 10);
  const hms = parseInt(hw_group_ms, 10);

  if (isNaN(dms) || isNaN(hms) || dms < 0 || hms < 0) {
    return res.status(400).json({
      error: 'double_scan_ms and hw_group_ms must be non-negative integers',
    });
  }

  try {
    await pool.query(
      `INSERT INTO settings (id, double_scan_ms, hw_group_ms)
       VALUES (1, ?, ?)
       ON DUPLICATE KEY UPDATE double_scan_ms = VALUES(double_scan_ms),
                               hw_group_ms    = VALUES(hw_group_ms)`,
      [dms, hms]
    );
    const [rows] = await pool.query(
      'SELECT * FROM settings WHERE id = 1'
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[PUT /api/settings]', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

module.exports = router;
