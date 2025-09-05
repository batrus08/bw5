
const prisma = require('../db/client');
const { addEvent } = require('./events');

function toCents(n){ return Math.round(Number(n||0)); }

async function createOrder({ buyer_phone, product_code, qty=1, amount_cents, email, sub_code='default' }){
  const invoice = 'INV-' + Date.now();
  const cfg = await prisma.subproductconfigs.findUnique({ where:{ product_code_sub_code:{ product_code, sub_code } } });
  const requiresApproval = cfg?.approval_required;
  const status = requiresApproval ? 'AWAITING_PREAPPROVAL' : 'PENDING_PAYMENT';
  const order = await prisma.orders.create({ data:{ invoice, buyer_phone, product_code, qty, amount_cents: toCents(amount_cents), status, email } });
  await addEvent(order.id, 'ORDER_CREATED', `Order ${invoice} created`);
  if(requiresApproval){
    await prisma.preapprovalrequests.create({ data:{ order_id: order.id, sub_code } });
  }
  return order;
}

async function approvePreapproval(invoice){
  const order = await prisma.orders.findUnique({ where:{ invoice }, include:{ preapproval:true } });
  if(!order || !order.preapproval) return { ok:false, error:'ORDER_NOT_FOUND' };
  await prisma.$transaction([
    prisma.preapprovalrequests.update({ where:{ order_id: order.id }, data:{ status:'APPROVED' } }),
    prisma.orders.update({ where:{ id: order.id }, data:{ status:'PENDING_PAYMENT' } }),
  ]);
  await addEvent(order.id, 'ADMIN_CONFIRM', `Order ${invoice} approved`);
  return { ok:true };
}

async function rejectPreapproval(invoice, note){
  const order = await prisma.orders.findUnique({ where:{ invoice }, include:{ preapproval:true } });
  if(!order || !order.preapproval) return { ok:false, error:'ORDER_NOT_FOUND' };
  const cfg = await prisma.subproductconfigs.findUnique({ where:{ product_code_sub_code:{ product_code: order.product_code, sub_code: order.preapproval.sub_code || 'default' } } });
  const reason = note ?? (cfg?.approval_notes_default || '');
  await prisma.$transaction([
    prisma.preapprovalrequests.update({ where:{ order_id: order.id }, data:{ status:'REJECTED', notes: reason } }),
    prisma.orders.update({ where:{ id: order.id }, data:{ status:'REJECTED' } }),
  ]);
  await addEvent(order.id, 'ADMIN_REJECT', `Order ${invoice} rejected: ${reason}`);
  return { ok:true };
}

async function reserveAccount(orderId){
  return await prisma.$transaction(async (tx) => {
    const order = await tx.orders.findUnique({ where:{ id: orderId } });
    if(!order) throw new Error('ORDER_NOT_FOUND');
    const account = await tx.accounts.findFirst({ where:{ product_code: order.product_code, status:'AVAILABLE' }, orderBy:{ id:'asc' } });
    if(!account) throw new Error('Stok habis');
    await tx.accounts.update({ where:{ id: account.id, status:'AVAILABLE' }, data:{ status:'RESERVED' } });
    await tx.orders.update({ where:{ id: order.id }, data:{ account_id: account.id } });
    await addEvent(order.id, 'DELIVERY_READY', 'Account reserved');
    return account;
  });
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

module.exports = { createOrder, setPayAck, confirmPaid, rejectOrder, markInvited, approvePreapproval, rejectPreapproval, reserveAccount };
