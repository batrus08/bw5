const crypto = require('crypto');
const prisma = require('../db/client');
const { TOTP_STEP_SEC } = require('../config/env');

function base32Decode(str){
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  const bytes = [];
  for(const ch of str.toUpperCase().replace(/=+$/,'')){
    const val = alphabet.indexOf(ch);
    if(val < 0) continue;
    bits += val.toString(2).padStart(5,'0');
    while(bits.length >= 8){
      bytes.push(parseInt(bits.slice(0,8),2));
      bits = bits.slice(8);
    }
  }
  return Buffer.from(bytes);
}

function generateTOTP(secret, step = TOTP_STEP_SEC, timestamp = Date.now()){
  const key = base32Decode(secret);
  const counter = Math.floor(timestamp / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length-1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return code.toString().padStart(6,'0');
}

async function createManualToken(orderId, ttlSec){
  const expires = new Date(Date.now() + ttlSec*1000);
  const id = crypto.randomUUID();
  await prisma.otptokens.create({ data:{ id, order_id: orderId, type:'MANUAL_AFTER_DELIVERY', expires_at: expires, one_time_limit:1 } });
  return id;
}

async function fulfillManualOtp(tokenId, code){
  const token = await prisma.otptokens.findUnique({ where:{ id: tokenId } });
  if(!token || token.used || token.expires_at < new Date()) return null;
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  await prisma.otptokens.update({ where:{ id: tokenId }, data:{ code_hash: hash, used:true, used_count:{ increment:1 } } });
  return token.order_id;
}

async function generateSingleUseTOTP(orderId, secret){
  const existing = await prisma.otptokens.findFirst({ where:{ order_id: orderId, type:'TOTP_SINGLE_USE' } });
  if(existing) return null;
  if(!secret) return null;
  const code = generateTOTP(secret);
  const expires = new Date(Date.now() + TOTP_STEP_SEC*1000);
  await prisma.otptokens.create({ data:{ id: crypto.randomUUID(), order_id: orderId, type:'TOTP_SINGLE_USE', used:true, used_count:1, expires_at: expires } });
  return code;
}

module.exports = { generateTOTP, createManualToken, fulfillManualOtp, generateSingleUseTOTP };
