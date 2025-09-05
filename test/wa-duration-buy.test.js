const assert = require('node:assert');
const { test } = require('node:test');
const express = require('express');

process.env.WA_APP_SECRET = '';
const waPath = require.resolve('../src/services/wa');
const orderPath = require.resolve('../src/services/orders');
const dbPath = require.resolve('../src/db/client');
const tgPath = require.resolve('../src/services/telegram');

const buttons = [];
const orders = [];
require.cache[waPath] = { exports: {
  sendText: async () => {},
  sendInteractiveButtons: async (...args) => { buttons.push(args); },
  sendListMenu: async () => {},
  sendImageById: async () => {},
  sendImageByUrl: async () => {},
} };
require.cache[orderPath] = { exports: {
  createOrder: async (data) => { orders.push(data); return { invoice:'INV', status:'PENDING_PAYMENT', created_at:new Date() }; },
  setPayAck: async () => {}
} };
require.cache[tgPath] = { exports: { sendMessage: async () => {}, buildOrderKeyboard: () => ({}) } };
require.cache[dbPath] = { exports: {
  products: { findUnique: async () => ({ price_cents:1000, is_active:true }) },
} };

const waWebhook = require('../src/whatsapp/webhook');

function startApp(){
  const app = express();
  app.use(express.json({ verify:(req,_res,buf)=>{ req.rawBody=buf; } }));
  app.use('/', waWebhook);
  return app;
}

test('select duration then buy creates order with sub_code', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  function send(body){ return fetch(`http://127.0.0.1:${port}/`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); }
  await send({ entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'interactive', interactive:{ list_reply:{ id:'dur:PROD:30' } } }] } }] }] });
  assert.strictEqual(buttons.length,1);
  await send({ entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'interactive', interactive:{ button_reply:{ id:'b1', title:'Beli 1' } } }] } }] }] });
  assert.strictEqual(orders.length,1);
  assert.strictEqual(orders[0].sub_code,'PROD:30');
  await new Promise(r=>server.close(r));
});
