# Relay to eb — S5AA R51, the owner's follow-up decisions

*Written by Claude, 2026-10-03 (Arizona, UTC−7). This is prose for eb to place in eb's own files once R51 merges; no file of eb's
has been edited. It completes the R46 to R50 relay (`audit/S5AA/R50/S5AA_R46_R50_RELAY_TO_EB_20261003.md`): where that relay
marked a sentence as changed by R51, use the text here. The source is R51's build report §8, with the owner's rulings applied.*

## 0. What happened

- **R51** (source tag `s5aa-r51-source` = `ee06ea5` once pushed, on the owner's go; baseline r30) builds the owner's four follow-up
  decisions on R46 to R50, and two of the owner's rulings on its builder's readings.
- **Control 4.7 has a successor control, `s5aa-r51-control`:** the flexibility default changes sixteen control plans. The owner
  chose a successor (the S5 precedent), and `s5-control` is kept as its predecessor.
- **The ChatGPT audit** is one combined audit over R46 to R51 (handover:
  `audit/S5AA/R51/S5AA_R46_R51_CHANGE_AUDIT_HANDOVER_20261003.md`).

## 1. `MODEL_ASSUMPTIONS.md`

**Medicare, §18.4 (R51; replaces R47's "Medicare premiums still start at 65"):** "Each person's Medicare costs start at their
Medicare start. These costs are Part B with any IRMAA amounts, the Part B deductible and the Part D premium. The Medicare start is:
- 65 for someone who claims Social Security by 65 or has no benefit entered;
- otherwise half a year before the claim (Part A is backdated up to six months);
- or the Medicare start age entered.

HSA contributions stop at the same date. Until then that person carries their share of the pre-Medicare cost. The start falls
inside a projection year where it falls, as the HSA's stop does. The Part B late-enrollment increase (42 USC 1395r(b)) is not
modelled."

**§7, working years (R51; replaces R49's sentence that streams are not counted):** "The working-years warning counts as pay the
salary and any employment and self-employment income paid while working, each net of the tax it adds:
- the salary, net of its wage-only payroll and income tax;
- the streams, net of their marginal share of the same return with them added: federal and Arizona income tax, payroll tax and
  self-employment tax."

**Withdrawal ordering (R51; replaces R50's 'by the share of the Roth class a draw would tax'):** "The rule-based order ranks a Roth
class by the cost of the next dollar it would pay:
- nothing while a Roth IRA's next dollar is contribution basis, a conversion's nontaxable part or a conversion past five years;
- nothing when the owner is qualified, or when the next account is a Roth 401(k);
- the 10% weight on a conversion's taxable part inside five years, before 59½;
- tax and the 10% on earnings."

**Spending flexibility:** "The default flexibility is 0 (off) since S5AA R51."

**Contributions:** "A traditional 401(k) can be marked as not offering Roth contributions (a checkbox in the account editor, checked
by default). Without them, a catch-up that must be Roth is not allowed (414(v)(7)(B))."

## 2. `FEATURES.md`

- "Accounts: a traditional 401(k) can say whether its plan offers Roth contributions. It decides whether a catch-up that must be
  Roth is allowed."
- "Medicare start ages now set when Medicare costs start, as well as the HSA stop."
- "Spending flexibility is off by default."

## 3. `SPRINT_QUESTIONS.md`

- **AA1-25(c):** answered. Flexibility is off by default (the owner, 2026-10-03; S5AA R51, `b722884`).
- **"Should employment and self-employment streams count as pay in the working-years check?"** Answered yes, net of payroll,
  self-employment and income tax. The owner decided to count them and, rejecting the builder's payroll-only reading (D3), required
  the income tax as well.
- **One Medicare date:** decided and built (S5AA R51).
- **R50 §8 item 2, the optimizer's Roth weight:** answered by the owner, 2026-10-03. It is the cost of the next dollar drawn,
  replacing the exposed-share form (S5AA R51, `2f73b85`).
- **R50 §8 items 3 and 4:** keep `ROTH_FIVE_YEAR_ASSUMED` as decided; the first partial row's MAGI stays the row's own.
- **R51's readings confirmed by the owner:**
  - D1: the sensitive band at its 85.0% edge;
  - D2: a spouse's Medicare from 65 exactly, inside the row;
  - D4: the optimizer's 63/65 heuristics;
  - D5: no Part B late-enrollment increase, a recorded limit.
- **Open for the owner:** D6. A Roth 401(k) first in the Roth class's draw order weighs 0.
- **New, decided:** the control corpus after a `defaultPlan` change gets a successor control, never an edit or a frozen old default
  (the owner, 2026-10-03; control rules 3 and 5).

## 4. Trackers and the Roadmap

- **S5AA:** R46 to R51 as stacked PRs with one combined ChatGPT audit; baselines r25 to r30. The control is now `s5aa-r51-control`.
- **The CPU tracker:** no change of status from R51.
