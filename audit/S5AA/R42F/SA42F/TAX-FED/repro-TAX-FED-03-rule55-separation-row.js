'use strict';
// TAX-FED-03: under the Rule of 55, the row in which the owner separates charges the 10% on draws that all follow the separation.
// Run: node repro-TAX-FED-03-rule55-separation-row.js
const h = require('../harness.js'); const g = h.grid;
function plan(retireAge) {
  const p = g.basePlan({ age: 54, retireAge, endAge: 58, spending: 40000, accounts: [g.account('k', 'traditional401k', 1e6)] });
  p.advanced.rule55 = true; p.employment.contributionStop = retireAge; return p;
}
for (const ra of [55.5, 55]) {
  const p = plan(ra); const v = h.validateScenario(structuredClone(p)); const r = h.engine.runPlan(structuredClone(p));
  console.log(`separation at ${ra}: valid ${v.valid}, status ${r.status}`);
  r.rows.slice(1, 4).forEach(x => console.log(`   row closing ${x.age}: spending ${x.spending}, 401(k) draw ${x.withdrawals.toFixed(2)}, taxes ${x.taxes.toFixed(2)}`));
}
// Hand, row [55,56) with separation at 55.5: spending 20,000 (half a retired year), single, no other income, no 10% (72(t)(2)(A)(v)).
// W = 20,000 + 10%(W - 16,100) + 2.5%(W - 16,100)  (taxable income stays inside the 10% bracket)
const W = (20000 - 0.125 * 16100) / 0.875;
console.log(`hand (no 10%): draw ${W.toFixed(2)}, taxes ${(W - 20000).toFixed(2)}`);
const Wp = (20000 - 0.125 * 16100) / 0.775;
console.log(`hand (with 10%, what the engine charges): draw ${Wp.toFixed(2)}, taxes ${(Wp - 20000).toFixed(2)}, of which 10% = ${(0.1 * Wp).toFixed(2)}`);
console.log('REPRO DONE');
