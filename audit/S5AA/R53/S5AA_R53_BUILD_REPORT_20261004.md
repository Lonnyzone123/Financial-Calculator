# S5AA R53 build report: the repairs for R51F-01, R52-01 and R52-02, and the owner's decision 3

*The builder's report, saved by the coordinator (a builder cannot write report files). The builder's text runs from "Branch" to the
end of "Files"; the coordinator's addendum follows it. Built 12:04 pm to 1:23 pm Arizona time, 2026-10-04.*

**Branch:** `sprint/s5aa-r53`. **Builder's head:** `dbaad9a`. **Base:** `cbce0ce`. Nothing was pushed or tagged, and no full gate
was run. The control, candidate, baseline and reference-tree files are untouched, and so are `defaultPlan` and eb's three files.
`closeout-check` gave accepted 12, refused 0, errors 0.

All three items are built, and every finding check is green at the item-2 commit. Item 3 then refuses 24 of the auditor's companion
cases, and the R52 companion stops on this tree. Item 3 is in its own commits.

## Commits (oldest first)

1. `89a49f8`: the prediction record, committed before any src edit. It holds the stop-condition scan, the corpus and test exposure
   scans, the end-age neutrality run, the import probe, and the base witness and companion runs.
2. `ff02378`: item 1, the grace year's monthly test (`src/engine.js`, the witness file, the registers, the repinned app).
3. `87bddba`: item 2, restore keeps validated values (`src/app-shell.html`, the jsdom witness file, the repin).
4. `5460ff4`: records. The companions at the item-2 commit, and the neutrality run repeated under R53's rule 1.
5. `fc2ee80`: item 3, the refusal. The validator, the engine gate, the Worker list, `RESULT_CONTRACT.md`, the witness file, the new
   helper `tests/lib/working-horizon.js`, and 43 adapted test files.
6. `de2c769`: item 3, three more adapted tests the prediction missed (M1).
7. `7724c00`: records. Companions and witness runs at the item-3 head.
8. `dbaad9a`: records. The expanded captures at base and head, and the import probe at the head.

## What changed

**Item 1 (R51F-01, the grace year)**
- `otherIncomeFor()` also returns `work`: for each employment or self-employment stream, its dated interval on the self's clock, its
  annual rate, and whether it is self-employment.
- The projection passes each owner's salary rate and the age their work ends in the row (retirement or death).
- In `householdSocialSecurityDetail()`, an owner's grace row gets a **monthly test** when the earnings test can withhold, that is,
  when tested earnings exceed the row's prorated exempt amount. In such a row:
  - the salary's end and the streams' starts and ends become segment boundaries;
  - a segment is a service month when the owner has any self-employment profit in it, or wages above the band's amount, compared as
    annual rates;
  - streams no longer switch the whole grace year off.
- Every other row keeps R34's segments, flags and service months exactly. The annual test, the family pool (R42), the months
  charged and credited (R43) and the full-retirement-age year all read the new flags unchanged.

**Item 2 (restore keeps values unless edited)**
- `writeStatic()` records, for each kept field, the stored value and the text the form shows. While that text is unchanged,
  `readStatic()` returns the stored value. An edited field rounds and clamps as before.
- The kept fields are the 11 `half()` fields, plus the 7 R45 optional dates, which use the same `half()` (D2).
- Each clamp runs only when a field it reads was edited.
- A stored age not on a half year is shown as stored, and leaving an untouched field is not an edit.
- A stored manual order the select does not list is added as one extra option, labelled "(from the restored plan)".

**Item 3 (an end age before the retirement age is refused everywhere)**
- **Validator:** the `INCONSISTENT_AGES` warning at `profile.endAge` becomes the ERROR `END_AGE_BEFORE_RETIREMENT`. It is raised only
  when the end age is not before the start, so R41's error stands alone in that case.
- **Engine:** `endAgeBeforeRetirementCode()` runs after R41's check and gives `SCENARIO_END_AGE_BEFORE_RETIREMENT` with its own
  message. It is in the Worker list and the exports.
