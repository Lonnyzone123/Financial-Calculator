'use strict';

// Track B, L4 (Integration) -- the reconciliation-equation invariant.
//
// L4 is the validation pyramid's one never-built layer. L3 proves correctness
// for a handful of zeroed-out closed-form cases; L6 proves five named
// scenarios don't silently change. Neither asserts that the books balance.
// ARCH-01 already states the rule -- "sources must equal uses, cash committed
// must equal cash actually moved" -- and src/engine.js's checkRowInvariants()
// already computes it. What was missing is the layer that asserts it
// UNIVERSALLY: every row, of every path, of every scenario.
//
// THE EQUATION ACTUALLY ASSERTED. checkRowInvariants() computes
//
//     opening + contributions + employer + growth - dividends - withdrawals
//         == row.total          (tolerance max(0.01, |total| * 1e-9))
//
// This is a PORTFOLIO identity, and it is the one this layer asserts. Note two
// things about it that a net-worth-shaped reading would get wrong: dividends
// are SUBTRACTED (they leave the portfolio as cash), and taxes, spending and
// debt payments do not appear as separate terms because they are funded out of
// `withdrawals` and are already inside it. `row.total` is the portfolio, not
// net worth. (The sprint brief states the equation in a net-worth shape with
// dividends added and taxes/spending/debt subtracted; that phrasing does not
// match the engine and is recorded as an observation in SPRINT_QUESTIONS.md
// Q13. The engine's own identity is the authority here.)
//
// WHY THIS NEEDS NO POLICY INPUT: sources = uses is an accounting identity,
// not a modelling choice. It balances or it does not.
//
// HOW EVERY PATH IS REACHED WITHOUT AN ENGINE CHANGE. checkRowInvariants()
// only runs `if(issues)`, and runPlan() passes an issues collector to path 0
// only -- so in ordinary operation 499 of 500 Monte Carlo paths are never
// checked. But simulatePlan(p, random, historyOffset, ltcRandom, issues) and
// rng(seed) are both exported, and runPlan()'s per-path generator derivation
// is `rng(baseSeed + i*2)` / `rng(baseSeed + i*2 + 1)`. So this layer drives
// exactly the same paths runPlan() would, with diagnostics enabled on ALL of
// them. No engine hook was required (ground rules 9 and 11).
//
// OBSERVED FAILING BEFORE BEING TRUSTED. A green invariant that has never been
// seen to fire is not evidence. Against a scratch copy of src/engine.js with a
// single line changed -- the late-growth accumulation
// `growthTotal += totalBalance(accounts) - beforeLateGrowth` neutered to
// `growthTotal += 0`, i.e. real growth landing in the portfolio without ever
// being reported to the reconciler -- this same sweep produced:
//
//     real engine            rows=48117  RECONCILIATION_MISMATCH=0
//     engine w/ 1-line bug   rows=48117  RECONCILIATION_MISMATCH=45992
//
// The ~2,100 rows that did not fire are periods with no late growth to lose.
// The scratch copy lived in the session scratchpad; src/engine.js was never
// modified.
//
// FAILING SMALL (added 2026-09-13, S4 instrument review handover D13). The
// assertions below compare COUNTS and quote a bounded SAMPLE. They never hand
// assert an array of every finding. With the same late-growth fault, the
// 500-path golden Monte Carlo sweep finds 35,499 mismatches -- 9.4 MB as JSON --
// and the earlier `assert.deepEqual(s.mismatches, [])` made the test reporter
// render all of them against []. Another session on the same machine observed
// that run reach about 49 GB of memory: far beyond Node's ~4 GB JS heap limit,
// so a heap cap would not have contained it. An empty array and a zero count are
// the same claim, so no check is weakened -- every row of every path is still
// counted. Assert "none" through expectNone(), which the last test in this file
// holds to a bounded report. An assertion written around it is not covered.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');
const { extractDefaultPlan, buildScenario, GOLDEN_SCENARIOS } = require('./lib/golden-scenario-defs');
const { generateScenarios } = require('./lib/scenario-generator');

const defaultPlan = extractDefaultPlan(shell);

const RECONCILIATION = 'RECONCILIATION_MISMATCH';
const OTHER_INVARIANT_CODES = ['NON_FINITE_ROW_VALUE', 'NEGATIVE_ACCOUNT_BALANCE'];

/* How many findings of each kind a failure quotes. Every finding is still counted. */
const SAMPLE = 3;
/* The longest failure message an assertion here may produce. */
const MAX_REPORT_CHARS = 2000;

