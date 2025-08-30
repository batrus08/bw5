// src/telegram/webhook.js
const express = require('express');
const router = express.Router();
const { ADMIN_CHAT_ID } = require('../config/env');
const { confirmPaid, rejectOrder } = require('../services/orders');
const { addEvent } = require('../services/events');
const { sendMessage, answerCallbackQuery } = require('../services/telegram');
const { formatTs } = require('../utils/time');

router.get('/', (_req, res) => res.sendStatus(200));

router.post('/', async (req, res) => {
  try {
    const update = req.body;
    console.log('TG webhook update:', JSON.stringify(update));

    const msg = update.message || update.edited_message || update.callback_query?.message;
    const chatId = msg?.chat?.id;

    // Only allow ADMIN_CHAT_ID (if configured)
    if (!chatId || String(chatId) !== String(ADMIN_CHAT_ID)) {
      return res.sendStatus(200);
    }

    if (update.message?.text) {
      const text = update.message.text.trim();

      if (text.startsWith('/start')) {
        await sendMessage(chatId, `Bot is online. ${formatTs()}`);
      } else if (text.startsWith('/confirm ')) {
        const invoice = text.split(' ')[1];
        const r = await confirmPaid(invoice);
        await sendMessage(chatId, r.ok ? `✅ Order ${invoice} confirmed.` : `❌ ${r.error}`);
      } else if (text.startsWith('/reject ')) {
        const invoice = text.split(' ')[1];
        const r = await rejectOrder(invoice, 'Rejected via bot');
        await sendMessage(chatId, r.ok ? `🚫 Order ${invoice} rejected.` : `❌ ${r.error}`);
      } else {
        await sendMessage(chatId, `Echo: ${text}`);
      }
    } else if (update.callback_query) {
      await answerCallbackQuery(update.callback_query.id, '');
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('telegram webhook error:', err && err.message ? err.message : err);
    try { await addEvent(null, 'TELEGRAM_EDIT_FAIL', `Error: ${err.message}`); } catch {}
    res.sendStatus(200);
  }
});

module.exports = router;
