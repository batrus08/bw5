const prisma = require('../db/client');

async function resolveVariantByCode(code){
  const variant = await prisma.product_variants.findUnique({ where:{ code } });
  if(!variant || !variant.active) throw new Error('UNKNOWN_VARIANT');
  return variant;
}

async function upsertVariantFromSheetRow(row){
  const data = {
    product: row.product,
    type: row.type,
    duration_days: row.duration_days,
    code: row.code,
    active: row.active !== false,
  };
  const v = await prisma.product_variants.upsert({
    where:{ code: row.code },
    update: data,
    create: data,
  });
  return v.variant_id;
}

module.exports = { resolveVariantByCode, upsertVariantFromSheetRow };
