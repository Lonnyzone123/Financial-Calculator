# TAX-FED — auditor's report (saved by the coordinating session; the auditor could not write .md files)

Federal income tax computation, frozen `main` at `2b2d5f2`. Report only; nothing was repaired. Every script is in this folder
and runs with `node <script>`; the combined rerun output is `rerun-log.txt` (13 scripts, all printed their final line).

**Process notes:**
- The auditor made one `curl` download of an irs.gov PDF, outside the brief, deleted it unused, and re-read the document
  through WebFetch.
- **Coordinator note on TAXFED-02:** the app's "Fixed tax-year boundary" guidance card (`app-shell.html:933`) declares that
  "Federal, Social Security, and Medicare calculations use the stored 2026 rules and do not automatically roll into later tax
  years", and the README says the rules "cover one tax year (2026)". The freeze is therefore declared. What is not declared is
  its consequence for a nominal projection: real-terms bracket creep, $17,644 over 14 years in the repro. It also departs from
  the resource document's §8.1. Carried to the consolidated report as a declared item with a material consequence, for the
  owner, not as a defect.

## Findings
| ID | Sev | Claim | $ impact |
|---|---|---|---|
| TAXFED-01 | P2 | Line 25 of the capital-gains worksheet ("smaller of line 23 or 24") is not applied. Preferential income between the 0% ceiling and the top of the 12% bracket is taxed at 15% instead of 12%. | Up to $28.50 single, $37.50 HoH, $57 joint, per year |
| TAXFED-02 | P1 (see note: declared) | Brackets, standard deduction, age-65 addition, 0%/15% thresholds and the Social Security wage base stay at 2026 nominal values every year while all incomes inflate. | +$937/yr at year 7, +$3,183/yr at year 14 on a $60k inflating pension; $17,644 over 14 years; wage base $3,486 short by year 10 |
| TAXFED-03 | P1 | Both age-65 deductions test the row's opening age; the statutes test the age reached by the close of the tax year, and the model treats each row as a tax year (R32). | $966 single, $1,836 couple, in the row each person turns 65 |
| TAXFED-04 | P2 | A spouse plus single or HoH filing validates with no warning, and the spouse's $6,000 + $2,050 deductions are taken on a non-joint return. | $966/yr |
| TAXFED-05 | P2 | The loss carryover doesn't add back the senior deduction under 1212(b)(2)(B)(ii), so too much loss carries forward. | Carry overstated by $1,850; next year's tax $428.89 too low |
| TAXFED-06 | P3 | `effectiveMarginalRate()` has no slot for rental or non-qualified-dividend investment income and silently ignores an extra key, so it omits the 3.8% surtax. | 3.8 points; the helper isn't used by `runPlan` or the app |

## 1. Scope covered
**Functions read:**
- The tax core: `estimateTaxes`, `marginalTax`, `capitalGainsTax`, `marginalRateAt`, `capitalGainsMarginalRateAt`,
  `effectiveMarginalRate`, `taxableSocialSecurity`, `additionalStandardDeduction`, `seniorDeduction`, `taxConfigForFilingStatus`.
- Filing and survivors: `householdSurvivorship`, `householdFilingFor`, `householdSeniorAges`.
- Capital losses: `capitalLossLimit`, `allocateCapitalLossCarry`.
- Income routing: `otherIncomeFor`.
- The `estimateTaxes` call sites in `simulatePlan`, and the gross-up path (`solveSegmentFunding`, `quoteTaxFunding`), judged by
  its results.

**Constants checked at the primary source.** All of `h.RULES.federal` is correct:
- **Rev. Proc. 2025-32** (irs.gov PDF, read page by page):
  - §4.01 tables 1–3: every single, joint and HoH bracket edge.
  - §4.03 0%/15% maximums: 49,450 / 545,500 single; 98,900 / 613,700 joint; 66,200 / 579,600 HoH.
  - §4.14(1) standard deduction: 16,100 / 32,200 / 24,150.
  - §4.14(3) age-65 addition: 1,650, or 2,050 if unmarried and not a surviving spouse.
- **IRC 151(d)(5)(C):** $6,000 per qualified individual, for tax years beginning before 2029, reduced by 6% of MAGI over
  $75,000 ($150,000 joint); needs the person's SSN and, if married, a joint return; the reduction is per person.
