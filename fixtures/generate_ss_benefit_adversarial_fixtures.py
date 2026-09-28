"""
Adversarial/boundary-exact fixtures for the claim-factor benefit math --
same audit-pass pattern applied to Phases 5-8 and, in this phase, to the
optimizer, bridge, valuation engine, longevity analyzer, and mortality port.

The original Phase 4 benefit fixtures cover 124 cases, but every one of them
sits in the ordinary claiming range (ages 62-70 plus boundaries around FRA
and the DRC cap). This pass deliberately leaves that range, because two real
code paths in the JS port are never exercised inside it:

  - `gcd(0, n)` normalization. Python's Fraction(0, 240) normalizes to 0/1.
    The JS port's makeFraction() reaches that through a gcd whose first
    argument is 0 -- a branch no existing fixture touches, since every
    factor in the 62-70 range has a nonzero numerator.
  - NEGATIVE-numerator normalization. The pre-FRA reduction formula
    (192 - excess)/240 crosses zero at a claim age of EXACTLY 48.0 (576
    months, with an FRA of 67) and goes negative below it. Python's Fraction
    normalizes the sign onto the numerator; the JS port must produce the
    identical numerator/denominator pair, not merely the same float.

Neither region is reachable through the real pipeline (the optimizer only
proposes claims within [claim_min_age_months, claim_max_age_months]), but
claim_factor_fraction/claim_factor_schedule are exported and only reject a
NEGATIVE claim age -- so these values are well-defined, and a port that
diverges here diverges silently.

Run from C:\\Calculator merge:
    python fixtures/generate_ss_benefit_adversarial_fixtures.py
"""
import json
import sys
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.social_security_benefit import (  # noqa: E402
    claim_factor_fraction, claim_factor_months, claim_factor_schedule,
)

FRA = 67 * 12
MAX_AGE = 70 * 12


def fraction_case(name, claim_age_months, fra_age_months=FRA):
    try:
        frac = claim_factor_fraction(claim_age_months, fra_age_months=fra_age_months)
        return {
            "name": name,
            "input": {"claim_age_months": claim_age_months, "fra_age_months": fra_age_months},
            "output": {
                "numerator": frac.numerator,
                "denominator": frac.denominator,
                "float": float(frac),
                "months_float": claim_factor_months(claim_age_months, fra_age_months=fra_age_months),
            },
        }
    except ValueError as exc:
        return {
            "name": name,
            "input": {"claim_age_months": claim_age_months, "fra_age_months": fra_age_months},
            "expect_error": str(exc),
        }


def schedule_case(name, claim_age_months, fra_age_months=FRA, maximum_age_months=MAX_AGE, cycle_start=1):
    kwargs = {
        "fra_age_months": fra_age_months,
        "maximum_age_months": maximum_age_months,
        "claim_cycle_start_calendar_month": cycle_start,
    }
    try:
        sched = claim_factor_schedule(claim_age_months, **kwargs)
        return {
            "name": name,
            "input": {"claim_age_months": claim_age_months, **kwargs},
            "output": {
                "eventual_numerator": sched.eventual_factor.numerator,
                "eventual_denominator": sched.eventual_factor.denominator,
                "initial_numerator": sched.initial_payable_factor.numerator,
                "initial_denominator": sched.initial_payable_factor.denominator,
                "eventual": sched.eventual,
                "initial_payable": sched.initial_payable,
                "pending_effective_age_months": sched.pending_effective_age_months,
                "has_pending_credit": sched.has_pending_credit,
            },
        }
    except ValueError as exc:
        return {"name": name, "input": {"claim_age_months": claim_age_months, **kwargs}, "expect_error": str(exc)}


def main():
    fraction_cases = []

    # The zero crossing: (192 - excess)/240 == 0 exactly when excess == 192,
    # i.e. reduction_months == 228, i.e. claim == FRA - 228 == 576 (age 48).
    # Python's Fraction normalizes 0/240 to 0/1 -- the gcd(0, n) path.
    fraction_cases.append(fraction_case("factor_exactly_zero_at_age_48", 576))
    fraction_cases.append(fraction_case("factor_one_month_above_zero", 577))
    fraction_cases.append(fraction_case("factor_one_month_below_zero_goes_negative", 575))

    # Deeper into the negative region, at values whose gcd reduction is
    # non-trivial (so the JS port's sign handling AND its gcd must both be
    # right, not just one of them).
    for months, label in [(560, "negative_gcd_15"), (300, "negative_gcd_12"), (12, "negative_age_one"), (0, "negative_age_zero")]:
        fraction_cases.append(fraction_case(f"{label}_{months}", months))

    # The two reduction-tier boundaries, exactly: the first 36 reduction
    # months cost 1/180 each, earlier ones 1/240.
    fraction_cases.append(fraction_case("reduction_tier_boundary_exactly_36", FRA - 36))
    fraction_cases.append(fraction_case("reduction_tier_boundary_37", FRA - 37))

    # The DRC cap, exactly: credits stop accruing after 36 delayed months.
    fraction_cases.append(fraction_case("drc_cap_exactly_36", FRA + 36))
    fraction_cases.append(fraction_case("drc_cap_one_past", FRA + 37))
    fraction_cases.append(fraction_case("drc_far_past_cap", FRA + 600))

    # Input validation: a negative claim age and a non-positive FRA.
    fraction_cases.append(fraction_case("error_negative_claim_age", -1))
    fraction_cases.append(fraction_case("error_zero_fra", 65 * 12, fra_age_months=0))
    fraction_cases.append(fraction_case("error_negative_fra", 65 * 12, fra_age_months=-12))

    # A very large FRA (every realistic claim is then deeply reduced).
    fraction_cases.append(fraction_case("huge_fra_deep_reduction", 62 * 12, fra_age_months=100 * 12))

    schedule_cases = []
    # The schedule at the zero-factor claim age: claim <= fra, so eventual
    # and initial are identical and there is no pending credit -- but both
    # are exactly 0, which is what makes the cash-flow module's
    # max(eventual, 1e-12) divisor guard reachable.
    schedule_cases.append(schedule_case("schedule_at_zero_factor_age_48", 576))
    schedule_cases.append(schedule_case("schedule_in_negative_region", 500))

    # Schedule-specific validation, exactly at each boundary.
    schedule_cases.append(schedule_case("schedule_claim_exactly_at_maximum", MAX_AGE))
    schedule_cases.append(schedule_case("schedule_claim_one_month_past_maximum", MAX_AGE + 1))
    schedule_cases.append(schedule_case("schedule_non_january_cycle_rejected", FRA + 6, cycle_start=2))
    schedule_cases.append(schedule_case("schedule_non_integer_fra_rejected", FRA + 6, fra_age_months=FRA + 1))

    # A non-standard but still integer FRA (age 66), mid-year post-FRA claim
    # -- the pending-DRC path under a different FRA than every other fixture.
    schedule_cases.append(schedule_case("schedule_fra66_midyear_pending_drc", 67 * 12 + 7, fra_age_months=66 * 12))

    output = {"fraction_cases": fraction_cases, "schedule_cases": schedule_cases}
    out_path = Path(__file__).resolve().parent / "ss-benefit-adversarial.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(fraction_cases)} fraction cases, {len(schedule_cases)} schedule cases)")
    for c in fraction_cases:
        if "output" in c:
            o = c["output"]
            print(f"  {c['name']:44s} {o['numerator']:5d}/{o['denominator']:<5d} = {o['float']}")
        else:
            print(f"  {c['name']:44s} ERROR: {c['expect_error']}")


if __name__ == "__main__":
    main()
