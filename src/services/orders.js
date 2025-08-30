// src/services/orders.js
const prisma = require('../db/client');
const { addEvent } = require('./events');

async function confirmPaid(invoice) {
  const order = await prisma.orders.findUnique({ where: { invoice } });
  if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

  const updated = await prisma.orders.update({
    where: { invoice },
    data: { status: 'PAID', pay_ack_at: new Date() },
  });
  await addEvent(updated.id, 'PAY_ACK', `Order ${invoice} confirmed paid`);
  return { ok: true, order: updated };
}

async function rejectOrder(invoice, reason = 'Rejected') {
  const order = await prisma.orders.findUnique({ where: { invoice } });
  if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

  const updated = await prisma.orders.update({
    where: { invoice },
    data: { status: 'REJECTED' },
  });
  await addEvent(updated.id, 'ADMIN_REJECT', `Order ${invoice} rejected: ${reason}`);
  return { ok: true, order: updated };
}

module.exports = { confirmPaid, rejectOrder };
