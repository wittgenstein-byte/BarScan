/* ─────────────────────────────────────────────
   routes/models.js — Model management
   ───────────────────────────────────────────── */
'use strict';

const express = require('express');
const router  = express.Router();
const pool    = require('../db');

// ── GET /api/models ───────────────────────────
// ดึง model ทั้งหมด เรียงตามชื่อ
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM models ORDER BY name ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/models]', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// ── POST /api/models ──────────────────────────
// สร้าง model ใหม่
router.post('/', async (req, res) => {
  const { name } = req.body ?? {};

  if (!name || String(name).trim().length === 0) {
    return res.status(400).json({ error: 'name is required' });
  }

  const trimmed = String(name).trim();

  try {
    // ตรวจชื่อซ้ำ
    const [existing] = await pool.query(
      'SELECT id FROM models WHERE name = ?',
      [trimmed]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Model name already exists', id: existing[0].id });
    }

    const [result] = await pool.query(
      'INSERT INTO models (name, created_at) VALUES (?, NOW())',
      [trimmed]
    );
    const [rows] = await pool.query(
      'SELECT * FROM models WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /api/models]', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

module.exports = router;
