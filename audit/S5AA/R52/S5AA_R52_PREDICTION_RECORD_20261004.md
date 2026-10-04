# S5AA R52 — prediction record: the repairs for ChatGPT's R46–R51 audit

*Written by Claude on 2026-10-04, 4:30 am Arizona time (UTC−7). Committed before any `src/` edit (A-01), and held to
`audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md`. Base: `sprint/s5aa-r52` at `2fb8c6f` (main: the R51 source,
tag `s5aa-r51-source` = `ee06ea5`, plus records and one test-only fix). Control: `s5aa-r51-control` (not touched by this round).*

## The round

ChatGPT's audit (`audit/S5AA/R51/S5AA_R46_R51_EXTERNAL_AUDIT_AND_CLAUDE_HANDOVER_20261004.md`, §2) confirmed four P2 findings.
The owner's decisions of 2026-10-04, as the coordinator handed them to this round, plus one finding of the coordinator's:

1. **R47-01, traditional first.** One consumed annual IRA-capacity ledger per owner. The year's unused room absorbs the carried
   traditional excess first; the absorbed amount is a deemed contribution of the year (IRC 219(f)(6)). The Roth carried excess is
   reduced only by the room left after that. HSA room stays its own limit. The traditional and Roth phase-outs and the deduction
   treatment are kept.
2. **R47-02, fix fully.** Each owner's pre-tax workplace deferrals are attributed to that owner's own salary, employment streams and
   SE profit before the household is summed (Treas. Reg. 1.199A-3(b)(1)(vi)). The within-owner proportional convention is kept. The
   corrected amount reaches everything that reads `qbiCut`.
3. **R48-01, allow it and carry the basis.** A scheduled transfer that moves traditional-IRA value between Form 8606 pools carries
   basis × moved ÷ the source pool's value on the date, and updates the receiving pool before any later draw. The validator accepts a
   transfer from the deceased's traditional IRA into the survivor's own traditional IRA dated after the death, mirroring the engine's
   dated succession. Every other between-owner refusal stays.
4. **R50-01, fix fully, with the true-up.** At settlement each owner's conversion record for the year is reconciled with the final
   Form 8606 allocation, scheduled-transfer conversions included. Distributions already taken that year from those records are
   re-split, and their 10% is trued up through the existing ledger. Contribution basis stays distinct from conversion principal.
