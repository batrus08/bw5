const express = require('express');
const { getStockSummary, getStockDetail } = require('../services/stock');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const sum = await getStockSummary();
    res.json(sum);
  } catch (e) {
    console.error('stock summary error', e);
    res.status(500).json({ ok:false });
  }
});

router.get('/:code', async (req, res) => {
  try {
    const detail = await getStockDetail(req.params.code);
    res.json(detail);
  } catch (e) {
    console.error('stock detail error', e);
    res.status(500).json({ ok:false });
  }
});

module.exports = router;