- **Import:** the import refuses such a plan through the validator, and the status line names the message.
- **`RESULT_CONTRACT.md`:** gains an "R53 added" subsection. `contractVersion` stays 5.
- **The spouse (the builder's reading):** the rule reads only the primary's retirement and end ages. A younger spouse may still be
  working when the plan ends; a witness accepts such a couple.

## The stop condition

Nothing that triggers it is refused:

| Scanned | Plans with an end age before retirement |
|---|---|
| Control corpus (36) | 0 |
| Expanded corpus (71) | 0 |
| Golden plans | 0 |
| Generator seeds 1–5,000 | 0, true by construction |
| `defaultPlan` | not refused |
| `tests/fixtures` | 0 |
| R40 conservation-grid generator | 0, true by construction |

No control input changes.

## Predicted against measured

- **Expanded corpus:** predicted no entry changes. Measured at `cbce0ce` and `7724c00`: 71 of 71 identical, output hash
  `2c342c6c…5b04` and input hash `ed3731e2…39c4` on both. Control is a subset of expanded, so control 4.7 has nothing to declare.
  **Met.**
- **Monte Carlo (A-11):** the scan ran every path, and no Monte Carlo plan was exposed. **Met.**
- **Rule-1 test exposures (7 files):** every exposed row has no stream, so all were predicted to pass. All 96 pass. **Met.**
- **jsdom tests:** 428 of 429 passed after items 1 and 2. The one failure was the classification register, which cleared once R53's
  files were registered. After item 3, four jsdom tests failed (M1).
- **Rule-3 tests:** the 43 exposed files were predicted to fail until adapted. 172 failed at first; after adaptation 479 pass and 6
  are todos, as at base.
- **Restore probe through the real import:** predicted that the manual order (15 plans) and the retirement age (10 plans) are kept and
  the rest still changes. **Met exactly.**
- **Companions at `87bddba`:** R51F 36/36 (F01–F03 flip to pass; the other 170 checks keep their verdicts). R52 boundary 20/20, with
  U01 passing (end 41 kept, 106,050) and U02 passing (45.75; tax 57,038.985; net worth 113,632.25). R46–R51 20/20, all 176 checks
  unchanged.
- **Companions at the item-3 head:** R51F F06, F07, F19, F20, F21, F23 and F33 refused, F01–F05 pass. R46–R51 S01, S02, S05–S08 and
  S20 refused. The R52 companion stops at E01's validity assertion.

## Each finding, red at base and green after (hand-derived)

| Finding | Base `cbce0ce` | After the repair |
|---|---|---|
| F01 Social Security | 5,540 | 10,800 |
| F02 Social Security / settled tax / closing portfolio | 4,540 / 4,907.58 / 113,649.92 | 10,800 / 5,546.10 / 119,271.40 |
| F03 (spouse) | 4,540 | 10,800 |
| U02 transfer date / tax / net worth | 46 / 56,663.985 / 114,007.25 | 45.75 / 57,038.985 / 113,632.25 |
| U01 | horizon extended to 60 | kept at 41 at `87bddba`; **refused** at the head by the engine, the validator and the import |

**The grace-year witness (26 figures):** 17 failed at base with exactly the pre-repair figures derived, and all pass after.
- Wages exactly at the monthly limit: 0 → 10,800; with a smaller salary, 5,800 → 10,800.
- Boundaries inside the year: 3,290 → 5,400.
- Two streams: 0 → 10,800. One stream following another: 0 → 5,400.
- Both owners: 9,080 → 21,600.
- Self-employment that ended before the claim: 5,922.50 → 10,800.
- The full-retirement-age year: 8,984.67 → 11,598.
- The year after the grace year: 3,040 → 9,300.
- Adjustment-of-reduction-factor credit: 22,128 → 21,600.
- Family withholding: 9,790 → 16,050.
- Controls held throughout: F04 0, F05 10,800, just above the limit 0 and 5,794, self-employment in benefit months 4,999, above the
  FRA-year amount 984.67, the following annual year 15,840, and family above the limit 790.

**The restore witness:**
- claim at 66.75: row 67 0 → 5,898, and row 68 24,000 → 23,592;
- manual order: Roth 50,000 → 40,000;
- event at 61.75: Roth 100,000 → 90,000;
- event at 59.25: tax 0 → 1,000;
- all 12 stored values kept: pension 5,000 → 8,321.70, horizon [70.25, 71, 71.75].

Edited fields still round and clamp.

## Tests adapted

- **41 files** use `retireAtEnd()` from `tests/lib/working-horizon.js`, which sets the retirement age to the end age and pins a
  spouse's date where it followed the primary's. Each call carries a comment naming R53 and decision 3.
- **Output-neutral, as measured:** at `cbce0ce`, and again at `87bddba` under R53's rule 1, 238 of 238 readable plans gave identical
  results. The other 10 calls are deliberately unreadable hostile inputs.
- **The glide-internals test:** one case's end age goes from 56 to 65, by intent. It reads only the glide helpers.
- **Two pins of the old warning** now assert the refusal: `scenario-validator.test.js`, and R41's end-between-start-and-retirement
  control.
- **Three more files (M1):** `public-route-sa05-app`, `rendered-results-warnings` and `household-ledger`.

## Misses

- **M1.** The exposure hook watched only the Node engine's `runPlan` and `simulatePlan` and the validator. It could not see tests
  that reach the engine through the built app or an engine variant, so 6 tests in 3 files were not predicted. They are adapted in
  `de2c769`.
- No hand derivation proved wrong, and no expected figure was changed after the prediction commit.
- **A side observation, not caused by R53:** at base, a plan saved with a blank manual order withdrew nothing.

## Law, read at the primary source

- 20 CFR 404.435(a)(7), (b)(1) and Example 1, (c) and (d).
- 20 CFR 404.430(a)(1), and (a)(2)(i) and (ii).
- 20 CFR 404.410(a).
- The builder could not fetch SSA's own pages; the coordinator read them (addendum).

## Decisions for the owner (as the builder raised them)

- **D1.** In the full-retirement-age year the monthly amount is the higher one, $5,430 (404.430(a)(2)(ii)), not $2,040.
- **D2.** The rest of the restore family is unchanged and outside the listed scope:
  - the run count is rounded to hundreds;
  - the form's other range clamps;
  - `normalizedPlan()` caps the end age at 100 while the validator accepts 120;
  - `ssFra`, `pensionStart` and `pensionAge` are dropped, and the engine reads none of them;
  - the seven R45 optional dates are covered as well.
- **D3.** How far the refusal reaches: 46 test files and 24 of the auditor's companion cases used the working-only horizon.
- **D4.** Any self-employment profit in a month makes it a service month: cautious, and disclosed.

## Files

- **Records:** `audit/S5AA/R53/`, with the prediction record, `prediction/` and `witness_runs/`.
- **Witnesses:** `tests/audit-s5aa-r53-grace-year-monthly-test.test.js`, `…-restore-keeps-values.test.js` and
  `…-end-before-retirement-refused.test.js`.
- **Helper:** `tests/lib/working-horizon.js`.

---

## Coordinator's addendum (Claude, 2026-10-04)

**The gate at the builder's head failed**, on two checks, both caused by R53 and missed by the build:

- **M2 (item 1):** `tests/stage-event-income.test.js` pins `otherIncomeFor()`'s whole return shape in five `deepEqual` calls, and the
  new `work` key broke them. Each pin now carries `work: []`; none of those plans has a job.
- **M3 (item 3):** six revival-contract todos in `tests/audit-rb-findings.test.js` (RB-03 to RB-08) used the working-only horizon.
  - RB-07 went green through its "both branches refuse" branch, and the gate's "no authorized todo has started passing" check caught
    it.
  - The other five failed on the refusal, not on their finding.
  - Each now goes through `retireAtEnd()`. At `cbce0ce` and after the fix, all six fail with identical failure detail.

Both are fixed in `4daf857`. In `6fc75a5` the shape pin's comment stopped citing R51F-01, which had made the requirements register
(8.1) count that file as a guard.

**Gate at `6fc75a5`:** 3,600 tests, 3,591 pass, 0 fail, 9 authorized todos (448 files). Closeout: 12 accepted, 0 refused, 0 errors.

**The owner's rulings after the build (2026-10-04):**

- **D3: keep the refusal, and add an adapter** so the auditor's scripts can be rerun unedited. The adapter is
  `S5AA_R53_COMPANION_ADAPTER.js`, and its check is `S5AA_R53_COMPANION_ADAPTER_CHECK_20261004.md`. With it at the head, R51F gives
  36/36, R46–R51 20/20, and R52 20/20 plus U02. U01 is refused at import.
- **D1: $5,430 in the full-retirement-age year.** The coordinator read 20 CFR 404.430 at eCFR (current to 2026-10-01): (a)(2)(ii)
  gives the higher amount "applicable in months of the year of attaining full retirement age … that precede such attainment," with a
  monthly figure in the table. SSA's exempt-amounts page gives $24,480 and $65,160 for 2026, so $2,040 and $5,430 a month.
