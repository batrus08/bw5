const express = require('express');
const router = express.Router();
const prisma = require('../db/client');
const { ADMIN_CHAT_ID } = require('../config/env');
const { confirmPaid, rejectOrder, markInvited } = require('../services/orders');
const { sendMessage, answerCallbackQuery, buildOrderKeyboard, notifyAdmin } = require('../services/telegram');

router.get('/', (_req, res) => res.sendStatus(200));

router.post('/', async (req, res) => {
  try {
    const update = req.body;
    console.log('TG webhook update:', JSON.stringify(update));

    const msg = update.message || update.edited_message || update.callback_query?.message;
    const chatId = msg?.chat?.id;

    if (!chatId || String(chatId) !== String(ADMIN_CHAT_ID)) {
      return res.sendStatus(200);
    }

    // callback buttons
    if (update.callback_query?.data) {
      const data = update.callback_query.data;
      if (data.startsWith('confirm:')) {
        const invoice = data.split(':')[1];
        const r = await confirmPaid(invoice);
        await sendMessage(chatId, r.ok ? `✅ Confirmed ${invoice}` : `❌ ${r.error}`);
      } else if (data.startsWith('reject:')) {
        const invoice = data.split(':')[1];
        const r = await rejectOrder(invoice);
        await sendMessage(chatId, r.ok ? `❌ Rejected ${invoice}` : `❌ ${r.error}`);
      } else if (data.startsWith('invited:')) {
        const invoice = data.split(':')[1];
        const r = await markInvited(invoice);
        await sendMessage(chatId, r.ok ? `✅ Marked invited ${invoice}` : `❌ ${r.error}`);
      } else if (data.startsWith('reproof:')) {
        const invoice = data.split(':')[1];
        await sendMessage(chatId, `🔁 Request new proof for ${invoice}`);
      } else if (data.startsWith('resend:')) {
        const invoice = data.split(':')[1];
        await prisma.tasks.create({ data:{ order_id: (await prisma.orders.findUnique({ where:{ invoice } })).id, kind:'RESEND_INVITE' } });
        await sendMessage(chatId, `🔁 Resend task queued for ${invoice}`);
      }
      if (update.callback_query?.id) await answerCallbackQuery(update.callback_query.id, '');
      return res.sendStatus(200);
    }

    if (update.message?.text) {
      const text = update.message.text.trim();
      if (text === '/start') {
        await sendMessage(chatId, 'Admin panel online.');
      } else if (text === '/on') {
        await prisma.settings.upsert({ where:{ key:'bot_enabled' }, update:{ value:'true' }, create:{ key:'bot_enabled', value:'true' } });
        await sendMessage(chatId, '✅ Bot ON');
      } else if (text === '/off') {
        await prisma.settings.upsert({ where:{ key:'bot_enabled' }, update:{ value:'false' }, create:{ key:'bot_enabled', value:'false' } });
        await sendMessage(chatId, '⛔️ Bot OFF');
      } else if (text.startsWith('/confirm ')) {
        const invoice = text.split(' ')[1];
        const r = await confirmPaid(invoice);
        await sendMessage(chatId, r.ok ? `✅ Confirmed ${invoice}` : `❌ ${r.error}`);
      } else if (text.startsWith('/reject ')) {
        const invoice = text.split(' ')[1];
        const r = await rejectOrder(invoice);
        await sendMessage(chatId, r.ok ? `❌ Rejected ${invoice}` : `❌ ${r.error}`);
      } else if (text === '/sheet_sync') {
        // Setting last sync time will be recorded by events in sheet service
        const { syncAccountsFromCSV } = require('../services/sheet');
        const r = await syncAccountsFromCSV();
        await sendMessage(chatId, r.ok ? `Sheet sync OK (upserts: ${r.upserts})` : `Sheet sync fail: ${r.error||r.reason}`);
      } else {
        await sendMessage(chatId, 'Unknown command');
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('telegram webhook error:', err && err.message ? err.message : err);
    res.sendStatus(200);
  }
});

module.exports = router;