5. **The two R50 disclosures become cards.** `ROTH_IRA_BASIS_NOT_ENTERED` and `ROTH_FIVE_YEAR_ASSUMED` join the app's
   `planWarningTitles` (the owner's R49 decision: engine disclosures shown as cards).

### How each rule is built (definitions, before the edit)

- **1.** In the 4973 loop (`engine.js` ~4948), per owner, the kinds run trad, roth, hsa as today:
  - the traditional pass records `absorbedT = min(leftT, roomT)`, where `leftT` is the carried excess after the year's distributions
    and `roomT = roomFor4973(o, "trad")`;
  - the Roth pass, when `absorbedT > 0`, reduces by `max(0, min(roomR, roomT − absorbedT))` instead of `roomR`.
  `roomR ≤ roomT` always (the Roth room is the combined room capped by the Roth limit). So `min(roomR, roomT − absorbedT)` is
  exactly 408A(c)(2)'s room once the deemed traditional contribution counts as a contribution of the year. When `absorbedT = 0`
  nothing changes, bit for bit. HSA is untouched. The deemed contribution earns no deduction here (the deduction treatment is kept).
- **2.** Per-owner tallies of `preTaxDeferrals` and `workplacePreTaxDeferrals`, kept beside them where they accumulate, keyed by
  the account's owner (`spouse`, else `self`). Then
  `qbiCut = Σ_o min(max(0, D_o − W_o), S_o) × (SE_o / S_o) × min(1, Dwp_o / D_o)`, where for owner o:
  - `D_o` is the owner's pre-tax deferrals (HSA payroll included, as today) and `Dwp_o` their workplace part;
  - `W_o` is the owner's salary pay (`salary × selfWorkDuration` or `spouseSalary × spouseWorkDuration`);
  - `S_o` is the owner's employment plus SE streams and `SE_o` their SE streams.
  A household where one owner holds every deferral and the other has no salary or streams gives today's figure bit for bit. Every
  reader takes the variable, so nothing else is edited.
- **3.** Right after `moveFunds()` in the scheduled transfer: when the source and destination are traditional IRAs with different
  `iraPoolKey()`s and money moved, `basisMoved = basis(src) × min(1, moved / datedPools[src])`. Here `datedPools` is the transfer's
  own measure of each pool on the date, taken before the move. `basisMoved` comes off `iraBasisState[src]` and goes onto
  `iraBasisState[dst]`. The same amount moves between the two pools' `iraBasisAtRowStart` figures, so the year's settlement treats
  it as basis that belonged to the receiving pool for the year. A draw earlier in the row has already spent its provisional share;
  the source's settlement then settles that draw on what is left. Validator: `validateTransferEndpoints()` skips
  `TRANSFER_BETWEEN_OWNERS` only when all of these hold:
  - both accounts are traditional IRAs;
  - the plan has a spouse;
  - at the opening of the transfer's row, the source's original owner is dead and the destination's alive. The row is the first row
    (its start) or the whole age of the primary below the transfer date, within the engine's 0.0001; dead means the lifespan is
    below the age, as in `householdSurvivorship()`.
- **4.**
  - **Tally.** `rothRecordConversion()` gains the source account. Each row, the ledger keeps a tally of the year's conversions per
    Roth owner per IRA pool (amount, provisional nontaxable). `rothIraTake()` also returns the taxable and nontaxable dollars it took
    from this tax year's records. `rothIraDistribute()`, the real draws only (the quote's copy keeps no tally), records each such
    take with its 10% rate (0 when qualified).
  - **Settlement.** After the Form 8606 settlement, a new `rothSettleConversions(L, settledIra)` runs. For each owner,
    `delta = Σ_pool (amount × settled fraction − provisional nontaxable)`, over settled pools; a pool not settled has neither basis
    nor a delta. When |delta| > 1e-9, the year's records (with what was taken from them) are re-formed with taxable `T* = T − delta`.
    The year's takes are re-split taxable-first, in order (1.408A-6 A-8(b)(2)(ii), conversions within a year aggregated, A-9(c)).
    The rest stays as one record of the year.
  - **True-up.** The 10% difference `Σ (tx*_i − tx_i) × rate_i` joins `iraTrueUp` (owed or refunded next row) and the row's
    `taxSettled`, as the settlement's own difference does.
  - **What stays.** No delta, no change, bit for bit. Contribution basis (`L[o].basis`) is never touched.
  - **Worker.** The new top-level function joins `workerFunctions` and the exports.
- **5.** `planWarningTitles` gains `ROTH_IRA_BASIS_NOT_ENTERED: "Roth IRA contribution basis"` and
  `ROTH_FIVE_YEAR_ASSUMED: "Roth IRA five-year period"`.

## The checklist

**C6, every reader** (searched at `2fb8c6f`).

| rule changed | reader | condition / check |
|---|---|---|
| 4973 room (1) | `roomFor4973()` (only in the loop); `excess4973` carried (read only in the loop); its output `excise4973` → `iraTrueUp`, `taxTrueUpCarried`, row `taxSettled`, `taxOutstanding`, `lifetimeTaxes`, next row's `trueUpDue` and its funding | `excess` tap: per row and owner, both kinds left > 0 and the Roth reduction falls under the R52 rule |
| | `auditContributions()` one-time route (`roomFor4973`, `transferRoom`): unchanged | — |
| | validator, app: no 4973 mirror or text (searched "4973", "excise") | — |
| `qbiCut` (2) | the IRA-deduction estimate `preIra` (AGI and MAGI do not depend on QBI), the row estimate `taxes` → `taxCtx.qbi` → the funding quote (`taxSegmentLocal()`, `verifyQuoteObligation()`), the committed return, the settlement re-estimate `taxesSettled`, R51's working-years `workStreamTax` | `qbi` tap: the R52 figure beside today's in every row; the row estimate priced with both |
| | `estimateTaxes()` → `estimateTaxesForYear()`'s `qbiReduction`, through the prior-income wrapper | follow the variable |
| | `estimateTaxes()` calls without `qbiCut` (the wage-only `baseline`s, the marginal-rate helper at 929): no SE profit, unchanged | — |
| | app Rules text on QBI ("20% of the profit less half its self-employment tax"): does not name deferrals (R47 left it); not changed, noted for eb | — |
| IRA pools on a transfer (3) | `iraBasisFractionFor()` (quote), `iraBasisRecoveredFor()` (draws, conversions, transfers out), the settlement (`iraBasisAtRowStart`, `settleIraYear()`), the automatic election (inherited basis by share), the succession hand-off, QHFD basis (`datedPools`), the IRA → 401(k) cap (`rollTaxable`) | `pool` tap: a traditional IRA → traditional IRA transfer across pools that moves money while the source pool holds basis |
| | validator `validateTransferEndpoints()` → `TRANSFER_BETWEEN_OWNERS` | `r52TransferAccepted()` on every corpus plan and every validator call in the tests |
| | app `renderPlanChecks()` (WARNING severity only; does not gate on errors): unchanged | — |
| Roth conversion ledger (4) | `rothIraDistribute()` (the draw, a transfer out), `rothQuotePieces()` (the quote, on a copy), `rothNextDollarWeight()` (the optimizer), `rothLedgerSuccession()`, `rothLedgerCopy()`, `noteRothLedgerDefault()` (the two disclosures), the Worker list | `conv` tap: a settled pool whose conversion's settled nontaxable part differs from the ledger's; with every later Roth IRA draw of that owner (year, qualified, 10% rate), and whether the plan's order is rule-based |
| `planWarningTitles` (5) | `renderWarnings()` | jsdom witness; the R48 and R49 tests read the list with `[^}]*` (still matches) |

