"""
Generates fixtures/tax-engine.fixtures.json by running a range of inputs
through the real (Phase-1-fixed) Python TaxCalculator and TaxIncome.
The JS port in src/ported/tax-engine.js is verified against this file's
output byte-for-byte (see tests/ported/tax-engine.test.js) -- this script
is the oracle, never the JS port.

Run from C:\\Calculator merge:
    python fixtures/generate_tax_engine_fixtures.py
"""
import json
import sys
from dataclasses import asdict
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.config import load_config  # noqa: E402
from retirement_model_v2.model_types import TaxIncome  # noqa: E402
from retirement_model_v2.tax_engine import TaxCalculator  # noqa: E402

config = load_config()
tax_cfg = config.section("tax")
calculator = TaxCalculator(tax_cfg)

CASES = [
    {"name": "all_zero", "income": {}, "inflation_factor": 1.0},
    {"name": "ordinary_only_low", "income": {"ordinary_income": 20000.0}, "inflation_factor": 1.0},
    {"name": "ordinary_only_mid_bracket", "income": {"ordinary_income": 90000.0}, "inflation_factor": 1.0},
    {"name": "ordinary_only_top_bracket", "income": {"ordinary_income": 800000.0}, "inflation_factor": 1.0},
    {"name": "qualified_dividends_only", "income": {"qualified_dividends": 40000.0}, "inflation_factor": 1.0},
    {"name": "ltcg_only_large", "income": {"long_term_gains": 600000.0}, "inflation_factor": 1.0},
    {"name": "mixed_ordinary_and_ltcg", "income": {"ordinary_income": 150000.0, "long_term_gains": 80000.0, "qualified_dividends": 5000.0}, "inflation_factor": 1.0},
    {"name": "social_security_low_combined", "income": {"ordinary_income": 5000.0, "social_security": 24000.0}, "inflation_factor": 1.0},
    {"name": "social_security_mid_band", "income": {"ordinary_income": 20000.0, "social_security": 24000.0}, "inflation_factor": 1.0},
    {"name": "social_security_top_band", "income": {"ordinary_income": 80000.0, "social_security": 30000.0}, "inflation_factor": 1.0},
    {"name": "capital_loss_within_limit", "income": {"ordinary_income": 60000.0, "long_term_gains": -2000.0}, "inflation_factor": 1.0},
    {"name": "capital_loss_exceeds_limit_carryforward", "income": {"ordinary_income": 60000.0, "long_term_gains": -10000.0}, "inflation_factor": 1.0},
    {"name": "capital_loss_offsets_carryforward_gain", "income": {"ordinary_income": 60000.0, "long_term_gains": 5000.0, "capital_loss_carryforward": 8000.0}, "inflation_factor": 1.0},
    {"name": "niit_triggered", "income": {"ordinary_income": 220000.0, "long_term_gains": 50000.0, "qualified_dividends": 10000.0, "nonqualified_dividends": 5000.0}, "inflation_factor": 1.0},
    {"name": "deduction_exceeds_ordinary_shifts_to_preferential", "income": {"ordinary_income": 5000.0, "qualified_dividends": 40000.0}, "inflation_factor": 1.0},
    {"name": "everything_at_once", "income": {"ordinary_income": 180000.0, "qualified_dividends": 20000.0, "nonqualified_dividends": 8000.0, "long_term_gains": 60000.0, "treasury_interest": 4000.0, "social_security": 36000.0, "capital_loss_carryforward": 1500.0}, "inflation_factor": 1.0},
    {"name": "inflation_factor_1.2", "income": {"ordinary_income": 90000.0, "long_term_gains": 40000.0}, "inflation_factor": 1.2},
    {"name": "inflation_factor_1.5_high_bracket_edge", "income": {"ordinary_income": 300000.0}, "inflation_factor": 1.5},
    {"name": "zero_income_with_treasury_interest", "income": {"treasury_interest": 12000.0}, "inflation_factor": 1.0},
    {"name": "large_negative_ltcg_no_carryforward_room", "income": {"ordinary_income": 40000.0, "long_term_gains": -50000.0}, "inflation_factor": 1.0},
]

INCREMENTAL_CASES = [
    {
        "name": "incremental_ordinary_delta",
        "base": {"ordinary_income": 90000.0, "long_term_gains": 20000.0},
        "inflation_factor": 1.0,
        "deltas": {"ordinary_delta": 15000.0},
    },
    {
        "name": "incremental_ltcg_delta_near_0pct_boundary",
        "base": {"ordinary_income": 30000.0},
        "inflation_factor": 1.0,
        "deltas": {"long_term_gain_delta": 25000.0},
    },
    {
        "name": "incremental_multi_delta",
        "base": {"ordinary_income": 150000.0, "qualified_dividends": 5000.0},
        "inflation_factor": 1.1,
        "deltas": {"ordinary_delta": 10000.0, "qualified_dividend_delta": 2000.0, "nonqualified_dividend_delta": 1000.0, "long_term_gain_delta": 5000.0},
    },
]


def run_case(case):
    income = TaxIncome(**case["income"])
    result = calculator.calculate(income, case["inflation_factor"])
    return {
        "name": case["name"],
        "input": {"income": asdict(income), "inflation_factor": case["inflation_factor"]},
        "output": asdict(result),
        "taxable_social_security_direct": calculator.taxable_social_security(income),
    }


def run_incremental_case(case):
    base = TaxIncome(**case["base"])
    delta = calculator.incremental_tax(base, inflation_factor=case["inflation_factor"], **case["deltas"])
    return {
        "name": case["name"],
        "input": {"base": asdict(base), "inflation_factor": case["inflation_factor"], "deltas": case["deltas"]},
        "output": {"incremental_tax": delta},
    }


def main():
    output = {
        "config": tax_cfg,
        "calculate_cases": [run_case(c) for c in CASES],
        "incremental_cases": [run_incremental_case(c) for c in INCREMENTAL_CASES],
    }
    out_path = Path(__file__).resolve().parent / "tax-engine.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(CASES)} calculate cases, {len(INCREMENTAL_CASES)} incremental cases)")


if __name__ == "__main__":
    main()
