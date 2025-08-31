
const express = require('express'); const router = express.Router(); const prisma = require('../db/client');
router.get('/', async (_req, res) => {
  const payload = { ok:true, node:process.version, uptime_s:Math.floor(process.uptime()), memory_rss_mb:Math.round(process.memoryUsage().rss/(1024*1024)) };
  try{ await prisma.$queryRaw`SELECT 1`; payload.db='ok'; }catch{ payload.db='error'; }
  res.json(payload);
});
module.exports = router;
