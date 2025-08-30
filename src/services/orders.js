
const prisma = require('../db/client');
const { addEvent } = require('./events');
const { encrypt } = require('../utils/crypto');

function toCents(n){ return Math.round(Number(n||0)); }

async function createOrder({ buyer_phone, product_code, qty=1, amount_cents, email }){
  const invoice = 'INV-' + Date.now();
  const deadline_at = new Date(Date.now() + (Number(process.env.PAYMENT_DEADLINE_MIN||30))*60*1000);
  const order = await prisma.orders.create({ data:{ invoice, buyer_phone, product_code, qty, amount_cents: toCents(amount_cents), status:'PENDING_PAYMENT', email, deadline_at } });
  await addEvent(order.id, 'ORDER_CREATED', `Order ${invoice} created`);
  return order;
}

async function setPayAck(invoice){
  const order = await prisma.orders.findUnique({ where:{ invoice } });
  if(!order) return { ok:false, error:'ORDER_NOT_FOUND' };
  const upd = await prisma.orders.update({ where:{ invoice }, data:{ status:'PENDING_PAY_ACK' } });
  await addEvent(upd.id, 'REMINDER_SENT', 'Waiting admin verification');
  return { ok:true, order:upd };
}

async function confirmPaid(invoice){
  const order = await prisma.orders.findUnique({ where:{ invoice }, include:{ product:true } });
  if(!order) return { ok:false, error:'ORDER_NOT_FOUND' };
  const upd = await prisma.orders.update({ where:{ invoice }, data:{ status:'PAID', pay_ack_at: new Date() } });
  await addEvent(upd.id, 'PAY_ACK', `Order ${invoice} confirmed paid`);
  if(order.product.delivery_mode==='privat_invite'){ await prisma.tasks.create({ data:{ order_id: order.id, kind:'INVITE_CHATGPT', due_at: new Date(Date.now()+15*60*1000) } }); await addEvent(order.id,'INVITE_QUEUED','Invite task created',{ kind:'INVITE_CHATGPT' }); }
  else if(order.product.delivery_mode==='canva_invite'){ await prisma.tasks.create({ data:{ order_id: order.id, kind:'INVITE_CANVA', due_at: new Date(Date.now()+15*60*1000) } }); await addEvent(order.id,'INVITE_QUEUED','Invite task created',{ kind:'INVITE_CANVA' }); }
  else { await addEvent(order.id, 'DELIVERY_READY', 'Ready to deliver account'); }
  return { ok:true, order:upd };
}

async function rejectOrder(invoice, reason='Rejected'){
  const o = await prisma.orders.findUnique({ where:{ invoice } });
  if(!o) return { ok:false, error:'ORDER_NOT_FOUND' };
  const upd = await prisma.orders.update({ where:{ invoice }, data:{ status:'REJECTED' } });
  await addEvent(upd.id, 'ADMIN_REJECT', `Order ${invoice} rejected: ${reason}`);
  return { ok:true, order:upd };
}

async function markInvited(invoice){
  const o = await prisma.orders.findUnique({ where:{ invoice } });
  if(!o) return { ok:false, error:'ORDER_NOT_FOUND' };
  await prisma.tasks.updateMany({ where:{ order_id:o.id, status:'OPEN' }, data:{ status:'DONE' } });
  await addEvent(o.id, 'INVITE_ADMIN_CONFIRMED', `Admin marked invited for ${invoice}`);
  return { ok:true };
}

module.exports = { createOrder, setPayAck, confirmPaid, rejectOrder, markInvited };
