import { TWENTY_FOUR_CONFIG, twentyFourBoard, isTwentyFour, validTwentyFourNumbers, checkTwentyFourAnswer, storedTwentyFourSolution, SYMBOLS, NAMES, DEFAULT_CONFIG, DIVISION_RULE, validConfig, validDuration, normalizeConfig, isExactDivision, isAllowedDividend, isAllowedDivisor, makeQuestion, answerFor, parseAnswer, checkAnswer, remainingMs, summarize, rankedRecords, formatClock, modeLabel } from './core.mjs';

const $ = selector => document.querySelector(selector);
const app = $('#app'), dialog = $('#dialog');
const isDesktop = window.ArithmeticDesktop === true;
const updateAPI = window.arithmeticUpdates;
let updateState = { status:'loading', currentVersion:'', supported:!!updateAPI, message:'正在读取版本信息…' };
const storage = window.arithmeticStorage ?? {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: key => window.localStorage.removeItem(key)
};
const KEYS = { config: 'arithmetic-studio.config.v1', duration: 'arithmetic-studio.duration.v1', records: 'arithmetic-studio.records.v1', session: 'arithmetic-studio.session.v1' };
let storageAvailable = true, screen = 'home', tickInterval, nextTimeout, toastTimeout, busy = false, result, session;
let draft, sample, rankConfig, rankMinutes, pendingConfig;
let selectedNumber = null, selectedOperator = null;
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
function read(key, fallback) { try { const raw = storage.getItem(key); return raw === null ? fallback : JSON.parse(raw); } catch { return fallback; } }
function write(key, value) { try { storage.setItem(key, JSON.stringify(value)); return true; } catch { storageAvailable = false; return false; } }
function remove(key) { try { storage.removeItem(key); } catch { storageAvailable = false; } }
try { storage.setItem('arithmetic-studio.probe', '1'); storage.removeItem('arithmetic-studio.probe'); } catch { storageAvailable = false; }
const storedConfig = read(KEYS.config, null);
let config = normalizeConfig(validConfig(storedConfig) && !isTwentyFour(storedConfig) ? storedConfig : DEFAULT_CONFIG);
let minutes = read(KEYS.duration, 10);
if (!validDuration(minutes)) minutes = 10;
function isRecord(r) {
  return r && typeof r.id === 'string' && validConfig(r.config) && Number.isInteger(r.durationSeconds) && r.durationSeconds >= 60 && r.durationSeconds <= 7200 && Number.isFinite(r.startedAt) && Number.isFinite(r.finishedAt) && Number.isInteger(r.attempted) && r.attempted >= 0 && Number.isInteger(r.correct) && r.correct >= 0 && r.correct <= r.attempted && typeof r.completed === 'boolean' && Array.isArray(r.answers);
}
let records = read(KEYS.records, []);
records = Array.isArray(records) ? records.filter(isRecord) : [];
const paths = {
  arrow:'M5 12h14m-5-5 5 5-5 5', back:'m14 6-6 6 6 6', play:'m9 5 11 7-11 7V5Z',
  trophy:'M8 3h8v5a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v7m-4 2h8m-10 0h12',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-8 4H2m20 0h-2M12 4V2m0 20v-2M6.3 6.3 4.9 4.9m14.2 14.2-1.4-1.4m0-11.4 1.4-1.4M4.9 19.1l1.4-1.4',
  clock:'M12 8v5l3 2m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', check:'m5 12 4 4L19 6', close:'m6 6 12 12M6 18 18 6',
  sliders:'M4 6h5m4 0h7M4 12h9m4 0h3M4 18h2m4 0h10M9 3v6m4 0v6m-7 0v6',
  chart:'M4 20h16M7 16v-5m5 5V5m5 11V8', leaf:'M19 4C9 2 3 8 6 15c3 7 14 3 13-11ZM5 20l9-11',
  shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6', book:'M12 5v15M3 4c3-1 6-1 9 1 3-2 6-2 9-1v15c-3-1-6-1-9 1-3-2-6-2-9-1V4Z',
  spark:'m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Z', bolt:'m13 2-9 12h7l-1 8 10-13h-7l0-7Z', info:'M12 11v6m0-10v.1m9 4.9a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', refresh:'M20 8V3l-3 3a8 8 0 1 0 2 11M20 8h-5'
};
function icon(name, size = 20) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.spark}"/></svg>`; }
function toast(message) { clearTimeout(toastTimeout); $('#toast').textContent = message; $('#toast').classList.add('visible'); toastTimeout = setTimeout(() => $('#toast').classList.remove('visible'), 3000); }
const accuracy = r => r.attempted ? `${Math.round(r.correct / r.attempted * 100)}%` : '—';
const dateTime = timestamp => new Intl.DateTimeFormat('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).format(timestamp);
const note = c => isTwentyFour(c) ? '四个数字各用一次，只用加减乘除算出 24。先点数字，再点右侧运算符，再点另一个数字；分数可以继续运算。' : c.operator === 'divide' ? '被除数排除 1 和质数；除数只排除 1。大数除以小数，且能整除。' : c.operator === 'subtract' ? '减法可能出现负数，输入时请带上负号。' : '输入答案，按 Enter 提交。完成后自动进入下一题。';
function updateDraft(changedField) {
  const adjusted = draft.operator === 'divide' && draft.n < draft.m;
  draft = normalizeConfig(draft, changedField);
  sample = makeQuestion(draft); renderSettings();
  if (adjusted) toast('除法需大数除以小数，已同步调整另一侧的位数。');
}

function shell(content) {
  app.innerHTML = `<div class="wrap"><header><button class="brand" data-action="home" aria-label="返回首页"><span class="brand-mark">+</span><span><span class="brand-name">算数练习室</span><span class="brand-sub" style="display:block">ARITHMETIC STUDIO</span></span></button><div class="header-right"><span class="header-caption">把进步，留给每一天</span><span class="status-dot"></span><span>你的专属练习空间</span></div></header>${!storageAvailable ? '<div class="storage-banner" role="status">浏览器存储不可用，本次仍可练习；关闭页面后设置和成绩将无法保存。</div>' : ''}<main id="main" class="page" tabindex="-1">${content}</main><footer class="footer"><span>一点练习，一点进步。</span><span class="footer-phrase">${icon('shield', 12)} 个人成绩保存在当前浏览器</span></footer></div>`;
}
function go(destination) {
  if (screen === 'practice' && session && destination !== 'practice') { endDialog(); return; }
  screen = destination;
  if (destination === 'home') renderHome();
  if (destination === 'settings') { draft = { ...config }; sample = makeQuestion(draft); renderSettings(); }
  if (destination === 'ranking') { rankConfig = { ...config }; rankMinutes = minutes; renderRanking(); }
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function renderHome() {
  const completed = records.filter(r => r.completed);
  const solved = completed.reduce((sum, r) => sum + r.correct, 0);
  shell(`<div class="home-main"><section><div class="eyebrow"><span class="tiny-line"></span> 给大脑一点运动</div><h1 class="home-title">每天一点，<br><span>算得更快。</span></h1><p class="intro">从一道算数开始，找回专注的节奏。<br>自定难度，限时挑战，看见自己的每一点进步。</p><nav class="home-actions" aria-label="主菜单"><button class="menu-button primary" data-action="start"><span class="button-icon">${icon('play', 21)}</span><span><span class="button-label">开始运算</span><span class="button-sub" style="display:block">开启一段专注练习</span></span><span class="button-arrow">${icon('arrow', 20)}</span></button><button class="menu-button game-menu" data-action="start-24"><span class="button-icon game-mark">24</span><span><span class="button-label">24 点</span><span class="button-sub" style="display:block">四个数字 · 每题有解 · 允许分数</span></span><span class="button-arrow">${icon('arrow', 18)}</span></button><button class="menu-button" data-action="ranking"><span class="button-icon">${icon('trophy', 21)}</span><span class="button-label">排行榜</span><span class="button-arrow">${icon('arrow', 18)}</span></button><button class="menu-button" data-action="settings"><span class="button-icon">${icon('sliders', 21)}</span><span class="button-label">设置</span><span class="button-arrow">${icon('arrow', 18)}</span></button></nav><div class="session-note">${icon('leaf', 13)} ${completed.length ? `已完成 ${completed.length} 次练习，累计答对 ${solved} 题` : '不必着急，进步从第一题开始。'}</div></section><aside><div class="preview-card"><div class="preview-top"><span class="mini-label">A LITTLE PRACTICE, EVERY DAY</span><span class="mini-pill">${icon('spark', 11)} 专注时刻</span></div><h2 class="preview-heading">给自己十分钟，<br>让思维轻快起来。</h2><div class="preview-equation" aria-label="算式示例：28 加 14 等于 42"><span>28</span><span class="op">+</span><span>14</span><span class="op">=</span><span class="result">42</span></div><div class="preview-bottom"><span>让每一道题，都成为小小的积累</span><span class="preview-dots"><i></i><i></i><i></i></span></div></div><div class="config-summary"><div class="summary-icon">${icon('settings', 21)}</div><div><div class="small-label">当前练习模式</div><div class="summary-value">${modeLabel(config)}</div></div><button class="summary-edit" data-action="settings">调整 ${icon('arrow', 14)}</button></div></aside></div><div class="bottom-strip"><div class="feature"><span class="feature-icon">${icon('sliders', 23)}</span><div><div class="feature-title">难度，由你决定</div><div class="feature-desc">自由组合位数与运算符</div></div></div><div class="feature"><span class="feature-icon">${icon('clock', 23)}</span><div><div class="feature-title">专注，有始有终</div><div class="feature-desc">默认 10 分钟，时长可调</div></div></div><div class="feature"><span class="feature-icon">${icon('chart', 23)}</span><div><div class="feature-title">进步，有迹可循</div><div class="feature-desc">同类练习，记录个人最佳</div></div></div></div>`);
}
function renderSettings() {
  shell(`<section class="inner-page"><button class="back" data-action="home">${icon('back', 15)} 返回首页</button><div class="page-heading"><div><h1>找到你的练习节奏</h1><p>调整两个数的位数，选择想练习的运算。</p></div><span class="pill">${icon('sliders', 12)} 题目设置</span></div><div class="settings-layout"><div class="panel"><div class="digits-row">${['n','m'].map((key,i) => `<div><h2 class="field-title">${i ? '右侧' : '左侧'}数字位数</h2><div class="field-description">${i ? '第二个' : '第一个'}数 · 1–6 位</div><div class="stepper"><button data-action="step" data-key="${key}" data-delta="-1" aria-label="减少${i ? '右侧' : '左侧'}位数" ${draft[key] === 1 ? 'disabled' : ''}>−</button><span class="stepper-value">${draft[key]}<small>位</small></span><button data-action="step" data-key="${key}" data-delta="1" aria-label="增加${i ? '右侧' : '左侧'}位数" ${draft[key] === 6 ? 'disabled' : ''}>+</button></div></div>`).join('')}</div><h2 class="field-title">选择运算符</h2><div class="field-description">每次练习专注一种运算</div><div class="operators" role="group" aria-label="运算符">${Object.keys(SYMBOLS).map(op => `<button class="operator ${draft.operator === op ? 'selected' : ''}" data-action="operator" data-value="${op}" aria-pressed="${draft.operator === op}"><span>${SYMBOLS[op]}</span><small>${NAMES[op]}</small></button>`).join('')}</div><div class="settings-save"><span class="form-note">设置自动记住你的偏好<br>练习时长在每次开始前调整</span><button class="primary-btn" data-action="save-settings">${icon('check', 17)} 保存设置</button></div></div><aside class="panel settings-preview"><span class="mini-label">你的下一道挑战</span><div class="sample-equation">${sample.a} ${SYMBOLS[draft.operator]} ${sample.b}</div><div class="sample-answer">= ?</div><div class="notice">${modeLabel(draft)}<br>${note(draft)}</div><button class="text-btn" style="margin-top:13px" data-action="sample">换一道示例 ↻</button></aside></div>${updatePanel()}</section>`);
}
function updatePanel() {
  if (!updateAPI) return '';
  const state = updateState, active = ['loading','checking','downloading','downloaded','preparing','installing'].includes(state.status);
  return `<section class="panel update-panel" id="update-panel" aria-label="应用更新"><div class="update-heading"><div><h2 class="field-title">应用更新</h2><p class="field-description">当前版本 ${esc(state.currentVersion || '…')} · GitHub 正式版</p></div><button class="secondary-btn" data-action="check-update" ${active || !state.supported ? 'disabled' : ''}>${state.status === 'checking' ? '检查中…' : '检查更新'}</button></div><p class="update-message ${state.status === 'error' ? 'error-text' : ''}" role="status" aria-live="polite">${esc(state.message)}</p>${state.status === 'available' ? `<button class="primary-btn" data-action="install-update">安装新版本 ${esc(state.version)}</button><p class="field-description">后台下载并校验，完成后自动安装、重启；练习记录会保留。</p>` : ''}${state.status === 'downloading' ? `<progress class="update-progress" max="100" value="${Number(state.progress) || 0}" aria-label="更新下载进度"></progress><span class="field-description">${Number(state.progress) || 0}%</span>` : ''}<p class="field-description update-privacy">仅在检查或下载更新时连接 GitHub；做题记录保留在本机，不会上传。</p></section>`;
}
function receiveUpdateState(state) {
  updateState = state;
  const panel = $('#update-panel');
  if (panel) panel.outerHTML = updatePanel();
}
async function runUpdateAction(action) {
  if (!updateAPI) return;
  try { receiveUpdateState(await updateAPI[action]()); }
  catch { receiveUpdateState({ ...updateState, status:'error', message:'无法完成更新，请稍后重试。练习记录不受影响。' }); }
}
if (updateAPI) {
  updateAPI.onState(receiveUpdateState);
  updateAPI.getState().then(receiveUpdateState).catch(() => receiveUpdateState({ ...updateState, status:'error', message:'无法读取版本信息，请重试。' }));
}
function startDialog(selectedConfig = config) {
  if (session) return;
  pendingConfig = { ...selectedConfig };
  dialog.innerHTML = `<form id="start-form"><div class="dialog-top"><div><h2>准备好开始了吗？</h2><p>选一段时间，把注意力交给眼前这道题。</p></div><button class="close-button" type="button" data-action="close-dialog" aria-label="关闭">${icon('close', 19)}</button></div><div class="dialog-config">${modeLabel(pendingConfig)}</div><label class="duration-label" for="duration">这次想练习多久？</label><div class="duration-chips">${[1,5,10,15].map(n => `<button type="button" class="chip ${minutes === n ? 'selected' : ''}" data-action="duration" data-value="${n}">${n} 分钟</button>`).join('')}</div><div class="custom-time"><span>自定时长</span><input class="number-input" id="duration" name="duration" type="number" min="1" max="120" step="1" required value="${minutes}" inputmode="numeric" aria-describedby="duration-help"><span id="duration-help">分钟 · 1–120</span></div><div id="start-error" class="error-text" role="alert"></div><div class="dialog-bottom"><button class="primary-btn" type="submit">${icon('play', 17)} 开始练习</button></div><p class="dialog-foot">时间内持续出题，到时自动结算。<br>${note(pendingConfig)}</p></form>`;
  dialog.showModal();
}
function begin(value) {
  if (!validDuration(value)) { $('#start-error').textContent = '请输入 1–120 之间的整数分钟。'; return; }
  minutes = value; write(KEYS.duration, minutes);
  const now = Date.now();
  const selected = normalizeConfig(pendingConfig);
  if (!isTwentyFour(selected)) { config = { ...selected }; write(KEYS.config, config); }
  session = { id: crypto.randomUUID ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}`, config:{...selected}, durationSeconds: minutes * 60, startedAt: now, deadline: now + minutes * 60000, answers:[], question:makeQuestion(selected), ...(selected.operator === 'divide' ? { divisionRule: DIVISION_RULE } : {}) };
  selectedNumber = null; selectedOperator = null;
  if (isTwentyFour(selected)) session.moves = [];
  busy = false; write(KEYS.session, session); dialog.close(); screen = 'practice'; renderPractice(); startTimer();
}
function renderPractice() {
  const c = session.config, game = isTwentyFour(c);
  shell(`<section class="inner-page"><div class="run-top"><span class="eyebrow"><span class="tiny-line"></span> 一次只专注一道题</span><button class="text-btn" data-action="end">结束本次练习</button></div><section class="panel practice-panel ${game ? 'twentyfour-panel' : ''}" aria-label="${game ? '24 点练习' : '算数练习'}"><div class="practice-header"><span class="pill">${modeLabel(c)}</span><div class="timer" id="timer" role="timer" aria-label="剩余时间">${icon('clock', 21)}<span id="time-value">${formatClock(remainingMs(session) / 1000)}</span></div></div><div class="progress-track" role="progressbar" id="time-progress" aria-label="剩余时间进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><div class="progress-fill" id="progress-fill" style="width:100%"></div></div><div class="practice-body"><div class="question-number" id="question-number">QUESTION ${String(session.answers.length + 1).padStart(2, '0')}</div>${game ? '<div id="game-workspace"></div>' : `<h1 class="question" id="question">${questionMarkup()}</h1><form id="answer-form" class="answer-form" novalidate><input id="answer" class="answer-input" type="text" inputmode="${c.operator === 'subtract' ? 'text' : 'decimal'}" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="输入你的答案" aria-label="你的答案" aria-describedby="feedback answer-rule"><button class="primary-btn submit-btn" id="submit-answer" type="submit">提交 ${icon('arrow', 17)}</button></form>`}<div class="feedback" id="feedback" aria-live="polite" aria-atomic="true"></div><div class="keyboard-hint" id="answer-rule">${note(c)}${game || ['add','multiply'].includes(c.operator) ? '' : '<br>按 <kbd>Enter</kbd> 提交，完成后自动进入下一题。'}</div></div><div class="run-stats"><div class="run-stat"><div class="stat-number" id="stat-attempted">0</div><div class="stat-label">已做题数</div></div><div class="run-stat"><div class="stat-number" id="stat-correct">0</div><div class="stat-label">答对题数</div></div><div class="run-stat"><div class="stat-number" id="stat-accuracy">—</div><div class="stat-label">正确率</div></div></div></section><p class="run-reminder">${session.durationSeconds / 60} 分钟的小小坚持，也会变成看得见的进步。<br>倒计时持续进行，切换页面不会暂停。</p></section>`);
  if (game) renderGameBoard();
  updateStats(); updateTimer();
  if (game) completeTwentyFourBoard();
  requestAnimationFrame(focusPractice);
}
const moveSymbols = { '+': '+', '-': '−', '*': '×', '/': '÷' };
function focusPractice() {
  const target = session && isTwentyFour(session.config) && session.moves?.length === 3
    ? $('[data-action="undo-board"]:not(:disabled)') : $('#answer') || $('.number-card:not(:disabled)');
  target?.focus();
}
function tileText(tile) { return tile.denominator === '1' ? tile.numerator : `${tile.numerator}/${tile.denominator}`; }
function renderGameBoard() {
  const tiles = twentyFourBoard(session.question.numbers, session.moves || []), remaining = tiles.filter(Boolean);
  const first = selectedNumber === null ? null : tiles[selectedNumber];
  const solved = remaining.length === 1 && remaining[0].numerator === '24' && remaining[0].denominator === '1';
  const prompt = solved ? '答对了！即将自动进入下一题。' : remaining.length === 1 ? `结果是 ${tileText(remaining[0])}，还没到 24。即将重新开始本题。` : !first ? '① 点一个数字方格 · 算出 24 自动下一题' : !selectedOperator ? `已选 ${tileText(first)} · ② 点右侧运算符` : `${tileText(first)} ${moveSymbols[selectedOperator]} … · ③ 点另一个数字方格`;
  $('#game-workspace').innerHTML = `<div class="game-goal"><span>目标</span><strong>24</strong><span>每个数字用一次 · 每题都有解</span></div><div class="game-step" role="status" aria-live="polite">${esc(prompt)}</div><div class="game-board"><div class="number-grid" role="group" aria-label="数字方格">${tiles.map((tile,index) => tile ? `<button type="button" class="number-card ${selectedNumber === index ? 'selected' : ''}" data-action="select-number" data-value="${index}" aria-label="数字 ${esc(tileText(tile))}" aria-pressed="${selectedNumber === index}" ${busy ? 'disabled' : ''}><span class="tile-value">${tile.denominator === '1' ? esc(tile.numerator) : `<span class="fraction"><span>${esc(tile.numerator)}</span><span>${esc(tile.denominator)}</span></span>`}</span>${tile.expression.startsWith('(') ? `<small>${esc(tile.expression.replaceAll('*','×').replaceAll('/','÷'))}</small>` : ''}</button>` : '<div class="number-slot" aria-label="已合并的方格">·</div>').join('')}</div><div class="game-operators" role="group" aria-label="加减乘除">${Object.entries(moveSymbols).map(([op,symbol]) => `<button type="button" class="game-operator ${selectedOperator === op ? 'selected' : ''}" data-action="select-operation" data-value="${op}" aria-label="${{'+':'加','-':'减','*':'乘','/':'除'}[op]}" aria-pressed="${selectedOperator === op}" ${busy || selectedNumber === null || remaining.length < 2 ? 'disabled' : ''}>${symbol}</button>`).join('')}</div></div><div class="board-actions"><button class="secondary-btn" data-action="undo-board" ${busy || !session.moves?.length ? 'disabled' : ''}>撤回一步</button><button class="secondary-btn" data-action="reset-board" ${busy || (!session.moves?.length && selectedNumber === null) ? 'disabled' : ''}>重新开始本题</button></div><div class="game-actions"><button class="text-btn" id="reveal-answer" data-action="reveal" ${busy ? 'disabled' : ''}>看解法并跳过（计错题）</button><button class="secondary-btn hide" id="next-question" data-action="next-question">下一题 ${icon('arrow',16)}</button></div>`;
}
function changeBoard(action, value) {
  if (!session || busy || !isTwentyFour(session.config)) return;
  if (!remainingMs(session)) { finish(); return; }
  const moves = session.moves || [], tiles = twentyFourBoard(session.question.numbers, moves);
  if (action === 'select-number') {
    const index = Number(value);
    if (!tiles[index]) return;
    if (selectedNumber === index) { selectedNumber = null; selectedOperator = null; }
    else if (selectedNumber === null || !selectedOperator) { selectedNumber = index; }
    else {
      const next = [...moves, { left:selectedNumber, right:index, operator:selectedOperator }];
      try { twentyFourBoard(session.question.numbers, next); }
      catch (error) { $('#feedback').className = 'feedback bad'; $('#feedback').textContent = error.message; return; }
      session.moves = next; selectedNumber = null; selectedOperator = null;
    }
  } else if (action === 'select-operation') {
    if (selectedNumber === null || !Object.hasOwn(moveSymbols,value)) return;
    selectedOperator = value;
  } else {
    session.moves = action === 'undo-board' ? moves.slice(0,-1) : [];
    selectedNumber = null; selectedOperator = null;
  }
  write(KEYS.session, session); $('#feedback').textContent = ''; $('#feedback').className = 'feedback'; renderGameBoard();
  if (completeTwentyFourBoard()) return;
  if (selectedNumber !== null) {
    const target = selectedOperator ? `.number-card[data-value="${tiles.findIndex((tile,index) => tile && index !== selectedNumber)}"]` : '.game-operator';
    $(target)?.focus();
  } else focusPractice();
}
function completeTwentyFourBoard() {
  if (!session || busy || !isTwentyFour(session.config)) return false;
  const remaining = twentyFourBoard(session.question.numbers, session.moves || []).filter(Boolean);
  if (remaining.length !== 1) return false;
  if (!remainingMs(session)) { finish(); return true; }
  if (remaining[0].numerator === '24' && remaining[0].denominator === '1') submitAnswer();
  else {
    busy = true;
    renderGameBoard();
    clearAnswerEffect(); document.body.classList.add('answer-wrong');
    $('#feedback').className = 'feedback bad';
    $('#feedback').textContent = '再试一次，马上恢复本题的四个数字。';
    // Keep this exact hand and score; persist the reset before the feedback delay
    // so closing the app during the shake resumes at the start of this question.
    session.moves = []; selectedNumber = null; selectedOperator = null;
    write(KEYS.session, session);
    nextTimeout = setTimeout(advanceQuestion, 650);
  }
  return true;
}
function questionMarkup() { return `<span>${session.question.a}</span><span class="op">${SYMBOLS[session.config.operator]}</span><span>${session.question.b}</span><span class="op">=</span><span>?</span>`; }
function updateStats() {
  if (!session || screen !== 'practice') return;
  const stats = { attempted:session.answers.length, correct:session.answers.filter(a => a.correct).length };
  $('#stat-attempted').textContent = stats.attempted; $('#stat-correct').textContent = stats.correct; $('#stat-accuracy').textContent = accuracy(stats);
}
function startTimer() { clearInterval(tickInterval); tickInterval = setInterval(updateTimer, 200); updateTimer(); }
function updateTimer() {
  if (!session || screen !== 'practice') return;
  const left = remainingMs(session);
  if (left <= 0) { finish(); return; }
  $('#time-value').textContent = formatClock(left / 1000);
  $('#timer').classList.toggle('urgent', left <= 30000);
  const percent = Math.max(0, Math.min(100, left / (session.durationSeconds * 1000) * 100));
  $('#progress-fill').style.width = `${percent}%`; $('#time-progress').setAttribute('aria-valuenow', String(Math.round(percent)));
}
function submitAnswer(reveal = false) {
  if (!session || busy) return;
  if (!remainingMs(session)) { finish(); return; }
  const input = $('#answer'), feedback = $('#feedback');
  const game = isTwentyFour(session.config), question = session.question;
  const tiles = game ? twentyFourBoard(question.numbers, session.moves || []).filter(Boolean) : [];
  if (game && !reveal && tiles.length !== 1) { feedback.textContent = '请先将四个数字合并为一个结果。'; return; }
  const raw = game ? (tiles.length === 1 ? tiles[0].expression : '') : input.value.trim();
  let expected, correct, value;
  if (game) {
    const checked = reveal ? { valid: true, correct: false } : checkTwentyFourAnswer(question.numbers, raw);
    if (!checked.valid) { feedback.className = 'feedback bad'; feedback.textContent = checked.error; focusPractice(); return; }
    if (!reveal && !checked.correct) { focusPractice(); return; }
    expected = question.solution; correct = checked.correct; value = checked.value;
  } else {
    if (parseAnswer(raw) === null) { feedback.className = 'feedback bad'; feedback.textContent = raw ? '请输入有效数字，可以使用负号和小数点。' : '先写下你的答案，再提交吧。'; input.focus(); return; }
    expected = answerFor(question, session.config.operator); correct = checkAnswer(question, session.config.operator, raw);
  }
  busy = true;
  session.answers.push({ ...question, input:raw, expected, correct, ...(game ? { skipped: reveal } : {}) });
  if (game) renderGameBoard();
  session.question = makeQuestion(session.config);
  if (game) { session.moves = []; selectedNumber = null; selectedOperator = null; }
  write(KEYS.session, session); updateStats();
  clearAnswerEffect();
  document.body.classList.add(correct ? 'answer-correct' : 'answer-wrong');
  feedback.className = `feedback ${correct ? 'good' : 'bad'}`;
  feedback.innerHTML = correct ? `${icon('check', 16)} 答对了，继续保持！` : game ? `<span>${reveal ? '本题已跳过。' : `你的算式 = ${esc(value)}。`}<br>参考解法：<strong>${esc(expected)} = 24</strong></span>` : `${icon('close', 15)} 正确答案是 ${expected}，下一题继续。`;
  if (input) { input.readOnly = true; $('#submit-answer').disabled = true; }
  if (game && !correct) {
    $('#next-question').classList.remove('hide'); $('#next-question').focus();
  } else nextTimeout = setTimeout(advanceQuestion, correct ? 650 : 1100);
}
function advanceQuestion() {
  if (!session || !busy || screen !== 'practice') return;
  if (!remainingMs(session)) { finish(); return; }
  clearTimeout(nextTimeout); clearAnswerEffect(); busy = false;
  $('#question-number').textContent = `QUESTION ${String(session.answers.length + 1).padStart(2, '0')}`;
  const feedback = $('#feedback'); feedback.textContent = ''; feedback.className = 'feedback';
  if (isTwentyFour(session.config)) renderGameBoard();
  else {
    $('#question').innerHTML = questionMarkup();
    const input = $('#answer'); input.value = ''; input.readOnly = false; $('#submit-answer').disabled = false;
  }
  focusPractice();
}
function clearAnswerEffect() { document.body.classList.remove('answer-correct', 'answer-wrong'); }
function endDialog() {
  dialog.innerHTML = `<div class="dialog-top"><div><h2>结束这次练习？</h2><p>已经完成的题目会显示在本次结果中。</p></div></div><p class="dialog-copy">提前结束的练习不计入排行榜。完成倒计时后，成绩才会参与相同时长的排名。</p><div class="confirm-actions"><button class="secondary-btn" data-action="close-dialog">继续练习</button><button class="primary-btn" data-action="confirm-end">结束并查看结果</button></div>`;
  dialog.showModal();
}
function finish() {
  if (!session) return;
  clearInterval(tickInterval); clearTimeout(nextTimeout); busy = false;
  clearAnswerEffect();
  if (dialog.open) dialog.close();
  result = summarize(session);
  // Read immediately before writing so another tab's completed session is retained.
  const latest = read(KEYS.records, records);
  records = Array.isArray(latest) ? latest.filter(isRecord) : records;
  if (!records.some(r => r.id === result.id)) records.push(result);
  write(KEYS.records, records); remove(KEYS.session); session = null; screen = 'result'; renderResult();
}
function renderResult() {
  const ranking = rankedRecords(records, result.config, result.durationSeconds);
  const place = ranking.findIndex(r => r.id === result.id) + 1;
  const legacyDivision = result.config.operator === 'divide' && result.divisionRule !== DIVISION_RULE;
  const mistakes = result.answers.filter(a => !a.correct);
  shell(`<section class="inner-page"><button class="back" data-action="home">${icon('back', 15)} 返回首页</button><div class="result-layout"><div class="panel result-hero"><div class="result-emblem">${icon(result.completed ? 'trophy' : 'leaf', 30)}</div><h1 class="result-title">${result.completed ? '又向前进了一点。' : '每一道练习，都算数。'}</h1><p class="result-description">${modeLabel(result.config)} · ${result.completed ? `${result.durationSeconds / 60} 分钟练习已完成` : '本次练习已提前结束'}</p><div class="result-numbers">${[[result.correct,'答对题数'],[result.attempted,'已做题数'],[accuracy(result),'正确率'],[formatClock(result.elapsedSeconds),'实际用时']].map(([v,k]) => `<div><div class="stat-number">${v}</div><div class="stat-label">${k}</div></div>`).join('')}</div><div class="result-actions"><button class="primary-btn" data-action="again">${icon('refresh', 16)} 再练一次</button><button class="secondary-btn" data-action="result-ranking">${icon('trophy', 16)} 查看排行榜</button><button class="secondary-btn" data-action="home">返回首页</button></div><div class="result-status">${legacyDivision ? '旧规则成绩已保留，不参与当前整除排行榜。' : result.completed ? `${storageAvailable ? '成绩已保存' : '本页临时记录'} · 同类 ${result.durationSeconds / 60} 分钟练习排名第 ${place} 名` : '提前结束的成绩不参与排行榜，完整练习后再来挑战。'}</div></div>${mistakes.length ? `<details class="panel mistakes"><summary>回顾错题 · ${mistakes.length} 道</summary>${mistakes.map(a => `<div class="mistake-row"><span>${isTwentyFour(result.config) ? `${esc(a.numbers.join(' · '))}<br>参考解法：<strong>${esc(a.expected)} = 24</strong>` : `${esc(a.a)} ${SYMBOLS[result.config.operator]} ${esc(a.b)} = <strong>${esc(a.expected)}</strong>`}</span><small>${a.skipped ? '已跳过' : `你的答案：${esc(a.input)}`}</small></div>`).join('')}</details>` : result.attempted ? '<p class="run-reminder">这次全部答对了，下一次也继续保持。</p>' : '<p class="run-reminder">本次没有提交答案。下次从第一题开始。</p>'}</div></section>`);
}
function options(count, selected, label) { return Array.from({length:count}, (_,i) => `<option value="${i+1}" ${i+1 === selected ? 'selected' : ''}>${i+1} ${label}</option>`).join(''); }
function renderRanking() {
  const ranking = rankedRecords(records, rankConfig, rankMinutes * 60);
  const durations = [...new Set([1,5,10,15,20,30,rankMinutes,...records.filter(r => r.completed).map(r => r.durationSeconds / 60)])].sort((a,b) => a-b);
  shell(`<section class="inner-page"><button class="back" data-action="home">${icon('back', 15)} 返回首页</button><div class="page-heading"><div><h1>和过去的自己比一比</h1><p>相同模式与时长，每一份进步都算数。</p></div><span class="pill">${icon('trophy', 13)} 个人排行榜</span></div><div class="filters"><div class="filter-field"><label for="rank-mode">练习模式</label><select id="rank-mode" data-filter="mode"><option value="arithmetic" ${!isTwentyFour(rankConfig) ? 'selected' : ''}>四则运算</option><option value="twentyfour" ${isTwentyFour(rankConfig) ? 'selected' : ''}>24 点</option></select></div>${isTwentyFour(rankConfig) ? '' : `<div class="filter-field"><label for="rank-n">左侧数字位数</label><select id="rank-n" data-filter="n">${options(6,rankConfig.n,'位数')}</select></div><div class="filter-field"><label for="rank-operator">运算符</label><select id="rank-operator" data-filter="operator">${Object.keys(SYMBOLS).map(op => `<option value="${op}" ${op === rankConfig.operator ? 'selected' : ''}>${SYMBOLS[op]} ${NAMES[op]}</option>`).join('')}</select></div><div class="filter-field"><label for="rank-m">右侧数字位数</label><select id="rank-m" data-filter="m">${options(6,rankConfig.m,'位数')}</select></div>`}<div class="filter-field"><label for="rank-duration">练习时长</label><select id="rank-duration" data-filter="duration">${durations.map(n => `<option value="${n}" ${n === rankMinutes ? 'selected' : ''}>${n} 分钟</option>`).join('')}</select></div></div><div class="panel leaderboard-panel">${ranking.length ? `<div class="table-wrap"><table><thead><tr><th>排名</th><th>答对 / 做题数</th><th>正确率</th><th>练习用时</th><th>练习时间</th></tr></thead><tbody>${ranking.map((r,i) => `<tr><td><span class="rank ${i < 3 ? 'top' : ''} ${i === 0 ? 'first' : ''}">${String(i+1).padStart(2,'0')}</span></td><td class="score">${r.correct}<span style="font-size:12px;color:#9ca58f"> / ${r.attempted} 题</span></td><td>${accuracy(r)}</td><td>${formatClock(r.durationSeconds)}</td><td class="date-cell">${esc(dateTime(r.startedAt))}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state"><div class="empty-icon">${icon('trophy', 29)}</div><h2>第一份纪录，等你来写</h2><p>${modeLabel(rankConfig)} · ${rankMinutes} 分钟<br>完成一次完整练习，你的成绩就会出现在这里。</p><button class="primary-btn" data-action="rank-start">开始这组练习 ${icon('arrow', 16)}</button></div>`}</div><div class="ranking-note">${icon('info', 14)}<span>仅比较相同模式、相同时长的完整练习。按答对题数排序，相同时优先比较正确率，再按完成先后排序。${rankConfig.operator === 'divide' ? '<br>除法排行榜仅计入新整除规则下的练习，旧成绩仍保留。' : ''}<br>成绩属于当前浏览器；清除浏览器数据会删除记录。</span></div></section>`);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const { action, key, delta, value } = button.dataset;
  switch (action) {
    case 'home': case 'settings': case 'ranking': go(action); break;
    case 'check-update': runUpdateAction('check'); break;
    case 'install-update': runUpdateAction('install'); break;
    case 'start': startDialog(); break;
    case 'start-24': startDialog(TWENTY_FOUR_CONFIG); break;
    case 'select-number': case 'select-operation': case 'undo-board': case 'reset-board': changeBoard(action, value); break;
    case 'reveal': submitAnswer(true); break;
    case 'next-question': advanceQuestion(); break;
    case 'close-dialog': dialog.close(); if (screen === 'practice') focusPractice(); break;
    case 'step': draft[key] = Math.max(1,Math.min(6,draft[key]+Number(delta))); updateDraft(key); break;
    case 'operator': draft.operator = value; updateDraft('operator'); break;
    case 'sample': sample = makeQuestion(draft); renderSettings(); break;
    case 'save-settings': config = {...draft}; write(KEYS.config,config); go('home'); toast(storageAvailable ? '设置已保存，下一次练习就用这个模式。' : '设置已生效，当前浏览器无法永久保存。'); break;
    case 'duration': $('#duration').value = value; dialog.querySelectorAll('.chip').forEach(el => el.classList.toggle('selected',el.dataset.value === value)); $('#start-error').textContent = ''; break;
    case 'end': endDialog(); break;
    case 'confirm-end': finish(); break;
    case 'again': minutes = result.durationSeconds / 60; startDialog(result.config); break;
    case 'result-ranking': screen = 'ranking'; rankConfig = normalizeConfig(result.config); rankMinutes = result.durationSeconds / 60; renderRanking(); break;
    case 'rank-start': minutes = rankMinutes; startDialog(rankConfig); break;
  }
});
document.addEventListener('submit', event => {
  if (event.target.id === 'start-form') { event.preventDefault(); begin(Number($('#duration').value)); }
  if (event.target.id === 'answer-form') { event.preventDefault(); submitAnswer(); }
});
document.addEventListener('input', event => {
  if (event.target.id === 'duration') dialog.querySelectorAll('.chip').forEach(el => el.classList.toggle('selected',Number(el.dataset.value) === Number(event.target.value)));
});
document.addEventListener('change', event => {
  const key = event.target.dataset.filter;
  if (!key) return;
  if (key === 'mode') rankConfig = event.target.value === 'twentyfour' ? { ...TWENTY_FOUR_CONFIG } : { ...config };
  else if (key === 'duration') rankMinutes = Number(event.target.value);
  else rankConfig[key] = key === 'operator' ? event.target.value : Number(event.target.value);
  const adjusted = rankConfig.operator === 'divide' && rankConfig.n < rankConfig.m;
  rankConfig = normalizeConfig(rankConfig, key);
  const id = event.target.id; renderRanking(); $(`#${id}`)?.focus();
  if (adjusted) toast('除法左侧位数不能少于右侧，已同步调整。');
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') updateTimer(); });
window.addEventListener('pageshow', () => updateTimer());
window.addEventListener('arithmetic-storage-error', () => {
  storageAvailable = false;
  toast(isDesktop ? '本地数据保存失败，请检查磁盘空间或文件权限。' : '数据保存失败，请检查浏览器存储权限。');
});

function restoreSession() {
  const s = read(KEYS.session, null);
  if (!s || !validConfig(s.config) || !validDuration(s.durationSeconds / 60) || !Number.isFinite(s.startedAt) || s.deadline !== s.startedAt + s.durationSeconds * 1000 || !Array.isArray(s.answers) || typeof s.id !== 'string') return false;
  const validOperand = (v,digits) => Number.isInteger(v) && v >= 10 ** (digits-1) && v < 10 ** digits;
  if (isTwentyFour(s.config)) {
    if (!s.question || !validTwentyFourNumbers(s.question.numbers)) return false;
    const solution = storedTwentyFourSolution(s.question.numbers);
    if (!solution) return false;
    s.question.solution = solution;
    try { twentyFourBoard(s.question.numbers, s.moves || []); } catch { s.moves = []; }
    selectedNumber = null; selectedOperator = null;
    if (!s.answers.every(a => a && validTwentyFourNumbers(a.numbers) && typeof a.correct === 'boolean' && typeof a.input === 'string' && typeof a.expected === 'string')) return false;
  } else {
    if (!s.question || !validOperand(s.question.a,s.config.n) || !validOperand(s.question.b,s.config.m)) return false;
    if (!s.answers.every(a => a && validOperand(a.a,s.config.n) && validOperand(a.b,s.config.m) && typeof a.correct === 'boolean' && typeof a.input === 'string' && Number.isFinite(a.expected))) return false;
  }
  session = s; screen = 'practice';
  if (s.config.operator === 'divide') {
    if (s.divisionRule !== DIVISION_RULE || s.config.n < s.config.m) {
      finish(); toast('除法规则已更新，上一轮成绩已保留。请开始新的整除练习。'); return true;
    }
    if (!isExactDivision(s.question) || !isAllowedDividend(s.question.a) || !isAllowedDivisor(s.question.b)) { s.question = makeQuestion(s.config); write(KEYS.session, s); }
  }
  if (!remainingMs(session)) finish(); else { renderPractice(); startTimer(); toast('已恢复本次练习，倒计时继续。'); }
  return true;
}
if (!restoreSession()) renderHome();
