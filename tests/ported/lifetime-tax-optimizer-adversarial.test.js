'use strict';

/**
 * Adversarial/edge-case stress test for the lifetime tax optimizer port,
 * added during a Phase 5 audit pass and updated after the engine's
 * post-audit-repair requalification (WD-001/WD-002 -- see
 * fixtures/generate_lifetime_tax_optimizer_adversarial_fixtures.py). Two
 * cases now assert against the *repaired* oracle behavior rather than the
 * original one: max_tax_iterations=0 is now a rejected input (WD-001) where
 * it previously exercised Python's `for...else` empty-range semantics, and
 * the genuine-non-convergence case now correctly reports infeasible instead
 * of silently returning an unreconciled plan (WD-002).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTaxCalculator, taxIncome } = require('../../src/ported/tax-engine');
const { account, createLifetimeTaxOptimizer } = require('../../src/ported/lifetime-tax-optimizer');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'lifetime-tax-optimizer-adversarial.fixtures.json');
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

const EPS = 1e-6;
function assertClose(actual, expected, msg) {
  assert.ok(
    Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)),
    `${msg}: expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected)})`
  );
}

test('lifetime tax optimizer ADVERSARIAL: matches Python on every edge-case scenario', () => {
  for (const c of fixtures.cases) {
    if (c.expect_error !== undefined) {
      const optimizer = createLifetimeTaxOptimizer(taxCalculator, c.input.optimizer_config);
      assert.throws(
        () => optimizer.optimize({
          portfolio: toJsPortfolio(c.input.portfolio),
          baseIncome: toJsIncome(c.input.base_income),
          preTaxCashShortfall: c.input.pre_tax_cash_shortfall,
          state: toJsState(c.input.state),
        }),
        new RegExp(c.expect_error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${c.name} must raise the same error as Python`
      );
      continue;
    }
    const optimizer = createLifetimeTaxOptimizer(taxCalculator, c.input.optimizer_config);
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
        assert.equal(actual, expected === 'Infinity' ? Infinity : -Infinity, `${c.name}.${jsField}`);
      } else if (jsField === 'iterations') {
        // Exact integer match -- this is the specific field the
        // max_tax_iterations=0/1 and exhausted-iteration edge cases exist
        // to pin down, so no tolerance here.
        assert.equal(actual, expected, `${c.name}.${jsField}`);
      } else {
        assertClose(actual, expected, `${c.name}.${jsField}`);
      }
    }
    assert.deepEqual(plan.reasons, c.output.reasons, `${c.name}.reasons`);
  }
});

test('lifetime tax optimizer ADVERSARIAL: max_tax_iterations=0 is rejected exactly like Python (post-audit-repair WD-001)', () => {
  // Pre-audit-repair, this exercised Python's for-else-on-an-empty-range
  // semantics (a loop that runs zero times still "completes without
  // break"). The requalified engine now rejects max_tax_iterations<1
  // outright before that loop is ever reached, so the JS port's own guard
  // (added to mirror the fix) is what this test proves instead.
  const c = fixtures.cases.find((x) => x.name === 'max_tax_iterations_zero');
  assert.ok(c.expect_error, 'fixture must now be an expect_error case');
  const optimizer = createLifetimeTaxOptimizer(taxCalculator, c.input.optimizer_config);
  assert.throws(
    () => optimizer.optimize({
      portfolio: toJsPortfolio(c.input.portfolio),
      baseIncome: toJsIncome(c.input.base_income),
      preTaxCashShortfall: c.input.pre_tax_cash_shortfall,
      state: toJsState(c.input.state),
    }),
    /Tax gross-up requires at least one iteration/
  );
});

test('lifetime tax optimizer ADVERSARIAL: a genuinely non-convergent case exhausts every iteration', () => {
  const c = fixtures.cases.find((x) => x.name === 'tight_tolerance_taxable_sources_only');
  const optimizer = createLifetimeTaxOptimizer(taxCalculator, c.input.optimizer_config);
  const plan = optimizer.optimize({
    portfolio: toJsPortfolio(c.input.portfolio),
    baseIncome: toJsIncome(c.input.base_income),
    preTaxCashShortfall: c.input.pre_tax_cash_shortfall,
    state: toJsState(c.input.state),
  });
  assert.equal(plan.iterations, c.input.optimizer_config.max_tax_iterations, 'must exhaust every iteration, not stop early');
  assert.deepEqual(plan.reasons, ['tax gross-up did not converge']);
});
