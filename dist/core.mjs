import { TWENTY_FOUR_BANK } from './twentyfour-bank.mjs';

export const SYMBOLS = { add: '+', subtract: '−', multiply: '×', divide: '÷' };
export const NAMES = { add: '加法', subtract: '减法', multiply: '乘法', divide: '除法' };
export const DEFAULT_CONFIG = { n: 2, m: 2, operator: 'add' };
export const DIVISION_RULE = 'composite-dividend-exact-v1';
export const TWENTY_FOUR_CONFIG = Object.freeze({ mode: 'twentyfour' });
export function isTwentyFour(c) { return c?.mode === 'twentyfour'; }
export function validConfig(c) {
  return isTwentyFour(c) || (!!c && !c.mode && Number.isInteger(c.n) && c.n >= 1 && c.n <= 6 && Number.isInteger(c.m) && c.m >= 1 && c.m <= 6 && Object.hasOwn(SYMBOLS, c.operator));
}
export function modeKey(c) { return isTwentyFour(c) ? 'twentyfour:1-10:v1' : `${c.n}:${c.operator}:${c.m}`; }
export function modeLabel(c) { return isTwentyFour(c) ? '24 点 · 四个数算出 24' : `${c.n} 位数 ${SYMBOLS[c.operator]} ${c.m} 位数`; }
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
  if (isTwentyFour(c)) return makeTwentyFourQuestion(random);
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

// Reduced rational arithmetic is shared by the solver and the expression parser.
// No floating-point tolerance: 8 / (3 - 8 / 3) is exactly 24.
function fraction(n, d = 1n) {
  if (d === 0n) throw new Error('除数不能为 0。');
  if (d < 0n) { n = -n; d = -d; }
  let a = n < 0n ? -n : n, b = d;
  while (b) { const r = a % b; a = b; b = r; }
  return { n: n / a, d: d / a };
}
function combineFractions(a, b, op) {
  if (op === '+') return fraction(a.n * b.d + b.n * a.d, a.d * b.d);
  if (op === '-') return fraction(a.n * b.d - b.n * a.d, a.d * b.d);
  if (op === '*') return fraction(a.n * b.n, a.d * b.d);
  return fraction(a.n * b.d, a.d * b.n);
}
export function validTwentyFourNumbers(numbers) {
  return Array.isArray(numbers) && numbers.length === 4 && numbers.every(n => Number.isInteger(n) && n >= 1 && n <= 10);
}
export function twentyFourBoard(numbers, moves = []) {
  if (!validTwentyFourNumbers(numbers) || !Array.isArray(moves) || moves.length > 3) throw new Error('题目或操作步骤无效。');
  const tiles = numbers.map(n => ({ value: fraction(BigInt(n)), expression: String(n) }));
  for (const move of moves) {
    if (!move || !Number.isInteger(move.left) || !Number.isInteger(move.right) || move.left === move.right || !tiles[move.left] || !tiles[move.right] || !['+','-','*','/'].includes(move.operator)) throw new Error('请选择两个不同的数字方格和一个运算符。');
    const left = tiles[move.left], right = tiles[move.right];
    tiles[move.left] = { value: combineFractions(left.value, right.value, move.operator), expression: `(${left.expression}${move.operator}${right.expression})` };
    tiles[move.right] = null;
  }
  // Only strings leave this function, so boards can safely cross UI/test boundaries.
  return tiles.map(tile => tile && ({ numerator: String(tile.value.n), denominator: String(tile.value.d), expression: tile.expression }));
}
export function solveTwentyFour(numbers) {
  if (!validTwentyFourNumbers(numbers)) return null;
  const failed = new Set();
  function search(items) {
    if (items.length === 1) return items[0].value.n === 24n * items[0].value.d ? items[0].expression : null;
    const key = items.map(x => `${x.value.n}/${x.value.d}`).sort().join(',');
    if (failed.has(key)) return null;
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const rest = items.filter((_, index) => index !== i && index !== j);
      const a = items[i], b = items[j];
      for (const [left, right, op] of [[a,b,'+'],[a,b,'*'],[a,b,'-'],[b,a,'-'],[a,b,'/'],[b,a,'/']]) {
        if (op === '/' && right.value.n === 0n) continue;
        const found = search([...rest, { value: combineFractions(left.value, right.value, op), expression: `(${left.expression}${op}${right.expression})` }]);
        if (found) return found;
      }
    }
    failed.add(key);
    return null;
  }
  const solution = search(numbers.map(n => ({ value: fraction(BigInt(n)), expression: String(n) })));
  return solution ? solution.slice(1, -1) : null;
}
export function makeTwentyFourQuestion(random = Math.random) {
  // One uniform hand selection plus Fisher–Yates. No runtime search or retries.
  const pick = size => Math.max(0, Math.min(size - 1, Math.floor(random() * size)));
  const entry = TWENTY_FOUR_BANK[pick(TWENTY_FOUR_BANK.length)];
  const numbers = entry.slice(0, 4);
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  return { numbers, solution: entry[4] };
}
const twentyFourSolutions = new Map(TWENTY_FOUR_BANK.map(entry => [entry.slice(0,4).join(','),entry[4]]));
export function storedTwentyFourSolution(numbers) {
  return validTwentyFourNumbers(numbers) ? twentyFourSolutions.get([...numbers].sort((a,b)=>a-b).join(',')) ?? null : null;
}
export function checkTwentyFourAnswer(numbers, input) {
  try {
    if (!validTwentyFourNumbers(numbers)) throw new Error('题目数字无效。');
    const source = String(input).trim().replace(/[×÷−（）]/g, ch => ({ '×':'*', '÷':'/', '−':'-', '（':'(', '）':')' })[ch]);
    if (!source) throw new Error('先写下你的算式，再提交吧。');
    if (source.length > 160 || /[^\d\s+*/()\-]/.test(source)) throw new Error('只能使用题目中的四个整数、加减乘除和括号。分数请用除号表示。');
    const tokens = source.match(/\d+|[^\s]/g) || [];
    let position = 0;
    const available = [...numbers];
    function atom() {
      const token = tokens[position++];
      if (token === '(') {
        const value = sum();
        if (tokens[position++] !== ')') throw new Error('括号不匹配，请检查算式。');
        return value;
      }
      if (!/^(?:[1-9]|10)$/.test(token ?? '')) throw new Error('请输入完整算式，数字之间需要加减乘除符号。');
      const index = available.indexOf(Number(token));
      if (index < 0) throw new Error('四个数字必须各用一次，不能添加、拼接或重复使用数字。');
      available.splice(index, 1);
      return fraction(BigInt(token));
    }
    function product() {
      let value = atom();
      while (tokens[position] === '*' || tokens[position] === '/') { const op = tokens[position++]; value = combineFractions(value, atom(), op); }
      return value;
    }
    function sum() {
      let value = product();
      while (tokens[position] === '+' || tokens[position] === '-') { const op = tokens[position++]; value = combineFractions(value, product(), op); }
      return value;
    }
    const value = sum();
    if (position !== tokens.length) throw new Error('算式格式不正确，请检查括号与运算符。');
    if (available.length) throw new Error('请将题目中的四个数字各用一次。');
    return { valid: true, correct: value.n === 24n * value.d, value: value.d === 1n ? String(value.n) : `${value.n}/${value.d}` };
  } catch (error) { return { valid: false, correct: false, error: error.message }; }
}
