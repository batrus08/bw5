jest.mock('../src/db/client', () => ({
  warrantyclaims: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}));
jest.mock('../src/utils/n8n', () => ({
  emitToN8N: jest.fn(),
}));
jest.mock('../src/services/events', () => ({
  addEvent: jest.fn(),
}));

const { approveClaim, setEwallet } = require('../src/services/claims');
const { calcLinearRefund } = require('../src/utils/refund');
const prisma = require('../src/db/client');
const { emitToN8N } = require('../src/utils/n8n');
const { addEvent } = require('../src/services/events');

describe('Claims Service', () => {
  let order;
  let store;

  beforeEach(() => {
    order = {
      id: 1,
      invoice: 'INV-1',
      amount_cents: 10000,
      created_at: new Date(Date.now() - 5 * 86400000), // 5 days ago
      product: { duration_months: 10 }, // 300 days warranty
    };
    store = {
      warranty: [{ id: 1, order_id: 1, status: 'PENDING', reason: null, ewallet: null }],
    };

    prisma.warrantyclaims.findUnique.mockImplementation(async ({ where }) => {
      const claim = store.warranty.find((x) => x.id === where.id);
      if (!claim) return null;
      return { ...claim, order };
    });

    prisma.warrantyclaims.update.mockImplementation(async ({ where, data }) => {
      const claim = store.warranty.find((x) => x.id === where.id);
      Object.assign(claim, data);
      return { ...claim };
    });

    emitToN8N.mockResolvedValue({});
    addEvent.mockResolvedValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('approveClaim', () => {
    it('calculates a prorated refund and updates status', async () => {
      const { claim } = await approveClaim(1);
      const expectedRefund = calcLinearRefund({
        priceCents: order.amount_cents,
        warrantyDays: 300,
        usedDays: 5,
      });

      expect(claim.refund_cents).toBe(expectedRefund);
      expect(claim.status).toBe('APPROVED');
      expect(prisma.warrantyclaims.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('setEwallet', () => {
    beforeEach(() => {
      store.warranty[0] = { id: 1, order_id: 1, status: 'APPROVED', ewallet: null };
    });

    it('rejects an invalid e-wallet number', async () => {
      await expect(setEwallet(1, '123')).rejects.toThrow('INVALID_EWALLET');
    });

    it('normalizes the e-wallet number and updates status', async () => {
      const { claim, idempotent } = await setEwallet(1, ' 08-123 456 789 0 ');

      expect(claim.ewallet).toBe('081234567890');
      expect(claim.status).toBe('AWAITING_REFUND');
      expect(idempotent).toBe(false);
      expect(prisma.warrantyclaims.update).toHaveBeenCalledTimes(1);
    });

    it('is idempotent on repeat calls with the same number', async () => {
      await setEwallet(1, '081234567890'); // First call
      expect(prisma.warrantyclaims.update).toHaveBeenCalledTimes(1);

      const { idempotent } = await setEwallet(1, '081234567890'); // Second call

      expect(idempotent).toBe(true);
      // The update function should not be called a second time
      expect(prisma.warrantyclaims.update).toHaveBeenCalledTimes(1);
    });
  });
});