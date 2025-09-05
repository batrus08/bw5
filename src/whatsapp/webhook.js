
const express = require('express');
const crypto = require('crypto');
const prisma = require('../db/client');
const { WA_APP_SECRET, WA_VERIFY_TOKEN, RATE_LIMIT_WA_PER_MIN, RATE_LIMIT_PERSISTENT, PAYMENT_QRIS_TEXT, PAYMENT_QRIS_IMAGE_URL, PAYMENT_QRIS_MEDIA_ID, PAYMENT_DEADLINE_MIN } = require('../config/env');
const { allow } = require('../utils/rateLimit');
const { allowPersistent } = require('../utils/rateLimitDB');
const { addEvent } = require('../services/events');
const { sendText, sendInteractiveButtons, sendListMenu, sendImageById, sendImageByUrl } = require('../services/wa');
const { sendMessage, buildOrderKeyboard } = require('../services/telegram');
const { createOrder, setPayAck } = require('../services/orders');
const { getStockOptions } = require('../services/stock');
const { createClaim } = require('../services/claims');
const { calcLinearRefund } = require('../utils/refund');

const router = express.Router();

const claimState = new Map();
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) return res.send(challenge);
  return res.sendStatus(403);
});

router.post('/', async (req, res) => {
  try {
    const sig = req.get('X-Hub-Signature-256');
    if (WA_APP_SECRET) {
      if (!sig || !req.rawBody) {
        await addEvent(null, 'WA_INVALID_SIGNATURE', 'missing signature', {}, 'SYSTEM', 'wa');
        return res.sendStatus(403);
      }
      const expected = 'sha256=' + crypto.createHmac('sha256', WA_APP_SECRET).update(req.rawBody).digest('hex');
      const valid = typeof sig === 'string' && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      if (!valid) {
        await addEvent(null, 'WA_INVALID_SIGNATURE', 'bad signature', {}, 'SYSTEM', 'wa');
        return res.sendStatus(403);
      }
    }

    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
    const messages = entry?.messages || [];
    for (const m of messages) {
      const from = m.from;
      const ok = RATE_LIMIT_PERSISTENT ? await allowPersistent(`wa:${from}`, RATE_LIMIT_WA_PER_MIN) : allow(`wa:${from}`, RATE_LIMIT_WA_PER_MIN);
      if (!ok) { await addEvent(null,'RATE_LIMITED',`wa user ${from}`,{},'SYSTEM','wa'); continue; }

      if (m.type === 'text') {
        const body = (m.text?.body || '').trim();
        const t = body.toLowerCase();
        const state = claimState.get(from);
        if (state?.step === 'CLAIM_INVOICE') {
          const invoice = body;
          const order = await prisma.orders.findUnique({ where:{ invoice }, include:{ product:true } });
          if(!order){ await sendText(from,'Invoice tidak ditemukan.'); claimState.delete(from); continue; }
          const warrantyDays = (order.product.duration_months||0)*30;
          const usedDays = Math.floor((Date.now()-order.created_at.getTime())/86400000);
          const remaining = Math.max(0, warrantyDays-usedDays);
          const eligible = remaining>0;
          const refund = eligible ? calcLinearRefund({ priceCents: order.amount_cents, warrantyDays, usedDays }) : 0;
          const summary = `Produk: ${order.product.name}\nDurasi: ${order.product.duration_months||0} bulan\nStatus: ${order.status}\nGaransi: ${eligible?'Ya':'Tidak'}\nSisa hari: ${remaining}\nEstimasi refund: Rp ${refund/100}`;
          await sendText(from, summary);
          await sendInteractiveButtons(from, 'Lanjutkan?', ['Ajukan Klaim','Batal']);
          claimState.set(from,{ step:'CLAIM_CONFIRM', invoice, eligible });
        } else if (state?.step === 'CLAIM_REASON') {
          try {
            await createClaim(state.invoice, body);
            await sendText(from, 'Klaim garansi diajukan.');
          } catch { await sendText(from, 'Gagal mengajukan klaim.'); }
          claimState.delete(from);
        } else if (t === 'menu' || t === 'halo' || t === 'hi' || t === 'order') {
          await sendInteractiveButtons(from, 'Pilih menu:', ['Order', 'Harga', 'FAQ', '🛡️ Klaim Garansi']);
        } else if (t.startsWith('order ')) {
          const parts = t.split(/\s+/);
          const code = parts[1], qty = Number(parts[2]||1), email = parts[3]||null;
          const product = await prisma.products.findUnique({ where:{ code } });
          if (!product || !product.is_active) { await sendText(from, 'Produk tidak tersedia.'); continue; }
          const order = await createOrder({ buyer_phone: from, product_code: code, qty, amount_cents: product.price_cents * qty, email });
          if(order.status === 'AWAITING_PREAPPROVAL'){
            await sendText(from, 'Order diterima dan menunggu persetujuan admin.');
          } else {
            const deadlineAt = new Date(order.created_at.getTime() + PAYMENT_DEADLINE_MIN*60*1000);
            const caption = `${PAYMENT_QRIS_TEXT}\nInvoice: ${order.invoice}\nTotal: Rp ${(product.price_cents*qty)/100}\nDeadline: ${deadlineAt.toLocaleTimeString()}\nKirim foto bukti bayar ke sini.`;
            if (PAYMENT_QRIS_MEDIA_ID) await sendImageById(from, PAYMENT_QRIS_MEDIA_ID, caption);
            else if (PAYMENT_QRIS_IMAGE_URL) await sendImageByUrl(from, PAYMENT_QRIS_IMAGE_URL, caption);
            else await sendText(from, caption);
          }
        } else if (t.startsWith('durasi ')) {
          const code = t.split(/\s+/)[1];
          const opts = await getStockOptions(code);
          const rows = opts.filter(o=>o.stock>0).map(o=>({ id:`dur:${code}:${o.durationDays}`, title:`Durasi ${o.durationDays} hari`, desc:`Stok: ${o.stock}` }));
          if(rows.length===0) await sendText(from,'Semua durasi habis.');
          else await sendListMenu(from,'Durasi','Pilih durasi:',[{ title:'Durasi', rows }]);
        } else if (t.startsWith('stok ')) {
          const code = t.split(/\s+/)[1];
          const count = await prisma.accounts.count({ where:{ product_code: code, status:'AVAILABLE' } });
          await sendText(from, `Stok ${code}: ${count}`);
        } else {
          await sendText(from, 'Ketik: menu | order <kode> <qty> [email] | stok <kode>');
        }
      } else if (m.type === 'image') {
        const order = await prisma.orders.findFirst({ where:{ buyer_phone: from, status:'PENDING_PAYMENT' }, orderBy:{ created_at:'desc' } });
        if (!order) { await sendText(from, 'Tidak ada order menunggu pembayaran.'); continue; }
        await prisma.orders.update({ where:{ id: order.id }, data:{ proof_id: m.image?.id || 'unknown', proof_mime: m.image?.mime_type || '' } });
        await setPayAck(order.invoice);
        await sendText(from, 'Terima kasih! Bukti pembayaran diterima dan sedang diverifikasi admin.');
        const prod = await prisma.products.findUnique({ where:{ code: order.product_code } });
        await sendMessage(process.env.ADMIN_CHAT_ID, `🧾 Bukti bayar masuk\nInvoice: <b>${order.invoice}</b>\nProduk: ${prod.name} (${prod.code})\nQty: ${order.qty}\nTotal: Rp ${(order.amount_cents)/100}`, { parse_mode:'HTML', ...buildOrderKeyboard(order.invoice, prod.delivery_mode) });
      } else if (m.type === 'interactive') {
        const id = m.interactive?.button_reply?.id || m.interactive?.list_reply?.id || '';
        const title = m.interactive?.button_reply?.title?.toLowerCase() || '';
        const state = claimState.get(from);
        if (id.startsWith('b')) {
          if (state?.step === 'CLAIM_CONFIRM') {
            if (id === 'b1') {
              if (state.eligible) {
                await sendText(from, 'Deskripsikan masalah Anda:');
                claimState.set(from, { step: 'CLAIM_REASON', invoice: state.invoice });
              } else {
                await sendText(from, 'Garansi tidak berlaku.');
                claimState.delete(from);
              }
            } else if (id === 'b2') {
              await sendText(from, 'Dibatalkan.');
              claimState.delete(from);
            }
          } else if (title === 'order') await sendText(from, 'Format: order <kode> <qty> [email]');
          else if (title === 'harga') await sendText(from, 'Harga: ambil dari DB.');
          else if (title === 'faq') await sendText(from, 'Tanya saja, kami bantu.');
          else if (title.includes('klaim')) {
            claimState.set(from, { step: 'CLAIM_INVOICE' });
            await sendText(from, 'Masukkan nomor invoice:');
          }
        } else if (id.startsWith('dur:')) {
          const [, code, days] = id.split(':');
          await sendText(from, `Durasi ${days} hari dipilih untuk ${code}. Lanjutkan dengan mengetik: order ${code} 1`);
        }
      }
    }
    res.sendStatus(200);
  } catch (err) { console.error('WA webhook error:', err?.message||err); res.sendStatus(200); }
});

module.exports = router;
