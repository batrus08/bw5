const { formatTs } = require('./time');

describe('formatTs', () => {
  test('uses default timezone and format', () => {
    const date = new Date('2023-01-01T00:00:00Z');
    expect(formatTs(date)).toBe('2023-01-01 07:00:00');
  });

  test('supports custom timezone and format', () => {
    process.env.TIMEZONE = 'UTC';
    process.env.DATETIME_FORMAT = 'DD/MM/YYYY HH:mm';
    const date = new Date('2023-01-01T00:00:00Z');
    expect(formatTs(date)).toBe('01/01/2023 00:00');
    delete process.env.TIMEZONE;
    delete process.env.DATETIME_FORMAT;
  });
});
