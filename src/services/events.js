// src/services/events.js
const prisma = require('../db/client');

async function addEvent(orderId, kind, message) {
  return prisma.events.create({
    data: {
      order_id: orderId,
      kind,
      message,
    },
  });
}

module.exports = { addEvent };
