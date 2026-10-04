# S5AA R46 — build report: Monte Carlo and the cash reserve

*Written by Claude on 2026-10-03 (Arizona, UTC−7). Branch `sprint/s5aa-r46`, built in its own worktree from `ba9946d` (the R45
round). Not pushed; the coordinator integrates, runs the gate and registers baselines.*

## Commits

| commit | what |
|---|---|
| `aaa1852` | the prediction record, its scans and their outputs at `ba9946d`, the witness run on `ba9946d` (before any source edit, A-01) |
| `8d2e288` | the repair: engine, validator, app, the witness file, the contract and field-count definitions, and every adaptation |
| (this commit) | the measurement after the build and this report |

## What changed

**Engine (`src/engine.js`).**
- `monteCarloPeriodShocks(p, random, active)`: one draw per Monte Carlo period, made at the top of each row in
  `simulatePlanRows()` whatever accounts exist — the household shock, then (asset classes on) a common factor and one draw per
  asset class in the plan's order. Class shocks: `√ρ·f + √(1−ρ)·z_k` for ρ ≥ 0; `√(1−ρ)·z_k + β·S` for ρ < 0, `S` over the m
  active classes, `β = (√(1+(m−1)ρ) − √(1−ρ))/m`.
- `monteCarloAccountShock()`: an account's risk weights (`accountRiskWeights()`, the weights `accountVolatility()` already read,
  moved out unchanged) times each class's volatility times its shock; classes off, or no allocation, the household shock at
  `assumptions.volatility`. `accountReturnForPeriod()` takes the period's shocks (or, for a direct caller, a generator, with RA-02's
  contract kept); the created-destination call (:4546 before) now receives the shared shocks (Q19's creation-period expectation is
  retired under Monte Carlo).
- The reserve share is `min(1, R/T)` for every account.
- `activeAssetClassIndexes()` and `infeasibleCorrelation()`; the gate's `replacedPlanInputCode()` refuses
  `INFEASIBLE_CORRELATION` (Monte Carlo, asset classes on), with its message and `{path: "advanced.correlation"}`.
- `aggregateMonteCarloRuns()` adds `finalYearRealSpending: {median, q10}`; `applyInvalidResultContract()` removes it.

**Validator (`src/scenario-validator.js`).** `validateCorrelationFeasible()` (with `activeAssetClassCount()`, the engine's
glide-endpoint rule mirrored): `INFEASIBLE_CORRELATION` ERROR at `advanced.correlation`, upgrading the existing range WARNING in
place. No new `checkRange` call (the scenario generator reads those).

**App (`src/app-shell.html`).** The stat reads "All modeled spending funded" (was "Success probability"), with the note "Share
of paths with no shortfall in any year. Adaptive spending strategies may cut spending to stay funded." and, in Monte Carlo only,
"Final-year spending in today's dollars: median $X, 10th percentile $Y." (`v2-stat-final-spending`, hidden otherwise and in the
calculation-error state). The id `v2-stat-success` and its `\d.\d%` text are unchanged. The debt insight's "compare success
probability" reads "compare the share of paths that fund all modeled spending". The five new helpers joined `workerFunctions`.
No input, `staticIds` or `defaultPlan` change.

**Contract and tools.** `tools/result-contract.json`: `finalYearRealSpending` under `topLevel.optional` (version stays 5).
`tools/capture-baseline.js` `FIELD_COUNTS.monteCarlo.topLevel` 18 → 19. `RESULT_CONTRACT.md`: an R46 subsection (the refusal and
the key) and a sentence in the Monte Carlo top-level description. `tools/control-candidate-prediction.json`: the five movers'
declarations replaced from the measured comparison (`audit/S5AA/R46/r46_declare_control.js`), with a `changes` entry.
`tools/corpus-spec-expanded.json`: the sensitive-band member's input fingerprint re-pinned (only that one).

## Predicted against measured

