# S5AA R51 — prediction addendum: the owner's rulings on R51's D3 and R50's section 8 item 2

*Written by Claude on 2026-10-03 (Arizona, UTC−7). Committed before the addendum's source edits (A-01), held to
`audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md`. Base: `sprint/s5aa-r51` at `678c60f` (R51 built and recorded).*

## The rulings (the owner, 2026-10-03, relayed by the coordinator)

- R51 §5 (control 4.7): a successor control snapshot at `b722884`, built by the coordinator. This round does not touch
  `tools/control-corpus.json`, `tools/control-candidate-prediction.json`, any `tools/baseline-*` file or reference trees; control 4.7's
  four failures stay as they are.
- D1 (the band at 85.0%): keep. D2, D4, D5: confirmed as built. R50 §8 items 3 and 4: keep as built.
- **D3 rejected — build it:** the working-years check also subtracts the streams' income tax, federal and Arizona, as the salary's
  wage-only income tax is subtracted.
- **R50 §8 item 2 rejected — build the ordering-aware form:** the optimizer's Roth weight is the cost of the next dollar drawn under
  R50's ledger, replacing the exposed-share form.

## The rules, stated before the edit (`prediction/r51b_mirror.js`)

**1. The streams' tax.** The salary's pay is net of the wage-only return `T(w)` (`baseline` =
`estimateTaxes(p, age, max(0, wages − preTaxDeferrals), 0, 0, wages, 0, spouseWages, −, −, −, −, duration)`). The streams are charged
their marginal share of the same return with them added:

    S = T'(w + s) − T(w),
    T'(w + s) = estimateTaxes(p, age, max(0, wages + s − preTaxDeferrals), 0, 0, payrollWages, 0, payrollSpouseWages,
                              seSelf, seSpouse, −, −, duration, −, qbiCut)

with `s` the row's employment and self-employment stream pay (`other.wageSelf + wageSpouse + seSelf + seSpouse`), `payrollWages` /
`payrollSpouseWages` the row's payroll wages with the employment streams (as the full return takes them), and `qbiCut` the SE-funded
deferral the full return removes from QBI. `S` holds the streams' federal and Arizona income tax, their FICA and their SE tax (with
the deductible half and the QBI deduction the return applies). The working part of the streams' pay carries its share:
`pay += streamPay − S × streamPay / s`. (R51 at `8732bb8` subtracted `taxes.payroll − baseline.payroll` only.) The message reads "net
of the payroll, self-employment and income tax it adds".

**2. The Roth weight.** `rothNextDollarWeight(p, age, accounts, L, priorReturn)` replaces `rothExposureWeight()`: the first account
in the Roth class's draw order (`orderedAccountsInClass()`, the order `withdrawFromClass()` draws in); 0 when it is not a Roth IRA
(a Roth 401(k) or custom tax-free account is modelled tax-free); 0 when its owner is qualified (`rothQualified()`); else, read in
`rothIraTake()`'s order — basis (> 0: weight 0), then each conversion oldest first, its taxable part (inside its five years: 45 ×
[the 10% applies]; past them: 0) then its nontaxable part (0) — and earnings: 30 + 45 × [the 10% applies]. "The 10% applies" is
`earlyWithdrawalPenaltyRate(p, age, account, true) > 0`, as R50's weight read it. The interpretation for the record: "the next dollar"
is the next dollar the draw takes from the class (D6 below).

## The checklist

**C6, every reader.**

| rule | reader | condition |
|---|---|---|
| streams' tax | the working-years check in `simulatePlanRows()` (the only caller of `noteWorkingYearsShortfall()`); its message | `working`: the first warned row or its shortfall moves |
| Roth weight | `smartWithdrawalOrder()`, its only caller, called twice a row: the spending order and the order recomputed for tax funding | `roth`: the class order changes at a call with a Roth balance |
| the order it produces | the spending draw loop (`withdrawFromClass()` per class) and `quoteTaxFunding()` with the tax-funding draws by class | ranking: a draw in a flipped row reaches a class at or past the two orders' common prefix |
| the function name | `module.exports`, the app's `workerFunctions` (renamed `rothNextDollarWeight`) | `audit-q15-worker-dependencies`, `worker-parity`, `registry-single-definition` |
| direct test callers of `smartWithdrawalOrder()` | `smart-withdrawal-order*`, `audit-s5aa-hsa-qualified-share`, `-r20-rule55-ranking`, `public-route-q99`, `boolean-flag-contract`: every call passes five arguments (no ledger), so the weight is 0 before and after | unchanged |

Text pins searched: the working-years message is pinned only by R51's own witness (`/employment and self-employment income/`, kept;
a new assertion for the income-tax phrase). No test names `rothExposureWeight`.

**C1.** Both rules are computed on the engine's state by read-only taps, asserted output-neutral; today's working issue is re-derived
from the tapped pay and asserted equal to the engine's on every plan. After the build: `r51_c1_check.js` extended to (a) the engine's
working issue equals the first row where the tapped new pay is below zero, and (b) at every `smartWithdrawalOrder()` call of every
corpus plan and path the engine's weight equals the scan's (`r51b_mirror.js` NEXT on the same arguments).

**C2.** Not a limit. **C3.** The working condition needs a stream paid in a working row; the Roth condition a Roth balance.

**C4.** Monte Carlo: exposure by the order-flip test on every path with the engine's seeding (`prediction/r51b_corpus_scan.js`), named;
the draw-reach test ranks the exposed paths, never removes one (A-11).

