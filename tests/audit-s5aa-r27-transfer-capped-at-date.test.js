/* S5AA R27 round: R25-01 -- A MID-YEAR TRANSFER MOVES AT MOST WHAT THE SOURCE HOLDS ON ITS DATE (ChatGPT's R25 audit,
 * 2026-09-26, priority 1; the owner 2026-09-26: "Move what's there").
 *
 * R25 (R24F-02) moved a mid-year transfer at the year's opening and then corrected the moved dollars' growth, so that
 * they earned the source's return until the transfer date. In a DOWN market the source can hold less than the
 * requested amount on that date, and the correction then left it negative: $100,000 at -10%, moved at 60.5, left the
 * stock account at -$4,868.33 and returned status ok (reproduced at 4b7d516 and at 04f0426).
 *
 * Now, in a year with a mid-year transfer, the year's rates are known before the transfer, so the transfer moves the
 * lesser of the amount and what the source holds on the date -- its opening balance grown at its own rate for the part
 * of the year before the transfer. Its tax, basis and RMD credit follow from the capped amount. When the cap binds, the
 * growth correction takes the source to exactly $0: (B - A)g^d + A(g^d - g^((1-f)d)) = Bg^d - Ag^((1-f)d), and
 * A = Bg^(fd).
 *
 * Hand arithmetic, with the engine's fractional compounding: sqrt(0.90) = 0.948683298..., so $100,000 at -10% holds
 * $94,868.33 at 60.5.
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

const acct = (id, type, taxClass, balance, cls, priority) => ({ id, name: id, type, taxClass, owner: 'self', balance,
  basisPct: taxClass === 'taxable' ? 100 : 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
  frequency: 1, changeTiming: 'year', futureChanges: [], allocation: { [cls]: 100 }, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority });

/* "src" is invested in stocks at the given return; "bnd" is all bonds at 0%. Nothing else moves. */
function run(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: o.spending || 0, dividendOn: true, dividendYield: 0, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, networthOn: true, otherAssets: [], debts: [],
    assetsOn: true, assetClasses: [{ id: 'stocks', name: 'Stocks', returnRate: o.stockReturn, volatility: 0 }, { id: 'bonds', name: 'Bonds', returnRate: 0, volatility: 0 }],
    transferOn: true, transferFrom: 'src', transferTo: 'bnd', transferAmount: o.amount, transferAge: o.at, penaltyException: true });
  p.accounts = [acct('src', o.srcType || 'taxable', o.srcClass || 'taxable', o.srcBalance, 'stocks', 1), acct('bnd', 'taxable', 'taxable', o.bndBalance || 0, 'bonds', 2)];
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);
const errors = (r) => (r.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code);
const G = Math.sqrt(0.9);

test('R25-01: $100,000 asked of a -10% account at 60.5 moves the $94,868.33 it holds; nothing is negative (was -$4,868.33)', () => {
  const r = run({ stockReturn: -10, amount: 100000, at: 60.5, srcBalance: 100000 });
  assert.deepEqual(errors(r), [], 'no NEGATIVE_ACCOUNT_BALANCE, no error of any kind');
  near(r.rows[1].total, 100000 * G, 'the household: all of the source, moved at 60.5 into the 0% account');
});

test('R25-01: a pre-tax source is taxed on what actually moved -- AGI is the $94,868.33, not the $100,000 asked', () => {
  const r = run({ stockReturn: -10, amount: 100000, at: 60.5, srcBalance: 100000, srcType: 'traditionalIRA', srcClass: 'preTax' });
  assert.deepEqual(errors(r), []);
  near(r.rows[1].federalAgi, 100000 * G, 'the distribution is the capped amount');
});

test('R25-01 CONTROL: a down market that still covers the amount moves it all -- $200,000 at -10%, $100,000 at 60.5', () => {
  /* At 60.5 the source holds $200,000 x sqrt(0.9) = $189,736.66; $100,000 moves; the $89,736.66 left falls a further half
     year to $89,736.66 x sqrt(0.9); the 0% account keeps its $100,000. */
  const r = run({ stockReturn: -10, amount: 100000, at: 60.5, srcBalance: 200000 });
  assert.deepEqual(errors(r), []);
  near(r.rows[1].total, 100000 + (200000 * G - 100000) * G, 'the household');
});

test('R25-01 CONTROL: R25\'s rising-market witness is unchanged -- $105,119.12', () => {
  const r = run({ stockReturn: 10, amount: 100000, at: 60.5, srcBalance: 100000 });
  near(r.rows[1].total, 105119.12, 'the household');
});

test("R25-01: a source the year's spending also draws ends at $0, not below -- the household ends at $134,868.33 (was -$2,434.16)", () => {
  /* Found in R27's own self-audit, in Monte Carlo (97 of 300 paths) and here: $100,000 at -10% and $100,000 of bonds at 0%,
     $60,000 of spending drawn from the stock account first, and $50,000 moved to the bonds at 60.5. With the engine's
     mid-year withdrawal timing: at 60.5 the stocks hold 100,000 x sqrt(0.9) = $94,868.33; $50,000 moves, leaving
     $44,868.33; the spending takes all of it and $15,131.67 of the bonds. The household ends at 40,000 + 100,000 x
     sqrt(0.9). Before this, the growth correction left the stock account at -$2,434.16 (at 04f0426 as at 5f48505). */
  const r = run({ stockReturn: -10, amount: 50000, at: 60.5, srcBalance: 100000, bndBalance: 100000, spending: 60000 });
  assert.deepEqual(errors(r), [], 'no NEGATIVE_ACCOUNT_BALANCE');
  near(r.rows[1].total, 40000 + 100000 * G, 'the household');
});
