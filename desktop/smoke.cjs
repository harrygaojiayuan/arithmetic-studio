'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
let smokeUpdater;
exports.makeSmokeUpdater = () => {
  smokeUpdater = new EventEmitter();
  let checks = 0;
  smokeUpdater.installCalls = 0;
  smokeUpdater.checkForUpdates = async () => {
    smokeUpdater.emit('checking-for-update');
    if (++checks === 1) throw new Error('Mock offline');
    smokeUpdater.emit(checks === 2 ? 'update-not-available' : 'update-available', { version:'99.0.0' });
    return { updateInfo:{ version:'99.0.0' } };
  };
  smokeUpdater.downloadUpdate = async () => {
    smokeUpdater.emit('download-progress', { percent:50 });
    await new Promise(resolve => setTimeout(resolve,50));
    smokeUpdater.emit('update-downloaded', { version:'99.0.0' });
    return ['isolated-test-installer.exe'];
  };
  smokeUpdater.quitAndInstall = (silent, restart) => {
    assert.equal(silent,true); assert.equal(restart,true);
    smokeUpdater.installCalls++;
  };
  return smokeUpdater;
};

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
  await evaluate(`document.querySelector('[data-action="settings"]').click();`);
  await waitFor("Boolean(document.querySelector('[data-action=\"check-update\"]:not(:disabled)'))", 'update settings');
  assert.match(await evaluate("document.querySelector('.update-heading').textContent"), /当前版本/);
  await evaluate(`document.querySelector('[data-action="check-update"]').click();`);
  await waitFor("document.querySelector('.update-message')?.textContent.includes('更新失败')", 'offline update error');
  await evaluate(`document.querySelector('[data-action="check-update"]').click();`);
  await waitFor("document.querySelector('.update-message')?.textContent.includes('最新版本')", 'already up to date');
  await evaluate(`document.querySelector('[data-action="check-update"]').click();`);
  await waitFor("Boolean(document.querySelector('[data-action=\"download-update\"]'))", 'available update');
  await evaluate(`document.querySelector('[data-action="download-update"]').click();`);
  await waitFor("Boolean(document.querySelector('[data-action=\"install-update\"]'))", 'downloaded update');
  assert.equal(smokeUpdater.installCalls,0);
  await evaluate(`document.querySelector('[data-action="operator"][data-value="divide"]').click(); document.querySelector('[data-action="save-settings"]').click();`);
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
  const reload = async () => {
    const loaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve));
    window.webContents.reload(); await loaded;
  };
  const capture = async suffix => {
    if (!reportFile) return;
    // Hidden test windows can pause entrance animations at opacity zero.
    await evaluate("document.querySelector('#main').style.animation = 'none'");
    await window.webContents.capturePage();
    await new Promise(resolve => setTimeout(resolve,100));
    fs.writeFileSync(`${reportFile}.${suffix}.png`, (await window.webContents.capturePage()).toPNG());
  };
  const currentSession = () => JSON.parse(store.snapshot()['arithmetic-studio.session.v1']);
  const click = async (action, value) => {
    const selector = `[data-action="${action}"]${value === undefined ? '' : `[data-value="${value}"]`}`;
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const move = async (left, operator, right) => { await click('select-number',left); await click('select-operation',operator); await click('select-number',right); };
  const saveFixture = async numbers => {
    const fixture = { ...currentSession(), question: { numbers, solution: 'unused: recomputed on restore' }, moves: [] };
    await evaluate(`window.arithmeticStorage.setItem('arithmetic-studio.session.v1', ${JSON.stringify(JSON.stringify(fixture))});`);
    await reload();
    await waitFor("document.querySelectorAll('.number-card').length === 4", '24-point fixture');
  };
  await click('home'); await click('start-24');
  assert.match(await evaluate("document.querySelector('.dialog-config').textContent"), /24/);
  await evaluate(`document.querySelector('#duration').value = '1'; document.querySelector('#start-form').requestSubmit();`);
  await waitFor("document.querySelectorAll('.number-card').length === 4", '24-point board');
  assert.equal(currentSession().config.mode,'twentyfour');
  assert.ok(currentSession().question.numbers.every(n => n >= 1 && n <= 10));
  assert.equal(JSON.parse(store.snapshot()['arithmetic-studio.config.v1']).operator,'divide');
  assert.equal(await evaluate("Boolean(document.querySelector('#submit-answer'))"),false);
  await saveFixture([4,6,1,1]);
  await move(0,'*',1);
  assert.equal(currentSession().answers.length,0); // intermediate 24 still has unused cards
  assert.equal(await evaluate("document.querySelectorAll('.number-card').length"),3);
  await saveFixture([3,3,8,8]);
  await capture('board');
  // Select two different cards in order; division must preserve rational values.
  await move(2,'/',0);
  assert.equal(currentSession().moves.length,1);
  assert.equal(await evaluate("document.querySelectorAll('.number-card').length"),3);
  assert.equal(await evaluate("document.querySelector('.fraction').textContent"),'83');
  await click('undo-board');
  assert.equal(await evaluate("document.querySelectorAll('.number-card').length"),4);
  await move(2,'/',0); await reload();
  await waitFor("document.querySelectorAll('.number-card').length === 3", 'restore merged board');
  assert.equal(currentSession().moves.length,1);
  await click('reset-board');
  assert.equal(currentSession().moves.length,0);
  await move(2,'/',0); await move(1,'-',2);
  assert.equal(await evaluate("document.querySelector('.fraction').textContent"),'13');
  await capture('fraction');
  await move(3,'/',1);
  assert.equal(await evaluate("document.querySelector('.tile-value').textContent"),'24');
  // The final card click itself scores the solution; no submit click is needed.
  assert.equal(currentSession().answers.length,1);
  assert.equal(currentSession().answers[0].correct,true);
  assert.equal(await evaluate("document.body.classList.contains('answer-correct')"),true);
  await click('select-number',3); await click('undo-board'); await click('reset-board');
  assert.equal(currentSession().answers.length,1);
  await waitFor("document.querySelector('#question-number').textContent.includes('02')", '24-point next question');
  await click('reveal');
  assert.equal(currentSession().answers.length,2);
  assert.equal(currentSession().answers[1].skipped,true);
  assert.equal(currentSession().answers[1].correct,false);
  await new Promise(resolve => setTimeout(resolve,1200));
  assert.equal(await evaluate("document.querySelector('#next-question').classList.contains('hide')"),false);
  assert.match(await evaluate("document.querySelector('#feedback').textContent"),/参考解法/);
  await click('next-question'); await saveFixture([1,2,3,4]);
  const retryNumbers = currentSession().question.numbers;
  const retryDeadline = currentSession().deadline;
  await move(0,'+',1); await move(0,'+',2); await move(0,'+',3);
  assert.equal(currentSession().answers.length,2);
  assert.match(await evaluate("document.querySelector('.game-step').textContent"),/结果是 10/);
  assert.equal(await evaluate("Boolean(document.querySelector('#submit-answer'))"),false);
  assert.equal(await evaluate("document.body.classList.contains('answer-wrong')"),true);
  assert.equal(await evaluate("document.querySelector('[data-action=\"undo-board\"]').disabled"),true);
  const reducedMotion = await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#main')).animationName"),reducedMotion ? 'none' : 'answer-shake');
  await waitFor("document.querySelectorAll('.number-card').length === 4 && !document.body.classList.contains('answer-wrong')", 'shake then reset the same question');
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.tile-value'),el=>Number(el.textContent))"),retryNumbers);
  assert.deepEqual(currentSession().question.numbers,retryNumbers);
  assert.equal(currentSession().moves.length,0);
  assert.equal(currentSession().answers.length,2);
  assert.equal(currentSession().deadline,retryDeadline);
  assert.match(await evaluate("document.querySelector('#question-number').textContent"),/03/);
  await capture('retry');
  // Repeat the mistake, then reload during its feedback: the persisted board is reset.
  await move(0,'+',1); await move(0,'+',2); await move(0,'+',3);
  assert.equal(await evaluate("document.body.classList.contains('answer-wrong')"),true);
  await reload();
  await waitFor("document.querySelectorAll('.number-card').length === 4", 'reload during shake restores the same four numbers');
  assert.deepEqual(currentSession().question.numbers,retryNumbers);
  assert.equal(currentSession().answers.length,2);
  await move(0,'+',1); await move(0,'+',2); await move(0,'*',3);
  assert.equal(currentSession().answers.length,3);
  assert.equal(currentSession().answers[2].correct,true);
  await waitFor("document.querySelector('#question-number')?.textContent.includes('04')", 'successful retry advances automatically');
  await saveFixture([1,2,3,4]);
  await move(0,'+',1); await move(0,'+',2); await move(0,'+',3);
  assert.equal(await evaluate("document.body.classList.contains('answer-wrong')"),true);
  const expiredGame = currentSession();
  expiredGame.startedAt = Date.now()-61000; expiredGame.deadline=expiredGame.startedAt+60000;
  await evaluate(`window.arithmeticStorage.setItem('arithmetic-studio.session.v1', ${JSON.stringify(JSON.stringify(expiredGame))});`);
  await reload();
  await waitFor("Boolean(document.querySelector('[data-action=\"result-ranking\"]'))", '24-point automatic completion');
  const gameRecords = JSON.parse(store.snapshot()['arithmetic-studio.records.v1']);
  await new Promise(resolve => setTimeout(resolve,800));
  assert.equal(await evaluate("Boolean(document.querySelector('.result-hero'))"),true);
  assert.equal(await evaluate("document.body.classList.contains('answer-wrong')"),false);
  assert.equal(gameRecords.length,2); assert.equal(gameRecords[1].correct,2); assert.equal(gameRecords[1].attempted,3);
  assert.match(await evaluate("document.querySelector('.mistakes').textContent"),/参考解法/);
  await click('result-ranking');
  assert.equal(await evaluate("document.querySelector('#rank-mode').value"),'twentyfour');
  assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),1);
  assert.equal(await evaluate("document.querySelector('#rank-n')"),null);
  await evaluate(`document.querySelector('#rank-mode').value = 'arithmetic'; document.querySelector('#rank-mode').dispatchEvent(new Event('change',{bubbles:true}));`);
  assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),1);
  // Narrow desktop windows retain usable cards and operators without horizontal overflow.
  await click('home'); await click('start-24');
  await evaluate(`document.querySelector('#start-form').requestSubmit();`);
  await waitFor("document.querySelectorAll('.number-card').length === 4", 'second game');
  window.setSize(420,850);
  await new Promise(resolve => setTimeout(resolve,150));
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await capture('narrow');
  // An already solved board saved by 1.2.0 also advances after upgrade/reload.
  const solvedGame = { ...currentSession(), question: { numbers:[3,3,8,8] }, moves:[{left:2,right:0,operator:'/'},{left:1,right:2,operator:'-'},{left:3,right:1,operator:'/'}] };
  await evaluate(`window.arithmeticStorage.setItem('arithmetic-studio.session.v1', ${JSON.stringify(JSON.stringify(solvedGame))});`);
  await reload();
  await waitFor("document.querySelector('#question-number')?.textContent.includes('02')", 'restored solution advances automatically');
  assert.equal(currentSession().answers.length,1);
  assert.equal(currentSession().answers[0].correct,true);
  await click('end'); await click('confirm-end');
  const earlyGame = JSON.parse(store.snapshot()['arithmetic-studio.records.v1']).at(-1);
  assert.equal(earlyGame.completed,false);
  const { PracticeStore } = require('./store.cjs');
  const reopened = new PracticeStore(require('node:path').dirname(store.file));
  assert.equal(reopened.snapshot()['arithmetic-studio.records.v1'], store.snapshot()['arithmetic-studio.records.v1']);
  await click('home'); await click('settings');
  assert.equal(await evaluate("Boolean(document.querySelector('[data-action=\"install-update\"]'))"),true);
  await evaluate("document.querySelector('#update-panel').scrollIntoView({block:'center'})");
  await capture('updates');
  const scoresBeforeUpdate = store.snapshot()['arithmetic-studio.records.v1'];
  await click('install-update');
  await waitFor("document.querySelector('.update-message')?.textContent.includes('正在安装')", 'explicit update installation');
  await evaluate('window.arithmeticUpdates.install()');
  assert.equal(smokeUpdater.installCalls,1);
  assert.equal(store.snapshot()['arithmetic-studio.records.v1'],scoresBeforeUpdate);
  if (reportFile) fs.writeFileSync(reportFile, JSON.stringify({ ok: true, platform: process.platform, arch: process.arch, electron: process.versions.electron, checks: ['update-settings', 'update-offline-retry', 'update-current', 'update-download', 'update-explicit-install', 'update-preserves-scores', 'home', 'sandboxed-renderer', 'settings', 'division-rules', 'green-feedback', 'red-feedback', 'next-question', 'restore-session', 'auto-completion', 'leaderboard', '24-point-start', '24-point-fractions', '24-point-undo-reset', '24-point-restore-moves', '24-point-auto-advance', '24-point-intermediate-24', '24-point-restore-solved-board', '24-point-single-score', '24-point-skip', '24-point-no-submit-button', '24-point-wrong-result-shake', '24-point-reset-same-hand', '24-point-reload-during-shake', '24-point-retry-success', '24-point-expire-during-shake', '24-point-auto-completion', '24-point-ranking-isolation', '24-point-narrow-layout', '24-point-early-finish', 'disk-persistence'] }, null, 2));
};
