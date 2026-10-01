'use strict';
// FLOWS-02 candidate: a "Set annual spending" stage's amount is read in TODAY'S dollars under "Match inflation" but as NOMINAL
// dollars at the stage's start under "No annual change" and "Fixed annual change". The app fills the amount from the
// "Annual spending in today's dollars" field. Owner's decision 6 (R35, SA32F-36) for fixed-nominal spending: grow the
// today's-dollar figure to the date spending starts, then hold it.
// Run: node repro-FLOWS-02-stage-set-amount-dollar-basis.js
const { plan, account, run, cmp, summary } = require('./flib.js');
function mk(growthMode, annualChange = 0) {
  return plan({ age: 55, retireAge: 65, endAge: 70, inflation: 3, strategy: 'incomeFirst', spending: 40000,
    stages: [{ name: 'Go-go', start: 65, end: 69, mode: 'amount', value: 40000, growthMode, annualChange }],
    accounts: [account('roth', 'rothIRA', 3000000)] });
}
const IF65 = Math.pow(1.03, 10);
const base = run(plan({ age: 55, retireAge: 65, endAge: 70, inflation: 3, strategy: 'incomeFirst', spending: 40000, accounts: [account('roth', 'rothIRA', 3000000)] }));
const at = (r, a) => r.rows.find(x => x.age === a).spending;
console.log('no stage (incomeFirst, $40,000 today\'s dollars): row 66', at(base, 66).toFixed(2), 'row 68', at(base, 68).toFixed(2));
for (const [g, c] of [['inflation', 0], ['none', 0], ['fixed', 0], ['fixed', 2]]) {
  const r = run(mk(g, c));
  console.log(`stage $40,000 ${g}${g === 'fixed' ? ' ' + c + '%' : ''}: row 66 ${at(r, 66).toFixed(2)}  row 67 ${at(r, 67).toFixed(2)}  row 68 ${at(r, 68).toFixed(2)}  validator=${r._warn.join(',') || '-'} issues=${(r.issues || []).map(i => i.code).join(',') || '-'}`);
}
// Hand (today's-dollar amount, decision 6's reading for a held amount): the stage opens at 65, inflation factor 1.03^10.
cmp('Match inflation, row 66', at(run(mk('inflation')), 66), 40000 * IF65);
cmp('No annual change, row 66 (40,000 x 1.03^10, held)', at(run(mk('none')), 66), 40000 * IF65);
cmp('No annual change, row 68 (held)', at(run(mk('none')), 68), 40000 * IF65);
cmp('Fixed 2%, row 66 (40,000 x 1.03^10)', at(run(mk('fixed', 2)), 66), 40000 * IF65);
cmp('Fixed 2%, row 67 (x 1.02)', at(run(mk('fixed', 2)), 67), 40000 * IF65 * 1.02);
// The crisp form: at 3% inflation, "Match inflation" and "Fixed annual change 3%" grow the amount at the same rate, so under ANY one
// reading of the amount they must agree in every row. They differ by the whole 1.03^10 from the first stage row.
cmp('stage: Fixed 3% equals Match inflation at 3% inflation, row 66', at(run(mk('fixed', 3)), 66), at(run(mk('inflation')), 66));
cmp('stage: Fixed 3% equals Match inflation at 3% inflation, row 68', at(run(mk('fixed', 3)), 68), at(run(mk('inflation')), 68));
// The same shape in a recurring income stream (Increase method: Fixed annual increase / Match inflation / Social Security COLA):
// a $30,000 rental from 65, owner 55 now, 3% inflation. "Match inflation" inflates from the PLAN's start; "Fixed 3%" from the
// income's start.
function inc(growthMode, growth) {
  return plan({ age: 55, retireAge: 55, endAge: 68, inflation: 3, strategy: 'fixedNominal', spending: 0,
    otherIncomes: [{ name: 'Rent', type: 'rental', owner: 'self', amount: 30000, start: 65, end: 90, growth, growthMode }],
    accounts: [account('roth', 'rothIRA', 100000)] });
}
const ri = run(inc('inflation', 0)), rf = run(inc('fixed', 3));
console.log('income row 66: Match inflation', ri.rows.find(x => x.age === 66).income.toFixed(2), ' Fixed 3%', rf.rows.find(x => x.age === 66).income.toFixed(2));
cmp('income: Fixed 3% equals Match inflation at 3% inflation, row 66', rf.rows.find(x => x.age === 66).income, ri.rows.find(x => x.age === 66).income);
summary();
