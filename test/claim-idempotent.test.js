jest.mock('../src/db/client', () => ({
  warrantyclaims: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}));
jest.mock('../src/services/sheet');
jest.mock('../src/utils/n8n');

const { approveClaim, rejectClaim, markRefunded } = require('../src/services/claims');
const prisma = require('../src/db/client');
const { appendWarrantyLog } = require('../src/services/sheet');

describe('Claim Service Idempotency', () => {

  beforeEach(() => {
    jest.clearAllMocks();

    const store = {
      claim: {
        id: 1,
        status: 'REFUNDED', // A finalized status
        ewallet: '0812345678',
        refund_cents: 1000,
        order: { invoice: 'INV1', buyer_phone: '1' }
      }
    };

    prisma.warrantyclaims.findUnique.mockImplementation(async ({ where }) => {
      if (where.id === 1) {
        return store.claim;
      }
      return null;
    });

    // The update function should never be called for a finalized claim
    prisma.warrantyclaims.update = jest.fn();
  });

  it('approveClaim should be idempotent for a refunded claim', async () => {
    const result = await approveClaim(1);
    expect(result.idempotent).toBe(true);
    expect(prisma.warrantyclaims.update).not.toHaveBeenCalled();
  });

  it('rejectClaim should be idempotent for a refunded claim', async () => {
    const result = await rejectClaim(1, 'some reason');
    expect(result.idempotent).toBe(true);
    expect(prisma.warrantyclaims.update).not.toHaveBeenCalled();
  });

  it('markRefunded should be idempotent for a refunded claim', async () => {
    const result = await markRefunded(1);
    expect(result.idempotent).toBe(true);
    expect(prisma.warrantyclaims.update).not.toHaveBeenCalled();
    expect(appendWarrantyLog).not.toHaveBeenCalled();
  });
});