# S5AA R48 — M3: the corrected scan, proved on the pre-repair tree

*Written by Claude on 2026-10-03 (Arizona, UTC−7), on the owner's decision of that day: R48's miss M3 (`seed:20` moved unflagged, in
the opposite direction, through the wage-only baseline tax) is not accepted as disclosed. As R44 did for R43-04, this records a
corrected scan, run on R48's pre-repair tree `ba9946d`, against the measured movement. Files: `r48_corpus_scan_v2.js` (the scan),
`r48_corpus_scan_v2_at_ba9946d.txt` and `r48_corpus_scan_v2_result.json` (its output), `r48_compare_v2.js` and
`r48_compare_v2_out.txt` (the comparison), `expanded_ba9946d.json` and `expanded_126c7f1.json` (the captures, copied from
`eaf6b4d`'s `audit/S5AA/R48/prediction/`).*

## What was done

1. **The measured truth:** the expanded captures at `ba9946d` (equal to r24 on 71 of 71) and at the R48 repair `126c7f1`, compared entry
   by entry: 37 entries moved. For each, the comparison reads the sign of the total at the first row whose total moved; an entry whose
   rows moved but whose totals never did is "spending and taxes only"; one whose rows did not move is "issue text only".
2. **The corrected scan**, run on `ba9946d` in a scratch detached worktree (a `node_modules` junction, removed afterwards), reads each
   row of each non-Monte-Carlo plan through an output-neutral tap on the pre-repair engine (the variant's rows are asserted identical to
   the engine's). Its corrections to the committed scan (`audit/S5AA/R48/prediction/r48_corpus_scan.js`, `7fec79a`):
   - **C6, the reader M3 missed:** the Arizona senior subtraction reaches two `estimateTaxes()` calls in a row -- the return, and the
     wage-only BASELINE, the tax the wages pay before the portfolio funds the rest. The tap hands over each call's MAGI and Arizona tax.
   - **C2:** each call's Arizona tax falls by 2.5% x min(the federal senior deduction, its Arizona base), so the condition needs both
     the deduction and a pre-repair Arizona tax above 0. The committed scan read the deduction alone and flagged 11 plans whose Arizona
     base was already 0; the corrected scan names none of them.
   - **C5, direction:** per row, the first-order effect on the portfolio is the return's fall, less the baseline's fall, less the extra
     Medicare charge (positive: the total rises). A row that spends an outside-income surplus (surplus policy "spend") takes the change
     in that spending and its total does not move (M5, `seed:16`).
   - **C6, a second missed reader, found by this proof:** at first the corrected scan predicted `expansion:s5aa-gap-working-household`
     DOWN from 61, and it moved UP from 57. In a retired row where someone still works, R35/R45's pay-first spends the net pay -- wages
     less contributions less the baseline tax -- before the portfolio. Where all of it is spent (the portfolio draws too), the
     baseline's fall is more pay spent and less drawn, so it returns to the portfolio (rows 54 to 60 there: return and baseline each fall
     $150, net +$150). The scan now reads the row's `retiredPaySpent` and drawings.
   - Unchanged: the Medicare condition and its first-tier size; the rollover message (the expanded capture hashes issue text); C4 (a
     Monte Carlo plan is exposed by age alone, every path: "named, every path exposed; the published result may move").

## Result

**The corrected scan names 37 plans, exactly the 37 that moved, each with the measured direction. It names no plan that did not move.**

| | committed scan (`7fec79a`) | corrected scan (`ba9946d`) | measured |
|---|---|---|---|
| plans named | 47 (Arizona 47, Medicare 2, rollover 3) | 37 | 37 moved |
| moved and not named | 1 (`seed:20`) | 0 | |
| named and not moved | 11 (Arizona base already 0) | 0 | |
| direction right | not given per plan | 37 of 37 | |

Selected rows of `r48_compare_v2_out.txt` (predicted, then measured):

| plan | predicted | measured |
|---|---|---|
| `seed:20` (M3) | baseline only: total DOWN from 65, first-order −$135.96 | DOWN from 65, −$142.54 |
| `expansion:s5aa-gap-working-household` | UP from 57, +$150.00 | UP from 57, +$155.69 |
| `seed:10` (Medicare) | DOWN from 72, −$4,753.40 | DOWN from 72, −$4,791.47 |
| `seed:16` (Medicare; M5) | spending and taxes only (every exposed row absorbed by surplus spending) | spending and taxes only |
| `expansion:s5aa-r19-ira-qcd-offset` | spending and taxes only | spending and taxes only |
| `targeted:survivor-stateful` | issue text only (the rollover message) | issue text only |
| `golden:monte-carlo-fixed-seed`, `expansion:monte-carlo-sensitive-band` | Monte Carlo, every path exposed; may move | both moved (UP from 65, +$13.13; UP from 87, +$170.51) |
| the other 29 | 27 total UP from the first exposed row (the return's Arizona fall); 2 DOWN where the baseline's fall comes first (`golden:rmd-and-roth-conversion` from 69, `expansion:s5aa-r6-gap-survivor-health-roth` from 64) | the same, each |

No corpus plan carries a new R48 input or passes a traditional IRA to a survivor under 59½ (checked again by the corrected scan).

## What this says about R48's prediction

- M3 had one cause and a second sibling: both readers are the baseline tax (the wage-only `estimateTaxes()` call), one through the
  portfolio-funded remainder and one through pay-first. Neither was in the prediction record's C6 table.
- M5's `seed:16` is predicted by the surplus-spending rule; `seed:10`'s first moved row and direction are predicted, and its
  final-row total is unchanged only because the plan runs short later (the build report, §3.1).
- The direction measure here is the first moved row's total. Over a whole plan some movers change sign (`golden:rmd-and-roth-conversion`
  falls from 69 and ends $15,094.82 higher); the build report gives each mover's final total and lifetime taxes.
