'use strict';

/*
 * S4 task 10 -- the device benchmark, held to what it can be held to without a
 * device.
 *
 * What is proved here: the page embeds the build's own engine and that engine
 * reproduces Node exactly; the page runs end to end in jsdom and produces its
 * JSON; the measurement core reports cold apart from warm, checks every result,
 * reports telemetry as unavailable where there is none, calls a rising cost
 * curve a candidate and nothing more, and stops -- saying why -- on each of its
 * stop conditions.
 *
 * What is NOT proved here: that the page runs in a real browser, on a phone, or
 * produces any particular figure there. jsdom is not a browser. That is 10.4 to
 * 10.7, and it needs a device.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const core = require('../tools/device-benchmark-core.js');
const gen = require('../tools/build-device-benchmark.js');

const SMALL = { stages: [10, 20, 40], warmReps: 1, seed: 123456 };
const GENERATED = gen.generate({ protocol: SMALL });

/* A fake engine on a fake clock: simulatePlan advances the clock by the cost the test chooses. */
function rig(options) {
  const o = options || {};
  const clock = { t: 0 };
  let aggregates = 0;
  const engine = {
    rng: (s) => s,
    simulatePlan: (plan, returns, zero, ltc) => {
      if (o.throws) throw new Error('boom');
      clock.t += o.msPerPath ? o.msPerPath(plan.assumptions.runs) : 1;
      if (o.heap) o.heap.bytes += 1000;
      return { rows: [returns, ltc] };
    },
    aggregateMonteCarloRuns: (runs) => {
      aggregates++;
      clock.t += runs.length * 0.1;
      return { n: runs.length, first: runs[0].rows[0], drift: o.drift ? o.drift(aggregates) : 0 };
    },
  };
  return {
    engine,
    now: () => clock.t,
    planFor: (n) => ({ assumptions: { runs: n } }),
    yieldToPage: o.lag ? () => Promise.resolve(o.lag()) : () => Promise.resolve(0),
  };
}
const expectedPrint = (n, seed) => core.fingerprint({ n, first: seed, drift: 0 });

test('10.1: the page is self-contained -- no external script, stylesheet or request, and no storage', () => {
  const html = GENERATED.html;
  assert.doesNotMatch(html, /<script[^>]*\bsrc=/i);
  assert.doesNotMatch(html, /<link\b/i);
  assert.doesNotMatch(html, /@import/);
  assert.doesNotMatch(html, /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB/, 'benchmark evidence stays out of financial snapshots: the page stores nothing');
  assert.equal((html.match(/<script\b/g) || []).length, 4, 'rules, config, core, page');
});

test('10.1: the embedded engine is the build\'s own, and reproduces the Node engine exactly at every stage', () => {
  const { build } = require('../build.js');
  const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
  const factory = GENERATED.embedded.engineFactory;
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'device-benchmark-test-'));
  const log = console.log;
  console.log = () => {};
  let parts;
  try { parts = build(path.join(dir, 'app.html')); } finally { console.log = log; fs.rmSync(dir, { recursive: true, force: true }); }
  assert.ok(factory.includes(parts.engineBody) && factory.includes(parts.debtModulesBlock), 'the page carries the build output, not a copy of the sources');

  const embedded = vm.runInContext(factory, vm.createContext({}))(gen.rulesTextOf(shell));
  global.RULES = JSON.parse(gen.rulesTextOf(shell));
  const nodeEngine = require('../src/engine.js');
  const { extractDefaultPlan, buildScenario } = require('./lib/golden-scenario-defs.js');
  const now = () => 0;
  SMALL.stages.forEach((n) => {
    const plan = buildScenario(extractDefaultPlan(shell), { assumptions: { method: 'monteCarlo', runs: n, seed: SMALL.seed } });
    assert.deepEqual(gen.planFor(GENERATED.embedded.template, n), plan, 'the page derives the same plan as buildScenario');
    const fromNode = core.runSample(nodeEngine, plan, n, SMALL.seed, now).fingerprint;
    assert.equal(GENERATED.embedded.references[n], fromNode, 'the stored reference is Node\'s answer');
    assert.equal(core.runSample(embedded, gen.planFor(GENERATED.embedded.template, n), n, SMALL.seed, now).fingerprint, fromNode, 'the embedded engine gives Node\'s answer at ' + n + ' paths');
  });
});

