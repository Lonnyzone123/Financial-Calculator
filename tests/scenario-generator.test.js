'use strict';

// Self-tests for tests/lib/scenario-generator.js.
//
// These assert things about the GENERATOR, not about the engine: that a
// scenario is a pure function of its seed, that generated scenarios are valid
// by construction, that the ranges really do come from the validator's own
// checkRange bounds, that the corpus is structurally varied rather than
// jittered, and that the near-miss mode is bounded and omits exactly what it
// claims to omit.
//
// The near-miss section is REPORT-ONLY about the validator's verdicts, per
// the sprint's ground rule 11: a near miss that slips through is a finding to
// record with its seed, never something to repair unattended.
//
// WHY THE "NO WARNINGS EITHER" TEST MATTERS, and is not belt-and-braces: the
// validator classes most range violations as a WARNING, and `valid` is false
// only on an ERROR. So a generator that drew basisPct at 150 or correlation at
// 2.5 would still produce scenarios that "pass". Verified directly against this
// generator's own output (the claim-age line updated 2026-09-14, when a claim
// age outside 62-70 became an ERROR):
//
//   basisPct = 150      -> valid=true, OUT_OF_RANGE@accounts[0].basisPct
//   ssClaim = 75        -> valid=false, SS_CLAIM_OUT_OF_RANGE@retirement.ssClaim
//   correlation = 2.5   -> valid=true, OUT_OF_RANGE@advanced.correlation
//   retireAge < age     -> valid=true, INCONSISTENT_AGES@profile.retireAge
//   taxable, no basisPct-> valid=false, MISSING_FIELD@accounts[0].basisPct
//
// The ssClaim line and the last are ERRORs. The zero-warnings assertion is
// therefore what actually holds the generator to the validator's own bounds;
// the zero-errors one would let three of the five through.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const { validateScenario, validateRawContainers } = require('../src/scenario-validator.js');
const { isDecidedRefusal, decidedSeedsIn, DECIDED_CODES } = require('./lib/decided-refusals.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const {
  generateScenario, generateScenarios, generateNearMissScenarios,
  nestedRecordSites, RANGE_BOUNDS, STRATEGIES, NEAR_MISS_CAP, makeRng,
} = require('./lib/scenario-generator');

const defaultPlan = extractDefaultPlan(shell);

// ---------------------------------------------------------------------------
// 1. Determinism -- one integer reproduces a scenario exactly
// ---------------------------------------------------------------------------

test('generateScenario: the same seed yields a byte-identical scenario twice', () => {
  for (const seed of [1, 42, 9999, 123456]) {
    const a = JSON.stringify(generateScenario(defaultPlan, seed));
    const b = JSON.stringify(generateScenario(defaultPlan, seed));
    assert.equal(a, b, 'seed ' + seed + ' was not reproducible');
  }
});

test('generateScenario: different seeds yield genuinely different scenarios', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) seen.add(JSON.stringify(generateScenario(defaultPlan, seed)));
  assert.equal(seen.size, 30, 'expected 30 distinct scenarios, got ' + seen.size);
});

test('makeRng: the PRNG itself is seed-determined and does not drift between instances', () => {
  const a = makeRng(7), b = makeRng(7);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
  const c = makeRng(8);
  assert.notEqual(makeRng(7)(), c());
});

// ---------------------------------------------------------------------------
// 2. Valid by construction
// ---------------------------------------------------------------------------

test('generateScenarios: every generated scenario passes validateScenario with no ERROR issues', () => {
  const batch = generateScenarios(defaultPlan, { count: 120, startSeed: 1 });
  const failures = [];
  /* S5AA R29: seeds a later decision refuses, skipped only for exactly that refusal (tests/lib/decided-refusals.js). */
  const decided = [];
  for (const { seed, plan } of batch) {
    const result = validateScenario(plan);
    if (!result.valid) {
      if (isDecidedRefusal(seed, result)) { decided.push(seed); continue; }
      failures.push({ seed, issues: result.issues.filter((i) => i.severity === 'ERROR') });
    }
  }
  assert.deepEqual(failures, [], 'generated scenarios must be valid by construction');
  assert.deepEqual(decided, decidedSeedsIn(1, 120), 'every listed decided refusal in range still occurs');
});

