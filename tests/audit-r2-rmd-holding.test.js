'use strict';

/**
 * R2-T06 / HR-02 -- SYNTHETIC RMD-CASH HOLDING: INVESTMENT SEMANTICS.
 *
 * HR-02 (RETIREMENT_ENGINE_ROUND2_AUDIT_CLAUDE_QUEUE_2026-09-08.md) found
 * that retainExcessRmdCash()'s synthesized destination silently adopts an
 * investment treatment no user-configured account has:
 *
 *   (A) CREATION-PERIOD GROWTH. The account is appended to `accounts`
 *       AFTER simulatePlan() built its index-aligned `rates` array, so
 *       growAccounts()'s `rates[i]===undefined` guard skips it and it
 *       receives no remaining-period growth. The audit's own worked
 *       number: $8,000 deposited into an otherwise identical EXISTING
 *       empty taxable account at a 10% rate grows to $8,390.470785 over
 *       the remaining half-year; the synthesized account stays $8,000.
 *
 *   (B) ALLOCATION. It is created with `allocation:{}`. With
 *       `advanced.assetsOn` enabled, accountExpected() and
 *       accountVolatility() both see a zero weight total and fall back to
 *       the plan-wide returnRate/volatility -- a growth treatment that is
 *       neither an asset class the user configured nor anything any other
 *       account uses. Money labelled "cash" then carries whatever the
 *       plan-wide default risk happens to be.
 *
 * ROADMAP_EXTERNAL_REVIEW.md section 1 locks the policy that closes both:
 *
 *   "The holding inherits the exact allocation/growth treatment of the
 *    account it was synthesized from. No new asset class or bespoke
 *    policy."
 *
 * "The account it was synthesized from" is the pre-tax account the RMD
 * proceeds were actually drawn out of -- the only reading with a referent,
 * since the holding is synthesized precisely when no taxable account
 * exists to inherit from. See SPRINT_QUESTIONS.md Q2 for that call and for
 * the multiple-source tie-break.
 *
 * The acceptance shape is the audit's own: "compare an explicit equivalent
 * destination with the synthesized destination under the adopted policy;
 * assert the expected next-period return/volatility directly."
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

const SOURCE_ALLOCATION = { stocks: 60, bonds: 30, cash: 10 };

function preTaxAccount(overrides) {
  return Object.assign({
    id: 'p1', name: '401k', type: 'traditional401k', taxClass: 'preTax', owner: 'self',
    balance: 2000000, contribution: 0, contributionMode: 'amount', priority: 1,
    basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
    changeTiming: 'year', futureChanges: [], allocation: Object.assign({}, SOURCE_ALLOCATION),
    matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }, overrides || {});
}

function emptyTaxableAccount(overrides) {
  return Object.assign({
    id: 't1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 0, contribution: 0, contributionMode: 'amount', priority: 2,
    basisPct: 100, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
    changeTiming: 'year', futureChanges: [], allocation: Object.assign({}, SOURCE_ALLOCATION),
    matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }, overrides || {});
}

/** A plan whose RMD provably exceeds every use of cash in the period, so
 *  retainExcessRmdCash() is reached: a large pre-tax balance at an age well
 *  past the RMD start, against small spending and no other draws. */
function rmdSurplusPlan(accounts, overrides) {
  overrides = overrides || {};
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.id = 'rmd-holding';
  p.accounts = accounts;
  p.profile.age = 80;
  p.profile.retireAge = 80;
  p.profile.endAge = 82;
  p.profile.spouseOn = false;
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;
  p.assumptions.method = 'simple';
  p.assumptions.withdrawalTiming = 'monthly';
  p.assumptions.returnRate = 10;
  p.assumptions.inflation = 0;
  p.assumptions.fee = 0;
  p.retirement.strategy = 'fixedNominal';
  p.retirement.spending = 20000;
  p.retirement.flexibility = 0;
  p.retirement.ssBenefit = 0;
  p.retirement.spouseSS = 0;
  p.retirement.pension = 0;
  p.retirement.dividendOn = false;
  p.retirement.survivor = false;
  p.retirement.stages = [];
  p.retirement.expenses = [];
  p.retirement.otherIncomes = [];
  p.advanced.rmdOn = true;
  p.advanced.qcd = 0;
  p.advanced.healthOn = false;
  p.advanced.ltcOn = false;
  p.advanced.conversionOn = false;
  p.advanced.transferOn = false;
  p.advanced.reserveOn = false;
  p.advanced.bondTentOn = false;
  p.advanced.assetsOn = false;
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  Object.assign(p.advanced, overrides.advanced || {});
  Object.assign(p.assumptions, overrides.assumptions || {});
  return p;
}

