'use strict';

/*
 * S4 task 3 -- the corpus invariant, observed doing its job.
 *
 * tools/corpus-invariant.js is the independent second measurement of a
 * capture (3.0, 3.0a, 3.0c, 3.7). This file qualifies it:
 *
 *   A. INDEPENDENCE, enforced from the code and by running with
 *      tools/capture-baseline.js made unloadable -- not asserted in a comment.
 *   B. POSITIVE CONTROLS: the real corpus, captured by the real CLI and read
 *      back from disk, passes every check, and says by name what it skipped.
 *   C. THE FOUR CHECKS OF 3.0c, each its own test, each failing on a defect of
 *      its class and passing its control.
 *   D. THE MUTATION MATRIX OF 3.7, each mutation with the observation 3.7
 *      requires and a positive control beside it, plus the task-3 gate items
 *      this instrument carries.
 *
 * This file may use tools/capture-baseline.js freely: it is the instrument
 * under measurement, and several witnesses need its own verdict as a premise
 * ("the capture tool calls these identical"). The INVARIANT may not.
 *
 * Independence protects the classes named in the invariant's header. None of
 * this is evidence that the model is right.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const INVARIANT = path.join(ROOT, 'tools', 'corpus-invariant.js');
const invariant = require('../tools/corpus-invariant.js');
const baseline = require('../tools/capture-baseline.js');
const { sentinelResults, SENTINEL_SPEC, SENTINEL_EXPECTATIONS } = require('./fixtures/corpus-sentinels.js');

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-invariant-'));
test.after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));

const CHECK_IDS = ['FORMAT', 'INVENTORY', 'ENCODING', 'NON-VACUOUS', 'SHAPE', 'INPUTS', 'ROUND-TRIP'];
const clone = (v) => JSON.parse(JSON.stringify(v));
let counter = 0;
const scratchFile = (label) => path.join(SCRATCH, label + '-' + (++counter) + '.json');
const checkOf = (result, id) => result.checks.find((c) => c.id === id);
const problemsOf = (result, id) => checkOf(result, id).problems;
const failing = (result) => result.checks.filter((c) => c.problems.length).map((c) => c.id);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/* The real corpus, captured ONCE by the real CLI and read back from disk. */
let realFile = null;
function realCapture() {
  if (!realFile) {
    realFile = path.join(SCRATCH, 'real-capture.json');
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'capture-baseline.js'), 'capture', realFile],
      { stdio: ['ignore', 'pipe', 'pipe'] });
  }
  return invariant.readSnapshot(realFile);
}

/* Plans and raw results, built once here exactly as run() would build them. */
let independent = null;
function independentRun() {
  if (!independent) {
    const spec = invariant.readSpec();
    const { plans, errors } = invariant.buildPlans(spec);
    independent = { spec, plans, errors, raw: invariant.runPlans(plans) };
  }
  return independent;
}

function runReal(snapshot, over = {}) {
  const ind = independentRun();
  return invariant.run(snapshot, Object.assign({ spec: ind.spec, plans: ind.plans, buildErrors: ind.errors, raw: ind.raw }, over));
}

/* A file's entry edited on disk, with its hashes rewritten to agree -- so the
   capture tool's own integrity pass sees nothing, and only an independent
   reading can. */
function mutateOnDisk(file, name, mutate) {
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entry = snap.entries.find((e) => e.name === name);
  assert.ok(entry, 'no entry named ' + name);
  mutate(entry.result, snap);
  entry.hash = baseline.hashForFormat(entry.result, 3);
  snap.meta.hash = baseline.hashOf(snap.entries.map((e) => [e.name, e.hash]));
  const out = scratchFile('mutated');
  fs.writeFileSync(out, JSON.stringify(snap, null, 2));
  const reread = invariant.readSnapshot(out);
  assert.deepEqual(baseline.verifyIntegrity(reread), [], 'premise: the hashes agree with the damage, so the capture tool reports nothing');
  return { file: out, snapshot: reread };
}

/* A sentinel capture: each hand-authored result through the capture tool's own
   captureEntry(), written exactly as its CLI writes a capture
   (JSON.stringify(snapshot, null, 2)), then READ BACK from disk. */
