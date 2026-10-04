# S5AA R53 — prediction record: the repairs for ChatGPT's R51F and R52 audits

*Written by Claude on 2026-10-04, 12:35 pm Arizona time (UTC−7). Committed before any `src/` edit (A-01), and held to
`audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md`. Base: `sprint/s5aa-r53` at `cbce0ce` (main: the R52 source, tag
`s5aa-r52-source` = `4e1bb95`, plus audit records). Control: `s5aa-r51-control` (not touched by this round).*

## The round

The owner's decisions of 2026-10-04, as the coordinator handed them to this round (every finding verified by the coordinator):

1. **R51F-01, the grace year: a monthly test.** In an owner's grace year (the row they stop working in), each benefit month is a
   non-service month when that owner's wages in the month are at or below the monthly exempt amount (the engine's own indexed
   figure; $24,480 / 12 = $2,040 in 2026). "Wages in the month" are the owner's salary until their retirement date plus their dated
   employment streams. Any self-employment profit in a month makes it a service month (cautious, disclosed: no hours input). Kept: the
   annual test in later years and in service months, the family withholding allocation (POMS RS 02501.095, R42), the ARF credits and
   the year of full retirement age.
2. **R52-01, R52-02 and the restore family: keep values unless edited.** Restore and calculation keep every validated value exactly; the
   form shows the stored value, and `readStatic()` rewrites a field only when the user actually edits it. An edited field keeps the
   form's entry precision (half years) and its clamps. A stored manual order the select does not list is shown as an extra option.
   Scope: the eleven `half()` fields, both clamps, the manual order.
3. **An end age before the retirement age: refused everywhere.** The validator, the import and the engine refuse a plan whose
   `profile.endAge` < `profile.retireAge`, each with a clear message and code, following R41's END_AGE_BEFORE_START convention.

### How each rule is built (definitions, before the edit)

- **1.** `householdSocialSecurityDetail()` (`engine.js` ~3413). Today `selfGrace` / `spouseGrace` (~3571) require the owner's retirement
  inside the row AND `earnings.streamSelf` / `streamSpouse` == 0 for the whole row, and a segment is a service month when it starts
  before the owner's retirement date (`sSvc` / `pSvc`, and the four `segStart < …RetireAge` accumulations of the service-month gross).
  R53:
  - `otherIncomeFor()` also returns `work`: each employment or self-employment stream's active interval in the period, on the SELF's
    clock (`periodStart + (activeAge − ownerAge)` to `periodStart + (activeEnd − ownerAge)`), its owner (`spouse` only for a spouse-owned
    stream with a spouse; else self, as `wageSelf` / `seSelf` resolve it), its annual rate (`amount × factor`, the factor it pays at), and
    whether it is self-employment. Nothing else reads `work`.
  - The projection passes in the earnings object each owner's salary rate and the end of their work in the row (`age + selfWorkDuration`,
    `age + spouseWorkDuration`: householdWorkDurations(), retirement or death) and `other.work`.
  - For each owner, the MONTHLY TEST is on in a row when: the row is their grace year (retirement in (start, end], as today), the
    earnings test applies (`ssEarningsTestBand()` not null) and their tested earnings exceed the row's prorated exempt amount (so the
    test can withhold). Only then are the owner's salary end and stream starts/ends added as segment boundaries; in every other row
    the segmentation, flags and accumulations are today's, bit for bit.
  - With the monthly test on, a segment is a service month when that owner has self-employment profit in it (a stream with a positive
    rate active over it), or their wages in it (salary rate before the salary end, plus active employment stream rates, annual) exceed
    the band's exempt amount, annual: `band.exempt` is the under-FRA amount, or in the year of full retirement age the higher amount
    for the months before it (20 CFR 404.430(a)(1), (a)(2)(ii); see D1). The grace flag is on. The rest — the cap (the benefits of the
    service months), the walk, the family pool and the ARF credits — reads the flags as today.
  - With it off, the grace flag is today's (including the stream condition), so no row without a possible withholding changes.