**Pins searched (the R45 lesson):**
- **Validator messages:** none change (the `TRANSFER_BETWEEN_OWNERS` text stays; only when it is raised).
- **Form labels, input ids, `staticIds`:** none change.
- **`defaultPlan`:** does not change.
- **`workerFunctions`:** one new engine function, `rothSettleConversions`, joins the list and the exports.
  `audit-q15-worker-dependencies` and `worker-parity` hold the list.
- **`planWarningTitles`:** read by:
  - `audit-s5aa-r48-medicare-survivors-arizona` (the IRMAA title listed once) and `audit-s5aa-r49-spending-debt-disclosure` (the
    nine R49 codes present, each once): both still hold;
  - `rendered-results-warnings` (three named cards): unaffected.
- **jsdom files reading `v2-warnings`:** none of their plans raise either Roth code that I can see. They are not visible to the
  exposure hook, so they are run after the build: `audit-q51-q52-app-bounds`, `-q58-strategy-load`, `-r2-cash-settlement`,
  `-s5aa-r17-…`, `-r18-…`, `-r19-app-shows-final-tax-balance`, `-r37-mc-guidance`, `-r37-plan-warnings`,
  `-r40-later-tax-years-card-rendered`, `public-route-sa05-app`.
- **Which plans raise the codes:** the default plan raises neither (`PROJECTION_ENDS_AT_LAST_DEATH` only). In the corpus:
  - `golden:monte-carlo-fixed-seed`, `seed:9` and `expansion:monte-carlo-sensitive-band` raise `ROTH_IRA_BASIS_NOT_ENTERED`;
  - `seed:3` raises both;
  - `targeted:survivor-stateful` raises `ROTH_FIVE_YEAR_ASSUMED`.
  This matters only to the app; engine output does not change.

**C1.** Every condition reads the engine's own state through read-only taps (`prediction/r52_mirror.js`, `tests/lib/engine-variant.js`).
The variant's rows, success rate and issues are asserted equal to the real engine's on every corpus plan (all paths). Each R52 figure
is computed on the state the engine used:
- `roomFor4973()`'s two rooms;
- the deferrals as `lawfulC − rothCatch` at the line that sums them;
- the dated pool and basis at the transfer;
- the conversion amount, the provisional and the settled fraction at the settlement.

After the build, the witnesses and a re-run of the scan on the repaired tree check the engine's figures against the rules.

**C2. A limit moves only what is deposited.** Repair 1 is a limit repair. Its condition requires carried excess of both kinds
actually left after the year's distributions, and room > 0 (computed only when the traditional excess is > 0). Under `redirect` no
excess exists (`x4973` taps are recorded only under `warn`).

**C3. A flow must flow.**
- `qbi` requires SE profit and deferrals in the row; the reach counters (`seRows`, `seAndDeferralRows`) count them.
- `pool` requires money actually moved.
- `conv` requires a conversion that moved money and a settled pool.

**C4. Monte Carlo (A-11).**
- The scans run every path of the four Monte Carlo corpus plans (3 control, 4 expanded) with their own seeding.
- **No Monte Carlo plan is exposed to any of the four rules:** no path has a `warn` excess, SE profit, a pool-changing transfer, or a
  conversion whose settled split differs. So no Monte Carlo plan is named and no path is predicted to change.
