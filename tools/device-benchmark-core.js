/*
 * S4 task 10 -- the device benchmark's measurement core.
 *
 * Pure logic over an engine handle and injected environment functions, so
 * exactly this code runs in Node (under test) and inline in the self-contained
 * page that tools/build-device-benchmark.js writes. No require and no Node API:
 * whatever the environment offers is passed in, and whatever it does not offer
 * is reported as unavailable rather than guessed.
 *
 * WHAT IT MEASURES. The Monte Carlo workload as tools/bench-simulation.js does --
 * simulatePlan() per path with runPlan()'s own generator derivation, then
 * aggregateMonteCarloRuns() -- over a staged list of path counts. Since S5 block 2n
 * each direct simulatePlan() call also runs the input gates, which runPlan() runs
 * once per plan, so the per-path cost reported here is an upper bound on
 * runPlan()'s own: at most about 12% of a short path above it, as measured
 * before the change.
 *
 * WHAT IT REPORTS, per stage (10.2, 10.8):
 *   - a COLD sample kept apart from the WARMED repetitions, with distributions;
 *   - wall time split into simulation and aggregation, and the per-path cost curve;
 *   - heap with the paths still referenced, from whatever telemetry exists, and
 *     "unavailable" where none does;
 *   - CORRECTNESS twice over: every repetition must produce the same aggregate
 *     fingerprint, and the fingerprint is compared with the one Node computed
 *     for the same plan, seed and path count;
 *   - responsiveness, two ways kept apart: how late a zero-delay timer fired
 *     BEFORE each sample (the page going in), and how long the sample BLOCKED
 *     the page, from a heartbeat armed before simulation and another before
 *     aggregation (S4-IR-04). Until then only the first was measured, and it
 *     fired before the work began, so it never saw a stall. A main-thread timer
 *     can witness a stall; it cannot interrupt one.
 *
 * WHAT IT DOES NOT DO. It proposes no tier and proves no JIT discard. A rise in
 * per-path cost is reported as a CANDIDATE signature only (S4-PA-14).
 *
 * THE STOP POLICY IS BOUNDED (10.8). It stops before a stage predicted to exceed
 * the time budget, after repeated errors, when responsiveness is lost, when the
 * page leaves the foreground, or on cancellation -- and records which.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DeviceBenchmarkCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA = 'device-benchmark/1';

  const DEFAULT_PROTOCOL = Object.freeze({
    stages: [100, 250, 500, 1000, 2500, 5000],
    warmReps: 3,
    seed: 123456,
    stageTimeBudgetMs: 20000,
    maxConsecutiveErrors: 2,
    maxLagMs: 1000,
    superlinearRatio: 1.5,
  });

  const CAVEATS = Object.freeze([
    'Measurements, not verdicts: no tier threshold is set, revised or proposed here.',
    'A rise in per-path elapsed time is a CANDIDATE JIT-discard signature, never proof of one (S4-PA-14). Read it beside heap telemetry; where telemetry is unavailable, the cause cannot be attributed.',
    'Heap figures from performance.memory are not retained heap: a page cannot force a collection, so they include garbage not yet swept, and Chromium quantizes them. Only a precise memory API reading is labelled precise.',
    'No figure here is a calibrated pressure measurement, and no percentage of a conjectured memory ceiling is inferred from one (S4-PA-14).',
    'A reference mismatch means this JavaScript engine produced a different aggregate from Node for the same plan, seed and path count. It is recorded, not judged.',
    'Benchmark evidence stays out of financial snapshots: this page stores nothing.',
    'Main thread only: the calculator runs Monte Carlo in a Worker, this page does not, and its Worker count is recorded as 0.',
    'Responsiveness is witnessed, not protected: a heartbeat armed before the work reports how long a sample blocked the page, and the run stops before the next sample when that passes the limit -- but a main-thread timer cannot interrupt a sample already running. Interrupting one would need the work in a Worker, a separate design decision.',
  ]);

  /* FNV-1a, 32 bit, over JSON text: JSON number formatting is specified, so
     identical doubles give identical text in every engine. */
  function fingerprint(value) {
    const text = JSON.stringify(value);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  function summarize(values) {
    const numbers = values.filter(function (v) { return typeof v === 'number' && isFinite(v); });
    if (!numbers.length) return { n: 0, min: null, median: null, max: null, samples: [] };
    const sorted = numbers.slice().sort(function (a, b) { return a - b; });
    const mid = Math.floor(sorted.length / 2);
    return {
      n: sorted.length,
      min: sorted[0],
      median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
      max: sorted[sorted.length - 1],
      samples: numbers,
    };
  }

  /* A synchronous heap reading from whatever the page exposes. */
  function heapReading(perf) {
    const mem = perf && perf.memory;
    if (mem && typeof mem.usedJSHeapSize === 'number') {
      return { source: 'performance.memory', precise: false, bytes: mem.usedJSHeapSize, limitBytes: typeof mem.jsHeapSizeLimit === 'number' ? mem.jsHeapSizeLimit : null };
    }
    return { source: 'unavailable', precise: false, bytes: null };
  }

  function attempt(fn) {
    try {
      return Promise.resolve(fn()).catch(function (e) { return 'error: ' + String((e && e.message) || e); });
    } catch (e) {
      return Promise.resolve('error: ' + String((e && e.message) || e));
    }
  }

  /* 10.2 / 10.8: the device facts a browser will state, each one or "unavailable". */
  function collectEnvironment(nav, perf, win) {
    const n = nav || {};
    const w = win || {};
    const uaData = n.userAgentData;
    const highEntropy = uaData && typeof uaData.getHighEntropyValues === 'function'
      ? attempt(function () { return uaData.getHighEntropyValues(['platform', 'platformVersion', 'model', 'mobile', 'architecture', 'fullVersionList']); })
      : Promise.resolve('unavailable');
    const webgpu = n.gpu && typeof n.gpu.requestAdapter === 'function'
      ? attempt(function () {
        return n.gpu.requestAdapter().then(function (adapter) {
          if (!adapter) return { available: true, adapter: 'none returned' };
          const info = adapter.info || {};
          return { available: true, adapter: { vendor: info.vendor || '', architecture: info.architecture || '', device: info.device || '', description: info.description || '' } };
        });
      })
      : Promise.resolve({ available: false });
    return Promise.all([highEntropy, webgpu]).then(function (got) {
      return {
        userAgent: n.userAgent || 'unavailable',
        userAgentData: got[0],
        hardwareConcurrency: typeof n.hardwareConcurrency === 'number' ? n.hardwareConcurrency : 'unavailable',
        deviceMemoryGiB: typeof n.deviceMemory === 'number' ? n.deviceMemory : 'unavailable',
        webgpu: got[1],
        heapTelemetry: heapReading(perf).source,
        preciseMemoryApi: Boolean(w.crossOriginIsolated && perf && typeof perf.measureUserAgentSpecificMemory === 'function'),
        crossOriginIsolated: typeof w.crossOriginIsolated === 'boolean' ? w.crossOriginIsolated : 'unavailable',
      };
    });
  }

  /* runPlan()'s per-path derivation: rng(monteCarloPathSeed(seed, i, 0)) for returns, rng(monteCarloPathSeed(seed, i, 1)) for the LTC draw
     (S5AA R43, SA42F-31; it was seed + 2i and seed + 2i + 1). */
  function simulatePaths(engine, plan, pathCount, seed, now) {
    let base = Number(seed);
    if (!isFinite(base)) base = 0;
    const runs = new Array(pathCount);
    const t0 = now();
    for (let i = 0; i < pathCount; i++) {
      runs[i] = engine.simulatePlan(plan, engine.rng(engine.monteCarloPathSeed(base, i, 0)), 0, engine.rng(engine.monteCarloPathSeed(base, i, 1)), null);
    }
    return { runs: runs, simMs: now() - t0, rowsPerPath: runs[0] && runs[0].rows ? runs[0].rows.length : 0 };
  }

  function aggregatePaths(engine, runs, now) {
    const t0 = now();
    const aggregated = engine.aggregateMonteCarloRuns(runs);
    return { aggregateMs: now() - t0, fingerprint: fingerprint(aggregated) };
  }

  function runSample(engine, plan, pathCount, seed, now) {
    const sim = simulatePaths(engine, plan, pathCount, seed, now);
    const agg = aggregatePaths(engine, sim.runs, now);
    return { simMs: sim.simMs, aggregateMs: agg.aggregateMs, rowsPerPath: sim.rowsPerPath, fingerprint: agg.fingerprint };
  }

  /* 10.3: a candidate, never a verdict. */
  function candidateSignature(curve, ratio) {
    const points = curve.filter(function (c) { return typeof c.microsecondsPerPath === 'number' && c.microsecondsPerPath > 0; });
    if (points.length < 3) return { status: 'insufficient-stages', stages: points.length, caveat: CAVEATS[1] };
    const base = points[0].microsecondsPerPath;
    let first = null;
    for (let i = 1; i < points.length; i++) {
      if (points[i].microsecondsPerPath >= base * ratio) { first = points[i].pathCount; break; }
    }
    return {
      status: first === null ? 'not-observed' : 'CANDIDATE',
      firstStageAtOrAboveRatio: first,
      ratio: ratio,
      ratioAtLargestStage: points[points.length - 1].microsecondsPerPath / base,
      caveat: CAVEATS[1],
    };
  }

  /* 10.8: the bounded stop policy. A reason, or null to continue. */
  function stopReason(state, protocol) {
    if (state.cancelled) return 'cancelled';
    if (state.hidden) return 'the page left the foreground, where timers are throttled';
    if (state.consecutiveErrors >= protocol.maxConsecutiveErrors) return 'repeated errors (' + state.consecutiveErrors + ' in a row)';
    if (state.lastLagMs > protocol.maxLagMs) return 'lost responsiveness: a zero-delay timer fired ' + Math.round(state.lastLagMs) + ' ms late (limit ' + protocol.maxLagMs + ' ms)';
    if (state.lastBlockedMs > protocol.maxLagMs) return 'lost responsiveness: a sample blocked the page for ' + Math.round(state.lastBlockedMs) + ' ms (limit ' + protocol.maxLagMs + ' ms); a main-thread timer can witness a stall, not interrupt one';
    if (state.predictedNextMs > protocol.stageTimeBudgetMs) return 'the next stage is predicted to take ' + Math.round(state.predictedNextMs) + ' ms, over the ' + protocol.stageTimeBudgetMs + ' ms budget';
    return null;
  }

  function stageSummary(stage, protocol, reference) {
    const ok = stage.samples;
    const cold = ok.filter(function (s) { return s.kind === 'cold'; })[0] || null;
    const warm = ok.filter(function (s) { return s.kind === 'warm'; });
    const pick = function (list, key) { return list.map(function (s) { return s[key]; }); };
    const warmSim = summarize(pick(warm, 'simMs'));
    const warmAgg = summarize(pick(warm, 'aggregateMs'));
    const simBasis = warmSim.n ? warmSim.median : (cold ? cold.simMs : null);
    const aggBasis = warmAgg.n ? warmAgg.median : (cold ? cold.aggregateMs : null);
    const deltas = ok.map(function (s) {
      return s.heapBefore.source === s.heapWithRuns.source && typeof s.heapBefore.bytes === 'number' && typeof s.heapWithRuns.bytes === 'number' ? s.heapWithRuns.bytes - s.heapBefore.bytes : null;
    });
    const heap = summarize(deltas);
    const blocked = summarize(pick(ok, 'blockedMs'));
    const prints = ok.map(function (s) { return s.fingerprint; });
    return {
      pathCount: stage.pathCount,
      rowsPerPath: ok.length ? ok[0].rowsPerPath : null,
      coldSimMs: cold ? cold.simMs : null,
      coldAggregateMs: cold ? cold.aggregateMs : null,
      warmSimMs: warmSim,
      warmAggregateMs: warmAgg,
      microsecondsPerPath: typeof simBasis === 'number' ? (simBasis * 1000) / stage.pathCount : null,
      heapWithPathsReferenced: heap.n
        ? { source: ok[0].heapWithRuns.source, precise: ok[0].heapWithRuns.precise, deltaBytes: heap, bytesPerPath: heap.median / stage.pathCount }
        : { source: 'unavailable' },
      consistency: !prints.length ? 'no samples' : prints.every(function (p) { return p === prints[0]; }) ? 'consistent' : 'INCONSISTENT',
      reference: !prints.length || !reference ? 'no reference' : prints.every(function (p) { return p === reference; }) ? 'matches' : 'DIFFERS',
      responsiveness: {
        preSampleLagMs: summarize(pick(ok, 'lagMs')),
        blockedMs: blocked.n ? blocked : 'unavailable',
      },
      completedSamples: ok.length,
      plannedSamples: protocol.warmReps + 1,
      errors: stage.errors,
      failedAttempts: stage.failedAttempts || [],
      samples: ok,
      nextStageCostPerPathMs: typeof simBasis === 'number' && typeof aggBasis === 'number' ? (simBasis + aggBasis) / stage.pathCount : null,
    };
  }

  /*
   * The run. options:
   *   engine          { simulatePlan, rng, monteCarloPathSeed, aggregateMonteCarloRuns }
   *   planFor(n)      a fresh Monte Carlo plan with n paths
   *   protocol        overrides of DEFAULT_PROTOCOL
   *   references      { [pathCount]: the Node aggregate fingerprint }
   *   environment     facts from collectEnvironment plus the operator's record
   *   identity        which artifact is running
   *   now()           a monotonic clock, ms
   *   yieldToPage()   resolves to how late a zero-delay timer fired, ms
   *   heartbeat()     optional: the same kind of timer, ARMED before synchronous work
   *                   and read after it, so its lateness spans the work. Without it,
   *                   blocking is reported as unavailable, never as zero
   *   readHeap()      a synchronous heapReading
   *   measurePrecise  optional: resolves to a precise reading, used in place of readHeap
   *                   while the paths are still referenced
   *   isCancelled(), isHidden(), onProgress(stageSummary)
   */
  function runProtocol(options) {
    const protocol = Object.assign({}, DEFAULT_PROTOCOL, options.protocol || {});
    const references = options.references || {};
    const readHeap = options.readHeap || function () { return heapReading(null); };
    const report = {
      schema: SCHEMA,
      protocol: protocol,
      environment: options.environment || {},
      identity: options.identity || null,
      execution: { thread: 'main', workerCount: 0 },
      stages: [],
      stopped: null,
      completed: false,
      elapsedMs: null,
      signature: null,
      caveats: CAVEATS.slice(),
    };
    const state = { cancelled: false, hidden: false, consecutiveErrors: 0, lastLagMs: 0, lastBlockedMs: 0, predictedNextMs: 0 };
    const heartbeat = options.heartbeat || function () { return null; };
    const poll = function () {
      state.cancelled = Boolean(options.isCancelled && options.isCancelled());
      state.hidden = Boolean(options.isHidden && options.isHidden());
    };
    const started = options.now();

    function finish() {
      report.signature = candidateSignature(report.stages, protocol.superlinearRatio);
      report.completed = !report.stopped;
      report.elapsedMs = options.now() - started;
      return report;
    }

    function sample(stage, rep) {
      if (rep > protocol.warmReps) return Promise.resolve();
      return options.yieldToPage().then(function (lag) {
        state.lastLagMs = lag;
        poll();
        if (state.cancelled || state.hidden || lag > protocol.maxLagMs) return undefined;
        let sim;
        let heapBefore;
        let simBeat = null;
        try {
          heapBefore = readHeap();
          // Armed BEFORE the synchronous work, so it cannot fire until the work ends.
          simBeat = arm();
          sim = simulatePaths(options.engine, options.planFor(stage.pathCount), stage.pathCount, protocol.seed, options.now);
        } catch (e) {
          // S4-IR-04-R1: a failed attempt settles exactly like a successful one. It
          // used to retry at once without reading the heartbeat armed above, so a
          // stall that ended in an exception never stopped the run.
          return settle(stage, rep, [simBeat, null], null, failure(stage, 'simulation', e, lag));
        }
        const heapWithRuns = options.measurePrecise ? Promise.resolve(options.measurePrecise()) : Promise.resolve(readHeap());
        return heapWithRuns.then(function (reading) {
          // A second heartbeat: the heap reading may yield, and the first could
          // then fire before a slow aggregation began.
          const aggBeat = arm();
          let taken = null;
          let failed = null;
          try {
            const agg = aggregatePaths(options.engine, sim.runs, options.now);
            taken = {
              kind: rep === 0 ? 'cold' : 'warm',
              simMs: sim.simMs,
              aggregateMs: agg.aggregateMs,
              rowsPerPath: sim.rowsPerPath,
              fingerprint: agg.fingerprint,
              lagMs: lag,
              simBlockedMs: null,
              aggregateBlockedMs: null,
              blockedMs: null,
              heapBefore: heapBefore,
              heapWithRuns: reading,
            };
            stage.samples.push(taken);
            state.consecutiveErrors = 0;
          } catch (e) {
            failed = failure(stage, 'aggregation', e, lag);
          }
          sim = null;
          return settle(stage, rep, [simBeat, aggBeat], taken, failed);
        });
      });
    }

    /* A heartbeat, or null when the environment offers none or it cannot be armed. */
    function arm() {
      try { return heartbeat(); } catch (e) { return null; }
    }

    /* An attempt that threw: its error is kept and counted, and it gets an attempt
       record whose timing settle() fills in. It is never added to the samples, so
       it never enters a timing distribution. */
    function failure(stage, phase, e, lag) {
      const message = String((e && e.message) || e);
      stage.errors.push(message);
      state.consecutiveErrors++;
      return { phase: phase, error: message, lagMs: lag, simBlockedMs: null, aggregateBlockedMs: null, blockedMs: null };
    }

    /* Every attempt ends here, whether it returned or threw (S4-IR-04-R1). Its
       heartbeats are read and its blocking recorded -- on its sample, or on the
       stage's failedAttempts -- and only then may another repetition begin, and
       only if no stop condition holds: the error count, a cancellation or
       backgrounding while it ran, or a stall past the limit. A heartbeat that was
       never armed, or that rejects, is unavailable, never zero. */
    function settle(stage, rep, beats, taken, failed) {
      const read = beats.map(function (b) { return Promise.resolve(b).then(null, function () { return null; }); });
      return Promise.all(read).then(function (b) {
        const measured = b.filter(function (v) { return typeof v === 'number'; });
        state.lastBlockedMs = measured.length ? Math.max.apply(null, measured) : 0;
        const timing = {
          simBlockedMs: typeof b[0] === 'number' ? b[0] : null,
          aggregateBlockedMs: typeof b[1] === 'number' ? b[1] : null,
          blockedMs: measured.length ? state.lastBlockedMs : null,
        };
        if (taken) Object.assign(taken, timing);
        if (failed) stage.failedAttempts.push(Object.assign(failed, timing));
        if (state.consecutiveErrors >= protocol.maxConsecutiveErrors) return undefined;
        poll();
        if (state.cancelled || state.hidden || state.lastBlockedMs > protocol.maxLagMs) return undefined;
        return sample(stage, rep + 1);
      });
    }

    /* A stop is recorded as BEFORE a stage that took no sample, and DURING one
       that took some -- whose partial summary is kept. A stage that took no
       sample is not reported as a stage. */
    function runStage(index) {
      if (index >= protocol.stages.length) return Promise.resolve(finish());
      poll();
      const pathCount = protocol.stages[index];
      const before = stopReason(state, protocol);
      if (before) {
        report.stopped = { stage: pathCount, when: 'before', reason: before };
        return Promise.resolve(finish());
      }
      const stage = { pathCount: pathCount, samples: [], errors: [], failedAttempts: [] };
      return sample(stage, 0).then(function () {
        const started = stage.samples.length > 0 || stage.errors.length > 0;
        const cut = stopReason(Object.assign({}, state, { predictedNextMs: 0 }), protocol);
        if (started) {
          const summary = stageSummary(stage, protocol, references[pathCount]);
          report.stages.push(summary);
          if (options.onProgress) options.onProgress(summary);
          const nextCount = protocol.stages[index + 1];
          state.predictedNextMs = nextCount && summary.nextStageCostPerPathMs !== null ? summary.nextStageCostPerPathMs * nextCount * (protocol.warmReps + 1) : 0;
        }
        if (cut) {
          report.stopped = { stage: pathCount, when: started ? 'during' : 'before', reason: cut };
          return finish();
        }
        return runStage(index + 1);
      });
    }
    return runStage(0);
  }

  return {
    SCHEMA: SCHEMA,
    DEFAULT_PROTOCOL: DEFAULT_PROTOCOL,
    CAVEATS: CAVEATS,
    fingerprint: fingerprint,
    summarize: summarize,
    heapReading: heapReading,
    collectEnvironment: collectEnvironment,
    simulatePaths: simulatePaths,
    aggregatePaths: aggregatePaths,
    runSample: runSample,
    candidateSignature: candidateSignature,
    stopReason: stopReason,
    stageSummary: stageSummary,
    runProtocol: runProtocol,
  };
}));
