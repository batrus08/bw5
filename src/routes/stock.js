const express = require('express');
const { getStockOptions } = require('../services/stock');

const router = express.Router();

router.get('/options', async (req, res) => {
  const { productId } = req.query;
  if (!productId) return res.status(400).json({ ok: false, error: 'MISSING_PRODUCT_ID' });
  try {
    const opts = await getStockOptions(productId);
    res.json(opts);
  } catch (err) {
    console.error('stock options error', err);
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
