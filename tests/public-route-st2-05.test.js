/* ST2-05 through the public entry point: S5 block 2r's rebuild-proof guard.
 *
 * findingIds: ST2-05
 *
 * A fully amortizing payment stays exact at vanishing positive rates. The
 * closed form divides by 1 - (1 + r)^-n, and at a tiny rate (1 + r)^-n rounds
 * to 1: a $90,000 twenty-year loan came out at $351.84 a month at a 1e-12% rate
 * against a true $375, and at 1e-14% the payment was not finite at all. The
 * repaired form computes the same denominator without forming 1 + r.
 *
 * The engine reaches that payment when an adjustable-rate debt resets and is
 * recast over its remaining term. The existing guard
 * (tests/audit-st2-findings.test.js) calls the amortization module directly, so
 * a rebuild that replaced the module would leave the behaviour unguarded. This
 * file reaches it only through runPlan(), with the bundled debt modules
 * installed exactly as the browser bundle provides them (the capture harness's
 * installDebtModules()), and reads row 1: a retired household aged 60 whose
 * $90,000 adjustable-rate mortgage resets at 60 and is recast to be paid off at
 * 80.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function plan(resetRate, recast) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 64 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 60 });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 2000000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  /* S5AA task 5.1 (Q94): the recast is unconditional; this line set a switch that no longer
     decides anything. `recast` is kept as a parameter only so the callers below read the same. */
  void recast;
  p.advanced.debts = [{
    id: 'd1', type: 'mortgage', name: 'Home', owner: 'household', balance: 90000, rate: 5,
    rateType: 'adjustable', nextRateResetAge: 60, resetRate, paymentMonthly: 600, extraPrincipalMonthly: 0,
    payoffAge: 80, includePayment: true, includeHousingCosts: false, annualPropertyTax: 0,
    annualInsurance: 0, hoaMonthly: 0, pmiMonthly: 0,
  }];
  p.advanced.otherAssets = [];
  return p;
}

function firstYear(resetRate, recast) {
  const result = engine.runPlan(plan(resetRate, recast));
  assert.equal(result.status, 'ok');
  return result.rows[1];
}

const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 0.01, what + ': expected ' + expected + ', got ' + actual);

/* The textbook payment, computed here rather than by the code under test. */
const textbookPayment = (principal, annualPct, months) => {
  const r = annualPct / 100 / 12;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
};

test('ST2-05 (runPlan): a recast at a vanishing positive reset rate pays the loan down over its remaining term, $375 a month', () => {
  const row = firstYear(1e-12);
  near(row.debtPaymentsTotal, 4500, 'a recast at a 1e-12% reset rate, the first year\'s payments');
  near(row.debtBalance, 85500, 'a recast at a 1e-12% reset rate, the balance after a year');
});

test('ST2-05 (runPlan): at an even smaller reset rate the run still succeeds with the same payment', () => {
  const row = firstYear(1e-14);
  near(row.debtPaymentsTotal, 4500, 'a recast at a 1e-14% reset rate, the first year\'s payments');
});

test('ST2-05 (runPlan): just above the cancellation, a 1e-10% reset rate is exact to the cent', () => {
  const row = firstYear(1e-10);
  near(row.debtPaymentsTotal, 4500, 'a recast at a 1e-10% reset rate, the first year\'s payments');
});

test('ST2-05 (runPlan): an ordinary 6% reset rate and a 0% reset rate recast as before', () => {
  near(firstYear(6).debtPaymentsTotal, 12 * textbookPayment(90000, 6, 240), 'a recast at 6%, the first year\'s payments');
  near(firstYear(0).debtPaymentsTotal, 4500, 'a recast at 0%, straight-line principal');
});

test('ST2-05 (runPlan): BEFORE its reset the debt keeps its entered payment', () => {
  /* S5AA task 5.1 (Q94) retired the recast switch, so "without a recast" is no longer a state a
     household can be in. The control it provided still exists in the years BEFORE the reset: this
     loan resets at 60, and the row that ends at 60 is twelve payments of the entered $600. The claim
     -- that the entered payment governs until the recast happens -- is unchanged. */
  /* The fixture starts AT its reset age, so it has no pre-reset year of its own. The reset is moved
     two years in -- the only change -- so the row ending at 61 is squarely before it. */
  const p = plan(1e-12);
  p.advanced.debts[0].nextRateResetAge = 62;
  const result = engine.runPlan(p);
  assert.equal(result.status, 'ok');
  const beforeReset = result.rows.find((r) => Math.abs(r.age - 61) < 1e-9);
  assert.ok(beforeReset, 'the row ending at 61 must exist: ' + result.rows.map((r) => r.age).join(','));
  near(beforeReset.debtPaymentsTotal, 7200, 'before the reset, twelve payments of $600');
  const afterReset = result.rows.find((r) => Math.abs(r.age - 63) < 1e-9);
  assert.ok(afterReset.debtPaymentsTotal !== beforeReset.debtPaymentsTotal,
    'CONTROL: and after it, the recast must have changed the payment');
});
