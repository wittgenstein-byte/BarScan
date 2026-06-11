/* ─────────────────────────────────────────────
   routes/scans.js — CRUD + CSV export
   ───────────────────────────────────────────── */
'use strict';

const express = require('express');
const router  = express.Router();
const pool    = require('../db');

// ── GET /api/scans ────────────────────────────
// ดึง scan ทั้งหมด เรียงล่าสุดก่อน
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM scans ORDER BY ts DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/scans]', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// ── GET /api/scans/export/csv ─────────────────
// Download CSV ของ scan ทั้งหมด (server-side)
router.get('/export/csv', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM scans ORDER BY ts DESC'
    );

    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['#', 'ชื่อรุ่น', 'Serial / Barcode', 'Type', 'Timestamp'];
    const lines  = [
      header.map(escape).join(','),
      ...rows.map((r, i) => [
        i + 1,
        r.model || '',
        r.serial,
        r.type,
        new Date(r.ts).toLocaleString('th-TH'),
      ].map(escape).join(',')),
    ];

    const filename = `barscan_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM สำหรับ Excel ภาษาไทย
    res.write('\uFEFF');
    res.end(lines.join('\n'));
  } catch (err) {
    console.error('[GET /api/scans/export/csv]', err);
    res.status(500).json({ error: 'Export failed', detail: err.message });
  }
});

// ── POST /api/scans ───────────────────────────
// บันทึก barcode ใหม่
router.post('/', async (req, res) => {
  const { serial, model = '', type = 'scanned', ts } = req.body ?? {};

  if (!serial || String(serial).trim().length < 2) {
    return res.status(400).json({ error: 'serial is required (min 2 chars)' });
  }

  try {
    const scanTs = ts ? new Date(ts) : new Date();
    const [result] = await pool.query(
      'INSERT INTO scans (serial, model, type, ts) VALUES (?, ?, ?, ?)',
      [String(serial).trim(), String(model).trim(), String(type).trim(), scanTs]
    );
    const [rows] = await pool.query(
      'SELECT * FROM scans WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /api/scans]', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// ── PUT /api/scans/:id ────────────────────────
// แก้ไข record
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { serial, model = '', type } = req.body ?? {};

  if (!serial || String(serial).trim().length < 2) {
    return res.status(400).json({ error: 'serial is required (min 2 chars)' });
  }
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  try {
    // ตรวจ record มีอยู่ไหม
    const [existing] = await pool.query('SELECT id FROM scans WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const fields = ['serial = ?', 'model = ?'];
    const params = [String(serial).trim(), String(model).trim()];
    if (type) { fields.push('type = ?'); params.push(String(type).trim()); }
    params.push(id);

    await pool.query(
      `UPDATE scans SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
    const [rows] = await pool.query('SELECT * FROM scans WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('[PUT /api/scans/:id]', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// ── DELETE /api/scans/:id ─────────────────────
// ลบ record
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  try {
    const [result] = await pool.query('DELETE FROM scans WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json({ success: true, deletedId: id });
  } catch (err) {
    console.error('[DELETE /api/scans/:id]', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

module.exports = router;
