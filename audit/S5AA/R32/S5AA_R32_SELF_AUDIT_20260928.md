# S5AA R32 — self-audit

*Claude's check of the round before it goes to ChatGPT, 2026-09-28 (local, UTC−7), at `3017351`.*

## 1. What was checked, and how

1. **Every rule at its primary source, read in the statute or publication text:**
   - IRC 408(d)(3)(A) and (H), 219(b)(5)(B), 223(b)(3)(A) and (f)(5)(A), 414(v)(2)(B)(i) and (5)(A), at the Cornell LII
     text;
   - Publication 590-A's "Rollover From a Roth IRA".
2. **Each finding reproduced before any edit:**
   - R30A-01 to R30A-03 with ChatGPT's R30A repro, at R31. It showed the same 60 matrix mismatches, three witnesses and 18
     conditional differences as at R30.
   - R31-01 with ChatGPT's R31 repro, 22 failing plans.
3. **Every new test was run against the code before its change.** The defect cases failed, and the controls passed.
4. **Each moved corpus member was traced to its row before declaring it:**
   - seed:10 and seed:11 at the row turning 50;
   - seed:20 at the rows turning 60 and 64, where an over-limit deferral is redirected.
5. **An independent sweep** of the rollover limit, below. ChatGPT's R30A and R31 grids cover the refusals, the dated funding
   pool and the catch-up ages.

## 2. What the checks caught

- **The first build of the owner refusal failed 209 tests.** It kept its list of account types in a global, and the Worker
  that runs the calculation in the app is built from the engine's listed functions, not its globals. The list is now inside
  the function.
- **Two pieces of R32's original plan would have repeated R31-01.** The rollover limit and the funding read the same pool,
  so both were built on the one dated measure.
- **R29's sweep encoded the old rule for a Roth IRA into a 401(k).** It flagged 24 cases after R30A-02's refusal. Its rule
  was updated, with a dated note, not the engine.
- **One test pinned the old catch-up age:** `tests/audit-s5aa-415c-catchup-room.test.js`. It was re-fixtured by intent; the
  rule it holds is unchanged.

## 3. The sweep

`audit/S5AA/R32/S5AA_R32_SELF_AUDIT_ROLLOVER_SWEEP.js`. ChatGPT's R29 fixture sends $8,600 of all-basis IRA money to the 401(k)
at 61, 61.25 or 61.75. There is a second IRA of the same owner with $0, $2,000 or $20,000 of pre-tax money, and the source and
second IRA earn −10/0/+10% and −20/0/+20%.

The expectation is the rule written out:
- the pool of both IRAs on the date, less the basis, is what may move, and at most what the source holds;
- the basis stays in the IRAs;
- the drain's taxable IRA money is what exceeds it.

| engine | plans | problems |
|---|---|---|
| `3017351` (R32) | 81 | **0** |
| `0be9911` (before R32) | 81 | **54** |

## 4. What remains

The handover's §6 known limits.