| | predicted (`aaa1852`) | measured | verdict |
|---|---|---|---|
| expanded capture, Monte Carlo | golden MC, seed:9, sensitive band: named, every path exposed, may move; seed:17: no path changes, only the new key | golden MC 500/500 paths changed, success 100% → 96.8%; seed:9 52/52 changed (success 100% both; final median −$78,854.33); sensitive band 500/500 changed (on the same plan, both engines); seed:17 0/24 changed, figures identical, key added (`prediction/r46_paths_changed_8d2e288_vs_ba9946d.txt`, `r46_compare_…txt`) | as predicted |
| `seed:1` (reserve) | down, from age 54, −$1,737.95, lifetime taxes unchanged | from age 54 (rows[1].hsa $285,671.48 → $285,590.15), final −$1,737.95, taxes unchanged | as predicted (exact) |
| `seed:12` (reserve) | rows move from age 40; final $0.00 both; taxes unchanged | first difference rows[2] (age 40); final $0.00 both; taxes unchanged | as predicted |
| every other expanded entry | unchanged | 65 entries identical | as predicted |
| refusal in the corpus | none | none (all 71 entries ok) | as predicted |
| control 4.7 | golden MC, seed:9, seed:1, seed:12 move; seed:17 gains only `finalYearRealSpending` (`EXTRA_FIELD`) | exactly those five; every other scenario's 13,453 differences as declared before; seed:17 apart from the key as declared before | as predicted |
| witnesses | 20 repair cases fail at `ba9946d`, 28 pass after | 20 failed at `ba9946d` (`witness_runs/r46_tests_at_ba9946d.txt`); 28 pass at `8d2e288` (`witness_runs/r46_tests_at_8d2e288.txt`) after one derivation correction (SA46-B) | as predicted, one miss |
| named adaptations | golden MC fixture; sensitive band (likely); worker-parity and schema-catalogue through `FIELD_COUNTS`; decided refusals; control 4.7 | golden MC fixture; sensitive band re-picked; `FIELD_COUNTS` (worker-parity then passed); the schema catalogue's committed fixture (SA46-D); decided refusals; control 4.7 | as predicted, with SA46-A and SA46-D |
| expected to pass unchanged | rng-seeding, r20 glide, r43 seeds, RA-02 internals, decision clock, MC invariants, conservation invariants | all pass unchanged | as predicted |

**Targeted tests run** (no full gate, by the rules): 98 files — every file the exposure hook named, the nine files pinning the
results stat, the validator, contract, register, Worker, corpus, capture and replay files — 999 tests, 992 pass, 6 authorized
todos, 1 failure (SA46-A, then adapted; its file 11/11). Then the five app files with Monte Carlo or reserve plans not seen by the
hook, and the account-ranking files: 82/82. Requirements register and test classification rebuilt; `tests/requirements-register`,
`test-classification`, `current-build-lane`: 36/36. `node tools/closeout-check.js`: accepted 12, refused 0, errors 0.

## Misses and corrections

- **SA46-A, R2's Q2c reserve tests (not named).** `tests/audit-r2-rmd-holding.test.js` pinned the per-account reserve by calling
  `accountReturnForPeriod()` directly: a $2m source at 9.79% and an empty destination at 10%. The exposure hook wraps only `runPlan`,
  `simulatePlan` and `runScenario`, and the C6 search had listed this file's direct calls (lines 273–310) without following them up.
  Adapted by intent (below). Lesson: a test calling a changed internal directly is a reader too; the hook cannot see it.
- **SA46-B, a witness derivation.** The app witness left the app's default 10% spending flexibility on; the build measured a 10th
  percentile of $36,000 (paths that cut 10% after a down year — exactly what the new summary is for). The derivation assumed no
  cut; the case now sets flexibility to 0, as the engine case does, and expects $40,000. Recorded, not re-expected silently.
- **SA46-C, the register (process).** Naming the created-destination witness "(Q19)" made Q19's register guard that one
  implementation-coupled file, and closeout refused (`COUPLED-ONLY-Q19`). The test name no longer carries the id; Q19 stays guarded
  by RA-01/RA-02's public-route files. Closeout 12/0/0.
