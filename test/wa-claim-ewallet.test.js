const assert = require('node:assert');
const { test } = require('node:test');
const express = require('express');

process.env.WA_APP_SECRET = '';
const waPath = require.resolve('../src/services/wa');
const dbPath = require.resolve('../src/db/client');
const tgPath = require.resolve('../src/services/telegram');

const messages = [];
const ewalletCalls = [];
const store = { claim: { id:1, refund_cents:5000, status:'APPROVED', ewallet:null, order:{ buyer_phone:'1' } } };
require.cache[waPath] = { exports: {
  sendText: async (...args) => { messages.push({ type:'text', args }); },
  sendInteractiveButtons: async (...args) => { messages.push({ type:'buttons', args }); },
  sendListMenu: async () => {},
} };
require.cache[tgPath] = { exports: { sendMessage: async () => {}, buildOrderKeyboard: () => ({}) } };
require.cache[dbPath] = { exports: {
  warrantyclaims: {
    findUnique: async () => ({ ...store.claim }),
    update: async ({ data }) => { Object.assign(store.claim, data); return { ...store.claim }; },
  },
  orders: { findFirst: async () => null },
} };

const claims = require('../src/services/claims');
const origSet = claims.setEwallet;
claims.setEwallet = async (id, ew) => { ewalletCalls.push({ id, ew }); return await origSet(id, ew); };

const waWebhook = require('../src/whatsapp/webhook');
const claimsRoute = require('../src/routes/claims');
const { claimState } = require('../src/whatsapp/state');

function startApp(){
  const app = express();
  app.use(express.json({ verify:(req,_res,buf)=>{ req.rawBody=buf; } }));
  app.use('/claims', claimsRoute);
  app.use('/', waWebhook);
  return app;
}

test('claim approval asks for ewallet and stores number', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  function send(path, body){ return fetch(`http://127.0.0.1:${port}${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); }
  await send('/claims/1/request-ewallet', {});
  assert.strictEqual(messages.length,1);
  assert.ok(messages[0].args[1].includes('Rp50'));
  assert.ok(claimState.has('1'));
  await send('/', { entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'text', text:{ body:' 08-123 456 789 0 ' } }] } }] }] });
  assert.strictEqual(ewalletCalls.length,1);
  assert.strictEqual(ewalletCalls[0].ew,'081234567890');
  assert.strictEqual(messages.length,2);
  assert.strictEqual(messages[1].type,'buttons');
  assert.strictEqual(messages[1].args[1],'Nomor ShopeePay diterima: 081234567890. Refund diproses maksimal 2×24 jam.');
  await new Promise(r=>server.close(r));
  claims.setEwallet = origSet;
});