// ---------------------------------------------------------------------
// Defect B -- allocation inheritance, at the direct-helper level.
// ---------------------------------------------------------------------

test('HR-02 (B): a synthesized RMD-cash holding inherits the allocation of the pre-tax account the proceeds came from, rather than being created with an empty one', () => {
  const source = preTaxAccount();
  const accounts = [source];
  const dest = engine.retainExcessRmdCash(accounts, 8000, source);
  assert.ok(dest, 'a destination must be produced');
  assert.notEqual(dest, source, 'the holding must be its own account, not the pre-tax account itself');
  assert.equal(dest.taxClass, 'taxable', 'the accepted taxable-destination architecture is unchanged');
  assert.deepEqual(dest.allocation, SOURCE_ALLOCATION,
    'expected the source account\'s allocation, got ' + JSON.stringify(dest.allocation));
});

test('HR-02 (B): the inherited allocation is a COPY -- later growth or rebalancing of the source account must not reach through into the synthesized holding', () => {
  const source = preTaxAccount();
  const accounts = [source];
  const dest = engine.retainExcessRmdCash(accounts, 8000, source);
  source.allocation.stocks = 99;
  assert.equal(dest.allocation.stocks, 60,
    'the holding shares an allocation object with its source account -- it must hold its own copy');
});

test('HR-02 (B): the holding introduces NO new asset class -- every allocation key is one the plan already defines', () => {
  const source = preTaxAccount();
  const accounts = [source];
  const dest = engine.retainExcessRmdCash(accounts, 8000, source);
  const configured = defaultPlan.advanced.assetClasses.map(function (ac) { return ac.id; });
  for (const key of Object.keys(dest.allocation)) {
    assert.ok(configured.indexOf(key) !== -1,
      'allocation key "' + key + '" is not a configured asset class -- HR-02 forbids inventing one');
  }
});

test('HR-02 (B): with assetsOn, the holding\'s next-period expected return AND volatility equal the source account\'s exactly -- not the plan-wide fallback', () => {
  const source = preTaxAccount();
  const accounts = [source];
  const dest = engine.retainExcessRmdCash(accounts, 8000, source);
  const p = rmdSurplusPlan(accounts, { advanced: { assetsOn: true } });

  const sourceExpected = engine.accountExpected(source, p, 0, null);
  const destExpected = engine.accountExpected(dest, p, 0, null);
  const sourceVol = engine.accountVolatility(source, p);
  const destVol = engine.accountVolatility(dest, p);

  assert.equal(destExpected, sourceExpected,
    'expected return ' + destExpected + ' does not match the source account\'s ' + sourceExpected);
  assert.equal(destVol, sourceVol,
    'volatility ' + destVol + ' does not match the source account\'s ' + sourceVol);

  // Proves the assertions above are not vacuous: the plan-wide fallback is
  // a genuinely DIFFERENT number, so a holding still using it would fail.
  const fallbackExpected = p.assumptions.returnRate / 100;
  const fallbackVol = p.assumptions.volatility / 100;
  assert.notEqual(sourceExpected, fallbackExpected, 'test setup error: the source allocation must not coincide with the plan-wide return');
  assert.notEqual(sourceVol, fallbackVol, 'test setup error: the source allocation must not coincide with the plan-wide volatility');
});

