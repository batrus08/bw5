const assert = require('node:assert');
const { test } = require('node:test');

const { parseApprovalRequired } = require('../src/services/sheet');

test('parseApprovalRequired only accepts exact "On"', () => {
  assert.strictEqual(parseApprovalRequired('On'), true);
  assert.strictEqual(parseApprovalRequired('on'), false);
  assert.strictEqual(parseApprovalRequired('Off'), false);
  assert.strictEqual(parseApprovalRequired(''), false);
  assert.strictEqual(parseApprovalRequired(undefined), false);
});
