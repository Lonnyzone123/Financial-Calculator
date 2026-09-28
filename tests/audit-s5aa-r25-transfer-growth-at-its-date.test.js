/* S5AA R25 round: R24F-02 -- THE DOLLARS A MID-YEAR TRANSFER MOVES EARN THE SOURCE'S RETURN UNTIL THE TRANSFER DATE
 * (ChatGPT's R24F deep full-model audit, 2026-09-25, priority 2; repair chosen by the owner 2026-09-25: "Repair: split growth
 * at the date").
 *
 * A manual transfer runs in the year that contains its age, and R24 judges its tax at that age, but the dollars moved
 * at the year's OPENING: they earned the destination's return for the whole year. Measured at s5aa-r24-source
 * (d67b618): $100,000 in an account returning 10%, moved at 60.5 to one returning 0%, ended the year at $100,000 -- the
 * same as a transfer at 60, while the dollars were in the 10% account for half the year.
 *
 * Now the transfer's accounting (what moves, its tax, its RMD credit) stays where it was, and the growth of the moved
 * dollars is corrected after the year's growth: with f the transfer's fraction of the year, d the year's length, and
 * the engine's own compounding (growAccounts(): balance x max(0.001, 1 + rate)^fraction), the source gains
 * X((1+rs)^d - (1+rs)^((1-f)d)) and the destination gives up X((1+rd)^d - (1+rd)^((1-f)d)). A transfer at the year's
 * opening (f = 0) is untouched. No r16 member has a transfer inside a year.
 *
 * The expectations below are ChatGPT's hand arithmetic: at 60.5 the source holds $100,000 x sqrt(1.1) = $104,880.88;
 * $100,000 moves; the $4,880.88 left grows another half year to $5,119.12; the household ends at $105,119.12.
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

const acct = (id, balance, cls, priority) => ({ id, name: id, type: 'taxable', taxClass: 'taxable', owner: 'self', balance,
  basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: { [cls]: 100 }, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority });

/* Two taxable accounts: "stk" all stocks at 10%, "bnd" all bonds at 0%. Nothing else moves: no spending, income, fee,
   inflation or dividend income, so every figure is the transfer and the growth. */
function run(transferAge, from, to, balances) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, networthOn: true, otherAssets: [], debts: [],
    assetsOn: true, assetClasses: [{ id: 'stocks', name: 'Stocks', returnRate: 10, volatility: 0 }, { id: 'bonds', name: 'Bonds', returnRate: 0, volatility: 0 }],
    transferOn: true, transferFrom: from, transferTo: to, transferAmount: 100000, transferAge });
  p.accounts = [acct('stk', balances.stk, 'stocks', 1), acct('bnd', balances.bnd, 'bonds', 2)];
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  const bad = (r.issues || []).filter((i) => i.severity === 'ERROR');
  assert.deepEqual(bad, [], 'no error issue, the row reconciliation included');
  return r.rows[1];
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);

test('R24F-02: $100,000 moved at 60.5 from a 10% account to a 0% account ends the year at $105,119.12 (was $100,000)', () => {
  const row = run(60.5, 'stk', 'bnd', { stk: 100000, bnd: 0 });
  near(row.total, 105119.12, 'the household: $100,000 moved, and $4,880.88 left to grow a further half year');
  near(row.total, 100000 + (100000 * Math.sqrt(1.1) - 100000) * Math.sqrt(1.1), 'the same, unrounded');
});

test('R24F-02: the reverse, from the 0% account to the 10% one at 60.5, earns only the half year after it -- $104,880.88 (was $110,000)', () => {
  const row = run(60.5, 'bnd', 'stk', { stk: 0, bnd: 100000 });
  near(row.total, 100000 * Math.sqrt(1.1), 'the dollars earn 10% for half a year');
});

test('R24F-02: a transfer a quarter into the year leaves three quarters of a year of growth to split', () => {
  /* f = 0.25: the source gains 100,000 x (1.1 - 1.1^0.75). */
  const row = run(60.25, 'stk', 'bnd', { stk: 100000, bnd: 0 });
  near(row.total, 100000 + 100000 * (1.1 - Math.pow(1.1, 0.75)), 'the household');
});

test('R24F-02 CONTROL: a transfer at the year\'s opening moves the dollars before any growth, as before', () => {
  near(run(60, 'stk', 'bnd', { stk: 100000, bnd: 0 }).total, 100000, 'all $100,000 in the 0% account all year');
  near(run(60, 'bnd', 'stk', { stk: 0, bnd: 100000 }).total, 110000, 'all $100,000 in the 10% account all year');
});
