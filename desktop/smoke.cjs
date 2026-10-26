'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

// Runs inside the packaged Windows app on GitHub's Windows runner, with isolated
// test data. Tests the actual renderer, IPC and files rather than browser mocks.
exports.runSmoke = async (window, store, reportFile) => {
  const evaluate = source => window.webContents.executeJavaScript(source, true);
  const waitFor = async (source, description) => {
    const deadline = Date.now() + 10000;
    while (!(await evaluate(source))) {
      if (Date.now() >= deadline) throw new Error(`Timed out: ${description}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  await waitFor("Boolean(document.querySelector('[data-action=\"start\"]'))", 'home screen');
  assert.equal(await evaluate('typeof window.require'), 'undefined');
  assert.equal(await evaluate('window.ArithmeticDesktop'), true);
  await evaluate(`document.querySelector('[data-action="settings"]').click(); document.querySelector('[data-action="operator"][data-value="divide"]').click(); document.querySelector('[data-action="save-settings"]').click();`);
  assert.equal(JSON.parse(store.snapshot()['arithmetic-studio.config.v1']).operator, 'divide');
  await evaluate(`document.querySelector('[data-action="start"]').click(); document.querySelector('#start-form').requestSubmit();`);
  await waitFor("Boolean(document.querySelector('#answer'))", 'practice screen');
  const question = JSON.parse(store.snapshot()['arithmetic-studio.session.v1']).question;
  assert.ok(question.a > question.b && question.b > 1 && question.a % question.b === 0);
  await evaluate(`document.querySelector('#answer').value = '${question.a / question.b}'; document.querySelector('#answer-form').requestSubmit();`);
  await waitFor("document.body.classList.contains('answer-correct')", 'green feedback');
  await waitFor("document.querySelector('#question-number').textContent.includes('02')", 'next question');
  await evaluate(`document.querySelector('#answer').value = '0'; document.querySelector('#answer-form').requestSubmit();`);
  await waitFor("document.body.classList.contains('answer-wrong')", 'red feedback');
  const previous = JSON.parse(store.snapshot()['arithmetic-studio.session.v1']);
  assert.equal(previous.answers.length, 2);
  assert.equal(previous.answers.filter(a => a.correct).length, 1);
  const loaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  window.webContents.reload(); await loaded;
  await waitFor("Boolean(document.querySelector('#stat-attempted'))", 'restore practice');
  assert.equal(await evaluate("document.querySelector('#stat-attempted').textContent"), '2');
  assert.equal(JSON.parse(store.snapshot()['arithmetic-studio.session.v1']).id, previous.id);
  // A completed saved session exercises expiry, score persistence and the leaderboard.
  const expired = { ...previous, startedAt: Date.now() - 61000, deadline: Date.now() - 1000, durationSeconds: 60 };
  expired.deadline = expired.startedAt + 60000;
  await evaluate(`window.arithmeticStorage.setItem('arithmetic-studio.session.v1', ${JSON.stringify(JSON.stringify(expired))});`);
  const reloaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  window.webContents.reload(); await reloaded;
  await waitFor("Boolean(document.querySelector('[data-action=\"result-ranking\"]'))", 'automatic completion');
  const records = JSON.parse(store.snapshot()['arithmetic-studio.records.v1']);
  assert.equal(records.length, 1); assert.equal(records[0].completed, true);
  assert.equal(records[0].correct, 1); assert.equal(records[0].attempted, 2);
  await evaluate(`document.querySelector('[data-action="result-ranking"]').click();`);
  await waitFor("document.querySelectorAll('tbody tr').length === 1", 'leaderboard');
  const { PracticeStore } = require('./store.cjs');
  const reopened = new PracticeStore(require('node:path').dirname(store.file));
  assert.equal(reopened.snapshot()['arithmetic-studio.records.v1'], store.snapshot()['arithmetic-studio.records.v1']);
  if (reportFile) fs.writeFileSync(reportFile, JSON.stringify({ ok: true, platform: process.platform, arch: process.arch, electron: process.versions.electron, checks: ['home', 'sandboxed-renderer', 'settings', 'division-rules', 'green-feedback', 'red-feedback', 'next-question', 'restore-session', 'auto-completion', 'leaderboard', 'disk-persistence'] }, null, 2));
};
