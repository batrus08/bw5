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
  warranty: [{ id: 1, order_id: 1, status: 'PENDING', reason: null }],
};

require.cache[dbPath] = { exports: {
  warrantyclaims: {
    findUnique: async ({ where }) => {
      const c = store.warranty.find((x) => x.id === where.id);
      if (!c) return null;
      return { ...c, order };
    },
    update: async ({ where, data }) => {
      const c = store.warranty.find((x) => x.id === where.id);
      Object.assign(c, data);
      return { ...c };
    },
  },
} };

require.cache[n8nPath] = { exports: { emitToN8N: async () => {} } };
require.cache[eventPath] = { exports: { addEvent: async () => {} } };

const { approveClaim } = require('../src/services/claims');
const { calcLinearRefund } = require('../src/utils/refund');

test('approveClaim calculates prorated refund', async () => {
  const r = await approveClaim(1);
  const expected = calcLinearRefund({ priceCents: order.amount_cents, warrantyDays: 300, usedDays: 5 });
  assert.strictEqual(r.refund_cents, expected);
  assert.strictEqual(r.status, 'APPROVED');
});

