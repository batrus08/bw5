jest.mock('../src/db/client', () => ({
  $transaction: jest.fn(),
}));

jest.mock('../src/services/events', () => ({
  addEvent: jest.fn(),
}));

const { reserveAccount } = require('../src/services/orders');
const prisma = require('../src/db/client');
const { addEvent } = require('../src/services/events');

describe('reserveAccount race condition', () => {
  let store;

  beforeEach(() => {
    store = {
      accounts: [{ id: 1, variant_id: 'v1', product_code: 'C', status: 'AVAILABLE', max_usage: 1, used_count: 0, fifo_order: 1n, natural_key: 'k1' }],
      orders: [
        { id: 1, product_code: 'C', metadata: {} },
        { id: 2, product_code: 'C', metadata: {} },
      ],
      locks: new Set(),
    };

    addEvent.mockResolvedValue({});

    prisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        orders: {
          findUnique: jest.fn(async ({ where }) => store.orders.find(o => o.id === where.id)),
          update: jest.fn(async ({ where, data }) => {
            const o = store.orders.find(x => x.id === where.id);
            Object.assign(o, data);
            return o;
          }),
        },
        accounts: {
          update: jest.fn(async ({ where, data }) => {
            await new Promise(r => setTimeout(r, 10)); // Simulate delay
            const a = store.accounts.find(acc => acc.id === where.id);
            if (!a || a.status !== 'AVAILABLE') {
              throw new Error('Stok habis');
            }
            Object.assign(a, data);
            return a;
          }),
        },
        $queryRaw: jest.fn(async (strings, ...params) => {
          const sql = strings.join('');
          if (sql.includes('FROM orders')) {
            const id = params[0];
            if (store.locks.has(id)) {
              await new Promise(r => setTimeout(r, 50)); // Simulate lock wait
            } else {
              store.locks.add(id);
            }
            return [{ id }];
          }
          // Account query
          const [variantId, , prodCode] = params;
          await new Promise(r => setTimeout(r, 20)); // Simulate delay
          return store.accounts.filter(a =>
            (a.variant_id === variantId || (!variantId && a.product_code === prodCode)) &&
            a.status === 'AVAILABLE' && a.used_count < a.max_usage
          );
        }),
      };

      try {
        return await fn(tx);
      } finally {
        store.locks.clear();
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should only allow one of two parallel reservations to succeed for a single account', async () => {
    const [a, b] = await Promise.allSettled([
      reserveAccount(1, 'v1'),
      reserveAccount(2, 'v1'),
    ]);

    const successes = [a, b].filter((result) => result.status === 'fulfilled');
    const failures = [a, b].filter((result) => result.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(store.accounts[0].used_count).toBe(1);

    // Add new stock
    store.accounts.push({ id: 2, variant_id: 'v1', product_code: 'C', status: 'AVAILABLE', max_usage: 1, used_count: 0, fifo_order: 2n, natural_key: 'k2' });

    // Retry the failed reservation (assuming order 2 was the one that failed)
    const retry = await reserveAccount(2, 'v1');
    expect(retry.accountId).toBeDefined();

    const usedAccount = store.accounts.find(acc => acc.id === 2);
    expect(usedAccount.used_count).toBe(1);
  });
});