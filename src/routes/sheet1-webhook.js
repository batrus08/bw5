const express = require('express');
const crypto = require('crypto');
const prisma = require('../db/client');
const { SHEET1_HMAC_SECRET } = require('../config/env');
const { upsertAccountFromSheet } = require('./sheet-sync');
const { addEvent } = require('../services/events');

const router = express.Router();
const SECRET = SHEET1_HMAC_SECRET || 'secret';

router.post('/sheet1-webhook', express.json({ type: 'application/json' }), async (req, res) => {
  const sigHeader = req.get('X-Hub-Signature-256') || req.get('x-signature');
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(req.rawBody).digest('hex');
  const provided = sigHeader && (sigHeader.startsWith('sha256=') ? sigHeader : 'sha256=' + sigHeader);
  if (!provided || provided.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    await addEvent(null, 'SHEET_SYNC_INVALID_SIG', 'invalid signature', { route: '/sheet1-webhook', ip: req.ip });
    return res.sendStatus(403);
  }
  const { tab_type, records } = req.body || {};
  try {
    await prisma.$transaction(async (tx) => {
      const [prefix, code] = (tab_type || '').split('_');
      if (prefix === 'MASTER' && Array.isArray(records)) {
        for (const r of records) {
          if (r.kind === 'Terms') {
            await tx.terms.upsert({
              where: { key: r.key },
              update: { title: r.title, body_md: r.body_md, version: r.version || 1 },
              create: { key: r.key, title: r.title, body_md: r.body_md, version: r.version || 1 },
            });
          } else if (r.kind === 'QRIS') {
            await tx.qris_assets.upsert({
              where: { key: r.key },
              update: { name: r.name, image_url: r.image_url, active: r.active !== false },
              create: { key: r.key, name: r.name, image_url: r.image_url, active: r.active !== false },
            });
          }
        }
      } else if (prefix === 'PROD' && code && Array.isArray(records)) {
        for (const r of records) {
          await tx.products.upsert({
            where: { code },
            create: {
              code,
              name: r.name || code,
              default_tnc_key: r.default_tnc_key || null,
              default_qris_key: r.default_qris_key || null,
              default_mode: r.default_mode || null,
              default_requires_email: r.default_requires_email || false,
              default_otp_policy: r.default_otp_policy || 'NONE',
              sorting_index: r.sorting_index ?? 10,
              category: r.category || null,
              approval_required: r.approval_required ?? false,
              is_active: r.is_active !== false,
            },
            update: {
              name: r.name,
              default_tnc_key: r.default_tnc_key,
              default_qris_key: r.default_qris_key,
              default_mode: r.default_mode,
              default_requires_email: r.default_requires_email,
              default_otp_policy: r.default_otp_policy,
              sorting_index: r.sorting_index,
              category: r.category,
              approval_required: r.approval_required,
              is_active: r.is_active,
            },
          });
        }
      } else if (prefix === 'VAR' && code && Array.isArray(records)) {
        for (const r of records) {
          const vcode = r.variant_code;
          if (!vcode) continue;
          await tx.product_variants.upsert({
            where: { code: vcode },
            create: {
              product_id: code,
              code: vcode,
              title: r.title || null,
              duration_days: r.duration_days || 0,
              price_cents: r.price || 0,
              stock_cached: r.stock ?? null,
              delivery_mode: r.delivery_mode || 'USERPASS',
              requires_email: r.requires_email ?? false,
              otp_policy: r.otp_policy || 'NONE',
              tnc_key: r.tnc_key || null,
              qris_key: r.qris_key || null,
              active: r.active !== false,
            },
            update: {
              title: r.title,
              duration_days: r.duration_days,
              price_cents: r.price,
              stock_cached: r.stock,
              delivery_mode: r.delivery_mode,
              requires_email: r.requires_email,
              otp_policy: r.otp_policy,
              tnc_key: r.tnc_key,
              qris_key: r.qris_key,
              active: r.active,
            },
          });
        }
      } else if (prefix === 'STK' && code && Array.isArray(records)) {
        for (const r of records) {
          const payload = Object.assign({}, r, { code: r.variant_code || code });
          await upsertAccountFromSheet(payload);
        }
      }
    });
    await addEvent(null, 'SHEET_SYNC_OK', 'sheet1 processed', { tab_type, count: records?.length || 0 });
    res.json({ ok: true });
  } catch (e) {
    await addEvent(null, 'SHEET_SYNC_FAIL', e.message, { tab_type });
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
