function pad(n){return String(n).padStart(2,'0')}
function formatTs(date = new Date()){
  const y = date.getFullYear(), m=pad(date.getMonth()+1), d=pad(date.getDate());
  const hh=pad(date.getHours()), mm=pad(date.getMinutes()), ss=pad(date.getSeconds());
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}
module.exports = { formatTs };
