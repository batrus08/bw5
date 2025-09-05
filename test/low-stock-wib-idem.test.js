const assert = require('node:assert');
const { test } = require('node:test');

const stockPath = require.resolve('../src/services/stock');
const dbPath = require.resolve('../src/db/client');
const eventPath = require.resolve('../src/services/events');
const tgPath = require.resolve('../src/services/telegram');

require.cache[stockPath] = { exports:{ getStockSummaryRaw: async () => ([{ code:'NET-1P1U-30', variant_id:'v1', units:1, capacity:2 }]) } };
require.cache[dbPath] = { exports:{ thresholds:{ findMany: async () => ([{ variant_id:'v1', low_stock_units:2 }]) } } };
const events = [];
const seen = new Set();
require.cache[eventPath] = { exports:{ addEvent: async (_oid, kind, msg, meta, actor, source, idem) => {
  if(seen.has(idem)) return null;
  seen.add(idem);
  events.push({ kind, idem });
  return {};
} } };
require.cache[tgPath] = { exports:{ notifyAdmin: async () => {} } };

delete require.cache[require.resolve('../src/services/worker')];
const { lowStockAlert } = require('../src/services/worker');

const RealDate = Date;
function setTime(iso){
  const ms = new RealDate(iso).getTime();
  global.Date = class extends RealDate {
    constructor(...args){
      if(args.length===0) return new RealDate(ms);
      return new RealDate(...args);
    }
    static now(){ return ms; }
  };
}
function reset(){ global.Date = RealDate; }

test('lowStockAlert idempotent per WIB hour', async () => {
  try {
    setTime('2025-09-05T08:59:30+07:00');
    await lowStockAlert();
    assert.strictEqual(events.length,1);
    assert.strictEqual(events[0].idem,'lowstock:NET-1P1U-30:2025090508');
    setTime('2025-09-05T09:00:05+07:00');
    await lowStockAlert();
    assert.strictEqual(events.length,2);
    assert.strictEqual(events[1].idem,'lowstock:NET-1P1U-30:2025090509');
    setTime('2025-09-05T09:00:20+07:00');
    await lowStockAlert();
    assert.strictEqual(events.length,2);
  } finally {
    reset();
  }
});
