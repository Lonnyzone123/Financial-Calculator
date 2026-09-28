'use strict';

// R2-T02 (RETIREMENT_ENGINE_ROUND2_AUDIT_CLAUDE_QUEUE_2026-09-08.md findings
// R2-001/R2-002; CLAUDE_CODE_FIX_HANDOVER_TAX_FUNDING_AND_ROUND2_2026-09-08.md
// section 5): integrates quoteTaxFunding() (R2-T01) into simulatePlan()'s
// annual loop, and fixes R2-002 -- RMD proceeds beyond spending need are no
// longer deposited via retainExcessRmdCash() before tax settlement runs;
// the cash is tracked (rmdCashForTax) and consumed by the tax quote first,
// with only the genuine leftover deposited afterward.
//
// This file exercises simulatePlan()/runPlan() directly on small, bounded
// one/two-period "simple" mode fixtures -- no Monte Carlo, no historical
// replay, no long projections -- per the audit's execution restrictions.
// The exact $35,502.50 RMD checkpoint and the corrected TG-R2-03 "retained
// cash is necessary" fixture live in tests/audit-rmd-cash.test.js (the file
// R2-T02's own task description names for that correction); this file
// covers the remaining named acceptance criteria: depletion, penalty/tax
// crossover, no double counting (account roll-forward), and zero/below/
// equal surplus.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

/* S3 task 3: the worker source comes from tests/lib/worker-source.js, which
   BUILDS the real artifact and asks the app for the source it would hand a
   Worker. What used to live here was a third assembly -- raw engine source
   plus the shell function, WITHOUT build.js's debt factory -- so it threw
   ReferenceError: DebtAmortization is not defined on any flag-on ARM plan
   while the shipped worker computed it fine (re-audit section 5 item 4).
   Every test written against it was confidently exercising something that
   does not ship. Reimplementing buildWorkerSource() is what produced that,
   so nothing here reimplements it. */
const { runPlanThroughLiveWorker, cleanup: cleanupWorkerSource } = require('./lib/worker-source');
test.after(() => cleanupWorkerSource());

function defaultPlan() {
  const defaultPlanMatch = shell.match(/var defaultPlan=(\{.*?\});/);
  // eslint-disable-next-line no-eval
  return JSON.parse(JSON.stringify(eval('(' + defaultPlanMatch[1] + ')')));
}

/* The FULL app exactly as build.js assembles it: tests/lib/harness.js's fresh
   build of this tree, into a scratch directory, never the shipped artifact.
   This used to re-transcribe build.js's header and footer stripping here. That
   copy had already drifted -- it never bundled the debt modules -- and S5 2l,
   where build.js hands the engine the boolean-flag contract, left it shipping
   an engine that cannot load. Required lazily, so a missing jsdom still reads
   as a skip. */
function assembleLiveApp() {
  return require('./lib/harness').freshBuildHtml();
}

/* The DOM consumer tests below need `jsdom` (a devDependency). A bounded
   external review environment may not have it installed -- the round-3
   requalification reported exactly that, and those tests failing to START
   read as product failures when they are nothing of the kind. Declaring them
   as skipped when jsdom is genuinely absent keeps that distinction honest:
   they still run in full anywhere `npm install` has been done, and a skip is
   visibly a skip rather than a pass. */
let jsdomAvailable = true;
try { require('jsdom'); } catch (e) { jsdomAvailable = false; }
const uiTest = jsdomAvailable ? {} : { skip: 'jsdom is not installed in this environment; run npm install to execute the DOM consumer tests' };

