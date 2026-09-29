/* S5AA R28.1: R27F-02 -- DIVIDENDS ON A TRANSFER'S DOLLARS BELONG TO WHICHEVER ACCOUNT HELD THEM (ChatGPT's R27F full-model
 * audit, 2026-09-26, priority 1; the owner 2026-09-26: "Repair").
 *
 * The row's dividend base is each eligible (taxable) account's balance after the transfer, for the whole row. A mid-year
 * transfer into a taxable account therefore paid a year of dividends on dollars it held for part of one, and a transfer
 * out of one paid none for the part it held them. ChatGPT's witness: $300,000 moved at 60.5 from a Roth IRA into an empty
 * taxable account, a 10% yield, nothing else: $30,000 of dividends and AGI where the half year it held them is $15,000
 * (reproduced at 73e24c7 and at 56c8847).
 *
 * Now the moved dollars count toward the source's dividend base before the date and the destination's after it, each only
 * if that account is dividend-eligible. Hand arithmetic at a 0% return: dollars x 10% x the part of the year held.
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

const acct = (id, type, taxClass, balance, priority) => ({ id, name: id, type, taxClass, owner: 'self', balance,
  basisPct: taxClass === 'taxable' ? 100 : 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
  frequency: 1, changeTiming: 'year', futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority });
const ROTH = ['rothIRA', 'roth'], TAXABLE = ['taxable', 'taxable'];

/* $300,000 in "src" moves to an empty "dest" at `at`; a 10% dividend yield paid from 60; every return 0%. `srcBalance` (S5AA R30)
   lets the source hold more than it sends. */
function run(from, to, at, srcBalance = 300000) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  /* S5AA R29 (PCF-02): a taxable -> Roth transfer is a contribution, held to the year's room -- $0 here, with no compensation. These
     tests are about who is paid on the moved dollars, not about that limit, so the plan uses the "warn" policy, under which all of
     it moves (with a warning), as it did before R29. */
  p.limitPolicy = 'warn';
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 10, dividendGrowth: 0, dividendStart: 60,
    pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, networthOn: true, otherAssets: [], debts: [], assetsOn: true,
    assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }],
    transferOn: true, transferFrom: 'src', transferTo: 'dest', transferAmount: 300000, transferAge: at, penaltyException: true });
  p.accounts = [acct('src', from[0], from[1], srcBalance, 2), acct('dest', to[0], to[1], 0, 1)];
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.deepEqual((r.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code), [], 'no error of any kind');
  return r.rows[1];
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);

test('R27F-02: a taxable account that receives $300,000 at 60.5 is paid half a year of a 10% yield -- $15,000 of dividends and AGI (was $30,000)', () => {
  const row = run(ROTH, TAXABLE, 60.5);
  near(row.dividends, 15000, 'the dividends');
  near(row.federalAgi, 15000, 'the AGI');
});

/* S5AA R30: this sent the source's whole $300,000, and the Roth IRA paid the source's $15,000 -- the leak R30 closes (each account
   pays its own dividends, so a source that pays them cannot send everything). The case is about who is paid on the moved dollars,
   so the source now keeps $100,000; tests/audit-s5aa-r30-transfer-dividends-follow-the-move.test.js holds a whole-balance move. */
test('R27F-02: a taxable account that sends $300,000 of $400,000 at 60.5 is paid the half year it held it -- $15,000 (was $0) -- and the year on the rest', () => {
  // $300,000 x 10% x 0.5 + $100,000 x 10% x 1 = $15,000 + $10,000.
  near(run(TAXABLE, ROTH, 60.5, 400000).dividends, 25000, 'the dividends');
});

test('R27F-02: a quarter of the way in, a taxable destination is paid three quarters of a year -- $22,500 (was $30,000)', () => {
  near(run(ROTH, TAXABLE, 60.25).dividends, 22500, 'the dividends');
});

test('R27F-02 CONTROL: taxable to taxable at 60.5 -- the $300,000 is paid a whole year between the two, $30,000', () => {
  near(run(TAXABLE, TAXABLE, 60.5).dividends, 30000, 'the dividends');
});

test('R27F-02 CONTROL: a transfer at the year\'s opening is unchanged -- Roth to taxable at 60 pays the whole year, $30,000', () => {
  near(run(ROTH, TAXABLE, 60).dividends, 30000, 'the dividends');
});
