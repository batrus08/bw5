const prisma = require('../db/client');
const { PAYMENT_DEADLINE_MIN, SHEET_POLL_MS } = require('../config/env');
const { syncAccountsFromCSV } = require('./sheet');
const { notifyAdmin, notifyCritical } = require('./telegram');

function minutes(n){ return n * 60 * 1000; }

async function expireOrders(){
  const now = new Date();
  const expired = await prisma.orders.updateMany({
    where:{ status:'PENDING_PAYMENT', deadline_at: { lt: now } },
    data:{ status:'EXPIRED' }
  });
  if (expired.count > 0){
    await prisma.events.create({ data:{ kind:'ORDER_EXPIRED', actor:'SYSTEM', source:'worker', meta:{ count: expired.count } } });
    await notifyAdmin(`⏰ <b>${expired.count}</b> order expired`);
  }
}

async function remindPayments(){
  const now = new Date();
  const soon = new Date(Date.now() + minutes(5));
  const candidates = await prisma.orders.findMany({
    where:{
      status:'PENDING_PAYMENT',
      deadline_at: { lte: soon, gt: now }
    },
    include:{ events:true }
  });
  for (const o of candidates){
    const already = o.events.some(e=>e.kind==='REMINDER_SENT');
    if (already) continue;
    await prisma.events.create({ data:{ order_id:o.id, kind:'REMINDER_SENT', actor:'SYSTEM', source:'worker' } });
    // Here you could send WA reminder via wa.sendText(o.buyer_phone, ...)
    await notifyAdmin(`🔔 Reminder sent for <b>${o.invoice}</b> (deadline soon)`);
  }
}

async function checkStockAndPause(){
  const products = await prisma.products.findMany({ where:{ is_active:true } });
  for (const p of products){
    if (p.delivery_mode === 'privat_invite' || p.delivery_mode === 'canva_invite') continue;
    const count = await prisma.accounts.count({ where:{ product_code:p.code, status:'AVAILABLE' } });
    if (count === 0){
      await prisma.products.update({ where:{ code:p.code }, data:{ is_active:false } });
      await prisma.events.create({ data:{ kind:'STOCK_ZERO_PAUSE', actor:'SYSTEM', source:'worker', meta:{ product:p.code } } });
      await notifyCritical(`⛔️ Stock empty for <b>${p.code}</b>. Product auto-paused.`);
    }
  }
}

function startWorkers(){
  setInterval(expireOrders, minutes(1));
  setInterval(remindPayments, minutes(1));
  setInterval(checkStockAndPause, minutes(5));
  if (SHEET_POLL_MS > 0){
    setInterval(syncAccountsFromCSV, SHEET_POLL_MS);
  }
  console.log('Workers started.');
}

module.exports = { startWorkers };
