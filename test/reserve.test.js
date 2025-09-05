const assert = require('node:assert');
const { test } = require('node:test');

const dbPath = require.resolve('../src/db/client');
const eventPath = require.resolve('../src/services/events');

const store = {
  accounts: [{ id: 1, product_code: 'P', status: 'AVAILABLE' }],
  orders: [
    { id: 1, product_code: 'P' },
    { id: 2, product_code: 'P' },
  ],
};

require.cache[dbPath] = { exports: {
  $transaction: async (fn) => fn({
    accounts: {
      findFirst: async ({ where }) =>
        store.accounts.find((a) => a.product_code === where.product_code && a.status === where.status),
      update: async ({ where, data }) => {
        const acc = store.accounts.find((a) => a.id === where.id && a.status === where.status);
        if (!acc) throw new Error('Stok habis');
        Object.assign(acc, data);
        return acc;
      },
    },
    orders: {
      findUnique: async ({ where }) => store.orders.find((o) => o.id === where.id),
      update: async ({ where, data }) => {
        const o = store.orders.find((x) => x.id === where.id);
        Object.assign(o, data);
        return o;
      },
    },
  }),
} };

require.cache[eventPath] = { exports: { addEvent: async () => {} } };

const { reserveAccount } = require('../src/services/orders');

test('reserveAccount allows only one reservation', async () => {
  const [a, b] = await Promise.allSettled([reserveAccount(1), reserveAccount(2)]);
  assert.strictEqual(a.status, 'fulfilled');
  assert.strictEqual(b.status, 'rejected');
});

