'use strict';

/*
 * S3 task 4 -- the near-miss survivor sweep.
 *
 * THE GAP. tests/scenario-generator.test.js reports which omissions the
 * validators CATCH. It never runs the survivors through the engine. SA-01 was
 * precisely a record that passed both validators and then silently zeroed all
 * retirement spending -- a retirement.stages entry with only `name`, where
 * applyStage()'s `age < s.start || age > s.end` test is false on BOTH sides
 * when the boundaries are absent, so the stage applied to every year. The
 * corpus built to hunt that defect class stopped one step short of where the
 * defect lives.
 *
 * WHAT THE SWEEP FOUND, AND WHY IT IS NOT WHERE THE BRIEF EXPECTED.
 *
 * Task 4's criterion 1 said: reconstruct SA-01's case, and if it is now
 * validator-rejected, "construct a second still-accepted omission as the live
 * probe". Both halves happened.
 *
 *   SA-01's own case is now REJECTED -- four MISSING_FIELD errors. Asserted
 *   below so that a regression in that rule is loud.
 *
 *   And so is every other REQUIRED-field omission. Over 60 seeds,
 *   generateNearMissScenarios produced 60 cases and the validators rejected
 *   60 of 60. That is a real result about the validators and it is asserted,
 *   with the controls that make it mean something (see below).
 *
 * So the live probe had to come from somewhere else, and it does: OPTIONAL
 * fields. A field that is present on a record but absent from its `required`
 * list can be omitted, always passes validation by construction, and is
 * exactly as capable of changing the answer. 506 such omissions across 60
 * seeds: 427 inert, 9 silent-but-immaterial, 0 loud, and **70 SILENT AND
 * MATERIAL** -- the SA-01 class, alive, in five distinct places.
 *
 * The sharpest is retirement.otherIncomes[].owner. otherIncomeFor() computes
 *
 *     var spouse = i.owner === "spouse" && p.profile.spouseOn
 *
 * so an ABSENT owner makes that false and the income is timed against SELF's
 * age instead of the spouse's. On seed 100006 that moves lifetime taxes by
 * $170,465 with no error of any kind. Same shape as SA-01: an absent field
 * makes a conditional false, and the code proceeds as though it had been
 * given a real answer.
 *
 * GROUND RULE 11: RECORDED, NOT FIXED. These are findings, with seeds, in
 * SPRINT_QUESTIONS.md Q32, and as todo-marked reproducing tests below. No
 * engine change, no validator change. D3: a severe finding does not halt the
 * sprint, and this sweep stays GREEN so it can keep running.
 *
 * WHAT WOULD MAKE IT FAIL. KNOWN_MATERIAL_SITES pins the five site kinds that
 * are known to move output. A material case at any OTHER kind fails this test
 * loudly -- that is the regression guard, and it is stable in a way that
 * pinning the exact count of 70 would not be.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  canonical, hashOf, differences, installDebtModules,
} = require('../tools/capture-baseline.js');
const gen = require('../tests/lib/scenario-generator.js');
const golden = require('../tests/lib/golden-scenario-defs.js');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(
  shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
installDebtModules();
const engine = require('../src/engine.js');
const { validateScenario } = require('../src/scenario-validator.js');

const defaultPlan = golden.extractDefaultPlan(shell);
const clone = (v) => JSON.parse(JSON.stringify(v));
const validate = (p) => validateScenario(clone(p));
const accepts = (p) => validate(p).valid;

// --- Fixed seed and fixed case count, both named (criterion 4) --------------
const SWEEP_START_SEED = 100000;
const SWEEP_SEED_COUNT = 60;

/* "Material" -- a named constant with its reasoning, as criterion 4 requires.
 *
 * A relative threshold, not absolute: balances in this model run to eight
 * figures, so an absolute epsilon would either ignore real six-figure moves or
 * fire on float noise depending on scenario size. 1e-6 relative is far above
 * double-precision accumulation noise over a 30-row projection and far below
 * any movement a user could notice, which is the gap a materiality threshold
 * is supposed to sit in.
 *
 * The top-level fields are compared for ANY change, not a relative one:
 * `failed` is a boolean, and a successRate or firstShortfallAge that moves at
 * all has changed the answer the user is given. */
const MATERIAL_RELATIVE_THRESHOLD = 1e-6;
const MATERIAL_ROW_FIELDS = ['total', 'spending', 'withdrawals', 'taxes', 'networth'];
const MATERIAL_TOP_LEVEL_FIELDS = ['failed', 'successRate', 'firstShortfallAge'];

/* The site kinds known to produce silent, material movement when omitted.
 * Measured, at HEAD, over the seed range above. A material finding at a kind
 * NOT on this list is a new hole and fails the sweep. */
/* P7 (2026-09-10) CLOSED ALL FIVE, so this list is now empty -- and empty is
   the point rather than an accident. The five sites are exactly the ones this
   sweep measured moving money in 70 of 506 optional-field omissions while
   reporting nothing: otherIncomes[].owner/growthMode/growth and
   stages[].growthMode/annualChange. The validator now reports their absence as
   an error, so a survivor carrying one of them no longer survives.

   The list stays in place, empty, because its job is to make a NEW silent
   material site fail loudly. Deleting it would remove the guard along with the
   findings it was holding. */
const KNOWN_MATERIAL_SITES = [];

const kindOf = (site) => site.container.replace(/\[\d+\]/g, '[]') + '[].' + site.field;

// ---------------------------------------------------------------------------
// Site enumeration -- deterministic, every site, not one random pick per seed
// ---------------------------------------------------------------------------

