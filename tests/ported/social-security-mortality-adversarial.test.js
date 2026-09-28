'use strict';

/**
 * Adversarial test for the mortality port -- same audit-pass pattern applied
 * to Phases 5-8 and, in this phase, to the optimizer, bridge, valuation
 * engine, and longevity analyzer.
 *
 * The headline check is a DIFFERENTIAL test against an implementation this
 * project never ported: `mortality_data.py`'s conditional_survival()
 * computes annual survival as a direct running product of (1 - q(x)), while
 * the ported `MortalityTable.annual_survival()` gets there by interpolating
 * each year into twelve constant-force monthly steps and compounding them.
 * ((1-q)^(1/12))^12 == (1-q) in real arithmetic, so agreement to
 * floating-point round-trip error proves the monthly interpolation is right
 * -- and because neither implementation is a rewrite of the other, this is a
 * genuine oracle rather than a tautology.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildMortalityPolicy, createMortalityTable, profilePoint, profileTerminalSurvival, profileCumulativeDeathProbability } = require('../../src/ported/social-security-mortality');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-mortality-adversarial.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
const DATA = require('../../src/ported/ss-mortality-data.json');

test('mortality ADVERSARIAL: the shipped table reproduces the SSA package manifest\'s own documented q(62) values', () => {
  // These three figures come from the source package's own metadata
  // (SOURCE_MANIFEST.json validation.notes), not from anything this project
  // computed -- so they check the whole extraction pipeline (CSV parse ->
  // cohort filter -> JSON ship) against an external reference.
  const documented = fixtures.manifest_documented_q62_1997.values;
  for (const alt of ['I', 'II', 'III']) {
    assert.equal(
      DATA.death_probability[alt]['1997'][62], documented[alt],
      `shipped q(62) for the 1997 male cohort, alternative ${alt}, must match the manifest exactly`
    );
  }
  // And the manifest's own note text should still name those values, so a
  // future data refresh that changes them can't silently pass this test.
  const note = fixtures.manifest_documented_q62_1997.note;
  for (const alt of ['I', 'II', 'III']) {
    assert.ok(note.includes(String(documented[alt])), `manifest note should quote the ${alt} value it documents`);
  }
});

test('mortality ADVERSARIAL: the full shipped dataset is structurally sound across all 603 cohort-alternative series', () => {
  let cohortArrays = 0;
  const expectedLength = DATA.age_end - DATA.age_start + 1;
  for (let year = DATA.birth_year_start; year <= DATA.birth_year_end; year++) {
    for (const alt of DATA.alternatives) {
      const arr = DATA.death_probability[alt][String(year)];
      assert.ok(Array.isArray(arr), `${alt}/${year} must be present`);
      assert.equal(arr.length, expectedLength, `${alt}/${year} must hold one q(x) per age`);
      for (let age = 0; age < arr.length; age++) {
        const q = arr[age];
        assert.ok(typeof q === 'number' && Number.isFinite(q), `${alt}/${year} q(${age}) must be a finite number`);
        assert.ok(q >= 0 && q <= 1, `${alt}/${year} q(${age}) = ${q} must lie in [0,1]`);
      }
      cohortArrays++;
    }
  }
  assert.equal(cohortArrays, 3 * (DATA.birth_year_end - DATA.birth_year_start + 1), 'every alternative x birth year combination must be present');
});

test('mortality ADVERSARIAL: alternative ordering (I >= II >= III) holds at every age of every cohort', () => {
  // The manifest describes Alternative I as the higher-mortality sensitivity
  // and III as the lower-mortality one, so death probabilities must order
  // that way everywhere. A cohort extracted from the wrong CSV column (or
  // the wrong file) would break this without breaking any length or range
  // check.
  let checks = 0;
  for (let year = DATA.birth_year_start; year <= DATA.birth_year_end; year++) {
    const I = DATA.death_probability.I[String(year)];
    const II = DATA.death_probability.II[String(year)];
    const III = DATA.death_probability.III[String(year)];
    for (let age = 0; age < I.length; age++) {
      assert.ok(I[age] >= II[age], `q(${age}) for ${year}: alternative I (${I[age]}) must be >= II (${II[age]})`);
      assert.ok(II[age] >= III[age], `q(${age}) for ${year}: alternative II (${II[age]}) must be >= III (${III[age]})`);
      checks++;
    }
  }
  assert.equal(checks, 120 * (DATA.birth_year_end - DATA.birth_year_start + 1));
});

test('mortality ADVERSARIAL: annualSurvival() matches BOTH the ported and the never-ported Python survival paths', () => {
  for (const c of fixtures.differential_cases) {
    const table = createMortalityTable(buildMortalityPolicy(c.birth_year), c.alternative);
    const actual = table.annualSurvival({
      birthYear: c.birth_year, sex: 'male',
      valuationAge: c.valuation_age, throughAge: c.through_age,
    });
    const label = `${c.birth_year}/${c.alternative} ${c.valuation_age}-${c.through_age}`;

    assert.equal(actual.length, c.interpolated_annual_survival.length, `${label} length`);

    for (let i = 0; i < actual.length; i++) {
      // vs. the same algorithm in Python (the ported one): must agree to
      // near machine precision.
      assert.ok(
        Math.abs(actual[i] - c.interpolated_annual_survival[i]) <= 1e-12,
        `${label}[${i}] vs ported Python path: expected ${c.interpolated_annual_survival[i]}, got ${actual[i]}`
      );
      // vs. a DIFFERENT algorithm in Python (the never-ported direct annual
      // product): must agree to float round-trip error, proving the monthly
      // constant-force interpolation reconstructs annual survival exactly.
      assert.ok(
        Math.abs(actual[i] - c.direct_annual_survival[i]) <= 1e-12,
        `${label}[${i}] vs never-ported direct annual product: expected ${c.direct_annual_survival[i]}, got ${actual[i]}`
      );
    }
    assert.ok(c.max_abs_difference < 1e-12, `${label}: Python's own two paths already agree to ${c.max_abs_difference}`);
  }
});

test('mortality ADVERSARIAL: a q(x) of exactly 1.0 (real, present in the 1901-1903 shipped cohorts) drives survival to exactly zero and keeps it there', () => {
  for (const c of fixtures.certain_death_cases) {
    const label = `${c.birth_year}/${c.alternative} certain death at ${c.certain_death_age}`;
    assert.equal(DATA.death_probability[c.alternative][String(c.birth_year)][c.certain_death_age], 1.0, `${label}: shipped q must be exactly 1.0`);

    const table = createMortalityTable(buildMortalityPolicy(c.birth_year), c.alternative);
    const profile = table.conditionalProfile({
      birthYear: c.birth_year, sex: 'male',
      valuationAgeMonths: c.valuation_age_months, throughAgeMonths: c.through_age_months,
    });

    assert.equal(profile.points.length, c.points.length, `${label}: point count`);
    for (let i = 0; i < profile.points.length; i++) {
      assert.equal(profile.points[i].ageMonths, c.points[i].age_months, `${label}[${i}].ageMonths`);
      assert.ok(Math.abs(profile.points[i].survival - c.points[i].survival) <= 1e-12, `${label}[${i}].survival`);
      assert.ok(Math.abs(profile.points[i].deathProbability - c.points[i].death_probability) <= 1e-12, `${label}[${i}].deathProbability`);
    }

    // The structural consequence, asserted directly rather than inferred
    // from the fixture values: once the certain-death year begins, survival
    // is EXACTLY zero (not merely tiny), and every later month's
    // unconditional death probability is exactly zero too, since there is
    // no one left to die.
    const certainDeathMonth = c.certain_death_age * 12;
    const after = profile.points.filter((p) => p.ageMonths > certainDeathMonth);
    assert.ok(after.length > 0, `${label}: expected months after the certain-death year to exist`);
    for (const p of after) {
      assert.equal(p.survival, 0, `${label}: survival at month ${p.ageMonths} must be exactly 0`);
      assert.equal(p.deathProbability, 0, `${label}: death probability at month ${p.ageMonths} must be exactly 0`);
    }
    assert.equal(profileTerminalSurvival(profile), 0, `${label}: terminal survival must be exactly 0`);
    assert.ok(Math.abs(profileCumulativeDeathProbability(profile) - c.cumulative_death_probability) <= 1e-12, `${label}: cumulative death probability`);
  }
});

test('mortality ADVERSARIAL: conditional survival is monotonically non-increasing and starts at exactly 1.0', () => {
  // A property test rather than a fixture comparison -- checked over a wide
  // span of cohorts and alternatives, including the oldest (certain-death)
  // and newest projected ones.
  for (const birthYear of [1901, 1930, 1960, 1997, 2050, 2100]) {
    for (const alt of ['I', 'II', 'III']) {
      const table = createMortalityTable(buildMortalityPolicy(birthYear), alt);
      const profile = table.conditionalProfile({
        birthYear, sex: 'male', valuationAgeMonths: 62 * 12, throughAgeMonths: 120 * 12,
      });
      assert.equal(profile.points[0].survival, 1.0, `${birthYear}/${alt}: conditional survival must start at exactly 1.0`);
      let previous = 1.0;
      for (const point of profile.points) {
        assert.ok(point.survival <= previous + 1e-12, `${birthYear}/${alt}: survival rose at month ${point.ageMonths}`);
        assert.ok(point.survival >= 0, `${birthYear}/${alt}: survival went negative at month ${point.ageMonths}`);
        previous = point.survival;
      }
      assert.equal(profilePoint(profile, 62 * 12).survival, 1.0, `${birthYear}/${alt}: profilePoint at the valuation month`);
    }
  }
});
