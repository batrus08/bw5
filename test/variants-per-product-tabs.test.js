const assert = require('node:assert');
const { test } = require('node:test');
const express = require('express');
const crypto = require('crypto');

process.env.SHEET1_HMAC_SECRET = 'secret';

const dbPath = require.resolve('../src/db/client');
const sheetSyncPath = require.resolve('../src/routes/sheet-sync');
const eventPath = require.resolve('../src/services/events');

const store = { products: [], variants: [], accounts: [] };

require.cache[dbPath] = { exports: {
  products: {
    upsert: async ({ where, create, update }) => {
      let p = store.products.find(p => p.code === where.code);
      if (p) { Object.assign(p, update); return p; }
      p = Object.assign({ code: where.code }, create);
      store.products.push(p); return p;
    }
  },
  product_variants: {
    upsert: async ({ where, create, update }) => {
      let v = store.variants.find(v => v.code === where.code);
      if (v) { Object.assign(v, update); return v; }
      v = Object.assign({ code: where.code, variant_id: 'v'+(store.variants.length+1) }, create);
      store.variants.push(v); return v;
    }
  },
  accounts: {
    upsert: async ({ where, create, update }) => {
      let a = store.accounts.find(a=>a.natural_key===where.natural_key);
      if (a) { Object.assign(a, update); return a; }
      a = Object.assign({ id: store.accounts.length+1 }, create);
      store.accounts.push(a); return a;
    }
  },
  terms:{ upsert: async ()=>{} },
  qris_assets:{ upsert: async ()=>{} },
  $transaction: async fn => fn(require.cache[dbPath].exports)
}};

require.cache[sheetSyncPath] = { exports:{ upsertAccountFromSheet: async (payload) => { store.accounts.push(payload); } } };
require.cache[eventPath] = { exports:{ addEvent: async ()=>{} } };

const route = require('../src/routes/sheet1-webhook');

function startApp(){
  const app = express();
  app.use(express.json({ verify:(req,_res,buf)=>{ req.rawBody = buf; } }));
  app.use('/api', route);
  return app;
}

test('sheet1 tab per product handling', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;

  let body = JSON.stringify({ tab_type:'PROD_NET', records:[{ name:'Netflix', default_mode:'USERPASS', is_active:true }] });
  let sig = 'sha256='+crypto.createHmac('sha256', process.env.SHEET1_HMAC_SECRET).update(body).digest('hex');
  let res = await fetch(`http://127.0.0.1:${port}/api/sheet1-webhook`, { method:'POST', headers:{'Content-Type':'application/json','X-Hub-Signature-256':sig}, body });
  assert.strictEqual(res.status,200);
  assert.strictEqual(store.products.length,1);
  assert.strictEqual(store.products[0].default_mode,'USERPASS');

  body = JSON.stringify({ tab_type:'VAR_NET', records:[{ variant_code:'NET-1', title:'Basic', duration_days:30, price:1000, stock:5, delivery_mode:'USERPASS', active:true }] });
  sig = 'sha256='+crypto.createHmac('sha256', process.env.SHEET1_HMAC_SECRET).update(body).digest('hex');
  res = await fetch(`http://127.0.0.1:${port}/api/sheet1-webhook`, { method:'POST', headers:{'Content-Type':'application/json','X-Hub-Signature-256':sig}, body });
  assert.strictEqual(res.status,200);
  assert.strictEqual(store.variants.length,1);
  assert.strictEqual(store.variants[0].price_cents,1000);

  body = JSON.stringify({ tab_type:'STK_NET', records:[{ variant_code:'NET-1', username:'u', password:'p' }, { variant_code:'NET-1', username:'d', password:'p', __op:'DELETE' }] });
  sig = 'sha256='+crypto.createHmac('sha256', process.env.SHEET1_HMAC_SECRET).update(body).digest('hex');
  res = await fetch(`http://127.0.0.1:${port}/api/sheet1-webhook`, { method:'POST', headers:{'Content-Type':'application/json','X-Hub-Signature-256':sig}, body });
  assert.strictEqual(res.status,200);
  assert.strictEqual(store.accounts.length,2);
  assert.strictEqual(store.accounts[0].code,'NET-1');
  assert.strictEqual(store.accounts[1].__op,'DELETE');

  await new Promise(r=>server.close(r));
});