/* generateNearMissScenarios picks ONE random site per seed, which cannot
   enumerate every site -- and "every site nestedRecordSites reports is
   covered" is the criterion. applyOmission was exported by this task
   (ground rule 9, purely additive) so a chosen site can be omitted directly.
   The seeded corpus is kept below as the randomized layer over the same
   ground. */
function requiredSites(plan) {
  return gen.nestedRecordSites(plan);
}

/** Fields present on a nested record but absent from its `required` list. */
function optionalSites(plan) {
  const specs = gen.describeSources();
  const out = [];
  const retirement = plan.retirement || {};
  Object.keys(specs.nestedRecordSpecs).forEach((key) => {
    const list = retirement[key];
    if (!Array.isArray(list)) return;
    const spec = specs.nestedRecordSpecs[key];
    list.forEach((entry, i) => {
      let required = spec.required.slice();
      if (spec.requiredUnlessOneTime && entry.type !== 'oneTime') {
        required = required.concat(spec.requiredUnlessOneTime);
      }
      Object.keys(entry).forEach((field) => {
        if (required.indexOf(field) >= 0) return;
        out.push({
          container: 'retirement.' + key, index: i, field,
          path: 'retirement.' + key + '[' + i + '].' + field,
        });
      });
    });
  });
  (plan.accounts || []).forEach((account, ai) => {
    if (!Array.isArray(account.futureChanges)) return;
    account.futureChanges.forEach((entry, j) => {
      Object.keys(entry).forEach((field) => {
        if (specs.futureChangeSpec.required.indexOf(field) >= 0) return;
        out.push({
          container: 'accounts[' + ai + '].futureChanges', accountIndex: ai, index: j, field,
          path: 'accounts[' + ai + '].futureChanges[' + j + '].' + field,
        });
      });
    });
  });
  return out;
}

/*
 * S3-06. Three defects, all the same shape: the classifier could not tell a
 * DAMAGED result from an immaterial one, so damage landed in the quietest
 * bucket it has.
 *
 *   1. `if (typeof before !== 'number' || typeof after !== 'number') continue`
 *      skipped null and missing outright -- and did NOT skip NaN, which is
 *      typeof 'number'. NaN then reached a comparison that is false for NaN,
 *      so it fell through to silent-immaterial. Both routes ended in
 *      "nothing to see here".
 *   2. Rows were walked to Math.min of the two lengths, so adding or removing
 *      a row was invisible -- the extra rows were simply never looked at.
 *   3. Rows were compared positionally with no age key, so a shifted age
 *      compared row i against a different year and reported on the values.
 *
 * Structure is therefore checked before values, corruption is its own kind
 * rather than a quiet pass, and every field is compared rather than five.
 */

/** `age` is compared as a structural KEY, not a value: a moved age is a row
 *  alignment change, and reporting it as a value difference would describe the
 *  symptom rather than the cause. */
const ROW_ALIGNMENT_KEY = 'age';

function describeOperand(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'missing';
  if (typeof v !== 'number') return JSON.stringify(v);
  return String(v);
}

/* Row fields that are legitimately not numbers. Everything else in a row is a
   financial quantity and must be finite, so the set is named rather than
   inferred -- otherwise the contract fields themselves read as corruption. */
const NON_NUMERIC_ROW_FIELDS = new Set(['calculationError', 'calculationErrorCode']);

/*
 * FC-04: the top-level result contract, named field by field.
 *
 * `firstDamagedField` below walks rows and nothing else, so a result with
 * clean finite rows and `successRate: NaN`, compared against an identical
 * copy, reached the equality shortcut and came back `inert` -- the most
 * reassuring word this classifier has, for a headline number that is not a
 * number. These are the same three fields MATERIAL_TOP_LEVEL_FIELDS already
 * calls material, so the harness considered a change in them worth failing
 * over while never checking they were valid in the first place.
 *
 * Named predicates rather than a blanket "top-level numbers must be finite",
 * which would be wrong in both directions: it would fire on firstShortfallAge,
 * which is legitimately null whenever the plan never runs short, and it would
 * silently extend itself over any field the engine adds later, asserting a
 * domain nobody decided. Measured across all three modes before being written:
 * simple, historical and monteCarlo each return a boolean `failed`, a finite
 * `successRate` and a null-or-number `firstShortfallAge`.
 */
const TOP_LEVEL_CONTRACT = {
  failed: (v) => typeof v === 'boolean',
  successRate: (v) => typeof v === 'number' && Number.isFinite(v),
  firstShortfallAge: (v) => v === null || (typeof v === 'number' && Number.isFinite(v)),
};

/* FCR-03: the fields a result must CARRY, distinct from what a present value
   must BE. Measured across all three modes before being required: simple,
   historical and monteCarlo each return every one of these on every row, and
   all 36 entries of the stored closing baseline carry all four top-level
   fields. So absence is damage, not an optional shape. */
/* P5-02: the required set was the alignment key plus the five MATERIAL_ROW_FIELDS,
   which tied "what must exist" to "what we compare for materiality" -- two
   different questions. Deleting `taxable`, `preTax`, `roth`, `hsa`, `income`,
   `shortfall` or `debtBalance` from every row therefore classified as inert,
   because the predicate only validated the keys that happened to remain.

   These are ordinary financial components, not optional extras, and the claim
   is measured rather than assumed: across the stored closing baseline's 36
   entries and 1,036 rows -- 17 simple, 16 historical, 3 Monte Carlo -- every
   one of these fields is present on every row, with zero empty projections.
   Re-measured live in all three modes as well. */
