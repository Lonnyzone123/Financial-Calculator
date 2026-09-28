"""
Generates fixtures/ss-optimizer.fixtures.json by running the real Python
SocialSecurityOptimizer (retirement_model_v2/social_security_optimizer.py)
end-to-end -- wired to the real TaxCalculator, PortfolioBridgeProjector, and
compact mortality data from the repository's own mortality_policy() cache
(the same shape production code uses). The JS port in
src/ported/social-security-optimizer.js is verified against this file (see
tests/ported/social-security-optimizer.test.js).

Only the CURRENT (V2.1.2) decide() path is exercised -- the legacy
state-only path and _approximate_planning_state() are out of this port's
scope (see social-security-optimizer.js's header comment for why).

Each decide() call takes ~1-2 seconds in Python (evaluating ~96 monthly
candidates, several times over for sensitivity stress-testing), so this
generator deliberately keeps the case count modest while still covering
every action branch (ALREADY_CLAIMED, NOT_ELIGIBLE, CLAIM, SCHEDULE, WAIT,
FORCED_CLAIM).

Run from C:\\Calculator merge:
    python fixtures/generate_ss_optimizer_fixtures.py
"""
import json
import sys
import time
from dataclasses import asdict
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.config import load_config  # noqa: E402
from retirement_model_v2.model_types import TaxIncome  # noqa: E402
from retirement_model_v2.mortality_data import TrusteesMortalityData  # noqa: E402
from retirement_model_v2.social_security_valuation import SocialSecurityPlanningState  # noqa: E402
from retirement_model_v2.social_security_optimizer import SocialSecurityOptimizer  # noqa: E402
from retirement_model_v2.tax_engine import TaxCalculator  # noqa: E402

config = load_config()
ss_config = config.section("social_security")
optimizer_config = config.section("optimizer")
reserve_config = config.section("reserve")
tax_calculator = TaxCalculator(config.section("tax"))
BIRTH_YEAR = int(ss_config["birth_year"])
SOURCE_DIR = SNAPSHOT / "source_files" / "ssa_2026_mortality"


def build_compact_mortality_data(birth_year, sex="male"):
    """Same shape as ProjectionDataRepository.mortality_policy() (the real
    production path), built directly from the validated CSV loader so this
    fixture generator has no dependency on the data cache file's own
    birth-year configuration."""
    source = TrusteesMortalityData(SOURCE_DIR)
    alternatives = {}
    for alternative in source.alternatives():
        series = source.load(alternative=alternative, birth_year=birth_year, sex=sex)
        metadata = source.source_metadata(alternative)
        alternatives[alternative] = {
            "source_sha256": series.source_sha256,
            "source_real_interest_rate": metadata["source_real_interest_rate"],
            "q_x": [p.death_probability for p in series.points],
        }
    return {
        "dataset_id": source.manifest["dataset_id"], "dataset_version": source.manifest["dataset_version"],
        "birth_year": birth_year, "sex": sex,
        "age_start": int(source.manifest["population"]["age_start"]), "age_end": int(source.manifest["population"]["age_end"]),
        "monthly_interpolation": "constant_force_within_attained_age", "alternatives": alternatives,
    }


mortality_data = build_compact_mortality_data(BIRTH_YEAR)


def make_optimizer():
    return SocialSecurityOptimizer(
        ss_config, calculator=tax_calculator, mortality_data=mortality_data,
        optimizer_config=optimizer_config, reserve_config=reserve_config,
    )


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


def decision_to_dict(decision):
    payload = {
        "eligible": decision.eligible,
        "claim_now": decision.claim_now,
        "selected_claim_age": decision.selected_claim_age,
        "annual_benefit_real_if_claimed": decision.annual_benefit_real_if_claimed,
        "reason": decision.reason,
        "action": decision.action,
        "selected_claim_age_months": decision.selected_claim_age_months,
        "selected_claim_month": decision.selected_claim_month,
        "first_year_benefit_fraction": decision.first_year_benefit_fraction,
        "candidate_count": len(decision.candidates),
    }
    if decision.comparison is not None:
        c = decision.comparison
        payload["comparison"] = {
            "winner_claim_age_months": c.winner.claim_age_months,
            "runner_up_claim_age_months": c.runner_up.claim_age_months if c.runner_up else None,
            "economic_margin": c.economic_margin,
            "scenario_win_rate": c.scenario_win_rate,
            "robustness_class": c.robustness_class,
            "sensitivity_flip_ages": dict(c.sensitivity_flip_ages),
            "candidate_count": len(c.candidates),
        }
    else:
        payload["comparison"] = None
    payload["diagnostic_summary"] = sanitize_infinities(decision.diagnostic_summary)
    return payload


