# Simulation Log

Ad-hoc financial-simulation sweeps run directly against the live engine
(`engine.runPlan` / `engine.simulatePlan`), outside the committed `npm test`
suite. This is exploratory QA, not a substitute for the test suite or the
audit registers (`REAUDIT_2_AUDIT_AND_CLAUDE_HANDOVER_20260910.md`,
`ADVERSARIAL_HANDOVER_ADDENDUM_20260910.md`, `SPRINT_QUESTIONS.md`) --
findings that turn into real issues should be routed into those through the
normal process, not resolved here. This file exists only to keep a dated
record of what was run, against which build, and what came of it.

Each entry records the date, time, and exact model version (git commit) the
sweep ran against, so a later reader can tell whether a since-fixed or
since-changed code path invalidates an old finding.

---

## 2026-09-11 -- Batch 1

**Model version:** commit `315ccb3` ("Q42: the S3 audit brief was never
committed, and nine of its cards have no other name"), working tree dirty at
run time (`FEATURES.md`, `ROADMAP_EXTERNAL_REVIEW.md`, `src/debt-revolving.js`
locally modified, uncommitted -- none of the three touch `engine.js` or
`app-shell.html`, so they don't affect the sweep below).

**Harness:** ad-hoc Node script requiring `src/engine.js` directly, building
plans via `tests/lib/golden-scenario-defs.js` (`extractDefaultPlan` +
`buildScenario`), and re-running each plan through the same
reconciliation-invariant sweep `tests/reconciliation-invariant.test.js` uses
(`simulatePlan` with an issues collector on every Monte Carlo path).

**Baseline check:** full `npm test` run first -- green. The only non-passing
lines were the two intentional `# EXCLUDED under decision register P19`
revival-contract witnesses in `tests/audit-rc-findings.test.js`, already
tracked as expected.

**Scenarios run (10):**

| # | Scenario | Result |
|---|---|---|
| 1 | FIRE early retiree (30->45, $50k spend, endAge 90) | clean |
| 2 | High earner MFJ, RMD + QCD + Roth conversions | clean |
| 3 | Survivor: spouse much older, dies mid-retirement | clean |
| 4 | Guardrails strategy, high-volatility Monte Carlo | clean (failed=true as expected -- harsh market) |
| 5 | Underfunded retiree: low balance, high spending, endAge 100 | clean (failed=true as expected -- genuinely underfunded) |
| 6 | High income single filer, Roth phaseout + dividends | clean |
| 7 | Healthcare + LTC stress near retirement | clean |
| 8 | Debt-heavy net worth (mortgage + revolving balances) | **FINDING** -- see below |
| 9 | Social-Security-only retiree, near-zero accounts | clean |
| 10 | Edge case: retire at endAge (retireAge == endAge == 100) | clean |

**Finding: forced debt payoff at `payoffAge` can dump an unbounded lump sum onto retirement spending**

- A newly-added debt defaults `paymentMonthly` to `0`
  (`normalizeDebt()`, `src/app-shell.html:510`), and nothing validates or
  warns that a payment doesn't cover accruing interest --
  `src/scenario-validator.js:658` only warns on a *negative* payment.
- `projectDebts()` (`src/engine.js:784`) correctly negative-amortizes an
  underpaying debt -- this half is intentional and already covered by
  `tests/debt-projection-divergence.test.js` (the B-6 fix).
- The uncovered part: when the debt reaches its `payoffAge`, the engine
  forces the *entire remaining balance* -- however inflated by years of
  negative amortization -- to be paid as one lump sum out of retirement
  spending (`debtFlow.retirementPayments` feeds `requested` in
  `simulatePlan`). `tests/contribution-and-debt-projection.test.js:184`
  tests that the forced payoff zeroes the debt's own balance, but never
  follows the consequence into `runPlan()`'s cash flow.
- Minimal repro: a single $20,000 debt at 20% APR with `paymentMonthly: 0`,
  `payoffAge: 75`, in a plan retiring at 65 -- balance reaches ~$123M by age
  74, then forces a ~$150.7M withdrawal at age 75 that wipes a ~$70M
  portfolio to exactly $0 with a $93.9M unmet shortfall, with
  `calculationErrorCode` staying `null` throughout (it just looks like an
  ordinary underfunded-retirement failure).
- Not yet triaged into the audit process or fixed -- see whoever picks this
  up next for disposition. Full write-up and repro script are in this
  session's transcript (2026-09-11).

**Other invariant findings:** none. 0 reconciliation mismatches, 0 non-finite
values, 0 negative balances/taxes/withdrawals across all 10 scenarios and
every Monte Carlo path swept.

---

## 2026-09-11 -- Batch 2

**Model version:** commit `c765929` ("S3-15 and S3-16: a card that could not
be read was reported as paid off"). Diff from Batch 1's commit (`315ccb3`)
touched only `src/debt-revolving.js` (an excluded/unreachable module per the
S2 decision register) and `SPRINT_QUESTIONS.md` -- `engine.js` and
`app-shell.html` unchanged, so this batch is directly comparable to Batch 1.

**Harness:** same as Batch 1, with one addition -- `global.DebtAmortization`
is now set from `src/debt-amortization.js` before requiring `engine.js`,
matching what `tests/arm-payment-reamortization.test.js` does. (Batch 2's
first run of the ARM scenario below threw `DebtAmortization is not defined`
without this; that was a gap in the harness, not the app -- the real page
loads `debt-amortization.js` as a script tag ahead of `engine.js`.)

**Scenarios run (10):**

| # | Scenario | Result |
|---|---|---|
| 1 | ARM mortgage, rate reset, recast-on-reset enabled | clean (after harness fix) |
| 2 | Glide path + reserve + bond tent, all three together | clean |
| 3 | Inter-account transfer at age 50 | clean |
| 4 | Max-salary contributions hitting IRS limits, redirect policy | clean |
| 5 | Spousal SS: spouse claims 62, self delays to 70, 12-year age gap | clean |
| 6 | VPW (variable percentage withdrawal) strategy | clean |
| 7 | Extreme Guyton-Klinger guardrails (tight bands, large adjustment) | clean (failed=true as expected -- 300-path Monte Carlo under a harsh volatility setting) |
| 8 | Underfunded retiree with home-equity fallback enabled | clean -- traced row-by-row; `homeEquityFallback` correctly stays inactive until the portfolio hits $0 (age 74), then draws the home's accessible equity down before any real shortfall appears (age 79+) |
| 9 | Historical returns + rolling history, near array wraparound | clean |
| 10 | Dense combo: manual withdrawal order + HSA + healthcare + rule55 | clean |

**Findings:** none new. 0 reconciliation mismatches, 0 non-finite values, no
negative balances/taxes/withdrawals/spending, no single-year spending spikes,
across all 10 scenarios.

---

## 2026-09-11 -- Batch 3

**Model version:** ran against the live working tree while another process
was actively committing to this repo concurrently -- HEAD moved from
`c765929` (Batch 2's version) to `9e5b6fd` ("S3-06: damaged output was
classified immaterial, three different ways") during or shortly after this
batch, and that range includes a real 2-line change to `src/engine.js`
(the CR2-01 fix: a pretax-to-taxable inter-account transfer wasn't
recognizing the distribution as ordinary income). Exactly which side of that
commit Batch 3 ran on isn't known precisely, but it doesn't matter here --
none of Batch 3's scenarios use `transferOn`, so none are affected either
way. Flagging the concurrent activity itself for the record: something else
was actively landing commits in `C:\Calculator merge` during this session.

**Harness:** same as Batch 2, including the `global.DebtAmortization` setup.

**Scenarios run (10):**

| # | Scenario | Result |
|---|---|---|
| 1 | Three simultaneous well-funded debts (mortgage + auto + student loan) | clean -- spot-checked row-by-row; each debt amortizes and pays off independently at its own `payoffAge` (auto at 40, student loan at 48, mortgage at 65), with property tax/insurance correctly continuing after the mortgage itself is paid off |
| 2 | LTC fully offset by insurance (insurance >= cost) | clean |
| 3 | Spouse dies before retirement (spouseLife < retireAge), survivor on | clean |
| 4 | Zero accounts: pure Social Security + pension household | clean (failed=true as expected -- SS + pension income is genuinely less than spending, no portfolio to cover the gap) |
| 5 | Contributions stop 15 years before retirement (career gap / early FI) | clean |
| 6 | Head-of-household filing, single earner, high salary | clean |
| 7 | QCD far exceeds RMD (small pretax balance, large QCD request) | clean (failed=true as expected -- tiny $60k IRA against default $60k spending with no other income; `qcdRequested=min(rmd,qcd*duration)` correctly capped the QCD at the small RMD) |
| 8 | Escalating contributions via futureChanges (3 step-ups over 10 years) | clean |
| 9 | 82-year horizon: age 18 to endAge 100 | clean |
| 10 | Mixed contribution modes (percent-of-salary + flat dollar) with salary growth | clean |

**Findings:** none new. 0 reconciliation mismatches, 0 non-finite values, no
negative balances/taxes/withdrawals/spending/debt balances, no single-year
spending spikes, across all 10 scenarios.

**Running total across all 3 batches:** 30 scenarios, 1 real finding (the
debt-payoff-runaway from Batch 1), 2 harness-only false alarms (both
self-inflicted missing-global setup issues, corrected before being counted).

---

## 2026-09-11 -- Batch 4

**Model version:** commit `a69d13d` ("S3-05: the parity comparison was making
the two sides equal"). `src/engine.js` and `src/app-shell.html` are
byte-identical to Batch 3's `9e5b6fd`, so this batch is directly comparable
to Batch 3 -- the only drift is in `src/scenario-validator.js` (dirty,
uncommitted at run time), which this batch's harness never loads (it builds
plans directly and calls `engine.runPlan`, bypassing the validator
entirely, same as every prior batch). Concurrent activity in this repo is
still ongoing -- HEAD has moved on every check so far this session
(`315ccb3` -> `c765929` -> `9e5b6fd` -> `a69d13d`).

**Harness:** same as Batch 3.

**Scope:** deliberately targeted fields/features unused in Batches 1-3 --
spending stages, one-time retirement expenses, `otherIncomes` (rental,
part-time work, a one-time inheritance), `optimizationGoal` ('legacy' and
'taxes'), AIME/bend-point Social Security (`ssAdvanced`), a custom 4-asset
allocation with an explicit correlation, employer match + profit-share +
partial vesting, per-source surplus policy, an over-requested Roth
conversion, and a spouse-owned account.

**Scenarios run (10):**

| # | Scenario | Result |
|---|---|---|
| 1 | Three-stage retirement spending (go-go / slow-go / no-go) | clean -- see note below |
| 2 | One-time retirement expenses (roof, wedding gift, new car) | clean |
| 3 | Multiple other-income streams: rental + part-time work + one-time inheritance | clean |
| 4 | Legacy/bequest optimization goal with preserveRoth | clean |
| 5 | Tax-minimizing optimization goal, large pretax balance | clean |
| 6 | Advanced Social Security: AIME/bend-point PIA instead of flat benefit | clean |
| 7 | Custom 4-asset allocation with explicit correlation, no glide (400-path Monte Carlo) | clean |
| 8 | Employer match + profit sharing + partial vesting (40%) | clean |
| 9 | Per-source surplus policy: RMD forced to spend, everything else retained | clean |
| 10 | Roth conversion requested larger than available pretax + spouse-owned account | clean |

**Note on #1 (go-go/slow-go/no-go):** reported `failed=true, successRate=0`
despite ending with a *positive and growing* balance ($96,801 at age 95),
which looked suspicious enough to trace row-by-row. It's correct: the
portfolio genuinely hits $0 with a real shortfall at ages 84-85 (the
Go-go/Slow-go spending outpaced it), `failed` is sticky once any shortfall
occurs, but the No-go stage then drops spending below the household's own
Social-Security benefit (grown by 2.8% COLA for over 20 years), so the
surplus SS income -- under the default `retain` surplus policy -- gets
invested back into the now-empty portfolio and it climbs again for the
plan's last decade. An accurate account of a real (if late-recovering)
failure, not a defect.

**Findings:** none new. 0 reconciliation mismatches, 0 non-finite values, no
negative balances/taxes/withdrawals/spending/debt balances, no single-year
spending spikes, across all 10 scenarios and all Monte Carlo paths swept.

**Running total across all 4 batches:** 40 scenarios, 1 real finding (the
debt-payoff-runaway from Batch 1), 2 harness-only false alarms (self-corrected).

---

## 2026-09-11 -- Batch 5

**Model version:** commit `0a3d121` ("Q33's witness outlived its repair by a
day"). `src/engine.js` and `src/app-shell.html` are byte-identical to
Batch 4's `a69d13d`, so directly comparable. Working tree dirty at run time
with `src/debt-refinance.js`, `src/scenario-validator.js`,
`tools/capture-baseline.js` and a schema-catalogue fixture/lib modified --
none of which this batch's harness loads (same bypass-the-validator setup as
every prior batch). Concurrent activity in this repo continues (fifth
distinct HEAD this session: `315ccb3` -> `c765929` -> `9e5b6fd` ->
`a69d13d` -> `0a3d121`).

**Harness:** same as Batch 4.

**Scope:** the remaining withdrawal strategies engine.js dispatches on
(`fixedReal`, `fixedNominal`, `constantPercent`, `guyton`, `rmd`,
`floorCeiling` -- leaves only `incomeFirst`/`guardrails`/`vpw` from earlier
batches uncovered as "tried"), the post-down-year `flexibility` spending cut,
a state-tax variation (California), an explicit pretax-to-taxable transfer
(chosen specifically to regression-check the CR2-01 fix that landed
mid-session in Batch 3/4's window), and `otherAssets` spanning all three
liquidity tiers (`liquid`/`limited`/`illiquid`) at once.

**Scenarios run (10):**

| # | Scenario | Result |
|---|---|---|
| 1 | fixedReal (inflation-adjusted fixed real spending) | clean |
| 2 | fixedNominal + 1.5% investment fee | clean |
| 3 | constantPercent of balance | clean |
| 4 | guyton (skip-inflation-on-down-year), historical 1929 stress sequence | clean |
| 5 | rmd strategy (spend-remaining-balance-over-remaining-years formula), pre-RMD age | clean -- large terminal-year withdrawal is the formula correctly draining the last of the balance in the final year (remaining=1) |
| 6 | floorCeiling | clean |
| 7 | Spending flexibility cut after a down year, high-volatility Monte Carlo | clean (failed=true as expected -- harsh 300-path sweep) |
| 8 | High-tax-state comparison (California) at high income | clean |
| 9 | Pretax-to-taxable transfer, regression check on the CR2-01 fix | clean -- traced row-by-row: the $100k transfer is correctly recognized as ordinary income in the transfer year (MAGI +$143k, taxes +$36.8k) rather than passing through untaxed |
| 10 | otherAssets across all three liquidity tiers, drawn during a shortfall | clean -- traced row-by-row: home-equity fallback stays inactive until the portfolio hits $0 (age 77), then draws the combined pool down asymptotically per each asset's `accessPct` cap (a percentage of the *remaining* balance each period, so it decays toward but never quite reaches zero -- the $12.69 left at age 90 is that decay tail, not a rounding bug) |

**Findings:** none new. 0 reconciliation mismatches, 0 non-finite values, no
negative balances/taxes/withdrawals/spending/debt balances, no single-year
spending spikes, across all 10 scenarios and all Monte Carlo paths swept.

> **Correction added 2026-09-11 (after Batch 7):** scenario #10's mixed
> contribution modes used `contributionMode: 'percent'`, which is **not** a
> value the engine recognizes -- the only two valid values are `'dollar'` and
> `'salaryPct'` (confirmed against `src/app-shell.html`'s own account-form
> code and `accountPlannedContribution()`'s dispatch in `src/engine.js:27`).
> `'percent'` silently fell through to flat-dollar semantics, so that account
> contributed a flat **$10/year**, not 10% of salary as intended -- the
> scenario reported "clean" honestly, it just never tested the salary-percent
> path it was named for. Batch 7's scenario #1 re-runs the same intent with
> the correct `'salaryPct'` string and confirms the real mechanism works.

**Running total across all 5 batches:** 50 scenarios, 1 real finding (the
debt-payoff-runaway from Batch 1), 2 harness-only false alarms
(self-corrected). Withdrawal-strategy coverage is now complete (all 9 named
strategies exercised at least once).

---

## 2026-09-11 -- Batch 6

**Model version:** commit `db1874a` ("CR2-02 through CR2-06: five findings,
three of them reopening our own repairs"). `src/engine.js` and
`src/app-shell.html` byte-identical to Batch 5's `0a3d121`, so directly
comparable. Concurrent activity in this repo continues (sixth distinct HEAD
this session).

**Harness:** same as Batch 5.

**Scope:** a no-income-tax state, the app's own named `STRESS_YEARS`/
`FAVORABLE_YEARS` historical presets (2008 and 1954), the Roth IRA MAGI
phaseout band, heavy embedded capital gains, mixed dividend qualification,
`penaltyException` (distinct from `rule55`), a deliberately mismatched
`glideOn`/`assetsOn` flag pair, a `networthOn=false` + `homeEquityFallback`
consistency check, and two same-tax-class accounts near the joint IRMAA
cliff under a manual withdrawal order.

**Scenarios run (10):**

| # | Scenario | Result |
|---|---|---|
| 1 | No-income-tax state (Texas) at high income | clean |
| 2 | Historical stress-year preset: 2008 | clean |
| 3 | Historical favorable-year preset: 1954 | clean |
| 4 | Roth IRA contribution inside the MFJ phaseout band | clean, but see note below -- my own scenario setup missed `spouseOn: true`, so it didn't actually land in the phaseout band as intended |
| 5 | Heavy embedded capital gains (5% basis), forced liquidation | clean (failed=true -- plausible depletion, $150k spend not deep-traced this round) |
| 6 | Mixed dividend qualification (40%) with dividends on | clean |
| 7 | penaltyException flag, early withdrawal at 52 | clean |
| 8 | Mismatched flags: glideOn true, assetsOn false | clean -- confirmed inert, output identical in kind to assetsOn-off scenarios elsewhere |
| 9 | networthOn=false + homeEquityFallback=true + otherAssets present | **soft finding** -- see below |
| 10 | Two same-tax-class taxable accounts near the joint IRMAA cliff, manual order | clean (failed=true -- plausible depletion, $210k spend not deep-traced this round) |

**Note on #4:** caught my own harness mistake before reporting it as a
finding -- I forgot `profile.spouseOn: true`, so `rothPhaseoutFactor()`
computed MAGI from the self salary alone ($150k, well under the $242k MFJ
floor) and returned a full-contribution factor of `1`, not the ~`0.5`
mid-band value I intended to exercise. Re-ran `rothPhaseoutFactor()`
directly with `spouseOn: true` and combined MAGI $247,000 (dead center of
the $242k-$252k band): it returned exactly `0.5`, matching the linear
phaseout formula by hand. The function is correct; my scenario input wasn't
what I meant to write.

**Finding #9 (soft): `networthOn=false` doesn't stop `homeEquityFallback` from spending an asset the net-worth display claims isn't being counted**

- Traced row-by-row: with `networthOn: false`, the `networth` field is
  always exactly equal to `total` (the liquid portfolio) -- as expected,
  since that flag's whole job is "should assets/debts count toward net
  worth." But `retirement.homeEquityFallback` (`src/engine.js:1552`) isn't
  gated on `networthOn` at all -- it keeps drawing real cash out of
  `otherAssets` the moment the portfolio hits $0, regardless of that flag.
- In the repro, the household draws down $700k+ of home equity via
  `nonPortfolioDraw` over 13 years while `networth` reports flat `$0` the
  entire time.
- Unlike Batch 1's finding, nothing here is numerically wrong -- every
  number is finite, sane, and reconciles. The concern is scope/naming: a
  toggle whose label reads as "should this data affect the plan" actually
  only controls what one summary field displays, while the underlying
  otherAssets data keeps fully participating in retirement funding either
  way. A user who turns off net-worth tracking (e.g., to declutter the
  dashboard) without deleting their entered home/asset data would have no
  way to know the simulation is still quietly relying on it.
- Not triaged into the audit process -- flagging for whoever picks this up
  next to decide whether it's working as intended (otherAssets always fund
  retirement; `networthOn` only ever controlled display) or worth gating.

**Other findings:** none new. 0 reconciliation mismatches, 0 non-finite
values, no negative balances/taxes/withdrawals/spending/debt balances, no
single-year spending spikes, across all 10 scenarios.

**Running total across all 6 batches:** 60 scenarios, 2 findings (Batch 1's
debt-payoff-runaway, and this batch's networthOn/homeEquityFallback scope
mismatch), 2 harness-only false alarms and 1 harness-only setup mistake
(all self-corrected, none reflect an app defect).

---

## 2026-09-11 -- Batch 7

**Model version:** commit `d4d203a` ("The closure package, re-cut at
`bcb5757` and qualified from its extraction"). `src/engine.js` and
`src/app-shell.html` byte-identical to Batch 6's `db1874a`, so directly
comparable. Concurrent activity in this repo continues (seventh distinct
HEAD this session).

**Harness:** same as Batch 6, plus three standalone direct checks (calling
exported engine functions directly, no `runPlan`) to verify specific
mechanisms rather than just scanning row output.

**Scope:** the real `contributionMode` enum (`'dollar'`/`'salaryPct'` --
see the Batch 3 correction above), automatic contribution escalation via
`annualChangeMode`/`changeTiming`/`frequency` (distinct from the
`futureChanges` mechanism used in Batch 3), a life-insurance net-worth
payout at death, a debt excluded from retirement spending
(`includePayment: false`), the non-default `withdrawalTiming` values
(`annual`, `quarterly`), QCD and a Roth conversion competing for the same
RMD reservation in one year, the remaining account types (`roth401k`,
`customTaxable`, `customTraditional`, `customRoth`), an unused-field check
on `debt.taxDeductible`, and an other-asset marked permanently unavailable.

**Scenarios run (10):**

| # | Scenario | Result |
|---|---|---|
| 1 | `contributionMode: 'salaryPct'` correctly exercised | clean -- direct check confirms `accountPlannedContribution()` returns exactly $10,000 for 10% of a $100k salary |
| 2 | Automatic contribution escalation (3%/yr via `annualChangeMode`/`changeTiming`/`frequency`) | clean |
| 3 | Life insurance payout added to net worth at death | clean -- confirmed the $250,000 `advanced.insurance` amount appears in `networth` exactly once `rowAge >= selfLife` (networth - total = 250,000 at the traced row) |
| 4 | Debt excluded from retirement spending (`includePayment: false`) | clean |
| 5 | `withdrawalTiming: 'annual'` | clean |
| 6 | `withdrawalTiming: 'quarterly'` | clean |
| 7 | QCD and Roth conversion competing for the same RMD reservation | clean |
| 8 | Remaining account types: `roth401k` + `customTaxable` + `customTraditional` + `customRoth` | clean |
| 9 | `debt.taxDeductible` true vs. false, otherwise identical | clean -- direct check confirms byte-identical output either way: the field is currently **inert** (no mortgage-interest tax effect is modeled) |
| 10 | An other-asset marked permanently unavailable (`available: false`) | clean -- direct check confirms its value never moves (stays exactly $500,000 at 0% growth) even while `homeEquityFallback` drains every *available* asset around it |

**Findings:** none new from this batch's own scenarios. Two direct checks
turned into **confirmations of existing findings/observations rather than
new ones**:
- `debt.taxDeductible` is a real, validator-recognized field
  (`src/scenario-validator.js`) that has no effect anywhere in `engine.js` --
  worth knowing if anyone goes looking for why a mortgage's "tax deductible"
  checkbox doesn't change a household's taxes, but low severity (no
  numerical harm, arguably a scoped-out feature rather than a bug) and not
  written up as its own Q entry.
- The unavailable-asset gate works correctly -- included here to close the
  loop on Batch 6's `homeEquityFallback` finding (Q44): the fallback
  respects `available`/`availableAge` correctly, it just isn't gated on
  `networthOn`.

0 reconciliation mismatches, 0 non-finite values, no negative
balances/taxes/withdrawals/spending/debt balances, no single-year spending
spikes, across all 10 scenarios.

**Documentation update (per request):** the two real findings (Batch 1's
debt-payoff-runaway, Batch 6's `networthOn`/`homeEquityFallback` scope
mismatch) are now also recorded in `SPRINT_QUESTIONS.md` as Q43 and Q44,
adapted from that document's usual "judgment call decided" format to an
honest "discovered defect, undecided" format since neither has been triaged
yet. `ENGINEERING_LOG.md` and `ROADMAP_EXTERNAL_REVIEW.md` were deliberately
**not** touched -- per `[[project-roadmap-doc-split]]`, both update only at
the close of a large development sprint or an external-audit round, and an
ad-hoc QA sweep is neither.

**Running total across all 7 batches:** 70 scenarios, 2 findings (now filed
as SPRINT_QUESTIONS.md Q43 and Q44), 1 low-severity inert-field observation,
2 harness-only false alarms and 1 harness-only setup mistake (all
self-corrected, none reflect an app defect).

---

## 2026-09-11 -- Batch 8

**Model version:** commit `285a865` ("Stop pinning question numbers in
planning docs; derive them at sprint start"). `src/engine.js` and
`src/app-shell.html` byte-identical to Batch 7's `d4d203a`, so directly
comparable. Worth noting: this commit is itself a direct response to Q43/Q44
from this log's Batch 6/7 write-up -- another session has already flagged
both for S5 triage. Concurrent activity in this repo continues (eighth
distinct HEAD this session).

**Harness:** same as Batch 7, plus three more direct checks.

**Scope:** the remaining `optimizationGoal` values (`success`, `spending`),
a non-preTax-source transfer in both directions (taxable->Roth, Roth->
taxable), `surplusPolicy='spend'` (global), `retainedCashOrder='last'`,
`preserveRoth` alone, a gap between spending stages, three more
`otherIncomes` types (`investment`, `taxFree`, `other`), mixed fixed +
adjustable debts together, `debt.owner`, a large spousal age gap (to settle
how `retireAge` applies per-person), `rmdSmoothing`/`irmaaGuard` explicitly
toggled off, a dense stages+expenses+otherIncomes combo, an unreachable
legacy target, and two "kitchen sink" scenarios stacking most of a category
of features at once.

**Scenarios run (21 -- slightly over the requested 20, miscounted while
writing the list):**

| # | Scenario | Result |
|---|---|---|
| 1-2 | `optimizationGoal`: `success`, `spending` | clean -- see note below |
| 3 | Transfer taxable -> Roth | clean |
| 4 | Transfer Roth -> taxable | clean |
| 5 | `surplusPolicy='spend'` (global) | clean |
| 6 | `retainedCashOrder='last'` | clean |
| 7 | `preserveRoth` alone | clean -- see note below |
| 8 | Spending stages with a gap (ages 78-82 uncovered) | clean |
| 9 | `expenses[].kind`: `'expense'` vs `'withdrawal'` | clean -- **inert field**, see below |
| 10-12 | `otherIncomes` types: `investment`, `taxFree`, `other` | clean |
| 13 | Mixed fixed + adjustable debts simultaneously | clean |
| 14 | `debt.owner`: `'self'` vs `'spouse'` | clean -- **inert field**, see below |
| 15 | Large spousal age gap (spouse 40, self 60, shared `retireAge` 65) | clean -- see note below |
| 16 | `rmdSmoothing: false`, heavy pretax concentration | clean |
| 17 | `irmaaGuard: false` near the joint IRMAA cliff | clean (failed=true -- plausible: $210k spend against the balance provided) |
| 18 | Dense combo: stages + one-time expense + three `otherIncomes` streams | clean |
| 19 | Legacy target far exceeding what the plan can leave ($50M target, ~$740k start) | clean (failed=true -- normal spending alone already exceeds what the small starting balance sustains; the unreachable legacy target doesn't itself cause any error) |
| 20 | Kitchen sink 1: 400-path Monte Carlo, glide + reserve + bondTent + custom 3-asset allocation | clean (failed=true, successRate 91.25% -- expected variance under a real stress sweep) |
| 21 | Kitchen sink 2: survivor + RMD + QCD + conversion + dividends + healthcare together | clean |

**Note on #1, #2, #7 (identical output to each other and to `balanced`):**
looked suspicious enough to check directly. Called
`smartWithdrawalOrder()` across all five goals on the same base plan: `taxes`
produces a different order (`taxable` first instead of `preTax` first), but
`balanced`, `success`, `spending`, and `legacy` all resolve to the identical
`[preTax, taxable, roth, hsa]` order for this particular plan -- the
class-level score gaps (RMD proximity, preTax-under-59.5 penalty) are large
enough here that the smaller goal-specific nudges (a handful of points) never
flip the order. Confirmed as an explained non-finding, not a defect: the
function *is* goal-aware, this base plan just isn't shaped to expose it.

**Note on #15 (spousal age gap):** confirmed directly that `retireAge` is a
single number applied to **each person's own age independently** -- there is
no separate `spouseRetireAge` field. With self at 60 and spouse at 40 sharing
`retireAge: 65`, the spouse's own income/contributions continue for another
25 years (until the spouse's own age hits 65), not just the 5 years until
self retires. This is consistent with the schema (one `retireAge` field,
no household-synchronized alternative) and not a bug, but worth stating
plainly since a reader could otherwise mistake it for one.

**Third and fourth inert-field confirmations:** `expenses[].kind` (`'expense'`
vs `'withdrawal'`) and `debt.owner` (`'self'` vs `'spouse'`) both produced
byte-identical output regardless of value, joining `debt.taxDeductible`
(Batch 7) as validator-recognized fields with no effect anywhere in
`engine.js`. Not written up as new Q entries individually -- three
low-severity, same-shape observations noted here for whoever eventually
does a pass on decorative-vs-functional fields.

**Findings:** none new. 0 reconciliation mismatches, 0 non-finite values, no
negative balances/taxes/withdrawals/spending/debt balances, no single-year
spending spikes, across all 21 scenarios and all Monte Carlo paths swept.

**Running total across all 8 batches:** 91 scenarios, 2 real findings (Q43,
Q44 -- both already picked up for S5 triage by another session), 4
low-severity inert-field observations, 2 harness-only false alarms and 1
harness-only setup mistake (all self-corrected).

---

## 2026-09-11 -- Batch 9

**Model version:** commit `1d43a9f` ("The closure package, re-cut at
`69c3697` with all five rounds closed"). `src/engine.js` picked up a real
33-insertion/2-deletion change since Batch 8's `285a865`: the RP-01 fix
mentioned in this session's earlier cross-session message from the peer
session working the audit register -- `moveFunds()` now refuses a
same-account transfer (source === destination) as a no-op decided before any
basis/income math runs, closing a bug where such a transfer minted basis out
of nothing. Irrelevant to this batch either way -- none of these 10
scenarios use `transferOn` -- but recorded since it's a real, identified
`engine.js` change mid-session. Ninth distinct HEAD this session.

**Harness:** same as Batch 8, plus one more direct check.

**Scope:** `otherIncomes` with `growthMode='cola'`, quarterly
contribution-escalation periods (`frequency=4`, `changeTiming='period'`), a
declining late-life spending stage (negative `annualChange`), survivor
reduction combined with an active spending stage, a debt whose `payoffAge`
had already passed at the plan's start, partial LTC insurance offset,
dividends starting well into retirement, a malformed `otherIncomes` entry
(`end < start`) fed straight to the engine bypassing the validator, a
permanently negative `simple`-method return assumption, and `otherAssets`
`accessPct` edge values (`0` and `150`, the latter should clamp to 100).

**Scenarios run (10):**

| # | Scenario | Result |
|---|---|---|
| 1 | `otherIncomes` with `growthMode='cola'` | clean |
| 2 | Quarterly contribution escalation (`frequency=4`) | clean |
| 3 | Declining late-life spending stage (`annualChange: -2%/yr`) | clean |
| 4 | Survivor reduction + an active spending stage together | clean (failed=true -- plausible depletion under the combined reduction) |
| 5 | Debt with `payoffAge` already in the past at plan start | clean |
| 6 | Partial LTC insurance offset (covers half the cost) | clean |
| 7 | Dividends starting 10 years into retirement | clean |
| 8 | Malformed `otherIncomes` entry (`end < start`) | clean -- see note below |
| 9 | Permanently negative return assumption (`returnRate: -3%`) | clean (failed=true -- a market that only ever loses money for 40 years genuinely depletes any portfolio) |
| 10 | `otherAssets` `accessPct` edge values (0 and 150) | clean -- see note below |

**Note on #8 (malformed `otherIncomes`, `end: 65` before `start: 80`):**
worked through `otherIncomeFor()`'s guard by hand rather than just trusting
the clean scan: with `end < start`, every period satisfies at least one of
its two early-return conditions (`ownerEnd <= i.start` while age is still
below the nonsensical start, or `ownerAge > i.end` once age passes 65) --
there is no age at which both are false simultaneously, so the entry
mathematically can never pay out. Confirmed by comparison it contributed
exactly $0 for the whole horizon rather than crashing or producing a
negative-duration payment. Good defensive behavior against malformed input
that reaches the engine directly (this harness bypasses
`scenario-validator.js` entirely, same as every batch) -- not something a
real user could enter through the UI's own start/end fields regardless.

**Note on #10 (accessPct edge values):** direct check on the first
fallback-draw row confirms both edges exactly: the `accessPct: 0` asset
sits completely untouched (`otherAssets: 200000`, unchanged from its
starting value) while the `accessPct: 150` asset was drawn for exactly its
full $100,000 value in one shot -- `clamp(150, 0, 100)` correctly capped it
at 100%, not 150%.

**Findings:** none new. 0 reconciliation mismatches, 0 non-finite values, no
negative balances/taxes/withdrawals/spending/debt balances, no single-year
spending spikes, across all 10 scenarios.

**Running total across all 9 batches:** 101 scenarios, 2 real findings (Q43,
Q44, both in the S5 triage queue), 4 low-severity inert-field observations,
2 harness-only false alarms and 1 harness-only setup mistake (all
self-corrected).

---

## 2026-09-12 -- Batch 10

**Model version:** commit `3d2953b` ("S5/S6: six gaps, and one is a hard
blocker on monteCarlo cutover"). `src/engine.js` and `src/app-shell.html`
byte-identical to Batch 9's `1d43a9f`, so directly comparable. Tenth
distinct HEAD this session, spanning into a new calendar day (2026-09-12).

**Harness:** same as Batch 9, with heavier use of direct function calls
(`auditContributions()`, `contributionLimit()`) alongside full `runPlan()`
scenarios, to isolate contribution-limit machinery specifically.

**Scope:** the shared HSA family base split across two spousal owners, the
combined IRA limit across two account types for one owner, the SECURE 2.0
workplace catch-up ladder (base / regular catch-up / enhanced catch-up), the
RMD-start-age boundary around the 1959 birth-year cohort,
`limitPolicy='redirect'` with no taxable account to redirect into,
`limitPolicy='warn'` (a third policy value, not tried before), a
`returnPreset` inert-field check, a debt whose `payoffAge` falls after the
plan's own `endAge`, `salaryPct` capped by a flat dollar limit at high
income, and both spouses independently in the enhanced-catchup age window.

**This batch surfaced more of my own scenario-construction mistakes than
usual -- three separate ones, all caught and corrected before being reported
as findings.** All three trace to the same root cause: forgetting a flag
this project's other tests have to set explicitly too (`contributionStop`
twice, `advanced.rmdOn` once), not an engine defect. Recorded here in full
rather than quietly fixed and re-run silently, since the failure mode itself
-- "a scenario reports a boring result because it never actually tested what
it claims to" -- is exactly what Batches 3 and 6 already flagged in my own
work, and a fourth and fifth occurrence in one batch is worth being visible
about rather than smoothing over.

| # | Scenario | Result |
|---|---|---|
| 1 | Shared HSA family limit, both spouses | **initially wrong, corrected** -- see below |
| 2 | Combined IRA limit, traditionalIRA + rothIRA, same owner | clean (failed=true -- a $7,500/yr IRA-only contribution funding a $60k/yr default retirement spend for 25 years is a genuinely underfunded plan, confirmed plausible) |
| 3 | Workplace catch-up ladder (ages 45/55/61) | live-sim portion also hit the `contributionStop` issue; **the substantive question was answered by the direct `contributionLimit()` calls instead** -- see below |
| 4 | RMD-start-age boundary (66/67/68) | **initially wrong (missing `rmdOn`), corrected** -- see below |
| 5 | `limitPolicy='redirect'`, no taxable account | clean -- `limitWarnings` correctly reports "Excess contributions could not be redirected because no taxable account exists." |
| 6 | `limitPolicy='warn'` | clean -- direct check confirms the full $100,000 requested contribution is deposited despite exceeding the ~$24,500 limit, exactly what "warn, don't enforce" should do |
| 7 | `returnPreset` inert-field check | clean -- confirmed inert (5th such field, after `taxDeductible`, `expenses[].kind`, `debt.owner`; this one is expected to be inert by design, a pure UI preset-picker that fills in `returnRate`/`volatility` rather than being read by the engine itself) |
| 8 | Debt `payoffAge` beyond the plan's `endAge` | clean -- never force-paid within the horizon, amortizes normally throughout |
| 9 | `salaryPct` capped by the workplace dollar limit at high income | clean -- lands on the exact same final numbers as #5 by construction (20% of $500k and a flat $100,000 request both exceed the same $24,500ish cap and get capped to it identically), confirming percent-mode contributions are not exempt from the dollar limit |
| 10 | Both spouses independently in the enhanced-catchup window | **initially wrong, corrected** -- see below |

**#1 corrected:** the scenario used the default `employment.contributionStop:
55` while both spouses (58 and 60) start already past it, so the live
simulation contributed exactly $0 the entire run -- correct given the input,
but not what the scenario meant to test. Re-run with `contributionStop: 65`:
row 1 contributions are exactly **$9,750** (self's $6,000 request fits
entirely within the $8,750 family base; spouse's $6,000 request gets $2,750
of the remaining base plus their own $1,000 age-55+ catch-up room, since
self used none of the catch-up room and it isn't shared). Confirms the
family base splits correctly in priority order and that HSA catch-up room
is tracked **per owner**, not pooled.

**#3 (catch-up ladder) note:** same `contributionStop: 55` issue meant the
live simulation's contributions actually stopped right as the catch-up
tiers were meant to begin, so the end-to-end scenario never really exercised
them. Didn't re-run it -- the direct `engine.contributionLimit('workplace',
age, 'single')` calls already answered the actual question authoritatively,
since they call the exact function `simulatePlan()` uses: **$24,500** at 45,
**$32,500** at 55 (regular catch-up), **$35,750** at 61 (SECURE 2.0 enhanced
catch-up, ages 60-63). All three tiers confirmed correct.

**#4 corrected:** the scenario never set `advanced.rmdOn: true` (default
`false`), so no RMD fired at any age in any of the three runs -- again
correct given the input, not what was intended. Re-run with `rmdOn: true`:
birth year 1960 (age 66 start) first RMDs at row-age 76 (crossing the age-75
threshold within that period); birth years 1959 and 1958 (ages 67 and 68
start) both first RMD at row-age 74 (crossing the age-73 threshold) --
confirming the documented 2-year difference between the "1960 or later"
cohort and the "1959 estimate" / "1951-1958" cohorts (which share the same
73 threshold via different provisions) is applied correctly at the boundary.

**#10 corrected:** same `contributionStop: 55` issue (both spouses already
past it at 61/62). Re-run with `contributionStop: 68`: row 1 contributions
are exactly **$70,000** -- both spouses' $35,000 requests fully allowed,
each under their own $35,750 enhanced-catchup limit independently. Confirms
the enhanced catch-up is **not** pooled across spouses, matching the
`group+":"+owner` keying in `auditContributions()`.

**Findings:** none new (all three corrected checks confirm correct engine
behavior, not defects). 0 reconciliation mismatches, 0 non-finite values, no
negative balances/contributions/debt balances, across all 10 scenarios
(post-correction).

**Running total across all 10 batches:** 111 scenarios, 2 real findings (Q43,
Q44, in the S5 triage queue), 5 low-severity inert-field observations, 2
harness-only false alarms, and now 4 harness-only setup mistakes total (all
self-corrected, none reflect an app defect) -- worth watching if this rate
continues, since it says more about scenario-authoring rigor at this volume
than about the engine.

---

## 2026-09-12 -- Batch 11

**Model version:** commit `7192878` ("Post-cutover sweep: three unreceived
deferrals, snap-to-grid, and two prediction gaps"). `src/engine.js` and
`src/app-shell.html` byte-identical to Batch 10's `3d2953b`, so directly
comparable. Eleventh distinct HEAD this session.

**Harness:** same as Batch 10, plus direct calls to the pure bracket
functions (`marginalRateAt`, `capitalGainsMarginalRateAt`) for
pinpoint-precise boundary checks that a full simulation can't reliably land
on exactly.

**Scope:** the ordinary-income and LTCG tax bracket edges, NIIT, the IRMAA
2-year MAGI lookback, simultaneous spousal death, PMI behavior across a full
mortgage payoff, an other-asset whose `availableAge` is never reached within
the horizon, duplicate account ids (a deliberate robustness probe), a
0%-interest debt, and declining dividend growth.

**Scenarios run (10):**

| # | Scenario | Result |
|---|---|---|
| 1 | High MFJ ordinary income near the $211,400 bracket line | clean |
| 2 | LTCG realization straddling the $98,900 MFJ threshold | clean |
| 3 | NIIT triggered past $250,000 MFJ MAGI | clean |
| 4 | IRMAA 2-year MAGI lookback | initial version tested nothing -- see note below |
| 5 | Simultaneous spousal death (`selfLife === spouseLife`) | clean |
| 6 | PMI across a full mortgage payoff | clean numerically -- **real modeling simplification found**, see below |
| 7 | Other-asset `availableAge` never reached in the horizon | clean |
| 8 | Duplicate account ids | **correctly rejected at the input boundary**, see below |
| 9 | 0%-interest debt | clean |
| 10 | Declining dividend growth (`dividendGrowth: -5%/yr`) | clean |

**#8 is the most interesting result of this batch, and it isn't a bug.**
Feeding a plan with two accounts sharing the id `'dup'` made my own harness
crash (`rows` was `null`, and my script assumed an array). Traced it to
`accountContractCode()` (`src/engine.js:548`) and `runPlan()`'s input gate:
the engine deliberately rejects a plan with a duplicate account id **before**
simulating anything, returning the documented "invalid result" contract
(`status: "calculation_error"`, `calculationErrorCode:
"SCENARIO_DUPLICATE_ACCOUNT_ID"`, and `rows`/`failed`/`successRate`/
`lifetimeTaxes` all explicitly `null`) rather than running the plan on
ambiguous data. The code comment names this as the CL-01 fix from an earlier
audit round -- a real historical incident where an id of `"__proto__"`
defeated a plain-object duplicate check via prototype pollution, and this is
the hardened replacement. I hit the exact case this defense exists for, by
accident, and it worked. Fixed the harness to recognize `rows: null` as a
valid rejection shape rather than crashing on it.

**#4 (IRMAA lookback) needed a second attempt.** The first version gave a
household only a `traditionalIRA` and turned `conversionOn` on with a
$300,000 amount -- but with no Roth account to convert *into*, the
conversion had nowhere to go and silently converted $0 every year, so the
"spike" and "baseline" runs were bit-for-bit identical the whole way
through. Same shape as Batches 3, 6 and 10's self-corrections: a clean scan
that never actually exercised what it was built to test. Re-run with a
`rothIRA` account added: MAGI now visibly spikes to ~$480k for the three
years the $300k/yr conversion runs (ages 64-66, until the IRA is drained),
confirming the conversion mechanism and `magiHistory` tracking work. I did
not go on to isolate the exact dollar amount of the resulting IRMAA
surcharge in the `health` cost line 2 years later before running out of
budget for this batch -- the mechanism is confirmed connected, the precise
lag amount is not independently pinned down. Worth a dedicated follow-up if
IRMAA precision specifically becomes a question.

**#6 (PMI) confirms a real simplification, not a numerical bug.** Traced
`debtHousing` (PMI + property tax + insurance + HOA) across the full 20-year
payoff of a mortgage that started at exactly 80% loan-to-value: the $2,160/yr
PMI charge is **perfectly flat every single year**, from age 46 through age
65, only dropping to $0 the year *after* the loan is completely paid off
(age 66). Real mortgages cancel PMI automatically once the balance drops to
78-80% LTV under the Homeowners Protection Act, typically years before
full payoff -- this model has no such logic; PMI is charged as a flat cost
for the entire life of any loan with a nonzero `pmiMonthly`, `balance > 0`.
That's a modeling choice, not a crash or reconciliation break (0 mismatches,
confirmed), but it will make any long mortgage payoff with PMI entered look
more expensive than reality for however many years PMI would have actually
been cancelled. Not written up as a Q entry -- flagging here for whoever
next touches the housing-cost modeling to decide if it's in scope.

**Direct bracket-boundary checks**, exact and correct at every edge:
`marginalRateAt(211400, 'mfj') = 0.22`, `marginalRateAt(211401, 'mfj') =
0.24`; `capitalGainsMarginalRateAt(98900, 'mfj') = 0`,
`capitalGainsMarginalRateAt(98901, 'mfj') = 0.15`. Bracket tables are
correctly inclusive of their own cap (`income <= cap`), consistent at both
tested boundaries.

**Findings:** none new (the duplicate-id rejection is correct behavior, not
a defect; the PMI simplification is a modeling-scope observation, not a
numerical error). 0 reconciliation mismatches, 0 non-finite values, no
negative balances/taxes/debt balances, across the 9 scenarios that produced
rows (the 10th was a deliberate, correct rejection).

**Running total across all 11 batches:** 120 scenarios (9 producing rows, 1
correctly rejected), 2 real findings (Q43, Q44, in the S5 triage queue), 5
low-severity inert-field observations, 1 real modeling-simplification
observation (PMI), 2 harness-only false alarms, 5 harness-only setup
mistakes total (all self-corrected), and 1 confirmed input-validation
defense working exactly as designed.

---

## 2026-09-12 -- Batch 12

**Model version:** commit `bdecf16` ("The closure package, re-cut at
`3f32509` with the round-11 repairs in it"). `src/engine.js` and
`src/app-shell.html` byte-identical to Batch 11's `7192878`, so directly
comparable. Twelfth distinct HEAD this session.

**Harness:** same as Batch 11, leaning further on direct function calls
(`seniorDeduction`, `taxableSocialSecurity`) for boundary precision, plus a
plan-purity/determinism check across two fully independent plan builds.

**Scope:** the senior-deduction MAGI phaseout, whether its documented 2028
sunset is enforced anywhere, the Social Security 50%/85% taxability
thresholds, the survivor benefit's step-up to the higher of two SS amounts,
payroll tax on wages, a guardrails floor below what a portfolio can sustain,
zero-volatility Monte Carlo, an `rng(0)` edge case, finishing Batch 11's
open IRMAA-lag question, and a determinism check.

**Scenarios/checks run (8 full scenarios plus direct checks -- fewer
full scenarios than usual this round; more of the substantive verification
came from direct function calls, which is where the real finding surfaced):**

**Initially reported as a finding, corrected the same day -- see below.**
`RULES.federal.seniorDeduction` carries `"expiresAfter": 2028` and
`seniorDeduction()` (`src/engine.js:164`) has an arity of exactly 3
(`magi, ages, filing`) -- no year or date parameter exists, so this function
cannot implement a sunset. Confirmed the phaseout math itself is correct at
three points ($6,000 full amount under $150k MFJ MAGI, still $6,000 exactly
at the $150k phaseout start, fully phased to $0 at $250k), and ran a live
40-year household crossing 2028 showing the deduction never disappears.
Filed as `SPRINT_QUESTIONS.md` Q46.

**Correction, same day, before this reached anyone's queue:** should have
checked the app's own "Rules used" disclosure page first.
`src/app-shell.html:1020` tells the user directly, in the running app:
*"The temporary senior deduction is $6,000 per eligible person. It phases
out above the stored MAGI thresholds and expires after 2028, but this fixed
2026 package intentionally does not roll tax law forward."* This is
disclosed, intentional behavior -- not an undiscovered gap. `expiresAfter`
is metadata for a human maintainer deciding when to publish a future rules
package, not a runtime instruction the engine is missing. Q46 is updated in
place with this correction rather than deleted, since the "is this pattern
true elsewhere" question it raises may still be worth someone's five
minutes, but the underlying finding is closed, not open. Recorded here as a
reminder to check a feature's own in-app disclosure text before treating an
`engine.js`/`RULES` mismatch as a defect -- the mismatch was real, the
conclusion I drew from it wasn't.

**Other results, all clean:**

| Check | Result |
|---|---|
| Senior deduction phaseout at $150k+ MAGI (live scenario) | clean |
| Survivor SS step-up (spouse's larger benefit) | clean -- `Math.max(selfAmount, spouseAmount)` at `src/engine.js:1119` already read this session as the documented R2-003(a)/T04 repair; live scenario ran with no anomalies |
| Payroll tax on $400k wages | ran with the account's contribution left at its `0` default (my own oversight, sixth such setup miss this session, not re-run) -- but the substantive question was already answered directly from source: `estimateTaxes()` genuinely computes OASDI, Medicare, and the additional 0.9% Medicare surtax on wages (`src/engine.js:166`), and `lifetimeTaxes` came back a plausible, non-degenerate figure consistent with that |
| Guardrails floor below sustainable level | clean, no crash |
| Zero-volatility Monte Carlo (200 paths) | clean -- converges to **exactly** the same `lifetimeTaxes` ($622,459.92) as the equivalent deterministic baseline seen in earlier batches, confirming volatility=0 correctly collapses all paths to the deterministic result |
| `rng(0)` (zero seed, 50 Monte Carlo paths) | clean, no degenerate all-zero randomness, no crash |
| Determinism: two plans built from two independent `extractDefaultPlan()` calls (re-parsing the HTML source twice, no shared object references at all) | **byte-identical rows confirmed** -- no hidden module-level mutation between runs |

**IRMAA 2-year lookback (finishing Batch 11's open thread): fully confirmed, precisely.**
Re-traced the same Roth-conversion spike with `spending`-difference isolated
instead of `magi`: the surcharge appears in `spending` exactly 2 rows after
each elevated MAGI reading and tracks its *magnitude* correctly through the
threshold tiers as historical MAGI declines --

| row age | MAGI this row | spending delta (spike vs. baseline) | 2-years-prior MAGI driving this row's surcharge |
|---|---|---|---|
| 66 | 481,144 | **+6,355** | age 64's 479,089 (elevated) |
| 67 | 276,629 | **+6,355** | age 65's 482,295 (elevated) |
| 68 | 0 | **+6,355** | age 66's 481,144 (elevated) |
| 69 | 0 | **+2,885** (drops a tier) | age 67's 276,629 (lower, conversions ended) |
| 70 | 0 | **0** | age 68's 0 (fully drained) |

The lag is exactly 2 rows/years at every point, and the surcharge correctly
steps down a tier rather than cutting off abruptly once the elevated MAGI
ages out of the lookback window. Mechanism confirmed correct and precise --
no follow-up needed.

**Other self-corrections, honestly recorded:** the Social Security
taxability boundary checks used `otherIncome` values I intended to land the
function's internal `combined = otherIncome + benefit*0.5` exactly on the
$32,000/$44,000 thresholds, but forgot the `+ benefit*0.5` term, so the
actual `combined` values tested were $20,000 higher than the labels suggest.
The six values printed are still smooth and monotonic around those
(mislabeled) points with no discontinuity, so nothing suggests a cliff-edge
bug -- but the exact legislated threshold itself wasn't precision-tested
this round. Low-stakes given the smooth trend, not re-run.

**Findings:** 1 new (senior deduction 2028 sunset), 0 reconciliation
mismatches, 0 non-finite values, no negative balances/taxes, across all
scenarios that produced rows.

**Running total across all 12 batches:** 128 scenarios/checks, 3 real
findings (Q43, Q44 in the S5 triage queue -- Q46, the senior-deduction
sunset, filed and then corrected the same day: disclosed/intentional
behavior, not a defect), 5 low-severity
inert-field observations, 1 modeling-simplification observation (PMI), 2
harness-only false alarms, 6 harness-only setup mistakes total (all
self-corrected), 1 confirmed input-validation defense, and 1 fully-confirmed
mechanism (IRMAA lookback) that an earlier batch left open.

---

## 2026-09-12 -- Batch 13

**Model version:** commit `267bf9c` ("The closure package, re-cut at
`40d7afe` with the round-12 repairs in it"). `src/engine.js` and
`src/app-shell.html` byte-identical to Batch 12's `bdecf16`. Thirteenth
distinct HEAD this session.

**Harness:** same as Batch 12. Applied the lesson from the Q46 correction
immediately: before writing up anything as a finding this round, checked
whether the app's own "Rules used" disclosure page (`src/app-shell.html`,
the section rendered from `RULES.meta`/`RULES.socialSecurity`/etc.) already
discloses it as a known simplification, the way it honestly does for the
senior deduction and Roth catch-up forcing.

**Headline finding: the Social Security earnings test is claimed as implemented and is not**

- `src/app-shell.html:1038` tells the user, unconditionally, whenever Social
  Security is configured: *"The earnings-test amounts are $24,480 below full
  retirement age and $65,160 in the year full retirement age is reached."*
  Unlike its neighboring disclosures (senior deduction: *"but this fixed
  2026 package intentionally does not roll tax law forward"*; Roth
  catch-up: *"this package does not force Roth catch-ups in 2026"*), this
  sentence carries **no caveat** -- it reads as a plain statement of
  implemented behavior, and it's listed as one of the rules "used" whenever
  `ssBenefit` is set.
- Confirmed by direct search that `engine.js` never references
  `earningsTest`, `underFRA`, or `fraYear` anywhere. `ssaBenefitAtClaim()`
  (`src/engine.js:728`) computes only the early/delayed claiming actuarial
  adjustment -- nothing in the codebase ever checks current wages against
  the earnings-test limit or withholds any benefit for it.
- **This is fully reachable, not a constructed edge case.** Claiming Social
  Security early while still working full-time is a completely normal,
  fully-supported input combination (`ssClaim` as low as 62, salary/
  `retireAge` independent of it) -- exactly the situation the earnings test
  exists to govern, and exactly the situation real financial advisors most
  often warn people about because of it.
- **Quantified the gap directly:** a $120,000/yr earner claiming at 62 (SS
  benefit $2,500/mo = $30,000/yr) is $95,520 over the $24,480 earnings-test
  limit, which in reality withholds $47,760 -- more than the entire annual
  benefit, i.e. **100% of it should be withheld** until the earnings drop or
  FRA is reached. This calculator pays the full benefit regardless, with no
  reduction of any kind.
- Checked adjacent cases for completeness: claiming exactly at FRA while
  still working shows no reduction in this calculator, which happens to
  match reality (the real earnings test also stops applying at FRA) -- but
  for the wrong reason, since nothing in the code actually knows FRA is the
  boundary that matters here either.

**A related code-level gap that is NOT user-reachable, checked explicitly
before writing it up (applying the same lesson):** `ssaBenefitAtClaim()`'s
delayed-credit formula (`factor = 1 + (claim - fra) * delayedCreditAnnual`)
has no ceiling at `RULES.socialSecurity.latestClaimAge` (70) -- claiming at
75 computes 40% more benefit than claiming at 70, when real SSA rules give
zero additional credit past 70. However: the `v2-ss-claim` input has
`max="70"` in the HTML *and* `scenario-validator.js:452` independently
range-checks `ssClaim` to `[62, 70]`. Both the live UI and the import/
validation path already prevent this input from ever reaching the engine.
Noting it as a code-hygiene observation only -- not written up as a
Q-worthy finding, since (unlike the earnings test) there is no real path
for a user to hit it.

**Other checks, all consistent with disclosed behavior or otherwise clean:**

| Check | Result |
|---|---|
| Roth catch-up not forced for high earners in 2026 | clean -- confirmed `rothCatchupWageThreshold`/`rothCatchupMandatoryIn2026` are never referenced in `engine.js`, matching the disclosed "this package does not force Roth catch-ups in 2026" exactly |
| RMD Uniform Lifetime divisor at ages 73/90/100 | roughly consistent with the table (observed rmd/balance ratios track `1/divisor` in the right ballpark at each age); not an exact isolation since growth/inflation mix into the same ratio, so treated as a soft confirmation, not a precise one |
| Arizona flat-rate state tax | clean, no anomalies |
| Historical replay starting before 1975 (pre-COLA-series era) | clean |
| `otherIncomes` owned by `'spouse'` specifically | clean |
| Historical method + survivor + LTC combined | clean |

**Scenario-construction note:** three of the eight full scenarios (SS
earnings test, high-wage catch-up, working-past-FRA) ended at `total: 0`
because the accounts involved were deliberately built with no ongoing
contribution (or, in the catch-up scenario, hit the same default
`contributionStop: 55` miss as five earlier batches) -- but in every case
the substantive question was about **income composition in a single row**,
not portfolio accumulation, so the direct checks against `row.income`
answered it cleanly regardless. Flagging the pattern once more rather than
re-litigating it scenario by scenario.

**Findings:** 1 new, high-confidence (SS earnings test). 0 reconciliation
mismatches, 0 non-finite values, no negative balances, across all scenarios
that produced rows.

**Running total across all 13 batches:** 136 scenarios/checks, 3 real
findings (Q43, Q44 in the S5 triage queue; the SS earnings-test gap filed as
Q47, 2026-09-12), 5 low-severity inert-field
observations, 2 modeling-simplification observations (PMI, and now the
disclosed-but-real senior-deduction/Roth-catchup pattern already correctly
disclosed), 1 code-hygiene-only observation (delayed-credit cap, confirmed
unreachable), 2 harness-only false alarms, 6 harness-only setup mistakes
total, 1 confirmed input-validation defense, and 1 corrected finding (Q46,
downgraded to "not a defect" the same day it was filed).

---

## 2026-09-12 -- Batch 14

**Model version:** commit `267bf9c` (same as Batch 13 -- no drift this
round). `src/engine.js`/`src/app-shell.html` unchanged.

**Harness:** same as Batch 13, plus a 10-path Monte Carlo direct comparison
against the deterministic method for the same LTC configuration.

**Scope:** the LTC probability mechanic compared side by side between
deterministic and Monte Carlo methods, `dividendQualified` at its 0%
extreme, a negative one-time "expense" (windfall), a zero-length plan, a
`reserveYears` longer than the entire retirement horizon, `glideOn` +
`bondTentOn` together at both extreme allocation settings, `bondTentOn`
with `assetsOn` off, and a fully degenerate all-zero plan.

**Scenarios run (10):** all clean -- 0 reconciliation mismatches, 0
non-finite values, no negative totals/spending, no crashes, including the
two deliberately degenerate cases (a 1-row zero-length plan, and an
all-zero household with no accounts at all).

**Confirmed and worth documenting: LTC uses two genuinely different
mechanics depending on simulation method, both correct for their context.**
Traced directly rather than trusting the clean scan:
- **Deterministic (`simple`/`historical`) methods** apply LTC as an
  **expected-value weighting**: `ltcWeight = ltcProbability / 100` scales
  the cost every single row from `ltcStart` onward, smoothly, with no
  binary split -- appropriate for a method that has exactly one path to
  report.
- **Monte Carlo** draws a **real per-path coin flip**: `ltcRandom() <
  ltcProbability/100` decides, once per path, whether that path ever incurs
  LTC costs at all. Ran 10 individual paths at 40% probability directly (not
  through `runPlan()`'s single reported path) and saw exactly the expected
  shape: 3 of 10 paths carried the full ~$300,000 LTC cost in their
  spending sum, 7 did not -- a visible binary split, roughly consistent with
  40% at this small a sample.
- Both are intentional, sensible designs for their respective methods, not
  a bug in either. Not filed as a Q entry -- documented here since it's a
  real behavioral difference a user comparing "Simple" vs "Monte Carlo"
  results for the same LTC settings should understand, not because
  anything is wrong.

**A wrong guess on my part, corrected via source before being written up as
anything else:** expected `bondTentOn` to be inert when `assetsOn` is off,
by analogy with `glideOn` (confirmed genuinely inert under that condition in
Batch 6). Checked directly -- it isn't: `bondTentOn=true` vs `false` (both
with `assetsOn=false`) produced **different** output. Traced why in
`accountReturnForPeriod()` (`src/engine.js:1223`): `bondTentOn`'s blend
toward a fixed 4.5% "bond-like" return, weighted by a triangular strength
curve centered on `retireAge`, is applied to whatever return the account
already has -- computed *after* and independently of `accountExpected()`,
which is where `assetsOn`/`glideOn` actually live. `bondTentOn` never reads
`assetsOn` at all. This is a coherent design choice, not a bug: `bondTentOn`
is the lightweight "reduce sequence risk near retirement" feature that
works even in flat-return-rate mode, while `glideOn` is the more detailed
feature that genuinely needs multi-asset-class modeling to mean anything.
My expectation was wrong, not the code -- corrected before it became a
false finding.

**`glideOn` + `bondTentOn` together, both extremes, no conflict:** the two
mechanisms clearly compose (final totals differ substantially between
`retirementStock=0/bondTent=100` and the opposite extreme) without erroring
or silently deferring to one or the other -- consistent with the previous
point, since they operate on different, independent parts of the return
calculation.

**Findings:** none new. 0 reconciliation mismatches, 0 non-finite values, no
negative balances/spending, across all 10 scenarios.

**Running total across all 14 batches:** 146 scenarios/checks, 3 real
findings (Q43, Q44, Q47, all filed), 5 low-severity inert-field
observations, 2 modeling-simplification observations (PMI; the honestly
disclosed senior-deduction/Roth-catchup pattern), 1 code-hygiene-only
observation (delayed-credit cap), 1 documented mechanic difference (LTC
deterministic vs. Monte Carlo), 2 harness-only false alarms, 6 harness-only
setup mistakes, 1 confirmed input-validation defense, 1 corrected finding
(Q46), and 1 corrected personal assumption (`bondTentOn`/`assetsOn`).

---

## 2026-09-12 -- Batch 15 (stress test)

**Model version:** commit `c938952` ("The closure package, re-cut at
`95874ce` with the round-13 repairs in it"). `src/engine.js`,
`src/app-shell.html`, and `src/scenario-validator.js` all unchanged since
Batch 14's `267bf9c`.

**Harness:** same as Batch 14, plus a 500-iteration randomized fuzz loop
(random age/retireAge/endAge/salary/balance/method/returnRate/volatility
each iteration, all seeded and reproducible) and wall-clock timing on every
`runPlan()` call.

**Explicit goal this round: break it, not explore it.** Ten scenarios
built to push scale and combination stress rather than new features: a
kitchen-sink-squared plan (82-year horizon, 9 accounts across every account
type, nearly every retirement feature on at once, 500-path Monte Carlo),
an extreme Monte Carlo configuration (5,000 paths, 60% volatility), a
billion-dollar salary against a $2 trillion balance, eight simultaneous
debts of mixed types (including a negative-amortizing HELOC and an ARM
reset), maximally aggressive guardrails parameters under Monte Carlo,
twenty accounts sharing one priority forced into a huge simultaneous
withdrawal, every feature firing at once during the 1929 crash sequence, a
horizon far beyond the UI's own `endAge <= 100` clamp, a 500-run fuzz loop,
and blatantly invalid raw numeric inputs (negative salary/balance/spending).

**Everything held up.** All ten ran to completion (or were correctly
rejected -- see below) with 0 reconciliation mismatches across every path
swept (including the 500-path and 5,000-path Monte Carlo runs, totaling
over 270,000 rows), 0 crashes, and 0 non-finite values anywhere except where
I deliberately fed one in. Performance was not a concern at any scale
tested: the kitchen-sink 500-path run completed in 1.4s, the 5,000-path
extreme-volatility run in 1.5s, the 500-run fuzz loop in well under a
second total.

**The most interesting result: a real, working numeric-precision safety net.**
Pushing `endAge` far past the UI's own cap (300, bypassing
`normalizedPlan()`'s `Math.min(100, ...)` clamp entirely, as every batch's
harness does) didn't crash or silently produce garbage -- it was **correctly
rejected** with `calculationErrorCode: "QUOTE_SETTLEMENT_UNVERIFIED"`.
Traced why: `quoteTaxFunding()`'s settlement solver (`src/engine.js:685-690`)
independently re-verifies that the cash it computed reconciles with the tax
obligation to within a penny, and refuses to report "funded" if it doesn't --
by design, so "a non-finite value can never reach a terminal return dressed
as a real transaction" (the code's own comment). Binary-searched where this
kicks in: the portfolio total grows smoothly through $753M (endAge 100),
$1.2 trillion (180), and $4.76 quadrillion (270) before the reconciliation
check starts failing somewhere between endAge 270 and 290 -- almost exactly
where IEEE-754 double-precision floats run out of exact integer
representation (~9 quadrillion, 2^53). This is the tax solver correctly
detecting its own floating-point precision has broken down at an
astronomical scale and honestly refusing to publish a number it can't
verify, rather than reporting something wrong with confidence. Also doubly
moot for any real user: the UI clamps `endAge` to 100 in the input itself
(`normalizedPlan()`), so this is unreachable in the running app regardless.

**One minor, low-severity observation, not filed:** the deliberately invalid
raw-input scenario (negative salary, negative starting balance, negative
spending, fed directly to `engine.runPlan()`) did **not** get rejected the
way the duplicate-account-id or extreme-horizon cases were -- it ran
normally and simply carried the negative account balance through as a real
negative number (correctly reconciling; not a computation error, just
literally what I fed in). Checked `scenario-validator.js` for a
`balance >= 0` (or similar) range check on accounts/contributions/spending:
**none exists.** This is narrower than it sounds -- the live UI's own
number inputs almost certainly have `min="0"` on these fields the same way
`v2-ss-claim` has `max="70"`, so ordinary use is unaffected -- but unlike
`ssClaim`, there is no second line of defense in the import/validation path
specifically for sign. Noting it as a hardening suggestion (add a
non-negative range check for `balance`, `contribution`, and `spending` in
`scenario-validator.js`) rather than a defect, since I did not find a
realistic path for a user to construct this by accident.

**Findings:** none new. The only automated "finding" this batch was the
negative-total flag on the deliberately-invalid-input scenario, which is
expected given what was fed in, not a computed error.

**Running total across all 15 batches:** 156 scenarios/checks, 3 real
findings (Q43, Q44, Q47, all filed), 5 low-severity inert-field
observations, 2 modeling-simplification observations, 1 code-hygiene-only
observation, 1 documented mechanic difference (LTC), 1 minor hardening
suggestion (validator sign-checking), 2 harness-only false alarms, 6
harness-only setup mistakes, 2 confirmed input-validation/precision
defenses (duplicate-id rejection, extreme-horizon rejection), 1 corrected
finding (Q46), and 1 corrected personal assumption (`bondTentOn`). Nothing
in 156 scenarios has broken the engine's own accounting identity even once.

---

## 2026-09-12 -- Batch 16 (stress test, part 2)

**Model version:** commit `c938952` (as of 2026-09-12 10:37 -0700; same
commit as Batch 15 -- `src/engine.js`, `src/app-shell.html`, and
`src/scenario-validator.js` all unchanged). Sixteenth distinct HEAD this
session across the files touched.

**A more precise kind of stress this round.** Batch 15 threw scale and
combination at the engine and it held. This round targets the input-validity
boundary itself, field by field, after noticing two things while reading
`engine.js`: (1) `nonFiniteScenarioInputCode()` -- the public rejection gate
-- only checks `accounts[].balance` and, for taxable accounts,
`accounts[].basisPct`; nothing else. (2) `clone()` is literally
`JSON.parse(JSON.stringify(o))`, called on `p.accounts`,
`p.advanced.otherAssets`, and `p.advanced.debts` -- and `JSON.stringify`
silently turns `NaN`/`Infinity` into `null`. So a non-finite value inside
anything `clone()` touches may get accidentally laundered to `null` (then
usually `0`) even where no explicit check exists, while a non-finite value
in a field `clone()` never touches (assumptions/retirement/advanced scalars,
read live off `p`) gets neither the explicit gate nor the accidental
laundering.

**Mapped exactly which is which, field by field:**

| Input | Explicitly gated? | Result |
|---|---|---|
| `account.balance = NaN` / `Infinity` | Yes (`nonFiniteScenarioInputCode`) | Clean rejection, `SCENARIO_NONFINITE_ACCOUNT` |
| `account.basisPct = NaN` (taxable) | Yes | Clean rejection, `SCENARIO_NONFINITE_ACCOUNT` |
| `account.priority = NaN` | Not by the engine gate, **but yes by `scenario-validator.js:324`** | Import path: rejected. Raw engine: silently laundered to `null` -> sorts as 0, no crash, no error |
| `account.contribution = NaN` | **No -- neither the engine gate nor the validator checks this field at all** | ~~Silently laundered to `null` -> effectively $0 contributed, no error, no warning, no crash~~ **Corrected below: true only for an ineligible owner. For an eligible owner it reaches contribution arithmetic and produces a clean `calculation_error` (public `runPlan().calculationErrorCode`: `TAX_QUOTE_NONFINITE_CONTEXT`) with `rows: null` -- and the mechanism is not `clone()` at all (see correction).** |
| `assumptions.returnRate = Infinity` | No explicit gate, never cloned | Caught downstream anyway: clean rejection, `QUOTE_SETTLEMENT_UNVERIFIED` (the same precision-verification net from Batch 15) |
| `assumptions.volatility = NaN` (Monte Carlo) | No explicit gate, never cloned | Caught downstream: clean rejection, `TAX_QUOTE_NONFINITE_CONTEXT` |
| `retirement.ssBenefit = NaN` | No explicit gate, never cloned | Caught downstream: clean rejection, `TAX_QUOTE_NONFINITE_CONTEXT` |
| `advanced.qcd = Infinity` | No explicit gate, never cloned | Ran fine -- `Math.min(rmd, qcd*duration)` structurally caps its effect regardless of magnitude, so an absurd `qcd` is harmless by construction |
| `advanced.debts[0].balance = NaN` | No explicit gate, but cloned | Silently laundered to `null` -> effectively $0 debt, no error. *(This row's own mechanism is unaffected by the contribution correction below -- debts genuinely go through `clone()` with no eligibility-style short-circuit in front of it. What's retracted is only the claim, made below, that this row and `contribution` share one explanation.)* |
| `advanced.otherAssets[0].value = Infinity` | No explicit gate, but cloned | Silently laundered to `null` -> effectively $0 asset, no error. *(Same note as the row above.)* |

**Two things worth flagging, in descending order of concern:**

1. **A circular reference inside an account object crashes `runPlan()` with
   an uncaught `TypeError`** (`Converting circular structure to JSON`),
   thrown straight out of `clone()`. Every other malformed-input case tested
   this session -- duplicate ids, an extreme horizon, six different
   non-finite placements above -- gets caught and converted into a clean
   `calculation_error` result. This one doesn't; it's a genuine unhandled
   exception. **Reachability is the mitigating factor**: valid JSON can
   never encode a cycle, so this cannot arrive via a saved-scenario import,
   and nothing in the live UI's own form-building code has any reason to
   introduce one. It would only occur through direct programmatic
   construction of a plan object -- but the codebase's own stated standard
   ("the check has to live where every execution path passes, before
   `clone()` and before any cash moves," from the `nonFiniteScenarioInputCode`
   comment) is specifically about defending `clone()`'s input, and this is a
   way to defeat it that the existing checks don't anticipate.
2. **`account.contribution` has no explicit validation anywhere** -- not the
   engine's boundary gate, not `scenario-validator.js` (confirmed by
   grepping for any reference to `.contribution` in the validator: none).
   ~~Its only protection against a non-finite value is the *side effect* of
   `clone()`'s JSON round-trip, which is an implementation detail of how
   `clone()` happens to be written, not a designed defense. If `clone()`
   were ever reimplemented without going through JSON (a plausible future
   change for performance, since JSON round-tripping is a relatively slow
   way to deep-clone), this field would go from silently-defused to
   genuinely live with no other guard in place.~~

   > **Corrected 2026-09-12, same day, by another session's re-audit
   > (relayed cross-session, independently re-verified here before
   > editing).** The struck text above is wrong on its mechanism. It is
   > retained rather than deleted so the record shows what happened to it,
   > per this log's own established convention for self-corrections.
   >
   > **`contribution` never passes through `clone()` at all.**
   > `simulatePlan()` clones whole account objects into mutable working
   > copies first (`src/engine.js:1240`), but `auditContributions(p, ...)`
   > (`:1264`) is called with **the original, uncloned `p`** and internally
   > does `p.accounts.slice()` -- reading `contribution` straight off the
   > source object. No clone-related change, however `clone()` is ever
   > reimplemented, can make this field more or less exposed than it is
   > today, because the clone was never in its read path to begin with.
   >
   > **What actually happens depends on contribution eligibility, not on
   > `clone()`.** Re-verified directly (my own repro, matching the other
   > session's independent one): with the account owner still eligible to
   > contribute, `accounts[0].contribution = NaN` reaches contribution
   > arithmetic and produces a clean `calculation_error` (`rows: null`,
   > public `calculationErrorCode` `TAX_QUOTE_NONFINITE_CONTEXT` in my
   > reproduction -- the `TAX_QUOTE_` prefix is `runPlan()`'s own naming for
   > any error surfaced through the tax-quote path, per `src/engine.js:1404`;
   > the internal quote function's own bare reason string, one layer down at
   > `:587`, is `NONFINITE_CONTEXT` without the prefix. An earlier version of
   > this entry gave the bare internal string without saying which layer it
   > was reading -- corrected 2026-09-12, relayed cross-session, confirmed
   > against my own original probe output before editing: what I actually
   > printed at the time already read `TAX_QUOTE_NONFINITE_CONTEXT`, so this
   > is a transcription fix, not a re-measurement) -- not a silent zero. Only
   > when the owner is *ineligible* to contribute (my original probe's exact
   > setup, `age: 55` against the unset `contributionStop` default of `55` --
   > my ninth run-in with that same default this session) does
   > `auditContributions()`'s eligibility short-circuit return `allowed: 0`
   > before the `NaN` is ever used in arithmetic, which is what I actually
   > observed and mis-attributed.
   >
   > **The original observation was real; only its explanation was wrong.**
   > The field genuinely has no explicit validation (that conclusion stands
   > unchanged), but the reason a bad value doesn't crash today is
   > **downstream containment for an eligible owner** and **an unrelated
   > eligibility coincidence for an ineligible one** -- not `clone()` in
   > either case. Filed and corrected in `SPRINT_QUESTIONS.md` as Q49; see
   > that entry for the full verification table and the corrected candidate
   > directions.

**Other stress checks, all clean:** dangling `transferFrom`/`transferTo`
ids pointing at accounts that don't exist (`moveFunds()`'s own `if(!f||!t)`
guard handles it), correlation set to 5 (far outside `[-1, 1]`, ran without
crashing -- generalizes Q45's existing correlation-domain concern to
positive out-of-range values too, not filed separately), `returnRate =
-1000%` (the `clamp(ret, -.95, 2)` in `accountReturnForPeriod` correctly
bounds it), and 500 simultaneous debts (no crash, no slowdown).

**Extreme Monte Carlo scale, timed:** 50,000 paths (5x the UI's own 10,000
maximum) completed in 12.4 seconds with no crash and no `calculationError`
-- consistent, roughly linear scaling from Batch 15's 5,000-path/1.5s and
500-path/1.4s data points. Purely academic since the UI never allows a
household to request this many paths, but confirms there's no cliff.

**Findings:** 2 new, both filed as `SPRINT_QUESTIONS.md` Q48 (the
circular-reference crash) and Q49 (the `contribution` validation gap) on
2026-09-12, at your request.

**Running total across all 16 batches (as of `c938952`):** 166 scenarios/checks/probes, 5
filed real findings (Q43, Q44, Q47, Q48, Q49), 5 low-severity
inert-field observations, 2 modeling-simplification observations, 1
code-hygiene-only observation, 1 documented mechanic difference (LTC), 1
minor hardening suggestion (validator sign-checking, Batch 15), 2
harness-only false alarms, 6 harness-only setup mistakes, 2 confirmed
input-validation/precision defenses, 1 corrected finding (Q46), and 1
corrected personal assumption (`bondTentOn`).

---

## 2026-09-12 -- Batch 17

**Model version:** commit `e3da728` ("Discharge the uncommitted stamp on
Q47/Q48/Q49 -- source committed at `76f2c35`" -- the peer session's own
follow-through on the Batch 16 filing, confirming the commit landed as
reported). `src/engine.js`/`src/app-shell.html`/`src/scenario-validator.js`
all unchanged since Batch 16.

**Harness:** same as Batch 16, plus two direct interaction checks
(`strategySpending()` called directly at varying `flexibility` values, and
a manual-vs-optimized `withdrawalOrder` comparison).

**Scope:** a second Social-Security-shaped `otherIncomes` stream alongside
the dedicated `ssBenefit` field, `includeHousingCosts` set on a
non-mortgage debt, `survivorSpendingReduction`'s interaction with dividend
income, COLA growth for a spouse-owned income stream, two one-time expenses
landing at the same age, a dividend start date before the plan's own
starting age, a one-time income event during working years, `preserveRoth`
with no Roth account to preserve, whether `optimizationGoal` is silently
ignored under `withdrawalOrder='manual'`, and whether `flexibility` and
`guardrails` compound on the same down-year signal.

**Scenarios run (8):** all clean -- 0 reconciliation mismatches, 0
non-finite values, no crashes, across every scenario including the
deliberately odd ones (housing costs on an auto loan, `preserveRoth` with
no Roth account, an SS-shaped income stream layered on top of the real
`ssBenefit`).

**Two real interaction findings, both confirmed with direct checks rather
than inferred from a scenario's numbers:**

1. **`optimizationGoal` is silently a complete no-op whenever
   `withdrawalOrder='manual'` is selected, with no UI cue that this is
   happening.** Confirmed directly: `'legacy'` vs `'taxes'` under manual
   order produce byte-identical output, because `smartWithdrawalOrder()` --
   the only place `optimizationGoal` is read -- is never called at all when
   `withdrawalOrder==="manual"` (`src/engine.js:1380` dispatches on that
   condition directly). Checked `app-shell.html` for whether the
   optimization-goal dropdown is at least hidden or disabled when manual
   order is chosen: it isn't -- `v2-optimization-goal` renders unconditionally
   alongside `v2-withdrawal-order`, so a user who sets a goal and then
   switches to manual order (or vice versa) gets no signal that one setting
   just silently stopped mattering.
2. **`flexibility` and `guardrails` compound on the same down-year signal
   rather than being alternatives.** Called `strategySpending()` directly
   with guardrails already triggering a cut from `priorReturn = -10%`, at
   three `flexibility` values: `0` -> $54,000, `20` -> $43,200 (a further
   20% cut on top of guardrails' own adjustment), `50` -> $27,000 (a further
   50% cut). Both mechanisms read the same `priorReturn < 0` signal and
   apply independently, so a household using both gets a compounded
   reduction, not the larger of the two or a blended one. Not necessarily
   wrong -- a sophisticated user might deliberately stack two conservative
   levers -- but nothing signals that's what combining them does, and the
   two features' names read like separate strategies more than components
   meant to be layered.

**Neither written up as a Q entry from this session** -- both are
judgment-call territory (are these surprising interactions worth a UI cue,
or is "two independently configurable settings compose" simply how the
model is supposed to work?) rather than clear defects, and this log isn't
positioned to make that call. Flagging both for your read.

**Findings:** 2 interaction findings (above), 0 reconciliation mismatches,
0 non-finite values, no crashes.

**Running total across all 17 batches (as of `e3da728`):** 176
scenarios/checks/probes, 5 filed real findings (Q43, Q44, Q47, Q48, Q49),
2 new unfiled interaction findings this batch, 5 low-severity inert-field
observations, 2 modeling-simplification observations, 1 code-hygiene-only
observation, 1 documented mechanic difference (LTC), 1 minor hardening
suggestion, 2 harness-only false alarms, 6 harness-only setup mistakes, 2
confirmed input-validation/precision defenses, 1 corrected finding (Q46,
withdrawn), and 1 corrected personal assumption (`bondTentOn`).

---

## 2026-09-12 -- Batch 18

**Model version:** commit `4e37443` (this session's own Batch 16
correction). `src/engine.js`/`src/app-shell.html`/`src/scenario-validator.js`
unchanged.

**Harness:** same as Batch 17. Checked every enabling/eligibility flag
(`contributionStop`, `rmdOn`, etc.) before drawing any conclusion this
round, per the correction just applied to Batch 16 -- if a scenario looked
clean, verified it actually exercised what it was built to test rather than
trusting the clean scan alone.

**Scope:** the two differently-shaped RMD mechanisms
(`advanced.rmdOn`'s mandatory distribution and `retirement.strategy='rmd'`'s
spending formula) running simultaneously, a one-time income and a one-time
expense landing on the same age, genuinely *overlapping* spending stages
(not just a gap, as in Batch 17), a negative `salaryPct` contribution, a
debt owned by a spouse who dies before its `payoffAge`, a Roth conversion
sized to the entire preTax balance under RMD, an LTC start landing exactly
at a spousal death boundary, a directly negative (not `NaN`) account
contribution, a debt whose `payoffAge` exactly equals the household's
starting age, and two one-time income events at the same age.

**Scenarios run (10):** all clean -- 0 reconciliation mismatches, 0
non-finite values, no crashes, across all ten including the two
non-finite-adjacent-but-not-actually-invalid contribution tests.

**Confirmed: negative contributions are already safely clamped, by
design.** Both the `-10%` `salaryPct` case and the direct `-5000` dollar
case ran with no anomaly. Traced why: `accountPlannedContribution()`
(`src/engine.js:27`) ends with `return Math.max(0, amount)` -- any
negative result, however it arose, is floored to `0` before it ever
reaches contribution arithmetic. Unlike Q49's `contribution = NaN` case
(no validation, contained only by an unrelated eligibility coincidence or
downstream error-checking), a *negative* contribution has a real, deliberate
floor built into the function itself. Not the same gap; worth distinguishing
so the two don't get conflated later.

**Confirmed: overlapping spending stages resolve by array order, not by
date logic.** ~~Traced `applyStage()` (`src/engine.js:1130`): it iterates
every stage with a plain `forEach` and *overwrites* (or multiplies, for
`mode: 'percent'`) the running base for every stage whose range includes
the current age -- it does not sum matching stages, so overlapping stages
can never inflate spending by stacking.~~ ~~But it also never breaks after
the first match, so when two stages' ranges genuinely overlap, whichever
one appears **later in the `stages` array** wins for the overlapping
years, regardless of which stage a person would intuitively expect to take
priority (e.g., the one with the later start date, or the more specific
one).~~ No error, warning, or validator check on stage overlap exists.

> **Corrected 2026-09-12 (P19-H1, relayed cross-session, independently
> re-verified before editing).** The struck claim -- "cannot inflate by
> stacking" -- is wrong for `mode: 'percent'` stages. `applyStage()`
> composes **sequentially by mode**: an `amount`-mode stage *replaces* the
> running base (so "later wins" is correct there), but a `percent`-mode
> stage *multiplies* it, and multiplication composes across successive
> matching stages in the same `forEach` pass rather than replacing.
> Confirmed directly: two overlapping `mode: 'percent', value: 120` stages
> on a $100,000 base return **$144,000** (`engine.applyStage()` called
> directly), not $120,000 -- 120% of 120% of the base, not "the later one
> wins at 120%." "Later wins" only holds for `amount`-mode overlaps, which
> is all Batch 18's own scenario happened to test; the general "cannot
> inflate by stacking" claim does not hold and should not have been made
> from that one case. Not filed as its own Q entry -- same judgment-call
> character as the original observation (an input-shape issue rather than
> a validation gap), but the mechanism description is now accurate rather
> than reassuring in a way the code doesn't support.

**Other results, briefly:** both RMD mechanisms running together produced
a plausible, cleanly-reconciling depletion with no visible double-counting
artifact (not deep-traced this round given time, but nothing in the
numbers suggested one mechanism double-charging the other); a debt owned by
a spouse who dies before its `payoffAge` still force-pays from the
household portfolio exactly as expected, consistent with `debt.owner`'s
already-confirmed inertness (Batch 8) holding up even through a survivor
event; converting an entire preTax balance to Roth under RMD and same-age
overlapping one-time income/expense events both settled without issue.

**Findings:** none new requiring escalation. Two behaviors documented for
the record (negative-contribution clamping, stage-overlap array-order
resolution), neither filed as a Q entry.

**Running total across all 18 batches (as of `4e37443`):** 186
scenarios/checks/probes, 5 filed real findings (Q43, Q44, Q47, Q48, Q49),
4 unfiled interaction/behavior observations (Batch 17's two, plus this
batch's two), 5 low-severity inert-field observations, 2
modeling-simplification observations, 1 code-hygiene-only observation, 1
documented mechanic difference (LTC), 1 minor hardening suggestion, 2
harness-only false alarms, 6 harness-only setup mistakes, 2 confirmed
input-validation/precision defenses, 1 withdrawn finding (Q46), and 2
corrected explanations (`bondTentOn`; the `contribution`/`clone()`
mechanism, corrected jointly with the peer session that found it).

---

## 2026-09-12 -- Batch 19

**Model version:** commit `4e37443` (same as Batch 18 -- no drift).

**Harness:** same as Batch 18, plus a full row-by-row trace to close out
the one thing Batch 18 left un-verified.

**Closing Batch 18's open thread: the two RMD mechanisms confirmed not to
double-charge.** Traced `advanced.rmdOn` (the mandatory distribution, via
the Uniform Lifetime divisor) against `retirement.strategy='rmd'` (a
voluntary spending target, via `balance/(endAge-age+1)`) side by side,
every row, ages 73-90: the strategy's own target (`spending`, $55,556 ->
$373,569) is **larger than the mandatory RMD** (`rmd`, $37,736 -> $38,602)
in every single row. ~~The two aren't summed or reconciled against each
other anywhere -- the voluntary target simply happens to exceed the
mandatory floor throughout, at these specific inputs, so the RMD is
satisfied as a side effect of meeting the (larger) spending target rather
than through any explicit coordination between the two mechanisms.~~
Confirmed clean, no double-counting, no artifact.

> **Corrected 2026-09-12 (P19-H2, relayed cross-session, independently
> re-verified before editing).** The struck claim -- that the two
> mechanisms avoid double-counting merely by numerical coincidence, with
> "no explicit coordination" -- is wrong. `src/engine.js:1379` **does**
> explicitly coordinate them: when `rmd > 0`, the mandatory distribution is
> withdrawn from `preTax` *first*, and its usable proceeds are subtracted
> from the household's remaining spending `need`
> (`need = Math.max(0, need - rmdUsable)`) *before* the ordinary
> withdrawal-order loop runs. The mandatory RMD isn't a separate draw
> layered on top of the strategy's target -- it's applied as a down payment
> against that target, by design, every time. What genuinely varies with
> the specific numbers is only *how much* of the target the RMD ends up
> covering (all of it, some of it, or -- if the mandatory amount ever
> exceeded the target -- more than needed), not *whether* the two are
> coordinated at all. The original trace's observation (the strategy's
> target exceeds the RMD throughout, so nothing looked wrong) is still
> accurate; the explanation for *why* nothing looked wrong was incomplete.
> **Worth repeating for whoever next touches this path**: do not add a
> second RMD offset anywhere else in the withdrawal logic on the theory
> that "nothing currently accounts for it" -- the coordination at `:1379`
> already exists, and duplicating it would create a real double-count where
> none exists today.

**Scope:** spending stages in `mode='percent'` (untested until now --
distinct from `mode='amount'`, temporarily scales whatever the strategy
would otherwise pay rather than replacing it with a fixed dollar figure),
`rmdFloor` isolated under the `'rmd'` strategy, a Roth conversion request
far exceeding what's left after the RMD reservation, zero-width guardrails
bands, `survivor=true` with no spouse at all, an ARM debt with
`nextRateResetAge` never set, negative `dividendYield`, and
`dividendQualified` above 100%.

**Scenarios run (8):** all clean -- 0 reconciliation mismatches, 0
non-finite values, no crashes.

**Confirmed inert as expected, closing a consistency question:**
`survivor=true` with `spouseOn=false` ran with no effect, matching all
three call sites read this session (`strategySpending()`,
`householdSocialSecurityForPeriod()`, `smartWithdrawalOrder()`) --
each independently guards with `r.survivor && p.profile.spouseOn`
(or the equivalent), so there's no path where survivor logic activates
without a spouse actually being configured.

**Confirmed safe degradation, not a crash:** an ARM debt with
`nextRateResetAge` left unset resolves to `Number(undefined) = NaN`, and
`monthAge >= NaN` is always `false` in JavaScript -- so the loan silently
never resets and behaves exactly like a fixed-rate mortgage for its entire
life, with no error. Likely unreachable in practice since
`normalizeDebt()`'s own default populates `nextRateResetAge: 75`
whenever a debt object is created through the UI.

**Findings:** none new. Both open questions this batch set out to close
(RMD double-charging, survivor/spouseOn consistency) came back clean.

**Running total across all 19 batches (as of `4e37443`):** 194
scenarios/checks/probes, 5 filed real findings, 4 unfiled interaction/
behavior observations, 5 low-severity inert-field observations, 2
modeling-simplification observations, 1 code-hygiene-only observation, 1
documented mechanic difference (LTC), 1 minor hardening suggestion, 2
harness-only false alarms, 6 harness-only setup mistakes, 2 confirmed
input-validation/precision defenses, 1 withdrawn finding (Q46), and 2
corrected explanations.

---

## 2026-09-12 -- Batch 20

**Model version:** commit `3efba77` ("Three dangling references to an S6
task 8 that does not exist"). `src/engine.js`/`src/app-shell.html`/
`src/scenario-validator.js` all unchanged since Batch 19's `4e37443`.

**Harness:** same as Batch 19, plus a direct five-point sweep of
`dividendQualified` (0/50/100/150/200%) and a direct grep of
`scenario-validator.js` for the field's name.

**Headline finding: `dividendQualified` above 100% silently understates taxes, with no validation anywhere on the import path**

- `qualifiedDividends = dividendCash * dividendQualified / 100`
  (`src/engine.js:1381`) has no clamp. Past 100%, `qualifiedDividends`
  exceeds `dividendCash` itself, so `ordinaryDividends = dividendCash -
  qualifiedDividends` goes **negative** -- and that negative value feeds
  straight into `ordinaryIncome`, silently *reducing* it below what even a
  fully-qualified (100%) dividend should produce.
- Quantified directly, age-63 taxes for the same household at each
  `dividendQualified` value: **0% -> $5,636, 50% -> $4,558, 100% ->
  $3,481 (the real floor), 150% -> $2,604, 200% -> $1,726.** The value
  keeps dropping in a perfectly smooth, perfectly linear continuation past
  100% -- there is no plateau, no error, nothing that would catch a
  reader's eye. It looks exactly like a normal, favorable tax result.
- **This is a different failure shape from every other finding this
  session.** Q43/Q44/Q47 are omissions (a mechanism that should apply and
  doesn't). Q48/Q49 are about what happens to malformed *JavaScript*
  values (`NaN`, a cycle) that can't be expressed in JSON at all. This is
  neither: `dividendQualified: 150` is a completely ordinary-looking JSON
  number, and the result it produces is a **plausible, silently wrong tax
  figure** that a household would have no reason to question -- lower
  taxes than even the theoretically-best 100%-qualified case.
- **Reachability is the sharpest part of this one.** The live UI input has
  `min="0" max="100"` (`v2-dividend-qualified`, `app-shell.html:315`), so
  typing through the form is safe. But grepped `scenario-validator.js`
  directly: **zero references to `dividendQualified` anywhere.** Unlike
  `ssClaim` (UI max **and** validator range, Batch 13) or `priority`
  (validator range even without an engine-level gate, Batch 16), this
  field has exactly one line of defense, and it's the one a saved/edited/
  hand-modified JSON scenario file skips entirely. No `NaN`, `Infinity`, or
  circular reference is needed to hit this -- just an ordinary out-of-range
  number in an ordinary import.
- Checked the other out-of-domain direction for completeness: negative
  `dividendQualified` (e.g. `-50%`) makes `ordinaryDividends` *exceed*
  `dividendCash`, **overstating** taxes instead. Lower practical severity
  (a household would more likely notice and question unexpectedly *high*
  taxes than unexpectedly favorable ones) but the same underlying gap.

**Other scenarios, all clean:** an account with `owner: 'joint'` (a real
UI option for account types with no contribution-limit group, never tried
before -- ran without incident, though not deep-traced), duplicate debt
ids (`accountContractCode` only checks `accounts` for duplicates, not
`advanced.debts` -- but nothing looks debts up by id, so this asymmetry
appears harmless), a spending stage with `growthMode: 'none'`,
`conversionAmount: 0` with RMD active, 50 simultaneous `otherAssets`
(scale, no issue), and a contribution-escalation `frequency` of 365
(daily-period compounding, no precision blowup).

**Findings:** 1 new, well-quantified and clearly reachable. Filed as
`SPRINT_QUESTIONS.md` Q50, 2026-09-12, at your request.

**Running total across all 20 batches (as of `3efba77`):** 201
scenarios/checks/probes, 6 filed real findings (Q43, Q44, Q47, Q48, Q49,
Q50), 4 unfiled interaction/behavior
observations, 5 low-severity inert-field observations, 2
modeling-simplification observations, 1 code-hygiene-only observation, 1
documented mechanic difference (LTC), 1 minor hardening suggestion, 2
harness-only false alarms, 6 harness-only setup mistakes, 2 confirmed
input-validation/precision defenses, 1 withdrawn finding (Q46), and 2
corrected explanations.

---

## 2026-09-12 -- Batch 21 (systematic follow-up to Q50)

**Model version:** commit `733b18e` ("xref-scan: close the Exit-gate hole,
and red-test the blanking stage itself"). `src/engine.js`/
`src/app-shell.html`/`src/scenario-validator.js` all unchanged since
Batch 20's `3efba77`.

**Why this batch happened.** Batch 20's `dividendQualified` finding
(Q50) looked like it might not be isolated -- percentage/rate-shaped
retirement fields feel like a natural category to audit systematically
rather than one at a time. Grepped `scenario-validator.js` for a dozen-plus
candidate field names before writing a single scenario.

**The validator-coverage matrix, checked directly rather than assumed:**

| Field | References in `scenario-validator.js` |
|---|---|
| `dividendYield`, `dividendGrowth`, `dividendQualified` (Q50), `rmdMultiplier`, `rmdFloor`, `vpwMinRate`, `vpwMaxRate`, `matchRate`, `matchCap`, `profitShare`, `vesting`, `upperGuardrail`, `lowerGuardrail`, `adjustment`, `withdrawalRate`, `floor`, `ceiling` | **0, every one** |
| `ltcProbability`, `reserveYears`, `retirementStock` | 1 each |
| `bondTent` | 2 |

Sixteen fields with zero validator coverage. Most of them turn out to be
"extreme input, extreme but honest output" when pushed out of range (see
Group B below) -- but two of them combine with a second, independent gap
to produce something worse.

**Second root cause, checked directly:** `clamp(v,a,b) =
Math.min(b, Math.max(a,v))` (`src/engine.js:21`) has no defense against
`a > b`. When the bounds are inverted, `Math.max(v,a) >= a > b` for any
`v`, so `Math.min(that, b)` **always returns `b`**, regardless of `v`.
Several strategies pass `floor`/`ceiling` or `vpwMinRate`/`vpwMaxRate`
straight into `clamp()` as `(a, b)` with nothing upstream guaranteeing
`floor <= ceiling` or `vpwMinRate <= vpwMaxRate` -- the live UI's own
`readStatic()` computes `ceiling: Math.max(floor, ceiling)` when reading
the form, but that ordering guarantee lives **only** in that one UI
function, not in `scenario-validator.js`, and not in the engine itself.

**Confirmed, quantified, live: `floor > ceiling` silently forces spending to a constant, in three strategies**

- `floorCeiling`, `guardrails`, and `guyton` all end their spending
  formula with `amount = clamp(amount, floor*inflationFactor,
  ceiling*inflationFactor)`. Ran all three with `floor: 90000` >
  `ceiling: 40000`, under `method: 'simple'`: **all three produced
  byte-identical results** (`lifetimeTaxes: $16,533.09`, identical
  row-by-row) -- confirming the guardrails/guyton-specific adjustment logic
  that runs *before* this clamp is completely overridden by it. A household
  using any of these three strategies with a typo'd or hand-edited
  floor/ceiling pair gets spending locked to a single constant dollar
  amount for their entire retirement, with the strategy they selected
  doing nothing.

  > **Precision correction, 2026-09-12 (relayed cross-session, independently
  > re-verified: `guardrails`/`guyton` byte-identical under non-binding
  > bounds, `floorCeiling` distinct from both).** Under `'simple'`,
  > `guardrails` and `guyton` are **already identical before any
  > inversion** -- `guyton` only diverges via `guytonSkipInflation &&
  > priorReturn < 0`, and `'simple'` never produces a negative return. So
  > this specific repro demonstrates two already-equal behaviors collapsing
  > into one, not three into one. The defect is real and unaffected by this
  > -- `floorCeiling` genuinely was distinct before the inversion, and all
  > three genuinely collapse under `monteCarlo`/`historical` (where a real
  > negative-return period lets `guyton` diverge from `guardrails`) -- but
  > "three strategies collapse" should carry the method it was measured
  > under. Full correction and the control numbers in `SPRINT_QUESTIONS.md`
  > Q51.

**Confirmed, quantified, live: `vpwMinRate > vpwMaxRate` does the identical thing to VPW**

- Direct check on `strategySpending()` with `vpwMinRate: 50, vpwMaxRate:
  10` at four different balances ($500k/$1M/$2M/$5M): spending came back
  as **exactly 10.00% of balance every time**, regardless of the VPW
  formula's own life-expectancy-based calculation. Same mechanism, same
  shape of consequence, different strategy.

**Contrast group -- extreme-but-unvalidated fields that stayed honest:**
`dividendYield: 300%`, `rmdMultiplier: 500%`, and `matchRate: 1000%` /
`matchCap: 100%` all produced extreme but internally-consistent results,
not silently wrong ones -- `matchRate`/`matchCap` in particular are
protected downstream by the real IRS `totalEmployeeEmployer` dollar cap
regardless of how large the percentage inputs are. `adjustment: 150%`
(guardrails) computes a negative intermediate (`amount *= 1 - 1.5`) but
`strategySpending()`'s own final `return Math.max(0, spend)` floors it to
exactly `$0` for that year rather than a negative number -- an extreme
result, but not a wrong-signed one.

**A negative-rate case that looked like it might be a third instance, and
wasn't:** `withdrawalRate: 0%` (`fixedReal`) and `withdrawalRate: -5%`
(`constantPercent`) produced byte-identical output. Traced why before
assuming a bug: a negative `constantPercent` rate computes a negative
`amount`, which then passes through **two** independent `Math.max(0, ...)`
floors already in the code (`applyStage()`'s own return, and
`strategySpending()`'s final return) -- both scenarios independently
converge on "$0 spending forever," coincidentally identical, correctly
floored by existing guards. This is the precise contrast that isolates the
real bug: a **negative single value** is already caught by floors that
exist throughout this codebase; an **inverted pair of bounds** passed to
`clamp()` is not, because nothing checks the relationship between the two
arguments.

**Remaining edge values, all clean:** negative `upperGuardrail`/
`lowerGuardrail`, negative `rmdFloor`, negative debt `payoffAge`, negative
`otherAssets.accessPct`, negative `ltcYears`, negative `healthInflation`,
negative `reserveYears`, five accounts all owned `'joint'`, and a compound
scenario stacking `floor > ceiling`, inverted VPW, and `dividendQualified
> 100%` together (each mechanism acted independently, no interaction
effect, no crash).

**Findings:** 2 new, both well-quantified, both live, both sharing Q50's
"ordinary JSON number, not a JavaScript-only edge case" reachability
profile -- a hand-edited or migrated scenario file with `floor > ceiling`
or `vpwMinRate > vpwMaxRate` needs no `NaN`, `Infinity`, or cycle to hit
either one. Filed as `SPRINT_QUESTIONS.md` Q51 (floor/ceiling) and Q52
(vpwMinRate/vpwMaxRate), 2026-09-12, at your request.

**Running total across all 21 batches (as of `733b18e`):** 221
scenarios/checks/probes, 8 filed real findings (Q43, Q44, Q47, Q48, Q49,
Q50, Q51, Q52), 4 unfiled interaction/behavior
observations, 5 low-severity inert-field observations, 2
modeling-simplification observations, 1 code-hygiene-only observation, 1
documented mechanic difference (LTC), 1 minor hardening suggestion, 2
harness-only false alarms, 6 harness-only setup mistakes, 2 confirmed
input-validation/precision defenses, 1 withdrawn finding (Q46), and 2
corrected explanations.

---

## 2026-09-12 -- Batch 22 (systematic sweep: boolean-flag truthiness)

**Model version:** commit `c10889a` (this session's own last commit).
`src/engine.js`/`src/app-shell.html`/`src/scenario-validator.js` unchanged.

**Harness:** a systematic sweep across 14 boolean-shaped flags, each tested
at `true`, `false`, the string `"false"`, and the string `"0"` -- plus a
direct call into `scenario-validator.js`'s own `validateScenario()` and a
live full-plan demonstration.

**Why this batch happened.** Every plan-boolean this session has touched is
read with a plain JS truthy check (`if(p.advanced.X)`), never a strict
`=== true`. That pattern has one well-known failure mode: JavaScript
truthiness treats *any* non-empty string as `true`, including the strings
`"false"` and `"0"`. Worth auditing systematically the same way Q50 led to
auditing `scenario-validator.js` for numeric range coverage.

**The result: 9 of 14 tested boolean flags confirmed to treat the STRING `"false"` identically to the real boolean `true`**

| Field | `true` | `false` | `"false"` | `"0"` | Confirmed? |
|---|---:|---:|---:|---:|---|
| `profile.spouseOn` | 5,282,934 | 5,203,804 | 5,282,934 | 5,282,934 | **yes** |
| `retirement.dividendOn` | 5,537,120 | 5,203,804 | 5,537,120 | 5,537,120 | **yes** |
| `advanced.rmdOn` | 5,190,779 | 5,203,804 | 5,190,779 | 5,190,779 | **yes** |
| `advanced.conversionOn` | 5,223,762 | 5,203,804 | 5,223,762 | 5,223,762 | **yes** |
| `advanced.ltcOn` | 3,674,103 | 5,203,804 | 3,674,103 | 3,674,103 | **yes** |
| `advanced.healthOn` | 4,115,548 | 5,203,804 | 4,115,548 | 4,115,548 | **yes** |
| `advanced.reserveOn` | 3,626,391 | 5,203,804 | 3,626,391 | 3,626,391 | **yes** |
| `advanced.bondTentOn` | 2,715,356 | 5,203,804 | 2,715,356 | 2,715,356 | **yes** |
| `advanced.armRecastOnReset` | 1,968,124 | 1,984,397 | 1,968,124 | 1,968,124 | **yes** (see below -- this is the important one) |
| `retirement.survivor`, `retirement.homeEquityFallback`, `advanced.rule55`, `advanced.networthOn`, `advanced.glideOn` | -- | -- | -- | -- | inconclusive -- my test setups for these five didn't happen to make `true` and `false` diverge at all, so they neither confirm nor rule out the same bug. Not claimed safe. |

Both `"false"` and `"0"` behave identically to `true` in every confirmed
case -- the string `"0"` is a second, even sneakier trap for anyone
serializing booleans as `"0"`/`"1"`.

**The one field that IS defended, and exactly why it matters as a
contrast.** `scenario-validator.js` contains exactly two real boolean type
checks in the entire file: `account.cashHolding` and
`advanced.armRecastOnReset` (via a one-entry `ADVANCED_BOOLEAN_FIELDS`
list, added specifically for a prior FM-09 finding per its own comment, and
never generalized to any other flag). Confirmed the validator genuinely
rejects `armRecastOnReset: "false"` (`WRONG_TYPE`, `valid: false`) --
**but the raw engine itself still exhibits the identical truthy-coercion
bug when the validator is bypassed**, which every scenario this entire
session has done. This is the cleanest possible proof that **validator
coverage is the only thing standing between a malformed import and this
bug** -- the underlying engine code is equally vulnerable whether or not a
field happens to be on the validator's list. Two fields are covered.
Roughly twenty comparable boolean flags across `profile`, `retirement`, and
`advanced` are not.

**Live full-plan demonstration, not just a synthetic value check:** a
survivor-modeling household with `survivor: "false"` reports
**`lifetimeTaxes: $25,305.34`** -- identical to `survivor: true`
($25,305.34) and completely different from the real `survivor: false`
($147,115.08). A plan whose data says survivor modeling is off would
silently run full survivor modeling instead, changing lifetime tax
projections by nearly 6x in this example.

**Why this is a different shape of risk than every other finding this
session, and arguably wider in blast radius than any of them.** Q43/Q44/
Q47/Q50/Q51/Q52 are each one specific field or mechanism. This is a single
code pattern (`if(p.X)` instead of `if(p.X === true)`) repeated at every
boolean flag in the schema, confirmed present at 9 of 9 fields where the
test setup could actually detect it, with only 2 fields defended anywhere
in the pipeline. Reachability matches Q50/Q51/Q52's profile exactly -- no
`NaN`, `Infinity`, or cycle needed, just an ordinary string where a boolean
was expected, which is one of the most common shapes of bug produced by
form libraries, URL query-string parsing, spreadsheet/CSV import, or a
careless JSON.stringify of a non-boolean truthy default somewhere upstream.

**Findings:** 1 new, systemic, high-confidence, spanning at least 9
confirmed fields (likely more -- 5 remain untested due to setup, not ruled
out). Filed as `SPRINT_QUESTIONS.md` Q53, 2026-09-12, at your request.

**Running total across all 22 batches (as of `c10889a`):** 231
scenarios/checks/probes, 9 filed real findings (Q43, Q44, Q47, Q48, Q49,
Q50, Q51, Q52, Q53), 4 unfiled interaction/
behavior observations, 5 low-severity inert-field observations, 2
modeling-simplification observations, 1 code-hygiene-only observation, 1
documented mechanic difference (LTC), 1 minor hardening suggestion, 2
harness-only false alarms, 6 harness-only setup mistakes, 2 confirmed
input-validation/precision defenses, 1 withdrawn finding (Q46), 2 corrected
explanations, and 3 corrected precision/scope claims (Q51, Batch 18,
Batch 19).

---

## 2026-09-12 -- Batch 23 (systematic sweep: array-shape crashes)

**Model version:** commit `3fe8b5f` ("S6 3.0h: the phase trace has been run
once, and it is started not discharged"). Worth noting before anything
else: `src/scenario-validator.js` picked up a real change since Batch 22's
`6407e22` -- a `PAYMENT_BELOW_INTEREST` warning addressing **Q43**, this
session's very first finding (Batch 1's debt-payoff-runaway), landed by
another session. Doesn't affect this batch's own results (nothing here
touches `debt.paymentMonthly`), noted for continuity.

**Harness:** direct probes against `engine.runPlan()`, each paired with a
call to `validator.validateScenario()` on the identical plan object, to see
side by side whether the same malformed input is caught on import versus
what the raw engine does with it.

**Why this batch happened.** After Q48 (a circular reference crashing
`clone()`) and Q53 (boolean truthiness), the next natural question: does
`scenario-validator.js` check that array-shaped fields (`stages`,
`expenses`, `otherIncomes`, `assetClasses`, `debts`, `otherAssets`,
`accounts`) are actually arrays? Read the validator directly first, before
writing scenarios: **yes, comprehensively** -- every one of those fields
gets an explicit `Array.isArray()` check and a `WRONG_TYPE` error if it
fails. This is a well-defended category, unlike the numeric-range and
boolean gaps found in Q50-Q53. The real question, parallel to Q53's
`armRecastOnReset` contrast: does the *raw engine* have any defense of its
own, independent of the validator?

**Result: 8 of 8 tested array-shaped fields crash the raw engine uncaught on a non-array value -- and every single one is validator-defended**

| Field fed a non-array `{}` (or wrong-type value) | Raw engine | Validator on the same plan |
|---|---|---|
| `retirement.stages = {}` | **THROWS**: `(r.stages \|\| []).forEach is not a function` | `WRONG_TYPE`, rejected |
| `retirement.expenses = {}` | **THROWS**: `(items \|\| []).reduce is not a function` | `WRONG_TYPE`, rejected |
| `retirement.otherIncomes = {}` | **THROWS**: `.forEach is not a function` | `WRONG_TYPE`, rejected |
| `advanced.assetClasses = {}` (with `assetsOn`) | **THROWS**: `.forEach is not a function` | `WRONG_TYPE`, rejected |
| `advanced.debts = {}` | **THROWS**: `a.reduce is not a function` | `WRONG_TYPE`, rejected |
| `advanced.otherAssets = {}` | **THROWS**: `a.reduce is not a function` | `WRONG_TYPE`, rejected |
| `p.accounts = {}` (top level) | **THROWS**: `a.reduce is not a function` | `WRONG_TYPE`, rejected |
| `retirement.manualOrder = 1234` (number, not string), `withdrawalOrder: 'manual'` | **THROWS**: `.split is not a function` | `WRONG_TYPE`, rejected |

**The mechanism is the same one-line trap every time**: `(x || []).forEach`
(or `.reduce`) is falsy-safe for `null`/`undefined`, but **not** for a
stray `{}` -- an empty object is truthy, survives the `|| []` fallback
unchanged, and plain objects have no `.forEach`/`.reduce`/`.split`. Every
one of these is an ordinary, JSON-expressible mistake -- no `NaN`,
`Infinity`, or circular reference needed, unlike Q48. A migration script
that initializes a field to `{}` instead of `[]`, a serialization bug that
drops array brackets, or hand-editing a saved scenario file could all
produce this.

**Contrast cases, confirming the fallback pattern itself is otherwise sound:**
`advanced.assetClasses = []` (a valid, empty array) runs to completion with
no division-by-zero or empty-loop issue. `retirement.otherIncomes = null`
also runs fine end to end -- `null` is falsy, so `|| []` correctly catches
it (interestingly, the validator rejects `null` too, which is *stricter*
than the engine needs -- a harmless overcaution, not a defect, but worth
noting that `null` and `{}` get identical validator treatment despite only
one of them being unsafe at the engine level).

**How this compares to Q48.** Same underlying shape (the engine crashes
uncaught rather than degrading to the project's own `calculation_error`
contract), but broader (8 confirmed sites vs. 1) and more reachable
(ordinary JSON, not a JavaScript-only construct like a cycle) --
while also being *more* defended than Q48 in one sense, since every one of
these 8 fields is comprehensively checked by the validator, where Q48's
circular-reference case has no comparable check anywhere. The gap here is
purely "the engine has no defense in depth of its own" -- exactly the same
standard `nonFiniteScenarioInputCode()`'s own comment states and that Q48
was judged against.

**Findings:** 1 new, systemic, spanning 8 confirmed crash sites, fully
reachable via ordinary JSON, fully defended by the validator (unlike
Q50-Q53, where the validator gap *is* the finding -- here the gap is
entirely in the engine's lack of its own defense). Filed as
`SPRINT_QUESTIONS.md` Q55, 2026-09-12, at your request (Q54 landed from
another session in the meantime -- unrelated, about their scenario
generator's debt-payment corpus, no overlap).

**Running total across all 23 batches (as of `3fe8b5f`):** 241
scenarios/checks/probes, 10 filed real findings (Q43, Q44, Q47, Q48, Q49,
Q50, Q51, Q52, Q53, Q55), 4 unfiled interaction/behavior
observations, 5 low-severity inert-field observations, 2
modeling-simplification observations, 1 code-hygiene-only observation, 1
documented mechanic difference (LTC), 1 minor hardening suggestion, 2
harness-only false alarms, 6 harness-only setup mistakes, 2 confirmed
input-validation/precision defenses, 1 withdrawn finding (Q46), 2 corrected
explanations, 3 corrected precision/scope claims, and 1 verification note
(Q50).

---

## 2026-09-12 -- Batch 24 (requested: "the smart withdrawal presets," 15 runs)

**Model version: uncommitted, flagged explicitly.** HEAD is `d4b1652`
(this session's own last commit), but `src/engine.js` (+22 lines) and
`src/scenario-validator.js` (+38 lines) both carry live, uncommitted
changes from other sessions right now -- confirmed via `git diff --stat`
before running anything. This batch ran against whatever is actually on
disk, which is *not* a clean commit. Different from this session's usual
practice of running against a known committed state; noted here rather
than silently treated as equivalent. Likely includes in-progress work on
Q43 (a `PAYMENT_BELOW_INTEREST` validator warning, seen forming in Batch
23) and possibly Q49 (a new `tests/audit-q49-contribution-validity.test.js`
appeared in the working tree). Re-verify against a named commit if this
batch's numbers ever need to be reproduced exactly.

**What "the smart withdrawal presets" are.** `retirement.optimizationGoal`'s
five values (`balanced`/`success`/`taxes`/`spending`/`legacy`) only take
effect under `withdrawalOrder: 'optimized'` -- the "smart" order, dispatched
through `smartWithdrawalOrder()` (as opposed to `'manual'`, where Batch 17
already confirmed the goal is a complete no-op). Batch 17 also found that
for one household shape, several goals collapsed to byte-identical output
because the goal-specific score nudges were too small to move the needle
against the dominant class-level scoring (RMD proximity, the pre-59.5
penalty). This request asked for 15 simulations -- run as all 5 presets
across 3 deliberately different household shapes chosen to stress
different parts of the scoring, to see whether that collapse was specific
to Batch 17's one household or a broader pattern.

**Results: the presets collapse far more often than they differentiate.**

| Condition | Distinct withdrawal orders | Distinct `lifetimeTaxes` values |
|---|---|---|
| A: moderate mixed-account retiree near RMD age (66) | 1 of 5 | 2 of 5 |
| B: preTax-heavy household near the IRMAA cliff (age 64) | **1 of 5** | **1 of 5** |
| C: legacy-minded household, large Roth, low spending need | 2 of 5 | **1 of 5** |

Condition B collapsed completely -- all five presets, including the
supposedly tax-minimizing `'taxes'` goal and the supposedly
legacy-protecting `'legacy'` goal, produced identical output down to the
cent. Condition C showed two distinct withdrawal-order *strings* (a
Roth/HSA position swap for `success`/`taxes`/`legacy` vs.
`balanced`/`spending`), but even that difference didn't move
`lifetimeTaxes` at all -- both are tax-free withdrawal classes, so
reordering the last two positions in the sequence didn't change what got
taxed.

**A methodological catch worth recording, not a finding:** Condition A
showed identical withdrawal-order *strings* across all 5 goals at the
single age I sampled directly (`smartWithdrawalOrder()` called once, at the
starting age), yet `'taxes'` still produced measurably different
`lifetimeTaxes` ($296,769 vs. $271,503 for the other four) over the full
24-year run. That's not a contradiction -- `smartWithdrawalOrder()` is
recomputed fresh every single period inside `simulatePlan()`, using that
period's own age/account-balance/`priorReturn` state, so the order can
(and evidently did) diverge at some *later* age invisible to a single
snapshot. A one-shot direct call to `smartWithdrawalOrder()` can
understate how much a goal actually does across a multi-decade
simulation; only the full `runPlan()` result reflects the real effect.

**Not a new finding** -- this extends and reinforces Batch 17's already-
logged, unfiled interaction observation (`optimizationGoal` frequently
doing nothing, with no UI cue) rather than identifying anything new. Worth
having the broader evidence on record: 2 of 3 deliberately-varied household
shapes showed either total or near-total collapse across all five presets,
which is a stronger claim than "at least one household shape" was.

Filed as `SPRINT_QUESTIONS.md` Q56, 2026-09-12, at the owner's request -- **with
an explicit disposition, unlike every other Q entry**: the owner does not want
the current smart-withdrawal system repaired. The intent is to use its
present behavior as inspiration for a new smart-withdrawal system built
after the engine rebuild. Q56 is filed as characterization/reference
material for that future design, not routed into ordinary triage or left
"OPEN, undecided" awaiting a fix.

**Running total across all 24 batches (as of `d4b1652` + uncommitted
`engine.js`/`scenario-validator.js`):** 256 scenarios/checks/probes, 11
filed real findings (10 open for triage, 1 -- Q56 -- filed as rebuild
reference, not for repair; the `optimizationGoal` collapse observation
from this thread is folded into it rather than left unfiled), 3
other unfiled interaction/behavior observations, 5 low-severity
inert-field observations, 2 modeling-simplification observations, 1
code-hygiene-only observation, 1 documented mechanic difference (LTC), 1
minor hardening suggestion, 2 harness-only false alarms, 6 harness-only
setup mistakes, 2 confirmed input-validation/precision defenses, 1
withdrawn finding (Q46), 2 corrected explanations, 3 corrected precision/
scope claims, and 1 verification note (Q50).

---

## 2026-09-12 -- Batch 25 (numeric-string coercion and enum case-sensitivity)

**Model version: `5d34573` + further uncommitted `engine.js` changes.**
Worth leading with: HEAD advanced to `5d34573`, **"Q49: validate
accounts[].contribution at the validator and the runPlan() boundary"** --
Q49 is now officially fixed and committed, confirmed directly mid-batch
when `account.contribution = "10000"` (a string) came back cleanly
rejected with a new `SCENARIO_NONFINITE_CONTRIBUTION` code that didn't
exist in any prior batch. `src/engine.js` still carries 37 further
uncommitted lines beyond that commit at the time this batch ran -- noted,
not chased down.

**Harness:** direct probes, this round targeting two adjacent categories:
numeric-shaped fields fed as strings (JS coerces numeric strings under `*`
but not under `+`, so the risk is anywhere addition happens instead of
multiplication), and case-sensitivity of enum-shaped string fields (bracket
lookups into `RULES` are case-sensitive; whether a mismatch degrades safely
depends entirely on whether that specific call site has a fallback).

**Numeric-string coercion: confirmed safe, no hidden concatenation bug.**
`employment.salary`, `retirement.spending`, `retirement.ssBenefit`, and
`advanced.qcd` all fed as strings ran to completion with plausible numbers.
Checked the sharpest version directly rather than trusting "it ran": built
the identical plan with `salary: 100000` (real number) and `salary:
"100000"` (string) and diffed the full row output -- **byte-identical**.
No `+`-concatenation trap anywhere in this path.

**Case-sensitivity: three different outcomes for three different fields, and one small but real new finding.**

- `profile.filing = 'MFJ'` (wrong case) -- **caught safely**. `RULES.federal.standardDeduction['MFJ']` is `undefined`, propagates to `NaN`, and gets caught by the same downstream `NONFINITE_CONTEXT` safety net from Batch 16 -- a clean rejection, not a silent miscalculation.
- `account.taxClass = 'Taxable'` (wrong case) -- **validator-defended, engine-unsafe** (the now-familiar pattern from Q53/Q55): `scenario-validator.js:319` does `checkEnum(taxClass, TAX_CLASSES)`, so this is caught on import. But confirmed directly what the raw engine does if it's bypassed: the account's balance stays in `total` ($747,618) but silently drops to $0 in every class-specific sum (`taxable: 0`) -- invisible to RMD targeting and withdrawal-class selection while still counted in net worth. Not a new category (same shape as Q53/Q55's contrast cases), not filed separately.
- `retirement.withdrawalOrder = 'Manual'` (wrong case) -- also validator-defended (`checkEnum` against `WITHDRAWAL_ORDERS`), and the raw engine's fallback here is actually benign: `p.retirement.withdrawalOrder==="manual" ? ... : smartWithdrawalOrder(...)` treats anything else as "not manual," so it falls through to the optimized order rather than crashing or silently doing something worse.
- `retirement.strategy = 'Guardrails'` (wrong case) -- **the new finding.** Grepped `scenario-validator.js` for any enum check on `retirement.strategy`: none exists, for any strategy name, right or wrong case. The engine's own `if/else if` chain across nine strategy names has no `else` that errors -- the final fallback is `else amount=r.spending*inflationFactor`, i.e. plain `incomeFirst` behavior. Confirmed live: `strategy: 'Guardrails'` produced numbers identical to the `incomeFirst` control, with no error, warning, or any indication the selected strategy was never recognized. Neither the validator nor the engine defends this field at all -- unlike `taxClass` and `withdrawalOrder`, which are at least validator-defended even if the engine itself isn't.

**Findings:** 1 new (`retirement.strategy`'s missing enum validation, silently substituting `incomeFirst` for any unrecognized value), plus confirmation that Q49 is now fixed. Filed as `SPRINT_QUESTIONS.md` Q58, 2026-09-12, at your request (Q57 landed from another session in the meantime -- a real string-concatenation bug in `futureChanges[].value`, unrelated, no overlap).

**Running total across all 25 batches:** 266 scenarios/checks/probes, 12
filed real findings (11 open for triage + Q56 as rebuild reference), 3 unfiled interaction/
behavior observations, 5 low-severity inert-field observations, 2
modeling-simplification observations, 1 code-hygiene-only observation, 1
documented mechanic difference (LTC), 1 minor hardening suggestion, 2
harness-only false alarms, 6 harness-only setup mistakes, 2 confirmed
input-validation/precision defenses, 1 withdrawn finding (Q46), 2 corrected
explanations, 3 corrected precision/scope claims, 1 verification note
(Q50), and 1 finding now confirmed fixed (Q49, `5d34573`).

---

## 2026-09-13 -- Batch 26

**Model version:** commit `89dc893` at run time ("S4 closed, in the ledgers:
the external instrument review's final sign-off..."), `src/engine.js` clean
and unchanged as of `d825182` (verified with `git log 89dc893..d825182 --
src/engine.js`, no output). Working tree carries an unrelated in-progress
edit to `S5_TASK_CHECKLIST.md` from another session, plus untracked
`Handover temp/` and `S3_AUDIT_HANDOVER_20260910/` handover material -- not
touched. Since the last batch, both S2 and **S4** closed (external
instrument audit, requalified at `a11dd6d`/S4-IR-04-R1). `src/engine.js`
grew from ~1,400 to 2,120 lines across the S3/S4 work; re-grepped key
function locations before running anything: `applyStage` 1130->1216,
`strategySpending` 1174->1259, `simulatePlan` 1319->1327, `runPlan`
~1404->1876; `clone`(19), `clamp`(21), `isFiniteNumberValue`(488),
`smartWithdrawalOrder`(821) unchanged.

**Harness:** direct probes via `engine.runPlan()`, general coverage --
deliberately reaching for feature combinations genuinely untried across the
prior 25 batches: Monte Carlo mode (`assumptions.method:'monteCarlo'`, not
directly driven before this batch), ARM recast, glide path / bond tent
allocation drift, a Roth conversion ladder, LTC random draws, a multi-owner
household with spousal Social Security, debt amortization against
retirement cash flow, `otherAssets` net-worth tracking, and a three-way
overlapping-stage case (2 percent-mode + 1 amount-mode, extending Batch
18/P19-H1's two-stage finding).

**Scenarios run (25):**

| # | Scenario | Result |
|---|---|---|
| 1 | Monte Carlo, 50 runs | Ran, successRate=100, issues=0 |
| 2 | Monte Carlo, 5 runs | Ran, successRate=100 |
| 3 | Monte Carlo, 1 run | Ran, successRate=100 |
| 4 | Monte Carlo, runs=0 | **THREW UNCAUGHT** (see Findings) |
| 5 | Monte Carlo, runs=-5 | **THREW UNCAUGHT** (see Findings) |
| 6 | ARM recast on reset, variable-rate debt | Ran, no anomaly |
| 7 | Glide path, stocks->bonds drift | Ran, no anomaly |
| 8 | Bond tent, peak at 65 | Ran, no anomaly |
| 9 | Roth conversion ladder, 60-70, $40k/yr | Ran, no anomaly |
| 10 | LTC on, 40% probability | Ran, no anomaly |
| 11 | LTC on, probability=100 (guaranteed) | Ran, no anomaly |
| 12 | LTC on, probability=0 (contrast) | Ran, no anomaly |
| 13 | Married household, spousal SS | Ran, no anomaly |
| 14 | Two debts, staggered payoff ages | Ran, no anomaly |
| 15 | otherAssets, rental property | Ran, no anomaly |
| 16 | IRMAA guard + large forced RMDs | Ran, no anomaly |
| 17 | dividendQualified=100% (Q50 boundary) | Ran, no anomaly (100 is the legal max, correctly not tripping Q50) |
| 18 | State='FL', $400k salary | Ran -- see Findings (scope clarification, not a defect) |
| 19 | State='CA', same salary | Byte-identical to #18 -- see Findings |
| 20 | VPW strategy, default rates | Ran, no anomaly |
| 21 | RMD strategy, zero preTax balance (degenerate) | Ran, no anomaly |
| 22 | Income-first, large pension covers spending | Rejected -- **new lead, see Batch 27** |
| 23 | Extreme long horizon, age 20->100 | Ran, no anomaly |
| 24 | Zero-length retirement window | Ran, no anomaly |
| 25 | Monte Carlo (30 runs) + LTC on | Ran, successRate=93.33 |

**Finding: `assumptions.runs <= 0` crashes Monte Carlo mode uncaught.**
`runPlan()`'s Monte Carlo branch (`src/engine.js:1943-1944`) loops
`for(var i=0;i<p.assumptions.runs;i++){runs.push(...)}` with no lower-bound
check, then unconditionally calls `aggregateMonteCarloRuns(runs)`, which
immediately reads `runs[0].rows.length` (`engine.js:1819`) to size the
per-year output. Neither `nonFiniteScenarioInputCode()` nor
`accountContractCode()` -- the two boundary gates that run before any
simulation starts -- ever inspect `assumptions.runs`. Confirmed directly:
`runs:0` and `runs:-5` both throw `TypeError: Cannot read properties of
undefined (reading 'rows')` -- an uncaught crash, not a clean
`calculationErrorCode` rejection, the same failure shape as Q48's circular
reference. Bounded further in Batch 27's boundary sweep: `runs:0.5` is
accepted (loop runs once, `requestedPaths:1`), `runs:"20"` (numeric string)
coerces fine under `<`, `runs:undefined` (field omitted) defaults to 1000,
`runs:null` also throws the same crash. Not yet filed -- flagged here,
filed in Batch 27's writeup below since that batch bounds it precisely.

**Scope clarification, not a defect: `profile.state` only ever means
Arizona.** Scenarios #18/#19 (`state:'FL'` vs `state:'CA'`, same $400k
salary) produced byte-identical output end to end. Traced why before
treating this as a state-tax gap: `RULES` (the JSON blob embedded in
`app-shell.html`) has exactly one state-shaped key, `arizona` -- there is
no `states` dictionary, no per-state bracket table, nothing else. The UI's
own state `<select>` (`app-shell.html:228`) has **exactly one `<option>`,
value `AZ`** -- a real user can never select Florida or California through
this app; my probe fed a value the UI structurally cannot produce.
`engine.js:339`'s state-tax line (`RULES.arizona.rate`) applies the
Arizona rate unconditionally to whatever reaches it, without ever branching
on `profile.state`'s value. The app's own `v2-warning` copy at
`app-shell.html:305` says exactly what this is: "Federal calculations use
the native 2026 package. Arizona's 2026 return instructions are not yet
published, so Arizona tax is a clearly labeled estimate" -- a single-state
(Arizona), disclosed-as-estimate design, not a general multi-state
calculator with a state-selection bug. This is the same shape as the
withdrawn Q46: an apparent gap that the app's own UI and copy already
foreclose. Not filed.

**Findings:** 1 new lead (Monte Carlo `runs<=0` uncaught crash, bounded and
filed as part of Batch 27 below), 1 scope clarification (Arizona-only state
tax, not a defect -- same shape as withdrawn Q46), plus the "Income-first"
rejection (#22) that turned out to be a genuine per-row `TAX_QUOTE_*`
diagnostic rather than a boundary rejection, which Batch 27 uses directly.

---

## 2026-09-13 -- Batch 27

**Model version:** same as Batch 26, commit `89dc893` at run time,
`src/engine.js` unchanged through current HEAD `d825182`.

**Harness:** targeted at the part of S4's new work that actually
intersects the financial engine. Most of S4 (device benchmark stall
detection, heartbeat timing, IR-04/IR-04-R1) lives in
`tools/device-benchmark-core.js`, a separate device-calibration tool with
its own dedicated test suite (`tests/device-benchmark.test.js`) -- not a
financial simulation in this harness's sense, so left to that suite. The
one S4 item that does reach `engine.js` is **S4-IR-05**: `recordIssue()`'s
200-issue cap (`engine.js:1317`,
`if(!issues||issues.length>=200)return;issues.push(...)`), carried to S5
with the owner's decision recorded to raise the cap. Reading `runPlan()`'s Monte
Carlo loop while investigating that cap surfaced a materially bigger gap
in the same mechanism, upstream of the 200 limit.

**The finding: in Monte Carlo mode, only path 0 of N ever writes to the
returned `issues` log -- regardless of how many other paths genuinely
fail, and independent of the 200-item cap.**

`runPlan()`'s Monte Carlo loop (`engine.js:1943-1944`):
```
for(var i=0;i<p.assumptions.runs;i++){
  runs.push(simulatePlan(p,rng(baseSeed+i*2),0,rng(baseSeed+i*2+1),i===0?issues:null));
}
```
passes the real `issues` array only when `i===0`; every other path gets
`null`, and `recordIssue()`'s own guard (`if(!issues||...)return`) makes
that a silent no-op. Separately confirmed `aggregateMonteCarloRuns()`
(`engine.js:1807`) determines `calculationError`, `calculationErrorPaths`,
and the representative `calculationErrorCode` by scanning every run's own
`rows[]` directly (`engine.js:1821`, `1838`) -- **not** the shared `issues`
array -- so the pass/fail verdict itself is correct and unaffected. Only
the diagnostic `issues[]` log attached to the result goes blind past path 0.

Reproduced cleanly with a real, deterministic failure (Batch 26 scenario
#22 -- `incomeFirst` strategy with a $150k pension that overshoots
spending, which turns out to trip a genuine per-row `TAX_QUOTE_NONFINITE_CONTEXT` /
`NON_FINITE_ROW_VALUE` pair every year from age 66 onward, not merely a
boundary rejection):
- **Single path** (`engine.simulatePlan()` called directly, `issues=[]`):
  70 entries recorded (2 codes/year x 35 years, ages 66-100).
- **Monte Carlo, 25 runs, identical plan/failure** (deterministic --
  doesn't depend on market returns, so all 25 paths fail the same way):
  `requestedPaths=25`, `validPaths=0`, `calculationErrorPaths=25`,
  `calculationError=true`, `calculationErrorCode=TAX_QUOTE_NONFINITE_CONTEXT`
  (all correct) -- but `issues.length=70`, **byte-identical to the single-path
  run**. 24 of the 25 failing paths contributed zero entries. Had every
  path's issues actually been collected, the honest total would have been
  25 x 70 = 1,750, truncated to the 200-item cap (S4-IR-05) -- meaning
  even the cap never gets a chance to matter here, because 24/25 paths
  never get the opportunity to write in the first place. A user (or an
  automated triage process) reading `result.issues` off a large,
  mostly-or-entirely-failing Monte Carlo batch would see a handful of
  entries from one arbitrary path and have no way to know 24 other paths
  failed too, let alone how.

**Also bounded precisely in this batch: `assumptions.runs` and
`assumptions.seed` edge behavior (Monte Carlo).**

| Input | Result |
|---|---|
| `runs:0` | **THREW UNCAUGHT**, `TypeError: Cannot read properties of undefined (reading 'rows')` |
| `runs:-1` | **THREW UNCAUGHT**, same error |
| `runs:null` | **THREW UNCAUGHT**, same error |
| `runs:NaN` | **THREW UNCAUGHT**, same error |
| `runs:0.5` | Accepted -- loop body runs once, `requestedPaths:1` |
| `runs:"20"` (numeric string) | Accepted -- `<` coerces the string, `requestedPaths:20` |
| `runs:undefined` (field omitted) | Accepted -- defaults to `1000` |
| `seed:NaN` | Accepted -- falls back to `0` per the comment at `engine.js:1938-1939` |
| `seed:-1` | Accepted, ran normally |
| `seed:"abc"` (non-numeric string) | Accepted -- `Number("abc")` is `NaN`, falls back to `0` same as above |

`nonFiniteScenarioInputCode()` and `accountContractCode()` -- the two gates
that run before any path starts -- never inspect `assumptions.runs` at
all, so `0`/negative/`null`/`NaN` all reach the unguarded loop and crash the
same way Q48's circular reference did (uncaught, not a clean
`calculationErrorCode`). `seed`'s documented NaN-fallback (per the existing
code comment) is confirmed correct and extends cleanly to a non-numeric
string, since both go through the same `Number(...)` coercion.

**Findings:** 1 new defect (Monte Carlo `issues[]` only ever reflects path
0, regardless of how many paths actually fail -- more severe and far
easier to hit than S4-IR-05's 200-item cap, since it triggers at N=2 paths
already, not just at scale), 1 new crash (`assumptions.runs<=0` or
non-numeric-non-string throws uncaught, same shape as Q48), 1 confirmed
safe (`assumptions.seed`'s NaN/string fallback works as commented).
Pending your instruction on filing to `SPRINT_QUESTIONS.md`.

**Running total across all 27 batches:** 316 scenarios/checks/probes, 12
filed real findings (11 open for triage + Q56 as rebuild reference), 2 new
unfiled defects (Monte Carlo `issues[]` path-0-only blindness;
`assumptions.runs<=0` uncaught crash) awaiting your filing instruction, 4
unfiled interaction/behavior observations, 5 low-severity inert-field
observations, 2 modeling-simplification observations, 1 code-hygiene-only
observation, 1 documented mechanic difference (LTC), 1 minor hardening
suggestion, 2 harness-only false alarms, 6 harness-only setup mistakes, 2
confirmed input-validation/precision defenses, 1 withdrawn finding (Q46),
1 scope clarification (Arizona-only state tax, same shape as Q46), 2
corrected explanations, 3 corrected precision/scope claims, 1 verification
note (Q50), and 1 finding confirmed fixed (Q49, `5d34573`).

---

## 2026-09-13 -- Batch 28

**Model version:** commit `9198ddd` at run time, `src/engine.js` /
`scenario-validator.js` / `src/app-shell.html` unchanged since `d803f5c`
(verified with `git log d803f5c..9198ddd -- <those files>`, no output).
Working tree carries only other sessions' untracked handover material
(`Handover temp/`, `S3_AUDIT_HANDOVER_20260910/`, `loop.txt`), not touched.

**Harness:** direct probes via `engine.runPlan()` (plus `engine.runScenario()`
for two probes), reaching for features genuinely untried across the prior
27 batches: `assumptions.method='historical'` (real 1928-2025 S&P
sequence-of-returns replay, discovered while reading Batch 27's
`engine.js:1349`), `account.cashHolding` (the other validator-defended
boolean field besides `armRecastOnReset`, per Q53 -- a contrast case),
unsupported-not-just-wrong-case filing statuses, employer
match/profit-share/vesting, tied account priorities, `annualChange`
frequency/timing, `otherIncomes` overlap, `runScenario()`'s identity
wrapper, QCD edge values, the legacy/bequest goal, and stage `growthMode`.

**Scenarios run (25):** grouped by area rather than a flat table, since
several needed follow-up investigation before their result could be
trusted.

**Historical mode (`assumptions.method='historical'`) -- confirmed real
and UI-reachable, not an internal-only mode.** `app-shell.html`'s
`v2-history-start` and `v2-rolling-history` controls set exactly this
path; `v2-history-start` is a `<select>`, populated (by inspection of the
surrounding markup) from the same 1928-2025 range `HIST_RETURNS` actually
holds, so the out-of-range cases below are not reachable through the UI --
only via a direct engine call or a hand-edited/imported scenario file,
the same reachability class as Q48 and Q61.

- `historyStart:1966` (the classic textbook worst-case US retirement start
  year -- the "1966 retiree" sequence-of-returns-risk example): **ran to
  completion with `failed:true`, ending balance $0.** This is the model
  correctly reproducing a real historical disaster, not a defect --
  confirms historical mode responds sensibly to genuine stress rather than
  just running Monte Carlo with extra steps.
- `historyStart:1900` (58 years before the earliest data, 1928),
  `historyStart:2200` (175 years after the latest data, 2025),
  `historyStart` omitted entirely, and `historyStart:'nineteen-sixty-six'`
  (non-numeric string) **all four produced byte-identical output** to each
  other. Traced why: `historyIndex()`
  (`engine.js:1037`, `HIST_RETURNS.findIndex(x=>x[0]>=p.assumptions.historyStart)`)
  returns `-1` whenever no year satisfies the comparison -- true for
  `2200` (nothing is `>=2200`), for `undefined` (any comparison with
  `undefined` is `false`), and for a non-numeric string (coerced to `NaN`,
  and any comparison with `NaN` is `false`) -- and `-1` is then clamped to
  `0` by `Math.max(0,i)`, landing on 1928, the earliest year, exactly like
  the legitimate `historyStart:1900` case (1928 already satisfies `>=1900`,
  so it also lands on index 0). **Not reachable through the UI's `<select>`**,
  but worth naming precisely: any invalid or wildly out-of-range
  `historyStart` silently and safely resolves to "start the replay in
  1928" with no error, warning, or indication the requested year didn't
  exist -- a minor hardening gap in the same family as Q49/Q58/Q61
  (engine-direct/imported-scenario reachability only), several
  severity notches below any of them since the fallback is itself always a
  valid, real historical sequence rather than a crash or a silent
  miscalculation.
- Long horizon forcing `HIST_RETURNS` wraparound (60-year horizon from
  1990, only 36 years of real data remaining to 2025): ran cleanly, no
  anomaly -- the modulo arithmetic wraps correctly.
- `rollingHistory:true`: same `failed:true` outcome as the plain
  `historyStart:1966` run (expected, same historyStart). Grepped
  `engine.js` for every other use of `rollingHistory`: **exactly one**,
  at `engine.js:2003`, which only echoes `!!p.assumptions.rollingHistory`
  into `result.historicalPeriod.rolling` -- it has **zero effect on the
  simulation itself**. Plausibly correct by design (true rolling-window
  backtesting -- running every possible historical start year and
  aggregating -- would be an outer-loop concern built on repeated
  `runPlan()` calls, with this flag only labeling the result for that
  caller), but noted since it reads, on its own, like a flag that should
  change something and doesn't.

**`account.cashHolding` -- confirmed properly engine-defended, unlike
Q53's nine vulnerable fields.** Direct reading of `accountContractCode`
(`engine.js:660-666`) shows a strict contract: `typeof cashHolding` must
be `"boolean"` (any other type, including the classic Q53 string shape,
returns `INVALID_CASH_HOLDING`); if `true`, `taxClass` must be `"taxable"`
and `basisPct` must be `100`. Confirmed live, all four cases behaving
exactly as read: a valid `{cashHolding:true, taxClass:'taxable',
basisPct:100}` account ran cleanly; `taxClass:'preTax'` with
`cashHolding:true` **rejected cleanly** (`SCENARIO_INVALID_CASH_HOLDING`);
`basisPct:50` with `cashHolding:true` **rejected cleanly**, same code;
and critically, `cashHolding:"false"` (a string, exactly Q53's shape for
the nine vulnerable fields) **also rejected cleanly**, same code -- this
field does NOT silently treat `"false"` as truthy the way the other nine
do. A genuine, confirmed contrast case: of the ~11 boolean-shaped fields
checked across this session (Q53's nine plus `armRecastOnReset` and
`cashHolding`), this is the second field with real engine-level type
enforcement, not just validator coverage.

**Filing statuses genuinely unsupported (`mfs`, `qw`) -- confirmed
UI-unreachable, same shape as the Arizona-only state finding (Batch 26).**
`RULES.federal.standardDeduction` has exactly three keys: `single`, `mfj`,
`hoh`. `app-shell.html`'s own `v2-filing` `<select>` (`app-shell.html:224`)
offers exactly those same three options and no others. `profile.filing:'mfs'`
and `'qw'` both reject cleanly via the same `TAX_QUOTE_NONFINITE_CONTEXT`
safety net Batch 25/Q58 already characterized for wrong-cased filing
values -- but since no real user can ever select these two statuses in
the first place, this isn't a new finding, just confirmation the pattern
generalizes from "wrong case" to "never offered at all." Not filed.

**`otherIncomes` overlap -- confirmed SAFE (additive), a clean contrast to
the stages-overlap finding (P19-H1) -- after correcting a harness mistake
of my own.** First attempt used `startAge`/`endAge` field names (borrowed
from the `stages` convention) and got a surprising
`TAX_QUOTE_NONFINITE_CONTEXT` rejection -- for a SINGLE, non-overlapping
otherIncome too, which was the tell that this wasn't about overlap at all.
`scenario-validator.js` on that exact plan named the actual problem
immediately: `otherIncomes[]` entries use `type`/`start`/`end`/`owner`/
`growthMode`/`growth`, not `startAge`/`endAge` -- my objects were missing
every one of those and using wrong names for the two I'd guessed. Not a
product defect, a self-inflicted construction mistake (same family as this
session's earlier `contributionStop` slips) -- logged rather than filed.
Rebuilt with the correct shape and re-ran: a single pension, two
overlapping pensions (70-75), two pensions forced non-overlapping, a
pension overlapping a `socialSecurity`-typed income, and a `oneTime`
windfall landing inside a recurring pension's window all ran cleanly with
no anomaly. Read `otherIncomeFor()` (`engine.js:1275`) to confirm why
overlap is safe here where it wasn't for stages: it `.forEach`s every
entry and does `cash+=amount` for each independently -- pure accumulation,
never a single overwritten running base the way `applyStage()` composes
`mode:'amount'` stages. Overlap cannot silently drop or replace one
income stream with another.

**Second harness mistake, also not filed: replacing `p.advanced` wholesale
strips required fields the engine doesn't default.** A "minimal plan, one
account" probe replaced `p.advanced` with a bare object carrying only the
`*On` flags and `debts`/`otherAssets`, rather than flipping those same
flags on the existing default `advanced` object. Result:
`TAX_QUOTE_NONFINITE_CONTEXT`. Isolated with three side-by-side variants:
keeping the default `advanced` object untouched (even with the account
list truncated to one) ran cleanly; flipping the flags off on that SAME
existing object also ran cleanly; only the wholesale replacement --
missing fields like `qcd`, `insurance`, `legacy`, `healthCost` that the
default object carries as `0`/`null`/etc. and my bare object omitted
entirely -- broke. Confirms the engine does not defensively default
missing optional `advanced.*` fields (`undefined` propagates rather than
being treated as `0`/off), but this is the same "engine trusts a complete
input, the validator is the actual gate" shape documented all session
(Q53/Q55/Q58) rather than a new category -- and, per the pattern, a
plan this incomplete would very likely fail `scenario-validator.js`'s own
`MISSING_FIELD` checks before ever reaching the engine, the same way the
`otherIncomes` mistake above did. Not independently re-checked against
the validator given time -- flagged, not filed.

**Everything else ran cleanly, no anomaly:** employer match at 50%/6%
cap with full vesting, match + profit share with 50% vesting, and match
with 0% vesting (fully unvested); two taxable accounts with identical
`priority:1` (no crash, no silent drop -- some deterministic tie-break
applies); `annualChange` with `frequency:2` (biennial) and
`changeTiming:'mid'`; a one-time expense plus a recurring expense in
`retirement.expenses`; `runScenario()` called directly for the first time
this session -- confirmed it correctly builds an `identity` object
(`scenarioId`/`runId`/`scenarioSchemaVersion`/...) on a valid plan, and
correctly returns `SCENARIO_NONSERIALIZABLE_INPUT` (no identity computed)
on the same Q48-shaped circular reference `runPlan()` also rejects; QCD
larger than the RMD amount and a negative QCD; `advanced.legacy` combined
with `optimizationGoal:'legacy'`; a $1 trillion account balance (no
overflow, no precision collapse visible in the output); `selfLife`/
`insurance` combined with `networthOn`; and both `stages` `growthMode`
values (`'fixed'` and `'inflation'`) on an otherwise identical
`mode:'amount'` stage, producing different-but-sane ending totals.

**Findings:** 0 new filed defects. 1 confirmed contrast (`cashHolding` is
properly engine-defended, unlike Q53's nine vulnerable fields -- a
positive result worth having on record). 1 low-severity hardening
observation (`historyStart`'s silent fallback to 1928 on any invalid or
out-of-range value, UI-unreachable -- lower severity than Q49/Q58/Q61
since the fallback is itself always a valid real sequence, never a crash
or silent miscalculation). 1 minor dead-flag observation (`rollingHistory`
only ever echoes into result metadata, changes nothing about the
simulation). 1 scope confirmation (`mfs`/`qw` filing statuses, same
UI-unreachable shape as the Arizona-only state finding). 1 confirmed-safe
contrast (`otherIncomes` overlap is additive and correct, unlike stages).
2 harness-only setup mistakes (wrong `otherIncomes` field names; a
wholesale `advanced` object replacement dropping fields the engine doesn't
default) -- logged transparently, not filed as defects.

**Running total across all 28 batches:** 341 scenarios/checks/probes, 14
filed real findings (13 open for triage + Q56 as rebuild reference --
Q60 and Q61 from Batch 27 filed and committed at `d803f5c`), 5 unfiled
interaction/behavior observations (the historyStart fallback and
rollingHistory dead-flag joining Batch 28), 5 low-severity inert-field
observations, 2 modeling-simplification observations, 1 code-hygiene-only
observation, 1 documented mechanic difference (LTC), 1 minor hardening
suggestion, 2 harness-only false alarms, 8 harness-only setup mistakes, 3
confirmed input-validation/precision defenses (`cashHolding` joining
`armRecastOnReset` and Q49's fix), 1 withdrawn finding (Q46), 2 scope
clarifications (Arizona-only state tax; `mfs`/`qw` filing statuses -- same
shape as the withdrawn Q46), 2 corrected explanations, 3 corrected
precision/scope claims, 1 confirmed-safe contrast (`otherIncomes` vs.
stages overlap), 1 verification note (Q50), and 1 finding confirmed fixed
(Q49, `5d34573`).

---

## 2026-09-13 -- Batch 29

**Model version:** commit `2123ab7` at run time, `src/engine.js` /
`scenario-validator.js` / `src/app-shell.html` unchanged since `734f060`
(verified with `git log 734f060..2123ab7 -- <those files>`, no output).

**Harness:** direct probes via `engine.runPlan()`, targeting the remaining
`advanced`/`retirement` fields never driven this session:
`reserveOn`/`reserveYears`, transfers, `guytonSkipInflation`,
`rmdMultiplier`/`rmdFloor`, `preserveRoth`, `rule55`/`penaltyException`,
`flexibility`, `rmdSmoothing`, `homeEquityFallback`, `survivor` +
`selfLife`/`spouseLife`, `ssAdvanced`/`aime`, `limitPolicy`, and
`withdrawalTiming`. Traced every field's REAL internal property name first
by reading `app-shell.html`'s `readStatic()`/`writeStatic()` directly
(`app-shell.html:524-527`) -- several UI ids don't match their plan
property (`v2-guyton-skip` writes `retirement.guytonSkipInflation`, not
`guytonSkip`) -- specifically to avoid repeating Batch 28's `otherIncomes`
field-name mistake.

**The finding: `advanced.reserveYears`'s "years of spending in reserve"
protection is computed independently per account, not against a shared
portfolio-wide budget -- so splitting the same total balance across more,
smaller accounts silently weakens the reserve's effective protection.**

`accountReturnForPeriod()` (`engine.js:1309`):
```
if(p.advanced.reserveOn&&age>=p.profile.retireAge){
  var reserve=Math.min(ac.balance,p.retirement.spending*p.advanced.reserveYears),
      share=reserve/Math.max(1,portfolioTotal);
  ret=ret*(1-share)+.03*share
}
```
runs once per account (`ac`). `reserve` is capped by **that account's own
balance**, not by how much of the portfolio-wide reserve target has
already been "spent" by other accounts. When every account's own balance
already exceeds the target (`spending*reserveYears`), `reserve` clips to
the same target value for every account regardless of how many accounts
there are, and the result is indistinguishable from computing the reserve
once against the whole portfolio. But once accounts are small enough that
an account's own balance is *below* the target, `reserve` clips to that
smaller balance instead -- reducing `share`, and therefore reducing how
much of that account's return gets the reserve's blended 3% treatment.

**Confirmed live** with a $1,500,000 total household, `spending:$60,000`,
`reserveYears:5` (target: $300,000), 10-year horizon:

| Split | `reserveOn` | Ending total |
|---|---|---|
| 1 account, $1.5M | `false` (control) | $3,210,727 |
| 10 accounts x $150k | `false` (control) | $3,210,727 -- **identical**, confirming account count alone never matters without the reserve mechanic |
| 1 account, $1.5M | `true` | $2,880,417 |
| 3 accounts x $500k (each still >= $300k target) | `true` | $2,880,417 -- **identical to the 1-account case**, confirming no difference while every account individually clears the target |
| 10 accounts x $150k (each < $300k target) | `true` | $2,979,498 -- **different from both `reserveOn:true` cases above**, ~$99,081 higher purely from how the SAME $1.5M was partitioned |

The 10-small-accounts case sits closer to the `reserveOn:false` baseline
than the 1-account/3-large-accounts case does -- fragmenting the balance
into pieces smaller than the reserve target measurably *weakens* the
reserve's protective effect, with the same `reserveYears` input and the
same total balance. A user who reorganizes which account holds what (a
common, ordinary action -- opening a new account, spreading savings
across several institutions) changes how much of their configured "5
years of spending in reserve" is actually protected, with nothing in the
UI or output indicating this dependency exists.

**Not filed as an urgent defect.** The mechanism isn't crashing or
silently corrupting data -- every number here is a real, intentional
computation, just one whose real-world behavior (account-count-sensitive)
likely doesn't match what the UI's label ("Years of spending in reserve")
implies to a user (a single portfolio-wide amount). Recording it precisely
here; candidate fix directions if it gets triaged: (a) compute the
reserve dollar amount and share ONCE against the portfolio total, apply
the same share to every account, rather than re-deriving a per-account
`reserve` and `share`; (b) track a running "reserve budget already
allocated" counter across accounts within the same period so the total
across all accounts never exceeds `spending*reserveYears`; (c) leave as
designed and document the per-account behavior explicitly.

**`homeEquityFallback` -- confirmed working correctly (positive result,
not a defect).** Checked across every row, not just the first (an earlier
same-batch check that only read row 0 came back inconclusive since the
real portfolio hadn't been exhausted yet by that row). With
`otherAssets:[{available:true,availableAge:60,accessPct:80,value:400000}]`
and a large enough spending need to eventually force a shortfall: the
asset's value correctly stays untouched (`400000`) for the first two rows
while the ordinary portfolio still covers spending, then draws down
(`400000 -> 80000 -> 16000`) exactly once a real shortfall appears. The
`available:false` contrast case stays flat at `400000` for all four rows
-- confirmed never drawn, exactly as its flag should mean.

**Undefended enum, milder shape than Q58: `limitPolicy`.** Three
documented UI values (`app-shell.html:245`): `redirect` (default),
`warn`, `prevent`. `auditContributions()` (`engine.js:82`) only special-
cases `"warn"` explicitly; the redirect-vs-drop distinction is decided
later, at `engine.js:1360`, which only special-cases `"redirect"`
(moves excess into the first taxable account, or warns if none exists).
Anything else -- the real value `"prevent"`, a typo, or an unrecognized
string -- falls through to the same silent-drop behavior (excess
contribution capped, never redirected, no warning). `scenario-validator.js`
has zero matches for `limitPolicy` -- undefended at both layers, the same
shape as Q58's `retirement.strategy`. Materially milder than Q58, though:
the fallback behavior IS one of the three real documented options
(`"prevent"`'s own intended behavior), so an unrecognized value degrades
to a sensible, conservative default rather than substituting an unrelated
strategy. Not filed as its own entry -- noted for whenever Q58-shaped
enum gaps get triaged as a family, since the fix pattern would be
identical.

**`withdrawalTiming` -- my own harness guessed wrong enum values.**
Probed `'beginning'`/`'end'` (a blind guess, flagged as such in the
harness comments) and got identical output for both. Traced why:
`engine.js:1396` only recognizes `"annual"` and `"quarterly"` explicitly;
everything else, including my two guesses, falls into the same default
(`duration*.5`, i.e. monthly-equivalent pre-growth). The real three UI
values are `monthly`/`quarterly`/`annual` (`app-shell.html:288`). Not
re-tested with the correct three values given time in this batch --
flagged as unfinished rather than claimed as a confirmed finding either
way.

**Everything else ran cleanly, no anomaly (directionally sensible where a
direction was predictable):** a one-time transfer between two accounts,
including a transfer referencing a nonexistent account id (no crash) and
a transfer amount exceeding the source balance (no crash, no negative
balance); `guytonSkipInflation` true vs. false under Monte Carlo (small,
plausible difference); `rmdMultiplier`/`rmdFloor` at 0, 100, and 200
(each produced sensible relative differences, and a `rmdFloor` set far
above what the portfolio could sustain correctly drained it to zero
rather than crashing); `preserveRoth`; `rule55`/`penaltyException` at age
56 (rule55 alone waives the penalty; neither set applies it, correctly
producing a lower ending balance; both set together matches rule55 alone,
non-additive as expected); `flexibility:30` vs `0` under Monte Carlo
(30 correctly preserved more principal by cutting spending after down
years); `rmdSmoothing`; survivor benefit with `selfLife` before `endAge`
(spending reduction applies on the correct side of the death age); and
`ssAdvanced`/`aime`, including the degenerate `aime:0` case (no crash,
$0-shaped benefit).

**Findings:** 1 new finding (`reserveYears` is per-account rather than
portfolio-wide, confirmed with a precise three-way live comparison), 1
positive confirmation (`homeEquityFallback` behaves exactly as documented
across a full multi-row trace), 1 low-severity enum-defense gap
(`limitPolicy`, same shape as Q58 but milder consequence), 1 unfinished
lead (`withdrawalTiming`'s real enum values, not yet re-tested).

**Running total across all 29 batches:** 366 scenarios/checks/probes, 14
filed real findings (13 open for triage + Q56 as rebuild reference), 1
new unfiled finding awaiting your instruction (`reserveYears` per-account
scoping), 7 unfiled interaction/behavior observations (limitPolicy's
undefended enum and the withdrawalTiming unfinished lead joining Batch
29's list), 5 low-severity inert-field observations, 2
modeling-simplification observations, 1 code-hygiene-only observation, 1
documented mechanic difference (LTC), 1 minor hardening suggestion, 2
harness-only false alarms, 8 harness-only setup mistakes, 3 confirmed
input-validation/precision defenses, 2 positive mechanism confirmations
(`homeEquityFallback` joining `otherIncomes`' additive-overlap safety),
1 withdrawn finding (Q46), 2 scope clarifications, 2 corrected
explanations, 3 corrected precision/scope claims, 1 verification note
(Q50), and 1 finding confirmed fixed (Q49, `5d34573`).

---

## Template for future entries

```
## YYYY-MM-DD -- Batch N

**Model version:** commit `<hash>` ("<subject line>"), working tree
<clean|dirty: files>.

**Harness:** <what ran the scenarios, any setup gotchas>.

**Scenarios run (N):**

| # | Scenario | Result |
|---|---|---|

**Findings:** <details, or "none">.
```