const REQUIRED_ROW_FIELDS = [
  ROW_ALIGNMENT_KEY, 'total', 'taxable', 'preTax', 'roth', 'hsa', 'income',
  'spending', 'withdrawals', 'taxes', 'shortfall', 'networth', 'debtBalance',
];

/**
 * The first contract violation in a result, or null.
 *
 * FCR-03: the first version of this validated only fields that were PRESENT --
 * `if (!hasOwnProperty(result, field)) continue`. That reads as caution and is
 * the opposite: deleting `successRate` outright, or `failed`, or
 * `firstShortfallAge`, or the entire `rows` collection, sailed past the
 * validator and then past the equality shortcut, and came back `inert`. So did
 * deleting a field from every row, because row validation walked only the keys
 * that remained. The check that existed to catch damage shared by both sides
 * was blind to the most complete form of that damage -- the field not being
 * there at all.
 *
 * Presence is checked first, then the value's domain. `firstShortfallAge: null`
 * stays legitimate; `firstShortfallAge` MISSING does not, and the two are now
 * different answers.
 */
function firstContractViolation(result) {
  for (const field of Object.keys(TOP_LEVEL_CONTRACT)) {
    if (!Object.prototype.hasOwnProperty.call(result, field)) {
      return field + ' is absent (required on every result, in every mode)';
    }
    if (!TOP_LEVEL_CONTRACT[field](result[field])) {
      return field + ' is ' + describeOperand(result[field]);
    }
  }

  if (!Object.prototype.hasOwnProperty.call(result, 'rows')) {
    return 'rows is absent (a result with no projection is not a result)';
  }
  if (!Array.isArray(result.rows)) {
    return 'rows is ' + describeOperand(result.rows) + ', not an array';
  }
  /* P5-02: `rows` being an array was checked; its being a PROJECTION was not.
     Replacing rows with [] on both sides passed every loop below zero times
     and came back inert -- a successful result with nothing in it, reported as
     harmless. A successful run always produces at least the opening snapshot;
     the stored baseline has zero empty projections across all 36 entries.
     Results that legitimately have no projection are the ones carrying
     calculationError, and those are classified before this check runs. */
  if (result.rows.length === 0) {
    return 'rows is empty -- a successful result with no projection at all';
  }

  for (let i = 0; i < result.rows.length; i++) {
    for (const field of REQUIRED_ROW_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(result.rows[i], field)) {
        return 'rows[' + i + '].' + field + ' is absent';
      }
    }
  }
  return null;
}

/** The first damaged financial field in a result, or null when it is usable.
 *  Used on the BASELINE, where nothing else looks: the mutated side is covered
 *  by the field-by-field comparison, but only when the two sides differ. */
function firstDamagedField(result) {
  const rows = result.rows || [];
  for (let i = 0; i < rows.length; i++) {
    for (const field of Object.keys(rows[i])) {
      if (NON_NUMERIC_ROW_FIELDS.has(field)) continue;
      const v = rows[i][field];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return 'rows[' + i + '].' + field + ' is ' + describeOperand(v);
      }
    }
  }
  return null;
}

/** The union of both rows' keys, so a field present on only one side is
 *  compared rather than silently skipped. */
function rowFieldsToCompare(before, after) {
  const keys = new Set(Object.keys(before).concat(Object.keys(after)));
  keys.delete(ROW_ALIGNMENT_KEY);
  return Array.from(keys).sort();
}

/** Inert | loud | corrupt | silent-immaterial | silent-material, against the
 *  complete record. */
