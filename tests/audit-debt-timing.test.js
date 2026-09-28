'use strict';

/**
 * Tests for AUD-007 (RETIREMENT_ENGINE_AUDIT_CLAUDE_QUEUE_2026-09-08.md,
 * task T08): projectDebts()'s amortization loop correctly computed each
 * monthly payment, but attributed retirement-period cash using a single
 * BLENDED fraction (paid*retiredShare) applied to the whole period's total,
 * regardless of when within the period those specific payments actually
 * landed relative to retirement. A debt paid off entirely in the working
 * months before a mid-period retirement still had part of those
 * already-working-period payments misattributed to retirement.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

function debt(overrides = {}) {
  return Object.assign({
    id: 'd1', type: 'otherDebt', balance: 3000, rate: 0, rateType: 'fixed',
    paymentMonthly: 1000, extraPrincipalMonthly: 0, payoffAge: 999,
    includePayment: true, includeHousingCosts: false,
  }, overrides);
}

test('AUD-007 reproduction: a debt fully paid off in the working months before a mid-period retirement reports $0 retirement payments, $3,000 total', () => {
  // Age 60-61, retirement at 60.5, $3,000 balance, 0% rate, $1,000/mo payment,
  // no housing costs. The debt is fully paid in the first three (working)
  // months, all before the 60.5 retirement boundary (month 6 of 12).
  const result = engine.projectDebts([debt()], 60, 61, 0.5);
  assert.ok(Math.abs(result.totalPayments - 3000) < 0.01, `expected total payments of $3,000, got ${result.totalPayments}`);
  assert.equal(result.retirementPayments, 0, `expected $0 retirement payments -- the debt was fully paid before retirement, got ${result.retirementPayments}`);
});

test('AUD-007: a debt paid ONLY after retirement is fully attributed to retirement, not split by a blended fraction', () => {
  // Retirement at 60.0833... (1 month in) -- the debt's payments (still
  // ongoing across the whole year, since payment is small relative to
  // balance) mostly land in the retired months.
  const d = debt({ balance: 12000, paymentMonthly: 1000 }); // pays off exactly over 12 months
  // Retirement after month 2 (retiredDuration = 10/12 of the year) -- months
  // 2-11 (10 months) are retired, months 0-1 are working.
  const retiredDuration = 10 / 12;
  const result = engine.projectDebts([d], 60, 61, retiredDuration);
  assert.ok(Math.abs(result.totalPayments - 12000) < 0.01, `expected total payments of $12,000, got ${result.totalPayments}`);
  const expectedRetirementPayments = 10000; // 10 of the 12 $1,000 payments occur in retired months
  assert.ok(Math.abs(result.retirementPayments - expectedRetirementPayments) < 1, `expected retirement payments of about $${expectedRetirementPayments}, got ${result.retirementPayments}`);
});

test('AUD-007: a uniform payment schedule that never pays off within the period still prorates correctly (matches the old blended-fraction math for the even case)', () => {
  const d = debt({ balance: 1000000, paymentMonthly: 500 }); // far from payoff within one year
  const result = engine.projectDebts([d], 60, 61, 0.5); // half-year retirement
  // With a uniform $500/mo payment and no payoff, exactly half the 12
  // payments ($6,000 total) should land in the retired half of the year.
  assert.ok(Math.abs(result.totalPayments - 6000) < 0.01, `expected total payments of $6,000, got ${result.totalPayments}`);
  assert.ok(Math.abs(result.retirementPayments - 3000) < 0.01, `expected retirement payments of $3,000 (half, matching a uniform schedule), got ${result.retirementPayments}`);
});

test('AUD-007: a fully working row (retiredDuration=0) attributes zero payments to retirement, unchanged', () => {
  const result = engine.projectDebts([debt()], 60, 61, 0);
  assert.ok(Math.abs(result.totalPayments - 3000) < 0.01);
  assert.equal(result.retirementPayments, 0);
});

test('AUD-007: a fully retired row (retiredDuration=duration) attributes all payments to retirement, unchanged', () => {
  const result = engine.projectDebts([debt()], 60, 61, 1);
  assert.ok(Math.abs(result.totalPayments - 3000) < 0.01);
  assert.ok(Math.abs(result.retirementPayments - 3000) < 0.01, `expected all $3,000 attributed to retirement, got ${result.retirementPayments}`);
});

test('AUD-007: a forced terminal payoff (payoffAge reached) at period end is attributed to retirement when the period ends in retirement -- plus whichever regular payments actually fell in the retired months', () => {
  const d = debt({ balance: 50000, paymentMonthly: 100, payoffAge: 61 }); // barely dents the balance monthly, forced payoff at 61
  const result = engine.projectDebts([d], 60, 61, 0.5); // retirement at the halfway point (month 6 of 12)
  assert.ok(result.totalPayments > 49000, `expected the bulk of the balance forced-paid at period end, got ${result.totalPayments}`);
  // 6 working-month payments of $100 = $600 excluded; the terminal payoff of
  // the remaining balance (~$48,800, since 0% rate) is fully attributed to
  // retirement (the period ends in retirement); the 6 RETIRED-month regular
  // payments ($600) are also attributed -- so retirementPayments should be
  // total minus the 6 WORKING-month regular payments ($600).
  assert.ok(Math.abs(result.retirementPayments - (result.totalPayments - 600)) < 1, `expected retirementPayments to be totalPayments minus the 6 working-month regular payments ($600), got retirementPayments=${result.retirementPayments} vs totalPayments=${result.totalPayments}`);
});

test('AUD-007: a forced terminal payoff at the end of a still-fully-working period is NOT attributed to retirement', () => {
  const d = debt({ balance: 50000, paymentMonthly: 100, payoffAge: 61 });
  const result = engine.projectDebts([d], 60, 61, 0); // never retires this period
  assert.ok(result.totalPayments > 49000);
  assert.equal(result.retirementPayments, 0, `the forced payoff must not count as retirement spending when the period never enters retirement, got ${result.retirementPayments}`);
});

test('AUD-007: flat housing costs are unaffected by this fix -- still use the blended retiredShare, not per-month attribution', () => {
  const d = debt({
    type: 'mortgage', includeHousingCosts: true, balance: 0, paymentMonthly: 0,
    annualPropertyTax: 6000, annualInsurance: 1200, hoaMonthly: 0, pmiMonthly: 0,
  });
  const result = engine.projectDebts([d], 60, 61, 0.5);
  // Housing costs ($7,200/yr) should still be split by the blended fraction (50%).
  assert.ok(Math.abs(result.totalPayments - 7200) < 0.01, `expected $7,200 total housing cost, got ${result.totalPayments}`);
  assert.ok(Math.abs(result.retirementPayments - 3600) < 0.01, `expected the housing cost split evenly by the blended retiredShare ($3,600), got ${result.retirementPayments}`);
});

test('AUD-007: includePayment=false excludes a debt\'s amortized payments from retirement attribution entirely, regardless of timing', () => {
  const result = engine.projectDebts([debt({ includePayment: false })], 60, 61, 1);
  assert.ok(Math.abs(result.totalPayments - 3000) < 0.01, 'totalPayments must still reflect actual amortization');
  assert.equal(result.retirementPayments, 0, 'includePayment=false must exclude it from retirement attribution');
});

test('AUD-007: reconciliation invariant holds exactly through simulatePlan() with a mid-period retirement debt payoff', () => {
  const defaultPlanMatch = shell.match(/var defaultPlan=(\{.*?\});/);
  // eslint-disable-next-line no-eval
  const defaultPlan = eval('(' + defaultPlanMatch[1] + ')');
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.profile.age = 60;
  p.profile.retireAge = 60.5;
  p.profile.endAge = 61;
  p.employment.salary = 80000;
  p.retirement.spending = 20000;
  p.retirement.strategy = 'fixedNominal';
  p.assumptions.returnRate = 0;
  p.assumptions.method = 'simple';
  p.accounts = [
    { id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 80, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 },
  ];
  p.advanced.debts = [debt({ includePayment: true })];
  const issues = [];
  engine.simulatePlan(p, engine.rng(p.assumptions.seed), 0, null, issues);
  assert.deepEqual(issues, [], `expected a clean run, got ${JSON.stringify(issues.slice(0, 2))}`);
});
