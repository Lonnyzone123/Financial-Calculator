# S5AA R44 — change audit handover: R43-01 to R43-04

*Written by Claude, 2026-10-01 (Arizona, UTC−7), for ChatGPT's audit of the change from `s5aa-r43-source` (`5b8f0d5`) to
`s5aa-r44-source` (`06e551e`). Every figure below was read from its output at the commit named.*

## 1. What is asked

Audit the R44 change and number any findings **R44-NN**. Determine S5AA's status against E1 to E18 as amended by A-01 to
A-10, with GO or NO-GO on the report's first line. In particular, say whether the R43-04 work below meets your finding.

## 2. How the status got here

- **Your R43 audit** (PR #47) determined **NO-GO** at `5b8f0d5`:
  - **R43-01:** a one-time HSA contribution after 65;
  - **R43-02:** one-time IRA compensation without the income latch;
  - **R43-03:** negative profit sharing accepted;
  - **R43-04:** R43's five prediction misses.

  It confirmed all 34 SA42F findings (SA42F-20 qualified) and refuted none.
- **The owner decided on 2026-10-01:**
  - repair R43-01, -02 and -03;
  - for R43-01, follow IRC 223(b) on **both** routes: in the row an owner turns 65, the HSA limit is prorated by the share
    of the row before 65;
  - **R43-04 is not accepted as a disclosed miss.** It requires a written prediction checklist and a proof, on R43's own
    trees, that corrected scans would have predicted what moved.

## 3. The commits

| commit | what | gate |
|---|---|---|
| `2559625` | **R43-04:** the checklist (`S5AA_R44_PREDICTION_CHECKLIST_20261001.md`, C1 to C8) and the proof (`S5AA_R44_R43_04_RETRO_PROOF_20261001.md`, `prediction/retro/`). Records only; the source is `5b8f0d5`'s | — (no source change) |
| `f3d7e0a` | the prediction, before any edit (A-01), held to the checklist: scan, direction script, witness run | — (records only) |
| `bb5e7f3` | **R43-01, -02, -03** (§4); the R30 test adapted by intent (§6); control 4.7 declared for `seed:4` | 3,260 / 0 failing |
| `06e551e` | r23 registered (§6) | see §7 |

## 4. The repairs

- **R43-01.** IRC 223(b)(1) to (3) make the year's HSA limit the sum of monthly limitations for the months before Medicare,
  each 1/12 of the annual amount with the catch-up added. Section (b)(7) makes it zero from Medicare, which the model
  assumes at 65. Pub. 969's example: turning 65 in July, ($4,300 + $1,000) × 6 / 12 = $2,650.
  - **The rule:** in the row an owner turns 65, their limit is the share of the row before 65 times (base + catch-up). From
    65 it is zero.
  - **Planned route:** R43's flow stop is kept, and the base and catch-up rooms are held to the share.
  - **One-time route:** the owner's share, less their planned use, within the family base left.
  - **The witnesses:**
    - one-time $4,400 at 66: $0, the note says so (was $4,400);
    - a spouse turning 65 halfway through a family-coverage row: a one-time $6,000 gives (8,750 + 1,000) × 0.5 = $4,875;
      a planned $12,000 flows $6,000, is held to $4,875, and $1,125 is redirected (each was $6,000).
  - **The controls:** before 65, under the prorated limit, and the planned route at 66.
  - Only a row with a 65th birthday strictly inside it changes. Rows are tax years closing on the primary person's
    birthdays, so in practice this is a spouse whose age is a fraction off.
- **R43-02.** `transferRoom()` passes the latched today's-dollar income factors, as the planned audit does. Your witness:
  the stream pays $12,968.71, and the one-time $7,500 IRA contribution moves in full (was $5,000).
- **R43-03.** `src/plan-value-contract.json` gives `accounts[].matchRate`, `matchCap` and `profitShare` a minimum of 0.
  Each negative value is refused by both layers (`OUT_OF_RANGE` in the validator, `SCENARIO_PLAN_VALUE_OUT_OF_RANGE` in the
  engine). Zero is allowed, and 5% profit sharing still gives $18,000.
- **Tests:** `tests/audit-s5aa-r44-contribution-routes.test.js`, 10 cases on the public routes, hand-derived. Before the
  repair every repair case failed with the pre-repair figure and every control passed (`witness_runs/`). After it, 10 of
  10 pass.

## 5. R43-04: the checklist and the proof

- **The checklist (C1 to C8).** Each item comes from a measured R43 miss:
  - **C1:** the engine's own helpers, not re-derivations.
  - **C2:** a limit moves only what is deposited.
  - **C3:** a flow must actually pay.
  - **C4:** Monte Carlo plans are predicted path by path, as "paths change; the published result may move".
  - **C5:** a direction comes from the pre-repair engine run on an equivalent input, or from a written hand trace.
  - **C6:** every reader of a changed rule gets its own condition.
  - **C7:** positive and negative controls.
  - **C8:** the actual movement is measured with expanded captures, not read off the control declaration.
- **The proof.**
  - The plans each R43 part moved were measured by expanded captures before and after it.
  - The corrected scans were built from the committed R43 scans, so the difference is the correction alone, and each was
    run on its part's pre-repair tree.
  - **Parts 3, 4a and 4b:** exactly the plans that moved, `seed:4`'s direction included.
  - **Part 2:** the band member is caught, and `seed:3` and `seed:17` drop out. `golden:monte-carlo-fixed-seed` is also
    named: four of its 500 paths do change, measured, but its published result does not. C4 classes it as a stochastic
    prediction.
- **SA43-B's cause is corrected.** R43's self-audit and handover described the band member's movement as an IRMAA charge
  on one path. Your report, rightly, said only that the SA42F-22 repair caused it. The band member has health costs off, so it is never charged IRMAA. It moved through the optimized withdrawal
  order's IRMAA guard, which reads the same joint thresholds.
- **The limit of the proof:** the corrections were designed knowing these misses. R44's own prediction is the first test of
  the method on a change whose result was not known.

## 6. R44's own prediction against actual

The prediction (`f3d7e0a`) names two plans, both under R43-01's one-time route:
- **`seed:4` moves.** Its rows become the pre-repair engine's rows for the same plan with the transfer off, and lifetime
  taxes rise $2,768.18.
- **`seed:13`** moves in its limit warning only, from $8,750 of room to $0.

| | predicted | measured |
|---|---|---|
| control 4.7 | `seed:4` (rows), `seed:13` (warning) | `seed:4`: 31 differences, declared. Its rows equal the transfer-off rows exactly (`prediction/r44_seed4_check_f3d7e0a_vs_build.txt`), and lifetime taxes rise **$2,768.18**. **`seed:13` does not appear:** 4.7 compares `limitWarnings` by length, and the text change is not a length change. **This is a miss at the control level** (SA44-A) |
| expanded capture | `seed:4`, `seed:13` | **exactly `seed:4` and `seed:13`.** `seed:4` differs in its rows, lifetime taxes and limit warning; `seed:13` only in its limit warning ($8,750 of room → $0). The other 69 equal r22. Registered as **r23** (`tools/baseline-20261001-s5aa-expanded-r23.json`): captured at `bb5e7f3` twice in clean worktrees, byte-identical; invariants 7/7; input hash unchanged (`28e26d38…`); output `a67cf681…6373` |
| tests pinned to the old behaviour | to be found by the gate | **one file:** `tests/audit-s5aa-r30-transfer-to-hsa-counts-toward-rmd.test.js` (5 cases). It credited pre-tax transfers into the 80-year-old owner's **own** HSA, which now has no room. **Adapted by intent:** each crediting case sends the money to a spouse of 62 (room $8,750 + $1,000 = $9,750, your R29 example's amount), and marks the IRA not solely the spouse's so the Uniform divisor 20.2 every expectation reads still applies. A new case holds the owner's-own transfer at $0, with the requirement drawn in full. Please check this adaptation keeps R30's subject |

