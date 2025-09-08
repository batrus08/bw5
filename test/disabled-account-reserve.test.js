const assert = require('node:assert');
const { test } = require('node:test');

// Test that reserveAccount skips disabled or deleted accounts

// Setup for reserveAccount

test('reserveAccount skips disabled/deleted accounts', async () => {
  const dbPath = require.resolve('../src/db/client');
  const eventPath = require.resolve('../src/services/events');
  const stockPath = require.resolve('../src/services/stock');

  const store = {
    accounts: [
      { id: 1, variant_id: 'v1', product_code: 'C', status: 'AVAILABLE', disabled: false, deleted_at: null, max_usage: 1, used_count: 0, fifo_order: 1n, username: 'u1', password: 'p1' },
      { id: 2, variant_id: 'v1', product_code: 'C', status: 'AVAILABLE', disabled: true, deleted_at: null, max_usage: 1, used_count: 0, fifo_order: 2n, username: 'u2', password: 'p2' },
    ],
    orders: [{ id: 1, product_code: 'C', metadata: {} }],
  };

  require.cache[dbPath] = {
    exports: {
      $transaction: async (fn) => fn({
        $queryRaw: async (_q, variantId) => {
          return store.accounts
            .filter(a => ((a.variant_id === variantId) || (variantId == null && a.product_code === 'C'))
              && a.status === 'AVAILABLE'
              && !a.disabled
              && a.deleted_at === null
              && a.used_count < a.max_usage)
            .sort((a, b) => (a.fifo_order - b.fifo_order) || (a.id - b.id))
            .slice(0, 1);
        },
        accounts: {
          update: async ({ where, data }) => {
            const acc = store.accounts.find(a => a.id === where.id);
            Object.assign(acc, data);
            return acc;
          },
        },
        orders: {
          findUnique: async ({ where }) => store.orders.find(o => o.id === where.id),
          update: async ({ where, data }) => {
            const o = store.orders.find(x => x.id === where.id);
            Object.assign(o, data);
            return o;
          },
        },
      }),
    }
  };

  require.cache[eventPath] = { exports: { addEvent: async () => {} } };
  require.cache[stockPath] = { exports: { publishStockSummary: async () => {} } };

  delete require.cache[require.resolve('../src/services/orders')];
  const { reserveAccount } = require('../src/services/orders');

  await reserveAccount(1, 'v1');

  assert.strictEqual(store.orders[0].account_id, 1);
  assert.strictEqual(store.accounts[0].status, 'DISABLED');
  assert.strictEqual(store.accounts[0].used_count, 1);
  assert.strictEqual(store.accounts[1].used_count, 0);
  assert.strictEqual(store.accounts[1].status, 'AVAILABLE');
});

// Test for publishStockSummary

test('publishStockSummary excludes disabled/deleted accounts', async () => {
  const dbPath = require.resolve('../src/db/client');
  const outputPath = require.resolve('../src/services/output');

  const store = {
    accounts: [
      { id: 1, variant_id: 'v1', status: 'AVAILABLE', disabled: false, deleted_at: null, used_count: 0, max_usage: 1 },
      { id: 2, variant_id: 'v1', status: 'AVAILABLE', disabled: true, deleted_at: null, used_count: 0, max_usage: 1 },
    ],
    summary: null,
  };

  require.cache[dbPath] = {
    exports: {
      $queryRaw: async () => {
        const accs = store.accounts.filter(a => a.status === 'AVAILABLE' && !a.disabled && a.deleted_at === null);
        const units = accs.filter(a => a.used_count < a.max_usage).length;
        const capacity = accs.reduce((s, a) => s + Math.max(0, a.max_usage - a.used_count), 0);
        return [{ code: 'v1', units, capacity }];
      },
    }
  };

  require.cache[outputPath] = { exports: { publishStock: async (rows) => { store.summary = rows; } } };

  delete require.cache[require.resolve('../src/services/stock')];
  const { publishStockSummary } = require('../src/services/stock');

  await publishStockSummary();

  assert.ok(Array.isArray(store.summary));
  assert.strictEqual(store.summary.length, 1);
  const row = store.summary[0];
  assert.strictEqual(row.code, 'v1');
  assert.strictEqual(row.units, 1);
  assert.strictEqual(row.capacity, 1);
});

