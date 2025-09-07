
const express = require('express');
const router = express.Router();
const prisma = require('../db/client');
const { ADMIN_CHAT_ID } = require('../config/env');
const { confirmPaid, rejectOrder, markInvited, resume, skipStage, cancel } = require('../services/orders');
const { getStockSummary, getStockDetail } = require('../services/stock');
const { sendMessage, answerCallbackQuery, buildOrderKeyboard, buildNumberGrid, buildGrid, editMessageText } = require('../services/telegram');
const { sendImageByUrl } = require('../services/wa');

router.get('/', (_req, res) => res.sendStatus(200));

router.post('/', async (req, res) => {
  try{
    const update = req.body;
    const msg = update.message || update.edited_message || update.callback_query?.message;
    const chatId = msg?.chat?.id;
    if(!chatId || String(chatId) !== String(ADMIN_CHAT_ID)) return res.sendStatus(200);

    if(update.callback_query?.data){
      const data = update.callback_query.data;
      if(data.startsWith('pick:')){
        const picked = data.split(':')[1];
        await answerCallbackQuery(update.callback_query.id, `Pilih: ${picked}`);
        await sendMessage(chatId, `✅ Kamu memilih ${picked}`);
      } else if (data.startsWith('sel:')) {
        const code = data.split(':')[1];
        await answerCallbackQuery(update.callback_query.id);
        await sendMessage(chatId, `📦 Produk dipilih: <b>${code}</b>`, { parse_mode:'HTML' });
      } else if (data.startsWith('confirm:')) {
        const invoice = data.split(':')[1];
        const r = await confirmPaid(invoice);
        await answerCallbackQuery(update.callback_query.id, r.ok ? '✅ Confirmed' : `❌ ${r.error}`);
        await sendMessage(chatId, r.ok ? `✅ Confirmed ${invoice}` : `❌ ${r.error}`);
      } else if (data.startsWith('reject:')) {
        const invoice = data.split(':')[1];
        const r = await rejectOrder(invoice);
        await answerCallbackQuery(update.callback_query.id, r.ok ? '❌ Rejected' : `❌ ${r.error}`);
        await sendMessage(chatId, r.ok ? `❌ Rejected ${invoice}` : `❌ ${r.error}`);
      } else if (data.startsWith('invited:')) {
        const invoice = data.split(':')[1];
        const r = await markInvited(invoice);
        await answerCallbackQuery(update.callback_query.id, r.ok ? '✅ Marked invited' : `❌ ${r.error}`);
        await sendMessage(chatId, r.ok ? `✅ Marked invited ${invoice}` : `❌ ${r.error}`);
      } else if (data.startsWith('detail:')) {
        const invoice = data.split(':')[1];
        const order = await prisma.orders.findUnique({ where:{ invoice }, include:{ product:true, variant:true } });
        await answerCallbackQuery(update.callback_query.id);
        if(!order){
          await sendMessage(chatId, `❌ Order ${invoice} not found`);
        } else {
          const amount = (order.amount_cents/100).toLocaleString('id-ID');
          const summary = `#${order.invoice} \u2022 ${order.product_code}/${order.variant?.code||'-'}\nQty ${order.qty} \u2022 Rp${amount}\nStatus: ${order.status}`;
          await sendMessage(chatId, summary);
        }
      } else if (data.startsWith('qris:')) {
        const invoice = data.split(':')[1];
        const order = await prisma.orders.findUnique({ where:{ invoice }, include:{ product:true, variant:true } });
        if(order){
          const key = order.variant?.qris_key || order.product.default_qris_key;
          const asset = key ? await prisma.qris_assets.findUnique({ where:{ key } }) : null;
          const caption = `Invoice: ${order.invoice}\nTotal: Rp ${(order.amount_cents)/100}`;
          if(asset?.image_url){
            await sendImageByUrl(order.buyer_phone, asset.image_url, caption);
            await answerCallbackQuery(update.callback_query.id, '🔁 QRIS sent');
            await sendMessage(chatId, `QRIS resent to ${order.buyer_phone}`);
          } else {
            await answerCallbackQuery(update.callback_query.id, '❌ No QRIS');
          }
        } else {
          await answerCallbackQuery(update.callback_query.id, '❌ Not found');
        }
      } else if (data.startsWith('otp:')) {
        const invoice = data.split(':')[1];
        const order = await prisma.orders.findUnique({ where:{ invoice } });
        if(order){
          await prisma.tasks.create({ data:{ order_id: order.id, kind:'SEND_OTP_MANUAL' } }).catch(()=>{});
          await answerCallbackQuery(update.callback_query.id, '🔐 OTP requested');
          await sendMessage(chatId, `🔐 OTP request queued for ${invoice}`);
        } else {
          await answerCallbackQuery(update.callback_query.id, '❌ Not found');
        }
      } else if (data.startsWith('HELP_RESUME:')) {
        const id = BigInt(data.split(':')[1]);
        await resume(id);
        await answerCallbackQuery(update.callback_query.id, '▶️ Resumed');
        await sendMessage(chatId, `▶️ Resume order ${id}`);
      } else if (data.startsWith('HELP_SKIP:')) {
        const [, orderId, nextStatus] = data.split(':');
        await skipStage(BigInt(orderId), nextStatus);
        await answerCallbackQuery(update.callback_query.id, '⏭ Skipped');
        await sendMessage(chatId, `⏭ Skip ${orderId} to ${nextStatus}`);
      } else if (data.startsWith('HELP_CANCEL:')) {
        const id = BigInt(data.split(':')[1]);
        await cancel(id);
        await answerCallbackQuery(update.callback_query.id, '❌ Cancelled');
        await sendMessage(chatId, `❌ Cancelled ${id}`);
      } else if (data.startsWith('STOCK_DETAIL:')) {
        const code = data.split(':')[1];
        const detail = await getStockDetail(code);
        const lines = detail.map(a=>`${a.id} ${a.fifo_order} ${a.used_count}/${a.max_usage} ${a.status}`).join('\n') || 'empty';
        await answerCallbackQuery(update.callback_query.id);
        await sendMessage(chatId, `<b>${code}</b>\n${lines}`, { parse_mode:'HTML' });
      } else if (data.startsWith('resend:')) {
        const invoice = data.split(':')[1];
        const order = await prisma.orders.findUnique({ where:{ invoice } });
        if(order){
          await prisma.tasks.create({ data:{ order_id: order.id, kind:'RESEND_INVITE' } });
          await answerCallbackQuery(update.callback_query.id, '🔁 Resend queued');
          await sendMessage(chatId, `🔁 Resend task queued for ${invoice}`);
        } else {
          await answerCallbackQuery(update.callback_query.id, '❌ Not found');
          await sendMessage(chatId, `❌ Order ${invoice} not found`);
        }
      } else if (data.startsWith('ADM:PREAPPROVE:OK:')) {
        const invoice = data.split(':')[3];
        const base = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT||3000}`;
        try {
          await fetch(`${base}/preapprovals/${invoice}/approve`, { method:'POST', headers:{'Content-Type':'application/json'} });
          await answerCallbackQuery(update.callback_query.id, '✅ Approved');
          const newText = `${msg.text}\n✅ Disetujui`;
          await editMessageText(chatId, msg.message_id, newText, { parse_mode: 'HTML' });
        } catch (e) {
          await answerCallbackQuery(update.callback_query.id, '❌ Fail');
        }
      } else if (data.startsWith('ADM:PREAPPROVE:NO:')) {
        const invoice = data.split(':')[3];
        const base = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT||3000}`;
        try {
          await fetch(`${base}/preapprovals/${invoice}/reject`, { method:'POST', headers:{'Content-Type':'application/json'} });
          await answerCallbackQuery(update.callback_query.id, '❌ Rejected');
          const newText = `${msg.text}\n❌ Ditolak`;
          await editMessageText(chatId, msg.message_id, newText, { parse_mode: 'HTML' });
        } catch (e) {
          await answerCallbackQuery(update.callback_query.id, '❌ Fail');
        }
      }
      return res.sendStatus(200);
    }

    if(update.message?.text){
      const text = update.message.text.trim();
      if(text === '/start'){ await sendMessage(chatId,'Admin panel online. Perintah: /id, /on, /off, /sheet_sync, /grid, /produk'); }
      else if(text === '/id'){ await sendMessage(chatId, `Chat ID: <code>${chatId}</code>`, { parse_mode:'HTML' }); }
      else if(text === '/on'){ await prisma.settings.upsert({ where:{ key:'bot_enabled' }, update:{ value:'true' }, create:{ key:'bot_enabled', value:'true' } }); await sendMessage(chatId,'✅ Bot ON'); }
      else if(text === '/off'){ await prisma.settings.upsert({ where:{ key:'bot_enabled' }, update:{ value:'false' }, create:{ key:'bot_enabled', value:'false' } }); await sendMessage(chatId,'⛔️ Bot OFF'); }
      else if(text === '/sheet_sync'){ const { syncAccountsFromCSV } = require('../services/sheet'); const r = await syncAccountsFromCSV(); await sendMessage(chatId, r.ok?`Sheet sync OK (upserts: ${r.upserts})`:`Sheet sync fail: ${r.error||r.reason}`); }
      else if(text.startsWith('/confirm ')){ const inv=text.split(' ')[1]; const r=await confirmPaid(inv); await sendMessage(chatId, r.ok?`✅ Confirmed ${inv}`:`❌ ${r.error}`); }
      else if(text === '/stock' || text.toLowerCase()==='cek stok'){ const sum=await getStockSummary(); const lines=sum.map(s=>`${s.code}: ${s.units}/${s.capacity}`).join('\n'); const kb={ reply_markup:{ inline_keyboard: sum.map(s=>[{ text:s.code, callback_data:'STOCK_DETAIL:'+s.code }]) } }; await sendMessage(chatId, lines||'empty', kb); }
      else if(text.startsWith('/reject ')){ const inv=text.split(' ')[1]; const r=await rejectOrder(inv); await sendMessage(chatId, r.ok?`❌ Rejected ${inv}`:`❌ ${r.error}`); }
      else if(text === '/grid'){ const kb = buildNumberGrid(24,6,'pick'); await sendMessage(chatId,'Pilih nomor:', kb); }
      else if(text === '/produk'){ const items = await prisma.products.findMany({ where:{ is_active:true }, orderBy:{ code:'asc' } }); const kb = buildGrid(items, 3, it=>({ text: it.code, data: it.code })); await sendMessage(chatId, 'Pilih produk:', kb); }
      else { await sendMessage(chatId,'Unknown command'); }
    }
    res.sendStatus(200);
  }catch(e){ console.error('TG error', e); res.sendStatus(200); }
});

module.exports = router;
