// src/db/migrate/seed.js — simple seed
const prisma = require('../../db/client');

async function main() {
  // Create sample product
  await prisma.products.upsert({
    where: { code: 'SAMPLE' },
    create: {
      code: 'SAMPLE',
      name: 'Sample Product',
      delivery_mode: 'privat_invite',
      duration_months: 12,
      price_cents: 9900,
      requires_email: false,
    },
    update: {},
  });

  console.log('Seed complete');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
