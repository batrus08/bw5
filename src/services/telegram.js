const prisma = require('../db/client');
const { TELEGRAM_BOT_TOKEN, ADMIN_CHAT_ID } = require('../config/env');
const { retry } = require('../utils/retry');

const API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function tgCall(method, body){
  return retry(async()=>{
    const res = await fetch(`${API}/${method}`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.description || `TG ${method} HTTP ${res.status}`);
    return data.result;
  }, {
    attempts: 4,
    baseMs: 400,
    onError: async (e, i) => {
      if (i === 4) {
        await prisma.deadletters.create({ data: {
          channel: 'TELEGRAM', endpoint: method, payload: body, error: e.message, retry_count: i
        }});
        await prisma.events.create({ data: { kind:'DEAD_LETTER_STORED', actor:'SYSTEM', source:'telegram', meta:{method,body,error:e.message} } });
      }
    }
  });
}

function sendMessage(chatId, text, extra={}){
  return tgCall('sendMessage', { chat_id: chatId, text, ...extra });
}
function editMessageText(chatId, messageId, text, extra={}){
  return tgCall('editMessageText', { chat_id: chatId, message_id: messageId, text, ...extra });
}
function answerCallbackQuery(id, text='', extra={}){
  return tgCall('answerCallbackQuery', { callback_query_id: id, text, ...extra });
}

async function notifyAdmin(text){ try { await sendMessage(ADMIN_CHAT_ID, text, { parse_mode:'HTML' }); } catch(_){} }
async function notifyCritical(text){ await notifyAdmin('⚠️ <b>CRITICAL</b>\n' + text); }

function buildOrderKeyboard(invoice, productMode){
  const rows = [];
  rows.push([{ text:'✅ Konfirmasi', callback_data:`confirm:${invoice}` }, { text:'❌ Tolak', callback_data:`reject:${invoice}` }]);
  if (productMode === 'privat_invite' || productMode === 'canva_invite') {
    rows.push([{ text:'✅ Mark Invited', callback_data:`invited:${invoice}` }, { text:'🔁 Resend', callback_data:`resend:${invoice}` }]);
  } else {
    rows.push([{ text:'🔁 Minta bukti ulang', callback_data:`reproof:${invoice}` }]);
  }
  return { reply_markup: { inline_keyboard: rows } };
}

module.exports = { sendMessage, editMessageText, answerCallbackQuery, notifyAdmin, notifyCritical, buildOrderKeyboard };
