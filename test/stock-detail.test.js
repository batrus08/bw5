const assert = require('node:assert');
const { test } = require('node:test');

// Existing behaviour: stock detail should not leak password

test('getStockDetail masks password', async () => {
  const dbPath = require.resolve('../src/db/client');
  require.cache[dbPath] = { exports:{ $queryRaw: async (strings,...vals) => {
    const sql = strings.join('?');
    assert.ok(!/password/i.test(sql));
    return [{ id:1, fifo_order:0, used_count:0, max_usage:1, status:'AVAILABLE' }];
  } } };
  delete require.cache[require.resolve('../src/services/stock')];
  const { getStockDetail } = require('../src/services/stock');
  const rows = await getStockDetail('X');
  assert.deepStrictEqual(rows, [{ id:1, fifo_order:0, used_count:0, max_usage:1, status:'AVAILABLE' }]);
  assert.ok(!('password' in rows[0]));
});

// New behaviour: sheet sync upsert and soft delete should update summary and publish

test('sheet-sync upsert & soft-delete updates stock summary and publishes', async () => {
  const dbPath = require.resolve('../src/db/client');
  const variantsPath = require.resolve('../src/services/variants');
  const eventsPath = require.resolve('../src/services/events');
  const stockPath = require.resolve('../src/services/stock');

  const store = {
    variants: [{ variant_id:'V1', code:'VAR1', product:'P1' }],
    accounts: [],
  };
  let published = 0;

  require.cache[dbPath] = { exports:{
    product_variants:{
      findUnique: async ({ where }) => store.variants.find(v=>v.code===where.code) || null,
    },
    accounts:{
      findUnique: async ({ where }) => store.accounts.find(a=>a.natural_key===where.natural_key) || null,
      upsert: async ({ where, create, update }) => {
        const idx = store.accounts.findIndex(a=>a.natural_key===where.natural_key);
        if(idx>=0){
          store.accounts[idx] = Object.assign(store.accounts[idx], update);
          return store.accounts[idx];
        }
        const acc = Object.assign({ id:`A${store.accounts.length+1}`, used_count:0 }, create);
        store.accounts.push(acc);
        return acc;
      }
    },
    $queryRaw: async () => {
      const accs = store.accounts.filter(a=>a.status==='AVAILABLE' && !a.disabled && !a.deleted_at);
      const units = accs.filter(a=>a.used_count < a.max_usage).length;
      const capacity = accs.reduce((s,a)=>s + Math.max(0,a.max_usage - a.used_count),0);
      return [{ code:'VAR1', units, capacity }];
    }
  } };
  require.cache[variantsPath] = { exports:{ resolveVariantByCode: async code => {
    const v = store.variants.find(v=>v.code===code);
    if(!v) throw new Error('UNKNOWN_VARIANT');
    return v;
  } } };
  require.cache[eventsPath] = { exports:{ addEvent: async ()=>{} } };
  require.cache[stockPath] = { exports:{
    publishStockSummary: async () => { published++; },
    getStockSummary: async () => require.cache[dbPath].exports.$queryRaw(),
  } };
  delete require.cache[require.resolve('../src/routes/sheet-sync.js')];
  const { upsertAccountFromSheet } = require('../src/routes/sheet-sync');
  const stock = require(stockPath);

  await upsertAccountFromSheet({ code:'VAR1', username:'u', password:'p', max_usage:2 });
  assert.strictEqual(published,1);
  let rows = await stock.getStockSummary();
  assert.strictEqual(rows[0].units,1);
  assert.strictEqual(rows[0].capacity,2);

  await upsertAccountFromSheet({ code:'VAR1', username:'u', password:'p', __op:'DELETE' });
  assert.strictEqual(published,2);
  rows = await stock.getStockSummary();
  assert.strictEqual(rows[0].units,0);
  assert.strictEqual(rows[0].capacity,0);
});
