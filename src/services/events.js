
const prisma = require('../db/client');
const { emitToN8N } = require('../utils/n8n');

async function addEvent(orderId, kind, message, meta={}, actor='SYSTEM', source='system', idempotency_key=null){
  try{
    const ev = await prisma.events.create({ data:{ order_id: orderId||null, kind, actor, source, meta:{ message, ...meta }, idempotency_key } });
    emitToN8N('/events', { orderId, kind, message, meta, actor, source });
    return ev;
  }catch(e){
    return null;
  }
}

module.exports = { addEvent };
