"""
Adversarial/boundary-exact fixtures for the Social Security cash-flow module
-- same audit-pass pattern applied to Phases 5-8 and, in this phase, to the
optimizer, bridge, valuation engine, longevity analyzer, mortality port, and
benefit math.

Targets the guards and tolerance boundaries the original 21 cash-flow
fixtures touch only incidentally:

  - `initial_payable / max(eventual, 1e-12)`. The benefit-module adversarial
    pass established that a claim age of exactly 48 produces an eventual
    factor of EXACTLY 0 (and below it, a negative one), which is precisely
    the input this divisor guard exists to survive -- so it is reachable
    through resolve()'s own public API, not merely in principle, by pairing
    that claim month with a matching current age.
  - The SS_FIRST_YEAR_FRACTION_MISMATCH tolerance, `abs(delta) > 1e-12`,
    checked exactly AT the tolerance (no code) and one ulp-ish step past it
    (code emitted).
  - The SS_CLAIM_BENEFIT_NONPOSITIVE condition at exactly 0 and just above.
  - The claim window `current <= selected < current + 12`, at its last
    valid month (current + 11) rather than only past its edges.
  - COLA: `applied = max(cola_floor, cola)` rejected at exactly -1.0 but
    accepted just above it, and applied to BOTH the current and the pending
    delayed-credit amount of a status that carries one.
  - activate_pending() with a pending amount but a MISSING effective month,
    which must raise rather than silently activate.

Run from C:\\Calculator merge:
    python fixtures/generate_ss_cashflow_adversarial_fixtures.py
"""
import json
import sys
from dataclasses import asdict
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.social_security_cashflow import SocialSecurityCashFlowManager, SocialSecurityClaimStatus  # noqa: E402
from retirement_model_v2.social_security_optimizer import SocialSecurityDecision  # noqa: E402
from retirement_model_v2.social_security_valuation import first_year_benefit_fraction  # noqa: E402

CONFIG = {"fra_age": 67, "claim_max_age_months": 70 * 12, "claim_cycle_start_calendar_month": 1}
manager = SocialSecurityCashFlowManager(CONFIG)


def decision(claim_now, selected_claim_age_months=None, annual_benefit_real_if_claimed=24000.0, fraction_override=None):
    frac = first_year_benefit_fraction(selected_claim_age_months) if selected_claim_age_months is not None else 0.0
    if fraction_override is not None:
        frac = fraction_override
    return SocialSecurityDecision(
        eligible=True, claim_now=claim_now, selected_claim_age=None,
        annual_benefit_real_if_claimed=annual_benefit_real_if_claimed, reason="adversarial",
        selected_claim_age_months=selected_claim_age_months, first_year_benefit_fraction=frac,
    )


def cashflow_to_dict(cf):
    return {
        "status": None if cf.status is None else asdict(cf.status),
        "current_year_benefit_nominal": cf.current_year_benefit_nominal,
        "first_year_fraction": cf.first_year_fraction,
        "newly_claimed": cf.newly_claimed,
        "validation_codes": list(cf.validation_codes),
        "eventual_factor": cf.eventual_factor,
        "initial_payable_factor": cf.initial_payable_factor,
        "pending_drc_effective_age_months": cf.pending_drc_effective_age_months,
    }


def run_resolve(name, dec, current_age_months, inflation_factor, prior_status):
    try:
        cf = manager.resolve(
            decision=dec, current_age_months=current_age_months,
            inflation_factor=inflation_factor, prior_status=prior_status,
        )
        return {"name": name, "output": cashflow_to_dict(cf)}
    except ValueError as exc:
        return {"name": name, "expect_error": str(exc)}


