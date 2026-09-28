'use strict';

/*
 * S3 task 3b -- Worker / main-thread output parity, against the REAL build.
 *
 * THE GAP. The app carries two independently-assembled copies of the engine:
 * the main thread's inlined source, and the Worker's, reconstructed via
 * fn.toString() from a hand-maintained 81-entry `workerFunctions` array plus
 * build.js's __debtModulesFactory. Nothing asserted they produce the same
 * numbers. Q15 is the worked example of what that permits, and it took an
 * auditor EXECUTING the proposed fix to discover the fix did not work.
 *
 * WHY runScenario ON BOTH SIDES. The Worker's self.onmessage calls
 * runScenario(), and so does the main thread's own no-worker fallback
 * (runPlansBackground -> plans.map(runScenario) when canUseWorkers() is
 * false). Comparing the same entry point is what makes a difference mean
 * "the two assemblies disagree" rather than "these are different functions".
 *
 * It also buys the thing that actually catches divergence. runScenario
 * returns 17 top-level keys to runPlan's 16; the extra is `identity`, and
 * identity carries inputHash, dataPackageHash, featureFlags, randomSeed and
 * engineVersion -- all deterministic, and all exactly what a real divergence
 * would move. Excluding the whole `identity` subtree would throw that away.
 * So exactly ONE LEAF is excluded: identity.runId, which is seeded from
 * Date.now() + Math.random() and is the only field that differs between two
 * runScenario() calls on identical input (measured, not assumed).
 *
 * The 16 non-identity fields are ALSO compared against runPlan() directly,
 * which is the entry point tools/capture-baseline.js captures. That ties this
 * test to the baseline the S3 refactor is measured against: if the Worker and
 * the capture ever disagreed, the refactor's bit-identity proof would be
 * measuring something the app does not run.
 *
 * REALM NOTE. Values crossing a vm boundary carry that realm's Array/Object
 * prototypes, so assert.deepStrictEqual reports differences between
 * structurally identical values. This project has hit that twice. Comparison
 * here goes through hashOf(canonical(...)) -- a string compare -- with
 * differences() used only to build the failure message.
 *
 * GROUND RULE 2: tests/lib/worker-source.js builds to a scratch path.
 * investment-calculator-v2c.html is stale by design and is never rebuilt.
 * GROUND RULE 6 (criterion 6): this file does NOT use tests/lib/harness.js,
 * which deliberately loads the stale shipped artifact. Nothing here is an
 * artifact test, and a stale-artifact pass would not speak for current source.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  corpus, canonical, hashOf, differences, FIELD_COUNTS, fieldCountsFor, installDebtModules,
  assignOwn,
} = require('../tools/capture-baseline.js');
const { liveWorkerSource, postToWorker, cleanup } = require('./lib/worker-source.js');

/** The ONLY field excluded from the parity comparison. One leaf, not a subtree. */
const EXCLUDED_LEAVES = ['identity.runId'];

const ROOT = path.join(__dirname, '..');

function loadEngine() {
  const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
  const m = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
  global.RULES = JSON.parse(m[1]);
  installDebtModules();
  return require('../src/engine.js');
}

const engine = loadEngine();
const clonePlan = (p) => JSON.parse(JSON.stringify(p));

/*
 * S3-05. These pipelines used to normalise with JSON.parse(JSON.stringify(x))
 * BEFORE handing the value to canonical(), which destroys exactly the values
 * canonical() exists to encode:
 *
 *   NaN        -> null        +Infinity -> null
 *   -Infinity  -> null        -0        -> 0
 *
 * So the two results being compared were made equal by the comparison itself.
 * A Worker returning NaN where the engine returned null compared as identical,
 * in a test whose entire job is to prove the two agree.
 *
 * The round trip was really buying ONE thing: cross-realm safety. A value that
 * came out of the VM has a different Object prototype, which breaks
 * deepStrictEqual. A structural walk gives that without touching the numeric
 * domain -- Array.isArray is cross-realm safe, and everything else is copied
 * by key. Primitives pass through verbatim, NaN and -0 included, and a key
 * whose value is `undefined` stays PRESENT, so missing and null remain
 * distinguishable.
 */