function sentinelCapture(mutateRaw) {
  const raws = sentinelResults();
  if (mutateRaw) mutateRaw(raws);
  const entries = Object.entries(raws).map(([name, result]) => baseline.captureEntry(name, result));
  const snap = { meta: { formatVersion: 3, entryCount: entries.length }, entries };
  snap.meta.hash = baseline.hashOf(entries.map((e) => [e.name, e.hash]));
  const file = scratchFile('sentinels');
  fs.writeFileSync(file, JSON.stringify(snap, null, 2));
  return { file, snapshot: invariant.readSnapshot(file) };
}

function runSentinels(snapshot, over = {}) {
  return invariant.run(snapshot, Object.assign({
    spec: SENTINEL_SPEC,
    plans: new Map(),
    raw: new Map(Object.entries(sentinelResults())),
    expectations: SENTINEL_EXPECTATIONS,
    shape: false,
  }, over));
}

// ---------------------------------------------------------------------------
// A. Independence
// ---------------------------------------------------------------------------

test('3.0a: the invariant\'s code never names capture-baseline.js, and requires only what it declares', () => {
  const source = fs.readFileSync(INVARIANT, 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.ok(code.length > 8000, 'comment stripping left too little to be the tool');
  assert.doesNotMatch(code, /capture-baseline/, 'the independent measurement must not reach the instrument it measures');

  const described = [...code.matchAll(/require\(([^)]*)\)/g)].map((m) => {
    const arg = m[1].trim();
    if (/^'node:[a-z_]+'$/.test(arg)) return 'builtin';
    const literals = [...arg.matchAll(/'([^']*)'/g)].map((x) => x[1]);
    return literals.join('/') + (/,\s*[A-Za-z_$][\w$]*\s*$/.test(arg) ? '/<dynamic>' : '');
  });
  const declared = new Set(invariant.SHARED_DEPENDENCIES.map((d) => d.replace(/<[^>]*>/, '<dynamic>')));
  assert.ok(described.includes('tools/result-contract.js'), 'reach: the scan must see the tool\'s own requires');
  assert.deepEqual(described.filter((d) => d !== 'builtin' && !declared.has(d)), [], 'undeclared dependencies');
});

test('3.0a, by behaviour: the invariant checks the real capture with capture-baseline.js made UNLOADABLE', () => {
  realCapture();
  const hook = path.join(SCRATCH, 'block-capture-baseline.js');
  fs.writeFileSync(hook, [
    "'use strict';",
    "const Module = require('node:module');",
    'const load = Module._load;',
    'Module._load = function (request) {',
    "  if (/capture-baseline/.test(request)) throw new Error('BLOCKED: capture-baseline.js was required');",
    '  return load.apply(this, arguments);',
    '};',
  ].join('\n'));
  const r = spawnSync(process.execPath, ['--require', hook, INVARIANT, 'check', realFile], { encoding: 'utf8' });
  assert.doesNotMatch(r.stdout + r.stderr, /BLOCKED/);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /RESULT: PASS/);
  CHECK_IDS.forEach((id) => assert.match(r.stdout, new RegExp('  ' + id + '\\s+PASS'), id));

  // Control: the hook really blocks -- the capture tool cannot run under it.
  const control = spawnSync(process.execPath, ['--require', hook, '-e', "require('" + path.join(ROOT, 'tools', 'capture-baseline.js').replace(/\\/g, '/') + "')"], { encoding: 'utf8' });
  assert.notEqual(control.status, 0);
  assert.match(control.stderr, /BLOCKED/);
});

// ---------------------------------------------------------------------------
// B. Positive controls
// ---------------------------------------------------------------------------

test('positive control: the real corpus, captured by the real CLI and read back, passes every check and names what it skipped', () => {
  const result = runReal(realCapture());
  assert.deepEqual(failing(result), [], invariant.report(result, 'the real capture'));
  assert.deepEqual(result.checks.map((c) => c.id), CHECK_IDS);

  const spec = invariant.readSpec();
  const unreproducible = spec.scenarios.filter((s) => !Object.prototype.hasOwnProperty.call(s, 'inputFingerprint')).map((s) => s.name);
  for (const id of ['INPUTS', 'ROUND-TRIP']) {
    const skipped = checkOf(result, id).skipped;
    assert.equal(skipped.length, unreproducible.length, id + ': every scenario without an independent plan is SKIPPED by name');
    unreproducible.forEach((n) => assert.ok(skipped.some((s) => s.startsWith(n + ':')), id + ' ' + n));
  }
  assert.equal(spec.scenarios.length - unreproducible.length, independentRun().raw.size, 'reach: ROUND-TRIP compared every reproducible scenario');
  assert.ok(independentRun().raw.size >= 25);
});

