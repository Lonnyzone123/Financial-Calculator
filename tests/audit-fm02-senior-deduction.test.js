'use strict';

// FM-02 (whole-model audit, 2026-09-10) -- P1, live tax math error.
//
// THE DEFECT. The IRS worksheet reduces EACH qualifying person's $6,000
// deduction separately, enters the resulting amount for each spouse, and
// then adds them. The engine instead starts at $12,000 for a couple and
// subtracts ONE reduction:
//
//     current : max(0, 6000*n  -  0.06 * max(0, MAGI - 150000))
//     correct : n * max(0, 6000 - 0.06 * max(0, MAGI - 150000))
//
// IRS Schedule 1-A, Part V, lines 31-37.
//
// WHY 841 TESTS MISSED IT, and this is the part worth keeping. The deduction
// is computed in two places -- seniorDeduction() and the affine mirror
// inside taxSegmentLocal() -- and the quote/commit machinery verifies that
// the two AGREE. They do agree. They agree on the same wrong rule. Two
// implementations of one misreading can never disagree, so no amount of
// algebraic cross-checking could surface this.
//
// The existing tests/senior-deduction.test.js compounds it honestly: every
// one of its phaseout cases uses a SINGLE senior, and the two formulas are
// identical for n=1. Its two-senior cases all sit at or below the threshold,
// where they are identical again. The blind spot is exactly "two seniors,
// above the threshold".
//
// So the expected values below come from the STATUTE, computed in this file,
// never by calling the code under test. That is the whole point: an oracle
// derived from the implementation cannot detect a misread rule.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');
const R = global.RULES.federal.seniorDeduction;

/** The statute, written out independently: reduce per person, then add. */
function statutoryDeduction(magi, eligibleCount, filing) {
  const start = filing === 'mfj' ? R.jointPhaseoutStart : R.singlePhaseoutStart;
  const perPerson = Math.max(0, R.perEligiblePerson - R.phaseoutRate * Math.max(0, magi - start));
  return eligibleCount * perPerson;
}

// ---------------------------------------------------------------------------
// 1. The first-failing case -- two seniors, above the joint threshold
// ---------------------------------------------------------------------------

test('FM-02: two seniors at $200,000 joint MAGI get $6,000, not $9,000', () => {
  const actual = engine.seniorDeduction(200000, [70, 70], 'mfj');
  assert.equal(statutoryDeduction(200000, 2, 'mfj'), 6000, 'sanity: the statute gives $6,000 here');
  assert.equal(actual, 6000,
    'the deduction phases out PER PERSON: 2 x max(0, 6000 - 0.06 x 50000) = 2 x 3000 = 6000. ' +
    'Subtracting one reduction from a doubled cap gives 9000.');
});

test('FM-02: the full phaseout table matches the statute at every step', () => {
  const cases = [
    [150000, 12000],
    [175000, 9000],
    [200000, 6000],
    [225000, 3000],
    [250000, 0],
    [300000, 0],
  ];
  for (const [magi, expected] of cases) {
    assert.equal(statutoryDeduction(magi, 2, 'mfj'), expected, 'sanity at MAGI ' + magi);
    assert.equal(
      engine.seniorDeduction(magi, [70, 70], 'mfj'), expected,
      'two seniors at MAGI ' + magi + ' must get ' + expected
    );
  }
});

// ---------------------------------------------------------------------------
// 2. The cases that were already correct must stay correct
// ---------------------------------------------------------------------------

test('FM-02: one senior is unchanged -- both formulas agree at n=1, which is why this was invisible', () => {
  for (const magi of [0, 75000, 100000, 125000, 150000, 175000, 200000]) {
    assert.equal(
      engine.seniorDeduction(magi, [70], 'single'), statutoryDeduction(magi, 1, 'single'),
      'single senior at MAGI ' + magi
    );
  }
});

test('FM-02: zero eligible people still returns exactly 0', () => {
  assert.equal(engine.seniorDeduction(0, [40, 50], 'mfj'), 0);
  assert.equal(engine.seniorDeduction(500000, [], 'mfj'), 0);
});

test('FM-02: below the threshold, two seniors still get the full doubled cap', () => {
  assert.equal(engine.seniorDeduction(0, [70, 68], 'mfj'), R.perEligiblePerson * 2);
  assert.equal(engine.seniorDeduction(R.jointPhaseoutStart, [70, 68], 'mfj'), R.perEligiblePerson * 2);
});

test('FM-02: only people 65+ count, at any MAGI', () => {
  assert.equal(engine.seniorDeduction(200000, [70, 40], 'mfj'), statutoryDeduction(200000, 1, 'mfj'));
  assert.equal(engine.seniorDeduction(200000, [64.999, 64], 'mfj'), 0);
});

// ---------------------------------------------------------------------------
// 3. Boundaries, and small offsets either side of each
// ---------------------------------------------------------------------------

test('FM-02: the phaseout start and the per-person zero-crossing are exact, from both sides', () => {
  const start = R.jointPhaseoutStart;
  const zeroCrossing = start + R.perEligiblePerson / R.phaseoutRate; // per person, not per couple

  for (const magi of [start - 1, start, start + 1, zeroCrossing - 1, zeroCrossing, zeroCrossing + 1]) {
    assert.equal(
      engine.seniorDeduction(magi, [70, 70], 'mfj'), statutoryDeduction(magi, 2, 'mfj'),
      'two seniors at MAGI ' + magi
    );
  }

  // The couple's deduction must reach zero at the PER-PERSON crossing, not at
  // twice that MAGI -- the old formula stretched the phaseout to double width.
  assert.equal(engine.seniorDeduction(zeroCrossing, [70, 70], 'mfj'), 0,
    'both spouses phase out together; the range does not widen because there are two of them');
});

