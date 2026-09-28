'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTaxCalculator, taxIncome } = require('../../src/ported/tax-engine');
const { buildMortalityPolicy, createMortalityTable } = require('../../src/ported/social-security-mortality');
const { createSocialSecurityPlanningState, createPlanningScenario } = require('../../src/ported/social-security-valuation');
const { createPortfolioBridgeProjector } = require('../../src/ported/social-security-bridge');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-bridge.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const taxCalculator = createTaxCalculator(fixtures.tax_config);
const policy1960 = buildMortalityPolicy(1960);
const mortalityTable = createMortalityTable(policy1960, 'II');

const EPS = 1e-4;
function assertClose(actual, expected, msg) {
  if (expected === 'Infinity') {
    assert.equal(actual, Infinity, `${msg}: expected Infinity, got ${actual}`);
    return;
  }
  assert.ok(Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)), `${msg}: expected ${expected}, got ${actual}`);
}

function makeState(overrides = {}) {
  const base = {
    decisionYear: 2025, decisionAgeMonths: 65 * 12, retirementYear: 1, inflationFactor: 1.2,
    spendingReal: 60000.0, spendingFloorReal: 40000.0,
    vooReal: 400000.0, vooBasisReal: 240000.0, schdReal: 200000.0, schdBasisReal: 120000.0,
    tbillsReal: 150000.0, rothReal: 100000.0, reserveMonths: 12.0, equityDrawdown: 0.0,
    baseIncomeNominal: taxIncome({ ordinaryIncome: 30000.0 }),
    trailingSpendingReal: [], trailingTaxReal: [], trailingRealReturns: [],
    trend15yReal: null, ssClaimAgeMonths: null, fraMonthlyBenefitReal: 1250.0,
  };
  return createSocialSecurityPlanningState(Object.assign(base, overrides));
}

function makeScenario(overrides = {}) {
  const base = { name: 'base', realPortfolioReturn: 0.04, realSafeReturn: 0.01, inflationRate: 0.025, taxIncomeRealGrowth: 0.0, weight: 1.0 };
  return createPlanningScenario(Object.assign(base, overrides));
}

function makeProfile(decisionAgeMonths, throughAge = 120) {
  return mortalityTable.conditionalProfile({ birthYear: 1960, sex: 'male', valuationAgeMonths: decisionAgeMonths, throughAgeMonths: throughAge * 12 });
}

function runCase({ state, claimAgeMonths, scenario, withCalculator = true }) {
  const projector = createPortfolioBridgeProjector({
    ssConfig: fixtures.ss_config, optimizerConfig: fixtures.optimizer_config, reserveConfig: fixtures.reserve_config,
    calculator: withCalculator ? taxCalculator : null,
  });
  const profile = makeProfile(state.decisionAgeMonths);
  return projector.project({ planningState: state, claimAgeMonths, mortalityProfile: profile, scenario });
}

const CASE_INPUTS = {
  no_delay: { state: makeState(), claimAgeMonths: 65 * 12, scenario: makeScenario() },
  no_delay_earlier_claim: { state: makeState(), claimAgeMonths: 64 * 12, scenario: makeScenario() },
  one_year_delay_ample_portfolio: { state: makeState(), claimAgeMonths: 66 * 12, scenario: makeScenario() },
  five_year_delay_to_70: { state: makeState(), claimAgeMonths: 70 * 12, scenario: makeScenario() },
  delay_to_midyear_claim: { state: makeState(), claimAgeMonths: 66 * 12 + 7, scenario: makeScenario() },
  infeasible_thin_portfolio: {
    state: makeState({ vooReal: 1000.0, vooBasisReal: 600.0, schdReal: 0.0, schdBasisReal: 0.0, tbillsReal: 500.0, rothReal: 0.0 }),
    claimAgeMonths: 70 * 12, scenario: makeScenario(),
  },
  sequence_drawdown_penalty: { state: makeState({ retirementYear: 2, equityDrawdown: 0.15 }), claimAgeMonths: 68 * 12, scenario: makeScenario() },
  no_tax_calculator: { state: makeState(), claimAgeMonths: 67 * 12, scenario: makeScenario(), withCalculator: false },
  adverse_scenario_return: { state: makeState(), claimAgeMonths: 68 * 12, scenario: makeScenario({ realPortfolioReturn: -0.03, realSafeReturn: -0.005 }) },
  roth_heavy_portfolio: {
    state: makeState({ vooReal: 50000.0, vooBasisReal: 30000.0, schdReal: 20000.0, schdBasisReal: 12000.0, tbillsReal: 20000.0, rothReal: 500000.0 }),
    claimAgeMonths: 69 * 12, scenario: makeScenario(),
  },
};

test('social security bridge port: project() matches the Python oracle on every case', () => {
  for (const c of fixtures.cases) {
    const inputs = CASE_INPUTS[c.name];
    assert.ok(inputs, `missing JS inputs for ${c.name}`);
    const result = runCase(inputs);
    const o = c.output;
    assertClose(result.opportunityCostPv, o.opportunity_cost_pv, `${c.name}.opportunityCostPv`);
    assertClose(result.incrementalTaxPv, o.incremental_tax_pv, `${c.name}.incrementalTaxPv`);
    assertClose(result.terminalAssetDifference, o.terminal_asset_difference, `${c.name}.terminalAssetDifference`);
    assertClose(result.terminalAssetsReal, o.terminal_assets_real, `${c.name}.terminalAssetsReal`);
    assert.equal(result.feasible, o.feasible, `${c.name}.feasible`);
    assert.deepEqual(result.validationCodes, o.validation_codes, `${c.name}.validationCodes`);
    for (const source of ['tbills', 'voo', 'roth', 'schd']) {
      assertClose(result.sourceWithdrawalsReal[source], o.source_withdrawals_real[source], `${c.name}.sourceWithdrawalsReal.${source}`);
    }
    assert.equal(result.annualRecords.length, o.annual_records.length, `${c.name}.annualRecords.length`);
    for (let i = 0; i < result.annualRecords.length; i++) {
      assertClose(result.annualRecords[i].survival, o.annual_records[i].survival, `${c.name}.annualRecords[${i}].survival`);
      assertClose(result.annualRecords[i].claimNowGrossReal, o.annual_records[i].claim_now_gross_real, `${c.name}.annualRecords[${i}].claimNowGrossReal`);
      assertClose(result.annualRecords[i].terminalLossReal, o.annual_records[i].terminal_loss_real, `${c.name}.annualRecords[${i}].terminalLossReal`);
    }
  }
});
