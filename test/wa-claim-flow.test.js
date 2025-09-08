const assert = require('node:assert');
const { test } = require('node:test');
const express = require('express');

process.env.WA_APP_SECRET = '';
const waPath = require.resolve('../src/services/wa');
const dbPath = require.resolve('../src/db/client');
const tgPath = require.resolve('../src/services/telegram');

const messages = [];
require.cache[waPath] = { exports: {
  sendText: async (...args) => { messages.push({ type: 'text', args }); },
  sendInteractiveButtons: async (...args) => { messages.push({ type: 'buttons', args }); },
  sendListMenu: async () => {},
} };
require.cache[tgPath] = { exports: { sendMessage: async () => {}, buildOrderKeyboard: () => ({}) } };
require.cache[dbPath] = { exports: {
  orders: {
    findUnique: async ({ where }) => {
      if (where.invoice !== 'INV-1') return null;
      return { invoice: 'INV-1', status: 'DELIVERED', amount_cents: 10000, created_at: new Date(Date.now() - 5 * 86400000), product: { name: 'Prod', duration_months: 1 } };
    },
    findFirst: async () => null,
  },
} };

const claims = require('../src/services/claims');

function startApp() {
  const waWebhook = require('../src/whatsapp/webhook');
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use('/', waWebhook);
  return app;
}

test('claim flow triggers createClaim', async () => {
  messages.length = 0;
  const origCreate = claims.createClaim;
  const origSet = claims.setEwallet;
  claims.createClaim = async (invoice, reason) => { messages.push({ type: 'claim', invoice, reason }); };
  claims.setEwallet = async () => {};

  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  function send(body) { return fetch(`http://127.0.0.1:${port}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  await send({ entry: [{ changes: [{ value: { messages: [{ from: '1', type: 'interactive', interactive: { button_reply: { id: 'b4', title: '🛡️ Klaim Garansi' } } }] } }] }] });
  await send({ entry: [{ changes: [{ value: { messages: [{ from: '1', type: 'text', text: { body: 'INV-1' } }] } }] }] });
  await send({ entry: [{ changes: [{ value: { messages: [{ from: '1', type: 'interactive', interactive: { button_reply: { id: 'b1', title: 'Ajukan Klaim' } } }] } }] }] });
  await send({ entry: [{ changes: [{ value: { messages: [{ from: '1', type: 'text', text: { body: 'rusak' } }] } }] }] });
  await new Promise(r => server.close(r));

  const claimCall = messages.find(m => m.type === 'claim');
  assert.ok(claimCall);
  assert.strictEqual(claimCall.invoice, 'INV-1');
  assert.strictEqual(claimCall.reason, 'rusak');
  claims.createClaim = origCreate;
  claims.setEwallet = origSet;
});

test('requestEwallet sends refund amount', async () => {
  messages.length = 0;
  const db = require.cache[dbPath].exports;
  db.warrantyclaims = { findUnique: async () => ({ id: 1, refund_cents: 5000, order: { buyer_phone: '1' } }) };

  await claims.requestEwallet(1);
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].type, 'text');
  assert.ok(messages[0].args[1].includes('Rp50'));
  assert.ok(messages[0].args[1].includes('Kirim nomor ShopeePay'));
});