/**
 * Runs every path of `plan` with diagnostics enabled, mirroring runPlan()'s
 * own per-path generator derivation exactly.
 */
function eachPath(plan, visit, eng) {
  if (plan.assumptions.method !== 'monteCarlo') {
    const issues = [];
    const result = eng.simulatePlan(plan, eng.rng(plan.assumptions.seed), 0, null, issues);
    visit(0, result, issues);
    return 1;
  }
  let baseSeed = Number(plan.assumptions.seed);
  if (!Number.isFinite(baseSeed)) baseSeed = 0;
  const runs = plan.assumptions.runs;
  for (let i = 0; i < runs; i++) {
    const issues = [];
    const result = eng.simulatePlan(plan, eng.rng(baseSeed + i * 2), 0, eng.rng(baseSeed + i * 2 + 1), issues);
    visit(i, result, issues);
  }
  return runs;
}

/**
 * Sweeps one plan and returns everything the invariant layer cares about.
 *
 * Note on counts: each path here gets its own collector. Until S5 2p a
 * collector stopped at 200 issues of any kind, so once earlier diagnostics
 * filled it, a later mismatch was dropped before this sweep could see it
 * (S4-IR-05, external instrument audit 2026-09-13). Since S5 2p the engine keeps
 * invariant findings apart from ordinary diagnostics: up to 200 are kept
 * whatever else the collector holds, and one INVARIANT_FINDINGS_NOT_KEPT record
 * counts any beyond that. A zero here is therefore proof of no mismatch on
 * every path. A count on a broadly broken engine is still a LOWER BOUND,
 * because this sweep counts kept findings and does not add that record's count.
 *
 * Every finding is counted; only the first SAMPLE of each kind is kept, so a
 * failure can quote them without carrying all of them.
 */
function sweep(plan, eng = engine) {
  const s = { rows: 0, paths: 0, mismatchCount: 0, mismatchSample: [], otherCount: 0, otherSample: [] };
  s.paths = eachPath(plan, (pathIndex, result, issues) => {
    s.rows += result.rows.length;
    for (const issue of issues) {
      if (issue.code === RECONCILIATION) {
        s.mismatchCount++;
        if (s.mismatchSample.length < SAMPLE) s.mismatchSample.push({ pathIndex, state: issue.state });
      } else if (OTHER_INVARIANT_CODES.includes(issue.code)) {
        s.otherCount++;
        if (s.otherSample.length < SAMPLE) s.otherSample.push({ pathIndex, code: issue.code, state: issue.state });
      }
    }
  }, eng);
  return s;
}

function summarize(label, s) {
  return label + ': ' + s.mismatchCount + ' reconciliation mismatches over ' +
    s.rows + ' rows / ' + s.paths + ' paths' +
    (s.mismatchCount ? ' -- first: ' + JSON.stringify(s.mismatchSample[0]).slice(0, 400) : '');
}

/* The one way this file asserts "none": a count against zero, with a bounded
   message. `actual` and `expected` are numbers, so a failure renders two numbers
   and a message -- never a diff of every finding. */
function expectNone(count, message) {
  assert.equal(count, 0, String(message).slice(0, MAX_REPORT_CHARS));
}

// ---------------------------------------------------------------------------
// 0. The invariant must be observed DETECTING a violation before it is trusted
// ---------------------------------------------------------------------------

test('L4 precondition: checkRowInvariants actually reports an imbalance rather than passing everything', () => {
  const issues = [];
  const balanced = { opening: 100000, contributions: 5000, employer: 1000, growth: 7000, dividends: 800, withdrawals: 2000 };
  const total = balanced.opening + balanced.contributions + balanced.employer + balanced.growth - balanced.dividends - balanced.withdrawals;

  engine.checkRowInvariants(issues, { age: 60, total }, Object.assign({ accounts: [] }, balanced));
  assert.equal(issues.filter((i) => i.code === RECONCILIATION).length, 0, 'a balanced row must not be flagged');

  // One dollar of untracked money appearing in the portfolio.
  const broken = [];
  engine.checkRowInvariants(broken, { age: 60, total: total + 1 }, Object.assign({ accounts: [] }, balanced));
  assert.equal(broken.filter((i) => i.code === RECONCILIATION).length, 1, 'an imbalance must be flagged');

  // ...and the tolerance is real: a drift under a cent is not a finding.
  const noise = [];
  engine.checkRowInvariants(noise, { age: 60, total: total + 0.001 }, Object.assign({ accounts: [] }, balanced));
  assert.equal(noise.filter((i) => i.code === RECONCILIATION).length, 0, 'sub-cent drift must not be flagged');
});

