
const prisma = require('../db/client');
const { addEvent } = require('./events');
const { notifyHelpRequested } = require('./telegram');
const { emitToN8N } = require('../utils/n8n');
const { sendText, sendInteractiveButtons } = require('./wa');
const { orderState } = require('../whatsapp/state');
const { resolveVariantByCode } = require('./variants');
const { publishOrders } = require('./output');
const { publishStockSummary } = require('./stock');

function toCents(n){ return Math.round(Number(n||0)); }

async function createOrder({ buyer_phone, product_code, variant_code, qty = 1, amount_cents, email }) {
  const invoice = 'INV-' + Date.now();
  const product = await prisma.products.findUnique({ where: { code: product_code } });
  if (!product) throw new Error('PRODUCT_NOT_FOUND');
  let variant = null;
  if (variant_code) {
    variant = await resolveVariantByCode(variant_code);
    if (variant.product_id !== product_code) throw new Error('VARIANT_PRODUCT_MISMATCH');
  }
  const price = variant ? variant.price_cents : product.price_cents || 0;
  const finalAmount = toCents(amount_cents != null ? amount_cents : price * qty);
  const delivery_mode = variant?.delivery_mode || product.default_mode || null;
  const qris_key = variant?.qris_key || product.default_qris_key || null;
  const requiresApproval = product?.approval_required;
  const status = requiresApproval ? 'AWAITING_PREAPPROVAL' : 'PENDING_PAYMENT';
  const order = await prisma.orders.create({
    data: {
      invoice,
      buyer_phone,
      product_code,
      variant_id: variant?.variant_id || null,
      qty,
      amount_cents: finalAmount,
      delivery_mode,
      qris_key,
      status,
      email,
    },
  });
  await addEvent(order.id, 'ORDER_CREATED', `Order ${invoice} created`);
  await publishOrders([{ invoice: order.invoice, status: order.status }]).catch(()=>{});
  if (requiresApproval) {
    const pre = await prisma.preapprovalrequests.create({ data: { order_id: order.id } });
    await emitToN8N('/preapproval-pending', {
      preapprovalId: pre.id,
      orderId: order.id,
      invoice,
      productCode: product_code,
      durationDays: variant?.duration_days || null,
      buyerPhone: buyer_phone,
    });
  }
  return order;
}

async function approvePreapproval(invoice){
  const order = await prisma.orders.findUnique({ where:{ invoice }, include:{ preapproval:true } });
  if(!order || !order.preapproval) return { ok:false, error:'ORDER_NOT_FOUND' };
  if(['APPROVED','REJECTED','EXPIRED'].includes(order.preapproval.status)){
    
    return { ok:true, idempotent:true, message:'preapproval already finalized', status:order.preapproval.status };
  }
  await prisma.$transaction([
    prisma.preapprovalrequests.update({ where:{ order_id: order.id }, data:{ status:'APPROVED' } }),
    prisma.orders.update({ where:{ id: order.id }, data:{ status:'PENDING_PAYMENT' } }),
  ]);
  await addEvent(order.id, 'ADMIN_CONFIRM', `Order ${invoice} approved`);
  await publishOrders([{ invoice, status: 'PENDING_PAYMENT' }]).catch(()=>{});
  return { ok:true };
}

async function rejectPreapproval(invoice, note){
  const order = await prisma.orders.findUnique({ where:{ invoice }, include:{ preapproval:true } });
  if(!order || !order.preapproval) return { ok:false, error:'ORDER_NOT_FOUND' };
  if(['APPROVED','REJECTED','EXPIRED'].includes(order.preapproval.status)){
    
    return { ok:true, idempotent:true, message:'preapproval already finalized', status:order.preapproval.status };
  }
  const reason = note ?? '';
  await prisma.$transaction([
    prisma.preapprovalrequests.update({ where:{ order_id: order.id }, data:{ status:'REJECTED', notes: reason } }),
    prisma.orders.update({ where:{ id: order.id }, data:{ status:'REJECTED' } }),
  ]);
  await addEvent(order.id, 'ADMIN_REJECT', `Order ${invoice} rejected: ${reason}`);
  await publishOrders([{ invoice, status: 'REJECTED' }]).catch(()=>{});
  return { ok:true };
}

