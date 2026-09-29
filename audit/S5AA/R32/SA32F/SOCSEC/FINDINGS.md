# SOCSEC — auditor's report (saved by the coordinating session; the auditor could not write .md files)

Audit of Social Security, pensions and other incomes at `2b2d5f2`. There are 7 P1 findings and 1 P2. Every repro was rerun
before the report: 44 plans, each passing `validateScenario` with status `ok`. The repros are in this folder; run each with
`node <file>`. The shared builder is `lib.js`.

## 1. Scope
- **Functions read:** all 14 assigned. Also the `retirement.pension` line, the earnings hand-off to
  `householdSocialSecurityDetail`, the `SURVIVOR_BENEFIT_APPROXIMATED` issue, the SS rules record and Rules-page text, and the
  validator's SS and otherIncomes checks.
- **Documents read:** MODEL_ASSUMPTIONS §3, 4, 7, 10, 15, 18.1; SPRINT_QUESTIONS Q3, Q47, Q91, Q92; FEATURES; the S5AA README
  and handovers.
- **Primary sources:**
  - ssa.gov, read in a browser because WebFetch gets a 403:
    - the 2026 fact sheet: 2.8% COLA, $184,500, $1,890, $24,480 / $65,160 at $1 for $2 and $1 for $3;
    - the bend-point table: $1,286 / $7,749;
    - the FRA table and the delayed-credit page;
    - the survivor amount page;
    - SS Act §211.
  - POMS RS 00615.320 and RS 00605.360.
  - 20 CFR 404.271, .330, .333, .335, .338, .410, .429, .435 (law.cornell.edu).
  - All stored 2026 constants are correct.
- **Plans run (final rerun):** baseline 10, other incomes 8, self/spouse swap 6, repros 19, suspicion 1.
- **Matches with hand figures** (`baseline_checks.js`, `other_income_checks.js`):
  - Social Security: early and delayed factors, including a benefit starting mid-row; COLA after the claim; the $1-for-$2
    earnings test; survivor factors at 60, 63 and FRA; the death row and the survivor row.
  - Other incomes: spouse-clock timing; start and end proration; pension COLA; the tax character of each income type; a
    spouse's wages ending at their death.
- **Swap check:** the owners swapped give the same figures. One pair differs only in row alignment (a 57.5-year-old self opens
  with a half-year row).
- **WEP/GPO:** the engine applies neither, which is correct after the Social Security Fairness Act.

## 2. Findings
| ID | Sev | Claim | Impact |
|---|---|---|---|
| SOCSEC-01 | P1 | A survivor of an early claimant gets the deceased's *reduced* benefit times the survivor factor, where the law gives PIA times the factor, capped by RIB-LIM. The warning says the result is "too high"; it is too low. | −$900 to −$7,722/yr |
| SOCSEC-02 | P1 | A worker who dies before their claim age leaves no survivor benefit. | −$36,000/yr (PIA $3,000) |
| SOCSEC-03 | P1 | No spouse's benefit (50% of PIA) exists. Entering it as the spouse's own benefit gets the wrong reduction and earns delayed credits the law does not give. | −$18,000/yr; workaround +$900 to +$4,320 |
| SOCSEC-04 | P1 | The PIA gets no COLA between eligibility at 62 and the claim. | −$4,737/yr at a claim at 67 |
| SOCSEC-05 | P1 | The spouse is read at the self's FRA; there is no per-person FRA. | −$400 to −$640/yr |
| SOCSEC-06 | P1 | The earnings test counts gross self-employment profit, not net earnings from self-employment (profit × 0.9235). | +$1,912.50 withheld |
| SOCSEC-07 | P1 | There is no grace-year monthly test, so benefits are withheld for months after retirement. | −$2,760 in the retirement year |
| SOCSEC-08 | P2 | `retirement.ssFra` is not validated; an FRA of 60 or 75 is accepted and paid from. | ±$11,000–13,000/yr |

## 3. Per finding
**SOCSEC-01** (`repro_socsec01_riblim.js`)
- **Rule:** 20 CFR 404.338: the benefit "is equal to the insured person's primary insurance amount", reduced for the survivor's
  age (404.410). It is limited to "the amount the insured person would be receiving if alive, or 82 1/2 percent … whichever is
  larger". POMS RS 00615.320 says the same.
- **Case:** the deceased has a PIA of $3,000, claimed at 62 and died at 68; the survivor's own benefit is 0.

| Case | Hand expectation | Engine | Difference |
|---|---|---|---|
| A: survivor at FRA | min(3,000, max(2,100, 2,475)) × 12 = $29,700 | $25,200 | −$4,500 |
| B: survivor starts at 60 | min(2,145, 2,475) × 12 = $25,740 | $18,018 (2,100 × .715 × 12) | −$7,722 |
| C: deceased claimed at 64 | $29,700 | $28,800 | −$900 |

- **Why:** the reduction is applied twice. The deceased's already-reduced benefit is multiplied by `survivorReductionFactor`.
- **Why it is not a declared limit:** the warning, the rules record and Q92 say the missing cap leaves the result "too high".
  But the engine's figure is never above the law's when the deceased claimed at or before FRA. They also say the cap needs a
  figure the plan does not hold, but `ssBenefit` already is the PIA the engine uses.

**SOCSEC-02** (`repro_socsec02_death_before_claim.js`)
- **Rule:** 20 CFR 404.335 requires only that the insured "died fully insured". 404.338 pays the PIA. Filing by the deceased is
  not a condition.