test('generateScenarios: every generated scenario also passes the pre-normalization import gate', () => {
  const batch = generateScenarios(defaultPlan, { count: 120, startSeed: 1 });
  for (const { seed, plan } of batch) {
    const raw = validateRawContainers(plan);
    assert.ok(raw.valid, 'seed ' + seed + ' failed validateRawContainers: ' + JSON.stringify(raw.issues));
  }
});

test('generateScenarios: generated scenarios raise no WARNING-level issues either', () => {
  /* Q59's two warnings are exempt, by decision (S5 2q; the owner, 2026-09-14). They report a documented model
     boundary the generated corpus holds on purpose -- contributions no modelled income funds, and debt
     payments outside spending -- not a range violation, which is what this test holds the generator to.
     Every other warning still counts, and the exempt codes are asserted to occur, so the exemption hides
     something real rather than nothing. */
  const EXEMPT = ['CONTRIBUTIONS_ABOVE_EARNED_INCOME', 'DEBT_PAYMENT_OUTSIDE_SPENDING'];
  const batch = generateScenarios(defaultPlan, { count: 120, startSeed: 1 });
  const warned = [];
  const exemptSeen = new Set();
  for (const { seed, plan } of batch) {
    const checked = validateScenario(plan);
    /* S5AA R29: a decided refusal's own error is not a warning this test is about (tests/lib/decided-refusals.js). */
    const all = isDecidedRefusal(seed, checked) ? checked.issues.filter((i) => !DECIDED_CODES.includes(i.code)) : checked.issues;
    all.filter((i) => EXEMPT.includes(i.code)).forEach((i) => exemptSeen.add(i.code));
    const issues = all.filter((i) => !EXEMPT.includes(i.code));
    if (issues.length) warned.push({ seed, issues: issues.map((i) => i.code + '@' + i.path) });
  }
  assert.deepEqual(warned, [], 'a clean corpus should trip no warnings, not merely no errors');
  assert.deepEqual([...exemptSeen].sort(), [...EXEMPT].sort(),
    'the exempt codes must occur in the generated corpus, or the exemption is hiding nothing and should go');
});

// ---------------------------------------------------------------------------
// 3. The ranges really are the validator's own
// ---------------------------------------------------------------------------

test('RANGE_BOUNDS: the bounds were parsed out of scenario-validator.js, not hardcoded here', () => {
  // Spot-check against the literals the validator is known to declare. If the
  // validator changes these, this test is where the generator finds out.
  assert.deepEqual(RANGE_BOUNDS['retirement.ssClaim'], { min: 62, max: 70 });
  assert.deepEqual(RANGE_BOUNDS['advanced.correlation'], { min: -1, max: 1 });
  assert.deepEqual(RANGE_BOUNDS['*.basisPct'], { min: 0, max: 100 });
  assert.deepEqual(RANGE_BOUNDS['*.accessPct'], { min: 0, max: 100 });
  assert.deepEqual(RANGE_BOUNDS['profile.age'], { min: 0, max: 120 });
});

test('generated values stay inside the validator bounds they were drawn from', () => {
  for (const { seed, plan } of generateScenarios(defaultPlan, { count: 80, startSeed: 500 })) {
    const where = 'seed ' + seed;
    assert.ok(plan.retirement.ssClaim >= 62 && plan.retirement.ssClaim <= 70, where);
    assert.ok(plan.advanced.correlation >= -1 && plan.advanced.correlation <= 1, where);
    for (const a of plan.accounts) {
      assert.ok(a.basisPct >= 0 && a.basisPct <= 100, where + ' basisPct');
    }
    for (const o of plan.advanced.otherAssets || []) {
      assert.ok(o.accessPct >= 0 && o.accessPct <= 100, where + ' accessPct');
    }
    assert.ok(plan.profile.age >= 0 && plan.profile.endAge <= 120, where + ' age bounds');
    assert.ok(plan.profile.age <= plan.profile.retireAge, where + ' age <= retireAge');
    assert.ok(plan.profile.retireAge <= plan.profile.endAge, where + ' retireAge <= endAge');
  }
});

