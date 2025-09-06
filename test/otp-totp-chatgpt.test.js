const assert = require('node:assert');
const { test } = require('node:test');
const { generateTOTP } = require('../src/services/otp');

test('generateTOTP produces RFC6238 sample code', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // base32 for '12345678901234567890'
  const code = generateTOTP(secret, 30, 59000); // time = 59s -> counter 1
  assert.strictEqual(code, '287082');
});
