const assert = require('node:assert');
const { test } = require('node:test');

const dbPath = require.resolve('../src/db/client');
const n8nPath = require.resolve('../src/utils/n8n');
const eventPath = require.resolve('../src/services/events');

const order = {
  id: 1,
  invoice: 'INV-1',
  amount_cents: 10000,
  created_at: new Date(Date.now() - 5 * 86400000),
  product: { duration_months: 10 },
};

const store = {
  warranty: [{ id: 1, order_id: 1, status: 'PENDING', reason: null, ewallet: null }],
};

let updateCount = 0;

require.cache[dbPath] = { exports: {
  warrantyclaims: {
    findUnique: async ({ where }) => {
      const c = store.warranty.find((x) => x.id === where.id);
      if (!c) return null;
      return { ...c, order };
    },
    update: async ({ where, data }) => {
      updateCount++;
      const c = store.warranty.find((x) => x.id === where.id);
      Object.assign(c, data);
      return { ...c };
    },
  },
} };

require.cache[n8nPath] = { exports: { emitToN8N: async () => {} } };
require.cache[eventPath] = { exports: { addEvent: async () => {} } };

const { approveClaim, setEwallet } = require('../src/services/claims');
const { calcLinearRefund } = require('../src/utils/refund');

test('approveClaim calculates prorated refund', async () => {
  const r = await approveClaim(1);
  const expected = calcLinearRefund({ priceCents: order.amount_cents, warrantyDays: 300, usedDays: 5 });
  assert.strictEqual(r.claim.refund_cents, expected);
  assert.strictEqual(r.claim.status, 'APPROVED');
});

test('setEwallet normalizes number and idempotent on repeat', async () => {
  updateCount = 0;
  store.warranty[0] = { id:1, order_id:1, status:'APPROVED', ewallet:null };

  await assert.rejects(() => setEwallet(1, '123'), /INVALID_EWALLET/);

  const r1 = await setEwallet(1, ' 08-123 456 789 0 ');
  assert.strictEqual(r1.claim.ewallet, '081234567890');
  assert.strictEqual(r1.claim.status, 'AWAITING_REFUND');
  assert.strictEqual(updateCount,1);

  assert.ok(!r1.idempotent);

  const r2 = await setEwallet(1, '081234567890');
  assert.ok(r2.idempotent);
  assert.strictEqual(updateCount,1);
});

