const assert = require('node:assert');
const { test } = require('node:test');

const dbPath = require.resolve('../src/db/client');
require.cache[dbPath] = { exports:{ $queryRaw: async (strings,...vals) => {
  const sql = strings.join('?');
  assert.ok(!/password/i.test(sql));
  return [{ id:1, fifo_order:0, used_count:0, max_usage:1, status:'AVAILABLE' }];
} } };

const { getStockDetail } = require('../src/services/stock');

test('getStockDetail masks password', async () => {
  const rows = await getStockDetail('X');
  assert.deepStrictEqual(rows, [{ id:1, fifo_order:0, used_count:0, max_usage:1, status:'AVAILABLE' }]);
  assert.ok(!('password' in rows[0]));
});
