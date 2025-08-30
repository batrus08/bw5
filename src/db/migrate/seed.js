const prisma = require('../client');

async function main(){
  await prisma.products.upsert({
    where:{ code:'CGPT-SHARE' },
    create:{ code:'CGPT-SHARE', name:'ChatGPT Sharing', delivery_mode:'sharing', duration_months:1, price_cents:150000, requires_email:false, is_active:true, sk_text:'Tidak ganti password.' },
    update:{}
  });
  await prisma.products.upsert({
    where:{ code:'CGPT-INVITE' },
    create:{ code:'CGPT-INVITE', name:'ChatGPT Privat Invite', delivery_mode:'privat_invite', duration_months:1, price_cents:190000, requires_email:true, is_active:true, sk_text:'Undangan manual oleh admin.' },
    update:{}
  });
  await prisma.products.upsert({
    where:{ code:'CANVA-INVITE' },
    create:{ code:'CANVA-INVITE', name:'Canva Team Invite', delivery_mode:'canva_invite', duration_months:1, price_cents:120000, requires_email:true, is_active:true },
    update:{}
  });
  console.log('Seed done');
}

main().catch(e=>{console.error(e); process.exit(1)}).finally(async()=>{ await prisma.$disconnect(); });
