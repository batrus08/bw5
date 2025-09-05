const express = require('express');
const crypto = require('crypto');
const prisma = require('../db/client');
const { resolveVariantByCode } = require('../services/variants');
const { addEvent } = require('../services/events');
const { SHEET_SYNC_SECRET } = require('../config/env');

const SHEET_SECRET = SHEET_SYNC_SECRET || 'secret';
const router = express.Router();

function buildNaturalKey({ code, username, profile_index }){
  return crypto.createHash('sha1').update(`${code}|${username}|${profile_index||''}`).digest('hex');
}

async function upsertAccountFromSheet(payload){
  const variant = await resolveVariantByCode(payload.code);
  const natural_key = payload.natural_key || buildNaturalKey(payload);
  const existing = await prisma.accounts.findUnique({ where:{ natural_key } }).catch(()=>null);
  const nowBig = BigInt(Date.now());
  const data = {
    product_code: variant.product,
    variant_id: variant.variant_id,
    username: payload.username,
    password: payload.password,
    profile_index: payload.profile_index || null,
    max_usage: payload.max_usage ?? 1,
    fifo_order: nowBig,
    natural_key,
  };
  const updateData = {
    username: payload.username,
    password: payload.password,
    profile_index: payload.profile_index || null,
    max_usage: payload.max_usage ?? undefined,
  };
  if (payload.reorder === true) updateData.fifo_order = nowBig;
  if(payload.deleted){
    updateData.status = 'DISABLED';
  } else if(existing && existing.status !== 'AVAILABLE'){
    updateData.status = existing.status;
  }
  const account = await prisma.accounts.upsert({
    where:{ natural_key },
    create: Object.assign({ status: payload.deleted?'DISABLED':'AVAILABLE' }, data),
    update: updateData,
  });
  await addEvent(null, 'SHEET_SYNC_OK', 'Stock updated', { variant_id: variant.variant_id, account_id: account.id });
  return account;
}

router.post('/sheet-sync', express.json({ type:'application/json' }), async (req, res) => {
  const sig = req.get('x-signature');
  const expected = crypto.createHmac('sha256', SHEET_SECRET).update(req.rawBody).digest('hex');
  if(!sig || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))){
    return res.sendStatus(403);
  }
  try{
    const acc = await upsertAccountFromSheet(req.body);
    res.json({ ok:true, id: acc.id });
  }catch(e){
    await addEvent(null, 'SHEET_SYNC_FAIL', e.message);
    res.status(400).json({ ok:false, error:e.message });
  }
});

module.exports = router;
module.exports.upsertAccountFromSheet = upsertAccountFromSheet;