test('positive control: every sentinel survives capture, the file and the read-back -- and the special values are really in the file', () => {
  const { file, snapshot } = sentinelCapture();
  const result = runSentinels(snapshot);
  assert.deepEqual(failing(result), [], invariant.report(result, 'sentinels'));
  const text = fs.readFileSync(file, 'utf8');
  ['"__nonFinite": "NaN"', '"__nonFinite": "Infinity"', '"__nonFinite": "-Infinity"', '"__negativeZero": true', '"__undefined": true']
    .forEach((tag) => assert.ok(text.includes(tag), 'the control would be vacuous without ' + tag + ' in the file'));
});

// ---------------------------------------------------------------------------
// C. The four checks of 3.0c
// ---------------------------------------------------------------------------

test('3.0c #1 raw-domain rejection belongs to the CAPTURE tool, and it refuses before traversal: no accessor invoked, no trap run', () => {
  let reads = 0;
  const count = () => { reads++; return 50000; };
  const recorder = () => {
    const handler = {};
    ['get', 'set', 'has', 'deleteProperty', 'ownKeys', 'getOwnPropertyDescriptor', 'defineProperty',
      'getPrototypeOf', 'setPrototypeOf', 'isExtensible', 'preventExtensions'].forEach((t) => {
      handler[t] = (...args) => { reads++; return Reflect[t](...args); };
    });
    return handler;
  };
  const shapes = [
    ['an accessor on a row', () => { const row = { age: 60 }; Object.defineProperty(row, 'total', { enumerable: true, get: count }); return { rows: [row] }; }],
    ['an accessor at an array index', () => { const rows = [{ age: 60 }]; Object.defineProperty(rows, '0', { enumerable: true, configurable: true, get: count }); return { rows }; }],
    ['an index inherited from a custom prototype', () => { const proto = Object.create(Array.prototype); Object.defineProperty(proto, '0', { get: count }); const rows = []; rows.length = 1; Object.setPrototypeOf(rows, proto); return { rows }; }],
    ['a Proxy row', () => ({ rows: [new Proxy({ age: 60, total: 1 }, recorder())] })],
    ['a Proxy result', () => new Proxy({ rows: [] }, recorder())],
    ['a named property 4294967295 on an array', () => { const rows = [{ age: 60 }]; rows['4294967295'] = 50000; return { rows }; }],
    ['a symbol-keyed property', () => ({ rows: [], [Symbol('amount')]: 50000 })],
    ['a non-enumerable property', () => { const r = { rows: [] }; Object.defineProperty(r, 'amount', { value: 50000, enumerable: false }); return r; }],
    ['a sparse hole', () => ({ rows: [, { age: 61 }] })], // eslint-disable-line no-sparse-arrays
    ['a Date', () => ({ rows: [], at: new Date(0) })],
    ['a function', () => ({ rows: [], fn() { return 50000; } })],
    ['a bigint', () => ({ rows: [], amount: 50000n })],
  ];
  for (const [label, make] of shapes) {
    const value = make();
    reads = 0;
    assert.throws(() => baseline.captureEntry('raw-probe', value), TypeError, label + ' must be refused');
    assert.equal(reads, 0, label + ': refused only after ' + reads + ' read(s) -- an accessor ran or a trap answered');
  }
  // Control: plain equivalents capture.
  assert.doesNotThrow(() => baseline.captureEntry('raw-probe', { rows: [{ age: 60, total: 50000 }], amount: 50000 }));
  /* The invariant is deliberately NOT part of this witness. It reads a file,
     and none of these shapes can exist in one -- which is exactly why a
     completeness or file-level check must never be cited as closing this. */
});

