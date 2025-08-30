const express = require('express');
const router = express.Router();
const prisma = require('../db/client');

router.get('/', async (_req, res) => {
  const pendingTasks = await prisma.tasks.count({ where:{ status:'OPEN' } });
  const pendingPayAck = await prisma.orders.count({ where:{ status:'PENDING_PAY_ACK' } });
  res.json({ ok:true, pendingTasks, pendingPayAck, now:new Date().toISOString() });
});

module.exports = router;
