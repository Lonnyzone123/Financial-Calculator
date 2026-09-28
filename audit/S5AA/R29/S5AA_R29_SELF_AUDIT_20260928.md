# S5AA R29 — self-audit

*Claude's check of the round before it goes to ChatGPT, 2026-09-28 (local, UTC−7), at `4ead57c`.*

## 1. What was checked, and how

1. **Every tax claim at its source.** IRC 223(f)(2) and (f)(4)(A) and (C) (PCF-01) are the rule records Q99 checked
   against the statute. IRC 408A(c)(2) and 219(b)(1) cover the Roth limit and compensation (PCF-02, R26). IRC 223(a) and
   62(a)(19) cover the direct HSA deduction. IRC 408(d)(9) covers the funding distribution.

   Reading 408(d)(9) again turned up one condition the first build missed: the distribution must go into the IRA owner's
   **own** HSA. An IRA into the spouse's HSA was treated as a funding distribution, so no tax. It is now a distribution
   and a contribution, and a test ($975 of 10% for a couple at 57) fails without the condition. Fixed before `c07c01f`
   was committed.
2. **Every new test was run against the code before its change, and failed as intended.** The rules-page test was also
   run against the previous commit in a separate worktree: its three protective tests fail there and its markup control
   passes.

   One test was found to prove nothing and was fixed before commit. PCF-02's "room after planned contributions" case
   retired its owner at 60, so the planned $5,000 never flowed, and $8,600 was the whole transfer rather than $5,000 plus
   $3,600. It now works through the year, and a control shows the planned $5,000 alone with no transfer.
3. **Every figure the round moves was traced.** The expanded corpus against r17 moves 3 of 70 members (the handover's §4).

   `seed:13` moved no figure, only its warning. Tracing why found a defect in the round's own code. The limit warning was
   composed from the room before the transfer met its source, so it told `seed:13` "only $5,400 was moved" when its
   taxable account was empty and $0 moved. It is now written after the move (`4ead57c`), with a test.
4. **An independent sweep of the transfer rules**, below.

## 2. The sweep

`audit/S5AA/R29/S5AA_R29_SELF_AUDIT_TRANSFER_SWEEP.js` writes the transfer rules out itself and holds the engine to them:
- every ordered pair of 8 account types (56 pairings);
- ages 57, 60 and 66;
- amounts of $2,000 and $50,000, from a $20,000 source;
- wages of $0 and $3,000;
- both limit policies;
- for an HSA source, qualified shares of 0% and 50%.

That is **1,512 plans**. A $100,000 cash account at full basis pays each year's taxes, so paying them realises no gain and
adds no income.

The checks:

| check | what it holds |
|---|---|
| **MOVED** | what reaches the destination |
| **AGI** | the transfer's income, gain and deduction |
| **MONEY** | with no wages, the end total is the start less the taxes |
| **AGREE** | the validator refuses exactly the plans moved into a 401(k) |

Conversions keep their existing rule and are held to MONEY and AGREE only.

| engine | checks | problems |
|---|---|---|
| `4ead57c` (R29) | 4,476 | **0** |
| `8009fd8` (before R29) | 4,476 | **987**: 339 MOVED, 432 AGI, 216 AGREE |

MONEY held on both, so the defects were tax and limit errors, not money created or lost. The sweep's first two versions
reported problems in the sweep itself, both corrected in its code:
- a taxable destination shares its class total with retained wages and the year's tax payments;
- tax paid from a pre-tax account adds income.

## 3. What remains

- The known limits in the handover's §6.
- A mixed-history provenance rule, needed before a capture recorded in this repository can be registered as a baseline.
- The PCF reports' own list of what they did not re-derive (Social Security, every bracket boundary, every RMD/QCD and
  Form 8606 interaction) stands as they wrote it.