- The card change does not touch the engine.

**C5.**
- **Direction and size** of each repair are hand-traced in the witness derivations (below and in the test file).
- **Corpus movement:** the only flagged plans are three conversion-ledger plans, traced by hand below (predicted: captured output
  unchanged).

**C7.** Each repair has its positive cases and near-miss controls in the witness file. Every control passes on `2fb8c6f`, and every
repair case fails there with the pre-repair figure (`witness_runs/r52_tests_at_2fb8c6f.txt`).

**C8, how each comparison reads the moving fields.**
- **The expanded capture** compares every result field entry by entry by hash (rows with `taxSettled`, `taxOutstanding`, issues with
  their text, Monte Carlo aggregates). A float difference in the last bit counts.
- **Control 4.7** (`s5aa-r51-control`, `tools/differential-harness.js`) compares the stored capture with a live capture field by
  field. It records issues and `limitWarnings` by their length and refuses a comparison across changed inputs. R52 changes no input
  and no message.
- **The golden fixtures** pin named result fields of the five golden plans.
- **The 20 ChatGPT simulations** compare named row fields against independent figures.

## Predictions

### 1. The corpus (`prediction/r52_corpus_scan.js`; output `r52_corpus_scan_at_2fb8c6f.txt`)

| rule | control (36 plans) | expanded (71 plans) | reach in the corpus |
|---|---|---|---|
| 1, carried excess | **no corpus exposure** | **no corpus exposure** | no corpus plan uses `limitPolicy: "warn"` |
| 2, QBI attribution | **no corpus exposure** | **no corpus exposure** | no corpus row has SE profit (`seRows` 0) |
| 3, basis on a pool change | **no corpus exposure** | **no corpus exposure** | 8 / 11 plans transfer; none between traditional IRAs of two pools |
| 3, validator | **no corpus exposure** | **no corpus exposure** | no corpus plan is refused for `TRANSFER_BETWEEN_OWNERS` and accepted under R52 |
| 4, conversion ledger | **no corpus exposure** | **3 plans flagged** (below) | 21 conversion records, 65 settled pools, 1,051 Roth IRA draws |
| 5, cards | no engine change | no engine change | — |

The three expanded plans whose ledger changes (none in the control composition):

- **`expansion:s5aa-r6-gap-basis-conversion`.**
  - *Exposure:* tax year 2's $10,000 conversion settles $3,881.41 nontaxable where the ledger kept $3,995.31 (delta −$113.90: the
    record's taxable part rises from $6,004.69 to $6,118.59).
  - *Readers:* no Roth IRA draw happens in the horizon (the Roth balance rises by its 4% every row, 50 → 70). The plan's order is
    rule-based, so `rothNextDollarWeight()` reads the ledger. It reads the first record with a taxable part, and the taxable part of
    every record stays positive before and after.
  - *Predicted:* **captured output unchanged.**
- **`expansion:s5aa-r19-ira-contribution-conversion-same-year`.**
  - *Exposure:* tax year 0's $3,750 conversion settles fully nontaxable where the ledger kept $0 (the record goes $3,750 taxable →
    $3,750 nontaxable).
  - *Readers:* manual order. The Roth balance stays at $2,757 after the first row, so no Roth draw; no early draw in the conversion's
    five years.
  - *Predicted:* **captured output unchanged.**
- **`expansion:s5aa-r19-ira-conversion-and-qcd`.**
  - *Exposure:* tax year 1's $5,000 conversion settles $4,000 nontaxable where the ledger kept $2,000.
  - *Readers:* manual order. The owner is 70+ (no 10% at any rate), and the Roth balance is constant after its conversion, so no draw.
  - *Predicted:* **captured output unchanged.**

**Predicted for the corpus: no expanded entry and no control entry changes.** No issue text changes; no input changes. Control 4.7:
nothing to declare. Golden fixtures: unchanged. A moved entry is a miss.

### 2. The tests (`prediction/r52_test_exposure_hook.js`, run by `r52_run_exposure.js`)

