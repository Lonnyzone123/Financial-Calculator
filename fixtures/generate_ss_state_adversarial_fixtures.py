"""
Adversarial fixtures for the Social Security state boundary and, in
particular, SocialSecurityPlanningState.fingerprint().

The fingerprint is a SHA-256 over Python's
`json.dumps(asdict(state), sort_keys=True, separators=(",", ":"))`, so the JS
port has to reproduce that JSON text byte-for-byte -- including how CPython
renders every float. The original 13 state fixtures all held ordinary
decimal values, which never exercised CPython's exponential-notation
switch points. This pass deliberately puts values on the other side of them:

  - equity_drawdown = 1e-5 and trend_15y_real = 1e-7 are entirely plausible
    real values (a tiny computed drawdown, a near-flat 15-year trend), and
    CPython renders them "1e-05" and "1e-07" where JS's own String() gives
    "0.00001" and "1e-7". Before the pyFloatRepr fix these cases produced a
    DIFFERENT fingerprint in JS than in Python.
  - A value at the upper switch point (1e16) and an integral float, so a fix
    to the small-value end cannot regress the large end or the original
    integral-float handling.
  - Negative zero, which CPython renders "-0.0" while JSON.stringify gives
    "0".

Also covers claim-age reconciliation cases the original fixtures did not:
a claim age of exactly 0, a legacy year of 0, and the empty-vs-populated
trailing-array shapes (which serialize as [] vs [..] inside the same hash).

Run from C:\\Calculator merge:
    python fixtures/generate_ss_state_adversarial_fixtures.py
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
        equity_drawdown=0.0, trailing_spending_real=(), trailing_tax_real=(),
        trailing_real_returns=(), trend_15y_real=None,
        ss_claim_age=None, ss_claim_age_months=None,
    )
    base.update(overrides)
    return KnownState(**base)


def run_case(name, known_state, portfolio=None, base_income=None, spending_real=60000.0,
             spending_floor_real=40000.0, scheduled_fra_benefit_nominal=24000.0, ss_claim_age_months=None):
    try:
        state = builder.build(
            known_state=known_state,
            portfolio=portfolio or make_portfolio(),
            base_income_nominal=base_income or TaxIncome(),
            spending_real=spending_real,
            spending_floor_real=spending_floor_real,
            scheduled_fra_benefit_nominal=scheduled_fra_benefit_nominal,
            ss_claim_age_months=ss_claim_age_months,
        )
        payload = asdict(state)
        return {
            "name": name,
            "output": payload,
            "fingerprint": state.fingerprint(),
            # The exact JSON text the fingerprint hashes, so a mismatch can be
            # diagnosed as a rendering difference rather than a hash difference.
            "canonical_json": json.dumps(payload, sort_keys=True, separators=(",", ":")),
        }
    except ValueError as exc:
        return {"name": name, "expect_error": str(exc)}


def main():
    cases = []

    # --- Floats on the far side of CPython's exponential switch points ----
    cases.append(run_case(
        "fingerprint_tiny_fractions_below_switch_point",
        make_known_state(equity_drawdown=1e-5, trend_15y_real=1e-7),
    ))
    cases.append(run_case(
        "fingerprint_very_tiny_fractions",
        make_known_state(equity_drawdown=5e-324, trend_15y_real=1e-12),
    ))
    cases.append(run_case(
        "fingerprint_large_value_above_upper_switch_point",
        make_known_state(), portfolio=make_portfolio(voo=1e16),
    ))
    cases.append(run_case(
        "fingerprint_negative_zero_drawdown",
        make_known_state(equity_drawdown=-0.0),
    ))
    cases.append(run_case(
        "fingerprint_integral_floats_keep_decimal_point",
        make_known_state(inflation_factor=2.0, reserve_months=12.0, equity_drawdown=0.0),
        spending_real=50000.0, spending_floor_real=25000.0, scheduled_fra_benefit_nominal=24000.0,
    ))

    # --- Fingerprint sensitivity: one field changed must change the hash ---
    cases.append(run_case("fingerprint_baseline_for_sensitivity", make_known_state()))
    cases.append(run_case(
        "fingerprint_one_field_changed", make_known_state(reserve_months=20.000000001),
    ))

    # --- Trailing arrays: empty vs populated serialize differently ---------
    cases.append(run_case(
        "fingerprint_populated_trailing_arrays",
        make_known_state(
            trailing_spending_real=(58000.0, 59000.5),
            trailing_tax_real=(8000.0,),
            trailing_real_returns=(0.05, -0.02, 1e-6),
        ),
    ))

    # --- Claim-age reconciliation corners not previously covered -----------
    cases.append(run_case("claim_age_months_exactly_zero", make_known_state(), ss_claim_age_months=0))
    cases.append(run_case("legacy_claim_age_exactly_zero", make_known_state(ss_claim_age=0)))
    cases.append(run_case(
        "legacy_zero_agrees_with_precise_zero", make_known_state(ss_claim_age=0), ss_claim_age_months=0,
    ))
    cases.append(run_case(
        "legacy_zero_disagrees_with_nonzero_precise", make_known_state(ss_claim_age=0), ss_claim_age_months=67 * 12,
    ))
    # floor(claim_months/12) with a claim below one year: 11 months -> year 0.
    cases.append(run_case(
        "legacy_zero_agrees_with_eleven_months", make_known_state(ss_claim_age=0), ss_claim_age_months=11,
    ))

    # --- Validation boundaries, exactly ------------------------------------
    cases.append(run_case("spending_real_exactly_zero_allowed", make_known_state(), spending_real=0.0))
    cases.append(run_case("spending_floor_exactly_zero_rejected", make_known_state(), spending_floor_real=0.0))
    cases.append(run_case("fra_benefit_exactly_zero_rejected", make_known_state(), scheduled_fra_benefit_nominal=0.0))
    cases.append(run_case("inflation_factor_tiny_but_positive", make_known_state(inflation_factor=1e-9)))

    output = {"cases": cases}
    out_path = Path(__file__).resolve().parent / "ss-state-adversarial.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(cases)} cases)")
    for c in cases:
        if "expect_error" in c:
            print(f"  {c['name']:52s} ERROR: {c['expect_error']}")
        else:
            print(f"  {c['name']:52s} fp={c['fingerprint'][:16]}...")


if __name__ == "__main__":
    main()
