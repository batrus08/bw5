const test = require('node:test');
const assert = require('node:assert');

const ordersPath = require.resolve('../src/services/orders');
const dbPath = require.resolve('../src/db/client');
const variantPath = require.resolve('../src/services/variants');
const eventPath = require.resolve('../src/services/events');

const createArgs = {};

require.cache[eventPath] = { exports:{ addEvent: async ()=>{} } };
require.cache[variantPath] = { exports:{ resolveVariantByCode: async (code)=>({
  variant_id:'v1', product_id:'P1', price_cents:500, delivery_mode:'USERPASS', qris_key:'QV', duration_days:30
}) } };
require.cache[dbPath] = { exports:{
  products: { findUnique: async ()=>({ code:'P1', default_qris_key:'QD', approval_required:false, default_mode:'USERPASS' }) },
  orders: { create: async ({ data })=>{ createArgs.data=data; return { id:1, ...data }; } },
  preapprovalrequests: { create: async ()=>({ id:1 }) }
}};

const { createOrder } = require(ordersPath);

test('uses variant qris over product default', async ()=>{
  const order = await createOrder({ buyer_phone:'123', product_code:'P1', variant_code:'V1', qty:2 });
  assert.strictEqual(order.qris_key, 'QV');
  assert.strictEqual(createArgs.data.amount_cents, 1000);
  assert.strictEqual(order.variant_id, 'v1');
});