test('STRATEGIES: the withdrawal strategies are exactly the engine\'s own declaration, in sorted order (Q38)', () => {
  /* This read "were read out of the engine dispatch" and checked a hand-typed
     list of eight names. That list was itself a third copy of the set, and it
     never noticed incomeFirst. The engine now declares the set once. The
     generator draws from that declaration in the sorted order every stored
     corpus was generated with; a change to that order would re-pick every seed. */
  const engine = fs.readFileSync(path.join(__dirname, '..', 'src', 'engine.js'), 'utf8');
  const m = engine.match(/^var WITHDRAWAL_STRATEGIES=(\[[^\]\n]*\]);$/m);
  assert.ok(m, 'src/engine.js declares var WITHDRAWAL_STRATEGIES=[...] on a line of its own');
  assert.deepEqual(STRATEGIES, JSON.parse(m[1]).slice().sort(),
    'the generator must draw from exactly the declared strategies, sorted');
});

// ---------------------------------------------------------------------------
// 4. Structural variety, not jitter
// ---------------------------------------------------------------------------

test('generateScenarios: the corpus varies structurally, not just numerically', () => {
  const batch = generateScenarios(defaultPlan, { count: 150, startSeed: 1 });
  const accountCounts = new Set();
  const methods = new Set();
  const taxClasses = new Set();
  const orders = new Set();
  const strategies = new Set();
  let spouseOn = 0, debts = 0, assets = 0, reserve = 0, tent = 0, rmd = 0, conversion = 0, futureChanges = 0, stages = 0;

  for (const { plan } of batch) {
    accountCounts.add(plan.accounts.length);
    methods.add(plan.assumptions.method);
    orders.add(plan.retirement.withdrawalOrder);
    strategies.add(plan.retirement.strategy);
    plan.accounts.forEach((a) => { taxClasses.add(a.taxClass); });
    // Counted per SCENARIO, not per account -- these tallies are compared
    // against the scenario count below.
    if (plan.accounts.some((a) => a.futureChanges.length)) futureChanges++;
    if (plan.profile.spouseOn) spouseOn++;
    if ((plan.advanced.debts || []).length) debts++;
    if ((plan.advanced.otherAssets || []).length) assets++;
    if (plan.advanced.reserveOn) reserve++;
    if (plan.advanced.bondTentOn) tent++;
    if (plan.advanced.rmdOn) rmd++;
    if (plan.advanced.conversionOn) conversion++;
    if ((plan.retirement.stages || []).length) stages++;
  }

  assert.ok(accountCounts.size >= 4, 'account counts: ' + Array.from(accountCounts));
  assert.equal(methods.size, 3, 'all three methods should appear: ' + Array.from(methods));
  assert.equal(taxClasses.size, 4, 'all four tax classes should appear: ' + Array.from(taxClasses));
  assert.equal(orders.size, 2, 'both withdrawal orders should appear');
  assert.ok(strategies.size >= 6, 'strategies seen: ' + strategies.size);
  // Each optional structure must appear BOTH ways across the corpus.
  for (const [label, n] of [['spouse', spouseOn], ['debts', debts], ['otherAssets', assets],
    ['reserve', reserve], ['bondTent', tent], ['rmd', rmd], ['conversion', conversion],
    ['futureChanges', futureChanges], ['stages', stages]]) {
    assert.ok(n > 0, label + ' never appeared');
    assert.ok(n < batch.length, label + ' appeared in every scenario');
  }
});

test('generateScenarios: a manual withdrawal order is always a valid, duplicate-free class list', () => {
  for (const { seed, plan } of generateScenarios(defaultPlan, { count: 150, startSeed: 1 })) {
    if (plan.retirement.withdrawalOrder !== 'manual') continue;
    const tokens = plan.retirement.manualOrder.split(',');
    assert.equal(new Set(tokens).size, tokens.length, 'seed ' + seed + ' had duplicate classes');
    for (const t of tokens) {
      assert.ok(['taxable', 'preTax', 'roth', 'hsa'].includes(t), 'seed ' + seed + ' bad class ' + t);
    }
  }
});

