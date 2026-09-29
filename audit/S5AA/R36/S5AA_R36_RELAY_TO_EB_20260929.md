# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R36

*Written by Claude, 2026-09-29 (local, UTC−7). Prose for eb to place in eb's own files once R36 merges; no file of eb's has been
edited. Checked against the code at `cf643a8`.*

## 0. What happened

R36 builds the owner's decision 8 ("Index, own round") for SA32F-D1, with D8 ("Keep it even after 2028"). Later tax years now index
the 2026 figures. The source is `s5aa-r36-source` = `cf643a8`, and the handover is
`audit/S5AA/R36/S5AA_R36_CHANGE_AUDIT_HANDOVER_20260929.md`.

## 1. `SPRINT_QUESTIONS.md`

- **Mark built:** decision 8 at `cf643a8`.
- **Record D8 as applied:** the senior deduction continues after 2028, unindexed. The engine has no calendar year, so it never stopped;
  D8 makes that the decision rather than an omission.
- **Record** that wage-linked amounts use the salary-growth field (the recommendation of record).

## 2. `MODEL_ASSUMPTIONS.md`, suggested text

**A new section, "Later tax years (S5AA R36)":**

> The rules package holds 2026's figures. Each later year indexes them as the law does, with each statute's rounding:
> - **Brackets, capital-gains thresholds, the standard deduction and the age-65 addition** (Arizona's standard deduction conforms);
> - **contribution limits** (IRA, 401(k), catch-ups, total additions, the compensation limit, HSA, the QCD cap), the IRA and Roth
>   phase-outs, and the Roth catch-up wage threshold;
> - **the IRMAA thresholds,** the top tier from 2028.
>
> These rise with one whole year of the plan's inflation per tax year, a stand-in for the C-CPI-U or CPI-U the statutes name. The
> Social Security wage base, the earnings-test amounts and the bend points rise with the salary-growth rate, a stand-in for the
> national average wage index; a person's bend points are those of the year they turn 62.
>
> **Amounts the law fixes stay fixed:** the NIIT and Additional Medicare thresholds, the Social Security taxation bases, the $3,000
> loss limit, the senior deduction and its thresholds (kept after 2028, the owner's choice), and Arizona's $2,100 exemption.
>
> **Row `n` is tax year 2026 + `n`.** Indexing starts from the 2026 figure rather than each statute's base year, so a figure can
> differ by one rounding step from the one the IRS publishes. Medicare premiums themselves stay at 2026's.

**Wherever a section says the tax rules are 2026's for every year** (the README's disclaimer was corrected in the round itself), add
the cross-reference above.

## 3. `FEATURES.md`

- The warnings panel's "Fixed tax-year boundary" card is now "Later tax years", describing the indexing.

## 4. Where this round lives

On branch `sprint/s5aa-r36`, stacked on R35's pull request, merged after R35's. Please place this on your own branch from `main` once it
merges.
