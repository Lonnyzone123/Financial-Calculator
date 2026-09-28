/* Q35 through the public entry point: S5 block 2r's rebuild-proof guard.
 *
 * findingIds: Q35
 *
 * Every dollar of a row's debt payments is accounted for. A row exposes the
 * whole period's payments (`debtPaymentsTotal`) beside `debtPayments`, which
 * stays retirement-only because its consumers read it that way, and it splits
 * that total three ways:
 *   - `debtInterest`;
 *   - `debtPrincipal`, which is payments less interest and is never clamped:
 *     a payment below the interest grows the balance, and the honest figure is
 *     negative principal;
 *   - `debtHousing`: property tax, insurance, HOA and PMI, which are neither
 *     interest nor principal and are kept as their own component.
 * So debtPaymentsTotal = debtInterest + debtPrincipal + debtHousing, for a
 * working year as much as a retired one.
 *
 * The existing guard (tests/contribution-and-debt-projection.test.js) calls
 * the engine's internal debt projection directly, so a rebuild that renamed it
 * would leave the behaviour unguarded. This file reaches it only through
 * runPlan(), and reads row 1 of a household aged 40 carrying one $300,000
 * mortgage at 6%.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function plainPlan(debts, retireAge) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 5, inflation: 2, fee: 0, volatility: 0 });
  Object.assign(p.profile, { age: 40, retireAge, endAge: 45 });
  Object.assign(p.employment, { salary: 120000, contributionStop: retireAge });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 900000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  p.advanced.debts = debts;
  p.advanced.otherAssets = [];
  return p;
}

const mortgage = (fields) => Object.assign({
  id: 'm1', type: 'mortgage', name: 'Home', owner: 'household', balance: 300000,
  rate: 6, paymentMonthly: 1800, payoffAge: 90, includePayment: true, rateType: 'fixed',
  extraPrincipalMonthly: 0, includeHousingCosts: false, annualPropertyTax: 0,
  annualInsurance: 0, hoaMonthly: 0, pmiMonthly: 0, nextRateResetAge: 0, resetRate: 0,
}, fields);

function rowOne(debts, retireAge) {
  const result = engine.runPlan(plainPlan(debts, retireAge));
  assert.equal(result.status, 'ok');
  assert.equal(result.rows[1].age, 41);
  return result.rows[1];
}

function assertReconciles(row, what) {
  const parts = row.debtInterest + row.debtPrincipal + row.debtHousing;
  assert.ok(Math.abs(row.debtPaymentsTotal - parts) < 1e-6,
    what + ': total debt payments ' + row.debtPaymentsTotal + ' are not interest + principal + housing (' + parts + ')');
}

const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 0.01, what + ': expected ' + expected + ', got ' + actual);

test('Q35 (runPlan): a working year\'s debt payments are exposed in full beside the retirement-only figure', () => {
  const row = rowOne([mortgage({})], 60);
  near(row.debtPaymentsTotal, 12 * 1800, 'a working year\'s total debt payments');
  assert.equal(row.debtPayments, 0, 'a working year attributes nothing to retirement');
  assertReconciles(row, 'a working year');
});

test('Q35 (runPlan): negative amortization reports negative principal, and the payments still reconcile', () => {
  const row = rowOne([mortgage({ paymentMonthly: 100 })], 40);
  assert.ok(row.debtPrincipal < 0, 'negative amortization must report negative principal, got ' + row.debtPrincipal);
  assertReconciles(row, 'negative amortization');
});

test('Q35 (runPlan): housing costs are their own component, not interest or principal', () => {
  const withHousing = rowOne([mortgage({ includeHousingCosts: true, annualPropertyTax: 3600, annualInsurance: 1200 })], 40);
  const without = rowOne([mortgage({})], 40);
  near(withHousing.debtHousing, 4800, 'housing costs as their own component');
  near(withHousing.debtInterest, without.debtInterest, 'interest is unchanged by housing costs');
  assertReconciles(withHousing, 'with housing costs');
});

test('Q35 (runPlan): ordinary amortization on a retired row reconciles and pays down principal', () => {
  const row = rowOne([mortgage({})], 40);
  assert.ok(row.debtPrincipal > 0, 'an ordinary payment reduces principal, got ' + row.debtPrincipal);
  assertReconciles(row, 'ordinary amortization');
  near(row.debtPayments, row.debtPaymentsTotal, 'a fully retired year attributes every payment to retirement');
});
