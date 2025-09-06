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

async function createManualOtp(orderId, ttlSec){
  const code = Math.floor(100000 + Math.random()*900000).toString();
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  const expires = new Date(Date.now() + ttlSec*1000);
  const id = crypto.randomUUID();
  await prisma.otptokens.create({ data:{ id, order_id: orderId, type:'MANUAL_AFTER_DELIVERY', code_hash: hash, expires_at: expires, one_time_limit:1 } });
  return { id, code };
}

async function provideManualOtp(orderId, code){
  const token = await prisma.otptokens.findFirst({ where:{ order_id: orderId, type:'MANUAL_AFTER_DELIVERY', used:false, expires_at:{ gt:new Date() } } });
  if(!token) return false;
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  if(token.code_hash !== hash) return false;
  if(token.used_count >= token.one_time_limit) return false;
  await prisma.otptokens.update({ where:{ id: token.id }, data:{ used_count: { increment:1 }, used: token.used_count +1 >= token.one_time_limit } });
  return true;
}

module.exports = { generateTOTP, createManualOtp, provideManualOtp };
