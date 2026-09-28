/* S5AA R26 round: AN IRA CONTRIBUTION CANNOT EXCEED TAXABLE COMPENSATION (found in passing in R25's self-audit, SA25-10;
 * repair chosen by the owner 2026-09-26: "Enforce it").
 *
 * IRS Publication 590-A: an IRA contribution "can't be more than ... your taxable compensation for the year", where
 * compensation is the wages "properly shown in box 1 ... of Form W-2" (which excludes elective deferrals) and
 * self-employment earnings -- not pensions, interest or dividends. On a joint return, the spouses' combined IRA
 * contributions are limited by their combined compensation (the spousal IRA). auditContributions() applied only the
 * dollar limits, so a person with no salary could contribute: 4 of r16's 70 members did (seed:2, seed:10, seed:14 and
 * seed:17, Roth IRAs with a $0 salary), and a traditional IRA contribution with no salary produced an IRA deduction the
 * tax quote and the committed tax treated differently, ending a validator-valid plan in TAX_SETTLEMENT_MISMATCH from 50
 * (audit/S5AA/R25/S5AA_R25_FOUND_IN_PASSING_SETTLEMENT_WITNESS.js).
 *
 * Now traditional and Roth IRA contributions together are capped at compensation -- salary, plus employment and
 * self-employment other income, less the owner's pre-tax workplace and HSA contributions -- per owner, or combined on a
 * joint return. The excess is treated as today's dollar-limit excess: redirected to a taxable account under the default
 * "redirect" policy. Self-employment profit is counted whole (the deductible half of SE tax is not subtracted), which
 * overstates that compensation by at most about 7%.
 * All through runPlan() on validator-valid plans at a 0% return: an IRA's year-end balance is its opening balance plus
 * what it was allowed to receive.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const acct = (id, type, taxClass, balance, contribution, o = {}) => Object.assign({ id, name: id, type, taxClass, owner: 'self',
  balance, basisPct: taxClass === 'taxable' ? 100 : 0, contribution, contributionMode: 'amount', annualChange: 0,
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0,
  matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }, o);

function run(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const joint = !!o.spouse;
  Object.assign(p.profile, { age: 40, retireAge: 55, endAge: 41, spouseOn: joint, filing: joint ? 'mfj' : 'single' });
  if (joint) Object.assign(p.profile, { spouseAge: 40, spouseRetireAge: 55 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: o.salary || 0, spouseSalary: o.spouseSalary || 0, growth: 0, contributionStop: 55 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: o.otherIncomes || [] });
  Object.assign(p.advanced, { assetsOn: false, rmdOn: false, transferOn: false, conversionOn: false, healthOn: false,
    networthOn: true, otherAssets: [], debts: [] });
  p.limitPolicy = 'redirect';
  p.accounts = [acct('cash', 'taxable', 'taxable', 100000, 0, { priority: 9 })].concat(o.accounts);
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return { r, p };
}
/* What a tax class received in the year: rows report balances by class, and each plan below holds one account per class
   it tests (plus the taxable "cash" account that takes a redirected excess). */
const received = (result, cls) => result.r.rows[1][cls] - result.r.rows[0][cls];

test('R26: with no compensation, a $7,000 Roth IRA contribution is not allowed -- the IRA receives $0 (it received $7,000)', () => {
  const res = run({ salary: 0, accounts: [acct('roth', 'rothIRA', 'roth', 50000, 7000, { priority: 1 })] });
  assert.equal(received(res, 'roth'), 0);
});

test('R26: $3,000 of salary allows a traditional IRA contribution of $3,000 of the $7,000 requested', () => {
  const res = run({ salary: 3000, accounts: [acct('ira', 'traditionalIRA', 'preTax', 50000, 7000, { priority: 1 })] });
  assert.equal(received(res, 'preTax'), 3000);
});

test('R26: a 401(k) deferral is not compensation -- $10,000 of salary less an $8,000 deferral allows $2,000 to an IRA', () => {
  /* The IRA is a Roth IRA so that its class (roth) is apart from the 401(k)'s (preTax). */
  const res = run({ salary: 10000, accounts: [acct('k', 'traditional401k', 'preTax', 50000, 8000, { priority: 1 }),
    acct('ira', 'rothIRA', 'roth', 50000, 7000, { priority: 2 })] });
  assert.equal(received(res, 'preTax'), 8000, 'the deferral itself is within its own limit');
  assert.equal(received(res, 'roth'), 2000);
});

test('R26: employment and self-employment income are compensation -- $20,000 of each lets a salary-less owner contribute', () => {
  for (const type of ['employment', 'selfEmployment']) {
    const res = run({ salary: 0, otherIncomes: [{ name: 'w', type, owner: 'self', amount: 20000, start: 30, end: 70, growth: 0, growthMode: 'fixed' }],
      accounts: [acct('roth', 'rothIRA', 'roth', 50000, 7000, { priority: 1 })] });
    assert.equal(received(res, 'roth'), 7000, type + ' income is compensation');
  }
});

test('R26: on a joint return the spouses share their combined compensation -- $10,000 funds $7,000 and then $3,000', () => {
  const res = run({ spouse: true, salary: 10000, spouseSalary: 0, accounts: [
    acct('mine', 'rothIRA', 'roth', 50000, 7000, { priority: 1 }),
    acct('theirs', 'rothIRA', 'roth', 50000, 7000, { priority: 2, owner: 'spouse' })] });
  assert.equal(received(res, 'roth'), 10000, '$7,000 to the first, and the $3,000 the combined compensation leaves to the spousal IRA');
});

test('R26 CONTROL: ample compensation leaves both spouses\' contributions untouched (the spousal IRA)', () => {
  const res = run({ spouse: true, salary: 100000, spouseSalary: 0, accounts: [
    acct('mine', 'rothIRA', 'roth', 50000, 7000, { priority: 1 }),
    acct('theirs', 'rothIRA', 'roth', 50000, 7000, { priority: 2, owner: 'spouse' })] });
  assert.equal(received(res, 'roth'), 14000, 'both $7,000 contributions');
});

test('SA25-10: the R25 witness -- a young plan contributing to a traditional IRA past 50 with no salary -- now runs', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const A = (id, type, tc, bal, pr) => acct(id, type, tc, bal, 5000, { priority: pr, basisPct: tc === 'taxable' ? 100 : 0 });
  p.accounts = [A('a1', 'taxable', 'taxable', 300000, 1), A('a2', 'traditionalIRA', 'preTax', 200000, 2)];
  Object.assign(p.retirement, { pension: 12000, ssBenefit: 24000 });
  assert.equal(validateScenario(JSON.parse(JSON.stringify(p))).valid, true);
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode + ' at ' + r.calculationErrorAge);
});
