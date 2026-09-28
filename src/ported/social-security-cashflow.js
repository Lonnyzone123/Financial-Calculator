'use strict';
/*
 * Ported from the Financial Projection V2.1.2 (post-audit-repair,
 * requalified) Python engine's retirement_model_v2/social_security_cashflow.py
 * -- Phase 4 (Social Security optimizer port), module 4/9.
 *
 * Translates a monthly claim decision (SocialSecurityDecision, produced by
 * the optimizer -- module 9, not yet ported) into an annual cash amount
 * without lookahead: first-claim-year proration, delayed-retirement-credit
 * activation the January after they're earned, and COLA application.
 *
 * SocialSecurityDecision is consumed here only as a plain data shape
 * ({claimNow, selectedClaimAgeMonths, firstYearBenefitFraction,
 * annualBenefitRealIfClaimed}) -- the full decision/optimizer port is a
 * later Phase 4 module.
 */

const { claimFactorSchedule, scheduleEventual, scheduleInitialPayable, scheduleHasPendingCredit } = require('./social-security-benefit');
const { firstYearBenefitFraction } = require('./social-security-valuation');

function createClaimStatus({ claimAgeMonths, fullAnnualBenefitNominal, pendingDrcAnnualBenefitNominal = null, pendingDrcEffectiveAgeMonths = null }) {
  return {
    claimAgeMonths,
    fullAnnualBenefitNominal,
    pendingDrcAnnualBenefitNominal,
    pendingDrcEffectiveAgeMonths,
  };
}

function claimStatusClaimAge(status) {
  return Math.floor(status.claimAgeMonths / 12);
}

function createCashFlowManager(config) {
  const cfg = config || {};
  const fraAgeMonths = Math.trunc(cfg.fra_age === undefined ? 67 : cfg.fra_age) * 12;
  const maximumAgeMonths = Math.trunc(cfg.claim_max_age_months === undefined ? 70 * 12 : cfg.claim_max_age_months);
  const claimCycleStartCalendarMonth = Math.trunc(cfg.claim_cycle_start_calendar_month === undefined ? 1 : cfg.claim_cycle_start_calendar_month);

  function resolve({ decision, currentAgeMonths, inflationFactor, priorStatus }) {
    if (!(inflationFactor > 0.0)) {
      throw new Error('Social Security cash-flow inflation factor must be positive');
    }
    if (priorStatus !== null && priorStatus !== undefined) {
      const activated = activatePending(priorStatus, currentAgeMonths);
      return {
        status: activated,
        currentYearBenefitNominal: activated.fullAnnualBenefitNominal,
        firstYearFraction: 1.0,
        newlyClaimed: false,
        validationCodes: [],
        eventualFactor: null,
        initialPayableFactor: null,
        pendingDrcEffectiveAgeMonths: null,
      };
    }
    if (!decision.claimNow) {
      return {
        status: null, currentYearBenefitNominal: 0.0, firstYearFraction: 0.0, newlyClaimed: false,
        validationCodes: [], eventualFactor: null, initialPayableFactor: null, pendingDrcEffectiveAgeMonths: null,
      };
    }
    if (decision.selectedClaimAgeMonths === null || decision.selectedClaimAgeMonths === undefined) {
      throw new Error('A claim-now decision requires a selected claim month');
    }

    const selected = Math.trunc(decision.selectedClaimAgeMonths);
    if (selected < currentAgeMonths || selected >= currentAgeMonths + 12) {
      throw new Error('Claim-now month must fall within the current annual cycle');
    }
    const expectedFraction = firstYearBenefitFraction(selected);
    const factorSchedule = claimFactorSchedule({
      claimAgeMonths: selected,
      fraAgeMonths,
      maximumAgeMonths,
      claimCycleStartCalendarMonth,
    });
    const codes = [];
    if (Math.abs(Number(decision.firstYearBenefitFraction) - expectedFraction) > 1e-12) {
      codes.push('SS_FIRST_YEAR_FRACTION_MISMATCH');
    }
    const eventualFullAnnual = Number(decision.annualBenefitRealIfClaimed) * inflationFactor;
    if (!(eventualFullAnnual > 0.0)) {
      codes.push('SS_CLAIM_BENEFIT_NONPOSITIVE');
    }
    const eventual = scheduleEventual(factorSchedule);
    const initialPayable = scheduleInitialPayable(factorSchedule);
    const hasPending = scheduleHasPendingCredit(factorSchedule);
    const initialFullAnnual = eventualFullAnnual * (initialPayable / Math.max(eventual, 1e-12));
    const status = createClaimStatus({
      claimAgeMonths: selected,
      fullAnnualBenefitNominal: Math.max(0.0, initialFullAnnual),
      pendingDrcAnnualBenefitNominal: hasPending ? Math.max(0.0, eventualFullAnnual) : null,
      pendingDrcEffectiveAgeMonths: hasPending ? factorSchedule.pendingEffectiveAgeMonths : null,
    });
    return {
      status,
      currentYearBenefitNominal: status.fullAnnualBenefitNominal * expectedFraction,
      firstYearFraction: expectedFraction,
      newlyClaimed: true,
      validationCodes: codes,
      eventualFactor: eventual,
      initialPayableFactor: initialPayable,
      pendingDrcEffectiveAgeMonths: factorSchedule.pendingEffectiveAgeMonths,
    };
  }

  return { resolve, fraAgeMonths, maximumAgeMonths, claimCycleStartCalendarMonth };
}

function activatePending(status, currentAgeMonths) {
  if (status === null || status === undefined || status.pendingDrcAnnualBenefitNominal === null || status.pendingDrcAnnualBenefitNominal === undefined) {
    return status;
  }
  const effective = status.pendingDrcEffectiveAgeMonths;
  if (effective === null || effective === undefined) {
    throw new Error('Pending delayed credits require an effective month');
  }
  if (Math.trunc(currentAgeMonths) < Math.trunc(effective)) {
    return status;
  }
  return createClaimStatus({
    claimAgeMonths: status.claimAgeMonths,
    fullAnnualBenefitNominal: status.pendingDrcAnnualBenefitNominal,
  });
}

function applyCola(status, cola, colaFloor = 0.0) {
  if (status === null || status === undefined) return null;
  const applied = Math.max(Number(colaFloor), Number(cola));
  if (applied <= -1.0) {
    throw new Error('Social Security COLA cannot reduce benefits below zero');
  }
  return createClaimStatus({
    claimAgeMonths: status.claimAgeMonths,
    fullAnnualBenefitNominal: status.fullAnnualBenefitNominal * (1.0 + applied),
    pendingDrcAnnualBenefitNominal: status.pendingDrcAnnualBenefitNominal !== null && status.pendingDrcAnnualBenefitNominal !== undefined
      ? status.pendingDrcAnnualBenefitNominal * (1.0 + applied)
      : null,
    pendingDrcEffectiveAgeMonths: status.pendingDrcEffectiveAgeMonths,
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createClaimStatus,
    claimStatusClaimAge,
    createCashFlowManager,
    activatePending,
    applyCola,
  };
}
