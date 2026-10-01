# S5AA R43 — prediction record, part 4b: cash flows

*Written by Claude on 2026-10-01 (Arizona, UTC−7). Committed before the part 4b engine and app edits (A-01). Base: `960eb11`,
part 4a built and gated (3,224 tests, 0 failing, 9 todo; closeout 12/0/0). The round's decisions are in part 1.*

## The repairs, as they will be built

- **SA42F-19.** In the row an other asset becomes available, the fallback can draw on it for the part of the row's need
  that falls after its date:
  - the one-time expenses dated at or after it;
  - the time share of the recurring retired costs after it (Q140, §19).

  The shortfall is met from that asset in that proportion. An asset available from the row's opening is drawn on exactly
  as before.
- **SA42F-20, as the owner chose: an amount is in today's dollars in every growth mode.** A stage set as an amount, or an
  income stream, that starts after the plan's start latches the plan's inflation factor at its start. That is the factor
  at its row's opening, carried to the start at that row's inflation. "No annual change" holds that figure. "Fixed" and
  "Social Security COLA" grow from it. "Match inflation", and anything starting at or before the plan's start, is
  unchanged. This is R35 decision 6's reading for fixed-nominal spending, applied to stages and streams.
- **SA42F-21.** "Years of spending in reserve" is sized on the spending the plan projects for the row, the spending
  strategy's own amount at the row's opening. It was the hidden, never-inflated spending field.
- **SA42F-26.** The form's conversion field says it runs each year from the retirement age.
- **SA42F-28.** A one-time income dated at or after the end age (on the self's clock) is warned,
  `INCOME_AFTER_PLAN_END`, as the expense has been since R37. The app renders it.

## Predictions

### 1. The corpus

`audit/S5AA/R43/prediction/flows_corpus_scan.js`, run on `960eb11` (output: `prediction/flows_corpus_scan_at_960eb11.txt`). Its
**positive control flags every witness and none of the controls**.

| repair | plans (the same in control and expanded) |
|---|---|
| SA42F-19 | none |
| SA42F-20 | `seed:1`, `seed:2`, `seed:3`, `seed:5`, `seed:7`, `seed:8`, `seed:9`, `seed:11`, `seed:15`, `seed:16`, `seed:19`, `targeted:spouse-cola-income` (12) |
| SA42F-21 | `golden:reserve-and-bond-tent`, `seed:1`, `seed:2`, `seed:4`, `seed:5`, `seed:12`, `seed:16` (7) |
| SA42F-28 | `seed:4`, `seed:6` (2; the warning only) |

So these 16 plans move, in control and expanded alike, and nothing else:
- `golden:reserve-and-bond-tent`, `targeted:spouse-cola-income`;
- `seed:1` to `-9`, `seed:11`, `-12`, `-15`, `-16` and `-19`.

**In detail:**
- **Control 4.7:** their differences will be declared under these 16 scenarios. A difference anywhere else is a miss.
- **Expanded capture:** the same 16 move, on top of parts 2 and 3's `expansion:monte-carlo-sensitive-band` and `seed:4`,
  and 4a's `expansion:s5aa-r6-gap-survivor-health-roth`. The rest equal r21.
- **Direction:**
  - a stream or stage under "Fixed", "COLA" or "No change" rises by the inflation to its start;
  - a reserve sized on inflated or strategy spending is larger, which lowers growth;
  - the two warnings are added issues.

**Limits:**
- Ten of the 16 are historical or Monte Carlo. The conditions read their inputs, not their paths: a stream's latch is
  set on each path's own inflation.
- The conditions are necessary, not sufficient. Where a plan's flagged stage or stream is never reached in a row that
  pays it, it will not move, and the record will say so.

### 2. The witnesses, hand-derived from the rules and the inputs

The tests are in `tests/audit-s5aa-r43-flows.test.js`. Each defect test was run on `960eb11` and fails at the figure shown as
"today". The control passes.

| | witness | today | predicted |
|---|---|---|---|
| SA42F-19 | a $100,000 roof at 65.75; a $10,000 Roth; half of a $400,000 home available from 65.5 | fallback $0, short $90,000 | **$90,000** from the home, short $0 |
| SA42F-19 | $60,000 a year; a $60,000 Roth that the first row empties | $0 | **$30,000** in the row from 65 to 66 (the half after 65.5), short $30,000; **$60,000** the next row |
| SA42F-20 | a $40,000 stage from 65 under "No annual change", 3% inflation, the plan opening at 55 | $40,000 | **$53,756.66** (× 1.03^10), held |
| SA42F-20 | the same under "Fixed 2%" | $40,000, $40,800 | **$53,756.66**, then × 1.02 |
| SA42F-20 | "Fixed 3%" against "Match inflation" | $40,000 against $53,756.66 | **equal** in every row |
| SA42F-20 | a $30,000 rental from 65 under "Fixed 3%" | $30,000 | **$40,317.49**, then × 1.03 |
| SA42F-20 controls | "Match inflation"; a stream from the plan's start | — | unchanged |
| SA42F-21 | guardrails at 4% of a $3,000,000 Roth at 7%, a 2-year reserve at 3%, the Roth undrawn (a tax-free $200,000), a hidden $60,000 field | Roth $3,205,200 (6.84%) | **$3,200,400**: 2 × $120,000 = 8%; 7% × 0.92 + 3% × 0.08 = 6.68% |
| SA42F-26 | the form | "Annual conversion amount" | "(each year from your retirement age)" |
| SA42F-28 | a $50,000 inheritance at 63, the plan ending at 63 | no issue | `INCOME_AFTER_PLAN_END` at `retirement.otherIncomes[0].start`; the control at 62 is not warned |

### 3. The gate and the browser

- **Gate:** passes, with the new tests; closeout 12/0/0.
- **Browser:** repeated on the round's final candidate (A-04).
