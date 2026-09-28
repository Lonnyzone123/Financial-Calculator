/* AUD-007 (audit task T08) through the public entry point: S5 block 2r's rebuild-proof guard.
 *
 * findingIds: AUD-007; audit task: T08
 *
 * A debt's payments count toward retirement spending only for the months that
 * actually fall after retirement. A $3,000 debt at 0%, paid at $1,000 a month,
 * is gone three months into a year whose retirement starts at the halfway
 * point, so none of it is retirement spending. Before the repair, the period's
 * payments were scaled by its retired share, so half of that debt, $1,500, was
 * charged to retirement.
 *
 * The existing guard (tests/audit-debt-timing.test.js) calls the engine's
 * internal debt projection directly, so a rebuild that renamed it would leave
 * the behaviour unguarded. This file reaches it only through runPlan(), and
 * reads what any caller can see in row 1, the period from 60 to 61:
 *   - `debtPayments`, the payments attributed to retirement;
 *   - `debtPaymentsTotal`, every payment in the period;
 *   - `spending`, against the same plan with no debt, which rises by exactly
 *     the payments attributed to retirement.
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
  Object.assign(p.profile, { age: 60, retireAge, endAge: 70 });
  Object.assign(p.employment, { salary: 80000, contributionStop: 62 });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 400000, contribution: 5000, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  p.advanced.debts = debts;
  p.advanced.otherAssets = [];
  return p;
}

const debt = (fields) => Object.assign({
  id: 'd1', type: 'otherDebt', balance: 3000, rate: 0, rateType: 'fixed',
  paymentMonthly: 1000, extraPrincipalMonthly: 0, payoffAge: 999,
  includePayment: true, includeHousingCosts: false,
}, fields);

/* Row 1 of a plan carrying `debts`, beside the same plan with no debt. */
function rowOne(debts, retireAge) {
  const result = engine.runPlan(plainPlan(debts, retireAge));
  const base = engine.runPlan(plainPlan([], retireAge));
  assert.equal(result.status, 'ok');
  assert.equal(base.status, 'ok');
  assert.equal(result.rows[1].age, 61);
  assert.deepEqual((result.issues || []).filter((i) => i.code === 'RECONCILIATION_MISMATCH'), [], 'the run reconciles');
  const row = result.rows[1];
  return { retirement: row.debtPayments, total: row.debtPaymentsTotal, spendingChange: row.spending - base.rows[1].spending };
}

const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 0.01, what + ': expected ' + expected + ', got ' + actual);

test('AUD-007/T08 (runPlan): a debt paid off in the working months before a mid-period retirement is not retirement spending', () => {
  const r = rowOne([debt({})], 60.5);
  near(r.total, 3000, 'row 1 debt payments in total');
  near(r.retirement, 0, 'row 1 retirement debt payments');
  near(r.spendingChange, 0, 'row 1 spending change');
});

test('AUD-007/T08 (runPlan): a forced payoff at the end of a period that ends in retirement is retirement spending, less the working months\' payments', () => {
  const r = rowOne([debt({ balance: 50000, paymentMonthly: 100, payoffAge: 61 })], 60.5);
  near(r.total, 50000, 'row 1 debt payments in total, with the forced payoff');
  near(r.retirement, 50000 - 600, 'row 1 retirement debt payments after a forced payoff');
  near(r.spendingChange, 50000 - 600, 'row 1 spending change after a forced payoff');
});

test('AUD-007/T08 (runPlan): payments in the retired months count, and an even schedule splits by the months on each side', () => {
  const late = rowOne([debt({ balance: 12000 })], 60 + 2 / 12);
  near(late.total, 12000, 'twelve $1,000 payments');
  near(late.retirement, 10000, 'ten of the twelve payments fall after retirement');
  const even = rowOne([debt({ balance: 1000000, paymentMonthly: 500 })], 60.5);
  near(even.total, 6000, 'twelve $500 payments');
  near(even.retirement, 3000, 'six of the twelve payments fall after retirement');
});

test('AUD-007/T08 (runPlan): a fully working row and a fully retired row are unchanged', () => {
  const working = rowOne([debt({})], 62);
  near(working.total, 3000, 'fully working, total');
  near(working.retirement, 0, 'fully working, retirement');
  const retired = rowOne([debt({})], 60);
  near(retired.total, 3000, 'fully retired, total');
  near(retired.retirement, 3000, 'fully retired, retirement');
});

test('AUD-007/T08 (runPlan): a forced payoff in a period that never reaches retirement is not retirement spending', () => {
  const r = rowOne([debt({ balance: 50000, paymentMonthly: 100, payoffAge: 61 })], 62);
  near(r.total, 50000, 'forced payoff while working, total');
  near(r.retirement, 0, 'forced payoff while working, retirement');
  near(r.spendingChange, 0, 'forced payoff while working, spending change');
});

test('AUD-007/T08 (runPlan): housing costs keep the blended share, and a debt whose payment is excluded stays out of retirement spending', () => {
  const housing = rowOne([debt({
    type: 'mortgage', includeHousingCosts: true, balance: 0, paymentMonthly: 0,
    annualPropertyTax: 6000, annualInsurance: 1200, hoaMonthly: 0, pmiMonthly: 0,
  })], 60.5);
  near(housing.total, 7200, 'housing costs, total');
  near(housing.retirement, 3600, 'housing costs split by the retired share');
  const excluded = rowOne([debt({ includePayment: false })], 60);
  near(excluded.total, 3000, 'excluded payment, total');
  near(excluded.retirement, 0, 'excluded payment, retirement');
});
