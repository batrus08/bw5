const assert = require('node:assert');
const { test } = require('node:test');

process.env.TELEGRAM_BOT_TOKEN='t';
process.env.ADMIN_CHAT_ID='1';
process.env.WEBHOOK_SECRET_PATH='w';
process.env.DATABASE_URL='postgres://';
process.env.ENCRYPTION_KEY=Buffer.alloc(32).toString('base64');

const dbPath = require.resolve('../src/db/client');
const eventPath = require.resolve('../src/services/events');
const waPath = require.resolve('../src/services/wa');
const variantPath = require.resolve('../src/services/variants');
const stockPath = require.resolve('../src/services/stock');
const outputPath = require.resolve('../src/services/output');

function setupStore(order){
  const store = {
    accounts: [{ id:1, variant_id:'v1', username:'u', password:'p', profile_name:'P', profile_pin:'0', status:'AVAILABLE', max_usage:1, used_count:0, fifo_order:1n }],
    orders: [order],
    events: [],
    messages: [],
  };
  require.cache[dbPath] = { exports:{
    $transaction: async (fn) => fn({
      orders:{
        findUnique: async ({ where }) => store.orders.find(o=>o.id===where.id),
        update: async ({ where, data }) => { const o = store.orders.find(x=>x.id===where.id); Object.assign(o,data); return o; }
      },
      $queryRaw: async () => [store.accounts[0]],
      accounts:{
        update: async ({ where, data }) => { Object.assign(store.accounts.find(a=>a.id===where.id), data); }
      }
    }),
    orders:{
      findUnique: async ({ where }) => store.orders.find(o=>o.invoice===where.invoice || o.id===where.id),
      update: async ({ where, data }) => { const o = store.orders.find(x=> x.invoice===where.invoice || x.id===where.id); Object.assign(o,data); return o; }
    },
    $queryRaw: async () => [store.accounts[0]],
    tasks:{ create: async ()=>{} }
  }};
  require.cache[eventPath] = { exports:{ addEvent: async (_oid, kind, _msg, meta, _actor, _source, idem) => { store.events.push({kind, idem}); } } };
  require.cache[waPath] = { exports:{ sendText: async (to,text)=>{ store.messages.push({to,text}); }, sendInteractiveButtons: async ()=>{} } };
  require.cache[variantPath] = { exports:{ resolveVariantByCode: async () => ({ variant_id:'v1', duration_days:30, otp_policy:'NONE' }) } };
  require.cache[stockPath] = { exports:{ publishStockSummary: async ()=>{} } };
  require.cache[outputPath] = { exports:{ publishOrders: async ()=>{}, publishStock: async ()=>{} } };
  return store;
}

test('confirmPaid is idempotent and delivers only once', async () => {
  const nowOrder = { id:1, invoice:'A', product_code:'C', buyer_phone:'1', product:{ delivery_mode:'sharing', duration_months:1 }, variant:{ variant_id:'v1', duration_days:30, otp_policy:'NONE' }, variant_id:'v1', delivery_mode:'USERPASS', status:'PENDING_PAYMENT', idempotency_key:null };
  const store = setupStore(nowOrder);
  delete require.cache[require.resolve('../src/services/orders')];
  const { confirmPaid } = require('../src/services/orders');

  const first = await confirmPaid('A');
  assert.strictEqual(store.orders[0].status, 'DELIVERED');
  assert.ok(store.orders[0].delivered_at);
  assert.strictEqual(store.events.filter(e=>e.kind==='PAY_CONFIRMED').length,1);
  assert.strictEqual(store.events.filter(e=>e.kind==='DELIVERED').length,1);
  assert.strictEqual(store.messages.length,1);
  const deliveredAt = store.orders[0].delivered_at;

  const second = await confirmPaid('A');
  assert.deepStrictEqual(second, { ok:true, idempotent:true });
  assert.strictEqual(store.orders[0].delivered_at, deliveredAt);
  assert.strictEqual(store.events.filter(e=>e.kind==='DELIVERED').length,1);
  assert.strictEqual(store.messages.length,1);
});
