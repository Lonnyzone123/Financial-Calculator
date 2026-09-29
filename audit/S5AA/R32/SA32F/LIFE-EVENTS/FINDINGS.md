# LIFE-EVENTS — auditor's report (saved by the coordinating session; the auditor could not write .md files)

Deaths, survivors and household structure, frozen tree at `2b2d5f2`. About 50 validated plans ran, all `valid` with status
`ok`; every repro was rerun before the report. Repros are in this folder (`node <file>`); the shared builder is `lib.js`.

**Coordinator cross-reference:** four of these were found independently by other areas:
- LIFE-01 = SOCSEC-02;
- LIFE-02 = SOCSEC-01;
- LIFE-03 = RMDROTH-01;
- LIFE-08 = STHLTH-01.

## Findings
| ID | Sev | Claim | Impact |
|---|---|---|---|
| LIFE-01 | P1 | A spouse who dies before claiming Social Security leaves the survivor no survivor benefit (`spouseClaimEstablished` gate); by law the survivor is paid on the deceased's PIA. | −$24,000/yr (A); −$14,292.86/yr (E, spouse died before the plan) |
| LIFE-02 | P1 | The survivor benefit is the deceased's already-reduced benefit times the survivor's age factor, with no 82.5% floor. The disclosure says the result is "too high" and the plan "does not hold" the figure; both are false. | −$4,500/yr (B); −$8,161.71/yr (C) |
| LIFE-03 | P2 | RMDs always use the Uniform Lifetime Table; a spouse more than 10 years younger, who in this model inherits the IRA, calls for the Joint and Last Survivor Table. | RMD overstated by at least $3,750.04 on $1M (owner 75, spouse 60) |
| LIFE-04 | P1 | A decedent's solely-owned taxable account keeps its cost basis. The declared reason (titling and state law the plan does not record) is false for a sole-owned account (IRC 1014(a)); the plan records the owner, and the state is always Arizona. | +$30,176 AGI/yr; +$5,427.71 tax/yr |
| LIFE-05 | P1 | An other income of type Social Security keeps paying after its owner dies; a Pension-type one also continues, with no PENSION_AFTER_DEATH_ASSUMED warning. | +$24,000/yr |
| LIFE-06 | P2 | Filing status is never checked against the household. A one-person plan filed mfj (the app's default profile) is taxed jointly with no warning; a couple filed hoh is accepted. | −$5,932.50/yr at $100k income |
| LIFE-07 | P3 | MODEL_ASSUMPTIONS §8 and RESULT_CONTRACT's C6 row still say opening-row insurance is "not yet built"; the engine does it (landed at 4c104e9). | text only |
| LIFE-08 | P1 | For 2 years after a death, IRMAA pairs a joint-return year's MAGI with the single bands; 20 CFR 418.1115 uses the lookback year's own filing status. | +$4,620/yr for 2 years at $180k MAGI |

**Repro files:**
- LIFE-01 and LIFE-02: `repro-LIFE-01-02-ss-survivor.js` (case D is a passing control)
- LIFE-03: `repro-LIFE-03-rmd-younger-spouse.js`
- LIFE-04: `repro-LIFE-04-no-step-up.js`
- LIFE-05: `repro-LIFE-05-other-income-after-death.js`
- LIFE-06: `repro-LIFE-06-filing-vs-household.js`
- LIFE-07: `repro-LIFE-07-insurance-doc-stale.js`
- LIFE-08: `repro-LIFE-08-irmaa-after-death.js`

## 1. Scope covered
**Engine code read:**
- Survivorship and filing: householdSurvivorship, householdFilingFor, householdSeniorAges, lastDeathCutAge,
  nobodyAliveAtStartCode.
- Accounts at a death: accountSuccessionClass, accountOwnerAge, and the death hand-over block in the row loop (owner change,
  IRA basis, the decedent's capital loss and QCD offset ending).
- Work and contributions: householdWorkDurations, ownerContributionEligibility.
- Social Security: householdSocialSecurityDetail, ssaBenefitAtClaim, survivorReductionFactor, survivorStartAge.
- Income and spending: otherIncomeFor, the survivor spending factor.
- Health and RMDs: the health/IRMAA block, irmaaMonthly, rmdObligations, rmdStartAge.
- Tax: estimateTaxes (filing status, age-65 amounts, Arizona base).
- The warnings SURVIVOR_FILING_STATUS_MODELLED, SURVIVOR_BENEFIT_APPROXIMATED, DEATH_BEFORE_PLAN_START and
  PENSION_AFTER_DEATH_ASSUMED, and the opening-row net-worth term.

**Also read:**
- the validator's filing-status enum and owner rules;
- the app shell's SS labels, survivor switch, other-income types and default profile;
- documents: MODEL_ASSUMPTIONS (all; §8, §10, §11, §15, §18.1–18.3 closely), SPRINT_QUESTIONS Q3, Q88, Q92,
  RESULT_CONTRACT C6, S5_TASK_CHECKLIST 2o, FEATURES, the ACCOUNT reference §8.3, the TAX reference §6, the S2 registers, the
  S5b/S6/S100–S103 checklists, and the R29–R32 known limits.

**Primary sources read:**
- 42 USC 402(a), 402(e)(1), 402(e)(2)(A), (C), (D); POMS RS 00615.301 and RS 00615.320.
- Treas. Reg. 1.401(a)(9)-5(c) and 1.401(a)(9)-9(b)/(c).
- IRC 1014(a)(1) and 1014(b)(6); A.R.S. 25-211.
- IRC 2(a), 2(b); 151(d)(5)(C).
- Rev. Proc. 2025-32.
- 20 CFR 418.1115 and the CMS 2026 Part B/D fact sheet.

**Plans run:** the eight repros 16; mirror test 14; continuity 8; senior transition 2; filing transition 1; edge probes 7;
row-shape probe 1.

## 3. Per finding
**LIFE-01 (P1): no survivor benefit when the deceased had not claimed**
- **Rule:** 42 USC 402(e)(1): a widow(er) of someone who "died a fully insured individual" is entitled; nothing requires the
  deceased to have claimed. 402(e)(2)(A): "equal to the primary insurance amount", plus delayed credits under (e)(2)(C).
- **Case A:**
  - Setup: self 68, own PIA $1,000 claimed at 67 ($12,000/yr). The spouse is 64 with a PIA of $3,000, plans to claim at 70, and
    dies at 65.
  - Hand: in row [69,70) the survivor is past FRA, so 3,000 × 12 = $36,000.
  - Engine: $12,000.
- **Case E:**
  - Setup: the spouse died at 60, before the plan, never having claimed; PIA $2,500. Self is 68 now and was 62 at the death.
  - Hand, using the engine's own convention (survivor factor fixed at the age at the death): 1 − 0.285 × 60/84 = 0.796429,
    and 30,000 × 0.796429 = $23,892.86.
  - Engine: $9,600.
- **Not declared:** Q3a / R2-003(b) calls this a "posthumous claim" and removed it. That misstates the law, and no
  MODEL_ASSUMPTIONS entry or warning says it.

**LIFE-02 (P1): survivor benefit built on the deceased's reduced benefit; the 82.5% floor is missing**
- **Rule:** POMS RS 00615.301: the original benefit is "100 percent of" the death PIA, or the deemed-life PIA with DRCs if
  larger; the survivor's age reduction applies to it. POMS RS 00615.320 and 402(e)(2)(D) limit it to the larger of "82 1/2
  percent of the NH's death PIA" or the deceased's reduced benefit. So the payment is min(OB × factor, max(deceased's reduced
  benefit, 0.825 × PIA)).
- **Case B:** PIA $3,000, claimed at 62 ($25,200/yr), dies at 65; survivor 69. Hand: min(36,000, max(25,200, 29,700)) =
  $29,700. Engine: $25,200.
- **Case C:** the same deceased dies at 63; survivor 61. Hand: 36,000 × 0.755714 = $27,205.71, under the 29,700 limit.
  Engine: $19,044 (25,200 × 0.755714).
- **Control D:** the deceased claimed at 70 (124%): engine $44,640 = hand.
- **Not declared:** the disclosure says the cap "needs a figure this plan does not hold" (the plan holds the PIA) and that "an
  affected result is too high" (it is never higher, and too low when the deceased claimed early).

**LIFE-03 (P2): Uniform Lifetime Table when the spouse is more than 10 years younger**
- **Rule:** Treas. Reg. 1.401(a)(9)-5(c)(2)(i); the owner's ACCOUNT reference §8.3 says the same.
- **Hand:** a bound, since the (75, 60) cell could not be read reliably. The joint factor is at least the Single Life expectancy
  at 60, 27.1, so the RMD is at most $36,900.37.
- **Engine:** $40,650.41 (1,000,000 / 24.6).

**LIFE-04 (P1): no step-up for a decedent's solely-owned taxable account**
- **Rule:** 1014(a)(1), the basis is "the fair market value of the property at the date of the decedent's death"; 1014(b)(6)
  steps up the survivor's half of community property; A.R.S. 25-211(A).
- **Plan:** the spouse owns a taxable account at 50% basis ($400k; $800k in variant B), zero return, and dies at 63.
- **Base:** hand AGI $0 and tax $0 after the death; engine AGI $30,175.95 and tax $351.90 each survivor year.
- **Variant B** ($60k other income, $120k spending): hand federal 5,020 + Arizona 1,097.50 = $6,117.50; engine $11,545.21.
- **Flagged though declared:** §18.1's reason ("depends on titling and state law the plan does not record") is false for a
  sole-owned account. For a joint account the uncertainty is real, but at least half is stepped up.

**LIFE-05 (P1): a Social Security or Pension other income outlives its owner**
- **Rule:** 42 USC 402(a): the benefit ends "with the month preceding the month in which he dies".
- **Repro:** a couple at 70; the spouse owns a $24,000/yr other income of type socialSecurity, then of type pension; the
  spouse's lifespan is 72.
- **Hand:** $24,000 in the rows closing 71 and 72, $0 from the row closing 73.
- **Engine:** $24,000 through 76 for both types, with no PENSION_AFTER_DEATH_ASSUMED warning (that check reads only
  `retirement.pension`).
- **Not declared:** §18.1 continues only "rental, investment and other" streams. The pension half alone would be a P2 missing
  disclosure.

**LIFE-06 (P2): filing status is not checked against the household**
- **Rule:** IRC 2(b)(1): head of household requires being "not married at the close of his taxable year".
- **One person filed mfj:** a person of 60 with $100k of pension. Hand single $15,267.50; MFJ $9,335. The engine validates `mfj`
  with `spouseOn` false, taxes $9,335, and warns nothing. This is the app's default profile.
- **Couple filed hoh:** accepted, and taxed $11,484.25 every row, before and after the death.
- **P2** as a missing warning: a married person who leaves the spouse unmodelled may really mean MFJ.

**LIFE-07 (P3): §8 text is stale**
- A plan starting at 70 with `selfLife` 70 and $250k of insurance shows opening networth 2,250,000 against a total of
  2,000,000; with `selfLife` 90 it is not counted.
- MODEL_ASSUMPTIONS §8 says "not landed"; S5_TASK_CHECKLIST 2o.2 records it as landed at 4c104e9; RESULT_CONTRACT C6 is also
  stale. The code matches the decided rule.

**LIFE-08 (P1): single IRMAA bands applied to a joint-return lookback year**
- **Rule:** 20 CFR 418.1115: "your modified adjusted gross income amount together with your tax filing status"; the joint table
  applies to those who "filed a joint tax return for the tax year we use".
- **Repro:** a couple at 70, $180k MAGI every year; the spouse dies at 73.
- **Hand:** the rows opening 74 and 75 look back to joint returns under $218k, so one person pays 202.90 × 12 + 283 =
  $2,717.80. From the row opening 76 the lookback is single: (527.50 + 60.40) × 12 + 283 = $7,337.80.
- **Engine:** $7,337.80 already in the rows opening 74 and 75: +$4,620/yr for two years.
- **Flagged though disclosed:** SURVIVOR_FILING_STATUS_MODELLED and the Q88 comment state the single bands as the rule, which
  misstates the regulation.

## 4. Declared behaviours confirmed
- **Filing:** joint in the year of death, single from the next row, hand-matched with either spouse dying at 60 ($9,335, then
  $15,267.50) and at 70 with the age-65 and senior deductions ($7,394, then $13,774).
- **Survivor spending reduction:** starts the row after the death, only with the survivor switch on.
- **Projection end:** stops at the last death. Both deaths in one row, a death in the last row, a death after the horizon, a
  spouse outliving the self's horizon, a half-year start and a very young survivor all behave per §18.1.
- **Accounts at a death:** pass at the first row the decedent is dead; the decedent's RMD is still due in the year of death;
  IRA basis moves to the survivor; the capital loss and QCD offset end; a joint account follows the self.
- **Continuity:** with zero returns every row, including each death row, closes to the cent in 8 variants.
- **Mirror test:** swapping self and spouse gives identical rows in 6 variants.
- **Disclosed assumptions confirmed:** HSA and Roth IRA pass to the spouse as their own; a 401(k) passes to the spouse; the
  pension continues at 100%; Medicare counts only the living from the row after the death; a survivor under 59½ owes the 10%
  on an inherited IRA; beneficiaries not modelled; nobody alive at the start is refused.
- **Community-property double step-up:** named in `accountSuccessionClass` and covered by §18.1.

## 5. Suspicions not confirmed
- IRMAA top-tier boundary at exactly $500k/$750k (read in the code; confirmed separately as STHLTH-03).
- A plan opening at 70.5 gets a full year of standard and age-65 deductions in its half-year first row.
- Age-65 amounts in the year of death use the opening age, where Pub. 501 uses the age at death (a code comment declares it).
- The survivor switch is off in the default plan.
- LIFE-03's exact factor is a bound, not the table cell.
