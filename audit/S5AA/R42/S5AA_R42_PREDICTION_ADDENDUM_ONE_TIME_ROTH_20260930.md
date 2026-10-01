# S5AA R42 — prediction addendum: the one-time Roth path (R41F-04's mirror)

*Written by Claude on 2026-09-30 (Arizona, UTC−7), committed before the engine is edited (A-01).*

## What was found

Claude's R42F full-model audit (area CONTRIB, finding CONTRIB-05) found that R42's repair of R41F-04 (`c28df6b`) reached
only the planned-contribution branch of `auditContributions()`. The **one-time** branch, used by a one-time transfer
counted as a contribution, still passes the annual salary rates to `rothContributionLimit()` (`src/engine.js:202`).

With R41F-04's own inputs (joint; self 44 at $0; spouse 45 at $260,000 a year, working half the row; retirement at 45.5),
a one-time $7,500 transfer from taxable into the self's Roth IRA at 44.5 moves **$0**, with the note "more than the $0 of
IRA contribution limit left this year". The planned contribution in the same plan deposits $7,500.

The owner decided on 2026-09-30: **"Fix it in #43 now"**, as part of "Repair all five in R42".

## The repair

The one-time branch reads each salary at its worked share (`compensation.selfWork` and `spouseWork`), exactly as the
planned branch does. A caller with no compensation reads the annual rate, as before.

## Predictions

1. **No corpus plan moves.** `prediction/one_time_roth_scan.js` finds one plan with a one-time transfer into a Roth IRA:
   `expansion:s5aa-r14-rmd-two-iras-distinct-returns`, from an IRA at 78. In that row both salaries are already 0, because
   the engine zeroes a salary once its owner stops working, so the worked share and the annual rate are both 0. Control
   4.7 has zero unpredicted, and the expanded capture equals r21.
2. **The witness:** the one-time transfer deposits **$7,500**. The proxy is $260,000 × 0.5 = $130,000, below the
   $242,000 start of the joint phase-out; joint compensation is $130,000; the IRA limit is $7,500 with nothing else
   contributed. The planned-contribution control stays at $7,500.
3. **Gate:** passes, with the new case; closeout 12/0/0.
4. **The browser check** is repeated on the final candidate (A-04), as the built app changes.
