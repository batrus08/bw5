
const prisma = require('../db/client');
const { addEvent } = require('./events');
const { emitToN8N } = require('../utils/n8n');
const { sendText } = require('./wa');
const { resolveVariantByCode } = require('./variants');

function toCents(n){ return Math.round(Number(n||0)); }

async function createOrder({ buyer_phone, product_code, qty=1, amount_cents, email }){
  const invoice = 'INV-' + Date.now();
  const product = await prisma.products.findUnique({ where:{ code: product_code } });
  const requiresApproval = product?.approval_required;
  const status = requiresApproval ? 'AWAITING_PREAPPROVAL' : 'PENDING_PAYMENT';
  const order = await prisma.orders.create({ data:{ invoice, buyer_phone, product_code, qty, amount_cents: toCents(amount_cents), status, email } });
  await addEvent(order.id, 'ORDER_CREATED', `Order ${invoice} created`);
  if(requiresApproval){
    const pre = await prisma.preapprovalrequests.create({ data:{ order_id: order.id } });
    await emitToN8N('/preapproval-pending', {
      preapprovalId: pre.id,
      orderId: order.id,
      invoice,
      productCode: product_code,
      durationDays: product?.duration_days || null,
      buyerPhone: buyer_phone,
    });
  }
  return order;
}

async function approvePreapproval(invoice){
  const order = await prisma.orders.findUnique({ where:{ invoice }, include:{ preapproval:true } });
  if(!order || !order.preapproval) return { ok:false, error:'ORDER_NOT_FOUND' };
  if(['APPROVED','REJECTED','EXPIRED'].includes(order.preapproval.status)){
    console.log({ idempotent_noop:true, action:'preapproval.approve', invoice, status:order.preapproval.status });
    return { ok:true, idempotent:true, message:'preapproval already finalized', status:order.preapproval.status };
  }
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
  if(['APPROVED','REJECTED','EXPIRED'].includes(order.preapproval.status)){
    console.log({ idempotent_noop:true, action:'preapproval.reject', invoice, status:order.preapproval.status });
    return { ok:true, idempotent:true, message:'preapproval already finalized', status:order.preapproval.status };
  }
  const reason = note ?? '';
  await prisma.$transaction([
    prisma.preapprovalrequests.update({ where:{ order_id: order.id }, data:{ status:'REJECTED', notes: reason } }),
    prisma.orders.update({ where:{ id: order.id }, data:{ status:'REJECTED' } }),
  ]);
  await addEvent(order.id, 'ADMIN_REJECT', `Order ${invoice} rejected: ${reason}`);
  return { ok:true };
}

async function reserveAccount(orderId, variant_id){
  return await prisma.$transaction(async (tx) => {
    const order = await tx.orders.findUnique({ where:{ id: orderId } });
    if(!order) throw new Error('ORDER_NOT_FOUND');
    const [account] = await tx.$queryRaw`SELECT id, used_count, max_usage FROM accounts WHERE variant_id=${variant_id} AND status='AVAILABLE' AND used_count < max_usage ORDER BY fifo_order ASC, id ASC FOR UPDATE SKIP LOCKED LIMIT 1`;
    if(!account) throw new Error('OUT_OF_STOCK');
    const used = account.used_count + 1;
    const disable = used >= account.max_usage;
    await tx.accounts.update({ where:{ id: account.id }, data:{ used_count: used, status: disable ? 'DISABLED' : 'AVAILABLE' } });
    await tx.orders.update({ where:{ id: order.id }, data:{ account_id: account.id } });
    await addEvent(order.id, 'DELIVERY_READY', 'Account reserved', { account_id: account.id });
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
  const variant = await resolveVariantByCode(order.product_code).catch(()=>null);
  if(order.delivery_mode==='INVITE_ONLY' || order.product.delivery_mode==='privat_invite' || order.product.delivery_mode==='canva_invite'){
    await addEvent(order.id,'INVITE_QUEUED','Invite requested');
    return { ok:true, order:upd };
  }
  try {
    await reserveAccount(order.id, variant?.variant_id);
  } catch (e) {
    await prisma.orders.update({ where:{ id: order.id }, data:{ status:'REJECTED' } }).catch(()=>{});
    await sendText(order.buyer_phone, 'Stok untuk durasi ini telah habis. Silakan pilih durasi lain.');
    await addEvent(order.id, 'DELIVERY_NO_STOCK', 'Reservation failed');
    return { ok:false, error:'OUT_OF_STOCK' };
  }
  const now = new Date();
  const expire = variant ? new Date(now.getTime() + variant.duration_days*86400000) : null;
  await prisma.orders.update({ where:{ id: order.id }, data:{ fulfilled_at: now, expires_at: expire, status:'DELIVERED' } });
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

// Store previous status when customer asks for help so admin can resume later
async function requestHelp(orderId, stageCtx){
  let prevStatus;
  if (prisma.orders.findUnique) {
    const existing = await prisma.orders.findUnique({ where: { id: orderId } }).catch(() => null);
    prevStatus = existing?.status;
  }
  const updated = await prisma.orders.update({ where: { id: orderId }, data: { status: 'ON_HOLD_HELP' } });
  const meta = { prev_status: prevStatus, stage: stageCtx };
  await addEvent(updated.id, 'HELP_REQUESTED', 'Customer requested help', meta);
  return updated;
}

// Resume order processing by reverting to the previous status stored in the last
// HELP_REQUESTED event metadata.
async function resume(orderId){
  let prev;
  if (prisma.events?.findFirst) {
    const evt = await prisma.events.findFirst({
      where: { order_id: orderId, kind: 'HELP_REQUESTED' },
      orderBy: { id: 'desc' },
    }).catch(() => null);
    prev = evt?.meta?.prev_status;
  }
  prev = prev || 'PENDING_PAYMENT';
  const upd = await prisma.orders.update({ where: { id: orderId }, data: { status: prev } });
  await addEvent(orderId, 'HELP_RESUMED', 'Help session resumed', { prev_status: prev });
  return upd;
}

// Skip current stage and move order to a specific status. Used when admin wants
// to progress the order while in help mode.
async function skipStage(orderId, nextStatus){
  const upd = await prisma.orders.update({ where: { id: orderId }, data: { status: nextStatus } });
  await addEvent(orderId, 'HELP_RESUMED', 'Stage skipped', { skipped: true, next_status: nextStatus });
  return upd;
}

// Cancel order during help interaction.
async function cancel(orderId){
  const upd = await prisma.orders.update({ where: { id: orderId }, data: { status: 'REJECTED' } });
  await addEvent(orderId, 'HELP_CANCELLED', 'Order cancelled during help');
  return upd;
}

module.exports = { createOrder, setPayAck, confirmPaid, rejectOrder, markInvited, approvePreapproval, rejectPreapproval, reserveAccount, requestHelp, resume, skipStage, cancel };
