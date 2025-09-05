const assert = require('node:assert');
const { test } = require('node:test');

const routePath = require.resolve('../src/routes/sheet-sync');
const dbPath = require.resolve('../src/db/client');
const variantPath = require.resolve('../src/services/variants');
const eventPath = require.resolve('../src/services/events');

const store = { accounts: [] };

require.cache[variantPath] = { exports:{ resolveVariantByCode: async (code) => ({ variant_id:'v1', product:'P' , code, duration_days:30, active:true }) } };
require.cache[eventPath] = { exports:{ addEvent: async ()=>{} } };

require.cache[dbPath] = { exports: { accounts:{
  upsert: async ({ where, create, update }) => {
    const idx = store.accounts.findIndex(a=>a.natural_key===where.natural_key);
    if(idx===-1){ const acc = Object.assign({ id:store.accounts.length+1 }, create); store.accounts.push(acc); return acc; }
    const acc = store.accounts[idx];
    Object.assign(acc, update);
    return acc;
  }
} } };

const { upsertAccountFromSheet } = require(routePath);

const payload = { code:'C', username:'u', password:'p', max_usage:2, profile_index:1 };

test('upsertAccountFromSheet is idempotent', async () => {
  await upsertAccountFromSheet(payload);
  const first = store.accounts[0];
  await upsertAccountFromSheet(payload);
  assert.strictEqual(store.accounts.length,1);
  assert.strictEqual(store.accounts[0].natural_key, first.natural_key);
});

test('deleted flag disables account', async () => {
  await upsertAccountFromSheet(Object.assign({}, payload, { deleted:true, username:'u2', profile_index:2 }));
  const acc = store.accounts.find(a=>a.profile_index===2);
  assert.strictEqual(acc.status,'DISABLED');
});