/* RP-04: `out[k] = ...` LOSES AN OWN KEY NAMED __proto__, and this is the
 * fourth copy of that mistake in this repository.
 *
 * `__proto__` is the one inherited accessor on Object.prototype, so plain
 * assignment runs a setter and creates no own property. Measured through the
 * real fingerprint() pipeline: a row carrying the own JSON property
 * "__proto__":{"financial":50000} and a row without it produced the SAME hash,
 * and Object.hasOwn() confirmed the property was gone after cloning.
 *
 * This is a harness-domain witness, not a claim that model rows carry that key.
 * The problem is an instrument built to detect differences silently erasing
 * one -- the same reason EXT-02 mattered in the diff index.
 *
 * CL-01 fixed this in the engine's duplicate detector, EXT-02 in the snapshot
 * index, CL-03 in the capture clone. It reappeared here because each fix wrote
 * its own local guard. assignOwn() is imported from the capture tool now rather
 * than reimplemented, so the next copy of this walk cannot drift away from the
 * repair again -- which is exactly what the audit asked for when it said to
 * consolidate clone semantics across the parity and capture paths. */
function structuralClone(v) {
  if (Array.isArray(v)) return v.map(structuralClone);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) assignOwn(out, k, structuralClone(v[k]));
    return out;
  }
  return v;
}

/** Drop exactly the excluded leaves. Works on a cross-realm value. */
function withoutExcluded(result) {
  const copy = structuralClone(result);
  EXCLUDED_LEAVES.forEach((dotted) => {
    const parts = dotted.split('.');
    let node = copy;
    for (let i = 0; i < parts.length - 1 && node; i++) node = node[parts[i]];
    if (node) delete node[parts[parts.length - 1]];
  });
  return copy;
}

const fingerprint = (result) => hashOf(canonical(withoutExcluded(result)));

/* One VM context per test file rather than one per scenario. The worker source
   is ~250KB and evaluating it 33 times is the whole cost of this sweep. The
   contract exercised is still the real one -- self.onmessage in, self.postMessage
   out -- because that is what postToWorker() drives. */
let sharedSource = null;
async function workerRun(plan) {
  sharedSource = sharedSource || await liveWorkerSource();
  const message = postToWorker(sharedSource, plan);
  assert.equal(message.error, undefined,
    'the real built worker threw on a corpus scenario:\n    ' + String(message.error).split('\n')[0]);
  return message.result;
}

test.after(() => cleanup());

// ---------------------------------------------------------------------------
// The exclusion list itself -- criterion 4
// ---------------------------------------------------------------------------

test('worker parity: exactly one leaf is excluded, and it is not the identity subtree', () => {
  assert.deepEqual(EXCLUDED_LEAVES, ['identity.runId'],
    'excluding the whole identity subtree would discard inputHash, dataPackageHash, featureFlags, ' +
    'randomSeed and engineVersion -- the 12 deterministic fields that are exactly what a real ' +
    'Worker/main-thread divergence would move. A test that quietly widened this would look like ' +
    'it was passing.');
  assert.equal(EXCLUDED_LEAVES.length, 1);
  assert.ok(!EXCLUDED_LEAVES.includes('identity'), 'the subtree must never be excluded wholesale');
});

test('worker parity: identity has the expected shape, and only runId is nondeterministic', () => {
  const plan = clonePlan(corpus()[0].plan);
  const a = engine.runScenario(clonePlan(plan));
  const b = engine.runScenario(clonePlan(plan));
  assert.equal(Object.keys(a.identity).length, FIELD_COUNTS.identity,
    'identity gained or lost a field; FIELD_COUNTS lives in tools/capture-baseline.js and is the ' +
    'one place this figure is defined');
  const differing = Object.keys(a.identity)
    .filter((k) => JSON.stringify(a.identity[k]) !== JSON.stringify(b.identity[k]));
  assert.deepEqual(differing, ['runId'],
    'the exclusion list is justified by this measurement. If another field became ' +
    'nondeterministic, the fix is to that field, not to the list.');
  assert.equal(Object.keys(a.identity).length - EXCLUDED_LEAVES.length, 12,
    '12 identity fields must remain under comparison');
});

// ---------------------------------------------------------------------------
// Parity over the WHOLE corpus -- criteria 2 and 3
// ---------------------------------------------------------------------------