- **SA46-D, the schema catalogue (partly named).** The prediction named `schema-catalogue` through `FIELD_COUNTS`; the failing test
  was the committed catalogue fixture, regenerated with `node tests/lib/schema-catalogue.js --write`. Besides the new key it records
  `failureAge`, `firstShortfallAge` and `sustainedFailureAge` as numbers on the Monte Carlo result: the golden Monte Carlo plan,
  whose result the catalogue reads, now has unsuccessful paths.
- The witness file's SHA-256 at the prediction was `0238a091…c30f`; at `8d2e288` it is `4a8af6c2…73b5`, changed only by SA46-B and
  SA46-C.

## Tests and fixtures adapted by intent (before → after)

| file | what it pinned | before | after |
|---|---|---|---|
| `tests/fixtures/golden-scenarios.fixtures.json` (`monte-carlo-fixed-seed` only; the other four unchanged) | the golden MC summary | failed false; success 100; lifetime taxes $2,242,033.60; mid total $19,613,423.44; last total $304,502,978.52 | failed true; success 96.8; $2,512,709.86; $17,597,381.73; $179,664,612.83 (every changed leaf in the R46 note of `tests/golden-scenarios.test.js` and the diff) |
| `tests/monte-carlo-sensitive-band.test.js`, `tests/lib/corpus-expansion.js` (family version 8) | the first 5% step in [50, 85] | step 31 (x2.55, $153,000), 84.6%; golden 100% | step 14 (x1.70, $102,000), 84.2% (step 13 85.2%); golden 96.8%; sweep 99.8 / 84.2 / 50.8 against golden 100 / 96.8 / 69.6 |
| `tools/corpus-spec-expanded.json` | the member's input fingerprint | `0b6f860b…92de` | `d8532a70…61f4` |
| `tests/fixtures/schema-catalogue.fixture.json` | live result shapes | MC top level 18 | 19 (SA46-D) |
| `tools/capture-baseline.js` `FIELD_COUNTS` | MC top-level keys | 18 | 19 |
| `tests/lib/decided-refusals.js` | generator seeds refused by a decision | — | `INFEASIBLE_CORRELATION`: 21, 54, 67, 70, 78, 111, 100010 (three classes, ρ −0.51 to −0.8) |
| `tests/audit-r2-rmd-holding.test.js` (two Q2c tests) | per-account reserve | empty destination 10%, source 9.79% | both 9.79%; the inheriting holding equals the explicit destination |
| `tools/control-candidate-prediction.json` | declared control differences | golden MC 1,111; seed:9 464; seed:17 324; seed:1 298; seed:12 290 (2,487) | 1,113; 465; 325; 299; 290 (2,492) |

## Law and method claims

No tax-law claim is made or changed in R46. The one mathematical claim, checked here: an n × n matrix with ones on the diagonal and
ρ elsewhere, `(1−ρ)I + ρJ`, has eigenvalues `1+(n−1)ρ` (once) and `1−ρ` (n−1 times), so it is a correlation matrix exactly when
`−1/(n−1) ≤ ρ ≤ 1`; its symmetric square root is `√(1−ρ)I + βJ` with `β = (√(1+(n−1)ρ) − √(1−ρ))/n`, since
`(aI + bJ)² = a²I + (2ab + nb²)J`. For ρ ≥ 0 the one-factor form gives the same covariance (`ρ` off the diagonal, 1 on it). The
witness file checks the formulas from the draws and the correlation statistically (0.6 ± 0.05 over 2,000 paths).

## Decisions for the owner

1. **Contract version.** `finalYearRealSpending` is an optional key under version 5 (RESULT_CONTRACT §8: no meaning, requirement
   or invariant changed). A version 6 is the alternative; it would change every capture's recorded version.
2. **Q19 under Monte Carlo.** A destination created mid-period now takes the period's shared shock (the reason for its expectation
   is gone). Confirm, or keep the expectation.
