# S5AA R46 — prediction record: Monte Carlo and the cash reserve

*Written by Claude on 2026-10-03 (Arizona, UTC−7). Committed before the R46 engine, validator, app and tool edits (A-01), and held
to `audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md`. Base: `sprint/s5aa-r46` at `ba9946d` (the R45 round; source
`s5aa-r45-source` = `9c7790e`).*

## The round

The owner decided on 2026-10-03, on ChatGPT's AA1 assumptions audit (AA1-24) and Claude's verification of it (MC-A to MC-E,
`S5AA_AA1_CLAUDE_VERIFICATION_20261003.md`, "The owner's decisions"): "the full fix". The rules built here:

1. **MC-A, MC-D: one set of market shocks per Monte Carlo path and period, shared by every account.** Today
   `accountReturnForPeriod()` draws one independent normal per account, in account order, so splitting $1M into twenty identical
   accounts moves success 59.8% → 99.2%, and reordering the accounts or adding an empty one moves the result. After R46 each
   period draws, in this order and whatever accounts exist: `z_h`, the household shock; then, with asset classes on, `f`, a common
   factor, and one `z_k` per asset class in the plan's order (`advanced.assetClasses`). Class k's shock `x_k` carries the plan's one
   correlation ρ (`advanced.correlation`) with every other class:
   - ρ ≥ 0: `x_k = √ρ·f + √(1−ρ)·z_k` (a one-factor form, which reads no account);
   - ρ < 0: `x_k = √(1−ρ)·z_k + β·S`, `S` the sum of `z_j` over the m active classes, `β = (√(1+(m−1)ρ) − √(1−ρ))/m` — the
     symmetric square root of the m × m equicorrelation matrix (a negative ρ is feasible only relative to m, so its form needs m).
   An account's return is its expected return (unchanged) plus `Σ_k w_k·vol_k·x_k`, `w` its allocation weights, glided where the
   glide applies, exactly as `accountVolatility()` and the expected return read them; with asset classes off, or for an account
   with no allocation, it is `assumptions.volatility·z_h`. The draws never depend on the accounts, their order, or their balances.
   Historical and simple modes, the bond tent, fee, reserve and clamp, and the per-path seeding (`rng(monteCarloPathSeed(seed, i,
   0))`, stream 1 for care) are unchanged.
   - **A consequence, recorded as a decision for the owner to confirm (Q19):** a taxable destination the engine creates mid-period
     (the invest policy, with no source account) took its expectation in its creation period, because drawing for it would have
     shifted every later draw (RA-02, Q19). With one shared draw per period nothing shifts, so R46 gives it the period's shared
     shock, like every other account. A direct caller of `accountReturnForPeriod()` that passes a generator keeps RA-02's contract
     (a suppressed draw consumes nothing and returns the expectation).
2. **MC-C: an impossible correlation is refused, in both layers.** One ρ among m active classes is feasible only for
   −1/(m−1) ≤ ρ ≤ 1. Where Monte Carlo reads it (method `monteCarlo`, asset classes on) a ρ above 1, below −1, or below
   −1/(m−1) is refused: the validator reports `INFEASIBLE_CORRELATION` (ERROR) at `advanced.correlation`, upgrading the existing
   range WARNING there in place; the engine refuses with `SCENARIO_INFEASIBLE_CORRELATION` through the input gate
   (`replacedPlanInputCode()`, beside R37's class-volatility refusal). `1+(m−1)ρ` above −10⁻¹² counts as zero (roundoff). **Active**,
   decided here: an asset class that some account of the plan, as entered (whatever its balance), weights above zero at the start
   or at the end of its glide (`accountGlideWeights()` at progress 0 and 1; glide weights are linear in the progress, so a class
   zero at both ends is zero throughout; with the glide off, the opening allocation). Simple and historical plans, and plans with
   asset classes off, never read the correlation and are not refused.
3. **MC-E: the label.** The metric stays "no modeled shortfall over one cent". The app labels it **"All modeled spending
   funded"** (it read "Success probability"), with a short note that adaptive strategies may cut spending; the Monte Carlo
   summary shows the median and 10th-percentile real spending in the final projected year. The engine supplies them as
   `finalYearRealSpending: { median, q10 }` on a valid Monte Carlo result: each valid path's final-row spending divided by the
   inflation factor at that row's opening (the price level the year's spending is set at: an inflation-matched $40,000 reads
   $40,000), the median and 10th percentile by the engine's `quantile()`. Absent on simple and historical results and removed from
   an invalid one. The insight text "compare success probability" follows the label.
