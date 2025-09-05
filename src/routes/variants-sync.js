const express = require('express');
const crypto = require('crypto');
const { upsertVariantFromSheetRow } = require('../services/variants');
const { addEvent } = require('../services/events');
const { allow } = require('../utils/rateLimit');
const { SHEET_SYNC_SECRET } = require('../config/env');
const { z } = require('zod');

const SHEET_SECRET = SHEET_SYNC_SECRET || 'secret';
const router = express.Router();

router.post('/variants-sync', express.json({ type: 'application/json' }), async (req, res) => {
  const sig = req.get('x-signature');
  const expected = crypto.createHmac('sha256', SHEET_SECRET).update(req.rawBody).digest('hex');
  if (!sig || typeof sig !== 'string' || sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    await addEvent(null, 'VARIANT_SYNC_INVALID_SIG', 'invalid signature', { ip: req.ip, route: req.path });
    return res.sendStatus(403);
  }
  const key = `sync:${req.ip}:${req.path}`;
  if(!allow(key,60)){
    await addEvent(null,'RATE_LIMITED_SYNC','rate limited',{ ip:req.ip, route:req.path });
    return res.status(429).json({ ok:false });
  }
  const schema = z.object({
    product: z.string(),
    type: z.string(),
    duration_days: z.number().int().min(1),
    code: z.string(),
    active: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if(!parsed.success){
    return res.status(400).json({ ok:false, error:'VALIDATION_ERROR', details: parsed.error.issues });
  }
  try {
    const variant_id = await upsertVariantFromSheetRow(parsed.data);
    res.json({ ok: true, variant_id });
  } catch (e) {
    await addEvent(null, 'VARIANT_SYNC_FAIL', e.message);
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
