const crypto = require('crypto');
const { ENCRYPTION_KEY } = require('../config/env');

const key = Buffer.from(ENCRYPTION_KEY, 'base64');

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString('base64');
}

function decrypt(payload) {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.slice(0, 12);
  const tag = buf.slice(buf.length - 16);
  const enc = buf.slice(12, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

module.exports = { encrypt, decrypt };
