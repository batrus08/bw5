const { ADMIN_CHAT_ID } = require('../config/env');
const { sendMessage } = require('./telegram');
async function sendAdmin(text, extra = {}) {
  try {
    await sendMessage(ADMIN_CHAT_ID, text, extra);
  } catch (e) {
    // error already logged in telegram service
  }
}

module.exports = { sendAdmin };
