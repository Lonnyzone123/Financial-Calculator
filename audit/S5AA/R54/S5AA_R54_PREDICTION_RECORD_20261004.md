# S5AA R54 — prediction record: own field only (R53-01) and the rest of the restore family (R53's D2)

*Written by Claude on 2026-10-04, 5:25 pm Arizona time (UTC−7). Committed before any `src/` edit (A-01), and held to
`audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md` (C1–C8; A-11 for Monte Carlo). Base: `sprint/s5aa-r54` at `b82f25f`
(main: ChatGPT's R53 audit merged, PR #73). Control: `s5aa-r51-control` (not touched by this round). Worktree `C:/fc-wt-r54`; the base
measurements were taken in a detached worktree of `b82f25f` (`C:/fc-wt-r54base`).*

## The round

The owner's decisions of 2026-10-04, as the coordinator handed them to this round (the finding verified by the coordinator at `b82f25f`
with ChatGPT's companion):

1. **R53-01, own field only.** An edit changes only the field the user edited: editing the age never moves the retirement age or the end
   age; editing the retirement age never moves the end age. A field's own entry handling (half-year precision, its input's range) still
   applies when that field is edited, and the retirement field's own floor at the current age (`max(age, retire)`) is kept (recorded as a
   reading, D1). An edit that leaves the end age before the primary's retirement age is REFUSED with the named message (R53's decision 3:
   validator `END_AGE_BEFORE_RETIREMENT`, engine `SCENARIO_END_AGE_BEFORE_RETIREMENT`), never raised silently, and the user sees it.
   What is shown, saved and posted always agree.
