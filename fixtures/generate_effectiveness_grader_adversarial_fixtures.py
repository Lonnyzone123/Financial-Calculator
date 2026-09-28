"""
Adversarial/edge-case fixtures for EffectivenessGrader, added during a
Phase 8 audit pass. Two categories:

  1. Boundary-exact scenarios (score exactly at successful/conditional
     thresholds, largest_final_share exactly at 0.9, schd_sale_years
     exactly at the allowed limit, half-year ages straddling the Roth
     access age and the "reached 70" check -- proving empirically that
     Python's int(age) truncation and comparing the raw float directly
     produce the same boolean result for every realistic (non-negative)
     age, not just arguing it mathematically).

  2. A genuine Python crash: sequence_sensitive_years=0 makes the trough
     computation's `min()` receive an empty sequence, which Python raises
     ValueError on. This is recorded as `"raises": true` rather than an
     "output" -- the JS port must raise too (see the pyMin/pyMax fix in
     src/ported/effectiveness-grader.js), not silently compute Infinity.

Run from C:\\Calculator merge:
    python fixtures/generate_effectiveness_grader_adversarial_fixtures.py
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
    out = []
    for i, row_overrides in enumerate(rows):
        merged = dict(retirement_year=retirement_year_start + i, year=2040 + i, age=65 + i)
        merged.update(row_overrides)
        out.append(make_row(**merged))
    return out


CASES = []
CRASH_CASES = []

# 1. Half-year age straddling the Roth access age (60) exactly, just under,
# and just over -- proves int(age) truncation vs raw-float comparison
# produce identical flag outcomes for the calculator's 0.5-year age domain.
rows = sequence([
    {"age": 59.5, "withdrawals": {"from_tbills": 0.0, "from_voo": 0.0, "from_roth": 5000.0, "from_schd": 0.0, "feasible": True}},
    {"age": 60.0, "withdrawals": {"from_tbills": 0.0, "from_voo": 0.0, "from_roth": 5000.0, "from_schd": 0.0, "feasible": True}},
    {"age": 60.5, "withdrawals": {"from_tbills": 0.0, "from_voo": 0.0, "from_roth": 5000.0, "from_schd": 0.0, "feasible": True}},
])
CASES.append({"name": "half_year_ages_straddling_roth_access_age", "annual": rows, "initial_real_total": 1000000.0})

# 2. Half-year age straddling age 70 exactly (the "reached 70" check).
rows = sequence([{"age": a, "social_security_claim_age_months": None, "social_security_target_age_months": None} for a in (69.5, 70.0, 70.5)])
CASES.append({"name": "half_year_ages_straddling_age_70", "annual": rows, "initial_real_total": 1000000.0})

# 3. Half-year age straddling the spending-floor schedule's start_age (45).
rows = sequence([
    {"age": 44.5, "spending_real": 50000.0},
    {"age": 45.0, "spending_real": 50000.0},
    {"age": 45.5, "spending_real": 50000.0},
])
CASES.append({"name": "half_year_ages_straddling_floor_schedule_start_age", "annual": rows, "initial_real_total": 1000000.0})

# 4. largest_final_share exactly at the 0.9 concern threshold.
rows = sequence([{} for _ in range(5)])
rows_dicts = [asdict(r) for r in rows]
rows_dicts[-1]["ending_real_balances"] = {"voo": 900000.0, "schd": 33333.333333, "tbills": 33333.333333, "roth": 33333.333334}
rows_boundary = [AnnualResult(**d) for d in rows_dicts]
CASES.append({"name": "largest_final_share_exactly_at_point_nine", "annual": rows_boundary, "initial_real_total": 1000000.0})

# 5. schd_sale_years exactly at the allowed-for-full-credit limit (0 in
# current config, so "at the limit" means zero SCHD sales).
rows = sequence([{} for _ in range(5)])
CASES.append({"name": "schd_sale_years_exactly_at_allowed_limit_zero", "annual": rows, "initial_real_total": 1000000.0})

# 6. Single annual row (annual.length == 1) -- ending == annual[0] == the
# only sequence-window row too.
rows = sequence([{}])
CASES.append({"name": "single_annual_row", "annual": rows, "initial_real_total": 1000000.0})

# 7. reserve_target_real == 0 (division-guard: max(1.0, ...) must engage).
rows = sequence([{"reserve_target_real": 0.0} for _ in range(3)])
CASES.append({"name": "reserve_target_real_zero", "annual": rows, "initial_real_total": 1000000.0})

# 8. finalNeed == 0 exactly (ending spending_real and tax_real both zero).
rows = sequence([{} for _ in range(3)])
rows_dicts = [asdict(r) for r in rows]
rows_dicts[-1]["spending_real"] = 0.0
rows_dicts[-1]["tax_real"] = 0.0
rows_zero_need = [AnnualResult(**d) for d in rows_dicts]
CASES.append({"name": "final_need_exactly_zero", "annual": rows_zero_need, "initial_real_total": 1000000.0})

# 9. initial_real_total == 0 (division-guard on trough_fraction).
rows = sequence([{} for _ in range(3)])
CASES.append({"name": "initial_real_total_zero", "annual": rows, "initial_real_total": 0.0})

# --- Crash case: sequence_sensitive_years=0 empties the trough window,
# and Python's min() on an empty sequence raises ValueError.
cfg_zero_sequence = dict(reserve_cfg)
cfg_zero_sequence["sequence_sensitive_years"] = 0
grader_zero_sequence = EffectivenessGrader(grading_cfg, spending_cfg, cfg_zero_sequence, portfolio_cfg)
CRASH_CASES.append({
    "name": "sequence_sensitive_years_zero_empties_trough_window",
    "reserve_config": cfg_zero_sequence,
    "annual": sequence([{} for _ in range(5)]),
    "initial_real_total": 1000000.0,
})


def row_to_dict(row):
    return asdict(row)


def main():
    output_cases = []
    for c in CASES:
        diagnostics = c.get("diagnostics", {"issues": []})
        grade = grader.grade(c["annual"], initial_real_total=c["initial_real_total"], diagnostics=diagnostics)
        output_cases.append({
            "name": c["name"],
            "input": {"annual": [row_to_dict(r) for r in c["annual"]], "initial_real_total": c["initial_real_total"], "diagnostics": diagnostics},
            "output": grade.to_dict(),
        })

    crash_output = []
    for c in CRASH_CASES:
        raised = None
        try:
            grader_zero_sequence.grade(c["annual"], initial_real_total=c["initial_real_total"], diagnostics={"issues": []})
        except ValueError as exc:
            raised = str(exc)
        assert raised is not None, f"expected {c['name']} to raise ValueError in Python, but it did not"
        crash_output.append({
            "name": c["name"],
            "input": {"reserve_config": c["reserve_config"], "annual": [row_to_dict(r) for r in c["annual"]], "initial_real_total": c["initial_real_total"]},
            "raises": True,
            "python_error": raised,
        })

    result = {
        "grading_config": grading_cfg,
        "spending_config": spending_cfg,
        "reserve_config": reserve_cfg,
        "portfolio_config": portfolio_cfg,
        "cases": output_cases,
        "crash_cases": crash_output,
    }
    out_path = Path(__file__).resolve().parent / "effectiveness-grader-adversarial.fixtures.json"
    out_path.write_text(json.dumps(result, indent=2))
    print(f"Wrote {out_path} ({len(output_cases)} cases, {len(crash_output)} crash cases)")


if __name__ == "__main__":
    main()
