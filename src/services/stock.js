const prisma = require('../db/client');
const { publishStock } = require('./output');

async function getStockSummary(){
  return prisma.$queryRaw`SELECT v.code,
    COUNT(*) FILTER (WHERE a.status='AVAILABLE' AND a.disabled=false AND a.deleted_at IS NULL AND a.used_count < a.max_usage) AS units,
    COALESCE(SUM(GREATEST(0, a.max_usage - a.used_count) ) FILTER (WHERE a.status='AVAILABLE' AND a.disabled=false AND a.deleted_at IS NULL),0) AS capacity
    FROM product_variants v
    LEFT JOIN accounts a ON a.variant_id = v.variant_id
    GROUP BY v.code
    ORDER BY units ASC`;
}

async function getStockSummaryRaw(){
  return prisma.$queryRaw`SELECT v.code, v.variant_id,
    COUNT(*) FILTER (WHERE a.status='AVAILABLE' AND a.disabled=false AND a.deleted_at IS NULL AND a.used_count < a.max_usage) AS units,
    COALESCE(SUM(GREATEST(0, a.max_usage - a.used_count) ) FILTER (WHERE a.status='AVAILABLE' AND a.disabled=false AND a.deleted_at IS NULL),0) AS capacity
    FROM product_variants v
    LEFT JOIN accounts a ON a.variant_id = v.variant_id
    GROUP BY v.code, v.variant_id`;
}

async function getStockDetail(code){
  return prisma.$queryRaw`SELECT a.id, a.fifo_order, a.used_count, a.max_usage, a.status
    FROM accounts a JOIN product_variants v ON a.variant_id = v.variant_id
    WHERE v.code = ${code}
    ORDER BY a.fifo_order ASC, a.id ASC`;
}

async function publishStockSummary(){
  const rows = await getStockSummary();
  return publishStock(rows);
}

module.exports = { getStockSummary, getStockSummaryRaw, getStockDetail, publishStockSummary };
