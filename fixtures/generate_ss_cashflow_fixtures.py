"""
Generates fixtures/ss-cashflow.fixtures.json by running the real Python
SocialSecurityCashFlowManager (retirement_model_v2/social_security_cashflow.py)
across a range of claim decisions, prior-status resolutions, DRC activation
timing, and COLA applications. The JS port in
src/ported/social-security-cashflow.js is verified against this file (see
tests/ported/social-security-cashflow.test.js).

Run from C:\\Calculator merge:
    python fixtures/generate_ss_cashflow_fixtures.py
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


def decision(claim_now, selected_claim_age_months=None, annual_benefit_real_if_claimed=24000.0, first_year_fraction_override=None):
    frac = (
        first_year_benefit_fraction(selected_claim_age_months)
        if selected_claim_age_months is not None else 0.0
    )
    if first_year_fraction_override is not None:
        frac = first_year_fraction_override
    return SocialSecurityDecision(
        eligible=True, claim_now=claim_now, selected_claim_age=None,
        annual_benefit_real_if_claimed=annual_benefit_real_if_claimed, reason="test",
        selected_claim_age_months=selected_claim_age_months,
        first_year_benefit_fraction=frac,
    )


def status_to_dict(status):
    return None if status is None else asdict(status)


def cashflow_to_dict(cf):
    return {
        "status": status_to_dict(cf.status),
        "current_year_benefit_nominal": cf.current_year_benefit_nominal,
        "first_year_fraction": cf.first_year_fraction,
        "newly_claimed": cf.newly_claimed,
        "validation_codes": list(cf.validation_codes),
        "eventual_factor": cf.eventual_factor,
        "initial_payable_factor": cf.initial_payable_factor,
        "pending_drc_effective_age_months": cf.pending_drc_effective_age_months,
    }


def run_resolve_case(name, dec, current_age_months, inflation_factor, prior_status):
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

    # 1. Not claiming this year, no prior status.
    cases.append(run_resolve_case("not_claiming", decision(False), 65 * 12, 1.3, None))

    # 2. Claim now, whole-year January claim (no partial first year, no pending DRC).
    cases.append(run_resolve_case("claim_now_january_whole_year", decision(True, 67 * 12, 24000.0), 67 * 12, 1.3, None))

    # 3. Claim now, mid-year claim BEFORE FRA (no DRC path -- initial==eventual).
    cases.append(run_resolve_case("claim_now_midyear_before_fra", decision(True, 65 * 12 + 5, 18000.0), 65 * 12, 1.25, None))

    # 4. Claim now, mid-year claim AFTER FRA -- exercises the pending-DRC path
    #    (initial_payable < eventual until the following January).
    cases.append(run_resolve_case("claim_now_midyear_after_fra_pending_drc", decision(True, 68 * 12 + 4, 30000.0), 68 * 12, 1.4, None))

    # 5. Claim now at exactly the maximum age (70), whole year -- no pending DRC (claim>=maximum).
    cases.append(run_resolve_case("claim_now_at_maximum_age", decision(True, 70 * 12, 40000.0), 70 * 12, 1.5, None))

    # 6. Prior status exists, DRC not yet effective -- current_age_months < effective.
    prior_pending = SocialSecurityClaimStatus(
        claim_age_months=68 * 12 + 4, full_annual_benefit_nominal=28000.0,
        pending_drc_annual_benefit_nominal=32000.0, pending_drc_effective_age_months=69 * 12,
    )
    cases.append(run_resolve_case("prior_status_drc_not_yet_effective", decision(False), 68 * 12 + 8, 1.4, prior_pending))

    # 7. Prior status exists, DRC becomes effective exactly this month.
    cases.append(run_resolve_case("prior_status_drc_effective_exact_month", decision(False), 69 * 12, 1.4, prior_pending))

    # 8. Prior status exists, DRC effective month already passed.
    cases.append(run_resolve_case("prior_status_drc_effective_past", decision(False), 69 * 12 + 6, 1.4, prior_pending))

    # 9. Prior status exists, no pending DRC at all (simple continuation).
    prior_simple = SocialSecurityClaimStatus(claim_age_months=65 * 12, full_annual_benefit_nominal=20000.0)
    cases.append(run_resolve_case("prior_status_no_pending_drc", decision(False), 66 * 12, 1.35, prior_simple))

    # Error cases.
    cases.append(run_resolve_case("error_nonpositive_inflation_factor", decision(True, 67 * 12), 67 * 12, 0.0, None))
    cases.append(run_resolve_case("error_claim_now_missing_month", decision(True, None), 67 * 12, 1.3, None))
    cases.append(run_resolve_case("error_claim_month_outside_cycle_before", decision(True, 66 * 12 + 11), 67 * 12, 1.3, None))
    cases.append(run_resolve_case("error_claim_month_outside_cycle_after", decision(True, 68 * 12), 67 * 12, 1.3, None))

    # A mismatch/nonpositive-benefit case that should surface validation_codes
    # without raising.
    cases.append(run_resolve_case(
        "validation_code_fraction_mismatch_and_nonpositive_benefit",
        decision(True, 67 * 12 + 3, annual_benefit_real_if_claimed=0.0, first_year_fraction_override=0.99),
        67 * 12, 1.3, None,
    ))

    # activate_pending() and apply_cola() as standalone functions.
    standalone = []
    activated_not_yet = manager.activate_pending(prior_pending, current_age_months=68 * 12 + 11)
    standalone.append({"name": "activate_pending_not_yet", "output": status_to_dict(activated_not_yet)})
    activated_now = manager.activate_pending(prior_pending, current_age_months=69 * 12)
    standalone.append({"name": "activate_pending_now", "output": status_to_dict(activated_now)})
    activated_none = manager.activate_pending(None, current_age_months=69 * 12)
    standalone.append({"name": "activate_pending_none_status", "output": status_to_dict(activated_none)})

    cola_applied = manager.apply_cola(prior_pending, 0.03)
    standalone.append({"name": "apply_cola_normal", "output": status_to_dict(cola_applied)})
    cola_floor_applied = manager.apply_cola(prior_simple, -0.01, cola_floor=0.0)
    standalone.append({"name": "apply_cola_floored", "output": status_to_dict(cola_floor_applied)})
    try:
        manager.apply_cola(prior_simple, -1.5, cola_floor=-2.0)
        raise SystemExit("expected ValueError for cola <= -1")
    except ValueError as exc:
        standalone.append({"name": "apply_cola_error_below_negative_one", "expect_error": str(exc)})
    cola_none = manager.apply_cola(None, 0.03)
    standalone.append({"name": "apply_cola_none_status", "output": status_to_dict(cola_none)})

    output = {"resolve_cases": cases, "standalone_cases": standalone}
    out_path = Path(__file__).resolve().parent / "ss-cashflow.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(cases)} resolve cases, {len(standalone)} standalone cases)")


if __name__ == "__main__":
    main()