test('3.0c #2 required-result-shape validation on BOTH operands: damage the capture diff calls identical fails SHAPE on each file', () => {
  const good = realCapture();
  const damage = (snap, fn) => {
    const s = clone(snap);
    s.entries.forEach((e) => { fn(e.result); e.hash = baseline.hashForFormat(e.result, 3); });
    s.meta.hash = baseline.hashOf(s.entries.map((e) => [e.name, e.hash]));
    return s;
  };
  const cases = [
    ['rows deleted from every entry', (r) => { delete r.rows; }, /: S-EXACT-KEYS at rows -- required key is missing/],
    ['successRate NaN and failed deleted', (r) => { r.successRate = { __nonFinite: 'NaN' }; delete r.failed; }, /: T-FINITE at successRate/],
    ['a guaranteed row field deleted from every row', (r) => { (r.rows || []).forEach((row) => { delete row.taxes; }); }, /taxes/],
  ];
  for (const [label, fn, pattern] of cases) {
    const before = damage(good, fn);
    const after = damage(good, fn);
    assert.deepEqual(baseline.verifyIntegrity(before), [], label + ': premise -- the capture tool verifies it clean');
    assert.deepEqual(baseline.diffSnapshots(before, after), [], label + ': premise -- the capture diff reports identical damage as no difference');
    for (const [side, snap] of [['before', before], ['after', after]]) {
      const file = scratchFile('damaged-' + side);
      fs.writeFileSync(file, JSON.stringify(snap, null, 2));
      const result = runReal(invariant.readSnapshot(file));
      assert.equal(result.ok, false, label + ', ' + side + ' operand');
      assert.match(problemsOf(result, 'SHAPE').join('\n'), pattern, label + ', ' + side + ' operand must fail SHAPE');
    }
  }
  assert.deepEqual(problemsOf(runReal(good), 'SHAPE'), [], 'control: the undamaged capture passes SHAPE');
});

test('3.0c #3 persistence round-trip: what was validated is what was stored, established by READING THE FILE BACK', () => {
  const { file } = sentinelCapture();
  const { snapshot } = mutateOnDisk(file, 'sentinel:nested-amount', (r) => { r.rows[1].otherAssets[0].value = 5000; });
  const result = runSentinels(snapshot);
  assert.match(problemsOf(result, 'ROUND-TRIP').join('\n'),
    /sentinel:nested-amount\.rows\[1\]\.otherAssets\[0\]\.value: value -- expected 50000, found 5000/);
  assert.equal(result.ok, false);
  assert.deepEqual(problemsOf(runSentinels(sentinelCapture().snapshot), 'ROUND-TRIP'), [], 'control');
});

test('3.0c #4 corruption reaches a gate: every failed check fails the run and the CLI exit -- nothing is tallied and dropped', () => {
  realCapture();
  const onDisk = JSON.parse(fs.readFileSync(realFile, 'utf8'));
  onDisk.entries.push(clone(onDisk.entries[0]));                       // INVENTORY
  onDisk.entries[1].result.rows = [];                                   // NON-VACUOUS, SHAPE, ROUND-TRIP
  onDisk.entries[2].result.successRate = { __nonFinite: 'bogus' };      // ENCODING
  const file = scratchFile('corrupt-all');
  fs.writeFileSync(file, JSON.stringify(onDisk, null, 2));
  const r = spawnSync(process.execPath, [INVARIANT, 'check', file], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /RESULT: FAIL/);
  assert.doesNotMatch(r.stdout, /RESULT: PASS/);
  ['INVENTORY', 'ENCODING', 'NON-VACUOUS', 'SHAPE', 'ROUND-TRIP'].forEach((id) => assert.match(r.stdout, new RegExp('  ' + id + '\\s+FAIL'), id));

  // Each class ALONE fails the run too: one problem is enough.
  const alone = [
    ['INVENTORY', (s) => { s.entries.pop(); }],
    ['ENCODING', (s) => { s.entries[3].result.rows[0].age = { __negativeZero: 'yes' }; }],
    ['NON-VACUOUS', (s) => { s.entries[4].result = {}; }],
  ];
  for (const [id, mutate] of alone) {
    const s = clone(onDisk);
    s.entries.pop();
    s.entries[1] = clone(invariant.readSnapshot(realFile).entries[1]);
    s.entries[2] = clone(invariant.readSnapshot(realFile).entries[2]);
    mutate(s);
    const result = runReal(s);
    assert.equal(result.ok, false, id + ' alone must fail the run');
    assert.ok(failing(result).includes(id), id + ' must be among the failing checks: ' + failing(result).join(', '));
  }

  // Unreadable files fail, and a file of another format fails FORMAT with decoding checks SKIPPED, not passed.
  const notJson = scratchFile('not-json');
  fs.writeFileSync(notJson, '{"meta":');
  const bad = spawnSync(process.execPath, [INVARIANT, 'check', notJson], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /could not be read as JSON/);
  const format1 = runReal(invariant.readSnapshot(path.join(ROOT, 'tools', 'baseline-20260910-after-R2.json')));
  assert.equal(format1.ok, false);
  assert.ok(failing(format1).includes('FORMAT'));
  ['ENCODING', 'NON-VACUOUS', 'SHAPE', 'INPUTS', 'ROUND-TRIP'].forEach((id) => {
    assert.deepEqual(problemsOf(format1, id), []);
    assert.match(checkOf(format1, id).skipped.join(' '), /not run/, id + ' must say it did not run');
  });
});

