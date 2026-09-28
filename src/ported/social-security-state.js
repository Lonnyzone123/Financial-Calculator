'use strict';
/*
 * Ported from the Financial Projection V2.1.2 (post-audit-repair,
 * requalified) Python engine's retirement_model_v2/social_security_state.py
 * -- Phase 4 (Social Security optimizer port), module 3/9.
 *
 * Ports SocialSecurityStateBuilder.build(): copies only decision-date-known
 * primitives (KnownState/Portfolio/TaxIncome) across the SS module boundary,
 * converting nominal balances to real dollars and reconciling the precise
 * monthly claim age against the legacy whole-year claim age when both are
 * present (this is the module that had Phase 1's crash-bug fix, and later
 * M5.5's claim-month requalification, in earlier engine snapshots -- this
 * port targets the current, already-fixed source).
 *
 * NOT ported: SocialSecurityStateBuilder.audit_contract()/assert_contract().
 * These use Python's `inspect.signature`/`dataclasses.fields` reflection to
 * self-check that the class's own method signature and the
 * SocialSecurityPlanningState dataclass's fields match a hardcoded allowed
 * set (a compile-time-ish lint check on the Python source itself, re-run at
 * import time). There is no equivalent reflection surface in a hand-written
 * JS object, and the invariant it protects (no future/market data leaking
 * into the SS module) is instead enforced by this port only ever accepting
 * the same known-state/portfolio/income shapes as its Python counterpart --
 * consistent with Phase 8's precedent of not porting diagnostics.py, whose
 * purpose was proving the Python engine's own internals rather than
 * producing a calculator-facing result.
 */

const { createSocialSecurityPlanningState } = require('./social-security-valuation');

function buildSocialSecurityPlanningState({
  knownState,
  portfolio,
  baseIncomeNominal,
  spendingReal,
  spendingFloorReal,
  scheduledFraBenefitNominal,
  ssClaimAgeMonths,
}) {
  const factor = Number(knownState.inflationFactor);
  if (!(factor > 0.0)) {
    throw new Error('Social Security planning inflation factor must be positive');
  }
  if (spendingReal < 0.0 || !(spendingFloorReal > 0.0)) {
    throw new Error('Social Security spending and floor inputs are invalid');
  }
  if (!(scheduledFraBenefitNominal > 0.0)) {
    throw new Error('Scheduled FRA benefit must be positive');
  }

  const knownClaimMonths = knownState.ssClaimAgeMonths === undefined ? null : knownState.ssClaimAgeMonths;
  const preciseCandidates = [ssClaimAgeMonths, knownClaimMonths]
    .filter((v) => v !== null && v !== undefined)
    .map((v) => Math.trunc(v));
  if (preciseCandidates.length > 0 && new Set(preciseCandidates).size !== 1) {
    throw new Error('Social Security claim-age state fields disagree');
  }
  const legacyClaimYear = (knownState.ssClaimAge === null || knownState.ssClaimAge === undefined)
    ? null
    : Math.trunc(knownState.ssClaimAge);
  let claimMonths = preciseCandidates.length > 0 ? preciseCandidates[0] : null;
  if (claimMonths !== null && legacyClaimYear !== null) {
    if (legacyClaimYear !== Math.floor(claimMonths / 12)) {
      throw new Error('Social Security claim-age state fields disagree');
    }
  } else if (claimMonths === null && legacyClaimYear !== null) {
    claimMonths = legacyClaimYear * 12;
  }

  return createSocialSecurityPlanningState({
    decisionYear: Math.trunc(knownState.decisionYear),
    decisionAgeMonths: Math.trunc(knownState.age) * 12,
    retirementYear: Math.trunc(knownState.retirementYear),
    inflationFactor: factor,
    spendingReal: Number(spendingReal),
    spendingFloorReal: Number(spendingFloorReal),
    vooReal: Number(portfolio.voo.value) / factor,
    vooBasisReal: Number(portfolio.voo.basis) / factor,
    schdReal: Number(portfolio.schd.value) / factor,
    schdBasisReal: Number(portfolio.schd.basis) / factor,
    tbillsReal: Number(portfolio.tbills.value) / factor,
    rothReal: Number(portfolio.roth.value) / factor,
    reserveMonths: Number(knownState.reserveMonths),
    equityDrawdown: Number(knownState.equityDrawdown),
    baseIncomeNominal,
    trailingSpendingReal: Array.from(knownState.trailingSpendingReal || []),
    trailingTaxReal: Array.from(knownState.trailingTaxReal || []),
    trailingRealReturns: Array.from(knownState.trailingRealReturns || []),
    trend15yReal: knownState.trend15yReal === undefined ? null : knownState.trend15yReal,
    ssClaimAgeMonths: claimMonths,
    fraMonthlyBenefitReal: Number(scheduledFraBenefitNominal) / factor / 12.0,
  });
}

function stateBoundaryCategories() {
  return [
    'decision_identity',
    'current_portfolio_balances_and_basis',
    'current_spending_and_floor',
    'prior_known_tax_income',
    'current_reserve_and_drawdown',
    'trailing_past_only_summaries',
    'current_scheduled_social_security_benefit',
    'current_claim_status',
  ];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildSocialSecurityPlanningState,
    stateBoundaryCategories,
  };
}
