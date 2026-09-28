'use strict';

/*
 * S3 task 9 (Track A) -- the Scenario/Result schema catalogue and its drift
 * test, plus the scenarioSchemaVersion:1 migration test.
 *
 * THE DRIFT TEST IS THE POINT. A catalogue nobody checks is documentation, and
 * documentation of an implicit schema in a repository that moves this fast is
 * wrong within two sprints. What earns its keep is a committed snapshot that
 * FAILS when a field is added or removed anywhere in either shape, naming the
 * field.
 *
 * This project has two worked examples of the failure that guards against:
 * advanced.retainedCashOrder was added to defaultPlan and nobody added it to
 * the generator's allowlist, so it was blind from birth; and S3 task 2's
 * FIELD_COUNTS was measured against one `simple` scenario and could not see
 * that monteCarlo returns a different shape. Both are "a field moved and
 * nothing noticed".
 *
 * NO VALIDATOR CHANGE (criterion 5). Where the catalogue reveals a gap it is
 * recorded, not repaired -- see SPRINT_QUESTIONS.md Q36.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  describe: describeShape, leafPaths, buildCatalogue, readSnapshot, liveCatalogue, SNAPSHOT_PATH,
} = require('./lib/schema-catalogue.js');
const { fieldCountsFor, installDebtModules, corpus } = require('../tools/capture-baseline.js');
const golden = require('./lib/golden-scenario-defs.js');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(
  shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
installDebtModules();
const engine = require('../src/engine.js');
const defaultPlan = golden.extractDefaultPlan(shell);
const clone = (v) => JSON.parse(JSON.stringify(v));

let cached = null;
const liveAll = () => (cached = cached || liveCatalogue());
const live = () => liveAll().catalogue;
/* RB-09: the catalogue now walks a POPULATED specimen rather than the bare
   defaultPlan, so record fields are inside the contract. Tests that check the
   walk must compare against the same specimen. */
const liveSpecimen = () => liveAll().specimenPlan;

// ---------------------------------------------------------------------------
// Criterion 1 -- derived, not transcribed
// ---------------------------------------------------------------------------

test('Track A: the catalogue is derived from the live sources, not hand-listed', () => {
  const catalogue = live();

  /* Every scenario leaf must correspond to something actually in defaultPlan.
     A hand-written catalogue drifts by containing fields that no longer exist;
     a derived one cannot. */
  const derived = leafPaths(describeShape(liveSpecimen()));
  assert.deepEqual(catalogue.scenario.leaves, derived,
    'the catalogue must equal a fresh walk of the live specimen plan');

  /* The specimen must still BE defaultPlan in every respect but its populated
     collections -- otherwise the catalogue could drift from the real default
     while still agreeing with itself, which is the failure this file exists
     to catch. */
  const defaultLeaves = leafPaths(describeShape(defaultPlan));
  const scalarLeaves = defaultLeaves.filter((l) => !l.includes('(empty by default)'));
  scalarLeaves.forEach((leaf) => {
    assert.ok(catalogue.scenario.leaves.includes(leaf),
      leaf + ' is in defaultPlan but missing from the catalogue -- the specimen must EXTEND the ' +
      'default, never replace it');
  });
  assert.equal(catalogue.scenario.leafCount, derived.length);
  assert.ok(derived.length > 100, 'expected a substantial schema; got ' + derived.length + ' leaves');

  // Spot-check that real, current fields are present -- including the two that
  // arrived recently and caught the project out.
  ['advanced.retainedCashOrder : string', 'advanced.surplusPolicy : string']
    .forEach((leaf) => {
      assert.ok(catalogue.scenario.leaves.includes(leaf),
        leaf + ' is missing from the catalogue, so the walk is not reaching the live default');
    });
});

// ---------------------------------------------------------------------------
// Criterion 2 -- the drift test, with a control proving it can detect drift
// ---------------------------------------------------------------------------

