const { REMINDER_COOLDOWN_MS } = require('./env');

module.exports = {
  REMINDER_INTERVAL_MS: 5 * 60 * 1000, // interval scan worker
  AUTO_EXPIRE_MS: 45 * 60 * 1000,      // TTL sebelum expired
  REMINDER_COOLDOWN_MS,                // cooldown antar reminder per order
};
