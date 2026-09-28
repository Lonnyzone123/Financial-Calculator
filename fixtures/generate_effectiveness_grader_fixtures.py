"""
Generates fixtures/effectiveness-grader.fixtures.json by running a range of
hand-built AnnualResult sequences through the real (Phase-1-fixed) Python
EffectivenessGrader. No randomness anywhere in this module.

AnnualResult is engine-internal (Social Security claim tracking, SCHD regime
tracking, reserve target tracking -- fields the calculator's own engine does
not currently produce), so these fixtures build synthetic row sequences by
hand rather than running a full historical simulation. See
MERGE_AUDIT_AND_PLAN.md's Phase 8 section for why this module is ported
as-is against the Python engine's own row shape, with the adapter to the
calculator's different row shape deferred to Phase 9 like the other ports.

Run from C:\\Calculator merge:
    python fixtures/generate_effectiveness_grader_fixtures.py
"""
import json
import sys
from dataclasses import asdict
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.config import load_config  # noqa: E402
from retirement_model_v2.effectiveness_grader import EffectivenessGrader  # noqa: E402
from retirement_model_v2.simulation_engine import AnnualResult  # noqa: E402

config = load_config()
grading_cfg = config.section("grading")
spending_cfg = config.section("spending")
reserve_cfg = config.section("reserve")
portfolio_cfg = config.section("portfolio")
grader = EffectivenessGrader(grading_cfg, spending_cfg, reserve_cfg, portfolio_cfg)


def make_row(**overrides):
    base = dict(
        year=2040, age=65, retirement_year=1, inflation_factor=1.3,
        spending_real=70000.0, spending_nominal=91000.0, spending_mode="stable",
        spending_eligible_ceiling_real=75000.0, spending_prosperity_score=0.4,
        spending_marginal_tax_friction=0.0, spending_raise_rate_limit=0.0,
        social_security_claim_age=67, social_security_claim_age_months=804,
        social_security_target_age_months=804, social_security_decision_action="claim",
        social_security_first_year_fraction=1.0, social_security_initial_payable_factor=1.0,
        social_security_eventual_factor=1.0, social_security_pending_drc_effective_age_months=None,
        social_security_robustness="ROBUST", social_security_decision_valid=True,
        social_security_validation_codes=(),
        social_security_nominal=36000.0, tax_nominal=8000.0, tax_real=6200.0,
        withdrawals={"from_tbills": 20000.0, "from_voo": 0.0, "from_roth": 0.0, "from_schd": 0.0, "feasible": True},
        reserve_target_real=240000.0, reserve_draw_real=0.0, reserve_refill_real=0.0,
        equity_drawdown=0.0, schd_regime="actual_schd", schd_source_quality="observed_fund_total_return",
        schd_cash_yield=0.03, schd_governing_cash_yield=0.03,
        ending_real_balances={"voo": 400000.0, "schd": 300000.0, "tbills": 220000.0, "roth": 200000.0},
        ending_real_total=1120000.0, cash_ledger={},
    )
    base.update(overrides)
    return AnnualResult(**base)


def sequence(rows, retirement_year_start=1):
    """Convenience: apply a shared retirement_year progression unless overridden."""
    out = []
    for i, row_overrides in enumerate(rows):
        merged = dict(retirement_year=retirement_year_start + i, year=2040 + i, age=65 + i)
        merged.update(row_overrides)
        out.append(make_row(**merged))
    return out


CASES = []

# 1. Clean successful run: 15 years, no failures, no floor violations, full reserve.
CASES.append({
    "name": "clean_successful_run",
    "annual": sequence([{} for _ in range(15)]),
    "initial_real_total": 1000000.0,
})

# 2. Portfolio failure partway through.
rows = sequence([{} for _ in range(15)])
rows_dicts = [asdict(r) for r in rows]
# Rebuild with a failure at index 8 (year 2048): ending_real_total <= 0 and infeasible.
failed_rows = []
for i, d in enumerate(rows_dicts):
    if i == 8:
        d["ending_real_total"] = 0.0
        d["withdrawals"] = dict(d["withdrawals"], feasible=False)
    failed_rows.append(AnnualResult(**d))
CASES.append({"name": "portfolio_failure_year_8", "annual": failed_rows, "initial_real_total": 1000000.0})

# 3. Floor violations in several years.
rows = sequence([{"spending_real": 50000.0} if i in (3, 4, 5) else {} for i in range(15)])
CASES.append({"name": "floor_violations_years_3_4_5", "annual": rows, "initial_real_total": 1000000.0})

# 4. Low ending reserve.
rows = sequence([{} for _ in range(15)])
rows_dicts = [asdict(r) for r in rows]
rows_dicts[-1]["ending_real_balances"] = dict(rows_dicts[-1]["ending_real_balances"], tbills=1000.0)
rows_fixed = [AnnualResult(**d) for d in rows_dicts]
CASES.append({"name": "low_ending_reserve", "annual": rows_fixed, "initial_real_total": 1000000.0})

