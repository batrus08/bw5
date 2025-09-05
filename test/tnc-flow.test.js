const assert = require('node:assert');
const { test } = require('node:test');
const express = require('express');

process.env.WA_APP_SECRET='';
const waPath = require.resolve('../src/services/wa');
const ordersSvcPath = require.resolve('../src/services/orders');
const dbPath = require.resolve('../src/db/client');
const tgPath = require.resolve('../src/services/telegram');
const eventPath = require.resolve('../src/services/events');

const messages = [];
require.cache[waPath] = { exports:{
  sendInteractiveButtons: async (...args)=>{ messages.push({ type:'buttons', args }); },
  sendImageById: async (...args)=>{ messages.push({ type:'image', args }); },
  sendImageByUrl: async (...args)=>{ messages.push({ type:'image', args }); },
}};
require.cache[ordersSvcPath] = { exports:{
  createOrder: async () => ({ id:1, invoice:'INV-1', product_code:'CGPT-SHARE', qty:1, amount_cents:10000, status:'PENDING_PAYMENT', created_at:new Date(), tnc_ack_at:null }),
  setPayAck: async () => {},
  requestHelp: async () => {},
} };
require.cache[tgPath] = { exports:{ sendMessage: async ()=>{}, buildOrderKeyboard: ()=>({}) } };
require.cache[eventPath] = { exports:{ addEvent: async ()=>{} } };
require.cache[dbPath] = { exports:{
  products:{ findUnique: async ({ where }) => ({ code: where.code, is_active:true, price_cents:10000, duration_months:1, sk_text:'S&K test' }) },
  orders:{ findFirst: async () => null, update: async ({ where, data }) => ({ id: where.id, tnc_ack_at: data.tnc_ack_at, created_at:new Date(), invoice:'INV-1', qty:1, amount_cents:10000, product_code:'CGPT-SHARE' }) },
}};

const waWebhook = require('../src/whatsapp/webhook');

function startApp(){
  const app = express();
  app.use(express.json({ verify:(req,_res,buf)=>{ req.rawBody=buf; } }));
  app.use('/', waWebhook);
  return app;
}

test('payment instructions only after T&C ack', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  function send(body){ return fetch(`http://127.0.0.1:${port}/`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); }
  await send({ entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'text', text:{ body:'order CGPT-SHARE' } }] } }] }] });
  assert.strictEqual(messages.length,1);
  assert.strictEqual(messages[0].args[1],'S&K test');
  await send({ entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'interactive', interactive:{ button_reply:{ id:'b1', title:'Setuju' } } }] } }] }] });
  assert.ok(messages.find(m=>m.type==='buttons' && m.args[1].includes('Invoice')));
  await new Promise(r=>server.close(r));
});
