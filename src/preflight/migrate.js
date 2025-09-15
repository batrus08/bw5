
const path = require('path');
const { spawn } = require('child_process');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('error', reject);
    p.on('exit', code =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} ${args.join(' ')} exit ${code}`)),
    );
  });
}

async function migrateIfEnabled() {
  if ((process.env.MIGRATE_ON_BOOT || '').toLowerCase() !== 'true') return;

  const prismaBin = path.resolve(
    __dirname,
    '../../node_modules/.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );

  try {
    
    await run(prismaBin, ['migrate', 'deploy']);
    
  } catch (e) {
    console.error('[preflight] migrate failed:', e.message);
  }
}

module.exports = { migrateIfEnabled };
