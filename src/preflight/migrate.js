
const { spawn } = require('child_process');
function run(cmd, args){
  return new Promise((resolve,reject)=>{
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', code => code===0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exit ${code}`)));
  });
}
async function migrateIfEnabled(){
  if((process.env.MIGRATE_ON_BOOT||'').toLowerCase()!=='true') return;
  try{
    console.log('[preflight] Running prisma migrate deploy...');
    await run('npx', ['--yes', 'prisma', 'migrate', 'deploy']);
    console.log('[preflight] migrate deploy OK');
  }catch(e){
    console.error('[preflight] migrate failed:', e.message);
  }
}
module.exports = { migrateIfEnabled };
