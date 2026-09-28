'use strict';

// Track D-3 -- per-path Monte Carlo RNG seeding (PLATFORM_DEVELOPMENT_ROADMAP.md
// §11c, item D-3). Before this change, runPlan's Monte Carlo loop passed one
// shared `rng()` instance into every simulatePlan() call, so path i's draws
// depended on how many random numbers every earlier path happened to
// consume -- making the path loop inherently serial and unsafe to
// parallelize. This pins the replacement scheme (independent generators
// derived from the scenario seed, `rng(baseSeed + i*2)` for market returns
// and `rng(baseSeed + i*2 + 1)` for the LTC draw) so a future refactor can't
// silently drift back to a shared-stream design without a test noticing.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

function braceExtract(src, marker) {
  const i = src.indexOf(marker);
  let j = src.indexOf('{', i), depth = 0, inStr = null;
  for (let k = j; k < src.length; k++) {
    const c = src[k];
    if (inStr) { if (c === '\\') { k++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(j, k + 1); }
  }
  throw new Error('braceExtract: unbalanced braces');
}
const defaultPlan = eval('(' + braceExtract(shell, 'var defaultPlan=') + ')');

function samplePlan(overrides = {}) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.accounts = [
    { id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 250000, contribution: 12000, contributionMode: 'amount', priority: 1, basisPct: 70, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 },
    { id: 'a2', name: '401k', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 400000, contribution: 15000, contributionMode: 'amount', priority: 2, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: true, matchCap: 5, matchRate: 100, profitShare: 0, vesting: 100 },
  ];
  p.employment.salary = 145000;
  Object.assign(p.assumptions, overrides.assumptions || {});
  Object.assign(p.retirement, overrides.retirement || {});
  Object.assign(p.advanced, overrides.advanced || {});
  Object.assign(p.profile, overrides.profile || {});
  return p;
}

test('runPlan(monteCarlo, runs:1) matches a direct simulatePlan() call seeded the documented way', () => {
  const seed = 9001;
  const p = samplePlan({ assumptions: { method: 'monteCarlo', runs: 1, seed } });

  const viaRunPlan = engine.runPlan(p);
  const direct = engine.simulatePlan(p, engine.rng(seed), 0, engine.rng(seed + 1), null);

  // A single-path Monte Carlo run's "median" (and q10/q90) is just that one
  // path's own values, so runPlan's aggregated rows must equal simulatePlan's
  // raw rows field-for-field for every metric runPlan tracks.
  assert.equal(viaRunPlan.rows.length, direct.rows.length);
  const quantileKeys = ['total', 'realTotal', 'taxable', 'preTax', 'roth', 'hsa', 'contributions', 'income', 'spending', 'withdrawals', 'dividends', 'taxes', 'rmd', 'shortfall', 'debtPayments', 'otherAssets', 'debtBalance', 'nonPortfolioDraw', 'inflationFactor', 'networth', 'magi'];
  for (let y = 0; y < viaRunPlan.rows.length; y++) {
    for (const key of quantileKeys) {
      assert.equal(viaRunPlan.rows[y][key], direct.rows[y][key], `row ${y} key ${key}`);
    }
    assert.equal(viaRunPlan.rows[y].q10, direct.rows[y].total, `row ${y} q10`);
    assert.equal(viaRunPlan.rows[y].q90, direct.rows[y].total, `row ${y} q90`);
  }
});

/* S5AA R25 (R24F-04, the owner 2026-09-25): a seed that is present and not a finite number is now REFUSED at the input gate
   (SCENARIO_NONNUMBER_PLAN_VALUE), as the validator rejects it, so a NaN seed no longer reaches the fallback below. The
   fallback's purpose -- never collapse every path onto one rng(NaN>>>0) stream -- still guards an ABSENT seed, which the
   validator accepts: Number(undefined) is NaN. Both halves are held here. */
test('an absent seed falls back to 0 deterministically, rather than collapsing every path onto rng(NaN)', () => {
  const base = { assumptions: { method: 'monteCarlo', runs: 25 } };
  const absent = samplePlan({ assumptions: { ...base.assumptions } });
  delete absent.assumptions.seed;
  const withAbsent = engine.runPlan(absent);
  const withZero = engine.runPlan(samplePlan({ assumptions: { ...base.assumptions, seed: 0 } }));
  assert.equal(withAbsent.status, 'ok');
  assert.deepEqual(withAbsent.rows, withZero.rows, 'an absent seed must behave exactly like seed 0, not like an unguarded NaN>>>0 stream');
});

test('a NaN seed is refused at the input gate (S5AA R25, R24F-04), so it cannot collapse the paths either', () => {
  const r = engine.runPlan(samplePlan({ assumptions: { method: 'monteCarlo', runs: 25, seed: NaN } }));
  assert.equal(r.calculationErrorCode, 'SCENARIO_NONNUMBER_PLAN_VALUE');
  assert.equal(r.rows, null);
});

test('adjacent paths draw from independent streams, not a shared sequential one', () => {
  // Two consecutive paths' raw (pre-aggregation) results must differ under a
  // volatile scenario -- if they were identical, the derivation would have
  // collapsed onto the same stream for every path (the exact bug this test
  // guards against: e.g. accidentally reusing `i*0` instead of `i*2`).
  const seed = 555;
  const p = samplePlan({ assumptions: { method: 'monteCarlo', volatility: 25 } });
  const path0 = engine.simulatePlan(p, engine.rng(seed + 0 * 2), 0, engine.rng(seed + 0 * 2 + 1), null);
  const path1 = engine.simulatePlan(p, engine.rng(seed + 1 * 2), 0, engine.rng(seed + 1 * 2 + 1), null);
  assert.notDeepEqual(path0.rows, path1.rows, 'two different paths produced identical rows -- streams are not actually independent');
});
