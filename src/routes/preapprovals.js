const express = require('express');
const router = express.Router();

const prisma = require('../db/client');
const { approvePreapproval, rejectPreapproval } = require('../services/orders');
const { sendText, sendImageById, sendImageByUrl } = require('../services/wa');
const { PAYMENT_QRIS_TEXT, PAYMENT_QRIS_IMAGE_URL, PAYMENT_QRIS_MEDIA_ID, PAYMENT_DEADLINE_MIN } = require('../config/env');

router.post('/:id/approve', async (req, res) => {
  try {
    const invoice = req.params.id;
    const r = await approvePreapproval(invoice);
    if (!r.ok) return res.status(400).json(r);
    if (r.idempotent) return res.json(r);

    const order = await prisma.orders.findUnique({ where: { invoice } });
    if (!order) return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND' });
    const deadlineAt = new Date(order.created_at.getTime() + PAYMENT_DEADLINE_MIN * 60 * 1000);
    const caption = `${PAYMENT_QRIS_TEXT}\nInvoice: ${order.invoice}\nTotal: Rp ${(order.amount_cents) / 100}\nDeadline: ${deadlineAt.toLocaleTimeString()}\nKirim foto bukti bayar ke sini.`;
    if (PAYMENT_QRIS_MEDIA_ID) await sendImageById(order.buyer_phone, PAYMENT_QRIS_MEDIA_ID, caption);
    else if (PAYMENT_QRIS_IMAGE_URL) await sendImageByUrl(order.buyer_phone, PAYMENT_QRIS_IMAGE_URL, caption);
    else await sendText(order.buyer_phone, caption);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const invoice = req.params.id;
    const reason = req.body?.reason;
    const r = await rejectPreapproval(invoice, reason);
    if (!r.ok) return res.status(400).json(r);
    if (r.idempotent) return res.json(r);

    const order = await prisma.orders.findUnique({ where: { invoice }, include: { preapproval: true } });
    if (order) {
      const note = order.preapproval?.notes || '';
      await sendText(order.buyer_phone, `❌ Order ditolak. ${note}`);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;

