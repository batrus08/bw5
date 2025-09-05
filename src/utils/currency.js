const formatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatRupiah(amountCents) {
  const amount = Math.floor(amountCents / 100);
  return formatter.format(amount);
}

module.exports = { formatRupiah };
