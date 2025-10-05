jest.mock('../src/db/client', () => ({
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
}));
jest.mock('../src/services/events', () => ({
  addEvent: jest.fn(),
}));
jest.mock('../src/services/output', () => ({
  publishStock: jest.fn(),
}));

const { reserveAccount } = require('../src/services/orders');
const { publishStockSummary } = require('../src/services/stock');
const prisma = require('../src/db/client');
const { addEvent } = require('../src/services/events');
const { publishStock } = require('../src/services/output');

describe('Account Reservation and Stock Summary with Disabled Accounts', () => {

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('reserveAccount', () => {
    it('should skip disabled or deleted accounts', async () => {
      const store = {
        accounts: [
          { id: 1, variant_id: 'v1', product_code: 'C', status: 'AVAILABLE', disabled: false, deleted_at: null, max_usage: 1, used_count: 0, fifo_order: 1n, username: 'u1', password: 'p1' },
          { id: 2, variant_id: 'v1', product_code: 'C', status: 'AVAILABLE', disabled: true, deleted_at: null, max_usage: 1, used_count: 0, fifo_order: 2n, username: 'u2', password: 'p2' },
        ],
        orders: [{ id: 1, product_code: 'C', metadata: {} }],
      };

      addEvent.mockResolvedValue({});

      prisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          $queryRaw: jest.fn().mockImplementation(async (_q, variantId) => {
            return store.accounts
              .filter(a => ((a.variant_id === variantId) || (variantId == null && a.product_code === 'C'))
                && a.status === 'AVAILABLE'
                && !a.disabled
                && a.deleted_at === null
                && a.used_count < a.max_usage)
              .sort((a, b) => (a.fifo_order < b.fifo_order ? -1 : 1) || (a.id - b.id))
              .slice(0, 1);
          }),
          accounts: {
            update: jest.fn().mockImplementation(async ({ where, data }) => {
              const acc = store.accounts.find(a => a.id === where.id);
              Object.assign(acc, data);
              return acc;
            }),
          },
          orders: {
            findUnique: jest.fn().mockResolvedValue(store.orders[0]),
            update: jest.fn().mockImplementation(async ({ where, data }) => {
              const o = store.orders.find(x => x.id === where.id);
              Object.assign(o, data);
              return o;
            }),
          },
        };
        return fn(tx);
      });

      await reserveAccount(1, 'v1');

      expect(store.orders[0].account_id).toBe(1);
      expect(store.accounts[0].status).toBe('DISABLED');
      expect(store.accounts[0].used_count).toBe(1);
      expect(store.accounts[1].used_count).toBe(0);
      expect(store.accounts[1].status).toBe('AVAILABLE');
    });
  });

  describe('publishStockSummary', () => {
    it('should exclude disabled or deleted accounts from the summary', async () => {
      const store = {
        accounts: [
          { id: 1, variant_id: 'v1', status: 'AVAILABLE', disabled: false, deleted_at: null, used_count: 0, max_usage: 1 },
          { id: 2, variant_id: 'v1', status: 'AVAILABLE', disabled: true, deleted_at: null, used_count: 0, max_usage: 1 },
          { id: 3, variant_id: 'v1', status: 'AVAILABLE', disabled: false, deleted_at: new Date(), used_count: 0, max_usage: 1 },
        ],
      };

      prisma.$queryRaw.mockImplementation(async () => {
        const accs = store.accounts.filter(a => a.status === 'AVAILABLE' && !a.disabled && !a.deleted_at);
        const units = accs.filter(a => a.used_count < a.max_usage).length;
        const capacity = accs.reduce((s, a) => s + Math.max(0, a.max_usage - a.used_count), 0);
        return [{ code: 'v1', units, capacity }];
      });

      await publishStockSummary();

      expect(publishStock).toHaveBeenCalledTimes(1);
      const publishedData = publishStock.mock.calls[0][0];

      expect(Array.isArray(publishedData)).toBe(true);
      expect(publishedData.length).toBe(1);

      const row = publishedData[0];
      expect(row.code).toBe('v1');
      expect(row.units).toBe(1);
      expect(row.capacity).toBe(1);
    });
  });
});