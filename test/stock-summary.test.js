const { getStockSummary } = require('../src/services/stock');
const prisma = require('../src/db/client');

jest.mock('../src/db/client', () => ({
  $queryRaw: jest.fn(),
}));

describe('getStockSummary', () => {
  it('aggregates units and capacity', async () => {
    const mockData = [
      { code: 'V1', units: 2, capacity: 4 },
      { code: 'V2', units: 1, capacity: 1 },
    ];
    prisma.$queryRaw.mockResolvedValue(mockData);

    const rows = await getStockSummary();
    const v1 = rows.find(r => r.code === 'V1');

    expect(v1).toBeDefined();
    expect(v1.units).toBe(2);
    expect(v1.capacity).toBe(4);
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});