// ---------------------------------------------------------------------------
// 5. Near-miss mode -- bounded, exact, reproducible
// ---------------------------------------------------------------------------

test('generateNearMissScenarios: is hard-capped regardless of what is asked for', () => {
  const big = generateNearMissScenarios(defaultPlan, { count: 5000 });
  assert.equal(big.cap, NEAR_MISS_CAP);
  assert.equal(NEAR_MISS_CAP, 200);
  assert.ok(big.cases.length <= NEAR_MISS_CAP, 'produced ' + big.cases.length);
});

test('generateNearMissScenarios: each case is exactly one required field short of the valid scenario', () => {
  const { cases } = generateNearMissScenarios(defaultPlan, { count: 60 });
  assert.ok(cases.length > 0, 'expected some near-miss cases');
  for (const c of cases) {
    // The named field really is gone from the named record...
    const valid = generateScenario(defaultPlan, c.seed);
    const validSites = nestedRecordSites(valid).map((s) => s.path);
    assert.ok(validSites.includes(c.omission.path), 'seed ' + c.seed + ': ' + c.omission.path + ' was not a required field of the valid scenario');
    const missingSites = nestedRecordSites(c.plan).map((s) => s.path);
    assert.ok(!missingSites.includes(c.omission.path), 'seed ' + c.seed + ': ' + c.omission.path + ' is still present');
    // ...and it is the ONLY difference.
    assert.equal(validSites.length - missingSites.length, 1, 'seed ' + c.seed + ' differs by more than one field');
  }
});

test('generateNearMissScenarios: the same seed omits the same field', () => {
  const a = generateNearMissScenarios(defaultPlan, { count: 25 });
  const b = generateNearMissScenarios(defaultPlan, { count: 25 });
  assert.deepEqual(a.cases.map((c) => [c.seed, c.omission.path]), b.cases.map((c) => [c.seed, c.omission.path]));
});

// REPORT-ONLY. Ground rule 11: a near miss the validator accepts is a finding
// to record with its seed, not something to repair here.
test('near-miss corpus: report which omissions the validators catch', () => {
  const { cases, attempted } = generateNearMissScenarios(defaultPlan, { count: NEAR_MISS_CAP });
  const accepted = [];
  for (const c of cases) {
    const full = validateScenario(c.plan);
    const raw = validateRawContainers(c.plan);
    if (full.valid && raw.valid) accepted.push({ seed: c.seed, path: c.omission.path });
  }
  const byField = {};
  for (const c of cases) {
    const k = c.omission.container.replace(/\[\d+\]/g, '[]') + '.' + c.omission.field;
    byField[k] = (byField[k] || 0) + 1;
  }
  console.log(
    '\n  [near-miss report] ' + cases.length + ' cases from ' + attempted + ' seeds (cap ' + NEAR_MISS_CAP + ')' +
    '\n  omissions by field: ' + JSON.stringify(byField) +
    '\n  ACCEPTED BY BOTH VALIDATORS (would be a finding): ' + accepted.length +
    (accepted.length ? '\n  ' + JSON.stringify(accepted) : '')
  );
  // The corpus must be non-trivial for the report to mean anything.
  assert.ok(cases.length >= 50, 'near-miss corpus too small to be informative: ' + cases.length);
});

// ---------------------------------------------------------------------------
// S3 task 1, completed (2026-09-11): no scalar may be blind by accident.
//
// The generator's mechanism is an ALLOWLIST -- generateScenario() clones
// defaultPlan and overwrites an explicit list -- so any field not on that list
// keeps its default forever, whatever that default is. That is what produced
// Q17 (spouseSS zero across 200 seeds), Q21 (surplusPolicy and dividendOn
// constant, hiding a P1 and a P2 from the whole corpus) and the near-miss with
// advanced.retainedCashOrder, which was added for the Q22 decision and landed
// blind from birth while being live in both the engine and the validator.
//
// A list you must remember to update is the defect. This test inverts it: a
// scalar must be VARYING or DECLARED, and adding one to defaultPlan without
// doing either fails here.
// ---------------------------------------------------------------------------

