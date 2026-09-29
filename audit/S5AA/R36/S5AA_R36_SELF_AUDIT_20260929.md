# S5AA R36 — self-audit

*Claude's check of the round before it goes to ChatGPT, 2026-09-29 (local, UTC−7), at `cf643a8`.*

## 1. What was checked, and how

**Every indexed amount's statute, read at the source before it was coded:**
- the Internal Revenue Code sections at Cornell LII and uscode.house.gov (§ 414(v), whose LII page came back truncated);
- 42 USC 1395r, 430, 403 and 415 at Cornell LII, because ssa.gov refuses automated fetches.

The table in the handover's §3 gives each one's rounding, whether of the increase or of the amount, and its direction.

**The rounding, by hand.** Every indexed figure one year on at 3% prices and 4% wages was worked by hand, and the helper matches each
one. Two examples: 12,400 + (372 down to 350) = 12,750, and 184,500 × 1.04 = 191,880, to the nearest $300 = 192,000.

**A whole return, by hand, through the public route.** A single 67-year-old with a $60,000 pension at 3% inflation:
- **2026:** 5,099, as in R35.
- **2027:** 5,020.75 — the standard deduction 16,550, the age-65 addition 2,100, the 10% band 12,750, Arizona's deduction 16,550.

The test fails on R35's engine.

**Structure.** No control plan moves in tax year 0, and every one first moves in a later year's tax-linked fields.

## 2. What the checks caught

- **Brackets round to $50, not the $25 I expected;** $25 is the married-filing-separately rule. Read at the source before coding.
- **The first build indexed by elapsed time,** so a plan opening at 29.5 took half a year's inflation into its 2027 row. The trace
  showed the golden plans moving at "elapsed 0.5". Each row now advances the index by a whole tax year, and the trace was rerun.
- **The Monte Carlo fault harness** patched `simulatePlan()`'s header, which the wrapper moved; re-fixtured by intent.
- **The RMD cash fixture** inherited the default plan's inflation, which the round now makes matter; it is isolated as growth is.

## 3. What remains

The handover's §6 known limits: the index stand-ins, the 2026 base, Medicare premiums at 2026's, and statutory schedules that are
not modelled.