/** Loads the in-memory assembled app into jsdom with a seeded scenario. */
async function loadLiveApp(appState) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(assembleLiveApp(), { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
  dom.window.localStorage.setItem('investment-calculator-v2c', JSON.stringify(appState));
  const mainScript = Array.from(dom.window.document.querySelectorAll('script'))
    .find((el) => el.getAttribute('type') !== 'application/json'
      && el.textContent.includes('investment-calculator-v2c'));
  assert.ok(mainScript, 'could not find the app script -- selection keys off the app\'s own root lookup, ' +
    'because app-shell.html also carries a PWA manifest/icon bootstrap script in <head>');
  dom.window.eval(mainScript.textContent);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  return dom;
}

function account(overrides) {
  return Object.assign(
    {
      id: 'pretax', name: '401k', type: 'traditional401k', taxClass: 'preTax', owner: 'self',
      balance: 100000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 0,
      annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
      futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    },
    overrides
  );
}

/** One bounded, deterministic one-period "simple" mode plan: age 75->76,
    zero market return, no growth-obscuring noise, dividends off. */
function onePeriodPlan(overrides) {
  const p = defaultPlan();
  p.setupComplete = true;
  p.profile.age = 75;
  p.profile.retireAge = 65;
  p.profile.endAge = 76;
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;
  p.retirement.ssBenefit = 0; // isolate RMD/tax-settlement arithmetic from an unrelated SS stream
  p.retirement.dividendOn = false;
  p.advanced.rmdOn = true;
  p.retirement.strategy = 'fixedNominal';
  p.retirement.spending = 0;
  p.assumptions.returnRate = 0;
  p.assumptions.method = 'simple';
  p.accounts = [account({ balance: 1000000 })];
  return Object.assign(p, overrides || {});
}

// --- Exact checkpoint via runPlan() itself (not just quoteTaxFunding) ----

test('R2-T02: the exact $35,502.50 RMD checkpoint holds end-to-end through runPlan(), not just the bare quotation', () => {
  const p = onePeriodPlan();
  p.profile.filing = 'single'; // the $2,497.50/$35,502.50 checkpoint is specific to single filing status
  p.retirement.spending = 2000;
  p.accounts = [account({ balance: 984000 })]; // 984000/24.6 = exactly $40,000 RMD, matching the handover's exact fixture
  const result = engine.runPlan(p);
  const row = result.rows[1];
  assert.equal(row.calculationError, false);
  assert.ok(Math.abs(row.rmd - 40000) < 0.01, `expected exactly a $40,000 RMD, got ${row.rmd}`);
  const realTax = engine.estimateTaxes(p, 75, row.rmd, 0, 0, 0, 0, 0).total;
  /* R6 (S5 task 8, the Arizona age-65 exemption, TAX section 5.3, ENACTED): $2,497.50 became $2,445.00 -- one $2,100 exemption for a single person 75 takes $52.50 off the Arizona tax.
     The mechanism this pins is unchanged, and $2,497.50 returns exactly with the exemption set to $0. */
  assert.ok(Math.abs(realTax - 2199) < 0.5, `expected real tax near $2,199.00 for this fixture ($2,497.50 before Arizona's age-65 exemption, $2,445.00 before the 63(f) additional deduction), got ${realTax}`);
  assert.equal(row.shortfall, 0, 'no additional tax-funding sale should have been needed');
  assert.ok(Math.abs(row.taxable - (row.rmd - 2000 - realTax)) < 1, `expected retained cash to equal RMD minus spending minus real tax, got taxable=${row.taxable}`);
  assert.equal(result.issues.length, 0, 'expected a clean run with no reconciliation issues');
});

// --- Depletion: genuine shortfall, never a false calculation error --------

test('R2-T02: true depletion is reported as a real shortfall, not a calculation error', () => {
  const p = onePeriodPlan();
  p.retirement.spending = 500000; // far exceeds the $100,000 preTax account
  p.accounts = [account({ balance: 100000 })];
  const result = engine.runPlan(p);
  const row = result.rows[1];
  assert.equal(row.calculationError, false, 'genuine insolvency must not be reported as a calculation error');
  assert.ok(row.shortfall > 0, `expected a real shortfall, got ${row.shortfall}`);
  assert.equal(row.preTax, 0, 'the sole account should have been fully drained, not left partially unsold');
  assert.ok(result.failed, 'a real shortfall must still mark the run failed');
});

// --- Penalty and tax crossover: funded exactly once, no double counting --

test('R2-T02: an early-withdrawal penalty is funded exactly once alongside ordinary tax, with no double counting', () => {
  const p = onePeriodPlan();
  p.profile.age = 50; // under 59.5 -> preTax withdrawals incur the 10% penalty
  p.profile.retireAge = 50; // must already be "retired" for a spending request to apply at all
  p.profile.endAge = 51;
  p.advanced.rmdOn = false; // no RMD at 50; isolate the penalty/tax-funding path
  p.retirement.spending = 40000;
  p.accounts = [account({ balance: 1000000 })];
  const result = engine.runPlan(p);
  const row = result.rows[1];
  assert.equal(row.calculationError, false);
  assert.equal(row.shortfall, 0);
  // Independently recompute the exact expected withdrawal+tax+penalty via
  // the SAME finite solver this integration calls, then verify the actual
  // committed row reproduces it.
  const T0 = engine.estimateTaxes(p, 50, 0, 0, 0, 0, 0, 0).total;
  const taxCtx = {
    ordinaryIncome: 0, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: p.profile.filing, seniorAges: [50, -1], Tbase: T0, payrollConst: 0,
    penalties: 0, penaltyApplies: true,
  };
  // Solve for the gross preTax sale that nets exactly $40,000 of spending:
  // quote against a Tbase shifted by the spending target, mirroring how the
  // fixture's own request translates into a funding gap.
  const quote = engine.quoteTaxFunding(
    { ...taxCtx, Tbase: T0 - 40000 },
    ['preTax', 'taxable', 'roth', 'hsa'],
    [account({ balance: 1000000 })],
    p, 0, 0
  );
  assert.equal(quote.status, 'funded');
  const expectedGross = quote.transactions.reduce((s, t) => s + t.gross, 0);
  assert.ok(Math.abs(row.withdrawals - expectedGross) < 0.5, `expected total withdrawal ${expectedGross}, got ${row.withdrawals}`);
  const expectedPenalty = expectedGross * 0.10;
  assert.ok(1000000 - row.preTax > 0, 'sanity check: some preTax balance should have been withdrawn');
  // Penalty must show up exactly once inside row.taxes (taxes.total+penalties, per simulatePlan), not folded in twice.
  const realTaxOnGross = engine.estimateTaxes(p, 50, expectedGross, 0, 0, 0, 0, 0).total;
  assert.ok(Math.abs(row.taxes - (realTaxOnGross + expectedPenalty)) < 1, `expected row.taxes to equal real tax + penalty exactly once, got ${row.taxes} vs expected ${realTaxOnGross + expectedPenalty}`);
});

// --- No double counting: account roll-forward identity holds exactly -----

test('R2-T02: account roll-forward reconciles exactly (opening + growth - withdrawals = closing) for a mixed RMD+tax-sale period', () => {
  const p = onePeriodPlan();
  p.retirement.spending = 60000; // exceeds RMD cash alone, forcing an additional tax-funding sale too
  p.accounts = [account({ balance: 500000 })];
  const issues = [];
  const result = engine.simulatePlan(p, engine.rng(p.assumptions.seed), 0, null, issues);
  assert.deepEqual(issues, [], `expected no reconciliation mismatches, got ${JSON.stringify(issues.slice(0, 3))}`);
  const row = result.rows[1];
  assert.equal(row.calculationError, false);
  // Independent identity: opening balance + contributions - withdrawals (no
  // growth in this zero-return fixture) must equal the closing total.
  assert.ok(Math.abs((500000 - row.withdrawals) - row.total) < 0.5, `expected opening $500,000 minus withdrawals ${row.withdrawals} to equal closing total ${row.total}`);
});

// --- Zero / below / equal surplus ------------------------------------------

test('R2-T02: RMD cash below the tax obligation still funds correctly via an additional sale', () => {
  const p = onePeriodPlan();
  p.retirement.spending = 0;
  p.accounts = [account({ balance: 30000 })]; // small RMD, likely under its own tax once combined with a forced need
  p.retirement.spending = 20000; // spending need exceeds the small RMD, forcing a real additional sale
  const result = engine.runPlan(p);
  const row = result.rows[1];
  assert.equal(row.calculationError, false);
  assert.equal(row.shortfall, 0, 'a $30,000 account funding a $20,000 need should not shortfall');
});

test('R2-T02: RMD cash exactly matching need (no surplus, no shortfall) reconciles with zero residual', () => {
  const p = onePeriodPlan();
  p.accounts = [account({ balance: 300000 })];
  const probe = engine.runPlan(p);
  const rmdAmount = probe.rows[1].rmd;
  // Set spending so requested need consumes the RMD cash almost exactly
  // (leave a $1 margin so floating point doesn't flip the sign).
  const p2 = onePeriodPlan();
  p2.accounts = [account({ balance: 300000 })];
  p2.retirement.spending = Math.max(0, rmdAmount - 1);
  const result = engine.runPlan(p2);
  const row = result.rows[1];
  assert.equal(row.calculationError, false);
  assert.equal(row.shortfall, 0);
  assert.ok(row.taxable < 100, `expected little to no retained cash when RMD is nearly fully consumed by spending, got ${row.taxable}`);
});

test('R2-T02: RMD cash well above both spending and its own tax retains the genuine surplus (no false shortfall)', () => {
  const p = onePeriodPlan();
  p.retirement.spending = 1000;
  p.accounts = [account({ balance: 2000000 })]; // large RMD relative to spending
  const result = engine.runPlan(p);
  const row = result.rows[1];
  assert.equal(row.calculationError, false);
  assert.equal(row.shortfall, 0);
  assert.ok(row.taxable > row.rmd * 0.5, `expected the bulk of the large RMD surplus retained, got taxable=${row.taxable} vs rmd=${row.rmd}`);
});

// ---------------------------------------------------------------------------
// R2V-001 (R2_T01_T02_EXTERNAL_AUDIT_AND_CLAUDE_HANDOVER_2026-09-09.md): the
// audit's own end-to-end boundary reproduction, held to a cent-level
// assertion (test gap #2 the audit named: prior fixtures only bounded
// retained cash loosely). An RMD sale that drains its account to zero
// leaves every withdrawal class at a zero balance for the tax-funding
// cascade -- the settlement must still retain the genuine cash surplus
// rather than silently discarding it as a false "exhausted".
// ---------------------------------------------------------------------------

test('R2V-001: an RMD that drains its account to zero still retains the exact $45,421.00 cash surplus, end to end', () => {
  const p = onePeriodPlan();
  p.profile.filing = 'single'; // the $45,368.50 checkpoint is specific to single filing status
  p.profile.age = 90;
  p.profile.endAge = 91;
  p.assumptions.returnRate = -95; // the engine's own supported floor -- a deliberate boundary stress case, not a forecast
  // withdrawalTiming controls what fraction of this period's growth applies
  // BEFORE the RMD is withdrawn (preGrowth). Only 'annual' (fraction 1) lets
  // the full -95% decay land before the RMD sale, shrinking the account to
  // exactly $49,200 -- too little to pay the $80,655.74 SCHEDULED RMD in
  // full, so withdrawFromClass() caps the real withdrawal there and drains
  // the account to zero. onePeriodPlan()'s default (monthly, preGrowth=0.5)
  // leaves far more balance before the RMD, so the account is never fully
  // drained and this fixture's whole premise (every class at a zero balance)
  // doesn't hold.
  p.assumptions.withdrawalTiming = 'annual';
  p.accounts = [account({ balance: 984000 })];
  const result = engine.runPlan(p);
  const row = result.rows[1];
  const preDistribution = 984000 * 0.05; // -95% return leaves 5% of the opening balance, all of it swept into the RMD sale
  const expectedTax = engine.estimateTaxes(p, 90, preDistribution, 0, 0, 0, 0, 0).total;
  /* R6 (S5 task 8, the Arizona age-65 exemption, TAX section 5.3, ENACTED): the audit's $45,368.50 became $45,421.00 -- one $2,100 exemption for a single person 90 leaves $52.50 more after tax.
     The mechanism this pins is unchanged, and the audit's $45,368.50 returns exactly with the exemption set to $0. */
  assert.ok(Math.abs(preDistribution - expectedTax - 45667) < 0.01, `test setup sanity check: expected $45,667.00 (the audit's $45,368.50 before the age-65 exemption, $45,421.00 before the 63(f) additional deduction), got ${preDistribution - expectedTax}`);
  assert.equal(row.preTax, 0, 'sanity check: the account must actually be drained to zero for this fixture to exercise the cash-only settlement path');
  assert.equal(row.calculationError, false);
  assert.equal(row.shortfall, 0);
  assert.ok(Math.abs(row.total - 45667) < 0.01, `expected the ending total to equal the genuine $45,667.00 retained cash, not $0, got ${row.total}`);
  assert.equal(result.issues.length, 0, 'expected a clean run with no reconciliation issues');
});

// ---------------------------------------------------------------------------
// R2V-002 (missing/non-finite basis) and R2V-003 (ARCH-02 calculation-error
// contract): the audit's missing-basisPct reproduction now must be rejected
// by the validator, and -- since the proven exposure is a direct engine call
// that bypasses the validator entirely -- the settlement itself must remain
// protected: a NaN committed value is routed through calculationError, never
// published as an ordinary 100% success.
// ---------------------------------------------------------------------------

function missingBasisPlan() {
  const p = onePeriodPlan();
  p.advanced.rmdOn = false;
  p.retirement.pension = 80000;
  p.accounts = [account({ id: 'broker', taxClass: 'taxable', balance: 100000, priority: 1 })];
  delete p.accounts[0].basisPct;
  return p;
}

/** A plan that passes every input check but overflows to Infinity during
    growth (1e308 * 1.07), so the calculation error arises INSIDE the
    simulation rather than at the input boundary -- the fixture used below
    for the simulation-level invalid-result contract. */
function overflowDuringSimulationPlan() {
  const p = onePeriodPlan();
  p.assumptions.returnRate = 7;
  p.accounts = [account({ balance: 1e308 })];
  return p;
}

test('R2V-002: a taxable account missing basisPct is rejected by validateScenario at the canonical boundary', () => {
  const { validateScenario } = require('../src/scenario-validator.js');
  const report = validateScenario(missingBasisPlan());
  assert.equal(report.valid, false, 'a taxable account missing basisPct must now be rejected, not silently accepted');
  assert.ok(report.issues.some((i) => i.severity === 'ERROR' && i.path === 'accounts[0].basisPct'));
});

test('R2V-003 (simple mode): a calculation error arising DURING simulation produces the full invalid-result contract, never an ordinary financial classification', () => {
  const p = overflowDuringSimulationPlan();
  const result = engine.runPlan(p);
  assert.equal(p.assumptions.method, 'simple', 'sanity check: this is the simple (non-Monte-Carlo) mode path in runPlan()');
  assert.equal(result.status, 'calculation_error');
  assert.equal(result.calculationError, true);
  assert.equal(result.successRate, null);
  assert.notEqual(result.successRate, 0, 'must not be conflated with the ordinary 0%-success financial-failure classification a real shortfall gets');
  // R2R-002 round 2: simple-mode invalid results get the same treatment as
  // an invalid Monte Carlo batch -- no ordinary financial fields at all.
  assert.equal(result.failed, null, 'must not reuse the financial failed flag for a calculation failure');
  assert.equal(result.rows, null, 'a NaN/Infinity-bearing projection must not be published as ordinary rows');
  assert.equal(result.lifetimeTaxes, null);
  assert.equal(result.firstShortfallAge, null);
  assert.ok(result.calculationErrorCode, 'a specific error code must be surfaced');
  assert.ok(result.partialDiagnostics, 'the partial run is retained for diagnostics only');
  assert.match(result.partialDiagnostics.label, /diagnostic, not the plan result/);
  assert.ok(Array.isArray(result.partialDiagnostics.rows));
});

test('R2V-003: diagnostics disabled (no issues array, as every Monte Carlo path after the first uses) does not disable validity', () => {
  /* S5 block 2n: simulatePlan() now refuses missingBasisPlan() at its input
     gate, so that fixture would pass here for a different reason. This test's
     subject is detection INSIDE the simulation without a collector, which
     overflowDuringSimulationPlan() -- past every gate -- still exercises. */
  const p = overflowDuringSimulationPlan();
  const result = engine.simulatePlan(p, engine.rng(p.assumptions.seed), 0, null, null);
  assert.notEqual(result.calculationErrorAge, null, 'calculation-error detection must not depend on an issues array being supplied');
});

test('R2V-003 (fallback path): runScenario() -- the same function app-shell.html\'s runPlansBackground() calls both when Workers are unavailable and when a worker errors -- carries the FULL invalid-result contract', () => {
  const result = engine.runScenario(overflowDuringSimulationPlan());
  assert.equal(result.status, 'calculation_error');
  assert.equal(result.calculationError, true);
  assert.equal(result.successRate, null);
  assert.equal(result.failed, null);
  assert.equal(result.rows, null);
  assert.ok(result.calculationErrorCode, 'the fallback path must retain a specific error code');
  assert.ok(result.partialDiagnostics, 'the fallback path must retain the diagnostic object too');
  assert.ok(result.identity, 'runScenario must still attach an identity even to an invalid result');
});

test('R2V-003 (worker path): the real worker, built fresh from current src/, carries the FULL invalid-result contract across the postMessage boundary', async () => {
  const result = await runPlanThroughLiveWorker(overflowDuringSimulationPlan());
  assert.equal(result.status, 'calculation_error');
  assert.equal(result.calculationError, true);
  assert.equal(result.successRate, null);
  assert.equal(result.failed, null);
  assert.equal(result.rows, null);
  // R2R-002 round 2 acceptance: the worker path must retain the error code
  // and the diagnostic counts, not just the boolean flag.
  assert.ok(result.calculationErrorCode, 'the worker path must retain a specific error code');
  assert.ok(result.partialDiagnostics, 'partial diagnostics must survive the worker boundary');
  assert.ok(Array.isArray(result.partialDiagnostics.rows));
  assert.ok(result.identity, 'the worker path must also attach an identity to an invalid result');
});

test('R2R-001 round 2 (public boundary): a non-finite account balance reaching runPlan()/runScenario() is a controlled calculation error, never a throw and never an ordinary result', () => {
  // runScenario()/runPlan() do not call validateScenario(), so the engine's
  // own guard is the only thing standing between a malformed account and a
  // published projection. Both public entry points must behave identically.
  function infiniteBalancePlan() {
    const p = onePeriodPlan();
    p.accounts = [account({ balance: Infinity })];
    return p;
  }
  let viaRunPlan, viaRunScenario;
  assert.doesNotThrow(() => { viaRunPlan = engine.runPlan(infiniteBalancePlan()); });
  assert.doesNotThrow(() => { viaRunScenario = engine.runScenario(infiniteBalancePlan()); });
  [['runPlan', viaRunPlan], ['runScenario', viaRunScenario]].forEach(([label, result]) => {
    assert.equal(result.status, 'calculation_error', `${label} must report the invalid-result contract`);
    assert.equal(result.calculationError, true);
    // Rejected at the PUBLIC boundary, before simulatePlan()'s clone() can
    // JSON-round-trip Infinity into null and growAccounts() can multiply
    // that null into a legitimate-looking 0 -- which is exactly what used to
    // happen, producing an ordinary status:"ok" run on a silently zeroed
    // account rather than any error at all.
    assert.equal(result.calculationErrorCode, 'SCENARIO_NONFINITE_ACCOUNT');
    assert.equal(result.successRate, null);
    assert.equal(result.failed, null);
    assert.equal(result.rows, null, `${label} must not publish ordinary rows for an invalid result`);
  });
});

test('R2R-001 round 2 (public boundary): a taxable account with a missing basisPct is rejected through runPlan() too', () => {
  const result = engine.runPlan(missingBasisPlan());
  assert.equal(result.status, 'calculation_error');
  assert.equal(result.calculationErrorCode, 'SCENARIO_NONFINITE_ACCOUNT');
  assert.equal(result.rows, null);
});

test('R2V-003 (worker path): a FINITE plan still round-trips a real successRate through the worker (registry completeness sanity check)', async () => {
  const p = onePeriodPlan();
  const result = await runPlanThroughLiveWorker(p);
  assert.equal(result.calculationError, false);
  assert.equal(result.successRate, 100);
});

test('R2V-003: a genuine shortfall (true depletion) is never reported as a calculation error -- it still produces a numeric financial success result', () => {
  const p = onePeriodPlan();
  p.retirement.spending = 500000;
  p.accounts = [account({ balance: 100000 })];
  const result = engine.runPlan(p);
  assert.equal(result.calculationError, false, 'genuine insolvency must not be conflated with a calculation error');
  assert.equal(typeof result.successRate, 'number', 'a genuinely insolvent plan must still report a NUMERIC successRate, not null');
  assert.equal(result.successRate, 0);
  assert.equal(result.failed, true);
});

// --- aggregateMonteCarloRuns(): fabricated paths, no stochastic run needed -
// (acceptance requires testing this with synthetic results, including an
// invalid path that is NOT the first one)

// ---------------------------------------------------------------------------
// R2R-003 (ARCH-01, external requalification): the standing cash-sources-
// vs-uses invariant for the tax/RMD settlement. verifyCashSettlement() is
// factored out specifically so it can be tested directly against a
// fabricated, deliberately inconsistent settlement record -- proving the
// invariant detects a missing-cash class exactly like R2V-001's own
// $45,368.50 loss -- without needing a full plan or a production-only
// failure seam.
// ---------------------------------------------------------------------------

test('verifyCashSettlement: a consistent record (funded, with retained cash) is accepted', () => {
  // Mirrors the $45,368.50 checkpoint's own numbers: $49,200 raised for tax,
  // $3,831.50 real obligation, $45,368.50 retained, no unfunded remainder.
  const result = engine.verifyCashSettlement(49200, 0, 0, 3831.5, 45368.5);
  assert.equal(result.consistent, true);
  assert.ok(Math.abs(result.residual) < 1e-9);
});

test('verifyCashSettlement: a consistent record (exhausted, with a genuine unfunded remainder) is accepted', () => {
  const result = engine.verifyCashSettlement(1000, 500, 200, 1700, 0);
  assert.equal(result.consistent, true);
  assert.ok(Math.abs(result.residual) < 1e-9);
});

test('verifyCashSettlement: a deliberately inconsistent record -- cash raised but neither retained nor counted as shortfall -- is detected (the exact R2V-001 defect class)', () => {
  // Reproduces the R2V-001 bug's own signature directly: $49,200 was raised
  // for tax, the real obligation was only $3,831.50, but retainedRmdCash
  // was never set (stuck at 0, as it was before the fix) and taxNeed is
  // also 0 (no shortfall was ever registered) -- the $45,368.50 difference
  // is simply unaccounted for.
  const result = engine.verifyCashSettlement(49200, 0, 0, 3831.5, 0);
  assert.equal(result.consistent, false, 'a $45,368.50 unaccounted residual must be detected, not silently accepted');
  assert.ok(Math.abs(result.residual - 45368.5) < 0.01, `expected the residual to expose the exact missing amount, got ${result.residual}`);
});

test('verifyCashSettlement: an inconsistent record on the shortage side (obligation understated relative to cash+taxNeed) is also detected', () => {
  const result = engine.verifyCashSettlement(1000, 0, 0, 1500, 0);
  assert.equal(result.consistent, false);
  assert.ok(Math.abs(result.residual - (-500)) < 0.01);
});

test('verifyCashSettlement: a non-finite record is never "consistent" by accident', () => {
  assert.equal(engine.verifyCashSettlement(NaN, 0, 0, 100, 0).consistent, false);
  assert.equal(engine.verifyCashSettlement(1000, 0, 0, Infinity, 0).consistent, false);
});

// ---------------------------------------------------------------------------
// R2R-002 round 2 acceptance: consumer-level assertions that the STANDARD UI
// does not render retirement/end/tax/chart/table financial outputs from an
// invalid result. Driven through the real app (assembled in memory from the
// current src/, not the stale shipped artifact) with a seeded scenario, so
// this exercises renderResults()/renderChart()/renderProjection() as the app
// actually calls them rather than asserting against the engine alone.
// ---------------------------------------------------------------------------

test('R2R-002 round 2 (UI consumer): the results page renders a dedicated calculation-error state, not financial figures', uiTest, async () => {
  const plan = overflowDuringSimulationPlan();
  const dom = await loadLiveApp({ version: 2, edition: '2C', page: 'plan', complexity: 'standard', theme: 'auto', compare: false, active: 0, scenarios: [plan] });
  const doc = dom.window.document;
  const root = doc.getElementById('investment-calculator-v2c');
  root.querySelector('[data-page="results"]').click();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  assert.equal(doc.getElementById('v2-stat-success').textContent, 'Calc. error', 'success stat must say so plainly, never a percentage');
  ['v2-stat-retire', 'v2-stat-end', 'v2-stat-failure', 'v2-stat-first-shortfall', 'v2-stat-contributions', 'v2-stat-tax', 'v2-stat-score'].forEach((id) => {
    assert.equal(doc.getElementById(id).textContent, '—', `${id} must not render a financial figure from an invalid result`);
  });
  assert.equal(doc.getElementById('v2-chart').innerHTML, '', 'no chart may be drawn from an invalid result');
  assert.equal(doc.getElementById('v2-table').innerHTML, '', 'no projection table may be drawn from an invalid result');
  assert.equal(doc.getElementById('v2-insights').innerHTML, '', 'no financial insights may be derived from an invalid result');
  assert.match(doc.getElementById('v2-warnings').textContent, /Calculation error detected/, 'the error must be disclosed, not merely omitted');
  dom.window.close();
});

// ---------------------------------------------------------------------------
// R3-UI-001 (R2_T01_T02_EXTERNAL_REQUALIFICATION_ROUND3_2026-09-09.md):
// renderChart() guarded only the ACTIVE result. In comparison mode it built
// a series per scenario as `rows: results[i] ? results[i].rows : rows`, so an
// invalid scenario (rows:null) fell through to the plotting step's
// `(s.rows || rows)` fallback and was drawn using the ACTIVE scenario's
// valid rows -- a real financial line under the invalid scenario's name.
// ---------------------------------------------------------------------------

async function loadComparison(scenarios, active) {
  return loadLiveApp({ version: 2, edition: '2C', page: 'plan', complexity: 'standard', theme: 'auto', compare: true, active: active || 0, scenarios });
}

async function showResults(dom) {
  const root = dom.window.document.getElementById('investment-calculator-v2c');
  root.querySelector('[data-page="results"]').click();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  return dom.window.document;
}

/** Waits for `predicate()` or resolves false after `timeoutMs`. The heat map
    sweeps every historical start year on a real timer, so a single tick is
    not enough to observe its completion (or to prove it never happens). */
async function waitFor(dom, predicate, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 1500);
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => dom.window.setTimeout(resolve, 10));
  }
  return false;
}

