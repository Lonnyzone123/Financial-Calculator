"""
Generates fixtures/ss-bridge.fixtures.json by running the real Python
PortfolioBridgeProjector (retirement_model_v2/social_security_bridge.py)
across a range of claim delays, portfolio shapes, and scenarios. The JS port
in src/ported/social-security-bridge.js is verified against this file (see
tests/ported/social-security-bridge.test.js).

Run from C:\\Calculator merge:
    python fixtures/generate_ss_bridge_fixtures.py
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
from retirement_model_v2.social_security_valuation import SocialSecurityPlanningState, PlanningScenario  # noqa: E402
from retirement_model_v2.social_security_bridge import PortfolioBridgeProjector  # noqa: E402
from retirement_model_v2.tax_engine import TaxCalculator  # noqa: E402

config = load_config()
ss_config = config.section("social_security")
optimizer_config = config.section("optimizer")
reserve_config = config.section("reserve")
tax_calculator = TaxCalculator(config.section("tax"))

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


mortality_table = MortalityTable(build_compact_policy(1960), alternative="II")


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


def make_scenario(**overrides):
    base = dict(name="base", real_portfolio_return=0.04, real_safe_return=0.01, inflation_rate=0.025, tax_income_real_growth=0.0, weight=1.0)
    base.update(overrides)
    return PlanningScenario(**base)


def make_profile(decision_age_months, through_age=120):
    return mortality_table.conditional_profile(birth_year=1960, sex="male", valuation_age_months=decision_age_months, through_age_months=through_age * 12)


def sanitize_infinities(value):
    """Python's json module writes bare Infinity/-Infinity/NaN tokens by
    default, which are not valid JSON and choke JSON.parse in JS. Replace
    them with a JSON-safe sentinel string the JS test recognizes. (Same
    pattern as generate_lifetime_tax_optimizer_fixtures.py, needed here
    because an infeasible bridge reports opportunity_cost_pv/
    terminal_asset_difference as math.inf, same as that module's infeasible
    objective.)"""
    if isinstance(value, float):
        if value == float("inf"):
            return "Infinity"
        if value == float("-inf"):
            return "-Infinity"
        if value != value:  # NaN
            return "NaN"
        return value
    if isinstance(value, dict):
        return {k: sanitize_infinities(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_infinities(v) for v in value]
    return value


def projection_to_dict(proj):
    return sanitize_infinities(asdict(proj))


def run_case(name, state, claim_age_months, scenario, with_calculator=True):
    projector = PortfolioBridgeProjector(
        ss_config=ss_config, optimizer_config=optimizer_config, reserve_config=reserve_config,
        calculator=tax_calculator if with_calculator else None,
    )
    profile = make_profile(state.decision_age_months)
    result = projector.project(
        planning_state=state, claim_age_months=claim_age_months, mortality_profile=profile, scenario=scenario,
    )
    return {"name": name, "output": projection_to_dict(result)}


def main():
    cases = []

    # 1. No delay at all (claim_age_months <= current) -- the early-return path.
    cases.append(run_case("no_delay", make_state(), 65 * 12, make_scenario()))
    cases.append(run_case("no_delay_earlier_claim", make_state(), 64 * 12, make_scenario()))

    # 2. A modest 1-year delay, ample portfolio, normal scenario.
    cases.append(run_case("one_year_delay_ample_portfolio", make_state(), 66 * 12, make_scenario()))

    # 3. A longer delay to age 70 (5 years), exercising multiple annual passes.
    cases.append(run_case("five_year_delay_to_70", make_state(), 70 * 12, make_scenario()))

    # 4. A mid-year (non-January) claim target, so the final partial-year
    #    chunk is less than 12 months.
    cases.append(run_case("delay_to_midyear_claim", make_state(), 66 * 12 + 7, make_scenario()))

    # 5. A thin portfolio that cannot fund the bridge -- INFEASIBLE path.
    cases.append(run_case(
        "infeasible_thin_portfolio",
        make_state(voo_real=1000.0, voo_basis_real=600.0, schd_real=0.0, schd_basis_real=0.0, tbills_real=500.0, roth_real=0.0),
        70 * 12, make_scenario(),
    ))

    # 6. Sequence-of-returns penalty path: retirement_year<=12 and
    #    equity_drawdown>0, exercising the extra cost added to voo/schd.
    cases.append(run_case(
        "sequence_drawdown_penalty",
        make_state(retirement_year=2, equity_drawdown=0.15),
        68 * 12, make_scenario(),
    ))

    # 7. No tax calculator (calculator=None) -- incremental tax terms are 0.
    cases.append(run_case("no_tax_calculator", make_state(), 67 * 12, make_scenario(), with_calculator=False))

    # 8. Adverse (negative) portfolio return scenario, still delaying 3 years.
    cases.append(run_case("adverse_scenario_return", make_state(), 68 * 12, make_scenario(real_portfolio_return=-0.03, real_safe_return=-0.005)))

    # 9. Roth-heavy portfolio (exercises roth_shadow_cost in ranking).
    cases.append(run_case(
        "roth_heavy_portfolio",
        make_state(voo_real=50000.0, voo_basis_real=30000.0, schd_real=20000.0, schd_basis_real=12000.0, tbills_real=20000.0, roth_real=500000.0),
        69 * 12, make_scenario(),
    ))

    output = {
        "ss_config": ss_config, "optimizer_config": optimizer_config, "reserve_config": reserve_config,
        "tax_config": config.section("tax"), "cases": cases,
    }
    out_path = Path(__file__).resolve().parent / "ss-bridge.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(cases)} cases)")


if __name__ == "__main__":
    main()
