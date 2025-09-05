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

test('variants-sync HMAC & upsert', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  const payload = {product:'Netflix',type:'1P1U',duration_days:30,code:'NET-1P1U-30',active:true};
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', process.env.SHEET_SYNC_SECRET).update(body).digest('hex');
  let res = await fetch(`http://127.0.0.1:${port}/api/variants-sync`, { method:'POST', headers:{'Content-Type':'application/json','x-signature':sig}, body });
  assert.strictEqual(res.status,200);
  const data = await res.json();
  assert.deepStrictEqual(data.ok,true);
  assert.ok(data.variant_id);
  const firstId = data.variant_id;
  const badSig = '0'.repeat(sig.length);
  res = await fetch(`http://127.0.0.1:${port}/api/variants-sync`, { method:'POST', headers:{'Content-Type':'application/json','x-signature':badSig}, body });
  assert.strictEqual(res.status,403);
  const body2 = JSON.stringify({...payload, active:false});
  const sig2 = crypto.createHmac('sha256', process.env.SHEET_SYNC_SECRET).update(body2).digest('hex');
  res = await fetch(`http://127.0.0.1:${port}/api/variants-sync`, { method:'POST', headers:{'Content-Type':'application/json','x-signature':sig2}, body: body2 });
  assert.strictEqual(res.status,200);
  const data2 = await res.json();
  assert.strictEqual(data2.variant_id, firstId);
  assert.strictEqual(store.variants[0].active, false);
  await new Promise(r=>server.close(r));
});

test('variants-sync invalid payload returns details', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  const body = JSON.stringify({ product:'Netflix' });
  const sig = crypto.createHmac('sha256', process.env.SHEET_SYNC_SECRET).update(body).digest('hex');
  const res = await fetch(`http://127.0.0.1:${port}/api/variants-sync`, { method:'POST', headers:{'Content-Type':'application/json','x-signature':sig}, body });
  assert.strictEqual(res.status,400);
  const data = await res.json();
  assert.strictEqual(data.error,'VALIDATION_ERROR');
  assert.ok(Array.isArray(data.details));
  assert.ok(data.details.find(d=>d.path.join('.')==='type'));
  await new Promise(r=>server.close(r));
});
