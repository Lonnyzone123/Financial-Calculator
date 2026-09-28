'use strict';

/**
 * Adversarial test for PortfolioBridgeProjector's source-ranking tiebreak --
 * same audit-pass pattern as the optimizer's adversarial tests. Python's
 * sorted(key=lambda item: (item.marginal_cost, item.source)) breaks an
 * exact marginal-cost tie alphabetically by source name. A JS port using
 * only numeric comparison (or getting the secondary key backwards) would
 * silently reorder the greedy allocation whenever costs land exactly
 * equal -- a genuinely reachable config (real_portfolio_return ==
 * real_safe_return, zero roth/schd penalties), not just a contrived case.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createAccount, createPortfolio } = require('../../src/ported/model-types');
const { createSocialSecurityPlanningState, createPlanningScenario } = require('../../src/ported/social-security-valuation');
const { createPortfolioBridgeProjector } = require('../../src/ported/social-security-bridge');
const { taxIncome } = require('../../src/ported/tax-engine');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-bridge-adversarial.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const ssConfig = { fra_age: 67, claim_max_age_months: 840, claim_cycle_start_calendar_month: 1, scheduled_benefit_fraction: 1.0 };
const reserveConfig = { protected_final_months: 0.0 };

const state = createSocialSecurityPlanningState({
  decisionYear: 2025, decisionAgeMonths: 65 * 12, retirementYear: 1, inflationFactor: 1.0,
  spendingReal: 40000.0, spendingFloorReal: 30000.0,
  vooReal: 100000.0, vooBasisReal: 60000.0, schdReal: 100000.0, schdBasisReal: 60000.0,
  tbillsReal: 100000.0, rothReal: 100000.0, reserveMonths: 12.0, equityDrawdown: 0.0,
  baseIncomeNominal: taxIncome({}), fraMonthlyBenefitReal: 1000.0,
});
const portfolio = createPortfolio(
  createAccount('voo', state.vooReal, state.vooBasisReal, true),
  createAccount('schd', state.schdReal, state.schdBasisReal, true),
  createAccount('tbills', state.tbillsReal),
  createAccount('roth', state.rothReal)
);
const tiedScenario = createPlanningScenario({ name: 'tied', realPortfolioReturn: 0.03, realSafeReturn: 0.03, inflationRate: 0.02, taxIncomeRealGrowth: 0.0, weight: 1.0 });

test('social security bridge ADVERSARIAL: rankSources breaks an exact cost tie alphabetically, matching Python', () => {
  const optimizerConfig = {
    candidate_sources: ['tbills', 'voo', 'roth', 'schd'],
    roth_shadow_cost: 0.0, schd_principal_penalty: 0.0, sequence_penalty_multiplier: 4.0,
    max_tax_iterations: 30, tax_convergence_nominal: 1.0,
  };
  const projector = createPortfolioBridgeProjector({ ssConfig, optimizerConfig, reserveConfig, calculator: null });
  const ranked = projector.rankSources({ portfolio, planningState: state, monthsToClaim: 24, scenario: tiedScenario });
  const rankedSources = ranked.map((item) => item.source);
  const rankedCosts = ranked.map((item) => item.marginalCost);

  assert.deepEqual(rankedSources, fixtures.all_tied.ranked_sources, 'all-tied ranking order must match Python exactly (alphabetical)');
  assert.equal(new Set(rankedCosts).size, 1, 'all four costs must genuinely tie, not just coincidentally sort correctly');
  for (let i = 0; i < rankedCosts.length; i++) {
    assert.ok(Math.abs(rankedCosts[i] - fixtures.all_tied.ranked_costs[i]) < 1e-9, `ranked_costs[${i}]`);
  }
});

test('social security bridge ADVERSARIAL: a partial tie still sorts correctly (rules out a no-op sort passing by coincidence)', () => {
  const optimizerConfig = {
    candidate_sources: ['tbills', 'voo', 'roth', 'schd'],
    roth_shadow_cost: 0.0, schd_principal_penalty: 0.05, sequence_penalty_multiplier: 4.0,
    max_tax_iterations: 30, tax_convergence_nominal: 1.0,
  };
  const projector = createPortfolioBridgeProjector({ ssConfig, optimizerConfig, reserveConfig, calculator: null });
  const ranked = projector.rankSources({ portfolio, planningState: state, monthsToClaim: 24, scenario: tiedScenario });
  const rankedSources = ranked.map((item) => item.source);
  assert.deepEqual(rankedSources, fixtures.partial_tie_schd_penalized.ranked_sources, 'partial-tie order (schd pushed to the end, others alphabetical) must match Python');
});