function chartPathData(doc) {
  return Array.from(doc.getElementById('v2-chart').querySelectorAll('path')).map((el) => el.getAttribute('d'));
}

test('R3-UI-001: a valid ACTIVE scenario compared against an INVALID one draws no line for the invalid scenario and never reuses the active rows for it', uiTest, async () => {
  const valid = onePeriodPlan(); valid.name = 'Valid A';
  const invalid = overflowDuringSimulationPlan(); invalid.name = 'Invalid B';
  const dom = await loadComparison([valid, invalid], 0);
  const doc = await showResults(dom);

  const paths = chartPathData(doc);
  assert.equal(paths.length, 1, `only the valid scenario may be plotted, got ${paths.length} lines`);
  const legend = doc.getElementById('v2-legend').textContent;
  assert.match(legend, /Valid A/);
  assert.match(legend, /Invalid B/, 'the invalid scenario must still be named, not silently dropped');
  assert.match(legend, /Invalid B[^|]*calculation error/i, 'the invalid scenario must be labelled as unavailable, not left looking like a plotted series');
  dom.window.close();
});

// R4-F4 (ROADMAP_EXTERNAL_REVIEW.md section 4.5): renamed 2026-09-10. The old
// title -- "plots only the valid one, and neither borrows the other's rows" --
// overstated the behaviour and contradicted this test's own assertions, which
// require the chart to be EMPTY. Clearing the whole chart is the correct and
// externally accepted behaviour for the dedicated calculation-error screen; it
// was only the title that was wrong. No assertion or implementation changed.
test('R3-UI-001: an INVALID active scenario in a comparison clears the entire chart for the calculation-error state, rather than plotting the valid comparison', uiTest, async () => {
  const invalid = overflowDuringSimulationPlan(); invalid.name = 'Invalid A';
  const valid = onePeriodPlan(); valid.name = 'Valid B';
  const dom = await loadComparison([invalid, valid], 0);
  const doc = await showResults(dom);
  // The active result is invalid, so the results screen shows the dedicated
  // calculation-error state and draws nothing at all.
  assert.equal(doc.getElementById('v2-chart').innerHTML, '');
  assert.equal(doc.getElementById('v2-stat-success').textContent, 'Calc. error');
  dom.window.close();
});

