/* ─────────────────────────────────────────────
   index.js — BarScan Express Server
   ───────────────────────────────────────────── */
'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// ── Middleware ────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Serve static frontend files ───────────────
// Express serves index.html + app.js + styles.css from the parent directory
app.use(express.static(path.join(__dirname, '..')));

// ── Routes ────────────────────────────────────
const scansRouter    = require('./routes/scans');
const modelsRouter   = require('./routes/models');
const settingsRouter = require('./routes/settings');

app.use('/api/scans',    scansRouter);
app.use('/api/models',   modelsRouter);
app.use('/api/settings', settingsRouter);

// ── Health check ──────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Unhandled error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  BarScan server running at http://localhost:${PORT}`);
  console.log(`    Frontend  → http://localhost:${PORT}`);
  console.log(`    API       → http://localhost:${PORT}/api/scans`);
  console.log(`    Health    → http://localhost:${PORT}/api/health\n`);
});
