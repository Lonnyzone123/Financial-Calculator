# S5AA R31 — self-audit

*Claude's check of the round before it goes to ChatGPT, 2026-09-28 (local, UTC−7), at `8afe16d`.*

## 1. Why R30 missed R30-01

Every R30 test and both sweeps ran at a 0% return. At 0%, the IRA's value on the funding date equals its December 31
value, so a measure taken on the wrong date could not show.

The lesson is now a standing rule of mine: any rule that measures something on a date gets tests with a gain and with a
loss. R31's sweep runs from −20% to +20%.

## 2. What was checked, and how

1. **ChatGPT's repro, run on the frozen tag before any edit:** 3 mismatches and 4 passing controls, as reported.
2. **The source:** Notice 2008-51's basis paragraph and example ("immediately after"), read in IRB 2008-25 in R30. It was
   read again for this round's wording.
3. **Every new test was run against the code before the change:**
   - All six R30-01 cases failed.
   - The funding-year draw case also failed, because its year-end measure hid the draw's taxable part: $0 where $80.86
     is right.
   - The controls passed.
4. **The sweep was run against `66c406c`'s source**, and found 44 problems.
5. **The expanded corpus** output hash is unchanged.

## 3. What the checks caught

- **The sweep's own formula, not the engine.** At −20% an all-basis IRA falls below its basis, and the sweep's first
  version let the final draw's taxable part go negative (−$352). The Form 8606 fraction is at most 1, so the taxable part
  is $0, which is what the engine gives. The sweep was corrected before it was recorded.
- **Two claims in my first draft of the handover** were overreach, and were corrected before commit:
  - that the engine applies a year's contributions before a transfer, which I had not verified;
  - a "two owners each funding" case, which a plan's single transfer cannot make.

## 4. The sweep

`audit/S5AA/R31/S5AA_R31_SELF_AUDIT_FUNDING_BASIS_SWEEP.js` writes out the rule and holds each plan's funding-year and
liquidation-year AGI to it:
- the funding takes the date's taxable value first, then basis;
- a funding-year draw is priced at year end on what is left;
- the liquidation-year draw is taxable only above the remaining basis.

| engine | plans | checks | problems |
|---|---|---|---|
| `8afe16d` (R31) | 84 | 168 | **0** |
| `66c406c`'s source | 84 | 168 | **44** |

## 5. What remains

The handover's §6 known limits.
