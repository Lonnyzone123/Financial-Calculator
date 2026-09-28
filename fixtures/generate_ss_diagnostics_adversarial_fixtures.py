"""
Adversarial fixtures for SocialSecurityDiagnosticBuilder -- the last Phase 4
module without a dedicated audit pass.

It is a pure formatter, so the risk here is branch coverage rather than
numerical drift. The original six fixtures all used well-formed comparisons
whose scenario names matched the configured planning scenarios; these cases
deliberately break that assumption and sit exactly on the tolerance
boundaries:

  - `_aggregate_bridge` looks each scenario's weight up with
    `configured_weights.get(result.scenario, 0.0)`. A candidate whose
    scenario names do NOT appear in config therefore sums to a total weight
    of 0, falling back to EQUAL weights (1/n) instead of dividing by zero.
    That fallback branch is unreachable with any well-formed comparison and
    was never exercised.
  - A PARTIAL match (one known scenario name, one unknown) normalizes over
    the known one alone, which is a different result again from either the
    all-known or all-unknown case.
  - `economic_margin_direction` switches on `> 1e-9` / `< -1e-9`, so exactly
    +1e-9 and exactly -1e-9 must both report "tied".
  - `trace_reasons`'s ECONOMIC_CLOSE_CALL threshold,
    `max(|winner_value|, 1.0) * economic_close_call_fraction`, checked at
    exactly the threshold and just past it.

Run from C:\\Calculator merge:
    python fixtures/generate_ss_diagnostics_adversarial_fixtures.py
"""
import json
import sys
from dataclasses import asdict
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.config import load_config  # noqa: E402
from retirement_model_v2.model_types import TaxIncome  # noqa: E402
from retirement_model_v2.social_security_valuation import (  # noqa: E402
    SocialSecurityPlanningState, CandidateValuation, CandidateScenarioValuation, BridgeProjection,
)
from retirement_model_v2.social_security_longevity import LongevityMetrics, LongevityScenarioMetrics  # noqa: E402
from retirement_model_v2.social_security_optimizer import CandidateComparison  # noqa: E402
from retirement_model_v2.social_security_diagnostics import SocialSecurityDiagnosticBuilder  # noqa: E402

config = load_config()
ss_config = config.section("social_security")
builder = SocialSecurityDiagnosticBuilder(ss_config)

state = SocialSecurityPlanningState(
    decision_year=2025, decision_age_months=65 * 12, retirement_year=1, inflation_factor=1.2,
    spending_real=60000.0, spending_floor_real=40000.0,
    voo_real=400000.0, voo_basis_real=240000.0, schd_real=200000.0, schd_basis_real=120000.0,
    tbills_real=150000.0, roth_real=100000.0, reserve_months=12.0, equity_drawdown=0.0,
    base_income_nominal=TaxIncome(ordinary_income=30000.0), fra_monthly_benefit_real=1250.0,
)


def bridge(opportunity=1000.0, incremental_tax=200.0, terminal_diff=500.0, terminal_assets=750000.0, withdrawals=None):
    return BridgeProjection(
        opportunity_cost_pv=opportunity, incremental_tax_pv=incremental_tax,
        terminal_asset_difference=terminal_diff, terminal_assets_real=terminal_assets,
        feasible=True,
        source_withdrawals_real=withdrawals or {"tbills": 10.0, "voo": 20.0, "roth": 30.0, "schd": 40.0},
        annual_records=(), validation_codes=(),
    )


def scenario_result(name, net_value, **bridge_kwargs):
    return CandidateScenarioValuation(
        scenario=name, gross_benefit_pv=net_value + 100.0, after_tax_benefit_pv=net_value + 50.0,
        tax_pv=50.0, bridge=bridge(**bridge_kwargs),
        longevity=LongevityScenarioMetrics(
            scenario=name, age85_coverage=0.8, age90_coverage=0.8, age95_coverage=0.8,
            conditional_shortfall_pv=100.0, depletion_protection=0.9, reserve_equivalent_real=1000.0,
            floor_terminal_assets_real=500.0, projected_depletion_age_months=None, survival_at_depletion=0.0,
        ),
        net_economic_value=net_value, terminal_assets=750000.0, feasible=True, validation_codes=(),
    )


def candidate(claim_age_months, scenario_names, net_value=100000.0):
    results = tuple(scenario_result(name, net_value + i * 10.0) for i, name in enumerate(scenario_names))
    longevity = LongevityMetrics(
        age85_coverage=0.8, age90_coverage=0.85, age95_coverage=0.75,
        conditional_shortfall_pv=100.0, depletion_protection=0.9, reserve_equivalent_real=1000.0,
        floor_depletion_scenario_rate=0.0, survival_weighted_depletion_risk=0.0,
        earliest_depletion_age_months=None, expected_floor_terminal_assets_real=500.0,
        scenario_results=(), validation_codes=(),
    )
    return CandidateValuation(
        claim_age_months=claim_age_months, factor=1.0, first_year_fraction=1.0,
        gross_benefit_pv=net_value + 100.0, after_tax_benefit_pv=net_value + 50.0, bridge_cost_pv=1000.0,
        net_economic_value=net_value, tax_pv=50.0, terminal_assets=750000.0,
        longevity=longevity, feasible=True, validation_codes=(), scenario_results=results,
    )


