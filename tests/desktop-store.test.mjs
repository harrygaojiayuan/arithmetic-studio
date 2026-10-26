import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const { PracticeStore } = createRequire(import.meta.url)('../desktop/store.cjs');

test('desktop settings, scores and ongoing sessions survive a full store reopen', () => {
  const directory = mkdtempSync(join(tmpdir(), 'arithmetic-store-test-'));
  try {
    const store = new PracticeStore(directory);
    store.update('set', 'arithmetic-studio.config.v1', '{"n":3,"m":2,"operator":"divide"}');
    store.update('set', 'arithmetic-studio.records.v1', '[{"correct":12}]');
    store.update('set', 'arithmetic-studio.session.v1', '{"deadline":1234}');
    const reopened = new PracticeStore(directory);
    assert.deepEqual(reopened.snapshot(), store.snapshot());
    assert.equal(JSON.parse(reopened.snapshot()['arithmetic-studio.records.v1'])[0].correct, 12);
    reopened.update('remove', 'arithmetic-studio.session.v1');
    assert.equal(new PracticeStore(directory).snapshot()['arithmetic-studio.session.v1'], undefined);
    assert.equal(JSON.parse(readFileSync(store.file, 'utf8'))['arithmetic-studio.config.v1'], '{"n":3,"m":2,"operator":"divide"}');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('desktop storage rejects arbitrary keys and malformed input without changing the file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'arithmetic-store-test-'));
  try {
    const store = new PracticeStore(directory);
    store.update('set', 'arithmetic-studio.duration.v1', '10');
    const before = readFileSync(store.file, 'utf8');
    for (const [action,key,value] of [['set','__proto__','{}'], ['set','../../other','x'], ['set','arithmetic-studio.duration.v1',{}], ['clear','arithmetic-studio.duration.v1','']]) assert.throws(() => store.update(action,key,value));
    assert.equal(readFileSync(store.file,'utf8'), before);
    writeFileSync(store.file, '{broken');
    assert.throws(() => new PracticeStore(directory));
    assert.equal(readFileSync(store.file,'utf8'), '{broken');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
