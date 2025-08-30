// src/routes/health.js
const express = require('express');
const router = express.Router();

let prisma = null;
try {
  prisma = require('../db/client');
} catch (_) {}

router.get('/', async (req, res) => {
  const payload = {
    ok: true,
    node: process.version,
    uptime_s: Math.floor(process.uptime()),
    memory_rss_mb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
  };

  try {
    if (prisma) {
      await prisma.$queryRaw`SELECT 1`;
      payload.db = 'ok';
    } else {
      payload.db = 'not_configured';
    }
  } catch (err) {
    payload.db = 'error';
  }

  res.json(payload);
});

module.exports = router;
