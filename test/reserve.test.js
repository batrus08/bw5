const assert = require('node:assert');
const { test } = require('node:test');

const dbPath = require.resolve('../src/db/client');
const eventPath = require.resolve('../src/services/events');

const store = {
  accounts: [{ id: 1, product_code: 'P', status: 'AVAILABLE', account_group_id: 'G1', profile_index: 1, profile_name: 'A', username:'u', password:'p' }],
  orders: [
    { id: 1, product_code: 'P', metadata: {} },
    { id: 2, product_code: 'P', metadata: {} },
  ],
};

require.cache[dbPath] = { exports: {
  $transaction: async (fn) => fn({
    accounts: {
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
    $queryRaw: async () => [store.accounts.find(a=>a.status==='AVAILABLE')].filter(Boolean),
  }),
} };

require.cache[eventPath] = { exports: { addEvent: async () => {} } };

const { reserveAccount } = require('../src/services/orders');

test('reserveAccount allows only one reservation', async () => {
  const [a, b] = await Promise.allSettled([reserveAccount(1), reserveAccount(2)]);
  assert.strictEqual(a.status, 'fulfilled');
  assert.strictEqual(b.status, 'rejected');
});