test('HR-02 (B): an EXISTING taxable account is still used untouched when one is present -- the accepted architecture and ordinary account behavior are unchanged', () => {
  const source = preTaxAccount();
  const existing = emptyTaxableAccount({ allocation: { stocks: 100 } });
  const accounts = [source, existing];
  const dest = engine.retainExcessRmdCash(accounts, 8000, source);
  assert.equal(dest, existing, 'the existing taxable account must be the destination');
  assert.equal(accounts.length, 2, 'no account may be synthesized when a taxable account already exists');
  assert.deepEqual(dest.allocation, { stocks: 100 },
    'an existing account\'s own allocation must not be overwritten by the source account\'s');
  assert.equal(dest.balance, 8000);
});

// ---------------------------------------------------------------------
// Defect A -- creation-period growth, and the audit's equivalence test.
// ---------------------------------------------------------------------

test('HR-02 (A): the synthesized holding and an equivalent explicit destination produce IDENTICAL results -- the audit\'s stated acceptance criterion', () => {
  const synthesized = engine.runPlan(rmdSurplusPlan([preTaxAccount()]));
  const explicit = engine.runPlan(rmdSurplusPlan([preTaxAccount(), emptyTaxableAccount()]));

  const synthRows = synthesized.rows.map(function (r) { return Math.round(r.total * 1e6) / 1e6; });
  const explicitRows = explicit.rows.map(function (r) { return Math.round(r.total * 1e6) / 1e6; });

  assert.deepEqual(synthRows, explicitRows,
    'a synthesized destination and an equivalent explicit one must agree; synthesized=' +
    JSON.stringify(synthRows) + ' explicit=' + JSON.stringify(explicitRows));
});

test('HR-02 (A): the synthesized holding actually receives remaining-period growth -- it is not frozen at its deposited amount for the period it is created in', () => {
  // Isolates growth from the deposit by holding the DEPOSIT constant and
  // varying only the return. The RMD is sized off openingPreTax (fixed at
  // the top of the period), spending is fixedNominal with zero inflation,
  // pre-tax withdrawals realize no capital gains, and the pre-tax balance
  // is ample in both runs -- so the retained cash amount is identical at
  // 0% and at 10%, and the ONLY thing that can separate the two resulting
  // holdings is the remaining-period growth this test is about.
  const grown = engine.simulatePlan(rmdSurplusPlan([preTaxAccount()], { assumptions: { returnRate: 10 } }), null, 0, null, null).rows[1];
  const flat = engine.simulatePlan(rmdSurplusPlan([preTaxAccount()], { assumptions: { returnRate: 0 } }), null, 0, null, null).rows[1];

  assert.ok(flat.taxable > 0, 'the period must actually retain RMD cash into a taxable holding for this probe to mean anything');

  // 'monthly' withdrawal timing applies 50% of the period's compounding
  // before the decision, leaving the other half to run after retention --
  // exactly the audit's "remaining half-year."
  const lateGrowthFactor = Math.pow(1.10, 0.5);
  assert.ok(Math.abs(grown.taxable - flat.taxable * lateGrowthFactor) < 1e-6,
    'the synthesized holding did not receive exactly the remaining half-period of growth: ' +
    'deposited ' + flat.taxable + ' should have grown to ' + (flat.taxable * lateGrowthFactor) +
    ', got ' + grown.taxable);
});

test('HR-02 (A): the deposited-then-grown holding matches the audit\'s own worked number ($8,000 -> $8,390.470785 over the remaining half-year at 10%)', () => {
  // Reproduces the audit's arithmetic directly against the engine's own
  // growth primitive, so the equivalence tests above are anchored to the
  // number HR-02 was written around rather than only to each other.
  const source = preTaxAccount();
  const accounts = [source];
  const dest = engine.retainExcessRmdCash(accounts, 8000, source);
  const rate = engine.accountExpected(source, rmdSurplusPlan(accounts), 0, null);
  engine.growAccounts([dest], [rate], 0.5);
  assert.ok(Math.abs(dest.balance - 8390.470785) < 1e-5,
    'expected 8390.470785, got ' + dest.balance);
});

