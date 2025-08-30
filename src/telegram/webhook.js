const express = require('express');
const router = express.Router();
const { ADMIN_CHAT_ID, WEBHOOK_SECRET_PATH } = require('../config/env');
const { confirmPaid, rejectOrder } = require('../services/orders');
const { addEvent } = require('../services/events');
const prisma = require('../db/client');
const { sendMessage, editMessageText, answerCallbackQuery } = require('../services/telegram');
const { formatTs } = require('../utils/time');

router.post('/'), async (req, res) => {
  // secret validated via mount path in server.js
  const update = req.body; console.log('TG webhook update:', JSON.stringify(update));
  const msg = update.message || update.edited_message || update.callback_query?.message;
  const chatId = msg?.chat?.id;
  if (!chatId || String(chatId) !== String(ADMIN_CHAT_ID)) return res.sendStatus(200);

  if (update.message || update.edited_message) {
    const text = msg.text || '';
    if (text === '/start' || text === '/admin') {
      await sendMessage(chatId, 'Menu admin', {
        reply_markup: { inline_keyboard: [[{ text: 'Ping', callback_data: `PING|${Date.now()}` }]] },
      });
    } else if (text === '/status') {
      const uptime = Math.floor(process.uptime());
      await sendMessage(
        chatId,
        `Bot admin siap ✅\nWebhook: /webhook/telegram/${WEBHOOK_SECRET_PATH}\nUptime: ${uptime}s`
      );
    } else if (text === '/help') {
      await sendMessage(chatId, '/start - menu\n/status - status bot\n/help - bantuan');
    }
  }

  if (update.callback_query) {
    const data = update.callback_query.data || '';
    if (data.startsWith('PING')) {
      await answerCallbackQuery(update.callback_query.id, 'PONG ✅');
    } else if (data.startsWith('CONFIRM|')) {
      const id = Number(data.split('|')[1]);
      await answerCallbackQuery(update.callback_query.id, '✅ Dikonfirmasi');
      if (id) {
        const order = await confirmPaid(id);
        const product = await prisma.products.findUnique({
          where: { code: order.product_code },
          select: { name: true },
        });
        const amount = (order.amount_cents / 100).toLocaleString('id-ID');
        const timestamp = formatTs();
        const text =
          `✅ Order ${order.invoice} sudah dikonfirmasi oleh admin.\n` +
          `Produk: ${product?.name} x${order.qty} • Total: Rp${amount}\n` +
          `Waktu: ${timestamp}`;
        try {
          await editMessageText(chatId, msg.message_id, text);
        } catch (error) {
          await addEvent(
            order.id,
            'TELEGRAM_EDIT_FAIL',
            `Gagal edit pesan order ${order.invoice}: ${error.message}`
          );
        }
      }
    } else if (data.startsWith('REJECT|')) {
      const id = Number(data.split('|')[1]);
      await answerCallbackQuery(update.callback_query.id, '❌ Ditolak');
      if (id) {
        const order = await rejectOrder(id, 'Admin reject via Telegram');
        const product = await prisma.products.findUnique({
          where: { code: order.product_code },
          select: { name: true },
        });
        const amount = (order.amount_cents / 100).toLocaleString('id-ID');
        const timestamp = formatTs();
        const text =
          `❌ Order ${order.invoice} ditolak oleh admin.\n` +
          `Produk: ${product?.name} x${order.qty} • Total: Rp${amount}\n` +
          `Waktu: ${timestamp}`;
        try {
          await editMessageText(chatId, msg.message_id, text);
        } catch (error) {
          await addEvent(
            order.id,
            'TELEGRAM_EDIT_FAIL',
            `Gagal edit pesan order ${order.invoice}: ${error.message}`
          );
        }
      }
    } else {
      await answerCallbackQuery(update.callback_query.id, '');
    }
  }

  res.sendStatus(200);
});

module.exports = router;