- **2.** In `src/app-shell.html`:
  - `writeStatic()` records, for each kept field, the stored value and the text the form shows (`e._v2Loaded = {shown, value}`), after
    `refreshProtectedValues()`. Kept fields: the eleven (`v2-age`, `v2-retire`, `v2-end`, `v2-spouse-age`, `v2-contribution-stop`,
    `v2-dividend-start`, `v2-ss-claim`, `v2-spouse-claim`, `v2-self-life`, `v2-spouse-life`, `v2-transfer-age`) and the seven R45 optional
    dates that `readStatic()` also rounds with `half()` (`v2-spouse-retire`, `v2-spending-start`, `v2-conversion-start`,
    `v2-health-coverage-end`, `v2-ltc-onset`, `v2-medicare-start`, `v2-spouse-medicare-start`) — the same family, the same mechanism (D2).
  - `readStatic()` returns the stored value for an untouched field (its text is still the recorded text) and today's rounded value for an
    edited one. Each clamp runs only when one of the fields it reads was edited (retirement: `v2-age` or `v2-retire`; end: those or
    `v2-end`), so an edited form clamps exactly as today.
  - `refreshProtectedValues()` shows a year field on a half year as today (`toFixed(1)`) and any other stored value as it is; the blur
    handler leaves an untouched field alone (focusing and leaving a field is not an edit).
  - The manual-order select: `writeStatic()` removes any earlier extra option and, when the stored order is a non-empty string the select
    does not list, adds one option for it (labelled with the class names); `readStatic()` reads the select as today.
