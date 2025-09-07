
const prisma = require('../db/client');
const { TELEGRAM_BOT_TOKEN, ADMIN_CHAT_ID } = require('../config/env');
const API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function tgCall(method, body){
  for(let i=0;i<4;i++){
    try{
      const res = await fetch(`${API}/${method}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await res.json();
      if(!res.ok || !data.ok) throw new Error(data.description || `TG ${method} HTTP ${res.status}`);
      return data.result;
    }catch(e){
      if(i===3){
        await prisma.deadletters.create({ data:{ channel:'TELEGRAM', endpoint: method, payload: body, error: e.message, retry_count:i+1 } });
        await prisma.events.create({ data:{ kind:'DEAD_LETTER_STORED', actor:'SYSTEM', source:'telegram', meta:{ method, body, error:e.message } } });
        throw e;
      }
      await new Promise(r=>setTimeout(r, 400*(2**i)));
    }
  }
}

function sendMessage(chatId, text, extra={}){ return tgCall('sendMessage', { chat_id:chatId, text, ...extra }); }
function editMessageText(chatId, messageId, text, extra={}){ return tgCall('editMessageText', { chat_id:chatId, message_id:messageId, text, ...extra }); }
function answerCallbackQuery(id, text='', extra={}){ return tgCall('answerCallbackQuery', { callback_query_id:id, text, ...extra }); }
async function notifyAdmin(text){ try{ await sendMessage(ADMIN_CHAT_ID, text, { parse_mode:'HTML' }); }catch(_){} }
async function notifyCritical(text){ await notifyAdmin('⚠️ <b>CRITICAL</b>\n'+text); }

async function notifyHelpRequested(orderId, stageCtx){
  const kb = { reply_markup:{ inline_keyboard:[
    [{text:'▶️ Resume', callback_data:`HELP_RESUME:${orderId}`}],
    [{text:'⏭ Skip → PAID', callback_data:`HELP_SKIP:${orderId}:PAID`}],
    [{text:'❌ Cancel', callback_data:`HELP_CANCEL:${orderId}`}],
  ] } };
  await sendMessage(ADMIN_CHAT_ID, `🆘 HELP_REQUESTED #${orderId}\n<code>${JSON.stringify(stageCtx)}</code>`, { parse_mode:'HTML', ...kb });
}

function buildOrderKeyboard(invoice, deliveryMode, otpPolicy='NONE'){
  const rows = [
    [
      { text:'✅ Konfirmasi', callback_data:`confirm:${invoice}` },
      { text:'❌ Tolak', callback_data:`reject:${invoice}` }
    ],
    [
      { text:'ℹ️ Detail', callback_data:`detail:${invoice}` },
      { text:'🔁 Kirim QRIS', callback_data:`qris:${invoice}` }
    ]
  ];
  if(deliveryMode === 'INVITE_EMAIL'){
    rows.push([{ text:'✅ Sudah Invite', callback_data:`invited:${invoice}` }]);
  }
  if(otpPolicy === 'MANUAL_AFTER_DELIVERY'){
    rows.push([{ text:'🔐 Kirim OTP', callback_data:`otp:${invoice}` }]);
  }
  return { reply_markup:{ inline_keyboard: rows } };
}

function buildNumberGrid(N=24, cols=6, prefix='pick'){
  const rows=[]; let row=[];
  for(let i=1;i<=N;i++){ row.push({ text:String(i), callback_data:`${prefix}:${i}` }); if(row.length===cols){ rows.push(row); row=[]; } }
  if(row.length) rows.push(row);
  return { reply_markup:{ inline_keyboard: rows } };
}
function buildGrid(items=[], cols=3, mapFn=it=>({ text: it.label, data: it.id })){
  const rows=[]; let row=[];
  for(const it of items){
    const m = mapFn(it);
    row.push({ text:m.text, callback_data:`sel:${m.data}` });
    if(row.length===cols){ rows.push(row); row=[]; }
  }
  if(row.length) rows.push(row);
  return { reply_markup:{ inline_keyboard: rows } };
}

module.exports = { sendMessage, editMessageText, answerCallbackQuery, notifyAdmin, notifyCritical, notifyHelpRequested, buildOrderKeyboard, buildNumberGrid, buildGrid, tgCall };
