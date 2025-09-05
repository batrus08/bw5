const express = require('express');
const prisma = require('../db/client');
const { getStockSummary, getStockDetail } = require('../services/stock');
const { addEvent } = require('../services/events');
const { ADMIN_API_TOKEN } = require('../config/env');

const router = express.Router();

function requireAdminToken(req, res, next){
  const token = req.get('x-admin-token');
  if(!token || token !== ADMIN_API_TOKEN) return res.sendStatus(403);
  next();
}

router.get('/', requireAdminToken, async (_req, res) => {
  try {
    const sum = await getStockSummary();
    res.json(sum);
  } catch (e) {
    console.error('stock summary error', e);
    res.status(500).json({ ok:false });
  }
});

router.get('/:code', requireAdminToken, async (req, res) => {
  try {
    const detail = await getStockDetail(req.params.code);
    res.json(detail);
  } catch (e) {
    console.error('stock detail error', e);
    res.status(500).json({ ok:false });
  }
});

router.get('/:code/account/:id/secret', requireAdminToken, async (req, res) => {
  try {
    const { code, id } = req.params;
    const acc = await prisma.accounts.findFirst({ where:{ id: Number(id), product_code: code }, select:{ username: true } });
    if(!acc) return res.status(404).json({ ok:false });
    await addEvent(null,'SECRET_ACCESSED','admin fetched secret',{ account_id:Number(id), code });
    res.json({ username: acc.username, password_masked: true });
  } catch (e) {
    console.error('stock secret error', e);
    res.status(500).json({ ok:false });
  }
});

module.exports = router;
