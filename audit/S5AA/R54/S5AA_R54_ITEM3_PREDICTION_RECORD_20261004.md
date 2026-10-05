# S5AA R54 item 3 — prediction record: values outside the form's range refused by every route

*Written by Claude on 2026-10-04, 7:25 pm Arizona time (UTC−7). Committed before any edit to `src/plan-value-contract.json` or `src/`
(A-01), held to the R44.1 checklist (C1–C8). Base: `sprint/s5aa-r54` at `2aa2511` (items 1 and 2, verified by the coordinator: gate
4,250 / 4,241 / 0 / 9 PASSED, capture = r30). Scripts and outputs: `audit/S5AA/R54/item3/`.*

## The decision

The owner, 2026-10-04 (about 7:00 pm), after R54's reading D2: values the form used to clamp are refused with a named error when they
fall outside the form's range, by any route (validator and engine), so that a hand-edited backup cannot carry them into the projection.
The mechanism is the shared `src/plan-value-contract.json` (S5AA R43): a `min`/`max` there is the validator's `OUT_OF_RANGE` ERROR and the
engine's `SCENARIO_PLAN_VALUE_OUT_OF_RANGE`. The bound is the clamp the form applies to an EDITED value. The run count keeps the engine's own
rule (`invalidRunCountCode()`, 1 to 10,000; a restored 24 stays valid); the end age is unchanged.

## The bounds (`item3/r54i3_bounds.json`: 28 rules; read from `src/app-shell.html` at `2aa2511`)

| path | the clamp (readStatic() unless marked) | contract before | new bound |
|---|---|---|---|
| employment.salary | `Math.max(0, …)` | no entry (validator: finite) | ≥ 0 |
| employment.spouseSalary | `Math.max(0, …)` | number | ≥ 0 |
| assumptions.fee | `clamp(…, 0, 2)` | no entry | 0–2 |
| assumptions.volatility | `Math.max(0, …)` | no entry (validator: NEGATIVE_VOLATILITY warning) | ≥ 0 |
| retirement.spending | `Math.max(0, …)` | no entry (NEGATIVE_SPENDING warning) | ≥ 0 |
| retirement.withdrawalRate | `clamp(…, 0, 15)` | number | 0–15 |
| retirement.upperGuardrail, lowerGuardrail, adjustment | `Math.max(1, …)` | number | ≥ 1 |
| retirement.floor, ceiling | `Math.max(0, …)` | number | ≥ 0 |
| retirement.dividendYield | `clamp(…, 0, 20)` | no entry | 0–20 |
| retirement.dividendQualified | `clamp(…, 0, 100)` | no entry (DIVIDEND_QUALIFIED_OUT_OF_RANGE warning; the engine held it and disclosed) | 0–100 |
| retirement.dividendGrowth | `clamp(…, −20, 20)` | no entry | −20–20 |
| retirement.ssBenefit, spouseSS | `Math.max(0, …)` | no entry (validator: finite) | ≥ 0 |
| retirement.flexibility | `clamp(…, 0, 50)` | number | 0–50 |
| retirement.vpwMinRate | save(): `clamp(…, 0, 25)` | number | 0–25 |
| retirement.vpwMaxRate | save(): `clamp(…, 0, 100)` | number | 0–100 |
| retirement.rmdMultiplier | save(): `clamp(…, 0, 200)` | number | 0–200 |
| retirement.rmdFloor | save(): `Math.max(0, …)` | number | ≥ 0 |
| retirement.ssCola | save(): `clamp(…, 0, 15)` | number | 0–15 |
| retirement.survivorSpendingReduction | save(): `clamp(…, 0, 50)` | 0–100 | 0–50 |
| advanced.correlation | `clamp(…, −1, 1)` | no entry (OUT_OF_RANGE warning; INFEASIBLE_CORRELATION on Monte Carlo with classes) | −1–1 |
| advanced.healthInflation | `Math.max(0, …)` | > −100, ≤ 100 (validator: the same, by hand; 0–20 warning) | 0–100 |
| advanced.medicareInflation | R48 loop `clamp(…, −99, 100)` | > −100, ≤ 100 | −99–100 |
| advanced.partDPremium | R48 loop `clamp(…, 0, 100000)` | ≥ 0 | 0–100,000 |
| profile.priorIncomeThisYear | R50 loop `clamp(…, 0, 1e9)` | ≥ 0 | 0–1e9 |

