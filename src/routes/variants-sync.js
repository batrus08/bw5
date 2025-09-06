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
  const sigHeader = req.get('X-Hub-Signature-256') || req.get('x-signature');
  const expected = 'sha256=' +
    crypto.createHmac('sha256', SHEET_SECRET).update(req.rawBody).digest('hex');
  const provided = sigHeader && (sigHeader.startsWith('sha256=') ? sigHeader : 'sha256=' + sigHeader);
  if (!provided || provided.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    await addEvent(null, 'VARIANT_SYNC_INVALID_SIG', 'invalid signature', { ip: req.ip, route: req.path });
    return res.sendStatus(403);
  }
  const key = `sync:${req.ip}:${req.path}`;
  if(!allow(key,60)){
    await addEvent(null,'RATE_LIMITED_SYNC','rate limited',{ ip:req.ip, route:req.path });
    return res.status(429).json({ ok:false });
  }
  const schema = z.object({
    product_code: z.string(),
    code: z.string(),
    title: z.string().optional(),
    duration_days: z.number().int().min(1),
    price_cents: z.number().int().min(0),
    stock_cached: z.number().int().nullable().optional(),
    delivery_mode: z.string().optional(),
    requires_email: z.boolean().optional(),
    otp_policy: z.string().optional(),
    tnc_key: z.string().optional(),
    qris_key: z.string().optional(),
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