**How it ran.** On a clean scratch worktree of `2fb8c6f`: 443 files, 37 batches of 12 at concurrency 3. Log
`r52_test_exposure_log_at_2fb8c6f.txt`; exposed calls in `r52_test_exposure_at_2fb8c6f.jsonl`. With the hook loaded, 4 batches failed
for reasons of the hook itself, the same ones R51's hooks met: the `toJSON` call counts (`audit-bc02-clone-once`,
`audit-q80-flag-defaults-serialize-once`, the supported-hook counts in `audit-s5r01-*`) and the capture-process module list
(`capture-boundary`). They pass without it.

- **excess, qbi, pool, validator:** **no test plan is exposed.** R47's and R48's own witnesses exercise one kind of excess at a time,
  single-owner or own-salary QBI, and living-owner refusals (`audit-s5aa-r32-rollovers-stay-with-the-owner`, still refused). **All
  expected to pass.**
- **conv (6 files):**
  - The three corpus plans above, through `networth-reconciliation`, `corpus-composition`, `build-routes` and `household-ledger`:
    invariants, pins and parity, **expected to pass** (their output is predicted unchanged).
  - `audit-s5aa-r19-workstream-a-ira-settlement` (the two r19 plans): reads the settled income and basis, which do not change.
    **Expected to pass.**
  - `corpus-configured-paths` (16 toggled variants): one variant is exposed with an early Roth draw (`prediction/r52_r19_toggle_probe.js`):
    `expansion:s5aa-r19-ira-contribution-conversion-same-year` with `advanced.penaltyException` turned off, a $1,104.17 Roth draw
    inside the conversion's five years. Its 10% falls (the conversion is principal), so in that plan turning the exception off may no
    longer move rows. `penaltyException` still executes in `seed:19` and `expansion:s5aa-r6-gap-basis-one-owner-draw`
    (`prediction/r52_penalty_exception_paths.js`); neither is exposed. So the path stays executed and the pinned gap list does not
    move. **Expected to pass.**
- **The Worker list:** `audit-q15-worker-dependencies`, `worker-parity`, `tax-withdrawal-gross-rate-removed`,
  `audit-q48-nonserializable-input` and `audit-sa05-shared-eligibility` read it. **Expected to pass** with the new function listed.
- **The jsdom files named under C6:** expected to pass.
- **Every other test is expected to pass.** A failure not named here is a miss.

### 3. The witnesses

**Files.**
- `tests/audit-s5aa-r52-audit-repairs.test.js`: 29 cases, SHA-256 `47497748600de872d1307f3f101954f2a00f9944835aa19c1de236515200eb81`.
- `tests/audit-s5aa-r52-app-cards.test.js`: 5 cases, jsdom, SHA-256 `7d8f7e19b80c9dcd87ec7429629d0e81ae377d5c66d02f6678b014b3860e86fe`.

Both are run on `2fb8c6f` (`witness_runs/r52_tests_at_2fb8c6f.txt`): **26 fail with the pre-repair figure, 8 controls pass.**

**R47-01: the carried excess.**

| case | expected (hand-derived) | at `2fb8c6f` |
|---|---|---|
| S06: year-2 excise | 300 | 150 |
| + a $2,000 traditional contribution in year 2 | 420 | 270 |
| + a $1,000 Roth distribution in year 2 | 240 | 90 |
| two traditional accounts | 300 | 150 |
| with an HSA excess beside (year 1 $810) | 300 | 150 |
| controls: Roth alone; traditional + HSA; the other spouse's room | 0 / 0 / 0 | pass |

**R47-02: QBI attribution.**

| case | expected (hand-derived) | at `2fb8c6f` |
|---|---|---|
| S07 tax | 35,912.62418 | 35,032.62418 |
| both owners defer | 40,024.530225 | 39,144.530225 |
| salary + employment + SE inside one owner | 34,223.551468 | 33,798.218135 |
| quote and commit: grossed-up IRA withdrawal | 63,858.968214 | 62,515.456763 |
| working-years shortfall | 712.62418 | no warning |
| controls: single earner 13,629.1989; spouse defers from own salary 35,032.62418 | as stated | pass |

**R48-01: basis on a pool change, and the validator.**

| case | expected (hand-derived) | at `2fb8c6f` |
|---|---|---|
| S10 AGI | 30,000 (tax 1,767.50) | 37,500 |
| partial move | 30,000 | 33,750 |
| inherited draw, then a late transfer | 0 then 30,000 | 0 then 35,000 |
| partial move, draw, election: AGI 49 and 62 | 0 and 0 | 3,750 at 49 |
| RMD reserve: AGI 76–78 | 0 | 3,000 at 77 |
| validator accepts S10 / partial / after a draw | valid | `TRANSFER_BETWEEN_OWNERS` |
| control: own taxable money + partial + election | AGI 37,500, tax 2,855 | pass |
| validator still refuses: before death, death row, Roth→Roth, own→deceased's | refused | refused; the engine refuses the death-row transfer (part of the validator case) |

