"""
Adversarial/boundary-exact fixtures for SocialSecurityOptimizer's
_compare_candidates()/_select_candidate() tie-breaking hierarchy --
following the same audit-pass pattern already applied to Phases 5-8 in
MERGE_AUDIT_AND_PLAN.md (adversarial cases beyond the original hand-picked
fixtures, run directly against the real Python oracle).

Hand-constructs minimal CandidateValuation objects directly (bypassing the
expensive full evaluate_candidate() pipeline -- each real candidate
evaluation takes real wall-clock time; _compare_candidates()/_select_candidate()
are pure functions of already-computed CandidateValuation objects, so this
is both faster and lets every field relevant to the tie-break hierarchy be
controlled exactly, at floating-point-exact boundaries).

Targets specific translation risks in the JS port's maxByTuple()/
_select_candidate()/_compare_candidates():
  - Python's max(key=...) picks the FIRST occurrence on an exact tie
    (does NOT replace the incumbent unless the new key is STRICTLY
    greater) -- proven here with full 7-tuple ties broken only by
    claim_age_months, and with a full tie including claim_age_months
    (list order must then decide, matching Python's iteration order).
  - The floor-depletion pool narrowing (no-depletion candidates preferred;
    if none, narrow to minimum floor_depletion_scenario_rate within 1e-12,
    then to conditional_shortfall_pv within +1.0 exactly).
  - The robustness-pool narrowing (>= minimum_robust_win_rate; if none,
    narrow to the best acceptability rate within 1e-12).
  - The economic close-call pool boundary (best_economic - value <=
    close_tolerance + 1e-9, exactly at and one cent past that boundary).
  - A single feasible candidate (runner_up must be None).
  - Zero feasible candidates (must raise "No valid Social Security claim
    candidate").

Run from C:\\Calculator merge:
    python fixtures/generate_ss_optimizer_adversarial_fixtures.py
"""
import json
import sys
from dataclasses import asdict
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.config import load_config  # noqa: E402
from retirement_model_v2.social_security_valuation import CandidateValuation, CandidateScenarioValuation, BridgeProjection  # noqa: E402
from retirement_model_v2.social_security_longevity import LongevityMetrics, LongevityScenarioMetrics  # noqa: E402
from retirement_model_v2.social_security_optimizer import SocialSecurityOptimizer  # noqa: E402
from retirement_model_v2.tax_engine import TaxCalculator  # noqa: E402

config = load_config()
ss_config = config.section("social_security")
tax_calculator = TaxCalculator(config.section("tax"))
# No mortality_data/optimizer_config/reserve_config needed -- these tests
# never call _evaluate_candidate_set() or the bridge, only the pure
# comparison/selection functions.
optimizer = SocialSecurityOptimizer(ss_config, calculator=tax_calculator)

SCENARIO_NAMES = ("lower_return", "central", "higher_return")


def scenario_result(name, net_economic_value):
    return CandidateScenarioValuation(
        scenario=name, gross_benefit_pv=0.0, after_tax_benefit_pv=0.0, tax_pv=0.0,
        bridge=BridgeProjection(), longevity=LongevityScenarioMetrics(
            scenario=name, age85_coverage=0.0, age90_coverage=0.0, age95_coverage=0.0,
            conditional_shortfall_pv=0.0, depletion_protection=1.0, reserve_equivalent_real=0.0,
            floor_terminal_assets_real=0.0, projected_depletion_age_months=None, survival_at_depletion=0.0,
        ),
        net_economic_value=net_economic_value, terminal_assets=0.0, feasible=True,
    )


