'use strict';

// Track B, L2 -- unit tests for auditContributions() and projectDebts(),
// two more calculator-native functions with no prior isolated coverage.
// auditContributions() enforces the 2026 IRA/workplace/HSA contribution
// limits (including HSA's base+catchup pooling across spouses and Roth
// IRA's income phase-out); projectDebts() amortizes each debt one period
// at a time and mutates the debt's own balance in place -- both are only
// ever exercised today through full simulatePlan() runs.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);
const RULES = global.RULES;

/* S5AA task 5.1 (Q94) made the ARM re-amortisation unconditional, so projectDebts() reaches
   DebtAmortization.monthlyPayment() for any adjustable debt past its reset -- a path this file could
   previously never take, because the recast was gated off by default. The modules are installed the
   way every other engine test installs them; in the shipped page they are in the same script scope. */
require('../tools/capture-baseline.js').installDebtModules();
const engine = require('../src/engine.js');

// ---------------------------------------------------------------------------
// auditContributions
// ---------------------------------------------------------------------------

function account(overrides = {}) {
  return Object.assign({
    id: 'a1', name: 'Account', type: 'taxable', owner: 'self', priority: 1,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [],
  }, overrides);
}
function planFor(accounts, overrides = {}) {
  return Object.assign({
    accounts,
    profile: { filing: 'single', age: 40, spouseAge: 40 },
    limitPolicy: 'redirect',
  }, overrides);
}

test('auditContributions: an account with no limit group (taxable) is never capped', () => {
  const p = planFor([account({ type: 'taxable', contribution: 500000 })]);
  const { items, warnings } = engine.auditContributions(p, 40, 0, 0);
  assert.equal(items[0].requested, 500000);
  assert.equal(items[0].allowed, 500000);
  assert.equal(items[0].excess, 0);
  assert.deepEqual(warnings, []);
});

test('auditContributions: two workplace accounts for the same owner share one pooled limit', () => {
  const limit = RULES.retirement.workplace.employeeDeferral;
  const p = planFor([
    account({ id: 'a1', name: '401k A', type: 'traditional401k', priority: 1, contribution: limit - 5000 }),
    account({ id: 'a2', name: '401k B', type: 'traditional401k', priority: 2, contribution: 20000 }),
  ]);
  const { items, warnings } = engine.auditContributions(p, 40, 0, 0);
  assert.equal(items[0].allowed, limit - 5000, 'the first account (by priority) gets its full request');
  assert.equal(items[1].allowed, 5000, 'the second account only gets whatever room is left in the pooled limit');
  assert.equal(items[1].excess, 15000);
  assert.ok(warnings.some((w) => w.includes('401k B')), 'the account that actually got trimmed must be named in the warning');
});

test('auditContributions: HSA splits a request into base room and catchup room, and pools across owners', () => {
  const hsa = RULES.retirement.hsa;
  const p = planFor([account({ type: 'hsa', owner: 'self', contribution: hsa.self + 500 })], {
    profile: { filing: 'single', age: hsa.catchupAge, spouseAge: hsa.catchupAge },
  });
  const { items } = engine.auditContributions(p, hsa.catchupAge, 0, 0);
  assert.equal(items[0].allowed, hsa.self + Math.min(500, hsa.catchup), 'base room fully used, remainder from catchup room');
});

test('auditContributions: a Roth IRA request above the salary-based phase-out is trimmed, with a named warning', () => {
  const range = RULES.retirement.ira.rothPhaseout.single;
  const highSalary = range[1] + 10000; // fully phased out -> factor 0 -> limit 0
  const p = planFor([account({ type: 'rothIRA', name: 'My Roth', contribution: RULES.retirement.ira.combinedLimit })]);
  const { items, warnings } = engine.auditContributions(p, 40, highSalary, 0);
  assert.equal(items[0].allowed, 0, 'fully phased out means zero allowed room');
  assert.ok(warnings.some((w) => w.includes('My Roth') && w.includes('Roth IRA limit is reduced')));
});

