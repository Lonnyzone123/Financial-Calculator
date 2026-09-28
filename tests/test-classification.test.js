'use strict';

/*
 * S4 task 9 -- the test classification, held to the files it classifies.
 *
 * The classification is generated, so it is checked where it cannot vouch for
 * itself: against a fresh classification, against the directory (every file
 * once), against its own rule on small texts whose answer is known, and --
 * for 9.4 -- against the requirements register, with 8.7's closeout check
 * judging the list.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const tc = require('../tools/test-classification.js');
const closeout = require('../tools/closeout-check.js');

const COMMITTED = JSON.parse(fs.readFileSync(tc.CLASSIFICATION_PATH, 'utf8'));
const FRESH = tc.build(ROOT);
const EXPORTS = tc.engineExports(ROOT);

test('9.1: the committed classification is exactly a fresh one', () => {
  assert.deepEqual(COMMITTED.counts, FRESH.counts, 'counts drifted -- rebuild with `node tools/test-classification.js build --write` and review the diff');
  assert.deepEqual(COMMITTED.files, FRESH.files);
  assert.deepEqual(COMMITTED.coupledOnly, FRESH.coupledOnly);
});

test('9.1: every file in tests/ and tests/ported/ is classified exactly once, and every infrastructure entry names a real file', () => {
  const onDisk = tc.listTestFiles(ROOT);
  assert.deepEqual(FRESH.files.map((f) => f.file), onDisk);
  assert.ok(onDisk.some((f) => f.startsWith('tests/ported/')), 'CONTROL: the ported tests are included');
  Object.keys(tc.INFRASTRUCTURE).forEach((f) => assert.ok(fs.existsSync(path.join(ROOT, f)), 'INFRASTRUCTURE names a file that does not exist: ' + f));
  FRESH.files.forEach((f) => assert.ok(tc.CATEGORIES.includes(f.category), f.file));
});

test('9.1: the coupling rule, on texts whose answer is known', () => {
  assert.ok(EXPORTS.includes('withdrawFromClass') && EXPORTS.includes('runPlan'), 'CONTROL: the engine exports were read from its footer');
  const scan = (text) => tc.scanText(text, EXPORTS);
  assert.deepEqual(scan("const engine = require('../src/engine.js'); engine.runPlan(p);").internals, [], 'the public entry point alone is not coupling');
  assert.deepEqual(scan("const engine = require('../src/engine.js'); engine.withdrawFromClass(a);").internals, ['withdrawFromClass']);
  assert.deepEqual(scan("const e2 = require(path.join(ROOT, 'src', 'engine.js')); e2.strategySpending(p);").internals, ['strategySpending'], 'a path.join require and a non-default alias');
  assert.deepEqual(scan("const { rmdFor, runPlan } = require('../src/engine');").internals, ['rmdFor'], 'destructuring');
  assert.deepEqual(scan("const d = require('../src/debt-amortization.js');").internals, ['src/debt-amortization']);
  assert.deepEqual(scan("const { createDecisionLog } = require('../../src/ported/decision-log');").internals, ['src/ported/decision-log']);
  assert.ok(scan("const ledger = require('./lib/household-ledger.js');").internals.some((n) => /engine source text/.test(n)), 'reading engine source text is the strongest coupling');
  assert.deepEqual(scan("const { loadCalculator } = require('./lib/harness');").internals, [], 'the built app is behaviour');
});

test('9.1: a file outside the infrastructure list is coupled exactly when a fresh scan of its own text reaches internals', () => {
  /* Held to the file, not to the classification's own internals field: the
     first version compared the two fields of one record, so a classifier that
     emptied both at once passed it -- a mutation found that. */
  const wrong = FRESH.files.filter((f) => f.category !== 'infrastructure').filter((f) => {
    const scanned = tc.scanText(fs.readFileSync(path.join(ROOT, f.file), 'utf8'), EXPORTS).internals;
    return (f.category === 'implementation-coupled') !== (scanned.length > 0) || JSON.stringify(f.internals) !== JSON.stringify(scanned);
  });
  assert.deepEqual(wrong.map((f) => f.file), []);
});

test('9.2 / 9.3: the counts are published, and every coupled file names what it depends on', (t) => {
  const c = FRESH.counts;
  t.diagnostic('9.2: ' + JSON.stringify(c));
  assert.equal(c['implementation-independent'] + c['implementation-coupled'] + c.infrastructure, c.total);
  assert.ok(c['implementation-coupled'] > 0 && c['implementation-independent'] > 0 && c.infrastructure > 0);
  FRESH.files.filter((f) => f.category === 'implementation-coupled').forEach((f) => assert.ok(f.internals.length > 0, f.file));
  assert.ok(Object.keys(FRESH.internalsByUse).length > 10, 'CONTROL: the internal dependency list is the input to the phase decomposition');
});

