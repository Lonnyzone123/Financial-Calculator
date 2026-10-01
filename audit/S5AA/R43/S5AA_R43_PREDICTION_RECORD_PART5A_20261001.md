# S5AA R43 — prediction record, part 5a: the plan-value contract

*Written by Claude on 2026-10-01 (Arizona, UTC−7). Committed before the part 5a engine, validator, build and app edits (A-01).
Base: `ae93a43`, part 4b built and gated (3,234 tests, 0 failing, 9 todo; closeout 12/0/0). The round's decisions are in
part 1.*

## The repairs, as they will be built

- **SA42F-05 and SA42F-06: one contract, read by both layers.** `src/plan-value-contract.json`, written before this record
  and committed with it, states for each plan value:
  - its type: a finite number, or one of a list of text values;
  - whether it is required (for list records), or required while a flag is on;
  - its range.

  It covers:
  - the 47 fields the audit's sweep found coerced on both sides;
  - the 16 the validator refused and the engine ran;
  - the ten text fields the audit's enum probe found unchecked (or only warned): withdrawal timing, limit policy,
    state, optimization goal, account type, contribution mode, annual-change mode, debt type, rate type and liquidity;
  - the record rules of `NESTED_RECORD_SPECS` (stages, expenses, incomes), mirrored exactly, with a test holding the
    two equal.

  Each layer reads it:
  - **the engine's input gate** refuses a violation with `SCENARIO_NONNUMBER_PLAN_VALUE` (a type, or a missing value),
    `SCENARIO_PLAN_VALUE_OUT_OF_RANGE` or `SCENARIO_UNKNOWN_PLAN_VALUE`;
  - **the validator** reports `WRONG_TYPE`, `MISSING_FIELD`, `OUT_OF_RANGE` or `INVALID_ENUM`, once per path;
  - **the build** inlines the file, as it does `boolean-flag-contract.json`;
  - **the Worker** receives it, as it does the flag contract.

  Two validator-only rules stay the validator's, and the records name them as declared divergences:
  - the income type list. The corpus keeps a legacy `"recurring"` type in `targeted:spouse-cola-income`, which the
    validator rejects as `UNRECOGNIZED_VALUE` and the engine reads as ordinary income;
  - `TRANSFER_INTO_WORKPLACE_PLAN` (`seed:9`). The engine refuses the transfer, not the plan.
- **SA42F-07.** `fivePercentOwner`, `spouseSoleBeneficiary` and `currentEmployerPlan` join `boolean-flag-contract.json` as
  engine flags:
  - `fivePercentOwner`: default false;
  - `spouseSoleBeneficiary`: default true;
  - `currentEmployerPlan`: absent is a derived reading (yes when the account receives contributions), recorded as such.

  The validator's hand-written checks for them go: the contract's loop reports the same `WRONG_TYPE` at the same paths.
  The engine refuses a non-boolean (`SCENARIO_NONBOOLEAN_FLAG`).
- **SA42F-30 and SA42F-32.** A person is alive at the start only with a lifespan above their starting age. A whole-number
  lifespan equal to it leaves them dead for the whole first row, so a plan with nobody alive by that reading is refused
  (`SCENARIO_NOBODY_ALIVE_AT_START`). The validator reports the same plan as an ERROR, `NOBODY_ALIVE_AT_START`.

## Predictions

### 1. The corpus

`audit/S5AA/R43/prediction/contract_corpus_scan.js`, run on `ae93a43` (output: `prediction/contract_corpus_scan_at_ae93a43.txt`),
applies the contract file to every plan, by its own reading of the file's rules. It also tests the three flags and the
start-of-plan lifespan. Its **positive control refuses every R42F witness and accepts the valid control**.

**It refuses none of:**
- the control corpus (36 plans);
- the expanded corpus (71);
- the app's default plan;
- the five golden scenarios.

**No corpus plan carries a non-boolean flag of the three, or a lifespan at its start.** So:
- **Control 4.7:** zero unpredicted.
- **Expanded capture:** unchanged from part 4b.
- **Golden fixtures:** unchanged.

**One possible side effect is named in advance:** writing `spouseSoleBeneficiary`'s documented default (true) into an
account that omits it changes no figure, because the engine reads only `=== false`. It is expected to change nothing a
capture records.

**Limits:**
- The scan reads the contract file, not the engine.
- Tests elsewhere in the suite that deliberately pass a value the contract now refuses (a string, a null, an
  out-of-range number) will fail. Each will be adapted to the contract, or its value made valid, with the reason recorded.

### 2. The witnesses

The tests are in `tests/audit-s5aa-r43-plan-value-contract.test.js`. On `ae93a43`:
- **These fail:**
  - the field-by-field sweep (both layers, every contract field, the values "abc", "12", true, null and each bound's
    neighbour);
  - the required-field cases;
  - the R42F witnesses;
  - the three flags;
  - the start-of-plan lifespan.
- **These pass:** the rich plan's control and the mirror test.

After the repair every case passes. In each, the validator reports an ERROR at the field's path, and the engine refuses at
the same path with the code above.

### 3. The gate and the browser

- **Gate:** passes, with the new tests and any adapted ones; closeout 12/0/0.
- **Browser:** the built page carries the new contract, so the round's final candidate repeats task 6.5 (A-04).
