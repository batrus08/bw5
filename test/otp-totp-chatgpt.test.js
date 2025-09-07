const assert = require('node:assert');
const { test } = require('node:test');

const otpPath = require.resolve('../src/services/otp');
const dbPath = require.resolve('../src/db/client');

test('generateTOTP produces RFC6238 sample code', () => {
  require.cache[dbPath] = { exports:{} };
  delete require.cache[otpPath];
  const { generateTOTP } = require(otpPath);
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const code = generateTOTP(secret, 30, 59000);
  assert.strictEqual(code, '287082');
});

test('single-use TOTP only generated once per order', async () => {
  const tokens = [];
  require.cache[dbPath] = { exports:{
    otptokens:{
      findFirst: async ({ where }) => tokens.find(t => t.order_id === where.order_id && t.type === where.type) || null,
      create: async ({ data }) => { tokens.push({ ...data, order_id: data.order_id, type: data.type }); return data; },
    }
  }};
  delete require.cache[otpPath];
  const { generateSingleUseTOTP } = require(otpPath);
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const first = await generateSingleUseTOTP(1, secret);
  assert.ok(first);
  const second = await generateSingleUseTOTP(1, secret);
  assert.strictEqual(second, null);
});
