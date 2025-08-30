const { randomInt } = require('crypto');
const prisma = require('../db/client');
const { addEvent } = require('./events');

function genInvoice() {
  const d = new Date();
  const prefix = d.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = randomInt(10000).toString().padStart(4, '0');
  return `INV-${prefix}-${rand}`;
}

async function genUniqueInvoice() {
  let invoice;
  for (let attempt = 0; attempt < 100; attempt++) {
    invoice = genInvoice();
    const existing = await prisma.orders.findUnique({ where: { invoice } });
    if (!existing) return invoice;
  }
  throw new Error('Failed to generate unique invoice');
}

// May throw if a unique invoice cannot be generated
async function createOrder({ buyer_phone, product_code, qty = 1 }) {
  const product = await prisma.products.findUnique({ where: { code: product_code } });
  if (!product) throw new Error('Product not found');
  const amount_cents = product.price_cents * qty;
  const invoice = await genUniqueInvoice();
  const order = await prisma.orders.create({
    data: {
      invoice,
      buyer_phone,
      product_code,
      qty,
      amount_cents,
    },
  });
  await addEvent(order.id, 'ORDER_CREATED');
  return order;
}

async function markPayAck(orderId) {
  const updated = await prisma.orders.updateMany({
    where: { id: orderId, status: 'PENDING_PAYMENT' },
    data: { status: 'PENDING_PAY_ACK', pay_ack_at: new Date() },
  });
  if (!updated.count) throw new Error('Invalid status transition');
  const order = await prisma.orders.findUnique({ where: { id: orderId } });
  await addEvent(orderId, 'PAY_ACK');
  return order;
}

async function confirmPaid(orderId) {
  const updated = await prisma.orders.updateMany({
    where: { id: orderId, status: 'PENDING_PAY_ACK' },
    data: { status: 'PAID' },
  });
  if (!updated.count) throw new Error('Invalid status transition');
  const order = await prisma.orders.findUnique({ where: { id: orderId } });
  await addEvent(orderId, 'ADMIN_CONFIRM');
  return order;
}

async function rejectOrder(orderId, reason) {
  const updated = await prisma.orders.updateMany({
    where: { id: orderId, status: 'PENDING_PAY_ACK' },
    data: { status: 'REJECTED' },
  });
  if (!updated.count) throw new Error('Invalid status transition');
  const order = await prisma.orders.findUnique({ where: { id: orderId } });
  await addEvent(orderId, 'ADMIN_REJECT', reason);
  return order;
}

async function expireOrder(orderId) {
  const updated = await prisma.orders.updateMany({
    where: { id: orderId, status: 'PENDING_PAYMENT' },
    data: { status: 'EXPIRED' },
  });
  if (!updated.count) throw new Error('Invalid status transition');
  const order = await prisma.orders.findUnique({ where: { id: orderId } });
  await addEvent(orderId, 'ORDER_EXPIRED');
  return order;
}

async function requestRefund(orderId, reason) {
  const updated = await prisma.orders.updateMany({
    where: { id: orderId, status: 'PAID' },
    data: { status: 'REFUND_REQUESTED' },
  });
  if (!updated.count) throw new Error('Invalid status transition');
  const order = await prisma.orders.findUnique({ where: { id: orderId } });
  await addEvent(orderId, 'REFUND_REQUESTED', reason);
  return order;
}

async function approveRefund(orderId) {
  const updated = await prisma.orders.updateMany({
    where: { id: orderId, status: 'REFUND_REQUESTED' },
    data: { status: 'REFUND_APPROVED' },
  });
  if (!updated.count) throw new Error('Invalid status transition');
  const order = await prisma.orders.findUnique({ where: { id: orderId } });
  await addEvent(orderId, 'REFUND_APPROVED');
  return order;
}

async function rejectRefund(orderId, reason) {
  const updated = await prisma.orders.updateMany({
    where: { id: orderId, status: 'REFUND_REQUESTED' },
    data: { status: 'REFUND_REJECTED' },
  });
  if (!updated.count) throw new Error('Invalid status transition');
  const order = await prisma.orders.findUnique({ where: { id: orderId } });
  await addEvent(orderId, 'REFUND_REJECTED', reason);
  return order;
}

module.exports = {
  createOrder,
  markPayAck,
  confirmPaid,
  rejectOrder,
  expireOrder,
  requestRefund,
  approveRefund,
  rejectRefund,
};