function classify(complete, mutated) {
  /* The baseline has to be a valid complete result or every comparison below
     is against nothing. Cheap, and it removes a whole class of false calm. */
  if (complete.calculationError) {
    return {
      kind: 'corrupt-baseline',
      detail: 'the complete record is itself a calculation error (' +
        String(complete.calculationErrorCode || true) + ')',
    };
  }

  /* RP-03, second half. `calculationError` being false is not proof that a
     result is usable -- a result can carry NaN through every row with that flag
     clear. And the equality shortcut below returns BEFORE any field is looked
     at, so two identical NaN-bearing results classified as `inert`: the most
     reassuring word this classifier has, for the worst thing it can be shown.

     The first half of RP-03 was corruption being dropped before the gate; this
     is corruption never being looked for. Both end in false calm, which is why
     the audit records them as one finding.

     Ordering is the whole fix. Validating the baseline AFTER the shortcut would
     change nothing, because an identical pair never reaches it. */
  /* FC-04: the top level is part of "is this baseline usable", and the first
     version of this check asked only about rows. Both halves run before the
     shortcut, for the same reason: an identical pair never reaches anything
     downstream of it. */
  const baselineContract = firstContractViolation(complete);
  if (baselineContract) {
    return {
      kind: 'corrupt-baseline',
      detail: 'the complete record violates the result contract before any comparison: ' +
        baselineContract,
    };
  }

  const baselineDamage = firstDamagedField(complete);
  if (baselineDamage) {
    return {
      kind: 'corrupt-baseline',
      detail: 'the complete record is damaged before any comparison: ' + baselineDamage,
    };
  }

  if (mutated.calculationError) {
    return { kind: 'loud', detail: String(mutated.calculationErrorCode || mutated.calculationError) };
  }
  if (hashOf(canonical(complete)) === hashOf(canonical(mutated))) return { kind: 'inert' };

  /* FC-04: baseline corruption and mutation corruption are different facts and
     get different names. The baseline was already valid above, so a top-level
     violation here was introduced by the omission under test -- `corrupt`, the
     same verdict row-level damage gets below. Reported before the materiality
     comparison, which would otherwise call NaN a "change" in the field and
     file it as silent-material: true, but it buries damage inside the category
     used for ordinary movement. Rows are deliberately left to the
     field-by-field comparison, which names the before and after values. */
  const mutatedContract = firstContractViolation(mutated);
  if (mutatedContract) {
    return {
      kind: 'corrupt',
      detail: 'the omission produced a result violating the contract: ' + mutatedContract,
    };
  }

  const cRows = complete.rows || [];
  const mRows = mutated.rows || [];

  /* STRUCTURE BEFORE VALUES. */
  if (cRows.length !== mRows.length) {
    return {
      kind: 'silent-material',
      detail: 'row count: ' + cRows.length + ' -> ' + mRows.length,
    };
  }
  for (let i = 0; i < cRows.length; i++) {
    if (!Object.is(cRows[i][ROW_ALIGNMENT_KEY], mRows[i][ROW_ALIGNMENT_KEY])) {
      return {
        kind: 'silent-material',
        detail: 'rows[' + i + '].age: ' + describeOperand(cRows[i].age) +
          ' -> ' + describeOperand(mRows[i].age) + ' (rows no longer line up)',
      };
    }
  }

  for (const field of MATERIAL_TOP_LEVEL_FIELDS) {
    if (JSON.stringify(complete[field]) !== JSON.stringify(mutated[field])) {
      return {
        kind: 'silent-material',
        detail: field + ': ' + JSON.stringify(complete[field]) + ' -> ' + JSON.stringify(mutated[field]),
      };
    }
  }

  for (let i = 0; i < cRows.length; i++) {
    /* EVERY field, not a chosen five. The old list omitted income, the
       account-class balances, shortfall and the whole debt block, so a change
       in any of them was classified immaterial by never being looked at.
       Comparing the union means there is no unreviewed set to forget. */
    for (const field of rowFieldsToCompare(cRows[i], mRows[i])) {
      const before = cRows[i][field];
      const after = mRows[i][field];
      if (Object.is(before, after)) continue;          /* Object.is: NaN === NaN here */

      const beforeOk = typeof before === 'number' && Number.isFinite(before);
      const afterOk = typeof after === 'number' && Number.isFinite(after);
      if (!beforeOk || !afterOk) {
        /* A value that stopped being a finite number is damage, and damage is
           not a small difference. This is the branch the old `continue` gave
           away. */
        return {
          kind: 'corrupt',
          detail: 'rows[' + i + '].' + field + ': ' +
            describeOperand(before) + ' -> ' + describeOperand(after),
        };
      }

      const denominator = Math.max(Math.abs(before), Math.abs(after), 1);
      if (Math.abs(before - after) / denominator > MATERIAL_RELATIVE_THRESHOLD) {
        return { kind: 'silent-material', detail: 'rows[' + i + '].' + field + ': ' + before + ' -> ' + after };
      }
    }
  }
  return { kind: 'silent-immaterial' };
}

/** One pass of the sweep, memoised so the suite pays for it once. */
let sweepCache = null;
function runSweep() {
  if (sweepCache) return sweepCache;
  /* S3-06 added 'corrupt' and 'corrupt-baseline'. Initialised here rather than
     incremented into existence, so a missing key shows up as a zero in the
     printed tally instead of a NaN nobody reads. */
  const tally = { inert: 0, loud: 0, 'silent-immaterial': 0, 'silent-material': 0, corrupt: 0, 'corrupt-baseline': 0 };
  const findings = [];
  const siteKinds = new Set();
  let accepted = 0;
  let rejected = 0;
  /* P7: which sites the validator now refuses, so a test can assert the refusal
     is confined to the five material ones rather than having widened. */
  const rejectedKindSet = new Set();

  for (let i = 0; i < SWEEP_SEED_COUNT; i++) {
    const seed = SWEEP_START_SEED + i;
    const complete = gen.generateScenario(defaultPlan, seed);
    const baseline = engine.runPlan(clone(complete));

    optionalSites(complete).forEach((site) => {
      siteKinds.add(kindOf(site));
      const mutated = gen.applyOmission(clone(complete), site);
      if (!accepts(mutated)) { rejected++; rejectedKindSet.add(kindOf(site)); return; }
      accepted++;
      let result;
      try {
        result = engine.runPlan(clone(mutated));
      } catch (error) {
        tally.loud++;
        findings.push({ seed, site: kindOf(site), path: site.path, kind: 'loud', detail: String(error.message) });
        return;
      }
      const verdict = classify(baseline, result);
      tally[verdict.kind]++;
      /* RP-04's sibling, RP-03: 'corrupt' and 'corrupt-baseline' were added to
         classify() and to the tally, but NOT here -- so a corruption verdict
         was counted in the printed split and then dropped before the
         regression gate, which reads `findings`. The guard could not fail the
         suite it was added to guard.

         Recorded by NOT enumerating the reportable kinds: everything except
         the two benign outcomes is a finding. A list of kinds to report is the
         same hazard one level up -- adding a sixth kind later would silently
         miss the gate exactly as the fifth did. */
      if (verdict.kind !== 'inert' && verdict.kind !== 'silent-immaterial') {
        findings.push({ seed, site: kindOf(site), path: site.path, kind: verdict.kind, detail: verdict.detail });
      }
    });
  }
  sweepCache = { tally, findings, siteKinds: Array.from(siteKinds).sort(), accepted, rejected,
    rejectedKinds: Array.from(rejectedKindSet).sort() };
  return sweepCache;
}