def candidate(
    claim_age_months, *, central_value, lower_value=None, higher_value=None,
    depletion_protection=0.9, age85=0.8, age90=0.8, age95=0.8, reserve_equivalent=1000.0,
    shortfall_pv=500.0, tax_pv=100.0, terminal_assets=200000.0,
    floor_depletion_rate=0.0, feasible=True,
):
    lower_value = central_value if lower_value is None else lower_value
    higher_value = central_value if higher_value is None else higher_value
    scenario_results = (
        scenario_result("lower_return", lower_value),
        scenario_result("central", central_value),
        scenario_result("higher_return", higher_value),
    )
    longevity = LongevityMetrics(
        age85_coverage=age85, age90_coverage=age90, age95_coverage=age95,
        conditional_shortfall_pv=shortfall_pv, depletion_protection=depletion_protection,
        reserve_equivalent_real=reserve_equivalent, floor_depletion_scenario_rate=floor_depletion_rate,
        survival_weighted_depletion_risk=0.0, earliest_depletion_age_months=None,
        expected_floor_terminal_assets_real=0.0, scenario_results=(), validation_codes=(),
    )
    return CandidateValuation(
        claim_age_months=claim_age_months, factor=1.0, first_year_fraction=1.0,
        gross_benefit_pv=central_value, after_tax_benefit_pv=central_value, bridge_cost_pv=0.0,
        net_economic_value=central_value, tax_pv=tax_pv, terminal_assets=terminal_assets,
        longevity=longevity, feasible=feasible, validation_codes=(), scenario_results=scenario_results,
    )


