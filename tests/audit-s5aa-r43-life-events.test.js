/* S5AA R43 (the owner 2026-09-30: repair all 34 of Claude's R42F findings, and rule on three declared items) -- LIFE EVENTS,
 * REQUIRED DISTRIBUTIONS AND MEDICARE.
 *
 * SA42F-03, MEASURED at c67c713: an owner who died in the first distribution year, before the required beginning date, was charged
 * that year's RMD (Pub. 590-B; 26 CFR 1.401(a)(9)-2(a)(3)(ii) and -3): $18,867.92 from a $500,000 IRA where none is due.
 * SA42F-04: an account owned by "spouse" in a plan with no spouse was read three ways (no RMD, no QCD, the 10% at a hidden age).
 * SA42F-11: a retired spouse of 65 or over paid no Medicare while the self still worked; the owner chose to charge each person 65
 * or over (MODEL_ASSUMPTIONS 18.4).
 * SA42F-29: in a row where a death came before a mid-row retirement, the survivor cut read the retirement date, not the row's
 * opening (decision 7).
 * The owner's ruling, survivor costs: when the self dies before the household's retirement age and the surviving spouse has no
 * salary, the survivor's spending and health costs start at the death; with a salary, at the retirement age, as before.
 * S5AA R45 (the owner, 2026-10-03, rule 4): a death before retiring is a stop WHATEVER the survivor earns, and the survivor's pay funds
 * spending first. The salary control and SA42F-29's year of death below are adapted to it (R45 prediction record).
 *
 * Rows are labelled by their closing age. Every expected figure is hand-derived from the rules and the inputs.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R42F', 'SA42F', 'RMD-ROTH', 'lib.js'));
const SH = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R42F', 'SA42F', 'STATE-HEALTH', 'common.js'));
const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));

const cents = (x) => Math.round(x * 100) / 100;
function run(p) {
  assert.equal(L.h.validateScenario(structuredClone(p)).valid, true);
  const r = L.h.engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  return r;
}
const at = (r, age) => { const row = r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };

// SA42F-03, witness A: self 72 (born 1954, first distribution year at 73: the row closing at 74), a $500,000 IRA, dies at 73.5.
function ira(selfLife) {
  const p = R.plan({ age: 72, endAge: 76, spouseOn: true, spouseAge: 65, accounts: [R.acct('ira', 'traditionalIRA', 500000)] });
  p.retirement.selfLife = selfLife;
  return p;
}
test('R43 (SA42F-03): an IRA owner who dies in the first distribution year owes no RMD for it', () => {
  const r = R.check(ira(73.5));
  assert.equal(r.rows[2].rmd, 0);                    // the row closing at 74
  assert.equal(r.rows[2].preTax, 500000);
});
test('R43 (SA42F-03) control: the owner lives -- the first RMD is 500,000 / 26.5', () => {
  assert.equal(cents(R.check(ira(120)).rows[2].rmd), cents(500000 / 26.5));
});
test('R43 (SA42F-03): a 401(k) owner who retires at 75.3 and dies at 75.6 owes no RMD for that first year', () => {
  const p = R.plan({ age: 74, endAge: 77, spouseOn: true, spouseAge: 65, retireAge: 75.3, accounts: [R.acct('k', 'traditional401k', 500000, { contribution: 0, currentEmployerPlan: true })] });
  p.employment.salary = 100000; p.employment.contributionStop = 75.3; p.retirement.selfLife = 75.6;
  assert.equal(R.check(p).rows[2].rmd, 0);           // the row closing at 76; it was 500,000 / 24.6
});

// SA42F-04: single, 75, an IRA marked as the spouse's, no spouse in the plan (a hidden spouse age of 50).
function spouseOwned(owner) {
  const p = R.plan({ age: 75, endAge: 77, retireAge: 75, spouseOn: false, spouseAge: 50, spending: 20000, qcd: 5000,
    accounts: [R.acct('ira', 'traditionalIRA', 300000, { owner })] });
  return p;
}
test('R43 (SA42F-04): with no spouse in the plan, a "spouse" account is the only person\'s -- RMD, QCD and no 10%', () => {
  const r = R.check(spouseOwned('spouse'));
  assert.equal(cents(r.rows[1].rmd), cents(300000 / 24.6));        // 12,195.12, the owner of 75's Uniform divisor
  const asSelf = R.check(spouseOwned('self'));
  assert.equal(r.rows[1].taxes, asSelf.rows[1].taxes);             // the same return: the QCD excluded, no 10% at 75
  assert.equal(r.rows[1].federalAgi, asSelf.rows[1].federalAgi);
});
test('R43 (SA42F-04): the validator says such an account is read as the only person\'s', () => {
  const v = L.h.validateScenario(structuredClone(spouseOwned('spouse')));
  // the helper puts a cash account first, so the IRA is accounts[1]
  assert.ok(v.issues.some((x) => x.code === 'SPOUSE_ACCOUNT_WITHOUT_SPOUSE' && x.severity === 'WARNING' && x.path === 'accounts[1].owner'),
    JSON.stringify(v.issues.map((x) => x.code + ':' + x.path)));
});
test('R43 (SA42F-04): the form offers a spouse owner only while a spouse is included', () => {
  const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
  assert.ok(shell.includes('.filter(function(o){return spouseOK||o[0]!=="spouse"})'), 'the account owner select drops "Spouse" without a spouse');
});

// SA42F-11: self 60 working ($80,000 to 67); spouse 68, retired. Standard Part B, the deductible and the Part D base premium.
const MED = 202.90 * 12 + 283 + 38.99 * 12;
test('R43 (SA42F-11): a retired spouse of 68 is charged Medicare while the self still works', () => {
  const a = SH.base({ age: 60, endAge: 63, retireAge: 67, filing: 'mfj', spouseOn: true, spouseAge: 68 });
  Object.assign(a.employment, { salary: 80000, contributionStop: 101 });
  Object.assign(a.advanced, { healthOn: true, healthCost: 0, healthInflation: 0 });
  const r = SH.check(a);
  for (let k = 1; k <= 3; k++) assert.equal(cents(r.rows[k].spending), cents(MED), 'row ' + r.rows[k].age);
});
test('R43 (SA42F-11) control: the same household with the roles swapped is charged the same, as before', () => {
  const b = SH.base({ age: 68, endAge: 71, retireAge: 67, filing: 'mfj', spouseOn: true, spouseAge: 60 });
  Object.assign(b.employment, { spouseSalary: 80000, contributionStop: 101 });
  Object.assign(b.advanced, { healthOn: true, healthCost: 0, healthInflation: 0 });
  const r = SH.check(b);
  for (let k = 1; k <= 3; k++) assert.equal(cents(r.rows[k].spending), cents(MED), 'row ' + r.rows[k].age);
});

// The owner's ruling, survivor costs: self 55 (retiring at 65, $100,000), spouse 63; the self dies at 56.5; $50,000 of spending.
function early(spouseSalary) {
  const p = L.basePlan({ couple: true, age: 55, spouseAge: 63, retireAge: 65, endAge: 60, salary: 100000, spouseSalary, spending: 50000,
    accounts: [L.account('brok', 'taxable', 2000000, { basisPct: 100 })] });
  p.employment.contributionStop = 65;
  Object.assign(p.retirement, { selfLife: 56.5, survivor: true, survivorSpendingReduction: 0 });
  return p;
}
test('R43 (owner ruling, survivor costs): the self dies before retiring and the spouse has no salary -- spending starts at the death', () => {
  const r = run(early(0));
  assert.equal(at(r, 56).spending, 0);
  assert.equal(cents(at(r, 57).spending), 25000);     // from 56.5: half the row, costed for two in the year of death (decision 7)
  assert.equal(cents(at(r, 58).spending), 50000);
  assert.equal(cents(at(r, 60).spending), 50000);
});
test('R43 (owner ruling, survivor costs), as R45 rule 4 makes it: the surviving spouse still has a salary -- spending starts at the death too', () => {
  // R43 kept spending at 0 here (the salary exception). R45: the death at 56.5 is the first stop whatever the survivor earns.
  const r = run(early(40000));
  assert.equal(at(r, 56).spending, 0);
  assert.equal(cents(at(r, 57).spending), 25000);
  assert.equal(cents(at(r, 58).spending), 50000);
  assert.equal(cents(at(r, 60).spending), 50000);
});

// SA42F-29: a same-age couple of 60; the self dies at 60.25, the household retires at 60.5; $80,000 incomeFirst spending, a 50%
// survivor reduction. R45 (rule 4): the death at 60.25 is itself the first stop, so the household's costs start there, before the
// mid-row retirement at 60.5; the year of death is still costed for two, read at the row's opening.
function cut(retireAge) {
  const p = L.basePlan({ couple: true, age: 60, spouseAge: 60, retireAge, endAge: 63, strategy: 'incomeFirst', spending: 80000, spouseSalary: 10000,
    accounts: [L.account('roth', 'rothIRA', 900000), L.account('sroth', 'rothIRA', 900000, { owner: 'spouse' })] });
  Object.assign(p.retirement, { survivor: true, survivorSpendingReduction: 50, selfLife: 60.25 });
  return p;
}
test('R43 (SA42F-29), with R45\'s start at the death: the year of death is costed for two, read at the row\'s opening -- $60,000, not $30,000', () => {
  const r = run(cut(60.5));
  assert.equal(cents(at(r, 61).spending), 60000);    // from the death at 60.25: 0.75 of the row, for two (R43: $40,000 from 60.5)
  assert.equal(cents(at(r, 62).spending), 40000);    // a survivor row: 80,000 x 50%
});
test('R43 (SA42F-29) control: retiring at the row\'s opening, the year of death is $80,000', () => {
  assert.equal(cents(at(run(cut(60)), 61).spending), 80000);
});
