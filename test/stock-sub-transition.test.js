const assert = require('node:assert');
const { test } = require('node:test');

const workerPath = require.resolve('../src/services/worker');
const dbPath = require.resolve('../src/db/client');
const notifyPath = require.resolve('../src/services/telegram');
const n8nPath = require.resolve('../src/utils/n8n');

delete require.cache[workerPath];

const store = {
  products: [{ code:'P', is_active:true }],
  accounts: [{ product_code:'P', status:'AVAILABLE', variant_duration:30 }],
  alerts: [
    { product_code:'P', sub_code:'P:30', last_status:'IN_STOCK' },
    { product_code:'P', sub_code:'P:60', last_status:'OUT_OF_STOCK' },
  ],
  events: [],
};

require.cache[dbPath] = { exports: {
  products: { findMany: async () => store.products },
  accounts: { findMany: async ({ where }) => store.accounts.filter(a=>a.product_code===where.product_code && a.status===where.status) },
  stockalerts: {
    findMany: async ({ where }) => store.alerts.filter(a=>a.product_code===where.product_code),
    create: async ({ data }) => { store.alerts.push(data); return data; },
    update: async ({ where, data }) => {
      const idx = store.alerts.findIndex(a=>a.product_code===where.product_code_sub_code.product_code && a.sub_code===where.product_code_sub_code.sub_code);
      store.alerts[idx] = { ...store.alerts[idx], ...data };
      return store.alerts[idx];
    },
  },
} };
require.cache[notifyPath] = { exports: { notifyAdmin: async () => {}, notifyCritical: async () => {}, tgCall: async () => {} } };
require.cache[n8nPath] = { exports: { emitToN8N: async (...args) => { store.events.push(args); }, sendToN8N: async () => {} } };

const { stockTransitions } = require('../src/services/worker');

test('stock transitions per sub product', async () => {
  await stockTransitions();
  assert.strictEqual(store.events.length,0);
  store.accounts = [{ product_code:'P', status:'AVAILABLE', variant_duration:60 }];
  await stockTransitions();
  assert.strictEqual(store.events.length,2);
  assert.strictEqual(store.events[0][1].status,'RESTOCKED');
  assert.strictEqual(store.events[0][1].sub_code,'P:60');
  assert.strictEqual(store.events[1][1].status,'OUT_OF_STOCK');
  assert.strictEqual(store.events[1][1].sub_code,'P:30');
  await stockTransitions();
  assert.strictEqual(store.events.length,2);
});
