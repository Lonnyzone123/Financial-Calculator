/* S5 block 2q -- Q59's two validator warnings: a plan whose contributions no
 * modelled income funds, and a debt whose payments are excluded from spending.
 *
 * Decided 2026-09-13 (the owner): document the boundary (MODEL_ASSUMPTIONS.md section
 * 7) and warn at validation, with no engine change. Decided 2026-09-14: the two
 * codes are exempt from the generator's zero-warnings test, and "wages" means
 * the household's earned income, so a spousal IRA funded from the other spouse's
 * pay is not reported.
 *
 * The contribution check mirrors the engine at the starting age: an owner
 * contributes only inside ownerContributionEligibility()'s window, each such
 * owner's accounts plan what accountPlannedContribution() gives, and earned
 * income is those owners' salaries. Measured before this landed, the check as
 * written agreed with the engine's own view on every generated seed and every
 * stored plan. Each control below is broken by its own mutant of the check.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const { validateScenario } = require('../src/scenario-validator.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs.js');

const CONTRIBUTIONS = 'CONTRIBUTIONS_ABOVE_EARNED_INCOME';
const DEBT = 'DEBT_PAYMENT_OUTSIDE_SPENDING';
const clone = (v) => JSON.parse(JSON.stringify(v));
const base = extractDefaultPlan(shell);

let serial = 0;
function account(over) {
  serial += 1;
  return Object.assign({
    id: 'acct' + serial, name: 'Account', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1000,
    basisPct: 100, contribution: 0, contributionMode: 'amount', priority: 1, annualChange: 0,
    annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {},
    matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }, over);
}
/* A working household at 40, retiring at 65, with no income unless a test adds it. */
function household(edit) {
  const p = clone(base);
  p.setupComplete = true;
  Object.assign(p.profile, { age: 40, retireAge: 65, spouseOn: false, spouseAge: 40 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 65 });
  p.accounts = [];
  p.advanced.debts = [];
  if (edit) edit(p);
  return p;
}
const debt = (over) => Object.assign({
  id: 'debt1', name: 'Loan', type: 'otherDebt', owner: 'household', balance: 12000, rate: 5, rateType: 'fixed',
  paymentMonthly: 500, extraPrincipalMonthly: 0, payoffAge: 60, includePayment: true, includeHousingCosts: false,
}, over);
const issuesOf = (p, code) => validateScenario(clone(p)).issues.filter((i) => i.code === code);

test('Q59: contributions with no earned income behind them are warned about, and the plan stays valid', () => {
  const p = household((x) => { x.accounts = [account({ type: 'rothIRA', taxClass: 'roth', contribution: 500 })]; });
  const found = issuesOf(p, CONTRIBUTIONS);
  assert.equal(found.length, 1, 'a working owner with no salary contributing $500 a year must be warned about exactly once');
  assert.equal(found[0].severity, 'WARNING');
  assert.equal(found[0].path, 'accounts');
  assert.equal(validateScenario(clone(p)).valid, true, 'a warning, not a rejection');
});

test('Q59: a debt whose payments are excluded from spending is warned about, and the plan stays valid', () => {
  const p = household((x) => { x.advanced.debts = [debt({ includePayment: false })]; });
  const found = issuesOf(p, DEBT);
  assert.equal(found.length, 1, 'a debt with a balance whose payments are outside spending must be warned about exactly once');
  assert.equal(found[0].severity, 'WARNING');
  assert.equal(found[0].path, 'advanced.debts[0].includePayment');
  assert.equal(validateScenario(clone(p)).valid, true, 'a warning, not a rejection');
});

test('Q59 control: a spousal IRA funded from the other spouse\'s pay is not reported', () => {
  const p = household((x) => {
    x.profile.spouseOn = true;
    x.employment.spouseSalary = 80000;
    x.accounts = [account({ type: 'traditionalIRA', taxClass: 'preTax', contribution: 7000 })];
  });
  assert.equal(issuesOf(p, CONTRIBUTIONS).length, 0, 'earned income is the household\'s, not the owner\'s alone');
});

test('Q59 control: contributions exactly equal to earned income are not reported', () => {
  const p = household((x) => { x.employment.salary = 50000; x.accounts = [account({ contribution: 50000 })]; });
  assert.equal(issuesOf(p, CONTRIBUTIONS).length, 0, 'only contributions ABOVE earned income are unfunded');
});

test('Q59 control: a retired spouse\'s account is not counted', () => {
  /* The owner earns $60,000 and contributes $10,000; the spouse, past the work
     window, has a $55,000 contribution configured and no salary. Counting the
     spouse's account would make $65,000 against $60,000. */
  const p = household((x) => {
    x.profile.spouseOn = true;
    x.profile.spouseAge = 70;
    x.employment.salary = 60000;
    x.employment.spouseSalary = 0;
    x.accounts = [account({ contribution: 10000 }), account({ owner: 'spouse', contribution: 55000 })];
  });
  assert.equal(issuesOf(p, CONTRIBUTIONS).length, 0, 'a spouse past the work window does not contribute');
});

test('Q59 control: a plan past its contribution stop is not reported', () => {
  const p = household((x) => { x.profile.age = 66; x.profile.retireAge = 70; x.accounts = [account({ contribution: 20000 })]; });
  assert.equal(issuesOf(p, CONTRIBUTIONS).length, 0, 'a plan that no longer contributes has nothing unfunded to report');
});

test('Q59 control: a debt counted in spending, or one with nothing left to pay, is not reported', () => {
  assert.equal(issuesOf(household((x) => { x.advanced.debts = [debt({ includePayment: true })]; }), DEBT).length, 0,
    'a debt whose payments count toward spending is funded like any other spending');
  assert.equal(issuesOf(household((x) => { x.advanced.debts = [debt({ includePayment: false, balance: 0 })]; }), DEBT).length, 0,
    'a debt with nothing left to pay has no payments to leave unfunded');
});