test('auditContributions: limitPolicy "warn" reports the excess but never actually caps the allowed amount', () => {
  const limit = RULES.retirement.workplace.employeeDeferral;
  const p = planFor([account({ type: 'traditional401k', name: 'Overfunded 401k', contribution: limit + 50000 })], { limitPolicy: 'warn' });
  const { items, warnings } = engine.auditContributions(p, 40, 0, 0);
  assert.equal(items[0].allowed, limit + 50000, 'warn mode: allowed must equal the full request, uncapped');
  assert.equal(items[0].excess, 50000, 'excess is still computed correctly even though it is not enforced');
  assert.ok(warnings.length > 0, 'a warning must still fire even though the limit is not enforced');
});

// ---------------------------------------------------------------------------
// projectDebts
// ---------------------------------------------------------------------------

function debt(overrides = {}) {
  return Object.assign({
    type: 'personalLoan', balance: 100000, rate: 6, rateType: 'fixed',
    paymentMonthly: 0, extraPrincipalMonthly: 0, payoffAge: 999,
    includePayment: true, includeHousingCosts: false,
  }, overrides);
}

test('projectDebts: no debts returns a zeroed result and mutates nothing', () => {
  const result = engine.projectDebts([], 60, 61, 1);
  /* P9 added the interest/principal/housing breakdown Q35 asked for. Still a
     fully zeroed result, now with every component named rather than three of
     them being absent from the contract. */
  assert.deepEqual(result, {
    retirementPayments: 0, totalPayments: 0,
    totalInterest: 0, totalPrincipal: 0, totalHousing: 0, perDebt: [],
  });
});

test('P9 / Q35: every dollar of debt payment is interest, principal, or a housing cost', () => {
  /* The half-ledger this exposure exists for. An across-year financing claim
     cannot be checked from a within-row net-worth identity, so the components
     have to add up on their own.

     Housing is a SEPARATE component rather than folded into debt service:
     property tax, insurance, HOA and PMI are none of them interest or
     principal, and calling them debt service is the quiet misclassification
     Q35 is about. */
  const debt = (over) => Object.assign({
    id: 'm1', type: 'mortgage', name: 'Home', owner: 'household', balance: 300000,
    rate: 6, paymentMonthly: 1800, payoffAge: 90, includePayment: true, rateType: 'fixed',
    extraPrincipalMonthly: 0, includeHousingCosts: false, annualPropertyTax: 0,
    annualInsurance: 0, hoaMonthly: 0, pmiMonthly: 0, nextRateResetAge: 0, resetRate: 0,
  }, over);

  const ordinary = engine.projectDebts([debt({})], 40, 41, 0);
  assert.ok(Math.abs(ordinary.totalPayments -
    (ordinary.totalInterest + ordinary.totalPrincipal + ordinary.totalHousing)) < 1e-9,
    'ordinary amortization must reconcile');
  assert.ok(ordinary.totalPrincipal > 0, 'and it must actually pay down principal');

  /* NEGATIVE AMORTIZATION, which is why principal is not clamped at zero. A
     payment below the monthly interest grows the balance, and the honest
     figure is negative principal -- capitalized interest. Clamping would have
     broken the identity on precisely the debts most worth noticing. */
  const negAm = engine.projectDebts([debt({ paymentMonthly: 100 })], 40, 41, 0);
  assert.ok(negAm.totalPrincipal < 0, 'a payment below interest must report NEGATIVE principal');
  assert.ok(Math.abs(negAm.totalPayments -
    (negAm.totalInterest + negAm.totalPrincipal + negAm.totalHousing)) < 1e-9,
    'and the identity must still hold when the balance grows');

  /* Housing costs are counted, and counted as their own thing. */
  const withHousing = engine.projectDebts(
    [debt({ includeHousingCosts: true, annualPropertyTax: 3600, annualInsurance: 1200 })], 40, 41, 0);
  assert.ok(Math.abs(withHousing.totalHousing - 4800) < 1e-9,
    'housing must total 4,800; got ' + withHousing.totalHousing);
  assert.ok(Math.abs(withHousing.totalPayments -
    (withHousing.totalInterest + withHousing.totalPrincipal + withHousing.totalHousing)) < 1e-9,
    'and the identity must hold with housing present');

  /* The per-debt breakdown must sum to the totals, or the roll-up is fiction. */
  const two = engine.projectDebts([debt({}), debt({ id: 'm2', balance: 120000, paymentMonthly: 900 })], 40, 41, 0);
  const sum = (f) => two.perDebt.reduce((s, d) => s + d[f], 0);
  assert.ok(Math.abs(sum('interest') - two.totalInterest) < 1e-9, 'per-debt interest must sum');
  assert.ok(Math.abs(sum('principal') - two.totalPrincipal) < 1e-9, 'per-debt principal must sum');
  assert.equal(two.perDebt.length, 2, 'and every debt must be represented');
});

