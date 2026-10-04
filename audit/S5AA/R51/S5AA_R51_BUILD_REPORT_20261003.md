# S5AA R51 — build report: the owner's follow-up decisions on R46–R50

*Written by Claude on 2026-10-03 (Arizona, UTC−7). Branch `sprint/s5aa-r51` in its own worktree, from `5119d03` (R45 with R46–R50
integrated; r29). Not pushed, not tagged; no baseline registered, no control capture taken. The coordinator runs the gate.*

## 1. Commits

| commit | what |
|---|---|
| `d663f16` | the prediction record, its scans and their outputs at `5119d03`, the test-exposure run, the witness run on the base (before any `src/` edit, A-01) |
| `b722884` | **decision 1 alone** (an input change in its own commit, control rule 3 / ground rule 7): `defaultPlan.retirement.flexibility` 10 → 0 and the form fallback; reviewed fingerprints re-pinned; the sensitive band re-picked; the golden fixture regenerated; one test adapted; registers; the app rebuilt and repinned |
| `8732bb8` | decisions 2–4: engine, validator, app; the two witness files; registers; the app rebuilt and repinned; the C1 check and the refusing control-declaration script |
| `678c60f` | this report (first version), the expanded captures at `b722884` and `8732bb8`, the measured comparisons, the path-level check, the witness and targeted runs |
| `7f1e131` | **addendum** (the owner's rulings of 2026-10-03): `S5AA_R51_PREDICTION_ADDENDUM_20261003.md`, its scans, test exposure and the witness run on `678c60f` (A-01) |
| `2f73b85` | the addendum's repair: the streams' income tax in the working-years check; `rothNextDollarWeight()`; the witness cases; two adaptations; registers; the app rebuilt and repinned |
| (this commit) | the addendum's measurements (§10) and this report's update |

The decision-1 commit is separate so a successor control capture can be taken at it (§5, pending).

## 2. What changed

**Decision 1 (AA1-25(c)).** `src/app-shell.html`: `defaultPlan.retirement.flexibility: 0`; `num("v2-flexibility",0)`. Nothing else.

**Decision 2 (one Medicare date).** `src/engine.js`:
- `medicareSpanInRow(p, owner, openingAge, duration)` (new; exported; in `workerFunctions`): the part of a row a person is on
  Medicare — the whole row when their opening age (own clock) is at or past `medicareStartAge()`, the row's tail from the start when
  it falls inside the row, else 0; no span for an opening age below 0 (`householdSeniorAges()`'s "not alive").
- The health block: pre-Medicare cost `= cost × Σ max(0, healthDuration − span) / modelled people`; retired-household Medicare
  `= charge × Σ min(costRetiredDuration, span)`. R43's idle spouse: the spouse's span inside `[work, row − retired span]`.
- `IRMAA_PRE_PLAN_MAGI_ASSUMED`: someone alive at plan year 0 or 1's opening with a positive span there.
  `IRMAA_PARTIAL_FIRST_YEAR_COMPLETED`: someone with a positive span in plan year 2's row (opening `floor(age) + 2`).
- `medicareStartAge()`'s comment and the health block's comment updated. At 65 for the primary (whose rows open on whole ages) the
  arithmetic is bit-identical to before.

`src/scenario-validator.js`: `medicareStartMirror()` (the override; else 65 with no benefit modelled — the AIME's first PIA segment
for `ssAdvanced`, else the monthly benefit floored to a dime — or a claim at or before 65; else claim − 0.5) and the same span test
in `IRMAA_PRIOR_INCOME_BLANK`, whose message now says "someone's Medicare has started while the household is retired".

`src/app-shell.html`: the two Medicare-start notes ("Medicare costs start and HSA contributions stop here"), a note on the pre-Medicare
cost ("each person's share runs until that person's Medicare starts"), the HSA rules paragraph ("That person's Medicare costs start at
the same age") and the Rules page's Medicare section ("Each person's Medicare costs start at their Medicare start …").

**Decision 3 (AA1-07).** In the working-years check: `workingPay += streamPay − (taxes.payroll − baseline.payroll) × streamPay /
streamRow`, where `streamRow` is the row's employment and self-employment stream pay (`other.wageSelf + wageSpouse + seSelf + seSpouse`)
and `streamPay` the part paid in the working months (`other` when the whole row works, else `otherIncomeFor()` over
`[age, age + duration − costRetiredDuration]`). The message: "Pay here is salary and any employment and self-employment income paid
while working, net of its payroll and self-employment tax."

**Decision 4 (AA1-13).** `renderAccounts()`: on a pre-tax workplace account (`limitGroup === "workplace"`, not Roth — the traditional
401(k)), a checkbox "This plan offers Roth contributions (without them, a catch-up that must be Roth is not allowed)", checked unless
`planOffersRoth === false`; on change it stores `true`/`false`. No engine, contract, static-id or `defaultPlan` change for it.

## 3. Predicted against measured

### 3.1 The corpus (`prediction/r51_measured_at_8732bb8.txt`; captures `r51_expanded_capture_at_{5119d03,b722884,8732bb8}.json`)

| | predicted (`d663f16`) | measured | verdict |
|---|---|---|---|
| inputs | 51 of 71 expanded inputs move; fingerprints: 5 control, 40 expanded (names listed) | 51; 5 and 40, the same names | as predicted |
| decision-1 outputs | 8 entries, with the scratch copy's figures; the band re-picked to step 12 (85.0%, final 119,653,546.22, taxes 3,924,772.11) | the same 8; `b722884` equals the scratch capture on 70 of 71 entries, the 71st the band, which measures 85.0% / 119,653,546.22 / 3,924,772.11 | as predicted |
| Monte Carlo (C4) | golden MC and the band: named, every path exposed (500 of 500), published result may move; seed:9, seed:17 unexposed | golden MC 500/500 paths changed, published moved (96.8 → 95.8); band 500/500, moved (84.2 → 85.0); seed:9 0/52, seed:17 0/24, unchanged (`prediction/r51_path_level_5119d03_vs_8732bb8.txt`) | as predicted |
| `seed:16` (decision 2) | captured output unchanged; a last-bit difference in `spending` possible | one leaf: `rows[15].spending` 213,698.61245257227 → …233 | as predicted |
| IRMAA disclosures | no corpus plan | none | as predicted |
| decision 3 | **no corpus movement** | **9 entries move by the warning's text only** (seed:2, 3, 4, 10, 12, 14, 15, 20, targeted:arm-flag-on; ages and shortfalls unchanged) | **miss SA51-C** |
| control 4.7 | the 4 control plans moved by decision 1 re-declared | **refused before any comparison**: the control inputs moved (§4, SA51-A) | **miss SA51-A** |
| golden fixture | `monte-carlo-fixed-seed` moves | only it (96.8 → 95.8; lifetime taxes 2,512,709.86 → 2,585,931.82; final 179,657,969.08 → 176,871,037.76) | as predicted |

### 3.2 C1 after the build (`prediction/r51_c1_check_at_8732bb8.txt`)
- The scan's R51 health equals the engine's in all 3,427 rows (every path) of the 13 corpus plans with health on.
- The engine's working-years issue is the first tapped row with R51 pay below zero on all 107 corpus plans.
- The validator's `IRMAA_PRIOR_INCOME_BLANK` equals the engine's disclosure on every generated plan run (114 of seeds 1–120, seed 120
  warns; 78 of 500–579, seeds 533/539/578 warn) and all 107 corpus plans.

### 3.3 The witnesses
`tests/audit-s5aa-r51-owner-follow-ups.test.js` (17 cases) and `tests/audit-s5aa-r51-app-inputs.test.js` (4 jsdom cases), unchanged
since the prediction (SHA-256 `532e14a1…ac10d`, `3756f507…103cc`). At `5119d03`: 17 failed with the pre-repair figure, 4 controls
passed. At `8732bb8`: 21 of 21 pass (`witness_runs/r51_tests_at_8732bb8.txt`). No derivation needed correcting.

### 3.4 The tests (targeted runs, no gate)
All 443 files of `test:list`, in 37 batches of 12 at concurrency 3, on the `8732bb8` tree (`witness_runs/r51_targeted_all_files_at_8732bb8.txt`):
**3,468 tests, 3,455 pass, 9 authorized todos, 4 fail** — all four the control-input hold (SA51-A): `control-corpus` "the live
corpus still reproduces the control inputs", "today's engine moves the control only as … declares", and `corpus-composition` "control
is the default composition, and it is still the control corpus", "the control composition never loads the expansion module". The same
run at `b722884`'s tree (`witness_runs/r51_targeted_all_files_at_b722884.txt`, taken before its registers were rebuilt without the
then-uncommitted witness files; the register, classification and single-definition tests re-run after: 52 of 52): the same four fail,
nothing else. Closeout: accepted 12, refused 0, errors 0 at both commits.

Against the prediction's test list: `golden-scenarios`, `corpus-invariant`, `monte-carlo-sensitive-band` failed and were regenerated
or adapted as predicted; `corpus-composition` and `control-corpus` fail for a reason the prediction did not name (SA51-A); every
medicare-, working- and text-exposed file passes as predicted; one flex10 file failed unpredicted (SA51-B).

## 4. Misses

- **SA51-A, control 4.7's input hold (C8).** The record said 4.7 compares the stored control capture with a live capture field by
  field and that decision 1 would show as output differences to re-declare. 4.7 first refuses a comparison across different corpus
  inputs (`harness.refusalsFor()`), and `tools/control-corpus.json`'s rules hold the control inputs fixed: "Any input or generator edit
  is its own versioned change … never folded into an instrument or engine commit", with a successor control capture (as S5's U4 did).
  Decision 1 moves the control corpus input hash 343387a9 → dbbe8036. I first re-declared with the R48 script's logic, which compares
  without that refusal; those declarations were meaningless and were reverted before any commit. Repaired so far: decision 1 is its own
  commit (`b722884`), and `r51_declare_control.js` refuses to declare across different inputs. Not repaired: the successor control (§5).
- **SA51-B, an inherited premise.** `audit-s5aa-r23-roth-flag-follows-draws` R22-01's control ("path 0 alone draws nothing early")
  relied on the default's 10% flexibility; at 0 path 0 empties its taxable account before 59½. The exposure hook flagged the file
  (flex10, inherits) and I predicted "compares runs of the same tree: passes" without reading it. Adapted by intent: the case keeps the
  10% it was built with (before: flagged at runs 1 with 0; after: unflagged at runs 1, one flag at runs 50, as the case intends).
- **SA51-C, a message change reaches the corpus (C8).** The record said the expanded capture compares issue text, then predicted no
  corpus movement for decision 3. The rewritten warning text reaches every corpus plan that carries the warning (R49's nine), by text
  only.
- Within the prediction's allowance: seed:16's last-bit `spending`.

## 5. Control 4.7 — ruled: a successor control snapshot at `b722884`, built by the coordinator

*The owner's ruling of 2026-10-03 (§9): option 1 below. This round does not touch `tools/control-corpus.json`,
`tools/control-candidate-prediction.json`, any `tools/baseline-*` file or reference trees; control 4.7's four failures stay as they are.*

**Control 4.7 after decision 1.** Two ways forward:
1. **A successor control (the S5 precedent).** Take a control capture at `b722884` (decision 1 on the pre-R51 engine; the commit exists
   for this), add it as a new capture beside the old one, write a successor record in `tools/control-corpus.json` with old and new input
   hashes (343387a9 → dbbe8036) and the reason, keep the predecessor whole, make the capturing commit reachable for the historical
   replay, and restart `tools/control-candidate-prediction.json` against it (R51's own movement against such a capture would be the
   nine message texts and seed:16's last bit). Ground rule 7's own-commit condition is met by `b722884`.
2. **Freeze the control's inputs.** Build the control composition from the pre-R51 `defaultPlan` (flexibility 10) so the control
   corpus does not change; the expanded composition follows the new default. The control would then no longer be built from the
   app's default.
Either needs the coordinator; option 1 also creates a new stored capture, which the rules leave to the coordinator.

## 6. Tests adapted (each with a comment naming R51 and the decision)

| test | before | after |
|---|---|---|
| `monte-carlo-sensitive-band` (`DECLARED_STEP`) and `tests/lib/corpus-expansion.js` (`MC_BAND_STEP`, family version, notes) | step 14 (84.2%), version 8 | step 12 (85.0%; 99.8% / 85.0% / 51.6% across the volatility sweep), version 9 |
| `audit-s5aa-r23-roth-flag-follows-draws` R22-01 | inherited flexibility 10 | sets 10 |
| `tests/fixtures/golden-scenarios.fixtures.json` | MC 96.8% | 95.8% (regenerated after reading its diff) |
| `tools/corpus-spec.json`, `tools/corpus-spec-expanded.json` | — | 5 and 40 fingerprints re-pinned by review |
| **addendum:** R51's witness file, the two self-employment cases | 12,000: funded; 10,000: short 1,475.455 (R51's payroll-and-SE-only rule) | short 1,107.4655 and 2,599.97122 (re-expected by the ruling; hand-derived in the file) |
| **addendum:** `tools/corpus-path-gaps.json` | `retirement.preserveRoth` pinned as a gap (regrown at R50) | removed ("shrunk"): the corpus executes it again under the next-dollar weight |
| **addendum:** `tests/fixtures/schema-catalogue.fixture.json` | Monte Carlo `issues[].state` without the Roth ledger disclosure's fields | gains `approximation`, `firstOwnerAge`, `owner` (optional): the Monte Carlo sample now raises `ROTH_IRA_BASIS_NOT_ENTERED`; regenerated with `node tests/lib/schema-catalogue.js --write`, diff read (those three fields only) |

## 7. Law checked at the primary source (2026-10-03)

- **42 USC 1395r(b)** (law.cornell.edu/uscode/text/42/1395r): the Part B premium "shall be increased by 10 percent … for each full 12
  months … in which he could have been but was not enrolled", not counting months in a group health plan by reason of current
  employment. The model charges no late-enrollment increase: someone whose Medicare start is after 65 because they claim later is assumed
  to have other coverage (the pre-Medicare cost) until then. Recorded as a limit, not modelled.
- IRC 223(b)(7) and CMS publication 11036 (Part A backdated up to six months, never before 65): read for R47 and cited there; R51 applies
  the same start to the charge.

## 8. Suggested text for eb's files (not edited)

- **MODEL_ASSUMPTIONS (Medicare, 18.4):** "Each person's Medicare costs — Part B with any IRMAA amounts, the Part B deductible and the
  Part D premium — start at their Medicare start: 65 for someone who claims Social Security by 65 or has no benefit entered, otherwise
  half a year before the claim (Part A is backdated up to six months), or the Medicare start age entered. Until then that person carries
  their share of the pre-Medicare cost. The start falls inside a projection year where it falls, as the HSA's stop does. The Part B
  late-enrollment increase (42 USC 1395r(b)) is not modelled."
- **MODEL_ASSUMPTIONS (section 7, working years):** "The working-years warning counts as pay the salary and any employment and
  self-employment income paid while working, each net of the tax it adds: the salary of its wage-only payroll and income tax, the
  streams of their marginal share of the same return with them added (federal and Arizona income tax, payroll and self-employment tax)."
- **MODEL_ASSUMPTIONS (withdrawal ordering):** "The rule-based order ranks a Roth class by the cost of the next dollar it would pay: nothing
  while a Roth IRA's next dollar is contribution basis, a conversion's nontaxable part or a conversion past five years, or the owner is
  qualified, or the next account is a Roth 401(k); the 10% weight on a conversion's taxable part inside five years before 59 1/2; tax
  and the 10% on earnings." (replacing R50's "by the share of the Roth class a draw would tax")
- **MODEL_ASSUMPTIONS (spending flexibility):** "The default flexibility is 0 (off) since S5AA R51."
- **FEATURES:** "Accounts: a traditional 401(k) can say whether its plan offers Roth contributions (it decides whether a catch-up that
  must be Roth is allowed)." "Medicare start ages now set when Medicare costs start, as well as the HSA stop."
- **SPRINT_QUESTIONS:** AA1-25(c) answered (flexibility off by default, S5AA R51); "should streams count as pay" answered (yes, net of
  payroll, SE and income tax, by the owner's ruling); R50 section 8 item 2 answered (the next-dollar weight); the control corpus after a
  `defaultPlan` change (§5: a successor control); the rulings in §9.

## 9. The owner's rulings (2026-10-03) and what remains

**Ruled by the owner on 2026-10-03** (relayed by the coordinator):
- **§5, control 4.7:** a new successor control snapshot at `b722884` (the S5 precedent), built by the coordinator in a separate worktree.
  This branch leaves `tools/control-corpus.json`, `tools/control-candidate-prediction.json`, the `tools/baseline-*` files and reference
  trees alone; control 4.7's four failures stay until then.
- **D1** (the re-picked sensitive band at exactly 85.0%, its upper edge): **keep.**
- **D2** (Medicare from 65 exactly, inside the row, for a spouse whose ages are fractional relative to the primary's): **confirmed as built.**
- **D3** (the streams' income tax not subtracted): **rejected — built** in `2f73b85`: the streams' marginal share of the wage-only return,
  federal and Arizona income tax with their payroll and SE tax (§10).
- **D4** (the optimizer's IRMAA guard and HSA weights left at 63/65): **confirmed as built.**
- **D5** (no Part B late-enrollment increase): **confirmed as built.**
- **R50 §8 item 2** (the optimizer's Roth weight): **rejected — the ordering-aware form built** in `2f73b85` (§10).
- **R50 §8 items 3 and 4** (`ROTH_FIVE_YEAR_ASSUMED`; the first-row MAGI): **keep as built.**

**For the owner, new from the addendum:**
- **D6.** "The next dollar drawn from the Roth IRA" is built as the next dollar the draw takes from the Roth class: when a Roth 401(k)
  comes first in the class's draw order the weight is 0 (it is modelled tax-free), so the class can rank ahead of an early pre-tax draw
  (the addendum's third witness). **Kept by the owner, 2026-10-04.**

## 10. The addendum: predicted against measured

Prediction: `S5AA_R51_PREDICTION_ADDENDUM_20261003.md` (`7f1e131`). Measured: `prediction/r51b_measured_at_2f73b85.txt` (the expanded
capture at `2f73b85` in a clean tree against `8732bb8`), `prediction/r51b_path_level_678c60f_vs_2f73b85.txt`.

| | predicted | measured | verdict |
|---|---|---|---|
| working years, corpus | no first shortfall moves; the nine warned plans move by message text only | exactly those nine, text only | as predicted |
| Roth, the four simple exposed plans (golden baseline, reserve-and-bond-tent, guardrails; s5aa-r6-gap-survivor-health-roth) | no draw reaches past the prefix: unchanged | unchanged | as predicted |
| `golden:monte-carlo-fixed-seed` (C4) | 500 paths exposed; 9 ranked (36, 57, 184, 228, 265, 281, 296, 314, 471); published may move | changed paths exactly the 9 ranked; published moved (median row 31: taxes −$52.59, withdrawals −$52.59; q10 rows 37 and 40; `ROTH_IRA_BASIS_NOT_ENTERED` carried up from a later path); success 95.8 and the headline final total and lifetime taxes unchanged | as predicted |
| `expansion:monte-carlo-sensitive-band` (C4) | 500 exposed; 32 ranked; published may move; re-pick if it leaves the band | 31 of the 32 ranked changed (path 265 did not), none unranked; published moved (median rows: Roth lower, pre-tax higher, taxes down; the disclosure's first age 57 → 58); success 85.0 unchanged, no re-pick | as predicted |
| golden fixtures | the golden MC fixture may move | unchanged (its pinned fields hold) | within the prediction |
| every other corpus plan | unchanged | unchanged | as predicted |
| C1 after the build (`prediction/r51b_c1_check_at_2f73b85.txt`) | the engine's weight equals the scan's at every call; the engine's pay equals the scan's formula in every row | 102,139 calls equal; 106,826 working rows equal (22 with a stream); R51's own C1 still holds (`r51_c1_check_at_2f73b85.txt`) | as predicted |
| witnesses | the six repair cases fail at `678c60f`, all pass after | six failed at `678c60f` with the pre-addendum figure; 26 of 26 pass at `2f73b85` (`witness_runs/r51b_tests_at_2f73b85.txt`); the file unchanged since the addendum (SHA-256 `5309b154…4ef0a9`) | as predicted |
| tests | golden-scenarios, monte-carlo-sensitive-band, schema-catalogue and corpus-configured-paths expected to pass; audit-cl/rb-findings may fail | all 443 files at `2f73b85`'s source before the two adaptations (`witness_runs/r51b_targeted_all_files_before_the_two_adaptations.txt`): 3,473 tests, 3,458 pass, 9 todo, 6 fail — control 4.7's four, `corpus-configured-paths` (preserveRoth now executed) and `schema-catalogue` (the Monte Carlo sample's issue shape); after the two adaptations both pass; audit-cl/rb-findings pass | **misses SA51-D, SA51-E** |

**Misses (addendum).**
- **SA51-D, `corpus-configured-paths`.** The pinned gap `retirement.preserveRoth` is executed again: with the next-dollar weight the
  switch's +12 changes a corpus plan's draws. Predicted "expected to pass"; the shrink-only list's own rule asks for the removal, done.
- **SA51-E, `schema-catalogue`.** The Monte Carlo sample now raises `ROTH_IRA_BASIS_NOT_ENTERED` (a later path draws Roth earnings),
  so the recorded issue shape gains three optional fields. Predicted "shapes: expected to pass"; the same lesson as SA49-D (a new issue
  on a sample plan moves the catalogue).
- The test-exposure counts (R51's and the addendum's) are distinct plans per test process, not every call (the cache recorded a plan once).

Targeted runs only; the gate is the coordinator's. Closeout: accepted 12, refused 0, errors 0 at `2f73b85`.

## 11. The coordinator's integration (2026-10-03)

- **The successor control** (§5, the owner's ruling), built in a separate worktree and merged in `13aa9c8`:
  - `9e0bf0b` holds the control composition captured at `b722884`, twice in clean worktrees, byte-identical and qualified
    (`tools/baseline-20261003-s5aa-r51-control.json`; input hash `dbbe8036…`, output hash `3c558e4d…`);
  - the `s5aa-r51-control` record keeps `s5-control` whole as its predecessor;
  - `reference-trees/b722884…/` holds the 15 verified inputs;
  - the two replay tests that read the S5 capture by name now read the record's control, and the registry lists the capture.
  - The capture replays exactly against `b722884`, from git objects and from the reference tree. The replay tests, which had stood
    down in this repository, now run and pass.
- **Control 4.7's declarations** (`9135fb8`): 21 differences in 11 scenarios against the successor, each predicted (§3.1's nine
  message texts and `seed:16`; §10's golden Monte Carlo rows and disclosure). Control 4.7 passes.
- **Gates:** `9135fb8` and `ee06ea5` each gave 3,473 tests, 3,464 pass, 0 fail, 9 todos; closeout 12 accepted, 0 refused,
  0 errors.
- **r30** (`ee06ea5`): the expanded composition captured at `9135fb8`, twice, byte-identical, invariants 7/7.
  - It differs from r29 in 18 entries, each predicted, and equals the capture at `2f73b85` on all 71.
  - r29's note was corrected (it said nine entries carry `outsideSupportedDomain`; there are four).
- **The browser check** (task 6.5) at `ee06ea5`: A to E as before, the flexibility default, the Roth checkbox (stored and
  recalculated) and the Medicare text. The details are in the combined handover, `S5AA_R46_R51_CHANGE_AUDIT_HANDOVER_20261003.md`,
  §8.
