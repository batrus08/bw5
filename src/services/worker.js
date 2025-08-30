
const prisma = require('../db/client');
const { SHEET_POLL_MS } = require('../config/env');
const { syncAccountsFromCSV } = require('./sheet');
const { notifyAdmin, notifyCritical, tgCall } = require('./telegram');
const { waCall } = require('./wa');

function minutes(n){ return n*60*1000; }

async function expireOrders(){
  const now = new Date();
  const expired = await prisma.orders.updateMany({ where:{ status:'PENDING_PAYMENT', deadline_at:{ lt: now } }, data:{ status:'EXPIRED' } });
  if(expired.count>0){ await prisma.events.create({ data:{ kind:'ORDER_EXPIRED', actor:'SYSTEM', source:'worker', meta:{ count: expired.count } } }); await notifyAdmin(`⏰ <b>${expired.count}</b> order expired`); }
}

async function remindPayments(){
  const now = new Date(); const soon = new Date(Date.now()+minutes(5));
  const list = await prisma.orders.findMany({ where:{ status:'PENDING_PAYMENT', deadline_at:{ lte: soon, gt: now } }, include:{ events:true } });
  for(const o of list){ if(o.events.some(e=>e.kind==='REMINDER_SENT')) continue; await prisma.events.create({ data:{ order_id:o.id, kind:'REMINDER_SENT', actor:'SYSTEM', source:'worker' } }); await notifyAdmin(`🔔 Reminder for <b>${o.invoice}</b>`); }
}

async function checkStockAndPause(){
  const products = await prisma.products.findMany({ where:{ is_active:true } });
  for(const p of products){ if(p.delivery_mode==='privat_invite'||p.delivery_mode==='canva_invite') continue;
    const count = await prisma.accounts.count({ where:{ product_code:p.code, status:'AVAILABLE' } });
    if(count===0){ await prisma.products.update({ where:{ code:p.code }, data:{ is_active:false } }); await prisma.events.create({ data:{ kind:'STOCK_ZERO_PAUSE', actor:'SYSTEM', source:'worker', meta:{ product:p.code } } }); await notifyCritical(`⛔️ Stock empty for <b>${p.code}</b>. Product auto-paused.`); }
  }
}

async function retryDeadLetters(){
  const maxRetry = 6;
  const list = await prisma.deadletters.findMany({
    where: { retry_count: { lt: maxRetry } },
    take: 20,
    orderBy: { last_attempt: 'asc' }
  });
  for(const d of list){
    // simple backoff: wait (2^retry)*30s
    const waitMs = Math.pow(2, d.retry_count) * 30_000;
    if (Date.now() - new Date(d.last_attempt).getTime() < waitMs) continue;
    try {
      if (d.channel === 'TELEGRAM') await tgCall(d.endpoint || 'sendMessage', d.payload);
      else if (d.channel === 'WHATSAPP') await waCall(d.endpoint || 'messages', d.payload);
      await prisma.deadletters.delete({ where: { id: d.id } });
    } catch (e) {
      await prisma.deadletters.update({ where:{ id: d.id }, data:{ retry_count: d.retry_count+1, last_attempt: new Date(), error: e.message } });
    }
  }
}

function startWorkers(){
  setInterval(expireOrders, minutes(1));
  setInterval(remindPayments, minutes(1));
  setInterval(checkStockAndPause, minutes(5));
  setInterval(retryDeadLetters, minutes(1));
  if(SHEET_POLL_MS>0){ setInterval(syncAccountsFromCSV, SHEET_POLL_MS); }
  console.log('Workers started.');
}

module.exports = { startWorkers };
