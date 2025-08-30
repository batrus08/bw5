const prisma = require('../db/client');
const { addEvent } = require('./events');

async function deliverOrder(order) {
  const product = await prisma.products.findUnique({
    where: { code: order.product_code },
    select: { delivery_mode: true },
  });
  if (!product) return 'no_product';

  if (['sharing', 'privat_noninvite'].includes(product.delivery_mode)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await prisma.$transaction(async (tx) => {
        const account = await tx.accounts.findFirst({
          where: { product_code: order.product_code, status: 'AVAILABLE' },
          orderBy: { id: 'asc' },
        });
        if (!account) return 'no_stock';
        const updated = await tx.accounts.updateMany({
          where: { id: account.id, status: 'AVAILABLE' },
          data: { status: 'RESERVED' },
        });
        if (updated.count !== 1) return false;
        await tx.orders.update({
          where: { id: order.id },
          data: { account_id: account.id },
        });
        await tx.accounts.update({
          where: { id: account.id },
          data: { status: 'DELIVERED' },
        });
        return true;
      });
      if (result === 'no_stock') {
        await addEvent(order.id, 'DELIVERY_NO_STOCK');
        return 'no_stock';
      }
      if (result === true) {
        await addEvent(order.id, 'DELIVERY_READY');
        return 'success';
      }
    }
    await addEvent(order.id, 'DELIVERY_RACE_FAIL');
    return 'race_fail';
  }

  if (['privat_invite', 'canva_invite'].includes(product.delivery_mode)) {
    await addEvent(order.id, 'INVITE_QUEUED');
    return 'queued';
  }

  await addEvent(order.id, 'DELIVERY_UNKNOWN_MODE', product.delivery_mode);
  return 'unknown';
}

module.exports = { deliverOrder };
