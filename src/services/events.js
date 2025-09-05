
const prisma = require('../db/client');
const { emitToN8N } = require('../utils/n8n');

const TX_EVENTS = new Set(['ORDER_PAID','CREDENTIALS_SENT','INVITED_DONE','EXPIRED','CANCELLED','RENEWED']);

async function addEvent(orderId, kind, message, meta={}, actor='SYSTEM', source='system', idempotency_key=null){
  try{
    const ev = await prisma.events.create({ data:{ order_id: orderId||null, kind, actor, source, meta:{ message, ...meta }, idempotency_key } });
    emitToN8N('/events', { orderId, kind, message, meta, actor, source });
    if(orderId && TX_EVENTS.has(kind)){
      const o = await prisma.orders.findUnique({ where:{ id: orderId }, include:{ account:true } });
      if(o){
        const payload = {
          ts: new Date().toISOString(),
          invoice: o.invoice,
          buyer: o.buyer_phone,
          code: o.product_code,
          variant_id: o.account?.variant_id || null,
          order_status: o.status,
          action: kind,
          fulfilled_at: o.fulfilled_at,
          expires_at: o.expires_at,
          account_id: o.account_id,
          channel: source && source.toUpperCase().includes('WA') ? 'WA' : source && source.toUpperCase().includes('TG') ? 'TG' : 'SYS',
        };
        emitToN8N('/tx-append', payload);
      }
    }
    return ev;
  }catch(e){
    return null;
  }
}

module.exports = { addEvent };
