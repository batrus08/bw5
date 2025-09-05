const assert = require('node:assert');
const { test } = require('node:test');

const { computeOptions } = require('../src/services/stock');

test('computeOptions aggregates by duration', () => {
  const accounts = [
    { variant_duration: 30 },
    { variant_duration: 30 },
    { variant_duration: 60 },
    { variant_duration: null },
  ];
  assert.deepStrictEqual(computeOptions(accounts), [
    { durationDays: 0, stock: 1 },
    { durationDays: 30, stock: 2 },
    { durationDays: 60, stock: 1 },
  ]);
});
