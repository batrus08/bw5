const prisma = require('../db/client');

async function runGuard() {
  const queries = [
    `ALTER TABLE IF NOT EXISTS accounts ADD COLUMN IF NOT EXISTS account_group_id TEXT`,
    `ALTER TABLE IF NOT EXISTS accounts ADD COLUMN IF NOT EXISTS profile_index INTEGER`,
    `ALTER TABLE IF NOT EXISTS accounts ADD COLUMN IF NOT EXISTS profile_name TEXT`,
    `ALTER TABLE IF NOT EXISTS accounts ADD COLUMN IF NOT EXISTS password TEXT`,
    `ALTER TABLE IF NOT EXISTS accounts ADD COLUMN IF NOT EXISTS invite_channel TEXT`,
    `ALTER TABLE IF NOT EXISTS accounts ADD COLUMN IF NOT EXISTS tnc_blob TEXT`,
    `ALTER TABLE IF NOT EXISTS accounts ADD COLUMN IF NOT EXISTS notes TEXT`,
    `ALTER TABLE IF NOT EXISTS orders ADD COLUMN IF NOT EXISTS metadata JSONB`,
    `ALTER TABLE IF NOT EXISTS orders ADD COLUMN IF NOT EXISTS synced_to_sheet BOOLEAN NOT NULL DEFAULT FALSE`,
  ];
  for (const q of queries) {
    try {
      await prisma.$executeRawUnsafe(q);
    } catch (e) {
      console.error('[preflight] guard error', e.message);
    }
  }
}

module.exports = { runGuard };
