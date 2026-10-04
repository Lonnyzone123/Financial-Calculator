'use strict';

// R1.4 -- tests for tools/capture-baseline.js, the full-output baseline
// harness the post-REOPEN repair round is verified against.
//
// The harness exists because four repairs in this round change financial
// output BY DESIGN, so "the golden fixture must be byte-identical" -- the
// property that carried the previous two sprints -- cannot apply. What
// replaces it is: predict what moves, then explain every number that did.
// That prediction is only checkable against a COMPLETE capture. Against the
// golden tripwire's 3-of-72 rows at 2 decimals, an unintended change can
// hide inside an intended one, which is how SA-03 escaped an earlier sprint.
//
// So the harness has to prove two things about itself, and both are tested
// here rather than assumed:
//   1. It is DETERMINISTIC -- otherwise every diff is noise.
//   2. It LOCATES a change exactly -- otherwise it cannot separate the
//      intended movement from the accidental one.
//
// A green invariant that has never been observed failing is not evidence,
// so case 2 introduces a real one-cent change and demands the harness find
// it, by scenario, row and field.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  capture, diffSnapshots, differences, hashOf, stripExcluded, EXCLUDED,
  corpus, CAPTURE_FORMAT, FIELD_COUNTS, fieldCountsFor, formatVersionOf, installDebtModules,
  gitCommit,
} = require('../tools/capture-baseline.js');

// ---------------------------------------------------------------------------
// 1. Determinism
// ---------------------------------------------------------------------------

test('capture-baseline: two captures of unchanged source are identical', () => {
  const a = capture();
  const b = capture();
  assert.equal(a.meta.hash, b.meta.hash, 'the corpus hash must be stable across captures');
  assert.equal(diffSnapshots(a, b).length, 0, 'no scenario may differ between two captures of the same source');
});

test('capture-baseline: the corpus is actually substantial, not a stub', () => {
  const snap = capture();
  assert.ok(snap.entries.length >= 20, 'expected the golden set plus a seeded sweep, got ' + snap.entries.length);
  assert.ok(
    snap.entries.some((e) => e.name.startsWith('golden:')),
    'the golden scenarios must be in the corpus'
  );
  assert.ok(
    snap.entries.some((e) => e.name.startsWith('seed:')),
    'the seeded generated sweep must be in the corpus -- five hand-written plans is what this replaces'
  );
  const totalRows = snap.entries.reduce((s, e) => s + e.rowCount, 0);
  assert.ok(totalRows > 500, 'expected full row capture across the corpus, got ' + totalRows + ' rows');
});

// ---------------------------------------------------------------------------
// 2. It locates a real change, by scenario / row / field
// ---------------------------------------------------------------------------

test('capture-baseline: a one-cent change in one field of one row is located exactly', () => {
  const before = capture();
  const after = JSON.parse(JSON.stringify(before));

  // Pick a real scenario with rows and perturb a single field by one cent.
  const target = after.entries.find((e) => e.result && e.result.rows && e.result.rows.length > 3);
  assert.ok(target, 'precondition: the corpus must contain a scenario with rows');
  const rowIndex = 2;
  const originalTotal = target.result.rows[rowIndex].total;
  target.result.rows[rowIndex].total = originalTotal + 0.01;
  target.hash = hashOf(target.result);
  after.meta.hash = hashOf(after.entries.map((e) => [e.name, e.hash]));

  const report = diffSnapshots(before, after);
  assert.equal(report.length, 1, 'exactly one scenario should differ');
  assert.equal(report[0].scenario, target.name, 'the differing scenario must be named');
  assert.equal(report[0].diffs.length, 1, 'exactly one field should differ, got ' + JSON.stringify(report[0].diffs));

  const d = report[0].diffs[0];
  assert.equal(d.path, 'rows.' + rowIndex + '.total', 'the diff must locate row and field, got ' + d.path);
  assert.equal(d.before, originalTotal);
  assert.equal(d.after, originalTotal + 0.01);
});

test('capture-baseline: an unchanged capture reports no differences at all', () => {
  const snap = capture();
  const copy = JSON.parse(JSON.stringify(snap));
  assert.equal(diffSnapshots(snap, copy).length, 0);
});

// ---------------------------------------------------------------------------
// 3. Format 2: runPlan(), and NOTHING is excluded
// ---------------------------------------------------------------------------

test('capture-baseline: format 3 excludes nothing at all', () => {
  /* CL-03 raised the format to 3. The encoding changed -- reserved tags are now
     escaped when hashed -- and the previous change did not say so, leaving two
     different encodings both declaring format 2. A legitimate old snapshot then
     read as tampered rather than as older. */
  assert.equal(CAPTURE_FORMAT, 3);
  assert.deepEqual(EXCLUDED, [],
    'format 2 captures runPlan(), which has no nondeterminism to exclude. Adding an entry here ' +
    'turns "fail loudly on ANY nondeterminism" back into a list that can quietly widen -- which is ' +
    'the single change to this harness that would destroy its value. If a field genuinely must be ' +
    'excluded, that is a finding about the engine first.');
});

/* This test replaces one that had become VACUOUS, and the way it failed is
   worth keeping written down. It read:

       for (const entry of snap.entries) {
         if (!entry.result.identity) continue;
         ...assert things about identity...
       }

   Under format 2 there IS no identity on any entry, so the guard skipped
   every iteration and the test passed while asserting nothing. It went green
   through the migration without being touched -- a test that stops testing
   still reports something, which is REAUDIT_HANDOVER_20260911.md section 4's
   whole subject. A loop-with-a-guard over a collection that can legitimately
   be empty needs a count assertion or it cannot speak for anything. */
