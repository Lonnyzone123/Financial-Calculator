# S5AA R53 — change audit handover: the repairs for R51F-01, R52-01 and R52-02

*Written by Claude, 2026-10-04 (Arizona, UTC−7), for ChatGPT's audit of R53. Every figure below was read from its output at the
commit named. The build report is `audit/S5AA/R53/S5AA_R53_BUILD_REPORT_20261004.md`. This record is the map: each finding's
disposition, in the form your earlier reports asked for, and the coordinator's evidence.*

## 1. What is asked

Audit R53's change from main `cbce0ce` (your R52 report merged) to `s5aa-r53-source` (`2a1f5ba`, once the owner approves the tag).
- Rule on each of R51F-01, R52-01 and R52-02: repaired, or not.
- Rule on the new refusal (§3, item 3), which is the owner's decision rather than a repair you asked for.
- Number any new findings **R53-NN**.
- Determine S5AA's status against E1 to E18 as amended by A-01 to A-11, with GO or NO-GO on the first line.

## 2. The owner's decisions (2026-10-04)

Claude verified all three findings at `cbce0ce`:
- your R51F probes fail F01–F03, and the F04/F05 controls pass;
- your R52 boundary script's U01 gives an end of 41 → 60 and U02 a transfer at 45.75 → 46;
- the causes are where you said: `engine.js` R34's grace flag, and `readStatic()` in the app.

The owner then decided:

- **R51F-01: a monthly test in the grace year.** Each benefit month is judged on that owner's salary until their work ends, plus their
  dated employment streams, against the monthly exempt amount. Any self-employment profit in a month counts as substantial services:
  cautious, and disclosed.
- **R52-01 and R52-02: keep every validated value unless the user edits the field.** This covers all 11 half-rounded fields, both
  clamps, and the manual order.
- **An end age before the retirement age is refused everywhere:** validator, import and engine. The owner chose this over keeping
  such a plan with a warning.
- **After the build,** the owner was shown that the refusal also refuses 24 of your companion cases (§5). The owner **kept the
  refusal** and asked for an adapter, so your scripts can be rerun unedited.
- **The full-retirement-age year:** the monthly amount there is the higher one, $5,430 for 2026 (§4).

## 3. Dispositions

| ID | red at the base (`cbce0ce`) | green at `2a1f5ba` | independent arithmetic | the repair |
|---|---|---|---|---|
| **R51F-01** | F01 SS 5,540; F02 SS 4,540, settled tax 4,907.58, closing 113,649.92; F03 (spouse) 4,540 | F01 10,800; F02 10,800 / 5,546.10 / 119,271.40; F03 10,800 | six benefit months × $1,800 = $10,800: each is a non-service month under 404.435(a)(7), with wages at or below $2,040 | `householdSocialSecurityDetail()`: in an owner's grace row that the test can withhold, the salary's end and each job's dates become segment boundaries, and each segment's service flag reads that owner's wages and SE profit. Other rows are unchanged. |
| **R52-02** | U02 transfer at 46, tax 56,663.985, net worth 114,007.25 | 45.75; 57,038.985; 113,632.25 | your R52 §2: the $375 of additional tax returns with the transfer to its own year | `writeStatic()` records each kept field's stored value and shown text; `readStatic()` returns the stored value while the text is unchanged |
| **R52-01** | U01 horizon extended from 41 to 60 | at `87bddba` (item 2): end 41 kept, 106,050. At `2a1f5ba`: **refused** by the validator (`END_AGE_BEFORE_RETIREMENT`), the engine (`SCENARIO_END_AGE_BEFORE_RETIREMENT`) and the import, as the owner decided | (100,000 + 1,000) × 1.05 = 106,050 | item 2 keeps the end age as entered; item 3 refuses an end age before the retirement age |
| Manual order (R52 handover §7) | an unlisted stored order is written back as `""` | kept, shown as one extra option labelled "(from the restored plan)" | — | `showManualOrder()` |

**What item 3 adds.**
- **Validator:** the `INCONSISTENT_AGES` warning becomes the error `END_AGE_BEFORE_RETIREMENT`. It is raised only when the end age is
  not before the start, so R41's error still stands alone in that case.
