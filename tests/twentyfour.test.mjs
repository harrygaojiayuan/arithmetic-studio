import test from 'node:test';
import assert from 'node:assert/strict';
import { TWENTY_FOUR_CONFIG, validConfig, modeKey, modeLabel, solveTwentyFour, storedTwentyFourSolution, makeQuestion, checkTwentyFourAnswer, validTwentyFourNumbers, twentyFourBoard, summarize, rankedRecords } from '../dist/core.mjs';
import { TWENTY_FOUR_BANK } from '../dist/twentyfour-bank.mjs';

// Independent exhaustive reference: all permutations, operators and five binary
// tree shapes. With four operands <= 10, distinct results cannot approach 24
// within this tolerance; this oracle does not reuse the production fraction code.
function referenceSolvable(numbers) {
  const ops = [(a,b)=>a+b, (a,b)=>a-b, (a,b)=>a*b, (a,b)=>b===0 ? NaN : a/b];
  for (let i=0;i<4;i++) for (let j=0;j<4;j++) for (let k=0;k<4;k++) {
    if (i===j || i===k || j===k) continue;
    const l=6-i-j-k, [a,b,c,d]=[numbers[i],numbers[j],numbers[k],numbers[l]];
    for (const x of ops) for (const y of ops) for (const z of ops) {
      const values=[z(y(x(a,b),c),d),z(x(a,y(b,c)),d),x(a,z(y(b,c),d)),x(a,y(b,z(c,d))),y(x(a,b),z(c,d))];
      if (values.some(v=>Math.abs(v-24)<1e-9)) return true;
    }
  }
  return false;
}

test('solver agrees with an independent oracle for all 715 possible unordered hands, and each solution passes exact validation', () => {
  let hands=0;
  for (let a=1;a<=10;a++) for (let b=a;b<=10;b++) for (let c=b;c<=10;c++) for (let d=c;d<=10;d++) {
    const numbers=[a,b,c,d], solution=solveTwentyFour(numbers);
    assert.equal(Boolean(solution),referenceSolvable(numbers),numbers.join(','));
    assert.equal(Boolean(storedTwentyFourSolution(numbers)),Boolean(solution),`bank completeness: ${numbers}`);
    if (solution) assert.equal(checkTwentyFourAnswer(numbers,solution).correct,true,`${numbers}: ${solution}`);
    hands++;
  }
  assert.equal(hands,715);
});

test('fraction-only hands, negative intermediates, duplicate numbers, 10, precedence and Unicode are supported exactly', () => {
  for (const [numbers, expression] of [
    [[3,3,8,8],'8/(3-8/3)'], [[1,3,4,6],'6/(1-3/4)'],
    [[1,5,5,5],'5*(5-1/5)'],
    [[1,2,3,4],'(1-3)*(2-4)'], [[2,3,4,10],'10+2+3*4'],
    [[3,3,8,8],'8÷（3−8÷3）'], [[1,2,3,4],'4×3×2×1'],
  ]) {
    const checked=checkTwentyFourAnswer(numbers,expression);
    assert.equal(checked.valid,true,expression);
    assert.equal(checked.correct,expression !== '(1-3)*(2-4)',expression);
  }
  assert.equal(checkTwentyFourAnswer([1,2,3,4],'1/(2+3+4)').value,'1/9');
  assert.equal(checkTwentyFourAnswer([1,2,3,4],'(1-4)*(2*3)').value,'-18');
});

test('interactive moves preserve exact fractions, operand order, undo, reset and saved progress', () => {
  const numbers=[3,3,8,8];
  const moves=[{left:2,right:0,operator:'/'},{left:1,right:2,operator:'-'},{left:3,right:1,operator:'/'}];
  const fractionBoard=twentyFourBoard(numbers,moves.slice(0,1));
  assert.equal(fractionBoard[2].numerator,'8'); assert.equal(fractionBoard[2].denominator,'3');
  assert.equal(fractionBoard[0],null);
  const intermediate=twentyFourBoard(numbers,moves.slice(0,2));
  assert.equal(intermediate[1].numerator,'1'); assert.equal(intermediate[1].denominator,'3');
  const final=twentyFourBoard(numbers,JSON.parse(JSON.stringify(moves)));
  assert.equal(final.filter(Boolean).length,1); assert.equal(final[3].numerator,'24'); assert.equal(final[3].denominator,'1');
  assert.equal(checkTwentyFourAnswer(numbers,final[3].expression).correct,true);
  // Undo is a replay without the last move; resetting replays no moves.
  assert.deepEqual(twentyFourBoard(numbers,moves.slice(0,-1)),intermediate);
  assert.equal(twentyFourBoard(numbers,[]).filter(Boolean).length,4);
  assert.deepEqual(numbers,[3,3,8,8]); assert.equal(moves.length,3);
  assert.equal(twentyFourBoard([1,2,3,4],[{left:0,right:3,operator:'-'}])[0].numerator,'-3');
  for (const invalid of [[{left:0,right:0,operator:'+'}],[{left:0,right:9,operator:'+'}],[{left:0,right:1,operator:'^'}],[...moves,{left:1,right:2,operator:'+'}],[moves[0],{left:0,right:1,operator:'+'}]]) assert.throws(()=>twentyFourBoard(numbers,invalid));
  assert.throws(()=>twentyFourBoard([1,1,2,4],[{left:0,right:1,operator:'-'},{left:2,right:0,operator:'/'}]),/0/);
});