test('capture-baseline: a format-2 capture carries no identity block at all, on every entry', () => {
  const snap = capture();
  assert.ok(snap.entries.length > 0, 'precondition: the capture must have entries');
  let checked = 0;
  for (const entry of snap.entries) {
    assert.equal(entry.result.identity, undefined,
      entry.name + ' carries an identity block, so this capture is runScenario output, not runPlan');
    checked++;
  }
  assert.equal(checked, snap.entries.length,
    'every entry must be checked -- a guard that skips them all is how the previous version of ' +
    'this test passed while asserting nothing');
});

test('capture-baseline: the capture really is runPlan output, named as such', () => {
  const snap = capture();
  assert.equal(snap.meta.entryPoint, 'runPlan');
  assert.equal(snap.meta.formatVersion, 3);
  assert.deepEqual(snap.meta.excludedFields, []);
});

test('capture-baseline: stripExcluded is still a working funnel, exercised with an explicit list', () => {
  /* EXCLUDED is empty, so passing the real list would make this assert
     nothing (see the vacuous-pass note above). The funnel is tested against
     an explicit list instead, so it still has proven behaviour on the day
     someone genuinely needs to add an exclusion. */
  const original = { identity: { scenarioId: 'a', runId: 'b', engineVersion: '1.0.0' }, rows: [{ total: 1 }] };
  const stripped = stripExcluded(original, ['identity.scenarioId', 'identity.runId']);
  assert.equal(stripped.identity.scenarioId, undefined);
  assert.equal(stripped.identity.runId, undefined);
  assert.equal(stripped.identity.engineVersion, '1.0.0');
  assert.equal(stripped.rows[0].total, 1);
  assert.equal(original.identity.scenarioId, 'a', 'the input must not be mutated');
  // ...and with the real (empty) list it is an identity function.
  assert.deepEqual(stripExcluded(original), original,
    'with nothing excluded, the funnel must pass its input through unchanged');
});

// ---------------------------------------------------------------------------
// 4. The differ itself
// ---------------------------------------------------------------------------

test('capture-baseline: differences() reports added, removed and changed leaves by dotted path', () => {
  const a = { keep: 1, change: 2, gone: 3, nested: { x: 1 } };
  const b = { keep: 1, change: 99, added: 4, nested: { x: 2 } };
  const d = differences(a, b, '');
  const byPath = {};
  d.forEach((x) => { byPath[x.path] = x; });

  assert.equal(byPath.change.before, 2);
  assert.equal(byPath.change.after, 99);
  assert.equal(byPath.gone.after, undefined);
  assert.equal(byPath.added.before, undefined);
  assert.equal(byPath['nested.x'].before, 1);
  assert.equal(byPath['nested.x'].after, 2);
  assert.equal(byPath.keep, undefined, 'unchanged leaves must not be reported');
});

test('capture-baseline: NaN and Infinity survive canonicalisation as distinguishable values', () => {
  // A non-finite creeping into output is exactly the kind of thing this
  // harness must surface rather than silently normalise to null.
  //
  // RA-04 (re-audit 2026-09-11): this test USED TO BE THE WHOLE STORY, and it
  // was not true end to end. It calls hashOf() directly -- the LAST helper in
  // the capture pipeline -- while the defect sat upstream in stripExcluded(),
  // whose JSON round-trip had already turned every non-finite into null. The
  // property named in this test's title was false for the entire repair round
  // while this test passed.
  //
  // It is kept, deliberately narrowed to what it can actually speak for --
  // canonical()/hashOf() in isolation -- and the end-to-end property now has
  // its own coverage through the real capture path in
  // tests/audit-ra04-baseline-integrity.test.js. Do not treat this as
  // coverage of capture; it never was.
  assert.notEqual(hashOf({ v: NaN }), hashOf({ v: null }));
  assert.notEqual(hashOf({ v: Infinity }), hashOf({ v: NaN }));
});

// ---------------------------------------------------------------------------
// S3 task 2 (2026-09-11): the corpus has ONE definition, and it is importable.
//
// corpus() was private while three separate S3 tasks were written against it.
// Each would otherwise rebuild its own "the golden set plus these seeds",
// which is how two corpora drift apart and how a test ends up confidently
// covering a scenario set nobody ships.
// ---------------------------------------------------------------------------

test('capture-baseline: corpus() is importable and is the set capture() actually uses', () => {
  const { corpus, capture, GENERATED_SEEDS } = require('../tools/capture-baseline.js');
  assert.equal(typeof corpus, 'function', 'corpus() must be reachable by its consumers');

  const entries = corpus();
  assert.ok(Array.isArray(entries) && entries.length > 0, 'corpus() returns entries');
  entries.forEach((e) => {
    assert.equal(typeof e.name, 'string', 'each entry is named');
    assert.ok(e.plan && typeof e.plan === 'object', 'each entry carries a plan');
  });

  // The point of exporting it: what a consumer imports must be what the
  // harness captures, not a lookalike.
  assert.deepEqual(
    capture().entries.map((e) => e.name), entries.map((e) => e.name),
    'corpus() must be the same set capture() walks, in the same order'
  );

  const seeds = entries.filter((e) => e.name.startsWith('seed:'));
  assert.equal(seeds.length, GENERATED_SEEDS,
    'the generated-seed count is exported too, so a consumer does not hard-code it');
});

// ---------------------------------------------------------------------------
// 6. S3 task 2 -- format 2's own contract
// ---------------------------------------------------------------------------