**Not added** (each recorded in `r54i3_bounds.json`, `notAdded`):
- `assumptions.seed` (`Math.max(1, Math.floor(…))`): a seed is the random stream, not a plan value; 0 is the engine's own documented
  fallback for an absent seed (`tests/rng-seeding.test.js` runs an absent seed against seed 0). Left to the owner (D-item).
- `advanced.irmaaMagi…` (`Math.max(0, …)`): the validator already refuses a negative value (R35), so the import does. A contract entry
  would need `nullable` (null means not entered), and ChatGPT's R51F F26 probe expects every contract number to refuse null. Left as is
  (D-item: the engine-direct route still runs a negative prior MAGI).
- Input ranges applied only on a blur (`growth` −20–30, `returnRate` −5–20, `inflation` 0–15, `pensionCola` 0–10, `reserveYears` ≤ 10):
  not readStatic()/save() clamps (D-item).
- The run count, precision (`half()`, rounding, floor), the relational age clamps, and the bounds the contract already holds.

**Validator wording, one issue per condition.** The contract's check already upgrades an earlier WARNING at the same path to its ERROR. The
three warnings that described exactly the refused values — NEGATIVE_VOLATILITY (`assumptions.volatility`), NEGATIVE_SPENDING and
DIVIDEND_QUALIFIED_OUT_OF_RANGE — and the correlation's −1..1 range warning are removed, so each such value gives one ERROR,
OUT_OF_RANGE; the old codes no longer appear. The hand-written healthcare-inflation range becomes 0–100 (message "at least 0 and at most
100"), keeping its 0–20 warning; the Medicare inflation 0–20 warning stays (now inside −99–100). The correlation feasibility check is
unchanged: on Monte Carlo with asset classes both layers already refuse |ρ| > 1 as INFEASIBLE_CORRELATION (the engine in its first gate
stage), elsewhere both now give OUT_OF_RANGE. The engine's code is unchanged; it reads the contract (the app embeds it at build: the app is
rebuilt and repinned).

## The stop condition (`item3/r54i3_stop_scan.js`, output `r54i3_stop_scan_at_2aa2511.txt`)

| scanned | plans outside a new bound |
|---|---|
| control composition (36; golden and seeds 1–20 included) | **0** |
| expanded composition (71) | **0** |
| the five golden definitions; `defaultPlan` | 0; inside every bound |
| generator seeds 1–5,000 | 0 |
| `tests/fixtures/*.json` | 0 |
| the R40 conservation-grid generator (3,000 plans) | 0 |
| ChatGPT's four companions (every stored plan, `r54i3_companion_scan_at_2aa2511.txt`) | 0 |

**No corpus, control, golden or generator plan is refused: item 3 is built.** No control input changes.

## C6 — the readers

- **The contract** is read by `validatePlanValueContract()` (validator) and `planValueContractViolation()` (the engine's input gate, second
  stage), and embedded in the app's Worker source at build. No other reader takes a number range from it; `tools/capture-baseline.js` and
  `tools/build-device-benchmark.js` read it for its input list and its text.
- **The removed warnings** are read only by tests (below). The app's Plan checks lists ERRORs since R54 item 1, so a refused value there is
  named; the import refuses on any ERROR.
- **The app**: R54 item 2's validator gate (`recordLoaded()`) now finds an ERROR at a stored out-of-range value from browser storage, so the
  value is read as the form reads it (clamped) and never reaches the engine.
- **The engine's own clamps** (the dividend share's DIVIDEND_QUALIFIED_CLAMPED disclosure, the VPW rate bounds) stay in code; through
  runPlan() a value outside the range is refused first.

## The tests (C6/C8): exposure, by hook

`item3/r54i3_bounds_hook.js` taps every plan given to the engine (runPlan, runScenario, simulatePlan: the module, every engine variant, a
Worker source in a vm), the validator, and the built app's own runPlan and validateScenario in jsdom; `r54i3_run_hook.js` ran all 450 test
files (`r54i3_exposure_log_at_2aa2511.txt`; one batch fails for the hook itself — capture-boundary 5.4 — and 9.1 for the uncommitted
witness file). 62 records in 13 files:

