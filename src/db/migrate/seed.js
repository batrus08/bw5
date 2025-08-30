const prisma = require('../client');
const { encrypt } = require('../../security/crypto');

async function main() {
  await prisma.products.upsert({
    where: { code: 'CHATGPT_PRIV_INV_1M' },
    update: {},
    create: {
      code: 'CHATGPT_PRIV_INV_1M',
      name: 'ChatGPT Private Invite 1M',
      delivery_mode: 'privat_invite',
      duration_months: 1,
      price_cents: 10000,
      requires_email: true,
    },
  });

  const nonInvite = await prisma.products.upsert({
    where: { code: 'CHATGPT_PRIV_NONINV_1M' },
    update: {},
    create: {
      code: 'CHATGPT_PRIV_NONINV_1M',
      name: 'ChatGPT Private Non Invite 1M',
      delivery_mode: 'privat_noninvite',
      duration_months: 1,
      price_cents: 9000,
      requires_email: false,
    },
  });

  await prisma.accounts.upsert({
    where: { username: 'sample.user@example.com' },
    update: {},
    create: {
      product_code: nonInvite.code,
      username: 'sample.user@example.com',
      password_enc: encrypt('Password#123'),
      otp_secret_enc: encrypt('JBSWY3DPEHPK3PXP'),
      status: 'AVAILABLE',
    },
  });

  console.log('seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
