const assert = require('node:assert');
const { test } = require('node:test');
const express = require('express');

process.env.WA_APP_SECRET = '';
const waPath = require.resolve('../src/services/wa');
const claimPath = require.resolve('../src/services/claims');
const dbPath = require.resolve('../src/db/client');
const tgPath = require.resolve('../src/services/telegram');

const messages = [];
require.cache[waPath] = { exports: {
  sendText: async (...args) => { messages.push({ type: 'text', args }); },
  sendInteractiveButtons: async (...args) => { messages.push({ type: 'buttons', args }); },
  sendListMenu: async () => {},
} };
require.cache[claimPath] = { exports: { createClaim: async (invoice, reason) => { messages.push({ type: 'claim', invoice, reason }); }, setEwallet: async () => {} } };
require.cache[tgPath] = { exports: { sendMessage: async () => {}, buildOrderKeyboard: () => ({}) } };
require.cache[dbPath] = { exports: {
  orders: {
    findUnique: async ({ where }) => {
      if (where.invoice !== 'INV-1') return null;
      return { invoice: 'INV-1', status: 'DELIVERED', amount_cents: 10000, created_at: new Date(Date.now()-5*86400000), product:{ name:'Prod', duration_months:1 } };
    },
  },
} };

const waWebhook = require('../src/whatsapp/webhook');

function startApp() {
  const app = express();
  app.use(express.json({ verify:(req,_res,buf)=>{ req.rawBody=buf; } }));
  app.use('/', waWebhook);
  return app;
}

test('claim flow triggers createClaim', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  function send(body){ return fetch(`http://127.0.0.1:${port}/`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); }
  await send({ entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'interactive', interactive:{ button_reply:{ id:'b4', title:'🛡️ Klaim Garansi' } } }] } }] }] });
  await send({ entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'text', text:{ body:'INV-1' } }] } }] }] });
  await send({ entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'interactive', interactive:{ button_reply:{ id:'b1', title:'Ajukan Klaim' } } }] } }] }] });
  await send({ entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'text', text:{ body:'rusak' } }] } }] }] });
  await new Promise(r=>server.close(r));
  const claimCall = messages.find(m=>m.type==='claim');
  assert.ok(claimCall);
  assert.strictEqual(claimCall.invoice,'INV-1');
  assert.strictEqual(claimCall.reason,'rusak');
});
