// src/routes/status.js — CommonJS, aman di Node v20.x / Railway
const express = require('express');
const router = express.Router();

// Import optional: tidak bikin crash kalau module workers belum ada/ekspor berubah
let getWorkerStats = null;
try {
  ({ getWorkerStats } = require('../workers'));
} catch (_) {
  getWorkerStats = null;
}

router.get('/', async (req, res) => {
  try {
    const workerStats =
      typeof getWorkerStats === 'function' ? getWorkerStats() : null;

    res.json({
      ok: true,
      node: process.version,
      uptime_s: Math.floor(process.uptime()),
      memory_rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      public_url: process.env.PUBLIC_URL || null,
      worker_stats: workerStats, // bisa null kalau worker belum ekspor stats
    });
  } catch (err) {
    console.error('status route error:', err?.message || err);
    res.status(500).json({ ok: false, error: 'STATUS_FAILED' });
  }
});

module.exports = router;
