'use strict';
// Self/spouse swap: the same household with the owners exchanged must give the same Social Security figures.
const { couple, run } = require('./lib.js');
let plans = 0, bad = 0;
function pair(label, a, b) {
  plans += 2;
  const ra = run(couple(a)).rows.map(x => x.income.toFixed(2)), rb = run(couple(b)).rows.map(x => x.income.toFixed(2));
  const same = JSON.stringify(ra) === JSON.stringify(rb);
  if (!same) bad++;
  console.log(label + ': ' + (same ? 'SAME' : 'DIFFERENT') + '  ' + JSON.stringify(ra) + ' vs ' + JSON.stringify(rb));
}
// Survivor after an early-claimant's death, 2-year age gap, earnings none.
pair('survivor early claimant', { age: 67, spouseAge: 65, years: 4, ssBenefit: 3000, ssClaim: 62, spouseSS: 1000, spouseClaim: 62, selfLife: 68.5 },
  { age: 65, spouseAge: 67, years: 4, ssBenefit: 1000, ssClaim: 62, spouseSS: 3000, spouseClaim: 62, spouseLife: 68.5 });
// Survivor starting before 60 -> at 60, mid-row.
pair('survivor from 60 mid-row', { age: 70, spouseAge: 57.5, years: 5, ssBenefit: 2500, ssClaim: 67, spouseSS: 0, spouseClaim: 67, selfLife: 71 },
  { age: 57.5, spouseAge: 70, years: 5, ssBenefit: 0, ssClaim: 67, spouseSS: 2500, spouseClaim: 67, spouseLife: 71 });
// COLA with a claim before the plan.
pair('COLA claim before plan', { age: 70, spouseAge: 66, years: 3, ssBenefit: 2000, ssClaim: 67, spouseSS: 1500, spouseClaim: 64, ssCola: 2.8, survivor: false },
  { age: 66, spouseAge: 70, years: 3, ssBenefit: 1500, ssClaim: 64, spouseSS: 2000, spouseClaim: 67, ssCola: 2.8, survivor: false });
console.log(`plans run: ${plans}; different: ${bad}`);
