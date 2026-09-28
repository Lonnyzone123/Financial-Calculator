'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTaxCalculator, taxIncome } = require('../../src/ported/tax-engine');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'tax-engine.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const calculator = createTaxCalculator(fixtures.config);

// Python dataclass field (snake_case) -> JS field (camelCase)
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

// IEEE-754 doubles should match bit-for-bit when the same arithmetic runs in
// the same order in both languages, but allow a tiny epsilon for any
// incidental reordering rather than demanding literal bit-identity.
const EPS = 1e-9;
function assertClose(actual, expected, msg) {
  assert.ok(
    Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)),
    `${msg}: expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected)})`
  );
}

test('tax engine port: calculate() matches the Python oracle on every fixture case', () => {
  for (const c of fixtures.calculate_cases) {
    const income = toJsIncome(c.input.income);
    const result = calculator.calculate(income, c.input.inflation_factor);
    for (const [pyField, jsField] of Object.entries(RESULT_FIELD_MAP)) {
      assertClose(result[jsField], c.output[pyField], `${c.name}.${jsField}`);
    }
  }
});

test('tax engine port: taxableSocialSecurity() matches the Python oracle', () => {
  for (const c of fixtures.calculate_cases) {
    const income = toJsIncome(c.input.income);
    const actual = calculator.taxableSocialSecurity(income);
    assertClose(actual, c.taxable_social_security_direct, `${c.name}.taxableSocialSecurity`);
  }
});

test('tax engine port: incrementalTax() matches the Python oracle', () => {
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

test('tax engine port: rejects invalid inputs the same way the Python source does', () => {
  assert.throws(() => calculator.calculate(taxIncome({}), 0), /positive/);
  assert.throws(() => calculator.calculate(taxIncome({ socialSecurity: -1 }), 1), /cannot be negative/);
  assert.throws(() => calculator.calculate(taxIncome({ ordinaryIncome: Infinity }), 1), /finite/);
});
