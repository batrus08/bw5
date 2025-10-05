process.env.TELEGRAM_BOT_TOKEN = 't';
process.env.ADMIN_CHAT_ID = '1';
process.env.WEBHOOK_SECRET_PATH = 'w';
process.env.DATABASE_URL = 'postgres://';
process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString('base64');

const { upsertAccountFromSheet } = require('../src/routes/sheet-sync');
const prisma = require('../src/db/client');
const { resolveVariantByCode } = require('../src/services/variants');
const { addEvent } = require('../src/services/events');

jest.mock('../src/services/variants', () => ({
  resolveVariantByCode: jest.fn(),
}));

jest.mock('../src/services/events', () => ({
  addEvent: jest.fn(),
}));

jest.mock('../src/db/client', () => ({
  accounts: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
  },
}));

describe('upsertAccountFromSheet', () => {
  let store;

  beforeEach(() => {
    store = { accounts: [] };

    resolveVariantByCode.mockImplementation(async (code) => ({
      variant_id: 'v1',
      product: 'P',
      code,
      duration_days: 30,
      active: true
    }));

    addEvent.mockResolvedValue({});

    prisma.accounts.upsert.mockImplementation(async ({ where, create, update }) => {
      const idx = store.accounts.findIndex(a => a.natural_key === where.natural_key);
      if (idx === -1) {
        const acc = { id: store.accounts.length + 1, ...create };
        store.accounts.push(acc);
        return acc;
      }
      const acc = store.accounts[idx];
      Object.assign(acc, update);
      return acc;
    });

    prisma.accounts.findUnique.mockImplementation(async ({ where }) => {
      return store.accounts.find(a => a.natural_key === where.natural_key) || null;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const payload = { code: 'C', username: 'u', password: 'p', max_usage: 2, profile_index: 1 };

  it('is idempotent', async () => {
    await upsertAccountFromSheet(payload);
    const first = { ...store.accounts[0] };
    await upsertAccountFromSheet(payload);

    expect(store.accounts.length).toBe(1);
    expect(store.accounts[0].natural_key).toBe(first.natural_key);
  });

  it('deleted flag disables account', async () => {
    await upsertAccountFromSheet({ ...payload, deleted: true, username: 'u2', profile_index: 2 });
    const acc = store.accounts.find(a => a.profile_index === 2);
    expect(acc.status).toBe('DISABLED');
  });

  it('does not downgrade status on update', async () => {
    await upsertAccountFromSheet(payload);
    store.accounts[0].status = 'RESERVED';
    await upsertAccountFromSheet({ ...payload, username: 'u3' });
    expect(store.accounts[0].status).toBe('RESERVED');
  });

  it('fifo_order is stable unless reorder is true', async () => {
    await upsertAccountFromSheet(payload);
    const firstFifo = store.accounts[0].fifo_order;
    await upsertAccountFromSheet({ ...payload, password: 'p2' });
    expect(store.accounts[0].fifo_order).toBe(firstFifo);

    await upsertAccountFromSheet({ ...payload, password: 'p3', reorder: true });
    expect(store.accounts[0].fifo_order).not.toBe(firstFifo);
  });
});