test('worker parity: the corpus reaches all three modes and both guarded classes', () => {
  const entries = corpus();
  const modes = {};
  entries.forEach((e) => {
    const m = e.plan.assumptions.method;
    modes[m] = (modes[m] || 0) + 1;
  });
  ['simple', 'monteCarlo', 'historical'].forEach((m) => {
    assert.ok(modes[m] > 0, 'parity must cross the Worker boundary in ' + m + ' mode');
  });

  /* Re-audit section 5 item 4 names these two classes specifically. They are
     in the SHARED corpus rather than local to this file so the same scenarios
     are also in the baseline capture -- one definition, and task 5 gets a
     before/after on the same plans this test proves parity for. */
  const armFlagOn = entries.filter((e) =>
    e.plan.advanced.armRecastOnReset === true &&
    (e.plan.advanced.debts || []).some((d) => d.rateType === 'adjustable'));
  assert.ok(armFlagOn.length > 0,
    'a flag-on ARM scenario must cross the Worker boundary permanently -- this is the exact case ' +
    'that produced ReferenceError: DebtAmortization is not defined in the old test helper');

  const ids = new Set();
  entries.forEach((e) => (e.plan.accounts || []).forEach((a) => ids.add(a.id)));
  assert.ok(ids.has('household-cash') && ids.has('rmd-retained-cash'),
    'the new-retention scenarios must cross the boundary too');
});

test('worker parity: every corpus scenario agrees between Node and the real built Worker', async () => {
  const entries = corpus();
  assert.ok(entries.length >= 30, 'precondition: expected the full corpus, got ' + entries.length);

  const mismatches = [];
  for (const { name, plan } of entries) {
    const viaNode = engine.runScenario(clonePlan(plan));
    const viaWorker = await workerRun(clonePlan(plan));
    if (fingerprint(viaNode) === fingerprint(viaWorker)) continue;
    const diffs = differences(
      canonical(withoutExcluded(viaNode)), canonical(withoutExcluded(viaWorker)), '');
    mismatches.push(name + ' -- ' + diffs.length + ' field(s), first: ' +
      (diffs[0] ? diffs[0].path + ': ' + JSON.stringify(diffs[0].before) + ' -> ' +
        JSON.stringify(diffs[0].after) : '(none located)'));
  }

  assert.deepEqual(mismatches, [],
    'the Worker and the main thread computed DIFFERENT numbers for these scenarios. The two are ' +
    'independently assembled -- the main thread inlines src/engine.js, the Worker reconstructs it ' +
    'from a hand-maintained workerFunctions array via toString() -- so a divergence here means a ' +
    'real user gets one answer with Workers available and another without:\n  ' +
    mismatches.join('\n  '));
});

test('worker parity: the Worker also agrees with runPlan, which is what the baseline captures', async () => {
  const entries = corpus();
  const mismatches = [];
  for (const { name, plan } of entries) {
    const viaPlan = engine.runPlan(clonePlan(plan));
    const viaWorker = await workerRun(clonePlan(plan));
    /* runScenario is runPlan plus identity, so dropping identity entirely
       makes the two shapes comparable. This is a DIFFERENT assertion from the
       one above: it ties the Worker to the entry point
       tools/capture-baseline.js captures, so the refactor's bit-identity proof
       cannot end up measuring something the app does not run. */
    const workerCore = structuralClone(viaWorker);   /* S3-05: non-destructive */
    delete workerCore.identity;
    /* Per mode. monteCarlo returns 18 top-level keys, not 16 -- it swaps
       calculationErrorAge for calculationErrorPaths and adds
       requestedPathCount and validPathCount. This assertion is what found
       that: FIELD_COUNTS was a single scalar pair measured on one `simple`
       scenario, and reported `golden:monte-carlo-fixed-seed: 18 !== 16`. */
    assert.equal(Object.keys(workerCore).length,
      fieldCountsFor(plan.assumptions.method).topLevel,
      name + ': worker result minus identity should have runPlan shape for its mode');
    if (hashOf(canonical(viaPlan)) !== hashOf(canonical(workerCore))) {
      const diffs = differences(canonical(viaPlan), canonical(workerCore), '');
      mismatches.push(name + ' -- ' + diffs.length + ' field(s), first: ' +
        (diffs[0] ? diffs[0].path : '(none located)'));
    }
  }
  assert.deepEqual(mismatches, [],
    'the Worker disagrees with runPlan(), which is the function the baseline capture records. ' +
    'The baseline would then be certifying behaviour the shipped Worker does not have:\n  ' +
    mismatches.join('\n  '));
});

// ---------------------------------------------------------------------------
// Criterion 5 -- the detection power is PROVEN, and the proof is permanent
// ---------------------------------------------------------------------------

