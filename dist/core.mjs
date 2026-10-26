export const SYMBOLS = { add: '+', subtract: '−', multiply: '×', divide: '÷' };
export const NAMES = { add: '加法', subtract: '减法', multiply: '乘法', divide: '除法' };
export const DEFAULT_CONFIG = { n: 2, m: 2, operator: 'add' };
export function validConfig(c) {
  return !!c && Number.isInteger(c.n) && c.n >= 1 && c.n <= 6 && Number.isInteger(c.m) && c.m >= 1 && c.m <= 6 && Object.hasOwn(SYMBOLS, c.operator);
}
export function modeKey(c) { return `${c.n}:${c.operator}:${c.m}`; }
export function modeLabel(c) { return `${c.n} 位数 ${SYMBOLS[c.operator]} ${c.m} 位数`; }
export function validDuration(minutes) { return Number.isInteger(minutes) && minutes >= 1 && minutes <= 120; }
export function makeQuestion(c, random = Math.random) {
  if (!validConfig(c)) throw new RangeError('题目参数无效');
  const integer = digits => {
    const min = 10 ** (digits - 1), max = 10 ** digits - 1;
    return min + Math.min(max - min, Math.floor(random() * (max - min + 1)));
  };
  return { a: integer(c.n), b: integer(c.m) };
}
export function answerFor(q, operator) {
  switch (operator) {
    case 'add': return q.a + q.b;
    case 'subtract': return q.a - q.b;
    case 'multiply': return q.a * q.b;
    case 'divide': return Math.round(q.a * 100 / q.b) / 100;
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
  return number !== null && Math.abs(number - answerFor(q, operator)) < 1e-9;
}
export function remainingMs(session, now = Date.now()) { return Math.max(0, session.deadline - now); }
export function summarize(session, now = Date.now()) {
  const elapsed = Math.min(session.durationSeconds, Math.max(0, (now - session.startedAt) / 1000));
  return { id: session.id, config: { ...session.config }, durationSeconds: session.durationSeconds,
    elapsedSeconds: Math.round(elapsed), startedAt: session.startedAt, finishedAt: now,
    attempted: session.answers.length, correct: session.answers.filter(a => a.correct).length,
    completed: now >= session.deadline, answers: [...session.answers] };
}
export function rankedRecords(records, config, durationSeconds) {
  return records.filter(r => r.completed && r.correct >= 0 && modeKey(r.config) === modeKey(config) && r.durationSeconds === durationSeconds)
    .sort((a, b) => b.correct - a.correct || (b.correct / (b.attempted || 1)) - (a.correct / (a.attempted || 1)) || a.finishedAt - b.finishedAt);
}
export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