# 5. SCHD principal sold in multiple years (allowed_schd_years=0 in config, so any sale counts).
rows = sequence([{"withdrawals": {"from_tbills": 10000.0, "from_voo": 0.0, "from_roth": 0.0, "from_schd": 5000.0, "feasible": True}} if i in (2, 5, 9) else {} for i in range(15)])
CASES.append({"name": "schd_principal_sold_three_years", "annual": rows, "initial_real_total": 1000000.0})

# 6. Pre-Roth-access-age withdrawals (invalid flag: ROTH_BEFORE_ACCESS_AGE).
rows = sequence([{"age": 55 + i, "withdrawals": {"from_tbills": 0.0, "from_voo": 0.0, "from_roth": 8000.0, "from_schd": 0.0, "feasible": True}} for i in range(10)], retirement_year_start=1)
CASES.append({"name": "pre_roth_access_age_withdrawal", "annual": rows, "initial_real_total": 1000000.0})

# 7. Social Security sensitivity/fragile flags.
rows = sequence([
    {"social_security_robustness": "SENSITIVE"} if i == 2 else
    {"social_security_robustness": "FRAGILE"} if i == 3 else
    {} for i in range(10)
])
CASES.append({"name": "social_security_sensitive_and_fragile", "annual": rows, "initial_real_total": 1000000.0})

# 8. Out-of-range SS claim age + claim status changed across years.
rows = sequence([
    {"social_security_claim_age_months": 700} if i == 0 else  # below 62*12=744
    {"social_security_claim_age_months": 900} if i == 1 else  # different claim -> "changed"
    {"social_security_claim_age_months": 900} for i in range(5)
])
CASES.append({"name": "ss_claim_out_of_range_and_changed", "annual": rows, "initial_real_total": 1000000.0})

# 9. Reached 70 without ever claiming SS.
rows = sequence([{"age": 65 + i, "social_security_claim_age_months": None, "social_security_target_age_months": None} for i in range(8)])
CASES.append({"name": "reached_70_never_claimed", "annual": rows, "initial_real_total": 1000000.0})

# 10. Empty annual results.
CASES.append({"name": "empty_annual_results", "annual": [], "initial_real_total": 1000000.0})

# 11. Diagnostics with error issues (forces Invalid classification).
CASES.append({
    "name": "diagnostics_has_error_issue",
    "annual": sequence([{} for _ in range(5)]),
    "initial_real_total": 1000000.0,
    "diagnostics": {"issues": [{"code": "CASH_LEDGER_MISMATCH", "severity": "error"}]},
})

# 12. Diagnostics with only warnings (SS_ prefixed) -- should not invalidate, but should show up in concerns/metrics.
CASES.append({
    "name": "diagnostics_ss_warning_only",
    "annual": sequence([{} for _ in range(5)]),
    "initial_real_total": 1000000.0,
    "diagnostics": {"issues": [{"code": "SS_SENSITIVITY_FLIP", "severity": "warning"}]},
})

# 13. Low prosperity participation (opportunity years present but spending stayed near floor).
rows = sequence([{"retirement_year": 13 + i, "spending_eligible_ceiling_real": 90000.0, "spending_real": 71000.0} for i in range(6)], retirement_year_start=13)
CASES.append({"name": "low_prosperity_participation", "annual": rows, "initial_real_total": 1000000.0})

# 14. Concentrated ending balances (one sleeve > 90%).
rows = sequence([{} for _ in range(10)])
rows_dicts = [asdict(r) for r in rows]
rows_dicts[-1]["ending_real_balances"] = {"voo": 950000.0, "schd": 20000.0, "tbills": 20000.0, "roth": 10000.0}
rows_concentrated = [AnnualResult(**d) for d in rows_dicts]
CASES.append({"name": "concentrated_ending_balances", "annual": rows_concentrated, "initial_real_total": 1000000.0})

# 15. Exactly at the successful/conditional score boundaries (constructed to land near thresholds).
rows = sequence([{} for _ in range(15)])
CASES.append({"name": "boundary_check_default_scenario", "annual": rows, "initial_real_total": 500000.0})


def row_to_dict(row):
    return asdict(row)


def main():
    output_cases = []
    for c in CASES:
        diagnostics = c.get("diagnostics", {"issues": []})
        grade = grader.grade(c["annual"], initial_real_total=c["initial_real_total"], diagnostics=diagnostics)
        output_cases.append({
            "name": c["name"],
            "input": {
                "annual": [row_to_dict(r) for r in c["annual"]],
                "initial_real_total": c["initial_real_total"],
                "diagnostics": diagnostics,
            },
            "output": grade.to_dict(),
        })

    result = {
        "grading_config": grading_cfg,
        "spending_config": spending_cfg,
        "reserve_config": reserve_cfg,
        "portfolio_config": portfolio_cfg,
        "cases": output_cases,
    }
    out_path = Path(__file__).resolve().parent / "effectiveness-grader.fixtures.json"
    out_path.write_text(json.dumps(result, indent=2))
    print(f"Wrote {out_path} ({len(output_cases)} cases)")


if __name__ == "__main__":
    main()