- **Other statutory amounts:** IRC 86(c) $25k/$32k and $34k/$44k, not indexed; IRC 1411, 3.8% over $200k/$250k, not
  indexed; IRC 1211(b) $3,000; Schedule SE 0.9235, 12.4%, 2.9%, $400; 2026 wage base $184,500 (from an ssa.gov search
  result; a direct ssa.gov fetch returned 403).

**Runs:**
- 8,073 isolated `estimateTaxes()` returns against an independent reference built from the sources (`ref.js`). It follows the
  Form 1040 capital-gains worksheet lines 1–25, Pub. 915 Worksheet 1, the statutory deductions, NIIT, Schedule D line 21 and
  the carryover rule. The grid covers single, joint and HoH; ages 60/70 with spouse 60/68/70; ordinary income 0–900k;
  qualified dividends; gains up to 700k; Social Security 0/20k/45k; and carried losses.
- 23 `runPlan()` plans, each passing `validateScenario` with status `ok`.

**Sweep result:** 8,070 of 8,073 returns match to the cent on federal tax, NIIT, AGI, taxable Social Security and the
carryover. The other 3 are TAXFED-01.

**Gross-up fixed point:** in 7 plans the engine's gross withdrawal equals a 200-step hand bisection to the cent
(`probe-grossup.js` A–E, `probe-grossup2.js`, and year 2 of the TAXFED-05 repro). They cross the 85% SS band, the 0%/15%
band, the senior phaseout and NIIT, including all at once in a joint composite.

## 3. Per finding
### TAXFED-01 (P2): line 25 of the capital-gains worksheet is missing
- **Rule:** Form 1040 instructions, Qualified Dividends and Capital Gain Tax Worksheet, line 25: "Enter the smaller of line 23
  or line 24" (irs.gov/pub/irs-pdf/i1040gi.pdf, p. 38); IRC 1(h)(1) "shall not exceed". The 0% ceiling now sits below the top
  of the 12% bracket, leaving a sliver of 950 (single), 1,900 (joint) or 1,250 (HoH) where 12% is cheaper than 15%.
- **Repro:** `repro-TAXFED-01-line25.js`.
- **Hand:**
  - Single, ordinary 65,550 (taxable 49,450) plus qualified dividends 950: line 23 = 5,686 + 142.50 = 5,828.50; line 24 =
    1,240 + 12% × 38,000 = 5,800; line 25 = **5,800**.
  - Joint, ordinary 131,100 plus QD 1,900: line 23 = 11,657; line 24 = **11,600**.
  - HoH, ordinary 90,350 plus LTCG 1,250: line 23 = 7,777.50; line 24 = **7,740**.
- **Engine:** 5,828.50, 11,657 and 7,777.50. Whole plans: single row tax 7,088.50 vs 7,060; joint 14,177 vs 14,120.
- **Not declared:** no document mentions line 25; FEATURES.md calls capital gains "correctly stacked". The funding solver's
  mirror reproduces the estimator exactly, so a repair has to change both.

### TAXFED-02: indexed amounts frozen at 2026 values in a nominal projection
- **Rule:** IRC 1(f)(1)–(2); IRC 63(c)(7)(B)(ii); Rev. Proc. 2025-32 §4.03 and §2.08; 42 USC 430(b). The app's own
  `TAX_RULES_ENGINE_REFERENCE_2026.md` §8.1: price-indexed items should use a stated inflation proxy labelled
  `MODEL_ASSUMPTION`; fixed-dollar thresholds must not inflate.
- **Repro:** `repro-TAXFED-02-indexing.js`. Single, 50, retired, a $60k pension with a 3% COLA, 3% inflation, 14 years; and a
  $184,500 salary growing 3%.
- **Hand:** year 1 taxable 43,900, tax 5,020; with everything indexed, year t costs 5,020 × 1.03^t, so year 14 = **7,372.04**.
- **Engine:** year 14 tax 10,554.65 (+$3,182.61); year 7 6,931.49 (+$937.35); +$17,644.37 over 14 years. The year-10 salary
  of 240,730.65 pays SS tax on only 184,500: payroll 15,296.17 against 18,782.47.
- **Correctly held fixed:** SS taxation bases, NIIT and Additional Medicare thresholds, the $3,000 loss limit, the $400 SE floor,
  and the $6,000 / $75k / $150k senior-deduction amounts.
- **Declared status:** see the coordinator note at the top.