4. **MC-B: the reserve is the household's.** The share is `min(1, spending × years / portfolio total)`, the same for every
   account; it was `min(account balance, spending × years) / portfolio total`, so an account smaller than the reserve
   under-reserved.

## The checklist

**C6, the readers.** `src/engine.js`, `src/scenario-validator.js`, `src/app-shell.html`, `tools/` and `tests/` were searched for
every reader of each rule, field, function, label and id the round changes.

| reader (at `ba9946d`) | today | R46 | condition |
|---|---|---|---|
| `accountReturnForPeriod()` engine.js:3721, the draw | `accountVolatility(ac)·normal(random)` per account | the account's share of the period's shared shocks | mc |
| its callers: early rates :4048 (a transfer inside the year), the year's rates :4144, a created destination :4546 (suppressDraw) | pass `random` | pass the row's shocks, drawn once at the top of the row; :4546 takes them too (Q19) | mc |
| `random` elsewhere in `simulatePlanRows()` | — | consumed by nothing else (searched: `random` appears only in these calls); the care stream is separate | — |
| `accountVolatility()` :2299 | read by the draw and by `optimizedAccountScore()` :2307 (the down-year ranking) | its weights move into `accountRiskWeights()`, arithmetic unchanged; the ranking keeps reading it | none moves |
| the policy return signal (SA-03), the decision clock's prior return, `growAccounts()` | read `rates` | unchanged logic; the values they read move with the draws | mc |
| `advanced.correlation` | `accountVolatility()`; validator range check (WARNING); the app's input clamp [−1, 1]; `tests/lib/scenario-generator.js` extracts the validator's `checkRange` bounds for it | the refusal (both layers); no new `checkRange` call, so the generator's bounds are unchanged | refusal |
| the reserve blend :3721 (`rowReserveSpend` :3929 sizes it) | `min(ac.balance, R)/T` | `min(1, R/T)` | reserve |
| `optimizedAccountScore()` reserve bonus :2307 | reads `reserveOn` | unchanged | — |
| `aggregateMonteCarloRuns()` :4800 | — | adds `finalYearRealSpending`; `applyInvalidResultContract()` :4764 removes it | label |
| app label `src/app-shell.html`:428; insight :945 "compare success probability" | "Success probability" | "All modeled spending funded" + note + summary line (`v2-stat-final-spending`) | label |

**What pins those (the R45 lesson).**
- **The old label text** "Success probability": no test or tool pins it (searched the whole tree: only `src/app-shell.html` and the
  built `investment-calculator-v2c.html`). The stat's id `v2-stat-success` and its `\d.\d%` text are pinned by nine test files
  (`audit-q51-q52-app-bounds`, `-q58-strategy-load`, `-r2-cash-settlement`, `-s5aa-r37-mc-guidance`, `-s5aa-r37-plan-warnings`,
  `-s5aa-r40-later-tax-years-card-rendered`, `public-route-sa05-app`, `regression-suite`): both are kept.
- **Form inputs, `staticIds`, `defaultPlan`:** unchanged (no new input).
- **The Worker list** (`workerFunctions`, app-shell:627): the new top-level helpers `monteCarloPeriodShocks`,
  `monteCarloAccountShock`, `accountRiskWeights`, `activeAssetClassIndexes`, `infeasibleCorrelation` join it in the same commit
  (SA45-A); they are exported for the tests.
- **Validator messages:** one new code; the correlation range WARNING's text is unchanged (upgraded in place only where Monte Carlo
  reads the correlation). `tests/lib/scenario-generator.js` regex-reads the validator's `checkRange` calls (no new one is added).