test('generator: every scalar in defaultPlan either varies across seeds or is declared fixed', () => {
  const { INTENTIONALLY_FIXED, generateScenarios } = require('./lib/scenario-generator');
  const SECTIONS = ['profile', 'employment', 'assumptions', 'retirement', 'advanced'];
  const SAMPLE = 120;
  const plans = generateScenarios(defaultPlan, { count: SAMPLE, startSeed: 1 })
    .map((s) => (s && s.plan) || s);

  // CONTROL: the detector must be able to report "varies". Without this, a
  // reading bug would report everything blind and this test would still pass
  // by listing everything -- the exact failure an earlier probe had.
  const varied = new Set(plans.map((p) => JSON.stringify(p.assumptions.returnRate))).size;
  assert.ok(varied > 1, 'CONTROL: assumptions.returnRate must be seen varying, got ' + varied);

  const blind = [];
  SECTIONS.forEach((section) => {
    Object.keys(defaultPlan[section] || {}).forEach((field) => {
      const v = defaultPlan[section][field];
      if (v !== null && typeof v === 'object') return; // arrays/objects are a separate concern
      const distinct = new Set(plans.map((p) => JSON.stringify((p[section] || {})[field]))).size;
      if (distinct === 1) blind.push(section + '.' + field);
    });
  });

  const undeclared = blind.filter((k) => !(k in INTENTIONALLY_FIXED));
  assert.deepEqual(
    undeclared, [],
    'these scalars are constant across ' + SAMPLE + ' seeds and are not declared fixed:\n' +
    undeclared.map((k) => '    ' + k + ' = ' +
      JSON.stringify(defaultPlan[k.split('.')[0]][k.split('.')[1]])).join('\n') +
    '\n  Either draw them in generateScenario() or add them to INTENTIONALLY_FIXED with the ' +
    'reason. A blind field means no generated scenario can reach the code behind it -- which is ' +
    'how a P1 (RA-02) and a P2 (RA-03) stayed invisible to the entire corpus.'
  );
});

test('generator: nothing is declared fixed that the engine actually reads', () => {
  // The declaration is only honest while its stated reason holds. If a field
  // listed as unread starts being read, the entry must go -- otherwise the
  // list quietly becomes a place to park inconvenient coverage gaps.
  const { INTENTIONALLY_FIXED } = require('./lib/scenario-generator');
  const engineSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'engine.js'), 'utf8');

  /* Deliberately NOT a RegExp built from a string. Doing that needs backslash
     escapes, and this very block was written once with them collapsed by the
     shell -- producing a pattern that matched nothing, which the control below
     caught. indexOf plus an explicit boundary check has no escapes to lose.
     The boundary matters: a bare search for ".home" also hits ".homeGrowth"
     and would report an unread field as read. */
  const WORD = /[A-Za-z0-9_$]/;
  function engineReads(field) {
    const needle = '.' + field;
    for (let i = engineSource.indexOf(needle); i !== -1; i = engineSource.indexOf(needle, i + 1)) {
      const after = engineSource[i + needle.length];
      if (after === undefined || !WORD.test(after)) return true;
    }
    return false;
  }

  // CONTROLS: the detector must report BOTH answers, and must not be fooled by
  // a field name that is a prefix of a longer one.
  assert.ok(engineReads('rmdOn'), 'CONTROL: .rmdOn must be found in engine.js');
  assert.ok(!engineReads('zzzNotAField'), 'CONTROL: a nonsense field must not be found');
  assert.ok(!engineReads('hom'), 'CONTROL: a PREFIX of a real field must not be found');

  const nowRead = Object.keys(INTENTIONALLY_FIXED).filter((k) => engineReads(k.split('.').pop()));
  assert.deepEqual(
    nowRead, [],
    'declared fixed because "the engine never reads it", but the engine now does: ' +
    nowRead.join(', ') + '. Draw them, or restate the reason.'
  );
});