/** The engine, loaded the way the capture tool loads it. */
function loadEngineForTest() {
  const fs = require('node:fs');
  const path = require('node:path');
  const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
  const m = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
  global.RULES = JSON.parse(m[1]);
  installDebtModules();
  return require('../src/engine.js');
}

/* Criterion 1. Determinism asserted per scenario, not just on the corpus hash.
   The corpus hash would also be stable if runPlan() were nondeterministic in a
   field canonical() happened to drop, so this walks every entry. */
test('S3 task 2: runPlan is deterministic on every corpus scenario, individually', () => {
  const engine = loadEngineForTest();
  const scenarios = corpus();
  assert.ok(scenarios.length >= 30, 'precondition: expected the full corpus, got ' + scenarios.length);
  const moved = [];
  scenarios.forEach(({ name, plan }) => {
    const a = hashOf(engine.runPlan(JSON.parse(JSON.stringify(plan))));
    const b = hashOf(engine.runPlan(JSON.parse(JSON.stringify(plan))));
    if (a !== b) moved.push(name);
  });
  assert.deepEqual(moved, [],
    'these scenarios produced different runPlan output on two consecutive calls. Do NOT add them ' +
    'to EXCLUDED -- nondeterminism reaching runPlan() is a defect in the engine, and format 2 ' +
    'exists to make it fail loudly rather than absorb it.');
});

/* Criterion 2. runScenario IS nondeterministic, and is NOT what gets captured.
   Commented with the reason so a later reader does not "improve" the harness
   by switching entry points back. */
test('S3 task 2: runScenario is nondeterministic -- which is why it is not the entry point', () => {
  const engine = loadEngineForTest();
  const plan = corpus()[0].plan;
  const a = engine.runScenario(JSON.parse(JSON.stringify(plan)));
  const b = engine.runScenario(JSON.parse(JSON.stringify(plan)));
  assert.notEqual(hashOf(a), hashOf(b),
    'if this ever passes, runScenario() became deterministic and the migration rationale needs ' +
    'rechecking -- do not simply switch the capture back');
  /* buildSimulationIdentity() attaches identity.runId from Date.now() +
     Math.random(); runPlan() never calls it. That single field is the whole
     difference, which is why capturing runPlan needs no exclusions at all. */
  const differing = Object.keys(a.identity)
    .filter((k) => JSON.stringify(a.identity[k]) !== JSON.stringify(b.identity[k]));
  assert.deepEqual(differing, ['runId'],
    'runId should be the only field that moves between two runScenario calls; got ' +
    JSON.stringify(differing));
});

/* Criterion 7. Field coverage, from the exported constant task 9 must reuse.
 *
 * OVER EVERY SCENARIO, PER MODE. The first version of this test measured
 * corpus()[0] -- a `simple` scenario -- against a single scalar pair, and
 * passed. S3 task 3b's parity sweep then walked the whole corpus and reported
 * `golden:monte-carlo-fixed-seed: 18 !== 16`: monteCarlo returns a genuinely
 * different shape (18 top-level, 25 row fields). A field-count check measured
 * on one scenario is not a field-count check, and this one had exactly the
 * confident-but-narrow character it was written to prevent elsewhere. */
test('S3 task 2: row and top-level field counts are pinned per mode, over the whole corpus', () => {
  const engine = loadEngineForTest();
  const seen = {};
  const problems = [];
  corpus().forEach(({ name, plan }) => {
    const mode = plan.assumptions.method;
    const expected = fieldCountsFor(mode);
    const result = engine.runPlan(JSON.parse(JSON.stringify(plan)));
    seen[mode] = (seen[mode] || 0) + 1;
    if (Object.keys(result).length !== expected.topLevel) {
      problems.push(name + ' (' + mode + '): top-level ' + Object.keys(result).length +
        ' != ' + expected.topLevel);
    }
    if (result.rows && result.rows[0] && Object.keys(result.rows[0]).length !== expected.row) {
      problems.push(name + ' (' + mode + '): row ' + Object.keys(result.rows[0]).length +
        ' != ' + expected.row);
    }
  });
  assert.deepEqual(problems, [],
    'the result shape moved. Not necessarily wrong, but it must not escape capture silently -- ' +
    'update FIELD_COUNTS deliberately, in the one place it is defined.');
  assert.ok(Object.keys(seen).length >= 3,
    'this must actually exercise every mode, or it is a simple-mode assertion again; saw ' +
    JSON.stringify(seen));
});

test('S3 task 2: an unmeasured mode is refused rather than given simple\'s counts', () => {
  assert.throws(() => fieldCountsFor('someFutureMode'), /no measured field counts for mode/,
    'defaulting would let a new simulation mode inherit a shape nobody measured it against');
  // CONTROL: the known modes resolve.
  ['simple', 'historical', 'monteCarlo'].forEach((m) => {
    assert.equal(typeof fieldCountsFor(m).row, 'number');
  });
});

test('S3 task 2: identity has 13 fields, which is what the Worker parity test reads from here', () => {
  const engine = loadEngineForTest();
  const identity = engine.runScenario(JSON.parse(JSON.stringify(corpus()[0].plan))).identity;
  assert.equal(Object.keys(identity).length, FIELD_COUNTS.identity,
    'identity is not captured by format 2, but S3 task 3 compares it across the Worker boundary ' +
    'and must read this count from one place');
});

