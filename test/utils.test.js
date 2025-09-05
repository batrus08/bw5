const assert = require('node:assert');
const { test } = require('node:test');

const { formatRupiah } = require('../src/utils/currency');
const { calcLinearRefund } = require('../src/utils/refund');

test('formatRupiah formats cents into IDR', () => {
  assert.strictEqual(formatRupiah(150000), 'Rp 1.500');
});

test('calcLinearRefund prorates linearly', () => {
  const price = 10000; // 100 IDR
  const warranty = 10; // days
  assert.strictEqual(calcLinearRefund({ priceCents: price, warrantyDays: warranty, usedDays: 0 }), price);
  assert.strictEqual(calcLinearRefund({ priceCents: price, warrantyDays: warranty, usedDays: 5 }), 5000);
  assert.strictEqual(calcLinearRefund({ priceCents: price, warrantyDays: warranty, usedDays: 10 }), 0);
  assert.strictEqual(calcLinearRefund({ priceCents: price, warrantyDays: warranty, usedDays: 15 }), 0);
});
