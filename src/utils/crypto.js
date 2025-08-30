
const crypto = require('crypto');
const { ENCRYPTION_KEY } = require('../config/env');
const key = Buffer.from(ENCRYPTION_KEY, 'base64');
function encrypt(text){ if (text==null) return null; const iv=crypto.randomBytes(12); const cipher=crypto.createCipheriv('aes-256-gcm', key, iv); const enc=Buffer.concat([cipher.update(String(text),'utf8'), cipher.final()]); const tag=cipher.getAuthTag(); return Buffer.concat([iv, tag, enc]).toString('base64'); }
function decrypt(b64){ if(!b64) return null; const raw=Buffer.from(b64,'base64'); const iv=raw.subarray(0,12); const tag=raw.subarray(12,28); const enc=raw.subarray(28); const decipher=crypto.createDecipheriv('aes-256-gcm', key, iv); decipher.setAuthTag(tag); const dec=Buffer.concat([decipher.update(enc), decipher.final()]); return dec.toString('utf8'); }
module.exports = { encrypt, decrypt };