// ---------------------------------------------------------------------------
// D. 3.0's clauses, the 3.7 mutation matrix, and the task-3 gate items
// ---------------------------------------------------------------------------

test('3.0: a trivially empty result fails NON-VACUOUS even when every name and the count are right', () => {
  realCapture();
  const persisted = [
    ['undefined', { __undefined: true }], ['null', null], ['{}', {}], ['[]', []],
    ['{rows: []}', { rows: [] }], ['{rows: null}', { rows: null }], ['{status: "ok", rows: []}', { status: 'ok', rows: [] }],
  ];
  for (const [label, empty] of persisted) {
    const { snapshot } = mutateOnDisk(realFile, 'seed:12', (r, snap) => {
      snap.entries.find((e) => e.name === 'seed:12').result = empty;
    });
    const result = runReal(snapshot);
    assert.deepEqual(problemsOf(result, 'INVENTORY'), [], label + ': premise -- names and count are intact');
    assert.match(problemsOf(result, 'NON-VACUOUS').join('\n'), /^seed:12: /m, label + ' must fail NON-VACUOUS');
  }
});

test('3.0c: a silently dropped property satisfies every clause of 3.0 -- and fails ROUND-TRIP, and the capture diff is non-empty', () => {
  const good = realCapture();
  const { snapshot } = mutateOnDisk(realFile, 'golden:baseline', (r) => { delete r.rows[3].taxes; });
  const result = runReal(snapshot);
  assert.deepEqual(problemsOf(result, 'INVENTORY'), [], 'premise: counted right');
  assert.deepEqual(problemsOf(result, 'NON-VACUOUS'), [], 'premise: not vacuous');
  assert.match(problemsOf(result, 'ROUND-TRIP').join('\n'), /golden:baseline\.rows\[3\]\.taxes: ABSENT/);
  const diff = baseline.diffSnapshots(good, snapshot);
  assert.equal(diff.length, 1, 'the FC-02 gate item: a dropped property is a non-empty diff');
  assert.equal(diff[0].scenario, 'golden:baseline');
});

test('3.7 mutation 1: a nested $50,000 removed before capture is reported at its exact scenario, path and value', () => {
  const { snapshot } = sentinelCapture((raws) => { delete raws['sentinel:nested-amount'].rows[1].otherAssets[0].value; });
  const result = runSentinels(snapshot);
  assert.ok(problemsOf(result, 'SENTINELS').includes('sentinel:nested-amount rows[1].otherAssets[0].value: expected 50000, and the field is ABSENT'),
    problemsOf(result, 'SENTINELS').join('\n'));
  assert.equal(result.ok, false);
  assert.deepEqual(problemsOf(runSentinels(sentinelCapture().snapshot), 'SENTINELS'), [], 'control');
});

