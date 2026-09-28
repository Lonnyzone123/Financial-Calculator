"""
Adversarial/edge-case stress fixtures for LifetimeTaxOptimizer, added during
a Phase 5 audit pass. Targets specific translation-risk areas identified by
a line-by-line code review of the JS port:

  - max_tax_iterations=0: originally targeted Python's `for...else` on an
    EMPTY range (a loop that runs zero times has still "completed without
    break"). The post-audit-repair engine (WD-001) now explicitly rejects
    max_tax_iterations<1 with ValueError before that code path is ever
    reached, so this case now proves the JS port raises the same rejection
    rather than proving the for-else semantics (still covered by the
    max_tax_iterations=1 case below in spirit, though that no longer exhausts
    an empty range either since 1 is now the floor).
  - max_tax_iterations=1: exactly one pass, either converges or falls
    straight to the non-convergence path.
  - A genuinely non-convergent scenario (near-zero tolerance forces the
    fixed-point iteration to exhaust every iteration for real, not just via
    a degenerate max_iterations).
  - Single active source (exercises the localSimplexGrid len(active)==1
    shortcut, which is structurally different from the multi-source path).
  - All sources zero-bounded (empty `active` list -- the optimizer's
    earliest-exit branch).
  - A tie in objective score across multiple weight candidates (exercises
    min()'s first-occurrence-wins tie-breaking, ported as `minBy`).

Run from C:\\Calculator merge:
    python fixtures/generate_lifetime_tax_optimizer_adversarial_fixtures.py
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
from retirement_model_v2.lifetime_tax_optimizer import LifetimeTaxOptimizer  # noqa: E402

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
        decision_year=2040, age=65, retirement_year=1, inflation_factor=1.3,
        spending_real=60000.0, portfolio_real=1000000.0, taxable_value_real=600000.0,
        roth_value_real=200000.0, reserve_real=100000.0, reserve_months=20.0,
        equity_drawdown=0.0,
    )
    base.update(overrides)
    return KnownState(**base)


def run_case(name, cfg, portfolio, base_income, shortfall, state):
    input_payload = {
        "optimizer_config": cfg,
        "portfolio": {k: asdict(getattr(portfolio, k)) for k in ("voo", "schd", "tbills", "roth")},
        "base_income": asdict(base_income),
        "pre_tax_cash_shortfall": shortfall,
        "state": asdict(state),
    }
    optimizer = LifetimeTaxOptimizer(calculator, cfg, decision_log=None)
    try:
        plan = optimizer.optimize(portfolio=portfolio, base_income=base_income, pre_tax_cash_shortfall=shortfall, state=state)
    except ValueError as exc:
        return {"name": name, "input": input_payload, "expect_error": str(exc)}
    return {"name": name, "input": input_payload, "output": asdict(plan)}


def main():
    cases = []

    # 1. max_tax_iterations=0: the for-else-on-empty-range edge case.
    cfg_zero_iter = dict(optimizer_cfg)
    cfg_zero_iter["max_tax_iterations"] = 0
    cases.append(run_case(
        "max_tax_iterations_zero",
        cfg_zero_iter,
        make_portfolio(voo=400000, schd=300000, tbills=100000, roth=200000),
        TaxIncome(ordinary_income=30000.0),
        45000.0,
        make_state(),
    ))

    # 2. max_tax_iterations=1: exactly one pass.
    cfg_one_iter = dict(optimizer_cfg)
    cfg_one_iter["max_tax_iterations"] = 1
    cases.append(run_case(
        "max_tax_iterations_one",
        cfg_one_iter,
        make_portfolio(voo=400000, schd=300000, tbills=100000, roth=200000),
        TaxIncome(ordinary_income=30000.0),
        45000.0,
        make_state(),
    ))

    # 3. Extremely tight tolerances with a taxable (VOO-heavy) allocation.
    # Note: with a tbills-heavy allocation this converges trivially in one
    # pass regardless of tolerance tightness, because a non-taxable source
    # realizes no gain and so leaves tax == base_tax (difference == 0
    # exactly) -- discovered empirically while designing this case, not
    # assumed. Forcing candidate sources toward voo/schd (taxable) makes the
    # tax actually move between iterations, giving real iteration-count
    # coverage beyond the max_tax_iterations=0/1 edge cases above.
    cfg_tight = dict(optimizer_cfg)
    cfg_tight["tax_convergence_nominal"] = 1e-9
    cfg_tight["tax_convergence_relative"] = 1e-12
    cfg_tight["candidate_sources"] = ["voo", "schd"]
    cases.append(run_case(
        "tight_tolerance_taxable_sources_only",
        cfg_tight,
        make_portfolio(voo=400000, schd=300000, tbills=100000, roth=200000, voo_basis=100000, schd_basis=80000),
        TaxIncome(ordinary_income=30000.0, social_security=28000.0),
        45000.0,
        make_state(),
    ))

    # 4. Single active source (only tbills funded) -- exercises
    # localSimplexGrid's len(active)==1 shortcut.
    cases.append(run_case(
        "single_active_source_tbills_only",
        optimizer_cfg,
        make_portfolio(voo=0, schd=0, tbills=80000, roth=0),
        TaxIncome(ordinary_income=10000.0),
        30000.0,
        make_state(),
    ))

    # 5. All sources zero-bounded (empty active list -- earliest-exit branch).
    cases.append(run_case(
        "all_sources_zero_bounded",
        optimizer_cfg,
        make_portfolio(voo=0, schd=0, tbills=0, roth=0),
        TaxIncome(ordinary_income=10000.0),
        30000.0,
        make_state(),
    ))

    # 6. Shortfall of exactly zero with funded sources (objective driven
    # entirely by base tax / terminal-value tradeoffs -- a case where many
    # weight combinations plausibly tie or nearly tie on required_cash=0).
    cases.append(run_case(
        "zero_shortfall_tie_prone",
        optimizer_cfg,
        make_portfolio(voo=200000, schd=200000, tbills=200000, roth=200000),
        TaxIncome(ordinary_income=50000.0),
        0.0,
        make_state(),
    ))

    # 7. Extremely large shortfall relative to portfolio (heavily infeasible,
    # stresses the "available sources cannot fund" path across every
    # candidate, not just the winning one).
    cases.append(run_case(
        "extreme_shortfall_all_candidates_infeasible",
        optimizer_cfg,
        make_portfolio(voo=1000, schd=1000, tbills=1000, roth=1000),
        TaxIncome(),
        10_000_000.0,
        make_state(),
    ))

    # 8. Zero-value portfolio entirely (all sources exactly 0 -- distinct
    # from case 5's "bounded to zero via config", this is zero via the
    # accounts themselves).
    cases.append(run_case(
        "zero_value_portfolio",
        optimizer_cfg,
        make_portfolio(voo=0, schd=0, tbills=0, roth=0),
        TaxIncome(),
        0.0,
        make_state(),
    ))

    def sanitize(value):
        if isinstance(value, float):
            if value == float("inf"):
                return "Infinity"
            if value == float("-inf"):
                return "-Infinity"
            if value != value:
                return "NaN"
            return value
        if isinstance(value, dict):
            return {k: sanitize(v) for k, v in value.items()}
        if isinstance(value, list):
            return [sanitize(v) for v in value]
        return value

    out_path = Path(__file__).resolve().parent / "lifetime-tax-optimizer-adversarial.fixtures.json"
    out_path.write_text(json.dumps(sanitize({"tax_config": config.section("tax"), "cases": cases}), indent=2))
    print(f"Wrote {out_path} ({len(cases)} cases)")


if __name__ == "__main__":
    main()
