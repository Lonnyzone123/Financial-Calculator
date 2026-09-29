/* S5AA task 1.2, Q101 -- every Monte Carlo path is checked, and a failed ESSENTIAL invariant invalidates the
 * result instead of being filed as a note beside a healthy-looking success rate.
 *
 * Two lines decided the old behaviour. `runs.push(simulatePlan(p,...,i===0?issues:null,...))` handed the issues
 * collector to path 0 and to nothing else, and `if(issues)checkRowInvariants(...)` made the check conditional on
 * having one. So the reconciliation identity was verified on one path out of N, and a path whose ending portfolio
 * was wrong went unreported, unreproducible from outside, and still counted toward the median and the success rate.
 *
 * WHICH CHECKS ARE ESSENTIAL WAS DECIDED BEFORE THIS FILE WAS WRITTEN, in
 * `Handover temp/S5AA_ESSENTIAL_INVARIANTS_20260920.md`, and the line is the engine's own: `recordIssue()`'s
 * `isInvariant()` already names RECONCILIATION_MISMATCH, NON_FINITE_ROW_VALUE and NEGATIVE_ACCOUNT_BALANCE as a
 * distinct class with its own evidence budget. Those three are accounting or numerical identities -- no correct run
 * can trip one -- so they invalidate. Every other diagnostic describes a choice made about valid input and stays a
 * warning.
 *
 * THE FAULT IS DELIBERATELY SMALL. tests/lib/engine-variant.js compiles a variant of the engine in memory, so no
 * engine byte moves; a marker that is missing or repeated throws, so a fault cannot land nowhere. The scenario here
 * is 5 paths over a short horizon on purpose: a whole-corpus sweep against a faulted engine is how this repository
 * once reached tens of gigabytes off-heap, and nothing about this check needs scale to be conclusive.
 *
 * A-02: fault injection shows that a protection catches the failure it was built for. It does not turn an
 * already-correct case into a historical defect, and nothing here claims it does.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadEngineVariant } = require('./lib/engine-variant.js');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const SUMMARY = 'MONTE_CARLO_INVARIANT_FAILURE';
const PATHS = 5;

function fixture(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 55, retireAge: 56, endAge: 65, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'monteCarlo', runs: PATHS, seed: 42791, returnRate: 5, volatility: 10, inflation: 2, fee: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 20000, dividendOn: false, stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0 });
  p.accounts = [{ id: 'a1', name: 'Taxable', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 800000, basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  if (edit) edit(p);
  return p;
}

/* A variant that contaminates every path AFTER the first. The counter increments once per simulatePlan() call, so
 * path 0 is clean and paths 1..N-1 gain $1,000 a row from nowhere -- injected AFTER growthTotal has been measured,
 * so the money is genuinely unaccounted for rather than absorbed by the growth term. That is a real contamination
 * of the reported total, not a cosmetic flag. */
function faultedAfterPathZero() {
  return loadEngineVariant([
    {
      id: 'count each simulatePlan() call, so a fault can target paths after the first',
      /* RE-FIXTURED BY INTENT at S5AA R36 (SA32F-D1): simulatePlan() is now a wrapper that restores the 2026 rules; the rows run in
         simulatePlanRows(), called exactly once per simulatePlan() call, so the count is the same. */
      marker: 'function simulatePlanRows(p,random,historyOffset,ltcRandom,issues,serialized,gateToken){',
      append: 'globalThis.__S5AA_FAULT_PATH=(globalThis.__S5AA_FAULT_PATH||0)+1;',
    },
    {
      id: 'unaccounted money on every path after the first',
      marker: 'if(issues)growthTotal+=totalBalance(accounts)-beforeLateGrowth;growOtherAssets(otherAssets,duration);',
      replace: 'if(issues)growthTotal+=totalBalance(accounts)-beforeLateGrowth;'
        + 'if(globalThis.__S5AA_FAULT_PATH>1&&accounts.length)accounts[0].balance+=1000;'
        + 'growOtherAssets(otherAssets,duration);',
    },
  ]);
}
const runFaulted = (variant, plan) => { globalThis.__S5AA_FAULT_PATH = 0; try { return variant.runPlan(plan); } finally { globalThis.__S5AA_FAULT_PATH = 0; } };
const summaryOf = (r) => (r.issues || []).find((i) => i && i.code === SUMMARY);
const essentials = (r) => (r.issues || []).filter((i) => i && (i.code === 'RECONCILIATION_MISMATCH' || i.code === 'NON_FINITE_ROW_VALUE' || i.code === 'NEGATIVE_ACCOUNT_BALANCE'));