**C5.** The working witnesses' figures are hand traces (in the test file). The Roth corpus movers: a hand trace of the first moving row
on its first ranked path (below); the size beyond that row is not traced.

**C7.** Controls beside each witness (a Roth IRA of earnings only; a qualified owner; no stream; a rental stream).

**C8.** The expanded capture compares every result leaf by hash (rows, issue text and state, Monte Carlo aggregates). The golden fixture
pins golden outputs. Control 4.7 is the coordinator's (its four failures stay).

## Predictions

### The corpus (`prediction/r51b_corpus_scan_at_678c60f.txt`)

- **Working years:** no corpus plan's first shortfall moves (none of the plans that carry the warning has a stream paid in a working row).
  The **message text changes in the nine corpus plans that carry the warning** (seed:2, 3, 4, 10, 12, 14, 15, 20, targeted:arm-flag-on):
  text only (the R51 lesson SA51-C, now predicted).
- **Roth weight — exposed (the order flips at some call with a Roth balance):** `golden:baseline`, `golden:reserve-and-bond-tent`,
  `golden:guardrails-withdrawal-strategy` (from 29.5: weight 72.26 → 0 once the plan's own contributions give the Roth IRA basis; order
  taxable,hsa,preTax,roth → taxable,roth,hsa,preTax); `expansion:s5aa-r6-gap-survivor-health-roth` (at 67: 4.36 → 0);
  `golden:monte-carlo-fixed-seed` and `expansion:monte-carlo-sensitive-band` (Monte Carlo, **all 500 paths exposed**, paths 0–499).
- **Ranking (a draw reaches past the common prefix):**
  - the four simple plans: **no draw reaches** (the taxable account pays every flipped row's spending and tax): **predicted unchanged**;
  - `golden:monte-carlo-fixed-seed`: **9 paths ranked first** — 36, 57, 184, 228, 265, 281, 296, 314, 471. Hand trace, path 36 at 59: the
    old order drew taxable $139,263.87, then pre-tax $26,271.79 with the 10% ($2,627.18) and as income, and $2,919.09 more pre-tax for the
    tax; under the new weight the Roth (basis from the plan's contributions) pays after the taxable account: that row's 10% and the
    pre-tax income fall away (taxes down in that row; the Roth lower, the pre-tax balance higher after it). **Named, every path exposed;
    the published result may move.**
  - `expansion:monte-carlo-sensitive-band`: **32 paths ranked** — 25, 36, 37, 57, 95, 99, 117, 129, 130, 144, 170, 184, 192, 197, 228, 236,
    255, 265, 281, 296, 303, 314, 359, 360, 362, 365, 418, 425, 437, 460, 471, 482 (first: path 25 at 59, pre-tax $82,753.19 with the 10%
    $8,275.32). **Named, every path exposed; the published result may move.** If its success leaves [50, 85] at step 12, or step 11 enters
    it, the band is re-picked by its rule (and that is a further input change, recorded).
- Every other corpus plan: unchanged.

### The tests (`prediction/r51b_test_exposure_summary_at_678c60f.txt`; 443 files, the same runner and caveats as R51's)

- **working:** only R51's own witness file.
- **roth (order flips) in 29 files; with a reaching draw in 20:** `golden-scenarios` (the golden MC fixture: may move; regenerated after
  reading its diff), `monte-carlo-sensitive-band` (may need the re-pick), `schema-catalogue` (shapes: expected to pass),
  `corpus-composition` / `corpus-configured-paths` (reach conditions of members: expected to pass unless a member leaves its band),
  `audit-cl-findings`, `audit-rb-findings` (**may fail** if they pin a moved figure; read and adapted by intent if the rule moves them),
  and same-tree comparisons expected to pass (`worker-parity`, `networth-reconciliation`, `household-ledger`, `boolean-flag-contract`,
  `debug-module`, `build-routes`, the capture tools).
- The hook's own failures (toJSON counts, the capture-process module list) and control 4.7's four are as in R51.

### The witnesses (`tests/audit-s5aa-r51-owner-follow-ups.test.js`, SHA-256 `5309b154…4ef0a9` at the base run; 22 cases)

On `678c60f` (`witness_runs/r51b_tests_at_678c60f.txt`): the six addendum repair cases fail with the pre-addendum figure; the controls pass.

| case | expected (hand-derived) | at `678c60f` |
|---|---|---|
| $12,000 job | short 720.50 | no warning |
| $12,000 self-employment | short 1,107.4655 | no warning |
| $10,000 self-employment (re-expected by the ruling; R51 expected 1,475.455) | short 2,599.97122 | short 1,475.455 |
| the message | "net of the payroll, self-employment and income tax it adds" | old phrase |
| Roth IRA with 50,000 basis at 50 | Roth 80,000 / 60,000, IRA 200,000, no tax | Roth 100,000 (the IRA paid) |
| Roth 401(k) first in the class order | Roth class 80,000, IRA 200,000, no tax | Roth 100,000 |
| controls: $40,000 job (funded); no stream / rental (10,062.50); Roth IRA of earnings (IRA pays); qualified owner at 60 (IRA pays) | as stated | pass |

## Decisions recorded for the owner

- **D6.** "The next dollar drawn from the Roth IRA" is read as the next dollar the draw takes from the Roth class: when a Roth 401(k)
  comes first in the class's draw order, the weight is 0 (it is modelled tax-free), so the class can rank ahead of an early pre-tax draw
  (witness 3).
