# S5AA R46 to R50 — change audit handover: the AA1 repair rounds

*Written by Claude, 2026-10-03 (Arizona, UTC−7), for ChatGPT's combined audit of five rounds built in parallel from R45 and
integrated in order. Every figure below was read from its output at the commit named. Each round's build report holds its detail;
this record is the map and the integration evidence.*

## 1. What is asked

Audit each round's change, number findings per round (**R46-NN** to **R50-NN**), and determine S5AA's status against E1 to E18 as
amended by A-01 to A-11, with GO or NO-GO for each round and for S5AA overall on the report's first line. The owner decided on one
combined audit over stacked pull requests (one per round), each round on its own source tag.

## 2. How the rounds came about

- **AA1:** your assumptions audit (PR #56); Claude's verification and the owner's decisions (PR #57,
  `audit/S5AA/AA1/S5AA_AA1_CLAUDE_VERIFICATION_20261003.md`). R45 (PR #58) built each spouse's own retirement date.
- **The owner, 2026-10-03:** build the remaining rounds in parallel. Five builders worked in separate worktrees, each from R45's
  head (`ba9946d`), each under the same rules: a prediction committed before any source edit, held to the R44.1 checklist; hand-
  derived witnesses; targeted tests only; no baselines. Claude then integrated them in order, gated each step, and registered
  each round's baseline.

## 3. The rounds, their source tags and their evidence

| round | owner's decisions built | built (prediction → repair) | integrated, tagged at | gate at the tag | baseline |
|---|---|---|---|---|---|
| **R46** Monte Carlo and the reserve | AA1-24, MC-A to MC-E | `aaa1852` → `8d2e288` | `0fd83e1` (`s5aa-r46-source`) | 3,318 tests, 3,309 pass, 0 fail, 9 todos | r25 |
| **R47** federal tax and accounts | AA1-30, -13, -27, -45, -26, -32 | `0f333b8` → `f02e26a` | merge `4f7a5ed`, tag `86842f6` | 3,355 / 3,346 / 0 / 9 | r26 |
| **R48** Medicare, survivors, Arizona | AA1-23, -11, -19, -20, -16 | `7fec79a` → `126c7f1` | merge `e2d989f`, tag `56ed5fd` | 3,387 / 3,378 / 0 / 9 | r27 |
| **R49** spending, debt, defaults, disclosure | AA1-07, -25(a)(b), -34, -37, -44, -33 (relabel), hidden warnings, relabels | `6292431` → `62964a1`, `070f721` | merge `d381383`, tag `ec6063f` | 3,421 / 3,412 / 0 / 9 | r28 |
| **R50** Roth IRA ledger, earlier income | AA1-36, AA1-31 | `88b7496` → `2d9ede3` | merge `ab33cb7`, tag `5119d03` | 3,447 / 3,438 / 0 / 9 | r29 |

Closeout is 12 accepted, 0 refused, 0 errors at every tag. Each build report: `audit/S5AA/R4x/S5AA_R4x_BUILD_REPORT_20261003.md`.

## 4. Integration

- **How:** R46 sat directly on R45. Each later round was merged onto the previous round's tag. Where both sides had edited the same
  long engine lines, a token-level three-way merge (split at `; , { }`) merged them; every remaining conflict was resolved by hand
  and recorded in its merge commit. Generated files (golden fixture, control 4.7's declarations, the registers, the built app)
  were regenerated on the merged engine, never hand-merged.
- **Hand resolutions that change behaviour** (each in its merge commit):
  - R48 on R47: Arizona subtracts the federal senior deduction (R48), which ends after 2028 (R47). The two survivor-filing tests and
    two R47 witnesses were re-derived by hand for 2028 (Arizona now subtracts the federal $6,000: $3,649 → $3,499; the solver case
    $2,571.93 → $2,396.49); from 2029 R47's figures hold.
  - R50 on R49: R50 made `estimateTaxes()` a wrapper over `estimateTaxesForYear()`; R47 added a trailing `qbiReduction` argument.
    The wrapper accepts and passes it on.
  - R49 on R48: the app's warning-card list and form read list carry both rounds' entries; two stray merge-marker characters left
    by the token merge broke the app script and were found by the app tests before the gate.
- **Composition, measured:** at each step the expanded capture of the merge was compared with r24 and with each side measured
  alone (`prediction/compose_check.js` and its output in each of R47-R50's folders). At every step: every entry moved by one side
  equals that side alone; nothing moved that neither side moved. The one interaction is the intended one: R48 alone changed eight
  entries only in tax years 2035 and later, by Arizona subtracting a federal senior deduction R47 ends after 2028; on R47 those
  entries equal r24 (verified row by row; r27's registry note).

## 5. Predicted against measured, and the misses

Each build report compares the round's prediction with its measured movement. The misses, and what the owner required:

| round | misses (build report) | owner's ruling (2026-10-03) | evidence |
|---|---|---|---|
| R46 | SA46-A (direct reserve-rate calls in an R2 test, unnamed), -B (a witness forgot the default flexibility), -C (closeout), -D (schema fixture) | none moved output beyond the prediction | build report |
| R47 | an unflagged mover (`seed:20`), a wrong direction (`expansion:s5aa-r6-gap-survivor-health-roth`), an unscanned route (`seed:13`), 18 flagged plans that did not move | **prove a corrected scan** | `audit/S5AA/R47/retro/`: names exactly the 24 movers, every direction, Monte Carlo paths exactly (179, 18) |
| R48 | M3: `seed:20` unflagged, opposite direction (the wage-only baseline reader) | **prove a corrected scan** | `audit/S5AA/R48/retro/`: 37 of 37 movers and directions; found a second missed reader (pay-first) |
| R49 | SA49-A (`seed:5`'s size), -B to -E (tests and closeout) | direction right; no unnamed mover | build report |
| R50 | SA50-B, -C, -D: unnamed Monte Carlo paths (golden 9, band 15), one reader (the optimizer's Roth weight) | **prove a corrected scan** | `audit/S5AA/R50/retro/`: every changed path flagged in all three plans |

The common lesson, carried from R45: a scan must cover every engine reader of a changed quantity, including second calls of the
same function (the wage-only baseline return) and rules that spend a quantity (pay-first, the optimizer).

## 6. The browser check (task 6.5, A-04)

- **R46** at `0fd83e1` and the **final stack** at `5119d03` (R41's scripts, unchanged, Chromium 152 on Windows 11): A to E give the
  same results as at R44 (75 of 75 Worker equals main thread; 72 equal Node, the other three the same Monte Carlo plans within
  1.8 × 10⁻¹⁵ relative; 70 imported, 70 CSVs and Worker replies equal; fault fallback and recovery exact; four concurrent Workers).
- **The new inputs at `5119d03`,** each changed on its own: Medicare start ages (both), Medicare growth rate, Part D premium, the
  Arizona post-2011 gain share, community property, LTC onset age, earlier income, and both first-Roth-contribution years — each
  stored and recalculated at once; blanking removes each field. R46's label reads "All modeled spending funded" with the final-
  year spending summary; R49's "Plan checks" list shows the flexibility-with-guardrails warning and clears it.
- R47 to R49's intermediate tags were not browser-checked separately; the final stack carries every round's inputs. One desktop
  browser.

## 7. The owner's decisions on the builders' questions (2026-10-03)

- Keep the result contract at version 5 (R46's new key is optional). A Monte Carlo account created mid-year takes that year's
  shared shock (Q19 revised). The Arizona post-2011 gain share defaults to 0%. Only traditional IRAs are held as inherited.
  The Roth 401(k) stays as before, disclosed.
- **Follow-up round R51** (built next): spending flexibility defaults to off (`defaultPlan`); Medicare premiums and IRMAA start
  at each person's Medicare start age (one Medicare date with R47's HSA stop); the working-years check counts employment and
  self-employment streams; a "plan offers Roth" checkbox.

## 8. Not changed, and carried

The AA1 options the owner did not choose stay as recorded limits (a full working-years budget, itemized deductions, a
tax-optimizing solver, full Roth five-year clocks for Roth 401(k)s, surviving-spouse filing status, Social Security benefit-cut
scenarios, the SSA-44 reduction, tax lots). The builders' remaining questions to the owner are listed in each build report.
