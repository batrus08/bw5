const assert = require('node:assert');
const { test } = require('node:test');
const express = require('express');

process.env.WA_APP_SECRET = '';
const waPath = require.resolve('../src/services/wa');
const stockPath = require.resolve('../src/services/stock');
const tgPath = require.resolve('../src/services/telegram');
const orderPath = require.resolve('../src/services/orders');

const listCalls = [];
require.cache[waPath] = { exports: { sendText: async () => {}, sendInteractiveButtons: async () => {}, sendListMenu: async (...args) => { listCalls.push(args); } } };
require.cache[stockPath] = { exports: { getStockOptions: async () => [ { durationDays: 30, stock: 2 }, { durationDays: 60, stock: 0 } ] } };
require.cache[tgPath] = { exports: { sendMessage: async () => {}, buildOrderKeyboard: () => ({}) } };
require.cache[orderPath] = { exports: { createOrder: async () => ({}), setPayAck: async () => {} } };

const waWebhook = require('../src/whatsapp/webhook');

function startApp() {
  const app = express();
  app.use(express.json({ verify:(req,_res,buf)=>{ req.rawBody=buf; } }));
  app.use('/', waWebhook);
  return app;
}

test('durasi menu shows stock and hides zero', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  const body = { entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'text', text:{ body:'durasi PROD' } }] } }] }] };
  await fetch(`http://127.0.0.1:${port}/`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  assert.strictEqual(listCalls.length,1);
  const sections = listCalls[0][3]; // sendListMenu(to, header, body, sections)
  const rows = sections[0].rows;
  assert.strictEqual(rows.length,1);
  assert.ok(rows[0].desc.includes('Stok: 2'));
  await new Promise((r)=>server.close(r));
});
