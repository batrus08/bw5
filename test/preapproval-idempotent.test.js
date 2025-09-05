const assert = require('node:assert');
const { test } = require('node:test');
const express = require('express');

process.env.TELEGRAM_BOT_TOKEN = 'x';
process.env.ADMIN_CHAT_ID = '1';
process.env.WEBHOOK_SECRET_PATH = 's';
process.env.DATABASE_URL = 'postgres://x';
process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString('base64');

const messages = [];
const waPath = require.resolve('../src/services/wa');
const eventPath = require.resolve('../src/services/events');
require.cache[waPath] = { exports: {
  sendText: async (...args) => { messages.push(args); },
  sendImageById: async (...args) => { messages.push(args); },
  sendImageByUrl: async (...args) => { messages.push(args); },
} };
require.cache[eventPath] = { exports: { addEvent: async () => {} } };

const dbPath = require.resolve('../src/db/client');
const store = { order: { id:1, invoice:'INV1', buyer_phone:'1', amount_cents:1000, created_at:new Date(), status:'AWAITING_PREAPPROVAL', preapproval:{ status:'PENDING', sub_code:'default' } } };
require.cache[dbPath] = { exports: {
  orders: {
    findUnique: async ({ where, include }) => {
      if (where.invoice !== 'INV1') return null;
      const o = { ...store.order };
      if (include?.preapproval) o.preapproval = store.order.preapproval;
      return o;
    },
    update: async ({ data }) => { Object.assign(store.order, data); return store.order; }
  },
  preapprovalrequests: {
    update: async ({ data }) => { Object.assign(store.order.preapproval, data); return store.order.preapproval; }
  },
  $transaction: async (ops) => { for (const op of ops) await op; }
} };

const preRoute = require('../src/routes/preapprovals');

function start(){ const app=express(); app.use(express.json()); app.use('/preapprovals', preRoute); return app; }

test('preapproval approve/reject idempotent', async () => {
  const app = start();
  const server = app.listen(0); const port = server.address().port;
  const send = (path, body) => fetch(`http://127.0.0.1:${port}${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });

  let res = await send('/preapprovals/INV1/approve');
  assert.strictEqual(store.order.preapproval.status, 'APPROVED');
  assert.strictEqual(messages.length,1);

  res = await send('/preapprovals/INV1/approve');
  const body = await res.json();
  assert.ok(body.idempotent);
  assert.strictEqual(messages.length,1);

  res = await send('/preapprovals/INV1/reject', { reason:'x' });
  const body2 = await res.json();
  assert.ok(body2.idempotent);
  assert.strictEqual(messages.length,1);

  await new Promise(r=>server.close(r));
});
