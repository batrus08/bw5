// src/services/telegram.js
const { TELEGRAM_BOT_TOKEN } = require('../config/env');
const API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function call(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    console.error('telegram', method, res.status, data.description);
    throw new Error(`${method}: ${data.description || 'telegram api error'}`);
  }
  return data.result;
}

function sendMessage(chatId, text, extra = {}) {
  return call('sendMessage', { chat_id: chatId, text, ...extra });
}
function editMessageText(chatId, messageId, text, extra = {}) {
  return call('editMessageText', { chat_id: chatId, message_id: messageId, text, ...extra });
}
function answerCallbackQuery(id, text, extra = {}) {
  return call('answerCallbackQuery', { callback_query_id: id, text, ...extra });
}

module.exports = { sendMessage, editMessageText, answerCallbackQuery };
