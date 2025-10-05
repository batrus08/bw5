jest.mock('../src/db/client', () => ({
  $queryRaw: jest.fn(),
  product_variants: {
    findUnique: jest.fn(),
  },
  accounts: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
}));

jest.mock('../src/services/variants');
jest.mock('../src/services/events');
jest.mock('../src/services/output');

const { getStockDetail, getStockSummary, publishStockSummary: originalPublishStockSummary } = require('../src/services/stock');
const { upsertAccountFromSheet } = require('../src/routes/sheet-sync');
const prisma = require('../src/db/client');
const { resolveVariantByCode } = require('../src/services/variants');
const { addEvent } = require('../src/services/events');
const { publishStock } = require('../src/services/output');


describe('Stock Service and Sheet-Sync Integration', () => {

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStockDetail', () => {
    it('should not include password in the query', async () => {
      const mockData = [{ id: 1, fifo_order: 0, used_count: 0, max_usage: 1, status: 'AVAILABLE' }];
      let receivedSql = '';

      prisma.$queryRaw.mockImplementation(async (strings, ...vals) => {
        receivedSql = strings.join('?');
        expect(receivedSql).not.toMatch(/password/i);
        return mockData;
      });

      const rows = await getStockDetail('X');

      expect(rows).toEqual(mockData);
      expect(rows[0]).not.toHaveProperty('password');
    });
  });

  describe('sheet-sync updates', () => {
    let store;

    beforeEach(() => {
      store = {
        variants: [{ variant_id: 'V1', code: 'VAR1', product: 'P1' }],
        accounts: [],
      };

      resolveVariantByCode.mockImplementation(async (code) => {
        const v = store.variants.find(v => v.code === code);
        if (!v) throw new Error('UNKNOWN_VARIANT');
        return v;
      });

      addEvent.mockResolvedValue({});
      publishStock.mockResolvedValue({});

      prisma.accounts.findUnique.mockImplementation(async ({ where }) => {
        return store.accounts.find(a => a.natural_key === where.natural_key) || null;
      });

      prisma.accounts.upsert.mockImplementation(async ({ where, create, update }) => {
        const idx = store.accounts.findIndex(a => a.natural_key === where.natural_key);
        if (idx >= 0) {
          store.accounts[idx] = { ...store.accounts[idx], ...update };
          return store.accounts[idx];
        }
        const acc = { id: `A${store.accounts.length + 1}`, used_count: 0, ...create };
        store.accounts.push(acc);
        return acc;
      });

      prisma.$queryRaw.mockImplementation(async () => {
        const accs = store.accounts.filter(a => a.status === 'AVAILABLE' && !a.disabled && !a.deleted_at);
        const units = accs.filter(a => a.used_count < a.max_usage).length;
        const capacity = accs.reduce((s, a) => s + Math.max(0, a.max_usage - a.used_count), 0);
        return [{ code: 'VAR1', units, capacity }];
      });
    });

    it('upsert and soft-delete should update summary and publish', async () => {
      await upsertAccountFromSheet({ code: 'VAR1', username: 'u', password: 'p', max_usage: 2 });

      // It should publish the summary. publishStock is called by originalPublishStockSummary
      expect(publishStock).toHaveBeenCalledTimes(1);

      let rows = await getStockSummary();
      expect(rows[0].units).toBe(1);
      expect(rows[0].capacity).toBe(2);

      // Simulate a delete operation from the sheet
      await upsertAccountFromSheet({ code: 'VAR1', username: 'u', password: 'p', __op: 'DELETE' });

      expect(publishStock).toHaveBeenCalledTimes(2);

      rows = await getStockSummary();
      expect(rows[0].units).toBe(0);
      expect(rows[0].capacity).toBe(0);
    });
  });
});