jest.mock('../src/db/client', () => ({
  orders: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}));
jest.mock('../src/services/events');
jest.mock('../src/services/telegram');

const { requestHelp } = require('../src/services/orders');
const prisma = require('../src/db/client');
const { addEvent } = require('../src/services/events');
const { notifyHelpRequested } = require('../src/services/telegram');

describe('requestHelp', () => {
  let store;

  beforeEach(() => {
    store = { orders: [{ id: 1, status: 'PENDING_PAYMENT' }] };
    jest.clearAllMocks();

    prisma.orders.findUnique.mockImplementation(async ({ where }) => {
      return store.orders.find(x => x.id === where.id);
    });
    prisma.orders.update.mockImplementation(async ({ where, data }) => {
      const order = store.orders.find(x => x.id === where.id);
      if (order) {
        Object.assign(order, data);
      }
      return order;
    });
    addEvent.mockResolvedValue({});
    notifyHelpRequested.mockResolvedValue({});
  });

  it('switches status, logs an event, and sends a notification', async () => {
    const context = { stage: 'PAYMENT' };
    await requestHelp(1, context);

    // 1. Verify status update
    expect(prisma.orders.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'ON_HOLD_HELP' },
    });
    expect(store.orders[0].status).toBe('ON_HOLD_HELP');

    // 2. Verify event logging
    expect(addEvent).toHaveBeenCalledWith(
      1,
      'HELP_REQUESTED',
      expect.any(String),
      { prev_status: 'PENDING_PAYMENT', stage: context }
    );

    // 3. Verify Telegram notification
    expect(notifyHelpRequested).toHaveBeenCalledWith(1, context);
  });
});