## 7. Checks

| check | result |
|---|---|
| gate at `06e551e` (the source) | GATE PASSED: 3,260 tests, 3,251 pass, 0 fail, 0 skipped, 9 todo; closeout accepted 12, refused 0 |
| control 4.7 at `06e551e` | found 15,940, **unpredicted 0**, declared-but-not-found 0 |
| expanded capture | r23, as §6 |
| the build | `investment-calculator-v2c.html` at `06e551e`: SHA-256 `720834cd9e695c50023963582070b92a94d0fdf9425b21d42f55ed3a85a2811d`, 1,051,262 bytes, the pin in `tests/lib/harness.js`; `node build.js` reproduces it byte for byte |
| **task 6.5, repeated on the final candidate (A-04)** | R41's scripts (`audit/S5AA/R41/e15/`), unchanged, in Chromium 152 on Windows 11, at 1:23 am (Arizona). Raw: `e15/browser_results_06e551e.json`; Node's reference: `e15/node_results_06e551e.json`.<br>- **A:** the Worker equals the main thread on 75 of 75 plans; 72 equal Node, `seed:4`'s moved figures included.<br>- **B:** 70 imported, 70 CSVs byte-identical between the Worker and main-thread paths, 70 of 70 Worker replies equal the main-thread engine; the same 5 refused at import as at `5b8f0d5`.<br>- **C:** a Worker fault or a load fault falls back with the identical CSV; with both failing, no figures are shown and the debug export records `ENGINE_RUN_FAILED`; recovery is exact.<br>- **D:** four concurrent Workers, each equal to the main thread.<br>- **E:** the same three Monte Carlo plans differ from Node by at most 5.57 × 10⁻¹⁵ relative, with no count, rate or path count moving.<br>The same results as at `5b8f0d5`. This is still one desktop browser |

## 8. Disclosed, not repaired

- **The model reads the HSA limit per row** (a tax year closing on the primary person's birthday), with Medicare at 65
  assumed. It does not read calendar months.
- **Every limit R43 left disclosed stands** (handover R43 §7).
