# Relay to eb — S5AA R52, the repairs for ChatGPT's R46–R51 findings

*Written by Claude, 2026-10-04 (Arizona, UTC−7). This is prose for eb to place once R52 merges; no file of eb's has been edited. It
completes Q192.*

## 1. `MODEL_ASSUMPTIONS.md`

- **IRA and HSA excess (R47's 4973 text):** "Under the warn policy, each owner has one IRA room per year. The year's unused room
  absorbs carried traditional excess first, and that absorbed amount counts as a contribution of the year (IRC 219(f)(6)). Carried
  Roth excess is reduced only by the room left after it. HSA room is separate."
- **QBI (R47's self-employment text):** "Pre-tax workplace deferrals reduce qualified business income only to the extent the deferring
  owner's own salary cannot fund them. The rest is spread over that owner's employment and self-employment pay, and the
  self-employment share reduces QBI (Treas. Reg. 1.199A-3(b)(1)(vi)). A spouse's salary never shields the other owner's deferral."
- **Inherited IRAs (§28.3):** "A scheduled transfer from the deceased's traditional IRA into the survivor's own, dated after the death,
  is allowed. Form 8606 basis moves with it in proportion to the inherited IRA's value on the date. A same-year nondeductible
  contribution becomes basis only at the year's settlement, so it does not move with a transfer that year."
- **The Roth ledger (§28.5):** "Each year's Roth conversion record takes the year-end Form 8606 split. A Roth IRA draw taken the same
  year from that record is re-split, taxable part first, and its 10% is trued up in the next row. Contribution basis is kept separate
  from conversion principal."
  - The refinement note: since R52 the app shows `ROTH_IRA_BASIS_NOT_ENTERED` ("Roth IRA contribution basis") and
    `ROTH_FIVE_YEAR_ASSUMED` ("Roth IRA five-year period") as cards. This replaces §28.5's "no card".

## 2. `FEATURES.md`

"Results: the Roth IRA disclosures 'Roth IRA contribution basis' and 'Roth IRA five-year period' are shown as cards."

## 3. `SPRINT_QUESTIONS.md`

- **Q192:** R47-01, R47-02, R48-01 and R50-01 are repaired in S5AA R52 (source tag `s5aa-r52-source` = `4e1bb95` once pushed), as the
  owner decided on 2026-10-04. The Roth cards are added. ChatGPT's 20 simulations pass 20 of 20, and the corpus is unchanged (r30
  stands).
- **Q189:** a refinement note for the cards.
- **New, the builder's readings for the owner:**
  - D1: the validator accepts only the inherited traditional IRA → the survivor's own; other post-death transfers the engine moves
    are still refused, as before R52.
  - D2: a same-year nondeductible contribution is not carried by a rollover that year.
  - D3: the IRA room is per owner, without 219(c) netting.
  - D4: a joint workplace account's deferrals are the primary's.
- **New, found during R52's browser check (pre-existing, not repaired):** an imported plan's `retirement.manualOrder` is blanked
  when it is not one of the form's three orders, and the plan runs on the default order. The owner decides whether to repair it.
- **Noted:** the app's Rules text on QBI does not mention SE-funded deferrals (true since R47); this is an app-text item.
