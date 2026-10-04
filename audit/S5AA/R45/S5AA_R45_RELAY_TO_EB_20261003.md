# Relay to eb — the AA1 assumptions audit and R45 (each spouse's own retirement date)

*Written by Claude, 2026-10-03 (Arizona, UTC−7). Prose for eb to place in eb's own files once R45 merges. No file of eb's has
been edited. It adds to the R44.1 relay, which still stands.*

## 0. What happened

- **The owner asked for an assumptions audit** (AA1): ChatGPT compared the model's stated assumptions and the owner's decisions
  with tax law and planning standards (brief: PR #55; report: PR #56,
  `audit/S5AA/AA1/S5AA_AA1_ASSUMPTIONS_AUDIT_20261003.md`). 47 rule groups: 11 consistent, 3 acceptable simplifications,
  25 should change, 7 judgment calls, 1 unverified. It is not a GO/NO-GO determination.
- **Claude verified it** (PR #57, `audit/S5AA/AA1/S5AA_AA1_CLAUDE_VERIFICATION_20261003.md`): of 36 findings not rated
  consistent, 19 confirmed, 17 qualified, none refuted. The owner's decisions on each are at the end of that record.
- **R45** builds each spouse's own retirement date with the owner's AA1 adjustments. Later rounds take the rest, each audited
  by ChatGPT: Monte Carlo and the reserve; federal tax and accounts; Medicare, survivors and Arizona; spending, defaults and
  disclosure. S5AA closes after the last.

## 1. `SPRINT_QUESTIONS.md`: new entries

**Each spouse's own retirement date** (the owner, 2026-10-03): "both spouses need their own retirement date". Decided:
- `profile.spouseRetireAge`, the spouse's own retirement age on their own clock; absent, `retireAge` on their own clock.
- Household costs start at the **first** stop (the owner first chose "last one retires"; Claude pointed out it would delay
  every younger-spouse couple and drop pay-first, and the owner chose the first stop). Whoever still works pays first.
- Only an earner's stop counts. A death before retiring is a stop on either side (replaces R43's salary exception).
- The past-retirement warning only beside a salary; the earned-income warning counts employment and self-employment streams.

Status: IMPLEMENTED 2026-10-03 (S5AA R45).

**AA1-40, conversions and health coverage** (the owner, 2026-10-03): conversions get a "Conversions start at" age (default:
the retirement age, as before); pre-Medicare health costs get an "Employer health coverage ends at" age (default: the household
date). Status: IMPLEMENTED 2026-10-03 (S5AA R45).

**AA1-38/39, the household cost date** (the owner, 2026-10-03): keep the first-stop and death rules, with an optional
"Retirement spending begins at" age that replaces the first stop. Status: IMPLEMENTED 2026-10-03 (S5AA R45).

**Q165 reopened** (the owner, 2026-10-03, on AA1-30): the enhanced senior deduction **ends after 2028**, as IRC 151(d)(5)(C)
says; the 2026-09-29 refinement "Keep it even after 2028" is reversed. Status: DECIDED, to be built in the federal-tax round.

**The other AA1 decisions** (2026-10-03), each DECIDED and assigned to a later S5AA round, as listed in the verification
record's "The owner's decisions": Monte Carlo common shocks, correlation refusal and the success label; the household reserve;
the Roth catch-up; the 4973 excise; the self-employment fixes; HSA to Medicare start; Medicare premium growth and a Part D
input; the prior-income prompt; inherited IRA to 59½; the community-property switch; the Arizona senior and capital-gain
subtractions; the 10% default return relabelled (not changed); the working-years check; LTC onset age; flexibility (off by
default, never below the floor); PMI end age and the payoff residual; hidden warnings shown and the validator run while
editing; relabels and notes; a Roth basis ledger; earlier-this-year income.

**Not chosen, carried as recorded limits:** a full working-years budget, itemized deductions, a tax-optimizing solver, full
Roth five-year clocks, surviving-spouse filing status with a child input, Social Security benefit-cut scenarios, the SSA-44
IRMAA reduction, tax lots.

## 2. `MODEL_ASSUMPTIONS.md`: suggested text

**A new section, "Retirement dates and the household date":** "Each person retires on their own clock: the primary at
`retireAge`, the spouse at `spouseRetireAge` (absent, `retireAge`). The household's retired costs -- spending, the spending
strategy's starting balance, debt and housing costs, Medicare costs, the cash reserve -- start at the household date: the first
of the primary's retirement, an earning spouse's retirement, or a death before retiring on either side, unless a 'retirement
spending begins at' age is entered. Whoever still works pays those costs first from their net pay. Pre-Medicare health costs
start when employer coverage ends (absent, the household date); Roth conversions start at their own age (absent, the
primary's retirement age). The pension, long-term-care onset, the glide path, the bond tent and dividends paid from retirement
keep the primary's retirement age (R45)."

**§18.1, survivors:** replace R43's sentence on survivor costs with: "A death before retiring starts the household's costs at
the death, whatever the survivor earns; the survivor's pay funds them first (R45, replacing R43's salary exception)."

**§26, validation:** "The 'retirement age before the current age' warning fires only beside a salary, for either spouse (R45)."

## 3. `FEATURES.md`

Under the profile and retirement inputs: "Spouse retirement age", "Retirement spending begins at", "Conversions start at",
"Employer health coverage ends at" (R45).

## 4. Trackers and the Roadmap

- S5AA: AA1 (brief #55, report #56, verification #57); R45 in progress on `sprint/s5aa-r45`; four themed rounds to follow.
- The CPU tracker: no change of status from AA1 or R45.
