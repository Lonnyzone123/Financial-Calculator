"""
Generates fixtures/ss-diagnostics.fixtures.json by running the real Python
SocialSecurityDiagnosticBuilder (retirement_model_v2/social_security_diagnostics.py)
against real CandidateValuation objects from social_security_valuation.py's
SocialSecurityValuationEngine, hand-assembled into a CandidateComparison
(whose actual construction lives in social_security_optimizer.py -- module 9,
not yet ported; diagnostics.py itself is agnostic to how the comparison was
built, only to its shape). The JS port in
src/ported/social-security-diagnostics.js is verified against this file (see
tests/ported/social-security-diagnostics.test.js).

Run from C:\\Calculator merge:
    python fixtures/generate_ss_diagnostics_fixtures.py
"""
import json
import sys
from dataclasses import asdict
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.config import load_config  # noqa: E402
from retirement_model_v2.model_types import TaxIncome  # noqa: E402
from retirement_model_v2.mortality_data import TrusteesMortalityData  # noqa: E402
from retirement_model_v2.social_security_mortality import MortalityTable  # noqa: E402
from retirement_model_v2.social_security_valuation import SocialSecurityPlanningState, SocialSecurityValuationEngine  # noqa: E402
from retirement_model_v2.social_security_bridge import PortfolioBridgeProjector  # noqa: E402
from retirement_model_v2.social_security_optimizer import CandidateComparison  # noqa: E402
from retirement_model_v2.social_security_diagnostics import SocialSecurityDiagnosticBuilder  # noqa: E402
from retirement_model_v2.tax_engine import TaxCalculator  # noqa: E402

config = load_config()
ss_config = config.section("social_security")
optimizer_config = config.section("optimizer")
reserve_config = config.section("reserve")
tax_calculator = TaxCalculator(config.section("tax"))
bridge_projector = PortfolioBridgeProjector(ss_config=ss_config, optimizer_config=optimizer_config, reserve_config=reserve_config, calculator=tax_calculator)
engine = SocialSecurityValuationEngine(ss_config, calculator=tax_calculator, bridge_projector=bridge_projector)
builder = SocialSecurityDiagnosticBuilder(ss_config)
BIRTH_YEAR = int(ss_config["birth_year"])
SOURCE_DIR = SNAPSHOT / "source_files" / "ssa_2026_mortality"


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


mortality_table = MortalityTable(build_compact_policy(BIRTH_YEAR), alternative=ss_config["mortality_central_alternative"])

state = SocialSecurityPlanningState(
    decision_year=2025, decision_age_months=65 * 12, retirement_year=1, inflation_factor=1.2,
    spending_real=60000.0, spending_floor_real=40000.0,
    voo_real=400000.0, voo_basis_real=240000.0, schd_real=200000.0, schd_basis_real=120000.0,
    tbills_real=150000.0, roth_real=100000.0, reserve_months=12.0, equity_drawdown=0.0,
    base_income_nominal=TaxIncome(ordinary_income=30000.0),
    fra_monthly_benefit_real=1250.0,
)
profile = mortality_table.conditional_profile(birth_year=BIRTH_YEAR, sex="male", valuation_age_months=65 * 12, through_age_months=120 * 12)

candidate_65 = engine.evaluate_candidate(planning_state=state, claim_age_months=65 * 12, mortality_profile=profile)
candidate_67 = engine.evaluate_candidate(planning_state=state, claim_age_months=67 * 12, mortality_profile=profile)
candidate_70 = engine.evaluate_candidate(planning_state=state, claim_age_months=70 * 12, mortality_profile=profile)


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


def run_diagnostics_case(name, comparison, action):
    compact = builder.compact_record(planning_state=state, comparison=comparison, action=action)
    detailed = builder.detailed_candidates(comparison)
    reasons = builder.trace_reasons(comparison)
    return {
        "name": name,
        "compact_record": sanitize_infinities(compact),
        "detailed_candidates": sanitize_infinities(detailed),
        "trace_reasons": list(reasons),
    }