test('Track A: the committed catalogue matches the live shapes', () => {
  assert.ok(fs.existsSync(SNAPSHOT_PATH), 'the catalogue snapshot must be committed');
  const snapshot = readSnapshot();
  const catalogue = live();

  /* Compare the flat leaf list FIRST: a nested object diff names the wrong
     level and prints the whole tree, while this names the field. */
  const added = catalogue.scenario.leaves.filter((l) => !snapshot.scenario.leaves.includes(l));
  const removed = snapshot.scenario.leaves.filter((l) => !catalogue.scenario.leaves.includes(l));
  assert.deepEqual({ added, removed }, { added: [], removed: [] },
    'the Scenario schema moved. That is not necessarily wrong -- but it must be a DELIBERATE act ' +
    'with a diff someone read, so regenerate with:\n' +
    '    node tests/lib/schema-catalogue.js --write\n' +
    '  and check that anything added is also on the generator allowlist ' +
    '(tests/lib/scenario-generator.js), or it is blind from birth the way ' +
    'advanced.retainedCashOrder was.');

  assert.equal(JSON.stringify(catalogue.scenario.shape), JSON.stringify(snapshot.scenario.shape),
    'a leaf changed TYPE without being added or removed');
  assert.equal(JSON.stringify(catalogue.result), JSON.stringify(snapshot.result),
    'the Result schema moved; same regeneration step');
});

test('Track A: CONTROL -- the drift test detects an added and a removed field', () => {
  /* Without this, "the catalogue matches" could mean the comparison is not
     comparing. Both directions, because a test that only notices additions
     would let a deleted field through silently. */
  const base = describeShape(defaultPlan);
  const baseLeaves = leafPaths(base);

  const withExtra = clone(defaultPlan);
  withExtra.advanced.somethingBrandNew = false;
  const extraLeaves = leafPaths(describeShape(withExtra));
  assert.ok(extraLeaves.length === baseLeaves.length + 1, 'the added field must appear');
  assert.ok(extraLeaves.filter((l) => !baseLeaves.includes(l))
    .some((l) => l.startsWith('advanced.somethingBrandNew')),
  'and the drift must NAME it, not just change a count');

  const withMissing = clone(defaultPlan);
  delete withMissing.advanced.networthOn;
  const missingLeaves = leafPaths(describeShape(withMissing));
  assert.ok(baseLeaves.filter((l) => !missingLeaves.includes(l))
    .some((l) => l.startsWith('advanced.networthOn')),
  'a REMOVED field must be detected too');

  // A type change with no add/remove must also be visible.
  const retyped = clone(defaultPlan);
  retyped.advanced.insurance = 'not a number any more';
  assert.notEqual(
    JSON.stringify(describeShape(retyped)), JSON.stringify(base),
    'a leaf changing type must move the shape even though the leaf list is the same length');
});

// ---------------------------------------------------------------------------
// Criterion 3 -- result counts from ONE shared constant
// ---------------------------------------------------------------------------

test('Track A: the result half agrees with FIELD_COUNTS, read from capture-baseline', () => {
  /* Task 2 established these figures and task 9 must read them from there, or
     the two drift apart -- which is precisely the defect this file exists to
     catch, so getting it wrong here would be self-refuting. */
  const catalogue = live();
  /* RB-09 added a __invalid variant, which is a result SHAPE rather than a
     simulation mode and so has no FIELD_COUNTS entry. */
  const modes = Object.keys(catalogue.result).filter((k) => k !== '__invalid');
  assert.ok(modes.length >= 3, 'expected every simulation mode; got ' + JSON.stringify(modes));
  assert.ok(catalogue.result.__invalid, 'and the invalid-result variant must be catalogued');
  modes.forEach((mode) => {
    const expected = fieldCountsFor(mode);
    assert.equal(catalogue.result[mode].topLevelCount, expected.topLevel,
      mode + ': catalogue says ' + catalogue.result[mode].topLevelCount +
      ' top-level fields, FIELD_COUNTS says ' + expected.topLevel);
    assert.equal(catalogue.result[mode].rowCount, expected.row,
      mode + ': catalogue says ' + catalogue.result[mode].rowCount +
      ' row fields, FIELD_COUNTS says ' + expected.row);
  });
});

// ---------------------------------------------------------------------------
// Criterion 4 -- the migration test, through the REAL normalizedPlan()
// ---------------------------------------------------------------------------

/* normalizedPlan() lives in src/app-shell.html, which no S3 task may edit
   (ground rule 9, safety property 10(d)), and the app exposes no hook for it.
   So it is SLICED OUT of the shell source and evaluated -- the same technique
   archive/s3-prewrites/worker-helper-vs-real-build.prewrite.test.js (archived in
   S4 task 2b.2f; tests/s3-prewrite/ before that) used for
   buildWorkerSource(). Reimplementing it here would be a second definition of
   the migration, which is the mistake this project keeps recording.

   Located by searching for the declaration text, never by line number
   (ground rule 19). */
