function calcLinearRefund({ priceCents, warrantyDays, usedDays }) {
  if (warrantyDays <= 0) return 0;
  const remaining = Math.max(0, warrantyDays - usedDays);
  return Math.floor((remaining / warrantyDays) * priceCents);
}

module.exports = { calcLinearRefund };
