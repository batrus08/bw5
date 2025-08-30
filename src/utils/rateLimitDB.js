
const prisma = require('../db/client');
async function allowPersistent(key, limit=12){ const since=new Date(Date.now()-60_000); const count=await prisma.ratelogs.count({ where:{ key, ts:{ gt: since } } }); if(count>=limit) return false; await prisma.ratelogs.create({ data:{ key } }); return true; }
module.exports = { allowPersistent };
