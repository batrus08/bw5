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

function setupStore(order){
  const store = {
    accounts: [{ id:1, variant_id:'v1', product_code:'C', status:'AVAILABLE', max_usage:1, used_count:0, fifo_order:1n }],
    orders: [order],
    events: [],
    messages: [],
  };
  require.cache[dbPath] = { exports:{
    $transaction: async (fn) => fn({
      orders: {
        findUnique: async ({ where }) => store.orders.find(o=>o.id===where.id),
        update: async ({ where, data }) => { const o = store.orders.find(x=>x.id===where.id); Object.assign(o,data); return o; }
      },
      $queryRaw: async () => [store.accounts[0]],
      accounts: {
        update: async ({ where, data }) => { Object.assign(store.accounts.find(a=>a.id===where.id), data); }
      }
    }),
    orders: {
      findUnique: async ({ where }) => store.orders.find(o=>o.invoice===where.invoice),
      update: async ({ where, data }) => { const o = store.orders.find(x=> x.invoice===where.invoice || x.id===where.id); Object.assign(o,data); return o; }
    },
    tasks:{ create: async ()=>{} }
  }};
  require.cache[eventPath] = { exports:{ addEvent: async (_oid, kind, _msg, meta, _actor, _source, idem) => { store.events.push({kind, idem}); return {}; } } };
  require.cache[waPath] = { exports:{ sendText: async (to,text)=>{ store.messages.push({to,text}); } } };
  require.cache[variantPath] = { exports:{ resolveVariantByCode: async () => ({ variant_id:'v1', duration_days:30 }) } };
  return store;
}

test('confirmPaid called twice does not re-deliver', async () => {
  const nowOrder = { id:1, invoice:'A', product_code:'C', buyer_phone:'1', product:{ delivery_mode:'sharing', duration_months:1 }, delivery_mode:'USERPASS', status:'PENDING_PAYMENT', idempotency_key:null };
  const store = setupStore(nowOrder);
  delete require.cache[require.resolve('../src/services/orders')];
  const { confirmPaid } = require('../src/services/orders');
  await confirmPaid('A');
  await confirmPaid('A');
  const o = store.orders[0];
  assert.strictEqual(o.status,'DELIVERED');
  const sent = store.events.filter(e=>e.kind==='CREDENTIALS_SENT');
  assert.strictEqual(sent.length,1);
  const payAck = store.events.filter(e=>e.kind==='PAY_ACK');
  assert.strictEqual(payAck.length,1);
});

test('confirmPaid no-op for already delivered order', async () => {
  const delivered = { id:2, invoice:'B', product_code:'C', buyer_phone:'2', product:{ delivery_mode:'sharing', duration_months:1 }, delivery_mode:'USERPASS', status:'DELIVERED', fulfilled_at:new Date(), idempotency_key:'deliver:B' };
  const store = setupStore(delivered);
  delete require.cache[require.resolve('../src/services/orders')];
  const { confirmPaid } = require('../src/services/orders');
  await confirmPaid('B');
  assert.strictEqual(store.orders[0].status,'DELIVERED');
  const cred = store.events.filter(e=>e.kind==='CREDENTIALS_SENT');
  assert.strictEqual(cred.length,0);
});