// ---------------------------------------------------------------------------
// Criterion 1 -- SA-01's own case, determined empirically
// ---------------------------------------------------------------------------

test('near-miss: SA-01\'s own case is now REJECTED by the validator, so it never reaches the engine', () => {
  const plan = clone(defaultPlan);
  plan.setupComplete = true;
  plan.profile.age = 60;
  plan.profile.retireAge = 62;
  plan.profile.endAge = 75;
  plan.retirement.spending = 50000;
  plan.retirement.stages = [{ name: 'mystery stage' }];

  const result = validate(plan);
  assert.equal(result.valid, false,
    'SA-01 was a stages entry with only `name` that passed both validators and then applied to ' +
    'every year, because applyStage()\'s `age < s.start || age > s.end` is false on both sides ' +
    'when the boundaries are absent. If this ever validates again, that hole is reopened.');
  const missing = result.issues
    .filter((i) => i.severity === 'ERROR' && i.code === 'MISSING_FIELD')
    .map((i) => i.message.match(/is missing "(\w+)"/))
    .filter(Boolean).map((m) => m[1]).sort();
  assert.deepEqual(missing, ['end', 'mode', 'start', 'value'],
    'all four required stage fields must be named; got ' + JSON.stringify(missing));

  /* And the engine WOULD still have been moved by it -- so the validator is
     doing the whole job here, with nothing behind it. Recorded because it
     means the rule above is load-bearing rather than belt-and-braces. */
  const withStage = engine.runPlan(clone(plan));
  const noStage = clone(plan);
  noStage.retirement.stages = [];
  assert.notEqual(hashOf(canonical(withStage)), hashOf(canonical(engine.runPlan(noStage))),
    'the incomplete stage still changes engine output; only the validator stops it');
  assert.ok(!withStage.calculationError,
    'and it does so silently -- no calculationError. That is the SA-01 signature.');
});

// ---------------------------------------------------------------------------
// Criterion 3 -- every required-field site, deterministically, with controls
// ---------------------------------------------------------------------------

test('near-miss: EVERY required-field omission site is rejected, and the check has controls', () => {
  let sites = 0;
  let survivors = [];
  const kinds = new Set();
  let completeValid = 0;

  for (let i = 0; i < SWEEP_SEED_COUNT; i++) {
    const seed = SWEEP_START_SEED + i;
    const complete = gen.generateScenario(defaultPlan, seed);

    /* CONTROL A (ground rule 24): the COMPLETE record must validate. Without
       this, "every omission was rejected" could just mean generated scenarios
       never validate -- the probe would return the same clean answer against
       a validator that rejected everything. */
    if (accepts(complete)) completeValid++;

    requiredSites(complete).forEach((site) => {
      sites++;
      kinds.add(kindOf(site));
      const mutated = gen.applyOmission(clone(complete), site);
      const result = validate(mutated);
      if (result.valid) survivors.push({ seed, path: site.path });
      else {
        /* CONTROL B: the rejection must NAME the omitted field. A plan
           rejected for an unrelated reason is not evidence that the omission
           was caught. */
        const named = result.issues.some((issue) =>
          issue.severity === 'ERROR' && String(issue.message).includes('"' + site.field + '"'));
        assert.ok(named,
          'seed ' + seed + ': ' + site.path + ' was rejected, but no ERROR named "' + site.field +
          '". A rejection for an unrelated reason does not prove the omission was caught.');
      }
    });
  }

  assert.equal(completeValid, SWEEP_SEED_COUNT,
    'CONTROL A failed: only ' + completeValid + '/' + SWEEP_SEED_COUNT + ' complete records validate, ' +
    'so this test cannot distinguish "omissions are caught" from "nothing validates"');
  assert.ok(sites > 500, 'expected the enumeration to reach every site, not one per seed; got ' + sites);
  assert.ok(kinds.size >= 13, 'expected every site KIND to be exercised; got ' + kinds.size);

  assert.deepEqual(survivors, [],
    'these required-field omissions passed the validators. Each is an SA-01 candidate and must be ' +
    'run through the engine and classified: ' + JSON.stringify(survivors.slice(0, 10)));
});

// ---------------------------------------------------------------------------
// The live probe -- optional fields, which DO survive
// ---------------------------------------------------------------------------

test('near-miss: optional-field omissions survive validation, except the material five', () => {
  /* This used to assert `sweep.rejected === 0` -- that an optional-field
     omission is NEVER rejected, by construction. That was true and it was the
     finding: 70 of 506 omissions moved money and not one reported anything.

     P7 made those five sites report. So rejections are now expected, and what
     matters is WHICH: only the five, and the other optional sites must still
     sail through, or the repair has quietly turned optional fields into
     required ones across the board. */
  const sweep = runSweep();

  /* The survivor population fell from >400 to ~229 because EVERY omission at
     the five sites is now refused, not only the 70 measured moving money. That
     is the intended reading: the field is required, rather than
     required-when-it-happens-to-matter, which is not a property a validator can
     evaluate. */
  assert.ok(sweep.accepted > 200,
    'expected a substantial survivor population; got ' + sweep.accepted);
  assert.ok(sweep.siteKinds.length >= 9,
    'expected every optional site kind; got ' + sweep.siteKinds.length + ': ' +
    JSON.stringify(sweep.siteKinds));
  assert.ok(sweep.rejected > 0,
    'the five material sites must now be rejected; if nothing is, P7 has regressed');

  /* The rejections must be exactly the material five -- nothing wider. */
  const P7_SITES = [
    'retirement.otherIncomes[].growth',
    'retirement.otherIncomes[].growthMode',
    'retirement.otherIncomes[].owner',
    'retirement.stages[].annualChange',
    'retirement.stages[].growthMode',
  ];
  assert.deepEqual(sweep.rejectedKinds, P7_SITES,
    'the refusal must be EXACTLY the five sites P7 closed. Anything extra means an optional '  +
    'field has been made required by accident; anything missing means P7 regressed there.');
});