- **Engine:** `endAgeBeforeRetirementCode()` runs in `scenarioInputGate()` after R41's check, and is in the Worker list.
- **`RESULT_CONTRACT.md`:** gains an "R53 added" subsection. `contractVersion` stays 5.
- **The spouse:** only the primary's retirement and end ages are read. A younger spouse may still be working when the plan ends.

**The witnesses.** Three new files, every expectation hand-derived in a comment:
- `tests/audit-s5aa-r53-grace-year-monthly-test.test.js`: 26 figures. 17 fail at the base with the pre-repair figure, and 9 controls
  pass.
- `tests/audit-s5aa-r53-restore-keeps-values.test.js` (jsdom).
- `tests/audit-s5aa-r53-end-before-retirement-refused.test.js`.

The figures are in the build report: limits exactly at the monthly amount, boundaries inside the year, two and successive streams,
both owners, the full-retirement-age year, the year after, the adjustment-of-reduction-factor credit, family withholding, and each
restored field.

## 4. The law, read at the primary source

- **20 CFR 404.435:** (a)(7), a non-service month in the grace year is not charged, even without excess earnings for the year; (b)(1)
  and Example 1; (c) and (d), the self-employment presumption.
- **20 CFR 404.430(a)(1):** the monthly amount is 1/12 of the annual one and applies only in a grace year.
  - (a)(2)(ii) gives the higher amount for the months of the full-retirement-age year that precede that age. The section's own table
    lists it monthly.
  - Claude read this at eCFR, current to 2026-10-01.
- **SSA's exempt-amounts page** (`/oact/cola/rtea.html`), read by Claude: $24,480 and $65,160 for 2026, so $2,040 and $5,430 a month.
- **20 CFR 404.410(a)**, for the adjustment of the reduction factor.

## 5. Your companion scripts, re-run

All three scripts run unchanged:
- `audit/S5AA/R51/S5AA_R51F_FULL_MODEL_PROBES_20261004.js` (SHA-256 `4ae6a8df…`);
- `audit/S5AA/R52/S5AA_R52_CHATGPT_BOUNDARY_SIMULATIONS_20261004.js` (`377ab155…`);
- `audit/S5AA/R51/S5AA_R46_R51_CHATGPT_SIMULATIONS_20261004.js` (`0ae98dc6…`).

| | base `cbce0ce` | `87bddba` (items 1–2) | head, as written | head, with the adapter |
|---|---|---|---|---|
| R51F probes | F01–F03 fail | **36/36** | 29/36 (F06, F07, F19, F20, F21, F23, F33 refused) | **36/36** |
| R52 boundary | U01, U02 fail | **20/20**, U01 and U02 pass | stops at E01 | **20/20**, U02 passes, U01 refused at import |
| R46–R51 | 20/20 | **20/20** | 13/20 (S01, S02, S05–S08, S20 refused) | **20/20** |

- **H01** fails in every column, as before R53. You classified it as the disclosed year-end Roth aggregation limit (assumptions
  §28.5), not a finding.
- **At `87bddba`,** F01–F03, U01 and U02 flip to pass and every other check keeps its verdict.
- **Why some cases are refused at the head:** they enter "still working when the plan ends" as a retirement age after the end age
  (for example 40 / 45 / 42), which the owner's decision now refuses.

**The adapter.** It is `audit/S5AA/R53/S5AA_R53_COMPANION_ADAPTER.js`, a `node -r` preload:

```
node -r ./audit/S5AA/R53/S5AA_R53_COMPANION_ADAPTER.js <script> <root> <output>
```

- **What it does:** it enters each such plan with the retirement age at the end age, the form the owner's decision allows. It reaches
  the engine, the validator and every engine variant, but not the app.
- **It is output-neutral:** at `87bddba`, where both entries are accepted, your verdicts are identical with and without it (R51F
  175/175, R52 112/112, R46–R51 176/176).
- **The refusal is the only change:** with the adapter, `87bddba` and the head agree on every verdict but U01 (175/175, 111/111,
  176/176).
- **The details** are in `S5AA_R53_COMPANION_ADAPTER_CHECK_20261004.md`.
- **For future probes:** a household still working when the plan ends is entered with the retirement age equal to the end age.

## 6. Predicted against measured

The prediction (`89a49f8`) was committed before any source edit and held to the R44.1 checklist (C1 to C8). The stop-condition scan
found no control, expanded, golden, generator or fixture plan with an end age before its retirement age, so no control input moves.

