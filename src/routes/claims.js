const express = require('express');
const router = express.Router();

const { createClaim, approveClaim, rejectClaim, setEwallet, markRefunded } = require('../services/claims');

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
    await approveClaim(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    await rejectClaim(Number(req.params.id), req.body?.reason);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.post('/:id/ewallet', async (req, res) => {
  try {
    await setEwallet(Number(req.params.id), req.body?.ewallet);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.post('/:id/refunded', async (req, res) => {
  try {
    await markRefunded(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;

