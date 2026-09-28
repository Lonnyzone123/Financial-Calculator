"""
Generates fixtures/ss-longevity.fixtures.json by running the real Python
SocialSecurityLongevityAnalyzer (retirement_model_v2/social_security_longevity.py)
across a range of claim scenarios, using the real MortalityTable
(social_security_mortality.py) for mortality profiles. The JS port in
src/ported/social-security-longevity.js is verified against this file (see
tests/ported/social-security-longevity.test.js).

Run from C:\\Calculator merge:
    python fixtures/generate_ss_longevity_fixtures.py
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
from retirement_model_v2.social_security_longevity import SocialSecurityLongevityAnalyzer  # noqa: E402

SOURCE_DIR = SNAPSHOT / "source_files" / "ssa_2026_mortality"
config = load_config()
ss_config = config.section("social_security")


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
        alternatives[alternative] = {
            "source_sha256": series.source_sha256,
            "q_x": [point.death_probability for point in series.points],
        }
    return {
        "dataset_id": source.manifest["dataset_id"], "dataset_version": source.manifest["dataset_version"],
        "birth_year": birth_year, "sex": sex,
        "age_start": int(source.manifest["population"]["age_start"]), "age_end": int(source.manifest["population"]["age_end"]),
        "monthly_interpolation": "constant_force_within_attained_age", "alternatives": alternatives,
    }


analyzer = SocialSecurityLongevityAnalyzer(ss_config)
policy_1960 = build_compact_policy(1960)
table = MortalityTable(policy_1960, alternative="II")


def make_state(floor=40000.0, decision_age_months=65 * 12, portfolio_real=800000.0):
    return FakePlanningState(spending_floor_real=floor, decision_age_months=decision_age_months, portfolio_real=portfolio_real)


def make_profile(decision_age_months=65 * 12, through_age=120):
    return table.conditional_profile(
        birth_year=1960, sex="male",
        valuation_age_months=decision_age_months, through_age_months=through_age * 12,
    )


def benefits_flat(monthly_amount, start_month, end_month_exclusive):
    return {m: monthly_amount for m in range(start_month, end_month_exclusive)}


def scenario_to_dict(result):
    return asdict(result)


def run_scenario_case(name, state, profile, scenario_name, real_portfolio_return, real_safe_return, benefits):
    try:
        result = analyzer.evaluate_scenario(
            planning_state=state, mortality_profile=profile, scenario_name=scenario_name,
            real_portfolio_return=real_portfolio_return, real_safe_return=real_safe_return,
            after_tax_benefit_by_age_month=benefits,
        )
        return {"name": name, "output": scenario_to_dict(result)}
    except ValueError as exc:
        return {"name": name, "expect_error": str(exc)}


def main():
    cases = []
    state = make_state()
    profile = make_profile()

    # 1. Generous flat benefit that fully covers the floor every month --
    #    no depletion, full coverage.
    cases.append(run_scenario_case(
        "generous_full_coverage", state, profile, "claim_early",
        0.03, 0.01, benefits_flat(40000.0 / 12.0, 65 * 12, 121 * 12),
    ))

    # 2. Zero benefit at all (never claimed) -- worst case, tests depletion
    #    and shortfall math against a real portfolio drawdown.
    cases.append(run_scenario_case(
        "never_claimed_zero_benefit", state, profile, "never_claim",
        0.02, 0.01, {},
    ))

    # 3. Partial benefit (half the floor) -- exercises a genuine partial
    #    shortfall/coverage without full depletion or full coverage.
    cases.append(run_scenario_case(
        "partial_benefit_half_floor", state, profile, "claim_mid",
        0.025, 0.01, benefits_flat(20000.0 / 12.0, 65 * 12, 121 * 12),
    ))

    # 4. Negative portfolio return scenario (still > -100%) with a modest
    #    benefit -- exercises depletion under a genuinely adverse return.
    cases.append(run_scenario_case(
        "adverse_return_modest_benefit", state, profile, "adverse",
        -0.02, 0.005, benefits_flat(15000.0 / 12.0, 65 * 12, 121 * 12),
    ))

    # 5. Benefit starts only later (claim deferred to 70) -- realistic
    #    claim-delay shape: 0 before claim, then a benefit afterward.
    deferred_benefits = benefits_flat(35000.0 / 12.0, 70 * 12, 121 * 12)
    cases.append(run_scenario_case(
        "deferred_claim_to_70", state, profile, "claim_70",
        0.025, 0.01, deferred_benefits,
    ))

    # Error cases.
    cases.append(run_scenario_case("error_zero_floor", make_state(floor=0.0), profile, "x", 0.02, 0.01, {}))
    cases.append(run_scenario_case("error_bad_portfolio_return", state, profile, "x", -1.0, 0.01, {}))
    cases.append(run_scenario_case("error_bad_safe_return", state, profile, "x", 0.02, -1.5, {}))
    misaligned_profile = make_profile(decision_age_months=66 * 12)
    cases.append(run_scenario_case("error_misaligned_profile", state, misaligned_profile, "x", 0.02, 0.01, {}))
    cases.append(run_scenario_case(
        "error_negative_benefit", state, profile, "x", 0.02, 0.01, {65 * 12: -100.0},
    ))

    # aggregate() across the 5 successful scenarios above with distinct weights.
    successful = [c for c in cases if "output" in c]
    from retirement_model_v2.social_security_longevity import LongevityScenarioMetrics

    def rebuild(output):
        return LongevityScenarioMetrics(**{**output, "validation_codes": tuple(output["validation_codes"])})

    scenario_objs = [rebuild(c["output"]) for c in successful]
    weights = [0.4, 0.1, 0.2, 0.1, 0.2]
    aggregated = analyzer.aggregate(scenario_objs, weights)
    aggregate_case = {
        "name": "aggregate_five_scenarios",
        "weights": weights,
        "output": {k: v for k, v in asdict(aggregated).items() if k != "scenario_results"},
    }

    # aggregate() error cases.
    aggregate_errors = []
    try:
        analyzer.aggregate(scenario_objs, [1.0, 2.0])
        raise SystemExit("expected mismatched-length error")
    except ValueError as exc:
        aggregate_errors.append({"name": "aggregate_error_mismatched_length", "expect_error": str(exc)})
    try:
        analyzer.aggregate(scenario_objs, [0.0, 0.0, 0.0, 0.0, 0.0])
        raise SystemExit("expected zero-total-weight error")
    except ValueError as exc:
        aggregate_errors.append({"name": "aggregate_error_zero_total_weight", "expect_error": str(exc)})

    output = {"scenario_cases": cases, "aggregate_case": aggregate_case, "aggregate_error_cases": aggregate_errors}
    out_path = Path(__file__).resolve().parent / "ss-longevity.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(cases)} scenario cases, 1 aggregate case, {len(aggregate_errors)} aggregate error cases)")


if __name__ == "__main__":
    main()