/* S5 2l: build() will substitute src/boolean-flag-contract.json's JSON into
   the engine body this page embeds, so the contract becomes an input of the
   page. inputFiles() is a hand list that nothing else holds to what the
   embedded engine is made of: without the entry, a page built after a contract
   edit would record unchanged input hashes. */
test('10.1 (S5 2l): the boolean-flag contract is one of the page\'s recorded input files', () => {
  const CONTRACT = 'src/boolean-flag-contract.json';
  assert.ok(fs.existsSync(path.join(ROOT, CONTRACT)), 'CONTROL: ' + CONTRACT + ' exists');
  assert.ok(gen.inputFiles(ROOT).includes(CONTRACT), CONTRACT + ' is not among the device benchmark\'s input files');
});

test('10.1 / 10.8: in jsdom (not a browser), the page runs end to end and produces a copyable JSON result', async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(GENERATED.html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://benchmark.invalid/' });
  const { document } = dom.window;
  assert.equal(document.body.getAttribute('data-state'), 'ready', 'the page wired itself up');
  document.getElementById('device').value = 'jsdom';
  document.getElementById('start').dispatchEvent(new dom.window.Event('click'));
  const deadline = Date.now() + 120000;
  while (document.body.getAttribute('data-state') === 'running' && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  assert.equal(document.body.getAttribute('data-state'), 'completed', document.getElementById('status').textContent);
  const report = JSON.parse(document.getElementById('result').value);
  assert.equal(report.schema, core.SCHEMA);
  assert.equal(report.completed, true);
  assert.deepEqual(report.stages.map((s) => s.pathCount), SMALL.stages);
  report.stages.forEach((s) => {
    assert.equal(s.reference, 'matches', 'jsdom runs V8, so it must match Node exactly');
    assert.equal(s.consistency, 'consistent');
    assert.equal(typeof s.coldSimMs, 'number');
    assert.equal(s.warmSimMs.n, SMALL.warmReps, 'cold apart from warm');
  });
  report.stages.forEach((s) => s.samples.forEach((x) => assert.equal(typeof x.blockedMs, 'number', 'IR-04: the page arms a heartbeat across every sample')));
  assert.equal(report.environment.operator.device, 'jsdom');
  assert.equal(report.environment.heapTelemetry, 'unavailable');
  assert.deepEqual(report.environment.webgpu, { available: false });
  assert.ok('hardwareConcurrency' in report.environment && 'engineLoadMs' in report.environment.coldStart);
  assert.deepEqual(report.execution, { thread: 'main', workerCount: 0 });
  assert.deepEqual(report.identity, GENERATED.identity);
  assert.equal(document.getElementById('progress').tBodies[0].rows.length, SMALL.stages.length);
  assert.equal(dom.window.localStorage.length, 0);
  dom.window.close();
});

test('10.2: device facts are collected where the browser offers them and reported unavailable where it does not', async () => {
  const bare = await core.collectEnvironment({}, {}, {});
  assert.equal(bare.userAgent, 'unavailable');
  assert.equal(bare.userAgentData, 'unavailable');
  assert.equal(bare.hardwareConcurrency, 'unavailable');
  assert.deepEqual(bare.webgpu, { available: false });
  assert.equal(bare.heapTelemetry, 'unavailable');
  assert.equal(bare.preciseMemoryApi, false);

  const full = await core.collectEnvironment({
    userAgent: 'UA', hardwareConcurrency: 8, deviceMemory: 4,
    userAgentData: { getHighEntropyValues: (keys) => Promise.resolve({ model: 'Pixel', asked: keys }) },
    gpu: { requestAdapter: () => Promise.resolve({ info: { vendor: 'arm', architecture: 'mali', device: '', description: 'GPU' } }) },
  }, { memory: { usedJSHeapSize: 1, jsHeapSizeLimit: 2 }, measureUserAgentSpecificMemory: () => 0 }, { crossOriginIsolated: true });
  assert.equal(full.hardwareConcurrency, 8);
  assert.equal(full.userAgentData.model, 'Pixel');
  assert.ok(full.userAgentData.asked.includes('platformVersion'));
  assert.deepEqual(full.webgpu, { available: true, adapter: { vendor: 'arm', architecture: 'mali', device: '', description: 'GPU' } });
  assert.equal(full.heapTelemetry, 'performance.memory');
  assert.equal(full.preciseMemoryApi, true);

  const noAdapter = await core.collectEnvironment({ gpu: { requestAdapter: () => Promise.resolve(null) } }, {}, {});
  assert.deepEqual(noAdapter.webgpu, { available: true, adapter: 'none returned' });
  const failing = await core.collectEnvironment({ gpu: { requestAdapter: () => Promise.reject(new Error('denied')) } }, {}, {});
  assert.equal(failing.webgpu, 'error: denied');
});

test('10.2: heap with the paths referenced comes from the telemetry there is, and is unavailable where there is none', async () => {
  const heap = { bytes: 0 };
  const r = rig({ heap });
  const withTelemetry = await core.runProtocol(Object.assign({}, r, { protocol: { stages: [10, 20], warmReps: 1 }, readHeap: () => ({ source: 'performance.memory', precise: false, bytes: heap.bytes }) }));
  withTelemetry.stages.forEach((s) => {
    assert.equal(s.heapWithPathsReferenced.source, 'performance.memory');
    assert.equal(s.heapWithPathsReferenced.bytesPerPath, 1000);
  });
  const without = await core.runProtocol(Object.assign({}, rig(), { protocol: { stages: [10], warmReps: 1 } }));
  assert.deepEqual(without.stages[0].heapWithPathsReferenced, { source: 'unavailable' });
  const precise = await core.runProtocol(Object.assign({}, rig({ heap: { bytes: 0 } }), {
    protocol: { stages: [10], warmReps: 1 },
    readHeap: () => ({ source: 'performance.measureUserAgentSpecificMemory', precise: true, bytes: 0 }),
    measurePrecise: () => Promise.resolve({ source: 'performance.measureUserAgentSpecificMemory', precise: true, bytes: 5000 }),
  }));
  assert.equal(precise.stages[0].heapWithPathsReferenced.precise, true);
  assert.equal(precise.stages[0].heapWithPathsReferenced.bytesPerPath, 500);
});

test('10.3: a rising per-path cost is reported as a candidate signature and never as a verdict, on curves whose answer is known', async () => {
  const curve = (values) => values.map((us, i) => ({ pathCount: [100, 500, 1000, 5000][i], microsecondsPerPath: us }));
  assert.equal(core.candidateSignature(curve([400, 410, 405, 420]), 1.5).status, 'not-observed');
  const rising = core.candidateSignature(curve([400, 420, 900, 1600]), 1.5);
  assert.equal(rising.status, 'CANDIDATE');
  assert.equal(rising.firstStageAtOrAboveRatio, 1000);
  assert.equal(rising.ratioAtLargestStage, 4);
  assert.match(rising.caveat, /never proof/);
  assert.equal(core.candidateSignature(curve([400, 900]), 1.5).status, 'insufficient-stages');

  const r = rig({ msPerPath: (n) => (n >= 40 ? 3 : 1) });
  const report = await core.runProtocol(Object.assign({}, r, { protocol: { stages: [10, 20, 40], warmReps: 1, stageTimeBudgetMs: 1e9 } }));
  assert.equal(report.signature.status, 'CANDIDATE');
  assert.equal(report.signature.firstStageAtOrAboveRatio, 40);
  assert.ok(report.caveats.some((c) => /CANDIDATE JIT-discard signature, never proof/.test(c)));
});

test('10.8: cold is kept apart from warm, distributions are reported, and every result is checked -- across repetitions and against Node', async () => {
  const seed = 7;
  const references = { 10: expectedPrint(10, seed), 20: 'deadbeef' };
  const report = await core.runProtocol(Object.assign({}, rig(), { protocol: { stages: [10, 20], warmReps: 3, seed }, references }));
  const [a, b] = report.stages;
  assert.equal(a.samples[0].kind, 'cold');
  assert.deepEqual(a.samples.slice(1).map((s) => s.kind), ['warm', 'warm', 'warm']);
  assert.equal(a.warmSimMs.n, 3);
  assert.deepEqual(Object.keys(a.warmSimMs).sort(), ['max', 'median', 'min', 'n', 'samples']);
  assert.equal(a.reference, 'matches');
  assert.equal(b.reference, 'DIFFERS', 'a reference that does not match is reported');
  assert.equal(a.consistency, 'consistent');

  const drifting = await core.runProtocol(Object.assign({}, rig({ drift: (k) => (k === 3 ? 1 : 0) }), { protocol: { stages: [10], warmReps: 3 } }));
  assert.equal(drifting.stages[0].consistency, 'INCONSISTENT', 'one repetition with a different aggregate is caught');
  assert.equal(drifting.stages[0].reference, 'no reference');
  assert.equal(drifting.completed, true);
});

test('10.8: the stop policy stops, and says why -- time budget, repeated errors, lost responsiveness, background, cancellation', async () => {
  const base = { stages: [10, 20, 100000], warmReps: 1 };
  const clean = await core.runProtocol(Object.assign({}, rig(), { protocol: { stages: [10, 20], warmReps: 1 } }));
  assert.equal(clean.completed, true);
  assert.equal(clean.stopped, null);

  const budget = await core.runProtocol(Object.assign({}, rig(), { protocol: Object.assign({}, base, { stageTimeBudgetMs: 5000 }) }));
  assert.equal(budget.completed, false);
  assert.deepEqual([budget.stopped.stage, budget.stopped.when], [100000, 'before']);
  assert.match(budget.stopped.reason, /predicted to take \d+ ms, over the 5000 ms budget/);
  assert.equal(budget.stages.length, 2, 'the stages already run are kept');

  const errors = await core.runProtocol(Object.assign({}, rig({ throws: true }), { protocol: base }));
  assert.match(errors.stopped.reason, /repeated errors \(2 in a row\)/);
  assert.deepEqual([errors.stopped.stage, errors.stopped.when], [10, 'during']);
  assert.equal(errors.stages[0].errors.length, 2);
  assert.equal(errors.stages[0].consistency, 'no samples');

  let lagCalls = 0;
  const lag = await core.runProtocol(Object.assign({}, rig({ lag: () => (++lagCalls > 2 ? 5000 : 0) }), { protocol: base }));
  assert.match(lag.stopped.reason, /lost responsiveness: a zero-delay timer fired 5000 ms late/);
  assert.deepEqual([lag.stopped.stage, lag.stopped.when], [20, 'before']);
  assert.equal(lag.stages.length, 1, 'a stage that took no sample is not reported as a stage');

  let midLag = 0;
  const partial = await core.runProtocol(Object.assign({}, rig({ lag: () => (++midLag === 2 ? 5000 : 0) }), { protocol: base }));
  assert.deepEqual([partial.stopped.stage, partial.stopped.when], [10, 'during']);
  assert.equal(partial.stages[0].completedSamples, 1, 'the partial stage is kept, and says how far it got');
  assert.equal(partial.stages[0].plannedSamples, 2);

  let stagesSeen = 0;
  const hidden = await core.runProtocol(Object.assign({}, rig(), { protocol: base, isHidden: () => stagesSeen > 0, onProgress: () => { stagesSeen++; } }));
  assert.match(hidden.stopped.reason, /left the foreground/);
  assert.equal(hidden.stages.length, 1);

  let cancel = false;
  const cancelled = await core.runProtocol(Object.assign({}, rig(), { protocol: base, isCancelled: () => cancel, onProgress: () => { cancel = true; } }));
  assert.equal(cancelled.stopped.reason, 'cancelled');
  assert.deepEqual([cancelled.stopped.stage, cancelled.stopped.when], [20, 'before']);
});

/*
 * S4-IR-04 (external instrument audit, 2026-09-13). The page's zero-delay timer
 * resolved BEFORE each sample's synchronous work began, so the lag it reported
 * described the page before the stall, never the stall: two 60 ms workloads
 * against a 20 ms limit reported about 1 ms of lag and completed. These use REAL
 * timers and a real busy loop, bounded well under a second, because a fake clock
 * cannot show whether a timer spans the work. The margins are broad on purpose:
 * a 600 ms stall against a 250 ms limit. Witnesses were observed failing against
 * the unrepaired core; CONTROL passed before and after.
 */
const { performance } = require('node:perf_hooks');
const realNow = () => performance.now();
const realTimer = () => new Promise((resolve) => { const t = realNow(); setTimeout(() => resolve(realNow() - t), 0); });
const busy = (ms) => { const t = realNow(); while (realNow() - t < ms) { /* hold the event loop */ } };
const STALL_MS = 600;
const LIMIT_MS = 250;
function stallRig(simMs, aggMs, extra, onSimulate) {
  return Object.assign({
    engine: {
      rng: (s) => s,
      simulatePlan: () => { if (onSimulate) onSimulate(); busy(simMs); return { rows: [{}] }; },
      aggregateMonteCarloRuns: () => { busy(aggMs); return { total: 1 }; },
    },
    planFor: (n) => ({ assumptions: { runs: n } }),
    now: realNow,
    yieldToPage: realTimer,
    heartbeat: realTimer,
    protocol: { stages: [1], warmReps: 2, maxLagMs: LIMIT_MS, stageTimeBudgetMs: 1e9 },
  }, extra || {});
}

test('IR-04: a short workload proceeds under a real heartbeat, with the blocking it measured recorded apart from the pre-sample lag', async () => {
  const report = await core.runProtocol(stallRig(0, 0));
  assert.equal(report.completed, true, JSON.stringify(report.stopped));
  const samples = report.stages[0].samples;
  assert.equal(samples.length, 3);
  samples.forEach((s) => {
    assert.equal(typeof s.lagMs, 'number');
    assert.equal(typeof s.blockedMs, 'number', 'blocking is measured, not left out');
    assert.ok(s.blockedMs < LIMIT_MS, 'a workload with no work did not block past the limit: ' + s.blockedMs);
  });
  assert.equal(report.stages[0].responsiveness.blockedMs.n, 3);
  assert.ok(report.caveats.some((c) => /cannot interrupt/.test(c)), 'the report says a main-thread timer cannot interrupt the work it measures');
});

test('IR-04: a simulation stall the pre-sample timer never sees is witnessed by the heartbeat, and the run stops before another sample', async () => {
  const report = await core.runProtocol(stallRig(STALL_MS, 0));
  assert.equal(report.completed, false, 'a 600 ms stall against a 250 ms limit must stop the run');
  assert.deepEqual([report.stopped.stage, report.stopped.when], [1, 'during']);
  assert.match(report.stopped.reason, /blocked the page for \d+ ms \(limit 250 ms\)/);
  const samples = report.stages[0].samples;
  assert.equal(samples.length, 1, 'no further repetition starts after the stall');
  assert.ok(samples[0].lagMs < LIMIT_MS, 'premise: the pre-sample timer fired before the work, so it could not see the stall: ' + samples[0].lagMs);
  assert.ok(samples[0].simBlockedMs >= STALL_MS * 0.9, 'the heartbeat armed before simulation spans it: ' + samples[0].simBlockedMs);
});

test('IR-04: an aggregation-only stall is witnessed too', async () => {
  const report = await core.runProtocol(stallRig(0, STALL_MS));
  assert.equal(report.completed, false);
  assert.match(report.stopped.reason, /blocked the page/);
  assert.equal(report.stages[0].samples.length, 1);
  const s = report.stages[0].samples[0];
  assert.ok(s.aggregateBlockedMs >= STALL_MS * 0.9, 'the heartbeat armed before aggregation spans it: ' + s.aggregateBlockedMs);
  assert.ok(s.blockedMs >= STALL_MS * 0.9);
});

test('IR-04 CONTROL: a cancellation that arrives while a sample runs is honored before another sample starts', async () => {
  let cancel = false;
  // The hook is passed in, not patched onto the fake: tools/test-classification.js reads
  // member text such as `x.engine.<export>` as reaching an engine internal.
  const report = await core.runProtocol(stallRig(0, 0, { isCancelled: () => cancel }, () => { cancel = true; }));
  assert.equal(report.stopped.reason, 'cancelled');
  assert.equal(report.stages[0].samples.length, 1);
});

test('IR-04: without a heartbeat, blocking is reported as unavailable -- never as zero', async () => {
  const report = await core.runProtocol(Object.assign({}, rig(), { protocol: { stages: [10], warmReps: 1 } }));
  assert.equal(report.stages[0].samples[0].blockedMs, null);
  assert.equal(report.stages[0].responsiveness.blockedMs, 'unavailable');
});

/*
 * S4-IR-04-R1 (external requalification, 2026-09-14). A simulation that stalled
 * and then THREW went straight back to another attempt: its catch never read the
 * heartbeat armed before it, so a 60 ms stall against a 20 ms limit followed by
 * an exception completed with `stopped: null`. Every attempt now settles through
 * one path -- heartbeats read, blocking recorded, then the error-count, cancel,
 * background and blocking stops applied -- whether it returned or threw. A failed
 * attempt's blocking is kept on the stage's failedAttempts, never mixed into the
 * successful timing distributions. Most witnesses inject heartbeat values so the
 * outcome is deterministic; one uses real timers. Witnesses were observed failing
 * against the unrepaired core. CONTROL marks behaviour that already held; where a
 * CONTROL also asserts the new attempt record, that assertion alone was red.
 */
function attemptRig(o) {
  const opts = o || {};
  const queue = (opts.beats || []).slice();
  let calls = 0;
  return {
    calls: () => calls,
    options: {
      engine: {
        rng: (s) => s,
        simulatePlan: () => { calls += 1; if (opts.simulate) opts.simulate(calls); return { rows: [{}] }; },
        aggregateMonteCarloRuns: (runs) => { if (opts.aggregate) opts.aggregate(); return { total: runs.length }; },
      },
      planFor: (n) => ({ assumptions: { runs: n } }),
      now: () => 0,
      yieldToPage: () => Promise.resolve(0),
      heartbeat: () => Promise.resolve(queue.length ? queue.shift() : 0),
      readHeap: opts.readHeap,
      isCancelled: opts.isCancelled,
      isHidden: opts.isHidden,
      protocol: Object.assign({ stages: [1], warmReps: 1, maxLagMs: 250, stageTimeBudgetMs: 1e9 }, opts.protocol || {}),
    },
  };
}

test('IR-04-R1 CONTROL: a long successful simulation still stops the run after its one attempt', async () => {
  const r = attemptRig({ beats: [600, 0] });
  const report = await core.runProtocol(r.options);
  assert.equal(r.calls(), 1);
  assert.match(report.stopped.reason, /blocked the page for 600 ms \(limit 250 ms\)/);
  assert.equal(report.stages[0].samples.length, 1);
  assert.deepEqual(report.stages[0].failedAttempts, []);
});

test('IR-04-R1: a long simulation that then throws is not retried -- the stop records the blocking and keeps the error', async () => {
  const r = attemptRig({ beats: [600], simulate: () => { throw new Error('failed after a stall'); } });
  const report = await core.runProtocol(r.options);
  assert.equal(r.calls(), 1, 'no second attempt after a stalled failure');
  assert.equal(report.completed, false);
  assert.deepEqual([report.stopped.stage, report.stopped.when], [1, 'during']);
  assert.match(report.stopped.reason, /blocked the page for 600 ms \(limit 250 ms\)/);
  const stage = report.stages[0];
  assert.deepEqual(stage.errors, ['failed after a stall'], 'the error text is kept');
  assert.equal(stage.samples.length, 0, 'a failed attempt is not a sample');
  assert.deepEqual(stage.failedAttempts.map((a) => [a.phase, a.error, a.simBlockedMs, a.blockedMs]), [['simulation', 'failed after a stall', 600, 600]]);
});

test('IR-04-R1: a stalled sample that fails at a later path starts no further sample', async () => {
  const r = attemptRig({ beats: [600], simulate: (n) => { if (n === 3) throw new Error('path 3 failed'); }, protocol: { stages: [5] } });
  const report = await core.runProtocol(r.options);
  assert.equal(r.calls(), 3, 'the attempt ended at the failing path, and no further sample began');
  assert.match(report.stopped.reason, /blocked the page for 600 ms/);
  assert.deepEqual(report.stages[0].errors, ['path 3 failed']);
});

test('IR-04-R1 CONTROL: a short transient error is still retried, and its attempt is recorded apart from the samples', async () => {
  const r = attemptRig({ beats: [1, 1, 1], simulate: (n) => { if (n === 1) throw new Error('transient'); } });
  const report = await core.runProtocol(r.options);
  assert.equal(report.completed, true, JSON.stringify(report.stopped));
  assert.equal(r.calls(), 2, 'one failed attempt, one retry');
  const stage = report.stages[0];
  assert.equal(stage.samples.length, 1);
  assert.equal(stage.warmSimMs.n, 1, 'the failed attempt adds nothing to the timing distributions');
  assert.deepEqual(stage.errors, ['transient']);
  assert.deepEqual(stage.failedAttempts.map((a) => [a.phase, a.blockedMs]), [['simulation', 1]]);
});

test('IR-04-R1 CONTROL: repeated short errors still stop on the error count, each attempt recorded', async () => {
  const r = attemptRig({ beats: [1, 1], simulate: () => { throw new Error('always'); } });
  const report = await core.runProtocol(r.options);
  assert.equal(r.calls(), 2);
  assert.match(report.stopped.reason, /repeated errors \(2 in a row\)/);
  assert.equal(report.stages[0].failedAttempts.length, 2);
});

test('IR-04-R1 CONTROL: a cancellation or backgrounding that arrives during a failed attempt is honoured -- no retry', async () => {
  for (const [label, key, reason] of [['cancellation', 'isCancelled', /^cancelled$/], ['backgrounding', 'isHidden', /left the foreground/]]) {
    let flag = false;
    const r = attemptRig({ beats: [1], simulate: () => { flag = true; throw new Error('failed during ' + label); }, [key]: () => flag });
    const report = await core.runProtocol(r.options);
    assert.equal(r.calls(), 1, label + ': no retry');
    assert.match(report.stopped.reason, reason, label);
  }
});

test('IR-04-R1: an attempt that fails before its heartbeat is armed reports blocking as unavailable, never zero, and throws nothing', async () => {
  const r = attemptRig({ beats: [600], readHeap: () => { throw new Error('heap read failed'); } });
  let report;
  await assert.doesNotReject(async () => { report = await core.runProtocol(r.options); });
  assert.equal(r.calls(), 0, 'the simulation never started');
  const stage = report.stages[0];
  assert.deepEqual(stage.failedAttempts.map((a) => [a.simBlockedMs, a.aggregateBlockedMs, a.blockedMs]), [[null, null, null], [null, null, null]]);
  assert.match(report.stopped.reason, /repeated errors/);
  assert.equal(stage.responsiveness.blockedMs, 'unavailable');
});

test('IR-04-R1: slow aggregation is evaluated through the same settle path, whether it succeeds or fails', async () => {
  const ok = attemptRig({ beats: [0, 600] });
  const okReport = await core.runProtocol(ok.options);
  assert.match(okReport.stopped.reason, /blocked the page for 600 ms/);
  assert.equal(okReport.stages[0].samples[0].aggregateBlockedMs, 600);

  const bad = attemptRig({ beats: [0, 600], aggregate: () => { throw new Error('aggregation failed'); } });
  const badReport = await core.runProtocol(bad.options);
  assert.equal(bad.calls(), 1, 'no retry after a stalled, failed aggregation');
  assert.match(badReport.stopped.reason, /blocked the page for 600 ms/);
  assert.equal(badReport.stages[0].samples.length, 0);
  assert.deepEqual(badReport.stages[0].failedAttempts.map((a) => [a.phase, a.error, a.aggregateBlockedMs, a.blockedMs]), [['aggregation', 'aggregation failed', 600, 600]]);
});

test('IR-04-R1: with real timers, a 600 ms stall that ends in an exception stops the run instead of retrying', async () => {
  let calls = 0;
  const report = await core.runProtocol(stallRig(0, 0, {}, () => {
    calls += 1;
    if (calls === 1) { busy(STALL_MS); throw new Error('failed after a real stall'); }
  }));
  assert.equal(calls, 1, 'no retry after the stalled failure');
  assert.equal(report.completed, false);
  assert.match(report.stopped.reason, /blocked the page for \d+ ms \(limit 250 ms\)/);
  assert.ok(report.stages[0].failedAttempts[0].simBlockedMs >= STALL_MS * 0.9, 'the heartbeat armed before the attempt spans it: ' + JSON.stringify(report.stages[0].failedAttempts));
});

test('10.8: the page records its identity -- commit, input hashes, whether they are the committed bytes -- and the generator refuses what it cannot do safely', () => {
  const id = GENERATED.identity;
  assert.equal(typeof id.boundary.qualified, 'boolean');
  assert.deepEqual(Object.keys(id.inputHashes), gen.inputFiles(ROOT));
  Object.entries(id.inputHashes).forEach(([f, h]) => assert.equal(h, crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex'), f));
  assert.ok(id.inputHashes['src/engine.js'] && id.inputHashes['tools/device-benchmark-core.js'] && id.inputHashes['src/debt-amortization.js']);
  assert.equal(id.contentSha256, crypto.createHash('sha256').update(JSON.stringify(GENERATED.embedded)).digest('hex'));

  assert.throws(() => gen.assertInlineSafe('x', 'var a = "</script>";'), /cannot be inlined/);
  assert.throws(() => gen.extractFunction('function a(){} function a(){}', 'a'), /exactly once/);
  assert.throws(() => gen.parseArgs(['--stages', '10']), /--out/);
  assert.throws(() => gen.parseArgs(['--out', 'x.html', '--stages', '10,0']), /positive integers/);
  // IR-04 follow-up (the owner, 2026-09-13): a phone page needs its own stall limit, set at generation.
  assert.equal(gen.parseArgs(['--out', 'x.html', '--max-lag-ms', '5000']).protocol.maxLagMs, 5000);
  assert.throws(() => gen.parseArgs(['--out', 'x.html', '--max-lag-ms', '0']), /positive integers/);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build-device-benchmark.js')], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--out <file\.html> is required/);
});