/* Criterion 6: the summary states case count, site count and the split as
   NUMBERS. "Found nothing" is only meaningful alongside the corpus size, and
   so is "found 70". */
test('near-miss: the sweep reports its own size and classification split', () => {
  const sweep = runSweep();
  const total = Object.values(sweep.tally).reduce((s, n) => s + n, 0);
  assert.equal(total, sweep.accepted, 'every accepted survivor must be classified exactly once');

  console.log('\n  near-miss survivor sweep');
  console.log('    seeds              : ' + SWEEP_SEED_COUNT + ' from ' + SWEEP_START_SEED);
  console.log('    optional site kinds: ' + sweep.siteKinds.length);
  console.log('    survivors run      : ' + sweep.accepted + ' (rejected: ' + sweep.rejected + ')');
  console.log('    inert              : ' + sweep.tally.inert);
  console.log('    silent-immaterial  : ' + sweep.tally['silent-immaterial']);
  console.log('    loud               : ' + sweep.tally.loud);
  console.log('    SILENT + MATERIAL  : ' + sweep.tally['silent-material'] + '   <- SA-01 class');
  const byKind = {};
  sweep.findings.forEach((f) => { byKind[f.site] = (byKind[f.site] || 0) + 1; });
  Object.keys(byKind).sort().forEach((k) => console.log('      ' + k + ': ' + byKind[k]));
  console.log('');
});

/* THE REGRESSION GUARD, and the reason this test is green rather than red.
   D3 and ground rule 11: the 70 findings are recorded (Q32), not repaired.
   What must not happen quietly is a SIXTH site kind joining them. */
test('near-miss: no NEW silent-material site kind has appeared', () => {
  const sweep = runSweep();
  const found = Array.from(new Set(
    sweep.findings.filter((f) => f.kind === 'silent-material').map((f) => f.site))).sort();
  const novel = found.filter((k) => KNOWN_MATERIAL_SITES.indexOf(k) < 0);
  assert.deepEqual(novel, [],
    'a new SA-01-class hole appeared at: ' + JSON.stringify(novel) + '. Example: ' +
    JSON.stringify(sweep.findings.find((f) => novel.indexOf(f.site) >= 0)) +
    '\n  Record it in SPRINT_QUESTIONS.md with its seed and add it to KNOWN_MATERIAL_SITES ' +
    'only once it is written down -- never to make this pass.');

  const gone = KNOWN_MATERIAL_SITES.filter((k) => found.indexOf(k) < 0);
  assert.deepEqual(gone, [],
    'these known holes no longer reproduce: ' + JSON.stringify(gone) + '. That may be a repair, ' +
    'in which case remove them from KNOWN_MATERIAL_SITES in the same commit as the fix -- or it ' +
    'may mean the sweep stopped reaching them, which is worse and is not a reason to delete them.');
});

// ---------------------------------------------------------------------------
// Reproducing tests for the findings -- todo-marked, carrying their seeds
// ---------------------------------------------------------------------------

test('Q32a CLOSED (P7): omitting otherIncomes[].owner is now rejected, not silently re-timed', () => {
    const seed = 100006;
    const complete = gen.generateScenario(defaultPlan, seed);
    assert.ok(complete.retirement.otherIncomes && complete.retirement.otherIncomes[0],
      'seed ' + seed + ' must still generate an otherIncomes record for this to reproduce');
    assert.equal(complete.retirement.otherIncomes[0].owner, 'spouse',
      'seed ' + seed + ': the record must be spouse-owned or the omission changes nothing');

    const mutated = clone(complete);
    delete mutated.retirement.otherIncomes[0].owner;
    /* P7 CLOSED THIS. The omission is now refused at the validation boundary,
       so it cannot reach the engine and cannot be silent. What made it worth
       recording was never the size of the movement -- it was that nothing said
       anything: `i.owner === "spouse"` is false for an ABSENT owner, so a
       spouse-owned income was timed against SELF's age, shifting it by the whole
       age gap, and lifetime taxes moved $170,465.63 with no error of any kind.

       Deliberately NOT repaired by defaulting owner to 'self'. Q32 records that
       `household` reaches the same branch, and whether THAT is intended "is not
       written down anywhere" -- so a default would have quietly ratified one
       reading of an undecided question. Reporting decides nothing. */
    assert.equal(accepts(mutated), false,
      'omitting the owner of a spouse-owned income must now be REJECTED, not silently re-timed');
    const issue = validateScenario(clone(mutated)).issues
      .find((i) => String(i.path || '').includes('otherIncomes[0].owner'));
    assert.ok(issue, 'and the report must name the exact field');
    assert.equal(issue.severity, 'ERROR');

    /* otherIncomeFor(): `var spouse = i.owner === "spouse" && p.profile.spouseOn`.
       Absent owner => false => the income window is measured against SELF's age
       instead of the spouse's, shifting it by the age gap. */
    /* CONTROL: the COMPLETE record still validates and still runs, so the
       refusal is about the omission and not about the record shape. */
    assert.equal(accepts(complete), true, 'CONTROL: the complete record must still validate');
    assert.ok(!engine.runPlan(clone(complete)).calculationError,
      'CONTROL: and still compute cleanly');
  });