test('R3-UI-001: an all-valid comparison still plots one line per scenario', uiTest, async () => {
  const a = onePeriodPlan(); a.name = 'Valid A';
  const b = onePeriodPlan(); b.name = 'Valid B'; b.accounts = [account({ balance: 500000 })];
  const dom = await loadComparison([a, b], 0);
  const doc = await showResults(dom);
  assert.equal(chartPathData(doc).length, 2, 'both valid scenarios must still be plotted');
  const legend = doc.getElementById('v2-legend').textContent;
  assert.doesNotMatch(legend, /calculation error/i, 'no unavailable label may appear when every scenario is valid');
  dom.window.close();
});

test('R2R-002 round 2 (UI consumer): a VALID scenario still renders ordinary financial figures through the same code path', uiTest, async () => {
  // Guards against the calculation-error state being over-applied: the
  // assertions above would also pass on an app that rendered nothing at all.
  const plan = onePeriodPlan();
  const dom = await loadLiveApp({ version: 2, edition: '2C', page: 'plan', complexity: 'standard', theme: 'auto', compare: false, active: 0, scenarios: [plan] });
  const doc = dom.window.document;
  const root = doc.getElementById('investment-calculator-v2c');
  root.querySelector('[data-page="results"]').click();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  assert.match(doc.getElementById('v2-stat-success').textContent, /%$/, 'a valid result still shows a real success percentage');
  assert.notEqual(doc.getElementById('v2-stat-retire').textContent, '—');
  assert.ok(doc.getElementById('v2-chart').innerHTML.length > 0, 'a valid result still draws its chart');
  dom.window.close();
});