CONFIGURED = tuple(str(item["name"]) for item in ss_config["planning_scenarios"])


def run_case(name, comparison, action="CLAIM"):
    return {
        "name": name,
        "compact_record": builder.compact_record(planning_state=state, comparison=comparison, action=action),
        "trace_reasons": list(builder.trace_reasons(comparison)),
    }


def main():
    cases = []

    # 1. All scenario names KNOWN to config -- the ordinary path, kept as the
    #    control so the two fallback cases below can be compared against it.
    known = candidate(67 * 12, CONFIGURED)
    known_runner = candidate(68 * 12, CONFIGURED, net_value=99000.0)
    cases.append(run_case("all_scenario_names_configured", CandidateComparison(
        winner=known, runner_up=known_runner, economic_margin=1000.0, scenario_win_rate=1.0,
        sensitivity_flip_ages={}, robustness_class="ROBUST", candidates=(known, known_runner),
    )))

    # 2. NO scenario name matches config -- every configured weight lookup
    #    returns 0.0, so total == 0 and _aggregate_bridge falls back to equal
    #    weights rather than dividing by zero.
    unknown = candidate(67 * 12, ("mystery_a", "mystery_b", "mystery_c"))
    cases.append(run_case("no_scenario_names_configured_equal_weight_fallback", CandidateComparison(
        winner=unknown, runner_up=None, economic_margin=0.0, scenario_win_rate=1.0,
        sensitivity_flip_ages={}, robustness_class="ROBUST", candidates=(unknown,),
    )))

    # 3. PARTIAL match -- only one configured name present, so normalization
    #    happens over that single scenario's weight alone.
    partial = candidate(67 * 12, (CONFIGURED[1], "mystery_a", "mystery_b"))
    cases.append(run_case("partial_scenario_name_match", CandidateComparison(
        winner=partial, runner_up=None, economic_margin=0.0, scenario_win_rate=1.0,
        sensitivity_flip_ages={}, robustness_class="ROBUST", candidates=(partial,),
    )))

    # 4/5. economic_margin_direction boundaries, exactly at +/-1e-9 (which
    #      must read "tied", since the comparisons are strict) and just past.
    for label, margin in [
        ("margin_exactly_positive_epsilon", 1e-9),
        ("margin_exactly_negative_epsilon", -1e-9),
        ("margin_just_past_positive_epsilon", 1.0000001e-9),
        ("margin_just_past_negative_epsilon", -1.0000001e-9),
        ("margin_exactly_zero", 0.0),
    ]:
        cases.append(run_case(f"direction_{label}", CandidateComparison(
            winner=known, runner_up=known_runner, economic_margin=margin, scenario_win_rate=1.0,
            sensitivity_flip_ages={}, robustness_class="ROBUST", candidates=(known, known_runner),
        )))

    # 6/7. ECONOMIC_CLOSE_CALL threshold: max(|winner_net|, 1.0) * fraction.
    fraction = float(ss_config["economic_close_call_fraction"])
    threshold = max(abs(known.net_economic_value), 1.0) * fraction
    cases.append(run_case("close_call_exactly_at_threshold", CandidateComparison(
        winner=known, runner_up=known_runner, economic_margin=threshold, scenario_win_rate=1.0,
        sensitivity_flip_ages={}, robustness_class="ROBUST", candidates=(known, known_runner),
    )))
    cases.append(run_case("close_call_just_past_threshold", CandidateComparison(
        winner=known, runner_up=known_runner, economic_margin=threshold * 1.0000001, scenario_win_rate=1.0,
        sensitivity_flip_ages={}, robustness_class="ROBUST", candidates=(known, known_runner),
    )))

    # 8. A sensitivity map where SOME entries flip and some do not, so
    #    sensitivity_flip_count is a genuine partial sum of booleans rather
    #    than all-or-nothing.
    cases.append(run_case("partial_sensitivity_flips", CandidateComparison(
        winner=known, runner_up=known_runner, economic_margin=5000.0, scenario_win_rate=1.0,
        sensitivity_flip_ages={"a": 67 * 12, "b": 68 * 12, "c": 67 * 12, "d": 70 * 12},
        robustness_class="ROBUST", candidates=(known, known_runner),
    )))

    output = {"ss_config": ss_config, "configured_scenario_names": list(CONFIGURED), "cases": cases}
    out_path = Path(__file__).resolve().parent / "ss-diagnostics-adversarial.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(cases)} cases)")
    for c in cases:
        cr = c["compact_record"]
        print(f"  {c['name']:52s} dir={cr['economic_margin_direction']:42s} flips={cr['sensitivity_flip_count']} reasons={c['trace_reasons']}")


if __name__ == "__main__":
    main()
