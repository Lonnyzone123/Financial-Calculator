# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R33

*Written by Claude, 2026-09-29 (local, UTC−7). Prose for eb to place in eb's own files once R33 merges; no file of eb's has been
edited. Checked against the code at `f4e8294`.*

## 0. What happened

R33 repairs 16 items from Claude's R32F audit and ChatGPT's R32V check:
- SA32F-09, -10, -11, -12, -14, -15, -16, -23, and -28 to -34;
- R32V-02, in the round's records.

The source is `s5aa-r33-source` = `f4e8294`, and the handover is `audit/S5AA/R33/S5AA_R33_CHANGE_AUDIT_HANDOVER_20260929.md`.

## 1. `SPRINT_QUESTIONS.md`

**Mark built:**
- Q162 5a (each owner's own stop age) and 5c (the spousal IRA while the joint return has pay), both at `5d85480`.

**Record the owner's answers of 2026-09-29 for R33:**
- (a) apply the IRA deduction's $10 rounding: "yes";
- (b) a spouse's future contribution changes on the spouse's age: "Yes";
- (c) Arizona's age-65 exemption at the year-end age: "Yes".

**Record the overnight instruction:** "Follow law everywhere": where the law gives a rule, build it rather than disclose a gap.

## 2. `MODEL_ASSUMPTIONS.md`, suggested text

**§20 (IRA deduction):**

> **The IRA phase-outs reduce the limit, not the contribution** (IRC 219(g)(1)). The reduction is rounded down to $10 and the
> limit is at least $200 unless reduced to zero (219(g)(2)(B)–(C)). The deduction is the smaller of that limit and the
> contribution (Publication 590-A Worksheet 1-2, line 7). A Roth IRA contribution is the lesser of the reduced Roth limit and the
> limit less the year's other IRA contributions (Worksheet 2-2, line 11) (S5AA R33). This replaces the note that the $10 round-up
> is not applied.

**Contributions:**

> - **A deferral is excluded only as far as the law allows.** It is excluded from whichever pay funds it, stream wages included;
>   it is capped at the owner's own compensation (415(c)(1)(B)); and under the "warn" policy the excess stays on deposit but is
>   income (402(g)(1)(A)).
> - **Each person's contributions stop at that person's own stop age.**
> - **On a joint return, a spouse who is not working can fund an IRA while the other spouse works,** up to that spouse's own stop
>   age.
> - **Profit sharing is paid without the match switch** (S5AA R33).

**Tax:**

> - **The age-65 amounts read the age reached by the row's close:** the additional standard deduction, the senior deduction and
>   Arizona's $2,100 exemption (IRC 63(f), 151(d)(5)(C); A.R.S. 43-1023(E)) (S5AA R33).
> - **An included spouse is a married spouse.** On a single or head-of-household return the spouse's age amounts are not taken,
>   neither spouse gets the senior deduction, and the self's own addition is the married $1,650 (IRC 151(d)(5)(C)(v), 63(f)(3))
>   (S5AA R33).
> - **Qualified dividends and gains pay the smaller of the preferential and the regular tax** (Form 1040 QDCG worksheet, line
>   25) (S5AA R33).
> - **A capital-loss carryover adds back the senior deduction** (IRC 1212(b)(2)(B)(ii)) (S5AA R33).

**§11 and §18.1 (IRMAA):**

> **IRMAA reads the lookback year's own filing status**, recorded with its MAGI (20 CFR 418.1115). For the two years after a
> death, the survivor's premium reads the joint returns. The top tier includes $500,000 / $750,000 (CMS 2026) (S5AA R33).

## 3. Where this round lives

On branch `sprint/s5aa-r33`, in a pull request the owner merges. Please place this on your own branch from `main` once it merges.