function sliceLine(source, opening) {
  const start = source.indexOf(opening);
  assert.ok(start >= 0, 'could not find ' + JSON.stringify(opening) + ' in src/app-shell.html');
  const end = source.indexOf('\n', start);
  return source.slice(start, end < 0 ? undefined : end);
}

function sliceBalanced(source, opening) {
  const start = source.indexOf(opening);
  assert.ok(start >= 0, 'could not find ' + JSON.stringify(opening) + ' in src/app-shell.html');
  let i = source.indexOf('{', start);
  let depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  return source.slice(start, source.indexOf(';', i) + 1);
}

function normalizerContext() {
  const context = vm.createContext({
    clone: engine.clone,
    accountType: engine.accountType,
    generateScenarioId: engine.generateScenarioId,
    SCENARIO_SCHEMA_VERSION: engine.SCENARIO_SCHEMA_VERSION,
    defaultPlan: clone(defaultPlan),
    Math, Object, Array, Number, String, JSON, Boolean,
  });
  vm.runInContext([
    sliceBalanced(shell, 'var OTHER_ASSET_TYPES='),
    sliceLine(shell, 'var DEBT_TYPES='),
    sliceLine(shell, 'function uid(prefix)'),
    sliceLine(shell, 'function normalizeAccount(a)'),
    sliceLine(shell, 'function normalizeOtherAsset(a)'),
    sliceLine(shell, 'function normalizeDebt(d)'),
    sliceLine(shell, 'function normalizedPlan(p)'),
  ].join('\n'), context);
  return context;
}

function normalize(plan) {
  const context = normalizerContext();
  context.__input = clone(plan);
  // Back through JSON to leave the vm realm -- this project has hit
  // cross-realm prototype confusion three times.
  return JSON.parse(JSON.stringify(vm.runInContext('normalizedPlan(__input)', context)));
}

test('Track A: a scenarioSchemaVersion:1 scenario loads, normalizes and runs to completion', () => {
  /* A partial saved scenario of the kind a real localStorage entry holds --
     most sections absent, and carrying the pre-2.1.0 scalar fields.
     S5 2b (2026-09-14): it ends at 74, not 80. The migrated mortgage carries
     normalizeDebt()'s zero payment and payoffAge 75, and from 2b that forced
     payoff is a calculation error, so at 80 this scenario could no longer run
     to ordinary rows. This test is about the migration, so the scenario stops
     short of the payoff. The same scenario at 80 is the witness that follows. */
  const legacy = {
    scenarioSchemaVersion: 1,
    name: 'Legacy scenario',
    setupComplete: true,
    profile: { age: 55, retireAge: 60, endAge: 74 },
    accounts: [{ type: 'taxable', balance: 500000 }],
    advanced: { home: 350000, debt: 120000 },
  };

  const normalized = normalize(legacy);

  // Every top-level section defaultPlan defines must now be present.
  Object.keys(defaultPlan).forEach((key) => {
    assert.notEqual(normalized[key], undefined,
      'normalizedPlan must fill in the missing section ' + key);
  });
  assert.equal(normalized.scenarioSchemaVersion, engine.SCENARIO_SCHEMA_VERSION);
  assert.ok(normalized.id, 'an id must be assigned');

  /* THE v2.1.0 MIGRATION, which is the substance of this test. The legacy
     scalars advanced.home and advanced.debt become records in the
     otherAssets and debts arrays that superseded them. */
  assert.equal(normalized.advanced.v210Migrated, true, 'the migration must be marked done');
  const residence = normalized.advanced.otherAssets.filter((a) => a.type === 'primaryResidence')[0];
  assert.ok(residence, 'advanced.home must migrate into an otherAssets record');
  assert.equal(residence.value, 350000);
  const mortgage = normalized.advanced.debts.filter((d) => d.type === 'mortgage')[0];
  assert.ok(mortgage, 'advanced.debt must migrate into a debts record');
  assert.equal(mortgage.balance, 120000);

  // And it runs.
  const result = engine.runPlan(clone(normalized));
  assert.ok(!result.calculationError,
    'a migrated v1 scenario must run without a calculation error; got ' + result.calculationErrorCode);
  assert.ok(result.rows.length > 0, 'and produce rows');
  assert.equal(Object.keys(result).length, fieldCountsFor(normalized.assumptions.method).topLevel);

  /* CONTROL: normalizing twice is idempotent apart from the id, so the
     migration cannot double-apply and create a second residence. */
  const twice = normalize(normalized);
  assert.equal(twice.advanced.otherAssets.length, normalized.advanced.otherAssets.length,
    'normalizing an already-migrated plan must not add another residence');
  assert.equal(twice.advanced.debts.length, normalized.advanced.debts.length);
});

