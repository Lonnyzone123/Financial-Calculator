# S5AA R54 — change audit handover: R53-01, the rest of the restore family, and the form's ranges as rules

*Written by Claude, 2026-10-04 (Arizona, UTC−7), for ChatGPT's audit of R54. Every figure below was read from its output at the
commit named. The build report is `audit/S5AA/R54/S5AA_R54_BUILD_REPORT_20261004.md`; this record is the map and the coordinator's
evidence.*

## 1. What is asked

Audit R54's change from main `b82f25f` (your R53 report merged) to `s5aa-r54-source` (`f704638`, once the owner approves the tag).
- Rule on R53-01: repaired, or not.
- Rule on the owner's three further decisions (§2), which widen the scope beyond the finding.
- Number any new findings **R54-NN**.
- Determine S5AA's status against E1 to E18 as amended by A-01 to A-11, with GO or NO-GO on the first line.

## 2. The owner's decisions (2026-10-04)

Claude reproduced R53-01 at `b82f25f` with your companion: 20/20 cases, the grid 400/800, and the hunt failing (retirement 70.5
saved, 65.0 shown, pension 5,000).

- **R53-01, own field only.** An edit changes only the field edited. Editing the age never moves the retirement or end age; editing
  the retirement age never moves the end age. An edit that leaves the end age before the retirement age is refused with the named
  message, not repaired silently.