2. **The rest of the restore family (R53's D2): keep every validated restored value unless the user edits that field.** The run count,
   every other `readStatic()` transformation, the end age above 100, and the keys no input carries. An edited field keeps the form's
   handling exactly as today. A value the validator refuses never reaches the engine this way.

### How each rule is built (definitions, before the edit)

All in `src/app-shell.html`; no engine or validator change.

- **The kept-value mechanism, generalised (2).** `KEPT_STATIC` (input id → `[section, key]`) grows from R53's 18 fields to every input
  that `readStatic()` or `save()` reads into the plan with a number: the 18, plus 55 more (73 in all) (every number input, the R35/R48/R50 text
  inputs, and the history-start select; the full list is the table below). `readStatic()` and `save()` wrap each read in `kept(id, …)`:
  an untouched field returns the stored value; an edited one is read exactly as today.
  - **Untouched** means: a value was recorded for the field at the last `writeStatic()`, the user has fired no `input` or `change` event on
    it since, and its text is still the recorded text. R53 used only the text; the event flag is added so that an edit whose text comes back
    to the recorded text (a year field typed 2.6, shown 2.5 on leaving it) is still read as an edit (the form's own rounding applies). The
    app itself dispatches those events only from the blur handler after it normalises an edited field and from a range slider the user
    moved — both edits.
  - **`recordLoaded()`** records from a copy of the plan taken when `writeStatic()` starts, and records a field only when its stored value is
    a finite number AND `validateScenario()` reports no ERROR at that field's path. A value the validator refuses (possible only through
    browser storage, which the import does not validate) is therefore read as the form reads it, as today, and never reaches the engine
    through the kept path. Example measured at the base: `advanced.irmaaMagiTwoYearsBefore` −5 is a validator ERROR the engine would run.
  - The blur handler leaves an untouched field alone (R53) under the same definition.
- **The keys no input carries (2).** `readStatic()` rebuilt `profile`, `employment`, `assumptions` and `retirement` from the inputs, dropping
  every other key. Each is now rebuilt on a copy of its stored keys (`Object.assign(carried(section), {…the form's values…})`), so a key
  no input writes is carried unchanged; the R45/R48/R50 optional keys are still deleted when their input is blank, and
  `communityProperty` still when unchecked (R48: absent is the default). A carried key with an ERROR at restore is not carried (as today).
- **The end age above 100 (2).** `normalizedPlan()` capped every end age at 100 (`Math.min(100, endAge)`). It now keeps a finite number as
  stored and applies the old expression only to a value that is not a finite number (the import's lenient coercion of, for example, a string,
  unchanged). An edited end age is still capped at 100 by the form.
- **Own field only (1).** `readStatic()`:
  - age: `kept("v2-age", half(age))` (unchanged);
  - retirement: `kept("v2-retire", max(age, half(retire)))` — the floor at the age runs only when the retirement field itself was edited;
  - end: `kept("v2-end", min(100, half(end)))` — the end age is never raised to the retirement age; capped at 100 only when edited.
- **The refusal made visible (1), with the existing machinery only.**
  - The status line: when the active scenario's result is an input refusal (`calculationError` with a `SCENARIO_…` code), it reads
    "No projection for this scenario: " + the engine's refusal message + " Your inputs are saved in this browser." It read "Projection updated
    · saved in this browser" for a refused plan.
  - Plan checks (the header's existing list) lists the validator's ERRORs as well as its WARNINGs (ERRORs first). R49 wrote "ERRORs cannot
    arise from the form"; under rule 1 they can.
  - The results page: `planWarningTitles` (the existing card list) gains `SCENARIO_END_AGE_BEFORE_RETIREMENT` and
    `SCENARIO_END_AGE_BEFORE_START`, so the engine's message is a card beside R41's existing calculation-error state (no figures, "Calc.
    error"), which is unchanged.
  - Nothing else: no new element, control or page.

## The stop conditions

| condition | finding |
|---|---|
| an engine-direct corpus, control or golden output would move | **No.** R54 edits only `src/app-shell.html`; no engine or validator code, `defaultPlan`, corpus input or baseline changes. The expanded capture at the base equals r30 (below); predicted equal at the head. |
| keeping a restored value would need a validator-refused value in the engine | **No.** The kept path records only values with no validator ERROR at their path (above); measured at the base, the only refused candidate (`irmaaMagiTwoYearsBefore` −5) is refused by the import and is read through the form when it comes from storage. |
| "own field only" would need a UI design decision beyond showing the existing refusal | **No.** The refusal is the engine's and the validator's existing message, shown in the existing status line, Plan checks list and results-page card list (above). The results page's existing calculation-error card keeps its wording (D3). |

## C6 — every transformation on the restore path, and its disposition

Read at `b82f25f` from `readStatic()`, `save()`, `writeStatic()`, `normalizedPlan()`, `refreshProtectedValues()` and the number-input blur
handler (`protectNumberInput()`). "Base" is what the restore-family probe measured at `b82f25f` for a validator-accepted value
(`prediction/r54_restore_family_at_b82f25f.txt`: one plan per row, through the real import, then a blur of the untouched field).

### Numbers

| input → plan path | transformation at the base | a validated value it changed (base: saved / after a blur) | R54 |
|---|---|---|---|
| the 18 R53 fields (`v2-age` … `v2-spouse-medicare-start`) | `half()` (and the R45 dates `clamp(…, 0, 120)`) | — (kept by R53) | kept-unless-edited, now also validator-gated and event-flagged |
| `v2-retire` → `profile.retireAge` | `max(age, retire)` when the age OR the retirement field was edited | H01: 65 → 70.5 after an age edit | **floor only when the retirement field is edited** (D1) |
| `v2-end` → `profile.endAge` | `min(100, max(retire, end))` when any of the three was edited; `normalizedPlan()` `min(100, end)` always | 110 → 100 / 100 | **never raised; capped at 100 only when edited; `normalizedPlan()` keeps a finite stored value** |
| `v2-salary` → `employment.salary` | `max(0)` | −1,000 → 0 / 0 | kept-unless-edited |
| `v2-spouse-salary` → `employment.spouseSalary` | `max(0)` | −1,000 → 0 / 0 | kept-unless-edited |
| `v2-salary-growth` → `employment.growth` | none; blur clamps to the input's −20..30 | 35 → 35 / **30** | kept-unless-edited |
| `v2-return` → `assumptions.returnRate` | none; blur −5..20 | 25 → 25 / **20** | kept-unless-edited |
| `v2-inflation` → `assumptions.inflation` | none; blur 0..15 | −1 → −1 / **0** | kept-unless-edited |
| `v2-fee` → `assumptions.fee` | `clamp(0, 2)` | 2.5 → 2 / 2 | kept-unless-edited |
| `v2-runs` → `assumptions.runs` | round to hundreds, `clamp(100, 10000)`, written back to the form | 24 → 100 / 100 | kept-unless-edited (the write-back writes the kept value) |
| `v2-seed` → `assumptions.seed` | `max(1, floor)` | 42.7 → 42 / 42 | kept-unless-edited |
| `v2-volatility` → `assumptions.volatility` | `max(0)` | −1 → 0 / 0 (validator WARNING) | kept-unless-edited |
| `v2-history-start` (select) → `assumptions.historyStart` | `Number(select)`: a year the select does not list reads as 0 | 2030 on the simple method (validator: a data year is required only on the historical method; the engine reads it only there) → 0 | kept-unless-edited |
| `v2-spending` → `retirement.spending` | `max(0)` | −100 → 0 / 0 (WARNING) | kept-unless-edited |
| `v2-withdrawal-rate` → `retirement.withdrawalRate` | `clamp(0, 15)` | 16 → 15 / 15 | kept-unless-edited |
| `v2-upper-guardrail`, `v2-lower-guardrail`, `v2-adjustment` | `max(1)` | 0.5 → 1 / 1 (each) | kept-unless-edited |
| `v2-floor`, `v2-ceiling` | `max(0)` | −1 → 0 / 0 (each) | kept-unless-edited |
| `v2-dividend-yield` | `clamp(0, 20)` | 21 → 20 / 20 | kept-unless-edited |
| `v2-dividend-qualified` | `clamp(0, 100)` | 120 → 100 / 100 (WARNING; the engine holds it to 100 and discloses) | kept-unless-edited |
| `v2-dividend-growth` | `clamp(−20, 20)` | 25 → 20 / 20 | kept-unless-edited |
| `v2-ss-benefit`, `v2-spouse-ss` | `max(0)` | −1 → 0 / 0 (each) | kept-unless-edited |
| `v2-aime`, `v2-pension`, `v2-transfer-amount`, `v2-conversion-amount`, `v2-qcd`, `v2-health-cost`, `v2-ltc-cost`, `v2-ltc-insurance`, `v2-insurance`, `v2-legacy` | `max(0)` | none: the plan-value contract refuses a negative value (ERROR), so no validated value is changed | kept-unless-edited (uniform; protects them from a blur clamp) |
| `v2-pension-cola` → `retirement.pensionCola` | none; blur 0..10 | 12 → 12 / **10** | kept-unless-edited |
| `v2-flexibility` | `clamp(0, 50)` | 60 → 50 / 50 | kept-unless-edited |
| `v2-vpw-min` (`save()`) | `clamp(0, 25)` | 30 → 25 / 25 | kept-unless-edited |
| `v2-vpw-max` (`save()`) | `clamp(0, 100)` | 120 → 100 / 100 | kept-unless-edited |
| `v2-rmd-multiplier` (`save()`) | `clamp(0, 200)` | 250 → 200 / 200 | kept-unless-edited |
| `v2-rmd-floor` (`save()`) | `max(0)` | −1 → 0 / 0 | kept-unless-edited |
| `v2-ss-cola` (`save()`) | `clamp(0, 15)` | 20 → 15 / 15 | kept-unless-edited |
| `v2-survivor-spending-reduction` (`save()`) | `clamp(0, 50)` | 75 → 50 / 50 (contract 0–100) | kept-unless-edited |
| `v2-correlation` | `clamp(−1, 1)` | 1.5 → 1 / 1 (WARNING with one asset class; the validator refuses an infeasible one) | kept-unless-edited |
| `v2-retirement-stock`, `v2-bond-tent` | `clamp(0, 100)` | none: contract 0–100 | kept-unless-edited (uniform) |
| `v2-reserve-years` | `max(0)`; blur 0..10 and `half()` (a year field) | 12 → 12 / **10** | kept-unless-edited |
| `v2-health-inflation` | `max(0)` | −2 → 0 / 0 (contract: above −100; WARNING) | kept-unless-edited |
| `v2-ltc-prob` | `clamp(0, 100)` | none: contract 0–100 | kept-unless-edited (uniform) |
| `v2-ltc-years` | `max(0, round)`; blur 0..10, `half()` | 2.5 → 3 / 3 | kept-unless-edited |
| `v2-irmaa-magi-2`, `v2-irmaa-magi-1` (text) | blank deletes; `max(0)` | none: the validator refuses a negative MAGI (ERROR) — the control case | kept-unless-edited (validator-gated) |
| `v2-medicare-inflation` (text) | blank deletes; `clamp(−99, 100)` | −99.5 → −99 / −99 (contract: above −100) | kept-unless-edited |
| `v2-part-d-premium` (text) | blank deletes; `clamp(0, 100000)` | 150,000 → 100,000 (contract: no maximum) | kept-unless-edited |
| `v2-az-gain-share` (text) | blank deletes; `clamp(0, 100)` | none: contract 0–100 | kept-unless-edited (uniform) |
| `v2-prior-income` (text) | blank deletes; `clamp(0, 1e9)` | 2e9 → 1e9 (contract: no maximum) | kept-unless-edited |
| `v2-roth-first-year`, `v2-spouse-roth-first-year` (text) | blank deletes; `round`, `clamp(1998, 2200)` | 2015.5 → 2016 | kept-unless-edited |

### Not numbers, and the keys with no input

| item | transformation at the base | R54, and why |
|---|---|---|
| `retirement.ssFra`, `pensionStart`, `pensionAge`, and any other key of `profile` / `employment` / `assumptions` / `retirement` no input writes | dropped when `readStatic()` rebuilt the section (all 69 restored corpus plans lose `ssFra`; 2 `pensionStart`; 1 `pensionAge`) | **carried unchanged.** The engine reads none of them in a projection: (a) a Proxy over the four sections on all 71 expanded plans (`prediction/r54_engine_section_reads.js`) shows every key the engine touches is one the form writes, except `retirement.ssFra`, which only the plan-value contract's type check reads (a number is accepted); (b) a differential on all 71 plans (`r54_inert_keys_differential.js`: `ssFra` removed / 60 / 75, `pensionStart`/`pensionAge` added and removed, an unlisted key in each section; 426 runs) gives **0 differing results**. |
| `name` (text) | blank → "Scenario N" | **unchanged**: a tab label, not a plan value; no engine or validator reader; the fallback keeps a tab nameable. |
| `retirement.strategy` (select) | `canonicalWithdrawalStrategy()` in `writeStatic()` normalises the case ("Guardrails" → "guardrails"); an unknown name falls back to the stored one | **unchanged**: the owner's Q58 decision (2026-09-13, "normalise case silently"); the engine resolves the name the same way, so no result moves. |
| the other selects (`filing`, `state`, `method`, `withdrawalOrder`, `withdrawalTiming`, `limitPolicy`, `optimizationGoal`, `returnPreset`, the transfer pair) | a value the select does not list reads as "" | **unchanged**: measured, each select lists exactly the values the validator or contract accepts (`r54_restore_family_at_b82f25f.txt`, "select" lines; history start is handled above); `returnPreset` has no engine reader; the transfer pair is listed from the plan's accounts (R53's corpus probe: no change). |
| `retirement.manualOrder` (select) | R53's extra option | unchanged (R53). |
| `retirement.incomeOffset` | forced `true` | **unchanged**: the P2 migration (Q18, Q26 closed by the owner). |
| `profile.communityProperty` | `false` → absent | **unchanged**: R48, absent is the default and the engine reads `=== true`; no result moves. |
| checkboxes (`spouseOn`, `dividendOn`, `survivor`, `ssAdvanced`, the `advanced` switches, `guytonSkipInflation`, …) | read as checked | unchanged: a boolean the form shows exactly. |
| `normalizedPlan()` defaults, `normalizeAccount()`/`…OtherAsset()`/`…Debt()`, the v2.10 home/debt migration, `incomeOffset`, `slice(0, 4)` scenarios | backfill and documented migrations, before the import validates | unchanged: the validated plan is the normalised one. |
| `refreshProtectedValues()` | shows a half-year age as `toFixed(1)`, any other value as stored (R53) | unchanged (display only). |

## The tests: exposure through the app (C6, C8)

`prediction/r54_app_exposure_hook.js` taps every app page a test builds (jsdom's `JSDOM` is wrapped; read-only taps in `readStatic()`,
`writeStatic()`, the blur handler and `normalizedPlan()`), run by `r54_run_app_exposure.js` over every test file that can reach a page
(77 files; 71 build one; 304 records). Classified by `r54_classify_app_exposure.js` (`r54_app_exposure_classified_at_b82f25f.txt`).
One batch failed for the hook itself: `capture-boundary` 5.4 sees the hook in the capture process's module list (as R52's and R53's hooks).

- **Item 1 (a dependent clamp):** one file, `audit-s5aa-r53-restore-keeps-values.test.js`, its control "an edited field still rounds …":
  editing the retirement age to 47.5 raised the untouched end age 46 to 47.5. **Predicted: that one check fails at the head** (the end age
  stays 46 and the plan is refused), and is adapted by intent (R54, the owner's decision 1) to assert the kept end age and the refusal. Its
  next step (retirement typed 40, floored at the age, 45) is predicted unchanged: end 46 ≥ 45, valid.
- **Item 2 (a restored value transformed with no edit):**
  - `retirement.ssFra` 67 → absent: 29 files (the default plan carries `ssFra: 67`). **Predicted: kept, and every test passes**: no app
    test reads `ssFra` from a saved plan, and the engine does not read it (above).
  - `audit-q58-strategy-load`: "Guardrails" → "guardrails" — unchanged by design (Q58).
  - `audit-s5aa-r49-…`: flexibility 10 → 0 with the text back at the recorded "0" — the user's own edits (10, then 0); 0 either way.
  - No blur clamped an untouched field, and no test restores an end age above 100 (`endcap` 0).
- **Pins searched (the R45 lesson):** no validator message, form label, input id, `staticIds` entry, Worker function or `defaultPlan`
  value changes. `planWarningTitles` gains two keys: R48's test matches one key, R49's asserts each listed once, R52's names two —
  predicted to pass. "Projection updated" is pinned only as absent after a blanked input (FM-08, a path R54 does not touch). Plan checks
  is pinned by R49 for valid plans (no ERROR there), predicted unchanged.
- **Every other test is predicted to pass.** Targeted batches: the witnesses, every app/jsdom file (the 77 above), the import and
  restore tests, and the register tests. A failure not named here is a miss.

## Restore through the real import, the corpus (C8)

`audit/S5AA/R53/prediction/r53_import_preservation_probe.js` (R53's probe, unchanged) at the base
(`prediction/r54_import_preservation_at_b82f25f.txt`): 71 plans, 2 refused at the base for unrelated reasons (`seed:9`, `targeted:spouse-cola-income`),
**69 changed** by the round trip: `ssFra` 69, `assumptions.runs` 1 (`seed:17`, 24 → 100), `pensionStart` 2, `pensionAge` 1.
**Predicted at the head: 0 changed**, the same 2 refused.

## The corpus, and Monte Carlo (C4/A-11, C5, C8)

- **Engine-direct expanded capture** (`node tools/capture-baseline.js capture … --composition expanded`): at `b82f25f`, qualified, 71
  entries, output hash `2c342c6c6bdc966cd34a8c7e35561fe598e2c50abd33c03cf85560b079dc5b04`, input hash
  `ed3731e2f72425d0e17bfb26558411c22d552d559f9038db7d431769dcb839c4` — equal to r30 entry by entry (`r54_expanded_capture_at_b82f25f.json`).
  **Predicted at the head: identical, 71 of 71** (no engine input or code changes). The capture compares every result field by hash;
  control 4.7 compares the control subset field by field. Nothing to declare.
- **Monte Carlo (A-11):** no engine path changes, so no path of any corpus plan is exposed on the engine-direct route. **Through the app**
  one Monte Carlo corpus plan is exposed: **`seed:17` (24 runs) — named, all 24 paths exposed (the app ran 100 paths; it will run the
  plan's 24), the app's published result may move**; it moves to what the engine-direct capture already holds. `seed:9` (52 runs) is
  refused by the validator for another reason; the two 500-run plans round to themselves.
- **C5 (directions):** the witness derivations below are hand traces; no corpus plan moves on the engine route.

## The witnesses (C7)

Files (SHA-256 at this commit; committed with the repairs):
- `tests/audit-s5aa-r54-own-field-edits.test.js` — 6 tests, `a80c5a4aadbb395798bee1af0d3ec2b0f78c18ffee8786df4d7d5522dddd852c`.
- `tests/audit-s5aa-r54-restore-keeps-all.test.js` — 7 tests, `e0ccf0b18be769e43fe791efb10870a654f4d9a4d6d2b22b8090f38da8f9347e`.

Each restores through the real Restore backup input, with a stand-in Worker that records the posted plan and answers with the engine's
`runScenario()`. Run at `b82f25f`: `witness_runs/r54_witness_at_b82f25f.txt` (648 checks: 90 pass, 558 fail), the failing figures
listed in `witness_runs/r54_witness_figures_at_b82f25f.txt`.

| witness | expected (hand-derived) | at `b82f25f` |
|---|---|---|
| H01: restore age 70 / retirement 65 / end 71, edit the age to 70.3 | age 70.5; retirement 65 saved, posted, shown "65.0"; end 71; pension 10,000 × 1.10^5.5 × 0.5 = **8,445.585690332558**; portfolio and net worth **108,445.585690**; tax 0 | retirement 70.5 saved and posted (shown 65.0); pension 5,000; 105,000 |
| end edited to 63 below retirement 65 | end 63 saved/posted/shown; retirement 65; engine refuses `SCENARIO_END_AGE_BEFORE_RETIREMENT`; status names the engine's message; Plan checks lists "endAge (63) is before retireAge (65)"; results page "—" / "Calc. error" and the message; corrected to 70, the refusal clears | end 65 (raised); projected; status "Projection updated"; results $100,000 / 100.0% |
| retirement edited to 72.3 past end 70 | retirement 72.5; end 70; refused, message shown | end raised to 72.5 |
| age edited to 76 past end 75 (retired at 65) | retirement 65, end 75 saved and posted; `SCENARIO_END_AGE_BEFORE_START` (R41); status names it | retirement and end 76 |
| control: age 52.3 with end untouched | retirement 60, end 90; projected | passes |
| control: own entry handling | end 85.3 → 85.5; 150 → 100; retirement 55.3 → 60 (floor), end unchanged | passes |
| every family kept (39 values + 7 carried keys; after the calculation, a blur of each untouched field, a name edit, a scenario switch and back) | each exactly as restored, saved, posted and shown | each transformed as in the C6 table (e.g. runs 100, fee 2, end 100; carried keys absent) |
| control: 12 edited fields still transformed | fee 3 → 2; runs 150 → 200; seed 42.9 → 42; withdrawal 16.5 → 15; guardrail 0.4 → 1; LTC years 2.6 → 2.5 shown → 3 (the restored text, but edited); end 115 → 100; Part D 150,001 → 100,000; Roth year 2016.5 → 2017; salary −500 → 0; survivor reduction 80 → 50; Medicare inflation −99.7 → −99 | passes |
| runs 24 (Monte Carlo) | 24 saved, posted, shown; the engine reports `requestedPathCount` 24; status "24 simulations" | 100 / 100 / "100"; 100 paths |
| end 110 | 110 saved, posted, shown "110.0"; 41 rows, the last at 110 | 100; 31 rows, the last at 100 |
| fee 2.5% | Roth 100,000 × (1 − 0.025) = **97,500** after a year | 98,000 |
| carried keys | `ssFra` 60, `pensionStart` 67, `pensionAge` 65, an unlisted key in each section: saved, posted, and again after a second restore; the engine's rows identical without them and with `ssFra` 75 | absent; the row identity passes |
| from browser storage: a validator-refused MAGI −5 beside a valid fee 2.5 | MAGI read through the form, 0 (saved and posted), so it never reaches the engine; fee 2.5 kept | MAGI 0 (passes); fee 2 |

A derivation that proves wrong in the build is corrected and recorded as a miss, never quietly re-expected. Before this commit, while the
cases were set up, no expected figure was changed; three harness faults were corrected (a scenario-switch check read the form while the
other scenario was on it; a storage case waited for a calculation the page had already run; a probe read the plan before the 700 ms
debounce).

## ChatGPT's companions (C8)

Run at `b82f25f` (`witness_runs/r54_*_at_b82f25f.*`, by `r54_run_companions.js`); compared check by check with `r54_verdicts.js` (R53's
comparison, extended to the R53 companion's hunt and monthly grid).

| companion | at `b82f25f` | predicted at the head |
|---|---|---|
| R53 focused (no adapter) | 20/20, 140 checks; grid 400 plans / 800 checks; hunt H01: 2 of 4 checks fail (retirement 70.5, pension 5,000); exit 1 | 20/20, 140; grid 400/800; **hunt 4/4 (retirement 65, pension 8,445.585690); exit 0**. Only the hunt's two checks change verdict. |
| R51F (adapter) | 36/36, 175 checks | unchanged |
| R46–R51 (adapter) | 20/20 | unchanged |
| R52 boundary (adapter) | 20/20, 100 checks; U02 passes; U01 refused at import; H01 the disclosed limit; exit 1 | unchanged (exit 1 for H01, as before) |

## Gate

Targeted runs only; the full gate, the control declarations, baselines and tags are the coordinator's.

## Decisions and readings recorded for the owner

- **D1.** The retirement field's own floor at the current age is kept (the owner's instruction): a user cannot type a historical retirement
  age below the current age through the form; a restored one is kept until that field is edited.
- **D2.** Values the validator accepts without a word (a negative salary, fee, withdrawal rate, guardrail, COLA or flexibility; a fee
  above 2%; …) were held to the form's ranges only by `readStatic()`. After R54 a restored value reaches the engine as the engine-direct
  route already receives it (status ok in every probed case). The validator's ranges, not the form's, now bound a restored plan.
- **D3.** The results page's calculation-error card describes any input refusal as "an internal reconciliation problem" (pre-existing
  wording, R41's refusal included). R54 adds the engine's own message as a card beside it and does not reword the old card.
- **D4.** An end age above 120 is accepted by the validator with an OUT_OF_RANGE warning, and the engine projects it only to 121 (measured
  at the base: end 130 and 200 give rows to 121). Kept as restored under R54 (the warning is listed in Plan checks); before R54 it became 100.
