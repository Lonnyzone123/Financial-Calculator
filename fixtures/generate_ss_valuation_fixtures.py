"""
Generates fixtures/ss-valuation.fixtures.json by running the real Python
SocialSecurityValuationEngine (retirement_model_v2/social_security_valuation.py)
end-to-end -- wired to the real TaxCalculator and PortfolioBridgeProjector,
same as production. The JS port in src/ported/social-security-valuation.js
(createValuationEngine) is verified against this file (see
tests/ported/social-security-valuation.test.js).

Run from C:\\Calculator merge:
    python fixtures/generate_ss_valuation_fixtures.py
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
from retirement_model_v2.social_security_valuation import SocialSecurityPlanningState, PlanningScenario, SocialSecurityValuationEngine  # noqa: E402
from retirement_model_v2.social_security_bridge import PortfolioBridgeProjector  # noqa: E402
from retirement_model_v2.tax_engine import TaxCalculator  # noqa: E402

config = load_config()
ss_config = config.section("social_security")
optimizer_config = config.section("optimizer")
reserve_config = config.section("reserve")
tax_calculator = TaxCalculator(config.section("tax"))
bridge_projector = PortfolioBridgeProjector(
    ss_config=ss_config, optimizer_config=optimizer_config, reserve_config=reserve_config, calculator=tax_calculator,
)
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


def make_state(**overrides):
    base = dict(
        decision_year=2025, decision_age_months=65 * 12, retirement_year=1, inflation_factor=1.2,
        spending_real=60000.0, spending_floor_real=40000.0,
        voo_real=400000.0, voo_basis_real=240000.0, schd_real=200000.0, schd_basis_real=120000.0,
        tbills_real=150000.0, roth_real=100000.0, reserve_months=12.0, equity_drawdown=0.0,
        base_income_nominal=TaxIncome(ordinary_income=30000.0),
        trailing_spending_real=(), trailing_tax_real=(), trailing_real_returns=(),
        trend_15y_real=None, ss_claim_age_months=None, fra_monthly_benefit_real=1250.0,
    )
    base.update(overrides)
    return SocialSecurityPlanningState(**base)


def make_profile(decision_age_months, through_age=120):
    return mortality_table.conditional_profile(birth_year=BIRTH_YEAR, sex="male", valuation_age_months=decision_age_months, through_age_months=through_age * 12)


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
    if isinstance(value, list):
        return [sanitize_infinities(v) for v in value]
    if isinstance(value, tuple):
        return [sanitize_infinities(v) for v in value]
    return value


def candidate_to_dict(candidate):
    return sanitize_infinities(asdict(candidate))


def run_case(name, state, claim_age_months, engine=None, scenarios=None):
    eng = engine or SocialSecurityValuationEngine(ss_config, calculator=tax_calculator, bridge_projector=bridge_projector)
    profile = make_profile(state.decision_age_months)
    try:
        result = eng.evaluate_candidate(
            planning_state=state, claim_age_months=claim_age_months, mortality_profile=profile, scenarios=scenarios,
        )
        return {"name": name, "output": candidate_to_dict(result)}
    except ValueError as exc:
        return {"name": name, "expect_error": str(exc)}


def main():
    cases = []
    state = make_state()

    # 1. Default scenarios (the 3 configured lower/central/higher_return
    #    weighted scenarios), claiming exactly at the decision date.
    cases.append(run_case("claim_now_default_scenarios", state, 65 * 12))

    # 2. Default scenarios, delayed claim to FRA (67).
    cases.append(run_case("claim_at_fra_default_scenarios", state, 67 * 12))

    # 3. Default scenarios, delayed claim to the maximum age (70).
    cases.append(run_case("claim_at_70_default_scenarios", state, 70 * 12))

    # 4. A single custom scenario (weight=1.0) instead of the default set --
    #    exercises the scenarios= override path.
    custom_scenario = PlanningScenario(name="custom", real_portfolio_return=0.045, real_safe_return=0.02, inflation_rate=0.025, tax_income_real_growth=0.01, weight=1.0)
    cases.append(run_case("claim_at_68_custom_single_scenario", state, 68 * 12, scenarios=(custom_scenario,)))

    # 5. Two custom scenarios with unequal weights not summing to 1 (exercises
    #    the internal weight-normalization path, distinct from scenarios()'s
    #    own strict sum-to-1 validation which only applies to the default set).
    two_scenarios = (
        PlanningScenario(name="a", real_portfolio_return=0.03, real_safe_return=0.01, inflation_rate=0.02, tax_income_real_growth=0.0, weight=2.0),
        PlanningScenario(name="b", real_portfolio_return=0.05, real_safe_return=0.015, inflation_rate=0.03, tax_income_real_growth=0.0, weight=3.0),
    )
    cases.append(run_case("claim_at_66_two_unequal_weight_scenarios", state, 66 * 12, scenarios=two_scenarios))

    # 6. No bridge projector at all (engine constructed with bridge_projector=None).
    engine_no_bridge = SocialSecurityValuationEngine(ss_config, calculator=tax_calculator, bridge_projector=None)
    cases.append(run_case("claim_at_69_no_bridge_projector", state, 69 * 12, engine=engine_no_bridge))

    # 7. No tax calculator at all.
    engine_no_tax = SocialSecurityValuationEngine(ss_config, calculator=None, bridge_projector=bridge_projector)
    cases.append(run_case("claim_at_67_no_tax_calculator", state, 67 * 12, engine=engine_no_tax))

    # Error cases.
    cases.append(run_case("error_claim_before_eligibility", state, 60 * 12))
    cases.append(run_case("error_claim_before_decision_date", state, 64 * 12))
    cases.append(run_case("error_claim_exceeds_maximum", state, 71 * 12))
    misaligned_profile_state = make_state(decision_age_months=66 * 12)
    cases.append({
        "name": "error_misaligned_mortality_profile",
        "expect_error_direct": True,
    })
    cases.append(run_case("error_empty_scenarios", state, 67 * 12, scenarios=()))
    zero_weight_scenarios = (PlanningScenario(name="z", real_portfolio_return=0.03, real_safe_return=0.01, inflation_rate=0.02, tax_income_real_growth=0.0, weight=0.0),)
    cases.append(run_case("error_zero_weight_scenario", state, 67 * 12, scenarios=zero_weight_scenarios))
    duplicate_name_scenarios = (
        PlanningScenario(name="dup", real_portfolio_return=0.03, real_safe_return=0.01, inflation_rate=0.02, tax_income_real_growth=0.0, weight=1.0),
        PlanningScenario(name="dup", real_portfolio_return=0.05, real_safe_return=0.02, inflation_rate=0.02, tax_income_real_growth=0.0, weight=1.0),
    )
    cases.append(run_case("error_duplicate_scenario_names", state, 67 * 12, scenarios=duplicate_name_scenarios))
    bad_rate_scenarios = (PlanningScenario(name="bad", real_portfolio_return=-1.5, real_safe_return=0.01, inflation_rate=0.02, tax_income_real_growth=0.0, weight=1.0),)
    cases.append(run_case("error_scenario_rate_below_negative_one", state, 67 * 12, scenarios=bad_rate_scenarios))

    # Handle the misaligned-mortality-profile case directly (needs its own profile).
    eng = SocialSecurityValuationEngine(ss_config, calculator=tax_calculator, bridge_projector=bridge_projector)
    misaligned_profile = make_profile(65 * 12)  # profile valuation age (65y) != state's decision age (66y)
    try:
        eng.evaluate_candidate(planning_state=misaligned_profile_state, claim_age_months=67 * 12, mortality_profile=misaligned_profile, scenarios=None)
        raise SystemExit("expected misaligned-profile error")
    except ValueError as exc:
        for c in cases:
            if c["name"] == "error_misaligned_mortality_profile":
                c["expect_error"] = str(exc)
                del c["expect_error_direct"]

    # scenarios() itself.
    default_scenarios = [asdict(s) for s in eng.scenarios()]

    output = {
        "ss_config": ss_config, "optimizer_config": optimizer_config, "reserve_config": reserve_config,
        "tax_config": config.section("tax"), "default_scenarios": default_scenarios, "cases": cases,
    }
    out_path = Path(__file__).resolve().parent / "ss-valuation.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(cases)} cases)")


if __name__ == "__main__":
    main()
