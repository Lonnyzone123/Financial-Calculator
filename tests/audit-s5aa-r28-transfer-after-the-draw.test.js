/* S5AA R28.1: A TRANSFER DATED AFTER THE YEAR'S DRAW RUNS AFTER IT (found in R28.1's self-audit, sweep G; the owner 2026-09-26:
 * "Repair in R28.1").
 *
 * The engine draws a year's spending at one point: half way through the year for monthly timing (0.625 for quarterly, the
 * year's end for annual). A transfer was always run before that draw, so one dated after it was spent as if it had already
 * arrived: the destination's dollars were drawn before they existed, and the source's dollars were set aside before the
 * spending could reach them. Against a dated ledger, 19 of 30 plans differed at 5a5cb39 (from $2,798.99 too high to
 * $4,922.07 too low), and 24 at 73e24c7 (up to $7,544.51 too high).
 *
 * Now a transfer whose date falls after the draw runs after it, before the tax quote: the draw sees the accounts as they are
 * on its date, and the transfer moves at most what the source still holds on its own, carried from the draw to the date at
 * the source's rate. Plans: all Roth, $100,000 at 0% (drawn last), an empty destination (drawn first), $10,000 of cash at
 * 0% (drawn second), monthly timing, so the draw is at 60.5.
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

const roth = (id, balance, cls, priority) => ({ id, name: id, type: 'rothIRA', taxClass: 'roth', owner: 'self', balance, basisPct: 0,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
  futureChanges: [], allocation: { [cls]: 100 }, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority });

function run(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: o.timing || 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: o.spending, dividendOn: true, dividendYield: 0, dividendGrowth: 0, dividendStart: 60,
    pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, networthOn: true, otherAssets: [], debts: [], assetsOn: true,
    assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }, { id: 'moving', name: 'Moving', returnRate: o.destReturn, volatility: 0 }],
    transferOn: true, transferFrom: 'src', transferTo: 'dest', transferAmount: 100000, transferAge: o.at, penaltyException: true });
  p.accounts = [roth('src', 100000, 'flat', 3), roth('dest', 0, 'moving', 1), roth('cash', 10000, 'flat', 2)];
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.deepEqual((r.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code), [], 'no error of any kind');
  return r.rows[1];
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);

test('late transfer: $105,000 drawn at 60.5 takes the $10,000 of cash and $95,000 of the source; at 60.75 the $5,000 left moves -- $5,000 x 1.1^0.25', () => {
  const row = run({ destReturn: 10, at: 60.75, spending: 105000 });
  near(row.total, 5000 * Math.pow(1.1, 0.25), 'the household');
  near(row.shortfall, 0, 'nothing unmet');
});

test('late transfer: $50,000 drawn at 60.5 leaves the source $60,000, which moves at 60.75 into a -10% account -- $60,000 x 0.9^0.25', () => {
  near(run({ destReturn: -10, at: 60.75, spending: 50000 }).total, 60000 * Math.pow(0.9, 0.25), 'the household');
});

test('late transfer: $112,000 drawn at 60.5 is $2,000 more than the $110,000 there -- $2,000 unmet, nothing left to move', () => {
  const row = run({ destReturn: 20, at: 60.75, spending: 112000 });
  near(row.shortfall, 2000, 'the unmet spending');
  near(row.total, 0, 'the household');
});

test('late transfer CONTROL: with no spending the $100,000 moves at 60.75 and earns a quarter year at +10% -- $100,000 x 1.1^0.25 + $10,000', () => {
  near(run({ destReturn: 10, at: 60.75, spending: 0 }).total, 100000 * Math.pow(1.1, 0.25) + 10000, 'the household');
});

test('late transfer CONTROL: a transfer before the draw is unchanged -- at 60.25 the destination holds $100,000 x 1.1^0.25 when $105,000 is drawn', () => {
  near(run({ destReturn: 10, at: 60.25, spending: 105000 }).total, 10000 - (105000 - 100000 * Math.pow(1.1, 0.25)), 'the household');
});

test('late transfer: the tax on a late IRA transfer is funded as an early one\'s is -- $95,000 from a +10% IRA at 60.75, AGI $95,000', () => {
  /* A $50,000 taxable cash account comes first in priority, so the tax is paid from it and no tax-funding draw from the IRA
     adds to AGI. Running the transfer after the draw first funded the tax from the IRA (AGI $107,117.75): the smart order
     had ranked the classes on the balances before the transfer. It is ranked afresh after it. */
  const acct = (id, type, taxClass, balance, cls, priority) => Object.assign(roth(id, balance, cls, priority), { type, taxClass, basisPct: taxClass === 'taxable' ? 100 : 0 });
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, dividendGrowth: 0, dividendStart: 60,
    pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, networthOn: true, otherAssets: [], debts: [], assetsOn: true,
    assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }, { id: 'moving', name: 'Moving', returnRate: 10, volatility: 0 }],
    transferOn: true, transferFrom: 'src', transferTo: 'dest', transferAmount: 95000, transferAge: 60.75, penaltyException: true });
  p.accounts = [acct('src', 'traditionalIRA', 'preTax', 100000, 'moving', 1), acct('dest', 'taxable', 'taxable', 0, 'flat', 2), acct('cash', 'taxable', 'taxable', 50000, 'flat', 0)];
  assert.equal(validateScenario(JSON.parse(JSON.stringify(p))).valid, true);
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok');
  near(r.rows[1].federalAgi, 95000, 'the AGI');
});