/* Criterion 8. Manifest durability -- provenance that survives the file. */
test('S3 task 2: the manifest records commit, corpus inputs, modes and field counts', () => {
  const snap = capture();

  /* gitCommit() is documented as "HEAD's commit SHA, OR NULL outside a git
     checkout", and only half of that was asserted -- so this test could only
     pass inside a checkout. An EXTRACTED PACKAGE has no .git, and an extracted
     package is exactly where this suite gets run to qualify a release: the
     package failed its own test suite while the repository it was cut from
     passed. Found by extracting it and running the tests as an auditor would,
     which is the only place it could have been found.

     Both branches are asserted now, against the same condition the tool uses. */
  const inCheckout = require('node:fs')
    .existsSync(require('node:path').join(__dirname, '..', '.git'));
  if (inCheckout) {
    assert.match(String(snap.meta.gitCommit), /^[0-9a-f]{40}$/, 'expected the full SHA of HEAD');
  } else {
    assert.equal(snap.meta.gitCommit, null,
      'outside a git checkout the commit must be recorded as an explicit null, not omitted and ' +
      'not faked -- provenance that is absent should say so');
  }
  assert.match(String(snap.meta.corpusInputHash), /^[0-9a-f]{64}$/);
  assert.deepEqual(snap.meta.fieldCounts, FIELD_COUNTS);
  assert.equal(snap.meta.entryCount, snap.entries.length);
  assert.equal(snap.meta.generatedSeeds, 20);
  // No wall-clock stamp anywhere -- that is what makes a capture reproducible.
  assert.equal(snap.meta.capturedAt, undefined, 'a timestamp would break byte-reproducibility');
  const modeTotal = Object.values(snap.meta.modes).reduce((s, n) => s + n, 0);
  assert.equal(modeTotal, snap.entries.length, 'every scenario must be counted in exactly one mode');
});

/* The corpus-INPUT hash detects a changed corpus, which the output hash cannot.
   Written with a control: the same probe must report UNCHANGED for an
   unchanged corpus, or "it changed" carries no information. */
test('S3 task 2: the corpus-input hash moves when the corpus does, and not otherwise', () => {
  const { corpusInputHash } = require('../tools/capture-baseline.js');
  const scenarios = corpus();
  const base = corpusInputHash(scenarios);
  assert.equal(corpusInputHash(corpus()), base, 'CONTROL: an unchanged corpus must hash the same');

  const mutated = JSON.parse(JSON.stringify(scenarios));
  mutated[0].plan.retirement.spending += 0.01;
  assert.notEqual(corpusInputHash(mutated), base,
    'a one-cent change to a PLAN must move the input hash. This is the hash that would have ' +
    'caught S3 task 1 changing which scenario every seed names; meta.hash cannot see it, because ' +
    'it hashes outputs and the outputs legitimately changed at the same time.');
});

/* Cross-format safety. */
test('S3 task 2: diffing captures of different formats is refused', () => {
  const current = capture();
  const v1 = JSON.parse(JSON.stringify(current));
  delete v1.meta.formatVersion; // format 1 predates the field
  assert.equal(formatVersionOf(v1), 1);
  assert.equal(formatVersionOf(current), CAPTURE_FORMAT,
    'a fresh capture must declare the current format, whatever it is -- reading the constant ' +
    'rather than a literal is what stopped this test needing an edit when CL-03 raised it to 3');
  assert.throws(() => diffSnapshots(v1, current),
    new RegExp('refusing to diff format 1 against format ' + CAPTURE_FORMAT),
    'a cross-format diff reports the whole identity block as removed on every scenario -- a fact ' +
    'about which function was called, not about the engine');
  // CONTROL: same-format diffing still works, or the guard is just breaking things.
  assert.equal(diffSnapshots(current, JSON.parse(JSON.stringify(current))).length, 0);
});

// ---------------------------------------------------------------------------
// 7. S3 task 2 -- corpus composition, each entry measured as absent first
// ---------------------------------------------------------------------------

test('S3 task 2: the corpus reaches all three simulation modes', () => {
  const modes = {};
  corpus().forEach(({ plan }) => {
    const m = plan.assumptions.method;
    modes[m] = (modes[m] || 0) + 1;
  });
  ['simple', 'monteCarlo', 'historical'].forEach((m) => {
    assert.ok(modes[m] > 0, 'no ' + m + ' scenario in the corpus; got ' + JSON.stringify(modes));
  });
});

test('S3 task 2: the three canonical sequence-risk start years are all present', () => {
  const starts = corpus()
    .filter((e) => e.plan.assumptions.method === 'historical')
    .map((e) => e.plan.assumptions.historyStart);
  [1929, 1966, 2000].forEach((y) => {
    assert.ok(starts.includes(y),
      y + ' is missing from the historical corpus. Nearby years are not substitutes: the point of ' +
      '1929 is exactly where the crash falls relative to the first withdrawal. Present: ' +
      JSON.stringify(starts.slice().sort()));
  });
});

/* Measured before this was written: 7 corpus scenarios set the flag, 4 carried
   an adjustable debt, and ZERO did both -- so projectDebts()'s re-amortization
   branch had never been crossed by any captured scenario, and the capture
   harness could not have run one anyway (it loaded src/engine.js without the
   debt modules, so the branch threw ReferenceError). */
test('S3 task 2: a scenario has BOTH the ARM flag on and an adjustable debt', () => {
  const both = corpus().filter((e) =>
    e.plan.advanced.armRecastOnReset === true &&
    (e.plan.advanced.debts || []).some((d) => d.rateType === 'adjustable'));
  assert.ok(both.length > 0,
    'the flag and the debt type were varied independently and never coincided, so the ' +
    'armRecastOnReset branch was never reached by a captured scenario');
  both.forEach((e) => {
    const d = e.plan.advanced.debts.find((x) => x.rateType === 'adjustable');
    assert.ok(d.nextRateResetAge >= e.plan.profile.age && d.nextRateResetAge <= e.plan.profile.endAge,
      e.name + ': the reset must fall inside the projection horizon or the flag changes nothing');
  });
});