/*
 * The whole point of this file is to catch a helper that the engine calls but
 * `workerFunctions` does not list -- the Q15 / Q20 failure mode. Demonstrating
 * that once by hand and deleting it leaves a test nobody can re-verify.
 *
 * So the mechanism is exercised against a FIXTURE engine, not the real one.
 * Ground rule 9 reserves src/engine.js for task 5, and adding a temporary
 * helper to it would be an engine edit; more importantly, a fixture can carry
 * a defect deliberately and permanently, which the real engine cannot.
 *
 * The fixture reproduces buildWorkerSource()'s assembly exactly: map every
 * listed function through toString(), join, append a self.onmessage that calls
 * the entry point. Nothing else about it needs to be realistic.
 */
function assembleFixtureWorker(listedFunctions) {
  return '"use strict";\n' +
    listedFunctions.map((fn) => fn.toString()).join('\n') +
    '\nself.onmessage=function(event){try{self.postMessage({id:event.data.id,' +
    'result:fixtureEntry(event.data.plan)})}catch(error){self.postMessage(' +
    '{id:event.data.id,error:String(error&&error.stack||error)})}};';
}

function runFixtureWorker(source, plan) {
  const messages = [];
  const ctx = vm.createContext({ self: { postMessage: (d) => messages.push(d) } });
  vm.runInContext(source, ctx);
  ctx.self.onmessage({ data: { id: 1, plan } });
  return messages[0];
}

/* eslint-disable no-unused-vars */
function fixtureHelper(n) { return n * 2; }
function fixtureEntry(plan) { return { total: fixtureHelper(plan.amount) }; }
/* eslint-enable no-unused-vars */

test('worker parity: the MECHANISM catches a helper that is called but not registered', () => {
  const plan = { amount: 21 };

  // CONTROL, first: with the helper registered, the fixture worker computes.
  const complete = runFixtureWorker(
    assembleFixtureWorker([fixtureHelper, fixtureEntry]), plan);
  assert.equal(complete.error, undefined,
    'CONTROL: a fully-registered fixture must succeed, or the harness below proves nothing');
  assert.deepEqual(structuralClone(complete.result), { total: 42 });

  // Now drop the helper from the registry, exactly as an author would by
  // forgetting to add it -- the function still exists and is still called.
  const incomplete = runFixtureWorker(assembleFixtureWorker([fixtureEntry]), plan);
  assert.ok(incomplete.error,
    'an unregistered helper must make the assembled worker fail. If this passes, the parity ' +
    'mechanism cannot see the Q15/Q20 defect class at all and this whole file is decorative.');
  assert.match(String(incomplete.error), /fixtureHelper is not defined/,
    'expected ReferenceError naming the unregistered helper; got: ' + incomplete.error);
});

test('worker parity: the mechanism catches a helper that is registered but computes DIFFERENTLY', () => {
  /* The harder half of the same class, and the one a ReferenceError check
     misses entirely. A registered function that diverges produces no error at
     all -- it produces a WRONG NUMBER, silently, on the Worker path only.
     Parity comparison is the only thing that sees it. */
  const plan = { amount: 21 };
  function driftedHelper(n) { return n * 3; } // the "other copy", out of step
  const drifted = 'function fixtureHelper(n){return ' + String(3) + '*n;}\n';

  const source = '"use strict";\n' + drifted + fixtureEntry.toString() +
    '\nself.onmessage=function(event){self.postMessage({id:event.data.id,' +
    'result:fixtureEntry(event.data.plan)})};';
  const viaWorker = runFixtureWorker(source, plan);
  const viaMain = fixtureEntry(plan);

  assert.equal(viaWorker.error, undefined, 'a drifted-but-present helper does NOT throw -- that is the point');
  assert.notEqual(
    hashOf(canonical(structuralClone(viaWorker.result))),
    hashOf(canonical(viaMain)),
    'the comparison must report a difference: ' + JSON.stringify(viaWorker.result) +
    ' vs ' + JSON.stringify(viaMain));
  assert.equal(driftedHelper(21), 63, 'sanity: the drifted copy really does compute differently');
});

// ---------------------------------------------------------------------------
// S3-05 -- the comparison must not make the two sides equal
//
// Both pipelines normalised with JSON.parse(JSON.stringify(x)) before
// canonical(), which maps NaN and both infinities to null and -0 to 0. A
// Worker returning NaN where the engine returned null therefore compared as
// IDENTICAL, in the test whose whole job is to prove they agree.
//
// Driven through fingerprint() -- the real comparison the sweep uses -- and in
// BOTH directions, because the card is explicit that one direction could
// escape both pipelines.
// ---------------------------------------------------------------------------

const s305Result = (total) => ({
  rows: [{ age: 65, total }],
  identity: { runId: 'nondeterministic-and-excluded' },
});

