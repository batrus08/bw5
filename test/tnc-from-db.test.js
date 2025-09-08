const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

process.env.WA_APP_SECRET = '';

const waPath = require.resolve('../src/services/wa');
const ordersSvcPath = require.resolve('../src/services/orders');
const dbPath = require.resolve('../src/db/client');
const eventPath = require.resolve('../src/services/events');

// Capture WA messages
const messages = [];
require.cache[waPath] = { exports:{
  sendInteractiveButtons: async (...args)=>{ messages.push({ type:'buttons', args }); },
  sendQrisPayment: async (...args)=>{ messages.push({ type:'qris', args }); },
}};

// Capture events
const events = [];
require.cache[eventPath] = { exports:{ addEvent: async (...args)=>{ events.push(args); } } };

const order = { id:1, invoice:'INV-1', product_code:'P1', qty:1, amount_cents:1000, status:'PENDING_PAYMENT', tnc_ack_at:null };
require.cache[ordersSvcPath] = { exports:{
  createOrder: async ()=>order,
  setPayAck: async ()=>{},
  requestHelp: async ()=>{},
  ackTerms: async ()=>{ order.tnc_ack_at = new Date(); await require(eventPath).addEvent(order.id,'TNC_CONFIRMED','terms accepted'); return order; },
}};
require.cache[dbPath] = { exports:{
  product_variants:{ findUnique: async ()=>({
    variant_id:'v1', code:'V1', title:'Var', price_cents:1000, active:true, tnc_key:'T1',
    product:{ code:'P1', name:'Prod', price_cents:1000, is_active:true }
  }) },
  terms:{ findUnique: async ()=>({ key:'T1', body_md:'S&K dari DB' }) },
  orders:{
    update: async ({ data })=>{ Object.assign(order,data); return order; },
    findFirst: async () => null,
  },
}};

const waWebhook = require('../src/whatsapp/webhook');

function startApp(){
  const app = express();
  app.use(express.json({ verify:(req,_res,buf)=>{ req.rawBody=buf; } }));
  app.use('/', waWebhook);
  return app;
}

test('terms loaded from DB and ack time set', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  function send(body){ return fetch(`http://127.0.0.1:${port}/`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); }
  await send({ entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'interactive', interactive:{ list_reply:{ id:'var:v1' } } }] } }] }] });
  assert.strictEqual(messages[0].args[1], 'S\u0026K dari DB');
  await send({ entry:[{ changes:[{ value:{ messages:[{ from:'1', type:'interactive', interactive:{ button_reply:{ id:'b1', title:'Setuju' } } }] } }] }] });
  assert.ok(order.tnc_ack_at instanceof Date);
  assert.ok(events.find(e=>e[1]==='TNC_CONFIRMED'));
  await new Promise(r=>server.close(r));
});
