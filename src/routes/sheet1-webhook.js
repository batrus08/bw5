const express = require('express');
const crypto = require('crypto');
const prisma = require('../db/client');
const { SHEET1_HMAC_SECRET } = require('../config/env');

const router = express.Router();
const SECRET = SHEET1_HMAC_SECRET || 'secret';

router.post('/sheet1-webhook', express.json({ type: 'application/json' }), async (req, res) => {
  const sig = req.get('X-Hub-Signature-256') || req.get('x-signature');
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(req.rawBody).digest('hex');
  if (!sig || sig.split('=')[1] !== expected.split('=')[1]) {
    return res.sendStatus(403);
  }
  const { tab_type, records } = req.body;
  try {
    if (tab_type === 'MASTER' && Array.isArray(records)) {
      for (const r of records) {
        if (r.kind === 'Terms') {
          await prisma.terms.upsert({
            where: { key: r.key },
            update: { title: r.title, body_md: r.body_md, version: r.version || 1 },
            create: { key: r.key, title: r.title, body_md: r.body_md, version: r.version || 1 },
          });
        } else if (r.kind === 'QRIS') {
          await prisma.qris_assets.upsert({
            where: { key: r.key },
            update: { name: r.name, image_url: r.image_url, active: r.active !== false },
            create: { key: r.key, name: r.name, image_url: r.image_url, active: r.active !== false },
          });
        }
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
