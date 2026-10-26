export const SYMBOLS = { add: '+', subtract: '−', multiply: '×', divide: '÷' };
export const NAMES = { add: '加法', subtract: '减法', multiply: '乘法', divide: '除法' };
export const DEFAULT_CONFIG = { n: 2, m: 2, operator: 'add' };
export const DIVISION_RULE = 'composite-dividend-exact-v1';
export function validConfig(c) {
  return !!c && Number.isInteger(c.n) && c.n >= 1 && c.n <= 6 && Number.isInteger(c.m) && c.m >= 1 && c.m <= 6 && Object.hasOwn(SYMBOLS, c.operator);
}
export function modeKey(c) { return `${c.n}:${c.operator}:${c.m}`; }
export function modeLabel(c) { return `${c.n} 位数 ${SYMBOLS[c.operator]} ${c.m} 位数`; }
export function validDuration(minutes) { return Number.isInteger(minutes) && minutes >= 1 && minutes <= 120; }
export function normalizeConfig(c, changedField) {
  const next = { ...c };
  if (next.operator === 'divide' && next.n < next.m) {
    if (changedField === 'n') next.m = next.n;
    else next.n = next.m;
  }
  return next;
}
export function isExactDivision(q) {
  return Number.isInteger(q.a) && Number.isInteger(q.b) && q.b > 0 && q.a > q.b && q.a % q.b === 0;
}
export function isPrime(value) {
  if (!Number.isInteger(value) || value < 2) return false;
  if (value === 2) return true;
  if (value % 2 === 0) return false;
  for (let divisor = 3; divisor * divisor <= value; divisor += 2) {
    if (value % divisor === 0) return false;
  }
  return true;
}
export function isAllowedDividend(value) { return Number.isInteger(value) && value > 1 && !isPrime(value); }
export function isAllowedDivisor(value) { return Number.isInteger(value) && value > 1; }
export function makeQuestion(c, random = Math.random) {
  if (!validConfig(c)) throw new RangeError('题目参数无效');
  const between = (min, max) => min + Math.min(max - min, Math.floor(random() * (max - min + 1)));
  if (c.operator === 'divide') {
    if (c.n < c.m) throw new RangeError('除法左侧位数不能少于右侧位数');
    const minA = 10 ** (c.n - 1), maxA = 10 ** c.n - 1;
    // Choose a divisor and an integer quotient >= 2, then construct the dividend.
    // These bounds preserve both digit lengths without retries or swapping operands.
    const minB = Math.max(2, 10 ** (c.m - 1)), maxB = Math.min(10 ** c.m - 1, Math.floor(maxA / 2));
    const b = between(minB, maxB);
    const quotient = between(Math.max(2, Math.ceil(minA / b)), Math.floor(maxA / b));
    // b >= 2 and quotient >= 2 make the dividend composite automatically.
    // Prime divisors remain allowed; only 1 is excluded as a divisor.
    return { a: b * quotient, b };
  }
  const integer = digits => {
    const min = 10 ** (digits - 1), max = 10 ** digits - 1;
    return between(min, max);
  };
  return { a: integer(c.n), b: integer(c.m) };
}
export function answerFor(q, operator) {
  switch (operator) {
    case 'add': return q.a + q.b;
    case 'subtract': return q.a - q.b;
    case 'multiply': return q.a * q.b;
    case 'divide': return q.a / q.b;
    default: throw new RangeError('运算符无效');
  }
}
export function parseAnswer(input) {
  const value = String(input).trim().replaceAll('−', '-');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function checkAnswer(q, operator, input) {
  const number = parseAnswer(input);
  return number !== null && number === answerFor(q, operator);
}
export function remainingMs(session, now = Date.now()) { return Math.max(0, session.deadline - now); }
export function summarize(session, now = Date.now()) {
  const elapsed = Math.min(session.durationSeconds, Math.max(0, (now - session.startedAt) / 1000));
  return { id: session.id, config: { ...session.config }, durationSeconds: session.durationSeconds,
    elapsedSeconds: Math.round(elapsed), startedAt: session.startedAt, finishedAt: now,
    attempted: session.answers.length, correct: session.answers.filter(a => a.correct).length,
    completed: now >= session.deadline, answers: [...session.answers],
    ...(session.config.operator === 'divide' ? { divisionRule: session.divisionRule } : {}) };
}
export function rankedRecords(records, config, durationSeconds) {
  return records.filter(r => r.completed && r.correct >= 0 && modeKey(r.config) === modeKey(config) && r.durationSeconds === durationSeconds && (config.operator !== 'divide' || r.divisionRule === DIVISION_RULE))
    .sort((a, b) => b.correct - a.correct || (b.correct / (b.attempted || 1)) - (a.correct / (a.attempted || 1)) || a.finishedAt - b.finishedAt);
}
export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
