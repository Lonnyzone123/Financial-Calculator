# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R30

*Written by Claude, 2026-09-28 (local, UTC−7). Prose for eb to place in eb's own files; no file of eb's has been edited.
Every fact was checked on Windows 11 / Node 24.17.0 against the code at `66c406c`.*

## 0. What happened

ChatGPT's R29 change audit of `aaff3f1` kept **NO-GO** on two P1 findings:
- **R29-01:** a late transfer capped to $0 still left the source's dividend base.
- **R29-02:** a qualified HSA funding distribution never used up IRA basis.

It also raised, unnumbered, the RMD credit for a pre-tax transfer into an HSA.

R30 repairs all three and three cases found beside them, on the owner's decisions of 2026-09-28. The source is
`s5aa-r30-source` = `66c406c`, and the handover is `audit/S5AA/R30/S5AA_R30_CHANGE_AUDIT_HANDOVER_20260928.md`.

Your commit `03341c5` (R29 placement) is in the same branch; the handover names it as yours. Your section 21's
categorization is unchanged by R30.

## 1. The model (`MODEL_ASSUMPTIONS.md`), suggested text

For section 21, after the categorization:

> **Required distributions** (S5AA R30, the owner, 2026-09-28). A pre-tax transfer that is a distribution counts toward
> the year's required minimum distribution, whatever it lands in. That covers a transfer into a taxable account, and one
> into an HSA: a distribution then a contribution, or a qualified HSA funding distribution (26 CFR 1.408-8(g)(1):
> distributions count "regardless of whether the amount is includible in income"). A rollover or a conversion does not
> count. A transfer dated after the year's spending draw counts neither way; the draw has already paid the year's
> requirement.
>
> **Funding distributions and basis** (S5AA R30). A qualified HSA funding distribution comes out of the IRA's taxable
> value first. Only the part beyond that uses up basis, dollar for dollar (IRC 408(d)(9)(E); Notice 2008-51).
>
> **Dividends on moved dollars** (S5AA R30). The moved dollars' dividends belong to the account holding them: the source
> before the date, the destination after it. Each account pays its own.
> - A taxable source that sends everything can send only what its dividends leave.
> - A transfer dated after the year's spending draw pays its destination after the move, on what moved. That cash comes
>   after the draw, so it is kept or spent under the dividends policy.
> - For such a transfer out of a dividend-paying taxable account, the year's spending draw leaves the transfer's dollars
>   in the source.

Replace the known-limit line "a funding distribution's credit toward an RMD" with nothing; it is repaired. Add the new
limit, in plain words: a late destination's dividend cash does not fund that year's spending.

## 2. `FEATURES.md`

- **Line 175** (at `66c406c`, "Tax-adjacent") still lists "HSA qualified-vs-non-qualified withdrawal tax treatment" among
  gaps, pointing at "the two confirmed gaps under **Account types** above". Your `03341c5` marked the HSA gap at line 107
  repaired (Q99), so line 175 looks stale on that item. This is not R30's; I noticed it while checking.
- Nothing else in `FEATURES.md` contradicts R30, to my reading. Line 96 names the RMD; it could say a pre-tax transfer
  into an HSA counts toward it.

## 3. `SPRINT_QUESTIONS.md`, if you keep decisions there

The owner's decisions of 2026-09-28:
- R29-01 and R29-02: repair in R30.
- The RMD credit: research, then repair. Researched: all pre-tax distributions count.
- The late-destination leak found in passing: repair.
- Its mirror: repair.
- A source spent by the draw: **protect the transfer**. The protection is scoped to dividend-paying taxable sources, and
  the owner is confirming that scope.

## 4. Where this round lives

In `Lonnyzone123/Financial-Calculator`, on branch `sprint/s5aa-r30`, in a pull request the owner merges.