test('3.7 mutation 2: a non-finite raw input is rejected BEFORE serialization could sanitize it -- by both tools', () => {
  const ind = independentRun();
  const plans = new Map(ind.plans);
  const poisoned = structuredClone(plans.get('seed:3'));
  poisoned.assumptions.returnRate = NaN;
  plans.set('seed:3', poisoned);
  const inputs = invariant.checkInputs(ind.spec, plans, new Map());
  assert.deepEqual(inputs.problems, ['seed:3.assumptions.returnRate carries NaN -- refused before any serialization, which would have changed it']);
  assert.throws(() => baseline.assertJsonFaithful(poisoned, 'seed:3'), (e) => e.code === 'CAPTURE_INPUT_UNFAITHFUL',
    'the capture tool refuses the same plan before its own round trip');
  // Control: the plan unpoisoned passes, and a raw NaN RESULT is kept, not sanitized.
  assert.deepEqual(invariant.checkInputs(ind.spec, ind.plans, new Map()).problems, []);
  assert.deepEqual(problemsOf(runSentinels(sentinelCapture().snapshot), 'SENTINELS'), []);
});

test('3.7 mutation 3: removing a zero, a false, an empty list or a null is a MISSING field, never read as its value', () => {
  const shown = { shortfall: '0', failed: 'false', issues: 'an array of 0', firstShortfallAge: 'null' };
  for (const field of Object.keys(shown)) {
    const { snapshot } = sentinelCapture((raws) => { delete raws['sentinel:falsy-but-present'][field]; });
    const result = runSentinels(snapshot);
    assert.ok(problemsOf(result, 'SENTINELS').includes('sentinel:falsy-but-present ' + field + ': expected ' + shown[field] + ', and the field is ABSENT'), field);
    assert.match(problemsOf(result, 'ROUND-TRIP').join('\n'), new RegExp('sentinel:falsy-but-present\\.' + field + ': ABSENT'), field);
  }
  // A different falsy value is a TYPE difference, not the same answer.
  const { snapshot } = sentinelCapture((raws) => { raws['sentinel:falsy-but-present'].shortfall = false; });
  assert.match(problemsOf(runSentinels(snapshot), 'SENTINELS').join('\n'), /shortfall: type -- expected number, found boolean/);
  assert.deepEqual(problemsOf(runSentinels(sentinelCapture().snapshot), 'SENTINELS'), [], 'control');
});

test('3.7 mutation 4: omitting, adding, duplicating or adversarially naming a scenario is an INVENTORY failure', () => {
  const good = realCapture();
  const names = good.entries.map((e) => e.name);
  const cases = [
    ['omit', (s) => { s.entries = s.entries.filter((e) => e.name !== 'targeted:funded-qcd'); }, /MISSING: "targeted:funded-qcd"/],
    ['add', (s) => { const e = clone(s.entries[0]); e.name = 'seed:21'; s.entries.push(e); }, /UNEXPECTED: "seed:21"/],
    ['duplicate', (s) => { s.entries.push(clone(s.entries[5])); }, new RegExp('DUPLICATE: "' + names[5] + '" appears 2 times')],
    ['__proto__', (s) => { s.entries[7].name = '__proto__'; }, /UNEXPECTED: "__proto__"/],
    ['constructor', (s) => { s.entries[8].name = 'constructor'; }, /UNEXPECTED: "constructor"/],
    ['empty name', (s) => { s.entries[3].name = ''; }, /entry 3 has name "", not a non-empty string/],
    ['non-string name', (s) => { s.entries[4].name = 4; }, /entry 4 has name 4, not a non-empty string/],
  ];
  for (const [label, mutate, pattern] of cases) {
    const s = clone(good);
    mutate(s);
    const file = scratchFile('inventory-' + label.replace(/\W/g, ''));
    fs.writeFileSync(file, JSON.stringify(s, null, 2));
    const result = runReal(invariant.readSnapshot(file));
    assert.equal(result.ok, false, label);
    assert.match(problemsOf(result, 'INVENTORY').join('\n'), pattern, label);
  }
  assert.deepEqual(problemsOf(runReal(good), 'INVENTORY'), [], 'control');
});