def main():
    cases = []

    # --- The 1e-12 divisor guard, reached through the public API ---------
    # A claim at exactly 576 months (age 48) has an eventual factor of
    # EXACTLY 0, so initial_payable / max(eventual, 1e-12) is 0 / 1e-12
    # rather than 0 / 0.
    cases.append(run_resolve("zero_eventual_factor_hits_divisor_guard", decision(True, 576), 576, 1.2, None))
    # And below it, where the factor is NEGATIVE: the huge negative product
    # must be clamped by max(0.0, initial_full_annual) rather than stored.
    cases.append(run_resolve("negative_eventual_factor_clamped_to_zero", decision(True, 570), 570, 1.2, None))

    # --- SS_FIRST_YEAR_FRACTION_MISMATCH tolerance ------------------------
    claim = 67 * 12 + 3
    expected = first_year_benefit_fraction(claim)
    cases.append(run_resolve(
        "fraction_mismatch_exactly_at_tolerance", decision(True, claim, fraction_override=expected + 1e-12),
        67 * 12, 1.2, None,
    ))
    cases.append(run_resolve(
        "fraction_mismatch_just_past_tolerance", decision(True, claim, fraction_override=expected + 1e-11),
        67 * 12, 1.2, None,
    ))
    cases.append(run_resolve(
        "fraction_matches_exactly_no_code", decision(True, claim, fraction_override=expected),
        67 * 12, 1.2, None,
    ))

    # --- SS_CLAIM_BENEFIT_NONPOSITIVE boundary ----------------------------
    cases.append(run_resolve("benefit_exactly_zero_emits_nonpositive_code", decision(True, 67 * 12, 0.0), 67 * 12, 1.2, None))
    cases.append(run_resolve("benefit_one_cent_positive_no_code", decision(True, 67 * 12, 0.01), 67 * 12, 1.2, None))
    cases.append(run_resolve("benefit_negative_emits_nonpositive_code", decision(True, 67 * 12, -100.0), 67 * 12, 1.2, None))

    # --- Claim window boundaries, including the LAST valid month ----------
    cases.append(run_resolve("claim_at_last_valid_window_month", decision(True, 67 * 12 + 11), 67 * 12, 1.2, None))
    cases.append(run_resolve("claim_exactly_at_current_age", decision(True, 67 * 12), 67 * 12, 1.2, None))
    cases.append(run_resolve("claim_one_past_window_end", decision(True, 67 * 12 + 12), 67 * 12, 1.2, None))
    cases.append(run_resolve("claim_one_before_window_start", decision(True, 67 * 12 - 1), 67 * 12, 1.2, None))

    # --- Inflation factor boundary ---------------------------------------
    cases.append(run_resolve("inflation_factor_exactly_zero_rejected", decision(True, 67 * 12), 67 * 12, 0.0, None))
    cases.append(run_resolve("inflation_factor_tiny_but_positive", decision(True, 67 * 12), 67 * 12, 1e-9, None))

    # --- activate_pending / apply_cola standalone boundaries --------------
    standalone = []

    pending = SocialSecurityClaimStatus(
        claim_age_months=68 * 12 + 4, full_annual_benefit_nominal=28000.0,
        pending_drc_annual_benefit_nominal=32000.0, pending_drc_effective_age_months=69 * 12,
    )
    # One month before, exactly at, and one month after the effective month.
    for label, age in [("one_before", 69 * 12 - 1), ("exactly_at", 69 * 12), ("one_after", 69 * 12 + 1)]:
        activated = manager.activate_pending(pending, current_age_months=age)
        standalone.append({
            "name": f"activate_pending_{label}", "current_age_months": age,
            "output": None if activated is None else asdict(activated),
        })

    # A pending amount with NO effective month must raise.
    broken = SocialSecurityClaimStatus(
        claim_age_months=68 * 12, full_annual_benefit_nominal=28000.0,
        pending_drc_annual_benefit_nominal=32000.0, pending_drc_effective_age_months=None,
    )
    try:
        manager.activate_pending(broken, current_age_months=69 * 12)
        raise SystemExit("expected a missing-effective-month error")
    except ValueError as exc:
        standalone.append({"name": "activate_pending_missing_effective_month_raises", "expect_error": str(exc)})

    # COLA at, just above, and below the -1.0 rejection boundary.
    for label, cola, floor in [
        ("exactly_negative_one", -1.0, -2.0),
        ("just_above_negative_one", -0.999999, -2.0),
        ("below_negative_one", -1.5, -2.0),
        ("zero_cola", 0.0, 0.0),
        ("floor_wins_over_negative_cola", -0.05, 0.0),
        ("cola_wins_over_lower_floor", 0.031, 0.0),
    ]:
        try:
            result = manager.apply_cola(pending, cola, cola_floor=floor)
            standalone.append({
                "name": f"apply_cola_{label}", "cola": cola, "cola_floor": floor,
                "output": None if result is None else asdict(result),
            })
        except ValueError as exc:
            standalone.append({"name": f"apply_cola_{label}", "cola": cola, "cola_floor": floor, "expect_error": str(exc)})

    # COLA applied twice, to confirm it compounds on BOTH the current and the
    # pending amount rather than resetting either.
    once = manager.apply_cola(pending, 0.03)
    twice = manager.apply_cola(once, 0.03)
    standalone.append({"name": "apply_cola_compounds_twice", "output": asdict(twice)})

    output = {"config": CONFIG, "resolve_cases": cases, "standalone_cases": standalone}
    out_path = Path(__file__).resolve().parent / "ss-cashflow-adversarial.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(cases)} resolve cases, {len(standalone)} standalone cases)")
    for c in cases:
        if "output" in c:
            o = c["output"]
            print(f"  {c['name']:46s} benefit={o['current_year_benefit_nominal']:12.2f} codes={o['validation_codes']}")
        else:
            print(f"  {c['name']:46s} ERROR: {c['expect_error']}")


if __name__ == "__main__":
    main()
