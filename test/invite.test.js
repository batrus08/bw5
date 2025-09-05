const assert = require('node:assert');
const { test } = require('node:test');

process.env.TELEGRAM_BOT_TOKEN='t';
process.env.ADMIN_CHAT_ID='1';
process.env.WEBHOOK_SECRET_PATH='w';
process.env.DATABASE_URL='postgres://';
process.env.ENCRYPTION_KEY=Buffer.alloc(32).toString('base64');

const dbPath = require.resolve('../src/db/client');
const eventPath = require.resolve('../src/services/events');

const store = {
  order: { id:1, invoice:'INV', product_code:'P', account:{ variant_id:'v1' }, product:{ duration_months:2 } },
  tasks: [{ order_id:1, status:'OPEN' }],
  variant: { variant_id:'v1', duration_days:30 },
  updated:null,
};

require.cache[dbPath] = { exports:{
  orders:{
    findUnique: async ()=>store.order,
    update: async ({ where, data })=>{ Object.assign(store.order, data); return store.order; },
  },
  product_variants:{ findUnique: async ()=>store.variant },
  tasks:{ updateMany: async ({ where, data })=>{ store.tasks.forEach(t=>{ if(t.order_id===where.order_id && t.status===where.status) t.status=data.status; }); } },
  $transaction: async (ops)=>{ for(const op of ops){ await op; } },
  accounts:{},
} };

require.cache[eventPath] = { exports:{ addEvent: async ()=>{} } };

const { markInvited } = require('../src/services/orders');

test('markInvited sets fulfilled and expires', async () => {
  await markInvited('INV');
  assert.ok(store.order.fulfilled_at instanceof Date);
  assert.ok(store.order.expires_at instanceof Date);
  assert.strictEqual(store.tasks[0].status,'DONE');
});
