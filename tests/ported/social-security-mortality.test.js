'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildMortalityPolicy, createMortalityTable, profilePoint, profileTerminalSurvival, profileCumulativeDeathProbability } = require('../../src/ported/social-security-mortality');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-mortality.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const EPS = 1e-9;
function assertClose(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) <= EPS, `${msg}: expected ${expected}, got ${actual}`);
}

test('social security mortality port: buildMortalityPolicy + conditionalProfile match the Python oracle', () => {
  for (const c of fixtures.cases) {
    if (c.name === 'error_bad_alternative') {
      const policy = buildMortalityPolicy(1997);
      assert.throws(() => createMortalityTable(policy, 'IV'), /Mortality alternative is not cached/);
      continue;
    }
    const { birth_year, sex, alternative, valuation_age_months, through_age_months } = c.input;
    // error_bad_birth_year/error_bad_sex deliberately build the policy for
    // 1997 (matching the Python fixture's own setup) and then call
    // conditionalProfile with a mismatched birth_year/sex to exercise the
    // identity check -- every other case's policy year equals input.birth_year.
    const policyYear = (c.name === 'error_bad_birth_year' || c.name === 'error_bad_sex') ? 1997 : birth_year;
    const policy = buildMortalityPolicy(policyYear);
    const table = createMortalityTable(policy, alternative);

    if (c.expect_error !== undefined) {
      assert.throws(
        () => table.conditionalProfile({ birthYear: birth_year, sex, valuationAgeMonths: valuation_age_months, throughAgeMonths: through_age_months }),
        new RegExp(c.expect_error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${c.name} must raise the same error as Python`
      );
      continue;
    }

    const profile = table.conditionalProfile({
      birthYear: birth_year, sex, valuationAgeMonths: valuation_age_months, throughAgeMonths: through_age_months,
    });
    assert.equal(profile.points.length, c.output.points.length, `${c.name}.points.length`);
    for (let i = 0; i < profile.points.length; i++) {
      const expected = c.output.points[i];
      const actual = profile.points[i];
      assert.equal(actual.ageMonths, expected.age_months, `${c.name}.points[${i}].age_months`);
      assertClose(actual.survival, expected.survival, `${c.name}.points[${i}].survival`);
      assertClose(actual.deathProbability, expected.death_probability, `${c.name}.points[${i}].death_probability`);
    }
    assertClose(profileTerminalSurvival(profile), c.output.terminal_survival, `${c.name}.terminal_survival`);
    assertClose(profileCumulativeDeathProbability(profile), c.output.cumulative_death_probability, `${c.name}.cumulative_death_probability`);
    assert.equal(profile.sourceSha256, c.output.source_sha256, `${c.name}.source_sha256`);

    // profilePoint() spot check at valuation and terminal months.
    const first = profilePoint(profile, valuation_age_months);
    assertClose(first.survival, 1.0, `${c.name}.profilePoint(valuation).survival`);
    assert.throws(() => profilePoint(profile, valuation_age_months - 1), /Requested age is outside the mortality profile/);
  }
});

test('social security mortality port: annualSurvival matches the Python oracle', () => {
  for (const c of fixtures.annual_survival_cases) {
    const policy = buildMortalityPolicy(c.input.birth_year);
    const table = createMortalityTable(policy, c.input.alternative);
    const survival = table.annualSurvival({
      birthYear: c.input.birth_year, sex: c.input.sex,
      valuationAge: c.input.valuation_age, throughAge: c.input.through_age,
    });
    assert.equal(survival.length, c.output.length, `${c.name}.length`);
    for (let i = 0; i < survival.length; i++) {
      assertClose(survival[i], c.output[i], `${c.name}[${i}]`);
    }
  }
});

test('social security mortality port: buildMortalityPolicy rejects an out-of-range birth year', () => {
  assert.throws(() => buildMortalityPolicy(1899), /Birth year 1899 is outside the cached range/);
  assert.throws(() => buildMortalityPolicy(2101), /Birth year 2101 is outside the cached range/);
});

test('social security mortality port: shipped data table completeness (every birth year 1900-2100 present for all 3 alternatives)', () => {
  const data = require('../../src/ported/ss-mortality-data.json');
  assert.deepEqual(data.alternatives, ['I', 'II', 'III']);
  for (const alt of data.alternatives) {
    for (let year = data.birth_year_start; year <= data.birth_year_end; year++) {
      const arr = data.death_probability[alt][String(year)];
      assert.equal(arr.length, data.age_end - data.age_start + 1, `${alt}/${year} length`);
    }
  }
});