def main():
    cases = []

    # 1. Clear winner (70), meaningful runner-up (67), positive economic
    #    margin, ROBUST classification, no sensitivity flips.
    comparison1 = CandidateComparison(
        winner=candidate_70, runner_up=candidate_67,
        economic_margin=candidate_70.net_economic_value - candidate_67.net_economic_value,
        scenario_win_rate=1.0, sensitivity_flip_ages={"lower_return": 70 * 12, "higher_return": 70 * 12},
        robustness_class="ROBUST", candidates=(candidate_65, candidate_67, candidate_70),
    )
    cases.append(run_diagnostics_case("clear_winner_robust", comparison1, "CLAIM_LATER"))

    # 2. No runner-up at all (single-candidate comparison).
    comparison2 = CandidateComparison(
        winner=candidate_67, runner_up=None, economic_margin=0.0, scenario_win_rate=1.0,
        sensitivity_flip_ages={}, robustness_class="ROBUST", candidates=(candidate_67,),
    )
    cases.append(run_diagnostics_case("no_runner_up", comparison2, "WAIT"))

    # 3. Sensitivity flip present (one scenario's own winner differs from the
    #    overall winner) -- exercises SENSITIVITY_FLIP reason and flipped=True.
    comparison3 = CandidateComparison(
        winner=candidate_67, runner_up=candidate_65,
        economic_margin=candidate_67.net_economic_value - candidate_65.net_economic_value,
        scenario_win_rate=0.5, sensitivity_flip_ages={"lower_return": 65 * 12, "higher_return": 70 * 12},
        robustness_class="SENSITIVE", candidates=(candidate_65, candidate_67, candidate_70),
    )
    cases.append(run_diagnostics_case("sensitivity_flip_present", comparison3, "CLAIM_NOW"))

    # 4. Negative economic margin (winner scored lower but wins on a
    #    higher-priority tiebreak) -- exercises the
    #    winner_lower_for_higher_priority_tiebreak direction label.
    comparison4 = CandidateComparison(
        winner=candidate_65, runner_up=candidate_67, economic_margin=-500.0,
        scenario_win_rate=0.6, sensitivity_flip_ages={"lower_return": 65 * 12},
        robustness_class="FRAGILE", candidates=(candidate_65, candidate_67),
    )
    cases.append(run_diagnostics_case("negative_margin_tiebreak", comparison4, "CLAIM_NOW"))

    # 5. Exact tie (economic_margin == 0, within the 1e-9 "tied" band).
    comparison5 = CandidateComparison(
        winner=candidate_67, runner_up=candidate_70, economic_margin=0.0,
        scenario_win_rate=1.0, sensitivity_flip_ages={}, robustness_class="ROBUST",
        candidates=(candidate_67, candidate_70),
    )
    cases.append(run_diagnostics_case("exact_tie", comparison5, "WAIT"))

    # 6. An INVALID candidate present in the set (feasible=False forced by
    #    hand-editing a copy) -- exercises INVALID_CANDIDATE reason and the
    #    invalid_candidate_count field.
    from dataclasses import replace
    invalid_candidate = replace(candidate_65, feasible=False, validation_codes=("SS_BRIDGE_INFEASIBLE",))
    comparison6 = CandidateComparison(
        winner=candidate_70, runner_up=candidate_67, economic_margin=1000.0,
        scenario_win_rate=1.0, sensitivity_flip_ages={}, robustness_class="ROBUST",
        candidates=(invalid_candidate, candidate_67, candidate_70),
    )
    cases.append(run_diagnostics_case("invalid_candidate_present", comparison6, "CLAIM_LATER"))

    output = {"economic_close_call_fraction": ss_config["economic_close_call_fraction"], "cases": cases}
    out_path = Path(__file__).resolve().parent / "ss-diagnostics.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(cases)} cases)")


if __name__ == "__main__":
    main()