/* Task 5 criterion 4 requires a bit-identical before/after on exactly these,
   and there is no "before" unless they are captured here. */
test('S3 task 2: both engine-synthesized collision literals appear as user account ids', () => {
  const ids = new Set();
  corpus().forEach((e) => (e.plan.accounts || []).forEach((a) => ids.add(a.id)));
  assert.ok(ids.has('rmd-retained-cash'), 'no corpus scenario collides with "rmd-retained-cash"');
  assert.ok(ids.has('household-cash'), 'no corpus scenario collides with "household-cash"');
});

/* REPAIRED by RB-01. This test was written as a "before" capture: it pinned
   that the collision genuinely FIRES, so a later task-5 repair would have a
   measurable starting point. That repair is this one, so the assertions are
   inverted -- the engine must now derive a collision-free id instead of
   appending a second account under a name already taken.

   The controls are kept exactly as they were, and they still carry the whole
   weight of the test: without them "no duplicate appeared" could equally mean
   the helper stopped appending anything at all. */
test('S3 task 2: the engine no longer synthesizes a DUPLICATE id on collision', () => {
  const engine = loadEngineForTest();
  const account = (over) => Object.assign({
    id: 'a1', name: 'A', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 0,
    contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0,
    annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }, over);
  const dup = (list) => list.length !== new Set(list.map((a) => a.id)).size;

  // asCash=true takes the household-cash branch, which looks for cashHolding.
  const hc = [account({ id: 'household-cash', balance: 250000 })];
  const hcMade = engine.retainExcessRmdCash(hc, 50000, null, true);
  assert.ok(!dup(hc),
    'the synthesized holding must take a collision-free id, not a second "household-cash". ' +
    'Duplicate ids are now an ERROR, so appending one would make the engine emit a plan its ' +
    'own validator refuses.');
  assert.notEqual(hcMade.id, 'household-cash', 'and it must be visibly distinct: got ' + hcMade.id);

  const hcControl = [account({ id: 'household-cash', balance: 250000, cashHolding: true })];
  engine.retainExcessRmdCash(hcControl, 50000, null, true);
  assert.ok(!dup(hcControl),
    'CONTROL: with cashHolding:true the lookup finds it and must NOT duplicate. Without this ' +
    'case, "it duplicated" could just mean the helper always appends.');

  // asCash=false takes the invest branch, which looks for a taxable non-cash account.
  const rc = [account({ id: 'rmd-retained-cash', taxClass: 'preTax', type: 'traditional401k', balance: 3000000 })];
  const rcMade = engine.retainExcessRmdCash(rc, 50000, null, false);
  assert.ok(!dup(rc), 'the invest branch must also derive a collision-free id');
  assert.notEqual(rcMade.id, 'rmd-retained-cash', 'and it must be visibly distinct: got ' + rcMade.id);

  const rcControl = [account({ id: 'rmd-retained-cash', taxClass: 'taxable', balance: 100000 })];
  engine.retainExcessRmdCash(rcControl, 50000, null, false);
  assert.ok(!dup(rcControl), 'CONTROL: a taxable account with that id is found, not duplicated');
});

/* The capture harness was running a PARTIAL engine and nothing could see it.
   This is the regression guard for that. */
test('S3 task 2: the capture harness installs every debt namespace build.js bundles', () => {
  const installed = installDebtModules();
  /* P19: BUNDLED_MODULES, not DEBT_MODULES. The registry now also names the
     modules deliberately kept OUT of the artifact, and installing one of those
     here would let Node tests pass against a graph the browser does not have. */
  const { BUNDLED_MODULES } = require('../build.js');
  assert.deepEqual(installed, BUNDLED_MODULES.map((m) => m.namespace),
    'the harness must install exactly what build.js bundles, read from build.js own registry -- ' +
    'a hand-copied list here is how the two drift apart');
  installed.forEach((ns) => {
    assert.equal(typeof global[ns], 'object', ns + ' is not available to the engine under Node');
  });
});

/* Q37. A capture taken in a NESTED extraction must record null, not the SHA of
 * whatever repository happens to enclose it.
 *
 * `git rev-parse HEAD` walks UP the directory tree, so the first version of
 * gitCommit() returned the OUTER repository's HEAD for any extracted package
 * unpacked inside a checkout — which is where a reviewer would naturally
 * unpack one. Not a missing value: a confidently wrong one, recorded in the
 * manifest as this capture's provenance.
 *
 * The test builds a real nested extraction rather than mocking git, because
 * the defect is entirely about what git does with a working directory. A copy
 * of the tool placed at <nested>/tools/ has ROOT = <nested>, which is not a
 * git toplevel — and git still answers from this repository. */
