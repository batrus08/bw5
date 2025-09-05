const assert = require('node:assert');
const { test } = require('node:test');

const dbPath = require.resolve('../src/db/client');

const store = {
  variants: [{ variant_id:'V1', code:'V1' }],
  accounts: [
    { variant_id:'V1', status:'AVAILABLE', max_usage:1, used_count:0 },
    { variant_id:'V1', status:'AVAILABLE', max_usage:4, used_count:1 },
    { variant_id:'V1', status:'AVAILABLE', max_usage:2, used_count:2 },
  ],
};

require.cache[dbPath] = { exports:{ $queryRaw: async () => {
  const accs = store.accounts.filter(a=>a.status==='AVAILABLE');
  const units = accs.filter(a=>a.used_count < a.max_usage).length;
  const capacity = accs.reduce((s,a)=>s + Math.max(0,a.max_usage - a.used_count),0);
  return [{ code:'V1', units, capacity }];
} } };

const { getStockSummary } = require('../src/services/stock');

test('getStockSummary aggregates units and capacity', async () => {
  const rows = await getStockSummary();
  const v1 = rows.find(r=>r.code==='V1');
  assert.ok(v1);
  assert.strictEqual(v1.units,2);
  assert.strictEqual(v1.capacity,4);
});