- **3.**
  - Validator `validateProfile()`: the WARNING `INCONSISTENT_AGES` at `profile.endAge` (endAge < retireAge) becomes the ERROR
    `END_AGE_BEFORE_RETIREMENT` at `profile.endAge`, message `endAge (E) is before retireAge (R): the plan must run at least to the
    retirement age`. Raised only when the end age is not before the start, so an end before the start keeps R41's ERROR alone.
  - Engine: a new gate function `endAgeBeforeRetirementCode(p)` after `endAgeBeforeStartCode(p)` in the input gate (~5313), code
    `END_AGE_BEFORE_RETIREMENT` → `SCENARIO_END_AGE_BEFORE_RETIREMENT`, with its message in the refusal list. It reads only finite
    numbers, as R41's does. It joins `workerFunctions` and the exports. `RESULT_CONTRACT.md` gains the code beside R41's.
  - The import refuses through `reviewImportedScenarios()` (validator ERRORs), naming the message. The form cannot produce such a plan
    (an edited end age is still clamped).
  - **The spouse (my reading).** The rule reads the primary's retirement age and end age, both on the primary's clock. A spouse's own
    later retirement (`profile.spouseRetireAge`, on the spouse's clock) is not part of it: a younger spouse may still be working when the
    plan ends, and `readStatic()`'s clamp never involved the spouse either. A witness holds a couple whose spouse retires after the end.

## The stop condition (decision 3): scanned before any source edit

`prediction/r53_corpus_scan.js` (output `r53_corpus_scan_at_cbce0ce.txt`):

| source | plans with endAge < retireAge |
|---|---|
| control composition (36; the five golden plans and seeds 1–20 included) | **none** |
| expanded composition (71) | **none** |
| the scenario generator, seeds 1–5,000 | **none** (by construction: `endAge = min(max, retireAge + 5..30)`) |
| `defaultPlan` | not refused (55 / 100) |
| `tests/fixtures/*.json` | **none** |
| the R40 conservation grid's generator | none by construction (`retireAge <= age + 5`, `endAge >= age + 10`) |

**No corpus or control plan, golden plan or generator seed is refused, so item 3 is built.** No control input changes.

Beyond the stop condition, the refusal reaches TEST plans and the auditors' companion plans, reported here in full:

- **Tests (the exposure run, `r53_test_exposure_at_cbce0ce.jsonl`): 43 files** give the engine or the validator a plan with endAge <
  retireAge — the "working-only horizon" idiom (e.g. age 60, retirement 65, end 64). The adaptation by intent is: the owner retires AT
  the end age (still working through the whole horizon), and a spouse whose date followed `profile.retireAge` keeps it as
  `profile.spouseRetireAge`. `prediction/r53_endage_neutrality_hook.js` re-ran every such engine call at base with that adaptation:
  **238 of 238 readable plans give the identical result** (rows, issues, every field); the other 10 calls, in the two `audit-s5r01-*`
  files, are deliberately unreadable inputs (throwing getters) the hook cannot copy. So the adaptation moves no tested figure. Two
  tests pin the old warning itself and are adapted to the refusal: `scenario-validator.test.js` ("endAge before retireAge is flagged as
  a WARNING") and `audit-s5aa-r41-end-age-before-start-refused.test.js` (the control "an end age between the start and the retirement
  age keeps its warning and is projected").
- **ChatGPT's companions (their JSON at base):** the R51F probes have 7 cases built on such plans, the R52 boundary simulations 10 of 20
  (E01–E05, Q01–Q05) plus U01, and the R46–R51 simulations 7 of 20 (cases[0], [1], [4]–[7], [19] of its JSON: S01, S02, S05–S08, S20).
  After item 3 these are refused. The R52 companion asserts each boundary plan valid, so on the item-3 tree it stops with its harness
  exception (exit 2) before its `ui` section. **Measurement plan:** the companions are run at the item-2 commit (where every case still
  runs and every finding check is predicted green) and again at the item-3 commit (where those cases are refused). See D3.

## The checklist

**C6, every reader** (searched at `cbce0ce`).

| rule changed | reader | condition / check |
|---|---|---|
| grace flag and service months (1) | `householdSocialSecurityDetail()` only (`selfGrace`, `spouseGrace`, `sSvc`/`pSvc` in `ssSegs`, `selfServiceGross`/`spouseServiceGross`, `spouseAuxInSelfService`/`selfAuxInSpouseService`) → `ssSingle`/`ssFamily`/`ssRemainder` → `ssEarningsTestWithholding()` cap and `ssWalk()` months | the `grace` tap (`r53_mirror.js`): a call where an owner's grace row has the band, pay, and tested earnings above the prorated exempt amount |
| | its output: `ss` (row income, taxable SS, AGI/MAGI, IRMAA lookback, withdrawals, the settlement), `creditMonths` → `ssCreditedMonths` → later rows' benefits (ARF) | follows the variable |
| | `householdSocialSecurityForPeriod()` (no earnings): unchanged | — |
| `otherIncomeFor()` return (1) | the projection's `other` (reads named fields only); tests call it and read named fields (`audit-income-onset`, `audit-fm01-ss-calendar`: no deep-equal of the whole object) | — |
| `readStatic()` / `writeStatic()` / `refreshProtectedValues()` / the blur handler (2) | `calculate()`, the scenario tabs, `createFromGuide()`, `load()`, `importSettings()`, `clearSavedData()` | `prediction/r53_import_preservation_probe.js`: every expanded plan through the real import, the saved plan against the candidate |
| the manual-order select (2) | `writeStatic()` / `readStatic()`; no test reads its options | — |
| validator end-age rule (3) | `validateScenario()` consumers: the app import (`reviewImportedScenarios()`), `renderPlanChecks()` (WARNINGs only — the warning leaves), tests | the exposure hook's `endBeforeRetire` |
| engine gate (3) | `runPlan()` / `runScenario()` / `simulatePlan()`'s input gate → `refusedSimulation()`; the heat map reads `calculationErrorAge`; the Worker list | the same, and the corpus scan |

**Pins searched (the R45 lesson):**
- **Validator messages:** the `INCONSISTENT_AGES` end-age warning text leaves; pinned by `scenario-validator.test.js` and
  `audit-s5aa-r41-…` (adapted, above). No test pins the new text but R53's.
- **Form labels, input ids, `staticIds`:** none change. **`defaultPlan`:** does not change.
- **`workerFunctions`:** one new engine function, `endAgeBeforeRetirementCode`, joins the list and the exports (`audit-q15-worker-dependencies`,
  `worker-parity` hold them). Item 1 adds no top-level function.
- **Refusal codes:** `audit-s5aa-r43-seeds-contract-history` reads `RESULT_CONTRACT.md` for a fixed list (R41's code stays); the new
  code is added there.

**C1.** Every condition reads the engine's own state through read-only taps (`tests/lib/engine-variant.js`): the grace-row test is
the engine's own expression, the band is `ssEarningsTestBand()`, the earnings are the object the engine passed. The variant's rows,
success rate and issues are asserted equal to the real engine's on every corpus plan (all paths).

**C2. A limit moves only what is deposited.** Rule 1 changes how much of a benefit may be withheld; its condition requires a benefit
paid in the row (`gross > 0`) and earnings above the exempt amount (a withholding exists under the annual formula).

**C3. A flow must flow.** The condition reads the row's actual earnings and paid benefits, not the plan's entries.

**C4. Monte Carlo (A-11).** Benefits, salary and streams are deterministic in this engine (no path draws them), so a path's exposure
is its plan's. The scan ran every path of the Monte Carlo corpus plans with their own seeding: **no path is exposed**, so no Monte
Carlo plan is named. Items 2 and 3 change no corpus plan's engine input or output.

**C5.** Direction and size of each repair are hand-traced in the witness derivations (below and in the test files). No corpus plan
moves (below), so no corpus direction is needed.

**C7.** Each repair has positive cases and near-miss controls; every control passes at `cbce0ce` and every repair case fails there with
its pre-repair figure (`witness_runs/r53_tests_at_cbce0ce.txt`).

**C8, how each comparison reads the moving fields.**
- **The expanded capture** compares every result field entry by entry by hash (rows, issues with their text, Monte Carlo aggregates).
- **Control 4.7** (`s5aa-r51-control`) compares the stored capture with a live one field by field, records issues by length, and refuses a
  comparison across changed inputs. R53 changes no corpus input and no corpus plan's issues.
- **The golden fixtures** pin named result fields of the five golden plans (inputs unchanged, unexposed).
- **The companions** compare named row fields against independent figures; the R52 companion also reads the plan the app saves.

## Predictions

### 1. The corpus (`prediction/r53_corpus_scan.js`)

| rule | control (36) | expanded (71) |
|---|---|---|
| 1, grace year | **no corpus exposure** (629 grace rows; none with a possible withholding) | **no corpus exposure** (1,144 grace rows; none) |
| 2, restore | app only: no engine input or output | app only |
| 3, refusal | **no plan refused** | **no plan refused** |

**Predicted: no expanded entry and no control entry changes; no issue text changes; no input changes.** Control 4.7: nothing to
declare. Golden fixtures: unchanged. A moved entry is a miss.

**The restore family through the app** (`prediction/r53_import_preservation_at_cbce0ce.txt`, all 71 expanded plans; 2 are refused by
the validator at base for unrelated reasons — `seed:9` TRANSFER_INTO_WORKPLACE_PLAN, `targeted:spouse-cola-income` UNRECOGNIZED_VALUE).
At base all 69 restored plans are changed by the round trip:
- `retirement.manualOrder` blanked in 15 — **predicted kept after R53**;
- `profile.retireAge` raised to the age in 10 retired households — **predicted kept**;
- `retirement.ssFra` (69), `retirement.pensionStart` (2), `retirement.pensionAge` (1) dropped — keys the engine does not read
  (`ssFra` decides nothing since R34; the other two have no reader): **predicted still dropped**, output-neutral (D2);
- `assumptions.runs` 24 → 100 in `seed:17` (the runs field rounds to hundreds) — outside the decision's scope: **predicted still
  rounded** (D2).

### 2. The tests

- **Rule 1** (the exposure run on a scratch worktree of `cbce0ce`, 445 files, 38 batches; 4 batches fail for the hook itself — the
  `toJSON` call counts and the capture-process module list, as at R51 and R52). Seven files are exposed:
  `reconciliation-invariant`, `near-miss-survivor-sweep`, `household-ledger`, `audit-s5aa-ss-earnings-test`,
  `audit-s5aa-r34-earnings-test-and-streams`, `audit-s5aa-r42-ss-family-withholding-and-survivor-arf`, `audit-s5aa-r43-social-security`.
  Every exposed call logged has **no stream** and today's grace on. With no stream the monthly test gives today's service months:
  before the retirement date the salary is a service month whenever a withholding is possible (earnings above the exempt amount need
  a salary rate above it), after it the wages are 0. The segmentation is unchanged (the salary end is the retirement or the death,
  already a boundary). **Predicted: all pass, figures unchanged.**
- **Rule 2:** the 47 jsdom files pass at base (429 tests). **Predicted: all pass** — none restores a backup with an off-step value, an
  unlisted order or a retired household and pins the rounded result.
- **Rule 3:** the 43 files above. **Predicted: each fails at its first refused plan until adapted**; the adaptation (retire at the end
  age, the spouse's date pinned) is output-neutral by the neutrality run, so every adapted figure is predicted unchanged. The two pins
  of the warning are adapted to the refusal.
- **The Worker list:** `audit-q15-worker-dependencies`, `worker-parity`, `tax-withdrawal-gross-rate-removed`, `audit-q48-nonserializable-input`,
  `audit-sa05-shared-eligibility` — predicted to pass with the new function listed.
- **Every other test is predicted to pass.** A failure not named here is a miss.

### 3. The witnesses

**Files** (SHA-256 at this commit; they are committed with the repairs):
- `tests/audit-s5aa-r53-grace-year-monthly-test.test.js`: 15 cases / 26 figures, `bc232ce3bbeb9ce8cc48987aaf9e93c371caea5d57fc738d6b69569e86fbd214`.
- `tests/audit-s5aa-r53-restore-keeps-values.test.js`: 8 cases (jsdom), `469c5ddf9439551cb98bd011996158c8c0d47d6ab34c3d345d129995750d626e`.
- `tests/audit-s5aa-r53-end-before-retirement-refused.test.js`: 5 cases (one jsdom import), `5ad51c1880675b34d3c25233545f1188e9d2a0828e3ea1a862e8809e07f7c70c`.

Run on `cbce0ce` (`witness_runs/r53_tests_at_cbce0ce.txt`).

**R51F-01: the grace year** (Social Security of the year; hand-derived).

| case | expected | at `cbce0ce` |
|---|---|---|
| F01: job ends at the claim | 10,800 | 5,540 |
| F02: $1,000 a month — SS / settled tax / closing | 10,800 / 5,546.10 / 119,271.40 | 4,540 / 4,907.58 / 113,649.92 |
| F03: the spouse | 10,800 | 4,540 |
| at the limit ($2,040) / with a $20,000 salary | 10,800 / 10,800 | 0 / 5,800 |
| retirement 65.25, claim 65.5, job to 65.75 | 5,400 | 3,290 |
| two $12,000 streams / one stream after another | 10,800 / 5,400 | 0 / 0 |
| both owners | 21,600 | 9,080 |
| SE ended before the claim | 10,800 | 5,922.50 |
| year of full retirement age, $4,000 a month (D1) | 11,598 | 8,984.67 |
| grace year then annual year: the grace row | 9,300 | 3,040 |
| ARF: the row at full retirement age | 21,600 | 22,128 |
| family: worker plus spousal | 16,050 | 9,790 |
| controls: F04 0; F05 10,800; just above 0 and 5,794; SE in the benefit months 4,999; FRA year above $5,430 984.67; the annual year 15,840; F02 to 68: 10,800 and 21,600; family above the limit 790 | as stated | pass |

**R52-01 / R52-02: restore** (jsdom, the saved plan projected by the engine).

| case | expected | at `cbce0ce` |
|---|---|---|
| U02: saved date / shown / tax / net worth | 45.75 / "45.75" / 57,038.985 / 113,632.25 | 46 / "46.0" / 56,663.985 / 114,007.25 |
| claim 66.75: saved / shown / row 67 / row 68 | 66.75 / "66.75" / 5,898 / 23,592 | 67 / "67.0" / 0 / 24,000 |
| manual order: saved / shown / Roth | roth,preTax,hsa,taxable (both) / 40,000 | "" / "" / 50,000 |
| event at 61.75 of a plan ending at 62: date / Roth / cash | 61.75 / 90,000 / 10,000 | 62 / 100,000 / 0 |
| event at 59.25: date / settled tax | 59.25 / 1,000 | 59.5 / 0 |
| eleven fields + an R45 date + both clamps: 12 values, shown age, horizon, pension | as stored; [70.25, 71, 71.75]; 8,321.70 | rounded / raised; [70.5, 71, 72]; 5,000 |
| controls: a 61.5 date; an edited date rounds (45.3 → 45.5); an edited retirement age clamps (and raises the end age) | as stated | the 61.5 date and the clamps pass; "untouched beside an edit" fails (46), and so does the rounding check that follows it |

**Decision 3: refusal.** U01 refused by the engine in every method (base: accepted, no code), by the validator (base: valid), by the
import (base: "Backup restored"). Controls pass at base: end = retirement accepted (one year, 106,050, kept through the import); an end
before the start keeps R41's code alone; a retired household and a still-working younger spouse are accepted.

A derivation that proves wrong in the build is corrected and recorded as a miss, never quietly re-expected. Before this commit, while
the cases were being set up, no expected figure was changed; the grace and restore checks were split into subtests so a failing figure
does not hide the next one, and the U02 case's status-line check was dropped (the calculation overwrites the restore message).

### 4. The companions

At `cbce0ce` (`witness_runs/`): R51F probes 33/36 (F01–F03 fail); R52 boundary 20/20 with U01 and U02 failing and H01 the disclosed
limit; R46–R51 20/20.

- **After items 1 and 2 (predicted):** R51F 36/36 — F01–F03 pass with the figures above, and nothing else changes verdict (no other
  group has a grace row with a stream and a possible withholding). R52 boundary 20/20; U01 passes (end 41 kept, 106,050); U02 passes
  (45.75, 57,038.985); H01 unchanged (disclosed). R46–R51 20/20.
- **After item 3 (predicted):** the cases built on end < retirement are refused: seven R51F groups (cases[5], [6], [18], [19], [20],
  [22], [32] of its JSON); R52 boundary E01–E05 and Q01–Q05 (the companion stops with exit 2 at E01's validity assertion); R46–R51 S01,
  S02, S05–S08, S20; U01 refused at import. Every other case keeps its verdict.

### 5. The gate

Targeted runs only. The gate, the control declarations, baselines and tags are the coordinator's.

## Decisions recorded for the owner

- **D1 (rule 1, the year of full retirement age).** The decision names the under-FRA amount ÷ 12 ($2,040). 20 CFR 404.430(a)(1) defines
  the monthly exempt amount as 1/12 of the annual one, and (a)(2)(ii) gives the higher amount for the months of the year of full
  retirement age before it ($65,160 / 12 = $5,430 in 2026). The build uses the band the engine already applies in that year (the
  higher amount there, the lower amount before it): the regulation's figure and the "FRA-year handling" the decision keeps. Using
  $2,040 in the FRA year as well would be stricter than the law. The witness at $4,000 a month separates the two readings.
- **D2 (rule 2, the rest of the restore family).** Outside the decision's listed scope and left as they are: `assumptions.runs`
  rounded to hundreds (a Monte Carlo plan of 24 runs becomes 100, which moves the published result), other `readStatic()` clamps (fee
  0–2, withdrawal rate 0–15, guardrails ≥ 1, dividend ranges, flexibility 0–50 and others), `normalizedPlan()`'s end age capped at 100
  (the validator accepts up to 120), and retirement keys the form does not carry (`ssFra`, `pensionStart`, `pensionAge`; no engine
  reader). The seven R45 optional dates use `half()` like the eleven and are kept by the same mechanism.
- **D3 (rule 3, its reach).** No corpus input is refused, but the refusal reaches 43 test files and 24 of the auditors' companion
  cases, all built on a working-only horizon. The tests are adapted output-neutrally (retire at the end age); the companions are
  ChatGPT's records and are not edited, so the R52 companion can no longer complete on the R53 tree. Item 3 is its own commit, so it
  can be held back without touching items 1 and 2 if the owner wants to revisit the idiom.