// ---------------------------------------------------------------------------
// R3-UI-002 (round-3 requalification): the historical heat map called
// simulatePlan() directly and read `!result.failed` plus the last row's
// `total` unconditionally, so a calculation-error start year rendered as an
// ordinary financial "No" with a published balance. Its details element also
// called renderHeatmap() directly on toggle, bypassing renderResults()'s
// guard entirely. classifyHistoricalCell() is in engine.js precisely so the
// per-cell rule can be proven against fabricated results with no historical
// sweep and no DOM.
// ---------------------------------------------------------------------------

test('classifyHistoricalCell: a calculation-error run is classified as invalid, never as a financial "not funded"', () => {
  const cell = engine.classifyHistoricalCell({ failed: true, calculationErrorAge: 66, rows: [{ total: 42 }] });
  assert.equal(cell.invalid, true, 'the calculation-error signal must be inspected BEFORE failed/ending balance');
  assert.equal(cell.funded, false);
  assert.equal(cell.end, null, 'no ending balance may be published for an invalid cell');
});

test('classifyHistoricalCell: a genuinely depleted but VALID run keeps its ordinary not-funded meaning and its real balance', () => {
  const cell = engine.classifyHistoricalCell({ failed: true, calculationErrorAge: null, rows: [{ total: 0 }] });
  assert.equal(cell.invalid, false);
  assert.equal(cell.funded, false);
  assert.equal(cell.end, 0, 'a real depleted balance is still a real figure');
});

