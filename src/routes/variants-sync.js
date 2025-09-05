const express = require('express');
const crypto = require('crypto');
const { upsertVariantFromSheetRow } = require('../services/variants');
const { addEvent } = require('../services/events');
const { SHEET_SYNC_SECRET } = require('../config/env');

const SHEET_SECRET = SHEET_SYNC_SECRET || 'secret';
const router = express.Router();

router.post('/variants-sync', express.json({ type: 'application/json' }), async (req, res) => {
  const sig = req.get('x-signature');
  const expected = crypto.createHmac('sha256', SHEET_SECRET).update(req.rawBody).digest('hex');
  if (!sig || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.sendStatus(403);
  }
  try {
    const variant_id = await upsertVariantFromSheetRow(req.body);
    res.json({ ok: true, variant_id });
  } catch (e) {
    await addEvent(null, 'VARIANT_SYNC_FAIL', e.message);
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
