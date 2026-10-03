/* S5AA R45 (the owner, 2026-10-03: "both spouses need their own retirement date"; and the owner's AA1 decisions of the same day) --
 * EACH SPOUSE'S OWN RETIREMENT DATE, AND THE HOUSEHOLD DATE.
 *
 * The owner's rules:
 * 1. profile.spouseRetireAge is the spouse's retirement age on the spouse's own clock; absent, the spouse retires at
 *    profile.retireAge on their own clock, as before.
 * 2. Household costs start at the FIRST stop, on the primary's clock; whoever still works has their net pay fund spending first.
 * 3. Only an earner's stop counts: a spouse with no salary does not start household spending.
 * 4. A death before retiring is a stop, on either side (this replaces R43's salary exception).
 * 5. The household date drives retired spending, the strategy's anchor, debt-and-housing costs, the reserve and pay-first. AA1:
 *    pre-Medicare health costs start at advanced.healthCoverageEndAge (absent, the household date); Roth conversions start at
 *    advanced.conversionStartAge (absent, the primary's retirement age, as before); retirement.spendingStartAge, when entered,
 *    replaces the first stop.
 * 6. Each person's own date drives their work and wages, the 401(k) still-working RMD exception and the Rule of 55.
 * 8. The validator's "retirement age before the current age" warning fires only with a salary, for either spouse.
 *
 * Rows are labelled by their closing age, on the primary's clock. Returns and inflation are 0. Every expected figure is
 * hand-derived from the rules and the inputs; the derivation sits beside each case.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const { validateScenario } = require(path.join(__dirname, '..', 'src', 'scenario-validator.js'));

const cents = (x) => Math.round(x * 100) / 100;
function run(p) {
  const v = validateScenario(structuredClone(p));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  return r;
}
const at = (r, age) => { const row = r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };
const roth = (balance, extra) => L.account('roth', 'rothIRA', balance, extra);
const warnings = (p, code) => validateScenario(structuredClone(p)).issues.filter((i) => i.code === code);

// --- Rules 1-3: an older, earning spouse who stops first ---------------------------------------------------------------------
// Self 60 (retiring at 65, $100,000); spouse 62 ($50,000), retiring at their own 63 = the self's 61. First stop: 61.
function olderEarner(o = {}) {
  const p = L.basePlan({ couple: true, age: 60, spouseAge: 62, retireAge: 65, endAge: 64, salary: 100000,
    spouseSalary: o.spouseSalary ?? 50000, spending: 40000, accounts: [roth(1000000)] });
  p.employment.contributionStop = 65;
  if (o.spouseRetireAge !== null) p.profile.spouseRetireAge = o.spouseRetireAge ?? 63;
  return p;
}
test('R45 rules 1-2: the earning spouse stops at their own 63 (self 61) -- household spending starts there, the self\'s pay funds it', () => {
  const r = run(olderEarner());
  assert.equal(at(r, 61).spending, 0, 'the first row closes at the household date');
  assert.equal(at(r, 61).income, 150000, 'both work the whole first row');
  assert.equal(cents(at(r, 62).spending), 40000, 'from 61: $40,000 a year');
  assert.equal(at(r, 62).income, 100000, 'the spouse has stopped: only the self\'s salary');
  assert.equal(cents(at(r, 62).total), 1000000, 'the self\'s net pay ($100,000 less tax) covers the $40,000; the Roth is untouched');
});
test('R45 rule 3 control: the same spouse with no salary stops nothing -- spending waits for the self\'s 65', () => {
  const r = run(olderEarner({ spouseSalary: 0 }));
  for (const age of [61, 62, 63, 64]) assert.equal(at(r, age).spending, 0, 'row ' + age);
});
test('R45 rule 1 fallback: with no spouse date, the spouse retires at 65 on their own clock (self 63) -- spending from 63', () => {
  const r = run(olderEarner({ spouseRetireAge: null }));
  assert.equal(at(r, 63).spending, 0);
  assert.equal(at(r, 63).income, 150000, 'the spouse still works the row closing at 63');
  assert.equal(cents(at(r, 64).spending), 40000);
  assert.equal(at(r, 64).income, 100000);
});

// --- Rule 6: a younger spouse's own window -------------------------------------------------------------------------------
// Self 60 (retiring at 62); spouse 55 ($50,000), retiring at their own 58 = the self's 63. First stop: the self's 62.
function youngerEarner(spouseRetireAge) {
  const p = L.basePlan({ couple: true, age: 60, spouseAge: 55, retireAge: 62, endAge: 65, salary: 100000, spouseSalary: 50000,
    spending: 40000, accounts: [roth(1000000)] });
  if (spouseRetireAge !== undefined) p.profile.spouseRetireAge = spouseRetireAge;
  return p;
}
test('R45 rule 6: a younger spouse retiring at their own 58 earns to the self\'s 63, and no longer', () => {
  const r = run(youngerEarner(58));
  assert.equal(cents(at(r, 63).spending), 40000, 'household spending from the self\'s 62');
  assert.equal(at(r, 63).income, 50000, 'the spouse works the row closing at 63');
  assert.equal(at(r, 64).income, 0, 'and has stopped by the next');
});
test('R45 rule 6 control: with no spouse date, the spouse works to their own 62 (self 67), past the end', () => {
  const r = run(youngerEarner(undefined));
  assert.equal(at(r, 64).income, 50000);
  assert.equal(at(r, 65).income, 50000);
});

// --- Rule 4: deaths are stops, on both sides -----------------------------------------------------------------------------
// Self 52 (retiring at 65, $100,000); spouse 50 ($60,000); the self dies at 55. A survivor reduction of 0.
function selfDies(spouseSalary) {
  const p = L.basePlan({ couple: true, age: 52, spouseAge: 50, retireAge: 65, endAge: 58, salary: 100000, spouseSalary, spending: 40000,
    accounts: [roth(1000000)] });
  p.employment.contributionStop = 65;
  Object.assign(p.retirement, { selfLife: 55, survivor: true, survivorSpendingReduction: 0 });
  return p;
}
test('R45 rule 4: the self dies at 55 before retiring; the spouse earns -- spending starts at the death, the survivor\'s pay first', () => {
  const r = run(selfDies(60000));
  assert.equal(at(r, 55).spending, 0);
  assert.equal(cents(at(r, 56).spending), 40000);
  assert.equal(at(r, 56).income, 60000, 'the survivor keeps working');
  assert.equal(cents(at(r, 56).total), 1000000, 'the survivor\'s net pay covers the $40,000');
});
test('R45 rule 4 control: with no salary the start is the death too (R43\'s rule, unchanged)', () => {
  const r = run(selfDies(0));
  assert.equal(at(r, 55).spending, 0);
  assert.equal(cents(at(r, 56).spending), 40000);
});
// Self 60 (retiring at 65, $100,000); spouse 60, earning $50,000 to their own 65, dies at 62.
function spouseDies(spouseSalary) {
  const p = L.basePlan({ couple: true, age: 60, spouseAge: 60, retireAge: 65, endAge: 64, salary: 100000, spouseSalary, spending: 40000,
    accounts: [roth(1000000)] });
  p.employment.contributionStop = 65;
  Object.assign(p.retirement, { spouseLife: 62, survivor: true, survivorSpendingReduction: 0 });
  return p;
}
test('R45 rule 4, symmetric: an earning spouse dies at 62 before retiring -- spending starts there, the self\'s pay first', () => {
  const r = run(spouseDies(50000));
  assert.equal(at(r, 62).spending, 0);
  assert.equal(cents(at(r, 63).spending), 40000);
  assert.equal(at(r, 63).income, 100000);
});
test('R45 rule 4 control: a spouse with no salary dying stops nothing -- spending waits for the self\'s 65', () => {
  const r = run(spouseDies(0));
  for (const age of [63, 64]) assert.equal(at(r, age).spending, 0, 'row ' + age);
});

// --- AA1 inputs: conversions, health coverage, the spending override ------------------------------------------------------
// A single 60, retiring at 65, no salary: a $300,000 IRA, an empty Roth IRA, $100,000 of taxable cash for the tax.
function conversions(conversionStartAge) {
  const p = L.basePlan({ age: 60, retireAge: 65, endAge: 66, spending: 0,
    accounts: [L.account('cash', 'taxable', 100000), L.account('ira', 'traditionalIRA', 300000), roth(0)] });
  Object.assign(p.advanced, { conversionOn: true, conversionAmount: 20000 });
  if (conversionStartAge !== undefined) p.advanced.conversionStartAge = conversionStartAge;
  return p;
}
test('R45 (AA1-40): conversions start at the entered age, 62 -- $20,000 a year from then', () => {
  const r = run(conversions(62));
  assert.equal(at(r, 62).roth, 0);
  assert.equal(cents(at(r, 63).roth), 20000);
  assert.equal(cents(at(r, 64).roth), 40000);
});
test('R45 (AA1-40) control: with no start age, conversions start at the retirement age, 65, as before', () => {
  const r = run(conversions(undefined));
  assert.equal(at(r, 65).roth, 0);
  assert.equal(cents(at(r, 66).roth), 20000);
});
// A single 60, retiring at 62 with a salary; $12,000 a year of pre-Medicare health cost, 0% health inflation; a Roth only.
function coverage(healthCoverageEndAge) {
  const p = L.basePlan({ age: 60, retireAge: 62, endAge: 65, salary: 100000, spending: 0, healthOn: true, accounts: [roth(500000)] });
  Object.assign(p.advanced, { healthCost: 12000, healthInflation: 0 });
  if (healthCoverageEndAge !== undefined) p.advanced.healthCoverageEndAge = healthCoverageEndAge;
  return p;
}
test('R45 (AA1-40): employer coverage to 64 -- no health cost until then, $12,000 a year from it', () => {
  const r = run(coverage(64));
  assert.equal(at(r, 63).withdrawals, 0, 'still covered');
  assert.equal(at(r, 64).withdrawals, 0, 'still covered');
  assert.equal(cents(at(r, 65).withdrawals), 12000, 'from 64, Roth draws untaxed at 64');
});
test('R45 (AA1-40) control: with no coverage age, the cost starts at the household date, 62', () => {
  const r = run(coverage(undefined));
  assert.equal(cents(at(r, 63).withdrawals), 12000);
});
// A single 60, retiring at 62, no salary; $40,000 a year of spending from a Roth.
function override(spendingStartAge) {
  const p = L.basePlan({ age: 60, retireAge: 62, endAge: 65, spending: 40000, accounts: [roth(1000000)] });
  if (spendingStartAge !== undefined) p.retirement.spendingStartAge = spendingStartAge;
  return p;
}
test('R45 (AA1-38/39): "retired spending begins at" 63 replaces the first stop', () => {
  const r = run(override(63));
  assert.equal(at(r, 63).spending, 0);
  assert.equal(cents(at(r, 64).spending), 40000);
});
test('R45 (AA1-38/39): the override may also be earlier than the retirement -- 61', () => {
  const r = run(override(61));
  assert.equal(at(r, 61).spending, 0);
  assert.equal(cents(at(r, 62).spending), 40000);
});
test('R45 (AA1-38/39) control: no override -- spending from the retirement age, 62', () => {
  const r = run(override(undefined));
  assert.equal(at(r, 62).spending, 0);
  assert.equal(cents(at(r, 63).spending), 40000);
});

// --- Rule 6: the Rule of 55 and the still-working RMD exception on the spouse's own date -----------------------------------
// A retired couple of 56 (MFJ). $20,000 of spending from the spouse's $500,000 401(k) (receiving contributions, so the current
// employer's plan), Rule of 55 on. Under the $32,200 joint standard deduction (federal and Arizona) there is no income tax, so
// the draw D is 20,000 free, or D = 20,000 + 0.10 D = 22,222.22 with the 10%.
function rule55(spouseRetireAge) {
  const p = L.basePlan({ couple: true, age: 56, spouseAge: 56, retireAge: 56, endAge: 58, strategy: 'incomeFirst', spending: 20000,
    accounts: [L.account('k', 'traditional401k', 500000, { owner: 'spouse', contribution: 5000 })] });
  p.employment.contributionStop = 50;
  p.advanced.rule55 = true;
  p.profile.spouseRetireAge = spouseRetireAge;
  return p;
}
test('R45 rule 6: the spouse left work at their own 50 -- the Rule of 55 does not apply to their 401(k)', () => {
  assert.equal(cents(run(rule55(50)).rows[1].withdrawals), 22222.22);
});
test('R45 rule 6 control: the spouse left at their own 55 -- it applies', () => {
  assert.equal(cents(run(rule55(55)).rows[1].withdrawals), 20000);
});
// Self 70, retired; spouse 73 (born 1953: RMDs from 73), earning $50,000 with a $500,000 current-employer 401(k).
function stillWorking(spouseRetireAge) {
  const p = L.basePlan({ couple: true, age: 70, spouseAge: 73, retireAge: 70, endAge: 71, spouseSalary: 50000, spending: 0, rmdOn: true,
    accounts: [L.account('k', 'traditional401k', 500000, { owner: 'spouse', contribution: 5000 })] });
  p.profile.spouseRetireAge = spouseRetireAge;
  return p;
}
test('R45 rule 6: a spouse working to their own 76 owes no RMD from the current employer\'s 401(k) at 73', () => {
  assert.equal(run(stillWorking(76)).rows[1].rmd, 0);
});
test('R45 rule 6 control: retired at their own 70, the spouse owes 500,000 / 26.5 = 18,867.92', () => {
  assert.equal(cents(run(stillWorking(70)).rows[1].rmd), 18867.92);
});

// --- Rule 8 and the contract ---------------------------------------------------------------------------------------------
test('R45 rule 8: a past retirement age warns only beside a salary, for either spouse', () => {
  const self = L.basePlan({ age: 60, retireAge: 55 });
  assert.equal(warnings(self, 'INCONSISTENT_AGES').length, 0, 'retired, no salary');
  self.employment.salary = 50000;
  assert.equal(warnings(self, 'INCONSISTENT_AGES').length, 1, 'a salary beside a past retirement');
  const sp = L.basePlan({ couple: true, age: 60, spouseAge: 60, retireAge: 60 });
  sp.profile.spouseRetireAge = 55;
  assert.equal(warnings(sp, 'INCONSISTENT_AGES').length, 0, 'spouse retired, no salary');
  sp.employment.spouseSalary = 30000;
  const w = warnings(sp, 'INCONSISTENT_AGES');
  assert.equal(w.length, 1);
  assert.equal(w[0].path, 'profile.spouseRetireAge');
});
test('R45: the four new values are numbers -- text or a negative age is refused by the validator and the engine', () => {
  for (const [obj, key] of [['profile', 'spouseRetireAge'], ['retirement', 'spendingStartAge'], ['advanced', 'conversionStartAge'], ['advanced', 'healthCoverageEndAge']]) {
    for (const bad of ['60', -1]) {
      const p = L.basePlan({ couple: true });
      p[obj][key] = bad;
      const v = validateScenario(structuredClone(p));
      assert.equal(v.valid, false, obj + '.' + key + ' = ' + JSON.stringify(bad));
      const r = engine.runPlan(structuredClone(p));
      assert.equal(r.calculationErrorCode, typeof bad === 'number' ? 'SCENARIO_PLAN_VALUE_OUT_OF_RANGE' : 'SCENARIO_NONNUMBER_PLAN_VALUE', obj + '.' + key + ' = ' + JSON.stringify(bad));
    }
  }
});
test('R45 (the owner\'s also-include): self-employment income counts as earned income for the contribution warning', () => {
  const p = L.basePlan({ age: 50, retireAge: 60, salary: 0, accounts: [L.account('ira', 'traditionalIRA', 0, { contribution: 7000 })] });
  p.employment.contributionStop = 60;
  p.retirement.otherIncomes = [{ type: 'selfEmployment', owner: 'self', amount: 50000, start: 50, end: 60, growth: 0, growthMode: 'fixed' }];
  assert.equal(warnings(p, 'CONTRIBUTIONS_ABOVE_EARNED_INCOME').length, 0, '$7,000 against $50,000 of self-employment income');
  p.retirement.otherIncomes = [];
  assert.equal(warnings(p, 'CONTRIBUTIONS_ABOVE_EARNED_INCOME').length, 1, 'CONTROL: no earned income at all');
});
