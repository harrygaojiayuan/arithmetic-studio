import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const bridge = readFileSync(new URL('../native/storage-bridge.js', import.meta.url), 'utf8');
function initialize(initial = {}) {
  const messages = [];
  const window = { __ARITHMETIC_INITIAL_DATA__: initial, webkit: { messageHandlers: { arithmeticStorage: { postMessage: m => messages.push(m) } } } };
  vm.runInNewContext(bridge, { window });
  return { storage: window.arithmeticStorage, messages, window };
}

test('desktop bridge restores native data and persists settings, records and session updates', () => {
  const first = initialize({ 'arithmetic-studio.config.v1': '{"n":3,"m":2,"operator":"multiply"}' });
  assert.equal(first.window.ArithmeticDesktop, true);
  assert.equal(JSON.parse(first.storage.getItem('arithmetic-studio.config.v1')).n, 3);
  first.storage.setItem('arithmetic-studio.records.v1', '[{"correct":7}]');
  first.storage.setItem('arithmetic-studio.session.v1', '{"deadline":12345}');
  assert.equal(first.messages.length, 2);
  assert.equal(first.messages[0].action, 'set');
  const reopened = initialize(first.storage.snapshot());
  assert.equal(JSON.parse(reopened.storage.getItem('arithmetic-studio.records.v1'))[0].correct, 7);
  reopened.storage.removeItem('arithmetic-studio.session.v1');
  assert.equal(reopened.storage.getItem('arithmetic-studio.session.v1'), null);
  assert.equal(reopened.messages[0].action, 'remove');
  assert.ok(first.storage.getItem('arithmetic-studio.session.v1'));
});

test('storage bridge rejects unrelated writes and copies stored values without prototype pollution', () => {
  const { storage, messages } = initialize();
  assert.throws(() => storage.setItem('__proto__', '{}'));
  storage.setItem('arithmetic-studio.test', 42);
  assert.equal(storage.getItem('arithmetic-studio.test'), '42');
  assert.equal(storage.getItem('missing'), null);
  const snapshot = storage.snapshot();
  snapshot['arithmetic-studio.test'] = 'changed';
  assert.equal(storage.getItem('arithmetic-studio.test'), '42');
  assert.equal(messages.length, 1);
});
