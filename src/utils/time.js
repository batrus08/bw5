const DEFAULT_TZ = 'Asia/Jakarta';
const DEFAULT_FMT = 'YYYY-MM-DD HH:mm:ss';

function formatTs(date = new Date()) {
  const tz = process.env.TIMEZONE || DEFAULT_TZ;
  const fmt = process.env.DATETIME_FORMAT || DEFAULT_FMT;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const def = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  try {
    const out = fmt
      .replace('YYYY', parts.year)
      .replace('MM', parts.month)
      .replace('DD', parts.day)
      .replace('HH', parts.hour)
      .replace('mm', parts.minute)
      .replace('ss', parts.second);
    if (/[YMDHms]/.test(out)) return def;
    return out;
  } catch {
    return def;
  }
}

module.exports = { formatTs };
