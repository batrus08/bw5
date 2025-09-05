const assert = require('node:assert');
const { test } = require('node:test');

process.env.TELEGRAM_BOT_TOKEN='t';
process.env.ADMIN_CHAT_ID='1';
process.env.WEBHOOK_SECRET_PATH='w';
process.env.DATABASE_URL='postgres://';
process.env.ENCRYPTION_KEY=Buffer.alloc(32).toString('base64');

const dbPath = require.resolve('../src/db/client');

require.cache[dbPath] = { exports:{ $queryRaw: async () => [ { id:1, invoice:'I', product_code:'P', expires_at:new Date() } ] } };

const { getExpiryReminderCandidates } = require('../src/services/worker');

test('getExpiryReminderCandidates returns rows', async () => {
  const list = await getExpiryReminderCandidates();
  assert.strictEqual(list.length,1);
  assert.strictEqual(list[0].invoice,'I');
});