| file | value(s) | route | predicted |
|---|---|---|---|
| `audit-q50-dividend-qualified-bound` | dividendQualified 150, 500, −50 | engine, validator | **5 tests fail** (the engine taxes 150/500/−50 as 100/0, discloses, the validator warns, dividends-off reads nothing): they pin the old acceptance → adapted to assert the refusal in both layers. Its two controls pass. |
| `scenario-validator` | volatility −15, spending −1, correlation 1.5 | validator | **3 tests fail** (pin NEGATIVE_VOLATILITY, NEGATIVE_SPENDING, the correlation warning) → adapted to the ERROR. |
| `audit-s5aa-r40-health-inflation-validated` | −150, −100, 1e40, −2 | validator | −150/−100/1e40 still ERROR OUT_OF_RANGE (pass); **−2 fails** (WARNING → ERROR) → adapted. |
| `audit-s5aa-r11-strategy-year-count` | vpwMaxRate 200 | engine | **R10-01's "rate cap out of the way" test fails**: 200 is deliberate (it takes the 100% cap away) → adapted to assert the refusal. |
| `audit-sa04-decision-inflation` | adjustment 0 | engine (simulatePlan) | **fails**: the 0 is incidental (guardrails at 1,000% never bind) → adapted to 1, the form's minimum; every figure predicted unchanged. |
| `audit-s5aa-r54-restore-keeps-all` (R54's own item-2 witness) | 28 family values | all | **fails** → adapted by intent: the family keeps the 11 values still valid; the 2.5% fee case becomes "refused at Restore with the message"; from storage the 2.5% fee is now read as the form reads it (2) beside a kept 35% salary growth. |
| `audit-s5aa-r43-plan-value-contract` | min−1 / max+1 of each entry | both | pass: it already expects a refusal of each, and now iterates the new entries too. |
| `audit-s5aa-r46-…` | correlation 1.2 (Monte Carlo, classes) | both | pass: INFEASIBLE_CORRELATION in both layers, unchanged. |
| `audit-s5aa-r48-…`, `audit-s5aa-r50-…` | medicareInflation −100, Part D −5, prior income −1 | both | pass: already refused; they assert a refusal, not its text. |
| `audit-s5aa-r9-dividend-field-types` | yield / growth 50 | validator | pass: asserts no WRONG_TYPE only. |
| `rng-seeding` | seed 0 | engine | pass: the seed is not bounded. |

Static pins searched: no test pins the healthcare-inflation message; `planWarningTitles` keeps DIVIDEND_QUALIFIED_CLAMPED (now unreachable
through runPlan). **Every other test is predicted to pass.** A failure not named here is a miss.

## The witness (C7)

`tests/audit-s5aa-r54-form-ranges-refused.test.js` (SHA-256 at this commit `60cbc8bfb8aa901e58c43fd11ff6616813b48e0c73bc3d42263a8427fa1f7051`):
- each of the 28 bounds: a value below and/or above (the coordinator's: salary −50,000; fee −1 and 50; withdrawal −4 and 80; guardrail
  −20; flexibility −10; COLA −5) refused by the validator (`OUT_OF_RANGE` at its path) and the engine (`SCENARIO_PLAN_VALUE_OUT_OF_RANGE`);
- each edge accepted and projected (0, 2, 15, 1, 20, 100, −20, 25, 200, 50, −1, 1, −99, 100,000, 1e9);
- one issue per condition for the three old warnings;
- Restore backup refusing a 2.5% fee with the message, scenarios byte for byte unchanged;
- a restored in-range value kept (fee 1.75, withdrawal 14.5, runs 24).

At `2aa2511` (`item3/witness_runs/r54i3_witness_at_2aa2511.txt`): 188 checks, 102 pass, 86 fail. Every out-of-range value fails both
checks except five already refused at the base (survivor reduction −1, healthcare inflation 101, Medicare inflation 101, Part D −1, prior
income −1); every edge passes; the three one-issue checks and the two import checks fail; the in-range control passes.

## Companions, capture (C8)

- **Capture:** no corpus input is outside a bound and no engine code changes: **predicted equal to r30, 71/71** (the contract is an input
  the capture's boundary hashes; outputs unchanged).
- **R53 focused:** 20/20, 140, grid 400/800, hunt 4/4, exit 0 — predicted unchanged (no plan outside).
- **R51F (adapter):** predicted identical verdicts. F26 now also mutates the 10 new contract entries with NaN, ±Infinity, '123' and null;
  each is refused by both layers (the validator types each of them already), so its check (0 failures) is unchanged; its mutation count
  grows.
- **R46–R51, R52 (adapter):** predicted identical (no plan outside).

## Readings for the owner (D-items) are in the build report addendum.
