function pad(n){return String(n).padStart(2,'0')}
function formatTs(d=new Date()){const y=d.getFullYear(),m=pad(d.getMonth()+1),day=pad(d.getDate()),h=pad(d.getHours()),mi=pad(d.getMinutes()),s=pad(d.getSeconds()); return `${y}-${m}-${day} ${h}:${mi}:${s}`;}
module.exports = { formatTs };
