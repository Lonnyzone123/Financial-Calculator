/* S5AA R30: A PRE-TAX TRANSFER INTO AN HSA COUNTS TOWARD THE YEAR'S REQUIRED MINIMUM DISTRIBUTION (raised, not numbered, in
 * ChatGPT's R29 change audit of aaff3f1; the owner 2026-09-28: "Research, then repair in R30").
 *
 * The rule, read at its sources: 26 CFR 1.408-8(g)(1), "all amounts distributed from an IRA are taken into account in determining
 * whether section 401(a)(9) is satisfied, regardless of whether the amount is includible in income" (its example is a qualified
 * charitable distribution); 26 CFR 1.401(a)(9)-5(g)(2)(i) says the same of an employer plan's individual account. Notice 2008-51
 * says it of a qualified HSA funding distribution from a beneficiary's IRA. Only rollover-type amounts are kept from the
 * requirement, and an HSA contribution is not a rollover.
 *
 * Since R15 (R14-01) a pre-tax transfer into a TAXABLE account has been credited: its first dollars pay the year's requirement,
 * so the settlement does not take them again. A pre-tax transfer into an HSA -- a distribution and then a contribution (into a
 * spouse's HSA, or from a 401(k)), or a qualified HSA funding distribution from a traditional IRA into its owner's own -- is as
 * much a distribution, and was held above the reserve instead, so the requirement was drawn on top of it. ChatGPT's example: at
 * 80, $9,750 from a $100,000 IRA into the spouse's HSA, and the engine also drew the whole $100,000 / 20.2 = $4,950.50.
 *
 * A transfer dated after the year's draw is still neither held to the requirement nor credited toward it: the draw has already
 * paid it (R28.1), and this repair does not change that.
 *
 * Each plan: 80 to 81, 0% returns, a $60,000 pension, $100,000 of cash, $100,000 in the pre-tax source, dividends off. The Uniform
 * Lifetime Table divisor at 80 is 20.2 (the spouse, 78, is not more than ten years younger).
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

const CLASS = { taxable: 'taxable', traditionalIRA: 'preTax', traditional401k: 'preTax', hsa: 'hsa' };
function account(id, type, balance, extra) {
  return Object.assign({ id, name: id, type, taxClass: CLASS[type], owner: 'self', balance, basisPct: type === 'taxable' ? 100 : 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    priority: id === 'cash' ? 0 : 2 }, extra || {});
}
function rmdPlan(o) {
  const x = Object.assign({ spouse: false, from: 'traditionalIRA', hsaOwner: 'self', amount: 5400, at: 80 }, o);
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = 'redirect';
  Object.assign(p.profile, { age: 80, retireAge: 65, endAge: 81, spouseOn: x.spouse, filing: x.spouse ? 'mfj' : 'single' });
  if (x.spouse) Object.assign(p.profile, { spouseAge: 78, spouseRetireAge: 65, spouseEndAge: 79 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 60000, pensionCola: 0, ssBenefit: 0,
    spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [], withdrawalOrder: 'manual', manualOrder: 'taxable,preTax,roth,hsa' });
  Object.assign(p.advanced, { rmdOn: true, conversionOn: false, healthOn: false, ltcOn: false, networthOn: true, otherAssets: [], debts: [],
    assetsOn: true, assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }], rule55: false, penaltyException: false,
    transferOn: true, transferFrom: 'src', transferTo: 'dst', transferAmount: x.amount, transferAge: x.at });
  p.accounts = [account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} }), account('src', x.from, 100000),
    account('dst', 'hsa', 0, { owner: x.hsaOwner })];
  return p;
}
function run(p) {
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.deepEqual((r.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code), [], 'no ERROR issue');
  return r.rows[1];
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);
const RMD = 100000 / 20.2;

test('ChatGPT\'s example: $9,750 from the IRA into the spouse\'s HSA at 80 pays the $4,950.50 requirement -- nothing more is drawn', () => {
  // A distribution ($9,750 of income) and a deductible HSA contribution (-$9,750): AGI is the $60,000 pension. The IRA keeps
  // $90,250 (it was $85,299.50, with AGI $64,950.50).
  const r = run(rmdPlan({ spouse: true, hsaOwner: 'spouse', amount: 9750 }));
  near(r.hsa, 9750, 'the spouse\'s HSA');
  near(r.preTax, 90250, 'the IRA');
  near(r.federalAgi, 60000, 'AGI');
  near(r.rmdUnmet, 0, 'the requirement is met');
});

test('A qualified HSA funding distribution counts too: $5,400 into the owner\'s own HSA pays the requirement', () => {
  // Excluded from income (408(d)(9)), and it is still an amount distributed from the IRA. The IRA keeps $94,600; AGI $60,000.
  const r = run(rmdPlan());
  near(r.hsa, 5400, 'the HSA');
  near(r.preTax, 94600, 'the IRA');
  near(r.federalAgi, 60000, 'AGI');
});

test('A funding distribution smaller than the requirement pays part of it; the rest is drawn as before', () => {
  // $3,000 credited; $4,950.50 - $3,000 = $1,950.50 drawn and taxed. The IRA keeps $100,000 - $3,000 - $1,950.50 = $95,049.50.
  const r = run(rmdPlan({ amount: 3000 }));
  near(r.preTax, 100000 - 3000 - (RMD - 3000), 'the IRA');
  near(r.federalAgi, 60000 + RMD - 3000, 'AGI');
});

test('A 401(k) into an HSA counts toward the 401(k)\'s own requirement', () => {
  // A distribution and a deductible contribution; the plan's requirement $4,950.50 is paid by the $5,400. The 401(k) keeps $94,600.
  const r = run(rmdPlan({ from: 'traditional401k' }));
  near(r.preTax, 94600, 'the 401(k)');
  near(r.federalAgi, 60000, 'AGI');
});

test('CONTROL: a transfer dated after the year\'s draw is not credited -- the draw has already paid the requirement', () => {
  // At 80.75 the draw (at 80.5) takes $4,950.50 first; the $5,400 funding follows. The IRA keeps $100,000 - $4,950.50 - $5,400.
  const r = run(rmdPlan({ at: 80.75 }));
  near(r.preTax, 100000 - RMD - 5400, 'the IRA');
  near(r.federalAgi, 60000 + RMD, 'AGI');
});
