'use strict';

/*
 * Measurement harness for the Monte Carlo path -- heap, wall time, and a
 * deoptimization signal.
 *
 * WHY IT EXISTS. Before this file there was no performance or memory
 * instrumentation anywhere in the repository: `performance.now`,
 * `process.memoryUsage`, `heapUsed` and `benchmark` appeared zero times across
 * src/, tests/ and tools/. The next sprint's behaviour-preserving refactors
 * (D-2 columnar storage, the decision/execution context split, the account-ID
 * rate map) all want a before-baseline, and bit-identity alone cannot tell you
 * whether a refactor made things faster, slower, or the same.
 *
 * WHAT IT REPORTS, per path count:
 *   - peak observed heapUsed during simulation
 *   - RETAINED heap and BYTES PER PATH, measured after a forced collection
 *     while the run array is still referenced -- retained, not garbage
 *   - wall time split into simulation vs aggregateMonteCarloRuns(), because
 *     the aggregation is where the hot loop lives: 21 quantile keys, each
 *     sorted once per projection year (src/engine.js, aggregateMonteCarloRuns)
 *   - PER-PATH COST as a function of path count, which is the deoptimization
 *     signal: a superlinear rise is the signature of the compiled inner loop
 *     being discarded, not of doing more work
 *
 * WHAT IT DOES NOT DO, deliberately. It produces numbers only. It does not
 * set, revise or propose tier thresholds, and it prints no verdict on whether
 * a given figure is acceptable. Which tier fits which budget is a judgment
 * call that stays with the user, in a watched session.
 *
 * Usage:
 *   node --expose-gc tools/bench-simulation.js
 *   node --expose-gc tools/bench-simulation.js --paths 500,1000,5000 --reps 5
 *   node --expose-gc tools/bench-simulation.js --scenario reserve-and-bond-tent
 *   node --expose-gc tools/bench-simulation.js --json tools/bench-baseline.json
 *
 * --expose-gc is REQUIRED. Without a forced collection between samples the
 * heap figures measure garbage that has not been swept yet, not retained data,
 * and a bytes-per-path number derived from that is worse than none.
 */

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

// ---------------------------------------------------------------------------

const CAVEAT = [
  'THIS MEASURES V8 ON A DESKTOP. The constraint that governs the tier table is',
  'JavaScriptCore on an iPhone 15 Pro (ROADMAP_EXTERNAL_REVIEW.md sections 1 and 6).',
  'The two do not have comparable heap accounting, and A NODE BYTES-PER-PATH FIGURE',
  'DOES NOT TRANSFER TO iOS. Do not derive an iOS tier from anything printed below.',
  '',
  'These numbers are valid for exactly one purpose: a RELATIVE before/after',
  'comparison across a code change, on identical hardware, at the same path counts.',
].join('\n');

function fail(message) {
  process.stderr.write('\nbench-simulation: ' + message + '\n\n');
  process.exit(1);
}

if (typeof global.gc !== 'function') {
  fail(
    'this harness requires --expose-gc.\n\n' +
    '  node --expose-gc tools/bench-simulation.js\n\n' +
    'Without a forced collection between samples, heapUsed measures unswept garbage\n' +
    'rather than retained data, and the bytes-per-path figure would be meaningless.'
  );
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { paths: [500, 1000, 2500, 5000, 10000], scenario: 'baseline', reps: 3, seed: 123456, json: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = function () {
      const v = argv[++i];
      if (v === undefined) fail('missing value for ' + a);
      return v;
    };
    if (a === '--paths') args.paths = next().split(',').map(function (s) { return parseInt(s.trim(), 10); });
    else if (a === '--scenario') args.scenario = next();
    else if (a === '--reps') args.reps = parseInt(next(), 10);
    else if (a === '--seed') args.seed = parseInt(next(), 10);
    else if (a === '--json') args.json = next();
    else if (a === '--help' || a === '-h') { process.stdout.write(HELP); process.exit(0); }
    else fail('unrecognized argument ' + a);
  }
  if (!args.paths.length || args.paths.some(function (n) { return !Number.isInteger(n) || n < 1; })) {
    fail('--paths must be a comma-separated list of positive integers');
  }
  if (!Number.isInteger(args.reps) || args.reps < 1) fail('--reps must be a positive integer');
  return args;
}

const HELP = [
  'bench-simulation -- Monte Carlo heap/time baseline, and a deoptimization signal',
  '',
  '  node --expose-gc tools/bench-simulation.js [options]',
  '',
  '  --paths     comma-separated path counts   (default 500,1000,2500,5000,10000)',
  '  --scenario  a GOLDEN_SCENARIOS name       (default baseline)',
  '  --reps      samples per path count        (default 3, median reported)',
  '  --seed      Monte Carlo seed              (default 123456)',
  '  --json      also write results to a file',
  '',
].join('\n');

const args = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------------------
// Engine + scenario
// ---------------------------------------------------------------------------

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require(path.join(ROOT, 'src', 'engine.js'));
const { extractDefaultPlan, buildScenario, GOLDEN_SCENARIOS } = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js'));

