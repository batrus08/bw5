
const prisma = require('../db/client');
const { WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, WA_API_BASE } = require('../config/env');

const HELP_BUTTON = { type: 'reply', title: '🆘 Bantuan', id: 'help' };
function endpoint(path){ return `${WA_API_BASE}/${WA_PHONE_NUMBER_ID}/${path}`; }

async function waCall(path, body){
  if(!WA_ACCESS_TOKEN || !WA_PHONE_NUMBER_ID) throw new Error('WA credentials missing');
  for(let i=0;i<4;i++){
    try{
      const res = await fetch(endpoint(path), { method:'POST', headers:{ 'Authorization':`Bearer ${WA_ACCESS_TOKEN}`, 'Content-Type':'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(`WA ${res.status}: ${data.error?.message||'unknown'}`);
      return data;
    }catch(e){
      if(i===3){
        await prisma.deadletters.create({ data:{ channel:'WHATSAPP', endpoint: path, payload: body, error: e.message, retry_count:i+1 } });
        await prisma.events.create({ data:{ kind:'DEAD_LETTER_STORED', actor:'SYSTEM', source:'wa', meta:{ path, body, error:e.message } } });
        throw e;
      }
      await new Promise(r=>setTimeout(r, 400*(2**i)));
    }
  }
}

function sendText(to, text){ return waCall('messages', { messaging_product:'whatsapp', to, type:'text', text:{ body:text } }); }
function sendInteractiveButtons(to, bodyText, buttons){
  const replies = buttons.map((t, i) => ({ type: 'reply', reply: { id: `b${i + 1}`, title: t } }));
  const combined = replies.concat([HELP_BUTTON]);
  return waCall('messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: { type: 'button', body: { text: bodyText }, action: { buttons: combined.slice(0, 3) } },
  });
}
function sendListMenu(to, header, bodyText, sections){ return waCall('messages', { messaging_product:'whatsapp', to, type:'interactive', interactive:{ type:'list', header:{ type:'text', text: header }, body:{ text: bodyText }, action:{ button:'Pilih', sections: sections.map(s=>({ title:s.title, rows: s.rows.map(r=>({ id:r.id, title:r.title, description:r.desc||'' })) })) } } }); }
function sendImageById(to, mediaId, caption){ return waCall('messages', { messaging_product:'whatsapp', to, type:'image', image:{ id: mediaId, caption } }); }
function sendImageByUrl(to, url, caption){ return waCall('messages', { messaging_product:'whatsapp', to, type:'image', image:{ link: url, caption } }); }
module.exports = { sendText, sendInteractiveButtons, sendListMenu, sendImageById, sendImageByUrl, waCall };