def run_case(name, state, optimizer=None):
    opt = optimizer or make_optimizer()
    t0 = time.time()
    decision = opt.decide(planning_state=state)
    elapsed = time.time() - t0
    print(f"  {name}: {elapsed:.2f}s -> action={decision.action}")
    return {"name": name, "output": decision_to_dict(decision)}


def main():
    cases = []

    print("Generating optimizer fixture cases (each takes 1-2s)...")

    # 1. Standard mid-planning state -- ample portfolio, no prior claim.
    cases.append(run_case("standard_wait_or_claim", make_state()))

    # 2. Already claimed -- ALREADY_CLAIMED path, no candidate evaluation at all.
    cases.append(run_case("already_claimed", make_state(ss_claim_age_months=66 * 12 + 3)))

    # 3. Below minimum eligibility age -- NOT_ELIGIBLE path.
    cases.append(run_case("not_eligible_too_young", make_state(decision_age_months=60 * 12)))

    # 4. At the maximum claiming age -- FORCED_CLAIM path.
    cases.append(run_case("forced_claim_at_maximum", make_state(decision_age_months=70 * 12)))

    # 5. A thin/fragile portfolio (small balances, near depletion risk) --
    #    exercises the floor-depletion-avoidance tier of _select_candidate
    #    and likely a different robustness/action outcome than the standard case.
    cases.append(run_case(
        "thin_portfolio_depletion_risk",
        make_state(voo_real=30000.0, voo_basis_real=18000.0, schd_real=0.0, schd_basis_real=0.0, tbills_real=20000.0, roth_real=10000.0, spending_floor_real=45000.0),
    ))

    # 6. Exactly one month before the maximum age -- SCHEDULE path is likely
    #    (selected < current+12 but selected != current), distinct from WAIT.
    cases.append(run_case("near_maximum_age_schedule_or_forced", make_state(decision_age_months=69 * 12 + 11)))

    # Standalone helper checks (benefit_real_for_months / annual_benefit_real).
    opt = make_optimizer()
    standalone = {
        "benefit_real_for_months_fra_exact": opt.benefit_real_for_months(67 * 12),
        "benefit_real_for_months_custom_fra_monthly": opt.benefit_real_for_months(68 * 12 + 4, fra_monthly_real=1500.0),
        "annual_benefit_real_age_62": opt.annual_benefit_real(62),
        "annual_benefit_real_age_70": opt.annual_benefit_real(70),
    }

    # Candidate-set caching check: same planning state + same default
    # scenarios + same alternative must return the SAME (cached) object on a
    # second call (in Python, `is` identity; in JS, deep-equal is what we can
    # actually verify across a language boundary anyway, so this fixture just
    # records the value twice to confirm determinism, not object identity).
    cache_state = make_state()
    opt2 = make_optimizer()
    first = opt2._evaluate_candidate_set(planning_state=cache_state, mortality_alternative="II")
    second = opt2._evaluate_candidate_set(planning_state=cache_state, mortality_alternative="II")
    cache_case = {
        "first_count": len(first), "second_count": len(second),
        "first_net_values": [c.net_economic_value for c in first[:5]],
        "second_net_values": [c.net_economic_value for c in second[:5]],
    }

    output = {
        "ss_config": ss_config, "optimizer_config": optimizer_config, "reserve_config": reserve_config,
        "tax_config": config.section("tax"), "cases": cases, "standalone": standalone, "cache_case": cache_case,
    }
    out_path = Path(__file__).resolve().parent / "ss-optimizer.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(cases)} decide() cases)")


if __name__ == "__main__":
    main()