test('9.4: a behaviour whose every guard is coupled is flagged; one that also has an independent guard is not', () => {
  const byFile = {
    'tests/coupled.test.js': { category: 'implementation-coupled', internals: ['withdrawFromClass'] },
    'tests/independent.test.js': { category: 'implementation-independent', internals: [] },
  };
  const register = { requirements: [
    { id: 'SEED-01', guard: { tests: ['tests/coupled.test.js :: a'], files: ['tests/coupled.test.js'] } },
    { id: 'SEED-02', guard: { tests: ['tests/coupled.test.js :: a', 'tests/independent.test.js :: b'], files: [] } },
    { id: 'SEED-03', guard: { tests: [], files: [] } },
  ] };
  const flagged = tc.coupledOnlyGuards(register, byFile).map((x) => x.id);
  assert.deepEqual(flagged, ['COUPLED-ONLY-SEED-01']);

  /* And the test-level reading, through the same function: the file is coupled,
     but only one of its named tests reaches the internal. */
  const texts = { 'tests/coupled.test.js': "const engine = require('../src/engine.js');\ntest('a', () => { engine.runPlan(p); });\ntest('c', () => { engine.withdrawFromClass(x); });" };
  const named = { requirements: [
    { id: 'SEED-04', guard: { tests: ['tests/coupled.test.js :: a'], files: [] } },
    { id: 'SEED-05', guard: { tests: ['tests/coupled.test.js :: c'], files: [] } },
  ] };
  const levels = Object.fromEntries(tc.coupledOnlyGuards(named, byFile, (f) => texts[f], EXPORTS).map((x) => [x.requirement, x.testLevel]));
  assert.deepEqual(levels, { 'SEED-04': 'independent', 'SEED-05': 'coupled' }, 'flagged at file level, told apart at test level');
});

test('9.4: a named test\'s own body is read at test level -- a coupled call elsewhere in the file does not make it coupled', () => {
  const text = [
    "const engine = require('../src/engine.js');",
    "const { rmdFor } = require('../src/engine.js');",
    "test('behaviour only', () => { /* a comment with a ( paren */ assert.ok(engine.runPlan(p)); });",
    "test('reaches an internal', () => { const s = \"a ) string\"; assert.ok(engine.withdrawFromClass(a)); });",
    "test('destructured internal', () => { rmdFor(x); });",
  ].join('\n');
  const bindings = tc.bindingsOf(text, EXPORTS);
  const reach = (title) => {
    const block = tc.testBlock(text, title);
    assert.ok(block, 'CONTROL: the body of ' + JSON.stringify(title) + ' was isolated');
    return [...tc.internalsIn(block, bindings, EXPORTS).members].filter((n) => !tc.PUBLIC_ENTRY_POINTS.includes(n));
  };
  assert.deepEqual(reach('behaviour only'), []);
  assert.deepEqual(reach('reaches an internal'), ['withdrawFromClass']);
  assert.deepEqual(reach('destructured internal'), ['rmdFor']);
  assert.equal(tc.testBlock(text, 'no such test'), null, 'a body that cannot be found is reported as unresolved, never guessed');
});

test('9.4 / 8.7: every flagged behaviour carries 8.7\'s fields and both bounds, and the closeout check refuses them until an owner and a deadline exist', (t) => {
  t.diagnostic('9.4 bounds: ' + JSON.stringify(FRESH.coupledOnlyBounds));
  t.diagnostic('9.4 (test level coupled): ' + FRESH.coupledOnly.filter((x) => x.testLevel.startsWith('coupled')).map((x) => x.id).join(', '));
  const b = FRESH.coupledOnlyBounds;
  assert.equal(b.fileLevelUpperBound, FRESH.coupledOnly.length);
  assert.equal(b.testLevelCoupled + b.testLevelIndependent + b.testLevelUnresolved + b.citedOnlyNotApplicable, b.fileLevelUpperBound, 'every flagged item has a test-level verdict');
  FRESH.coupledOnly.forEach((item) => ['id', 'kind', 'severity', 'owner', 'downstreamTask', 'deadline'].forEach((k) => assert.ok(k in item, item.id + ' lacks ' + k)));
  const r = closeout.evaluate(FRESH.coupledOnly);
  assert.equal(r.verdict, FRESH.coupledOnly.length ? 'REFUSED' : 'COMPLETE');
});
