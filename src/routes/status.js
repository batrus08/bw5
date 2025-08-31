
const express = require('express'); const router = express.Router(); const prisma = require('../db/client');
router.get('/', async (_req, res) => {
  const counts = await prisma.orders.groupBy({ by:['status'], _count:true });
  const pendingTasks = await prisma.tasks.count({ where:{ status:'OPEN' } });
  const dlq = await prisma.deadletters.count();
  res.json({ ok:true, orders:counts, pendingTasks, deadletters:dlq, now:new Date().toISOString() });
});
module.exports = router;