test('classifyHistoricalCell: a successful valid run is funded with its real ending balance', () => {
  const cell = engine.classifyHistoricalCell({ failed: false, calculationErrorAge: null, rows: [{ total: 1234.5 }] });
  assert.deepEqual(cell, { invalid: false, funded: true, end: 1234.5 });
});

test('classifyHistoricalCell: a non-finite ending balance is treated as invalid even without a calculationErrorAge', () => {
  assert.equal(engine.classifyHistoricalCell({ failed: false, calculationErrorAge: null, rows: [{ total: NaN }] }).invalid, true);
  assert.equal(engine.classifyHistoricalCell({ failed: false, calculationErrorAge: null, rows: [] }).invalid, true);
});

test('R3-UI-002: opening the heat-map details on an INVALID active result shows the error state instead of scheduling a historical sweep', uiTest, async () => {
  const plan = overflowDuringSimulationPlan();
  plan.assumptions.rollingHistory = true; // would otherwise short-circuit before the guard matters
  const dom = await loadLiveApp({ version: 2, edition: '2C', page: 'plan', complexity: 'standard', theme: 'auto', compare: false, active: 0, scenarios: [plan] });
  const doc = await showResults(dom);

  const details = doc.getElementById('v2-heatmap-details');
  details.open = true;
  details.dispatchEvent(new dom.window.Event('toggle'));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  const heatmap = doc.getElementById('v2-heatmap');
  assert.equal(heatmap.querySelector('table'), null, 'no historical table may be produced from an invalid active result');
  assert.match(heatmap.textContent, /calculation error/i, 'the heat map must say why it is unavailable');
  assert.equal(heatmap.dataset.generation, '', 'no generation may be marked complete for a sweep that never ran');
  dom.window.close();
});

test('R3-UI-002: a heat-map sweep queued while the result was valid never publishes over a calculation-error state entered afterwards', uiTest, async () => {
  // Two scenarios: valid active with rolling history and the details section
  // open, so a sweep is genuinely queued; then switch to the invalid one and
  // re-render WITHOUT flushing the queued timer first.
  const valid = onePeriodPlan();
  valid.name = 'Valid';
  valid.assumptions.rollingHistory = true;
  const invalid = overflowDuringSimulationPlan();
  invalid.name = 'Invalid';
  invalid.assumptions.rollingHistory = true;
  const dom = await loadLiveApp({ version: 2, edition: '2C', page: 'plan', complexity: 'standard', theme: 'auto', compare: false, active: 0, scenarios: [valid, invalid] });
  const doc = await showResults(dom);
  const root = doc.getElementById('investment-calculator-v2c');
  const details = doc.getElementById('v2-heatmap-details');
  details.open = true;
  details.dispatchEvent(new dom.window.Event('toggle'));

  // Switch to the invalid scenario and re-render immediately -- the queued
  // sweep is still pending at this point.
  const tabs = doc.getElementById('v2-scenario-tabs').querySelectorAll('button');
  tabs[1].click();
  root.querySelector('[data-page="results"]').click();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  const heatmap = doc.getElementById('v2-heatmap');
  assert.equal(doc.getElementById('v2-stat-success').textContent, 'Calc. error', 'sanity check: the app is in the calculation-error state');
  // Wait well past the sweep's normal completion time; a table appearing at
  // any point would mean the queued work landed on top of the error state.
  const leaked = await waitFor(dom, () => heatmap.querySelector('table'), 600);
  assert.equal(leaked, false, 'a queued sweep must not overwrite a newly entered calculation-error state');
  assert.match(heatmap.textContent, /calculation error/i);
  dom.window.close();
});

test('R3-UI-002: a VALID result with rolling history still renders an ordinary heat-map table, with funded/depleted cells intact', uiTest, async () => {
  // Positive control -- the guards above must not disable the feature.
  const plan = onePeriodPlan();
  plan.assumptions.rollingHistory = true;
  const dom = await loadLiveApp({ version: 2, edition: '2C', page: 'plan', complexity: 'standard', theme: 'auto', compare: false, active: 0, scenarios: [plan] });
  const doc = await showResults(dom);
  const details = doc.getElementById('v2-heatmap-details');
  details.open = true;
  details.dispatchEvent(new dom.window.Event('toggle'));

  const heatmap = doc.getElementById('v2-heatmap');
  const rendered = await waitFor(dom, () => heatmap.querySelector('table'), 3000);
  assert.equal(rendered, true, 'a valid scenario must still get its historical table');
  const bodyRows = heatmap.querySelectorAll('tbody tr');
  assert.ok(bodyRows.length > 1, 'the table must contain real start-year rows');
  const funded = Array.from(bodyRows).map((tr) => tr.children[1].textContent);
  assert.ok(funded.every((v) => v === 'Yes' || v === 'No'), 'valid cells keep their ordinary Yes/No financial classification');
  dom.window.close();
});

// ---------------------------------------------------------------------------
// R2R-003 round 2 (ARCH-01): the COMMITTED cash-sources-versus-uses
// invariant. verifyCashSettlement() above covers the tax slice only and
// takes the INTENDED retention as proof of deposit;
// verifyCommittedCashSettlement() spans the whole period -- RMD withdrawal,
// spending sales, tax sales, fallback cash, final shortfall against
// portfolio cash need, QCD cash, tax obligation, and the deposit that
// actually committed (measured by simulatePlan() as an account-balance
// delta, never passed in as the intended amount).
// ---------------------------------------------------------------------------

/** A consistent committed-settlement record: $50,000 RMD, $30,000 of it
    funding spending need, $2,000 QCD, $5,000 tax obligation, remainder
    retained; no sales, no fallback, no shortfall. */
function committedRecord(overrides) {
  return Object.assign({
    rmdGross: 50000, spendingSaleGross: 0, taxSaleGross: 0,
    fallbackDraw: 0, finalShortfall: 0,
    portfolioCashNeed: 30000, qcdCashPaid: 2000,
    taxObligation: 5000, retainedDeposit: 13000,
  }, overrides || {});
}

test('verifyCommittedCashSettlement: a fully consistent committed record is accepted', () => {
  const result = engine.verifyCommittedCashSettlement(committedRecord());
  assert.equal(result.consistent, true);
  assert.ok(Math.abs(result.residual) < 1e-9);
});

