const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');
const { createRequire } = require('module');

process.env.TELEGRAM_BOT_TOKEN = 't';
process.env.ADMIN_CHAT_ID = '1';
process.env.ADMIN_API_TOKEN = 'a';
process.env.WEBHOOK_SECRET_PATH = 'w';
process.env.DATABASE_URL = 'postgres://';
process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString('base64');
process.env.CANVA_API_TOKEN = 'c';
process.env.CANVA_TEAM_ID = 'team';

const workerPath = require.resolve('../src/services/worker.js');
const dbPath = require.resolve('../src/db/client');
const canvaPath = require.resolve('../src/services/canva');
const telegramPath = require.resolve('../src/services/telegram');
const waPath = require.resolve('../src/services/wa');
const eventsPath = require.resolve('../src/services/events');

// Success case: worker processes INVITE_CANVA and sends notifications
test('INVITE_CANVA success updates task and notifies', async (t) => {
  const origFetch = global.fetch;
  const fetchSpy = test.mock.fn(async () => ({ ok: true, json: async () => ({}) }));
  global.fetch = fetchSpy;

  const notifyAdmin = test.mock.fn(async () => {});
  const sendText = test.mock.fn(async () => {});
  const addEvent = test.mock.fn(async () => {});
  const store = { updated: null };

  require.cache[dbPath] = { exports: {
    tasks: {
      findMany: async () => [
        { id: 1, status: 'OPEN', kind: 'INVITE_CANVA', order: { id: 10, invoice: 'INV1', buyer_phone: '62', email: 'u@e.com', email_for_invite: null } }
      ],
      update: async ({ where, data }) => { store.updated = { where, data }; },
    },
    deadletters: { create: async () => {} },
    events: { create: async () => {} },
  } };
  delete require.cache[canvaPath];
  require.cache[telegramPath] = { exports: { notifyAdmin } };
  require.cache[waPath] = { exports: { sendText } };
  require.cache[eventsPath] = { exports: { addEvent } };

  const localRequire = createRequire(workerPath);
  const code = fs.readFileSync(workerPath, 'utf8');
  const sandbox = { require: localRequire, module: { exports: {} }, exports: {}, console, setInterval: () => {}, clearInterval: () => {} };
  vm.runInNewContext(code, sandbox, { filename: workerPath });
  const { processTasks } = sandbox;
  await processTasks();

  assert.strictEqual(fetchSpy.mock.calls.length, 1);
  assert.strictEqual(store.updated.data.status, 'DONE');
  assert.strictEqual(addEvent.mock.calls.length, 1);
  assert.strictEqual(notifyAdmin.mock.calls.length, 1);
  assert.strictEqual(sendText.mock.calls.length, 1);

  t.after(() => {
    global.fetch = origFetch;
    delete require.cache[dbPath];
    delete require.cache[canvaPath];
    delete require.cache[telegramPath];
    delete require.cache[waPath];
    delete require.cache[eventsPath];
  });
});

// Failure case: inviteCanva retries and stores dead-letter
test('inviteCanva retries and stores dead-letter on failure', async (t) => {
  const origFetch = global.fetch;
  const fetchSpy = test.mock.fn(async () => ({ ok: false, status: 500, json: async () => ({ message: 'err' }) }));
  global.fetch = fetchSpy;

  const deadlettersCreate = test.mock.fn(async () => {});
  const eventsCreate = test.mock.fn(async () => {});

  require.cache[dbPath] = { exports: {
    deadletters: { create: deadlettersCreate },
    events: { create: eventsCreate },
  } };

  delete require.cache[canvaPath];
  const { inviteCanva } = require(canvaPath);

  await assert.rejects(inviteCanva('foo@bar'));
  assert.strictEqual(fetchSpy.mock.calls.length, 3);
  assert.strictEqual(deadlettersCreate.mock.calls.length, 1);
  assert.strictEqual(eventsCreate.mock.calls.length, 1);
  const dl = deadlettersCreate.mock.calls[0].arguments[0].data;
  assert.strictEqual(dl.endpoint, 'CANVA_INVITE');
  assert.strictEqual(dl.retry_count, 3);
  const ev = eventsCreate.mock.calls[0].arguments[0].data;
  assert.strictEqual(ev.kind, 'DEAD_LETTER_STORED');

  t.after(() => {
    global.fetch = origFetch;
    delete require.cache[dbPath];
    delete require.cache[canvaPath];
  });
});