**R50-01: the conversion ledger.**

| case | expected (hand-derived) | at `2fb8c6f` |
|---|---|---|
| S17: row 47 settled tax | 0 | 500 |
| mixed basis | 375 | 500 |
| two years' conversions | 0 | 1,000 |
| scheduled-transfer conversion: settled tax, Roth left | 0, 2,500 | 555.56 |
| pool grows after the conversion (late rollover in) | 138.89 | 0 |
| survivor takes the ledger | 0 | 500 |
| same-year draw: row 46 settled tax / outstanding | 55,670.235 / −2,487.50 | 56,170.235 / −1,987.50 |
| controls: pool falls after the conversion; past five years | 0 / 0 | pass |

**The cards.**

| case | expected | at `2fb8c6f` |
|---|---|---|
| titles in `planWarningTitles` | both | absent |
| card shown | `Roth IRA contribution basis:` at 50 with no basis; `Roth IRA five-year period:` at 60 with no first year | no card |
| controls: basis entered / first year entered | no card | pass |

A derivation that proves wrong in the build is corrected and recorded as a miss, never quietly re-expected. Before this commit, while
the cases were being set up, no expected figure was changed. Plan setups were adjusted where a case did not reach its path:
- the multi-conversion case moved from one year's two conversions to a scheduled-transfer case plus a two-year case, because the
  roth-first order funded the first row's tax from the Roth IRA;
- the loss control's conversion was cut to $5,000, so the $1 401(k) is not converted;
- the succession case draws by a transfer, not an expense;
- the RMD case's salary was raised to $400,000, so the contribution is nondeductible.

### 4. The 20 ChatGPT simulations

At `2fb8c6f` (`witness_runs/r52_chatgpt_sims_at_2fb8c6f.{txt,json}`): 16 pass. S06, S07, S10 and S17 fail:
- S06: 150 vs 300;
- S07: 35,032.62418 vs 35,912.62418;
- S10: the validator, plus AGI 37,500 / tax 2,855 vs 30,000 / 1,767.50;
- S17: 500 vs 0.

**Predicted after the build: 20 of 20 pass, and no passing case changes verdict.** The 16 passing cases are not exposed:
- none uses `warn` with both excess kinds, SE with another owner's salary, a pool-changing transfer, or a settled conversion whose
  split moves;
- S16's Roth draws are basis and earnings, S18 and S20 have no conversion, and S20's direct `rothNextDollarWeight()` call reads a
  fresh ledger.

### 5. The gate

Targeted runs only. The gate, the control declarations, baselines and tags are the coordinator's.

## Decisions recorded for the owner

- **D1 (R48-01, the validator's reach).** The owner's decision accepts only the deceased's traditional IRA into the survivor's own
  traditional IRA. The engine re-owns all the decedent's accounts at the succession, so its between-owner rule no longer refuses
  other post-death rollovers, and the validator still refuses them as `TRANSFER_BETWEEN_OWNERS`. They are:
  - a Roth IRA into the survivor's Roth IRA (checked on the base: the engine moves it);
  - a 401(k) into the survivor's 401(k), or an HSA into the survivor's HSA (not checked; the engine's other rules still apply);
  - the survivor's own IRA into the deceased's (checked: the engine moves it).
  This disagreement predates R52 and is unchanged by it. The witness pins the Roth IRA and reverse-direction refusals as the owner's
  decision.
- **D2 (R48-01).** A nondeductible contribution made in the transfer's year to the *source* pool is basis only at the year's
  settlement. A pool-changing transfer in that same year therefore carries only the basis that existed on the date; that year's
  contribution basis stays with the source pool. An edge, recorded as a limit.
- **D3 (R47-01).** The ledger is per owner. A spousal IRA's compensation base (219(c)) can draw on the other spouse's compensation,
  and a deemed contribution under 219(f)(6) by one spouse is not subtracted from the other spouse's room. An edge, recorded.
- **D4 (R47-02).** A joint-owned workplace account's deferrals are attributed to the primary person, as the engine keys owners
  elsewhere.
