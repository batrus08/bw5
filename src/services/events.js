const prisma = require('../db/client');
async function addEvent(orderId, kind, message, meta={}, actor='SYSTEM', source='system', idempotency_key=null){
  try{ return await prisma.events.create({ data:{ order_id: orderId||null, kind, actor, source, meta:{ message, ...meta }, idempotency_key } }); }catch(e){ return null; }
}
module.exports = { addEvent };
