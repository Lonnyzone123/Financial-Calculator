# S5AA R30 — self-audit

*Claude's check of the round before it goes to ChatGPT, 2026-09-28 (local, UTC−7), at `66c406c`.*

## 1. What was checked, and how

1. **Every tax claim at its source, read in full, not from a summary:**
   - 26 CFR 1.408-8(g)(1) and 1.401(a)(9)-5(g)(2)(i), at eCFR (the RMD credit);
   - IRC 408(d)(9)(A)–(E), at the Cornell LII text;
   - Notice 2008-51 in Internal Revenue Bulletin 2008-25, including its example and its RMD sentence.

   The Notice's RMD sentence is about a beneficiary's IRA. The owner's case rests on the regulation's general rule, which
   is how the commit and the handover cite it.
2. **Each finding reproduced on the frozen tag before any edit.** ChatGPT's repro gave 3 mismatches and 7 passing
   controls at `aaff3f1`.
3. **Every new test was run against the code before its change, and failed as intended.** The controls in each file
   passed there.
   - The settlement test was written after its repair. It was then run against `c9f6556`'s settlement, which kept $8,000
     and $7,000 of basis where the test expects $5,000 and $4,000.
4. **Every figure the round could move was measured.** The expanded corpus output hash at `66c406c` equals ChatGPT's at
   `aaff3f1`.
5. **An independent sweep**, below.

## 2. What the checks caught

- **Two hand ledgers that left out a loss.** A paid dividend lowers a taxable account's balance but not its basis, so a
  later sale or move out of it realises a loss. The protection control first expected $9,262.88 in the source, and the
  engine gave $9,659.60.
  - Tracing it found two things. First, the missing loss. Second, the "control" was not one: at `bf4d3d8` its dividends
    were figured on the $50,000 asked, not the $8,600 of room. It is an R29-01 case.
  - Both ledgers now carry the loss: -$327.79 in the partial-room case, and a -$3,578.56 loss capped at $3,000 in the
    protection case.
- **The funding flow was tallied but never passed to the settlement.** The witness still read $29,000 after the first
  edit, and the call site now passes it.
- **Closeout refused `COUPLED-ONLY-R29-02`.** The settlement test called `settleIraYear()` in the same file as the plans,
  which made R29-02 guarded only by an implementation-coupled file. It is now a file of its own.
- **The protection was first built for every late transfer.** Three of R28.1's own tests failed. A Roth-to-Roth move at
  60.75 held $100,000 back from a year needing $105,000 of spending, and left the household $95,000 short with the money
  there.
  - The owner's question was about a taxable source, whose dividends are figured on the dollars before the draw. For any
    other source nothing is figured on them.
  - The protection is now scoped to that case, and R28.1's tests stand unchanged. **This scoping is my reading of the
    decision, and the owner has it to confirm.**
- **A figure I gave the owner when asking about the mirror was wrong.** I said an emptied $50,000 taxable account would
  move $48,750. Under the engine's dividend convention it moves $48,648.65. The dollars kept back to pay the dividends
  earn for the rest of the year, as the handover explains (§6).

## 3. The sweep

`audit/S5AA/R30/S5AA_R30_SELF_AUDIT_DIVIDEND_SWEEP.js` writes the rules out itself.

**The grid:**
- monthly and quarterly timing;
- dates 60.25, 60.5, 60.75 and 60.875;
- dividends paid from 60, from 60.5, or reinvested all year;
- yields of 4% and 10%.

| check | what it holds |
|---|---|
| **zero-move** | with no room, a transfer into a Roth IRA or traditional IRA leaves every row field as the year without it |
| **source keeps** | an IRA, Roth IRA or HSA sending $30,000 of $100,000 into taxable ends with exactly $70,000 |
| **destination keeps** | a Roth IRA or HSA ends with what it received: all of $30,000, or the dividend formula's share of a whole $50,000 |
| **protected** | a late taxable transfer with $8,600 of room moves $8,600, though the spending would otherwise take the source |

| engine | plans | checks | problems |
|---|---|---|---|
| `66c406c` (R30) | 552 | 1,320 | **0** |
| `bf4d3d8` (before the dividend repair) | 552 | 1,320 | **344**: 224 zero-move, 48 source keeps, 48 destination keeps, 24 protected |

R29's transfer sweep at `66c406c`: 1,512 plans, 4,476 checks, 0 problems.

## 4. What remains

- The handover's §6 known limits.
- The owner confirms the protection's scope (§2).
- eb's commit `03341c5` rides in this branch (handover §1).