test('Q43: a v1 debt scalar migrates into the flagged case, so the migrated scenario is refused at 75, not silently charged $438,774', () => {
  /* S5 2b. The v2.1.0 migration turns a debt scalar into a mortgage record,
     and normalizeDebt() gives it a payment of 0 and payoffAge 75: the case the
     validator's PAYMENT_BELOW_INTEREST warning names. The validator runs before
     the normalizer on import, so it never sees that zero. Before 2b this legacy
     scenario reported "ok" and silently took the grown balance at 75. The Track
     A tests around this one end their legacy scenarios at 74, so they keep
     testing the migration itself; this is the same scenario at 80. */
  const normalized = normalize({
    scenarioSchemaVersion: 1, name: 'Legacy scenario', setupComplete: true,
    profile: { age: 55, retireAge: 60, endAge: 80 },
    accounts: [{ type: 'taxable', balance: 500000 }],
    advanced: { home: 350000, debt: 120000 },
  });
  const mortgage = normalized.advanced.debts.filter((d) => d.type === 'mortgage')[0];
  assert.ok(mortgage && mortgage.paymentMonthly === 0 && mortgage.payoffAge === 75 && mortgage.rate > 0,
    'premise: the migrated mortgage carries the normalizer\'s zero payment and payoffAge 75, on a positive rate');
  const result = engine.runPlan(clone(normalized));
  assert.equal(result.status, 'calculation_error',
    'the migrated scenario reported "ok" and silently took $438,774 at 75');
  assert.equal(result.calculationErrorCode, 'DEBT_ZERO_PAYMENT_FORCED_PAYOFF');
  const issue = (result.issues || []).find((i) => i.code === 'DEBT_ZERO_PAYMENT_FORCED_PAYOFF');
  assert.equal(Math.round(issue.state.forced), 438774, 'the amount forced out is the grown $120,000');
});

test('Track A: an already-migrated scenario does not re-migrate its legacy scalars', () => {
  /* The flag is what stops it, so assert the flag is load-bearing: with
     v210Migrated already true the scalars are ignored even when non-zero. */
  const alreadyDone = {
    scenarioSchemaVersion: 1, setupComplete: true,
    profile: { age: 55, retireAge: 60, endAge: 80 },
    accounts: [{ type: 'taxable', balance: 500000 }],
    advanced: { home: 350000, debt: 120000, v210Migrated: true },
  };
  const normalized = normalize(alreadyDone);
  assert.deepEqual(normalized.advanced.otherAssets, [],
    'with v210Migrated already set, advanced.home must not migrate again');
  assert.deepEqual(normalized.advanced.debts, []);
});

// ---------------------------------------------------------------------------
// Criterion 5 -- what the catalogue reveals is RECORDED, not repaired
// ---------------------------------------------------------------------------