// =====================================================================
// Q2c RESERVE EQUIVALENCE -- the disclosed policy exception, pinned.
// Audit item 6: "Record the precise Q2c reserve equivalence policy and test
// it. Clarify which equivalence the acceptance test requires; do not
// silently claim all reserve-on configurations pass."
// =====================================================================

/** The audit's quantified configuration: a $2,000,000 source, $20,000
 *  spending, a three-year reserve, a 10% base return, no fee and no bond
 *  tent. */
function reservePlan() {
  const p = rmdSurplusPlan([preTaxAccount()], { advanced: { reserveOn: true, reserveYears: 3 } });
  p.assumptions.returnRate = 10;
  p.assumptions.fee = 0;
  p.retirement.spending = 20000;
  p.advanced.bondTentOn = false;
  return p;
}

test('Q2c: the reserve overlay is computed from EACH ACCOUNT\'s own balance over the portfolio total, so a $2m source and an empty destination get different rates', () => {
  const p = reservePlan();
  const source = p.accounts[0];
  const emptyDestination = emptyTaxableAccount({ balance: 0 });
  const portfolioTotal = source.balance;

  const sourceRate = engine.accountReturnForPeriod(source, p, 80, 0, 0, null, portfolioTotal);
  const destinationRate = engine.accountReturnForPeriod(emptyDestination, p, 80, 0, 0, null, portfolioTotal);

  // reserve = min(balance, spending * reserveYears) = min(2000000, 60000)
  // share  = 60000 / 2000000 = 0.03
  // rate   = 0.10 * 0.97 + 0.03 * 0.03 = 0.0979
  assert.ok(Math.abs(sourceRate - 0.0979) < 1e-12, 'expected the source rate to be 9.79%, got ' + sourceRate);
  assert.ok(Math.abs(destinationRate - 0.10) < 1e-12, 'an empty destination reserves nothing, so it keeps the full 10%, got ' + destinationRate);
  assert.notEqual(sourceRate, destinationRate,
    'these two rates MUST differ -- that is the whole reason exact equivalence cannot hold under reserveOn');
});

test('Q2c: the RECORDED policy is that the holding inherits the SOURCE\'s realized rate, reserve blend included -- not the rate an explicit destination would have got', () => {
  const p = reservePlan();
  const source = p.accounts[0];
  const portfolioTotal = source.balance;
  const sourceRate = engine.accountReturnForPeriod(source, p, 80, 0, 0, null, portfolioTotal);

  const accounts = [source];
  const dest = engine.retainExcessRmdCash(accounts, 8000, source);
  engine.growAccounts([dest], [sourceRate], 0.5);

  assert.ok(Math.abs(dest.balance - 8000 * Math.pow(1 + sourceRate, 0.5)) < 1e-9,
    'the holding must grow at the source account\'s own rate under the recorded policy');
  assert.ok(dest.balance < 8000 * Math.pow(1.10, 0.5),
    'and that is measurably LESS than an explicit empty destination would have earned -- the disclosed exception, stated numerically rather than glossed');
});

test('Q2c: the equivalence acceptance test is scoped to reserveOn = false, and that scope is asserted rather than assumed', () => {
  // With the reserve overlay off, the source and an equivalent explicit
  // destination get identical rates, so the synthesized and explicit
  // destinations agree exactly -- which is what the HR-02 equivalence test
  // above relies on.
  const p = rmdSurplusPlan([preTaxAccount()]);
  assert.equal(p.advanced.reserveOn, false, 'the HR-02 equivalence fixture must have the reserve overlay off');
  const source = p.accounts[0];
  const sourceRate = engine.accountReturnForPeriod(source, p, 80, 0, 0, null, source.balance);
  const destinationRate = engine.accountReturnForPeriod(emptyTaxableAccount({ balance: 0 }), p, 80, 0, 0, null, source.balance);
  assert.equal(sourceRate, destinationRate,
    'without the reserve overlay the two rates coincide, which is why exact equivalence holds there and only there');
});
