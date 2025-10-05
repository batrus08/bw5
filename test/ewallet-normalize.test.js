const { normalizeEwallet } = require('../src/utils/validation');

describe('normalizeEwallet', () => {
  it('should normalize a valid e-wallet number', () => {
    const { normalized, isValid } = normalizeEwallet(' 08-123 456 789 0 ');
    expect(normalized).toBe('081234567890');
    expect(isValid).toBe(true);
  });

  it('should reject a number that is too short', () => {
    const { isValid } = normalizeEwallet('08123');
    expect(isValid).toBe(false);
  });

  it('should reject a number with the wrong prefix', () => {
    const { isValid } = normalizeEwallet('0712345678');
    expect(isValid).toBe(false);
  });

  it('should reject a number that is too long', () => {
    const { isValid } = normalizeEwallet('0812345678901234');
    expect(isValid).toBe(false);
  });
});