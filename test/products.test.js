const prisma = require('../src/db/client');
const { getProductByCode } = require('../src/services/products');

jest.mock('../src/db/client', () => ({
  products: { findUnique: jest.fn() },
}));

describe('getProductByCode', () => {
  it('returns product when found', async () => {
    const fakeProduct = { code: 'ABC', name: 'Test Product' };
    prisma.products.findUnique.mockResolvedValue(fakeProduct);
    const result = await getProductByCode('ABC');
    expect(prisma.products.findUnique).toHaveBeenCalledWith({
      where: { code: 'ABC' },
    });
    expect(result).toEqual(fakeProduct);
  });

  it('throws when prisma fails', async () => {
    prisma.products.findUnique.mockRejectedValue(new Error('db error'));
    await expect(getProductByCode('ERR')).rejects.toThrow('db error');
  });
});
