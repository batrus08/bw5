const prisma = require('../db/client');

function buildUrl(path) {
  const base = process.env.N8N_BASE_URL;
  if (!base) return null;
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${trimmed}/${(path || '').replace(/^\//, '')}`;
}

async function sendToN8N(path, payload) {
  const url = buildUrl(path);
  if (!url) throw new Error('N8N_BASE_URL not set');
  const token = process.env.N8N_TOKEN || '';
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': token,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      return;
    } catch (e) {
      if (i === 2) throw e;
      await new Promise(r => setTimeout(r, 400 * (2 ** i)));
    }
  }
}

async function emitToN8N(path, payload) {
  try {
    await sendToN8N(path, payload);
  } catch (e) {
    try {
      await prisma.deadletters.create({
        data: {
          channel: 'N8N',
          endpoint: path,
          payload,
          error: e.message,
        },
      });
    } catch (_) {
      // ignore if DB not ready
    }
  }
}

module.exports = { emitToN8N, sendToN8N };
