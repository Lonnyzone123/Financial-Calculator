'use strict';
// Read-only public-route witnesses for R43-01 to R43-03 at s5aa-r43-source (5b8f0d5).
// Run from the repository root: node audit/S5AA/R43/S5AA_R43_EXTERNAL_REPRO_20261001.js
const assert = require('node:assert/strict');
const L = require('../R40/S5AA_R40_CONSERVATION_GRID/lib.js');

function run(plan) {
  const valid = L.h.validateScenario(structuredClone(plan));
  const result = L.h.engine.runPlan(structuredClone(plan));
  assert.equal(valid.valid, true, JSON.stringify(valid.issues));
  assert.equal(result.status, 'ok', result.calculationErrorCode);
  return result;
}

// R43-01: the owner assumes Medicare begins at 65 and stopped planned HSA
// contributions then. A taxable-to-HSA transfer is a one-time contribution.
function hsaPlan(mode) {
  const plan = L.basePlan({ age: 66, retireAge: 70, endAge: 67, salary: 10000, spending: 0,
    accounts: [L.account('cash', 'taxable', 20000, { basisPct: 100 }),
      L.account('hsa', 'hsa', 0, { contribution: mode === 'planned' ? 4400 : 0 })] });
  plan.employment.contributionStop = 70;
  if (mode === 'once') Object.assign(plan.advanced, {
    transferOn: true, transferFrom: 'cash', transferTo: 'hsa', transferAmount: 4400, transferAge: 66
  });
  return plan;
}
const plannedHsa = run(hsaPlan('planned'));
const oneTimeHsa = run(hsaPlan('once'));
assert.equal(plannedHsa.rows[1].hsa, 0);
assert.equal(oneTimeHsa.rows[1].hsa, 4400);
console.log('R43-01: planned HSA at 66 = $0; one-time taxable-to-HSA contribution at 66 = $4,400; expected one-time $0.');

// R43-02: the R43 today-dollar latch makes a $5,000 employment stream starting
// ten years hence pay $5,000 x 1.10^10. Planned IRA compensation sees this
// amount; transferRoom() recomputes compensation without the latch.
function iraPlan(mode) {
  const plan = L.basePlan({ age: 55, retireAge: 66, endAge: 66, inflation: 10, salary: 0, spending: 0,
    otherIncomes: [{ id: 'job', name: 'Job', type: 'employment', owner: 'self', amount: 5000,
      start: 65, end: 66, growth: 0, growthMode: 'fixed' }],
    accounts: [L.account('cash', 'taxable', 20000, { basisPct: 100 }),
      L.account('ira', 'traditionalIRA', 0, { contribution: mode === 'planned' ? 7500 : 0 })] });
  plan.employment.contributionStop = 66;
  if (mode === 'once') Object.assign(plan.advanced, {
    transferOn: true, transferFrom: 'cash', transferTo: 'ira', transferAmount: 7500, transferAge: 65
  });
  return plan;
}
const plannedIra = run(iraPlan('planned'));
const oneTimeIra = run(iraPlan('once'));
const rowAt66 = (result) => result.rows.find((row) => row.age === 66);
assert.equal(Math.round(rowAt66(oneTimeIra).income * 100) / 100, 12968.71);
assert.equal(rowAt66(plannedIra).preTax, 7500);
assert.equal(rowAt66(oneTimeIra).preTax, 5000);
console.log('R43-02: earned compensation $12,968.71; planned IRA $7,500; one-time IRA $5,000; expected one-time $7,500.');

// R43-03: SA42F-05's published contribution witness also tested a negative
// profit-share percentage. The new contract types it but leaves it unbounded.
function employerPlan(profitShare) {
  return L.basePlan({ age: 45, retireAge: 46, endAge: 46, salary: 100000, spending: 0,
    accounts: [L.account('cash', 'taxable', 0), L.account('k', 'traditional401k', 0,
      { contribution: 10000, matchOn: true, matchRate: 50, matchCap: 6, profitShare })] });
}
const validEmployer = run(employerPlan(5));
const negativeEmployer = run(employerPlan(-10));
assert.equal(validEmployer.rows[1].preTax, 18000);
assert.equal(negativeEmployer.rows[1].preTax, 10000);
console.log('R43-03: profitShare +5% -> $18,000 in 401(k); -10% is valid/ok and yields $10,000; expected input refusal.');
