const assert = require('node:assert');
const { test } = require('node:test');

const dbPath = require.resolve('../src/db/client');
const eventPath = require.resolve('../src/services/events');

const store = {
  accounts: [{ id: 1, variant_id: 'v1', status: 'AVAILABLE', max_usage:1, used_count:0, fifo_order:1n, natural_key:'k1' }],
  orders: [
    { id: 1, metadata: {} },
    { id: 2, metadata: {} },
  ],
};

require.cache[dbPath] = { exports: {
  $transaction: async (fn) => fn({
    accounts: {
      update: async ({ where, data }) => {
        const acc = store.accounts.find((a) => a.id === where.id);
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
    $queryRaw: async (strings, variantId) => {
      return store.accounts.filter(a=>a.variant_id===variantId && a.status==='AVAILABLE' && a.used_count<a.max_usage);
    },
  }),
} };

require.cache[eventPath] = { exports: { addEvent: async () => {} } };

const { reserveAccount } = require('../src/services/orders');

test('reserveAccount allows only one reservation', async () => {
  await reserveAccount(1, 'v1');
  assert.strictEqual(store.accounts[0].status, 'DISABLED');
  const second = await Promise.allSettled([reserveAccount(2, 'v1')]);
  assert.strictEqual(second[0].status, 'rejected');
});

