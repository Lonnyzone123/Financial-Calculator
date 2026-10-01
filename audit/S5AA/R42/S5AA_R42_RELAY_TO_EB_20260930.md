# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R41F and R42

*Written by Claude, 2026-09-30 (local, UTC−7). Prose for eb to place in eb's own files once R42 merges; no file of eb's has been
edited.*

## 0. What happened

**ChatGPT's R41F whole-model audit** (PR #42) audited the unchanged `s5aa-r41-source` (`984197c`) and determined
**NO-GO**. It found five defects and said this supersedes the R41 GO for status purposes; the R41 GO had covered only the
R41 change and E15. E15's browser record and the A-09 exceptions stand.

Claude reproduced all five exactly, and read the two Social Security rules at SSA's POMS. The owner decided on
2026-09-30: **"Repair all five in R42"**. #42 is the owner's to merge; check its merge commit on `main` before
citing it.

R42 repairs them. The source tag is `s5aa-r42-source`; its commit is named in the change handover.

## 1. `SPRINT_QUESTIONS.md` — one new entry

**The decision (the owner, 2026-09-30): "Repair all five in R42".**
- **R41F-01 (P1).** A worker's earnings-test excess is charged against the family's benefits on the worker's record:
  the worker's own and the spouse's spousal benefit, in whole months (POMS RS 02501.095). Before, the spousal benefit
  was still paid: $18,000 too much income a year in the witness.
- **R41F-02.** A survivor's 82.5% limit reads the deceased's reduced benefit with the months the earnings test withheld
  while the deceased was alive, effective from the deceased's (would-be) full retirement age (RS 00615.320,
  RS 00615.598). Before, the survivor got $6,300 a year too little in the witness.
- **R41F-03.** On a joint return, an IRA owner's contribution window is the longer of the owner's own work and the
  spouse's. This completes Q162 5c; before, an owner who stopped halfway through a row the spouse worked in full got
  half a year.
- **R41F-04.** The Roth IRA limit's salary-only MAGI proxy reads each salary at its share actually worked in the row. It
  confirms the R40 unrepaired list's "Roth MAGI proxy's partial row" suspicion, which is now repaired.
- **R41F-05.** A Social Security benefit (`ssBenefit`, `spouseSS`) that is present and not a number is refused. The
  validator reports `WRONG_TYPE`, and the engine refuses it with `SCENARIO_NONNUMBER_PLAN_VALUE`. Before, it ran as a zero
  benefit with no error.

Status: IMPLEMENTED 2026-09-30 (S5AA R42). No corpus figure moves (predicted and measured).

## 2. `MODEL_ASSUMPTIONS.md`, suggested text

**§22, Social Security.**
- Add: "A worker's earnings-test excess is charged against the family's benefits on the worker's record, their own and
  a spouse's spousal benefit, in whole months, as SSA withholds them (POMS RS 02501.095). The other person's own
  earnings test applies to what is left of their benefit. The adjustment of the spousal reduction factor for spousal
  months withheld before the recipient's full retirement age is not modelled (R42)."
- Add to the survivor sentence: "the reduced benefit in that limit carries the deceased's adjustment for months the
  earnings test withheld while they were alive, effective from the month they reached, or would have reached, full
  retirement age (RS 00615.320, RS 00615.598; R42)."

**Contributions (the section with Q162).** Replace "On a joint return, a spouse who is not working can fund an IRA while
the other spouse works" with: "On a joint return, an IRA owner can contribute while either spouse works: the window is
the longer of the owner's own work and the spouse's, up to the owner's own stop age and life (R42)."

**The Roth limit.** Add: "The salary-only MAGI proxy reads each salary at the share of the row actually worked (R42)."

**§26, input refusals.** Add: "An entered Social Security benefit that is present and not a number is refused (R42)."

## 3. The status trackers

S5AA's status by ChatGPT's latest determination is **NO-GO** (R41F, PR #42) until ChatGPT reports on R42. The trackers'
"GO, not closed" lines from #41 are superseded by R41F. R40's unrepaired list named the Roth proxy's partial row as a
suspicion; R42 confirms and repairs it.
