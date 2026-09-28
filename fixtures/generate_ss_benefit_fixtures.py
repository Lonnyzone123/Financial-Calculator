"""
Generates fixtures/ss-benefit.fixtures.json by running a range of claim ages
through the real Python social_security_benefit module (claim_factor_fraction,
claim_factor_months, claim_factor_schedule). This is Phase 4's first ported
module -- the JS port in src/ported/social-security-benefit.js is verified
against this file's output (see tests/ported/social-security-benefit.test.js).
This script is the oracle, never the JS port.

Run from C:\\Calculator merge:
    python fixtures/generate_ss_benefit_fixtures.py
"""
import json
import sys
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.social_security_benefit import (  # noqa: E402
    claim_factor_fraction,
    claim_factor_months,
    claim_factor_schedule,
)

FRA = 67 * 12
MAX_AGE = 70 * 12

# claim_factor_fraction / claim_factor_months cases: every whole-year age
# 62-70, plus boundary-exact months around the 36-month reduction/DRC caps
# and a few out-of-range (age < 62 in months, still valid input-wise -- the
# function itself only rejects negative/zero) and error cases.
FRACTION_CASES = []
for months in range(62 * 12, 71 * 12 + 1):
    FRACTION_CASES.append({"name": f"months_{months}", "claim_age_months": months, "fra_age_months": FRA})

# Boundary-exact around the early-reduction 36-month cliff (FRA - 36, FRA - 37)
# and the late-reduction floor, plus DRC boundary (FRA+36, FRA+37 clamps).
for months in [FRA - 37, FRA - 36, FRA - 35, FRA - 1, FRA, FRA + 1, FRA + 35, FRA + 36, FRA + 37, FRA + 48]:
    FRACTION_CASES.append({"name": f"boundary_{months}", "claim_age_months": months, "fra_age_months": FRA})

# A non-standard FRA (66, matching an older cohort) to exercise the fra_age_months param.
for months in [66 * 12 - 24, 66 * 12, 66 * 12 + 24]:
    FRACTION_CASES.append({"name": f"fra66_{months}", "claim_age_months": months, "fra_age_months": 66 * 12})

ERROR_CASES = [
    {"name": "negative_claim_age", "claim_age_months": -1, "fra_age_months": FRA},
    {"name": "zero_fra", "claim_age_months": 65 * 12, "fra_age_months": 0},
]

# claim_factor_schedule cases: whole-year claims (no pending credit), and
# mid-year claims after FRA (exercise the pending_effective_age_months path),
# mid-year claims before/at FRA (no DRC timing issue), and the maximum-age
# boundary.
SCHEDULE_CASES = []
for months in [
    62 * 12, 65 * 12, FRA, MAX_AGE,          # whole years, no pending credit
    FRA + 1, FRA + 6, FRA + 11,              # first partial DRC year
    FRA + 13, FRA + 18, FRA + 23,            # second partial DRC year
    FRA + 25, FRA + 35,                      # third partial DRC year (near cap)
    FRA - 1, FRA - 6,                        # before FRA, mid-year (no DRC path)
    62 * 12 + 3,                             # early claim, mid-year
    MAX_AGE - 1,                             # one month before max, mid-year but claim>=maximum branch? (69y11m < max)
]:
    SCHEDULE_CASES.append({"name": f"sched_{months}", "claim_age_months": months, "fra_age_months": FRA, "maximum_age_months": MAX_AGE})

SCHEDULE_ERROR_CASES = [
    {"name": "sched_bad_cycle_start", "claim_age_months": FRA + 6, "fra_age_months": FRA, "maximum_age_months": MAX_AGE, "claim_cycle_start_calendar_month": 4},
    {"name": "sched_non_integer_fra", "claim_age_months": FRA + 6, "fra_age_months": FRA + 5, "maximum_age_months": MAX_AGE},
    {"name": "sched_exceeds_max", "claim_age_months": MAX_AGE + 12, "fra_age_months": FRA, "maximum_age_months": MAX_AGE},
]


def fraction_to_dict(frac):
    return {"numerator": frac.numerator, "denominator": frac.denominator, "float": float(frac)}


def run_fraction_case(case):
    try:
        frac = claim_factor_fraction(case["claim_age_months"], fra_age_months=case["fra_age_months"])
        months_float = claim_factor_months(case["claim_age_months"], fra_age_months=case["fra_age_months"])
        return {"name": case["name"], "input": case, "output": {"fraction": fraction_to_dict(frac), "months_float": months_float}}
    except ValueError as exc:
        return {"name": case["name"], "input": case, "expect_error": str(exc)}


def run_schedule_case(case):
    kwargs = {k: v for k, v in case.items() if k != "name"}
    try:
        sched = claim_factor_schedule(**kwargs)
        return {
            "name": case["name"],
            "input": case,
            "output": {
                "eventual_factor": fraction_to_dict(sched.eventual_factor),
                "initial_payable_factor": fraction_to_dict(sched.initial_payable_factor),
                "pending_effective_age_months": sched.pending_effective_age_months,
                "eventual": sched.eventual,
                "initial_payable": sched.initial_payable,
                "has_pending_credit": sched.has_pending_credit,
            },
        }
    except ValueError as exc:
        return {"name": case["name"], "input": case, "expect_error": str(exc)}


def main():
    output = {
        "fraction_cases": [run_fraction_case(c) for c in FRACTION_CASES + ERROR_CASES],
        "schedule_cases": [run_schedule_case(c) for c in SCHEDULE_CASES + SCHEDULE_ERROR_CASES],
    }
    out_path = Path(__file__).resolve().parent / "ss-benefit.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(output['fraction_cases'])} fraction cases, {len(output['schedule_cases'])} schedule cases)")


if __name__ == "__main__":
    main()
