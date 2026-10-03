# S5AA R45 — the owner's decisions: each spouse's own retirement date (planned, not yet built)

*Written by Claude on 2026-10-03 (Arizona, UTC−7). These rules were decided by the owner on 2026-10-03 and are being built as S5AA
round R45. None of them is in the engine yet. They are published here so that the assumptions audit (AA1) can examine them before
or while they are built.*

## Today's model

- **One retirement age.** The plan has a single `profile.retireAge`. Each person stops working at that age on their own clock
  (`householdWorkDurations()`), so a spouse two years younger works two years longer than the primary person.
- **No spouse date.** There is no separate spouse retirement age. A `profile.spouseRetireAge` field found in some plans and
  tests is read by nothing.
- **When household costs start.** The household's retired spending, health costs, the spending strategy's starting balance,
  and debt and housing costs (since S5AA R43, through `costRetireAge`) start at the primary person's retirement age. The
  exception is R43's survivor rule: if the primary dies before retiring and the surviving spouse has no salary, costs start at
  the death.
- **Pay first (S5AA R35).** After that date, a still-working spouse's net pay funds spending before the portfolio does.

## The owner's decisions (2026-10-03)

1. **Each spouse has their own retirement date.** `profile.spouseRetireAge` becomes a real input: the spouse's retirement age
   on the spouse's own clock. If it is absent, the spouse retires at `profile.retireAge` on their own clock, exactly as today.
2. **Household costs start at the FIRST stop.** Household spending and health costs begin when the first person stops working,
   on the primary's clock. Whoever still works has their net pay fund spending first (R35's rule, made symmetric).
   - The owner first chose "when the last one retires". Claude pointed out that this would delay retired spending for every
     couple with a younger spouse, and would stop using the working spouse's pay, so the owner changed to the first stop.
3. **Only an earner's stop counts.** A spouse with no salary does not start household spending at their retirement date.
4. **Deaths count as stops, on both sides.**
   - If the primary dies before retiring with the spouse alive, household costs start at the death, whatever the spouse earns,
     and the survivor's pay funds them first. This replaces R43's salary exception.
   - If an earning spouse dies before retiring with the primary alive, household costs likewise start at that death, and the
     primary's pay funds them first.
5. **What follows the household date** (the first stop): retired spending, health costs, the spending strategy's starting
   balance, debt and housing costs, Roth conversions (the form says "each year from your retirement age"), the cash reserve,
   and the pay-first rule.
6. **What follows each person's own date:** that person's work, wages and contributions, Social Security's earnings-test service
   months, the 401(k) still-working exception to required distributions, the Rule of 55 (IRC 72(t)(2)(A)(v)), and vesting at
   separation.
7. **What stays on the primary's retirement age:**
   - long-term-care onset (the owner, 2026-10-02: the survivor rule does not reach LTC or the reserve);
   - the pension (a single, primary person's pension);
   - the glide path, the bond tent, and dividends paid out from retirement. These were not in the owner's list of household
     anchors, and are kept as they are.
8. **The retirement-age warning.** The validator's "retireAge is before the current age" warning will fire only when a salary
   is entered alongside a past retirement age, and likewise for the spouse.

## What the corpus scan found (before any edit)

Under these rules, one plan in the 71-plan expanded corpus changes its household date: `expansion:s5aa-gap-working-household`. Its
older, earning spouse stops at their own 67, when the primary is 56, so household costs and conversions start at 56 instead of 67.
No other plan's household date or spouse work window changes. Nine corpus plans carry `spouseRetireAge`, but each equals
`retireAge`, so honouring the field changes nothing for them.
