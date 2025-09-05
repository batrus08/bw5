function normalizeEwallet(msisdn) {
  if (typeof msisdn !== 'string') {
    return { normalized: '', isValid: false, reason: 'not_string' };
  }
  const cleaned = msisdn.trim().replace(/[\s-]+/g, '');
  const isDigits = /^\d+$/.test(cleaned);
  const okPrefix = cleaned.startsWith('08');
  const okLength = cleaned.length >= 10 && cleaned.length <= 15;
  const isValid = isDigits && okPrefix && okLength;
  let reason = '';
  if (!isDigits) reason = 'non_digit';
  else if (!okPrefix) reason = 'invalid_prefix';
  else if (!okLength) reason = 'invalid_length';
  return { normalized: cleaned, isValid, reason };
}

module.exports = { normalizeEwallet };
