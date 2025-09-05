
const prisma = require('../db/client');
const { SHEET_POLL_MS, PAYMENT_DEADLINE_MIN } = require('../config/env');
const { syncAccountsFromCSV } = require('./sheet');
const { notifyAdmin, notifyCritical, tgCall } = require('./telegram');
const { emitToN8N } = require('../utils/n8n');
const { waCall } = require('./wa');
const { sendToN8N } = require('../utils/n8n');

function minutes(n){ return n*60*1000; }

function wrap(task, name){
  return async () => {
    try {
      await task();
    } catch (e) {
      if (e.code === 'P2021') return; // table does not exist yet
      console.error(`[worker] ${name} error`, e);
    }
  };
}

async function expireOrders(){
  const now = new Date();
  const threshold = new Date(now.getTime() - minutes(PAYMENT_DEADLINE_MIN));
  const expired = await prisma.orders.updateMany({ where:{ status:'PENDING_PAYMENT', created_at:{ lt: threshold } }, data:{ status:'EXPIRED' } });
  if(expired.count>0){
    await prisma.events.create({ data:{ kind:'ORDER_EXPIRED', actor:'SYSTEM', source:'worker', meta:{ count: expired.count } } });
    await notifyAdmin(`⏰ <b>${expired.count}</b> order expired`);
  }
}

async function remindPayments(){
  const now = new Date();
  const start = new Date(now.getTime() - minutes(PAYMENT_DEADLINE_MIN));
  const soon = new Date(start.getTime() + minutes(5));
  const list = await prisma.orders.findMany({
    where: { status: 'PENDING_PAYMENT', created_at: { gt: start, lte: soon } },
    select: {
      id: true,
      invoice: true,
      events: { select: { kind: true } },
    },
  });
  for(const o of list){
    if(o.events.some(e=>e.kind==='REMINDER_SENT')) continue;
    await prisma.events.create({ data:{ order_id:o.id, kind:'REMINDER_SENT', actor:'SYSTEM', source:'worker' } });
    await notifyAdmin(`🔔 Reminder for <b>${o.invoice}</b>`);
  }
}

async function checkStockAndPause(){
  const products = await prisma.products.findMany({ where:{ is_active:true } });
  for(const p of products){
    if(p.delivery_mode==='privat_invite'||p.delivery_mode==='canva_invite') continue;
    const count = await prisma.accounts.count({ where:{ product_code:p.code, status:'AVAILABLE' } });
    if(count===0){
      await prisma.products.update({ where:{ code:p.code }, data:{ is_active:false } });
      await prisma.events.create({ data:{ kind:'STOCK_ZERO_PAUSE', actor:'SYSTEM', source:'worker', meta:{ product:p.code } } });
      await notifyCritical(`⛔️ Stock empty for <b>${p.code}</b>. Product auto-paused.`);
    }
  }
}

async function retryDeadLetters(){
  const maxRetry = 6;
  let list = [];
  try {
    list = await prisma.deadletters.findMany({
      where: { retry_count: { lt: maxRetry } },
      take: 20,
      orderBy: { last_attempt: 'asc' },
    });
  } catch (e) {
    if (e.code === 'P2021') return; // table does not exist yet
    throw e;
  }
  for(const d of list){
    const waitMs = Math.pow(2, d.retry_count) * 30_000;
    if(Date.now() - new Date(d.last_attempt).getTime() < waitMs) continue;
    try {
      if (d.channel === 'TELEGRAM') await tgCall(d.endpoint || 'sendMessage', d.payload);
      else if (d.channel === 'WHATSAPP') await waCall(d.endpoint || 'messages', d.payload);
      else if (d.channel === 'N8N') await sendToN8N(d.endpoint || '', d.payload);
      await prisma.deadletters.delete({ where:{ id: d.id } });
    } catch (e) {
      await prisma.deadletters.update({
        where:{ id: d.id },
        data:{ retry_count: d.retry_count+1, last_attempt: new Date(), error: e.message }
      });
    }
  }
}

function detectTransition(prev, current){
  if(prev && !current) return 'OUT_OF_STOCK';
  if(!prev && current) return 'RESTOCKED';
  return null;
}

async function stockTransitions(){
  const products = await prisma.products.findMany({ where:{ is_active:true } });
  for(const p of products){
    const count = await prisma.accounts.count({ where:{ product_code:p.code, status:'AVAILABLE' } });
    const existing = await prisma.stockalerts.findMany({ where:{ product_code:p.code } });
    const current = count > 0;
    if(existing.length===0){
      await prisma.stockalerts.create({ data:{ product_code:p.code, last_status: current?'IN_STOCK':'OUT_OF_STOCK' } });
      continue;
    }
    const rec = existing[0];
    const transition = detectTransition(rec.last_status==='IN_STOCK', current);
    if(transition){
      await prisma.stockalerts.update({ where:{ product_code:p.code }, data:{ last_status: current?'IN_STOCK':'OUT_OF_STOCK', last_notified_at: new Date() } });
      await emitToN8N('/stock-transition', { product_code: p.code, status: transition });
      await notifyAdmin(`📦 Stock ${p.code} ${transition === 'RESTOCKED' ? 'restocked' : 'out of stock'}`);
    }
  }
}

async function startWorkers(){
  try {
    await prisma.orders.findFirst({ select:{ id:true }, take:1 });
  } catch(e) {
    if(e.code === 'P2021') { console.log('Workers skipped: tables not ready'); return; }
    throw e;
  }
  setInterval(wrap(expireOrders,'expireOrders'), minutes(1));
  setInterval(wrap(remindPayments,'remindPayments'), minutes(1));
  setInterval(wrap(checkStockAndPause,'checkStockAndPause'), minutes(5));
  setInterval(wrap(retryDeadLetters,'retryDeadLetters'), minutes(1));
  setInterval(wrap(stockTransitions,'stockTransitions'), minutes(5));
  if(SHEET_POLL_MS>0){ setInterval(wrap(syncAccountsFromCSV,'syncAccountsFromCSV'), SHEET_POLL_MS); }
  console.log('Workers started.');
}

module.exports = { startWorkers, stockTransitions, detectTransition };
