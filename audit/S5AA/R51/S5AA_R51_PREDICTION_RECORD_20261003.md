# S5AA R51 — prediction record: the owner's follow-up decisions on R46–R50

*Written by Claude on 2026-10-03 (Arizona, UTC−7). Committed before the R51 engine, validator and app edits (A-01), and held to
`audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md`. Base: `sprint/s5aa-r51` at `5119d03` (R45 with R46–R50 integrated;
its expanded capture equals the registered r29, `tools/baseline-20261003-s5aa-expanded-r29.json`, on all 71 entries:
`prediction/r51_flexibility_default_at_5119d03.txt`, first lines).*

## The round

The owner's decisions of 2026-10-03 on the R46–R50 build reports, as the coordinator handed them to this round:

1. **Spending flexibility defaults to off (AA1-25(c)).** `defaultPlan.retirement.flexibility` 10 → 0 in `src/app-shell.html`, and the
   form reader's fallback `num("v2-flexibility",10)` → 0. R49's floor and warnings stay. The coordinator lifted rule 4 (no
   `defaultPlan` change) for this item only.
2. **One Medicare date (AA1-32 carried through).** R47 stopped HSA contributions at each person's `medicareStartAge()` (an entered
   `profile.medicareStartAge` / `spouseMedicareStartAge`; else 65 when the claim, as `ssClaimStartAge()` reads it, is 65 or earlier
   or no benefit is modelled; else claim − 0.5). Medicare premiums, IRMAA and the Part B deductible (R48's
   `medicareChargePerPerson()`) still start at 65 through `householdSeniorAges()` opening ages. R51: each living person's Medicare
   charge starts at **their** `medicareStartAge()`, and the pre-Medicare cost runs until then for that person, in every reader.
3. **The working-years check counts employment and self-employment streams as pay (AA1-07 refined).** R49's
   `WORKING_YEARS_NOT_FUNDED_BY_PAY`: pay = the salary's (as today) plus the employment and self-employment streams paid in the row's
   working months, net of the payroll and SE tax the engine computes on them. The warning text that says streams are not counted is
   rewritten.
4. **A "This plan offers Roth contributions" checkbox (AA1-13 carried through)** in the workplace account editor for R47's
   `accounts[].planOffersRoth` (boolean contract, default true; absent = true): checked by default, read and written by the account
   editor, with a jsdom test.

### How each rule is built (definitions, before the edit)