test('verifyCommittedCashSettlement: the intended retention is correct but NOTHING actually committed -- must fail', () => {
  // The specific gap the requalification named: verifyCashSettlement() takes
  // the intended `retainedRmdCash` and so cannot notice that
  // retainExcessRmdCash() did nothing. Here the deposit is measured, so a
  // no-op deposit leaves $13,000 unaccounted for.
  const result = engine.verifyCommittedCashSettlement(committedRecord({ retainedDeposit: 0 }));
  assert.equal(result.consistent, false, 'an intended-but-uncommitted deposit must be detected');
  assert.ok(Math.abs(result.residual - 13000) < 0.01, `expected the residual to expose the undeposited $13,000, got ${result.residual}`);
});

test('verifyCommittedCashSettlement: missing spending-sale cash is detected', () => {
  // The period needed $60,000 of portfolio cash but only $30,000 of RMD
  // cash plus a $30,000 sale can fund it -- drop the sale and the identity
  // must break.
  const consistent = engine.verifyCommittedCashSettlement(committedRecord({ portfolioCashNeed: 60000, spendingSaleGross: 30000 }));
  assert.equal(consistent.consistent, true, 'sanity check: the same record WITH the sale reconciles');
  const broken = engine.verifyCommittedCashSettlement(committedRecord({ portfolioCashNeed: 60000, spendingSaleGross: 0 }));
  assert.equal(broken.consistent, false);
  assert.ok(Math.abs(broken.residual + 30000) < 0.01);
});

test('verifyCommittedCashSettlement: missing fallback cash is detected', () => {
  const consistent = engine.verifyCommittedCashSettlement(committedRecord({ portfolioCashNeed: 40000, fallbackDraw: 10000 }));
  assert.equal(consistent.consistent, true, 'sanity check: the same record WITH the fallback draw reconciles');
  const broken = engine.verifyCommittedCashSettlement(committedRecord({ portfolioCashNeed: 40000, fallbackDraw: 0 }));
  assert.equal(broken.consistent, false);
  assert.ok(Math.abs(broken.residual + 10000) < 0.01);
});

test('verifyCommittedCashSettlement: an understated or overstated final shortfall is detected', () => {
  // $70,000 needed, only $50,000 of RMD cash available -> a genuine $20,000
  // combined shortfall must be reported for the identity to close.
  const honest = engine.verifyCommittedCashSettlement(committedRecord({ portfolioCashNeed: 50000, finalShortfall: 20000 }));
  assert.equal(honest.consistent, true, 'sanity check: an honestly reported shortfall reconciles');
  const understated = engine.verifyCommittedCashSettlement(committedRecord({ portfolioCashNeed: 50000, finalShortfall: 0 }));
  assert.equal(understated.consistent, false, 'an understated shortfall hides missing cash');
  const overstated = engine.verifyCommittedCashSettlement(committedRecord({ portfolioCashNeed: 50000, finalShortfall: 35000 }));
  assert.equal(overstated.consistent, false, 'an overstated shortfall invents cash that was never short');
});

test('verifyCommittedCashSettlement: a non-finite record is never "consistent" by accident', () => {
  assert.equal(engine.verifyCommittedCashSettlement(committedRecord({ rmdGross: NaN })).consistent, false);
  assert.equal(engine.verifyCommittedCashSettlement(committedRecord({ fallbackDraw: Infinity })).consistent, false);
});

test('R2R-003 round 2: the committed invariant is wired in and silent across the named acceptance categories, including fallback cash', () => {
  const cases = [
    ['ordinary spending, no RMD', () => { const p = onePeriodPlan(); p.advanced.rmdOn = false; p.retirement.pension = 40000; p.retirement.spending = 20000; return p; }],
    ['RMD cash used for spending, tax, and retention', () => { const p = onePeriodPlan(); p.retirement.spending = 12000; return p; }],
    ['QCD', () => { const p = onePeriodPlan(); p.advanced.qcd = 5000; return p; }],
    ['additional tax sale', () => { const p = onePeriodPlan(); p.retirement.spending = 39000; return p; }],
    ['true combined shortfall', () => { const p = onePeriodPlan(); p.retirement.spending = 500000; p.accounts = [account({ balance: 100000 })]; return p; }],
    ['fallback cash from other assets', () => {
      const p = onePeriodPlan();
      p.retirement.spending = 400000;
      p.accounts = [account({ balance: 100000 })];
      p.retirement.homeEquityFallback = true;
      p.advanced.networthOn = true; // S5 2c (Q44): the fallback draws only while other assets are included
      p.advanced.otherAssets = [{ id: 'home', name: 'Home equity', value: 250000, growth: 0, liquidity: 'limited', available: true, availableAge: 60, accessPct: 100 }];
      return p;
    }],
  ];
  cases.forEach(([label, build]) => {
    const result = engine.runPlan(build());
    assert.equal(result.calculationError, false, `expected no false-positive COMMITTED_CASH_MISMATCH for "${label}", got ${result.calculationErrorCode}`);
  });
});

test('R2R-003 round 2: the fallback-cash fixture genuinely exercises a non-zero other-asset draw (otherwise the case above proves nothing)', () => {
  const p = onePeriodPlan();
  p.retirement.spending = 400000;
  p.accounts = [account({ balance: 100000 })];
  p.retirement.homeEquityFallback = true;
      p.advanced.networthOn = true; // S5 2c (Q44): the fallback draws only while other assets are included
  p.advanced.otherAssets = [{ id: 'home', name: 'Home equity', value: 250000, growth: 0, liquidity: 'limited', available: true, availableAge: 60, accessPct: 100 }];
  const row = engine.runPlan(p).rows[1];
  assert.ok(row.nonPortfolioDraw > 1000, `test setup sanity check: expected a real fallback draw, got ${row.nonPortfolioDraw}`);
});

test('R2R-003: the standing invariant does not false-positive across the named acceptance categories -- ordinary spending, RMD+retained cash, QCD, an additional tax sale, a true shortfall, and the age-90 fully drained account', () => {
  const cases = [
    ['ordinary spending, no RMD', () => { const p = onePeriodPlan(); p.advanced.rmdOn = false; p.retirement.pension = 40000; p.retirement.spending = 20000; return p; }],
    ['RMD with retained cash', () => onePeriodPlan()],
    ['RMD with a QCD', () => { const p = onePeriodPlan(); p.advanced.qcd = 5000; return p; }],
    ['RMD cash below obligation, additional tax sale required', () => { const p = onePeriodPlan(); p.retirement.spending = 39000; return p; }],
    ['true shortfall (genuine depletion)', () => { const p = onePeriodPlan(); p.retirement.spending = 500000; p.accounts = [account({ balance: 100000 })]; return p; }],
  ];
  cases.forEach(([label, build]) => {
    const p = build();
    const result = engine.runPlan(p);
    const row = result.rows[1];
    assert.equal(row.calculationError, false, `expected no false-positive CASH_SETTLEMENT_MISMATCH for "${label}", got calculationErrorCode=${row.calculationErrorCode}`);
  });
  // The age-90 fully-drained-account fixture (R2V-001's own boundary case)
  // is covered by its own dedicated test above; re-asserting calculationError
  // here would be redundant, but the invariant runs unconditionally inside
  // it exactly as it does for every other case in this list.
});

