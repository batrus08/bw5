const prisma = require('../db/client');
const { calcLinearRefund } = require('../utils/refund');
const { emitToN8N } = require('../utils/n8n');
const { appendWarrantyLog } = require('./sheet');
const { sendText } = require('./wa');
const { normalizeEwallet } = require('../utils/validation');

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
  if (['REJECTED', 'REFUNDED'].includes(claim.status)) {
    
    return { ok: true, idempotent: true, message: 'claim already finalized', status: claim.status };
  }
  const order = claim.order;
  const warrantyDays = (order.product.duration_months || 0) * 30;
  const usedDays = Math.floor((Date.now() - order.created_at.getTime()) / 86400000);
  const refund = calcLinearRefund({ priceCents: order.amount_cents, warrantyDays, usedDays });
  const upd = await prisma.warrantyclaims.update({ where: { id }, data: { status: 'APPROVED', refund_cents: refund } });
  await emitToN8N('/claim-approved', { id, refund_cents: refund });
  return { ok: true, claim: upd };
}

async function rejectClaim(id, reason) {
  const claim = await prisma.warrantyclaims.findUnique({ where: { id } });
  if (!claim) throw new Error('CLAIM_NOT_FOUND');
  if (['REJECTED', 'REFUNDED'].includes(claim.status)) {
    
    return { ok: true, idempotent: true, message: 'claim already finalized', status: claim.status };
  }
  const upd = await prisma.warrantyclaims.update({ where: { id }, data: { status: 'REJECTED', reason } });
  await emitToN8N('/claim-rejected', { id, reason });
  return { ok: true, claim: upd };
}

async function setEwallet(id, ewallet) {
  const claim = await prisma.warrantyclaims.findUnique({ where: { id } });
  if (!claim) throw new Error('CLAIM_NOT_FOUND');
  if (['REJECTED', 'REFUNDED'].includes(claim.status)) {
    
    return { ok: true, idempotent: true, message: 'claim already finalized', status: claim.status };
  }
  const { normalized, isValid } = normalizeEwallet(ewallet || '');
  if (!isValid) throw new Error('INVALID_EWALLET');
  if (claim.ewallet === normalized) {
    return { ok: true, idempotent: true, status: claim.status };
  }
  const upd = await prisma.warrantyclaims.update({ where: { id }, data: { ewallet: normalized, status: 'AWAITING_REFUND' } });
  return { ok: true, claim: upd };
}

async function markRefunded(id) {
  const claim = await prisma.warrantyclaims.findUnique({ where: { id }, include: { order: true } });
  if (!claim) throw new Error('CLAIM_NOT_FOUND');
  if (['REJECTED', 'REFUNDED'].includes(claim.status)) {
    
    return { ok: true, idempotent: true, message: 'claim already finalized', status: claim.status };
  }
  const upd = await prisma.warrantyclaims.update({ where: { id }, data: { status: 'REFUNDED' }, include: { order: true } });
  await appendWarrantyLog({ claimId: id, invoice: upd.order.invoice, refund_cents: upd.refund_cents, ewallet: upd.ewallet });
  return { ok: true, claim: upd };
}

async function requestEwallet(id) {
  const claim = await prisma.warrantyclaims.findUnique({ where: { id }, include: { order: true } });
  if (!claim) throw new Error('CLAIM_NOT_FOUND');
  const phone = claim.order.buyer_phone;
  const refund = claim.refund_cents || 0;
  await sendText(phone, `Klaim Anda disetujui. Refund Rp${refund/100}. Kirim nomor ShopeePay Anda (contoh 08xxxx).`);
  return { phone };
}

module.exports = { createClaim, approveClaim, rejectClaim, setEwallet, markRefunded };
module.exports.requestEwallet = requestEwallet;
