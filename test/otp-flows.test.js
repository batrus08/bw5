const test = require('node:test');
const assert = require('node:assert');

const otpPath = require.resolve('../src/services/otp');
const dbPath = require.resolve('../src/db/client');

const tokens = new Map();

require.cache[dbPath] = { exports: {
  otptokens: {
    create: async ({ data }) => { tokens.set(data.id, Object.assign({ used:false, used_count:0 }, data)); return data; },
    findUnique: async ({ where:{ id } }) => tokens.get(id) || null,
    update: async ({ where:{ id }, data }) => { Object.assign(tokens.get(id), data); return tokens.get(id); },
    findFirst: async ({ where:{ order_id, type } }) => {
      for (const t of tokens.values()) if (t.order_id===order_id && t.type===type) return t;
      return null;
    }
  }
}};

delete require.cache[otpPath];
const { createManualToken, fulfillManualOtp, generateSingleUseTOTP } = require(otpPath);

test('manual OTP token fulfillment is idempotent', async () => {
  const id = await createManualToken(1, 60);
  const order = await fulfillManualOtp(id, '123456');
  assert.strictEqual(order, 1);
  assert.strictEqual(tokens.get(id).used, true);
  const second = await fulfillManualOtp(id, '123456');
  assert.strictEqual(second, null);
});

test('single use TOTP can only be generated once', async () => {
  const code1 = await generateSingleUseTOTP(2, 'JBSWY3DPEHPK3PXP');
  assert.ok(code1);
  const code2 = await generateSingleUseTOTP(2, 'JBSWY3DPEHPK3PXP');
  assert.strictEqual(code2, null);
});
