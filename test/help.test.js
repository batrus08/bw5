const assert = require('node:assert');
const { test } = require('node:test');

const dbPath = require.resolve('../src/db/client');
const eventPath = require.resolve('../src/services/events');
const tgPath = require.resolve('../src/services/telegram');

const store = { orders: [{ id: 1, status: 'PENDING_PAYMENT' }] };

require.cache[dbPath] = { exports: { orders: {
  findUnique: async ({ where }) => store.orders.find(x => x.id === where.id),
  update: async ({ where, data }) => {
    const o = store.orders.find(x => x.id === where.id);
    Object.assign(o, data);
    return o;
  }
} } };

const events = [];
require.cache[eventPath] = { exports: { addEvent: async (orderId, kind, _msg, meta) => { events.push({ orderId, kind, meta }); } } };
const tgCalls = [];
require.cache[tgPath] = { exports: { notifyHelpRequested: async (orderId, ctx)=>{ tgCalls.push({ orderId, ctx }); } } };

const { requestHelp } = require('../src/services/orders');

test('requestHelp switches status and logs event with context', async () => {
  await requestHelp(1, { stage: 'PAYMENT' });
  assert.strictEqual(store.orders[0].status, 'ON_HOLD_HELP');
  assert.deepStrictEqual(events, [{ orderId: 1, kind: 'HELP_REQUESTED', meta: { prev_status: 'PENDING_PAYMENT', stage: { stage: 'PAYMENT' } } }]);
  assert.deepStrictEqual(tgCalls, [{ orderId: 1, ctx: { stage: 'PAYMENT' } }]);
});
