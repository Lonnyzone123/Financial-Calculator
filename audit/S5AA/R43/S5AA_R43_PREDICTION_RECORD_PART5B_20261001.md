# S5AA R43 — prediction record, part 5b: Monte Carlo seeds, the result contract, historical starts

*Written by Claude on 2026-10-01 (Arizona, UTC−7). Committed before the part 5b engine, validator and document edits (A-01).
Base: `a9d7fc0`, part 5a built and gated (3,242 tests, 0 failing, 9 todo; closeout 12/0/0). The round's decisions are in
part 1.*

## The repairs, as they will be built

- **SA42F-31.** Path *i*'s two generators are seeded with `monteCarloPathSeed(seed, i, stream)`, where `stream` is 0 for
  the market and 1 for care:
  - `fmix32(fmix32(seed) + 0x9E3779B9 × (2i + stream + 1))`, murmur3's 32-bit finalizer around a golden-ratio step;
  - it is a top-level engine function, exported, and on the Worker's function list.

  They were `rng(seed + 2i)` and `rng(seed + 2i + 1)`, so seed *s* + 2 replayed seed *s*'s paths. `tests/rng-seeding.test.js`,
  which pinned the old scheme (round D-3's per-path independence, which this keeps), is rewritten to pin the new one.
- **SA42F-33.**
  - An unknown-method refusal reports `mode: null`, since the text is not a mode, and the contract checker accepts it.
  - RESULT_CONTRACT §7b's sentence that S5AA added no calculation error code is replaced by the codes S5AA added, R43's
    included: `SCENARIO_UNKNOWN_METHOD`, `_INVALID_RUN_COUNT`, `_MISSING_SCENARIO_SECTION`, `_NOBODY_ALIVE_AT_START`,
    `_UNRECOGNIZED_INCOME_OWNER`, `_MISSING_INCOME_OWNER`, `_END_AGE_BEFORE_START`, `_NONNUMBER_PLAN_VALUE`,
    `_PLAN_VALUE_OUT_OF_RANGE`, `_UNKNOWN_PLAN_VALUE`, `_HISTORY_START_AFTER_DATA`, `_HISTORY_START_NOT_A_DATA_YEAR`, and
    `MONTE_CARLO_INVARIANT_FAILURE`.
- **SA42F-34.** A historical start must be one of the return series' years (MODEL_ASSUMPTIONS §26).
  - **Before the first year (1928) or a fraction:** the engine refuses with `SCENARIO_HISTORY_START_NOT_A_DATA_YEAR`, and
    the validator reports `OUT_OF_RANGE`.
  - **After the last year:** refused as before, `SCENARIO_HISTORY_START_AFTER_DATA`.

## Predictions

### 1. The corpus

`audit/S5AA/R43/prediction/seeds_corpus_scan.js`, run on `a9d7fc0` (output: `prediction/seeds_corpus_scan_at_a9d7fc0.txt`). Its
positive control flags a Monte Carlo plan, a start of 1900 and of 1966.5, and an unknown method. It does not flag 1967, or
2026 (which keeps its own code).

- **SA42F-31: every Monte Carlo plan moves**, every row and the success rate:
  - control: `golden:monte-carlo-fixed-seed`, `seed:9`, `seed:17`;
  - expanded: the same three and `expansion:monte-carlo-sensitive-band`;
  - golden: the `monte-carlo-fixed-seed` fixture, to be regenerated.
- **SA42F-34:** no corpus plan starts outside the data years (1928 to 2025). Nothing moves.
- **SA42F-33:** no corpus plan has an unknown method. Nothing moves.

So:
- **Control 4.7:** the three Monte Carlo plans move, and nothing else.
- **Expanded capture:** the four move, and nothing else changes from part 5a.

**Tests that pin a Monte Carlo figure will move with the seeds.** Each is to be re-measured and its figure updated, with the
reason recorded:
- the golden fixture;
- the sensitive-band test;
- the rng-seeding test.

### 2. The witnesses

The tests are in `tests/audit-s5aa-r43-seeds-contract-history.test.js`.

**On `a9d7fc0`, these fail:**
- the one-path seeding;
- seed 44 against seed 42's second path (equal today);
- the unknown method's `mode` (`"montecarlo"` today);
- the contract document;
- the three historical starts (accepted today).

**These pass:** the data-year control and the after-data control.

After the repair every case passes.

### 3. The gate and the browser

- **Gate:** passes, with the new and re-measured tests; closeout 12/0/0.
- **Browser:** the Worker computes Monte Carlo, so the round's final candidate repeats task 6.5 (A-04), Worker against main
  thread.