test('3.7 mutation 5: a truncated or reordered time series fails -- never silently sorted equal', () => {
  const reordered = mutateOnDisk(sentinelCapture().file, 'sentinel:time-series', (r) => { r.rows.reverse(); }).snapshot;
  const r1 = runSentinels(reordered);
  assert.match(problemsOf(r1, 'ROUND-TRIP').join('\n'), /sentinel:time-series\.rows\[0\]\.age: value -- expected 60, found 64/);
  assert.match(problemsOf(r1, 'SENTINELS').join('\n'), /sentinel:time-series rows\[0\]\.age: value -- expected 60, found 64/);

  const truncated = mutateOnDisk(sentinelCapture().file, 'sentinel:time-series', (r) => { r.rows.length = 3; }).snapshot;
  assert.match(problemsOf(runSentinels(truncated), 'ROUND-TRIP').join('\n'), /sentinel:time-series\.rows\.length: length -- expected 5, found 3/);

  realCapture();
  const swapped = mutateOnDisk(realFile, 'golden:baseline', (r) => { const a = r.rows[1]; r.rows[1] = r.rows[2]; r.rows[2] = a; }).snapshot;
  assert.match(problemsOf(runReal(swapped), 'ROUND-TRIP').join('\n'), /golden:baseline\.rows\[1\]\./);
  assert.deepEqual(problemsOf(runSentinels(sentinelCapture().snapshot), 'ROUND-TRIP'), [], 'control');
});

test('3.7 mutation 6: stored output damaged after capture is a persistence failure, though the capture tool verifies it clean', () => {
  const { file } = sentinelCapture();
  const { snapshot } = mutateOnDisk(file, 'sentinel:special-numbers', (r) => { r.signFlip = 0; delete r.notSet; });
  const result = runSentinels(snapshot);
  const found = problemsOf(result, 'ROUND-TRIP').join('\n');
  assert.match(found, /sentinel:special-numbers\.signFlip: value -- expected -0, found 0/);
  assert.match(found, /sentinel:special-numbers\.notSet: ABSENT, expected undefined/);
  assert.deepEqual(problemsOf(runSentinels(sentinelCapture().snapshot), 'ROUND-TRIP'), [], 'control');
});

test('3.7 mutation 7: changing generator behaviour under the same seed is an INPUTS failure naming the seed', () => {
  const generator = require('./lib/scenario-generator.js');
  const original = generator.generateScenario;
  const spec = invariant.readSpec();
  try {
    generator.generateScenario = (d, seed) => { const p = original(d, seed); if (seed === 7) p.retirement.spending += 1; return p; };
    const changed = invariant.buildPlans(spec);
    const inputs = invariant.checkInputs(spec, changed.plans, changed.errors);
    assert.equal(inputs.problems.length, 1, inputs.problems.join('\n'));
    assert.match(inputs.problems[0], /^seed:7: the plan fingerprints to [0-9a-f]{16}\.\.\., not the reviewed [0-9a-f]{16}\.\.\. -- what this name means has changed$/);

    generator.generateScenario = () => { throw new Error('generator fault'); };
    const broken = invariant.buildPlans(spec);
    const failed = invariant.checkInputs(spec, broken.plans, broken.errors);
    assert.equal(failed.problems.filter((p) => /^seed:\d+: the plan could not be built -- generator fault$/.test(p)).length, 20,
      'a broken generator is named per seed, not collapsed');
  } finally {
    generator.generateScenario = original;
  }
  const control = invariant.buildPlans(spec);
  assert.deepEqual(invariant.checkInputs(spec, control.plans, control.errors).problems, [], 'control');
});

