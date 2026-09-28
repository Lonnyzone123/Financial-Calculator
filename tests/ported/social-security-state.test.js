'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { taxIncome } = require('../../src/ported/tax-engine');
const { account } = require('../../src/ported/lifetime-tax-optimizer');
const { buildSocialSecurityPlanningState } = require('../../src/ported/social-security-state');
const { planningStatePortfolioReal, planningStateFingerprint } = require('../../src/ported/social-security-valuation');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-state.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

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

function makePortfolio({ voo = 400000.0, schd = 300000.0, tbills = 100000.0, roth = 200000.0 } = {}) {
  return {
    voo: account('voo', voo, voo * 0.6, true),
    schd: account('schd', schd, schd * 0.6, true),
    tbills: account('tbills', tbills, tbills, false),
    roth: account('roth', roth, roth, false),
  };
}

function makeKnownState(overrides) {
  const base = {
    decisionYear: 2040, age: 65, retirementYear: 1, inflationFactor: 1.3,
    spendingReal: 60000.0, portfolioReal: 1000000.0, taxableValueReal: 600000.0,
    rothValueReal: 200000.0, reserveReal: 100000.0, reserveMonths: 20.0,
    equityDrawdown: 0.0, trailingSpendingReal: [58000.0, 59000.0],
    trailingTaxReal: [8000.0, 8500.0], trailingRealReturns: [0.05, -0.02, 0.08],
    trend15yReal: 0.04, ssClaimAge: null, ssClaimAgeMonths: null,
  };
  return Object.assign(base, overrides);
}

const EPS = 1e-9;
function assertClose(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)), `${msg}: expected ${expected}, got ${actual}`);
}

// Each fixture case's exact inputs, mirrored from generate_ss_state_fixtures.py.
const CASE_INPUTS = {
  no_claim_age: { knownState: makeKnownState(), portfolio: makePortfolio(), income: taxIncome({ ordinaryIncome: 20000.0, socialSecurity: 15000.0 }), spendingReal: 60000.0, spendingFloorReal: 40000.0, fra: 24000.0, ssClaimAgeMonths: null },
  precise_only: { knownState: makeKnownState(), portfolio: makePortfolio(), income: taxIncome({}), spendingReal: 60000.0, spendingFloorReal: 40000.0, fra: 24000.0, ssClaimAgeMonths: 67 * 12 + 3 },
  legacy_only: { knownState: makeKnownState({ ssClaimAge: 68 }), portfolio: makePortfolio(), income: taxIncome({}), spendingReal: 60000.0, spendingFloorReal: 40000.0, fra: 24000.0, ssClaimAgeMonths: null },
  both_consistent: { knownState: makeKnownState({ ssClaimAge: 67 }), portfolio: makePortfolio(), income: taxIncome({}), spendingReal: 60000.0, spendingFloorReal: 40000.0, fra: 24000.0, ssClaimAgeMonths: 67 * 12 + 6 },
  both_precise_consistent: { knownState: makeKnownState({ ssClaimAgeMonths: 67 * 12 + 6 }), portfolio: makePortfolio(), income: taxIncome({}), spendingReal: 60000.0, spendingFloorReal: 40000.0, fra: 24000.0, ssClaimAgeMonths: 67 * 12 + 6 },
  precise_candidates_disagree: { knownState: makeKnownState({ ssClaimAgeMonths: 67 * 12 }), portfolio: makePortfolio(), income: taxIncome({}), spendingReal: 60000.0, spendingFloorReal: 40000.0, fra: 24000.0, ssClaimAgeMonths: 68 * 12 },
  legacy_precise_disagree: { knownState: makeKnownState({ ssClaimAge: 65 }), portfolio: makePortfolio(), income: taxIncome({}), spendingReal: 60000.0, spendingFloorReal: 40000.0, fra: 24000.0, ssClaimAgeMonths: 67 * 12 },
  legacy_precise_boundary_consistent: { knownState: makeKnownState({ ssClaimAge: 67 }), portfolio: makePortfolio(), income: taxIncome({}), spendingReal: 60000.0, spendingFloorReal: 40000.0, fra: 24000.0, ssClaimAgeMonths: 67 * 12 + 11 },
  error_zero_inflation_factor: { knownState: makeKnownState({ inflationFactor: 0.0 }), portfolio: makePortfolio(), income: taxIncome({}), spendingReal: 60000.0, spendingFloorReal: 40000.0, fra: 24000.0, ssClaimAgeMonths: null },
  error_negative_spending: { knownState: makeKnownState(), portfolio: makePortfolio(), income: taxIncome({}), spendingReal: -1.0, spendingFloorReal: 40000.0, fra: 24000.0, ssClaimAgeMonths: null },
  error_zero_floor: { knownState: makeKnownState(), portfolio: makePortfolio(), income: taxIncome({}), spendingReal: 60000.0, spendingFloorReal: 0.0, fra: 24000.0, ssClaimAgeMonths: null },
  error_negative_fra_benefit: { knownState: makeKnownState(), portfolio: makePortfolio(), income: taxIncome({}), spendingReal: 60000.0, spendingFloorReal: 40000.0, fra: -1.0, ssClaimAgeMonths: null },
  full_income_copy: {
    knownState: makeKnownState(), portfolio: makePortfolio({ voo: 123456.78, schd: 987.65, tbills: 5000.0, roth: 25000.0 }),
    income: taxIncome({ ordinaryIncome: 45000.0, qualifiedDividends: 2000.0, nonqualifiedDividends: 500.0, longTermGains: 3000.0, treasuryInterest: 100.0, socialSecurity: 18000.0, capitalLossCarryforward: 0.0 }),
    spendingReal: 55000.0, spendingFloorReal: 42000.0, fra: 30000.0, ssClaimAgeMonths: 68 * 12 + 4,
  },
};

