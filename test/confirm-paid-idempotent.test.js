const assert = require('node:assert');
const { test } = require('node:test');

process.env.TELEGRAM_BOT_TOKEN = 't';
process.env.ADMIN_CHAT_ID = '1';
process.env.WEBHOOK_SECRET_PATH = 'w';
process.env.DATABASE_URL = 'postgres://';
process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString('base64');

const dbPath = require.resolve('../src/db/client');
const eventPath = require.resolve('../src/services/events');
const waPath = require.resolve('../src/services/wa');
const variantPath = require.resolve('../src/services/variants');

function setupStore(order) {
  const store = {
    accounts: [
      { id: 1, variant_id: 'v1', product_code: 'C', status: 'AVAILABLE', max_usage: 1, used_count: 0, fifo_order: 1n }
    ],
    orders: [order],
    events: [],
    messages: [],
  };

  require.cache[dbPath] = {
    exports: {
      $transaction: async (fn) => fn({
        orders: {
          findUnique: async ({ where }) => store.orders.find(o => o.id === where.id),
          update: async ({ where, data }) => {
            const o = store.orders.find(x => x.id === where.id);
            Object.assign(o, data);
            return o;
          }
        },
        $queryRaw: async () => [store.accounts[0]],
        accounts: {
          update: async ({ where, data }) => {
            Object.assign(store.accounts.find(a => a.id === where.id), data);
          }
        }
      }),
      orders: {
        findUnique: async ({ where }) => store.orders.find(o => o.invoice === where.invoice || o.id === where.id),
        update: async ({ where, data }) => {
          const o = store.orders.find(x => x.id === where.id || x.invoice === where.invoice);
          Object.assign(o, data);
          return o;
        }
      },
      tasks: { create: async () => {} }
    }
  };

  require.cache[eventPath] = {
    exports: {
      addEvent: async (_oid, kind, _msg, _meta, _actor, _source, idem) => {
        store.events.push({ kind, idem });
      }
    }
  };

  require.cache[waPath] = {
    exports: {
      sendText: async (_to, text) => {
        store.messages.push(text);
      }
    }
  };

  require.cache[variantPath] = {
    exports: {
      resolveVariantByCode: async () => ({ variant_id: 'v1', duration_days: 30 })
    }
  };

  return store;
}

test('confirmPaid idempotent on repeat call', async () => {
  const order = {
    id: 1,
    invoice: 'INV1',
    product_code: 'C',
    buyer_phone: '1',
    product: { delivery_mode: 'sharing', duration_months: 1 },
    delivery_mode: 'USERPASS',
    status: 'PENDING_PAYMENT',
    idempotency_key: null
  };
  const store = setupStore(order);
  delete require.cache[require.resolve('../src/services/orders')];
  const { confirmPaid } = require('../src/services/orders');

  const first = await confirmPaid('INV1');
  assert.deepStrictEqual(first, { ok: true });
  assert.ok(store.orders[0].pay_ack_at instanceof Date);
  const deliveredAt = store.orders[0].delivered_at;
  assert.ok(deliveredAt instanceof Date);
  assert.strictEqual(store.events.filter(e => e.kind === 'PAY_ACK').length, 1);
  assert.strictEqual(store.events.filter(e => e.kind === 'DELIVERED').length, 1);
  assert.strictEqual(store.messages.filter(m => m.includes('Username:')).length, 1);

  const second = await confirmPaid('INV1');
  assert.deepStrictEqual(second, { ok: true, idempotent: true });
  assert.strictEqual(store.orders[0].delivered_at, deliveredAt);
  assert.strictEqual(store.events.filter(e => e.kind === 'DELIVERED').length, 1);
  assert.strictEqual(store.messages.filter(m => m.includes('Username:')).length, 1);
});