test('L4 (S4-IR-05, repaired in S5 2p): a $1 imbalance is still recorded after earlier diagnostics fill the collector', () => {
  const balanced = { opening: 100000, contributions: 5000, employer: 1000, growth: 7000, dividends: 800, withdrawals: 2000 };
  const total = balanced.opening + balanced.contributions + balanced.employer + balanced.growth - balanced.dividends - balanced.withdrawals;
  for (const earlier of [0, 199, 200]) {
    const issues = [];
    for (let i = 0; i < earlier; i++) engine.recordIssue(issues, 'INFO', 'INFO', 'an unrelated diagnostic', {});
    engine.checkRowInvariants(issues, { age: 60, total: total + 1 }, Object.assign({ accounts: [] }, balanced));
    assert.equal(issues.filter((i) => i.code === RECONCILIATION).length, 1,
      earlier + ' earlier diagnostic(s): the imbalance must still be recorded');
  }
});

test('L4 (S5 2p): invariant findings past their own 200 are counted in one record, and ordinary diagnostics stay capped at 200', () => {
  /* The other half of the decision: diagnostics stay bounded. 250 ordinary
     diagnostics, then 205 imbalances. */
  const balanced = { opening: 100000, contributions: 5000, employer: 1000, growth: 7000, dividends: 800, withdrawals: 2000 };
  const total = balanced.opening + balanced.contributions + balanced.employer + balanced.growth - balanced.dividends - balanced.withdrawals;
  const issues = [];
  for (let i = 0; i < 250; i++) engine.recordIssue(issues, 'INFO', 'INFO', 'an unrelated diagnostic', {});
  for (let i = 0; i < 205; i++) engine.checkRowInvariants(issues, { age: 60, total: total + 1 }, Object.assign({ accounts: [] }, balanced));
  const overflow = issues.filter((i) => i.code === 'INVARIANT_FINDINGS_NOT_KEPT');
  assert.equal(issues.filter((i) => i.code === 'INFO').length, 200, 'ordinary diagnostics keep their cap');
  assert.equal(issues.filter((i) => i.code === RECONCILIATION).length, 200, 'invariant findings are kept up to their own 200');
  assert.equal(overflow.length, 1, 'one record counts the findings not kept');
  assert.equal(overflow[0].state.count, 5, 'and it counts every one of them');
  assert.ok(issues.length <= 401, 'the collector stays bounded: ' + issues.length);
});

test('L4 precondition: enabling diagnostics does not change what the simulation computes', () => {
  // If it did, this whole layer would be asserting the invariant against a
  // different run than the one the app publishes.
  const plan = buildScenario(defaultPlan, {});
  const withDiag = engine.simulatePlan(plan, engine.rng(plan.assumptions.seed), 0, null, []);
  const withoutDiag = engine.simulatePlan(plan, engine.rng(plan.assumptions.seed), 0, null, null);
  assert.deepEqual(withDiag.rows, withoutDiag.rows, 'diagnostics changed the projection');
  assert.equal(withDiag.failed, withoutDiag.failed);
  assert.equal(withDiag.lifetimeTaxes, withoutDiag.lifetimeTaxes);
});

// ---------------------------------------------------------------------------
// 1. The five golden scenarios -- every row of every path
// ---------------------------------------------------------------------------

for (const [name, overrides] of GOLDEN_SCENARIOS) {
  test(`L4: the reconciliation equation holds for every row of every path -- golden "${name}"`, () => {
    const plan = buildScenario(defaultPlan, overrides);
    const s = sweep(plan);
    assert.ok(s.rows > 0, 'swept no rows at all -- a vacuous pass');
    expectNone(s.mismatchCount, summarize(name, s));
    expectNone(s.otherCount, name + ': ' + s.otherCount + ' non-reconciliation invariant issues -- first: ' + JSON.stringify(s.otherSample).slice(0, 400));
  });
}

test('L4: the golden sweep reached every Monte Carlo path, not just path 0', () => {
  const plan = buildScenario(defaultPlan, { assumptions: { method: 'monteCarlo', runs: 500, seed: 123456 } });
  const s = sweep(plan);
  // runPlan() would check exactly one of these 500 paths.
  assert.equal(s.paths, 500);
  assert.ok(s.rows >= 500, 'expected at least one row per path, got ' + s.rows);
});

