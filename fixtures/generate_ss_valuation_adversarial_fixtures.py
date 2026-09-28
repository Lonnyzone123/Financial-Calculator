"""
Adversarial/boundary-exact fixtures for SocialSecurityValuationEngine --
same audit-pass pattern already applied to Phases 5-8 and, in this phase, to
the optimizer's tie-breaking hierarchy and the bridge's source ranking.

Targets the specific boundaries and guards inside _evaluate_scenario() that
the original hand-picked Phase 4 fixtures exercise only incidentally:

  - The pending-DRC factor switch: payments strictly BEFORE
    factor_schedule.pending_effective_age_months are paid at the
    initial_payable factor, payments at or after it at the eventual factor.
    Tested boundary-exact by claiming mid-year after FRA and reading the
    per-month benefit either side of that exact month.
  - The tax-fraction denominator guard, max(annual_benefit_real, 1e-12),
    reached for real (not synthetically) when scheduled_benefit_fraction is
    0 -- every monthly benefit is then 0 and the division would otherwise be
    0/0.
  - safe_real_return of exactly 0 (every discount factor is exactly 1.0, so
    PV must equal the raw survival-weighted sum) and a NEGATIVE safe return
    (discount < 1, which AMPLIFIES present value rather than shrinking it --
    reachable, since scenario validation only rejects rates <= -100%).
  - A mid-year claim, whose first projection year holds fewer than 12
    monthly payments while every later year holds exactly 12 -- the annual
    grouping boundary that drives one tax calculation per year.

Run from C:\\Calculator merge:
    python fixtures/generate_ss_valuation_adversarial_fixtures.py
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
from retirement_model_v2.social_security_valuation import (  # noqa: E402
    SocialSecurityPlanningState, PlanningScenario, SocialSecurityValuationEngine,
)
from retirement_model_v2.tax_engine import TaxCalculator  # noqa: E402

config = load_config()
ss_config = config.section("social_security")
tax_calculator = TaxCalculator(config.section("tax"))
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
    return mortality_table.conditional_profile(
        birth_year=BIRTH_YEAR, sex="male",
        valuation_age_months=decision_age_months, through_age_months=through_age * 12,
    )


def scenario(**overrides):
    base = dict(name="central", real_portfolio_return=0.04, real_safe_return=0.023,
                inflation_rate=0.024, tax_income_real_growth=0.0, weight=1.0)
    base.update(overrides)
    return PlanningScenario(**base)


def sanitize(value):
    if isinstance(value, float):
        if value == float("inf"):
            return "Infinity"
        if value == float("-inf"):
            return "-Infinity"
        if value != value:
            return "NaN"
        return value
    if isinstance(value, dict):
        return {k: sanitize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize(v) for v in value]
    return value


def candidate_summary(candidate):
    """Only the fields this adversarial pass is actually asserting on --
    the full-shape comparison is already covered by the non-adversarial
    ss-valuation fixtures."""
    return {
        "claim_age_months": candidate.claim_age_months,
        "factor": candidate.factor,
        "first_year_fraction": candidate.first_year_fraction,
        "gross_benefit_pv": candidate.gross_benefit_pv,
        "after_tax_benefit_pv": candidate.after_tax_benefit_pv,
        "tax_pv": candidate.tax_pv,
        "net_economic_value": candidate.net_economic_value,
        "feasible": candidate.feasible,
        "validation_codes": list(candidate.validation_codes),
        "scenario_gross_pv": [r.gross_benefit_pv for r in candidate.scenario_results],
        "scenario_after_tax_pv": [r.after_tax_benefit_pv for r in candidate.scenario_results],
    }


def run_case(name, cfg, state, claim_age_months, scenarios):
    engine = SocialSecurityValuationEngine(cfg, calculator=tax_calculator, bridge_projector=None)
    profile = make_profile(state.decision_age_months)
    try:
        result = engine.evaluate_candidate(
            planning_state=state, claim_age_months=claim_age_months,
            mortality_profile=profile, scenarios=scenarios,
        )
        return {"name": name, "output": sanitize(candidate_summary(result))}
    except ValueError as exc:
        return {"name": name, "expect_error": str(exc)}


def main():
    cases = []
    state = make_state()
    one = (scenario(),)

    # 1. safe_real_return EXACTLY 0 -- every discount factor is (1+0)^x = 1,
    #    so gross PV must equal the raw survival-weighted benefit sum with no
    #    discounting at all. A JS port using Math.pow(1+0, x) gets 1 too, but
    #    this pins the no-discount path explicitly.
    cases.append(run_case("safe_rate_exactly_zero", ss_config, state, 67 * 12, (scenario(real_safe_return=0.0),)))

    # 2. NEGATIVE safe return -- discount factor < 1, so present value is
    #    AMPLIFIED rather than shrunk. Reachable: scenario validation only
    #    rejects rates <= -100%.
    cases.append(run_case("negative_safe_rate_amplifies_pv", ss_config, state, 67 * 12, (scenario(real_safe_return=-0.02),)))

    # 3. scheduled_benefit_fraction = 0 -- every monthly benefit is exactly
    #    0, so annual_benefit_real is 0 and the tax-fraction division hits
    #    its max(x, 1e-12) denominator guard. Without that guard this is 0/0.
    zero_benefit_cfg = dict(ss_config, scheduled_benefit_fraction=0.0)
    cases.append(run_case("zero_scheduled_benefit_fraction_hits_denominator_guard", zero_benefit_cfg, state, 67 * 12, one))

    # 4. A tiny-but-nonzero scheduled fraction, to confirm the guard isn't
    #    masking a discontinuity right next to it.
    tiny_benefit_cfg = dict(ss_config, scheduled_benefit_fraction=1e-9)
    cases.append(run_case("tiny_scheduled_benefit_fraction", tiny_benefit_cfg, state, 67 * 12, one))

    # 5. Mid-year claim AFTER FRA -- creates a pending DRC, so payments
    #    before pending_effective_age_months pay the initial_payable factor
    #    and payments at/after it pay the eventual factor. This is the
    #    boundary the per-month factor selection turns on.
    cases.append(run_case("midyear_claim_after_fra_pending_drc", ss_config, state, 68 * 12 + 5, one))

    # 6. Mid-year claim in the LAST partial DRC year (claim month 35 past
    #    FRA), where the eventual factor is already at the 36-month cap but
    #    the initial payable is not.
    cases.append(run_case("midyear_claim_at_drc_cap_boundary", ss_config, state, 67 * 12 + 35, one))

    # 7. Claim exactly at the maximum age (70) -- claim >= maximum, so
    #    claim_factor_schedule returns eventual==initial with NO pending
    #    credit even though it is a whole-year boundary.
    cases.append(run_case("claim_at_maximum_age_no_pending_drc", ss_config, state, 70 * 12, one))

    # 8. Claim exactly at the decision date (no delay at all) -- the first
    #    projection year holds all 12 months, and offset_months starts at 0
    #    so the first discount factor is exactly 1.0.
    cases.append(run_case("claim_at_decision_date_offset_zero", ss_config, state, 65 * 12, one))

    # 9. A large base income (pushes SS taxation to its 85% statutory
    #    inclusion cap and high marginal brackets) -- exercises the upper end
    #    of tax_fraction without assuming it can ever exceed 1.0.
    rich_state = make_state(base_income_nominal=TaxIncome(ordinary_income=400000.0, qualified_dividends=50000.0))
    cases.append(run_case("high_base_income_maximum_ss_taxation", ss_config, rich_state, 67 * 12, one))

    # 10. Zero base income -- SS is then almost entirely untaxed, so
    #     tax_fraction should sit at or very near 0 and after-tax PV should
    #     essentially equal gross PV.
    poor_state = make_state(base_income_nominal=TaxIncome())
    cases.append(run_case("zero_base_income_untaxed_benefit", ss_config, poor_state, 67 * 12, one))

    # 11. Three scenarios with deliberately awkward float weights (1/3 each,
    #     which cannot be represented exactly in binary floating point) --
    #     exercises the weighted aggregation's preciseSum path where naive
    #     summation could drift.
    thirds = (
        scenario(name="a", real_portfolio_return=0.03, weight=1.0 / 3.0),
        scenario(name="central", real_portfolio_return=0.04, weight=1.0 / 3.0),
        scenario(name="c", real_portfolio_return=0.05, weight=1.0 / 3.0),
    )
    cases.append(run_case("three_scenarios_inexact_thirds_weights", ss_config, state, 67 * 12, thirds))

    output = {
        "ss_config": ss_config,
        "tax_config": config.section("tax"),
        "zero_benefit_scheduled_fraction": 0.0,
        "tiny_benefit_scheduled_fraction": 1e-9,
        "cases": cases,
    }
    out_path = Path(__file__).resolve().parent / "ss-valuation-adversarial.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(cases)} cases)")


if __name__ == "__main__":
    main()
