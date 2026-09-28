'use strict';

/*
 * S4 task 4 -- corpus compositions: the control stays the control, and every
 * addition arrives as an EXPANSION under its own name.
 *
 * Task 4 adds scenarios (Q35 coverage, the Q54 debt sets, 4.5's sensitive band)
 * while 4.7 fixed the corpus S4 started from as the control. The capture tool
 * therefore builds two compositions:
 *
 *   control   exactly the control corpus, built without loading
 *             tests/lib/corpus-expansion.js at all
 *   expanded  the control, then every member that module declares
 *
 * This file holds the boundary between them. It holds whatever the expansion
 * contains, so it stays true as members are added.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const baseline = require('../tools/capture-baseline.js');
const expansion = require('./lib/corpus-expansion.js');
const CONTROL = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'control-corpus.json'), 'utf8'));

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-composition-'));
test.after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));

const namesOf = (entries) => entries.map((e) => e.name);

test('S4 4: control is the default composition, and it is still the control corpus', () => {
  assert.equal(baseline.corpusWithDiagnostics().composition, 'control');
  assert.equal(baseline.corpusInputHash(baseline.corpus()), CONTROL.corpusInputHash);
  assert.equal(baseline.corpusInputHash(baseline.corpus({ composition: 'control' })), CONTROL.corpusInputHash);
  assert.equal(baseline.expectedCorpusSize(), CONTROL.entryCount);
  assert.equal(baseline.capture().meta.corpusComposition, 'control', 'a capture says which composition it covers');
});

test('S4 4: the expanded composition is the control, then every declared member, each exactly once, meaning the same plans', () => {
  const control = baseline.corpus();
  const expanded = baseline.corpus({ composition: 'expanded' });
  assert.deepEqual(namesOf(expanded), namesOf(control).concat(expansion.expansionNames()));
  assert.equal(new Set(namesOf(expanded)).size, expanded.length, 'no name twice');
  assert.equal(baseline.expectedCorpusSize({ composition: 'expanded' }), control.length + expansion.expansionNames().length);
  const controlHashes = baseline.inputHashesOf(control);
  const expandedHashes = baseline.inputHashesOf(expanded);
  namesOf(control).forEach((n) => assert.equal(expandedHashes[n], controlHashes[n], n + ' must mean the same plan in both compositions'));

  const snap = baseline.capture({ composition: 'expanded' });
  assert.equal(snap.meta.corpusComposition, 'expanded', 'an expanded capture must say so');
  assert.equal(snap.meta.composition.expansion, expansion.expansionNames().length, 'and count its expansion members');
  assert.equal(snap.entries.length, expanded.length);
});

test('S4 4: every expansion name is new -- "expansion:" first, and never a control name', () => {
  const control = new Set(namesOf(baseline.corpus()));
  const names = expansion.expansionNames();
  names.forEach((n) => {
    assert.match(n, /^expansion:[a-z0-9-]+$/, n);
    assert.ok(!control.has(n), n + ' reuses a control name');
  });
  assert.equal(new Set(names).size, names.length, 'the expansion itself names nothing twice');
});

test('S4 4: the control composition never loads the expansion module -- proven by making it unloadable', () => {
  const hook = path.join(SCRATCH, 'block-expansion.js');
  fs.writeFileSync(hook, [
    "'use strict';",
    "const Module = require('node:module');",
    'const load = Module._load;',
    'Module._load = function (request) {',
    "  if (/corpus-expansion/.test(request)) throw new Error('BLOCKED: corpus-expansion.js was required');",
    '  return load.apply(this, arguments);',
    '};',
  ].join('\n'));
  const cli = path.join(ROOT, 'tools', 'capture-baseline.js').replace(/\\/g, '/');

  const control = spawnSync(process.execPath, ['--require', hook, '-e',
    "const cb = require('" + cli + "'); const e = cb.corpus(); console.log('CONTROL ' + e.length + ' ' + cb.corpusInputHash(e));"],
  { encoding: 'utf8' });
  assert.equal(control.status, 0, control.stderr);
  assert.match(control.stdout, new RegExp('CONTROL ' + CONTROL.entryCount + ' ' + CONTROL.corpusInputHash));

  const expanded = spawnSync(process.execPath, ['--require', hook, '-e',
    "const cb = require('" + cli + "'); console.log(JSON.stringify(cb.corpusWithDiagnostics({ composition: 'expanded' }).omissions)); cb.corpus({ composition: 'expanded' });"],
  { encoding: 'utf8' });
  assert.notEqual(expanded.status, 0, 'a broken expansion must not yield a corpus');
  assert.match(expanded.stdout, /"source":"expansion"/);
  assert.match(expanded.stdout, /BLOCKED/);
  assert.match(expanded.stderr, /the corpus is INCOMPLETE/, 'the refusal must survive its own message needing the broken module');
});

test('S4 4: an unknown composition is refused by name -- by the API, and by the CLI before any capture', () => {
  assert.throws(() => baseline.corpus({ composition: 'everything' }), /unknown corpus composition "everything"/);
  assert.throws(() => baseline.capture({ composition: 'everything' }), /unknown corpus composition/);
  const out = path.join(SCRATCH, 'never.json');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'capture-baseline.js'), 'capture', out, '--composition', 'everything'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unknown corpus composition "everything"/);
  assert.doesNotMatch(r.stdout, /CORPUS INCOMPLETE/, 'a usage error is not an incomplete corpus');
  assert.equal(fs.existsSync(out), false);
});

test('S4 4: the invariant refuses a capture of one composition read against another composition\'s spec', () => {
  const invariant = require('../tools/corpus-invariant.js');
  const spec = invariant.readSpec();
  assert.equal(spec.composition, 'control');
  const wrong = { meta: { formatVersion: 3, corpusComposition: 'expanded' }, entries: [] };
  assert.match(invariant.checkInventory(wrong, spec).problems.join('\n'),
    /the file is a "expanded" capture; this spec describes the "control" composition/);
  const right = { meta: { formatVersion: 3, corpusComposition: 'control' }, entries: [] };
  assert.ok(!invariant.checkInventory(right, spec).problems.some((p) => /composition/.test(p)), 'control: a matching label is no problem');
  const unlabelled = { meta: { formatVersion: 3 }, entries: [] };
  assert.ok(!invariant.checkInventory(unlabelled, spec).problems.some((p) => /composition/.test(p)), 'a capture predating the label is judged by its names');
});

test('S4 4: the expanded spec repeats the control spec EXACTLY, then names the expansion in the capture tool\'s order', () => {
  const invariant = require('../tools/corpus-invariant.js');
  const controlSpec = invariant.readSpec();
  const expandedSpec = invariant.readSpec(path.join(ROOT, 'tools', 'corpus-spec-expanded.json'));
  assert.equal(expandedSpec.composition, 'expanded');
  assert.deepEqual(expandedSpec.scenarios.slice(0, controlSpec.scenarios.length), controlSpec.scenarios,
    'the control scenarios must mean the same in both specs, field for field');
  assert.deepEqual(expandedSpec.scenarios.map((s) => s.name), namesOf(baseline.corpus({ composition: 'expanded' })));
  expandedSpec.scenarios.slice(controlSpec.scenarios.length).forEach((s) => {
    assert.equal(s.source, 'expansion', s.name);
    assert.match(String(s.inputFingerprint), /^[0-9a-f]{64}$/, s.name + ': an expansion member is independently reproducible, so its inputs are pinned');
  });
});

test('S4 4: an expanded capture passes the independent invariant against the expanded spec -- members round-tripped, not skipped', () => {
  const invariant = require('../tools/corpus-invariant.js');
  const spec = invariant.readSpec(path.join(ROOT, 'tools', 'corpus-spec-expanded.json'));
  const file = path.join(SCRATCH, 'expanded.json');
  fs.writeFileSync(file, JSON.stringify(baseline.capture({ composition: 'expanded' }), null, 2));
  const result = invariant.run(invariant.readSnapshot(file), { spec });
  assert.equal(result.ok, true, invariant.report(result, 'expanded capture'));
  const roundTrip = result.checks.find((c) => c.id === 'ROUND-TRIP');
  expansion.expansionNames().forEach((n) => {
    assert.ok(!roundTrip.skipped.some((s) => s.startsWith(n + ':')), n + ' must be round-tripped, not skipped');
  });
});

test('S4 4: every expansion member is deterministic, JSON-faithful, validator-clean, and MEASURED to reach what its family covers', () => {
  const { validateScenario } = require('../src/scenario-validator.js');
  baseline.corpus(); // loads RULES and the bundled debt modules the engine needs
  const engine = require('../src/engine.js');
  const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
  const defaultPlan = require('./lib/golden-scenario-defs.js').extractDefaultPlan(shell);

  const first = expansion.expansionScenarios(defaultPlan);
  assert.ok(first.length > 0, 'reach: the expansion declares members');
  assert.deepEqual(first, expansion.expansionScenarios(defaultPlan), 'the same plans on every call');
  assert.deepEqual(first.map((e) => e.name), expansion.expansionNames());

  const families = new Map(expansion.EXPANSION_FAMILIES.map((f) => [f.id, f]));
  for (const { name, family, plan } of first) {
    const f = families.get(family);
    assert.ok(typeof f.covers === 'string' && f.covers.length > 40, name + ': its family must say what it covers');
    assert.equal(typeof f.reached, 'function', name + ': its family must say how reaching it is measured');
    assert.doesNotThrow(() => baseline.assertJsonFaithful(plan, name), name);
    const errors = (validateScenario(JSON.parse(JSON.stringify(plan))).issues || []).filter((i) => i.severity === 'ERROR');
    assert.deepEqual(errors.map((i) => i.code + '@' + i.path), [], name + ': validator errors');
    const result = engine.runPlan(JSON.parse(JSON.stringify(plan)));
    assert.equal(result.status, 'ok', name);
    const member = f.members.find((m) => m.name === name);
    assert.ok(f.reached(result, plan, member),
      name + ' does not reach what its family covers -- a scenario that looks like coverage and never enters the branch is Q35 again');
  }
});
