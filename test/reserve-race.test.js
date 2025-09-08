const assert = require('node:assert');
const { test } = require('node:test');

const dbPath = require.resolve('../src/db/client');
const eventPath = require.resolve('../src/services/events');

const store = {
  accounts: [{ id:1, variant_id:'v1', product_code:'C', status:'AVAILABLE', max_usage:1, used_count:0, fifo_order:1n, natural_key:'k1' }],
  orders: [
    { id:1, product_code:'C', metadata:{} },
    { id:2, product_code:'C', metadata:{} },
  ],
  locks: new Set(),
};

require.cache[dbPath] = { exports: {
  $transaction: async (fn) => {
    const tx = {
      orders: {
        findUnique: async ({ where }) => store.orders.find(o=>o.id===where.id),
        update: async ({ where, data }) => { const o = store.orders.find(x=>x.id===where.id); Object.assign(o, data); return o; },
      },
      accounts: {
        update: async ({ where, data }) => {
          await new Promise(r=>setTimeout(r,10));
          const a = store.accounts.find(acc=>acc.id===where.id);
          if(!a || a.status !== 'AVAILABLE') throw new Error('Stok habis');
          Object.assign(a, data); return a;
        },
      },
      $queryRaw: async (strings, ...params) => {
        const sql = strings.join('');
        if(sql.includes('FROM orders')){
          const id = params[0];
          if(store.locks.has(id)) await new Promise(r=>setTimeout(r,50));
          else store.locks.add(id);
          return [{ id }];
        }
        const [variantId, _v2, prodCode] = params;
        await new Promise(r=>setTimeout(r,20));
        return store.accounts.filter(a =>
          (a.variant_id===variantId || (!variantId && a.product_code===prodCode)) &&
          a.status==='AVAILABLE' && a.used_count < a.max_usage);
      },
    };
    const result = await fn(tx);
    store.locks.clear();
    return result;
  },
} };

require.cache[eventPath] = { exports:{ addEvent: async () => {} } };

const { reserveAccount } = require('../src/services/orders');

test('parallel reserveAccount only uses one account', async () => {
  const [a,b] = await Promise.allSettled([reserveAccount(1,'v1'), reserveAccount(2,'v1')]);
  const success = [a,b].filter(x=>x.status==='fulfilled');
  const failed = [a,b].filter(x=>x.status==='rejected');
  assert.strictEqual(success.length,1);
  assert.strictEqual(failed.length,1);
  assert.strictEqual(store.accounts[0].used_count,1);
});