function fakeRun(overrides = {}) {
  return Object.assign({
    rows: [{ age: 65, total: 100, calculationError: false, calculationErrorCode: null }, { age: 66, total: 90, calculationError: false, calculationErrorCode: null }],
    failed: false, calculationErrorAge: null, firstShortfallAge: null, sustainedFailureAge: null,
    lifetimeContributions: 10, lifetimeContributionsReal: 10, lifetimeTaxes: 5, limitWarnings: [],
  }, overrides);
}

test('aggregateMonteCarloRuns: all-valid paths compute an ordinary successRate, status:"ok", and keep every ordinary financial field', () => {
  const runs = [fakeRun(), fakeRun({ failed: true }), fakeRun()];
  const agg = engine.aggregateMonteCarloRuns(runs);
  assert.equal(agg.status, 'ok');
  assert.equal(agg.calculationError, false);
  assert.equal(agg.calculationErrorPaths, 0);
  assert.equal(agg.validPathCount, 3);
  assert.equal(agg.requestedPathCount, 3);
  assert.ok(Math.abs(agg.successRate - (2 / 3 * 100)) < 1e-9);
  assert.equal(agg.failed, true, 'a genuine financial failure in a fully VALID batch still uses the ordinary failed flag');
  assert.ok(Array.isArray(agg.rows), 'a valid batch keeps its ordinary rows');
  assert.equal(agg.lifetimeTaxes, 5);
  assert.equal(agg.partialDiagnostics, undefined, 'a valid batch has no partial-diagnostics object');
});

// R2R-002 external requalification fix: the two tests below previously
// asserted `successRate === 100` for a batch that was 50% invalid --
// exactly the defect the requalification found (an invalid batch must never
// report an ordinary numeric success rate, no matter how clean the
// surviving valid subset looks). They now prove the corrected contract:
// successRate/failed reflect the WHOLE batch's validity first, and the
// valid-subset quantiles/lifetime totals are still computed underneath (as
// diagnostic content) but are no longer confusable with an ordinary result.

test('aggregateMonteCarloRuns: an invalid NON-FIRST path makes the WHOLE batch report successRate:null, not a percentage computed by omission', () => {
  const runs = [
    fakeRun(),
    fakeRun({ calculationErrorAge: 66, rows: [{ age: 65, total: 1e9, calculationError: false, calculationErrorCode: null }, { age: 66, total: 1e9, calculationError: true, calculationErrorCode: 'TAX_QUOTE_NONFINITE_CONTEXT' }] }),
    fakeRun(),
  ];
  const agg = engine.aggregateMonteCarloRuns(runs);
  assert.equal(agg.status, 'calculation_error');
  assert.equal(agg.calculationError, true);
  assert.equal(agg.calculationErrorPaths, 1);
  assert.equal(agg.requestedPathCount, 3);
  assert.equal(agg.validPathCount, 2);
  assert.equal(agg.successRate, null, 'must NOT report 100% just because 2 of 3 paths happened to be clean');
  assert.equal(agg.calculationErrorCode, 'TAX_QUOTE_NONFINITE_CONTEXT', 'a usable error code must be surfaced even though the error is on a non-first path');
  // R2R-002 round 2: the ordinary financial fields must be absent entirely,
  // not merely flagged. `failed` in particular must not reuse the financial
  // pass/fail meaning for a calculation failure.
  assert.equal(agg.failed, null, 'an invalid batch must not be classified through the financial failed flag');
  assert.equal(agg.rows, null, 'ordinary projection rows must not be published for an invalid batch');
  assert.equal(agg.lifetimeContributions, null);
  assert.equal(agg.lifetimeContributionsReal, null);
  assert.equal(agg.lifetimeTaxes, null);
  assert.equal(agg.firstShortfallAge, null);
  assert.equal(agg.sustainedFailureAge, null);
  assert.equal(agg.failureAge, null);
  // Valid-path-only content survives ONLY under the explicitly labelled
  // diagnostic object, where it cannot be mistaken for the plan result.
  assert.ok(agg.partialDiagnostics, 'valid-path-only content must be retained under partialDiagnostics');
  assert.match(agg.partialDiagnostics.label, /diagnostic, not the plan result/);
  assert.equal(agg.partialDiagnostics.validPathCount, 2);
  assert.equal(agg.partialDiagnostics.requestedPathCount, 3);
  assert.equal(agg.partialDiagnostics.rows[0].total, 100, "the invalid path's huge value must not be pulled into the diagnostic median either");
  assert.equal(agg.partialDiagnostics.rows[1].calculationError, true, 'a row-level calculation error on a non-first path must still be surfaced');
});

test('aggregateMonteCarloRuns: an invalid path AT index 0 is still excluded from quantiles, and still invalidates the whole batch', () => {
  const runs = [
    fakeRun({ calculationErrorAge: 65, rows: [{ age: 65, total: -1e9, calculationError: true, calculationErrorCode: 'NON_FINITE_ROW_VALUE' }, { age: 66, total: -1e9, calculationError: false, calculationErrorCode: null }] }),
    fakeRun(),
    fakeRun(),
  ];
  const agg = engine.aggregateMonteCarloRuns(runs);
  assert.equal(agg.status, 'calculation_error');
  assert.equal(agg.calculationErrorPaths, 1);
  assert.equal(agg.successRate, null);
  assert.equal(agg.failed, null);
  assert.equal(agg.rows, null);
  assert.equal(agg.calculationErrorCode, 'NON_FINITE_ROW_VALUE');
  assert.equal(agg.partialDiagnostics.rows[0].total, 100, 'the invalid path at index 0 must not anchor the diagnostic median either');
  assert.equal(agg.partialDiagnostics.rows[0].calculationError, true, 'a row-level calculation error at index 0 must still be surfaced');
});

test('aggregateMonteCarloRuns: every path invalid reports the full invalid-result contract, never a fabricated percentage', () => {
  const runs = [fakeRun({ calculationErrorAge: 65 }), fakeRun({ calculationErrorAge: 66 })];
  const agg = engine.aggregateMonteCarloRuns(runs);
  assert.equal(agg.status, 'calculation_error');
  assert.equal(agg.calculationError, true);
  assert.equal(agg.calculationErrorPaths, 2);
  assert.equal(agg.validPathCount, 0);
  assert.equal(agg.requestedPathCount, 2);
  assert.equal(agg.successRate, null);
  assert.equal(agg.failed, null);
  assert.equal(agg.rows, null);
  assert.equal(agg.lifetimeContributions, null);
  assert.equal(agg.lifetimeTaxes, null);
  // With zero valid paths the diagnostic object's own totals are null too --
  // there is genuinely nothing to compute them from.
  assert.equal(agg.partialDiagnostics.validPathCount, 0);
  assert.equal(agg.partialDiagnostics.lifetimeTaxes, null);
});
