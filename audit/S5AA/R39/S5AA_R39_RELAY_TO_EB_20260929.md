# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R39

*Written by Claude, 2026-09-29 (local, UTC−7). Prose for eb to place in eb's own files once R39 merges; no file of eb's has been
edited. Checked against the code at `f7ea076`.*

## 0. What happened

R39 repairs ChatGPT's R38-01 to R38-05 and declares the QCD's 70½ convention. The source is `s5aa-r39-source` = `f7ea076`, and the
handover is `audit/S5AA/R39/S5AA_R39_CHANGE_AUDIT_HANDOVER_20260929.md`. The owner's decision was "start R39, go with your
recommendations" (2026-09-29).

## 1. `SPRINT_QUESTIONS.md`

- **Q168 (the Roth match):** now built, at `252faba`. An elected match is Roth only when the employee is fully vested at allocation, by
  the same vested share that decides forfeiture (service, and 65). Please mark it IMPLEMENTED; the rule text you placed stands.
- **New decisions to register:**
  - **R38-01's partial tax year:** a row that is itself part of a tax year keeps the limit for that share of the year.
  - **R38-05:** a workplace plan that passes to a surviving spouse is not the survivor's current employer's plan.
  - **The QCD at 70½:** keep the opening-age convention, declared, and decide it with 59½ and 65 at the engine rebuild.

## 2. `MODEL_ASSUMPTIONS.md`, suggested text

**§23, contributions.** Add: "Annual limits (the IRA and 401(k) limits, catch-ups, 415(c)'s total additions and 401(a)(17)'s
compensation limit) hold the dollars deposited in the tax year. They are not cut because someone worked part of it (R39, R38-01). A plan
year that is itself part of a tax year (a plan opening mid-year) keeps the limit for that share. The HSA limit stays prorated by the
months of the contribution window (IRC 223(b)(2))."

**§18.3, required distributions.** Replace "The Rule of 55 needs the owner's separation in or after the year they turn 55" with: "The
Rule of 55 needs the owner's separation at 55 or later, or earlier in the year they turn 55 (R39, R38-02)." Add: "A workplace plan that
passes to a surviving spouse is not the survivor's current employer's plan, so the still-working exception does not follow it (R39,
R38-05)."

**§18.3, conventions.** Add the QCD beside 59½ and 65: "A QCD is available from the first projection year that starts at 70½ or older
(IRC 408(d)(8) allows it from the day; the plan records no gift date). The form says so (R39)."

**§4 or §22, Social Security.** Add: "A benefit that starts inside a projection year is priced at the claim, with every COLA from the
plan's start to the claim (R39, R38-04). A benefit already being paid keeps the year's opening amount."

**§24, vesting.** Replace the "Open, not decided" bullet with: "An elected Roth match is Roth only when the employee is fully vested at
allocation (Notice 2024-2 Q&A L-3; IRC 402A(f)(3)), by the same vested share that decides forfeiture (R39, R38-03)."

## 3. `FEATURES.md`

Under the R33–R38 completed bullet, or a new R39 line: part-year contribution limits, the Rule of 55 from a fractional start, the Roth
match at allocation, the COLA before a claim inside a year, the survivor's inherited workplace plan, and the QCD field's label.
