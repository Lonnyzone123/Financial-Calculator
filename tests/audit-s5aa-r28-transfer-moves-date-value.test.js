/* S5AA R28 round: R27-01 -- A MID-YEAR TRANSFER CAN MOVE WHAT ITS SOURCE HAS EARNED BEFORE THE DATE (ChatGPT's R27 audit,
 * 2026-09-26, priority 1; the owner 2026-09-26: "Repair").
 *
 * R27 capped a transfer at what the source holds on its date, but the transaction itself still ran at the year's opening
 * balance: moveFunds() caps what moves at the account's balance, and the source had not grown yet. So in a rising market a
 * request above the opening balance but within the date balance moved only the opening balance. ChatGPT's witness:
 * $100,000 at +10% holds $100,000 x sqrt(1.1) = $104,880.88 at 60.5; a $103,000 request moved $100,000, the household
 * ended at $105,119.12 where it should be $104,972.69, and a traditional IRA source was taxed on $100,000, not $103,000
 * (reproduced at 73e24c7).
 *
 * Now the source is valued at the transfer date for the transaction -- its opening balance at its own rate for the part of
 * the year before -- so what moves, the basis it carries and its tax all come from that date value. What is left is put
 * back into opening-balance terms, and the year's growth carries it to year end: (B g^f - A) g^(1-f) = B g - A g^(1-f),
 * which is what the source should hold. The destination's correction is unchanged.
 *
 * Hand arithmetic, with the engine's fractional compounding: sqrt(1.1) = 1.048808848...
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
    transferOn: true, transferFrom: 'src', transferTo: 'bnd', transferAmount: o.amount, transferAge: 60.5, penaltyException: true });
  p.accounts = [acct('src', o.srcType || 'taxable', o.srcClass || 'taxable', 100000, 'stocks', 1), acct('bnd', 'taxable', 'taxable', o.bndBalance || 0, 'bonds', 2)];
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);
const errors = (r) => (r.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code);
const G = Math.sqrt(1.1);

test('R27-01: $103,000 asked of a +10% account holding $104,880.88 at 60.5 moves all of it -- the household ends at $104,972.69 (was $105,119.12)', () => {
  /* $103,000 moves into the 0% account; the $1,880.88 left earns the second half-year's return. */
  const r = run({ stockReturn: 10, amount: 103000 });
  assert.deepEqual(errors(r), []);
  near(r.rows[1].total, 103000 + (100000 * G - 103000) * G, 'the household');
});

test('R27-01: a traditional IRA source is taxed on the $103,000 that moved -- AGI $103,000 (was $100,000)', () => {
  const r = run({ stockReturn: 10, amount: 103000, srcType: 'traditionalIRA', srcClass: 'preTax' });
  assert.deepEqual(errors(r), []);
  near(r.rows[1].federalAgi, 103000, 'the distribution');
});

test('R27-01: a request above the date value moves the date value -- $110,000 asked, $104,880.88 moved, nothing left or negative (was $100,000)', () => {
  const r = run({ stockReturn: 10, amount: 110000 });
  assert.deepEqual(errors(r), []);
  near(r.rows[1].total, 100000 * G, 'the household: all of the source, moved at 60.5 into the 0% account');
});

test('R27-01 CONTROL: a request of the opening balance is unchanged -- $100,000 at +10% ends at $105,119.12', () => {
  const r = run({ stockReturn: 10, amount: 100000 });
  near(r.rows[1].total, 100000 + (100000 * G - 100000) * G, 'the household');
});

test('R27-01 CONTROL: the down-market cap is unchanged -- $100,000 asked of a -10% account moves the $94,868.33 it holds', () => {
  const r = run({ stockReturn: -10, amount: 100000 });
  assert.deepEqual(errors(r), []);
  near(r.rows[1].total, 100000 * Math.sqrt(0.9), 'the household');
});

test('R27\'s recorded gap closes: a household the year empties ends at $0 with its shortfall shown -- no account below zero (was -$2,565.84)', () => {
  /* $220,000 of spending against a -10% account of $100,000 and a 0% account of $100,000, with $50,000 moved at 60.5. The
     stocks are worth $100,000 x sqrt(0.9) on the date, so the year can draw that and the bonds' $100,000 and no more; the
     rest of the spending is unmet. R27 left the transfer's loss before the date on the emptied destination, which ended at
     -$2,565.84 with no shortfall shown. */
  const r = run({ stockReturn: -10, amount: 50000, spending: 220000, bndBalance: 100000 });
  assert.deepEqual(errors(r), [], 'no NEGATIVE_ACCOUNT_BALANCE, no error of any kind');
  near(r.rows[1].total, 0, 'the household');
  near(r.rows[1].withdrawals, 100000 * Math.sqrt(0.9) + 100000, 'everything the accounts held on their dates');
  near(r.rows[1].shortfall, 220000 - (100000 * Math.sqrt(0.9) + 100000), 'the unmet spending');
});