test('3.7 mutation 8: corrupting only a Monte Carlo summary, or only a failure result, fails SHAPE for that mode or status', () => {
  realCapture();
  const mc = mutateOnDisk(realFile, 'golden:monte-carlo-fixed-seed', (r) => { r.validPathCount = r.requestedPathCount + 1; }).snapshot;
  const mcResult = runReal(mc);
  assert.match(problemsOf(mcResult, 'SHAPE').join('\n'), /^golden:monte-carlo-fixed-seed: /m);
  assert.deepEqual(problemsOf(mcResult, 'SHAPE').filter((p) => !p.startsWith('golden:monte-carlo-fixed-seed: ')), [],
    'only the corrupted Monte Carlo summary is reported');

  const plan = structuredClone(independentRun().plans.get('golden:baseline'));
  plan.accounts[1].id = plan.accounts[0].id;
  const name = 'failure:duplicate-account-id';
  const raw = invariant.runPlans(new Map([[name, plan]]));
  const entry = baseline.captureEntry(name, raw.get(name));
  const spec = { formatVersion: 1, scenarios: [{ name, source: 'sentinel', mode: 'simple', status: raw.get(name).status, inputsNote: 'an engine refusal, captured' }] };
  const write = (snap) => { const f = scratchFile('failure'); fs.writeFileSync(f, JSON.stringify(snap, null, 2)); return invariant.readSnapshot(f); };
  /* Q2 (A): the entry is today's engine's, so the capture records today's result-contract version; a capture that records
     none, and is not a known legacy capture, is refused by SHAPE. */
  const clean = write({ meta: { formatVersion: 3, resultContractVersion: require('../tools/result-contract.js').CONTRACT.contractVersion }, entries: [entry] });
  const cleanResult = invariant.run(clean, { spec, plans: new Map(), raw });
  assert.equal(raw.get(name).calculationError, true, 'premise: the engine refused the plan');
  assert.deepEqual(failing(cleanResult), [], 'control: a real failure result passes -- ' + invariant.report(cleanResult, name));

  for (const [label, mutate] of [
    ['rows [] on a failure', (r) => { r.rows = []; }],
    ['calculationError cleared', (r) => { r.calculationError = false; }],
    ['status rewritten to ok', (r) => { r.status = 'ok'; }],
  ]) {
    const damaged = clone(entry);
    mutate(damaged.result);
    const result = invariant.run(write({ meta: { formatVersion: 3, resultContractVersion: require('../tools/result-contract.js').CONTRACT.contractVersion }, entries: [damaged] }), { spec, plans: new Map(), raw });
    assert.ok(problemsOf(result, 'SHAPE').length > 0, label + ' must fail SHAPE -- ' + invariant.report(result, label));
  }
});

test('3.7 mutation 9: A-B-A -- a capture, a changed capture, and the first again give the same A outputs over unchanged A inputs', () => {
  const generator = require('./lib/scenario-generator.js');
  const original = generator.generateScenario;
  const persist = (snap) => { const f = scratchFile('aba'); fs.writeFileSync(f, JSON.stringify(snap, null, 2)); return invariant.readSnapshot(f); };
  const fingerprints = (snap) => new Map(invariant.decodeEntries(snap).decoded.map((d) => [d.name, invariant.fingerprint(d.result)]));

  const a1 = persist(baseline.capture());
  let b;
  try {
    /* endAge, not spending: a change the output MUST show. Spending +1000 was
       tried first and seed 7's outputs did not move -- it runs the
       floorCeiling strategy, which sizes withdrawals from withdrawalRate
       between a floor and a ceiling (measured) -- so B was identical to A and
       the test could not have seen anything. One year less of horizon is one
       row fewer, in every mode. */
    generator.generateScenario = (d, seed) => { const p = original(d, seed); if (seed === 7) p.profile.endAge -= 1; return p; };
    b = persist(baseline.capture());
  } finally {
    generator.generateScenario = original;
  }
  const a2 = persist(baseline.capture());

  const fa1 = fingerprints(a1);
  const fb = fingerprints(b);
  const fa2 = fingerprints(a2);
  assert.deepEqual([...fa1.keys()].filter((n) => fa1.get(n) !== fa2.get(n)), [], 'A and A again must agree on every output');
  assert.deepEqual([...fa1.keys()].filter((n) => fa1.get(n) !== fb.get(n)), ['seed:7'], 'B must differ exactly where it was changed');

  const spec = invariant.readSpec();
  const after = invariant.buildPlans(spec);
  assert.deepEqual(invariant.checkInputs(spec, after.plans, after.errors).problems, [], 'A inputs are unchanged after B');
  assert.deepEqual(failing(invariant.run(a2, { spec })), [], 'A again passes every check, with plans built fresh');
  assert.ok(failing(invariant.run(b, { spec })).includes('ROUND-TRIP'), 'B read against A\'s inputs fails ROUND-TRIP');
});

test('task 3 gate: two captures with identical outputs and DIFFERENT corpus-input hashes are refused, not reported identical', () => {
  const a = realCapture();
  const b = clone(a);
  b.meta.corpusInputHash = 'f'.repeat(64);
  assert.throws(() => baseline.diffSnapshots(a, b), /DIFFERENT corpus inputs/);
  assert.deepEqual(baseline.diffSnapshots(a, clone(a)), [], 'control: the same inputs compare as the ordinary pass');
});