test('S3 task 2: a capture in a NESTED extraction records null, not the enclosing repo SHA', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

  /* THIS TEST BUILDS ITS OWN OUTER REPOSITORY, and the reason is worth saying
     because the first version did not.

     It used to nest its fixture inside THIS repository and use the ambient
     checkout as its control. That works in a working copy and CANNOT work in a
     delivered package: an auditor extracts the zip somewhere that is not a git
     repository, the control fails, and the test fails for a reason unrelated to
     what it checks.

     Found by extracting the S2 closure package and running the gate inside it --
     one failure there against zero in the repository it was cut from. That is
     the second time a capture test could not pass outside a checkout (b6a18f1
     was the first), which is what makes a self-contained fixture the repair
     rather than one more environment assumption. */
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'nested-provenance-'));
  const outer = path.join(scratch, 'outer-repo');
  const nested = path.join(outer, 'extracted-tree');
  const nestedTools = path.join(nested, 'tools');

  try {
    fs.mkdirSync(nestedTools, { recursive: true });
    git(['init', '--quiet', 'outer-repo'], scratch);
    git(['config', 'user.email', 'test@example.invalid'], outer);
    git(['config', 'user.name', 'Provenance Fixture'], outer);
    fs.writeFileSync(path.join(outer, 'README'), 'outer repository');
    git(['add', 'README'], outer);
    git(['commit', '--quiet', '-m', 'outer'], outer);

    fs.copyFileSync(
      path.join(__dirname, '..', 'tools', 'capture-baseline.js'),
      path.join(nestedTools, 'capture-baseline.js'));

    /* CONTROL, and it is what makes the assertion below mean anything: git DOES
       resolve a commit from that directory. Returning null is a decision the
       guard makes, not an accident of git failing. */
    assert.match(git(['rev-parse', 'HEAD'], nested), /^[0-9a-f]{40}$/,
      'CONTROL: git must answer from the nested directory, or this test proves nothing');
    assert.notEqual(path.resolve(git(['rev-parse', '--show-toplevel'], nested)),
      path.resolve(nested),
      'CONTROL: the nested directory must NOT be its own git toplevel');

    // eslint-disable-next-line global-require, import/no-dynamic-require
    const nestedTool = require(path.join(nestedTools, 'capture-baseline.js'));
    assert.equal(nestedTool.gitCommit(), null,
      'a nested extraction recorded ' + JSON.stringify(nestedTool.gitCommit()) + ' as its own ' +
      'provenance. That is the ENCLOSING repository HEAD and has nothing to do with the tree ' +
      'being captured. Provenance that is absent should say so; provenance that is wrong is ' +
      'worse than none.');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  /* ...and the ordinary case still holds WHERE THERE IS ONE. In a delivered
     package there is no checkout and gitCommit() returns null -- the same guard
     doing its job, not a different outcome. */
  const root = path.join(__dirname, '..');
  let ownSha = null;
  try {
    if (path.resolve(git(['rev-parse', '--show-toplevel'], root)) === path.resolve(root)) {
      ownSha = git(['rev-parse', 'HEAD'], root);
    }
  } catch (e) { ownSha = null; }
  assert.equal(gitCommit(), ownSha, ownSha
    ? 'the guard must not have broken the ordinary case: a real checkout still records its HEAD'
    : 'outside a checkout -- a delivered package -- provenance must be null, never borrowed');
});

// ---------------------------------------------------------------------------
// S3-03 -- the source inventory must describe what the capture actually ran on
//
// meta.sourceHashes was a hand-written list of four files, while loadEngine()
// installs every BUNDLED debt module and the engine calls into them. Editing
// src/debt-amortization.js -- whose monthlyPayment() projectDebts() genuinely
// calls -- moved nothing in the manifest, so a capture could claim to describe
// sources it had left out.
// ---------------------------------------------------------------------------

test('S3-03: the capture source inventory covers every bundled debt module, derived not hand-listed', () => {
  const { capture } = require('../tools/capture-baseline.js');
  const { BUNDLED_MODULES, EXCLUDED_MODULES } = require('../build.js');

  /* These four sites passed `{ limit: 1 }` until a re-audit pointed out that
     capture() has no `limit` option -- the word does not appear in the tool --
     so each was already running the full corpus while reading as if it were
     not. Dropped rather than implemented: inventing an option to match a
     caller's assumption is the wrong direction, and a provenance check wants
     the real manifest anyway. The cost is a second or so per site. */
  const inventory = capture().meta.sourceHashes;
  const names = Object.keys(inventory);

  /* The four that were always there. */
  ['src/engine.js', 'src/app-shell.html', 'src/scenario-validator.js', 'build.js']
    .forEach((f) => assert.ok(names.includes(f), f + ' must still be inventoried'));

  /* And the ones that were not. Read from the registry rather than a literal
     list, so this test cannot drift from what the harness actually loads --
     which is the defect it exists to catch. */
  assert.ok(BUNDLED_MODULES.length > 0, 'precondition: something must be bundled');
  BUNDLED_MODULES.forEach((m) => {
    assert.ok(names.includes('src/' + m.file),
      'src/' + m.file + ' is loaded by installDebtModules() and must be inventoried');
  });

  /* The other half: an EXCLUDED module is not loaded, so hashing it would
     describe an input this capture did not have. */
  EXCLUDED_MODULES.forEach((m) => {
    assert.ok(!names.includes('src/' + m.file),
      'src/' + m.file + ' is excluded from the bundle and must not appear as a capture input');
  });

  names.forEach((f) => assert.match(inventory[f], /^[0-9a-f]{64}$/, f + ' must carry a sha256'));
});

