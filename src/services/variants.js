const prisma = require('../db/client');

async function resolveVariantByCode(code){
  const variant = await prisma.product_variants.findUnique({ where:{ code } });
  if(!variant || !variant.active) throw new Error('UNKNOWN_VARIANT');
  return variant;
}

async function upsertVariantFromSheetRow(row){
  const data = {
    product_id: row.product_code,
    code: row.code,
    title: row.title || null,
    duration_days: row.duration_days,
    price_cents: row.price_cents,
    delivery_mode: row.delivery_mode || 'USERPASS',
    requires_email: row.requires_email ?? false,
    otp_policy: row.otp_policy || 'NONE',
    tnc_key: row.tnc_key || null,
    qris_key: row.qris_key || null,
    stock_cached: row.stock_cached ?? null,
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