async function reserveAccount(orderId, variant_id, tx){
  const runner = async (trx) => {
    await trx.$queryRaw`SELECT id FROM orders WHERE id=${orderId} FOR UPDATE`;
    const order = await trx.orders.findUnique({ where:{ id: orderId } });
    if(!order) throw new Error('ORDER_NOT_FOUND');
    const [account] = await trx.$queryRaw`SELECT id, username, password, profile_name, profile_index, profile_pin, used_count, max_usage FROM accounts
      WHERE (variant_id = ${variant_id} OR (${variant_id} IS NULL AND product_code = ${order.product_code}))
        AND status='AVAILABLE' AND disabled=false AND deleted_at IS NULL AND used_count < max_usage
      ORDER BY fifo_order ASC, id ASC
      FOR UPDATE SKIP LOCKED LIMIT 1`;
    if(!account) throw new Error('OUT_OF_STOCK');
    const used = account.used_count + 1;
    const disable = used >= account.max_usage;
    await trx.accounts.update({ where:{ id: account.id }, data:{ used_count: used, status: disable ? 'DISABLED' : 'RESERVED' } });
    await trx.orders.update({ where:{ id: order.id }, data:{ account_id: account.id } });
    return { accountId: account.id, account };
  };
  if(tx){
    return runner(tx);
  }
  const result = await prisma.$transaction(runner);
  await publishStockSummary().catch(()=>{});
  return result;
}

async function setPayAck(invoice){
  const order = await prisma.orders.findUnique({ where:{ invoice } });
  if(!order) return { ok:false, error:'ORDER_NOT_FOUND' };
  const upd = await prisma.orders.update({ where:{ invoice }, data:{ status:'PENDING_PAY_ACK' } });
  await addEvent(upd.id, 'REMINDER_SENT', 'Waiting admin verification');
  await publishOrders([{ invoice, status: 'PENDING_PAY_ACK' }]).catch(()=>{});
  return { ok:true, order:upd };
}

async function ackTerms(orderId){
  const upd = await prisma.orders.update({ where:{ id: orderId }, data:{ tnc_ack_at: new Date() } });
  await addEvent(orderId, 'TNC_CONFIRMED', 'terms accepted');
  return upd;
}

async function deliverProduct(order){
  const result = await prisma.$transaction(async (tx) => {
    const fresh = await tx.orders.findUnique({ where:{ id: order.id }, include:{ product:true, variant:true } });
    if(!fresh) throw new Error('ORDER_NOT_FOUND');
    if(fresh.delivered_at || fresh.fulfilled_at){
      return { idempotent:true };
    }
    const variant = fresh.variant || (fresh.metadata?.code ? await resolveVariantByCode(fresh.metadata.code).catch(()=>null) : null);
    let accountId, account;
    try{
      ({ accountId, account } = await reserveAccount(fresh.id, variant?.variant_id, tx));
    }catch(e){
      await tx.orders.update({ where:{ id:fresh.id }, data:{ status:'REJECTED' } });
      return { outOfStock:true, buyer:fresh.buyer_phone, invoice:fresh.invoice };
    }
    const now = new Date();
    const durationDays = variant?.duration_days ?? (fresh.product.duration_months ? fresh.product.duration_months*30 : null);
    const expire = durationDays ? new Date(now.getTime()+durationDays*86400000) : null;
    await tx.orders.update({ where:{ id:fresh.id }, data:{ delivered_at: now, fulfilled_at: now, expires_at: expire, status:'DELIVERED' } });
    const otpPolicy = variant?.otp_policy || fresh.product.default_otp_policy || 'NONE';
    return { ok:true, data:{ account, buyer:fresh.buyer_phone, expire, otpPolicy, invoice:fresh.invoice, orderId:fresh.id } };
  });
  if(result?.idempotent) return { ok:true, idempotent:true };
  if(result?.outOfStock){
    await sendText(result.buyer, 'Stok untuk durasi ini telah habis. Silakan pilih durasi lain.');
    await addEvent(order.id, 'DELIVERY_NO_STOCK', 'Reservation failed');
    await publishOrders([{ invoice: result.invoice, status:'REJECTED' }]).catch(()=>{});
    await publishStockSummary().catch(()=>{});
    return { ok:false, error:'OUT_OF_STOCK' };
  }
  const { account, buyer, expire, otpPolicy, invoice, orderId } = result.data;
  await addEvent(orderId,'DELIVERY_READY','Account reserved',{ account_id: account.id },'SYSTEM','system','reserve:'+orderId);
  await publishOrders([{ invoice, status:'DELIVERED' }]).catch(()=>{});
  await publishStockSummary().catch(()=>{});
  const profile = account.profile_name || account.profile_index || '-';
  const pin = account.profile_pin || '-';
  const expStr = expire ? expire.toLocaleDateString('id-ID') : '-';
  const cred = `Username: ${account.username}\nPassword: ${account.password}\nProfile: ${profile}\nPIN: ${pin}\nExpired: ${expStr}`;
  await sendText(buyer, cred);
  if(otpPolicy !== 'NONE'){
    await sendInteractiveButtons(buyer,'Perlu OTP?', ['Akses OTP']);
    orderState.set(buyer,{ step:'OTP_WAIT', orderId, otpPolicy });
  }
  await addEvent(orderId, 'CREDENTIALS_SENT', 'Credentials sent', { account_id: account.id });
  await addEvent(orderId, 'DELIVERED', 'Credentials sent', { account_id: account.id });
  return { ok:true };
}

