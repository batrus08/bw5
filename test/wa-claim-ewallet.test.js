const assert = require('node:assert');
const { test } = require('node:test');
const express = require('express');

process.env.WA_APP_SECRET = '';
const waPath = require.resolve('../src/services/wa');
const claimSvcPath = require.resolve('../src/services/claims');
const dbPath = require.resolve('../src/db/client');
const tgPath = require.resolve('../src/services/telegram');

const messages = [];
const ewalletCalls = [];
require.cache[waPath] = { exports: {
  sendText: async (...args) => { messages.push(args); },
  sendInteractiveButtons: async () => {},
  sendListMenu: async () => {},
} };
require.cache[claimSvcPath] = { exports: {
  createClaim: async () => {},
  approveClaim: async () => {},
  rejectClaim: async () => {},
  setEwallet: async (id, ew) => { ewalletCalls.push({ id, ew }); },
  markRefunded: async () => {},
  requestEwallet: async () => { await require.cache[waPath].exports.sendText('1','msg'); return { phone: '1' }; },
} };
require.cache[tgPath] = { exports: { sendMessage: async () => {}, buildOrderKeyboard: () => ({}) } };
require.cache[dbPath] = { exports: {
  warrantyclaims: {
    findUnique: async () => ({ id:1, refund_cents:5000, order:{ buyer_phone:'1' } }),
    update: async () => ({}),
  },
} };

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
  assert.ok(claimState.has('1'));
  await send('/', { entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'text', text:{ body:'0812345678' } }] } }] }] });
  assert.strictEqual(ewalletCalls.length,1);
  assert.strictEqual(ewalletCalls[0].ew,'0812345678');
  assert.strictEqual(messages.length,2);
  await new Promise(r=>server.close(r));
});