test('S5AA 1.2: a fault confined to paths after the first invalidates the batch', () => {
  const r = runFaulted(faultedAfterPathZero(), fixture());
  assert.notStrictEqual(r.status, 'ok', 'a batch containing contaminated paths must not report as ok');
  assert.strictEqual(r.calculationErrorCode, SUMMARY, 'got ' + r.calculationErrorCode);
});

test('S5AA 1.2: the invalidated batch publishes no success rate and no financial figures', () => {
  const r = runFaulted(faultedAfterPathZero(), fixture());
  assert.strictEqual(r.successRate, null, 'a success rate computed over contaminated paths is worse than none');
  assert.strictEqual(r.rows, null);
  assert.strictEqual(r.failed, null, 'failed is a financial verdict and cannot be given for an invalid batch');
});

test('S5AA 1.2: the diagnostic is ONE batch summary, not one entry per path, and the counts are preserved', () => {
  const r = runFaulted(faultedAfterPathZero(), fixture());
  const found = (r.issues || []).filter((i) => i && i.code === SUMMARY);
  assert.strictEqual(found.length, 1, 'exactly one summary, got ' + found.length);

  const s = found[0].state || {};
  assert.strictEqual(s.paths, PATHS, 'the total path count is preserved, so no faulted path is dropped from the denominator');
  assert.strictEqual(s.pathsAffected, PATHS - 1, 'paths 1..N-1 are contaminated and path 0 is not; got ' + s.pathsAffected);
  assert.strictEqual(s.firstAffectedPath, 1, 'the first contaminated path is named');
  assert.ok(s.codes && s.codes.RECONCILIATION_MISMATCH > 0, 'the summary names which invariant failed: ' + JSON.stringify(s.codes));
});

test('S5AA 1.2: the evidence is bounded -- a broad fault does not publish one finding per row per path', () => {
  const r = runFaulted(faultedAfterPathZero(), fixture((p) => { p.assumptions.runs = PATHS; p.profile.endAge = 85; }));
  assert.ok((r.issues || []).length <= 210,
    'the issue list must stay bounded under a broad fault; got ' + (r.issues || []).length + ' entries');
  const s = (summaryOf(r) || {}).state || {};
  assert.ok(s.findings >= s.pathsAffected, 'the summary still counts what it could not keep: ' + JSON.stringify(s));
});

test('S5AA 1.2 control: an unfaulted batch is untouched -- valid, with a real success rate', () => {
  const r = engine.runPlan(fixture());
  assert.strictEqual(r.status, 'ok', 'got ' + r.status + ' / ' + r.calculationErrorCode);
  assert.ok(Number.isFinite(r.successRate), 'a healthy batch still publishes its success rate');
  assert.strictEqual(summaryOf(r), undefined, 'and raises no invariant summary');
  assert.deepStrictEqual(essentials(r), [], 'and no essential invariant fires on a correct run');
});

test('S5AA 1.2 control: a household that genuinely runs out of money stays VALID -- depletion is an outcome, not a fault', () => {
  /* The first of the three failure policies task 8.2 puts in the result contract, pinned here so the repair cannot
   * quietly reclassify insolvency as a software error. */
  const r = engine.runPlan(fixture((p) => { p.accounts[0].balance = 40000; p.retirement.spending = 90000; }));
  assert.strictEqual(r.status, 'ok', 'a depleted household is a valid answer, got ' + r.status + ' / ' + r.calculationErrorCode);
  assert.ok(Number.isFinite(r.successRate), 'and it still has a success rate');
  assert.strictEqual(summaryOf(r), undefined, 'depletion must not raise an invariant summary');
});

test('S5AA 1.2 control: the fault harness is real -- path 0 alone is clean, and the variant differs from the engine', () => {
  /* Without this the tests above could pass against a fault that never fired. A single-path batch exercises only
   * path 0, which the fault deliberately spares, so it must come back valid even from the faulted variant. */
  const onePath = runFaulted(faultedAfterPathZero(), fixture((p) => { p.assumptions.runs = 1; }));
  assert.strictEqual(onePath.status, 'ok', 'path 0 is not contaminated, so a one-path batch stays valid; got ' + onePath.calculationErrorCode);

  const many = runFaulted(faultedAfterPathZero(), fixture());
  assert.notStrictEqual(many.status, 'ok', 'CONTROL: the same variant with more paths does go invalid, so the fault is live');
});
