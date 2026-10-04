# S5AA R49 — prediction record: spending, debt, defaults and disclosure

*Written by Claude on 2026-10-03 (Arizona, UTC−7). Committed before the R49 engine, validator, contract and app edits (A-01), and
held to `audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md`. Base: `sprint/s5aa-r49` at `ba9946d` (the R45 round; source
`s5aa-r45-source` = `9c7790e`).*

## The round

The owner's AA1 decisions of 2026-10-03 (`audit/S5AA/AA1/S5AA_AA1_CLAUDE_VERIFICATION_20261003.md`, "The owner's decisions",
"Spending, debt, defaults, disclosure"), as the coordinator handed them to this round:

1. **AA1-33, the default return: relabel only.** 10% stays. The "Standard · 10%" preset and the return field say it is historical US
   stock returns, nominal, before fees, an arithmetic mean, not a forecast; the fee field gets help text. No figure moves.
2. **AA1-07, a working-years check (warning only).** A new engine issue, `WORKING_YEARS_NOT_FUNDED_BY_PAY` (WARNING, once per run,
   naming the first age), when in a working row pay is below zero: the working share of (wages − the wage-only payroll and income
   tax − contributions), less the debt service and PMI paid in the working months. Shown as an app card; the two validator warnings
   `CONTRIBUTIONS_ABOVE_EARNED_INCOME` and `DEBT_PAYMENT_OUTSIDE_SPENDING` reach the screen through item 7.
   - *Definitions:* "working share" is pay-first's own (R35/R45): the wages earned before the pay-first date over the row's wages,
     or, with no wages, the part of the row before the household date. The wage-only tax is the engine's `baseline` (the same
     estimate pay-first uses). Debt service in the working months is each debt's payments less those on or after the household
     date (`paid − paidRetired` in `projectDebts()`), plus PMI owed in those months. Pay is salary: an employment or
     self-employment *stream* is outside income in this model (retained or invested by the surplus setting), so it is not counted
     as pay here, and the message says so.
3. **AA1-37, long-term-care onset.** `advanced.ltcOnsetAge` (optional, the primary's age; contract 0–120; validator
   `ADVANCED_OPTIONAL_KEYS`; form input `v2-ltc-onset`, read, written and in `staticIds`). Entered: the deterministic onset is that
   age, **as entered, not rounded**, still weighted by the probability; Monte Carlo draws the onset **uniformly from 10 years before
   to 10 years after it** (the default rule's 20-year spread, centred on the entered age), not rounded, **never before the plan's
   starting age**. Absent: today's rule (deterministic `max(65, round(retireAge + 10))`; Monte Carlo
   `max(65, round(retireAge + 5 + 20u))`), now disclosed in the app. The life-age inputs say the projection ends at the last modeled
   death.
4. **AA1-25, spending flexibility.** (a) The flexibility cut never takes spending below the strategy's entered floor: guardrails,
   Guyton-Klinger and floor-and-ceiling — the spending floor (`min(floor, ceiling)` at the price level, as the strategy's clamp
   reads it); the remaining-life strategy — its minimum withdrawal (`rmdFloor` at the price level); VPW — its minimum rate of the
   balance. The cut stops at the floor; spending already below it (a stage, the survivor reduction) is neither cut further nor
   raised: `spend = max(spend × (1 − f), min(spend, floor))`. Strategies with no floor keep the full cut. (b) Validator WARNINGs:
   `SPENDING_STAGES_OVERLAP` (two percent stages whose spans `[start, end + 1)` intersect: they multiply) and
   `FLEXIBILITY_WITH_GUARDRAILS` (guardrails or Guyton-Klinger with flexibility > 0; path `retirement.flexibility`), and help text
   on the flexibility field. (c) **"Defaults to off" is NOT built**: it needs `defaultPlan.retirement.flexibility` 10 → 0, which the
   rules reserve to the owner. It is measured below and reported as pending.
