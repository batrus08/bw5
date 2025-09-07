const express = require('express');
const router = express.Router();

const { createClaim, approveClaim, rejectClaim, setEwallet, markRefunded, requestEwallet } = require('../services/claims');
const { claimState } = require('../whatsapp/state');

router.post('/', async (req, res) => {
  try {
    const { invoice, reason } = req.body || {};
    const claim = await createClaim(invoice, reason);
    res.json({ ok: true, claim });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const r = await approveClaim(Number(req.params.id));
    if (r.idempotent) return res.json(r);
    const resp = Object.assign({ ok: true }, r);
    res.json(resp);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const r = await rejectClaim(Number(req.params.id), req.body?.reason);
    if (r.idempotent) return res.json(r);
    const resp = Object.assign({ ok: true }, r);
    res.json(resp);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.post('/:id/ewallet', async (req, res) => {
  try {
    const r = await setEwallet(Number(req.params.id), req.body?.ewallet);
    if (r.idempotent) return res.json(r);
    const resp = Object.assign({ ok: true }, r);
    res.json(resp);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.post('/:id/refunded', async (req, res) => {
  try {
    const r = await markRefunded(Number(req.params.id));
    if (r.idempotent) return res.json(r);
    const resp = Object.assign({ ok: true }, r);
    res.json(resp);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.post('/:id/request-ewallet', async (req, res) => {
  try {
    const { phone } = await requestEwallet(Number(req.params.id));
    claimState.set(phone, { step: 'CLAIM_WAIT_EWALLET', claimId: Number(req.params.id) });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;

