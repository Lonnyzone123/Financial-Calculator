# S5AA R54 build report: own field only (R53-01), the rest of the restore family, and the form's ranges as rules

*The builder's three reports (items 1–2, item 3, item 4), saved by the coordinator because a builder cannot write report files. The
coordinator has condensed them without changing any figure. The coordinator's addendum is at the end. Started 4:46 pm Arizona time,
2026-10-04; items 3 and 4 followed the owner's decisions that evening, and the build ended before 8:30 pm.*

**Branch:** `sprint/s5aa-r54`. **Base:** main `b82f25f` (ChatGPT's R53 audit merged). The source commits are `beb3926` (item 1),
`f2ccd64` (item 2), `33a5b59` (item 3) and `58cb62b` (item 4).

The control, candidate, baseline and reference-tree files, `defaultPlan`, and eb's and the owner's documents are untouched.
`src/engine.js` changes only in item 4 (§4).

## Commits, oldest first

| Commit | What |
|---|---|
| `b184411` | prediction record (items 1–2), scans and base witness runs, before any src edit |
| `beb3926` | item 1: an edit changes only the field edited (R53-01) |
| `f2ccd64` | item 2: restore keeps every validated value unless edited (R53's D2) |
| `2aa2511` | records: items 1–2 measured at `f2ccd64` against `b82f25f` |
| `ccbba41` | item 3 prediction, bounds, stop scan and test exposure, before the contract edit |
| `33a5b59` | item 3: a value outside the form's range is refused by every route |
| `a961481` | records: item 3 measured at `33a5b59` |
| `757afc1` | item 4 prediction, stop scan and test exposure, before any edit |
| `58cb62b` | item 4: five ranges widened, the seed bounded, a negative prior-year MAGI refused by the engine |
| `f704638` | records: item 4 measured at `58cb62b` |

## 1. Item 1 — own field only (R53-01)

- **Retirement age.** It is floored at the current age only when the retirement field itself is edited.
- **End age.** It is never raised to the retirement age. An edited end age keeps its own half-year rounding and its cap at 100.
- **Age.** Editing the age moves nothing else.
- **A refused edit.** An end age left before the retirement age, or before the start, is refused by the existing rules
  (`SCENARIO_END_AGE_BEFORE_RETIREMENT`, `SCENARIO_END_AGE_BEFORE_START`). The existing machinery shows it:
  - the status line reads "No projection for this scenario: <the engine's message> Your inputs are saved in this browser.";
  - Plan checks lists validator errors first;
  - the results page adds a "Plan not projected" card beside the calculation-error state.
- **Witnesses, red at base → green at head:**

| Case | Before (base) | After (head) |
|---|---|---|
| ChatGPT's H01 (age edited to 70.3) | retirement 70.5 saved and posted, 65.0 shown; pension 5,000; wealth 105,000 | 65 saved, posted and shown; pension 8,445.585690332558; wealth 108,445.585690; tax 0 |
| End edited to 63, below retirement 65 | end raised to 65, projected | end 63 everywhere, refused, message shown; correcting it clears the refusal |
| Retirement edited to 72.3, past end 70 | end raised to 72.5 | refused, message shown |
| Age edited to 76, past end 75 | retirement and end raised to 76 | 65 / 75 kept; `SCENARIO_END_AGE_BEFORE_START` |

## 2. Item 2 — restore keeps every validated value unless edited

- **Kept fields:** `KEPT_STATIC` grows from 18 to 73 inputs, covering every input `readStatic()`/`save()` reads except the name and
  the selects. Every read goes through `kept()`.
- **"Untouched":** a field also counts as edited once an `input` or `change` event has fired on it since `writeStatic()`.
- **Validator gate:** `recordLoaded()` keeps a value only when `validateScenario()` raises no ERROR at that field's path, so a refused
  value from browser storage is read the way the form reads it and never reaches the engine by this route.
- **Keys the form does not carry:** `profile`, `employment`, `assumptions` and `retirement` are rebuilt on a copy of their stored keys,
  so `ssFra`, `pensionStart`, `pensionAge` and other unlisted keys are carried. The engine reads none of them except `ssFra`, and that
  only in the contract's type check: a 426-run differential gave 0 differing results.
- **End age:** `normalizedPlan()` keeps a finite end age as stored. The old `min(100, …)` now applies only to a value that is not a
  finite number.
- **The C6 table.** The builder enumerated every transformation in `readStatic()`, `save()`, `writeStatic()`, `normalizedPlan()`,
  `refreshProtectedValues()` and the blur handler, and gave each a disposition. At the base, 41 of 46 restored values were
  transformed; at the head, one is, the name, by design.
  - The import probe (71 plans) changed 69 at the base and none at the head.
  - Items 3–4 then refused out-of-range values instead of clamping them (§3–4).

## 3. Item 3 — the form's ranges become rules (the owner's decision after item 2)

- **The bounds.** 28 bounds were added through `src/plan-value-contract.json`, which both layers read: 10 new entries and 18 existing
  entries with a new or changed bound. Each comes from the form's own clamp (`app-shell.html` lines 553, 568 and 569 at `2aa2511`).
  - The validator gives `OUT_OF_RANGE` (ERROR); the engine gives `SCENARIO_PLAN_VALUE_OUT_OF_RANGE`.
  - Fields covered: salaries, fee, volatility, spending, withdrawal rate, guardrails and adjustment, floor and ceiling, the three
    dividend fields, the two SS benefits, flexibility, VPW minimum and maximum, RMD multiplier and floor, SS COLA, survivor reduction,
    correlation, healthcare and Medicare inflation, Part D, and prior income.
- **One issue per condition.** NEGATIVE_VOLATILITY, NEGATIVE_SPENDING and DIVIDEND_QUALIFIED_OUT_OF_RANGE are removed.
- **The stop scan** found nothing outside a new bound in: the control (36) and expanded (71) corpora, the golden plans, `defaultPlan`,
  generator seeds 1–5,000, fixtures, the R40 grid (3,000 plans), and the companions' stored plans.
- **The witness** `tests/audit-s5aa-r54-form-ranges-refused.test.js`: 86 of 188 fail at `2aa2511`; 188 of 188 pass at `33a5b59`.
- **Tests adapted:**
  - Q50's qualified-share pins now assert the refusal;
  - three validator warnings became errors;
  - R10-01's 200% VPW cap path is now refused;
  - SA04's adjustment went from 0 to 1, later restored by item 4;
  - item 2's witness family went from 39 values to the 11 that stay valid.
- **Misses:**
  - M4: removing the correlation `checkRange` broke the scenario generator, which parses that bound from the validator source. It was
    restored before the commit.
  - M5: an intermediate repin, removed before the commit.

## 4. Item 4 — five ranges widened, two gaps closed (the owner's decisions after item 3)

- **Widened in the form (input attribute, slider, clamp) and in the contract together:**
  - fee: 0–5 (was 0–2);
  - withdrawal rate: 0–25 (was 0–15);
  - guardrail adjustment: ≥ 0 (was ≥ 1; the guardrails themselves stay ≥ 1);
  - dividend growth: −50 to 20 (was −20 to 20);
  - survivor spending reduction: 0–75 (was 0–50).
- **The engine reader that needed fixing:** `strategySpending()` clamped the survivor reduction to 0–50 itself, so a valid 75% would
  have run as 50%. That clamp is now 0–75. The builder read every other reader: the fee comes off the return; the withdrawal rate has
  no cap at 15; the adjustment is a multiplier, never a divisor; dividend growth compounds and stays positive.
- **The seed:** an entered seed must be a whole number of at least 1. A new contract key, `"integer": true`, is read by both layers.
  An absent seed keeps the engine's fallback of 0.
- **A negative prior-year MAGI:** a new engine gate, `negativePriorMagiCode()`, gives `SCENARIO_NEGATIVE_PRIOR_MAGI`. It is in the
  Worker list and the exports, and documented in `RESULT_CONTRACT.md` (contractVersion stays 5). The validator keeps its R35
  `OUT_OF_RANGE`. Null, absent and 0 are accepted. It is a gate, not a contract entry, so that ChatGPT's R51F F26 probe stays green.
- **The stop scan** found no seed of 0, no non-integer or negative seed, and no negative MAGI anywhere in the sets above.
- **The witness** `tests/audit-s5aa-r54-widened-ranges-seed-magi.test.js`: 33 of 53 fail at `a961481`; 60 of 60 pass at `58cb62b`.
  The hand-derived downstream figures:
  - a 5% fee leaves 95,000;
  - a 25% constant-percentage draw spends 25,000;
  - adjustment 0 keeps spending at 4,000 after a −30% year (the 10% control gives 3,600);
  - survivor 75% gives 10,000, where the old engine clamp gave 20,000.
- **Tests adapted:**
  - item 3's witness, moved to the new edges;
  - item 2's witness: the 2.5% fee is kept again, and seed 42.7 is removed;
  - `rng-seeding`: the absent-seed fallback is derived, and an entered 0 is refused;
  - SA04: back to its base text.
- **Miss M6:** item 2's edited-field control was not predicted; it was adapted before the commit.

## 5. Predicted against measured (all items)

- **The expanded capture** equals r30 at `f2ccd64`, `33a5b59` and `58cb62b`: 71/71, qualified, output hash `2c342c6c…5b04`, input hash
  `ed3731e2…39c4`.
- **Monte Carlo (A-11):** no engine-route exposure. Through the app, `seed:17`'s 24 runs now reach the engine as 24 paths.
- **ChatGPT's R53 companion, without the adapter:**
  - at the base: 20/20, 140 checks, grid 400/800, and the hunt failing (exit 1);
  - at each head: 20/20, 400/800, hunt 4/4, exit 0.
- **The three adapter companions:** identical check for check at every head. R51F 175/175, with F26's mutation count going 270 → 320
  → 325 and 0 failures; R46–R51 176/176; R52 112/112.
- **Targeted batches** at each head: 0 failures. The last is 266 files, 2,922 tests, 2,914 pass, 8 authorized todos.

## 6. Decisions and readings for the owner (open)

- **D1:** the retirement field's own floor at the current age is kept. A historical retirement age cannot be typed through the form;
  a restored one is kept until that field is edited.
- **D3:** the results page's older calculation-error card describes any input refusal as "an internal reconciliation problem". R54
  adds the engine's message beside it.
- **D4:** an end age above 120 gets a validator warning and is kept as restored.
- **D5:** a field typed and returned to its shown text counts as edited.
- **D6:** the contract's `integer` key is used only for the seed. Other whole-number fields, such as the Roth first-contribution years,
  are not held to it.
- **D7:** the engine's DIVIDEND_QUALIFIED_CLAMPED disclosure, its above-contract VPW/RMD clamps and R10-01's VPW cap path are now
  unreachable through `runPlan()`. The code stays.
- **D8, recorded only:** ranges the form applies only on blur are not rules. Restored values outside them are kept: return −5 to 20,
  inflation 0 to 15, salary growth −20 to 30, pension COLA 0 to 10, reserve years up to 10.

---

## Coordinator's addendum (Claude, 2026-10-04)

**The owner's decisions taken during the build:**
- **After item 2:** tighten the validator in R54, so out-of-range values are refused by every route.
- **After item 3:** widen five bounds in the form and the rule together, close the seed and engine-route MAGI gaps, and record the
  blur-only ranges.

**The coordinator's checks:**
- **Gate at `2aa2511`:** 4,250 / 4,241 / 0 / 9.
- **Gate at `a961481`:** 4,073 / 4,064 / 0 / 9. The drop is explained file by file: item 2's witness 611 → 248, item 3's new 188, Q50
  −2; net −177.
- **The gate at the final head** is in the handover.
- **Own captures** at `2aa2511` and `a961481`: equal to r30, qualified.
- **ChatGPT's companions,** rerun at `2aa2511`: the R53 companion exits 0 with hunt 4/4, and the three adapter companions are
  identical to R53's.
- **The real-browser checks** are in the handover §7.
- **The builder's D2** (the validator accepts values the form clamps) was confirmed by a probe before item 3 was decided: salary
  −50,000, fee −1 and 50, withdrawal −4 and 80, guardrail −20, flexibility −10, COLA −5, all valid with no issue.
