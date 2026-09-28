"""
Adversarial/edge-case stress fixtures for ReserveManager, generated after a
code-review pass found that the JS port's average()/`_average_tail` slicing
diverged from Python's `values[-length:]` semantics specifically at
length=0 (Python: whole list; a since-fixed earlier JS version: empty list).
These cases specifically target that class of edge case plus other
boundary/extreme inputs the hand-picked scenario fixtures didn't cover.

Run from C:\\Calculator merge:
    python fixtures/generate_reserve_manager_adversarial_fixtures.py
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


def make_state(**overrides):
    base = dict(
        decision_year=2040, age=65, retirement_year=1, inflation_factor=1.3,
        spending_real=70000.0, portfolio_real=1200000.0, taxable_value_real=700000.0,
        roth_value_real=200000.0, reserve_real=150000.0, reserve_months=24.0,
        equity_drawdown=0.0, trailing_spending_real=(), trailing_tax_real=(),
        trend_15y_real=None,
    )
    base.update(overrides)
    return KnownState(**base)


# Boundary-exact and extreme scenarios. `manager0` uses a config clone with
# trailing_average_years=0 to specifically exercise the slice(-0) edge case;
# `manager` uses the real config for everything else.
config_length_zero = dict(reserve_cfg)
config_length_zero["trailing_average_years"] = 0
manager0 = ReserveManager(config_length_zero, decision_log=None)
manager = ReserveManager(reserve_cfg, decision_log=None)

TARGET_CASES = [
    {"name": "adv_trailing_average_years_zero_nonempty_history", "manager": manager0, "state": make_state(retirement_year=15, trailing_spending_real=(10.0, 20.0, 30.0), trailing_tax_real=(1.0, 2.0, 3.0))},
    {"name": "adv_trailing_average_years_zero_empty_history", "manager": manager0, "state": make_state(retirement_year=15, trailing_spending_real=(), trailing_tax_real=())},
    {"name": "adv_trailing_history_longer_than_window", "manager": manager, "state": make_state(retirement_year=15, trailing_spending_real=tuple(float(x) for x in range(1, 21)), trailing_tax_real=tuple(float(x) for x in range(1, 21)))},
    {"name": "adv_retirement_year_zero", "manager": manager, "state": make_state(retirement_year=0)},
    {"name": "adv_retirement_year_negative", "manager": manager, "state": make_state(retirement_year=-3)},
    {"name": "adv_retirement_year_huge", "manager": manager, "state": make_state(retirement_year=10_000)},
    {"name": "adv_retirement_year_exactly_first_fixed_boundary", "manager": manager, "state": make_state(retirement_year=int(reserve_cfg["first_fixed_years"]))},
    {"name": "adv_retirement_year_one_past_first_fixed_boundary", "manager": manager, "state": make_state(retirement_year=int(reserve_cfg["first_fixed_years"]) + 1)},
    {"name": "adv_retirement_year_exactly_sequence_boundary", "manager": manager, "state": make_state(retirement_year=int(reserve_cfg["sequence_sensitive_years"]))},
    {"name": "adv_retirement_year_one_past_sequence_boundary", "manager": manager, "state": make_state(retirement_year=int(reserve_cfg["sequence_sensitive_years"]) + 1)},
    {"name": "adv_zero_spending", "manager": manager, "state": make_state(retirement_year=15, spending_real=0.0)},
    {"name": "adv_negative_spending", "manager": manager, "state": make_state(retirement_year=15, spending_real=-5000.0)},
    {"name": "adv_huge_spending", "manager": manager, "state": make_state(retirement_year=15, spending_real=1e12)},
]

DRAW_CASES = [
    {"name": "adv_negative_equity_drawdown", "state": make_state(retirement_year=15, equity_drawdown=-0.5), "cash_need_real": 50000.0, "emergency": False},
    {"name": "adv_equity_drawdown_over_1", "state": make_state(retirement_year=15, equity_drawdown=2.5), "cash_need_real": 50000.0, "emergency": False},
    {"name": "adv_negative_cash_need", "state": make_state(retirement_year=15), "cash_need_real": -10000.0, "emergency": False},
    {"name": "adv_negative_reserve_real", "state": make_state(retirement_year=15, reserve_real=-50000.0), "cash_need_real": 50000.0, "emergency": False},
    {"name": "adv_negative_reserve_months", "state": make_state(retirement_year=15, reserve_months=-1.0), "cash_need_real": 50000.0, "emergency": False},
    {"name": "adv_reserve_months_exactly_soft_start", "state": make_state(retirement_year=15, reserve_months=float(reserve_cfg["soft_protection_starts_months"])), "cash_need_real": 50000.0, "emergency": False},
    {"name": "adv_reserve_months_exactly_hard_floor", "state": make_state(retirement_year=15, reserve_months=float(reserve_cfg["protected_final_months"])), "cash_need_real": 50000.0, "emergency": False},
    {"name": "adv_reserve_months_below_hard_floor", "state": make_state(retirement_year=15, reserve_months=0.5), "cash_need_real": 50000.0, "emergency": False},
    {"name": "adv_equity_drawdown_exactly_material", "state": make_state(retirement_year=15, equity_drawdown=float(reserve_cfg["material_drawdown"])), "cash_need_real": 50000.0, "emergency": False},
    {"name": "adv_huge_cash_need", "state": make_state(retirement_year=15), "cash_need_real": 1e12, "emergency": False},
    {"name": "adv_zero_reserve_zero_need", "state": make_state(retirement_year=15, reserve_real=0.0), "cash_need_real": 0.0, "emergency": False},
    {"name": "adv_emergency_zero_reserve", "state": make_state(retirement_year=15, reserve_real=0.0), "cash_need_real": 50000.0, "emergency": True},
]

REFILL_CASES = [
    {"name": "adv_gap_exactly_zero", "state": make_state(retirement_year=15, reserve_real=240000.0), "available_capacity_real": 100000.0, "reserve_draw_real": 0.0},
    {"name": "adv_negative_available_capacity", "state": make_state(retirement_year=15, reserve_real=50000.0), "available_capacity_real": -10000.0, "reserve_draw_real": 0.0},
    {"name": "adv_equity_drawdown_exactly_recovery_limit", "state": make_state(retirement_year=15, reserve_real=50000.0, equity_drawdown=float(reserve_cfg["recovery_drawdown"])), "available_capacity_real": 100000.0, "reserve_draw_real": 0.0},
    {"name": "adv_equity_drawdown_just_over_recovery_limit", "state": make_state(retirement_year=15, reserve_real=50000.0, equity_drawdown=float(reserve_cfg["recovery_drawdown"]) + 1e-6), "available_capacity_real": 100000.0, "reserve_draw_real": 0.0},
    {"name": "adv_score_exactly_at_threshold", "state": make_state(retirement_year=15, reserve_real=50000.0, portfolio_real=1_100_000.0, equity_drawdown=0.0, trend_15y_real=0.0), "available_capacity_real": 1_000_000.0, "reserve_draw_real": 0.0},
    {"name": "adv_extreme_positive_trend", "state": make_state(retirement_year=15, reserve_real=50000.0, portfolio_real=1500000.0, trend_15y_real=1.0), "available_capacity_real": 100000.0, "reserve_draw_real": 0.0},
    {"name": "adv_extreme_negative_trend", "state": make_state(retirement_year=15, reserve_real=50000.0, portfolio_real=1500000.0, trend_15y_real=-1.0), "available_capacity_real": 100000.0, "reserve_draw_real": 0.0},
    {"name": "adv_negative_reserve_draw_real", "state": make_state(retirement_year=15, reserve_real=50000.0), "available_capacity_real": 100000.0, "reserve_draw_real": -5000.0},
    {"name": "adv_zero_portfolio", "state": make_state(retirement_year=15, reserve_real=50000.0, portfolio_real=0.0), "available_capacity_real": 100000.0, "reserve_draw_real": 0.0},
    {"name": "adv_huge_available_capacity", "state": make_state(retirement_year=15, reserve_real=50000.0, portfolio_real=1500000.0), "available_capacity_real": 1e12, "reserve_draw_real": 0.0},
]


def state_to_dict(state):
    return asdict(state)


def main():
    target_out = []
    for c in TARGET_CASES:
        result = c["manager"].target(c["state"])
        target_out.append({"name": c["name"], "input": {"state": state_to_dict(c["state"])}, "output": asdict(result), "trailing_average_years_zero": c["manager"] is manager0})

    draw_out = []
    for c in DRAW_CASES:
        result = manager.draw(state=c["state"], cash_need_real=c["cash_need_real"], emergency=c["emergency"])
        draw_out.append({"name": c["name"], "input": {"state": state_to_dict(c["state"]), "cash_need_real": c["cash_need_real"], "emergency": c["emergency"]}, "output": asdict(result)})

    refill_out = []
    for c in REFILL_CASES:
        result = manager.refill(state=c["state"], available_capacity_real=c["available_capacity_real"], reserve_draw_real=c["reserve_draw_real"])
        refill_out.append({"name": c["name"], "input": {"state": state_to_dict(c["state"]), "available_capacity_real": c["available_capacity_real"], "reserve_draw_real": c["reserve_draw_real"]}, "output": asdict(result)})

    result = {
        "config": reserve_cfg,
        "config_trailing_average_years_zero": config_length_zero,
        "target_cases": target_out,
        "draw_cases": draw_out,
        "refill_cases": refill_out,
    }
    out_path = Path(__file__).resolve().parent / "reserve-manager-adversarial.fixtures.json"
    out_path.write_text(json.dumps(result, indent=2))
    print(f"Wrote {out_path} ({len(target_out)} target, {len(draw_out)} draw, {len(refill_out)} refill adversarial cases)")


if __name__ == "__main__":
    main()