- **The rest of the restore family (R53's D2).** Every validated restored value is kept until its field is edited. This covers the
  run count, every other form clamp, an end age above 100, and the keys the form does not carry.
- **After item 2:** the builder found that the validator accepted values only the form had bounded, for example a salary of −50,000,
  a fee of 50% or a withdrawal rate of 80%. Restored, these would now reach the engine. The owner decided to make the form's ranges
  rules, refused by every route.
- **After item 3:** the owner widened five of those ranges, in the form and the rule together:
  - fee: 0–5;
  - withdrawal rate: 0–25;
  - guardrail adjustment: ≥ 0;
  - dividend growth: −50 to 20;
  - survivor spending reduction: 0–75.

  The owner also closed two gaps: an entered seed must be a whole number of at least 1, and the engine refuses a negative prior-year
  MAGI as the validator does.

## 3. Dispositions

| Item | Red at the base (`b82f25f`) | Green at `f704638` | The repair |
|---|---|---|---|
| **R53-01** | your H01: retirement 70.5 saved and posted, 65.0 shown; pension 5,000; wealth 105,000 | 65 saved, posted and shown; pension 8,445.585690332558; wealth 108,445.585690; tax 0 | `readStatic()`: the retirement floor runs only on an edit of the retirement field, and the end age is never raised |
| Refused edit | end raised to the retirement age, silently | refused; the status line, Plan checks and a "Plan not projected" card name it; no figures shown | the existing refusal machinery, wired to the status line and results |
| Restore family | 41 of 46 restored values transformed; import probe 69/71 plans changed | 1 of 46 (the name, by design); 0/71 changed | `KEPT_STATIC` grows from 18 to 73 inputs, gated by the validator; unlisted keys carried; `normalizedPlan()` keeps a finite end age |
| Form ranges as rules | salary −50,000, fee −1 and 50, withdrawal −4 and 80 and others all valid, with no issue | refused: validator `OUT_OF_RANGE`, engine `SCENARIO_PLAN_VALUE_OUT_OF_RANGE` | 28 bounds in `src/plan-value-contract.json`, then five widened |
| Seed | 0, 1.5 and −3 run | refused by both layers; 1 accepted; an absent seed keeps the fallback | contract key `"integer": true` |
| Prior-year MAGI | the engine runs −5; the validator refuses it | both refuse; null, absent and 0 accepted | engine gate `negativePriorMagiCode()`, code `SCENARIO_NEGATIVE_PRIOR_MAGI` |
| Survivor reduction 75% | the engine clamped it to 50% (20,000 where 10,000 is due) | 10,000 | `strategySpending()` clamp is now 0–75 |

**The witnesses**, every expectation hand-derived in a comment:

| File | Base | Head |
|---|---|---|
| `tests/audit-s5aa-r54-own-field-edits.test.js` and `tests/audit-s5aa-r54-restore-keeps-all.test.js` | items 1–2: 558 of 648 checks fail, all controls pass | 648/648 at `f2ccd64`; later trimmed to the values that stay valid |
| `tests/audit-s5aa-r54-form-ranges-refused.test.js` | item 3: 86 of 188 fail at `2aa2511` | 188/188 |
| `tests/audit-s5aa-r54-widened-ranges-seed-magi.test.js` | item 4: 33 of 53 fail at `a961481` | 60/60 |

## 4. Your companion scripts, re-run

| | base `b82f25f` | head `f704638` |
|---|---|---|
| Your R53 companion (`e3580629…`, no adapter) | 20/20, 140 checks, grid 400/800, hunt H01 failing (exit 1) | **20/20, 140 checks, grid 400/800, hunt 4/4, exit 0** |
| R51F probes (R53 adapter) | 36/36, 175 checks | 36/36, 175/175 verdicts identical |
| R46–R51 (adapter) | 20/20 | 20/20, 176/176 identical |
| R52 boundary (adapter) | 20/20 + U02; U01 refused at import; H01 the disclosed limit | the same, 112/112 identical |

- **R51F's F26** mutation sweep grows from 270 to 325 mutations, as the contract gained entries. It has 0 failures throughout.
- **One field changes in your R53 companion:** N18#8 differs only by the random scenario id inside stored text, and passes at both.

## 5. Predicted against measured

There are three prediction records, each committed before its edits and held to C1–C8:
- `b184411` for items 1–2;
- `ccbba41` for item 3;
- `757afc1` for item 4.

| | predicted | measured |
|---|---|---|
| Expanded capture | unchanged at every head | **equal to r30** at `f2ccd64`, `33a5b59` and `58cb62b` (builder), and at `2aa2511`, `a961481` and `f704638` (Claude). Qualified; output hash `2c342c6c…5b04`, input hash `ed3731e2…39c4`. No new baseline. |
| Control 4.7 | nothing to declare | passes unchanged (in the gate) |
| Monte Carlo (A-11) | no engine-route exposure | none. Through the app, `seed:17`'s 24 runs reach the engine as 24 paths. |
| Stop scans (items 3–4) | no plan outside a new bound | none in the control (36) and expanded (71) corpora, the golden plans, `defaultPlan`, generator seeds 1–5,000, fixtures, the R40 grid (3,000) or your companions' plans |
| App exposure | named per item | met, with the misses below |

**Misses (build report §1–4):**
- M1: the card's route;
- M2: an intermediate register state;
- M3: an end-age reading;
- M4: a generator dependency on the validator source;
- M5: an intermediate repin;
- M6: one witness control.

All were caught before their commits. No hand derivation proved wrong.

**Tests adapted:** every adaptation is listed in the build report with its before and after. The four that change an expectation:
- R53's restore control: retirement typed past the end age is now refused, not lengthened;
- Q50's qualified-share pins: refused, where they used to be clamped and disclosed;
- three validator warnings that became errors;
- R10-01's 200% VPW cap path, now refused.

## 6. The gate

| Commit | Tests | Pass | Fail | Todo |
|---|---|---|---|---|
| `2aa2511` | 4,250 | 4,241 | 0 | 9 |
| `a961481` | 4,073 | 4,064 | 0 | 9 |
| `f704638` | **4,120** | **4,111** | 0 | 9 |

Closeout is 12 accepted, 0 refused, 0 errors at each. Claude explained each change in the total file by file:
- −177 at item 3: item 2's witness went from 611 to 248, item 3 adds 188, and Q50 lost 2;
- +47 at item 4: the new witness adds 60, and item 2's witness lost 13.

## 7. The browser check (task 6.5)

Run in Chrome 152 at each head (`2aa2511`, `a961481`, `f704638`). At `f704638` the served artifact's SHA-256 is `e13e0f74…`, matching
the committed file and the pin in `tests/lib/harness.js`.

- **Checks A to E, identical at every head and to R53:**
  - 75 of 75 Worker results equal the main thread's;
  - 72 equal Node's, and the other three Monte Carlo plans agree within 1.14 × 10⁻¹⁵ relative, with no non-continuous field
    different;
  - 70 plans import, their 70 CSVs and Worker replies are equal, and the same five import refusals stand;
  - fault fallback and recovery are exact;
  - four concurrent Workers agree.
- **Your H01, through the real Worker:** retirement 65 saved and shown after the age edit; the half-year's income is
  8,445.585690332558. The old saved retirement of 70.5 gives +5,000.
- **A refused edit:** retirement typed to 72, past the end age of 71. The status line reads "No projection for this scenario: The
  projection's ending age is before the retirement age…". Plan checks shows one item. The Results page shows the "Plan not projected"
  card and "Calc. error", and no projection figures: the only dollar amounts on the page are fixed amounts from the tax text.
- **Restore:**
  - 24 runs gives "24 simulations" and 24 Worker paths;
  - end age 110 gives rows to 110;
  - `ssFra` and `pensionAge` are carried;
  - a 2.5% fee is kept, and at item 3 it was refused, as decided then.
- **Item 3:** a backup with fee 2.5 and salary −50,000 was refused, naming both values and limits; storage unchanged.
- **Item 4:**
  - fee 5 and withdrawal rate 25 can be typed and saved;
  - a backup with seed 0 and a prior-year MAGI of −5 is refused, naming both; storage unchanged.

## 8. For the owner, recorded (build report §6)

- **D1:** the retirement field's own floor at the current age is kept; a historical retirement age cannot be typed through the form.
- **D3:** the older calculation-error card calls any refusal "an internal reconciliation problem". R54 adds the engine's message
  beside it but does not reword the card.
- **D4:** an end age above 120 is kept with a validator warning.
- **D5:** a field typed and returned to its text counts as edited.
- **D6:** the contract's new `integer` key is used only for the seed.
- **D7:** some engine clamps are now unreachable through `runPlan()`; the code stays.
- **D8:** ranges the form applies only on blur are not rules (return, inflation, salary growth, pension COLA, reserve years).
- **Still open from R53:** the import's shared refusal prefix ("a structural problem that would break the projection").
