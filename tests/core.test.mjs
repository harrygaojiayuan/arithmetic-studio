import test from 'node:test';
import assert from 'node:assert/strict';
import { DIVISION_RULE, validConfig, validDuration, normalizeConfig, isExactDivision, isPrime, isAllowedDividend, isAllowedDivisor, makeQuestion, answerFor, parseAnswer, checkAnswer, remainingMs, summarize, rankedRecords, formatClock } from '../dist/core.mjs';

test('all supported digit/operator combinations retain each operand’s configured digit length', () => {
  for (const operator of ['add','subtract','multiply','divide']) for (let n=1;n<=6;n++) for (let m=1;m<=6;m++) {
    if (operator === 'divide' && n < m) {
      assert.throws(() => makeQuestion({n,m,operator}), /位数/);
      continue;
    }
    for (const rng of [() => 0, () => 0.999999999, Math.random]) {
      const q = makeQuestion({ n, m, operator }, rng);
      assert.equal(String(q.a).length,n); assert.equal(String(q.b).length,m); assert.ok(q.b > 0);
      assert.ok(Number.isFinite(answerFor(q,operator)));
    }
  }
});
test('calculations handle negative answers, large products and exact integer division', () => {
  assert.equal(answerFor({a:9,b:99},'subtract'),-90);
  assert.equal(answerFor({a:999999,b:999999},'multiply'),999998000001);
  assert.equal(answerFor({a:96,b:12},'divide'),8);
  assert.equal(answerFor({a:999998,b:499999},'divide'),2);
  assert.equal(checkAnswer({a:96,b:12},'divide','8.00'),true);
  assert.equal(checkAnswer({a:96,b:12},'divide','8.0000000001'),false);
  assert.equal(checkAnswer({a:9,b:99},'subtract','−90'),true);
  assert.equal(checkAnswer({a:96,b:12},'divide','7.99'),false);
});
test('every division has a larger composite dividend, a divisor greater than 1 and an integer quotient', () => {
  const primeByTrial = number => {
    if (number < 2) return false;
    for (let d=2;d*d<=number;d++) if (number%d===0) return false;
    return true;
  };
  let state = 941;
  const seeded = () => { state = (state * 16807) % 2147483647; return (state-1) / 2147483646; };
  for (let n=1;n<=6;n++) for (let m=1;m<=n;m++) {
    for (const random of [()=>0,()=>1,()=>0.5,seeded]) for (let i=0;i<250;i++) {
      const q = makeQuestion({n,m,operator:'divide'}, random);
      assert.equal(String(q.a).length,n); assert.equal(String(q.b).length,m);
      assert.ok(q.a > q.b); assert.equal(q.a % q.b,0); assert.ok(q.b > 1);
      assert.equal(primeByTrial(q.a),false,`prime dividend ${q.a}`);
      assert.ok(Number.isInteger(q.a / q.b));
    }
  }
  // Prime divisors 2 and 3 must remain reachable; neither operand may be 1.
  assert.deepEqual(makeQuestion({n:1,m:1,operator:'divide'},()=>0),{a:4,b:2});
  assert.deepEqual(makeQuestion({n:1,m:1,operator:'divide'},()=>0.5),{a:9,b:3});
  assert.deepEqual(makeQuestion({n:1,m:1,operator:'divide'},()=>1),{a:8,b:4});
});
test('dividends exclude primes and 1, while divisors allow primes but exclude 1', () => {
  for (const value of [2,3,5,7,11,97,499,999983]) assert.equal(isPrime(value),true);
  for (const value of [1,4,6,8,9,10,100,999999]) assert.equal(isPrime(value),false);
  for (const value of [0,1,2,3,5,7,11,97,999983]) assert.equal(isAllowedDividend(value),false);
  for (const value of [4,6,8,9,10,12,100,999999]) assert.equal(isAllowedDividend(value),true);
  for (const value of [-1,0,1,1.5]) assert.equal(isAllowedDivisor(value),false);
  for (const value of [2,3,4,5,7,11,97,999983]) assert.equal(isAllowedDivisor(value),true);
  assert.equal(isExactDivision({a:8,b:4}),true);
  for (const q of [{a:4,b:4},{a:4,b:8},{a:10,b:4},{a:10,b:0}]) assert.equal(isExactDivision(q),false);
});
test('division settings keep the changed digit field and adjust the other side when necessary', () => {
  const c = {n:1,m:3,operator:'divide'};
  assert.deepEqual(normalizeConfig(c),{n:3,m:3,operator:'divide'});
  assert.deepEqual(normalizeConfig(c,'n'),{n:1,m:1,operator:'divide'});
  assert.deepEqual(normalizeConfig(c,'m'),{n:3,m:3,operator:'divide'});
  assert.deepEqual(c,{n:1,m:3,operator:'divide'});
  assert.deepEqual(normalizeConfig({...c,operator:'subtract'}),{n:1,m:3,operator:'subtract'});
});
test('strict numeric input rejects empty strings, expressions, infinity, exponent syntax and partial values', () => {
  for (const invalid of ['', ' ', '1+2', '1abc','Infinity','NaN','0x10','1e2','1,000','--1','.']) assert.equal(parseAnswer(invalid),null,invalid);
  for (const [s,n] of [['0',0],['-12',-12],[' .25 ',.25],['+5',5],['5.',5],['12.00',12]]) assert.equal(parseAnswer(s),n);
});
test('parameters reject unsupported digits, operations and durations', () => {
  assert.equal(validConfig({n:2,m:2,operator:'add'}),true);
  for (const c of [{n:0,m:2,operator:'add'},{n:7,m:2,operator:'add'},{n:1,m:1,operator:'__proto__'},{n:'2',m:2,operator:'add'}]) assert.equal(validConfig(c),false);
  for (const n of [0,121,1.5,NaN,'10']) assert.equal(validDuration(n),false);
  assert.equal(validDuration(10),true);
});
const cfg={n:2,m:2,operator:'add'};
const base={id:'s',config:cfg,durationSeconds:60,startedAt:1000,deadline:61000,answers:[{correct:true},{correct:false},{correct:true}]};
test('deadline never becomes negative; complete and early sessions have correct elapsed time and score', () => {
  assert.equal(remainingMs(base,1000),60000); assert.equal(remainingMs(base,61000),0); assert.equal(remainingMs(base,99999),0);
  const early=summarize(base,31000); assert.equal(early.completed,false); assert.equal(early.elapsedSeconds,30); assert.equal(early.attempted,3); assert.equal(early.correct,2);
  const full=summarize(base,90000); assert.equal(full.completed,true); assert.equal(full.elapsedSeconds,60);
  assert.equal(formatClock(60),'01:00'); assert.equal(formatClock(0),'00:00'); assert.equal(formatClock(59.1),'01:00');
});
test('leaderboards isolate both digit positions, operator and duration; early exits excluded and accuracy resolves ties', () => {
  const r=(id,overrides={})=>({...summarize(base,61000),id,finishedAt:61000,...overrides});
  const records=[r('lower',{correct:1}),r('accurate',{correct:2,attempted:2}),r('best',{correct:3}),r('regular'),r('early',{completed:false,correct:50}),r('other-digits',{config:{...cfg,n:3}}),r('other-right',{config:{...cfg,m:3}}),r('other-op',{config:{...cfg,operator:'subtract'}}),r('other-time',{durationSeconds:600})];
  assert.deepEqual(rankedRecords(records,cfg,60).map(x=>x.id),['best','accurate','regular','lower']);
  assert.equal(records[0].id,'lower');
});
test('new division leaderboards exclude old rules while preserving archived records and the rule on summaries', () => {
  const config = {n:2,m:2,operator:'divide'};
  const session = {...base,config,divisionRule:DIVISION_RULE};
  const current = summarize(session,61000);
  assert.equal(current.divisionRule,DIVISION_RULE);
  const legacy = {...current,id:'legacy',correct:3}; delete legacy.divisionRule;
  const oldExact = {...current,id:'old-exact',divisionRule:'exact-larger-v1'};
  const records = [legacy,oldExact,current];
  assert.deepEqual(rankedRecords(records,config,60).map(r=>r.id),['s']);
  assert.equal(records.length,3);
});
