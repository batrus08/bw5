const test = require('node:test');
const assert = require('node:assert');

process.env.WA_ACCESS_TOKEN = 't';
process.env.WA_PHONE_NUMBER_ID = '1';
process.env.WA_API_BASE = 'https://wa.example';

const waPath = require.resolve('../src/services/wa');
const dbPath = require.resolve('../src/db/client');

const setup = ({ variantKey, productKey }) => {
  const calls = [];
  global.fetch = async (_url, opts) => {
    calls.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({}) };
  };
  require.cache[dbPath] = { exports: {
    product_variants: { findUnique: async () => ({ qris_key: variantKey }) },
    products: { findUnique: async () => ({ default_qris_key: productKey }) },
    qris_assets: { findUnique: async ({ where:{ key } }) => ({ image_url: `https://img/${key}.png` }) }
  }};
  delete require.cache[waPath];
  const { sendQrisPayment } = require(waPath);
  return { sendQrisPayment, calls };
};

test('variant QRIS image is used when available', async () => {
  const { sendQrisPayment, calls } = setup({ variantKey: 'QV', productKey: 'QD' });
  await sendQrisPayment('1', { invoice:'INV', amount_cents:1000, variant_id:'v1' });
  assert.strictEqual(calls[0].image.link, 'https://img/QV.png');
});

test('falls back to product QRIS image when variant missing', async () => {
  const { sendQrisPayment, calls } = setup({ variantKey: null, productKey: 'QD' });
  await sendQrisPayment('1', { invoice:'INV', amount_cents:1000, variant_id:'v1', product_code:'P1' });
  assert.strictEqual(calls[0].image.link, 'https://img/QD.png');
});