test('S3-05: values JSON would have flattened are distinguished, in both directions', () => {
  const pairs = [
    ['NaN', NaN, 'null', null],
    ['+Infinity', Infinity, 'null', null],
    ['-Infinity', -Infinity, 'null', null],
    ['negative zero', -0, 'positive zero', 0],
    ['NaN', NaN, '+Infinity', Infinity],
    ['+Infinity', Infinity, '-Infinity', -Infinity],
  ];

  for (const [aName, a, bName, b] of pairs) {
    const fa = fingerprint(s305Result(a));
    const fb = fingerprint(s305Result(b));
    assert.notEqual(fa, fb,
      aName + ' and ' + bName + ' must not fingerprint alike -- JSON round-tripping made them equal');
    /* Both directions: the comparison must be symmetric, and a pipeline that
       only catches one ordering is the failure mode the card names. */
    assert.notEqual(fingerprint(s305Result(b)), fingerprint(s305Result(a)));
  }
});

test('S3-05: a missing field and a null field remain different', () => {
  const missing = { rows: [{ age: 65 }], identity: { runId: 'x' } };
  const explicitNull = { rows: [{ age: 65, total: null }], identity: { runId: 'x' } };
  assert.notEqual(fingerprint(missing), fingerprint(explicitNull),
    'JSON.stringify drops an undefined value and keeps a null one, so the two used to converge');
});

test('S3-05: the ordinary cases still work -- identical results match, one cent does not', () => {
  /* CONTROL. A comparison that reports everything as different is as useless
     as one that reports everything as the same. */
  assert.equal(fingerprint(s305Result(1000)), fingerprint(s305Result(1000)),
    'identical finite results must still compare equal');

  /* And the excluded leaf is still excluded, or the sweep would report every
     scenario as a mismatch on runId alone. */
  const a = s305Result(1000);
  const b = s305Result(1000);
  b.identity.runId = 'a-completely-different-run-id';
  assert.equal(fingerprint(a), fingerprint(b),
    'identity.runId is the one excluded leaf and must stay excluded');

  /* One cent still moves the fingerprint. */
  assert.notEqual(fingerprint(s305Result(1000)), fingerprint(s305Result(1000.01)),
    'a one-cent finite difference must still be detected');
});

test('S3-05: structuralClone preserves the numeric domain and cross-realm shape', () => {
  const source = {
    nan: NaN, posInf: Infinity, negInf: -Infinity, negZero: -0, posZero: 0,
    nested: { arr: [NaN, -0, 1.5, null] }, undef: undefined, nul: null,
  };
  const copy = structuralClone(source);

  assert.ok(Number.isNaN(copy.nan), 'NaN must survive');
  assert.equal(copy.posInf, Infinity);
  assert.equal(copy.negInf, -Infinity);
  assert.ok(Object.is(copy.negZero, -0), 'negative zero must survive as negative zero');
  assert.ok(Object.is(copy.posZero, 0));
  assert.ok(Number.isNaN(copy.nested.arr[0]), 'and through nesting');
  assert.ok(Object.is(copy.nested.arr[1], -0));
  assert.equal(copy.nested.arr[3], null);

  /* Presence, not just value: JSON drops an undefined-valued key entirely. */
  assert.ok(Object.prototype.hasOwnProperty.call(copy, 'undef'),
    'a key whose value is undefined must stay PRESENT, or missing and null converge');
  assert.equal(copy.nul, null);

  /* It is a copy, not the same object -- the exclusion step mutates it. */
  assert.notEqual(copy, source);
  assert.notEqual(copy.nested, source.nested);
});

test('S3-05: the VM realm is still handled without a JSON round trip', () => {
  /* The property the JSON trip was really buying. A value built inside a vm
     context carries that realm's prototypes; the clone must return a
     this-realm object so the comparison works -- and must do it without
     flattening NaN, which is what the round trip cost. */
  const ctx = vm.createContext({});
  const fromVm = vm.runInContext('({ total: NaN, rows: [{ age: 65, v: -0 }] })', ctx);

  assert.notEqual(Object.getPrototypeOf(fromVm), Object.prototype,
    'precondition: the value really is cross-realm, or this test proves nothing');

  const copy = structuralClone(fromVm);
  assert.equal(Object.getPrototypeOf(copy), Object.prototype, 'the clone must be a this-realm object');
  assert.ok(Array.isArray(copy.rows), 'Array.isArray is cross-realm safe and must have been used');
  assert.ok(Number.isNaN(copy.total), 'and NaN must have survived the crossing');
  assert.ok(Object.is(copy.rows[0].v, -0));
});