test('Q32b CLOSED (P7): omitting stages[].growthMode is now rejected, not silently reinterpreted', () => {
  const seed = 100000;
  const complete = gen.generateScenario(defaultPlan, seed);
  assert.ok(complete.retirement.stages && complete.retirement.stages[0],
    'seed ' + seed + ' must still generate a stages record');
  const mutated = clone(complete);
  delete mutated.retirement.stages[0].growthMode;

  /* P7 CLOSED THIS. The omission used to validate cleanly, run cleanly, and
     move fields with no error of any kind -- the growth BASIS changed because
     an absent mode fell through to a different branch. It is now refused at
     the boundary, so it cannot reach the engine.

     15 of the 70 measured silent-material cases were this site. */
  assert.equal(accepts(mutated), false,
    'omitting growthMode from a spending stage must now be REJECTED');
  const issue = validateScenario(clone(mutated)).issues
    .find((i) => String(i.path || '').includes('stages[0].growthMode'));
  assert.ok(issue, 'and the report must name the exact field');
  assert.equal(issue.severity, 'ERROR');

  /* CONTROL: the complete record still validates and still computes, so the
     refusal is about the omission rather than about the record shape. */
  assert.equal(accepts(complete), true, 'CONTROL: the complete record must still validate');
  assert.ok(!engine.runPlan(clone(complete)).calculationError, 'CONTROL: and compute cleanly');
});


// ---------------------------------------------------------------------------
// S3-06 -- damaged output must not be classified immaterial
//
// These drive classify() directly. The live sweep currently reports every
// surviving omission as `inert`, which is a good result and a useless test: a
// classifier whose corruption branches are never reached is indistinguishable
// from one that does not have them. The card's acceptance list is therefore
// exercised against constructed pairs, where each mutation is exactly one
// thing.
// ---------------------------------------------------------------------------

/* P5-02: `hsa` added. This fixture predated the widened row contract and
   omitted it, and the auditor's instruction was explicit -- repair the fixture
   rather than weaken the sweep's contract to accommodate it. */
const s306Row = (over) => Object.assign({
  age: 70, total: 1000, realTotal: 900, taxable: 400, preTax: 600, roth: 0, hsa: 0,
  income: 50, spending: 40, withdrawals: 40, taxes: 10, shortfall: 0,
  networth: 1000, debtBalance: 0, calculationError: false, calculationErrorCode: null,
}, over);

const s306Result = (rows) => ({
  calculationError: false, failed: false, successRate: 100, firstShortfallAge: null, rows,
});

/** A complete/mutated pair differing only by `mutate` applied to row 1. */
function s306Pair(mutate) {
  const base = () => s306Result([s306Row({ age: 69 }), s306Row(), s306Row({ age: 71 })]);
  const complete = base();
  const mutated = base();
  mutate(mutated);
  return { complete, mutated };
}

test('S3-06: a financial value that stops being finite is corruption, not an immaterial difference', () => {
  for (const bad of [NaN, Infinity, -Infinity, null, undefined, '1000']) {
    const { complete, mutated } = s306Pair((r) => { r.rows[1].total = bad; });
    const verdict = classify(complete, mutated);
    assert.equal(verdict.kind, 'corrupt',
      'total -> ' + describeOperand(bad) + ' must be corrupt, got ' + verdict.kind);
    assert.match(verdict.detail, /rows\[1\]\.total/, 'the verdict must name the field');
  }

  /* The specific old failure: NaN is typeof "number", so it passed the old
     guard, and then NaN > threshold is false, so it landed in immaterial. */
  const { complete, mutated } = s306Pair((r) => { r.rows[1].networth = NaN; });
  assert.notEqual(classify(complete, mutated).kind, 'silent-immaterial',
    'a NaN must never reach the immaterial bucket');
});

test('S3-06: adding or removing a row is detected, not truncated away', () => {
  const removed = s306Pair((r) => { r.rows.pop(); });
  assert.equal(classify(removed.complete, removed.mutated).kind, 'silent-material');
  assert.match(classify(removed.complete, removed.mutated).detail, /row count: 3 -> 2/);

  const added = s306Pair((r) => { r.rows.push(s306Row({ age: 72 })); });
  assert.equal(classify(added.complete, added.mutated).kind, 'silent-material');
  assert.match(classify(added.complete, added.mutated).detail, /row count: 3 -> 4/);
});

test('S3-06: a shifted age is reported as rows no longer lining up', () => {
  const { complete, mutated } = s306Pair((r) => { r.rows[1].age = 70.5; });
  const verdict = classify(complete, mutated);
  assert.equal(verdict.kind, 'silent-material');
  assert.match(verdict.detail, /rows\[1\]\.age/);
  assert.match(verdict.detail, /line up/, 'an alignment change must be reported as one');
});

test('S3-06: fields the old five-field list omitted are now compared', () => {
  /* Each of these was invisible: the classifier looked at total, spending,
     withdrawals, taxes and networth, and nothing else. */
  const omitted = ['income', 'taxable', 'preTax', 'roth', 'shortfall', 'realTotal', 'debtBalance'];
  for (const field of omitted) {
    const { complete, mutated } = s306Pair((r) => { r.rows[1][field] = r.rows[1][field] + 1000000; });
    const verdict = classify(complete, mutated);
    assert.equal(verdict.kind, 'silent-material',
      'a $1,000,000 change to ' + field + ' must be material, got ' + verdict.kind);
    assert.ok(verdict.detail.includes('rows[1].' + field),
      'the verdict must name the changed field; got "' + verdict.detail + '"');
  }
});