- **Case:** PIA $3,000, planned claim at 67, death at 65; the survivor is 67 at the death.
- **Hand expectation:** $36,000 (own benefit 0), or $36,000 total (own benefit $1,000).
- **Engine:** $0 and $12,000.
- **Control:** if the same person claims at 64 and dies at 65, the survivor gets $28,800.
- **Cause:** `selfClaimEstablished = selfClaim < selfDeath`, from the R2-003(b) repair.
- **Why it is not a declared limit:** Q3a records the choice, but neither MODEL_ASSUMPTIONS nor the warning's not-modelled list
  declares it, and it contradicts the regulation. The owner should decide whether the general UI caveat covers it.

**SOCSEC-03** (`repro_socsec03_no_spousal.js`)
- **Rule:** 20 CFR 404.333 gives "one-half the insured person's primary insurance amount". 404.410 reduces it by 25/36 of 1% a
  month for 36 months, then 5/12. There are no delayed credits.

| Case | Hand expectation | Engine | Difference |
|---|---|---|---|
| A: spouse own 0 | $54,000 | $36,000 | −$18,000 |
| B: spouse own $600 | $54,000 | $43,200 | −$10,800 |
| C1: workaround (spousal amount entered as own benefit), claim at 62 | $47,700 | $48,600 | +$900 |
| C2: workaround, claim at 70 | $54,000 | $58,320 | +$4,320 |

- **Why it is not a declared limit:** no document declares the spouse's benefit as unmodelled.

**SOCSEC-04** (`repro_socsec04_cola_before_claim.js`)
- **Rule:** 20 CFR 404.271: COLAs apply "beginning with December of the year they become eligible". Eligibility is the year of
  turning 62.
- **Case:** age 62 in 2026, AIME $6,000, claim at 67, COLA 2.8%.
- **Hand expectation:** PIA 2,665.88 × 1.028^5 × 12 = $36,727.17.
- **Engine:** $31,990.56, a difference of −$4,736.61. The next row is −$4,869.23.
- **Entered-figure path:** the same mechanism; $24,000 is paid where $27,553.50 would carry the COLAs.
- **Why it is not a declared limit:** MODEL_ASSUMPTIONS §4 covers only claims made before the projection opens.
- **Minor (P3):** the PIA is not rounded down to the dime (2,665.88 rather than 2,665.80).

**SOCSEC-05** (`repro_socsec05_spouse_fra.js`)
- **Rule:** SSA's FRA table gives 66 and 8 months for someone born in 1958. Delayed credits are 2/3 of 1% a month.
- **Case:** self aged 60, spouse aged 68 with a PIA of $2,000.

| Spouse claim age | Hand expectation | Engine | Difference |
|---|---|---|---|
| 70 | $30,400 | $29,760 | −$640 |
| 62 | $17,200 | $16,800 | −$400 |

- **Also:** the UI takes FRA in half-year steps, so the 1955, 1956, 1958 and 1959 cohorts cannot be entered for anyone.

**SOCSEC-06** (`repro_socsec06_et_nese.js`)
- **Rule:** 20 CFR 404.429(a) counts "net earnings from self-employment". SS Act §211(a)(11) defines the deduction that makes
  that profit × 0.9235.
- **Case:** age 62, $50,000 of SE profit.
- **Hand expectation:** $10,847.50 withheld, 8 crediting months.
- **Engine:** $12,760 withheld, 10 crediting months.

**SOCSEC-07** (`repro_socsec07_grace_year.js`)
- **Rule:** 20 CFR 404.435: "We will not reduce your benefits … for any month in which … you had a non-service month in your
  grace year".
- **Case:** retire and claim at 62.5, $60,000 salary.
- **Hand expectation:** $8,700 of benefit in that row.
- **Engine:** $5,940; it withholds $2,760 and later credits 2 months the law would not.
- **Declared?** Nothing in the tree mentions the grace year.

**SOCSEC-08** (`repro_socsec08_ssfra_unvalidated.js`)
- **Rule:** as in SOCSEC-05, FRA is 66 to 67 for anyone who can still claim.
- **Validation gap:** an FRA of 60 validates cleanly. The validator checks the claim ages but not `ssFra`, and the app's
  `half()` does not clamp it either.
- **Figures:**
  - FRA 60, claim at 62: $27,840 where the law gives $16,800.
  - FRA 75, claim at 70: $16,800 where the law gives $29,760.

## 4. Declared behaviours confirmed as documented
- **Survivor rules:** the benefit starts at 60, falls linearly from 71.5%, and is fixed at the age it starts; survivor FRA is
  approximated for the 1960–61 cohorts; the survivor start is automatic; the survivor switch is off by default.
- **Earnings test:** row proration and whole-month crediting (Q91).
- **Claims before the projection:** indexed at the assumed COLA (§4).
- **Claim ages:** 62–70, enforced by the validator (Q70).
- **Pension:** continues 100% to the survivor (§18.1).
- **Other incomes:** a household-owned income runs on the self's ages (§10); an income stops at its end age, prorated (§15);
  wages and SE income end at the owner's death (§18.1).
- **WEP/GPO:** not applied, which is correct.

## 5. Suspicions, not findings
- **Year-of-FRA band** (`suspicion_fra_year_band.js`): with FRA 67, the whole 66–67 row gets the higher $65,160 band, so
  nothing is withheld on $60,000 of wages. For a mid-year birthday, about half that year falls in the calendar year before the
  FRA year, where up to $8,880 would be withheld. This depends on a birth month the engine does not hold.
- **"Match inflation" growth** indexes from the plan's start, while the "fixed" and "cola" growth modes grow from the stream's
  own start. The UI does not say which dollars the entered amount is in.
- **Annuities:** there is no annuity income type, so no exclusion ratio is applied.