test('P8: an unknown advanced key is reported, and the allowlist cannot drift from the default', () => {
  /* REPLACES the Q36 recording test, exactly as that test instructed when it
     was written: "close Q36 and delete this test rather than leaving a pin on
     the old behaviour."

     The gap it recorded: `advanced` accepted any key at all, so a TYPO IN A
     REAL FIELD -- networthOn as networthon -- was accepted in silence while
     the real toggle kept its default and net worth quietly omitted the house. */
  const { validateScenario, ADVANCED_KNOWN_KEYS } = require('../src/scenario-validator.js');
  const plan = clone(corpus()[0].plan);
  plan.advanced.thisFieldDoesNotExistAnywhere = 12345;

  const outcome = validateScenario(clone(plan));
  const mentions = outcome.issues.filter((i) =>
    String(i.path || '').includes('thisFieldDoesNotExistAnywhere') ||
    String(i.message || '').includes('thisFieldDoesNotExistAnywhere'));
  assert.equal(mentions.length, 1, 'the unknown key must be reported exactly once');
  assert.equal(mentions[0].severity, 'WARNING',
    'WARNING for one round, per the transitional discipline Q23 and armRecastOnReset both used: ' +
    'reviewImportedScenarios() refuses on any ERROR, and saved plans carrying stray keys import ' +
    'fine today');
  assert.equal(outcome.valid, true, 'so the scenario still validates overall this round');

  /* The realistic case, which is the whole reason this exists. */
  const typo = clone(corpus()[0].plan);
  delete typo.advanced.networthOn;
  typo.advanced.networthon = true;
  assert.ok(validateScenario(typo).issues.some((i) => String(i.path || '').includes('networthon')),
    'a misspelled real field must be reported -- this is the case that silently drops a house ' +
    'out of net worth');

  /* NO DRIFT. The allowlist is declared in the validator rather than harvested,
     so this asserts it against the live default. Q38 is why: a list derived by
     regex from another file silently lost an entry and rewrote a whole corpus. */
  assert.deepEqual([...ADVANCED_KNOWN_KEYS].sort(), Object.keys(defaultPlan.advanced).sort(),
    'ADVANCED_KNOWN_KEYS must equal defaultPlan.advanced exactly. A field added to the default ' +
    'without being added here would be reported as unknown on every plan that carries it.');

  /* Q25 rides on that equality rather than on a second judgement call: home, ' +
     debt, homeGrowth, insurance and legacy are still in the default because the
     LOADER migrates them, so they are known keys automatically. */
  ['home', 'debt', 'homeGrowth', 'insurance', 'legacy'].forEach((k) => {
    assert.ok(ADVANCED_KNOWN_KEYS.includes(k),
      k + ' is migrated by the loader (Q25) and must not be reported as unknown');
  });

  /* CONTROL: a known key with a bad value is still rejected, so the above is
     about unknown keys and not about a validator that says nothing. */
  const badValue = clone(corpus()[0].plan);
  badValue.advanced.surplusPolicy = 'notAPolicy';
  assert.equal(validateScenario(badValue).valid, false,
    'CONTROL: a known key with a bad value must be rejected');
});

test('Track A: advanced.home and advanced.debt are inert to the ENGINE but live to the LOADER', () => {
  /* A refinement of Q25 and of S3 task 1's "inert" classification, both of
     which are correct as stated and easy to over-read. Grep says these two
     scalars appear zero times in src/engine.js and zero times in
     src/scenario-validator.js -- so varying them cannot move runPlan() output,
     which is why task 1 was right not to unblind them.
     But normalizedPlan() reads BOTH, and turns them into records that DO move
     output. They are not vestigial; they are migration inputs. */
  assert.equal(fs.readFileSync(path.join(ROOT, 'src', 'engine.js'), 'utf8')
    .split('advanced.home').length - 1, 0, 'advanced.home must still be unread by the engine');

  /* S5 2b (2026-09-14): both scenarios end at 74, not 80, for the reason the
     migration test gives: at 80 the migrated mortgage's forced payoff is a
     calculation error, and an invalid result carries no rows to compare. */
  const withScalars = normalize({
    scenarioSchemaVersion: 1, setupComplete: true,
    profile: { age: 55, retireAge: 60, endAge: 74 },
    accounts: [{ type: 'taxable', balance: 500000 }],
    advanced: { home: 350000, debt: 120000, networthOn: true },
  });
  const withoutScalars = normalize({
    scenarioSchemaVersion: 1, setupComplete: true,
    profile: { age: 55, retireAge: 60, endAge: 74 },
    accounts: [{ type: 'taxable', balance: 500000 }],
    advanced: { home: 0, debt: 0, networthOn: true },
  });
  const a = engine.runPlan(clone(withScalars));
  const b = engine.runPlan(clone(withoutScalars));
  assert.notEqual(a.rows[0].networth, b.rows[0].networth,
    'through normalizedPlan(), advanced.home and advanced.debt DO move output. A corpus that ' +
    'calls runPlan() directly bypasses the loader, which is why they measure as inert.');
});
