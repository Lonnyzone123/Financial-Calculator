# S5AA R42 — self-audit

*Written by Claude, 2026-09-30 (Arizona, UTC−7), before the round went to the owner.*

## Claude's own errors this round

| | what went wrong | found by | where it stands |
|---|---|---|---|
| SA42-01 | **The first R41F-01 scan condition read the household's total withholding.** It named `seed:20`, rows 68 and 69, where the self is past full retirement age and the withholding is the spouse's own | reading `seed:20`'s ages before writing the prediction | corrected before the prediction was committed: each worker's own test is isolated, and a row counts only if the other's own test has not already withheld the whole spousal part. Disclosed in the prediction record |
| SA42-02 | **The repair design first allocated the worker's excess to the worker's own benefit before the spousal part,** which is not SSA's rule: deductions fall on the family's benefits month by month, so any withholding with a spousal part on the record takes from both, and the worker's credited months follow the family months charged | re-reading RS 02501.095 while writing the code, before any Social Security edit | built as whole family months, in proportion. The prediction's scan tested only the capped case, so a wider scan (any withholding with a spousal part on the worker's record) was run before the edit: **no corpus plan**. Recorded in the commit and here |
| SA42-03 | **A gate was started with the shell's `&`,** not the tool's background option, against a standing rule | noticed at once | the gate ran to completion and its log was read (`f016317`: 3,157 tests, 0 failing). Every later gate used the background option |
| SA42-04 | **Targeted tests were run while that gate was running,** against the rule of no engine runs during a gate | noticed afterwards | that gate passed, and the 112 targeted tests passed. The next commit's full gate (`c28df6b`: 3,162 tests, 0 failing) ran all of them again with nothing alongside it |
| SA42-06 | **The prediction was wrong: it said no corpus plan moves, and `seed:20` moves.** The corrected R41F-01 scan (SA42-01) excluded rows where the other person's own earnings test already withholds their whole spousal part, on the reasoning that "the repair takes only what is left". Under SSA's order that is false. RS 02501.095 B.4 says to withhold the worker's excess "from the total family benefit that includes the benefits of the working auxiliary" first, and the auxiliary's own excess only from what remains. So the worker's charge on the spousal part lowers the worker's own withholding even when the spouse's would have taken all of it | the gate at the first form of the Social Security commit (`d5d8e10`): control 4.7 failed, 313 unpredicted differences, all in `seed:20` | the movement was traced in the engine's own call and explained to the cent. **Row 67** (self 66 to 67, spouse 62): the self's excess withholds $6,058.09, below the self's own $27,360, and the spouse's own excess withholds the spouse's whole $13,356. Over the family pool of $31,548 (the self's own plus the spouse's $4,188 spousal part), $6,058.09 × 4,188 / 31,548 = **$804.21** falls on the spousal part, which the spouse's excess cannot charge again. Household withholding falls from $19,414.09 to $18,609.88, Social Security rises $804.21, and every later figure follows. The self's credited months stay 3. Declared in `tools/control-candidate-prediction.json` (313 `seed:20` differences re-valued); the commit was amended to carry the declaration (`82856a3`). It moves the expanded corpus too, so a new baseline, r21, is registered |
| SA42-05 | **An expectation was nearly mis-set.** Before reading the rows, Claude expected R41F-04's Roth deposit to be $3,750 (half a year's window), not ChatGPT's $7,500 | a probe of the rows before the prediction was written: rows are labelled by their closing age, and the self is nominally working (at $0) for the whole row | the prediction uses $7,500, which the rows support; ChatGPT's figure was right |

## Observed, not repaired

- **The spousal reduction factor's adjustment** for spousal months withheld before the recipient's full retirement age
  (RS 00615.482 applies an adjustment to any reduced benefit). The model adjusts only the own retirement benefit. It is
  disclosed in the R41F-01 commit and in the engine's comment. No witness exercises it: ChatGPT's spouse is past full
  retirement age.
- **The grace-year cap for the other person's remainder** is held to their service-month pay less the spousal part
  already taken, a conservative reading when some of that part fell in non-service months.

## Checks

Listed with their results in `S5AA_R42_CHANGE_AUDIT_HANDOVER_20260930.md` §5.