async function confirmPaid(orderId){
  const key = typeof orderId === 'number' ? { id: orderId } : (String(Number(orderId)) === orderId ? { id: Number(orderId) } : { invoice: orderId });
  const order = await prisma.orders.findUnique({ where: key, include:{ product:true, variant:true } });
  if(!order) return { ok:false, error:'ORDER_NOT_FOUND' };
  if(['PAID_CONFIRMED','DELIVERED'].includes(order.status)){
    return { ok:true, idempotent:true };
  }
  await prisma.orders.update({ where:{ id: order.id }, data:{ status:'PAID_CONFIRMED', pay_ack_at: new Date() } });
  await addEvent(order.id, 'PAY_CONFIRMED', `Order ${order.invoice} confirmed paid`);
  await addEvent(order.id, 'PAY_ACK', `Order ${order.invoice} confirmed paid`);
  await publishOrders([{ invoice: order.invoice, status:'PAID_CONFIRMED' }]).catch(()=>{});
  return deliverProduct(order);
}

async function rejectOrder(invoice, reason='Rejected'){
  const o = await prisma.orders.findUnique({ where:{ invoice } });
  if(!o) return { ok:false, error:'ORDER_NOT_FOUND' };
  const upd = await prisma.orders.update({ where:{ invoice }, data:{ status:'REJECTED' } });
  await addEvent(upd.id, 'ADMIN_REJECT', `Order ${invoice} rejected: ${reason}`);
  await publishOrders([{ invoice, status: 'REJECTED' }]).catch(()=>{});
  return { ok:true, order:upd };
}

async function markInvited(invoice){
  const o = await prisma.orders.findUnique({ where:{ invoice }, include:{ account:true, product:true } });
  if(!o) return { ok:false, error:'ORDER_NOT_FOUND' };
  const variant = o.account ? await prisma.product_variants.findUnique({ where:{ variant_id: o.account.variant_id } }) : null;
  const now = new Date();
  const durationDays = variant?.duration_days ?? (o.product.duration_months ? o.product.duration_months*30 : null);
  const expire = durationDays ? new Date(now.getTime() + durationDays*86400000) : null;
  await prisma.$transaction([
    prisma.orders.update({ where:{ id:o.id }, data:{ fulfilled_at: now, expires_at: expire, status:'DELIVERED' } }),
    prisma.tasks.updateMany({ where:{ order_id:o.id, status:'OPEN' }, data:{ status:'DONE' } }),
  ]);
  await addEvent(o.id, 'INVITED_DONE', `Admin marked invited for ${invoice}`);
  await publishOrders([{ invoice, status: 'DELIVERED' }]).catch(()=>{});
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
  await notifyHelpRequested(orderId, stageCtx);
  await publishOrders([{ invoice: updated.invoice, status: 'ON_HOLD_HELP' }]).catch(()=>{});
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
  await publishOrders([{ invoice: upd.invoice, status: prev }]).catch(()=>{});
  return upd;
}

// Skip current stage and move order to a specific status. Used when admin wants
// to progress the order while in help mode.
async function skipStage(orderId, nextStatus){
  const upd = await prisma.orders.update({ where: { id: orderId }, data: { status: nextStatus } });
  await addEvent(orderId, 'HELP_RESUMED', 'Stage skipped', { skipped: true, next_status: nextStatus });
  await publishOrders([{ invoice: upd.invoice, status: nextStatus }]).catch(()=>{});
  return upd;
}

// Cancel order during help interaction.
async function cancel(orderId){
  const upd = await prisma.orders.update({ where: { id: orderId }, data: { status: 'REJECTED' } });
  await addEvent(orderId, 'HELP_CANCELLED', 'Order cancelled during help');
  await publishOrders([{ invoice: upd.invoice, status: 'REJECTED' }]).catch(()=>{});
  return upd;
}

module.exports = { createOrder, setPayAck, confirmPaid, rejectOrder, markInvited, approvePreapproval, rejectPreapproval, reserveAccount, ackTerms, requestHelp, resume, skipStage, cancel };
