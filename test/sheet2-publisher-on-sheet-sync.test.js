const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const crypto = require('crypto');

const routePath = require.resolve('../src/routes/sheet-sync');
const dbPath = require.resolve('../src/db/client');
const variantPath = require.resolve('../src/services/variants');
const eventPath = require.resolve('../src/services/events');
const stockPath = require.resolve('../src/services/stock');

const store = { accounts: [] };

require.cache[variantPath] = { exports:{ resolveVariantByCode: async () => ({ variant_id:'v1', product:'P', code:'C', active:true }) } };
require.cache[eventPath] = { exports:{ addEvent: async () => {} } };
require.cache[dbPath] = { exports:{
  $queryRaw: async () => [],
  accounts:{
    upsert: async ({ where, create, update }) => {
      const idx = store.accounts.findIndex(a=>a.natural_key===where.natural_key);
      if(idx===-1){ const acc = Object.assign({ id:store.accounts.length+1 }, create); store.accounts.push(acc); return acc; }
      const acc = store.accounts[idx]; Object.assign(acc, update); return acc;
    },
    findUnique: async ({ where }) => store.accounts.find(a=>a.natural_key===where.natural_key) || null,
  }
}};

const publishStockSummary = test.mock.fn(async () => { throw new Error('boom'); });
require.cache[stockPath] = { exports:{ publishStockSummary } };

delete require.cache[routePath];
const router = require(routePath);

function startApp(){
  const app = express();
  app.use(express.json({ verify:(req,_res,buf)=>{ req.rawBody=buf; } }));
  app.use('/api', router);
  return app;
}

test('publishStockSummary called on upsert and delete without affecting response', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  function sig(body){ return 'sha256='+crypto.createHmac('sha256','secret').update(body).digest('hex'); }
  async function send(payload){
    const body = JSON.stringify(payload);
    const res = await fetch(`http://127.0.0.1:${port}/api/sheet-sync`, { method:'POST', headers:{'Content-Type':'application/json','X-Hub-Signature-256':sig(body)}, body });
    assert.strictEqual(res.status,200);
  }
  await send({ code:'C', username:'STK_u', password:'p' });
  assert.strictEqual(publishStockSummary.mock.calls.length,1);
  await send({ code:'C', username:'STK_u', __op:'DELETE' });
  assert.strictEqual(publishStockSummary.mock.calls.length,2);
  await new Promise(r=>server.close(r));
});