test('projectDebts: a payment schedule at least covering interest pays down principal via real month-by-month amortization (B-6 fixed 2026-09-09)', () => {
  // Independent oracle: step the same $100k/6%/$2000-per-month loan through
  // 12 real monthly compounding steps by hand, not by calling the function
  // under test a second time. This replaces the pre-fix formula
  // (`balance*(Math.pow(1+rate,duration)-1)`, compounding the WHOLE
  // opening balance for the whole period before subtracting payments),
  // which is exactly finding B-6 in PLATFORM_DEVELOPMENT_ROADMAP.md.
  const monthlyRate = 0.06 / 12;
  let oracleBalance = 100000, oraclePaid = 0;
  for (let i = 0; i < 12; i++) {
    const interest = oracleBalance * monthlyRate;
    const applied = Math.min(2000, oracleBalance + interest);
    oracleBalance = Math.max(0, oracleBalance + interest - applied);
    oraclePaid += applied;
  }
  const d = debt({ balance: 100000, rate: 6, paymentMonthly: 2000 });
  const result = engine.projectDebts([d], 60, 61, 0);
  assert.ok(Math.abs(result.totalPayments - oraclePaid) < 1e-6);
  assert.ok(Math.abs(d.balance - oracleBalance) < 1e-6, 'the debt object\'s own balance must be mutated in place');
});

test('projectDebts: reaching payoffAge forces full payoff even if the scheduled payment alone would not cover it', () => {
  const d = debt({ balance: 50000, rate: 5, paymentMonthly: 10, payoffAge: 65 });
  engine.projectDebts([d], 64, 65, 0);
  assert.equal(d.balance, 0, 'balance must be fully retired once periodEnd reaches payoffAge, regardless of the tiny scheduled payment');
});

test('projectDebts: retirementPayments is prorated by retiredDuration/duration, and excludes debts with includePayment false', () => {
  const included = debt({ balance: 200000, rate: 4, paymentMonthly: 5000, includePayment: true });
  const excluded = debt({ balance: 200000, rate: 4, paymentMonthly: 5000, includePayment: false });
  const periodStart = 54, periodEnd = 56, retiredDuration = 1; // retired for half the 2-year period
  const resultIncluded = engine.projectDebts([included], periodStart, periodEnd, retiredDuration);
  const resultExcluded = engine.projectDebts([excluded], periodStart, periodEnd, retiredDuration);
  assert.ok(resultIncluded.retirementPayments > 0, 'includePayment:true must attribute a prorated share to retirement');
  assert.equal(resultExcluded.retirementPayments, 0, 'includePayment:false must never appear in retirementPayments');
  assert.ok(Math.abs(resultIncluded.retirementPayments - resultIncluded.totalPayments * 0.5) < 1e-6, 'retiredDuration 1 of duration 2 must prorate to exactly half');
});

