const assert = require('node:assert');
const { test } = require('node:test');

const dbPath = require.resolve('../src/db/client');
const eventPath = require.resolve('../src/services/events');

const store = { orders: [{ id: 1, status: 'PENDING_PAYMENT' }] };

require.cache[dbPath] = { exports: { orders: { update: async ({ where, data }) => {
  const o = store.orders.find(x => x.id === where.id);
  Object.assign(o, data);
  return o;
}} } };

const events = [];
require.cache[eventPath] = { exports: { addEvent: async (orderId, kind) => { events.push({ orderId, kind }); } } };

const { requestHelp } = require('../src/services/orders');

test('requestHelp switches status and logs event', async () => {
  await requestHelp(1);
  assert.strictEqual(store.orders[0].status, 'ON_HOLD_HELP');
  assert.deepStrictEqual(events, [{ orderId: 1, kind: 'HELP_REQUESTED' }]);
});
