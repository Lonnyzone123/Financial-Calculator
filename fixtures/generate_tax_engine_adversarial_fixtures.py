"""
Adversarial/edge-case stress fixtures for TaxCalculator, added during a
Phase 5 audit pass. Targets exact bracket boundaries, exact NIIT/SS
thresholds, exact deduction-equals-income boundaries, and extreme
inflation factors -- the class of "off by an inequality direction" bug
that boundary-exact inputs are specifically good at catching.

Run from C:\\Calculator merge:
    python fixtures/generate_tax_engine_adversarial_fixtures.py
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

ORD = tax_cfg["ordinary_brackets"]
LTCG = tax_cfg["ltcg_brackets"]
SS_LOWER, SS_UPPER = tax_cfg["ss_combined_income_thresholds_nominal"]
NIIT_THRESHOLD = tax_cfg["niit_threshold_nominal"]
LOSS_LIMIT = tax_cfg["capital_loss_ordinary_limit_nominal"]
STD_DEDUCTION = tax_cfg["standard_deduction"]

CASES = []


def add(name, income_kwargs, inflation_factor=1.0):
    CASES.append({"name": name, "income": income_kwargs, "inflation_factor": inflation_factor})


# Exactly at each ordinary-bracket ceiling (taxable ordinary income set to
# land precisely on the boundary after the standard deduction).
for i, (ceiling, _rate) in enumerate(ORD):
    if ceiling is None:
        continue
    add(f"ordinary_exactly_at_bracket_{i}_ceiling", {"ordinary_income": ceiling + STD_DEDUCTION})
    add(f"ordinary_one_dollar_over_bracket_{i}_ceiling", {"ordinary_income": ceiling + STD_DEDUCTION + 1.0})
    add(f"ordinary_one_dollar_under_bracket_{i}_ceiling", {"ordinary_income": ceiling + STD_DEDUCTION - 1.0})

# Exactly at each LTCG-bracket ceiling, with zero ordinary taxable (so the
# stacked-tax "start" is 0) so the boundary lands cleanly on the LTCG axis.
for i, (ceiling, _rate) in enumerate(LTCG):
    if ceiling is None:
        continue
    add(f"ltcg_exactly_at_bracket_{i}_ceiling_zero_ordinary", {"long_term_gains": ceiling})
    add(f"ltcg_one_dollar_over_bracket_{i}_ceiling_zero_ordinary", {"long_term_gains": ceiling + 1.0})

# LTCG stacked exactly on top of a large ordinary taxable base, straddling a
# bracket boundary mid-preferential-income.
add("ltcg_stacked_straddles_bracket_boundary", {"ordinary_income": ORD[1][0] + STD_DEDUCTION - 5000.0, "long_term_gains": 10000.0})

# Social Security combined-income thresholds, exactly and adjacent.
add("ss_combined_exactly_at_lower_threshold", {"ordinary_income": SS_LOWER, "social_security": 0.0})
add("ss_combined_one_dollar_over_lower_threshold_via_ss", {"ordinary_income": SS_LOWER - 1.0, "social_security": 2.0})
add("ss_combined_exactly_at_upper_threshold", {"ordinary_income": SS_UPPER, "social_security": 0.0})
add("ss_combined_one_dollar_over_upper_threshold_via_ss", {"ordinary_income": SS_UPPER - 1.0, "social_security": 2.0})

# NIIT threshold exactly and adjacent (MAGI must land exactly on it).
add("niit_magi_exactly_at_threshold", {"ordinary_income": NIIT_THRESHOLD, "qualified_dividends": 5000.0})
add("niit_magi_one_dollar_over_threshold", {"ordinary_income": NIIT_THRESHOLD + 1.0, "qualified_dividends": 5000.0})

# Capital loss carryforward exactly at, one under, and one over the annual
# ordinary-offset limit.
add("capital_loss_exactly_at_annual_limit", {"ordinary_income": 60000.0, "long_term_gains": -LOSS_LIMIT})
add("capital_loss_one_dollar_under_limit", {"ordinary_income": 60000.0, "long_term_gains": -(LOSS_LIMIT - 1.0)})
add("capital_loss_one_dollar_over_limit", {"ordinary_income": 60000.0, "long_term_gains": -(LOSS_LIMIT + 1.0)})

# Deduction exactly equal to ordinary gross (taxable_ordinary == 0 exactly,
# unused_deduction == 0 exactly).
add("deduction_exactly_equals_ordinary_gross", {"ordinary_income": STD_DEDUCTION})
add("deduction_one_dollar_more_than_ordinary_gross", {"ordinary_income": STD_DEDUCTION - 1.0})
add("deduction_one_dollar_less_than_ordinary_gross", {"ordinary_income": STD_DEDUCTION + 1.0})

# Extreme inflation factors (very large and very small-but-positive).
add("extreme_high_inflation_factor", {"ordinary_income": 90000.0, "long_term_gains": 40000.0}, inflation_factor=10.0)
add("extreme_low_inflation_factor", {"ordinary_income": 90000.0, "long_term_gains": 40000.0}, inflation_factor=0.01)

# All-zero income at an extreme inflation factor (deduction scales, nothing
# else does).
add("all_zero_income_extreme_inflation", {}, inflation_factor=5.0)

# Very large numbers throughout (stress float precision across bracket
# accumulation).
add("very_large_ordinary_income", {"ordinary_income": 50_000_000.0})
add("very_large_everything", {
    "ordinary_income": 10_000_000.0, "qualified_dividends": 2_000_000.0,
    "nonqualified_dividends": 1_000_000.0, "long_term_gains": 5_000_000.0,
    "treasury_interest": 500_000.0, "social_security": 100_000.0,
})


INCREMENTAL_CASES = [
    {"name": "incremental_zero_delta_explicit", "base": {"ordinary_income": 90000.0}, "inflation_factor": 1.0, "deltas": {"ordinary_delta": 0.0}},
    {"name": "incremental_no_deltas_at_all", "base": {"ordinary_income": 90000.0}, "inflation_factor": 1.0, "deltas": {}},
    {"name": "incremental_negative_delta", "base": {"ordinary_income": 90000.0}, "inflation_factor": 1.0, "deltas": {"ordinary_delta": -20000.0}},
    {"name": "incremental_delta_crosses_niit_threshold", "base": {"ordinary_income": NIIT_THRESHOLD - 5000.0, "qualified_dividends": 3000.0}, "inflation_factor": 1.0, "deltas": {"ordinary_delta": 10000.0}},
]


def run_case(case):
    income = TaxIncome(**case["income"])
    result = calculator.calculate(income, case["inflation_factor"])
    return {"name": case["name"], "input": {"income": asdict(income), "inflation_factor": case["inflation_factor"]}, "output": asdict(result)}


def run_incremental_case(case):
    base = TaxIncome(**case["base"])
    delta = calculator.incremental_tax(base, inflation_factor=case["inflation_factor"], **case["deltas"])
    return {"name": case["name"], "input": {"base": asdict(base), "inflation_factor": case["inflation_factor"], "deltas": case["deltas"]}, "output": {"incremental_tax": delta}}


def main():
    output = {
        "config": tax_cfg,
        "calculate_cases": [run_case(c) for c in CASES],
        "incremental_cases": [run_incremental_case(c) for c in INCREMENTAL_CASES],
    }
    out_path = Path(__file__).resolve().parent / "tax-engine-adversarial.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(CASES)} calculate cases, {len(INCREMENTAL_CASES)} incremental cases)")


if __name__ == "__main__":
    main()