- **The result's shape:** a new top-level key on a valid Monte Carlo result. `tools/result-contract.json` lists it under
  `topLevel.optional` (as `identity` and the invalid path counts are), so `S-EXACT-KEYS` accepts it; `contractVersion` stays 5 on
  R40's reasoning (no row field, unit, basis or invariant changes) — **the owner may prefer version 6** (recorded in the build
  report). `tools/capture-baseline.js` `FIELD_COUNTS.monteCarlo.topLevel` 18 → 19, which `worker-parity` (Worker result's key
  count), `schema-catalogue` (live catalogue against `FIELD_COUNTS`) and `capture-baseline.test` (a capture's `meta.fieldCounts`)
  read. `RESULT_CONTRACT.md` gets an R46 subsection naming the refusal and the key (R43's test holds it to S5AA's codes).
- **Generated seeds the refusal reaches:** `tests/lib/scenario-generator.js` seeds 21, 54, 67, 70, 78, 111 (inside
  `scenario-generator.test`'s 1–120 validity batch) and 100010 (inside `near-miss-survivor-sweep`'s 100000–100059) are Monte
  Carlo plans with asset classes on, three active classes and ρ from −0.51 to −0.8 (scan:
  `r46_corpus_scan` lists the corpus; the seed ranges were scanned the same way). They join `tests/lib/decided-refusals.js` under
  `INFEASIBLE_CORRELATION` (adaptation by intent). Seeds 531 and 566 are refused too but no test validates that range. No corpus
  seed (1–20) is refused.

**C1.** The scans call the engine where it decides. `prediction/r46_instrument.js` compiles the base tree's own `src/engine.js` in
memory with probes on the exact expressions R46 replaces (the per-account draw, the suppressed draw, the reserve blend), so a
draw, a suppressed draw or a reserve blend is seen on every route the engine takes. Active classes are read with the engine's
`accountGlideWeights()`. Each Monte Carlo plan's path 0 is checked against `runPlan(runs: 1)` (all pass).

**C2.** Not a limit repair.

**C3.** The reserve condition requires the engine's own reserve blend to run for an account whose balance is below
`min(R, T)`; an account with a zero balance is listed separately ("empty": its rate changes but a zero balance grows by nothing
unless money arrives before growth).

**C4 (A-11).** Every Monte Carlo plan with asset classes on is exposed on every path. With asset classes off, a path is exposed
when some row did not draw exactly one normal, or a draw was suppressed; a path that drew exactly one normal in every row keeps its
numbers, because the household shock is the period's first normal, which is what its one account drew, at the same volatility. The
test is a necessary condition. Each plan is predicted as "named, with its exposed paths; the published result may move".

**C5.** The deterministic movers' directions and sizes come from the base engine with only the reserve line replaced by the
owner's formula (`r46_instrument.js { newReserve: true }`), and one row is traced by hand (below).

**C7.** Each witness's control is beside it in the test file and passes on `ba9946d`; every repair case fails there with the
pre-repair figure (`witness_runs/r46_tests_at_ba9946d.txt`).

**C8, how each comparison reads the moving fields.**
- **Control 4.7** (`control-corpus.test.js`) compares today's capture of the 36 control plans with the stored control capture leaf
  by leaf (`differential-harness.js compareSnapshots()`), and holds every difference to `tools/control-candidate-prediction.json`.
  A moved figure is a `VALUE` difference at its path; the new Monte Carlo key is an `EXTRA_FIELD` at `finalYearRealSpending` in
  each Monte Carlo entry, so `seed:17`, whose figures do not move, still shows one difference. The declarations for the moved
  plans are replaced from the measured comparison, with a `changes` entry, in the repair commit (as R43 and R44 did).
- **The expanded capture** stores each whole result (`capture-baseline.js captureEntry()`, `stripExcluded()`); its entry hash
  moves with the new key as well as with any figure. The comparison after the build therefore reads both: the entry hash
  (`cmp_exp.js`), and the results compared with `finalYearRealSpending` set aside, field by field.
- **Golden fixtures** (`tests/fixtures/golden-scenarios.fixtures.json`) pin a summary (row count, failed, success, lifetime taxes and
  contributions, three rows' balances) of five plans. `monte-carlo-fixed-seed` is the corpus's golden Monte Carlo plan (exposed);
  `reserve-and-bond-tent` has the reserve on but no account below the reserve in any row (not flagged).
- **Tests:** the exposure file names every test plan run through `src/engine.js`.

## Predictions

### 1. The corpus

`prediction/r46_corpus_scan.js` on `ba9946d` (`prediction/r46_corpus_scan_at_ba9946d.txt`). Control composition: 10 plans listed;
expanded: 11.

**Monte Carlo (rule 1), C4:**

| plan | asset classes | exposed paths | prediction |
|---|---|---|---|
| `golden:monte-carlo-fixed-seed` (control, expanded) | off; 3 accounts (3 normals a row) | 500 of 500 | named, all paths exposed; the published result may move |
| `seed:9` (control, expanded) | on, ρ 0.39, stocks/bonds/cash active | 52 of 52 | named, all paths exposed; may move |
| `expansion:monte-carlo-sensitive-band` (expanded) | off; 3 accounts | 500 of 500 | named, all paths exposed; may move |
| `seed:17` (control, expanded) | off; 1 account, one normal in every row, no suppressed draw | 0 of 24 | **no path changes**; only the new `finalYearRealSpending` key is added |

Expected direction, for information only (A-11 does not require it): the three multi-account plans lose their accidental
diversification, so their spread widens and success can only hold or fall; the golden plan succeeds at 100%, seed:9 at 100%, seed:17
at 4.17% and the sensitive-band member at 84.6% at `ba9946d` (`prediction/r46_monte_carlo_published_at_ba9946d.txt`).

**Refusal (rule 2):** no corpus plan is refused (seed:9's ρ 0.39 is feasible; no other corpus plan is a Monte Carlo plan with
asset classes on).

**Reserve (rule 4), C5:**

- **`seed:1` moves** (simple; reserve 5 years; retired at 53; four accounts with no allocation; return 5.43% less a 1.2% fee).
  An account sits below `min(R, T)` in the rows opening at 53–59, 63 and 67–70 (and empty accounts at 60–62, 64–70).
  *Hand trace, the row opening at 53:* the HSA holds $274,456.59 against a reserve of $331,017.78 in a $2,347,837.03 portfolio.
  Its share was 274,456.59 / 2,347,837.03 = 11.69% and becomes 331,017.78 / 2,347,837.03 = 14.10%. Its rate after the fee was
  4.23% × 0.8831 + 3% × 0.1169 = 4.086% and becomes 4.23% × 0.8590 + 3% × 0.1410 = 4.057%: about $81 less growth in that row.
  The other three accounts hold more than the reserve and are unchanged. **Direction: down** (the return after the fee, 4.23%, is
  above the reserve's 3%). **Size:** the base engine with the owner's formula moves the rows from age 54 and the final total by
  **−$1,737.95** ($3,342,726.78 → $3,340,988.84); lifetime taxes unchanged ($35,905.83).
- **`seed:12` moves** (simple; reserve 1 year; constant-percentage; two HSAs with allocations; return 8.46% less 1.13%). The smaller
  HSA ($88,529.26) sits below the reserve ($111,930.28 of $1,367,360.57) in the row opening at 39, and empty accounts later.
  **Direction:** that account's rate falls (return after fee 7.33% > 3%). **Size:** the base engine with the owner's formula moves
  the rows from age 40; the final total is $0.00 either way and lifetime taxes are unchanged ($9,479.47).
- **Not moved:** `golden:reserve-and-bond-tent`, `seed:2`, `seed:4`, `seed:5`, `seed:16` have the reserve on with every account
  above `min(R, T)` in every reserve row.

**Every other corpus plan is unchanged** in its figures (no Monte Carlo, no reserve).

### 2. The tests

`prediction/r46_test_exposure_hook.js` over the 285 test files that mention Monte Carlo, the reserve, the corpus, the generator or
the golden scenarios, on `ba9946d` (`prediction/r46_test_exposure_at_ba9946d.txt`, with the raw lines in `.jsonl`).

- **Expected to fail and be adapted by intent:**
  - `golden-scenarios` — the `monte-carlo-fixed-seed` fixture (regenerated by `tests/generate-golden-scenarios.js`; only that entry
    may change; before and after recorded).
  - `monte-carlo-sensitive-band` — likely: its member is the golden plan at a declared spending step chosen as the first in the
    [50, 85] band; with the golden plan's spread widened the declared step may leave the band. If so the declared rule is re-applied
    (family version 8), which changes the member's spending, an expanded-corpus input (as R43 did); recorded.
  - `worker-parity`, `schema-catalogue` — through `FIELD_COUNTS.monteCarlo.topLevel` 18 → 19 (the definition changes in
    `tools/capture-baseline.js`; the tests read it).
  - `scenario-generator` (the 1–120 validity batch) and `near-miss-survivor-sweep` — the refused seeds join
    `tests/lib/decided-refusals.js`.
  - `control-corpus` 4.7 — the declarations for the moved control plans (golden MC, seed:9, seed:1, seed:12; seed:17's new key).
- **Expected to pass unchanged:** `rng-seeding` (its two-account sample plan moves, but every assertion compares the engine with
  itself under the documented seeding, or two paths or seeds with each other); `audit-s5aa-r20-glide-one-allocation` (the glided
  and the static 20/80 account receive the same class shocks); `audit-s5aa-r43-seeds-contract-history` (a not-equal between seeds);
  RA-02's internals (a generator passed directly keeps its contract); the decision-clock tests (a constant generator gives one
  z-score per period whatever the count); `audit-s5aa-monte-carlo-invariants` and every file whose Monte Carlo plans draw one normal
  a row (listed in the exposure file); the conservation invariants (`household-ledger`, `reconciliation-invariant`,
  `networth-reconciliation`), whose identities do not depend on the rates.
- **Exposed, outcome to be measured:** `audit-cl-findings`, `audit-q67-prototype-named-asset-class`, `audit-rb-findings`,
  `audit-s5aa-r23-roth-flag-follows-draws`, `audit-s5aa-r7-executed-succession`, `audit-sa03-return-signal`,
  `boolean-flag-contract`, `build-routes`, `debug-module`, `device-benchmark`, `result-contract`, `corpus-*`, `capture-*`,
  `debt-classes`, `audit-ra04-baseline-integrity`. A failure here that pins an exposed figure is adapted by intent and recorded;
  any failure not named above is reported as a miss.

### 3. The witnesses

`tests/audit-s5aa-r46-monte-carlo-and-reserve.test.js`, 28 cases (SHA-256
`0238a09175b4b696b6982a463993679289e33a8f9a6ebc12ebb4eb20df23c30f` at the pre-repair run). On `ba9946d` the 20 repair cases fail
with the pre-repair figure and the 8 controls pass:

| case | expected (hand-derived) | at `ba9946d` |
|---|---|---|
| ρ 0.5, 60/40: one-year return from the period's draws | $1,061,604.77 | $1,030,500.37 |
| ρ −0.3, three classes: symmetric square root | $1,078,759.80 | $1,036,205.43 |
| classes off, two accounts share `z_h` | $1,025,158.28 | $1,014,447.43 |
| two classes at ρ 0.6: sample correlation over 2,000 paths | 0.6 ± 0.05 | −0.0201 |
| AA1: one $1M Roth vs twenty $50,000 | equal success | 59.8% vs 99.2% |
| reversed order / an empty account (classes off; on) | identical | 76 vs 75; 87.67 vs 84 |
| twenty 60/40 accounts (classes on) | identical | 74 vs 100 |
| Q19: created vs pre-existing destination under Monte Carlo | identical | $1,103,651.81 vs $1,103,541.69 at 76 |
| ρ −0.5 over five held classes; a held sixth class at −0.25; the glide's class at −0.6; ρ 1.2 | refused by both layers | run |
| reserve share for a $50,000 account | 6.52% | 6.8% |
| reserve above the portfolio | 3% | 5% |
| reserve, one $1M vs twenty $50,000 | identical | $1,023,916.59 vs $1,026,662.37 after a year |
| final-year real spending (income-first; constant-percentage) | $40,000 / the per-path quantiles | absent |
| app: label, note, summary (Monte Carlo); label, no summary (simple) | "All modeled spending funded" | "Success probability" |
| controls: one account classes off; AA1 one account 59.8%; simple-mode order invariance; ρ −0.25 zero spread ($1,469,328.08); ρ 0 spread, −0.2499 runs, simple not refused; whole-portfolio account 6.52%; accounts above the reserve unchanged; simple result has no summary | as before | pass |

After the repair every case passes. A case whose derivation proves wrong in the build is corrected and recorded as a miss.

### 4. The gate and the browser

- **Gate:** run by the coordinator; this round runs only targeted test files. Closeout 12/0/0 expected.
- **Browser:** the round's candidate repeats task 6.5 (A-04) when the coordinator integrates it; the three Monte Carlo plans that
  differ from Node by at most 5.57 × 10⁻¹⁵ relative at R45 are expected to remain within that order.
