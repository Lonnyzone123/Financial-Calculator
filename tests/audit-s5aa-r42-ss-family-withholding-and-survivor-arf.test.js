/* S5AA R42 (ChatGPT's R41F-01 and R41F-02, the R41F whole-model audit; the owner 2026-09-30: "Repair all five in R42") --
 * A WORKER'S EXCESS EARNINGS REACH THE FAMILY'S BENEFITS, AND A SURVIVOR'S LIMIT READS THE DECEASED'S CREDITED MONTHS.
 *
 * R41F-01, MEASURED at 984197c: a worker of 62 earning $200,000 while claiming had their own $25,200 withheld, and their
 * spouse's $18,000 spousal benefit on the worker's record was still paid: row income $218,000. POMS RS 02501.095: "Withhold
 * the excess earnings of the NH from the total family benefit" (the one exception, an entitled divorced spouse, the model
 * has no such person). Now the worker's excess is charged against the worker's own benefit and the spousal benefit on the
 * worker's record together, in the family's whole months; the spouse's own earnings test applies to what is left.
 *
 * R41F-02, MEASURED at 984197c: the same worker, dying at 67.5 after every early month had been withheld, left a survivor
 * limited to 82.5% of the PIA ($29,700 a year) although the adjusted benefit the worker would have had was the full PIA.
 * RS 00615.320: the limit is the greater of 82.5% of the PIA and "the reduced RIB ... to which the NH would have been
 * entitled if they had lived", with the adjustment of the reduction factor for months withheld while the worker was alive,
 * effective when the worker attained, or would have attained, full retirement age (RS 00615.598).
 *
 * Zero return, inflation, spending and COLA. Rows are labelled by their closing age. Expected figures are hand-derived
 * (the prediction record, audit/S5AA/R42/), not read from another engine run.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));

function plan({ salary = 200000, selfLife = 67.5, spouseSalary = 0 } = {}) {
  const p = L.basePlan({ couple: true, age: 62, spouseAge: 67, retireAge: 67, endAge: 70, salary, spouseSalary, spending: 0, returnRate: 0, inflation: 0,
    ssBenefit: 3000, spouseSS: 0, accounts: [L.account('cash', 'taxable', 2000000, { basisPct: 100 })] });
  Object.assign(p.retirement, { ssClaim: 62, spouseClaim: 67, ssCola: 0, survivor: true, selfLife, spouseLife: 95 });
  p.employment.contributionStop = 67;
  p.advanced.healthOn = false;
  return p;
}
function incomes(p) {
  const r = L.h.engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  assert.equal(L.h.validateScenario(structuredClone(p)).valid, true);
  return Object.fromEntries(r.rows.map((x) => [x.age, x.income]));
}

test('R42 (R41F-01): the worker\'s $87,760 excess exceeds the family\'s $43,200, so the spousal benefit is withheld too', () => {
  // reduced own 2,100 x 12 = 25,200; spousal 1,500 x 12 = 18,000 (the spouse, born 1959, is past FRA); (200,000 - 24,480) / 2 = 87,760
  const inc = incomes(plan({ selfLife: 120 }));
  for (const age of [63, 64, 65, 66, 67]) assert.equal(inc[age], 200000, 'row ' + age);
});

test('R42 (R41F-01): an excess between the worker\'s own benefit and the family\'s reaches the spousal benefit for the rest', () => {
  // salary 90,000: (90,000 - 24,480) / 2 = 32,760, more than the own 25,200 and less than the family's 43,200; all of it is withheld
  const inc = incomes(plan({ salary: 90000, selfLife: 120 }));
  assert.equal(inc[63], 90000 + 43200 - 32760);
});

test('R42 (R41F-01) control: no earnings -- the worker and the spouse are both paid in full', () => {
  const inc = incomes(plan({ salary: 0, selfLife: 120 }));
  assert.equal(inc[63], 43200);
});

test('R42 (R41F-01) control: an excess below the worker\'s own benefit withholds the same total as before', () => {
  // salary 60,000: (60,000 - 24,480) / 2 = 17,760 withheld from the family's 43,200
  const inc = incomes(plan({ salary: 60000, selfLife: 120 }));
  assert.equal(inc[63], 60000 + 43200 - 17760);
});

test('R42 (R41F-02): every early month withheld -- the survivor\'s limit is the adjusted full PIA, $3,000 a month', () => {
  const inc = incomes(plan());
  assert.equal(inc[69], 36000);
  assert.equal(inc[70], 36000);
  // the row of the death: the worker's own 3,000 and the spousal 1,500 for six months, then the survivor 3,000 for six
  assert.equal(inc[68], 18000 + 9000 + 18000);
});

test('R42 (R41F-02) control: the worker lives -- $3,000 own and $1,500 spousal, $54,000 a year', () => {
  assert.equal(incomes(plan({ selfLife: 120 }))[69], 54000);
});

test('R42 (R41F-02) control: nothing withheld -- the limit stays 82.5% of the PIA, $2,475 a month', () => {
  // the worker never earns; the reduced benefit 2,100 is below 82.5% x 3,000 = 2,475
  assert.equal(incomes(plan({ salary: 0 }))[69], 29700);
});

test('R42 (R41F-02): a death BEFORE full retirement age -- the adjustment starts when the worker would have reached 67', () => {
  // withheld while alive: 12 + 12 + 6 = 30 months (row 65: half a year's own 12,600 and spousal 9,000, all within the $37,760 excess)
  const inc = incomes(plan({ selfLife: 64.5 }));
  // row 65: $100,000 of wages; then six months of survivor benefit at the unadjusted limit, 2,475 x 6
  assert.equal(inc[65], 100000 + 14850);
  // before the worker's would-be 67, the limit is the greater of 2,100 and 2,475
  assert.equal(inc[66], 29700);
  assert.equal(inc[67], 29700);
  // from 67: 60 - 30 = 30 reduction months, 1 - 30 x 5/900 = 0.8333..., 3,000 x 0.8333... = 2,500 a month
  assert.equal(inc[68], 30000);
  assert.equal(inc[69], 30000);
});
