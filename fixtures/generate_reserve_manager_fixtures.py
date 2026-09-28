"""
Generates fixtures/reserve-manager.fixtures.json by running a range of
KnownState scenarios through the real (Phase-1-fixed) Python ReserveManager
across all three methods (target/draw/refill). No randomness anywhere in
this module, so output is fully deterministic in both languages.

Run from C:\\Calculator merge:
    python fixtures/generate_reserve_manager_fixtures.py
"""
import json
import sys
from dataclasses import asdict
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.config import load_config  # noqa: E402
from retirement_model_v2.model_types import KnownState  # noqa: E402
from retirement_model_v2.reserve_manager import ReserveManager  # noqa: E402

config = load_config()
reserve_cfg = config.section("reserve")
manager = ReserveManager(reserve_cfg, decision_log=None)


def make_state(**overrides):
    base = dict(
        decision_year=2040,
        age=65,
        retirement_year=1,
        inflation_factor=1.3,
        spending_real=70000.0,
        portfolio_real=1200000.0,
        taxable_value_real=700000.0,
        roth_value_real=200000.0,
        reserve_real=150000.0,
        reserve_months=24.0,
        equity_drawdown=0.0,
        trailing_spending_real=(),
        trailing_tax_real=(),
        trend_15y_real=None,
    )
    base.update(overrides)
    return KnownState(**base)


TARGET_CASES = [
    {"name": "target_fixed_years_1_5", "state": make_state(retirement_year=3)},
    {"name": "target_fixed_years_boundary", "state": make_state(retirement_year=5)},
    {"name": "target_lifestyle_only_6_12", "state": make_state(retirement_year=8)},
    {"name": "target_lifestyle_only_boundary", "state": make_state(retirement_year=12)},
    {"name": "target_lifestyle_plus_tax_13_plus", "state": make_state(retirement_year=13)},
    {"name": "target_lifestyle_plus_tax_late", "state": make_state(retirement_year=25)},
    {"name": "target_with_trailing_spending_history", "state": make_state(retirement_year=15, trailing_spending_real=(65000.0, 68000.0, 72000.0, 70000.0, 71000.0), trailing_tax_real=(8000.0, 8500.0, 9000.0, 8800.0, 9100.0))},
    {"name": "target_raw_exceeds_refill_cap", "state": make_state(retirement_year=15, spending_real=200000.0)},
]

DRAW_CASES = [
    {"name": "draw_normal_no_drawdown", "state": make_state(retirement_year=15), "cash_need_real": 50000.0, "emergency": False},
    {"name": "draw_with_equity_drawdown", "state": make_state(retirement_year=15, equity_drawdown=0.20), "cash_need_real": 50000.0, "emergency": False},
    {"name": "draw_material_drawdown_reason", "state": make_state(retirement_year=15, equity_drawdown=0.16), "cash_need_real": 50000.0, "emergency": False},
    {"name": "draw_sequence_sensitive_period", "state": make_state(retirement_year=8, equity_drawdown=0.10), "cash_need_real": 50000.0, "emergency": False},
    {"name": "draw_soft_protection_zone", "state": make_state(retirement_year=15, reserve_months=6.0), "cash_need_real": 50000.0, "emergency": False},
    {"name": "draw_at_protected_floor", "state": make_state(retirement_year=15, reserve_months=2.0), "cash_need_real": 50000.0, "emergency": False},
    {"name": "draw_emergency_override", "state": make_state(retirement_year=15, reserve_months=1.0), "cash_need_real": 200000.0, "emergency": True},
    {"name": "draw_accessible_exhausted", "state": make_state(retirement_year=15, reserve_real=5000.0), "cash_need_real": 50000.0, "emergency": False},
    {"name": "draw_zero_need", "state": make_state(retirement_year=15), "cash_need_real": 0.0, "emergency": False},
]

REFILL_CASES = [
    {"name": "refill_already_at_target", "state": make_state(retirement_year=15, reserve_real=400000.0), "available_capacity_real": 100000.0, "reserve_draw_real": 0.0},
    {"name": "refill_blocked_same_year_after_draw", "state": make_state(retirement_year=15, reserve_real=100000.0), "available_capacity_real": 100000.0, "reserve_draw_real": 5000.0},
    {"name": "refill_blocked_material_drawdown", "state": make_state(retirement_year=15, reserve_real=100000.0, equity_drawdown=0.15), "available_capacity_real": 100000.0, "reserve_draw_real": 0.0},
    {"name": "refill_allowed_full_recovery", "state": make_state(retirement_year=15, reserve_real=50000.0, equity_drawdown=0.0, portfolio_real=1500000.0), "available_capacity_real": 100000.0, "reserve_draw_real": 0.0},
    {"name": "refill_partial_recovery_low_score", "state": make_state(retirement_year=15, reserve_real=50000.0, equity_drawdown=0.08, portfolio_real=800000.0), "available_capacity_real": 100000.0, "reserve_draw_real": 0.0},
    {"name": "refill_capacity_constrained", "state": make_state(retirement_year=15, reserve_real=50000.0, portfolio_real=2000000.0), "available_capacity_real": 5000.0, "reserve_draw_real": 0.0},
    {"name": "refill_annual_cap_constrained", "state": make_state(retirement_year=15, reserve_real=10000.0, spending_real=50000.0, portfolio_real=2000000.0), "available_capacity_real": 500000.0, "reserve_draw_real": 0.0},
    {"name": "refill_with_positive_15y_trend", "state": make_state(retirement_year=15, reserve_real=50000.0, portfolio_real=1500000.0, trend_15y_real=0.05), "available_capacity_real": 100000.0, "reserve_draw_real": 0.0},
    {"name": "refill_with_negative_15y_trend", "state": make_state(retirement_year=15, reserve_real=50000.0, portfolio_real=1500000.0, trend_15y_real=-0.04), "available_capacity_real": 100000.0, "reserve_draw_real": 0.0},
]


def state_to_dict(state):
    return asdict(state)


def main():
    target_out = []
    for c in TARGET_CASES:
        result = manager.target(c["state"])
        target_out.append({"name": c["name"], "input": {"state": state_to_dict(c["state"])}, "output": asdict(result)})

    draw_out = []
    for c in DRAW_CASES:
        result = manager.draw(state=c["state"], cash_need_real=c["cash_need_real"], emergency=c["emergency"])
        draw_out.append({
            "name": c["name"],
            "input": {"state": state_to_dict(c["state"]), "cash_need_real": c["cash_need_real"], "emergency": c["emergency"]},
            "output": asdict(result),
        })

    refill_out = []
    for c in REFILL_CASES:
        result = manager.refill(state=c["state"], available_capacity_real=c["available_capacity_real"], reserve_draw_real=c["reserve_draw_real"])
        refill_out.append({
            "name": c["name"],
            "input": {"state": state_to_dict(c["state"]), "available_capacity_real": c["available_capacity_real"], "reserve_draw_real": c["reserve_draw_real"]},
            "output": asdict(result),
        })

    result = {
        "config": reserve_cfg,
        "target_cases": target_out,
        "draw_cases": draw_out,
        "refill_cases": refill_out,
    }
    out_path = Path(__file__).resolve().parent / "reserve-manager.fixtures.json"
    out_path.write_text(json.dumps(result, indent=2))
    print(f"Wrote {out_path} ({len(target_out)} target, {len(draw_out)} draw, {len(refill_out)} refill cases)")


if __name__ == "__main__":
    main()