def sanitize_infinities(value):
    if isinstance(value, float):
        if value == float("inf"):
            return "Infinity"
        if value == float("-inf"):
            return "-Infinity"
        if value != value:
            return "NaN"
        return value
    if isinstance(value, dict):
        return {k: sanitize_infinities(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize_infinities(v) for v in value]
    return value


def comparison_to_dict(comparison):
    return {
        "winner_claim_age_months": comparison.winner.claim_age_months,
        "runner_up_claim_age_months": comparison.runner_up.claim_age_months if comparison.runner_up else None,
        "economic_margin": comparison.economic_margin,
        "scenario_win_rate": comparison.scenario_win_rate,
        "robustness_class": comparison.robustness_class,
        "sensitivity_flip_ages": dict(comparison.sensitivity_flip_ages),
    }


def run_case(name, candidates):
    try:
        comparison = optimizer._compare_candidates(tuple(candidates))
        return {"name": name, "output": sanitize_infinities(comparison_to_dict(comparison))}
    except ValueError as exc:
        return {"name": name, "expect_error": str(exc)}


def main():
    cases = []

    # 1. Full 7-tuple tie except claim_age_months -- Python's max() must pick
    #    the HIGHEST claim_age_months (last, non-negated tiebreak field).
    a = candidate(66 * 12, central_value=100000.0, depletion_protection=0.9, age85=0.8, age90=0.8, age95=0.8, reserve_equivalent=1000.0, shortfall_pv=500.0, tax_pv=100.0, terminal_assets=200000.0)
    b = candidate(68 * 12, central_value=100000.0, depletion_protection=0.9, age85=0.8, age90=0.8, age95=0.8, reserve_equivalent=1000.0, shortfall_pv=500.0, tax_pv=100.0, terminal_assets=200000.0)
    cases.append(run_case("full_tie_except_claim_age_picks_highest_age", [a, b]))

    # 2. FULLY identical candidates including claim_age_months (via two
    #    distinct claim ages but every OTHER field bit-identical, so ranking
    #    reduces to iteration order once claim_age_months also ties) --
    #    construct two candidates with the SAME claim_age_months to force a
    #    genuine full tie; Python's max() must return the FIRST one in
    #    iteration order (list index 0), not the second.
    c1 = candidate(67 * 12, central_value=50000.0)
    c2 = candidate(67 * 12, central_value=50000.0)
    # _compare_candidates de-dupes winner from remaining via `is` identity,
    # so a genuine full-tie test needs these to be the ONLY two candidates
    # and checks which *object* wins by checking which one participates as
    # runner-up (both share claim_age_months, so we distinguish by
    # checking economic_margin, which must be exactly 0 for a true tie).
    cases.append(run_case("genuine_full_tie_same_claim_age", [c1, c2]))

    # 3. Depletion pool narrowing: one candidate has floor_depletion_rate=0
    #    (preferred), others have >0 -- the zero-depletion one must win even
    #    with a WORSE economic value.
    no_depletion = candidate(65 * 12, central_value=80000.0, floor_depletion_rate=0.0)
    some_depletion = candidate(67 * 12, central_value=120000.0, floor_depletion_rate=0.3)
    cases.append(run_case("no_depletion_beats_higher_value_with_depletion", [no_depletion, some_depletion]))

    # 4. ALL candidates have depletion -- narrows to minimum
    #    floor_depletion_scenario_rate (within 1e-12), then to minimum
    #    conditional_shortfall_pv + 1.0 exactly.
    d1 = candidate(65 * 12, central_value=80000.0, floor_depletion_rate=0.5, shortfall_pv=1000.0)
    d2 = candidate(66 * 12, central_value=90000.0, floor_depletion_rate=0.2, shortfall_pv=2000.0)
    d3 = candidate(67 * 12, central_value=70000.0, floor_depletion_rate=0.2, shortfall_pv=2000.999999)
    d4 = candidate(68 * 12, central_value=60000.0, floor_depletion_rate=0.2, shortfall_pv=3001.0)
    cases.append(run_case("all_depleted_narrows_by_rate_then_shortfall_boundary", [d1, d2, d3, d4]))

    # 5. Robustness pool: one candidate acceptable in all 3 scenarios (rate
    #    1.0), another acceptable in none of them despite a much higher
    #    central value -- the robust one should win via the robust-pool
    #    filter, not the raw economic value.
    robust = candidate(66 * 12, central_value=90000.0, lower_value=89000.0, higher_value=91000.0)
    fragile = candidate(68 * 12, central_value=200000.0, lower_value=1000.0, higher_value=1000.0)
    cases.append(run_case("robust_candidate_beats_higher_value_fragile_one", [robust, fragile]))

    # 6. Exact close-call boundary: two candidates whose central values
    #    differ by EXACTLY the close_tolerance (economic_close_call_fraction
    #    * max(|best|,1)) -- both must remain in the close pool (uses <=),
    #    so the winner is decided by the longevity tiebreak, not economics.
    close_fraction = float(ss_config["economic_close_call_fraction"])
    best_value = 100000.0
    tolerance = max(abs(best_value), 1.0) * close_fraction
    exact_boundary = candidate(65 * 12, central_value=best_value - tolerance, depletion_protection=0.99)
    best = candidate(67 * 12, central_value=best_value, depletion_protection=0.5)
    cases.append(run_case("exact_close_tolerance_boundary_both_in_pool", [exact_boundary, best]))

    # 7. Just PAST the close-call boundary (tolerance + a bit more than the
    #    1e-9 slack) -- the lower-value candidate must now be EXCLUDED from
    #    the close pool even though its longevity profile is better.
    just_past = candidate(65 * 12, central_value=best_value - tolerance - 1.0, depletion_protection=0.99)
    cases.append(run_case("just_past_close_tolerance_boundary_excluded", [just_past, best]))

    # 8. Single feasible candidate -- runner_up must be None, economic_margin
    #    must be exactly 0 (winner_central - winner_central).
    cases.append(run_case("single_candidate_no_runner_up", [candidate(67 * 12, central_value=100000.0)]))

    # 9. Zero feasible candidates -- must raise.
    infeasible = candidate(65 * 12, central_value=50000.0, feasible=False)
    cases.append(run_case("no_valid_candidates_raises", [infeasible]))

    output = {"economic_close_call_fraction": close_fraction, "minimum_robust_win_rate": ss_config["minimum_robust_win_rate"], "cases": cases}
    out_path = Path(__file__).resolve().parent / "ss-optimizer-adversarial.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(cases)} cases)")


if __name__ == "__main__":
    main()
