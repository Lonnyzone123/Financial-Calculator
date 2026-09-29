# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R34

*Written by Claude, 2026-09-29 (local, UTC−7). Prose for eb to place in eb's own files once R34 merges; no file of eb's has been
edited. Checked against the code at `7b61b88`.*

## 0. What happened

R34 repairs 11 Social Security items from Claude's R32F audit and ChatGPT's R32V check: SA32F-01 to -07, -18 and -25, and R32V-03.
The source is `s5aa-r34-source` = `7b61b88`, and the handover is `audit/S5AA/R34/S5AA_R34_CHANGE_AUDIT_HANDOVER_20260929.md`.

## 1. `SPRINT_QUESTIONS.md`

**Mark built** (all at `7b61b88`):
- the R32F decisions 1 ("Pay by law": a survivor benefit on a worker who never claimed), 2 ("Build it": the spouse's benefit) and
  3 ("Today's dollars": the entered benefit is today's);
- decision 1's "Q3b stays" is **amended** by the owner's answer of 2026-09-29, "Start at 60 or the death": the survivor benefit is
  paid from the later of 60 and the death, reduced for that age, and the recipient's own-claim-age gate is dropped.

**Superseded by law:**
- **Q3a** (a person whose claim age equals their death age established no claim): superseded. The survivor benefit rests on the
  deceased's PIA and the delayed credits earned by the death, whether or not they filed (42 USC 402(e)(1); 20 CFR 404.335).
- **Q3b** (the recipient gate is "reached their own claim age"): superseded by the answer above.
- **Q92's flagged omission** (the deceased early-claim cap, POMS RS 00615.320, not applied): now applied; the disclosure says so.

**Record the overnight instruction:** "Follow law everywhere": where the law gives a rule, build it rather than disclose a gap.

## 2. `MODEL_ASSUMPTIONS.md`, suggested text

**§4 (a benefit claimed before the projection opens)**, add at the end:

> **Since S5AA R34** the entered benefit is read in today's dollars (the owner's decision 3). A claim after the plan's start takes
> every COLA from the start to the claim; a claim before the start is indexed from the claim at the configured rate, as above;
> the earnings-based PIA takes its COLAs from eligibility at 62 (20 CFR 404.271). Each COLA'd PIA is rounded down to the dime and
> each monthly benefit to the dollar (20 CFR 404.212(c), 404.275(c), 404.304(f)).

**A new section, "Social Security" (or under §18.1 for the survivor points):**

> - **Full retirement age comes from each person's birth year** (SSA's table; a survivor reads the year two later, 20 CFR
>   404.409). The birth year is 2026 minus the whole age, as §12 reads it; the entered full retirement age is kept in saved plans
>   and read by nothing.
> - **A spouse receives the spouse's benefit**: up to half the other's PIA, less their own, on top of their own benefit, reduced
>   25/36 of 1% a month for 36 months before their full retirement age and 5/12 of 1% beyond, with no delayed credits (20 CFR
>   404.330, 404.333, 404.410). Deemed filing makes a claim for one a claim for both, so it starts at the later of the two
>   filings. The family maximum cannot bind a worker and a spouse and is not modelled beyond that.
> - **A survivor's benefit rests on the deceased's PIA**, with the delayed credits earned by the death (to 70), whether or not the
>   deceased had filed. It starts at the later of 60 and the death, reduced from 71.5% at 60 evenly by month to 100% at survivor
>   full retirement age, and, if the deceased took a reduced benefit, is limited to the larger of that benefit and 82.5% of the
>   PIA (POMS RS 00615.320).
> - **The earnings test counts net earnings from self-employment** (profit × 0.9235; 20 CFR 404.429, SS Act 211(a)(12)), and in
>   the grace year withholds only from the months before the owner stops working (20 CFR 404.435).
> - **An other income of type Social Security ends at its owner's death**, as an employment stream does (42 USC 402(a)).
> (S5AA R34.)

**§18.1**, the pension bullet: unchanged (a pension stream's survivor share is R35's).

## 3. `FEATURES.md`

- The spouse's Social Security benefit is modelled (was: enter it as the spouse's own benefit).
- Full retirement age is shown, from the birth year, not entered.

## 4. Where this round lives

On branch `sprint/s5aa-r34`, stacked on R33's pull request, in a pull request the owner merges after R33's. Please place this on
your own branch from `main` once it merges.
