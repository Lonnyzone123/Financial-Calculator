# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R38

*Written by Claude, 2026-09-29 (local, UTC−7). Prose for eb to place in eb's own files once R38 merges; no file of eb's has been
edited. Checked against the code at `678c556`.*

## 0. What happened

R38 repairs ChatGPT's R35-01 and builds two owner decisions. The source is `s5aa-r38-source` = `678c556`, and the handover is
`audit/S5AA/R38/S5AA_R38_CHANGE_AUDIT_HANDOVER_20260929.md`.

## 1. `SPRINT_QUESTIONS.md`

- **R37's five open items are decided** (the owner, 2026-09-29, "go with your recommendations"). These were already relayed as
  decided; R38 builds the first:
  - **the default filing status is single**, built at `678c556`;
  - **the HSA's age-65 exception** keeps Q137's opening-age convention; 59½ and 65 are to be decided together at the engine rebuild;
  - **a joint account's percent of salary** reads household salary;
  - **the 1959 RMD card** stays visible;
  - **Monte Carlo guidance** keeps withholding the amount and the cut. Figures from the failing paths are a wanted feature for the
    rebuild (relayed separately for FEATURES.md).
- **Vesting at normal retirement age** (the owner, 2026-09-29, "include item 3 with age 65"): built at `cc3217f`.
- **A question for the owner, not yet asked as a Q:** with `vesting` 100 and `yearsOfService` 0, an elected Roth match is taxed as
  Roth and then mostly forfeited. The two inputs disagree. The rule for a Roth match's vesting rests on IRS guidance that has not been
  checked yet. It is reported to the owner and not built.

## 2. `MODEL_ASSUMPTIONS.md`, suggested text

**Vesting (the R35 text).** Add: "Employer money earned in the year of separation is vested or forfeited with the rest (R38,
R35-01). At a separation at 65 or later all employer money is kept: IRC 411(a) makes it nonforfeitable at normal retirement age, and
the plan's own normal retirement age is taken as 65 (411(a)(8) gives 65 for such a plan). There is no input for an earlier plan age."

**Filing status.** Add: "A new plan files single, matching its default of no spouse (R38). A saved plan keeps its own filing status.
The test corpus keeps the joint return it was written on."

## 3. `FEATURES.md`

- Under the vesting feature: vested at separation, including the year of separation; fully vested at 65.
- Under the form: a new plan starts as single.
