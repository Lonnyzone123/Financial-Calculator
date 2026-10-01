# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R42's audits and R43

*Written by Claude, 2026-10-01 (Arizona, UTC−7). Prose for eb to place in eb's own files once R43 merges. No file of eb's has
been edited. Section numbers are `MODEL_ASSUMPTIONS.md`'s at `main` `7d5340d`.*

## 0. What happened

- **ChatGPT's R42 change audit** (PR #44) determined **NO-GO** at `c67c713` on two findings:
  - **R42-01:** a staggered spousal claim averaged the worker's credited months, $144 a year in the witness;
  - **R42-02:** R42's prediction missed `seed:20`.
- **Claude's R42F full-model audit** (PR #45) reported 34 findings, SA42F-01 to -34. Both PRs were merged on 2026-09-30.
- **The owner decided on 2026-09-30:**
  - **R42-01:** repair it.
  - **R42-02:** accept it as a disclosed miss.
  - **R42F:** repair all 34 in one round, R43, together with R42's local one-time Roth fix (SA42F-16). ChatGPT reviews the
    R42F findings and audits their repairs in one report (no separate R42V report). A finding it refutes has its repair
    reverted in a later round if the owner agrees.
  - **Three declared items change:** the spousal IRA, HSA contributions at 65, and survivor costs (§3 below).
  - **Three choices on how findings are repaired:** SA42F-20 uses today's dollars in every mode; SA42F-11 charges Medicare
    to each person 65 or over; survivor costs start at the death unless the surviving spouse has a salary.

R43's source tag is `s5aa-r43-source`; its commit is named in the change handover. S5AA's status, by ChatGPT's latest
determination, is **NO-GO** (R42, PR #44) until ChatGPT reports on R43.

## 1. `SPRINT_QUESTIONS.md`: three new entries

**The spousal IRA follows IRC 219(c)(2)** (the owner, 2026-09-30). On a joint return, the spouse with the higher (or equal)
compensation is limited to their own compensation, after workplace deferrals and HSA contributions. The spouse with less
is limited to their own plus the other's, less the other's IRA contributions. Before R43 the couple shared one pool, so the
higher earner could use the lower earner's pay. Status: IMPLEMENTED 2026-10-01 (S5AA R43).

**HSA contributions stop at 65** (the owner, 2026-09-30). An owner's HSA deposits stop at their 65th birthday, prorated
within the row (IRC 223(b)(7), assuming Medicare enrolment at 65; disclosed). A deposit stopped this way is not a limit
excess, so it is not redirected. Before R43 an HSA owner could keep contributing past 65. Status: IMPLEMENTED 2026-10-01
(S5AA R43).

**Survivor costs start at the death, unless the survivor has a salary** (the owner, 2026-09-30). The rule applies when:
- the self dies after the start and before the retirement age;
- the spouse is alive at that death;
- the spouse has no salary in their work window at that death.

Then these costs start at the death instead of at the retirement age:
- the spending strategy, with its anchor and inflation latches;
- health and LTC costs;
- the retirement-span debt payments.

Pensions, wages and contributions still follow the retirement age, and with a salary nothing changes. Before R43, the
survivor's spending and health costs waited for the dead self's retirement age, within the declared Q59/§7 boundary (R42F §4). Status: IMPLEMENTED 2026-10-01 (S5AA R43).

## 2. `MODEL_ASSUMPTIONS.md`: suggested text

**§18.1, deaths and survivors.**
- **Survivor spending.** After "Survivor spending reductions start the year after a death", add: "When the self dies
  before the retirement age and the surviving spouse has no salary at the death, the household's retired spending,
  health and LTC costs and retirement-span debt payments start at the death (R43)."
- **The survivor test.** Add: "In the row of a death, the spending strategy's survivor test reads who is alive at the
  row's opening (decision 7), even when a retirement falls inside the row (R43, SA42F-29)."
- **RMDs.** Qualify "a death in a later year still owes that year's RMD" with: "An owner who dies inside the first
  distribution year (the year they reach their start age, or for a still-working participant's current-employer 401(k),
  the year they retire) owes none for it: they died before the required beginning date (26 CFR 1.401(a)(9)-2, -3; R43,
  SA42F-03)."
- **Medicare.** After "Medicare costs after a death count only the living", add: "Each living person of 65 or over is
  charged Medicare, including a retired spouse of 65 or over while the self still works (R43, SA42F-11). Costs before
  Medicare keep their household rule."
- **A spouse's account with no spouse.** Add: "With no spouse in the plan, an account owned by 'spouse' is read as the
  only person's account, and the validator warns `SPOUSE_ACCOUNT_WITHOUT_SPOUSE` (R43, SA42F-04)."

**§18.6, Monte Carlo.** Add: "Each path's market and care generators are seeded with a 32-bit mix of (seed, path, stream).
They were seed + 2i and + 2i + 1, so two seeds 2 apart shared all paths but one (R43, SA42F-31). Every Monte Carlo figure
moved once."

**§20, IRA contributions and compensation.** Replace "On a joint return the couple shares their combined compensation
(the spousal IRA)" with the 219(c)(2) rule from §1 above.

**§22, Social Security.**
- **The earnings test, by month.** "A row's earnings-test withholding is charged month by month, in order, to the benefit
  payable in each month. Each benefit is credited for its own months: a charged month credits the person's own retirement
  benefit if that is entitled in the month, and their survivor benefit if that is entitled. The survivor benefit's
  reduction is adjusted at the survivor's full retirement age (20 CFR 404.412; RS 00615.482; R43, R42-01 and SA42F-18).
  The spousal factor's adjustment is still not modelled."
- **COLAs.** "A benefit takes every COLA from its anchor to the age, whatever the claim date (R43, SA42F-02)."
- **The AIME path.** "Someone already past 62 at the start gets the bend points of the year they turned 62 (R43,
  SA42F-17)."

