jest.mock('../db/client', () => ({
  orders: {
    updateMany: jest.fn(),
    findUnique: jest.fn(),
  },
}));
jest.mock('./events', () => ({ addEvent: jest.fn() }));

const { markPayAck } = require('./orders');

describe('orders service', () => {
  test('markPayAck transitions status', async () => {
    const prisma = require('../db/client');
    prisma.orders.updateMany.mockResolvedValue({ count: 1 });
    prisma.orders.findUnique.mockResolvedValue({ id: 1 });

    await markPayAck(1);

    expect(prisma.orders.updateMany).toHaveBeenCalledWith({
      where: { id: 1, status: 'PENDING_PAYMENT' },
      data: { status: 'PENDING_PAY_ACK', pay_ack_at: expect.any(Date) },
    });
  });
});
