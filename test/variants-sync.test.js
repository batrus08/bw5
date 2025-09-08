const assert = require('node:assert');
const { test } = require('node:test');
const express = require('express');
const crypto = require('crypto');

process.env.SHEET_SYNC_SECRET = 'secret';
const dbPath = require.resolve('../src/db/client');
const eventPath = require.resolve('../src/services/events');

const store = { variants: [] };
require.cache[dbPath] = { exports:{ product_variants:{
  upsert: async ({ where, create, update }) => {
    const idx = store.variants.findIndex(v=>v.code===where.code);
    if(idx>=0){
      Object.assign(store.variants[idx], update);
      return store.variants[idx];
    }
    const v = Object.assign({ variant_id:`v${store.variants.length+1}` }, create);
    store.variants.push(v);
    return v;
  },
  findUnique: async ({ where }) => store.variants.find(v=>v.code===where.code) || null,
} } };
require.cache[eventPath] = { exports:{ addEvent: async ()=>{} } };

const route = require('../src/routes/variants-sync');

function startApp(){
  const app = express();
  app.use(express.json({ verify:(req,_res,buf)=>{ req.rawBody = buf; } }));
  app.use('/api', route);
  return app;
}

test('variants-sync upsert maps variant fields', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  const payload = {product_code:'P1', code:'VAR1', duration_days:30, price_cents:1000, otp_policy:'TOTP', qris_key:'Q1', tnc_key:'T1', active:true};
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', process.env.SHEET_SYNC_SECRET).update(body).digest('hex');
  let res = await fetch(`http://127.0.0.1:${port}/api/variants-sync`, { method:'POST', headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+sig}, body });
  assert.strictEqual(res.status,200);
  const data = await res.json();
  assert.deepStrictEqual(data.ok,true);
  assert.ok(data.variant_id);
  assert.strictEqual(store.variants[0].price_cents,1000);
  assert.strictEqual(store.variants[0].duration_days,30);
  assert.strictEqual(store.variants[0].otp_policy,'TOTP');
  assert.strictEqual(store.variants[0].qris_key,'Q1');
  assert.strictEqual(store.variants[0].tnc_key,'T1');
  assert.strictEqual(store.variants[0].active,true);
  const firstId = data.variant_id;

  const body2 = JSON.stringify({...payload, price_cents:2000, duration_days:60, otp_policy:'NONE', qris_key:'Q2', tnc_key:'T2', active:false});
  const sig2 = crypto.createHmac('sha256', process.env.SHEET_SYNC_SECRET).update(body2).digest('hex');
  res = await fetch(`http://127.0.0.1:${port}/api/variants-sync`, { method:'POST', headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+sig2}, body: body2 });
  assert.strictEqual(res.status,200);
  const data2 = await res.json();
  assert.strictEqual(data2.variant_id, firstId);
  assert.strictEqual(store.variants[0].price_cents,2000);
  assert.strictEqual(store.variants[0].duration_days,60);
  assert.strictEqual(store.variants[0].otp_policy,'NONE');
  assert.strictEqual(store.variants[0].qris_key,'Q2');
  assert.strictEqual(store.variants[0].tnc_key,'T2');
  assert.strictEqual(store.variants[0].active,false);
  await new Promise(r=>server.close(r));
});

test('variants-sync invalid payload returns details', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  const body = JSON.stringify({ product_code:'P1' });
  const sig = crypto.createHmac('sha256', process.env.SHEET_SYNC_SECRET).update(body).digest('hex');
  const res = await fetch(`http://127.0.0.1:${port}/api/variants-sync`, { method:'POST', headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+sig}, body });
  assert.strictEqual(res.status,400);
  const data = await res.json();
  assert.strictEqual(data.error,'VALIDATION_ERROR');
  assert.ok(Array.isArray(data.details));
  assert.ok(data.details.find(d=>d.path.join('.')==='code'));
  await new Promise(r=>server.close(r));
});

test('variants-sync short signature returns 403', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  const payload = { product_code:'P1', code:'VAR1', duration_days:30, price_cents:1000 };
  const body = JSON.stringify(payload);
  const res = await fetch(`http://127.0.0.1:${port}/api/variants-sync`, {
    method:'POST',
    headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256=deadbeef'},
    body
  });
  assert.strictEqual(res.status,403);
  await new Promise(r=>server.close(r));
});
