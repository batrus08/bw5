const prisma = require('../db/client');
const { CANVA_API_TOKEN, CANVA_TEAM_ID } = require('../config/env');

async function inviteCanva(email, { disableDL = false } = {}) {
  if (!CANVA_API_TOKEN || !CANVA_TEAM_ID) {
    throw new Error('CANVA_CONFIG_MISSING');
  }
  const url = `https://api.canva.com/rest/v1/teams/${CANVA_TEAM_ID}/invites`;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CANVA_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || `Canva HTTP ${res.status}`);
      }
      return data;
    } catch (e) {
      if (i === 2) {
        if (!disableDL) {
          await prisma.deadletters.create({
            data: {
              channel: 'N8N',
              endpoint: 'CANVA_INVITE',
              payload: { email },
              error: e.message,
              retry_count: i + 1,
            },
          });
          await prisma.events.create({
            data: {
              kind: 'DEAD_LETTER_STORED',
              actor: 'SYSTEM',
              source: 'canva',
              meta: { email, error: e.message },
            },
          });
        }
        throw e;
      }
      await new Promise((r) => setTimeout(r, 400 * (2 ** i)));
    }
  }
}

module.exports = { inviteCanva };