const defaultPlan = extractDefaultPlan(shell);
const chosen = GOLDEN_SCENARIOS.find(function (s) { return s[0] === args.scenario; });
if (!chosen) {
  fail('unknown scenario "' + args.scenario + '". Available: ' + GOLDEN_SCENARIOS.map(function (s) { return s[0]; }).join(', '));
}

function planFor(pathCount) {
  const overrides = JSON.parse(JSON.stringify(chosen[1]));
  overrides.assumptions = Object.assign({}, overrides.assumptions, {
    method: 'monteCarlo', runs: pathCount, seed: args.seed,
  });
  return buildScenario(defaultPlan, overrides);
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

function collect() {
  // Twice: the first pass can resurrect objects held only by finalizers, and
  // the second gives a settled figure.
  global.gc();
  global.gc();
}

function heapUsed() {
  return process.memoryUsage().heapUsed;
}

/*
 * One sample at one path count. Mirrors runPlan()'s own per-path generator
 * derivation exactly -- rng(baseSeed + i*2) for market returns and
 * rng(baseSeed + i*2 + 1) for the LTC draw. Since S5 block 2n each direct
 * simulatePlan() call here also runs the input gates, which runPlan() runs once
 * per plan and skips for its own per-path calls. So a sample's simulation time
 * is an upper bound on runPlan()'s per-path work, not that work exactly: at most
 * about 12% of a short path above it, as measured before the change.
 */
function sample(pathCount) {
  const plan = planFor(pathCount);
  let baseSeed = Number(plan.assumptions.seed);
  if (!Number.isFinite(baseSeed)) baseSeed = 0;

  collect();
  const before = heapUsed();
  let peak = before;
  // At most ~100 probes, so the sampling itself does not distort the timing.
  const probeEvery = Math.max(1, Math.floor(pathCount / 100));

  const runs = new Array(pathCount);
  const t0 = performance.now();
  for (let i = 0; i < pathCount; i++) {
    runs[i] = engine.simulatePlan(plan, engine.rng(baseSeed + i * 2), 0, engine.rng(baseSeed + i * 2 + 1), null);
    if (i % probeEvery === 0) {
      const h = heapUsed();
      if (h > peak) peak = h;
    }
  }
  const t1 = performance.now();

  // `runs` is still referenced, so what survives this collection is retained
  // data, not garbage awaiting a sweep.
  collect();
  const retained = heapUsed() - before;

  const t2 = performance.now();
  const aggregated = engine.aggregateMonteCarloRuns(runs);
  const t3 = performance.now();
  const afterAggregate = heapUsed() - before;

  const rowsPerPath = runs[0] ? runs[0].rows.length : 0;
  // Touched so the aggregate cannot be optimized away as dead.
  const aggregateRows = aggregated && aggregated.rows ? aggregated.rows.length : 0;

  return {
    pathCount,
    rowsPerPath,
    aggregateRows,
    simMs: t1 - t0,
    aggregateMs: t3 - t2,
    peakHeapBytes: peak - before,
    retainedBytes: retained,
    retainedAfterAggregateBytes: afterAggregate,
    bytesPerPath: retained / pathCount,
    bytesPerRow: rowsPerPath > 0 ? retained / (pathCount * rowsPerPath) : 0,
    microsecondsPerPath: ((t1 - t0) * 1000) / pathCount,
  };
}

function median(values) {
  const a = values.slice().sort(function (x, y) { return x - y; });
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function medianOf(samples, key) {
  return median(samples.map(function (s) { return s[key]; }));
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function mib(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function pad(s, n, right) {
  const str = String(s);
  return right ? str.padStart(n) : str.padEnd(n);
}

function main() {
  const started = new Date().toISOString();

  process.stdout.write('\n' + '='.repeat(78) + '\n');
  process.stdout.write(CAVEAT + '\n');
  process.stdout.write('='.repeat(78) + '\n\n');
  process.stdout.write(
    'scenario     : ' + args.scenario + ' (forced to monteCarlo)\n' +
    'seed         : ' + args.seed + '\n' +
    'reps         : ' + args.reps + ' per path count, median reported\n' +
    'node         : ' + process.version + ' on ' + process.platform + '/' + process.arch + '\n' +
    'engine       : ENGINE_VERSION ' + engine.ENGINE_VERSION + '\n' +
    'started      : ' + started + '\n\n'
  );

  // A warm-up pass so the first measured path count is not paying for JIT
  // compilation the later ones already had done for them.
  process.stdout.write('warming up...\n');
  sample(Math.min(200, args.paths[0]));

  const results = [];
  for (const pathCount of args.paths) {
    const samples = [];
    for (let r = 0; r < args.reps; r++) samples.push(sample(pathCount));
    const merged = {
      pathCount,
      rowsPerPath: samples[0].rowsPerPath,
      simMs: medianOf(samples, 'simMs'),
      aggregateMs: medianOf(samples, 'aggregateMs'),
      peakHeapBytes: medianOf(samples, 'peakHeapBytes'),
      retainedBytes: medianOf(samples, 'retainedBytes'),
      retainedAfterAggregateBytes: medianOf(samples, 'retainedAfterAggregateBytes'),
      bytesPerPath: medianOf(samples, 'bytesPerPath'),
      bytesPerRow: medianOf(samples, 'bytesPerRow'),
      microsecondsPerPath: medianOf(samples, 'microsecondsPerPath'),
      samples,
    };
    results.push(merged);
    process.stdout.write(
      '  ' + pad(pathCount + ' paths', 14) + ' sim ' + pad(merged.simMs.toFixed(0) + 'ms', 8, true) +
      '   agg ' + pad(merged.aggregateMs.toFixed(0) + 'ms', 8, true) +
      '   retained ' + pad(mib(merged.retainedBytes) + ' MiB', 11, true) + '\n'
    );
  }

  const head = results[0];

  process.stdout.write('\n' + '-'.repeat(78) + '\n');
  process.stdout.write('MEMORY (retained after a forced collection, run array still referenced)\n');
  process.stdout.write('-'.repeat(78) + '\n');
  process.stdout.write(
    pad('paths', 9) + pad('rows/path', 11, true) + pad('peak MiB', 11, true) +
    pad('retained MiB', 14, true) + pad('bytes/path', 13, true) + pad('bytes/row', 12, true) + '\n'
  );
  for (const r of results) {
    process.stdout.write(
      pad(r.pathCount, 9) + pad(r.rowsPerPath, 11, true) + pad(mib(r.peakHeapBytes), 11, true) +
      pad(mib(r.retainedBytes), 14, true) + pad(r.bytesPerPath.toFixed(0), 13, true) +
      pad(r.bytesPerRow.toFixed(0), 12, true) + '\n'
    );
  }

  process.stdout.write('\n' + '-'.repeat(78) + '\n');
  process.stdout.write('WALL TIME (median of ' + args.reps + ')\n');
  process.stdout.write('-'.repeat(78) + '\n');
  process.stdout.write(
    pad('paths', 9) + pad('sim ms', 11, true) + pad('aggregate ms', 14, true) +
    pad('agg % total', 13, true) + pad('us/path', 11, true) + '\n'
  );
  for (const r of results) {
    const total = r.simMs + r.aggregateMs;
    process.stdout.write(
      pad(r.pathCount, 9) + pad(r.simMs.toFixed(1), 11, true) + pad(r.aggregateMs.toFixed(1), 14, true) +
      pad(total > 0 ? ((r.aggregateMs / total) * 100).toFixed(1) + '%' : 'n/a', 13, true) +
      pad(r.microsecondsPerPath.toFixed(1), 11, true) + '\n'
    );
  }

  process.stdout.write('\n' + '-'.repeat(78) + '\n');
  process.stdout.write('DEOPTIMIZATION SIGNAL -- per-path cost as a function of path count\n');
  process.stdout.write('-'.repeat(78) + '\n');
  process.stdout.write(
    'Per-path cost normalized to the smallest path count. A flat column means the\n' +
    'work scales linearly. A column that RISES means each additional path is costing\n' +
    'more than the last, which is what discarding the compiled inner loop looks like\n' +
    '-- distinct from running out of memory, and silent while it happens.\n' +
    'This is a measurement. No threshold is asserted here; reading it is the reader\'s.\n\n'
  );
  process.stdout.write(pad('paths', 9) + pad('us/path', 11, true) + pad('vs smallest', 13, true) + pad('bytes/path', 13, true) + '\n');
  for (const r of results) {
    const ratio = head.microsecondsPerPath > 0 ? r.microsecondsPerPath / head.microsecondsPerPath : 0;
    process.stdout.write(
      pad(r.pathCount, 9) + pad(r.microsecondsPerPath.toFixed(1), 11, true) +
      pad(ratio.toFixed(3) + 'x', 13, true) + pad(r.bytesPerPath.toFixed(0), 13, true) + '\n'
    );
  }

  process.stdout.write('\n' + '='.repeat(78) + '\n');
  process.stdout.write(CAVEAT.split('\n').slice(0, 4).join('\n') + '\n');
  process.stdout.write('='.repeat(78) + '\n\n');

  if (args.json) {
    const payload = {
      generatedAt: started,
      caveat: CAVEAT,
      scenario: args.scenario,
      seed: args.seed,
      reps: args.reps,
      node: process.version,
      platform: process.platform + '/' + process.arch,
      engineVersion: engine.ENGINE_VERSION,
      results: results.map(function (r) {
        const copy = Object.assign({}, r);
        delete copy.samples;
        copy.perPathCostVsSmallest = head.microsecondsPerPath > 0 ? r.microsecondsPerPath / head.microsecondsPerPath : 0;
        return copy;
      }),
    };
    fs.writeFileSync(args.json, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    process.stdout.write('wrote ' + args.json + '\n\n');
  }
}

main();
