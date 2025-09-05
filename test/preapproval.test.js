const assert = require('node:assert');
const { test } = require('node:test');

const dbPath = require.resolve('../src/db/client');
const eventPath = require.resolve('../src/services/events');

const store = { orders: [], preapps: [] };

require.cache[dbPath] = { exports: {
  subproductconfigs: {
    findUnique: async ({ where }) => {
      const sub = where.product_code_sub_code.sub_code;
      if (sub === 'need') return { approval_required: true };
      return null;
    },
  },
  orders: {
    create: async ({ data }) => {
      const o = { id: store.orders.length + 1, ...data, created_at: new Date() };
      store.orders.push(o);
      return o;
    },
  },
  preapprovalrequests: {
    create: async ({ data }) => { store.preapps.push(data); },
  },
} };

require.cache[eventPath] = { exports: { addEvent: async () => {} } };

const { createOrder } = require('../src/services/orders');

test('order requiring approval goes to AWAITING_PREAPPROVAL', async () => {
  const o = await createOrder({ buyer_phone: '1', product_code: 'P', qty: 1, amount_cents: 100, sub_code: 'need' });
  assert.strictEqual(o.status, 'AWAITING_PREAPPROVAL');
  assert.strictEqual(store.preapps.length, 1);
});

test('order without approval goes to PENDING_PAYMENT', async () => {
  const o = await createOrder({ buyer_phone: '1', product_code: 'P', qty: 1, amount_cents: 100, sub_code: 'none' });
  assert.strictEqual(o.status, 'PENDING_PAYMENT');
});

