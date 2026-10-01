# S5AA R44 — prediction record: the contribution routes (R43-01, -02, -03)

*Written by Claude on 2026-10-01 (Arizona, UTC−7). Committed before the R44 engine, validator and contract edits (A-01), and
held to `S5AA_R44_PREDICTION_CHECKLIST_20261001.md`. Base: `sprint/s5aa-r44` at `2559625`, which is `main` (`38640aa`) plus the
R43-04 records. The source is byte-identical to `s5aa-r43-source` (`5b8f0d5`).*

## The round

ChatGPT's R43 audit (PR #47) determined **NO-GO** on R43-01 to -04. It confirmed all 34 SA42F findings (one qualified) and
refuted none. The owner decided on 2026-10-01:
- **Repair R43-01, R43-02 and R43-03.**
  - For R43-01, the HSA limit is prorated in the row an owner turns 65, on **both** routes, following IRC 223(b)(1), (2),
    (3) and (7).
- **R43-04 is not accepted as a disclosed miss.** It requires the checklist and the proof on R43 (`2559625`). This record is
  the first held to that checklist.

## The repairs, as they will be built

- **R43-01, the HSA limit around 65.**
  - **The law:** the year's limit is the sum of the monthly limitations for the months before Medicare. Each is 1/12 of the
    annual amount, with the catch-up added (223(b)(1) to (3)); from the first Medicare month it is zero ((b)(7); Medicare
    at 65 is the model's assumption).
  - **Pub. 969's own example:** turning 65 in July, ($4,300 + $1,000) × 6 / 12 = $2,650.
  - **The model reads it per row:** an owner's share of the row before 65 is `clamp((65 − age at the opening) / row length,
    0, 1)`, and their limit is that share times (base + catch-up). The base is the shared family base; the catch-up is
    the owner's own.
  - **Planned route:** R43's flow stop is kept (the request flows only for the part of the window before 65). The base and
    catch-up rooms are now also held to the share. An amount over the prorated limit is a limit excess and is handled by
    the limit policy, as any other excess is.
  - **One-time route:** the room is the share times (base + catch-up), less what that owner's planned contributions used
    (and no more than the family base left).
  - At a share of 1 nothing changes. At 0 both routes give $0.
- **R43-02.** `transferRoom()` passes `incomeStartFactors` to `ownerCompensation()`, as the planned audit has since R43, so
  the one-time route reads a future stream at its latched today's-dollar amount.
- **R43-03.** `accounts[].matchRate`, `matchCap` and `profitShare` get `min: 0` in `src/plan-value-contract.json`. A
  negative value is refused by both layers: `OUT_OF_RANGE` in the validator, `SCENARIO_PLAN_VALUE_OUT_OF_RANGE` in the
  engine.

## The checklist

- **C6, the readers.** Found by searching `src/engine.js` and `src/app-shell.html`:
  - **The HSA limit** is read by `auditContributions()` on two routes:
    - the planned contribution, read by simulatePlan's per-row audit and by the app's contribution-limit cards;
    - the one-time contribution, read by `transferRoom()`.
  - **Compensation:** `ownerCompensation()` has two callers, the planned audit (latched since R43) and `transferRoom()`. The
    IRA deduction's compensation reads the row's other income, which is already latched.
  - **The three contract fields** are read by the validator's contract loop and the engine's input gate.

  Each reader has its own condition in `prediction/r44_corpus_scan.js` (h65p, h65o, comp, neg). The app's cards call the
  same `auditContributions()` and need no change of their own.
- **C1.** Ages, windows and the contribution test come from the engine's own helpers: `ownerContributionWindow()`,
  `accountPlannedContribution()`, `otherIncomeFor()` and `transferIsContribution()`.
  - The scan's first draft decided for itself what counts as a contribution and flagged `seed:5`. That plan's one-time
    transfer goes from one HSA to another, which the engine does not treat as a contribution (`transferIsContribution()`
    false). The draft was corrected before this record.
- **C2.** The planned condition needs the owner's contribution window open in the row. The one-time condition needs a
  transfer that is a contribution, in its row.
- **C3.** A stream counts only if `otherIncomeFor()` pays it in the row.
- **C4.** No Monte Carlo plan is flagged. Every condition depends on ages, dates and inputs only.
- **C5.** Each flagged plan's direction comes from the pre-repair engine run on an equivalent input
  (`prediction/r44_direction.js`):
  - **Under the default limit policy,** a one-time contribution with $0 of room moves nothing, which is the same plan with
    the transfer off.
  - **Under "warn",** the rows cannot change.
- **C7.** The scan's controls flag every witness and none of the near misses (`prediction/r44_corpus_scan_at_2559625.txt`,
  last section).

## Predictions

### 1. The corpus

`prediction/r44_corpus_scan.js` was run on `2559625` (output `prediction/r44_corpus_scan_at_2559625.txt`). It flags two
plans, both in the control and so also in the expanded corpus, and both under R43-01's one-time route. Nothing else is
flagged: no planned row with a 65th birthday inside it, no one-time IRA contribution beside a future stream, and no negative
employer field.

**`seed:4`** (historical, single, limit policy "redirect") **moves.**
- Its one-time $56,260.18 taxable-to-HSA contribution at 83 moved $10,100, the room the note quotes, and the rest stayed
  in taxable.
- After R44 the owner is past 65, so the room is $0 and nothing moves.
- **Its rows become those of the same plan with the transfer off,** run on the pre-repair engine (`r44_direction_at_2559625.txt`):
  - from the transfer's row (84) on, the HSA is lower and the taxable account higher;
  - the final HSA falls $12,580.77, the final taxable rises $12,575.82, the final total falls $3,254.14, and lifetime taxes
    rise $2,768.18.
- Its limit warning reads "more than the $0 of HSA contribution limit left this year; $0 moved".

**`seed:13`** (simple, single, "redirect") **moves in its limit warning only.**
- Its one-time $54,279.64 into an HSA at 65 moved $0 before R44, because the taxable source held nothing by then; the plan
  with the transfer off has identical rows.
- The warning quoted $8,750 of room, and will quote $0.
- Its rows do not change.

**Every other plan, golden fixtures included, is unchanged.** `seed:5`'s HSA-to-HSA transfer is not a contribution and does
not move.

- **Control 4.7:** `seed:4` (rows and `limitWarnings`) and `seed:13` (`limitWarnings` only), and nothing else.
- **Expanded capture:** the same two, and nothing else changes from r22.
- **After the build** the movement is measured with expanded captures at `2559625` and at the build (C8).

### 2. The witnesses

`tests/audit-s5aa-r44-contribution-routes.test.js` has 10 cases, all on the public routes. Its run on `2559625`
(`witness_runs/r44_tests_at_2559625.txt`) shows every repair case failing with the pre-repair figure, and every control
passing:

| case | expected (hand-derived) | at `2559625` |
|---|---|---|
| R43-01 one-time $4,400 at 66 | HSA $0, taxable $20,000, note "$0" | HSA $4,400 |
| R43-01 one-time $6,000, spouse 64.5 | (8,750 + 1,000) × 0.5 = $4,875 | $6,000 |
| R43-01 planned $12,000, spouse 64.5 | flows $6,000, held to $4,875, $1,125 redirected | $6,000 |
| R43-02 one-time $7,500 IRA | compensation $12,968.71; $7,500 moves | $5,000 |
| R43-03 negative profitShare, matchRate, matchCap | refused by both layers | accepted |
| controls: planned at 66; one-time, spouse 63; planned $4,000, spouse 64.5; planned IRA; zero and 5% profit sharing | $0; $6,000; $2,000; $7,500; $13,000 and $18,000 | as expected |

After the repair every case passes.

### 3. The gate and the browser

- **Gate:** passes; closeout 12/0/0.
  - A test that pins a one-time HSA contribution by an owner of 65 or over, or a planned HSA request over the prorated limit
    in a row with a 65th birthday inside it, will move. Each is to be found, re-measured and recorded.
- **Browser:** the round's final candidate repeats task 6.5 (A-04).
