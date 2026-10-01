# S5AA R44.1 — prediction checklist, revised

*Written by Claude on 2026-10-01 (Arizona, UTC−7), after ChatGPT's R44 audit (PR #49) and on the owner's decision of that day
on its R44-01: "Owner exception for Monte Carlo". It supersedes `audit/S5AA/R44/S5AA_R44_PREDICTION_CHECKLIST_20261001.md`,
which stays as committed. Only C4 and C8 change. Amendment A-11 (`S5AA_TASK_CHECKLIST.md`) is the authority for C4.*

Every prediction from R44.1 on is held to this checklist. Each record says, item by item, how it met each one, or why an item
does not apply.

## The items

**C1. The engine's own rules, not a re-derivation.** Whenever a scan needs a fact the engine decides, it calls the engine's
exported helper. Such facts include who is alive, the filing status, a contribution or work window, an owner's age, a
stream's payment, and whether a transfer is a contribution. (R43's SA43-D; R44's SA44-B.)

**C2. A limit moves only what is deposited.** A condition on a limit, a cap or a rate also tests that the flow it limits
happens in that row. (SA43-A.)

**C3. A flow must flow.** A condition on a stream, stage or expense tests that it pays in some row of the horizon, through
the engine's own function. (SA43-E.)

**C4. A Monte Carlo plan is predicted at the path level (A-11).** Revised.
- The exposure test runs on every path, with that tree's own seeding, and the scan checks its path 0 against
  `runPlan(runs: 1)`.
- The test is a **necessary condition**: it may name more paths than change, but it must not miss one. A further stage
  that approximates a path's state from its published row fields (class balances at the row's close, say) may *rank* the
  exposed paths, but **must not remove one**. At R43 part 2 such a stage removed a path that changed (golden path 390), and
  the exposure test alone named every changed path.
- The plan is predicted as: **named, with its exposed paths; the published result may move.**
- After the build, the record compares on both levels: the paths that changed, measured on both trees, and whether the
  published result moved. Under A-11:
  - a named plan whose published result does not move is not a miss;
  - an unnamed plan whose published result moves is a miss;
  - a changed path that was not named is a miss.
- A non-Monte-Carlo plan is not covered by this item. It needs C5's direction and an approximate size.

**C5. A direction is computed, never guessed.** It comes from the pre-repair engine run on an equivalent input where one
exists, or otherwise from a hand trace of the cash flow, written into the record. (SA43-C.)

**C6. Every reader of a changed rule.** Before any condition is written, the engine is searched for every reader of each
rule, table, function or field the repair changes. Each reader is listed in the record and gets its own condition. (SA43-B's
real cause.)

**C7. Positive and negative controls for every condition.** Each condition flags its witness, and leaves alone a near-miss
control.

**C8. The actual movement is measured, and each comparison is read before it is predicted.** Revised.
- **Before a prediction names a level** (control 4.7, the expanded capture, a golden fixture, a test), the record says how
  that comparison reads each field the prediction expects to move, read from the comparison's own code or declarations.
  For example, control 4.7 records `limitWarnings` by its length, so a change of text inside a warning is invisible there,
  while the expanded capture compares the text. (SA44-A.)
- After each part, the plans that moved are measured with expanded captures before and after it, compared entry by entry.
  The control declaration's "zero unpredicted" is not the comparison.

## How a prediction record uses it

- Each record lists the readers it found (C6), with a condition for each, and says how each comparison reads the fields it
  predicts (C8).
- It names every plan it expects to move:
  - **a non-Monte-Carlo plan** with its fields, direction and approximate size (C5);
  - **a Monte Carlo plan** with its exposed paths and "the published result may move" (C4, A-11).
- After the build, it compares predicted against measured, plan by plan. For a Monte Carlo plan the comparison is made on
  both levels.
