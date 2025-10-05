describe('inviteCanva Service Function', () => {
  let inviteCanva;
  let prisma;

  beforeEach(() => {
    jest.resetModules();

    jest.doMock('../src/db/client', () => ({
      deadletters: { create: jest.fn() },
      events: { create: jest.fn() },
    }));

    process.env.CANVA_API_TOKEN = 'test-token';
    process.env.CANVA_TEAM_ID = 'test-team';

    inviteCanva = require('../src/services/canva').inviteCanva;
    prisma = require('../src/db/client');

    global.fetch = jest.fn();
    // Mock setTimeout to resolve immediately, avoiding fake timers
    jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
      if (typeof callback === 'function') {
        callback();
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.CANVA_API_TOKEN;
    delete process.env.CANVA_TEAM_ID;
  });

  it('retries on failure and creates a dead-letter on final failure', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'err' }),
    });

    await expect(inviteCanva('foo@bar')).rejects.toThrow('err');

    expect(fetch).toHaveBeenCalledTimes(3);

    expect(prisma.deadletters.create).toHaveBeenCalledTimes(1);
    const deadletterData = prisma.deadletters.create.mock.calls[0][0].data;
    expect(deadletterData.endpoint).toBe('CANVA_INVITE');
    expect(deadletterData.retry_count).toBe(3);

    expect(prisma.events.create).toHaveBeenCalledTimes(1);
    expect(prisma.events.create.mock.calls[0][0].data.kind).toBe('DEAD_LETTER_STORED');
  });
});