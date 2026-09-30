# S5AA R40 — prediction addendum for the audit fixes, written before the engine is edited again

*Written by Claude, 2026-09-30 (local, UTC−7), under A-01 as A-10 (3) applies it. It is committed before any commit that edits
`src/` for these fixes. The owner asked for an audit of PR #35 before merge ("you do a audit on #35 before we merge"). Three
independent reviews of `f4183b9` found defects in two of R40's own repairs, and the owner decided, on 2026-09-30:*
- ***"Revert and disclose"*** *for repair 3;*
- ***"All of them"*** *for the other fixes.*

## A. Repair 3 is reverted (`607101a`, "a partial row is taxed as its share of a year")

**Why.** Its premise, "a year earning at the row's rate", annualizes one-time amounts too. A $100,000 one-time expense funded from
an IRA, in a row a tenth of a year long, was taxed as if $1,000,000 recurred: $56,958, against $20,222 on one return. Money was
destroyed (P1). It also left the IRA deduction phase-out unscaled, on a false reason (P2), and its death-row claim was false (P3).
A correct rule needs recurring income separated from one-time items inside the tax computation, which the engine cannot do today.
That design goes to the engine rebuild.

**Mechanism.** `partialYearRules()` and its row application are removed, `capitalLossLimit()` returns $3,000 again, and the Worker
list loses the helper. A partial row is taxed with the whole year's thresholds, as before R40. That is disclosed as a known limit:
the first year's tax is understated where the household had income before the plan opened.

**Predicted.**
- The five members repair 3 moved (`golden:baseline`, `golden:monte-carlo-fixed-seed`, `golden:reserve-and-bond-tent`,
  `golden:guardrails-withdrawal-strategy`, `expansion:monte-carlo-sensitive-band`) return **exactly to their r18 entries**. No other
  R40 repair touches them.
- The golden fixture returns byte for byte to its content at `d1572b1`.
- In control 4.7, the four golden plans return to their values before repair 3, and their declarations are restored.
- The two tests re-fixtured for repair 3 return to their earlier assertions: R33's half-year age-65 row at 880, and R9's dividend
  row at MAGI 15,000.
- **No other member moves.**

## B. Repair 4 is corrected (`d51d30d`, "a required distribution reads the age reached in the row")

**Why.** The repair read the spouse's calendar age reached in the row, while `rmdStartAge()` reads the birth year as
`2026 − floor(age at the plan's start)`, documented in `MODEL_ASSUMPTIONS.md` §12. The two readings disagree for a spouse whose
fraction is larger than the self's:
- at the 1959/1960 line, the first RMD fell in a year neither reading gives (P1);
- the self's own RMD moved through the Joint and Last Survivor table when the spouse is more than ten years younger (P2);
- the witness test's "born 1953" was that disagreement (P3).

The defect the repair was meant for is narrower. With a fractional self start, a spouse whose fraction is smaller than the self's
reached the start age a year late.

**Mechanism.** The age an owner reaches in row k is their whole age at the plan's start plus k:
`floor(ageAtStart) + (floor(age) − floor(selfStartAge))`. That is the engine's own birth year counted forward, so it agrees with
`rmdStartAge()` by construction. For the self it is `floor(age)`, as before R40. For a spouse it equals the pre-R40 figure whenever
the self starts on a whole age. The row span and its `endAge` dependence are removed.

**Predicted.**
- **No control or corpus movement.** Every corpus couple with RMDs on starts the self on a whole age, or has no fractional spouse
  offset (the reach scan).
- **Witnesses:** self 72.5 / spouse 72.3, the spouse's IRA $100,000, no return. Rows closing 73 to 76: **0, 3,773.58, 3,773.58,
  3,758.25**. Before R40 they were 0, 0, 3,773.58, 3,773.58.
- **Restored to their figures before R40:** self 72 / spouse 72.5 gives 0, 3,773.58, 3,773.58. Self 80 / spouse 69.5, self-owned,
  gives 4,784.69 (the Table II figure).

## C. Malformed debt reset terms: the validator and the engine agree

**Why (P2; it predates R40).** A numeric-string `nextRateResetAge` such as `"35"` passed both refusals. The debt then ran at 0% after
the reset, or `runPlan()` threw a RangeError: the SA32F-40 and SA32F-21 outcomes R37 closed. The validator also accepted what the
engine refuses: a present but non-number `resetRate`, and a NaN or infinite reset age.

**Mechanism.**
- **The engine** refuses an adjustable debt whose reset age is present (not `undefined` or `null`) and not a finite number, under a
  named code.
- **The validator** reports `WRONG_TYPE` for a present non-number `resetRate` or `nextRateResetAge` on an adjustable debt. It keeps
  `DEBT_RESET_TERMS_MISSING` for a reset rate or payoff age that is absent.

**Predicted.** No corpus plan has such an input, so **no movement**. Witnesses: the reviewer's `"35"` cases are refused by both.

## D. Healthcare inflation is validated

**Why (P3; it predates R40, and R40's LTC repair made it reach the care cost).** `advanced.healthInflation` had no type or range rule.
At −150 it produced a calculation error, and a non-number value silently gave 0%.

**Mechanism, validator only:**
- `WRONG_TYPE` if present and not a finite number;
- `OUT_OF_RANGE` (an error) at −100 or below, where the growth factor is not positive;
- a warning outside the form's 0 to 20.

**Predicted.** Corpus values run from 0 to 8.78, so **no member becomes invalid and nothing moves**.

## E. The app says what R40 charges

**Why (P3).** The app's rules text named the Part D surcharge but not the premium now charged, and nothing said the healthcare
inflation now also grows the care cost.

**Mechanism.** The rules reference and the results' "rules used" line name the Part D base premium, and the healthcare inflation
text names the care cost. The owner said the UI will be rebuilt, so these are wording only.

**Predicted.** **No output change.** The shipped HTML is rebuilt and its pin moved.

## F. Afterwards

r20 is captured twice at the fixed source. **Predicted:**
- r20 equals r19 except for the five members of A, which equal r18's entries;
- nine entries carry `outsideSupportedDomain`;
- control 4.7 ends with 0 unpredicted.
