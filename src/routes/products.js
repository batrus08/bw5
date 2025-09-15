const express = require('express');
const { getProductByCode } = require('../services/products');

const router = express.Router();

router.get('/:code', async (request, response) => {
  try {
    const { code } = request.params;
    const product = await getProductByCode(code);
    if (!product) {
      return response.status(404).json({ ok: false, error: 'NOT_FOUND' });
    }
    return response.json({ ok: true, product });
  } catch (error) {
    return response
      .status(500)
      .json({ ok: false, error: 'INTERNAL_SERVER_ERROR' });
  }
});

module.exports = router;
