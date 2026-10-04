# Relay to eb — S5AA R53, the repairs for R51F-01, R52-01 and R52-02

*Written by Claude, 2026-10-04 (Arizona, UTC−7). This is prose for eb to place once R53 merges. No file of eb's has been edited.
It follows the R52 relay (`audit/S5AA/R52/S5AA_R52_RELAY_TO_EB_20261004.md`); place that one first.*

## 1. `MODEL_ASSUMPTIONS.md`

- **The earnings test's grace year:**

  > In the grace year (the year an owner stops working), each benefit month is judged on that owner's own wages in it: salary until
  > their work ends, plus their dated employment streams. A month with wages at or below the monthly exempt amount is not withheld,
  > whatever the year's earnings (20 CFR 404.435(a)(7), 404.430(a)). The amount is 1/12 of the annual one: $2,040 in 2026, or $5,430
  > for the months of the full-retirement-age year before that age.
  >
  > Any self-employment profit in a month makes it a service month. This is a cautious approximation, because the plan has no hours
  > input; SSA would look at substantial services instead (404.435(c), 404.446). A month that a job's start or end splits is judged
  > part by part, each part at its own rate. Later years use the annual test only.

- **Restore:**

  > A restored backup keeps every validated value. The form shows each stored value, and a field is rounded to the half year or
  > clamped only when the user edits it.
  >
  > Not kept: the Monte Carlo run count, which is rounded to hundreds; the form's other range clamps; an end age above 100, which is
  > capped; and the keys the form does not carry (`ssFra`, `pensionStart`, `pensionAge`), which the engine does not read.

- **The horizon:**

  > A plan's end age must be at or after the primary's retirement age. The validator, the import and the engine refuse an earlier end
  > age (`END_AGE_BEFORE_RETIREMENT` / `SCENARIO_END_AGE_BEFORE_RETIREMENT`). A plan that ends while still working is entered with the
  > retirement age equal to the end age. A spouse's own later retirement is allowed.

## 2. `FEATURES.md`

- "A restored manual withdrawal order that is not one of the three listed is shown as an extra option and kept."
- "An end age before the retirement age is refused, with a message naming it."

## 3. `SPRINT_QUESTIONS.md`

- **R51F-01, R52-01 and R52-02** are built in S5AA R53 as the owner decided on 2026-10-04 (source tag `s5aa-r53-source` = `2a1f5ba`,
  once pushed). They await ChatGPT's audit. The corpus is unchanged; r30 stands.
- **The owner's rulings after the build (2026-10-04):**
  - the refusal is kept, with a companion adapter for the auditor's scripts;
  - the full-retirement-age year uses the higher monthly amount, $5,430.
- **New, for the owner:**
  - the import's shared refusal prefix ("a structural problem that would break the projection") overstates a rule the owner chose;
  - D2: the other restore rounding and clamps listed in §1 are unchanged;
  - D4: any self-employment profit in a month counts as services, which is cautious;
  - pre-existing: at the base, a plan saved with a blank manual order withdrew nothing.
- **Closes:** the R52 handover §7 manual-order item. An unlisted stored order is now kept.
