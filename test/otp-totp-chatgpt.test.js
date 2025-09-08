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
  const tokens = new Map();
  require.cache[dbPath] = {
    exports: {
      otptokens: {
        findFirst: async ({ where: { order_id, type } }) => {
          return [...tokens.values()].find(t => t.order_id === order_id && t.type === type) || null;
        },
        create: async ({ data }) => {
          tokens.set(data.id, data);
          return data;
        }
      }
    }
  };
  delete require.cache[otpPath];
  const { generateSingleUseTOTP } = require(otpPath);
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const first = await generateSingleUseTOTP(7, secret);
  assert.ok(first);
  const second = await generateSingleUseTOTP(7, secret);
  assert.strictEqual(second, null);
  assert.strictEqual(tokens.size, 1);

  // Generated token is immediately marked used once
  const record = [...tokens.values()][0];
  assert.strictEqual(record.used, true);
  assert.strictEqual(record.used_count, 1);

  // TTL is short (<= step size)
  const ttlMs = record.expires_at.getTime() - Date.now();
  assert.ok(ttlMs > 0 && ttlMs <= 30000);
});
