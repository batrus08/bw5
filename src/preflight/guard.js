const prisma = require('../db/client');

async function runGuard() {
  const queries = [
    `ALTER TABLE IF NOT EXISTS accounts ADD COLUMN IF NOT EXISTS otp_seed TEXT`,
    `ALTER TABLE IF NOT EXISTS accounts ADD COLUMN IF NOT EXISTS invite_api TEXT`,
    `ALTER TABLE IF NOT EXISTS accounts ADD COLUMN IF NOT EXISTS variant_type TEXT`,
    `ALTER TABLE IF NOT EXISTS accounts ADD COLUMN IF NOT EXISTS variant_duration INTEGER`,
    `ALTER TABLE IF NOT EXISTS accounts ADD COLUMN IF NOT EXISTS price_override INTEGER`,
    `ALTER TABLE IF NOT EXISTS accounts ADD COLUMN IF NOT EXISTS tnc TEXT`,
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
