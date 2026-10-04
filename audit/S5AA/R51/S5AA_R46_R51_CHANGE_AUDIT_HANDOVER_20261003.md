# S5AA R46 to R51 — change audit handover: the AA1 repair rounds

*Written by Claude, 2026-10-03 (Arizona, UTC−7), for ChatGPT's combined audit of six rounds. Five were built in parallel from R45
and integrated in order; the sixth (R51) builds the owner's decisions on the first five's questions. Every figure below was read
from its output at the commit named. Each round's build report holds its detail; this record is the map and the integration
evidence. It supersedes `audit/S5AA/R50/S5AA_R46_R50_CHANGE_AUDIT_HANDOVER_20261003.md`, written before R51, which it repeats
with R51 added.*

## 1. What is asked

Audit each round's change, number findings per round (**R46-NN** to **R51-NN**), and determine S5AA's status against E1 to E18 as
amended by A-01 to A-11, with GO or NO-GO for each round and for S5AA overall on the report's first line. The owner decided on one
combined audit over stacked pull requests (one per round), each round on its own source tag.

## 2. How the rounds came about

- **AA1:** your assumptions audit (PR #56); Claude's verification and the owner's decisions (PR #57,
  `audit/S5AA/AA1/S5AA_AA1_CLAUDE_VERIFICATION_20261003.md`). R45 (PR #58) built each spouse's own retirement date.
- **The owner, 2026-10-03:** build the remaining rounds in parallel. Five builders worked in separate worktrees, each from R45's
  head (`ba9946d`), each under the same rules: a prediction committed before any source edit, held to the R44.1 checklist; hand-
  derived witnesses; targeted tests only; no baselines. Claude then integrated them in order, gated each step, and registered
  each round's baseline.
- **R51:** the owner decided the builders' questions (§7). R51 was built from R50's tag on the same rules, with a prediction
  addendum for two of the owner's rulings on its own builder's readings.

## 3. The rounds, their source tags and their evidence

| round | owner's decisions built | built (prediction → repair) | integrated, tagged at | gate at the tag | baseline |
|---|---|---|---|---|---|
| **R46** Monte Carlo and the reserve | AA1-24, MC-A to MC-E | `aaa1852` → `8d2e288` | `0fd83e1` (`s5aa-r46-source`) | 3,318 tests, 3,309 pass, 0 fail, 9 todos | r25 |
| **R47** federal tax and accounts | AA1-30, -13, -27, -45, -26, -32 | `0f333b8` → `f02e26a` | merge `4f7a5ed`, tag `86842f6` | 3,355 / 3,346 / 0 / 9 | r26 |
| **R48** Medicare, survivors, Arizona | AA1-23, -11, -19, -20, -16 | `7fec79a` → `126c7f1` | merge `e2d989f`, tag `56ed5fd` | 3,387 / 3,378 / 0 / 9 | r27 |
| **R49** spending, debt, defaults, disclosure | AA1-07, -25(a)(b), -34, -37, -44, -33 (relabel), hidden warnings, relabels | `6292431` → `62964a1`, `070f721` | merge `d381383`, tag `ec6063f` | 3,421 / 3,412 / 0 / 9 | r28 |
| **R50** Roth IRA ledger, earlier income | AA1-36, AA1-31 | `88b7496` → `2d9ede3` | merge `ab33cb7`, tag `5119d03` | 3,447 / 3,438 / 0 / 9 | r29 |
| **R51** the owner's follow-ups | AA1-25(c), one Medicare date, streams as pay, the Roth checkbox; two rulings | `d663f16` → `b722884`, `8732bb8`; addendum `7f1e131` → `2f73b85` | successor control `9e0bf0b`, declarations `9135fb8`, tag `ee06ea5` | 3,473 / 3,464 / 0 / 9 | r30 |

Closeout is 12 accepted, 0 refused, 0 errors at every tag. Each build report: `audit/S5AA/R4x/S5AA_R4x_BUILD_REPORT_20261003.md`
and `audit/S5AA/R51/S5AA_R51_BUILD_REPORT_20261003.md`.

## 4. Integration

- **How:** R46 sat directly on R45. Each later round of R47 to R50 was merged onto the previous round's tag. Where both sides had
  edited the same long engine lines, a token-level three-way merge (split at `; , { }`) merged them; every remaining conflict was
  resolved by hand and recorded in its merge commit. Generated files (golden fixture, control 4.7's declarations, the registers,
  the built app) were regenerated on the merged engine, never hand-merged. R51 was built on R50's tag directly; the coordinator's
  successor-control commit and R50's records joined it by one merge (`13aa9c8`) with no conflict.
- **Hand resolutions that change behaviour** (each in its merge commit):
  - R48 on R47: Arizona subtracts the federal senior deduction (R48), which ends after 2028 (R47). The two survivor-filing tests and
    two R47 witnesses were re-derived by hand for 2028 (Arizona now subtracts the federal $6,000: $3,649 → $3,499; the solver case
    $2,571.93 → $2,396.49); from 2029 R47's figures hold.
  - R50 on R49: R50 made `estimateTaxes()` a wrapper over `estimateTaxesForYear()`; R47 added a trailing `qbiReduction` argument.
    The wrapper accepts and passes it on.
  - R49 on R48: the app's warning-card list and form read list carry both rounds' entries; two stray merge-marker characters left
    by the token merge broke the app script and were found by the app tests before the gate.
- **Composition, measured:** at each step from R47 to R50 the expanded capture of the merge was compared with r24 and with each side
  measured alone (`prediction/compose_check.js` and its output in each of R47 to R50's folders). At every step: every entry moved
  by one side equals that side alone; nothing moved that neither side moved. The one interaction is the intended one: R48 alone
  changed eight entries only in tax years 2035 and later, by Arizona subtracting a federal senior deduction R47 ends after 2028; on
  R47 those entries equal r24 (verified row by row; r27's registry note).

## 5. Predicted against measured, and the misses

Each build report compares the round's prediction with its measured movement. The misses, and what the owner required:

| round | misses (build report) | owner's ruling (2026-10-03) | evidence |
|---|---|---|---|
| R46 | SA46-A (direct reserve-rate calls in an R2 test, unnamed), -B (a witness forgot the default flexibility), -C (closeout), -D (schema fixture) | none moved output beyond the prediction | build report |
| R47 | an unflagged mover (`seed:20`), a wrong direction (`expansion:s5aa-r6-gap-survivor-health-roth`), an unscanned route (`seed:13`), 18 flagged plans that did not move | **prove a corrected scan** | `audit/S5AA/R47/retro/`: names exactly the 24 movers, every direction, Monte Carlo paths exactly (179, 18) |
| R48 | M3: `seed:20` unflagged, opposite direction (the wage-only baseline reader) | **prove a corrected scan** | `audit/S5AA/R48/retro/`: 37 of 37 movers and directions; found a second missed reader (pay-first) |
| R49 | SA49-A (`seed:5`'s size), -B to -E (tests and closeout) | direction right; no unnamed mover | build report |
| R50 | SA50-B, -C, -D: unnamed Monte Carlo paths (golden 9, band 15), one reader (the optimizer's Roth weight) | **prove a corrected scan** | `audit/S5AA/R50/retro/`: every changed path flagged in all three plans |
| R51 | SA51-A (control 4.7 refuses changed inputs before comparing; the prediction expected re-declarations), -B (an R23 test relied on the inherited 10% flexibility), -C (a rewritten warning text reaches nine corpus plans; predicted none); addendum SA51-D (a pinned path gap executes again), -E (the schema fixture gains three optional fields) | SA51-A: **a successor control** (§6); the rest adapted by intent | build report §4, §6, §10 |

The common lesson, carried from R45: a scan must cover every engine reader of a changed quantity, including second calls of the
same function (the wage-only baseline return) and rules that spend a quantity (pay-first, the optimizer). R51 adds one: a
prediction about a control must read the control's own refusal rules first.

**A records error in R50's registration, found while registering r30:** r29's registry note said nine entries carry
`outsideSupportedDomain`, carried from r28. It is four (`seed:3`, `seed:8`, `seed:11`, `seed:15`): R50's Roth IRA ledger models the
Roth IRA draws before 59½ that flagged the other five, all among R50's predicted movers. The note is corrected in `ee06ea5`; no
capture changed.

## 6. Control 4.7 after R51: a successor control

- **Why:** R51 turns spending flexibility off by default. Every golden and targeted control scenario inherits the default, so
  sixteen of the 36 control scenarios mean different plans (corpus-input hash `343387a9` → `dbbe8036`; the twenty seeds draw their
  own flexibility). Control 4.7 refuses any comparison across different inputs, and its rules make an input change its own versioned
  change with a successor capture, never an edit (control rules 3 and 5).
- **The owner's choice (2026-10-03):** a successor control, as S5's U4 did (the alternative was freezing the control at the old
  default, so it would no longer be built from the app's default).
- **What was done** (`9e0bf0b`):
  - the default change sits alone in `b722884`;
  - the control composition was captured there twice in clean worktrees, byte-identical, qualified:
    `tools/baseline-20261003-s5aa-r51-control.json`;
  - `tools/control-corpus.json` names `s5aa-r51-control`, with `s5-control` kept whole as its predecessor;
  - the capture's 15 declared inputs are committed at `reference-trees/b722884…/`, verified, so a source package replays it.
- **The replay checks now run here.** S5's capturing commit lives only in the private archive, so the historical-replay tests had
  stood down in this repository since it began. `b722884` is in this repository: the stored control now replays against its
  capturing engine from git objects and from the committed reference tree, and ROUND-TRIP passes. Two tests that read the S5 capture
  by name now read the record's control.
- **Declarations restarted** (`9135fb8`): today's engine differs from the successor in 21 differences in 11 scenarios, each predicted:
  nine working-years message texts and `seed:16`'s last-bit spending (`8732bb8`); `golden:monte-carlo-fixed-seed`'s published median
  and 10th-percentile rows and its carried-up Roth basis disclosure (`2f73b85`). The declarations made against `s5-control` (S5 R5 to
  S5AA R50) remain in history at `5119d03`.

## 7. The owner's decisions on the builders' questions (2026-10-03)

- **On R46 to R50:** keep the result contract at version 5 (R46's new key is optional). A Monte Carlo account created mid-year
  takes that year's shared shock (Q19 revised). The Arizona post-2011 gain share defaults to 0%. Only traditional IRAs are held as
  inherited. The Roth 401(k) stays as before, disclosed. `ROTH_FIVE_YEAR_ASSUMED` and the first partial row's MAGI stay as built
  (R50 §8 items 3 and 4).
- **Built in R51:**
  - spending flexibility defaults to off (`defaultPlan`);
  - Medicare premiums and IRMAA start at each person's Medicare start age (one Medicare date with R47's HSA stop);
  - the working-years check counts employment and self-employment streams;
  - a "plan offers Roth" checkbox on the traditional 401(k).
- **On R51's own readings:** D1 (the re-picked sensitive band at its 85.0% edge), D2 (a spouse's Medicare from 65 exactly, inside
  the row), D4 (the optimizer's 63/65 heuristics) and D5 (no Part B late-enrollment increase) confirmed. **D3 rejected:** the streams
  pay their share of income tax too (built, `2f73b85`). **R50 §8 item 2 rejected:** the optimizer's Roth weight is the cost of the
  next dollar drawn (built, `2f73b85`).

## 8. The browser check (task 6.5, A-04)

- **R46** at `0fd83e1` and the **R50 stack** at `5119d03` (R41's scripts, unchanged, Chromium 152 on Windows 11): A to E give the
  same results as at R44 (75 of 75 Worker equals main thread; 72 equal Node, the other three the same Monte Carlo plans within
  1.8 × 10⁻¹⁵ relative; 70 imported, 70 CSVs and Worker replies equal; fault fallback and recovery exact; four concurrent Workers).
- **The new inputs at `5119d03`,** each changed on its own: Medicare start ages (both), Medicare growth rate, Part D premium, the
  Arizona post-2011 gain share, community property, LTC onset age, earlier income, and both first-Roth-contribution years — each
  stored and recalculated at once; blanking removes each field. R46's label reads "All modeled spending funded" with the final-
  year spending summary; R49's "Plan checks" list shows the flexibility-with-guardrails warning and clears it.
- **R51 at `ee06ea5`** (the same scripts and browser, Chrome 152.0.7977.130; the served artifact's SHA-256 `76939169…`, the pin
  in `tests/lib/harness.js`):
  - A to E as at `5119d03`: 75 of 75 Worker equals main thread, 72 equal Node, the other three the same Monte Carlo plans within
    1.14 × 10⁻¹⁵ relative with no count, rate or other non-continuous field different (golden Monte Carlo 95.8% both sides);
    70 imported, 70 CSVs and 70 Worker replies equal; fault fallback and recovery exact; four concurrent Workers equal.
  - A fresh plan stores and shows spending flexibility 0.
  - The "This plan offers Roth contributions" checkbox appears once, on the traditional 401(k) of `golden:baseline` restored,
    checked by default. Unticked it stores `planOffersRoth: false` and recalculates at once (the Worker request carries it);
    ticked it stores `true`.
  - R51's Medicare text is on the page: both Medicare-start notes, the pre-Medicare cost note, the HSA paragraph and the Rules
    page's section.
- R47 to R49's intermediate tags were not browser-checked separately; the final stack carries every round's inputs. One desktop
  browser.

## 9. Not changed, and carried

The AA1 options the owner did not choose stay as recorded limits (a full working-years budget, itemized deductions, a
tax-optimizing solver, full Roth five-year clocks for Roth 401(k)s, surviving-spouse filing status, Social Security benefit-cut
scenarios, the SSA-44 reduction, tax lots). R51 adds one: the Part B late-enrollment increase (42 USC 1395r(b)) is not modelled.
The owner kept R51's D6 on 2026-10-04: a Roth 401(k) first in the Roth class's draw order weighs 0, since it is modelled
tax-free. The builders' other readings are listed in each build report.
