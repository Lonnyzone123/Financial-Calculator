"""
Generates fixtures/lifetime-tax-optimizer.fixtures.json by running a range of
portfolio/income/shortfall scenarios through the real (Phase-1-fixed) Python
LifetimeTaxOptimizer. The JS port in src/ported/lifetime-tax-optimizer.js is
verified against this file byte-for-byte (see
tests/ported/lifetime-tax-optimizer.test.js). This optimizer has no
randomness (no RNG anywhere in optimize()/_evaluate()/_allocate()), so its
output for a given input is fully deterministic in both languages.

Run from C:\\Calculator merge:
    python fixtures/generate_lifetime_tax_optimizer_fixtures.py
"""
import json
import sys
from dataclasses import asdict
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.config import load_config  # noqa: E402
from retirement_model_v2.model_types import Account, KnownState, Portfolio, TaxIncome  # noqa: E402
from retirement_model_v2.tax_engine import TaxCalculator  # noqa: E402
from retirement_model_v2.lifetime_tax_optimizer import LifetimeTaxOptimizer, WithdrawalBounds  # noqa: E402

config = load_config()
calculator = TaxCalculator(config.section("tax"))
optimizer_cfg = config.section("optimizer")


def make_portfolio(voo=0.0, schd=0.0, tbills=0.0, roth=0.0, voo_basis=None, schd_basis=None):
    return Portfolio(
        voo=Account("voo", voo, voo_basis if voo_basis is not None else voo * 0.6, True),
        schd=Account("schd", schd, schd_basis if schd_basis is not None else schd * 0.6, True),
        tbills=Account("tbills", tbills, tbills, False),
        roth=Account("roth", roth, roth, False),
    )


def make_state(**overrides):
    base = dict(
        decision_year=2040,
        age=65,
        retirement_year=1,
        inflation_factor=1.3,
        spending_real=60000.0,
        portfolio_real=1000000.0,
        taxable_value_real=600000.0,
        roth_value_real=200000.0,
        reserve_real=100000.0,
        reserve_months=20.0,
        equity_drawdown=0.0,
    )
    base.update(overrides)
    return KnownState(**base)


CASES = [
    {
        "name": "balanced_all_sources_available",
        "portfolio": make_portfolio(voo=400000, schd=300000, tbills=100000, roth=200000),
        "base_income": TaxIncome(ordinary_income=30000.0, social_security=28000.0),
        "pre_tax_cash_shortfall": 45000.0,
        "state": make_state(),
    },
    {
        "name": "only_tbills_and_roth_available",
        "portfolio": make_portfolio(voo=0, schd=0, tbills=50000, roth=200000),
        "base_income": TaxIncome(ordinary_income=10000.0),
        "pre_tax_cash_shortfall": 30000.0,
        "state": make_state(),
    },
    {
        "name": "shortfall_exceeds_all_available",
        "portfolio": make_portfolio(voo=5000, schd=5000, tbills=2000, roth=3000),
        "base_income": TaxIncome(),
        "pre_tax_cash_shortfall": 200000.0,
        "state": make_state(),
    },
    {
        "name": "zero_shortfall",
        "portfolio": make_portfolio(voo=400000, schd=300000, tbills=100000, roth=200000),
        "base_income": TaxIncome(ordinary_income=80000.0),
        "pre_tax_cash_shortfall": 0.0,
        "state": make_state(),
    },
    {
        "name": "large_embedded_gains_in_voo",
        "portfolio": make_portfolio(voo=500000, schd=100000, tbills=50000, roth=100000, voo_basis=50000),
        "base_income": TaxIncome(ordinary_income=40000.0),
        "pre_tax_cash_shortfall": 80000.0,
        "state": make_state(),
    },
    {
        "name": "early_retirement_sequence_risk_penalty",
        "portfolio": make_portfolio(voo=300000, schd=200000, tbills=80000, roth=150000),
        "base_income": TaxIncome(ordinary_income=20000.0),
        "pre_tax_cash_shortfall": 60000.0,
        "state": make_state(retirement_year=3, equity_drawdown=0.25),
    },
    {
        "name": "no_sequence_penalty_after_year_12",
        "portfolio": make_portfolio(voo=300000, schd=200000, tbills=80000, roth=150000),
        "base_income": TaxIncome(ordinary_income=20000.0),
        "pre_tax_cash_shortfall": 60000.0,
        "state": make_state(retirement_year=13, equity_drawdown=0.25),
    },
    {
        "name": "only_schd_available",
        "portfolio": make_portfolio(voo=0, schd=150000, tbills=0, roth=0),
        "base_income": TaxIncome(ordinary_income=15000.0),
        "pre_tax_cash_shortfall": 20000.0,
        "state": make_state(),
    },
    {
        "name": "high_shortfall_near_niit_threshold",
        "portfolio": make_portfolio(voo=800000, schd=400000, tbills=200000, roth=300000),
        "base_income": TaxIncome(ordinary_income=150000.0),
        "pre_tax_cash_shortfall": 120000.0,
        "state": make_state(),
    },
    {
        "name": "inflation_factor_1.0_early_years",
        "portfolio": make_portfolio(voo=200000, schd=150000, tbills=50000, roth=100000),
        "base_income": TaxIncome(ordinary_income=50000.0),
        "pre_tax_cash_shortfall": 25000.0,
        "state": make_state(inflation_factor=1.0, retirement_year=0),
    },
]


def sanitize_infinities(value):
    """Python's json module writes bare Infinity/-Infinity/NaN tokens by
    default, which are not valid JSON and choke JSON.parse in JS. Replace
    them with a JSON-safe sentinel string the JS test recognizes."""
    if isinstance(value, float):
        if value == float("inf"):
            return "Infinity"
        if value == float("-inf"):
            return "-Infinity"
        if value != value:  # NaN
            return "NaN"
        return value
    if isinstance(value, dict):
        return {k: sanitize_infinities(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_infinities(v) for v in value]
    return value


def main():
    output_cases = []
    for case in CASES:
        # Fresh portfolio + optimizer per case: optimize() mutates clones
        # internally but let's not rely on that -- rebuild deterministically.
        portfolio = case["portfolio"]
        optimizer_calc = LifetimeTaxOptimizer(calculator, optimizer_cfg, decision_log=None)
        plan = optimizer_calc.optimize(
            portfolio=portfolio,
            base_income=case["base_income"],
            pre_tax_cash_shortfall=case["pre_tax_cash_shortfall"],
            state=case["state"],
        )
        output_cases.append({
            "name": case["name"],
            "input": {
                "portfolio": {
                    "voo": asdict(portfolio.voo),
                    "schd": asdict(portfolio.schd),
                    "tbills": asdict(portfolio.tbills),
                    "roth": asdict(portfolio.roth),
                },
                "base_income": asdict(case["base_income"]),
                "pre_tax_cash_shortfall": case["pre_tax_cash_shortfall"],
                "state": asdict(case["state"]),
            },
            "output": asdict(plan),
        })

    result = {
        "tax_config": config.section("tax"),
        "optimizer_config": optimizer_cfg,
        "cases": output_cases,
    }
    out_path = Path(__file__).resolve().parent / "lifetime-tax-optimizer.fixtures.json"
    out_path.write_text(json.dumps(sanitize_infinities(result), indent=2))
    print(f"Wrote {out_path} ({len(output_cases)} cases)")


if __name__ == "__main__":
    main()
