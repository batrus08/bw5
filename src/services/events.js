const prisma = require('../db/client');

async function addEvent(orderId, kind, message) {
  await prisma.events.create({ data: { order_id: orderId, kind, message } });
}

module.exports = { addEvent };
