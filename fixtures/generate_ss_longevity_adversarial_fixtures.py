"""
Adversarial/boundary-exact fixtures for SocialSecurityLongevityAnalyzer --
same audit-pass pattern applied to Phases 5-8 and, in this phase, to the
optimizer, the bridge, and the valuation engine.

Targets the boundaries and guards the original Phase 4 longevity fixtures
touch only incidentally:

  - `range(max(current, longevity_start), terminal)`: the shortfall/reserve
    accumulation window normally starts at the configured longevity start
    age (85), but starts at the DECISION age instead once the decision age
    is already past it. Tested with a decision age of 90.
  - Checkpoint coverage landing exactly at 1.0 (twelve monthly benefits
    summing to exactly the annual floor) -- the hard boundary between
    "fully covered" and "not".
  - `_depletion_protection`'s `required > 0.0` guard, reached for real when
    depletion happens so late that survival is ~0 for every remaining month.
  - Depletion at the very last month before the terminal horizon.
  - A zero real portfolio return (monthly growth factor exactly 1.0) and a
    zero real safe return (every discount factor exactly 1.0).
  - The no-depletion path where the portfolio exactly covers the floor.

Run from C:\\Calculator merge:
    python fixtures/generate_ss_longevity_adversarial_fixtures.py
"""
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.config import load_config  # noqa: E402
from retirement_model_v2.mortality_data import TrusteesMortalityData  # noqa: E402
from retirement_model_v2.social_security_mortality import MortalityTable  # noqa: E402
from retirement_model_v2.social_security_longevity import SocialSecurityLongevityAnalyzer, LongevityScenarioMetrics  # noqa: E402

config = load_config()
ss_config = config.section("social_security")
SOURCE_DIR = SNAPSHOT / "source_files" / "ssa_2026_mortality"
BIRTH_YEAR = 1960


@dataclass(frozen=True)
class FakePlanningState:
    spending_floor_real: float
    decision_age_months: int
    portfolio_real: float


def build_compact_policy(birth_year, sex="male"):
    source = TrusteesMortalityData(SOURCE_DIR)
    alternatives = {}
    for alternative in source.alternatives():
        series = source.load(alternative=alternative, birth_year=birth_year, sex=sex)
        alternatives[alternative] = {"source_sha256": series.source_sha256, "q_x": [p.death_probability for p in series.points]}
    return {
        "dataset_id": source.manifest["dataset_id"], "dataset_version": source.manifest["dataset_version"],
        "birth_year": birth_year, "sex": sex,
        "age_start": int(source.manifest["population"]["age_start"]), "age_end": int(source.manifest["population"]["age_end"]),
        "monthly_interpolation": "constant_force_within_attained_age", "alternatives": alternatives,
    }


table = MortalityTable(build_compact_policy(BIRTH_YEAR), alternative="II")
analyzer = SocialSecurityLongevityAnalyzer(ss_config)


def profile(decision_age_months, through_age=120):
    return table.conditional_profile(
        birth_year=BIRTH_YEAR, sex="male",
        valuation_age_months=decision_age_months, through_age_months=through_age * 12,
    )


def flat(monthly_amount, start_month, end_month_exclusive):
    return {m: monthly_amount for m in range(start_month, end_month_exclusive)}


def run_case(name, state, prof, scenario_name, portfolio_return, safe_return, benefits):
    try:
        result = analyzer.evaluate_scenario(
            planning_state=state, mortality_profile=prof, scenario_name=scenario_name,
            real_portfolio_return=portfolio_return, real_safe_return=safe_return,
            after_tax_benefit_by_age_month=benefits,
        )
        return {"name": name, "output": asdict(result)}
    except ValueError as exc:
        return {"name": name, "expect_error": str(exc)}


