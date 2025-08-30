const express = require('express');
const crypto = require('crypto');
const prisma = require('../db/client');
const { WA_APP_SECRET, WA_VERIFY_TOKEN, RATE_LIMIT_WA_PER_MIN } = require('../config/env');
const { allow } = require('../utils/rateLimit');
const { addEvent } = require('../services/events');
const { sendText, sendInteractiveButtons, sendListMenu } = require('../services/wa');
const { notifyAdmin } = require('../services/telegram');
const { createOrder, setPayAck } = require('../services/orders');

const router = express.Router();

// verification
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) return res.send(challenge);
  return res.sendStatus(403);
});

router.post('/', async (req, res) => {
  try {
    // signature verify if set
    const sig = req.get('X-Hub-Signature-256');
    if (WA_APP_SECRET && sig && req.rawBody) {
      const expected = 'sha256=' + crypto.createHmac('sha256', WA_APP_SECRET).update(req.rawBody).digest('hex');
      const valid = typeof sig === 'string' && sig.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      if (!valid) {
        console.error('WA webhook signature mismatch');
        await addEvent(null, 'WA_INVALID_SIGNATURE', 'bad signature', {}, 'SYSTEM', 'wa');
        return res.sendStatus(403);
      }
    }

    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
    const messages = entry?.messages || [];
    for (const m of messages) {
      const from = m.from; // phone
      if (!allow(`wa:${from}`, RATE_LIMIT_WA_PER_MIN)) {
        await addEvent(null, 'RATE_LIMITED', `wa user ${from}`, {}, 'SYSTEM', 'wa');
        continue;
      }

      if (m.type === 'text') {
        const t = (m.text?.body || '').trim().toLowerCase();
        if (t === 'menu' || t === 'halo' || t === 'hi' || t === 'order') {
          await sendInteractiveButtons(from, 'Pilih menu:', ['Order', 'Stok', 'FAQ', 'Harga', 'Chat Penjual']);
        } else if (t.startsWith('order ')) {
          // format: "order <code> <qty> [email(optional)]"
          const parts = t.split(/\s+/);
          const code = parts[1], qty = Number(parts[2]||1), email = parts[3]||null;
          const product = await prisma.products.findUnique({ where:{ code } });
          if (!product || !product.is_active) { await sendText(from, 'Produk tidak tersedia.'); continue; }
          const order = await createOrder({ buyer_phone: from, product_code: code, qty, amount_cents: product.price_cents * qty, email });
          await sendText(from, `Order ${order.invoice}\nProduk: ${code}\nQty: ${qty}\nTotal: Rp ${(product.price_cents*qty)/100}\nSilakan bayar QRIS dan upload bukti. Deadline ${new Date(order.deadline_at).toLocaleTimeString()}`);
        } else {
          await sendText(from, 'Ketik: menu | order <kode> <qty> [email]');
        }
      } else if (m.type === 'image') {
        // treat as payment proof
        const order = await prisma.orders.findFirst({ where:{ buyer_phone: from, status:'PENDING_PAYMENT' }, orderBy:{ created_at:'desc' } });
        if (!order) { await sendText(from, 'Tidak ada order menunggu pembayaran.'); continue; }
        await prisma.orders.update({ where:{ id: order.id }, data:{ proof_id: m.image?.id || 'unknown', proof_mime: m.image?.mime_type || '' } });
        const r = await setPayAck(order.invoice);
        await sendText(from, 'Terima kasih! Bukti pembayaran diterima dan sedang diverifikasi admin.');
        // Notify admin
        const prod = await prisma.products.findUnique({ where:{ code: order.product_code } });
        const { sendMessage, buildOrderKeyboard } = require('../services/telegram');
        await sendMessage(process.env.ADMIN_CHAT_ID, `🧾 Bukti bayar masuk\nInvoice: <b>${order.invoice}</b>\nProduk: ${prod.name} (${prod.code})\nQty: ${order.qty}\nTotal: Rp ${(order.amount_cents)/100}`, 
          { parse_mode:'HTML', ...buildOrderKeyboard(order.invoice, prod.delivery_mode) });
      } else if (m.type === 'interactive') {
        const id = m.interactive?.button_reply?.id || m.interactive?.list_reply?.id || '';
        if (id.startsWith('b')) {
          const title = m.interactive?.button_reply?.title?.toLowerCase() || '';
          if (title === 'order') await sendText(from, 'Format: order <kode> <qty> [email]');
          else if (title === 'stok') await sendText(from, 'Ketik kode produk untuk cek stok.');
          else if (title === 'faq') await sendText(from, 'Tanya saja, kami bantu.');
          else if (title === 'harga') await sendText(from, 'Harga: ambil dari DB.');
          else await sendText(from, 'Hubungi penjual di Telegram.');
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('WA webhook error:', err && err.message ? err.message : err);
    res.sendStatus(200);
  }
});

module.exports = router;
