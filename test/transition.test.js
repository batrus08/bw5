const assert = require('node:assert');
const { test } = require('node:test');

const dbPath = require.resolve('../src/db/client');
require.cache[dbPath] = { exports:{} };
const { detectTransition } = require('../src/services/worker');

test('detectTransition flags stock changes', () => {
  assert.strictEqual(detectTransition(true, false), 'OUT_OF_STOCK');
  assert.strictEqual(detectTransition(false, true), 'RESTOCKED');
  assert.strictEqual(detectTransition(true, true), null);
});

