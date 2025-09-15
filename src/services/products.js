const prisma = require('../db/client');

/**
 * Get product by code.
 * @param {string} productCode - Unique product code.
 * @returns {Promise<object|null>} Promise resolving to product or null.
 */
async function getProductByCode(productCode) {
  try {
    const product = await prisma.products.findUnique({
      where: { code: productCode },
    });
    return product;
  } catch (error) {
    console.error('getProductByCode error:', error);
    throw error;
  }
}

module.exports = {
  getProductByCode,
};
