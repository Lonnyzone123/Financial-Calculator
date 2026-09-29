# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R37

*Written by Claude, 2026-09-29 (local, UTC−7). Prose for eb to place in eb's own files once R37 merges; no file of eb's has been
edited. Checked against the code at `4a9a15e`.*

## 0. What happened

R37 repairs the rest of the R32F/R32V register. The source is `s5aa-r37-source` = `4a9a15e`, and the handover is
`audit/S5AA/R37/S5AA_R37_CHANGE_AUDIT_HANDOVER_20260929.md`, which lists each finding's commit.

## 1. `SPRINT_QUESTIONS.md`

- **Record as applied, as recommendations of record:**
  - housing costs rise with the plan's inflation, disclosed (SA32F-43);
  - an expense at `endAge` is warned about (SA32F-38);
  - filing status against household is a warning, not a refusal (SA32F-35).
- **Record decision 7 as applied** ("Keep average, disclose", SA32F-42).
- **Q137:** R37 applies its opening-age convention to the HSA's age-65 exception (SA32F-44), declared, no behaviour change. That
  extension is Claude's reading; the owner has not ruled on it.
- **Claude's choices for the owner to confirm or change:**
  - a joint account's percent of salary reads the household's salary (SA32F-45);
  - Monte Carlo guidance withholds the amount and the cut (SA32F-41);
  - the 1959 warning is now a visible card.
- **A question for the owner:** the default plan files jointly with no spouse, so a default plan now shows the filing card. Should
  the default change?

## 2. `MODEL_ASSUMPTIONS.md`, suggested text

**§8 (SA32F-48).** The heading still says "decided, not yet built". It is built. RESULT_CONTRACT.md's C6 rows were corrected in R37,
and `tests/result-contract.test.js` asserts it ("conflict C6, reconciled (S5 2o)"). Please mark §8 built, keeping the decision text.

**§9, the inert fields (SA32F-50).** Add:
> - **`debt.mortgageType`, `debt.originalAmount`, `debt.propertyValue` and `debt.loanTermYears`** are recorded for reference and
>   change nothing. The projection runs on the balance, rate, monthly payment and payoff age. An interest-only loan is modelled by
>   entering its interest-only payment. The debt page says so.

Then add these four to `tests/inert-scenario-fields.test.js`'s list in the same commit. That test requires §9 to name every field it
holds; R37 holds them in `tests/audit-s5aa-r37-inert-mortgage-fields.test.js` until then.

**§18.3, beside "Age 59½ inside a projection year" (SA32F-44).** Add:
> The HSA's age-65 exception to the 20% additional tax follows the same convention. A year that opens before the owner turns 65 and
> ends after it has its whole non-qualified draw charged the 20%.

**New text, wherever eb places it:**
> - **Housing costs (SA32F-43).** A mortgage's property tax, insurance and HOA rise with the plan's inflation, at the price level the
>   year's spending uses. PMI is a term of the loan and stays as entered.
> - **Input refusals (SA32F-21, -40, -51).** An adjustable debt that resets at an age needs its reset rate and payoff age. A debt's
>   extra principal, PMI, property tax, insurance or HOA must be a number of zero or more, and its payment a number. An asset
>   class's volatility must be zero or more. A historical start must be a data year. `runs` is at most 10,000. Each is refused by
>   name, and the validator agrees.
> - **Warnings (SA32F-27, -35, -38).** A joint return with no spouse included, or a single or head-of-household return with one, is
>   reported. So is an expense at or after the end age, which no year charges, and each person born in 1959 whom the plan carries to
>   73. The results page shows them.
> - **Monte Carlo (SA32F-41, -42, -52, -53).**
>   - The expected return is an arithmetic mean. Each year's draw is held to [−95%, +200%], which raises the realised mean only at
>     very high volatility.
>   - A partial year grows by (1 + r)^t.
>   - Monte Carlo guidance gives the unsuccessful paths' median ages and withholds a shortfall amount and a spending cut.
>   - Simple mode shows the average path, not the typical one.
> - **A joint account (SA32F-45).** Its percent of salary is the household's salary.

## 3. `FEATURES.md` (SA32F-54)

- **Line 146,** "ARM payment shock ... Behind `advanced.armRecastOnReset`, default off": the flag was retired in S5AA task 5.1 (Q94,
  F8). An adjustable debt re-amortises at its reset unconditionally; see `tests/arm-payment-reamortization.test.js`'s header.
- **Line 43,** "`build.js` ... all **eight** namespaced modules", naming `MortgageVsInvesting`: `build.js` bundles five
  (`DebtAmortization`, `DebtRevolving`, `DebtRefinance`, `DebtArm`, `DebtRecast`). Three are `bundled: false` under P19.
- **The warnings panel** gains the filing, expense-at-end, 1959, "How Monte Carlo draws returns" and "Average return path" cards.
  The debt page gains the inert-fields note.

## 4. Where this round lives

On branch `sprint/s5aa-r37`, stacked on R36's pull request, merged after R36's. Please place this on your own branch from `main` once it
merges.