def main():
    cases = []
    FLOOR = 40000.0

    # 1. Decision age ALREADY PAST the configured longevity start age (85):
    #    the accumulation window must start at the decision age (90), not 85,
    #    since range(max(current, longevity_start), terminal) takes the max.
    state90 = FakePlanningState(spending_floor_real=FLOOR, decision_age_months=90 * 12, portfolio_real=500000.0)
    cases.append(run_case(
        "decision_age_past_longevity_start", state90, profile(90 * 12), "late_decision",
        0.03, 0.01, flat(FLOOR / 12.0, 90 * 12, 121 * 12),
    ))

    # 2. Checkpoint coverage landing EXACTLY at 1.0 -- twelve monthly
    #    benefits summing to exactly the annual floor.
    state65 = FakePlanningState(spending_floor_real=FLOOR, decision_age_months=65 * 12, portfolio_real=800000.0)
    cases.append(run_case(
        "coverage_exactly_one", state65, profile(65 * 12), "exact_coverage",
        0.03, 0.01, flat(FLOOR / 12.0, 65 * 12, 121 * 12),
    ))

    # 3. Coverage one cent BELOW exactly 1.0, to confirm the boundary is not
    #    being rounded into place.
    cases.append(run_case(
        "coverage_just_below_one", state65, profile(65 * 12), "just_below",
        0.03, 0.01, flat((FLOOR - 0.12) / 12.0, 65 * 12, 121 * 12),
    ))

    # 4. Zero real portfolio return -- the monthly growth factor is exactly
    #    (1+0)^(1/12)-1 = 0, so the balance only ever decreases.
    cases.append(run_case(
        "zero_portfolio_return", state65, profile(65 * 12), "no_growth",
        0.0, 0.01, flat(15000.0 / 12.0, 65 * 12, 121 * 12),
    ))

    # 5. Zero real safe return -- every discount factor is exactly 1.0, so
    #    shortfall PV is the raw survival-weighted sum with no discounting.
    cases.append(run_case(
        "zero_safe_return_no_discounting", state65, profile(65 * 12), "no_discount",
        0.03, 0.0, flat(15000.0 / 12.0, 65 * 12, 121 * 12),
    ))

    # 6. NEGATIVE real safe return -- discount < 1, amplifying the shortfall
    #    PV rather than shrinking it. Legal: only rates <= -100% are rejected.
    cases.append(run_case(
        "negative_safe_return_amplifies_shortfall", state65, profile(65 * 12), "negative_discount",
        0.03, -0.02, flat(15000.0 / 12.0, 65 * 12, 121 * 12),
    ))

    # 7. Enormous portfolio, zero benefit -- never depletes, so
    #    depletion_protection short-circuits to 1.0 via its None branch and
    #    survival_at_depletion stays 0.0.
    rich = FakePlanningState(spending_floor_real=FLOOR, decision_age_months=65 * 12, portfolio_real=50_000_000.0)
    cases.append(run_case(
        "never_depletes_huge_portfolio", rich, profile(65 * 12), "rich", 0.03, 0.01, {},
    ))

    # 8. Zero portfolio, zero benefit -- depletes in the very FIRST month
    #    (balance 0, required = floor/12 > 0), the earliest possible
    #    depletion month.
    broke = FakePlanningState(spending_floor_real=FLOOR, decision_age_months=65 * 12, portfolio_real=0.0)
    cases.append(run_case(
        "depletes_in_first_month", broke, profile(65 * 12), "broke", 0.03, 0.01, {},
    ))

    # 9. Benefit exactly covers the floor from the start with a zero
    #    portfolio -- required is exactly 0 every month, so the balance never
    #    goes negative and NO depletion is recorded even at zero assets. The
    #    max(0, floor_monthly - benefit) boundary landing exactly on 0.
    cases.append(run_case(
        "zero_portfolio_but_benefit_exactly_covers_floor", broke, profile(65 * 12), "exact_cover",
        0.03, 0.01, flat(FLOOR / 12.0, 65 * 12, 121 * 12),
    ))

    # 10. Benefit one cent SHORT of the floor with a zero portfolio -- the
    #     mirror of case 9: required is now a hair above 0, so depletion is
    #     recorded in month one.
    cases.append(run_case(
        "zero_portfolio_benefit_one_cent_short", broke, profile(65 * 12), "one_cent_short",
        0.03, 0.01, flat((FLOOR - 0.12) / 12.0, 65 * 12, 121 * 12),
    ))

    # aggregate() edge cases on the successful scenarios above.
    successful = [c for c in cases if "output" in c]

    def rebuild(output):
        return LongevityScenarioMetrics(**{**output, "validation_codes": tuple(output["validation_codes"])})

    objs = [rebuild(c["output"]) for c in successful]

    aggregate_cases = []
    # A single scenario with weight 1.0 -- every weighted field must equal
    # that scenario's own value exactly.
    single = analyzer.aggregate([objs[0]], [1.0])
    aggregate_cases.append({
        "name": "aggregate_single_scenario_weight_one",
        "source_case": successful[0]["name"], "weights": [1.0],
        "output": {k: v for k, v in asdict(single).items() if k != "scenario_results"},
    })
    # Unnormalized weights (summing to 10, not 1) -- must normalize
    # internally rather than scaling the result tenfold.
    two = analyzer.aggregate(objs[:2], [3.0, 7.0])
    aggregate_cases.append({
        "name": "aggregate_unnormalized_weights",
        "source_cases": [c["name"] for c in successful[:2]], "weights": [3.0, 7.0],
        "output": {k: v for k, v in asdict(two).items() if k != "scenario_results"},
    })
    # Inexact thirds -- exercises the preciseSum normalization path.
    thirds = analyzer.aggregate(objs[:3], [1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0])
    aggregate_cases.append({
        "name": "aggregate_inexact_thirds",
        "source_cases": [c["name"] for c in successful[:3]], "weights": [1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0],
        "output": {k: v for k, v in asdict(thirds).items() if k != "scenario_results"},
    })

    output = {"ss_config": ss_config, "floor": FLOOR, "cases": cases, "aggregate_cases": aggregate_cases}
    out_path = Path(__file__).resolve().parent / "ss-longevity-adversarial.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(cases)} scenario cases, {len(aggregate_cases)} aggregate cases)")


if __name__ == "__main__":
    main()
