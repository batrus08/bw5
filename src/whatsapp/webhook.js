
const express = require('express');
const crypto = require('crypto');
const prisma = require('../db/client');
const { WA_APP_SECRET, WA_VERIFY_TOKEN, RATE_LIMIT_WA_PER_MIN, RATE_LIMIT_PERSISTENT } = require('../config/env');
const { allow } = require('../utils/rateLimit');
const { allowPersistent } = require('../utils/rateLimitDB');
const { addEvent } = require('../services/events');
const { sendInteractiveButtons, sendListMenu, formatRp } = require('../services/wa');
function withHelpButtons(to, text, primaryLabel='Lanjut'){
  return sendInteractiveButtons(to, text, [primaryLabel]);
}
const { sendMessage, buildOrderKeyboard } = require('../services/telegram');
const { createOrder, setPayAck, requestHelp, ackTerms } = require('../services/orders');
const { createClaim, setEwallet } = require('../services/claims');
const { normalizeEwallet } = require('../utils/validation');
const { calcLinearRefund } = require('../utils/refund');

const router = express.Router();
const { claimState, orderState } = require('./state');

async function onVariantSelected(from, variantId){
  const variant = await prisma.product_variants.findUnique({ where:{ variant_id: variantId }, include:{ product:true } });
  if(!variant || !variant.active || !variant.product || !variant.product.is_active){
    await withHelpButtons(from, 'Varian tidak tersedia.');
    return;
  }
  const tncKey = variant.tnc_key || variant.product.default_tnc_key;
  if(tncKey){
    const terms = await prisma.terms.findUnique({ where:{ key: tncKey } }).catch(()=>null);
    if(terms && terms.body_md){
      const snippet = terms.body_md.slice(0,400);
      orderState.set(from, { step:'VARIANT_TNC', variant, product: variant.product });
      await sendInteractiveButtons(from, snippet, ['Setuju','Batal']);
      return;
    }
  }
  orderState.set(from, { step:'VARIANT_SELECTED', variant, product: variant.product, variant_id: variant.variant_id });
  const msg = `${variant.title || variant.code}\nHarga: ${formatRp(variant.price_cents)}`;
  await sendInteractiveButtons(from, msg, ['Beli 1','Batal']);
}
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
      const last = await prisma.orders.findFirst({ where:{ buyer_phone: from }, orderBy:{ created_at:'desc' } }).catch(()=>null);
      if(last?.status==='ON_HOLD_HELP'){
        await withHelpButtons(from,'Proses masih dijeda oleh admin.');
        continue;
      }

      if (m.type === 'text') {
        const body = (m.text?.body || '').trim();
        const t = body.toLowerCase();
        const state = claimState.get(from);
        if (state?.step === 'CLAIM_INVOICE') {
          const invoice = body;
          const order = await prisma.orders.findUnique({ where:{ invoice }, include:{ product:true } });
          if(!order){ await withHelpButtons(from,'Invoice tidak ditemukan.'); claimState.delete(from); continue; }
          const warrantyDays = (order.product.duration_months||0)*30;
          const usedDays = Math.floor((Date.now()-order.created_at.getTime())/86400000);
          const remaining = Math.max(0, warrantyDays-usedDays);
          const eligible = remaining>0;
          const refund = eligible ? calcLinearRefund({ priceCents: order.amount_cents, warrantyDays, usedDays }) : 0;
          const summary = `Produk: ${order.product.name}\nDurasi: ${order.product.duration_months||0} bulan\nStatus: ${order.status}\nGaransi: ${eligible?'Ya':'Tidak'}\nSisa hari: ${remaining}\nEstimasi refund: Rp ${refund/100}`;
          await withHelpButtons(from, summary);
          await sendInteractiveButtons(from, 'Lanjutkan?', ['Ajukan Klaim','Batal']);
          claimState.set(from,{ step:'CLAIM_CONFIRM', invoice, eligible });
        } else if (state?.step === 'CLAIM_REASON') {
          try {
            await createClaim(state.invoice, body);
            await withHelpButtons(from, 'Klaim garansi diajukan.');
          } catch { await withHelpButtons(from, 'Gagal mengajukan klaim.'); }
          claimState.delete(from);
        } else if (state?.step === 'CLAIM_WAIT_EWALLET') {
          const { normalized, isValid } = normalizeEwallet(body);
          if (isValid) {
            try {
              await setEwallet(state.claimId, normalized);
              await withHelpButtons(from, `Nomor ShopeePay diterima: ${normalized}. Refund diproses maksimal 2×24 jam.`);
              claimState.delete(from);
            } catch {
              await withHelpButtons(from, 'Gagal menyimpan nomor. Coba lagi.');
            }
          } else {
            await withHelpButtons(from, 'Format ShopeePay tidak valid. Kirim nomor 10–15 digit diawali 08 (contoh 081234567890).');
          }
        } else if (t === 'menu' || t === 'halo' || t === 'hi' || t === 'order') {
          await sendInteractiveButtons(from, 'Pilih menu:', ['Order', 'Harga', 'FAQ', '🛡️ Klaim Garansi']);
        } else if (t.startsWith('order ')) {
          const parts = t.split(/\s+/);
          const code = parts[1];
          const product = await prisma.products.findUnique({ where:{ code }, include:{ variants:{ where:{ active:true } } } });
          if (!product || !product.is_active) { await withHelpButtons(from, 'Produk tidak tersedia.'); continue; }
          const variants = product.variants || [];
          if(variants.length){
            const rows = [];
            for(const v of variants){
              let stock = v.stock_cached;
              if(stock == null){
                const [{ count }] = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM accounts WHERE variant_id=${v.variant_id} AND status='AVAILABLE' AND used_count < max_usage`;
                stock = Number(count)||0;
              }
              rows.push({ id:`var:${v.variant_id}`, title: v.title || v.code, desc: `${formatRp(v.price_cents)} • Stok: ${stock}` });
            }
            await sendListMenu(from, `Pilih varian ${product.name}`, 'Pilih', [{ title:'Varian', rows }]);
            continue;
          }
          const qty = Number(parts[2]||1), email = parts[3]||null;
          const order = await createOrder({ buyer_phone: from, product_code: code, qty, amount_cents: product.price_cents * qty, email });
          if(order.status === 'AWAITING_PREAPPROVAL'){
            await withHelpButtons(from, 'Order diterima dan menunggu persetujuan admin.');
          } else {
            const tncKey = product.default_tnc_key;
            if(tncKey){
              const terms = await prisma.terms.findUnique({ where:{ key: tncKey } }).catch(()=>null);
              if(terms && terms.body_md){
                const snippet = terms.body_md.slice(0,400);
                orderState.set(from, { step:'TNC_ACK', order, product });
                await sendInteractiveButtons(from, snippet, ['Setuju','Batal']);
              } else {
                const summary = `Invoice: ${order.invoice}\nTotal: ${formatRp(order.amount_cents)}\nSilakan lanjutkan pembayaran.`;
                await withHelpButtons(from, summary);
              }
            } else {
              const summary = `Invoice: ${order.invoice}\nTotal: ${formatRp(order.amount_cents)}\nSilakan lanjutkan pembayaran.`;
              await withHelpButtons(from, summary);
            }
          }
        } else if (t.startsWith('stok ')) {
          const code = t.split(/\s+/)[1];
          const count = await prisma.accounts.count({ where:{ product_code: code, status:'AVAILABLE' } });
          await withHelpButtons(from, `Stok ${code}: ${count}`);
        } else {
          await withHelpButtons(from, 'Ketik: menu | order <kode> <qty> [email] | stok <kode>');
        }
      } else if (m.type === 'image') {
        const order = await prisma.orders.findFirst({ where:{ buyer_phone: from, status:'PENDING_PAYMENT' }, orderBy:{ created_at:'desc' }, include:{ product:true, variant:true } });
        if (!order) { await withHelpButtons(from, 'Tidak ada order menunggu pembayaran.'); continue; }
        await prisma.orders.update({ where:{ id: order.id }, data:{ proof_id: m.image?.id || 'unknown', proof_mime: m.image?.mime_type || '' } });
        await setPayAck(order.invoice);
        await withHelpButtons(from, 'Terima kasih! Bukti pembayaran diterima dan sedang diverifikasi admin.');
        const deliveryMode = order.delivery_mode || order.product.default_mode || null;
        const otpPolicy = order.variant?.otp_policy || order.product.default_otp_policy || 'NONE';
        const kb = buildOrderKeyboard(order.invoice, deliveryMode, otpPolicy);
        await sendMessage(
          process.env.ADMIN_CHAT_ID,
          `🧾 Bukti bayar masuk\nInvoice: <b>${order.invoice}</b>\nProduk: ${order.product.name} (${order.product.code})\nQty: ${order.qty}\nTotal: Rp ${(order.amount_cents)/100}`,
          { parse_mode: 'HTML', reply_markup: kb.reply_markup }
        );
      } else if (m.type === 'interactive') {
        const id = m.interactive?.button_reply?.id || m.interactive?.list_reply?.id || '';
        const title = m.interactive?.button_reply?.title?.toLowerCase() || '';
        if(id === 'help'){
          const order = await prisma.orders.findFirst({ where:{ buyer_phone: from }, orderBy:{ created_at:'desc' } });
          if(order){ await requestHelp(order.id, { stage: 'UNKNOWN' }); }
          await withHelpButtons(from, 'Permintaan bantuan diterima. Proses dijeda oleh admin.');
          continue;
        }
        const claim = claimState.get(from);
        const orderSel = orderState.get(from);
        if(id.startsWith('var:')){
          await onVariantSelected(from, id.slice(4));
          continue;
        }
        if(orderSel?.step === 'VARIANT_TNC' && id.startsWith('b')){
          if(id === 'b1'){
            const { variant, product } = orderSel;
            let order = await createOrder({ buyer_phone: from, product_code: product.code, variant_code: variant.code, qty:1, amount_cents: variant.price_cents });
            order = await ackTerms(order.id);
            if(order.status === 'AWAITING_PREAPPROVAL'){
              await withHelpButtons(from, 'Order diterima dan menunggu persetujuan admin.');
            } else {
              const summary = `Invoice: ${order.invoice}\nTotal: ${formatRp(order.amount_cents)}\nSilakan lanjutkan pembayaran.`;
              await withHelpButtons(from, summary);
            }
          } else if(id === 'b2'){
            await withHelpButtons(from, 'Dibatalkan.');
          }
          orderState.delete(from);
          continue;
        }
        if(orderSel?.step === 'TNC_ACK' && id.startsWith('b')){
          if(id === 'b1'){
            const updated = await ackTerms(orderSel.order.id);
            if(updated.status === 'AWAITING_PREAPPROVAL'){
              await withHelpButtons(from, 'Order diterima dan menunggu persetujuan admin.');
            } else {
              const summary = `Invoice: ${updated.invoice}\nTotal: ${formatRp(updated.amount_cents)}\nSilakan lanjutkan pembayaran.`;
              await withHelpButtons(from, summary);
            }
          } else if(id === 'b2'){
            await prisma.orders.update({ where:{ id: orderSel.order.id }, data:{ status:'CANCELLED' } });
            await addEvent(orderSel.order.id, 'TNC_DECLINED', 'terms declined');
            await withHelpButtons(from, 'Pesanan dibatalkan karena S&K ditolak.');
          }
          orderState.delete(from);
          continue;
        }
        if (id.startsWith('b')) {
          if (claim?.step === 'CLAIM_CONFIRM') {
            if (id === 'b1') {
              if (claim.eligible) {
                await withHelpButtons(from, 'Deskripsikan masalah Anda:');
                claimState.set(from, { step: 'CLAIM_REASON', invoice: claim.invoice });
              } else {
                await withHelpButtons(from, 'Garansi tidak berlaku.');
                claimState.delete(from);
              }
            } else if (id === 'b2') {
              await withHelpButtons(from, 'Dibatalkan.');
              claimState.delete(from);
            }
            } else if (orderSel?.step === 'VARIANT_SELECTED' && title === 'beli 1') {
              orderState.delete(from);
              const { product, variant } = orderSel;
              if (!product || !product.is_active || !variant || !variant.active) {
                await withHelpButtons(from, 'Produk tidak tersedia.');
              } else {
                const order = await createOrder({ buyer_phone: from, product_code: product.code, variant_code: variant.code, qty: 1, amount_cents: variant.price_cents });
                if (order.status === 'AWAITING_PREAPPROVAL') {
                  await withHelpButtons(from, 'Order diterima dan menunggu persetujuan admin.');
                } else {
                  const summary = `Invoice: ${order.invoice}\nTotal: ${formatRp(order.amount_cents)}\nSilakan lanjutkan pembayaran.`;
                  await withHelpButtons(from, summary);
                }
              }
            } else if (orderSel?.step === 'VARIANT_SELECTED' && title === 'batal') {
            orderState.delete(from);
            await withHelpButtons(from, 'Dibatalkan.');
          } else if (title === 'order') await withHelpButtons(from, 'Format: order <kode> <qty> [email]');
          else if (title === 'harga') await withHelpButtons(from, 'Harga: ambil dari DB.');
          else if (title === 'faq') await withHelpButtons(from, 'Tanya saja, kami bantu.');
          else if (title.includes('klaim')) {
            claimState.set(from, { step: 'CLAIM_INVOICE' });
            await withHelpButtons(from, 'Masukkan nomor invoice:');
          }
        }
      }
    }
    res.sendStatus(200);
  } catch (err) { console.error('WA webhook error:', err?.message||err); res.sendStatus(200); }
});

module.exports = router;
