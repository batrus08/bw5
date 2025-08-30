const prisma = require('../db/client');
const { REMINDER_INTERVAL_MS, AUTO_EXPIRE_MS, REMINDER_COOLDOWN_MS } = require('../config/constants');
const { addEvent } = require('../services/events');
const { deliverOrder } = require('../services/delivery');
const { sendAdmin } = require('../services/notify');
const { formatTs } = require('../utils/time');

const metrics = {
  lastReminderAt: null,
  remindersSent: 0,
  lastExpireAt: null,
  ordersExpired: 0,
  lastDeliveryAt: null,
  deliveriesTried: 0,
  deliveriesSucceeded: 0,
  deliveriesNoStock: 0,
  deliveriesRaceFail: 0,
};

async function reminder() {
  const since = new Date(Date.now() - REMINDER_INTERVAL_MS);
  const orders = await prisma.orders.findMany({
    where: { status: 'PENDING_PAY_ACK', pay_ack_at: { lt: since } },
    include: { product: { select: { name: true } } },
  });
  for (const o of orders) {
    const recent = await prisma.events.findFirst({
      where: {
        order_id: o.id,
        kind: 'REMINDER_SENT',
        created_at: { gt: new Date(Date.now() - REMINDER_COOLDOWN_MS) },
      },
    });
    if (recent) continue;
    const ageMin = Math.floor((Date.now() - o.pay_ack_at.getTime()) / 60000);
    const amount = (o.amount_cents / 100).toLocaleString('id-ID');
    const text =
      `⏰ Reminder: ${o.invoice} menunggu verifikasi\n` +
      `Produk: ${o.product.name} x${o.qty} • Total: Rp${amount}\n` +
      `Usia: ${ageMin} menit`;
    await sendAdmin(text, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Konfirmasi', callback_data: `CONFIRM|${o.id}` },
          { text: '❌ Tolak', callback_data: `REJECT|${o.id}` },
        ]],
      },
    });
    await addEvent(o.id, 'REMINDER_SENT');
    metrics.remindersSent++;
    metrics.lastReminderAt = new Date();
  }
}

async function autoExpire() {
  const cutoff = new Date(Date.now() - AUTO_EXPIRE_MS);
  const orders = await prisma.orders.findMany({
    where: {
      status: { in: ['PENDING_PAYMENT', 'PENDING_PAY_ACK'] },
      OR: [
        { status: 'PENDING_PAYMENT', created_at: { lt: cutoff } },
        { status: 'PENDING_PAY_ACK', pay_ack_at: { lt: cutoff } },
      ],
    },
  });
  for (const o of orders) {
    await prisma.$transaction(async (tx) => {
      await tx.orders.update({ where: { id: o.id }, data: { status: 'EXPIRED', account_id: null } });
      if (o.account_id) {
        await tx.accounts.update({ where: { id: o.account_id }, data: { status: 'AVAILABLE' } });
      }
    });
    await addEvent(o.id, 'ORDER_EXPIRED');
    metrics.ordersExpired++;
    metrics.lastExpireAt = new Date();
  }
}

async function delivery() {
  const orders = await prisma.orders.findMany({
    where: { status: 'PAID', account_id: null },
  });
  for (const o of orders) {
    metrics.deliveriesTried++;
    metrics.lastDeliveryAt = new Date();
    const result = await deliverOrder(o); // events handled inside
    if (result === 'success' || result === 'queued') metrics.deliveriesSucceeded++;
    else if (result === 'no_stock') metrics.deliveriesNoStock++;
    else if (result === 'race_fail') metrics.deliveriesRaceFail++;
  }
}

function start() {
  reminder().catch((e) => console.error('reminder', e.message));
  autoExpire().catch((e) => console.error('autoExpire', e.message));
  delivery().catch((e) => console.error('delivery', e.message));
  setInterval(() => {
    reminder().catch((e) => console.error('reminder', e.message));
  }, 60 * 1000);
  setInterval(() => {
    autoExpire().catch((e) => console.error('autoExpire', e.message));
  }, 60 * 1000);
  setInterval(() => {
    delivery().catch((e) => console.error('delivery', e.message));
  }, 60 * 1000);
}

function getWorkerStats() {
  const out = { ...metrics };
  if (out.lastReminderAt) out.lastReminderAt = formatTs(out.lastReminderAt);
  if (out.lastExpireAt) out.lastExpireAt = formatTs(out.lastExpireAt);
  if (out.lastDeliveryAt) out.lastDeliveryAt = formatTs(out.lastDeliveryAt);
  return out;
}

module.exports = { start, getWorkerStats };
