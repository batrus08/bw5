const prisma = require('../db/client');
const { calcLinearRefund } = require('../utils/refund');
const { emitToN8N } = require('../utils/n8n');
const { appendWarrantyLog } = require('./sheet');
const { sendText } = require('./wa');

async function createClaim(invoice, reason) {
  const order = await prisma.orders.findUnique({ where: { invoice }, include: { product: true } });
  if (!order) throw new Error('ORDER_NOT_FOUND');
  const claim = await prisma.warrantyclaims.create({ data: { order_id: order.id, reason } });
  await emitToN8N('/claim-created', { id: claim.id, invoice });
  return claim;
}

async function approveClaim(id) {
  const claim = await prisma.warrantyclaims.findUnique({ where: { id }, include: { order: { include: { product: true } } } });
  if (!claim) throw new Error('CLAIM_NOT_FOUND');
  const order = claim.order;
  const warrantyDays = (order.product.duration_months || 0) * 30;
  const usedDays = Math.floor((Date.now() - order.created_at.getTime()) / 86400000);
  const refund = calcLinearRefund({ priceCents: order.amount_cents, warrantyDays, usedDays });
  const upd = await prisma.warrantyclaims.update({ where: { id }, data: { status: 'APPROVED', refund_cents: refund } });
  await emitToN8N('/claim-approved', { id, refund_cents: refund });
  return upd;
}

async function rejectClaim(id, reason) {
  const upd = await prisma.warrantyclaims.update({ where: { id }, data: { status: 'REJECTED', reason } });
  await emitToN8N('/claim-rejected', { id, reason });
  return upd;
}

async function setEwallet(id, ewallet) {
  return prisma.warrantyclaims.update({ where: { id }, data: { ewallet, status: 'AWAITING_REFUND' } });
}

async function markRefunded(id) {
  const claim = await prisma.warrantyclaims.update({ where: { id }, data: { status: 'REFUNDED' }, include: { order: true } });
  await appendWarrantyLog({ claimId: id, invoice: claim.order.invoice, refund_cents: claim.refund_cents, ewallet: claim.ewallet });
  return claim;
}

module.exports = { createClaim, approveClaim, rejectClaim, setEwallet, markRefunded };

async function requestEwallet(id) {
  const claim = await prisma.warrantyclaims.findUnique({ where: { id }, include: { order: true } });
  if (!claim) throw new Error('CLAIM_NOT_FOUND');
  const phone = claim.order.buyer_phone;
  const refund = claim.refund_cents || 0;
  await sendText(phone, `Klaim Anda disetujui. Refund Rp${refund/100}. Kirim nomor ShopeePay Anda (contoh 08xxxx).`);
  return { phone };
}

module.exports.requestEwallet = requestEwallet;

