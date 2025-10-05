jest.mock('../src/db/client', () => ({
  tasks: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
}));
jest.mock('../src/services/canva');
jest.mock('../src/services/telegram');
jest.mock('../src/services/wa');
jest.mock('../src/services/events');

const { processTasks } = require('../src/services/worker');
const { inviteCanva } = require('../src/services/canva');
const prisma = require('../src/db/client');
const { notifyAdmin } = require('../src/services/telegram');
const { sendText } = require('../src/services/wa');
const { addEvent } = require('../src/services/events');

describe('Worker: INVITE_CANVA task', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call inviteCanva, update task to DONE on success, and notify', async () => {
    const mockTask = {
      id: 1,
      status: 'OPEN',
      kind: 'INVITE_CANVA',
      order: { id: 10, invoice: 'INV1', buyer_phone: '62', email: 'u@e.com', email_for_invite: null }
    };
    prisma.tasks.findMany.mockResolvedValue([mockTask]);
    prisma.tasks.update.mockResolvedValue({});
    addEvent.mockResolvedValue({});
    notifyAdmin.mockResolvedValue({});
    sendText.mockResolvedValue({});
    inviteCanva.mockResolvedValue({ ok: true });

    await processTasks();

    expect(inviteCanva).toHaveBeenCalledWith('u@e.com');
    expect(prisma.tasks.update).toHaveBeenCalledWith({
      where: { id: mockTask.id },
      data: { status: 'DONE' },
    });
    expect(addEvent).toHaveBeenCalledWith(mockTask.order.id, 'INVITE_SENT_BY_ADMIN', expect.any(String), expect.any(Object), 'SYSTEM', 'worker');
    expect(notifyAdmin).toHaveBeenCalled();
    expect(sendText).toHaveBeenCalled();
  });

  it('should update task to CANCELLED on inviteCanva failure', async () => {
    const mockTask = {
        id: 1,
        status: 'OPEN',
        kind: 'INVITE_CANVA',
        order: { id: 10, invoice: 'INV1', buyer_phone: '62', email: 'u@e.com' }
    };
    const error = new Error('Canva API failed');
    prisma.tasks.findMany.mockResolvedValue([mockTask]);
    prisma.tasks.update.mockResolvedValue({});
    inviteCanva.mockRejectedValue(error);

    await processTasks();

    expect(inviteCanva).toHaveBeenCalledWith('u@e.com');
    expect(prisma.tasks.update).toHaveBeenCalledWith({
        where: { id: mockTask.id },
        data: {
            status: 'CANCELLED',
            note: 'Canva API failed',
        },
    });
    expect(notifyAdmin).toHaveBeenCalledWith(expect.stringContaining('gagal'));
  });
});