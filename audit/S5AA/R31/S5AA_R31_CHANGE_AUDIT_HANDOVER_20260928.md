# S5AA R31 — change audit handover: R30-01

*Written by Claude, 2026-09-28 (local, UTC−7), for the owner to send to ChatGPT. Every figure was measured on Windows 11 /
Node 24.17.0 at the commits named.*

## 1. What to audit

- **The change:** from `main` at `6e09347` (your R30 report merged) to **`s5aa-r31-source`** at **`8afe16d`**.
- **One commit**, test-first. `main` also carries eb's R30 placement (`afcbd0c`, PR #9) between your R30 tag and this base.
  It is documentation only.
- **Please number findings R31-NN** and publish them in the usual report-only pull request, on a branch like
  `audit/chatgpt/r31-8afe16d`, under `audit/S5AA/R31/`.

## 2. Your finding and the owner's decision

| finding | what you found | decision (the owner, 2026-09-28) | commit |
|---|---|---|---|
| **R30-01** (P1) | The year-end settlement measured a funding distribution's basis from the December 31 value. At +10%, $406 of transferred basis came back and $58.87 of tax went missing. A loss did the opposite. | "Repair in R31" | `8afe16d` |

## 3. The rule, as built

**The source.** Notice 2008-51 determines the basis "remaining in an IRA ... following a qualified HSA funding
distribution" by treating the funding as includible up to what a total distribution would include. Its example reads the
basis "immediately after" the funding. Later growth is not a contribution.

**As built:**
- **At the funding,** the row records two things: the owner's traditional-IRA pool on the date, before the move; and what
  the year had already distributed or converted from it.
- **`settleIraYear()`** measures the funding's taxable value from those, less the year's basis (opening basis plus the
  year's nondeductible contributions). It no longer uses the year-end value.
  - The funding takes that taxable value first; only the rest uses basis, dollar for dollar.
  - A QCD in the same year still comes first. That order is the engine's; the sources don't set one.
- **The year's ordinary draws and conversions** are still settled pro rata at the year's end, on the basis the funding
  left.
- **A caller that passes no date measure** (`qhfdPool`) gets R30's year-end measure. `settleIraYear()`'s direct callers
  and tests are unchanged.

## 4. Evidence

**New tests** (hand arithmetic in each file):

| file | tests |
|---|---|
| `tests/audit-s5aa-r31-hsa-funding-basis-at-the-funding-date.test.js` | 6 |
| `tests/audit-s5aa-r31-hsa-funding-settlement-dated.test.js` | 1 |

**What the plan tests cover:**
- Your gain, mixed-pool gain and loss variants: AGI $31,990.66, $32,328.77 and $30,060.59, each with its tax and no
  outstanding true-up.
- A spouse's IRA funding the spouse's HSA on a joint return.
- An ordinary draw later in the funding year, priced at year end on the basis the funding left.
- Controls: 0% return, which is R29-02's witness; a funding within the taxable value; no funding.

**The unit test is its own file** because it calls `settleIraYear()` directly. R30-01 stays guarded by a file that
doesn't.

**Your repros:**
- The R30 repro at `8afe16d`: 0 mismatches, all seven cases passing. It had 3 mismatches at `66c406c`.
- The R29 repro: still 0.

**Gate at `8afe16d`:** GATE PASSED, 2,954 tests, 2,945 passing, 0 failing, 9 authorised todo. Closeout accepted 12,
refused 0.

**The control (4.7):** nothing to declare.

**The expanded corpus at `8afe16d`:** output hash `5a67d57e35136788bba4d96f4f24dcb721fbf4f70ab7fc3077021d7c6d122766`,
unchanged, so no corpus figure moves. The invariant passes all 7 checks.

**Self-audit sweep:** `audit/S5AA/R31/S5AA_R31_SELF_AUDIT_FUNDING_BASIS_SWEEP.js`.

| grid | values |
|---|---|
| returns | −20%, −10%, −5%, 0, 5%, 10%, 20% |
| opening pre-tax IRA money | $0, $2,000, $20,000 |
| owner | self, spouse |
| funding-year draw | none, $1,000 |

That is 84 plans and 168 checks, each held to the rule written out in the script.

| engine | problems |
|---|---|
| `8afe16d` | **0** |
| `66c406c`'s source | **44** |

R29's and R30's sweeps at `8afe16d`: 0 problems each.

## 5. Contracts

- `settleIraYear()` reads optional `qhfdPool` and `qhfdFlowsBefore`.
- The row's IRA flow tally records them at a funding.

## 6. Known limits

- **The funding's taxable value counts the whole year's nondeductible contributions as basis**, wherever in the year they
  fall, as R10-03's settlement counts them for the year's conversions. The engine has no date for a contribution within
  the year to measure against.
- **A QCD and a funding in the same year:** the QCD is taken from the taxable value first. That order is the engine's.
- R30's §6 limits stand.

## 7. Where I would look first

1. A funding in a year that also has a conversion before it (`qhfdFlowsBefore`).
2. A later draw in the funding row, priced provisionally before the settlement: does the true-up settle it to the
   date-measured basis in every case?