test('S3-03: changing a loaded debt module changes its manifest entry, even when no fixture executes that branch', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { capture } = require('../tools/capture-baseline.js');

  const target = path.join(__dirname, '..', 'src', 'debt-amortization.js');
  const original = fs.readFileSync(target, 'utf8');
  const before = capture().meta.sourceHashes;

  /* The edit is seen by THIS process only, through fs.readFileSync (the read sourceHashes() hashes), as
     capture-boundary 5.4 does. It used to be written to src/debt-amortization.js on disk for the length of a
     capture, and the gate runs test files in parallel: any capture in another process that spanned the window
     saw the file change, and capture-boundary 5.4 failed in CI with changedDuringCapture ['build.js',
     'src/debt-amortization.js'] (2026-10-04, runs 37185921182 and 37187286021, R48's branch). */
  const real = fs.readFileSync;
  const edit = '\n/* S3-03 provenance probe */\n';
  try {
    /* A COMMENT-ONLY edit. The card is specific that byte provenance must move
       even when financial output does not -- the two are independent claims,
       and a manifest that only notices behaviour changes is not a manifest. */
    fs.readFileSync = function (p, ...rest) {
      const out = real.call(this, p, ...rest);
      if (typeof p !== 'string' || path.resolve(p) !== target) return out;
      return typeof out === 'string' ? out + edit : Buffer.concat([out, Buffer.from(edit)]);
    };
    const after = capture().meta.sourceHashes;
    assert.equal(real(target, 'utf8'), original, 'the file on disk is never edited, so no other process can see the probe');

    assert.notEqual(after['src/debt-amortization.js'], before['src/debt-amortization.js'],
      'the edited module must have a different hash');

    /* Nothing else may move: a manifest that changes everything when one file
       changes is as useless as one that changes nothing. */
    Object.keys(before).forEach((f) => {
      if (f === 'src/debt-amortization.js') return;
      assert.equal(after[f], before[f], f + ' was untouched and must hash the same');
    });
  } finally {
    fs.readFileSync = real;
  }

  /* Control: restoring the file restores the hash, so the check above was
     measuring the edit and not the clock. */
  const restored = capture().meta.sourceHashes;
  assert.equal(restored['src/debt-amortization.js'], before['src/debt-amortization.js'],
    'restoring the source must restore its hash exactly');
});

// ---------------------------------------------------------------------------
// -0 is a distinction the harness preserves -- promoted from the S3 prewrites
// ---------------------------------------------------------------------------
//
// PROMOTED 2026-09-12, S4 task 2b.2f. These two assertions lived in
// tests/s3-prewrite/harness-api.prewrite.test.js, a directory the release gate
// EXEMPTED as "red on purpose until S3 lands". S3 landed and both went green --
// and because of the exemption, the repair they witness had NO guard in npm test:
// no registered test exercised -0 through capture or differences(). An
// exemption whose reason had expired had quietly become the only guard for a
// repaired defect.
//
// The defect (RA-04 family): JSON.stringify(-0) is "0", so without canonical()'s
// tag a row that flipped sign hashes identically to one that did not; and
// differences() had an `a === b` fast path in front of its own Object.is check,
// so the one case that check exists for could never reach it.

test('capture-baseline: 0 and -0 capture to DIFFERENT hashes -- canonical() tags -0', () => {
  const { captureEntry } = require('../tools/capture-baseline.js');
  const zero = captureEntry('probe', { rows: [{ total: 0 }] });
  const negZero = captureEntry('probe', { rows: [{ total: -0 }] });
  assert.notEqual(zero.hash, negZero.hash,
    '0 and -0 capture to the same hash (' + zero.hash.slice(0, 16) + '...), so a sign flip would diff as IDENTICAL');
  // Control: the tag is stable -- it does not make a value differ from itself.
  assert.equal(captureEntry('probe', { rows: [{ total: -0 }] }).hash, negZero.hash, 'a -0 capture must be reproducible');
});

test('capture-baseline: differences() reports 0 -> -0 -- its Object.is check is reachable', () => {
  assert.deepEqual(differences({ total: 0 }, { total: -0 }, ''), [{ path: 'total', before: 0, after: -0 }],
    'differences() must report a sign flip; an === fast path in front of Object.is makes that impossible');
  // Controls: NaN still equals NaN, and equal values report nothing.
  assert.deepEqual(differences({ total: NaN }, { total: NaN }, ''), []);
  assert.deepEqual(differences({ total: 5 }, { total: 5 }, ''), []);
});

// ---------------------------------------------------------------------------
// S4 task 3 -- two raw-domain gaps found while qualifying the instrument
// ---------------------------------------------------------------------------
//
// Found 2026-09-13 by probe, before the corpus invariant was built. Both are
// repaired in tools/capture-baseline.js because each is the DECIDED raw-domain
// policy -- refuse what the capture cannot represent, before anything reads it
// (RC-05, CR2-04, FC-02, FCR-02) -- applied to a shape the guard did not know.
// Neither shape occurs in the real corpus (measured), so no capture moves.

function trapRecorder() {
  const calls = [];
  const handler = {};
  ['get', 'set', 'has', 'deleteProperty', 'ownKeys', 'getOwnPropertyDescriptor', 'defineProperty',
    'getPrototypeOf', 'setPrototypeOf', 'isExtensible', 'preventExtensions'].forEach((trap) => {
    handler[trap] = (...args) => { calls.push(trap); return Reflect[trap](...args); };
  });
  return { calls, handler };
}

test('S4 task 3: a Proxy result is refused before any trap runs -- validation and capture cannot read different values', () => {
  const { captureEntry } = require('../tools/capture-baseline.js');
  /* Measured on the unrepaired guard: a Proxy whose successRate getter counted
     its reads was ACCEPTED, read twice, and stored 2 while validation saw 1. A
     Proxy array stored [200, 2] for an index that served 100 on its first read.
     A Proxy is invisible to the checks the guard already had -- prototype,
     descriptors and Array.isArray all answer as the target would -- so the
     value validated was not the value stored: FCR-02's defect by another door. */
  const root = trapRecorder();
  assert.throws(
    () => captureEntry('proxy-root', new Proxy({ successRate: 100, rows: [{ age: 50, total: 1 }] }, root.handler)),
    /Proxy at proxy-root/);
  assert.deepEqual(root.calls, [], 'the refusal must come before any trap: a trap that ran is a value that was read');

  const nested = trapRecorder();
  assert.throws(
    () => captureEntry('proxy-rows', { successRate: 100, rows: new Proxy([{ age: 50, total: 1 }], nested.handler) }),
    /Proxy at proxy-rows\.rows/);
  assert.deepEqual(nested.calls, [], 'a nested Proxy is refused before any trap too');

  // Control: the same shapes, unproxied, capture normally.
  assert.doesNotThrow(() => captureEntry('plain', { successRate: 100, rows: [{ age: 50, total: 1 }] }));
});

