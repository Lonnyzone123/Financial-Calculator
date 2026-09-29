# STATE-HEALTH — auditor's report (saved by the coordinating session; the auditor could not write .md files)

Audit of Arizona tax, Medicare and IRMAA, health and LTC costs, and penalty taxes at `2b2d5f2`. It is report-only; nothing
was repaired. The repros are all in this folder: `common.js`, `az-tax.js`, `irmaa.js`, `irmaa-partial.js`, `health-ltc.js`,
`penalty.js`, `hsa-65-row.js`. Run each with `node <file>`; each prints MATCH or MISMATCH per check and a SUMMARY line.

## Findings
| ID | Sev | Claim | Dollar impact |
|---|---|---|---|
| STHLTH-01 | P1 | For the two years after a death, the survivor's IRMAA applies the single table to a MAGI that came from a joint return | +$2,884.80 a year (joint MAGI $150k) to +$5,206.80 a year (joint MAGI $250k), for 2 years |
| STHLTH-02 | P2 | With the Rule of 55 on, every 401(k) draw from age 55 is exempt, whenever the person separated (for example, retired at 50) | 10% of 401(k) draws from 55 to 59½; −$2,000 on a $20k draw |
| STHLTH-03 | P2 | The IRMAA top tier is missed at exactly $500,000 single or $750,000 joint (engine uses `>`, CMS uses `≥`) | −$580.80 a year per person |
| STHLTH-04 | P2 | When a plan opens at a fractional age, plan year 2's IRMAA lookback reads that half-year row's MAGI | −$2,884.80 in one year ($150k single) |
| STHLTH-05 | P3 | For pooled draws, the HSA's age-65 exception is judged at the age the row opened at; that convention is declared only for 59½ | $452.90 on a $10k spouse-HSA example |

## Scope
**Code read:**
- Tax: `estimateTaxes` (the Arizona base) and the solver's Arizona mirror.
- Households and IRMAA: `householdFilingFor`, `householdSeniorAges`, `irmaaMonthly`, and the `magiHistory` lookback.
- Costs: the health, Medicare and LTC block.
- Penalty taxes: `earlyWithdrawalPenaltyRate`, `accountOwnerAge`, the penalty and HSA parts of `withdrawFromAccountList`, the
  transfer penalty and HSA-out block, and the four HSA helpers.
- Also the rules JSON, the validator's filing enum (single, mfj, hoh; MFS cannot be entered), and the app's Arizona, Fixed
  tax-year boundary and health text.

**Primary sources read:**
- The cms.gov 2026 Part B fact sheet. Every tier and amount in the rules JSON matches it.
- 20 CFR 418.1115, 418.1135(a) and 418.1205(a).
- 26 USC 72(t) and 223(f), plus the IRS page on exceptions to the early-distribution tax.
- A.R.S. 43-1022, 43-1023, and 43-1041 as amended by Laws 2026 ch. 140; azdor.gov for the 2.5% rate.

**Plans run:** 42 `runPlan` plans (all valid, status ok), plus 16 direct `estimateTaxes` / `irmaaMonthly` calls.

## Per finding
**STHLTH-01.** 418.1135(a) uses the MAGI from the tax year two years earlier. 418.1115(c) applies the joint ranges to people who
"filed a joint tax return" that year. A death is a life-changing event (418.1205(a)), but the more recent year SSA then uses
carries its own status. Neither path pairs joint MAGI with the single table.
- **Code:** `irmaaMonthly(lookback, householdFilingFor(p, age))` picks the table from the current row's status.
- **Repro:** `irmaa.js` I6 and I7. A couple, both 70; self dies at 71; spouse-owned pension.
- **Hand, I7 ($150k joint):** the rows opening at 72 and 73 look back to joint returns, so the standard $202.90 × 12 + $283 =
  $2,717.80. The engine charges ($405.80 + $37.50) × 12 + $283 = $5,602.60.
- **Hand, I6 ($250k joint):** expected $3,866.20; engine $9,073.00.
- **Controls:** the row that looks back to a single return matches in both cases.
- **Not declared:** MA §18.1 and §11 don't cover it; it exists only as an engine comment.

**STHLTH-02.** 72(t)(2)(A)(v) requires "separation from service after attainment of age 55"; the IRS page says "during or after
the year" the employee reaches 55.
- **Code:** it tests the age at the draw and never reads `retireAge`. Neither the validator nor `runPlan` raises any issue.
- **Repro:** `penalty.js` P4 and P4b. Retired at 50, $20k moved from the 401(k) to a taxable account at 56.5, Rule of 55 on.
- **Hand:** federal $390 + Arizona $97.50 + 10% $2,000 = $2,487.50. The engine gives $487.50.
- **Control:** P3 (separated at 56) is right.
- **Why P2, not P1:** the user has to switch the toggle on.

**STHLTH-03.** The CMS 2026 table says "≥$500,000" gets $689.90 + $91.00. At a single MAGI of exactly $500,000:
- **Expected:** $9,653.80 a year.
- **Engine:** $9,073.00.
- The same miss happens at $750k joint (`irmaa.js` I3 and I4b).

**STHLTH-04.** The plan opens at 64.5 with $150k a year of pension. The half-year row's `irmaaMagi` is 75,000, and the row
opening at 66 reads it as its lookback.
- **Expected:** $5,602.60.
- **Engine:** $2,717.80.
- **Repro:** `irmaa-partial.js`.
- §11 covers only plan years 0 and 1. The owner may prefer to extend that text rather than annualise.

**STHLTH-05.** A pooled draw from a spouse's HSA, with the spouse 64.5 at the row's opening, pays 20% on the whole year:
$869.57, where only the part after 65 would give $416.67. A dated transfer is judged on its date and is correct
(`hsa-65-row.js`). The 59½ version of this convention is declared in MA §18.3; the HSA's 65 is not.

## Declared behaviours, confirmed as documented
- **Arizona (§16):** 14 of 14 hand checks match to the cent, covering single, HOH, MFJ, owners swapped, gains and qualified
  dividends, a capital loss, and the death year and survivor year.
  - The declared parts are correct law.
  - These are not modelled, and the app's disclosure names them:
    - the $2,500 government-pension subtraction;
    - the 25% subtraction for gains on assets bought after 2011;
    - uniformed-services pay;
    - U.S. obligation interest;
    - the enhanced senior deduction subtraction.
  - HSA income passes into Arizona correctly, and the 20% additional tax stays out of it.
- **Fixed 2026 rules:** IRMAA and Medicare amounts are not indexed in later years, as the Fixed tax-year boundary card declares.
- **IRMAA (§11):** no surcharge in plan years 0 and 1, then a two-row lookback. It is charged per person, and to one person
  when only one spouse is 65 or older.
- **Health costs (§18.4):** priced per living person, as documented.
- **LTC:** the deterministic mode behaves as coded.
- **10% early-distribution tax:** it matches in every checked case — both ages, an IRA and a 401(k), spouse-owned accounts,
  `penaltyException`, and a pooled draw ($3,209.68 hand-solved). The whole-row charge at 59½ is declared. An early Roth draw
  raises `UNSUPPORTED_ROTH_ORDERING`, which is declared.
- **HSA 20%:** it applies to the includible share only, on the owner's age, and not from 65.

## Suspicions, not findings
- Medicare premiums ignore `healthInflation`, while the pre-Medicare cost inflates at it.
- The LTC cost is never inflated.
- The Part D IRMAA surcharge is charged, but no Part D base premium.
- A separation in the calendar year someone turns 55, but before the birthday, can't be tested.
- Arizona's $2,100 exemption and the Medicare start both key on the age at the row's opening.
