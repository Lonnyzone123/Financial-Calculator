# RMD-ROTH — auditor's report (saved by the coordinating session; the auditor could not write .md files)

Audit of the frozen `2b2d5f2`: three findings, one P1 and two P2. The repros are in this folder; run each with `node <script>`.
`lib.js` wraps `harness.js`. 36 plans in total, rerun before the report.

## Findings
| ID | Sev | Claim | Dollar impact |
|---|---|---|---|
| RMDROTH-01 | P1 | When the spouse is more than 10 years younger, the engine still uses the Uniform Lifetime Table, never the Joint and Last Survivor Table (Table II). The model itself assumes the spouse takes every IRA at a death, which is the sole-beneficiary premise Table II needs. | +$112.47/yr per $100,000 at owner 75 / spouse 64; +$1,124.72/yr on $1M; same with owners swapped |
| RMDROTH-02 | P2 | A traditional 401(k) owner still employed past the start age is charged RMDs. The statute's default start date follows retirement. P2 because it turns on facts the plan doesn't record (current employer's plan, not a 5% owner, plan terms). | $18,867.92/yr of forced income on a $500,000 401(k) at 73–75 while working |
| RMDROTH-03 | P2 | The 1959-cohort warning (`PROPOSED_RULE_USED`) checks only the self's birth year. A spouse born in 1959 gets RMDs from 73 on the same proposed-regulation row with no warning. | Missing warning; the RMD figure itself (3,773.58) is right |

**RMDROTH-01** (`r01_joint_table.js`)
- **Rule:** 26 CFR 1.401(a)(9)-5(c)(2): a spouse "more than 10 years younger" who is sole beneficiary → the Joint and Last Survivor
  Table. Pub. 590-B's own example: owner 75, spouse 64, "Your applicable denominator is 25.3".
- **Hand:** 100,000/25.3 = 3,952.57; 1,000,000/25.3 = 39,525.69.
- **Engine:** 4,065.04 and 40,650.41 (divisor 24.6). A control with the spouse exactly 10 years younger (75/65) correctly uses
  24.6.
- **Not declared:** no document mentions Table II. `FEATURES.md` and the app's "rules used" list only name the Uniform
  Lifetime divisors.

**RMDROTH-02** (`r02_still_working.js`)
- **Rule:** IRC 401(a)(9)(C)(i) sets the start at April 1 after "the later of" the year the owner reaches the applicable age or
  "the calendar year in which the employee retires". Clause (C)(ii) removes the retirement test only for 5% owners and IRAs.
- **Setup:** age 73, retires at 76, $100,000 salary, $500,000 traditional 401(k).
- **Hand:** $0 RMD each working year.
- **Engine:** 18,867.92, 18,867.92, 18,791.23. An IRA control with the same inputs passes.
- **Not declared anywhere.** The only switch is `rmdOn`, which also turns off every IRA RMD.

**RMDROTH-03** (`r03_spouse_1959_warning.js`)
- **Rule:** IRC 401(a)(9)(C)(v): subclauses (I) and (II) both cover people born in 1959. S5 task 5a.3 says the warning applies to
  "an owner's" RMD age.
- **Cause:** the warning's condition in `runPlan` tests only `2026-Math.floor(p.profile.age)===1959`. The self-born-1959 control
  warns.

## Checked by hand and correct
- **Uniform Lifetime Table:** all 48 divisors from 73 to 120+ match the eCFR table (age 72 is absent but unreachable).
- **Start ages:** 66→75, 67 (1959)→73 with the warning, 72–74→73.
- **Account rules:** IRA and 401(k) RMDs are kept separate; no Roth 401(k) RMD.
- **RMD before conversion:** $20,000 at 75 gives AGI 24,065.04; an unlimited request stops at 95,934.96.
- **QCDs:** the $111,000 cap matches Notice 2025-67 p.5. The QCD counts toward the RMD. The post-70½ offset makes $7,000 of a
  $10,000 QCD taxable, a $760 true-up.
- **Form 8606 settlement:** checked in multi-flow years for self and spouse.
  - QCD + RMD + conversion: 10,687.90 vs engine 10,687.89.
  - With 10% growth after a conversion: 50,121.89 exact, and year 3 48,566.1 vs 48,566.17.
  - The QCD-above-taxable-value pattern, basis kept per owner, and survivor RMDs after a death, both owner orders.

## Declared behaviours, confirmed
- The §12 whole-age start rule.
- Partial-year RMDs, the prior-year balance and no April 1 first-year deferral (all carried as Q90/G3).
- The §14/§18.3 QCD rules and the $111,000 cap held at its 2026 value in later years.
- No opening IRA basis input (`IRA_BASIS_FROM_PROJECTION_ONLY`).
- Roth ordering and 5-year clocks not modelled; `UNSUPPORTED_ROTH_ORDERING` fires correctly on the owner's own age.
- Conversion routing rules; SEP and SIMPLE IRAs not built.
- There is no bracket-fill conversion target in the engine, so nothing to check there.

## Suspicions, not findings
- **Spouse ages within rows:** rows follow the self's birthdays, so a spouse's RMD start (73) and QCD eligibility (70½) can lag
  by up to one row.
- **`customTraditional`:** it is its own RMD plan and sits outside the Form 8606 pool. If a SEP is modelled as a custom account,
  the pro-rata basis would be wrong.
- **Joint `customTraditional`:** its RMD is keyed to the self's age.
- **Cross-area note (`x_deferral.js`):** a $10,000 401(k) deferral lowers AGI to 90,000 only when wages come from
  `employment.salary`. With the same wages entered as an `otherIncomes` item of type `employment`, AGI stays 100,000 (tax
  $22,917.50 vs $20,467.50).