test('S4 task 3: capture() refuses a plan JSON cannot carry faithfully, instead of running a different plan', () => {
  /* capture() hands the engine runPlan(JSON.parse(JSON.stringify(plan))), and
     records corpusInputHash over the plan BEFORE that round trip. Measured on
     the unrepaired tool: a generated plan with returnRate NaN ran as
     returnRate null, while the input hash described the NaN plan -- so the
     capture's own input identity named a plan that never ran, and S3-01's
     comparability refusal leans on exactly that hash. */
  const generator = require('./lib/scenario-generator.js');
  const original = generator.generateScenario;
  generator.generateScenario = (defaultPlan, seed) => {
    const plan = original(defaultPlan, seed);
    if (seed === 3) plan.assumptions.returnRate = NaN;
    return plan;
  };
  try {
    assert.throws(() => capture(), (e) => {
      assert.equal(e.code, 'CAPTURE_INPUT_UNFAITHFUL', 'refused for the wrong reason, or not refused: ' + String(e.message).split('\n')[0]);
      assert.match(e.message, /seed:3\.assumptions\.returnRate/);
      return true;
    }, 'a plan carrying NaN must be refused before the round trip turns it into null');
  } finally {
    generator.generateScenario = original;
  }
});

test('S4 task 3: the plan-fidelity guard refuses each value JSON would change, and passes every real corpus plan', () => {
  const { assertJsonFaithful } = require('../tools/capture-baseline.js');
  assert.equal(typeof assertJsonFaithful, 'function', 'the plan-fidelity guard is not exported');
  const refuse = (label, plan, pattern) => assert.throws(() => assertJsonFaithful(plan, 'probe'), (e) => {
    assert.equal(e.code, 'CAPTURE_INPUT_UNFAITHFUL', label + ': ' + e.message);
    assert.match(e.message, pattern, label);
    return true;
  }, label);
  refuse('NaN', { a: NaN }, /probe\.a carries NaN/);
  refuse('Infinity', { a: [1, Infinity] }, /probe\.a\[1\] carries Infinity/);
  refuse('-0', { a: -0 }, /probe\.a carries -0/);
  refuse('an undefined value', { a: undefined }, /probe\.a carries undefined/);
  refuse('an undefined element', { a: [undefined] }, /probe\.a\[0\] carries undefined/);
  refuse('a function', { a() {} }, /function/);
  refuse('a Date', { a: new Date(0) }, /Date/);
  refuse('a hole', { a: [1, , 3] }, /hole/); // eslint-disable-line no-sparse-arrays
  refuse('a Proxy', { a: new Proxy({}, {}) }, /Proxy/);

  // Controls: JSON-ordinary values pass, and so does every plan the real corpus holds.
  assert.doesNotThrow(() => assertJsonFaithful({ a: 0, b: false, c: '', d: null, e: [], f: {} }, 'probe'));
  corpus().forEach(({ name, plan }) => assert.doesNotThrow(() => assertJsonFaithful(plan, name), name));
});

test('S4 task 3: the CLI names a refused plan as a refused plan, not as an incomplete corpus', () => {
  const { execFileSync } = require('node:child_process');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const hook = path.join(os.tmpdir(), 'capture-baseline-nan-plan-hook.js');
  fs.writeFileSync(hook, [
    "'use strict';",
    "const Module = require('node:module');",
    'const load = Module._load;',
    'Module._load = function (request) {',
    '  const m = load.apply(this, arguments);',
    "  if (/scenario-generator/.test(request) && m && typeof m.generateScenario === 'function' && !m.__nanWrapped) {",
    '    const generate = m.generateScenario;',
    '    m.generateScenario = (d, seed) => { const p = generate(d, seed); if (seed === 3) p.assumptions.returnRate = NaN; return p; };',
    '    m.__nanWrapped = true;',
    '  }',
    '  return m;',
    '};',
  ].join('\n'));
  const out = path.join(os.tmpdir(), 'capture-baseline-nan-plan.json');
  if (fs.existsSync(out)) fs.unlinkSync(out);
  let code = 0;
  let stdout = '';
  try {
    stdout = execFileSync(process.execPath, ['--require', hook, path.join(__dirname, '..', 'tools', 'capture-baseline.js'), 'capture', out],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    code = e.status === undefined ? 1 : e.status;
    stdout = String(e.stdout || '') + String(e.stderr || '');
  }
  assert.notEqual(code, 0, 'a refused plan must not exit 0. Output was:\n' + stdout);
  assert.match(stdout, /CAPTURE INPUT REFUSED/);
  assert.match(stdout, /seed:3\.assumptions\.returnRate/);
  assert.doesNotMatch(stdout, /CORPUS INCOMPLETE/, 'a malformed plan is not a missing scenario');
  assert.doesNotMatch(stdout, /^Captured \d+ scenarios/m);
  assert.equal(fs.existsSync(out), false, 'no baseline may be written');
});
