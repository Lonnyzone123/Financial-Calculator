# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R35

*Written by Claude, 2026-09-29 (local, UTC−7). Prose for eb to place in eb's own files once R35 merges; no file of eb's has been
edited. Checked against the code at `26ef26d`.*

## 0. What happened

R35 repairs 13 items from Claude's R32F audit and ChatGPT's R32V check:
- SA32F-08, -13, -17, -18 (the pension half), -19, -20, -22, -24, -26, -36, -37 and -39;
- R32V-01.

The source is `s5aa-r35-source` = `26ef26d`, and the handover is `audit/S5AA/R35/S5AA_R35_CHANGE_AUDIT_HANDOVER_20260929.md`.

## 1. `SPRINT_QUESTIONS.md`

**Mark built:**
- decision 4 (own full, joint half, and "a loss also resets") at `beb246a`;
- 5b (vesting over six years) at `26ef26d`;
- 6 (fixed-nominal to retirement) at `f9f37a8`.

**Record** that the recommendations of record were adopted for R32V-01 (a balance-weighted portfolio signal), the pension survivor
share (default 100%), Table II's default (sole beneficiary), the still-working exception's default (current employer when it receives
contributions), the Rule of 55 (the switch as certification, with the separation year enforced), IRMAA's first years (inputs, and a
completed partial year), and stage precedence (a set amount before the survivor reduction).

## 2. `MODEL_ASSUMPTIONS.md`, suggested text

**§11 (IRMAA's first two years):**

> Add: since S5AA R35, the MAGI (and optionally the filing status) of the two tax returns before the plan are optional inputs. Entered,
> they price plan years 0 and 1, and nothing is assumed. A plan opening part-way through a year completes that year for the lookback,
> at last year's entered rate or at the first row's own rate, and says so.

**§18.1 (what passes to a surviving spouse):**

> Replace "the survivor's capital gains are overstated" and the step-up wording with: a taxable account's basis resets to its value when
> it passes, up or down (IRC 1014(a)): the decedent's own accounts in full, and a joint account half, the decedent's assumed share
> (2040(b)). The value is read at the first row after the death. Community property (1014(b)(6)) is not modelled.

**§18.1, the pension bullet:**

> Add: an other-income pension stream pays its entered survivor share after its owner's death (0 for a single-life annuity). Absent, it
> is 100% and the result says so.

**§18.3 (required distributions):**

> Add: a spouse more than ten years younger who is the sole beneficiary gives the Joint and Last Survivor Table (1.401(a)(9)-5(c)(2)).
> A current employer's 401(k) owes nothing while its non-5%-owner participant still works (401(a)(9)(C)). The Rule of 55 needs the
> owner's separation in or after the year of 55.

**Spending and contributions (new bullets):**

> - A working spouse's pay after the household's retirement date pays spending before the portfolio.
> - Fixed-nominal spending is today's dollars grown to the retirement date, then held.
> - A set spending stage takes the survivor reduction.
> - An other asset's accessible share is a stock, not a yearly allowance.
> - The flexibility cut and VPW read the portfolio's own returns.
> - Employer money vests on service, six-year graded unless a three-year cliff is chosen, and only the unvested part is forfeited at
>   separation.
>
> (S5AA R35.)

## 3. `FEATURES.md`

- New account fields on the form: "Spouse is the sole beneficiary", "The plan of the employer the owner still works for", "The owner
  owns 5% or more", and "Vesting schedule".
- New fields elsewhere:
  - a pension row's "Survivor share";
  - the health section's two prior-year income fields.
- The Rule of 55 switch's label states the separation condition.

## 4. Where this round lives

On branch `sprint/s5aa-r35`, stacked on R34's pull request, merged after R34's. Please place this on your own branch from `main` once it
merges.
