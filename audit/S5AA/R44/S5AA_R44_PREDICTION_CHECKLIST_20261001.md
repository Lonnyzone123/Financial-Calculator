# S5AA R44 — prediction checklist

*Written by Claude on 2026-10-01 (Arizona, UTC−7), on the owner's decision of that day on ChatGPT's R43-04: "Fix the scan
method" and "Prove it on R43". The proof is `S5AA_R44_R43_04_RETRO_PROOF_20261001.md`.*

Every prediction from R44 on is held to this checklist. Each prediction record says, item by item, how it met each one,
or why an item does not apply. Each item comes from a measured R43 miss (SA43-A to -E).

## The items

**C1. The engine's own rules, not a re-derivation** (from SA43-D).
- Whenever a scan needs a fact the engine decides, it calls the engine's exported helper. Such facts include who is
  alive, the filing status, a contribution or work window, an owner's age, and a stream's payment.
- R43 part 4a tested "alive" as death after the row's opening. The engine counts a person alive at the opening of the
  row in which they die (decision 7), so the scan missed `expansion:s5aa-r6-gap-survivor-health-roth`.

**C2. A limit moves only what is deposited** (from SA43-A).
- A condition on a limit, a cap or a rate also tests that the flow it limits happens in that row: the contribution
  window is open, the account receives a deposit, or the draw is made.
- R43 part 2 flagged Roth limits in rows after the plans' contribution stop, and named `seed:3` and `seed:17`, which
  did not move.

**C3. A flow must flow** (from SA43-E).
- A condition on a stream, stage or expense tests that it pays in some row of the horizon, through the engine's own
  function.
- R43 part 4b named `seed:8`, whose stream starts and ends at 49 and never pays.

**C4. Monte Carlo plans are predicted path by path** (from SA43-B and the R44 proof).
- Each path is simulated with that tree's own seeding, and the scan checks its path 0 against `runPlan(runs: 1)`. The
  aggregated median rows are never scanned for a per-path rule.
- A path-level change moves the published result only if it reaches a reported figure: a quantile row, or the success
  rate. So a Monte Carlo plan with changed paths is predicted as **"paths change; the published result may move"**,
  marked stochastic, with the changed paths named.
- After the build, the record compares the actual result on both levels: which paths changed, and whether the
  published result moved.

**C5. A direction is computed, never guessed** (from SA43-C).
- Where an input change does what the repair does, the direction comes from the pre-repair engine run on that changed
  input.
- Otherwise it comes from a hand trace of the cash flow, written into the record.
- R43 part 3 said `seed:4`'s taxes would rise. They fell, because the ~$151M-a-year redirected HSA excess had been
  feeding the taxable account.

**C6. Every reader of a changed rule** (from SA43-B's real cause, found in the R44 proof).
- Before any condition is written, the engine is searched for every reader of each rule, table, function or field the
  repair changes. The readers are listed in the record, and each one gets its own condition.
- At R43, the joint IRMAA thresholds that SA42F-22 changed are read by two places:
  - the IRMAA charge;
  - the optimized withdrawal order's IRMAA guard (`smartWithdrawalOrder`).
- R43 part 2 tested only the charge. The band member, which has no health costs, moved through the guard. The R43
  self-audit's explanation of SA43-B (an IRMAA charge on one path) was wrong, and the proof corrects it.

**C7. Positive and negative controls for every condition.**
- Each condition flags its witness, and leaves alone a near-miss control: a row past the stop, a stream of zero
  length, a person alive at the opening, a path whose order does not change.

**C8. The actual movement is measured.**
- After each part, the plans that moved are measured with expanded captures before and after the part, compared entry
  by entry.
- The control declaration's "zero unpredicted" is not the comparison. It is written after the build.

## How a prediction record uses it

- Each record lists the readers it found (C6) and the condition for each.
- It names every plan it expects to move, with each plan's direction (C5).
- It marks every Monte Carlo plan stochastic, with its changed paths named (C4).
- After the build, it compares predicted against measured (C8), plan by plan, and for Monte Carlo plans on both levels.
