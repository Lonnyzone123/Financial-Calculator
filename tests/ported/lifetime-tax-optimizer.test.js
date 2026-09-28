'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTaxCalculator, taxIncome } = require('../../src/ported/tax-engine');
const { account, createLifetimeTaxOptimizer } = require('../../src/ported/lifetime-tax-optimizer');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'lifetime-tax-optimizer.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const taxCalculator = createTaxCalculator(fixtures.tax_config);

const INCOME_FIELD_MAP = {
  ordinary_income: 'ordinaryIncome',
  qualified_dividends: 'qualifiedDividends',
  nonqualified_dividends: 'nonqualifiedDividends',
  long_term_gains: 'longTermGains',
  treasury_interest: 'treasuryInterest',
  social_security: 'socialSecurity',
  capital_loss_carryforward: 'capitalLossCarryforward',
};

function toJsIncome(pyIncome) {
  const out = {};
  for (const [py, js] of Object.entries(INCOME_FIELD_MAP)) out[js] = pyIncome[py];
  return taxIncome(out);
}

function toJsPortfolio(pyPortfolio) {
  const out = {};
  for (const source of ['voo', 'schd', 'tbills', 'roth']) {
    const a = pyPortfolio[source];
    out[source] = account(a.name, a.value, a.basis, a.taxable);
  }
  return out;
}

function toJsState(pyState) {
  return {
    inflationFactor: pyState.inflation_factor,
    retirementYear: pyState.retirement_year,
    equityDrawdown: pyState.equity_drawdown,
  };
}

const PLAN_FIELD_MAP = {
  required_cash: 'requiredCash',
  from_tbills: 'fromTbills',
  from_voo: 'fromVoo',
  from_roth: 'fromRoth',
  from_schd: 'fromSchd',
  tax: 'tax',
  realized_gain: 'realizedGain',
  iterations: 'iterations',
  objective: 'objective',
  feasible: 'feasible',
};

// The grid search compares floating-point objective scores computed via long
// chains of arithmetic (bracket math, powers, sums) in two different
// language runtimes -- a looser tolerance than the tax engine's own is
// appropriate for the *dollar* outputs (still tiny relative to plan sizes),
// while feasible/iterations/reasons must match exactly (they're
// discrete/logical, not accumulated floats).
const EPS = 1e-6;
function assertClose(actual, expected, msg) {
  assert.ok(
    Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)),
    `${msg}: expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected)})`
  );
}

test('lifetime tax optimizer port: optimize() matches the Python oracle on every fixture case', () => {
  for (const c of fixtures.cases) {
    const optimizer = createLifetimeTaxOptimizer(taxCalculator, fixtures.optimizer_config);
    const portfolio = toJsPortfolio(c.input.portfolio);
    const baseIncome = toJsIncome(c.input.base_income);
    const state = toJsState(c.input.state);

    const plan = optimizer.optimize({
      portfolio,
      baseIncome,
      preTaxCashShortfall: c.input.pre_tax_cash_shortfall,
      state,
    });

    for (const [pyField, jsField] of Object.entries(PLAN_FIELD_MAP)) {
      const expected = c.output[pyField];
      const actual = plan[jsField];
      if (typeof expected === 'boolean') {
        assert.equal(actual, expected, `${c.name}.${jsField}`);
      } else if (expected === 'Infinity' || expected === '-Infinity') {
        // The fixture generator sanitizes Python's bare Infinity/-Infinity
        // json tokens (not valid JSON) into these string sentinels.
        assert.equal(actual, expected === 'Infinity' ? Infinity : -Infinity, `${c.name}.${jsField}`);
      } else {
        assertClose(actual, expected, `${c.name}.${jsField}`);
      }
    }

    assert.deepEqual(plan.reasons, c.output.reasons, `${c.name}.reasons`);

    // Portfolio must be left untouched by optimize() -- every allocation is
    // evaluated against a clone, exactly like the Python source.
    for (const source of ['voo', 'schd', 'tbills', 'roth']) {
      assertClose(portfolio[source].value, c.input.portfolio[source].value, `${c.name}.portfolio.${source}.value (must be unmutated)`);
    }
  }
});
