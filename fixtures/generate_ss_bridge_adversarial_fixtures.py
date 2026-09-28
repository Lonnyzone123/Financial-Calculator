"""
Adversarial fixture for PortfolioBridgeProjector's _rank_sources() tiebreak --
same audit-pass pattern as the optimizer's adversarial fixtures. Python's
sorted(key=lambda item: (item.marginal_cost, item.source)) tuple comparison
breaks a marginal-cost tie by source NAME, alphabetically. This is a real
translation risk: a JS port using only numeric comparison (or an unstable/
wrong secondary key) would silently reorder the greedy allocation whenever
two sources' costs land exactly equal -- which happens for real, not just in
a contrived test, whenever real_portfolio_return == real_safe_return and
roth_shadow_cost == schd_principal_penalty == 0 (a genuinely reachable
config, not just a synthetic one).

Run from C:\\Calculator merge:
    python fixtures/generate_ss_bridge_adversarial_fixtures.py
"""
import json
import sys
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.model_types import Account, Portfolio, TaxIncome  # noqa: E402
from retirement_model_v2.social_security_valuation import SocialSecurityPlanningState, PlanningScenario  # noqa: E402
from retirement_model_v2.social_security_bridge import PortfolioBridgeProjector  # noqa: E402

# All four candidate sources configured to cost exactly the same: equal
# expected returns (so growth is identical for equity and safe sources
# alike), and zero roth/schd penalties.
optimizer_config = {
    "candidate_sources": ["tbills", "voo", "roth", "schd"],
    "roth_shadow_cost": 0.0,
    "schd_principal_penalty": 0.0,
    "sequence_penalty_multiplier": 4.0,
    "max_tax_iterations": 30,
    "tax_convergence_nominal": 1.0,
}
reserve_config = {"protected_final_months": 0.0}
ss_config = {"fra_age": 67, "claim_max_age_months": 840, "claim_cycle_start_calendar_month": 1, "scheduled_benefit_fraction": 1.0}

projector = PortfolioBridgeProjector(ss_config=ss_config, optimizer_config=optimizer_config, reserve_config=reserve_config, calculator=None)

state = SocialSecurityPlanningState(
    decision_year=2025, decision_age_months=65 * 12, retirement_year=1, inflation_factor=1.0,
    spending_real=40000.0, spending_floor_real=30000.0,
    voo_real=100000.0, voo_basis_real=60000.0, schd_real=100000.0, schd_basis_real=60000.0,
    tbills_real=100000.0, roth_real=100000.0, reserve_months=12.0, equity_drawdown=0.0,
    base_income_nominal=TaxIncome(), fra_monthly_benefit_real=1000.0,
)
portfolio = Portfolio(
    voo=Account("voo", state.voo_real, state.voo_basis_real, True),
    schd=Account("schd", state.schd_real, state.schd_basis_real, True),
    tbills=Account("tbills", state.tbills_real),
    roth=Account("roth", state.roth_real),
)

# real_portfolio_return == real_safe_return -- equity and tbills growth
# factors are then identical too, so ALL FOUR sources tie exactly.
tied_scenario = PlanningScenario(name="tied", real_portfolio_return=0.03, real_safe_return=0.03, inflation_rate=0.02, tax_income_real_growth=0.0, weight=1.0)

ranked = projector._rank_sources(portfolio=portfolio, planning_state=state, months_to_claim=24, scenario=tied_scenario)
ranked_sources = [item.source for item in ranked]
ranked_costs = [item.marginal_cost for item in ranked]
assert ranked_sources == ["roth", "schd", "tbills", "voo"], f"unexpected order: {ranked_sources}"
assert len(set(ranked_costs)) == 1, f"costs did not actually tie: {ranked_costs}"

# A second case: break the tie for exactly one pair (voo gets a tiny real
# cost bump via a nonzero schd_principal_penalty instead, isolating schd)
# to confirm the fixture isn't accidentally testing a degenerate all-equal
# case that a bug could pass by coincidence (e.g. a sort that does nothing).
optimizer_config_partial_tie = dict(optimizer_config, schd_principal_penalty=0.05)
projector2 = PortfolioBridgeProjector(ss_config=ss_config, optimizer_config=optimizer_config_partial_tie, reserve_config=reserve_config, calculator=None)
ranked2 = projector2._rank_sources(portfolio=portfolio, planning_state=state, months_to_claim=24, scenario=tied_scenario)
ranked2_sources = [item.source for item in ranked2]
# schd now costs strictly more than the other three, which still tie among
# themselves -- expect [roth, tbills, voo, schd] (alphabetical among the
# three tied ones, schd pushed to the end).
assert ranked2_sources == ["roth", "tbills", "voo", "schd"], f"unexpected partial-tie order: {ranked2_sources}"

output = {
    "all_tied": {"ranked_sources": ranked_sources, "ranked_costs": ranked_costs},
    "partial_tie_schd_penalized": {"ranked_sources": ranked2_sources},
}
out_path = Path(__file__).resolve().parent / "ss-bridge-adversarial.fixtures.json"
out_path.write_text(json.dumps(output, indent=2))
print(f"Wrote {out_path}: all_tied={ranked_sources}, partial={ranked2_sources}")
