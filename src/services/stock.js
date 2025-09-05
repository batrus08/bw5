const prisma = require('../db/client');

function computeOptions(accounts) {
  const map = new Map();
  for (const { variant_duration } of accounts) {
    const days = variant_duration || 0;
    map.set(days, (map.get(days) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([durationDays, stock]) => ({ durationDays, stock }))
    .sort((a, b) => a.durationDays - b.durationDays);
}

async function getStockOptions(productId) {
  const rows = await prisma.accounts.findMany({
    where: { product_code: productId, status: 'AVAILABLE' },
    select: { variant_duration: true },
  });
  return computeOptions(rows);
}

module.exports = { computeOptions, getStockOptions };