test('social security state port: buildSocialSecurityPlanningState matches the Python oracle on every case', () => {
  for (const c of fixtures.cases) {
    const inputs = CASE_INPUTS[c.name];
    assert.ok(inputs, `missing JS-side inputs for fixture case ${c.name}`);
    const call = () => buildSocialSecurityPlanningState({
      knownState: inputs.knownState,
      portfolio: inputs.portfolio,
      baseIncomeNominal: inputs.income,
      spendingReal: inputs.spendingReal,
      spendingFloorReal: inputs.spendingFloorReal,
      scheduledFraBenefitNominal: inputs.fra,
      ssClaimAgeMonths: inputs.ssClaimAgeMonths,
    });

    if (c.expect_error !== undefined) {
      assert.throws(call, new RegExp(c.expect_error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${c.name} must raise the same error as Python`);
      continue;
    }

    const state = call();
    const o = c.output;
    assert.equal(state.decisionYear, o.decision_year, `${c.name}.decisionYear`);
    assert.equal(state.decisionAgeMonths, o.decision_age_months, `${c.name}.decisionAgeMonths`);
    assert.equal(state.retirementYear, o.retirement_year, `${c.name}.retirementYear`);
    assertClose(state.inflationFactor, o.inflation_factor, `${c.name}.inflationFactor`);
    assertClose(state.spendingReal, o.spending_real, `${c.name}.spendingReal`);
    assertClose(state.spendingFloorReal, o.spending_floor_real, `${c.name}.spendingFloorReal`);
    assertClose(state.vooReal, o.voo_real, `${c.name}.vooReal`);
    assertClose(state.vooBasisReal, o.voo_basis_real, `${c.name}.vooBasisReal`);
    assertClose(state.schdReal, o.schd_real, `${c.name}.schdReal`);
    assertClose(state.schdBasisReal, o.schd_basis_real, `${c.name}.schdBasisReal`);
    assertClose(state.tbillsReal, o.tbills_real, `${c.name}.tbillsReal`);
    assertClose(state.rothReal, o.roth_real, `${c.name}.rothReal`);
    assertClose(state.reserveMonths, o.reserve_months, `${c.name}.reserveMonths`);
    assertClose(state.equityDrawdown, o.equity_drawdown, `${c.name}.equityDrawdown`);
    assert.deepEqual(state.trailingSpendingReal, o.trailing_spending_real, `${c.name}.trailingSpendingReal`);
    assert.deepEqual(state.trailingTaxReal, o.trailing_tax_real, `${c.name}.trailingTaxReal`);
    assert.deepEqual(state.trailingRealReturns, o.trailing_real_returns, `${c.name}.trailingRealReturns`);
    assert.equal(state.trend15yReal, o.trend_15y_real, `${c.name}.trend15yReal`);
    assert.equal(state.ssClaimAgeMonths, o.ss_claim_age_months, `${c.name}.ssClaimAgeMonths`);
    assertClose(state.fraMonthlyBenefitReal, o.fra_monthly_benefit_real, `${c.name}.fraMonthlyBenefitReal`);
    for (const [py, js] of Object.entries(INCOME_FIELD_MAP)) {
      assertClose(state.baseIncomeNominal[js], o.base_income_nominal[py], `${c.name}.baseIncomeNominal.${js}`);
    }

    assertClose(planningStatePortfolioReal(state), c.portfolio_real_property, `${c.name}.portfolioReal property`);
    assert.equal(planningStateFingerprint(state), c.fingerprint, `${c.name}.fingerprint (byte-for-byte match against Python's json.dumps(sort_keys=True)+sha256)`);
  }
});