// ---------------------------------------------------------------------------
// 2. A seeded sweep of generated scenarios
// ---------------------------------------------------------------------------

test('L4: the reconciliation equation holds across a seeded sweep of generated scenarios', () => {
  const batch = generateScenarios(defaultPlan, { count: 40, startSeed: 20260910 });
  const failures = [];
  const otherFindings = [];
  let totalRows = 0, totalPaths = 0, calcErrorScenarios = 0;

  for (const { seed, plan } of batch) {
    const s = sweep(plan);
    totalRows += s.rows;
    totalPaths += s.paths;
    if (s.mismatchCount) failures.push({ seed, count: s.mismatchCount, first: s.mismatchSample[0] });
    if (s.otherCount) otherFindings.push({ seed, count: s.otherCount, first: s.otherSample[0] });
    // Reported, not asserted -- a scenario that legitimately fails or errors
    // still has to balance its books, which is what is asserted below.
    engine.runPlan(plan).calculationError && calcErrorScenarios++;
  }

  console.log(
    '\n  [L4 generated sweep] ' + batch.length + ' scenarios, ' + totalPaths + ' paths, ' + totalRows + ' rows' +
    '\n  seeds ' + batch[0].seed + '..' + batch[batch.length - 1].seed +
    '\n  scenarios reporting a calculation error: ' + calcErrorScenarios +
    '\n  reconciliation mismatches: ' + failures.length +
    '\n  other invariant findings: ' + otherFindings.length
  );

  assert.ok(totalRows > 5000, 'sweep too small to be evidence: ' + totalRows + ' rows');
  expectNone(failures.length, 'reconciliation mismatches in the generated sweep: ' + failures.length + ' scenarios -- first: ' + JSON.stringify(failures.slice(0, SAMPLE)));
  expectNone(otherFindings.length, 'non-reconciliation invariant findings in the generated sweep: ' + otherFindings.length + ' scenarios -- first: ' + JSON.stringify(otherFindings.slice(0, SAMPLE)));
});

test('L4: the generated sweep is reproducible -- the same seeds sweep the same rows', () => {
  const a = generateScenarios(defaultPlan, { count: 5, startSeed: 20260910 }).map(({ plan }) => sweep(plan).rows);
  const b = generateScenarios(defaultPlan, { count: 5, startSeed: 20260910 }).map(({ plan }) => sweep(plan).rows);
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// 3. Failing small: a broken engine must produce a report a machine can print
// ---------------------------------------------------------------------------

test('L4 reporting: a broadly broken engine fails with a bounded report, counted in full but quoted in brief', () => {
  /* In-process and bounded: the faulted sweep keeps at most 401 issues per path (S5 2p),
     and the assertion error is caught and measured here, so no reporter renders
     it. The fault is the one the header describes, injected into an in-memory
     copy of the engine; src/engine.js is not touched. */
  const { loadEngineVariant } = require('./lib/engine-variant');
  const faulted = loadEngineVariant([{
    id: 'portfolio valuation error (L4 reporting witness)',
    marker: 'if(issues)growthTotal+=totalBalance(accounts)-beforeLateGrowth;',
    replace: 'if(issues)growthTotal+=0;',
  }]);
  const [name, overrides] = GOLDEN_SCENARIOS.find(([n]) => n === 'monte-carlo-fixed-seed');
  const s = sweep(buildScenario(defaultPlan, overrides), faulted);
  assert.ok(s.mismatchCount > 10000, 'CONTROL: the fault is broad (' + s.mismatchCount + ' mismatches), so an unbounded report would be large');
  assert.ok(s.mismatchSample.length <= SAMPLE, 'only ' + SAMPLE + ' findings may be kept, not ' + s.mismatchSample.length);

  let thrown = null;
  try { expectNone(s.mismatchCount, summarize(name, s)); } catch (e) { thrown = e; }
  assert.ok(thrown instanceof assert.AssertionError, 'the broken engine must fail');
  assert.equal(typeof thrown.actual, 'number', 'the failure compares a count, not every mismatch');
  assert.equal(typeof thrown.expected, 'number');
  assert.ok(thrown.message.length <= MAX_REPORT_CHARS, 'the report is bounded: ' + thrown.message.length + ' characters');

  const clean = sweep(buildScenario(defaultPlan, overrides));
  assert.equal(clean.mismatchCount, 0, 'CONTROL: the real engine sweeps the same plan clean');
});
