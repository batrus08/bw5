const assert = require('node:assert');
const { test } = require('node:test');

const dbPath = require.resolve('../src/db/client');
const eventPath = require.resolve('../src/services/events');
const waPath = require.resolve('../src/services/wa');
const variantPath = require.resolve('../src/services/variants');

const store = {
  accounts: [{ id:1, variant_id:'v1', status:'AVAILABLE', max_usage:1, used_count:0, fifo_order:1n, natural_key:'k1' }],
  orders: [
    { id:1, invoice:'A', product_code:'C', buyer_phone:'1', product:{ delivery_mode:'sharing' }, delivery_mode:'USERPASS' },
    { id:2, invoice:'B', product_code:'C', buyer_phone:'2', product:{ delivery_mode:'sharing' }, delivery_mode:'USERPASS' },
  ],
  messages: [],
};

require.cache[dbPath] = { exports: {
  $transaction: async (fn) => fn({
    accounts: {
      update: async ({ where, data }) => {
        const acc = store.accounts.find(a=>a.id===where.id);
        if(!acc) throw new Error('Stok habis');
        Object.assign(acc,data); return acc;
      },
    },
    orders: {
      findUnique: async ({ where }) => store.orders.find(o=>o.id===where.id),
      update: async ({ where, data }) => { const o=store.orders.find(x=>x.id===where.id); Object.assign(o,data); return o; },
    },
    $queryRaw: async (strings, variantId) => {
      return store.accounts.filter(a=>a.variant_id===variantId && a.status==='AVAILABLE' && a.used_count<a.max_usage);
    },
  }),
  orders: {
    findUnique: async ({ where }) => store.orders.find(o=>o.invoice===where.invoice),
    update: async ({ where, data }) => {
      const o = store.orders.find(x=> x.invoice===where.invoice || x.id===where.id);
      Object.assign(o, data); return o;
    },
  },
  tasks: { create: async ()=>{} },
} };

require.cache[eventPath] = { exports: { addEvent: async () => {} } };
require.cache[waPath] = { exports: { sendText: async (to,text)=>{ store.messages.push({to,text}); } } };
require.cache[variantPath] = { exports:{ resolveVariantByCode: async () => ({ variant_id:'v1', product:'P', duration_days:30, code:'C', active:true }) } };

const { confirmPaid } = require('../src/services/orders');

test('only one confirmation succeeds reserving stock', async () => {
  const a = await confirmPaid('A');
  const b = await confirmPaid('B');
  const failures = [a,b].filter(x=>!x.ok);
  assert.strictEqual(failures.length,1);
  assert.ok(store.messages[0].text.includes('Stok'));
});
