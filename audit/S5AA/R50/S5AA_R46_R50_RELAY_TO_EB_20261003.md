# Relay to eb — S5AA R46 to R50, the AA1 repair rounds

*Written by Claude, 2026-10-03 (Arizona, UTC−7). This is prose for eb to place in eb's own files once the rounds merge; no file of
eb's has been edited. It adds to the R45 relay (`audit/S5AA/R45/S5AA_R45_RELAY_TO_EB_20261003.md`), which still stands. Each
round's build report has a "Suggested text for eb's files" section, and this relay gathers those sections. Where the owner's later
decisions changed a builder's text, the change is made here and marked.*

## 0. What happened

- Five rounds built the owner's remaining AA1 decisions in parallel from R45. Claude combined them in order on
  `sprint/s5aa-r46` to `sprint/s5aa-r50`.
- **Source tags** (once pushed, on the owner's go): `s5aa-r46-source` = `0fd83e1`, `-r47-` = `86842f6`, `-r48-` = `56ed5fd`,
  `-r49-` = `ec6063f`, `-r50-` = `5119d03`.
- **Baselines:** r25 to r29.
- The owner chose **one combined ChatGPT audit over stacked PRs** (handover:
  `audit/S5AA/R50/S5AA_R46_R50_CHANGE_AUDIT_HANDOVER_20261003.md`).
- **The misses.** R47, R48 and R50's predictions each missed plans. As with R43, the owner required corrected scans proven on the
  pre-repair trees (`audit/S5AA/R47/retro/`, `R48/retro/`, `R50/retro/`).
- A follow-up round, **R51**, is being built for four owner decisions (§6 below). Its text will follow in its own relay.

## 1. `MODEL_ASSUMPTIONS.md`

**§18.6, Monte Carlo (R46).**
- Retitle: "Monte Carlo: one set of market shocks per year, shared by every account".
- New body: "Each simulated year draws one set of shocks for the whole household: one per asset class, correlated at the plan's
  correlation, or one household shock when asset classes are off. Every account's return is its expected return plus its
  allocation's share of those shocks. Splitting the same investments across more accounts, reordering them or adding an empty one
  therefore changes nothing. One $1,000,000 Roth and twenty $50,000 Roths now both succeed on 59.8% of 1,000 paths; before, the
  twenty succeeded on 99.2%. A correlation that no set of returns can have is refused: below −1/(n−1) for the n classes the
  accounts hold, or above 1. Every Monte Carlo figure with more than one account moved, and the golden Monte Carlo plan's success
  fell from 100% to 96.8%. (Carried as U6; repaired in the old engine by R46 on the owner's AA1 decision of 2026-10-03.)"

**The reserve (R46):** "The reserve is the household's. Every account blends in the same share (spending × years ÷ the
portfolio, at most all of it) at the reserve's 3%. Before, it was capped at each account's own balance, so an account smaller than
the reserve under-reserved (MC-B; Q66)."

**Results (R46):** "The headline figure is the share of paths with no modeled shortfall over one cent in any year, labelled 'All
modeled spending funded'. An adaptive strategy can reach it by cutting spending, so Monte Carlo shows beside it the final year's
spending in today's dollars, at the median and at the 10th percentile."

**Tax rules after 2026 (R47):** "The enhanced senior deduction (IRC 151(d)(5)(C)) applies only to tax years beginning before 2029.
Plan year k is tax year 2026 + k, so from plan year 3 (2029) there is none. (AA1-30, reversing Q165's 'keep it after 2028'.)"

**Contributions (R47):**
- "Above the IRC 414(v)(7) threshold ($150,000 of prior-year FICA wages, used for 2026, indexed), a pre-tax workplace plan's
  catch-up is deposited to a designated Roth balance in the same plan and taxed in the year. Prior-year wages are the entered figure
  for the first year. After that they are the prior year's projected salary from that employer, less any HSA salary reduction."
- *Changed by the owner's R51 decision:* "A plan marked as offering no Roth contributions allows no catch-up then (414(v)(7)(B)).
  The plan editor has a 'plan offers Roth' checkbox (R51)."

**Limit policy (R47):** "Under 'Show warning and permit it', an IRA or HSA excess stays in the account. It pays IRC 4973's 6% each
year on the excess carried at year end, at most 6% of those accounts' value. The charge is reduced by distributions included in
income (any Roth IRA distribution) and by later unused contribution room, and it is paid with the next year's taxes. 401(k) excess
deferrals are not charged it."

**Self-employment (R47):** "Self-employment counts as compensation net of the deductible half of its SE tax. Pre-tax plan deferrals
funded from SE pay (the part the salary cannot cover) reduce qualified business income in proportion."

**HSA and Medicare (R47, with the owner's R51 decision):**
- "HSA contributions stop when Medicare starts. That is 65 for someone who claims Social Security by 65 or has no benefit entered,
  otherwise six months before the claim. An entered Medicare start age overrides it."
- *R47 alone said:* "Medicare premiums still start at 65".
- *The owner decided one Medicare date:* premiums and IRMAA start at the same Medicare start age (R51; final wording with R51).

**Medicare, §11 / §18.4 (R48):**
- "Medicare premiums grow from their 2026 figures at the Medicare growth rate the plan enters, or at healthcare inflation. That
  covers Part B with the income-related amounts, the Part B deductible and the Part D premium. They grow by the same factor as the
  pre-Medicare cost, and the income thresholds rise with the plan's inflation."
- "An entered Part D premium (monthly, per person, today's dollars) replaces the national base premium; any income-related Part D
  amount is added."
- "A blank prior-year income is assumed below the first surcharge tier, and the app says so."

**Succession, §18.1 (R48):**
- "A survivor under 59½ at the death holds the deceased's traditional IRAs as an inherited IRA. There is no 10% additional tax. The
  spouse-beneficiary required distribution is on the survivor's single life expectancy, from the year the deceased would have
  reached their required age when the death came before it. The deceased's IRA basis is kept in its own pool."
- "From the first year that opens at 59½ or later, or the year after a contribution to it, the survivor treats it as their own. A
  workplace plan passes as the survivor's own."
- "With the plan's community-property switch on, every taxable account's basis resets to its value at the first death (IRC
  1014(b)(6)): joint accounts and both spouses' own. With it off, the decedent's resets, and half of a joint account."

**Arizona, §5 (R48):**
- "Arizona AGI also subtracts the federal senior deduction the return takes (A.R.S. 43-1022(35), from 2025), so it follows the
  federal deduction's phase-out and its end after 2028."
- "It also subtracts 25% of net long-term capital gain on assets bought after 2011 (43-1022(22)(c)), for the share of realized
  gains the plan enters (none by default; the owner confirmed 0%)."

**Spending flexibility (R49, with the owner's R51 decision):**
- "After a year whose portfolio return is negative, spending is cut by the flexibility percentage for the next year only."
- "Since R49 the cut never takes spending below the floor entered for the strategy: the spending floor of guardrails,
  Guyton-Klinger and floor-and-ceiling, the remaining-life strategy's minimum withdrawal, and VPW's minimum rate. Spending already
  below the floor (a stage, the survivor reduction) is neither cut further nor raised."
- "Overlapping percentage stages multiply. The validator warns about them, and warns when flexibility stacks on guardrails or
  Guyton-Klinger."
- *Changed by the owner's decision:* the default flexibility becomes 0% (off) in R51; R49's text said 10%, pending.

**Long-term care (R49):**
- "Care starts at `advanced.ltcOnsetAge` when entered (the primary's age). Monte Carlo then draws the start uniformly from 10 years
  before to 10 years after it, never before the plan's start."
- "Blank, care starts at max(65, round(retirement age + 10)), weighted by the probability in the simple and historical
  projections. In Monte Carlo it starts, with that probability, at max(65, round(retirement age + 5 + 20u))."

**Debts (R49):**
- "PMI stops at the debt's `pmiEndAge` when entered."
- "Otherwise, a conventional mortgage with its original and remaining terms stops PMI after the midpoint of its amortization (12
  USC 4902(c)), on the primary's clock. It stops at the start of the projection month after the one holding the midpoint. The
  automatic 78% termination (4902(b)) is not modelled."
- "FHA, VA, USDA and other programs keep PMI while a balance is owed."
- "The validator warns when the scheduled payments leave a balance at the payoff age, which the plan pays in one sum; the debt
  editor shows that sum."
- Section 9's inert-field list: where PMI is charged, `mortgageType` and `loanTermYears` are no longer inert. They and
  `remainingTermYears` set the PMI default.

**§7, no working-years budget (R49, with the owner's R51 decision):**
- "A warning, `WORKING_YEARS_NOT_FUNDED_BY_PAY`, names the first working year whose pay is below zero. Pay here is the working share
  of salary, less the wage-only payroll and income tax and the contributions, less the debt payments and PMI made in the working
  months. No figure moves."
- *Changed by the owner's decision:* employment and self-employment streams count as pay in R51 (R49 alone left them out).

**Disclosures (R49):** the app now shows the engine disclosures listed in R49's build report §2 as cards, and it runs the validator
on the active plan.

**The Roth section, Q111's (R50):**
- "A Roth IRA keeps a basis ledger per owner (IRC 408A(d)(4); Treas. Reg. 1.408A-6). Its layers are regular contributions, then each
  year's conversions (taxable part first), then earnings."
- "Some distributions are not qualified: the owner is under 59½ at the year's opening (a transfer is judged at its own date), or the
  owner's five-year period has not run. Such a distribution takes contributions tax-free. It bears the 10% on a conversion's taxable
  part within five years of that conversion. It is taxed on earnings, with the 10% under 59½."
- "Opening basis is the entered contribution basis. Blank means none, the cautious reading, and the app discloses it."
- "The five-year period runs from the entered first-contribution year. For a Roth IRA held at the start it is taken as met
  (disclosed)."
- "A surviving spouse takes over the ledger."
- "A Roth 401(k) or custom tax-free account is still modelled as untaxed at every age, and is flagged when drawn before 59½ (the
  owner kept this, disclosed)."
- "Not modelled: conversions before the plan (enter those older than five years as basis), the disability and first-home
  exceptions, and a transfer into a Roth IRA dated after the year's draw counting before it."

**§25, partial rows (R50):**
- "When income received earlier in the plan's first tax year is entered, a partial first row's federal and Arizona income tax is
  the tax on the whole year's ordinary income, less the tax on the earlier income alone. Payroll tax is unchanged. The row's MAGI
  (IRMAA, the IRA deduction) is still the row's own."
- "Blank, the partial row is taxed as before: as a whole year holding only its own income. The last row, ending at a death, is
  correct as it is."

## 2. `FEATURES.md`

- **Monte Carlo (R46).** Replace line 139 ("Known limitation: Monte Carlo draws each account's return independently…") with: "Monte
  Carlo draws one set of correlated asset-class shocks per year, shared by every account; an impossible correlation is refused."
- **Results (R46):** "The success figure is labelled 'All modeled spending funded', with Monte Carlo's final-year real spending
  (median and 10th percentile)."
- **New inputs:**
  - R47: "Medicare starts at (your age)", "Spouse Medicare starts at".
  - R48: Medicare premium growth; Part D plan premium; "Our accounts are Arizona community property"; the share of realized gains on
    assets bought after 2011.
  - R49: LTC onset age; a debt's PMI end age.
  - R50: Roth IRA contribution basis; first Roth IRA contribution year (each spouse); taxable income received earlier in the first
    year.
- **Features (R47):** the designated Roth catch-up; the 4973 excise under "warn".
- **Cards and checks:**
  - R48: the "Medicare surcharge in the first two years" card; the validator's prior-income prompt.
  - R49: "Plan checks", the plan's validator warnings listed in the header as you edit; engine disclosures shown as cards; a card on
    how the tax figures are estimated; the payoff lump sum shown in the debt editor.
- **Renames (R49):** the optimizer is now "Rule-based withdrawal order" with a "Tax-sensitive ordering goal (heuristic)".
- **Omissions (R50).** Replace "Roth ordering and five-year clocks" with: "Roth 401(k) basis recovery and its plan five-year period
  (a Roth IRA's ordering and clocks are modelled since S5AA R50); Roth IRA conversions made before the plan."

## 3. `SPRINT_QUESTIONS.md`

- **Q165:** the refinement "Keep it even after 2028" is reversed by the owner's AA1 decision of 2026-10-03 (AA1-30). Implemented at
  `f02e26a` (R47), tagged at `86842f6`. Status: IMPLEMENTED.
- **Q19 (b):** "Revised by the owner, 2026-10-03: under Monte Carlo, an account created mid-year takes that year's shared shock
  (R46, one shared draw per period). A direct generator caller keeps the suppressed-draw contract."
- **Q45:** "Repaired by S5AA R46: both layers refuse an infeasible correlation (`INFEASIBLE_CORRELATION`)."
- **Q66:** "Repaired by S5AA R46: the reserve share is the household's."
- **Q111:** "Narrowed by S5AA R50 (the owner's decision on AA1-36, 2026-10-03): Roth IRAs are modelled. The exclusion remains for a
  Roth 401(k) or custom tax-free account drawn before 59½ (kept by the owner, disclosed)."
- **Q172:** "S5AA R50 (AA1-31): an optional `profile.priorIncomeThisYear` completes the first partial year when entered; blank keeps
  the disclosed convention."
- **New, decided by the owner on 2026-10-03:**
  - the result contract stays at version 5 (R46's `finalYearRealSpending` is optional);
  - the Arizona post-2011 gain share defaults to 0%;
  - inherited-IRA status covers traditional IRAs only;
  - the Roth 401(k) stays as before, disclosed;
  - **R51:** flexibility defaults to off; one Medicare date; the working-years check counts employment and self-employment streams;
    a "plan offers Roth" checkbox.
- **New, recorded limit (R49):** "PMI's automatic 78% termination (12 USC 4902(b)) is not modelled. The default is the midpoint, the
  latest the law allows."
- **Builders' readings, recorded in each build report for the auditor and not yet ruled on by the owner:**
  - R46 §"Decisions" 3 to 5: "active" classes, the refusal's scope, the summary's definition;
  - R47 §7: the 4973(b)(2)(A) conversion reading;
  - R48 §7, items 2, 3, 5 and 6;
  - R50 §8, items 2 to 4.

## 4. `S2_CARRIED_WORK_REGISTER.md`

**U6:** "Repaired in the old engine by S5AA R46 (the owner's AA1 decision, 2026-10-03), ahead of the CPU rebuild."

## 5. Trackers and the Roadmap

- **S5AA:**
  - AA1 (#55, #56, verification #57); R45 (#58);
  - R46 to R50 as stacked PRs with one combined ChatGPT audit;
  - R51 to follow.
- **The CPU tracker:** U6 (one shared Monte Carlo draw) is now repaired in the old engine; the rebuild must keep it.

## 6. R51, for the next relay

R51 builds the owner's four follow-up decisions:
- `defaultPlan.retirement.flexibility` 10 → 0;
- Medicare premiums and IRMAA at each person's Medicare start age;
- the working-years check counts employment and self-employment streams;
- a `planOffersRoth` checkbox.

Its final wording replaces the marked sentences above.