test('FM-02: single and mfj keep independent thresholds', () => {
  const s = R.singlePhaseoutStart;
  assert.equal(engine.seniorDeduction(s + 10000, [70], 'single'), statutoryDeduction(s + 10000, 1, 'single'));
  assert.equal(engine.seniorDeduction(s + 10000, [70, 70], 'mfj'), statutoryDeduction(s + 10000, 2, 'mfj'));
});

// ---------------------------------------------------------------------------
// 4. The estimator, and the solver's affine mirror, must agree WITH THE
//    STATUTE -- not merely with each other
// ---------------------------------------------------------------------------

function estimatorPlan(age, spouseAge) {
  return {
    profile: { filing: 'mfj', state: 'AZ', age, spouseAge, spouseOn: true, retireAge: 60, endAge: 95 },
    employment: { salary: 0, spouseSalary: 0 },
    assumptions: {},
    retirement: {},
    advanced: {},
  };
}

test('FM-02: estimateTaxes reflects the corrected deduction at $200,000 of ordinary income', () => {
  const p = estimatorPlan(70, 70);
  const taxes = engine.estimateTaxes(p, 70, 200000, 0, 0, 0, 0, 0);

  // The deduction the estimator should be applying, derived from the statute.
  const expectedSenior = statutoryDeduction(200000, 2, 'mfj');
  assert.equal(expectedSenior, 6000);

  const standard = global.RULES.federal.standardDeduction.mfj;
  /* S5AA task 3.1 (Q88): the IRC 63(f) additional standard deduction for the aged, which was missing from
     the engine entirely until then. Written FROM THE STATUTE here, not by calling the engine function under
     test, because this file's whole point is agreement with the statute rather than self-agreement:
     Rev. Proc. 2025-32 section 4.14(3) gives $1,650 per qualifying person, increased to $2,050 only if the
     individual is also unmarried and not a surviving spouse -- which a joint filer is not. Two people aged 70. */
  const expectedAdditional = 2 * 1650;
  const expectedOrdinaryTaxable = Math.max(0, 200000 - (standard + expectedSenior + expectedAdditional));
  assert.equal(
    taxes.ordinaryTaxable, expectedOrdinaryTaxable,
    'taxable ordinary income must reflect a $6,000 senior deduction, not $9,000'
  );
});

test('FM-02: the solver mirror agrees with the estimator across the joint phaseout', () => {
  // Agreement is necessary but not sufficient (that is how this defect
  // survived) -- so each point is ALSO checked against the statute above.
  // Here we only confirm the two implementations were corrected together,
  // which is the specific risk of patching seniorDeduction() alone.
  const standard = global.RULES.federal.standardDeduction.mfj;
  for (const magi of [150000, 175000, 200000, 225000, 250000]) {
    const p = estimatorPlan(70, 70);
    const taxes = engine.estimateTaxes(p, 70, magi, 0, 0, 0, 0, 0);
    /* + the 63(f) additional amount, $1,650 per qualifying person, two joint filers aged 70 (S5AA task 3.1).
       It carries NO phaseout, so unlike the senior deduction it is the same at every MAGI in this loop --
       which is itself a statement about the two deductions being different mechanisms. */
    const expected = Math.max(0, magi - (standard + statutoryDeduction(magi, 2, 'mfj') + 2 * 1650));
    assert.equal(taxes.ordinaryTaxable, expected, 'ordinaryTaxable at MAGI ' + magi);
  }
});

test('S5AA 3.1: each eligible spouse adds the SAME deduction, at every income, whatever the brackets do', () => {
  /* This moved here from tests/public-route-fm02.test.js, which may only use the public route. It is the
     claim that file's "twice one spouse's deduction" test is named for, and it belongs wherever the
     deduction is visible rather than inferred from a tax difference.
     WHY IT CANNOT BE ASSERTED THROUGH THE TAX: equal deductions produce equal tax savings only while every
     dollar of both sits inside one bracket. S5AA task 3.1 made the total large enough that at $70,000 of
     joint income a two-senior couple lands at $22,500 of taxable income, BELOW the $24,800 joint 10%/12%
     boundary (it cleared it by $1,000 before), so the second spouse's deduction reaches into the 10% band
     and genuinely saves less. The deduction identity holds regardless, which is why it is the better test. */
  const deductionFor = (a, b, magi) => global.RULES.federal.standardDeduction.mfj
    + engine.seniorDeduction(magi, [a, b], 'mfj')
    + engine.additionalStandardDeduction([a, b], 'mfj');

  for (const magi of [70000, 100000, 140000, 200000, 400000]) {
    const first = deductionFor(70, 64, magi) - deductionFor(64, 64, magi);
    const second = deductionFor(70, 70, magi) - deductionFor(70, 64, magi);
    assert.ok(Math.abs(second - first) < 1e-9,
      'at MAGI ' + magi + ' the second eligible spouse must add the same deduction as the first: '
      + first + ' then ' + second);
    /* CONTROL: and there must BE a deduction to add, or the equality above is the trivial 0 === 0. The
       63(f) amount has no phaseout, so this holds at every income, including past the senior phaseout. */
    assert.ok(first > 0, 'at MAGI ' + magi + ' an eligible spouse must add something: ' + first);
  }
});
