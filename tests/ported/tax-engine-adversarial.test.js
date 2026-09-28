'use strict';

/**
 * Adversarial/edge-case stress test for the tax engine port, added during a
 * Phase 5 audit pass. See fixtures/generate_tax_engine_adversarial_fixtures.py
 * for the reasoning -- mostly exact bracket/threshold boundaries, the class
 * of input most likely to expose an off-by-one inequality direction.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTaxCalculator, taxIncome } = require('../../src/ported/tax-engine');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'tax-engine-adversarial.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const calculator = createTaxCalculator(fixtures.config);

const FIELD_MAP = {
  ordinary_income: 'ordinaryIncome',
  qualified_dividends: 'qualifiedDividends',
  nonqualified_dividends: 'nonqualifiedDividends',
  long_term_gains: 'longTermGains',
  treasury_interest: 'treasuryInterest',
  social_security: 'socialSecurity',
  capital_loss_carryforward: 'capitalLossCarryforward',
};

const RESULT_FIELD_MAP = {
  federal_ordinary: 'federalOrdinary',
  federal_preferential: 'federalPreferential',
  niit: 'niit',
  arizona: 'arizona',
  total: 'total',
  taxable_social_security: 'taxableSocialSecurity',
  taxable_ordinary: 'taxableOrdinary',
  taxable_preferential: 'taxablePreferential',
  magi: 'magi',
  ending_loss_carryforward: 'endingLossCarryforward',
};

function toJsIncome(pyIncome) {
  const out = {};
  for (const [py, js] of Object.entries(FIELD_MAP)) out[js] = pyIncome[py];
  return taxIncome(out);
}

const EPS = 1e-6;
function assertClose(actual, expected, msg) {
  assert.ok(
    Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)),
    `${msg}: expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected)})`
  );
}

test('tax engine ADVERSARIAL: calculate() matches Python exactly at every bracket/threshold boundary', () => {
  for (const c of fixtures.calculate_cases) {
    const income = toJsIncome(c.input.income);
    const result = calculator.calculate(income, c.input.inflation_factor);
    for (const [pyField, jsField] of Object.entries(RESULT_FIELD_MAP)) {
      assertClose(result[jsField], c.output[pyField], `${c.name}.${jsField}`);
    }
  }
});

test('tax engine ADVERSARIAL: incrementalTax() matches Python for zero/missing/negative deltas', () => {
  for (const c of fixtures.incremental_cases) {
    const base = toJsIncome(c.input.base);
    const deltas = c.input.deltas;
    const actual = calculator.incrementalTax(base, {
      inflationFactor: c.input.inflation_factor,
      ordinaryDelta: deltas.ordinary_delta,
      qualifiedDividendDelta: deltas.qualified_dividend_delta,
      nonqualifiedDividendDelta: deltas.nonqualified_dividend_delta,
      longTermGainDelta: deltas.long_term_gain_delta,
    });
    assertClose(actual, c.output.incremental_tax, `${c.name}.incrementalTax`);
  }
});
