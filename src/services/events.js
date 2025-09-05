
const prisma = require('../db/client');
const { sendToN8n } = require('../utils/n8n');

async function addEvent(orderId, kind, message, meta={}, actor='SYSTEM', source='system', idempotency_key=null){
  try{
    const ev = await prisma.events.create({ data:{ order_id: orderId||null, kind, actor, source, meta:{ message, ...meta }, idempotency_key } });
    sendToN8n('events', { orderId, kind, message, meta, actor, source }).catch(()=>{});
    return ev;
  }catch(e){
    return null;
  }
}

module.exports = { addEvent };
