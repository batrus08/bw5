const assert = require('node:assert');
const { test } = require('node:test');

const { normalizeEwallet } = require('../src/utils/validation');

test('normalize valid ewallet number', () => {
  const r = normalizeEwallet(' 08-123 456 789 0 ');
  assert.strictEqual(r.normalized, '081234567890');
  assert.ok(r.isValid);
});

test('reject too short', () => {
  const r = normalizeEwallet('08123');
  assert.ok(!r.isValid);
});

test('reject wrong prefix', () => {
  const r = normalizeEwallet('0712345678');
  assert.ok(!r.isValid);
});

test('reject too long', () => {
  const r = normalizeEwallet('0812345678901234');
  assert.ok(!r.isValid);
});
