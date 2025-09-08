const express = require('express');
const crypto = require('crypto');
const prisma = require('../db/client');
const { resolveVariantByCode } = require('../services/variants');
const { addEvent } = require('../services/events');
const { publishStockSummary } = require('../services/stock');
const { allow } = require('../utils/rateLimit');
const { SHEET_SYNC_SECRET } = require('../config/env');
const { z } = require('zod');

const SHEET_SECRET = SHEET_SYNC_SECRET || 'secret';
const router = express.Router();

function buildNaturalKey({ code, username, profile_index }){
  return crypto.createHash('sha1').update(`${code}|${username}|${profile_index||''}`).digest('hex');
}

async function upsertAccountFromSheet(payload, db = prisma){
  const variantCode = payload.mapped_variant_code || payload.code;
  const variant = await resolveVariantByCode(variantCode);
  const natural_key = payload.natural_key || buildNaturalKey(payload);
  const existing = await db.accounts.findUnique({ where:{ natural_key } }).catch(()=>null);
  const nowBig = BigInt(Date.now());

  const isDeleted = payload.__op === 'DELETE' || payload.deleted;

  const baseData = {
    product_code: variant.product,
    variant_id: variant.variant_id,
    username: payload.username,
    password: payload.password,
    profile_pin: payload.profile_pin || null,
    totp_secret: payload.totp_secret || null,
    profile_index: payload.profile_index || null,
    max_usage: payload.max_usage ?? 1,
    fifo_order: nowBig,
    natural_key,
    disabled: false,
    deleted_at: null,
  };
  const createData = Object.assign({ status: payload.status || 'AVAILABLE' }, baseData);
  const updateData = {
    username: payload.username,
    password: payload.password,
    profile_pin: payload.profile_pin || null,
    totp_secret: payload.totp_secret || null,
    profile_index: payload.profile_index || null,
    max_usage: payload.max_usage ?? undefined,
    disabled: false,
    deleted_at: null,
  };
  if (payload.reorder === true) updateData.fifo_order = nowBig;
  if (payload.status) {
    updateData.status = payload.status;
  } else if (existing && existing.status !== 'AVAILABLE') {
    updateData.status = existing.status;
  }

  if (isDeleted) {
    const account = await db.accounts.upsert({
      where: { natural_key },
      create: Object.assign({}, createData, { status: 'DISABLED', disabled:true, deleted_at:new Date() }),
      update: { status: 'DISABLED', disabled:true, deleted_at:new Date() },
    });
    await addEvent(null, 'SHEET_SYNC_OK', 'Stock disabled', { variant_id: variant.variant_id, account_id: account.id });
    await publishStockSummary().catch(() => {});
    return { account, action: existing ? 'deleted' : 'created' };
  }

  const account = await db.accounts.upsert({
    where: { natural_key },
    create: createData,
    update: updateData,
  });
  const action = existing ? 'updated' : 'created';
  await addEvent(null, 'SHEET_SYNC_OK', `Stock ${action}`, { variant_id: variant.variant_id, account_id: account.id });
  await publishStockSummary().catch(() => {});
  return { account, action };
}

router.post('/sheet-sync', express.json({ type:'application/json' }), async (req, res) => {
  const sigHeader = req.get('X-Hub-Signature-256') || req.get('x-signature');
  const expected = 'sha256=' +
    crypto.createHmac('sha256', SHEET_SECRET).update(req.rawBody).digest('hex');
  const provided = sigHeader && (sigHeader.startsWith('sha256=') ? sigHeader : 'sha256=' + sigHeader);
  if (!provided || provided.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    await addEvent(null, 'SHEET_SYNC_INVALID_SIG', 'invalid signature', { ip: req.ip, route: req.path });
    return res.sendStatus(403);
  }
  const key = `sync:${req.ip}:${req.path}`;
  if(!allow(key,60)){
    await addEvent(null,'RATE_LIMITED_SYNC','rate limited',{ ip:req.ip, route:req.path });
    return res.status(429).json({ ok:false });
  }
  const schema = z.object({
    mapped_variant_code: z.string().optional(),
    code: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    profile_pin: z.string().optional(),
    totp_secret: z.string().optional(),
    max_usage: z.number().int().min(1).optional(),
    profile_index: z.number().int().nullable().optional(),
    status: z.string().optional(),
    __op: z.string().optional(),
    deleted: z.boolean().optional(),
    reorder: z.boolean().optional(),
    natural_key: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if(!parsed.success){
    return res.status(400).json({ ok:false, error:'VALIDATION_ERROR', details: parsed.error.issues });
  }
  if ((!parsed.data.username || parsed.data.username.trim()==='') && !parsed.data.natural_key) {
    return res.status(400).json({ ok:false, error:'VALIDATION_ERROR', details:[{ path:['natural_key'], message:'required when username is empty' }]});
  }
  try{
    const result = await upsertAccountFromSheet(parsed.data);
    res.json({ ok:true, id: result.account?.id, action: result.action });
  }catch(e){
    await addEvent(null, 'SHEET_SYNC_FAIL', e.message);
    res.status(400).json({ ok:false, error:e.message });
  }
});

module.exports = router;
module.exports.upsertAccountFromSheet = upsertAccountFromSheet;
