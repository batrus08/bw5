const assert = require('node:assert');
const { test } = require('node:test');

const stockPath = require.resolve('../src/services/stock');
const eventPath = require.resolve('../src/services/events');
const tgPath = require.resolve('../src/services/telegram');
const dbPath = require.resolve('../src/db/client');

require.cache[stockPath] = { exports:{ getStockSummaryRaw: async () => ([{ code:'A', variant_id:'v1', units:1, capacity:2 }]) } };
const events = [];
require.cache[eventPath] = { exports:{ addEvent: async (...args) => { events.push(args); return {}; } } };
const notes = [];
require.cache[tgPath] = { exports:{ notifyAdmin: async (txt) => { notes.push(txt); } } };
require.cache[dbPath] = { exports:{ thresholds:{ findMany: async () => ([{ variant_id:'v1', low_stock_units:2, low_stock_capacity:3 }]) } } };

delete require.cache[require.resolve('../src/services/worker')];
const { lowStockAlert } = require('../src/services/worker');

test('lowStockAlert triggers when below threshold', async () => {
  await lowStockAlert();
  assert.strictEqual(events.length,1);
  assert.strictEqual(notes.length,1);
});
