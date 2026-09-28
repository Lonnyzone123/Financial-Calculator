"""
Generates fixtures/ss-state.fixtures.json by running the real Python
SocialSecurityStateBuilder (retirement_model_v2/social_security_state.py)
across a range of KnownState/Portfolio/TaxIncome inputs. The JS port in
src/ported/social-security-state.js (and the SocialSecurityPlanningState
data holder in src/ported/social-security-valuation.js) is verified against
this file (see tests/ported/social-security-state.test.js).

Run from C:\\Calculator merge:
    python fixtures/generate_ss_state_fixtures.py
"""
import json
import sys
from dataclasses import asdict
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.model_types import Account, KnownState, Portfolio, TaxIncome  # noqa: E402
from retirement_model_v2.social_security_state import SocialSecurityStateBuilder  # noqa: E402

builder = SocialSecurityStateBuilder()


def make_portfolio(voo=400000.0, schd=300000.0, tbills=100000.0, roth=200000.0):
    return Portfolio(
        voo=Account("voo", voo, voo * 0.6, True),
        schd=Account("schd", schd, schd * 0.6, True),
        tbills=Account("tbills", tbills, tbills, False),
        roth=Account("roth", roth, roth, False),
    )


def make_known_state(**overrides):
    base = dict(
        decision_year=2040, age=65, retirement_year=1, inflation_factor=1.3,
        spending_real=60000.0, portfolio_real=1000000.0, taxable_value_real=600000.0,
        roth_value_real=200000.0, reserve_real=100000.0, reserve_months=20.0,
        equity_drawdown=0.0, trailing_spending_real=(58000.0, 59000.0),
        trailing_tax_real=(8000.0, 8500.0), trailing_real_returns=(0.05, -0.02, 0.08),
        trend_15y_real=0.04, ss_claim_age=None, ss_claim_age_months=None,
    )
    base.update(overrides)
    return KnownState(**base)


def run_case(name, known_state, portfolio, base_income, spending_real, spending_floor_real,
             scheduled_fra_benefit_nominal, ss_claim_age_months):
    try:
        state = builder.build(
            known_state=known_state,
            portfolio=portfolio,
            base_income_nominal=base_income,
            spending_real=spending_real,
            spending_floor_real=spending_floor_real,
            scheduled_fra_benefit_nominal=scheduled_fra_benefit_nominal,
            ss_claim_age_months=ss_claim_age_months,
        )
        return {
            "name": name,
            "output": asdict(state),
            "fingerprint": state.fingerprint(),
            "portfolio_real_property": state.portfolio_real,
        }
    except ValueError as exc:
        return {"name": name, "expect_error": str(exc)}


def main():
    cases = []

    # 1. No claim-age info at all.
    cases.append(run_case(
        "no_claim_age", make_known_state(), make_portfolio(),
        TaxIncome(ordinary_income=20000.0, social_security=15000.0),
        60000.0, 40000.0, 24000.0, None,
    ))

    # 2. Precise claim-age-months only (no legacy field).
    cases.append(run_case(
        "precise_only", make_known_state(), make_portfolio(),
        TaxIncome(), 60000.0, 40000.0, 24000.0, 67 * 12 + 3,
    ))

    # 3. Legacy claim-age-years only (no precise field) -- converts to months.
    cases.append(run_case(
        "legacy_only", make_known_state(ss_claim_age=68), make_portfolio(),
        TaxIncome(), 60000.0, 40000.0, 24000.0, None,
    ))

    # 4. Both precise and legacy present and CONSISTENT (legacy == precise // 12).
    cases.append(run_case(
        "both_consistent", make_known_state(ss_claim_age=67), make_portfolio(),
        TaxIncome(), 60000.0, 40000.0, 24000.0, 67 * 12 + 6,
    ))

    # 5. Both precise (arg) and known_state's own ss_claim_age_months present and CONSISTENT.
    cases.append(run_case(
        "both_precise_consistent", make_known_state(ss_claim_age_months=67 * 12 + 6), make_portfolio(),
        TaxIncome(), 60000.0, 40000.0, 24000.0, 67 * 12 + 6,
    ))

    # 6. Precise candidates DISAGREE (arg vs known_state.ss_claim_age_months).
    cases.append(run_case(
        "precise_candidates_disagree", make_known_state(ss_claim_age_months=67 * 12), make_portfolio(),
        TaxIncome(), 60000.0, 40000.0, 24000.0, 68 * 12,
    ))

    # 7. Legacy and precise DISAGREE (legacy_year != claim_months // 12).
    cases.append(run_case(
        "legacy_precise_disagree", make_known_state(ss_claim_age=65), make_portfolio(),
        TaxIncome(), 60000.0, 40000.0, 24000.0, 67 * 12,
    ))

    # 8. Boundary: legacy year == floor(claim_months/12) exactly at a
    #    non-zero remainder (e.g. claim_months=67*12+11 -> floor=67).
    cases.append(run_case(
        "legacy_precise_boundary_consistent", make_known_state(ss_claim_age=67), make_portfolio(),
        TaxIncome(), 60000.0, 40000.0, 24000.0, 67 * 12 + 11,
    ))

    # Error cases: invalid inflation factor, spending, floor, FRA benefit.
    cases.append(run_case(
        "error_zero_inflation_factor", make_known_state(inflation_factor=0.0), make_portfolio(),
        TaxIncome(), 60000.0, 40000.0, 24000.0, None,
    ))
    cases.append(run_case(
        "error_negative_spending", make_known_state(), make_portfolio(),
        TaxIncome(), -1.0, 40000.0, 24000.0, None,
    ))
    cases.append(run_case(
        "error_zero_floor", make_known_state(), make_portfolio(),
        TaxIncome(), 60000.0, 0.0, 24000.0, None,
    ))
    cases.append(run_case(
        "error_negative_fra_benefit", make_known_state(), make_portfolio(),
        TaxIncome(), 60000.0, 40000.0, -1.0, None,
    ))

    # A case with a nonzero base_income_nominal (exercises full income copy).
    cases.append(run_case(
        "full_income_copy", make_known_state(), make_portfolio(voo=123456.78, schd=987.65, tbills=5000.0, roth=25000.0),
        TaxIncome(ordinary_income=45000.0, qualified_dividends=2000.0, nonqualified_dividends=500.0,
                  long_term_gains=3000.0, treasury_interest=100.0, social_security=18000.0,
                  capital_loss_carryforward=0.0),
        55000.0, 42000.0, 30000.0, 68 * 12 + 4,
    ))

    output = {"cases": cases}
    out_path = Path(__file__).resolve().parent / "ss-state.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(cases)} cases)")


if __name__ == "__main__":
    main()