- **Decision 2, inside a row.** The engine's rows open on whole ages of the primary after the first; a start of 69.5 falls inside the
  row 69 → 70. R47's HSA stop is already split inside the row at the owner's own age (`hsaBefore65 = max(0, start − ownerAge)` over
  the row). The Medicare charge is split at the same point: for each living person (alive at the row's opening, as
  `householdSeniorAges()` says), on their own clock with opening age `a` and the row's length `d`, the **Medicare span** is `d` when
  `a ≥ start`, else `max(0, min(d, a + d − start))`; the Medicare span is the row's tail. Then:
  - retired household Medicare: `charge × Σ min(retired tail, Medicare span)` (was `charge × #(a ≥ 65) × retired tail`);
  - pre-Medicare cost: `cost × Σ max(0, pre-Medicare tail − Medicare span) / modelled people` (was `cost × #(0 ≤ a < 65) × tail /
    modelled`), the pre-Medicare tail being R45's `healthDuration` (from `healthCoverageEndAge`, default the household date);
  - R43's idle spouse: the spouse's Medicare span inside the idle part `[work, d − retired tail]` (was the whole idle part when the
    spouse's opening age ≥ 65).
  At 65 for the primary this is today's rule exactly (the primary's openings are whole ages, so a span is 0 or the whole row), and
  the arithmetic is arranged so a household whose spans are all 0 or whole gives bit-identical figures (a span of `d` reproduces
  `tail` exactly; `max(0, tail − 0)` is `tail`). **What moves:** a person whose Medicare start is after 65 (a claim after 65 with a
  benefit modelled, or an override), and a spouse whose opening ages are not whole ages relative to 65 (e.g. a spouse of 64.5 at the
  plan's start reaches 65 inside the row: today the row is pre-Medicare for them; R51 splits it). The second is the literal reading
  of "start at their `medicareStartAge()`" with the default 65 — recorded for the owner (decision D2 below).
  A new helper `medicareSpanInRow(p, owner, openingAge, duration)` (exported; in the app's `workerFunctions`) is read by the three
  charge sites and the two IRMAA disclosures.
- **Decision 2, the disclosures.** `IRMAA_PRE_PLAN_MAGI_ASSUMED`: in plan year 0 or 1, someone alive at the opening with a positive
  Medicare span in the row (was: 65 or older at the opening), the household date inside the row as today. Its validator mirror
  `IRMAA_PRIOR_INCOME_BLANK` mirrors `medicareStartAge()` (the override; the benefit test — `ssAdvanced` with an AIME through the
  PIA's first segment, else the monthly benefit floored to a dime — and the claim) and tests the same span. 
  `IRMAA_PARTIAL_FIRST_YEAR_COMPLETED` ("someone 65 or over by plan year 2", found by the C6 search; the owner's list did not name
  it): someone's Medicare span positive in plan year 2's row (opening `floor(age) + 2`), which is today's test exactly at 65 for the
  primary.
- **Decision 3.** In the working-years check: the streams paid in the working part of the row (`otherIncomeFor()` over
  `[age, age + d − retired tail]`, the engine's own function; the row's own `other` when the whole row is working) — employment
  (`wageSelf`, `wageSpouse`) and self-employment (`seSelf`, `seSpouse`) — less their share of `taxes.payroll − baseline.payroll` (the
  full return's FICA, Additional Medicare and SE tax less the wage-only return's), prorated by the working part of the streams' pay.
  The streams' income tax is not subtracted: the owner's decision names their payroll/SE tax (recorded as D3 below). Pay can only
  rise, so the warning can only disappear, move later or shrink.
- **Decision 4.** In `renderAccounts()`, for an account the engine reads the flag on (`accountType(type).limitGroup === "workplace"`
  and not Roth: the traditional 401(k)), a checkbox field "This plan offers Roth contributions (required for catch-up contributions
  above the Roth catch-up wage threshold)" beside "Prior-year FICA wages from this employer": checked unless `planOffersRoth ===
  false`; on change it stores the box's state (`true` / `false`), as the editor's other per-account checkboxes do. No engine,
  contract, static-id or `defaultPlan` change.

## The checklist

**C6, every reader.**

| rule changed | reader (at `5119d03`) | R51 | condition / check |
|---|---|---|---|
| `defaultPlan.retirement.flexibility` | `strategySpending()` — the engine's only reader of `retirement.flexibility` (row spending and the reserve's sizing) | reads 0 for inherited plans | the expanded and control corpora re-measured on a scratch copy with only decision 1 (below); Monte Carlo exposure by tap |
| | corpus builders inheriting `defaultPlan` (`tests/lib/golden-scenario-defs.js`, the targeted plans in `tools/capture-baseline.js`, `tests/lib/corpus-expansion.js`) | inputs move | `pin-inputs` on the scratch copy: 5 control and 40 expanded fingerprints move; 11 targeted unpinned |
| | `tests/lib/scenario-generator.js` | draws its own flexibility | generated scenarios byte-identical across 10/0 (seeds 1–120, 500–579, 1–150) |
| | the sensitive-band rule (`tests/lib/corpus-expansion.js` `MC_BAND_STEP`, `tests/monte-carlo-sensitive-band.test.js`) | re-applied | `prediction/r51_sensitive_band_at_5119d03.txt` |
| | app: `normalizedPlan()`'s backfill, the form fallback, the "Use spending flexibility" insight (`flexibility===0 && success < 95`) | backfill and fallback 0; the insight can now show on a default-derived plan | jsdom witness for the fallback; the insight is text, measured by the rendered-results tests in the gate |
| | validator `FLEXIBILITY_WITH_GUARDRAILS` | default strategy is `incomeFirst`: no new warning on the default plan | — |
| Medicare start for the charge | health block, retired household Medicare and pre-Medicare (`simulatePlanRows()`, after `other`) | per person, the Medicare span | `medicare` condition in `r51_corpus_scan.js` (today's figure re-derived from the tapped state and asserted equal to the engine's) |
| | R43's idle-spouse Medicare (same block) | the spouse's span in the idle part | same condition |
| | `IRMAA_PRE_PLAN_MAGI_ASSUMED` | the span in plan years 0–1 | `irmaa` condition (today's mirror asserted equal to the engine's issue list) |
| | `IRMAA_PARTIAL_FIRST_YEAR_COMPLETED` (age test) | the span in plan year 2 | `partial` condition |
| | validator `IRMAA_PRIOR_INCOME_BLANK` | mirrors the span | `r51_validator_scan.js`: today's warning checked against the engine condition; R51 predicted as the engine's R51 condition |
| | HSA planned and one-time routes | already read `medicareStartAge()` (R47) | unchanged |
| | app texts: the two Medicare start notes ("HSA contributions stop here"), the pre-Medicare cost field (no note), the Rules page "Medicare and IRMAA" section, the HSA rules paragraph | say the start sets the Medicare charge and the end of the pre-Medicare cost | text witness |
| | engine comments: `medicareStartAge()` ("Medicare premiums keep their own rule"), the health block's "each living person 65 or older is charged Medicare" | rewritten | — |
| | **considered and left unchanged:** the optimizer's IRMAA guard (`age >= 63`), its HSA weights at 65 (IRC 223(f)(4)(C)'s age 65, a statutory age, not Medicare), the senior deduction and 63(f) ages (statutory 65), the app's IRMAA-threshold insight | heuristics or statutory ages | named for the owner (D4) |
| working-years pay | the check after `baseline` in `simulatePlanRows()` (`noteWorkingYearsShortfall()` is called only there) | adds the streams | `working` condition (today's mirror asserted equal to the engine's issue: age and shortfall) |
| | the message (`noteWorkingYearsShortfall()`) | rewritten | text witness; tests pinning it: none (`audit-s5aa-r49-spending-debt-disclosure` reads code, age and shortfall only) |
| `planOffersRoth` form | `renderAccounts()` | a checkbox | jsdom witnesses |

**Pins searched (the R45 lesson):**
- *Validator message* `IRMAA_PRIOR_INCOME_BLANK` (text changes: "someone is 65 or older and retired" → the Medicare start): pinned only
  by `/first surcharge tier/` (`audit-s5aa-r48-medicare-survivors-arizona`), kept. `scenario-generator` asserts the code occurs
  (seed 120): `r51_validator_scan.js` shows seed 120 still warns under R51 (and seeds 533, 539, 578 in the 500–579 draw).
- *Form text*: `audit-s5aa-r43-contributions` pins "Contributions stop when each person’s Medicare starts: at 65 for someone who claims
  Social Security by 65" (kept: R51 appends to the HSA paragraph); `audit-s5aa-r40-app-states-r40-charges` pins "Each person on
  Medicare also pays the Part D base beneficiary premium, $38.99 per month" (kept); `audit-s5aa-r47-federal-tax-and-accounts` pins the
  two Medicare-start ids in `staticIds` and the absence of "Contributions stop at each person’s 65th birthday" (both hold).
- *Input ids, `staticIds`*: no new static input (the checkbox is rendered per account, like the editor's other checkboxes); no change.
- *`workerFunctions`*: one new engine function, `medicareSpanInRow`, joins the list (SA45-A); `audit-q15-worker-dependencies` and
  `worker-parity` hold it.
- *`defaultPlan`*: tests reading it and setting `flexibility` explicitly (`audit-zero-fields`, `audit-q72`, `audit-q80`,
  `audit-s5r01-snapshot-acceptance`, `audit-sa03` (10), `audit-sa04`, `audit-decision-clock-lookahead`, `audit-s5aa-flexibility-cut`,
  `audit-s5aa-stage-carried-base`, R35 files, R46, R49) do not move by decision 1; tests inheriting it are found by the exposure hook's
  `flex10` condition (below). `tests/fixtures/golden-scenarios.fixtures.json` and `tools/control-candidate-prediction.json` are
  regenerated by the coordinator's named steps.

**C1.** Every condition reads the engine's state through read-only taps (`prediction/r51_mirror.js`, `tests/lib/engine-variant.js`),
asserted output-neutral per plan; today's figure is re-derived from the tapped state and asserted equal to the engine's (health,
the IRMAA disclosure, the working issue's age and shortfall) on every corpus plan, so the R51 figure is computed on the state the
engine used. The Medicare start is the engine's `medicareStartAge()`. After the build: the scan's R51 health equals the engine's on
every corpus plan and every exposed test plan the witness file runs (checked by re-running the witnesses), and the validator's R51
warning equals the engine's R51 disclosure condition on the generated and corpus plans (`r51_validator_scan.js` re-run).

**C2.** Not a limit repair.

**C3.** The medicare condition requires health costs on and a row where the figure differs; the working condition requires a stream
paid in a working row (`otherIncomeFor()` > 0 over the working part).

**C4.** Decision 1 moves two Monte Carlo plans' inputs: `golden:monte-carlo-fixed-seed` and `expansion:monte-carlo-sensitive-band`.
Exposure (`prediction/r51_mc_flex_exposure_at_5119d03.txt`): the flexibility branch is taken on **every one of the 500 paths** of
each. `seed:9` and `seed:17` carry their own flexibility (22 and 2): not exposed to decision 1. No Monte Carlo corpus plan has a
medicare or working condition (the scan's rows hold no Monte Carlo entry). Predicted: **both named, every path exposed; the
published result may move.** The sensitive band is also re-picked (below), which moves its spending.

**C5.** Decision 1's movement is measured, not traced: the pre-repair engine run on the very inputs decision 1 produces (a scratch
copy of `5119d03` with only the `defaultPlan` edit). Decision 2's one corpus plan is a hand trace (below). Each witness's figure is
in its derivation.

**C7.** Each witness has its control beside it (claims at 65, no benefit, an idle spouse already past the start, a non-pay stream, no
stream; for the form, a Roth IRA and a taxable account carry no checkbox); every control passes on `5119d03`, every repair case fails
there with the pre-repair figure (`witness_runs/r51_tests_at_5119d03.txt`).

**C8, how each comparison reads the moving fields.**
- **The expanded capture** compares every result field entry by entry by hash (rows, issues with their text and state, the Monte
  Carlo aggregates); a bit-level float difference counts. Input fingerprints are separate (`meta.inputHashes`).
- **Control 4.7** (`tools/control-corpus.json`, `tools/differential-harness.js` `compareSnapshots` / `matchPrediction`) compares the
  stored control capture with a live capture field by field; it records issues and `limitWarnings` by their length, so a message
  change is invisible there. The live capture is built from today's inputs, so decision 1's input change shows as output differences
  in the plans it moves.
- **Golden fixture** (`tests/fixtures/golden-scenarios.fixtures.json`): built from `defaultPlan` through the golden definitions; a
  golden plan whose output moves fails `golden-scenarios` until regenerated.
- **Reviewed inputs** (`tools/corpus-spec.json`, `tools/corpus-spec-expanded.json`): fingerprints of the built plans; any input
  change fails `corpus-invariant` / `corpus-composition` until re-pinned.

## Predictions

### 1. Decision 1 — flexibility defaults to off

Measured on the scratch copy (`prediction/r51_flexibility_default_at_5119d03.txt`; captures `r51_expanded_capture_at_5119d03.json`
and `..._flex0.json`):

- **Inputs:** 51 of 71 expanded inputs move (every golden, targeted and expansion plan; the 20 generated seeds draw their own).
  Reviewed fingerprints: `tools/corpus-spec.json` — 5 move (the five golden plans; the 11 targeted plans are unpinned by design);
  `tools/corpus-spec-expanded.json` — 40 move (the five golden plans and the 35 expansion members; 11 targeted unpinned). Why: each
  of these plans is built from a copy of `defaultPlan` and does not set `retirement.flexibility`, so it now carries 0. The
  sensitive band moves further (its spending, below).
- **Outputs (8):**

| entry | final total | success | lifetime taxes |
|---|---|---|---|
| `golden:monte-carlo-fixed-seed` (MC, C4) | 179,657,969 → 176,871,038 | 96.8 → 95.8 | 2,512,710 → 2,585,932 |
| `targeted:historical-1929` | 2,880,062 → 2,578,882 | 100 → 100 | 22,527 → 23,821 |
| `targeted:historical-1966` | 5,165,162 → 4,751,113 | 100 → 100 | 115,184 → 105,230 |
| `targeted:historical-2000` | 3,823,352 → 3,553,121 | 100 → 100 | 65,407 → 69,439 |
| `expansion:other-asset-draw-historical` | 0 → 0 (rows move) | 0 → 0 | 0 → 0 |
| `expansion:monte-carlo-sensitive-band` (MC, C4) | see the re-pick below | | |
| `expansion:s5aa-r14-rmd-conversion-under-loss` | 262,733 → 251,776 | 100 → 100 | 23,771 → 23,764 |
| `expansion:s5aa-r14-rmd-prototype-ids` | 293,286 → 274,753 | 100 → 100 | 3,649 → 3,632 |

  Direction: spending after a down year is no longer cut, so these plans spend more and end lower (the historical-1966 lifetime
  tax falls with the smaller balances' income). The other 43 moved inputs give identical outputs (no down year reaches a cut, or
  their strategy ignores it).
- **The sensitive band is re-picked** by its declared rule (the golden Monte Carlo plan, spending on a 5% grid, the first step with
  success in [50, 85]): at flexibility 0 step 11 is 85.4% and **step 12 is 85.0%**, the first in band (at 10: step 13 85.2%, step 14
  84.2%). `MC_BAND_STEP` 14 → 12 and the family version 8 → 9 in `tests/lib/corpus-expansion.js`, `DECLARED_STEP` 14 → 12 in
  `tests/monte-carlo-sensitive-band.test.js` (adapted by intent; the rule and the band unchanged). Predicted entry: spending
  $96,000, success 85.0%, final total 119,653,546.22, lifetime taxes 3,924,772.11; 99.8% / 51.6% at half and 1.5× the plan's
  volatility (as `r51_sensitive_band_step.js` scales it; the test's own scaling is read in the build). 85.0% sits on the band's
  upper edge; recorded for the owner (D1).
- **Control 4.7:** the 4 control plans among the movers — `golden:monte-carlo-fixed-seed`, `targeted:historical-1929`, `-1966`,
  `-2000` — differ from the stored control capture; re-declared with the R48 script's logic.
- **Golden fixture:** `monte-carlo-fixed-seed` moves (above); the other golden fixtures' outputs do not (their inputs move only in the
  flexibility field). Regenerated after reading its diff.

### 2. Decision 2 — one Medicare date

`prediction/r51_corpus_scan.js`, run on `5119d03` and on the decision-1 scratch copy (identical results;
`r51_corpus_scan_at_5119d03.txt`, `..._flex0.txt`): health costs are on in 6 control and 7 expanded plans; **one plan is flagged:
`seed:16`** (control and expanded). No plan is flagged for either IRMAA disclosure.

**`seed:16`** (simple, MFJ; self 54, spouse 52, both retired from 57; self $1,226.45 a month claimed at 69 → Medicare 68.5; spouse
$1,200.75 claimed at 66 → Medicare 65.5; pre-Medicare cost $6,206.02 at 7.39% healthcare inflation; fixed-nominal spending; surplus
policy `spend` for every source; no RMDs before 75). The rows opening at 65 to 68 change: 65: $13,777 → $13,596; 66: $14,795 →
$14,601; 67: $16,098 → $15,784; 68: $17,287 → $17,175 — health $801 lower in all (the self's later start replaces Medicare with the
lower pre-Medicare share; the spouse's 65.5 adds half a year of pre-Medicare cost at 65 → 66 of the spouse's clock).
*Hand trace of the output (C5):* in those rows the household withdraws nothing (outside income $174,640 against spending of
$171,454 at the row closing 66) and spends every dollar of surplus (`spend`), so the lower health cost raises the spent surplus by
the same amount: the row's `spending` (requested plus the spent surplus) is unchanged, withdrawals stay 0, no tax depends on the
health cost, and no balance moves. **Predicted: `seed:16`'s captured output unchanged** (a float difference in the last bit of
`spending` is possible, since the sum is formed differently; any larger movement is a miss of this trace). Control 4.7 likewise.

### 3. Decision 3 — streams as pay

3 control and 3 expanded plans carry an employment or self-employment stream; **no plan's working-years warning changes** (none of
the warned plans is paid by a stream in a working row, or the change does not cross zero at its first warned row). No corpus movement.

### 4. Decision 4 — the checkbox

No engine reader changes; no corpus movement.

### 5. The validator

`prediction/r51_validator_scan.js` (`..._at_5119d03.txt`): today the validator agrees with the engine condition on every plan
(generated 1–120: seed 120 warns; 500–579: seeds 533, 539, 578; corpus: none). Under R51 **none of these moves**.

### 6. The tests

`prediction/r51_test_exposure_hook.js`, loaded (`NODE_OPTIONS=--require`) into every test file of `test:list` on a clean copy of
`5119d03` (`r51_run_exposure.js`: 441 files, 37 batches of 12, concurrency 3; log `r51_test_exposure_log_at_5119d03.txt`; 440 exposed
calls in `r51_test_exposure_at_5119d03.jsonl`, summary `r51_test_exposure_summary_at_5119d03.txt`). It wraps `runPlan` and
`simulatePlan` of `src/engine.js` (a direct `simulatePlan()` is checked as `runPlan()` of the same plan with one run, path 0's
seeding; tests that build the app or load the engine through vm are not seen). With the hook loaded, 4 batches had failures caused
by the hook itself — tests counting `toJSON` calls (`audit-bc02-clone-once`, `audit-q80-flag-defaults-serialize-once`, the
supported-hook counts in `audit-s5r01-*`) and the capture-process module list (`capture-boundary`); they pass without it.

- **medicare (17 files):** `seed:16` through every corpus and capture tool (`capture-baseline`, `corpus-invariant`,
  `corpus-composition`, `control-corpus`, `capture-boundary`, `build-routes`, `audit-ra04-baseline-integrity`, `worker-parity`,
  `household-ledger`, `networth-reconciliation`, `reconciliation-invariant`, `boolean-flag-contract`), and the generated sweeps of
  `near-miss-survivor-sweep` (46 plans, simple, historical and Monte Carlo) and `corpus-configured-paths` (21). These tests hold
  invariants, parity, determinism or the corpus pins; **expected to pass** (seed:16's captured output is predicted unchanged).
- **irmaa / partial:** no test plan.
- **working (8 files):** the warning disappears or shrinks for plans in `audit-s5aa-r26`, `-r28`, `-r29`, `-r30`, `-r31`, `-r32`,
  `-r33-deferrals-excluded-lawfully` and `-r47`; none asserts a WARNING (they filter ERRORs or read figures). **Expected to pass.**
- **flex10 (50 files):** plans carrying flexibility 10 whose rows move at 0. 43 files inherit it from `defaultPlan` (no
  `flexibility` in the file); 7 set it themselves (`audit-cl-findings`, `audit-s5aa-flexibility-cut`, `-r35-portfolio-return-signals`,
  `-r49-spending-debt-disclosure`, `audit-sa03-return-signal`, `monte-carlo-sensitive-band`, `public-route-q101-q109`) and do not
  move where they set it. **Expected to fail and be regenerated or adapted:** `golden-scenarios` (the `monte-carlo-fixed-seed`
  fixture), `corpus-invariant` and `corpus-composition` (the reviewed fingerprints and the re-picked band), `control-corpus` (4.7's
  declarations), `monte-carlo-sensitive-band` (the re-pick). **Expected to pass:** the rest — they compare runs of the same tree
  (worker parity, determinism, ledgers, flag defaults) or read shapes (`schema-catalogue`, the result-contract files).
- **Text, form and wiring pins** (searched, above): `audit-s5aa-r43-contributions`, `-r40-app-states-r40-charges`, `-r47-federal-tax-
  and-accounts`, `-r48-medicare-survivors-arizona` and `scenario-generator` are expected to pass. The jsdom files are not seen by the
  hook; `audit-q15-worker-dependencies` and `worker-parity` hold the Worker list.
- Every other test is expected to pass. A failure not named here is a miss.

### 7. The witnesses

`tests/audit-s5aa-r51-owner-follow-ups.test.js` (17 cases; SHA-256 `532e14a1…ac10d` at the base run) and
`tests/audit-s5aa-r51-app-inputs.test.js` (4 jsdom cases; `3756f507…103cc`). On `5119d03` (`witness_runs/r51_tests_at_5119d03.txt`):
17 fail with the pre-repair figure, the 4 controls pass.

| case | expected (hand-derived) | at `5119d03` |
|---|---|---|
| default plan's flexibility | 0 | 10 |
| claim at 70, single: rows to 67, 68, 69, 70, 71 | 12,000 ×3, 7,592.84, 3,185.68 | 3,185.68 ×5 |
| override 67 | 12,000, 3,185.68, 3,185.68 | 3,185.68 ×3 |
| couple, spouse claims at 70: rows to 67, 70, 71 | 9,185.68, 7,778.52, 6,371.36 | 6,371.36 ×3 |
| idle spouse claiming at 70: rows to 61–64 | 0, 0, 0, 1,592.84 | 3,185.68 ×4 |
| spouse of 64.5: rows to 61, 62 | 10,592.84, 9,185.68 | 12,000, 9,185.68 |
| IRMAA first-years, 66 claiming at 70 | neither the engine issue nor the validator warning | both |
| partial first year, 66.5 claiming at 70 | no issue | issue |
| app texts (two notes, the pre-Medicare note, the Rules page) | present | absent |
| $30,000 salary + $40,000 job | no warning | warns |
| + $12,000 self-employment | no warning | warns |
| + $10,000 self-employment | short 1,475.455 | short 10,062.50 |
| the message | names employment and self-employment income; no "outside income" | old text |
| blank flexibility field (jsdom) | 0 | 10 |
| 401(k) checkbox present and checked; unchecking stores false, checking true; stored false shows unchecked (jsdom) | as stated | no checkbox |
| controls: claims at 65 / no benefit; idle spouse past the start; IRMAA at 65; 68 claiming at 70 (both apply); no stream / rental (short 10,062.50) | as before | pass |

A derivation that proves wrong in the build is corrected and recorded as a miss, never quietly re-expected.

### 8. The gate and the browser

The gate is the coordinator's (one at a time); this round runs targeted test files only. The browser check (task 6.5) should exercise
the 401(k) checkbox and a blank flexibility field.

## Decisions recorded for the owner

- **D1.** The re-picked sensitive band sits at exactly 85.0%, the band's edge.
- **D2.** The literal reading of decision 2 also moves the default 65 for a spouse whose ages are fractional relative to the primary's
  (Medicare from 65 exactly, inside the row, instead of from the first row opening at 65 or later).
- **D3.** The streams' income tax is not subtracted from their pay (the decision names payroll and SE tax); the salary's pay is net of
  income tax (R49's `baseline`).
- **D4.** Left on 65 or 63: the optimizer's IRMAA guard (from 63) and its HSA weights (from 65), heuristics; statutory 65s unchanged.