### TAXFED-03 (P1): the age-65 deductions use the row's opening age
- **Rule:** IRC 63(f)(1)(A) and 151(d)(5)(C)(ii)(I): "attained age 65 before the close of" the taxable year. At R32 the owner
  adopted "each row is treated as a tax year" and "Use the year-end age", applied to catch-ups only.
- **Repro:** `repro-TAXFED-03-age65.js`.
- **Hand:** single on a $60k pension, the row closing at 65: deduction 16,100 + 2,050 + 6,000 = 24,150; taxable 35,850; tax
  **4,054**. Couple on $90k, both 64→65: deduction 47,500; taxable 42,500; tax **4,604**.
- **Engine:** 5,020 (+$966) and 6,440 (+$1,836). The control at 65 agrees at 4,054.
- **Not declared:** only a "half-year convention" code comment in `householdSeniorAges()`. Pub. 501 treats a person as 65 on the
  day before the 65th birthday. Arizona's age-65 exemption follows the same opening age.

### TAXFED-04 (P2): a spouse's age amounts on a non-joint return
- **Rule:** IRC 151(d)(5)(C)(ii)(II) and (v); IRC 63(f)(1)(B).
- **Repro:** `repro-TAXFED-04-spouse-on-nonjoint.js`: `spouseOn: true`, both 70, a $60k pension, filing `single` and then
  `hoh`. The validator raises no issue.
- **Hand:** single **4,054**; HoH deduction 32,200, taxable 27,800, tax **2,982**.
- **Engine:** 3,088 and 2,016, $966 too low in each. With the spouse at 60 instead, the engine gives 4,054.
- **Not declared:** §18.1 says only that other entered statuses "are left as entered".

### TAXFED-05 (P2): the loss carryover ignores the section 151 add-back
- **Rule:** IRC 1212(b)(2)(B): adjusted taxable income adds back the 1211(b) amount and "(ii) the deduction allowed for such year
  under section 151". The senior deduction is allowed under 151(d)(5)(C). Caveat: the published Schedule D carryover
  worksheet predates the senior deduction, so the finding rests on the statute's text.
- **Repro:** `repro-TAXFED-05-carryover-senior.js`.
- **Hand:** single, 70, pension 20,000, loss carried in 10,000. AGI 17,000; deductions 24,150; taxable −7,150; adjusted
  taxable −7,150 + 3,000 + 6,000 = 1,850, so the carryover is **8,150**. In the plan, year 2's tax is **12,657.76** (hand
  bisection).
- **Engine:** carryover 10,000 (+1,850); plan year-2 tax 12,228.87, $428.89 too low (about $372 federal, $57 Arizona).

### TAXFED-06 (P3): `effectiveMarginalRate()` misses rental and non-qualified-dividend investment income
- **Rule:** IRC 1411(a)(1).
- **Repro:** `repro-TAXFED-06-emr-nii.js`: single, $100k pension plus $150k rental.
- **Hand:** 32% + 3.8% + 2.5% = **38.3%**; the full `estimateTaxes()` return gives 0.383.
- **Engine:** 0.345. An extra `niiOther` key is silently ignored. The helper isn't used by `runPlan` or the app.

## 4. Declared behaviours confirmed
- The senior deduction persists after 2028, as the app's rules page says (Q46, closed). Every person 65 or older is assumed to
  have an SSN.
- Filing after a death (§18.1): joint in the year of death, single from the next year; the decedent's age amounts drop from
  the next year. Checked on 3 plans, to the cent (`probe-death.js`). Qualifying surviving spouse and HoH survivors are not
  modelled, as declared.
- Capital gains and losses (§18.2): all gains long-term; a decedent's loss ends with their final return; per-spouse loss
  allocation; negative AGI allowed; preferential income keeps its rates up to taxable income; NIIT includes the deductible loss.
- NIIT income: qualified and non-qualified dividends, net gain or the deductible loss, rental and investment streams; not
  wages, pensions, IRA distributions or Social Security (`probe-payroll-niit.js`).
- Self-employment and payroll tax: 0.9235 and $400; SS room net of the person's own wages; half deductible; Additional Medicare
  on wages plus SE income.
- Not built, as declared: no AMT; no itemizing or SALT cap; QBI outside the core; Arizona's limited scope (§16).

## 5. Suspicions not confirmed
- A plan starting at 60.5 gets a full year's deduction and brackets on half a year's income (`probe-partial-row.js`).
- `marginalRateAt()` returns the lower rate exactly at a bracket edge; no mispricing seen.
- An unmarried couple modelled as a spouse with `single` filing puts all income on one single return.