**§23, contributions.**
- **Employer money.** "Employer money (match and profit sharing) is limited so that the owner's non-catch-up deferrals
  plus employer money do not exceed their pay (415(c)(1)(B)); a warning says so (R43, SA42F-12)."
- **The HSA.** "The HSA family limit is shared in dollars (R43, SA42F-15). HSA contributions stop at 65 (§1)." This
  replaces §21's "Not modelled: HSA eligibility (coverage, or Medicare from 65)" for the age part.
- **Timing.** "A planned contribution change dated inside a row is time-weighted across it (R43, SA42F-25)."
- **Forfeiture.** "A deceased owner's unvested employer money is not forfeited at the survivor's retirement (R43,
  SA42F-13)."

**§25, later tax years.** Add:
- "IRA-deduction and Roth phase-out ranges keep their statutory widths (R43, SA42F-08)."
- "Later-year joint IRMAA thresholds are twice the indexed single thresholds (R43, SA42F-22)."
- "A lookback return entered as married filing separately is priced on CMS's separate table (R43, SA42F-10)."
- "A row's age-65 amounts are read at its tax year's close (R43, SA42F-23)."

**A new paragraph (§23 or §25): the 199A deduction.** "Self-employment profit earns the IRC 199A deduction: the lesser of
20% of qualified business income (profit less the deductible half of SE tax) and 20% of taxable income less net capital
gain, with the 199A(i) $400 minimum. It phases out over the threshold, because the modelled business has no W-2 wages or
qualified property. It is taken below the line, so AGI, MAGI and Arizona are unchanged. Assumed and disclosed: the business
is not a specified service business, and the owner materially participates (R43, SA42F-01)."

**§26, input refusals.** Add:
- "Every plan value the engine reads is checked by one contract, `src/plan-value-contract.json`, in both the validator and
  the engine. A wrong type, missing value, out-of-range value or unknown text is refused (`SCENARIO_NONNUMBER_PLAN_VALUE`,
  `SCENARIO_PLAN_VALUE_OUT_OF_RANGE`, `SCENARIO_UNKNOWN_PLAN_VALUE`) (R43, SA42F-05 and -06)."
- "Two validator-only rules stay declared divergences: the legacy `"recurring"` income type, which the engine reads as
  ordinary income, and `TRANSFER_INTO_WORKPLACE_PLAN`, where the engine refuses the transfer rather than the plan."
- "A lifespan equal to the starting age is not alive at the start; a plan with nobody alive is refused by both layers
  (R43, SA42F-30 and -32)."
- "A historical start before 1928 or between data years is refused, `SCENARIO_HISTORY_START_NOT_A_DATA_YEAR` (R43,
  SA42F-34)."
- "A one-time income at or after the end age is warned, `INCOME_AFTER_PLAN_END` (R43, SA42F-28)."

**§19, spending stages.** Add: "A stage amount or income stream is in today's dollars in every growth mode: one that starts
after the plan's start latches the inflation factor at its start (R43, SA42F-20). 'Years of spending in reserve' is sized
on the projected spending (R43, SA42F-21). An other asset that becomes available inside a row covers the part of that row's
need after its date (R43, SA42F-19)."

## 3. `FEATURES.md` and the trackers

- **The R40 unrepaired list.** Its "Medicare coverage is not modelled" item, as it applied to HSA contributions past 65, is
  closed by the owner's ruling (§1). The other two rulings change declared text, §20 (the spousal IRA) and Q59/§7 (survivor
  costs), not that list.
- **Status.** S5AA is NO-GO by ChatGPT's latest determination (R42, PR #44). R43 goes to ChatGPT for a change audit.
- **The expanded baseline.** A new expanded baseline, r22, is registered, and S5b task 4 builds on it in place of r21. Its
  input hash also moves, because the Monte Carlo band member was re-chosen by its rule under the new seeds.