test('only the given four numbers, binary arithmetic and parentheses are accepted', () => {
  for (const expression of ['', '24','1+2+3','1+2+3+4+0','1+2+3+3','12+3*4','1 2+3+4','2(1+3)+4',
    '1+2+3+4!','1+2+3**4','1+2+3^4','1+2+3%4','1+2+3+4=24','1.0+2+3+4','1e0+2+3+4',
    '01+2+3+4','-1+2+3+4','(1+2)*(3+4','1+2)+3+4','1+2+3+4;alert(1)',
    'Math.max(1,2,3,4)','1+2+3+4//','1+2+3+4/* */','('.repeat(161)]) {
    assert.equal(checkTwentyFourAnswer([1,2,3,4],expression).valid,false,expression);
  }
  assert.equal(checkTwentyFourAnswer([1,1,2,4],'4/(1-1)*2').valid,false);
  assert.equal(checkTwentyFourAnswer([1,2,3,4],'1+2+3+4').valid,true);
  assert.equal(checkTwentyFourAnswer([1,2,3,4],'1+2+3+4').correct,false);
  assert.equal(solveTwentyFour([1,1,1,1]),null);
  for (const numbers of [[0,1,2,3],[1,2,3,11],[1,2,3],[1,2,3,4,5],['1',2,3,4]]) {
    assert.equal(validTwentyFourNumbers(numbers),false);
    assert.equal(solveTwentyFour(numbers),null);
  }
});

test('generation draws and shuffles verified hands without search, including random-source boundary values', () => {
  let state=923;
  const random=()=>{state=(state*16807)%2147483647;return (state-1)/2147483646;};
  for (const rng of [()=>0,()=>1,()=>0.999999,random]) for (let i=0;i<(rng===random ? 500 : 2);i++) {
    const q=makeQuestion(TWENTY_FOUR_CONFIG,rng);
    assert.equal(validTwentyFourNumbers(q.numbers),true);
    assert.equal(checkTwentyFourAnswer(q.numbers,q.solution).correct,true);
  }
});

test('all 566 bank entries are unique, valid and reachable; shuffling never changes or mutates the chosen hand', () => {
  assert.equal(TWENTY_FOUR_BANK.length,566);
  assert.equal(new Set(TWENTY_FOUR_BANK.map(e=>e.slice(0,4).join(','))).size,566);
  const original=JSON.stringify(TWENTY_FOUR_BANK);
  for (let index=0;index<TWENTY_FOUR_BANK.length;index++) {
    const entry=TWENTY_FOUR_BANK[index];
    assert.equal(checkTwentyFourAnswer(entry.slice(0,4),entry[4]).correct,true);
    for (const shuffle of [0,0.4,0.7,0.99999]) {
      let calls=0;
      const q=makeQuestion(TWENTY_FOUR_CONFIG,()=>calls++===0 ? (index+0.5)/TWENTY_FOUR_BANK.length : shuffle);
      assert.equal(calls,4); // one draw and exactly three swaps, regardless of hand
      assert.deepEqual([...q.numbers].sort((a,b)=>a-b),entry.slice(0,4));
      assert.equal(checkTwentyFourAnswer(q.numbers,q.solution).correct,true);
    }
  }
  assert.equal(JSON.stringify(TWENTY_FOUR_BANK),original);
});

test('24-point scores persist through summaries and rank separately from arithmetic and other durations', () => {
  assert.equal(validConfig(TWENTY_FOUR_CONFIG),true);
  assert.match(modeLabel(TWENTY_FOUR_CONFIG),/24/);
  assert.notEqual(modeKey(TWENTY_FOUR_CONFIG),modeKey({n:1,m:1,operator:'add'}));
  const session={id:'24',config:TWENTY_FOUR_CONFIG,durationSeconds:60,startedAt:0,deadline:60000,answers:[{correct:true},{correct:false,skipped:true}]};
  const record=summarize(session,60000);
  assert.equal(record.correct,1); assert.equal(record.attempted,2);
  assert.deepEqual(rankedRecords([record,{...record,id:'arithmetic',config:{n:1,m:1,operator:'add'}},{...record,id:'long',durationSeconds:120},{...record,id:'early',completed:false}],TWENTY_FOUR_CONFIG,60).map(r=>r.id),['24']);
});
