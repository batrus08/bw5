const assert = require('node:assert');
const { test } = require('node:test');

const dbPath = require.resolve('../src/db/client');
const eventPath = require.resolve('../src/services/events');
const waPath = require.resolve('../src/services/wa');

const store = {
  accounts: [{ id:1, product_code:'P', status:'AVAILABLE' }],
  orders: [
    { id:1, invoice:'A', product_code:'P', buyer_phone:'1', product:{ delivery_mode:'sharing' } },
    { id:2, invoice:'B', product_code:'P', buyer_phone:'2', product:{ delivery_mode:'sharing' } },
  ],
  messages: [],
};

require.cache[dbPath] = { exports: {
  $transaction: async (fn) => fn({
    accounts: {
      update: async ({ where, data }) => {
        const acc = store.accounts.find(a=>a.id===where.id && a.status===where.status);
        if(!acc) throw new Error('Stok habis');
        Object.assign(acc,data); return acc;
      },
    },
    orders: {
      findUnique: async ({ where }) => store.orders.find(o=>o.id===where.id),
      update: async ({ where, data }) => { const o=store.orders.find(x=>x.id===where.id); Object.assign(o,data); return o; },
    },
    $queryRaw: async () => [store.accounts.find(a=>a.status==='AVAILABLE')].filter(Boolean),
  }),
  orders: {
    findUnique: async ({ where }) => store.orders.find(o=>o.invoice===where.invoice),
    update: async ({ where, data }) => { const o=store.orders.find(x=>x.invoice===where.invoice); Object.assign(o,data); return o; },
  },
  tasks: { create: async ()=>{} },
} };

require.cache[eventPath] = { exports: { addEvent: async () => {} } };
require.cache[waPath] = { exports: { sendText: async (to,text)=>{ store.messages.push({to,text}); } } };

const { confirmPaid } = require('../src/services/orders');

test('only one confirmation succeeds reserving stock', async () => {
  const [a,b] = await Promise.all([confirmPaid('A'), confirmPaid('B')]);
  const failures = [a,b].filter(x=>!x.ok);
  assert.strictEqual(failures.length,1);
  assert.ok(store.messages[0].text.includes('Stok'));
});