test('projectDebts: an adjustable-rate mortgage uses the base rate before reset and the reset rate at/after it', () => {
  /* S5AA TASK 5.1 (Q94) CHANGED WHAT "AFTER THE RESET" LOOKS LIKE, and the two halves of this test are
     now measured differently on purpose.

     BEFORE the reset, nothing has re-amortised and the isolation still works: paymentMonthly is 0, so
     every month's interest capitalises onto the balance, and the oracle is plain monthly compounding
     computed here rather than by the function under test.

     AT AND AFTER the reset, the loan re-amortises unconditionally, so a zero payment no longer stays
     zero -- the lender's reset supplies one. The reset rate is therefore visible in the PAYMENT rather
     than in capitalised interest, and the oracle is the textbook amortising payment at 8% over the
     remaining term, again computed here. That is a more direct measurement of "the reset rate applies"
     than the old one, not a weaker one. */
  const payoffAge = 85;
  const make = () => debt({ type: 'mortgage', rateType: 'adjustable', rate: 3, resetRate: 8, nextRateResetAge: 60, balance: 300000, paymentMonthly: 0, payoffAge });

  const beforeReset = make();
  engine.projectDebts([beforeReset], 58, 59, 0);
  const expectedBeforeReset = 300000 * Math.pow(1 + 0.03 / 12, 12);
  assert.ok(Math.abs(beforeReset.balance - expectedBeforeReset) < 1e-6, 'before the reset age, the base rate applies');

  const afterReset = make();
  const result = engine.projectDebts([afterReset], 60, 61, 0);
  const months = Math.round((payoffAge - 60) * 12);
  const r8 = 0.08 / 12;
  const textbookAt8 = (300000 * r8) / (1 - Math.pow(1 + r8, -months));
  assert.ok(Math.abs(result.totalPayments / 12 - textbookAt8) < 1e-6,
    'at the reset age, the reset rate decides the re-amortised payment: expected ' + textbookAt8
    + ' a month, got ' + (result.totalPayments / 12));

  const r3 = 0.03 / 12;
  const textbookAt3 = (300000 * r3) / (1 - Math.pow(1 + r3, -months));
  assert.ok(Math.abs(result.totalPayments / 12 - textbookAt3) > 1,
    'CONTROL: and it is the RESET rate, not the base rate -- 8% and 3% must give different payments');
});

test('projectDebts: mortgage housing costs (tax/insurance/hoa/pmi) are counted separately from principal paydown', () => {
  const d = debt({
    type: 'mortgage', includeHousingCosts: true, balance: 0, // paid off, so only housing costs remain
    annualPropertyTax: 6000, annualInsurance: 1200, hoaMonthly: 100, pmiMonthly: 50,
  });
  const result = engine.projectDebts([d], 60, 61, 1);
  const expectedHousing = 6000 + 1200 + 12 * 100; // pmiMonthly excluded: balance is already 0
  assert.equal(result.totalPayments, expectedHousing);
  assert.equal(result.retirementPayments, expectedHousing, 'fully retired for the whole period -> full housing cost attributed');
});

test('projectDebts: a half-year period (duration 0.5) steps exactly 6 months, matching a from-scratch 6-month oracle', () => {
  const monthlyRate = 0.06 / 12;
  let oracleBalance = 100000;
  for (let i = 0; i < 6; i++) {
    const interest = oracleBalance * monthlyRate;
    const applied = Math.min(2000, oracleBalance + interest);
    oracleBalance = Math.max(0, oracleBalance + interest - applied);
  }
  const d = debt({ balance: 100000, rate: 6, paymentMonthly: 2000 });
  engine.projectDebts([d], 60, 60.5, 0);
  assert.ok(Math.abs(d.balance - oracleBalance) < 1e-6, `expected ${oracleBalance.toFixed(6)}, got ${d.balance.toFixed(6)}`);
});

test('projectDebts: extraPrincipalMonthly accelerates payoff relative to the same loan with none', () => {
  const withExtra = debt({ balance: 100000, rate: 6, paymentMonthly: 2000, extraPrincipalMonthly: 500 });
  const withoutExtra = debt({ balance: 100000, rate: 6, paymentMonthly: 2000, extraPrincipalMonthly: 0 });
  engine.projectDebts([withExtra], 60, 61, 0);
  engine.projectDebts([withoutExtra], 60, 61, 0);
  assert.ok(withExtra.balance < withoutExtra.balance, 'extra monthly principal must leave a lower balance after the same period');
});

