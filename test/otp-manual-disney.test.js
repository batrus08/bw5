const test = require('node:test');
const assert = require('node:assert');

const otpPath = require.resolve('../src/services/otp');
const dbPath = require.resolve('../src/db/client');

test('manual OTP token only usable once', async () => {
  const tokens = new Map();
  require.cache[dbPath] = {
    exports: {
      otptokens: {
        create: async ({ data }) => {
          tokens.set(data.id, { ...data, used: false, used_count: 0 });
          return data;
        },
        findUnique: async ({ where: { id } }) => tokens.get(id) ?? null,
        update: async ({ where: { id }, data }) => {
          const t = tokens.get(id);
          if ('code_hash' in data) t.code_hash = data.code_hash;
          if ('used' in data) t.used = data.used;
          if (data.used_count && typeof data.used_count.increment === 'number') {
            t.used_count += data.used_count.increment;
          }
          return t;
        }
      }
    }
  };

  delete require.cache[otpPath];
  const { createManualToken, fulfillManualOtp } = require(otpPath);

  const tokenId = await createManualToken(99, 1);
  const order = await fulfillManualOtp(tokenId, '123456');

  assert.strictEqual(order, 99);
  assert.strictEqual(tokens.get(tokenId).used, true);
  assert.strictEqual(tokens.get(tokenId).used_count, 1);

  const second = await fulfillManualOtp(tokenId, '123456');
  assert.strictEqual(second, null);
});