test('S3-06: an ordinary-row calculationErrorCode that disappears is caught', () => {
  const { complete, mutated } = s306Pair((r) => { delete r.rows[1].calculationErrorCode; });
  const verdict = classify(complete, mutated);
  assert.equal(verdict.kind, 'corrupt', 'a removed contract field is damage, not an absence of change');
  assert.match(verdict.detail, /calculationErrorCode/);
});

test('S3-06: the controls -- inert, loud, a corrupt baseline, and a reviewed small difference', () => {
  /* INERT: identical results still classify as inert. */
  const same = s306Pair(() => {});
  assert.equal(classify(same.complete, same.mutated).kind, 'inert');

  /* LOUD: an invalid status is reported as loud, not run through row arithmetic. */
  const loud = s306Pair((r) => { r.calculationError = true; r.calculationErrorCode = 'E_TEST'; });
  assert.equal(classify(loud.complete, loud.mutated).kind, 'loud');

  /* CORRUPT BASELINE: comparing against an invalid complete record means
     nothing, and must say so rather than reporting on the mutation. */
  const badBase = s306Pair(() => {});
  badBase.complete.calculationError = true;
  assert.equal(classify(badBase.complete, badBase.mutated).kind, 'corrupt-baseline');

  /* IMMATERIAL: a finite difference below the reviewed threshold is still
     immaterial -- the repair must not have turned every difference material. */
  const tiny = s306Pair((r) => { r.rows[1].total = 1000 + 1e-9; });
  assert.equal(classify(tiny.complete, tiny.mutated).kind, 'silent-immaterial',
    'a sub-threshold finite difference must remain immaterial');
  assert.equal(MATERIAL_RELATIVE_THRESHOLD, 1e-6, 'and the threshold must not have moved');

  /* MATERIAL: and one just above it still fires. */
  const material = s306Pair((r) => { r.rows[1].total = 1000 * (1 + 1e-5); });
  assert.equal(classify(material.complete, material.mutated).kind, 'silent-material');
});

test('RP-03: a corruption verdict reaches the regression gate, rather than being tallied and dropped', () => {
  const sweep = runSweep();

  /* The gate that matters. classify() can now return 'corrupt' and
     'corrupt-baseline'; before RP-03 neither reached `findings`, so the sweep
     counted them in its printed split and then forgot them. */
  const corrupted = sweep.findings.filter(
    (f) => f.kind === 'corrupt' || f.kind === 'corrupt-baseline');
  assert.deepEqual(corrupted, [],
    'an omission produced a DAMAGED result rather than a different one:\n  ' +
    corrupted.slice(0, 5).map((f) => f.seed + ' ' + f.path + ' -- ' + f.detail).join('\n  ') +
    '\n  This is not a materiality question. A field that stopped being a finite number, a row ' +
    'that appeared or vanished, or a baseline that is itself a calculation error all mean the ' +
    'comparison was against something it could not describe.');

  /* And the wiring itself, which is what actually regressed: every kind the
     tally counts except the two benign ones must be capable of reaching
     findings. Asserted against the tally's own keys so adding a sixth kind
     cannot quietly bypass the gate the way the fifth did. */
  const benign = ['inert', 'silent-immaterial'];
  const reportable = Object.keys(sweep.tally).filter((k) => benign.indexOf(k) < 0);
  assert.ok(reportable.length >= 4,
    'expected loud, silent-material and both corruption kinds to be reportable; got ' +
    JSON.stringify(reportable));
  for (const kind of reportable) {
    assert.equal(typeof sweep.tally[kind], 'number',
      kind + ' is counted but is not a number -- it was incremented into existence');
  }
});

test('RP-03 (second half): a NaN-bearing BASELINE is corrupt, even when the pair is identical', () => {
  /* The sweep's question is not "did this omission change the result" -- it is
     "does this omission hide damage". If the baseline is already damaged there
     is nothing to compare against, and `inert` is the most reassuring word the
     classifier can return for the worst thing it can be shown. Same false-calm
     shape as a capture reporting DETERMINISTIC over a corpus that lost twenty
     scenarios. */
  const bothNaN = s306Pair((r) => { r.rows[1].total = NaN; });
  bothNaN.complete.rows[1].total = NaN;          /* identical, and both damaged */

  assert.equal(classify(bothNaN.complete, bothNaN.mutated).kind, 'corrupt-baseline',
    'two identical NaN-bearing results must not classify as inert');

  /* The baseline check must run BEFORE the hash-equality shortcut, or an
     identical pair returns early and is never looked at. */
  const verdict = classify(bothNaN.complete, bothNaN.mutated);
  assert.match(verdict.detail, /rows\[1\]/, 'the verdict must locate the damage');

  /* CONTROLS. An ordinary identical pair is still inert -- the repair must not
     have made every comparison a corruption report. */
  const clean = s306Pair(() => {});
  assert.equal(classify(clean.complete, clean.mutated).kind, 'inert');

  /* And a clean baseline with a damaged mutation is still `corrupt`, not
     `corrupt-baseline` -- the two say different things about whose fault it is. */
  const mutatedOnly = s306Pair((r) => { r.rows[1].total = NaN; });
  assert.equal(classify(mutatedOnly.complete, mutatedOnly.mutated).kind, 'corrupt');
});
