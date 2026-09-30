# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R40

*Written by Claude, 2026-09-30 (local, UTC−7). Prose for eb to place in eb's own files once R40 merges; no file of eb's has been
edited. Checked against the code at `d51d30d`.*

## 0. What happened

The owner asked for a GO/NO-GO handover for ChatGPT. Claude's check of the exit gate found gaps that R29 to R39.1 had left open.
The owner decided, on 2026-09-30, to close them first, and chose Claude's recommendations:

- **"Close gaps first"** — a round of its own, R40, before the handover.
- **Amendment A-10** — E10's record for R29 to R39.1 (in `S5AA_TASK_CHECKLIST.md`, which is not eb's).
- **"Repair all four now"** — four undisclosed limits Claude found in R40.

The handover is `audit/S5AA/R40/S5AA_R40_CHANGE_AUDIT_HANDOVER_20260930.md`.

## 1. `SPRINT_QUESTIONS.md` — one new entry for the owner's decisions of 2026-09-30

- **(a)** Close the exit-gate gaps before the status determination: register a baseline (r18, then r19); record the R29–R37 codes in
  `RESULT_CONTRACT.md`; read R36's card rendered; update the conservation grid; write the combined unrepaired list.
- **(b)** A-10: for R29 to R39.1, the traced-and-declared control record stands in for E10's predicted-versus-actual record,
  disclosed as not a prediction. From R40 on, A-01 applies as written.
- **(c) "Repair all four now":**
  - the long-term-care cost grows at healthcare inflation (the insurance benefit stays as entered);
  - each person on Medicare pays the Part D base premium;
  - a partial row is taxed as its share of a year;
  - an RMD reads the age reached in the row.

  Status: **IMPLEMENTED 2026-09-30 (S5AA R40)**, at `8f20d90`, `d1572b1`, `607101a` and `d51d30d`.

## 2. `MODEL_ASSUMPTIONS.md`, suggested text

**§18.4, health costs.** Add: "The long-term-care cost is entered in today's dollars and grows at the plan's healthcare inflation from
its start, as the pre-Medicare health cost does. The insurance benefit stays at its entered amount, since a policy's benefit does not
rise without an inflation rider, which the plan does not model (R40)." Add: "Each person on Medicare pays the Part D base beneficiary
premium, $38.99 a month in 2026 (CMS, July 28, 2025; 42 CFR 423.286(c)). It stands in for a plan's own premium. The IRMAA surcharge
is added on top of it (R40)."

**§25, later tax years.** The sentence "Medicare premiums themselves stay at 2026's" now covers the Part D premium too. Please say so,
or name it: "Medicare premiums (Part B and the Part D base premium) stay at 2026's."

**§25 or a new subsection, partial rows.** Add: "A projection row shorter than a year — the first row of a plan that opens at a
fractional age, or the last row of one that ends at one — is taxed as its share of a year earning at the row's rate. Each annual
dollar amount of the tax rules is multiplied by that share: deductions, brackets, the Social Security taxation bases, the NIIT and
Additional Medicare thresholds, the OASDI wage base, the self-employment floor, Arizona's deduction and exemption, and the $3,000
capital-loss limit. It had been taxed with the whole year's amounts, as if nothing were earned outside it (R40). The contribution
limits take the row's share by R39's rule. The IRA deduction and Roth phase-out ranges are not scaled: they read the partial row's
MAGI against whole-year ranges, a disclosed limit."

**§18.3, required distributions.** Add: "An owner's RMD start and the Uniform Lifetime divisor read the age the owner reaches within
the row, which is the age by the birthday in that distribution year. Rows follow the self's birthdays, so for the self this is the
row's opening age. A spouse whose birthday falls inside a row had skipped the RMD for the year they reached 73 or 75, and was then
given the divisor of an age a year younger (R40)."

## 3. `FEATURES.md`

If it lists health, long-term-care or Medicare costs, or required distributions, a short note of the four repairs in the R40 line. Your
call. The combined unrepaired list is `audit/S5AA/R40/S5AA_R40_UNREPAIRED_LIST_20260930.md`, if a pointer helps.

## 4. For the Roadmap, a planning fact

The owner, 2026-09-30: "The UI will be rebuilt. but we can use the old ui as a reference." This is recorded in the R40 handover's
E14 row, where the engine disclosures the current app does not render stay an explicit exception. Where and how to record it in
the Roadmap or the S5b and S6 text is yours.
