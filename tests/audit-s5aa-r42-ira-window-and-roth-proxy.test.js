/* S5AA R42 (ChatGPT's R41F-03 and R41F-04, the R41F whole-model audit; the owner 2026-09-30: "Repair all five in R42") --
 * AN IRA'S SPOUSAL WINDOW, AND THE ROTH PROXY'S WORKED SHARE.
 *
 * R41F-03, MEASURED at 984197c: on a joint return, an owner whose own work covered half a full row was given half a year's
 * IRA window although the spouse worked the whole row: a $7,500 traditional IRA deposited $3,750. The spousal window (Q162
 * 5c, IRC 219(c)) counted the spouse's work only when the owner did not work at all. Now the window is the longer of the
 * owner's own work and the spouse's, each bounded by the owner's stop age and life.
 *
 * R41F-04, MEASURED at 984197c: the Roth IRA limit's declared salary-only MAGI proxy read each salary at its ANNUAL rate,
 * so a spouse earning $260,000 a year for half a row ($130,000 of wages and AGI) put the household above the $252,000 end
 * of the joint phaseout: the $7,500 Roth deposit was refused. Now each salary is read at its share actually worked.
 *
 * Rows are labelled by their closing age. Expected figures are hand-derived from the model's 2026 rules (the prediction
 * record, audit/S5AA/R42/), not read from another engine run.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));

function rowOf(p, age) {
  const r = L.h.engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  assert.equal(L.h.validateScenario(structuredClone(p)).valid, true);
  const row = r.rows.find((x) => x.age === age);
  assert.ok(row, 'row ' + age);
  return row;
}
function spousal({ age = 45, spouseAge = 44, retireAge = 45.5, salary = 10000, spouseSalary = 100000, owner = 'self' } = {}) {
  const p = L.basePlan({ couple: true, age, spouseAge, retireAge, endAge: age + 1, salary, spouseSalary, spending: 0, returnRate: 0, inflation: 0,
    accounts: [L.account('ira', 'traditionalIRA', 0, { contribution: 7500, owner }), L.account('cash', 'taxable', 0, { basisPct: 100 })] });
  p.employment.contributionStop = 55;
  return p;
}
function roth({ spouseSalary = 260000, retireAge = 45.5 } = {}) {
  const p = L.basePlan({ couple: true, age: 44, spouseAge: 45, retireAge, endAge: 45, salary: 0, spouseSalary, spending: 0, returnRate: 0, inflation: 0,
    accounts: [L.account('self-roth', 'rothIRA', 0, { contribution: 7500 })] });
  p.employment.contributionStop = 55;
  return p;
}

test('R42 (R41F-03): the spouse works the whole row, the owner half -- the owner\'s $7,500 IRA is deposited in full', () => {
  const row = rowOf(spousal(), 46);
  assert.equal(row.contributions, 7500);
  assert.equal(row.federalAgi, 97500);
  // federal (97,500 - 32,200 = 65,300): 10% x 24,800 + 12% x 40,500 = 7,340; Arizona 2.5% x 65,300 = 1,632.50; payroll 7.65% x 105,000 = 8,032.50
  assert.equal(row.taxes, 17005);
});

test('R42 (R41F-03), reciprocal: the spouse owns the IRA and works half the row while the self works all of it', () => {
  // self 44 retiring at 45.5 works the whole row to 45; the spouse, 45, works to 45.5 -- half of it
  const p = spousal({ age: 44, spouseAge: 45, salary: 100000, spouseSalary: 10000, owner: 'spouse' });
  assert.equal(rowOf(p, 45).contributions, 7500);
});

test('R42 (R41F-03) control: both stop halfway through the row -- half a year\'s window, $3,750, as before', () => {
  const p = spousal({ age: 45, spouseAge: 45 });
  assert.equal(rowOf(p, 46).contributions, 3750);
});

test('R42 (R41F-04): $260,000 a year earned for half the row is a $130,000 proxy -- the Roth deposit of $7,500 is allowed', () => {
  const row = rowOf(roth(), 45);
  assert.equal(row.federalAgi, 130000);
  assert.equal(row.contributions, 7500);
  assert.equal(row.roth, 7500);
});

test('R42 (R41F-04) control: $260,000 earned for the whole row is above the $252,000 end of the phaseout -- no Roth deposit', () => {
  const row = rowOf(roth({ retireAge: 50 }), 45);
  assert.equal(row.federalAgi, 260000);
  assert.equal(row.roth, 0);
});

test('R42 (R41F-04, the one-time path, found by the R42F audit): a one-time $7,500 transfer into the Roth reads the same worked-share proxy', () => {
  // the same household as R41F-04: a one-time transfer from taxable into the self's Roth IRA at 44.5, counted as a contribution
  const p = L.basePlan({ couple: true, age: 44, spouseAge: 45, retireAge: 45.5, endAge: 45, salary: 0, spouseSalary: 260000, spending: 0, returnRate: 0, inflation: 0,
    accounts: [L.account('brok', 'taxable', 50000, { basisPct: 100 }), L.account('self-roth', 'rothIRA', 0)] });
  p.employment.contributionStop = 55;
  Object.assign(p.advanced, { transferOn: true, transferFrom: 'brok', transferTo: 'self-roth', transferAmount: 7500, transferAge: 44.5 });
  // proxy 260,000 x 0.5 = 130,000, below the 242,000 start of the joint phase-out; joint compensation 130,000; nothing else contributed
  assert.equal(rowOf(p, 45).roth, 7500);
});
