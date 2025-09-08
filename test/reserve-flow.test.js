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

const store = {
  accounts: [{ id:1, variant_id:'v1', product_code:'C', status:'AVAILABLE', max_usage:1, used_count:0, fifo_order:1n, natural_key:'k1' }],
  orders: [
    { id:1, invoice:'A', product_code:'C', buyer_phone:'1', product:{ delivery_mode:'sharing', duration_months:1 }, delivery_mode:'USERPASS' },
    { id:2, invoice:'B', product_code:'C', buyer_phone:'2', product:{ delivery_mode:'sharing', duration_months:1 }, delivery_mode:'USERPASS' },
  ],
  messages: [],
  events: [],
};

require.cache[dbPath] = { exports: {
  $transaction: async (fn) => fn({
    accounts: {
      update: async ({ where, data }) => {
        const acc = store.accounts.find(a=>a.id===where.id);
        await new Promise(r=>setTimeout(r,10));
        if(!acc || acc.status !== 'AVAILABLE') throw new Error('Stok habis');
        Object.assign(acc,data); return acc;
      },
    },
    orders: {
      findUnique: async ({ where }) => store.orders.find(o=>o.id===where.id),
      update: async ({ where, data }) => { const o=store.orders.find(x=>x.id===where.id); Object.assign(o,data); return o; },
    },
    $queryRaw: async (strings, variantId, _v2, prodCode) => {
      await new Promise(r=>setTimeout(r,10));
      return store.accounts.filter(a=>
        (a.variant_id===variantId || (!variantId && a.product_code===prodCode)) &&
        a.status==='AVAILABLE' && a.used_count<a.max_usage);
    },
  }),
  orders: {
    findUnique: async ({ where }) => store.orders.find(o=>o.invoice===where.invoice),
    update: async ({ where, data }) => {
      const o = store.orders.find(x=> x.invoice===where.invoice || x.id===where.id);
      Object.assign(o, data); return o;
    },
  },
  accounts: {
    findUnique: async ({ where }) => store.accounts.find(a=>a.id===where.id),
  },
  tasks: { create: async ()=>{} },
} };

require.cache[eventPath] = { exports: { addEvent: async (...args) => { store.events.push(args); } } };
require.cache[waPath] = { exports: { sendText: async (to,text)=>{ store.messages.push({to,text}); } } };
require.cache[variantPath] = { exports:{ resolveVariantByCode: async () => ({ variant_id:'v1', product:'P', duration_days:30, code:'C', active:true }) } };

const { confirmPaid } = require('../src/services/orders');

test('only one confirmation succeeds reserving stock', async () => {
  const [a,b] = await Promise.allSettled([confirmPaid('A'), confirmPaid('B')]);
  const results = [a,b].filter(r=>r.status==='fulfilled').map(r=>r.value);
  const failures = results.filter(r=>!r.ok);
  assert.strictEqual(failures.length,1);
  assert.ok(store.messages.some(m=>m.text.includes('Stok')));
  const credMsgs = store.messages.filter(m=>m.text.includes('Username:'));
  assert.strictEqual(credMsgs.length,1);
  const deliveryEvents = store.events.filter(e=>e[1]==='DELIVERY_READY');
  assert.strictEqual(deliveryEvents.length,1);
});

test('fallback by product_code and auto-disable when max usage reached', async () => {
  store.accounts = [{ id:2, variant_id:null, product_code:'X', status:'AVAILABLE', max_usage:1, used_count:0, fifo_order:1n, natural_key:'k2' }];
  store.orders.push({ id:3, invoice:'C', product_code:'X', buyer_phone:'3', product:{ delivery_mode:'sharing', duration_months:1 }, delivery_mode:'USERPASS' });
  require.cache[variantPath].exports.resolveVariantByCode = async () => { throw new Error('should not call'); };
  delete require.cache[require.resolve('../src/services/orders')];
  const { confirmPaid: confirmPaid2 } = require('../src/services/orders');
  await confirmPaid2('C');
  const acc = store.accounts[0];
  assert.strictEqual(acc.used_count,1);
  assert.strictEqual(acc.status,'DISABLED');
});
