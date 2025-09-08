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
  sendQrisPayment: async (...args)=>{ messages.push({ type:'qris', args }); },
}};

const order = { id:1, invoice:'INV-1', product_code:'P1', qty:1, amount_cents:0, status:'PENDING_PAYMENT', created_at:new Date(), tnc_ack_at:null, expires_at:null };
require.cache[ordersSvcPath] = { exports:{
  createOrder: async ({ amount_cents }) => { Object.assign(order,{ amount_cents, variant_id:'v1' }); return order; },
  setPayAck: async () => {},
  requestHelp: async () => {},
  ackTerms: async () => { order.tnc_ack_at = new Date(); order.expires_at = new Date(order.tnc_ack_at.getTime()+45*86400000); await require(eventPath).addEvent(order.id,'TNC_CONFIRMED','terms accepted'); return order; },
} };
require.cache[tgPath] = { exports:{ sendMessage: async ()=>{}, buildOrderKeyboard: ()=>({}) } };
const events = [];
require.cache[eventPath] = { exports:{ addEvent: async (...args)=>{ events.push(args); } } };
require.cache[dbPath] = { exports:{
  product_variants:{ findUnique: async () => ({
    variant_id:'v1', code:'V1', title:'Var', price_cents:1500, duration_days:45, active:true, tnc_key:'T1',
    product:{ code:'P1', name:'Prod', price_cents:9999, duration_months:60, is_active:true }
  }) },
  terms:{ findUnique: async () => ({ key:'T1', body_md:'S&K var' }) },
  orders:{ findFirst: async () => null, update: async ({ data }) => { Object.assign(order, data); return order; } },
}};

const waWebhook = require('../src/whatsapp/webhook');

function startApp(){
  const app = express();
  app.use(express.json({ verify:(req,_res,buf)=>{ req.rawBody=buf; } }));
  app.use('/', waWebhook);
  return app;
}

test('accepting variant T&C sets ack time and uses variant values', async () => {
  messages.length = 0; events.length = 0; order.tnc_ack_at = null; order.expires_at = null; order.amount_cents = 0;
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  function send(body){ return fetch(`http://127.0.0.1:${port}/`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); }
  await send({ entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'interactive', interactive:{ list_reply:{ id:'var:v1' } } }] } }] }] });
  assert.strictEqual(messages[0].args[1],'S\u0026K var');
  await send({ entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'interactive', interactive:{ button_reply:{ id:'b1', title:'Setuju' } } }] } }] }] });
  assert.ok(order.tnc_ack_at instanceof Date);
  assert.ok(events.find(e=>e[1]==='TNC_CONFIRMED'));
  assert.strictEqual(order.amount_cents,1500);
  const days = (order.expires_at - order.tnc_ack_at)/86400000;
  assert.strictEqual(Math.round(days),45);
  await new Promise(r=>server.close(r));
});

test('declining variant T&C stops without order', async () => {
  messages.length = 0; events.length = 0; order.tnc_ack_at = null; order.expires_at = null; order.amount_cents = 0;
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  function send(body){ return fetch(`http://127.0.0.1:${port}/`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); }
  await send({ entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'interactive', interactive:{ list_reply:{ id:'var:v1' } } }] } }] }] });
  await send({ entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'interactive', interactive:{ button_reply:{ id:'b2', title:'Tolak' } } }] } }] }] });
  assert.ok(messages.find(m=>m.args[1].includes('Dibatalkan')));
  assert.strictEqual(order.tnc_ack_at,null);
  assert.strictEqual(events.length,0);
  assert.strictEqual(order.amount_cents,0);
  await new Promise(r=>server.close(r));
});
