'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEffectivenessGrader } = require('../../src/ported/effectiveness-grader');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'effectiveness-grader.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const grader = createEffectivenessGrader(
  fixtures.grading_config,
  fixtures.spending_config,
  fixtures.reserve_config,
  fixtures.portfolio_config
);

function toJsRow(pyRow) {
  return {
    year: pyRow.year,
    age: pyRow.age,
    retirementYear: pyRow.retirement_year,
    inflationFactor: pyRow.inflation_factor,
    spendingReal: pyRow.spending_real,
    spendingEligibleCeilingReal: pyRow.spending_eligible_ceiling_real,
    socialSecurityClaimAgeMonths: pyRow.social_security_claim_age_months,
    socialSecurityDecisionValid: pyRow.social_security_decision_valid,
    socialSecurityValidationCodes: pyRow.social_security_validation_codes,
    socialSecurityRobustness: pyRow.social_security_robustness,
    taxReal: pyRow.tax_real,
    withdrawals: {
      fromTbills: pyRow.withdrawals.from_tbills,
      fromVoo: pyRow.withdrawals.from_voo,
      fromRoth: pyRow.withdrawals.from_roth,
      fromSchd: pyRow.withdrawals.from_schd,
      feasible: pyRow.withdrawals.feasible,
    },
    reserveTargetReal: pyRow.reserve_target_real,
    endingRealBalances: pyRow.ending_real_balances,
    endingRealTotal: pyRow.ending_real_total,
  };
}

const EPS = 1e-6;
function assertClose(actual, expected, msg) {
  assert.ok(
    Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)),
    `${msg}: expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected)})`
  );
}

test('effectiveness grader port: grade() matches the Python oracle on every fixture case', () => {
  for (const c of fixtures.cases) {
    const annual = c.input.annual.map(toJsRow);
    const result = grader.grade(annual, {
      initialRealTotal: c.input.initial_real_total,
      diagnostics: c.input.diagnostics,
    });

    assert.equal(result.classification, c.output.classification, `${c.name}.classification`);
    assert.equal(result.valid, c.output.valid, `${c.name}.valid`);
    assertClose(result.score, c.output.score, `${c.name}.score`);
    assert.deepEqual(result.validityFlags, c.output.validity_flags, `${c.name}.validityFlags`);
    assert.deepEqual(result.concerns, c.output.concerns, `${c.name}.concerns`);

    for (const key of Object.keys(c.output.components)) {
      assertClose(result.components[key], c.output.components[key], `${c.name}.components.${key}`);
    }
    for (const key of Object.keys(c.output.metrics)) {
      const expected = c.output.metrics[key];
      const actual = result.metrics[key];
      if (expected === null) {
        assert.equal(actual, null, `${c.name}.metrics.${key}`);
      } else if (typeof expected === 'number') {
        assertClose(actual, expected, `${c.name}.metrics.${key}`);
      } else if (Array.isArray(expected)) {
        assert.deepEqual(actual, expected, `${c.name}.metrics.${key}`);
      } else {
        assert.equal(actual, expected, `${c.name}.metrics.${key}`);
      }
    }
  }
});