3. **"Active" classes.** Built: classes any account of the plan, as entered, weights above zero at the start or end of its glide —
   including an empty account. So an empty account holding a class nobody else holds can make a negative correlation infeasible,
   and (ρ < 0 only) changes how the class draws combine; for ρ ≥ 0 nothing an account holds changes the draws.
4. **The refusal's scope.** Only Monte Carlo with asset classes on reads the correlation, so only that is refused; a simple or
   historical plan keeps an infeasible value with the existing range warning.
5. **The summary's definition.** Final-row *requested* spending (`spending`, what the strategy sets, including adaptive cuts),
   deflated by the inflation factor at the final row's opening, so an inflation-matched budget reads as entered. The projection
   table's today's-dollar view divides a row by its closing factor, so its last-row figure is one year's inflation lower.
6. **Not changed (out of scope):** the "How Monte Carlo draws returns" card does not say the draw is shared by all accounts; it
   says nothing false, and a line could be added in the disclosure round.

## Suggested text for eb's files

- **MODEL_ASSUMPTIONS.md §18.6** — retitle "Monte Carlo: one set of market shocks per year, shared by every account (S5AA R46)" and
  replace the body: "Each simulated year draws one set of shocks for the whole household: one per asset class, correlated at the
  plan's correlation, or one household shock when asset classes are off. Every account's return is its expected return plus its
  allocation's share of those shocks, so splitting the same investments across more accounts, reordering them or adding an empty
  one changes nothing (one $1,000,000 Roth and twenty $50,000 Roths now succeed on the same 59.8% of 1,000 paths; before, twenty
  succeeded on 99.2%). A correlation that no set of returns can have — below −1/(n−1) for the n classes the accounts hold, or
  above 1 — is refused. Every Monte Carlo figure with more than one account moved; the golden Monte Carlo plan's success fell from
  100% to 96.8%. (Carried as U6; repaired in the old engine by R46 on the owner's AA1 decision of 2026-10-03.)"
- **MODEL_ASSUMPTIONS.md, the reserve (beside §18.6 or the "years of spending in reserve" line):** "The reserve is the household's:
  every account blends the same share, spending × years ÷ the portfolio, at most all of it, at the reserve's 3%. It was capped at
  each account's own balance, so an account smaller than the reserve under-reserved (S5AA R46, MC-B; Q66)."
- **MODEL_ASSUMPTIONS.md, results:** "The headline figure is the share of paths with no modeled shortfall over one cent in any year,
  labelled 'All modeled spending funded'. An adaptive strategy can reach it by cutting spending; Monte Carlo shows the final
  year's spending in today's dollars at the median and the 10th percentile beside it."
- **FEATURES.md** line 139 ("Known limitation: Monte Carlo draws each account's return independently…"): replace with "Monte Carlo
  draws one set of correlated asset-class shocks per year, shared by every account (S5AA R46); an impossible correlation is
  refused." Results: "The success figure is labelled 'All modeled spending funded', with Monte Carlo's final-year real spending
  (median and 10th percentile)."
- **SPRINT_QUESTIONS.md** — Q19 (b): "Superseded under Monte Carlo by S5AA R46: one shared draw per period, so a created destination
  takes the period's shocks; a direct generator caller keeps the suppressed-draw contract." Q45: "Repaired by S5AA R46: an
  infeasible correlation is refused by both layers (`INFEASIBLE_CORRELATION`)." Q66: "Repaired by S5AA R46: the reserve share is the
  household's." Each for eb to word and status.
- **S2_CARRIED_WORK_REGISTER.md U6:** "Repaired in the old engine by S5AA R46 (the owner's AA1 decision, 2026-10-03), ahead of the
  CPU rebuild."

## Pending (the coordinator's)

- The full gate, baseline registration (the expanded capture moves in five entries and the sensitive-band input), and the task 6.5
  browser check (A-04), including the new card line in Monte Carlo and its absence in simple mode.
- Captures: `prediction/r46_expanded_at_8d2e288.json` and `prediction/r46_expanded_at_ba9946d.json` (2.1 MB each), qualified at
  their commits.
