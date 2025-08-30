// src/routes/health.js — CommonJS, aman di Node v20.x / Railway
const express = require('express');
const router = express.Router();

// Coba muat prisma client (opsional). Jika tidak ada, health check DB akan dilewati.
let prisma = null;
try {
  prisma = require('../db/client');           // asumsi mengekspor instance PrismaClient
  // jika modul mengekspor default:
  if (prisma && prisma.default) prisma = prisma.default;
} catch (_) {
  prisma = null;
}

router.get('/', async (req, res) => {
  const payload = {
    ok: true,
    node: process.version,
    uptime_s: Math.floor(process.uptime()),
    memory_rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  };

  // Health check DB (jika prisma tersedia)
  try {
    if (prisma && typeof prisma.$executeRawUnsafe === 'function') {
      await prisma.$executeRawUnsafe('SELECT 1'); // ringan & cepat
      payload.db = 'ok';
    } else {
      payload.db = 'not_configured';
    }
  } catch (err) {
    payload.db = 'error';
    payload.db_error = 'HEALTH_DB_FAIL'; // jangan expose detail sensitif
    console.error('health db error:', err && err.message ? err.message : err);
  }

  res.json(payload);
});

module.exports = router;