test('projectDebts: a small balance paid off partway through the period stops accruing interest for the remaining months (no overpayment, no continued interest on a cleared debt)', () => {
  // $1,000 balance, $500/month payment -> retired well before 12 months.
  // The loop's own `balance>1e-9` guard must stop it from accruing further
  // interest or "paying" anything more once cleared.
  const d = debt({ balance: 1000, rate: 6, paymentMonthly: 500 });
  const result = engine.projectDebts([d], 60, 61, 0);
  assert.equal(d.balance, 0);
  // Total paid must be very close to the original balance plus the tiny
  // amount of interest accrued in the one or two months it took to clear
  // it -- nowhere near a full 12 months of $500 payments (which would be
  // $6,000).
  assert.ok(result.totalPayments < 1100, `expected payoff with only a couple months of interest, not a full year of payments -- got ${result.totalPayments.toFixed(2)}`);
});

test('projectDebts: multiple debts in one call are each amortized independently, using their own rate/payment/balance', () => {
  const a = debt({ balance: 50000, rate: 4, paymentMonthly: 1000 });
  const b = debt({ balance: 200000, rate: 8, paymentMonthly: 500 }); // payment well below interest -> negative amortization
  engine.projectDebts([a, b], 60, 61, 0);
  assert.ok(a.balance < 50000, 'debt a, well-covered by its payment, must pay down');
  assert.ok(b.balance > 200000, 'debt b, under-covered by its payment, must grow (negative amortization) independently of debt a');
});

// ---------------------------------------------------------------------------
// Q43: following the forced payoff into runPlan()'s cash flow
// ---------------------------------------------------------------------------
//
// The payoff test above stops at the debt's own balance. It shows the forced
// payoff zeroes the debt, and never follows the dollars into runPlan(). That
// gap is why a $20,000 debt at 20% with a zero payment could become a
// $166,164,101 payoff at 75. It was reported "ok" with no code when the
// portfolio could absorb it, and as ordinary insolvency when it could not.
//
// Decided at S5 2b: a forced payoff of a debt whose payment is exactly 0 on a
// positive rate -- the case the validator's PAYMENT_BELOW_INTEREST warning
// names -- is a calculation error. Everything outside that case is a control
// below, so a flag that is wider or narrower than decided fails a named test.

const { extractDefaultPlan } = require('./lib/golden-scenario-defs.js');
const payoffDefaultPlan = extractDefaultPlan(shell);

/* The S5 2b.1 reproduction: the default plan with simple returns, retiring at
   65, and one $20,000 debt at 20% with an explicit zero payment and payoffAge
   75. `fund` adds one taxable account holding that balance. */
function payoffPlan(debtOver, fund) {
  const p = JSON.parse(JSON.stringify(payoffDefaultPlan));
  p.profile.retireAge = 65;
  p.assumptions.method = 'simple';
  if (fund) {
    p.accounts.push({
      id: 'a1', name: 'A', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: fund,
      contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0,
      annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
      allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    });
  }
  p.advanced.debts = [Object.assign({
    id: 'd1', name: 'Debt', type: 'otherDebt', owner: 'household', balance: 20000, rate: 20,
    rateType: 'fixed', paymentMonthly: 0, extraPrincipalMonthly: 0, payoffAge: 75,
    includePayment: true, includeHousingCosts: false,
  }, debtOver)];
  return p;
}
const rowAt = (r, age) => r.rows.find((row) => row.age >= age && row.age < age + 1);
const payoffIssue = (r) => (r.issues || []).find((i) => i.code === 'DEBT_ZERO_PAYMENT_FORCED_PAYOFF');

