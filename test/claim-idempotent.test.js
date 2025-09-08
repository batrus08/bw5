const assert = require('node:assert');
const { test } = require('node:test');
const express = require('express');

process.env.TELEGRAM_BOT_TOKEN = 'x';
process.env.ADMIN_CHAT_ID = '1';
process.env.WEBHOOK_SECRET_PATH = 's';
process.env.DATABASE_URL = 'postgres://x';
process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString('base64');

const dbPath = require.resolve('../src/db/client');
const waPath = require.resolve('../src/services/wa');
const sheetPath = require.resolve('../src/services/sheet');
const n8nPath = require.resolve('../src/utils/n8n');

let updateCount = 0;
const logs = [];
require.cache[waPath] = { exports: { sendText: async () => {} } };
require.cache[sheetPath] = { exports: { appendWarrantyLog: async (...args) => { logs.push(args); } } };
require.cache[n8nPath] = { exports: { emitToN8N: async () => {} } };

const store = { claim: { id:1, status:'REFUNDED', ewallet:'0812345678', refund_cents:1000, order:{ invoice:'INV1', buyer_phone:'1' } } };
require.cache[dbPath] = { exports: {
  warrantyclaims: {
    findUnique: async ({ where, include }) => {
      if (where.id !== 1) return null;
      const c = { ...store.claim };
      if (include?.order) c.order = store.claim.order;
      return c;
    },
    update: async ({ data }) => { updateCount++; Object.assign(store.claim, data); return { ...store.claim, order: store.claim.order }; }
  }
} };

const claimsRoute = require('../src/routes/claims');

function start(){ const app=express(); app.use(express.json()); app.use('/claims', claimsRoute); return app; }

test('claim endpoints idempotent after refund', async () => {
  const app = start();
  const server = app.listen(0); const port = server.address().port;
  const send = (path, body) => fetch(`http://127.0.0.1:${port}${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });

  async function twice(path, body){
    let res = await send(path, body);
    let b = await res.json();
    assert.ok(b.idempotent);
    assert.strictEqual(updateCount,0);
    res = await send(path, body);
    b = await res.json();
    assert.ok(b.idempotent);
    assert.strictEqual(updateCount,0);
  }

  await twice('/claims/1/approve');
  await twice('/claims/1/reject', { reason:'x' });
  await twice('/claims/1/refunded');
  assert.strictEqual(logs.length,0);

  await new Promise(r=>server.close(r));
});