5. **AA1-34 and AA1-44, PMI and forced payoff.** (a) `debts[].pmiEndAge` (optional; contract list entry 0–120; form input in the
   debt editor's mortgage details): PMI stops at that age, on the primary's clock (the clock every debt age — payoff, rate reset —
   is read on; the debt's owner control is inert, AA1-09). Absent, for a mortgage whose program is `"conventional"` with
   `loanTermYears` and `remainingTermYears` entered (0 ≤ remaining ≤ term, term > 0): the HPA midpoint — amortization began
   `term − remaining` years before the plan's start, so its midpoint is `age + remaining − term/2`; 12 USC 4902(c) forbids PMI
   "beyond the first day of the month immediately following the date that is the midpoint of the amortization period", so PMI is
   owed through the engine month containing the midpoint and stops at the start of the next:
   `stop = age + (floor((remaining − term/2) × 12) + 1) / 12`. Any other program (FHA, VA, USDA, jumbo, interest-only, or none
   entered), or missing terms: today's rule (while a balance is owed). `loanTermYears` and `remainingTermYears` join the contract
   (numbers, at least 0), since the engine now reads them. A new exported helper `pmiStopAge(debt, startAge)` (in the Worker list).
   (b) The validator's `DEBT_PAYOFF_RESIDUAL` WARNING when the scheduled payments leave $0.50 or more at a payoff age at or before
   the plan's end, and an exported `debtPayoffResidual(debt, startAge)` (the engine's monthly loop: entered payment plus extra
   principal, a card's revolving minimum as a floor, an adjustable rate recast at its reset — which clears the balance), which the
   debt editor uses to show "Estimated lump sum due at the payoff age" beside the payoff age.
6. **Relabels and notes:** Social Security inputs say "today's dollars, from your SSA statement" and note the statement assumes work
   to the claim age; the withdrawal-order control becomes "Rule-based withdrawal order" and the goal "Tax-sensitive ordering goal
   (heuristic)"; the dividend control says the off branch imputes a 1.5% qualified yield and points to the on branch at 0%;
   insurance in net worth is labelled an estate measure, with the validator warning `INSURANCE_AFTER_INSURED_DEATH` (net worth on,
   insurance > 0, the primary's lifespan at or before the starting age); a results card with the partial first/last-year
   full-year tax convention, the 59½ crossing-year convention, all gains long-term, the RMD excise not included (also on the
   lifetime-tax figure), and the Monte Carlo debt detail.
7. **Hidden warnings shown, and the validator while editing.** `planWarningTitles` gains `UNSUPPORTED_ROTH_ORDERING`,
   `SURVIVOR_FILING_STATUS_MODELLED`, `SPOUSAL_ROLLOVER_ASSUMED`, `WORKING_YEARS_NOT_FUNDED_BY_PAY` and the other engine disclosures
   listed in the build report (not `IRMAA_PRE_PLAN_MAGI_ASSUMED` or `IRMAA_PARTIAL_FIRST_YEAR_COMPLETED`: Medicare/IRMAA is round
   R48's). `validateScenario()` runs on the active plan at each recalculation (after `readStatic()` in `calculate()`) and at load,
   its WARNINGs in a compact "Plan checks" list in the header (`v2-plan-checks`), hidden when there are none.

Not touched (other rounds' areas): the Monte Carlo engine and success label, the reserve's rule, federal tax, Medicare/IRMAA,
survivors' IRAs, community property, Arizona, the Roth basis ledger, earlier-this-year income, `defaultPlan`.

## The checklist

**C6, the readers.** `src/engine.js` was searched for every reader of each rule the repair changes.

| rule (engine.js at `ba9946d`) | readers | R49 | scan condition |
|---|---|---|---|
| the flexibility step in `strategySpending()` :3579 | the row's spending (`annualSpend`, :4230); the cash reserve's sizing (`rowReserveSpend`, :3929); direct unit-test callers | the cut stops at the floor | flex (both engine readers tapped; direct callers replayed) |
| `ltcStart` (:3893) | `ltcDuration` / `ltc` (:4230) only | entered onset; Monte Carlo centred draw | ltc |
| PMI in `projectDebts()` (:2447 housing charge, :2521 R27 owed-months block) | `simulatePlanRows()` `debtFlow` (:4230) → `retirementPayments` (requested spending), `totalPayments` / `totalHousing` (row `debtPaymentsTotal`, `debtHousing`); direct callers in tests | stop at `pmiEndAge`, or the HPA midpoint (simulation only: the default needs the start age, set per debt as a non-enumerable `_pmiStopAge` when the simulation starts; a direct caller gets the entered age only) | pmi |
| `projectDebts()` return (new field `workingService`) | the working-years check only | additive | — |
| `result.issues` (new `WORKING_YEARS_NOT_FUNDED_BY_PAY`) | the capture (whole result), control 4.7 (whole result), the app's cards and its issue log (debug export) | one issue per run | working |
| plan-value contract (new: `advanced.ltcOnsetAge`, debts `pmiEndAge`, `loanTermYears`, `remainingTermYears`) | the engine's input gate (`planValueContractViolation`) and `validatePlanValueContract()` | refused as text / out of range | inputs |

The validator's new warnings are read by `validateScenario()`'s callers: the app's import review (it counts WARNINGs into the status
text "N values looked unusual") and the new plan-checks list. The form changes touch labels, ids, `staticIds`, `readStatic()` /
`writeStatic()` and the Worker list (`pmiStopAge`, `noteWorkingYearsShortfall`). `defaultPlan` is unchanged.

**C1.** Every engine condition reads the engine's own state through read-only taps in an in-memory variant of the base tree's
`src/engine.js` (`tests/lib/engine-variant.js`): `prediction/r49_corpus_scan.js` asserts, for every corpus plan, that the variant's
rows and success rate equal the real engine's. The flex tap computes the floor the way the repair will, inside
`strategySpending()`; the working tap reads `wages`, `payAfterRetirement`, `contributions`, `baseline.total`, `duration`,
`costRetiredDuration` and each debt's `paid − paidRetired`. After the build, the record checks that the issue fires on exactly the
plans the scan named.

**C2.** Not a limit repair.

**C3.** PMI: the condition requires PMI charged (pmi > 0, housing costs on, a balance). Working: debt service is what the loop paid;
contributions are what the row deposited. Flex: the condition fires only in a call where the cut is actually applied.

**C4.** Monte Carlo plans are tapped on every path with the engine's own seeding (path index = the count of `simulatePlanRows()`
calls). One corpus plan is exposed: `seed:17` (Monte Carlo, the remaining-life strategy with a $13,547 minimum, flexibility 2%):
**named, with exposed paths 23 of 24; the published result may move.** The working-years issue is reported from path 0 (only
path 0's issues reach the result); its quantities do not depend on returns.

**C5.** `seed:5`'s direction and size are computed from the pre-repair engine's own state at the flagged calls (below). The nine
working-years plans move only by the new issue (no figure: the check is warning-only).

**C7.** Every witness's control is in the test file beside it and passes on `ba9946d`; every repair case fails there with the
pre-repair figure (`witness_runs/r49_tests_at_ba9946d.txt`).

**C8, how each comparison reads the moving fields.**
- **The expanded capture** (`tools/capture-baseline.js`) stores each entry's whole `runPlan()` result, `issues` included
  (`captureEntry()`, `stripExcluded()` with `EXCLUDED = []`), and compares entries by the hash of that result. So the nine
  working-years entries move by their `issues` array alone, with every row unchanged; `seed:5` moves in rows; `seed:17` moves only
  if a path's change reaches the published medians or success rate.
- **Control 4.7** (`tools/differential-harness.js`) walks every field of each control scenario's full result with a closed set of
  difference kinds, `issues` included. The control composition holds all nine working-years plans and `seed:5` and `seed:17`, so
  4.7 shows differences for those plans: an `issues` LENGTH/EXTRA difference for each of the nine, row VALUE differences for
  `seed:5`, and for `seed:17` whatever reaches its published result. Those differences must be declared in
  `tools/control-candidate-prediction.json` before the gate; this round does not edit that file (the coordinator integrates and
  declares), and the build report lists them as measured.
- **Golden fixtures** (`tests/lib/golden-scenario-defs.js summarize()`) hold row count, failed, success, lifetime taxes and
  contributions, and the first, middle and last rows' fields — not `issues`. No golden plan is flex- or PMI-exposed, so no golden
  fixture moves.
- **Tests:** below.

## Predictions

### 1. The corpus

`prediction/r49_corpus_scan.js` on `ba9946d` (`prediction/r49_corpus_scan_at_ba9946d.txt`). The control composition (36 plans) and
the expanded composition (71; the 36 plus 35 expansion plans) flag the same plans; no expansion-only plan is flagged.

- **flex (2):**
  - **`seed:5`** (historical, Guyton-Klinger, floor $51,649, flexibility 30%; single, 56, retiring at 76, end 86). Flagged in the
    rows opening at 84 and 85: the strategy gives $231,963 (nominal, first call), the 30% cut gives $162,374, below the floor at
    that price level ($211,445). **Direction: spending up** in those two rows (to the floor), so withdrawals and taxes up and the
    final total down. **Size, first order:** spending restored $101,356 over the two rows (from the scan); the final total falls by
    about that plus the tax on the extra draws and the lost growth for one or two years — roughly $100,000 to $150,000; lifetime
    taxes rise. A plan already failing in those rows (a shortfall) would show a larger shortfall instead of a lower total; measured
    after the build.
  - **`seed:17`** (Monte Carlo): named, exposed paths 23 of 24; the published result may move.
- **ltc (0):** no corpus plan carries `ltcOnsetAge` (a new input).
- **pmi (0):** no corpus plan charges PMI (every corpus debt has `pmiMonthly` 0 or absent), so the new stop rule moves nothing.
- **working (9):** each result gains one `WORKING_YEARS_NOT_FUNDED_BY_PAY` issue, nothing else:
  `seed:2` (first age 58: contributions $71,030 with no wages), `seed:3` (58), `seed:4` (67), `seed:10` (48), `seed:12` (38),
  `seed:14` (45: $4,400 contributions and $17,025 debt service with no wages), `seed:15` (35), `seed:20` (59),
  `targeted:arm-flag-on` (60: $17,187 of mortgage payments in the working months, no wages). Several generated seeds carry
  contributions far above their salary (the generator draws them independently; Q43's note on the generator) — the check reports
  them as the owner decided.
- **Every other corpus plan is unchanged.** `expansion:s5aa-gap-working-household` (wages $176,000 against its debts) is not flagged.

### 2. `defaultPlan` flexibility 10 → 0 (AA1-25 (c), PENDING FOR THE OWNER — not built)

`prediction/r49_flexibility_default_experiment.js` compared the expanded capture at `ba9946d` with a scratch copy of `ba9946d` whose
`defaultPlan` carried `flexibility:0` and nothing else (`prediction/r49_flexibility_default_experiment_at_ba9946d.txt`): **51 of 71
corpus inputs move** (every golden, targeted and expansion plan inherits the default; the 20 generated seeds draw their own), and
**8 outputs move** — `golden:monte-carlo-fixed-seed` (final total $304,502,979 → $303,070,379), `targeted:historical-1929`
($2,887,915 → $2,587,857), `-1966` ($5,203,633 → $4,788,666), `-2000` ($3,869,168 → $3,601,559),
`expansion:other-asset-draw-historical`, `expansion:monte-carlo-sensitive-band` (success 84.6% → 83.0%),
`expansion:s5aa-r14-rmd-conversion-under-loss` ($263,039 → $252,082) and `-prototype-ids` ($294,121 → $275,589). Every corpus
input hash and the goldens' and tests' default-derived plans would need re-registration. The owner decides.

### 3. The tests

**The engine exposure.** `prediction/r49_test_exposure_hook.js`, loaded into each of the 312 test files that call `runPlan()` or
`simulatePlan()`, one file at a time, on a scratch checkout of `ba9946d` (`prediction/r49_test_exposure_at_ba9946d.jsonl`,
summary `..._summary_...txt`, per-file results `..._files_...txt`); a second pass replayed every direct `strategySpending()` call in
the 15 files that make one (none crosses a floor). Four files fail under the hook and pass without it (`audit-bc02-clone-once`,
`audit-q80-flag-defaults-serialize-once`, `audit-s5r01-direct-simulate-route`, `audit-s5r01-execution-snapshot`): they count how
often the engine reads the plan, and the hook's extra clone is counted. Their plans are default-derived retired plans; nothing in
them is predicted to move. Tests that load an engine variant through `vm`, and the app's own engine inside jsdom, are not seen;
the jsdom tests are read by hand below.
- **No test plan carries `ltcOnsetAge` or `pmiEndAge`, or a conventional mortgage with terms that charges PMI.**
- **flex:** `public-route-q101-q109` (guardrails, the row opening at 71 — the test reads 61 to 66 only: passes);
  `audit-q51-q52-bounds-swap` (Monte Carlo, 7 of 20 paths exposed; the test counts warnings only: passes); and the corpus-wide
  files that run `seed:5` / `seed:17` and generated plans by comparing routes or checking conservation (`boolean-flag-contract`,
  `build-routes`, `capture-baseline`, `corpus-composition`, `corpus-configured-paths`, `household-ledger`,
  `near-miss-survivor-sweep`, `networth-reconciliation`, `reconciliation-invariant`, `worker-parity`): each compares two runs of the
  same engine or holds an identity that the floor does not break: pass.
- **working:** 36 files run a plan that gains the issue. Every assertion on their `issues` filters to ERROR or to a named code
  (checked by search for `issues.length`, `issues, []`, `deepEqual(… issues`, `issues.map`): pass.
- **The Worker:** `pmiStopAge` and `noteWorkingYearsShortfall` join `workerFunctions` in the same commit (SA45-A), or `worker-parity`
  and the build-route tests fail.

**The validator exposure.** `prediction/r49_validator_exposure_hook.js` (the four new warnings' conditions) in the 115 files that load
the validator (`prediction/r49_validator_exposure_at_ba9946d.jsonl`, summary `..._summary_...txt`). Flagged: `audit-q53-boolean-flag-boundary`,
`audit-q58-strategy-resolution` (it filters to the path `retirement.strategy`; the new warning's path is `retirement.flexibility`),
`audit-q74-stage-percent-range`, `audit-s5aa-r25-debt-payoff-at-its-month`, `audit-s5aa-r27-pmi-while-owed`,
`audit-s5aa-r37-validator-gaps`, `boolean-flag-contract`, `corpus-composition`, `near-miss-survivor-sweep`, `scenario-generator`,
`scenario-validator-no-false-positives` (errors only), and `scenario-validator`.

**Expected to fail, and be adapted by intent (each recorded with before and after):**
1. `scenario-validator.test.js` "a well-formed debt entry produces no issues" (`deepEqual(result.issues, [])`): $250,000 at 6% paying
   $1,500 a month from 40 to the payoff at 65 leaves about $76,700 (the amortizing payment is $1,610.75), so
   `DEBT_PAYOFF_RESIDUAL` is raised. Adapted: the payment that clears the debt.
2. `contribution-and-debt-projection.test.js` "no debts returns a zeroed result": it pins `projectDebts()`'s exact return, which
   gains the zero field `workingService`.
3. `audit-s5aa-r37-inert-mortgage-fields.test.js` "the debt page lists them": it pins the debt page's note word for word, which now
   says the program and the two terms set when PMI ends. Its engine test passes (its mortgage charges no PMI).
4. **Control 4.7** (`control-corpus.test.js`) fails until the differences of the nine working-years plans, `seed:5` and `seed:17` are
   declared (the coordinator's step).

**Read by hand (jsdom, the app's validator):** the exact import-message tests (`audit-import` "legacy backups…" and "a valid,
populated expenses array…", `import-validation` "a sound backup…") import the app's default plan (income-first, no debts, no
stages): no new warning, so the message keeps no warning suffix: pass. No test pins a label, note, option text or input id this
round changes (searched: the return preset, the return, fees, the two Social Security labels, the withdrawal-order option, the
optimization goal, the flexibility label, the dividend switch, the insurance label, the life-age notes, the LTC labels, the debt
editor's labels, `v2-flexibility`, `v2-withdrawal-order`, `v2-ss-benefit`, `v2-spouse-ss`, `v2-self-life`, `v2-insurance`,
`v2-return-preset`, `v2-fee`); `planWarningTitles` and `reviewImportedScenarios` are pinned by no test but `schema-catalogue`
(which names the function, not its behaviour). `staticIds` is held by `audit-s5aa-r45-carried-test-gaps` (every form read must be
listened to): the new `v2-ltc-onset` joins both. A failure not listed here is a miss.

### 4. The witnesses

`tests/audit-s5aa-r49-spending-debt-disclosure.test.js`, 33 cases (SHA-256 `5f216b3d…b6410b` at the pre-repair run). On `ba9946d`
the 26 repair cases fail with the pre-repair figure and the 7 controls pass (`witness_runs/r49_tests_at_ba9946d.txt`):

| case | expected (hand-derived) | at `ba9946d` |
|---|---|---|
| floor and ceiling, floor binds, after a down year | $30,000 | $27,000 |
| floor and ceiling, the cut crosses the floor | $30,000 | $29,482.20 |
| remaining-life minimum $30,000 | $30,000 | $27,000 |
| VPW 5% minimum | 5% of the opening balance ($42,628.29) | $38,365.46 |
| a 50% stage below the floor | $15,000 | $13,500 |
| overlapping percent stages / flexibility on guardrails | one WARNING each | none |
| LTC onset 72 / 72.5 | care from 72 / from 72.5, unrounded | from 70 |
| Monte Carlo onset 76, u = 0.25 / onset 72, u = 0 | care from 71 / from the start, 66 | from 70 / from 65 |
| PMI end 61.5 / HPA midpoint / past midpoint / entered 62.5 overrides | $1,200, $600, 0 / $1,200, $100, 0 / 0, 0, 0 / $1,200, $1,200, $600 | $1,200 every row |
| residual $4,000 / interest-only $10,000 / cleared $0 | `debtPayoffResidual` and one WARNING / function | no function |
| working years: $72,000 of payments on $60,000 / contributions above pay | one WARNING at 50 | none |
| insurance from the first year | one WARNING | none |
| the four new values as text or negative | refused by both layers | accepted |
| cards, relabels, the onset input, the plan checks, the lump sum (app) | present | absent |
| controls: floor and ceiling well above the floor; no-floor strategy; no onset (deterministic and Monte Carlo); FHA / no terms / no program; $200 a month clears; funded working years and a retired household | as before | pass |

After the repair every case passes. A case whose derivation proves wrong in the build is corrected and recorded as a miss.

### 5. The gate and the browser

- **Gate:** the coordinator runs it. Predicted: passes after the adaptations below and the 4.7 declaration; closeout 12/0/0.
- **Browser:** the round's candidate repeats task 6.5 (A-04), including the onset input, the PMI end input, the lump sum, the cards
  and the plan-checks list.