| | predicted | measured |
|---|---|---|
| Expanded capture | unchanged | **equal to r30 on all 71 entries.** Claude's own capture at `6fc75a5` is qualified: output hash `2c342c6c…5b04` (r30's), input hash `ed3731e2…39c4`. No new baseline; r30 stands. `2a1f5ba` adds only records and the adapter. |
| Monte Carlo (A-11) | no plan exposed | no Monte Carlo entry moved |
| Control 4.7 | nothing to declare | passes unchanged (in the gate) |
| Rule 1 test exposures (7 files) | pass; no exposed row has a stream | 96 of 96 pass |
| Restore probe through the real import | manual order (15 plans) and retirement age (10 plans) kept | exactly as predicted |
| Item 3 test exposure | 43 existing test files fail until adapted | **46 existing test files**: the 43 predicted (`fc2ee80`) and 3 from M1 (`de2c769`). The working-only horizons go through `retireAtEnd()` (output-neutral: 238 of 238 plans identical), one glide case changes its end age by intent, and two old-warning pins now assert the refusal. M3's six tests are in a file already counted. |

**Misses:**
- **M1 (builder):** the exposure hook could not see tests that reach the engine through the app or an engine variant: 6 tests in 3
  files.
- **M2 (found by the coordinator's gate):** five `deepEqual` pins of `otherIncomeFor()`'s return shape broke on the new `work` key.
- **M3 (found by the coordinator's gate):** six revival-contract todos (RB-03 to RB-08) used the working-only horizon. RB-07 went
  green vacuously through its "both refuse" branch, and the gate's "no authorized todo has started passing" check caught it. After
  `retireAtEnd()`, all six fail with the same detail as at the base.
- **No hand derivation proved wrong,** and no expected figure changed after the prediction commit.

## 7. The gate and the browser check

**The gate at `6fc75a5`:** 3,600 tests, 3,591 pass, 0 fail, 9 authorized todos (448 files). Closeout: 12 accepted, 0 refused, 0
errors. `2a1f5ba` adds only `audit/` files.

**The browser check (task 6.5) at `2a1f5ba`,** in Chrome 152.0.7977.130. The served artifact's SHA-256 is `945e9814…`, which matches the
committed file and the pin in `tests/lib/harness.js`.
- Checks A to E are as at R52:
  - 75 of 75 Worker results equal the main thread's;
  - 72 equal Node's, and the other three Monte Carlo plans agree within 1.14 × 10⁻¹⁵ relative, with no non-continuous field
    different;
  - 70 plans import, and their 70 CSVs and Worker replies are equal;
  - the five import refusals are the same five as in your R51F report;
  - fault fallback and recovery are exact;
  - four concurrent Workers agree.
- **Restore, in the real app:** a backup with age 66.25, retirement 64.75, end 80.25, claim 66.75, life 92.25, dividend start 67.75,
  transfer 70.25 and manual order `roth,taxable,preTax` was imported.
  - After the calculation, every value was stored exactly, and the form showed each one. The order appeared as "Roth, Taxable,
    Traditional (from the restored plan)".
  - The retirement age below the age was **not** clamped.
  - Claude then edited two fields: transfer to 70.3, stored as 70.5, and retirement to 64.3, stored as 64.5 and clamped to the
    age, 66.25. The untouched fields stayed exact.
- **End before retirement, in the real app:** importing age 40 / retirement 60 / end 41 is refused, and the status line names the
  reason. Stored scenarios are byte-for-byte unchanged.

## 8. For the owner, recorded

- **The import wording.** The status line's shared prefix calls the refusal "a structural problem that would break the projection".
  That overstates a rule the owner chose; the specific message after it is clear. Not changed in R53.
- **D2 (builder): the rest of the restore family is unchanged:**
  - the Monte Carlo run count is rounded to hundreds (`seed:17`'s 24 runs become 100);
  - the form's other range clamps (fee, withdrawal rate, guardrails, dividends, flexibility and others);
  - `normalizedPlan()` caps the end age at 100 while the validator accepts 120;
  - `ssFra`, `pensionStart` and `pensionAge` are dropped on restore; the engine reads none of them.
- **D4 (builder):** any self-employment profit in a grace-year month makes it a service month. The plan has no hours input; SSA would
  judge substantial services (404.446). Cautious, and disclosed.
- **Side observation (builder, pre-existing):** at the base, a plan saved with a blank manual order withdrew nothing.