test('Q43: a zero-payment debt forced out at payoffAge is a calculation error, not a silent $166M withdrawal', () => {
  const r = engine.runPlan(payoffPlan({}, 600000000));
  assert.equal(r.status, 'calculation_error',
    'a $600M portfolio absorbs the $166,164,101 payoff, and this was reported "ok", with shortfall 0 and no code');
  assert.equal(r.calculationErrorCode, 'DEBT_ZERO_PAYMENT_FORCED_PAYOFF');
  assert.equal(r.rows, null, 'an invalidated result carries no financial rows');
  const issue = payoffIssue(r);
  assert.ok(issue && issue.severity === 'ERROR', 'an ERROR issue must name what happened');
  assert.ok(issue.state.age >= 75 && issue.state.age < 76, 'at the period that reaches payoffAge 75, got ' + issue.state.age);
  assert.equal(Math.round(issue.state.forced), 166164101, 'the amount forced out is the one the S5 2b.1 reproduction measured');
});

test('Q43: against an unfunded plan the same payoff is a calculation error, not ordinary insolvency', () => {
  const r = engine.runPlan(payoffPlan({}, 0));
  assert.equal(r.status, 'calculation_error',
    'with nothing to draw on, this was reported "ok" as an ordinary shortfall of $166,397,754');
  assert.equal(r.calculationErrorCode, 'DEBT_ZERO_PAYMENT_FORCED_PAYOFF');
  assert.equal(Math.round(payoffIssue(r).state.forced), 166164101, 'the debt path does not depend on the portfolio');
});

test('Q43 scope: the flag follows the zero payment, whether or not the payment counts toward spending', () => {
  /* With includePayment false the payoff drains no spending, but the debt still
     grows past $136M and then vanishes in one period. The validator's warning
     does not depend on includePayment, and neither does this. */
  const r = engine.runPlan(payoffPlan({ includePayment: false }, 600000000));
  assert.equal(r.status, 'calculation_error',
    'a zero-payment debt forced out is flagged even when its payment is excluded from spending');
  assert.equal(r.calculationErrorCode, 'DEBT_ZERO_PAYMENT_FORCED_PAYOFF');
});

/* Each control is its own test, so each can be shown failing on its own: a
   flag wider or narrower than decided breaks the one control it crosses. */
function assertUnflagged(debtOver, premise) {
  const r = engine.runPlan(payoffPlan(debtOver, 600000000));
  assert.equal(r.status, 'ok', 'must not be flagged, got ' + r.calculationErrorCode);
  assert.equal(r.calculationErrorCode, null);
  assert.ok(premise(r), 'the control\'s own premise must hold, or it tests nothing');
}

test('Q43 control: an interest-only debt forced out at payoffAge, an ordinary balloon, is not flagged', () => {
  assertUnflagged({ balance: 200000, rate: 6, paymentMonthly: 1000 }, (r) => rowAt(r, 75).debtPayments > 200000);
});

test('Q43 control: a zero payment at a zero rate, forced out at payoffAge, is not flagged', () => {
  assertUnflagged({ rate: 0 }, (r) => Math.abs(rowAt(r, 75).debtPayments - 20000) < 0.01);
});

test('Q43 control: a zero payment whose extra principal clears the debt before payoffAge is not flagged', () => {
  assertUnflagged({ extraPrincipalMonthly: 600 }, (r) => rowAt(r, 74).debtBalance < 0.01);
});

test('Q43 control: a zero payment whose payoffAge lies past the plan is not flagged; only the validator warns', () => {
  assertUnflagged({ payoffAge: 999 }, (r) => rowAt(r, 75).debtPayments === 0 && rowAt(r, 75).debtBalance > 1e8);
});

test('Q43 scope: an absent payment is not flagged, as the validator does not warn on it', () => {
  /* The validator runs before the app's normalizer supplies a default, so an
     absent paymentMonthly means "not stated", not zero, and it does not warn.
     The raw engine still reads it as 0 and pays the same $166,164,101 at 75.
     This pins the decided scope, so that widening it is a deliberate change. */
  const plan = payoffPlan({}, 600000000);
  delete plan.advanced.debts[0].paymentMonthly;
  const r = engine.runPlan(plan);
  assert.equal(r.status, 'ok', 'an absent payment is outside the flagged case');
  assert.ok(Math.abs(rowAt(r, 75).debtPayments - 166164101) < 1,
    'premise: the absent payment is still forced out at 75 as if it were zero');
});
