import test from 'node:test';
import assert from 'node:assert/strict';
import { validConfig, validDuration, makeQuestion, answerFor, parseAnswer, checkAnswer, remainingMs, summarize, rankedRecords, formatClock } from '../dist/core.mjs';

test('all 144 digit/operator combinations retain each operand’s configured digit length', () => {
  for (const operator of ['add','subtract','multiply','divide']) for (let n=1;n<=6;n++) for (let m=1;m<=6;m++) {
    for (const rng of [() => 0, () => 0.999999999, Math.random]) {
      const q = makeQuestion({ n, m, operator }, rng);
      assert.equal(String(q.a).length,n); assert.equal(String(q.b).length,m); assert.ok(q.b > 0);
      assert.ok(Number.isFinite(answerFor(q,operator)));
    }
  }
});
test('calculations handle negative answers, large products and rounded division', () => {
  assert.equal(answerFor({a:9,b:99},'subtract'),-90);
  assert.equal(answerFor({a:999999,b:999999},'multiply'),999998000001);
  assert.equal(answerFor({a:1,b:6},'divide'),0.17);
  assert.equal(answerFor({a:1,b:8},'divide'),0.13);
  assert.equal(answerFor({a:99,b:10},'divide'),9.9);
  assert.equal(answerFor({a:1,b:999999},'divide'),0);
  assert.equal(checkAnswer({a:99,b:10},'divide','9.90'),true);
  assert.equal(checkAnswer({a:9,b:99},'subtract','−90'),true);
  assert.equal(checkAnswer({a:1,b:6},'divide','0.166666'),false);
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
