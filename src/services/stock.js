const prisma = require('../db/client');

function computeOptions(accounts) {
  return [{ durationDays: null, stock: accounts.length }];
}

async function getStockOptions(productId) {
  const count = await prisma.accounts.count({ where: { product_code: productId, status: 'AVAILABLE' } });
  return [{ durationDays: null, stock: count }];
}

module.exports = { computeOptions, getStockOptions };
