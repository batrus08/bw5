const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const crypto = require('crypto');

const routePath = require.resolve('../src/routes/sheet-sync');
const dbPath = require.resolve('../src/db/client');
const variantPath = require.resolve('../src/services/variants');
const eventPath = require.resolve('../src/services/events');
const outputPath = require.resolve('../src/services/output');
const stockPath = require.resolve('../src/services/stock');

const store = { accounts: [] };
let publishStockCalled = 0;

require.cache[outputPath] = { exports:{ publishStock: async () => { publishStockCalled++; } } };
require.cache[variantPath] = { exports:{ resolveVariantByCode: async () => ({ variant_id:'v1', product:'P', code:'C', active:true }) } };
require.cache[eventPath] = { exports:{ addEvent: async () => {} } };
require.cache[dbPath] = { exports:{
  $queryRaw: async () => [],
  accounts:{
    upsert: async ({ where, create, update }) => {
      const idx = store.accounts.findIndex(a=>a.natural_key===where.natural_key);
      if(idx===-1){ const acc = Object.assign({ id:store.accounts.length+1 }, create); store.accounts.push(acc); return acc; }
      Object.assign(store.accounts[idx], update); return store.accounts[idx];
    },
    findUnique: async ({ where }) => store.accounts.find(a=>a.natural_key===where.natural_key) || null,
  }
}};

delete require.cache[stockPath];
const stockMod = require(stockPath);
const realPublishStockSummary = stockMod.publishStockSummary;
let publishStockSummaryCalled = 0;
stockMod.publishStockSummary = async function(...args){ publishStockSummaryCalled++; return realPublishStockSummary(...args); };

delete require.cache[routePath];
const router = require(routePath);

function startApp(){
  const app = express();
  app.use(express.json({ verify:(req,_res,buf)=>{ req.rawBody=buf; } }));
  app.use('/', router);
  return app;
}

test('sheet-sync triggers stock publishers', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  function sig(body){ return 'sha256='+crypto.createHmac('sha256','secret').update(body).digest('hex'); }
  async function send(payload){
    const body = JSON.stringify(payload);
    await fetch(`http://127.0.0.1:${port}/sheet-sync`, { method:'POST', headers:{'Content-Type':'application/json','X-Hub-Signature-256':sig(body)}, body });
  }
  await send({ code:'C', username:'u', password:'p' });
  await send({ code:'C', username:'u', __op:'DELETE' });
  assert.strictEqual(publishStockSummaryCalled,2);
  assert.strictEqual(publishStockCalled,2);
  await new Promise(r=>server.close(r));
});
