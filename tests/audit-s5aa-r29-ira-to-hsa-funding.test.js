/* S5AA R29: A TRADITIONAL IRA TO AN HSA IS A QUALIFIED HSA FUNDING DISTRIBUTION; ANY OTHER PRE-TAX ACCOUNT TO AN HSA IS A
 * DISTRIBUTION FOLLOWED BY A CONTRIBUTION (decided with ChatGPT's PCF-02; the owner 2026-09-28: "Model the funding rule").
 *
 * IRC 408(d)(9): a once-in-a-lifetime transfer from an individual's IRA to their HSA is excluded from income, is not deductible,
 * and counts toward that year's HSA contribution limit. The model's single one-time transfer is at most one such transfer. A
 * 401(k) (or a custom tax-deferred account) has no such rule: its money reaches an HSA only as a taxable distribution -- with
 * the 10% additional tax before 59 1/2 -- followed by a contribution, deductible above the line (IRC 223(a), 62(a)(19)).
 * Either way the HSA receives only the room left (R29's PCF-02), and the rest stays in the source.
 *
 * Hand arithmetic: 0% returns, a $20,000 pension (so a deduction shows in AGI), HSA room $5,400 at 55 or over ($4,400 self-only
 * plus the $1,000 catch-up).
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

const CLASS = { hsa: 'hsa', traditionalIRA: 'preTax', traditional401k: 'preTax', customTraditional: 'preTax' };
const acct = (id, type, balance, priority) => ({ id, name: id, type, taxClass: CLASS[type], owner: 'self', balance, basisPct: 0,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
  futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority });

/* $10,000 in a `from` account; `transferOn` moves it to an empty HSA at age + 0.5. */
function run(from, { age = 60, transferOn = true } = {}) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = 'redirect';
  Object.assign(p.profile, { age, retireAge: age, endAge: age + 1, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, dividendGrowth: 0, dividendStart: age,
    pension: 20000, pensionCola: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, networthOn: true, otherAssets: [], debts: [], assetsOn: true,
    assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }], rule55: false,
    transferOn, transferFrom: 'src', transferTo: 'hsa', transferAmount: 10000, transferAge: age + 0.5, penaltyException: false });
  p.accounts = [acct('src', from, 10000, 2), acct('hsa', 'hsa', 0, 1)];
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.deepEqual((r.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code), [], 'no error of any kind');
  return r.rows[1];
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);

test('R29: a traditional IRA to an HSA moves the $5,400 of HSA room tax-free, undeducted -- AGI stays the $20,000 pension; $4,600 stays in the IRA', () => {
  const r = run('traditionalIRA');
  near(r.hsa, 5400, 'the HSA');
  near(r.preTax, 4600, 'the IRA keeps the rest');
  near(r.federalAgi, 20000, 'no income and no deduction');
});

test('R29: a traditional IRA to an HSA before 59 1/2 still carries no 10% -- it is not a taxable distribution', () => {
  const at = run('traditionalIRA', { age: 57 }), none = run('traditionalIRA', { age: 57, transferOn: false });
  near(at.federalAgi, 20000, 'the AGI');
  near(at.taxes, none.taxes, 'the same tax as with no transfer');
});

test('R29: a traditional 401(k) to an HSA is a distribution and a contribution -- $5,400 is income and deducted (AGI $20,000); at 57 it carries 10%, $540', () => {
  const at = run('traditional401k', { age: 57 }), none = run('traditional401k', { age: 57, transferOn: false });
  near(at.hsa, 5400, 'the HSA');
  near(at.preTax, 4600, 'the 401(k) keeps the rest');
  near(at.federalAgi, 20000, 'the $5,400 distributed and the $5,400 deducted cancel');
  near(at.taxes - none.taxes, 540, 'the 10% additional tax on the $5,400 distributed is the whole difference');
});

test('R29: a custom tax-deferred account to an HSA follows the same distribution-and-contribution rule', () => {
  const at = run('customTraditional', { age: 57 }), none = run('customTraditional', { age: 57, transferOn: false });
  near(at.hsa, 5400, 'the HSA');
  near(at.federalAgi, 20000, 'the AGI');
  near(at.taxes - none.taxes, 540, 'the 10% additional tax');
});

test('R29: an IRA into the SPOUSE\'s HSA is not a funding distribution -- a couple at 57: $9,750 of family room moves, is income and deducted, and carries 10%, $975', () => {
  function couple(transferOn) {
    const p = JSON.parse(JSON.stringify(defaultPlan));
    p.setupComplete = true;
    p.limitPolicy = 'redirect';
    Object.assign(p.profile, { age: 57, retireAge: 57, endAge: 58, spouseOn: true, spouseAge: 57, filing: 'mfj' });
    Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
    Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
    Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, dividendGrowth: 0, dividendStart: 57,
      pension: 20000, pensionCola: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
    Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, networthOn: true, otherAssets: [], debts: [], assetsOn: true,
      assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }], rule55: false,
      transferOn, transferFrom: 'src', transferTo: 'hsa', transferAmount: 10000, transferAge: 57.5, penaltyException: false });
    p.accounts = [acct('src', 'traditionalIRA', 10000, 2), Object.assign(acct('hsa', 'hsa', 0, 1), { owner: 'spouse' })];
    assert.equal(validateScenario(JSON.parse(JSON.stringify(p))).valid, true);
    const r = engine.runPlan(p);
    assert.equal(r.status, 'ok');
    return r.rows[1];
  }
  const at = couple(true), none = couple(false);
  near(at.hsa, 9750, 'the spouse\'s HSA: the $8,750 family limit and the spouse\'s $1,000 catch-up');
  near(at.federalAgi, 20000, 'the $9,750 distributed and the $9,750 deducted cancel');
  near(at.taxes - none.taxes, 975, 'the 10% on the $9,750 distributed from the self\'s IRA');
});
