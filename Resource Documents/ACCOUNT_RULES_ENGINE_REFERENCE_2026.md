# U.S. Account Rules Engine Reference

## Federal and Arizona implementation specification for tax year 2026

**Research cutoff:** September 10, 2026  
**Audience:** projection-engine developers, reviewers, and test authors  
**Coverage:** federal law plus Arizona individual-income-tax overlays  
**Status:** implementation reference, not tax, legal, investment, or plan-administration advice

This document replaces the supplied `../archive/ACCOUNT_RULES_REFERENCE.md` as the rules resource for the engine. It resolves the 14 open research items in that draft, re-audits the material rules already present, and distinguishes enacted rules from proposed regulations, transition relief, plan-specific behavior, and interpretive inferences.

The central engineering rule is simple: never encode a tax conclusion without also encoding its tax year, jurisdiction, authority status, and required facts. A correct answer for one year, employer plan, beneficiary class, or Arizona conformity date can be wrong for another.

## 1. Findings that change implementation

1. **The 1959 RMD birth cohort is not resolved by final regulations.** Final regulations reserve the 1959 row. Proposed regulations assign age 73. The recommended production default is age 73 with `authority_status = proposed_regulation`, a warning, and a future-regulation override. It must not be represented as settled final law.[^1]
2. **The high-earner Roth catch-up rule is not simply “off in 2026.”** The statutory rule applies after the 2024–2025 administrative transition. Final regulations generally become mandatory for tax years beginning after December 31, 2026, while 2026 operation may use a reasonable, good-faith interpretation. Model those states separately.[^2]
3. **Roth IRA and designated Roth plan five-year periods are independent.** Rolling a designated Roth account to a Roth IRA does not carry the plan's holding period into the Roth IRA. A Roth IRA has its own first-contribution clock; designated Roth accounts use plan participation rules.[^3]
4. **The federal 529 K–12 annual cap is $20,000 for 2026.** It applies per beneficiary across all qualified tuition programs. The prior $10,000 amount is obsolete for distributions after 2025.[^4]
5. **Arizona cannot be modeled as “federal AGI times 2.5%.”** Arizona starts with federal adjusted gross income but has additions and subtractions for, among other items, out-of-state municipal interest, U.S. obligations, Social Security, qualifying pensions, military retirement, 529 contributions and recapture, and qualifying long-term capital gains.[^5]
6. **Arizona conformity must be versioned.** The codified Arizona definition available at the research cutoff points to the Internal Revenue Code as of January 1, 2025. Federal changes enacted later in 2025 must not silently flow into an Arizona calculation without tax-year-specific conformity authority or an explicit state adjustment.[^6]
7. **NUA is not net investment income.** The net unrealized appreciation component of qualifying employer stock remains excluded from net investment income when sold, although appreciation after plan distribution can be net investment income.[^7]
8. **A backdoor Roth conversion is taxpayer-wide at the IRA level.** The pro-rata computation aggregates all traditional, SEP, and SIMPLE IRAs of that individual. Creating a separate empty IRA does not isolate basis.[^8]
9. **A “mega backdoor Roth” is a plan capability, not an account limit.** It requires after-tax employee contributions and either an in-plan Roth rollover or an eligible distribution. The section 415(c) room is reduced by all annual additions other than catch-up contributions.[^9]
10. **Non-governmental 457(b) plans need a separate model.** They are generally unfunded promises subject to employer creditors, lack governmental-plan rollover treatment and the age-50 catch-up, and are taxed under made-available rules. They should not inherit governmental 457(b) defaults.[^10]

## 2. Authority and data architecture

### 2.1 Authority precedence

Use the following order when two sources conflict:

1. enacted federal or Arizona statute;
2. final Treasury regulation or final state regulation;
3. binding or formally published agency guidance, including revenue procedures and notices;
4. official instructions and publications;
5. proposed regulation;
6. reasoned inference, with a visible caveat;
7. plan document, when federal law delegates the choice to the plan.

An IRS publication is valuable implementation guidance but is not a substitute for the Code or regulations. A plan document may be more restrictive than the tax law. The engine should therefore return both legal eligibility and plan availability where relevant.

### 2.2 Minimum rule record

```json
{
  "rule_id": "rmd.start_age.1959",
  "jurisdiction": "US-FED",
  "tax_year": 2026,
  "effective_from": "2023-01-01",
  "effective_to": null,
  "value": 73,
  "authority_status": "proposed_regulation",
  "authority_refs": ["REG-103529-23"],
  "required_facts": ["owner_birth_date"],
  "warning_code": "PROPOSED_RULE_USED",
  "review_after": "final_regulation_or_annual_refresh"
}
```

Recommended `authority_status` values:

- `statute_enacted`
- `final_regulation`
- `official_guidance`
- `official_publication`
- `proposed_regulation`
- `interpretive_inference`
- `plan_specific`
- `state_conformity_pending`

Keep dollar limits in a tax-year table. Keep legal mechanics in effective-dated rules. Do not overwrite an earlier-year value when a new year's inflation adjustment is released.

### 2.3 Calculation output

Every material calculation should be able to return:

```json
{
  "amount": 0,
  "federal_character": "excluded|ordinary_income|capital_gain|other",
  "federal_penalty": 0,
  "federal_niit_base": 0,
  "arizona_addition": 0,
  "arizona_subtraction": 0,
  "authority_status": "final_regulation",
  "assumptions": [],
  "warnings": [],
  "source_rule_ids": []
}
```

Do not collapse ordinary income, capital gain, penalty, NIIT, and Arizona modifications into a single “taxable” Boolean.

## 3. Resolution of the 14 open items

| # | Open item | Resolved rule | Engine treatment |
|---:|---|---|---|
| 1 | Traditional IRA deduction phaseouts | For 2026: active participant single/HOH $81,000–$91,000; active participant MFJ $129,000–$149,000; contributor not covered but spouse covered $242,000–$252,000; active-participant MFS $0–$10,000. | Separate contribution eligibility from deduction eligibility; compute phaseout from filing status, modified AGI, and coverage of each spouse.[^11] |
| 2 | Non-governmental 457(b) | Unfunded top-hat arrangement, employer-creditor exposure, no age-50 catch-up, no governmental-plan rollover regime, and made-available taxation. | Separate account subtype, distribution events, creditor-risk warning, and plan-document inputs.[^10] |
| 3 | SIMPLE IRA first two years | Before age 59½, the additional tax is generally 25% during the two-year participation period and 10% afterward; transfers during the first two years generally must go to another SIMPLE IRA. | Store first participation date; do not infer it only from current custodian account-open date.[^12] |
| 4 | 529 K–12 cap | $20,000 per beneficiary per year across all QTP accounts for distributions after 2025. | Aggregate by beneficiary, calendar year, and qualified expense category.[^4] |
| 5 | Roth five-year clocks | Roth IRA and designated Roth account clocks are separate. Roth IRA conversions also have per-conversion penalty clocks. | Maintain one taxpayer-level Roth IRA qualification clock, plan-specific designated Roth clocks, and conversion-lot clocks.[^3] |
| 6 | Arizona treatment | Account income generally follows federal AGI, then Arizona additions/subtractions apply. Important exceptions are detailed in section 16. | Apply a state overlay after federal character and inclusion are determined.[^5] |
| 7 | QCD cap | 2026 annual exclusion cap $111,000; one-time split-interest election sublimit $55,000 within the overall cap. | Index by year, taxpayer, and QCD type; enforce age 70½ and direct-transfer requirements.[^13] |
| 8 | Backdoor Roth/pro-rata | No conversion income limit, but all of an individual's traditional, SEP, and SIMPLE IRAs enter the pro-rata calculation. | Use taxpayer-level Form 8606 basis and year-end IRA value; never account-level isolation.[^8] |
| 9 | Mega backdoor Roth | After-tax plan contributions may fill unused section 415(c) room if the plan permits; conversion/rollover mechanics determine tax result. | Gate on plan features and subtract all annual additions from the applicable 415(c) limit.[^9] |
| 10 | NUA | Qualifying employer securities may receive basis-as-ordinary-income and NUA-as-long-term-capital-gain treatment after a qualifying lump-sum distribution. | Add an explicit NUA decision path before recommending a rollover; preserve stock lots, cost, NUA, trigger event, and distribution-year facts.[^14] |
| 11 | HSA last-month rule | Eligibility on December 1 can permit a full-year limit, subject to a testing period through December 31 of the next year. Failure generally causes income inclusion and a 10% additional tax. | Store monthly eligibility, last-month election, and testing-period failure reason.[^15] |
| 12 | Spousal inherited IRA | A surviving spouse may remain beneficiary, roll over, or treat the IRA as their own, subject to eligibility and timing rules. | Compare paths rather than automatically treating as own; model pre-59½ access and decedent-year RMD.[^16] |
| 13 | Multiple plans | Section 402(g) elective deferrals aggregate across most plans; governmental 457(b) has a separate deferral limit; section 415(c) is generally employer-group based, with special 403(b) rules. | Build participant, employer/controlled-group, and plan aggregation layers.[^17] |
| 14 | NIIT | Retirement-plan distributions are excluded from NII but may raise MAGI and expose other NII. NUA is excluded; post-distribution appreciation can be NII. | Compute NII classification and MAGI effect separately; see section 15.[^7] |

## 4. Tax-year 2026 reference values

### 4.1 Contribution and compensation limits

| Rule | 2026 amount | Notes |
|---|---:|---|
| Traditional and Roth IRA combined contribution | $7,500 | Lesser of limit or eligible compensation; reduced by contributions to the other IRA type |
| IRA age-50 catch-up | $1,100 | Indexed under SECURE 2.0 |
| 401(k), 403(b), and governmental 457(b) elective deferral | $24,500 | Governmental 457(b) is separate from the 401(k)/403(b) section 402(g) aggregate |
| General age-50 catch-up for those plans | $8,000 | Roth-only catch-up may apply based on prior-year FICA wages |
| Age 60–63 catch-up | $11,250 | Replaces, rather than adds to, the ordinary age-50 catch-up |
| Section 415(c) annual additions | $72,000 | Catch-up contributions excluded; also limited to 100% of compensation |
| Defined-contribution compensation cap | $360,000 | Used where the plan formula requires it |
| SIMPLE IRA regular salary reduction | $17,000 | A qualifying enhanced SIMPLE limit may be $18,100 |
| SIMPLE general age-50 catch-up | $4,000 | Applies to the regular limit category |
| Certain enhanced SIMPLE age-50 catch-up | $3,850 | Applies to the corresponding enhanced category; this lower figure is not a typo |
| SIMPLE age 60–63 catch-up | $5,250 | Applicable instead of ordinary catch-up |
| SEP maximum contribution | $72,000 | Subject to compensation percentage and cap |
| SEP minimum compensation threshold | $800 | Threshold for plan eligibility if plan uses statutory parameters |
| HSA self-only | $4,400 | Monthly eligibility and last-month rule apply |
| HSA family | $8,750 | Shared allocation rule for spouses can apply |
| HSA age-55 catch-up | $1,000 | Each eligible spouse needs their own HSA for their catch-up |
| QCD annual cap | $111,000 | Per eligible taxpayer, indexed |
| QCD one-time split-interest cap | $55,000 | Separate statutory election, subject to detailed requirements |
| QLAC premium cap | $210,000 | Relevant to qualifying longevity annuity contracts |

The retirement-plan values come from Notice 2025-67; the HSA values and HDHP parameters come from Revenue Procedure 2025-19.[^13][^18]

### 4.2 IRA income ranges

| 2026 rule | Filing status | Modified AGI range |
|---|---|---:|
| Traditional IRA deduction, contributor covered at work | Single or head of household | $81,000–$91,000 |
| Traditional IRA deduction, contributor covered at work | Married filing jointly | $129,000–$149,000 |
| Traditional IRA deduction, contributor not covered but spouse covered | Married filing jointly | $242,000–$252,000 |
| Traditional IRA deduction, contributor covered at work | Married filing separately | $0–$10,000 |
| Roth IRA contribution | Single or head of household | $153,000–$168,000 |
| Roth IRA contribution | Married filing jointly | $242,000–$252,000 |
| Roth IRA contribution | Married filing separately, lived with spouse | $0–$10,000 |

Phaseouts are not cliff tests. Implement the IRS rounding rules used for the relevant return, and do not reuse taxable income in place of modified AGI.[^11]

The traditional and Roth IRA contribution limits are one combined taxpayer limit. A traditional IRA contribution is not barred by high income, although its deduction may phase out. A Roth contribution can phase out. On a joint return, the spousal-IRA rules can support a contribution for a spouse with little or no compensation, but the couple's combined contributions cannot exceed their combined eligible compensation under the statutory formula. Married-filing-separately taxpayers who lived apart for the entire year can fall under different phaseout treatment than those who lived with a spouse. Store the living-apart fact.[^33]

An excess contribution can produce a recurring 6% excise tax until corrected. A regular IRA contribution can potentially be recharacterized by the applicable deadline; a Roth conversion made after 2017 cannot be recharacterized back to a traditional IRA. Keep contribution recharacterization and conversion reversal as separate transaction types.[^8][^33]

### 4.3 HSA-compatible coverage parameters

| Parameter | Self-only | Family |
|---|---:|---:|
| Minimum HDHP deductible | $1,700 | $3,400 |
| Maximum HDHP out-of-pocket amount | $8,500 | $17,000 |

Beginning in 2026, federal law also treats bronze and catastrophic individual-market plans as HSA-compatible, permits qualifying direct-primary-care arrangements without destroying HSA eligibility, treats qualifying DPC fees as medical expenses, and makes the pre-deductible telehealth safe harbor permanent. These are enacted federal changes, but their Arizona consequences require the conformity gate described in section 16.[^19]

## 5. Contribution aggregation engine

Contribution calculations need three scopes. Treat them as separate ledgers.

### 5.1 Taxpayer elective-deferral ledger

Aggregate elective deferrals by taxpayer across 401(k), 403(b), SARSEP, and SIMPLE arrangements for the section 402(g) ceiling. A governmental 457(b) uses a separate section 457 limit. An employee with a day-job 401(k) and an unrelated solo 401(k) does not get two section 402(g) limits.[^17]

```text
remaining_402g = max(0, annual_402g_limit
  - sum(employee_elective_deferrals_subject_to_402g))

remaining_governmental_457 = max(0, annual_457_limit
  - employee_457_deferrals
  - employer_457_contributions)
```

Employee pre-tax and designated Roth deferrals share the applicable employee limit. Catch-up contributions sit above the ordinary deferral and section 415(c) limits when all conditions are met.

### 5.2 Employer-group annual-additions ledger

Section 415(c) generally aggregates annual additions for plans of the same employer and related employers. Annual additions include employee pre-tax/Roth deferrals, employee after-tax contributions, employer matching and nonelective contributions, and allocated forfeitures. Catch-ups are excluded.[^9]

```text
remaining_415c = max(0, min(
  annual_415c_limit - annual_additions_to_employer_group,
  compensation_limit_for_415c - annual_additions_to_employer_group
))
```

Plans of genuinely unrelated employers can have separate section 415(c) limits, while the participant still has only one section 402(g) limit. Controlled-group and affiliated-service-group facts must therefore be explicit inputs.

### 5.3 Special 403(b) and catch-up ordering

A 403(b) is treated as maintained by the participant for some section 415 aggregation purposes. A participant controlling more than 50% of a business with a qualified plan or SEP may have to combine that plan with the 403(b). The 403(b) 15-year-service catch-up, if the plan permits it, is applied before the age-based catch-up. A governmental 457(b) participant eligible for both the special final-three-year catch-up and the age-based catch-up uses the larger permitted amount, not both.[^17][^20]

### 5.4 SEP and SIMPLE distinctions

A SEP contribution is an employer contribution, including for a self-employed owner. The effective deductible rate for a self-employed person's own contribution is lower than the plan's stated contribution percentage because net earnings are adjusted for self-employment tax and the contribution itself. Use the worksheet method, not a flat 25% multiplication.[^21]

A SIMPLE employer generally cannot maintain another qualified plan for the same calendar year, subject to statutory exceptions. Participation in another, unrelated employer's plan does not create a second taxpayer-level 402(g) limit.[^22]

SECURE 2.0 permits Roth SEP and Roth SIMPLE IRAs for contributions after 2022. Adoption and payroll operation are optional and must be supported by the employer arrangement and custodian. Roth employer contributions are included in the participant's income under the applicable rules; they should not be treated as pre-tax merely because the account label is SEP or SIMPLE.[^32]

These Roth amounts are held in Roth IRAs and therefore use the Roth IRA ordering, qualification, and owner-lifetime RMD rules. Keep the Roth balance distinct from the traditional SEP or SIMPLE balance even when the employer arrangement presents them together.

Notice 2024-2 expressly reserves the effect of deleting former section 408A(f)(2) on the ordinary Roth IRA contribution limit. Until further guidance resolves that point, do not automatically reduce the participant's $7,500 regular IRA limit by Roth SEP or Roth SIMPLE employer-arrangement contributions; return `official_guidance_pending` for that interaction.[^32]

## 6. Account classification matrix

| Account | Contribution tax treatment | Growth | Qualified/ordinary distribution | Owner lifetime RMD | Primary additional-tax concern |
|---|---|---|---|---|---|
| Taxable brokerage | After-tax | Current tax on realized income; unrealized gain deferred | Basis recovery plus character-specific income/gain | No | None specific; NIIT and wash-sale rules may apply |
| Traditional IRA | Deductible or nondeductible | Tax-deferred | Ordinary income except basis recovery | Yes | 10% before 59½ unless exception |
| Roth IRA | After-tax | Tax-favored | Qualified distribution excluded | No | Earnings tax and/or 10%; conversion clocks |
| Traditional 401(k)/403(b) | Pre-tax deferral plus employer funding | Tax-deferred | Ordinary income | Yes, subject to still-working rules | 10% unless exception |
| Designated Roth 401(k)/403(b) | After-tax deferral | Tax-favored | Qualified distribution excluded | No for owner since 2024 | Nonqualified distribution is pro-rata basis/earnings |
| Governmental 457(b) | Usually pre-tax; Roth may be offered | Tax-deferred/tax-favored | Ordinary income or qualified Roth treatment | Yes for pre-tax | Generally no 10% on plan-origin amounts |
| Non-governmental 457(b) | Contractual deferral | Tax-deferred while unavailable | Ordinary income when paid or made available | Plan/tax-rule specific | Creditor exposure and availability timing, not ordinary qualified-plan rollover logic |
| SEP-IRA | Employer-funded traditional IRA | Tax-deferred | Ordinary income except basis | Yes | IRA penalty and rollover rules |
| SIMPLE IRA | Salary reduction plus employer funding | Tax-deferred; Roth may be plan-offered | Ordinary income or applicable Roth treatment | Yes for traditional balance | 25% in first two years before 59½, otherwise generally 10% |
| HSA | Federal deduction/exclusion if eligible | Tax-free | Qualified medical distribution excluded | No | 20% on nonqualified distributions before 65 |
| Inherited IRA | No beneficiary contribution | Tax-deferred/tax-favored | Depends on source account and qualification | Beneficiary regime | Usually no 10% due to death exception; spouse strategy matters |
| 529 | After-tax federally | Tax-free | Qualified education distribution excluded | No | Taxable earnings plus generally 10% additional tax if nonqualified |
| Nonqualified annuity | After-tax premium | Tax-deferred | Gain generally ordinary; basis recovered under annuity rules | No IRA-style RMD | 10% on taxable amount before 59½, with exceptions |
| Cash-value life insurance | After-tax premium | Tax-deferred | Death benefit usually excluded; living distributions policy-dependent | No | MEC rules, lapse/surrender with loans, transfer-for-value |

The matrix is a routing layer, not a substitute for transaction-level rules below.

## 7. IRA and employer-plan distribution rules

### 7.1 Traditional IRA, SEP-IRA, and SIMPLE IRA

Taxable distributions are ordinary income. A taxpayer with nondeductible basis recovers that basis pro rata under Form 8606; basis is not attached to a particular IRA or distribution. For this purpose, the taxpayer's traditional, SEP, and SIMPLE IRAs form one pool. Spouses have separate pools and separate Forms 8606.[^8]

The usual additional tax is 10% of the taxable portion of a distribution before age 59½ unless an exception applies. The SIMPLE rate is generally 25% during the two-year period beginning on the date the individual first participated in the employer's SIMPLE plan, then 10%. During that period, a tax-free transfer generally must remain within the SIMPLE IRA system.[^12]

Do not combine these different questions:

1. Is the distribution included in gross income?
2. Is some of it a tax-free return of basis?
3. Does a 10% or 25% additional tax apply?
4. Can it be rolled over?
5. Does it satisfy an RMD?

An RMD is includible under the normal rules but cannot be rolled over. A distribution can be taxable yet exempt from the additional tax.

### 7.2 Roth IRA ordering and qualification

Roth IRA distributions follow statutory ordering across all Roth IRAs of the taxpayer:

1. regular contributions;
2. conversions and rollover contributions, first-in-first-out, with each conversion's taxable portion before its nontaxable portion;
3. earnings.[^8]

A qualified Roth IRA distribution requires both:

- a distribution after age 59½, death, disability, or the qualifying first-home event; and
- completion of the five-tax-year period beginning with the first tax year for which a contribution was made to any Roth IRA of the taxpayer.

The first-home lifetime cap is $10,000. Each conversion also has a separate five-tax-year period used only to test the 10% additional tax on converted taxable principal withdrawn before age 59½. This conversion clock does not make earnings qualified.

Recommended lot state:

```json
{
  "roth_ira_first_contribution_tax_year": 2022,
  "regular_contribution_basis": 42000,
  "conversion_lots": [
    {"tax_year": 2024, "taxable": 18000, "nontaxable": 2000}
  ],
  "earnings": 6300
}
```

### 7.3 Designated Roth accounts

A designated Roth 401(k), 403(b), or governmental 457(b) is not a Roth IRA. A qualified distribution uses the plan's five-tax-year participation period and an age-59½, death, or disability event. Nonqualified distributions are allocated pro rata between basis and earnings rather than using the Roth IRA ordering stack.[^3]

A direct rollover from one designated Roth plan to another can preserve relevant participation history under the regulatory rules. A rollover to a Roth IRA instead enters the Roth IRA regime and uses the Roth IRA's clock. If the recipient Roth IRA did not previously exist, its clock begins under Roth IRA rules; the plan's prior years do not become Roth IRA years.

### 7.3a Designated Roth employer matching and nonelective contributions

*Added by S5AA task 4.5 (Q96). Source checked against IRS Notice 2024-2 itself before the rule was coded; the check is recorded in the sprint's citation-check file under Notice 2024-2.*

SECURE 2.0 Act section 604 permits a plan to let a participant **elect** that an employer matching or nonelective contribution be a designated Roth contribution. It is an option, not a reclassification: **an employer match is pre-tax by default**, and becomes Roth money only on the employee's own election, which must be made no later than the time the contribution is allocated and is irrevocable.

| question | answer | authority |
|---|---|---|
| Is a match Roth because the employee's deferral is Roth? | **No.** The deferral's character decides nothing about the match. | Notice 2024-2, section L answer 1 |
| When is an elected Roth match taxed? | It is includible in gross income **for the taxable year in which the contribution is allocated** to the account. | Notice 2024-2, section L answer 2 |
| May a partially vested employee elect? | **No, and not even in part.** The election is available "only if the employee is fully vested in matching contributions at the time the contribution is allocated"; a partially vested employee "may not designate any part" of it. | Notice 2024-2, section L answer 3; IRC 402A(f)(3) |
| Is an elected Roth match FICA wages? | **No.** It is excluded from wages under IRC 3121(a)(5)(A) and (D) and is **not added back** under 3121(v)(1)(A). FUTA likewise. | Notice 2024-2, section L answer 6 |
| Is it subject to federal income tax withholding? | **No** — not section 3401(a) wages. The employee may need to raise withholding or pay estimated tax. | Notice 2024-2, section L answer 5 |
| How is it reported? | **Form 1099-R** for the year of allocation, boxes 1 and 2a, code G. | Notice 2024-2, section L answer 9 |
| Does it count in the section 415(c) safe-harbor compensation definition? | **No.** | Notice 2024-2, section L answer 10 |

**The separate FICA treatment applies to eligible GOVERNMENTAL plans only** (Notice 2024-2, section L answer 7): there the contribution must be fully vested at allocation and is therefore taken into account for Social Security and Medicare at that time. This engine models no governmental 457(b) plan, so that row is out of its supported domain.

### 7.4 High-earner Roth catch-up in 2026

For an employee whose prior-calendar-year FICA wages from the employer sponsoring the plan exceed the indexed threshold, catch-up contributions to an applicable 401(k), 403(b), or governmental 457(b) must be designated Roth contributions. The 2026 wage threshold is $150,000. Wages are measured from that sponsoring employer, not from all employers or household income. An individual with no prior-year FICA wages from that employer is not swept in merely because other income exceeds the threshold.[^2][^13]

Recommended 2026 fields:

```json
{
  "roth_catchup_statutory_effective": true,
  "administrative_transition_relief_active": false,
  "final_regulation_mandatory_applicability": false,
  "reasonable_good_faith_operation_allowed": true,
  "prior_year_fica_wage_threshold": 150000
}
```

The plan must offer the necessary Roth feature for affected participants to make catch-up contributions. Payroll behavior, deemed Roth elections, correction methods, and participant populations need plan-year and plan-document review. Do not use a single `rothCatchupMandatoryIn2026` Boolean.

### 7.5 Governmental 457(b)

Employee and employer contributions share the section 457 annual limit. The governmental 457 limit is separate from the 401(k)/403(b) section 402(g) limit, so a participant may potentially maximize both, subject to compensation and plan terms. A participant generally may use either the special final-three-year catch-up or the age-based catch-up, whichever permits more, but not both.[^17]

Distributions attributable to contributions made directly to a governmental 457(b) generally are not subject to the 10% early-distribution tax. Amounts rolled into the plan from another account retain special tracing concerns and can remain subject to the tax. Roth qualification and RMD treatment remain separate questions.[^23]

### 7.6 Non-governmental 457(b)

Model this as deferred compensation, not as a qualified-plan clone. The arrangement is generally limited to a select group of management or highly compensated employees. Assets remain property of the tax-exempt employer and subject to its general creditors, even if held in a rabbi trust. The employee has no participant-loan right under the governmental-plan rules.[^10]

Key distinctions:

- no designated Roth contribution feature under the governmental-plan rules;
- no age-50 catch-up, although the special final-three-year catch-up may be available;
- no tax-free rollover to an IRA or other eligible retirement plan in the ordinary case;
- taxation generally at the earlier of payment or when amounts are otherwise made available;
- distribution timing and elections depend heavily on the written plan and section 457 rules;
- employee and employer amounts share the annual section 457 limit.

Required engine inputs should include employer tax status, unfunded status, substantial risk/availability dates, election deadline, permitted distribution events, employer solvency warning, and plan-specific payment schedule. If those facts are absent, return `manual_plan_review_required` rather than applying governmental defaults.

## 8. Required minimum distributions

### 8.1 Owner start age

| Birth date | Applicable RMD age | Authority status |
|---|---:|---|
| Before July 1, 1949 | 70½ | Final regulation |
| July 1, 1949–December 31, 1950 | 72 | Final regulation |
| 1951–1958 | 73 | Final regulation |
| 1959 | 73 recommended default | Proposed regulation; final regulations reserve this cohort |
| 1960 or later | 75 | Final regulation |

This table corrects two common implementation errors: assigning age 72 to everyone born in or before 1950, and presenting age 73 for 1959 as final.[^1]

### 8.2 Account and employment rules

Traditional IRAs, SEP-IRAs, and SIMPLE IRAs cannot use the still-working delay. A workplace plan may permit the required beginning date to be delayed until retirement for a participant who is not a 5% owner. Apply that test per plan and employer. Roth IRAs have no owner-lifetime RMD. Designated Roth accounts also have no owner-lifetime RMD for years beginning after 2023.[^24]

The first RMD generally is due April 1 of the year after the applicable start year. Later RMDs are due December 31. Delaying the first payment can place two taxable RMDs in the same calendar year. The projection engine should compare both timing choices rather than defaulting to April 1.

### 8.3 Calculation and aggregation

```text
rmd_for_account = prior_december_31_adjusted_balance
  / applicable_life_expectancy_factor
```

Use Uniform Lifetime Table III by default for an owner. Use Joint and Last Survivor Table II when the sole beneficiary is the spouse and the spouse is more than ten years younger. Beneficiary calculations use the applicable beneficiary regime and table.[^24]

Calculate the RMD for each account first. Traditional, SEP, and SIMPLE IRA RMDs may generally be aggregated and withdrawn from one or more IRAs. 403(b) RMDs have their own aggregation class. RMDs for 401(k), other qualified plans, and 457(b) plans generally must be taken separately from each plan. Do not let a large IRA withdrawal automatically satisfy a 401(k) RMD.

An RMD is not eligible for rollover or conversion. If a transaction contains an RMD plus an excess amount, allocate the RMD out first before evaluating rollover or Roth conversion eligibility.

### 8.4 Missed RMD

The section 4974 excise tax is generally 25% of the shortfall and can fall to 10% after a qualifying timely correction. A waiver may be available for reasonable error with reasonable steps to remedy it. Keep the tax, reduced-rate qualification, and waiver request separate; the engine should not silently assume waiver approval.[^24]

## 9. Inherited retirement accounts

### 9.1 Beneficiary classification

Determine, in order:

1. whether the beneficiary is an individual or nonindividual;
2. whether the individual is an eligible designated beneficiary (EDB);
3. whether the owner died before or on/after the required beginning date;
4. whether a surviving spouse is sole beneficiary;
5. whether a trust qualifies for look-through treatment;
6. whether a minor-child, disability, chronic-illness, or not-more-than-ten-years-younger rule applies.

The 10-year rule alone is not enough.

### 9.2 Ten-year rule and annual distributions

For a non-EDB subject to the ten-year rule:

- if the owner died before the required beginning date, the inherited account generally must be empty by the end of year 10, without an annual-RMD requirement in years 1–9;
- if the owner died on or after the required beginning date, annual beneficiary RMDs generally continue in years 1–9 and the balance must still be empty by year 10.[^1]

Administrative relief excused certain missed annual distributions for 2021–2024. Do not extend that relief into 2025 or later unless new guidance does so. The decedent's unpaid year-of-death RMD remains a separate obligation.

### 9.3 Surviving-spouse choices

A surviving spouse may have three materially different paths:

| Path | Core effect | When it may help | Key risk |
|---|---|---|---|
| Remain beneficiary | Inherited-account rules continue | Spouse under 59½ may need access under the death exception; spouse may delay based on decedent timing in some cases | Beneficiary RMD regime and naming must be maintained |
| Roll to spouse's own IRA | Becomes spouse-owned retirement money | Simplifies ownership and can use spouse's RMD age | Pre-59½ withdrawals can lose the death exception and face 10% tax |
| Treat inherited IRA as own | Account is treated as spouse's IRA if requirements are met | Similar long-term result to own-IRA treatment | Eligibility requires spouse to be sole beneficiary with unlimited withdrawal right; deemed-election rules can apply |

A spouse should not be forced into own-IRA treatment on the date of death. The engine should compare access before 59½, each spouse's age, decedent RMD status, desired beneficiaries, and conversion strategy. A nonspouse cannot treat the IRA as their own and generally can move it only by trustee-to-trustee transfer to a properly titled inherited IRA.[^16]

Inherited traditional-IRA basis stays with the inherited account unless a spouse validly treats it as their own. Track inherited basis separately and support the appropriate Form 8606 reporting.

### 9.4 Inherited Roth IRA

The decedent had no owner-lifetime RMD, but the beneficiary regime can require post-death distributions. The Roth IRA qualification clock can carry relevant decedent history; do not treat every inherited Roth withdrawal as automatically qualified merely because it is inherited. Death satisfies one qualification condition, while the applicable five-tax-year period must also be considered.[^16]

## 10. Strategy modules

### 10.1 Qualified charitable distributions

A QCD generally requires:

- a taxpayer age 70½ or older on the distribution date;
- a direct transfer by the IRA trustee to an eligible charitable organization;
- an eligible IRA, including an inactive SEP or SIMPLE IRA under the applicable rules;
- an amount that otherwise would be taxable;
- substantiation equivalent to that required for a charitable contribution.[^24]

For 2026, the indexed annual cap is $111,000 per eligible taxpayer. A separate one-time election for a qualifying split-interest entity has a $55,000 2026 sublimit; it is not an additional amount above the overall QCD cap. A QCD can satisfy an IRA RMD but is excluded from income, so it is not also claimed as a charitable deduction. Donor-advised funds and supporting organizations are generally ineligible recipients.[^13][^24]

The exclusion may be reduced by deductible IRA contributions made for years beginning after the taxpayer reached age 70½, to prevent double use of the deduction and QCD exclusion. Preserve cumulative post-70½ deductible contributions and prior reductions as taxpayer-level state.

```text
qcd_excludable = max(0,
  min(
    qualified_direct_transfers,
    annual_qcd_cap_remaining,
    otherwise_taxable_ira_amount
  ) - applicable_post_70_5_deduction_offset
)
```

Do not apply a QCD directly from a 401(k) or 403(b). A prior rollover to an IRA may be possible but the RMD amount for the distributing employer plan must come out first and cannot itself be rolled over.

### 10.2 Backdoor Roth IRA

“Backdoor Roth” is a transaction sequence, not a special account: a nondeductible traditional IRA contribution followed by a Roth conversion. There is no income limit on conversion. The IRA annual contribution limit, compensation requirement, deadlines, and excess-contribution rules still apply.

The Form 8606 pro-rata calculation uses the taxpayer's basis and the value of all traditional, SEP, and SIMPLE IRAs. A practical expression is:

```text
denominator = december_31_value_of_all_traditional_sep_simple_iras
  + distributions_from_those_iras_during_year
  + conversions_from_those_iras_during_year

nontaxable_fraction = total_form_8606_basis / denominator
nontaxable_conversion = conversion_amount * nontaxable_fraction
taxable_conversion = conversion_amount - nontaxable_conversion
```

The actual return must follow Form 8606 ordering and rounding. Employer 401(k), 403(b), and 457(b) balances do not enter this IRA denominator. A permitted rollover of pre-tax IRA money into a qualified employer plan before December 31 can change the year-end IRA value, but plan acceptance and transaction validity are required. Do not label this as guaranteed or automatically execute it.[^8]

Required warnings:

- `PRO_RATA_TAXABLE_CONVERSION` when other pre-tax IRA assets exist;
- `FORM_8606_BASIS_REQUIRED` when basis is absent or inconsistent;
- `ESTIMATED_TAX_OR_WITHHOLDING_RISK` because withholding reduces the amount converted and may itself be an early distribution;
- `CONVERSION_IRREVOCABLE` because post-2017 Roth conversions cannot be recharacterized back to traditional IRAs.

### 10.3 Mega backdoor Roth

Required capabilities:

1. the plan accepts voluntary after-tax employee contributions beyond the ordinary elective-deferral limit;
2. there is unused section 415(c) room;
3. the plan permits an in-plan Roth rollover or an in-service distribution/rollover at the relevant time;
4. testing, plan-level limits, and compensation constraints permit the contribution.[^9]

```text
after_tax_room = max(0, min(
  plan_after_tax_cap,
  section_415c_limit
    - employee_pretax_and_roth_deferrals
    - employer_match
    - employer_nonelective_contributions
    - allocated_forfeitures
    - other_annual_additions,
  compensation_constraint_remaining
))
```

Catch-up contributions are outside section 415(c) and should not reduce this room. Earnings on after-tax contributions are pre-tax. Under the allocation guidance for simultaneous rollovers, a distribution sent to multiple destinations is treated as one distribution, permitting pre-tax amounts to go to a traditional IRA or plan and after-tax basis to a Roth destination. A partial distribution cannot simply cherry-pick basis while leaving all associated pre-tax amount behind.[^25]

### 10.4 Net unrealized appreciation

Before rolling employer stock from a qualified plan to an IRA, evaluate NUA. A qualifying lump-sum distribution generally requires distribution within one tax year of the participant's entire balance from all of that employer's plans of the same type after a qualifying event: death, reaching age 59½, separation from service for an employee, or total and permanent disability for a self-employed person.[^14]

For stock distributed in kind under the rule:

- plan cost basis is generally ordinary income in the distribution year;
- NUA at distribution is deferred and becomes long-term capital gain when the stock is sold, regardless of the post-distribution holding period;
- appreciation after distribution is short- or long-term gain based on the actual holding period;
- rolling the stock into an IRA generally forfeits the NUA path.

The taxable basis portion can also face the early-distribution additional tax if no exception applies. Narrow NUA treatment can exist for employer securities attributable to employee contributions outside the ordinary lump-sum path, so transactions that fail the standard test should be routed to specialist review rather than automatically marked impossible.[^14]

NUA should be a scenario comparison, not a default recommendation. Compare current ordinary and capital-gain rates, state treatment, concentration risk, transaction timing, cash needed for tax, charitable plans, and estate strategy. The engine must preserve per-lot employer-stock cost basis and fair market value.

## 11. Early-distribution additional-tax matrix

The table routes common federal exceptions. It is intentionally conservative; source-account eligibility and documentary conditions still need evaluation.[^23]

| Event or exception | IRA | Qualified plan / 401(k) / 403(b) | Governmental 457(b) | Notes |
|---|---:|---:|---:|---|
| Age 59½ | Yes | Yes | Generally unnecessary for plan-origin funds | Ends ordinary age-based 10% issue |
| Death | Yes | Yes | Generally unnecessary | Beneficiary distribution |
| Total and permanent disability | Yes | Yes | Generally unnecessary | Statutory definition applies |
| SEPP / section 72(t) series | Yes | Yes after separation | Special rules | Modification can trigger recapture |
| Separation from service at 55 or later (the “Rule of 55”) | **No** | Yes, from that employer’s plan | Similar treatment; plan-origin 457(b) funds are generally outside the 10% anyway | § 72(t)(2)(A)(v). **Employer-plan money only — it does not reach an IRA**, including an IRA funded by a rollover from that same plan. Added by S5AA task 4.1 (Q93), where the engine had been applying it to IRAs |
| Medical expenses over 7.5% of AGI | Yes | Yes | Generally unnecessary | Limited to qualifying excess |
| IRS levy | Yes | Yes | Generally unnecessary | Levy itself, not a voluntary withdrawal to pay tax |
| Qualified reservist | Yes | Yes | Check tracing | Timing and service requirements |
| Qualified birth or adoption | Yes | Yes if plan permits | Check plan | $5,000 statutory cap per qualifying event/person |
| Terminal illness | Yes | Yes | Check plan | Certification and 84-month-or-less rule |
| Federally declared disaster | Yes | Yes if applicable | Check statute/plan | Generally $22,000 under current framework |
| Domestic abuse victim | Yes | Yes if plan permits | Check plan | 2026 indexed cap $10,500 |
| Emergency personal expense | Yes | Yes if plan permits | Check plan | Generally up to $1,000, with balance and recurrence limits |
| Higher education | Yes | No | No special need | IRA-only exception |
| First home | Yes | No | No special need | IRA-only, $10,000 lifetime cap |
| Health insurance while unemployed | Yes | No | No special need | IRA-only conditions |
| QDRO to alternate payee | No IRA exception | Yes | Plan-specific | IRA divorce transfers use different rules |
| Separation in/after age-55 year | No | Yes for that employer's plan | No special need | Age 50 or 25 years of service can apply to specified public-safety employees and private-sector firefighters |

Do not describe the 60-day rollover rule as an exception to the additional tax. It is a rollover mechanism. Also do not transfer an exception from one source account to another merely because the receiving IRA contains the same dollars. For example, the age-55 separation exception is tied to the employer plan and generally is lost if the amount is first rolled to an IRA.

## 12. Health Savings Accounts

### 12.1 Eligibility and contributions

Eligibility is normally tested month by month on the first day of each month. The individual must have qualifying HDHP coverage and no disqualifying coverage, cannot generally be enrolled in Medicare, and cannot be claimed as another person's dependent. Employer and employee contributions share the annual limit.[^15]

Medicare enrollment reduces the contribution limit to zero beginning with the first month of enrollment. Retroactive Medicare coverage can retroactively make contributions excess, so the engine needs the coverage-effective date, not only the application date.

### 12.2 Last-month rule and testing period

An otherwise eligible individual on December 1 may use the last-month rule to be treated as eligible for the full year. The testing period runs from December 1 of that year through December 31 of the following year. If eligibility is lost during the testing period for a reason other than death or disability, the contribution attributable to the rule is included in income in the failure year and generally faces a 10% additional tax.[^15]

```text
prorated_limit = annual_limit * eligible_months / 12
last_month_increment = full_year_limit - prorated_limit

if last_month_rule_used and testing_period_failed_without_exception:
    income_in_failure_year += last_month_increment
    additional_tax += 10% * last_month_increment
```

Use the actual self-only/family coverage for each month when prorating. A change between coverage tiers is not correctly modeled by counting only “eligible months.”

### 12.3 Distributions

Qualified medical distributions are excluded if for expenses incurred after the HSA was established and not previously reimbursed or deducted. There is no federal deadline requiring reimbursement in the same year, but substantiation must be retained. A nonqualified distribution is included in income and generally faces a 20% additional tax before age 65. The 20% tax no longer applies after age 65, disability, or death, but ordinary income inclusion can remain.[^15]

At death, a spouse beneficiary generally becomes owner of the HSA. For a nonspouse beneficiary, the account generally ceases to be an HSA and fair market value becomes taxable to the beneficiary, or to the estate if the estate is beneficiary, subject to the limited reduction for the decedent's qualified medical expenses paid within one year.

## 13. Section 529 plans

### 13.1 Federal distribution categories

Qualified distributions are excluded to the extent they do not exceed adjusted qualified education expenses. Relevant categories include higher education, eligible apprenticeships, limited student-loan repayment, specified K–12 expenses, and qualifying postsecondary credential expenses. For 2026, the K–12 aggregate cap is $20,000 per beneficiary per year across all 529 accounts.[^4][^19]

The federal K–12 category now includes tuition; curriculum and curricular materials; books and other instructional materials; qualifying tutoring or educational classes outside the home; specified standardized, Advanced Placement, and college-admission tests; dual-enrollment fees; and qualifying educational therapies for students with disabilities. Store category and provider facts, not only a generic `education_expense` amount.[^4]

For K–12 enrollment or attendance, the federal 2026 categories are tuition; curriculum and curricular materials; books and other instructional materials; tutoring or educational classes outside the home; specified standardized, advanced-placement, and college-admission examinations; dual-enrollment fees; and qualifying educational therapies for a student with disabilities. Store expense category and service-provider facts rather than using a generic `k12 = true` flag.[^4]

Student-loan repayment uses a $10,000 lifetime limit per individual, with separate treatment for siblings under the statutory rule. Expense coordination matters: reduce expenses for tax-free assistance and do not double count the same expense for both a 529 exclusion and an education credit.

A nonqualified distribution is allocated pro rata between basis and earnings. Basis is not taxed federally; the earnings portion is included in income and generally faces a 10% additional tax unless an exception applies. Common exceptions involve death, disability, a scholarship or other tax-free educational assistance, attendance at a U.S. military academy, and expenses used for an education credit. The additional-tax exception does not necessarily remove income inclusion, and the amount is limited by the triggering event.[^34]

### 13.2 529-to-Roth IRA rollover

A qualifying direct trustee-to-trustee transfer to the beneficiary's Roth IRA is subject to:

- a $35,000 lifetime cap for that beneficiary;
- the annual Roth IRA contribution limit, reduced by other IRA contributions for the year;
- a requirement that the 529 account have existed at least 15 years;
- exclusion of contributions, and earnings on them, made during the five-year period ending on the transfer date;
- the other statutory conditions for the transfer.[^4]

The statute links the transfer to the annual Roth contribution framework, and the taxpayer needs compensation support. Current official guidance does not conclusively resolve every operational issue, particularly whether a beneficiary change restarts the 15-year period. Encode those as `official_guidance_pending`; do not invent a favorable answer.

### 13.3 Contributions and gift tax

There is no federal income-tax deduction for a 529 contribution. A contribution is a completed gift to the beneficiary for gift-tax purposes. With a 2026 annual exclusion of $19,000, a donor may elect to spread up to five times that amount, $95,000, over five years. A married couple using gift splitting can potentially reach $190,000, but Form 709 filing and allocation rules apply.[^26]

State-plan aggregate balance limits are plan-specific data, not federal annual contribution limits. Do not hardcode a generic national maximum.

## 14. Taxable brokerage, annuities, and life insurance

### 14.1 Taxable brokerage

Track tax lots, basis adjustments, holding period, qualified-dividend status, tax-exempt interest source, wash-sale adjustments, and capital-loss carryovers. Realized short-term gain is generally taxed at ordinary rates; qualified dividends and net long-term gains can receive preferential rates. Capital losses offset capital gains, then up to $3,000 of ordinary income per year, or $1,500 for married filing separately, with carryforward of remaining loss.[^27]

Wash-sale matching must look beyond one brokerage account. Purchases by the taxpayer, a spouse, and an IRA or Roth IRA can be relevant. An IRA replacement purchase can cause permanent loss disallowance rather than a normal basis increase, so the matcher needs account type and beneficial owner, not only security and date.[^27]

NIIT and Arizona character overlays require the underlying components. “Brokerage withdrawal” itself is not income; sales, interest, dividends, distributions, and basis determine tax.

### 14.2 Nonqualified annuity

Before the annuity starting date, a distribution is generally income-first to the extent cash value exceeds investment in the contract. After annuitization, apply the statutory exclusion-ratio/recovery rules. A full surrender produces ordinary income to the extent proceeds exceed remaining investment. A taxable distribution before 59½ may face the 10% additional tax unless an exception applies.[^28]

Contracts issued by the same company to the same policyholder in the same calendar year can be aggregated under section 72(e). Exchanges intended to qualify under section 1035 need transaction-level validation. Death, rider, and beneficiary terms are contract-specific.

### 14.3 Cash-value life insurance

Death benefits paid by reason of the insured's death are generally excluded from gross income, subject to transfer-for-value, reportable-policy-sale, interest-payment, and other exceptions. A surrender produces ordinary income to the extent proceeds exceed investment in the contract.[^29]

For a non-MEC policy, living distributions generally recover investment first and then gain, subject to the statutory rules. A modified endowment contract generally distributes gain first, treats loans and pledges as distributions, and can impose a 10% additional tax on taxable amounts before age 59½. Once a contract becomes a MEC, it generally remains one.

Do not market or model policy loans as permanently “tax free.” Outstanding debt can reduce death proceeds and can cause taxable gain when a policy is surrendered, exchanged improperly, or lapses. Store premiums, dividends/rebates, prior distributions, loan principal, accrued loan interest, cash surrender value, death benefit, MEC status, and transfer history.

Accelerated death benefits for a terminally or chronically ill insured can be excluded when statutory requirements are met. Variable-life investment results, guarantees, charges, and lapse behavior are policy data, not tax-rule constants.

## 15. Net Investment Income Tax

### 15.1 Core computation

NIIT is 3.8% of the lesser of net investment income or modified adjusted gross income above the applicable threshold. The thresholds are not indexed:

| Filing status | Threshold |
|---|---:|
| Married filing jointly or qualifying surviving spouse | $250,000 |
| Married filing separately | $125,000 |
| Single or head of household | $200,000 |

```text
niit = 3.8% * max(0, min(
  net_investment_income,
  modified_agi - filing_status_threshold
))
```

### 15.2 Classification by account event

| Event | Included in NII? | MAGI effect | Implementation note |
|---|---:|---:|---|
| Taxable interest, dividends, annuity income, rents, royalties | Generally yes | Yes | Apply statutory exceptions and allocable deductions |
| Taxable brokerage capital gain | Generally yes | Yes | Exceptions can apply to nonpassive trade/business property |
| Taxable retirement-plan distribution or Roth conversion | No | Taxable amount raises MAGI | Can indirectly expose otherwise existing NII |
| Qualified Roth distribution | No | None | Excluded from gross income |
| Nonqualified Roth earnings | No as a retirement-plan distribution | Taxable amount raises MAGI | Additional tax analyzed separately |
| HSA qualified distribution | No | None | Excluded from gross income |
| HSA nonqualified distribution | Generally not itself an enumerated NII category | Taxable amount raises MAGI | Interpretive inference; retain legal-review flag |
| 529 qualified distribution | No | None | Excluded from gross income |
| 529 nonqualified earnings | Generally not itself an enumerated NII category | Taxable earnings raise MAGI | Interpretive inference |
| NUA component on sale of distributed employer stock | No | Gain raises MAGI | Form 8960 instructions expressly exclude the NUA component |
| Appreciation after NUA distribution | Generally yes | Yes | Normal post-distribution capital gain |
| Taxable annuity distribution | Generally yes to section 72 income | Yes | Form 8960 specifically includes annuity income |
| Life-insurance surrender income | Transaction-dependent | Yes | A gain from disposition of the contract can be NII; classify the event, not only the product |

Retirement-plan distributions are expressly excluded from net investment income even though taxable distributions enter MAGI. A $100,000 Roth conversion can therefore increase NIIT on a separate portfolio without the conversion itself entering the NII numerator.[^7]

The HSA and 529 nonqualified rows are reasoned implementations from the section 1411 categories and Form 8960 instructions, not express product-by-product IRS rulings. Mark them `interpretive_inference`, make the treatment configurable, and review if the IRS publishes specific guidance.

## 16. Arizona overlay

### 16.1 Calculation order and conformity gate

Arizona individual income tax begins with federal adjusted gross income and then applies Arizona additions, subtractions, and other state rules. The safe engine sequence is:

```text
federal_transaction_characterization
  -> federal_gross_income_and_agi
  -> Arizona conformity check for the federal provision
  -> Arizona statutory additions
  -> Arizona statutory subtractions
  -> Arizona taxable income and rate
```

Do not recalculate federal account basis under an Arizona-only method unless Arizona authority expressly requires it.

At the September 10, 2026 research cutoff, the available codified text of A.R.S. § 43-105 defines the Internal Revenue Code for tax years after 2024 by reference to the Code in effect on January 1, 2025, excluding later federal changes. Because the federal law enacted July 4, 2025 added material 2026 HSA and 529 rules, a production engine needs a dated Arizona-conformity record rather than assuming those later changes apply automatically.[^6][^19]

Recommended state record:

```json
{
  "jurisdiction": "US-AZ",
  "tax_year": 2026,
  "irc_conformity_date": "2025-01-01",
  "source_status": "codified_text_at_research_cutoff",
  "post_conformity_federal_overrides": [],
  "warning_code": "VERIFY_AZ_2026_CONFORMITY_SESSION_LAW"
}
```

If a later-enacted session law applies retroactively or the codified text is updated, add a new version. Do not overwrite this research-cutoff record. The state rate is a separate tax-year parameter; verify it against the enacted rate schedule when releasing the tax-year package.[^30]

### 16.2 Account-by-account Arizona treatment

| Account or event | Arizona starting treatment | Arizona-specific adjustment or warning |
|---|---|---|
| Traditional IRA, SEP, SIMPLE distribution | Taxable portion generally enters federal AGI | No generic IRA subtraction; specified pension subtractions do not apply merely because money is retirement income |
| Traditional 401(k), 403(b), 457(b) distribution | Taxable portion generally enters federal AGI | Up to $2,500 aggregate subtraction applies only to specifically listed U.S. government and Arizona state/local pensions; full subtraction applies to qualifying U.S. armed-forces retirement pay |
| Roth qualified distribution | Excluded from federal AGI | Generally no Arizona income to subtract; run conformity check if qualification depends on a post-conformity federal change |
| Roth nonqualified taxable portion | Enters federal AGI | Generally follows into Arizona income unless a specific subtraction applies |
| HSA qualified distribution | Excluded federally | Generally excluded through starting point; 2026 expanded federal qualification rules require conformity check |
| HSA nonqualified taxable distribution | Enters federal AGI | Generally follows into Arizona income; federal additional tax is not itself Arizona income tax |
| 529 qualified distribution | Excluded federally | Arizona also provides a subtraction for qualifying 529 education expenses included in federal AGI; new federal 2026 expense categories require conformity check |
| 529 nonqualified distribution | Earnings generally enter federal AGI | Arizona adds back a limited amount not already in federal AGI to recapture prior Arizona contribution subtractions |
| 529 contribution | No federal deduction | Arizona subtraction up to $2,000 per beneficiary for single/HOH or $4,000 per beneficiary for MFJ; MFS spouses share the $4,000 limit |
| Taxable brokerage interest | Federal AGI treatment | Subtract qualifying U.S. obligation interest; add interest on obligations of other states and their political subdivisions when exempt federally |
| Dividends and short-term gains | Federal AGI treatment | No general Arizona subtraction |
| Net long-term capital gain | Federal AGI treatment | Subtract 25% of qualifying net LTCG included in federal AGI for assets acquired after December 31, 2011 |
| NUA and later stock gain | Federal character enters AGI | Apply the 25% qualifying-LTCG subtraction only if Arizona acquisition-date requirements are satisfied; preserve original acquisition data |
| Social Security and tier 1 railroad retirement | May enter federal AGI | Arizona subtraction removes qualifying amount included federally |
| Nonqualified annuity or taxable life-insurance income | Enters federal AGI | Generally follows into Arizona income; no generic product exclusion |
| Life-insurance death benefit | Generally excluded federally | Usually absent from Arizona starting point; exceptions that produce federal AGI need separate analysis |
| QCD | Excluded from federal AGI | No Arizona income inclusion merely for the excluded amount; no duplicate charitable subtraction |

The pension, Social Security, military, U.S.-obligation, 529, and long-term-capital-gain subtractions are in A.R.S. § 43-1022. Additions, including other-state municipal interest and 529 recapture, are in A.R.S. § 43-1021.[^5][^31]

### 16.3 Arizona 529 details

The Arizona contribution subtraction is per beneficiary, not per account. It is available under the statutory language for contributions to a section 529 plan, not only an Arizona-sponsored plan. For married filing separately, the spouses' combined subtraction for a beneficiary cannot exceed $4,000.[^5]

For a nonqualified withdrawal, Arizona's addition is limited to the amount excluded from federal AGI and further limited by Arizona subtractions previously taken for contributions, reduced by prior recapture. Track contribution deductions and recapture by taxpayer and beneficiary over time. An account-level current balance is not enough.[^31]

For federal expansions enacted after Arizona's stored conformity date, such as the 2026 $20,000 K–12 limit and credential expenses, use:

```text
if federal_rule_effective_date > az_irc_conformity_date
   and no_explicit_az_adoption:
    flag AZ_CONFORMITY_UNRESOLVED
    do not assume Arizona qualified treatment
```

### 16.4 Arizona long-term capital-gain subtraction

Arizona permits a subtraction equal to 25% of net long-term capital gain included in federal AGI that is derived from an investment in an asset acquired after December 31, 2011. Gifted or inherited property uses the transferor's or decedent's acquisition date for this test. If the acquisition date cannot be verified, the subtraction is unavailable under the statutory rule.[^5]

Required lot fields:

```json
{
  "federal_holding_period_start": "2020-05-14",
  "az_original_acquisition_date": "2020-05-14",
  "az_acquisition_date_verified": true,
  "net_ltcg_in_federal_agi": 12500
}
```

Do not apply the 25% subtraction to gross sale proceeds, short-term gain, dividends, or a gain excluded from federal AGI.

## 17. Deterministic test vectors

These tests state the expected rule branch, not a complete tax return. Dollar calculations should use the engine's precision and official form rounding conventions.

### Test 1: Traditional IRA deduction phaseout

```yaml
facts:
  tax_year: 2026
  filing_status: single
  age: 40
  modified_agi: 86000
  workplace_plan_covered: true
  ira_contribution: 7500
expect:
  contribution_allowed_subject_to_compensation: true
  deduction: partially_allowed
  phaseout_range: [81000, 91000]
  nondeductible_basis_created: contribution_minus_deduction
```

The contribution does not become prohibited merely because its deduction phases out.

### Test 2: Roth catch-up transition state

```yaml
facts:
  tax_year: 2026
  age: 55
  prior_year_fica_wages_from_sponsoring_employer: 175000
  plan_type: 401k
  plan_offers_roth: true
expect:
  catchup_roth_rule_statutorily_effective: true
  final_regulations_mandatorily_applicable: false
  reasonable_good_faith_operation: true
  wage_threshold: 150000
```

### Test 3: 1959 RMD cohort

```yaml
facts:
  owner_birth_date: 1959-08-12
expect:
  projected_rmd_age: 73
  authority_status: proposed_regulation
  warning: PROPOSED_RULE_USED
```

### Test 4: Owner born before July 1949

```yaml
facts:
  owner_birth_date: 1949-03-01
expect:
  rmd_age: 70.5
  authority_status: final_regulation
```

This catches the incorrect “all 1950 and earlier use 72” shortcut.

### Test 5: Inherited account after required beginning date

```yaml
facts:
  owner_death_year: 2026
  owner_died_after_required_beginning_date: true
  beneficiary_type: noneligible_designated_beneficiary
expect:
  annual_rmds_years_1_through_9: true
  empty_by_end_of_year_10: true
  decedent_year_rmd_checked_separately: true
```

### Test 6: Spouse under age 59½

```yaml
facts:
  spouse_age: 54
  sole_beneficiary: true
  immediate_cash_need: true
expect:
  compare_inherited_status_and_own_ira: true
  inherited_death_exception_available: true
  own_ira_premature_distribution_risk: true
  automatic_treat_as_own: false
```

### Test 7: Backdoor Roth with existing SEP-IRA

```yaml
facts:
  form_8606_basis_before_transaction: 7500
  roth_conversion: 7500
  december_31_traditional_ira_value: 0
  december_31_sep_ira_value: 92500
  december_31_simple_ira_value: 0
expect:
  aggregate_ira_value_used: 92500
  denominator_includes_conversion: true
  nontaxable_fraction_approx: 0.075
  fully_tax_free_conversion: false
```

### Test 8: Separate employer plans

```yaml
facts:
  day_job_401k_employee_deferral: 24500
  unrelated_solo_401k_employee_deferral: 10000
  solo_401k_employer_contribution: 15000
expect:
  excess_402g_deferral: 10000
  solo_employer_contribution_not_automatically_excess: true
  separate_415c_employer_group_test: true
```

### Test 9: Mega backdoor room

```yaml
facts:
  section_415c_limit: 72000
  ordinary_employee_deferral: 24500
  catchup_contribution: 8000
  employer_match: 10000
  other_annual_additions: 0
  plan_allows_after_tax: true
expect:
  after_tax_room_before_plan_specific_cap: 37500
  catchup_reduces_415c_room: false
```

### Test 10: SIMPLE two-year clock

```yaml
facts:
  age: 42
  simple_first_participation_date: 2025-07-01
  distribution_date: 2026-06-15
  taxable_distribution: 10000
  exception: none
expect:
  additional_tax_rate: 0.25
  additional_tax: 2500
```

### Test 11: HSA last-month failure

```yaml
facts:
  tax_year: 2026
  eligible_on_december_1: true
  last_month_rule_used: true
  contribution_above_monthly_proration: 3300
  eligibility_lost_during_testing_period: true
  loss_reason: voluntary_non_hdph_switch
expect:
  failure_year_income_inclusion: 3300
  additional_tax: 330
```

### Test 12: Federal 529 K–12 aggregation

```yaml
facts:
  tax_year: 2026
  beneficiary: A
  account_1_k12_qualified_distribution: 13000
  account_2_k12_qualified_distribution: 9000
expect:
  annual_federal_k12_cap: 20000
  excess_over_category_cap: 2000
  compute_taxable_earnings_pro_rata: true
```

### Test 13: Arizona 529 contribution

```yaml
facts:
  filing_status: married_filing_jointly
  beneficiary_A_contributions: 5500
  beneficiary_B_contributions: 3000
expect:
  az_subtraction_A: 4000
  az_subtraction_B: 3000
  total_az_subtraction: 7000
```

### Test 14: Arizona capital gain

```yaml
facts:
  net_ltcg_in_federal_agi: 40000
  qualifying_post_2011_asset_gain: 30000
  pre_2012_asset_gain: 10000
expect:
  az_ltcg_subtraction: 7500
```

### Test 15: NUA and NIIT

```yaml
facts:
  employer_stock_basis: 20000
  fair_market_value_at_distribution: 80000
  sale_price: 90000
  qualifying_nua_distribution: true
expect:
  distribution_year_ordinary_income_basis: 20000
  nua_ltcg_on_sale: 60000
  post_distribution_gain: 10000
  niit_excludes_nua_component: 60000
  post_distribution_gain_potentially_in_nii: 10000
```

### Test 16: Retirement distribution indirectly raises NIIT

```yaml
facts:
  filing_status: single
  pre_conversion_magi: 190000
  roth_conversion: 50000
  net_investment_income: 30000
expect:
  conversion_in_nii: 0
  post_conversion_magi: 240000
  niit_magi_excess: 40000
  niit_base: 30000
  niit: 1140
```

### Test 17: Arizona conformity gate

```yaml
facts:
  tax_year: 2026
  federal_rule_enacted: 2025-07-04
  stored_az_irc_conformity_date: 2025-01-01
  explicit_az_adoption: false
expect:
  automatic_state_conformity: false
  warning: AZ_CONFORMITY_UNRESOLVED
```

## 18. Validation invariants

Use these as property tests:

1. The sum of taxable and nontaxable portions of a distribution equals the gross distribution, before withholding.
2. A taxpayer's IRA basis never becomes negative.
3. Roth IRA ordering never allocates earnings while regular-contribution basis remains.
4. Catch-up contributions never consume section 415(c) room.
5. Employee deferrals cannot evade section 402(g) through unrelated employers.
6. Governmental 457 contributions do not consume section 402(g), but do consume the section 457 limit.
7. An RMD amount is never classified as rollover-eligible.
8. IRA RMD aggregation never satisfies a 401(k), 457(b), or unrelated-plan RMD.
9. A beneficiary under the post-RBD ten-year rule cannot have both `annual_rmd_required = false` and `authority_status = final_regulation`.
10. A 1959 owner cannot receive `authority_status = final_regulation` for the proposed age-73 row.
11. 529 K–12 distributions aggregate across accounts by beneficiary.
12. Arizona 529 contribution deductions aggregate by beneficiary and filing unit.
13. NIIT never includes a retirement-plan distribution itself, although the taxable amount changes MAGI.
14. The NUA component and post-distribution appreciation are stored separately.
15. A non-governmental 457(b) cannot inherit the governmental rollover or creditor-protection defaults.
16. A rule enacted after the stored Arizona conformity date cannot flow through without explicit state adoption or a warning.

## 19. Required user facts and stop conditions

Return an unresolved result, not a guessed number, when a material fact is absent.

| Module | Minimum facts | Stop condition examples |
|---|---|---|
| IRA deduction | filing status, modified AGI, compensation, each spouse's workplace coverage | coverage status unknown |
| Roth distribution | age, Roth IRA first tax year, contribution basis, conversions by year, earnings | first contribution year or basis unknown |
| Employer Roth | plan first-participation year, rollover history, age/event, basis and earnings | plan history unavailable |
| RMD | date of birth, account type, prior year-end balance, beneficiary facts, employment/ownership | 1959 cohort warning; plan's still-working status unknown |
| Inherited account | owner and beneficiary dates, owner RBD status, beneficiary class, trust/spouse facts | trust qualification or disability status needs legal review |
| Backdoor Roth | all IRA values, Form 8606 basis, conversions and distributions | prior basis records inconsistent |
| Mega backdoor | plan features, employer group, all annual additions, compensation | plan document/testing limit unknown |
| NUA | stock cost and value, plan types, triggering event, distribution completeness | employer-stock lots or lump-sum status unknown |
| HSA | monthly coverage, other coverage, Medicare effective date, last-month election | retroactive Medicare date uncertain |
| 529 | beneficiary, expense and payment dates, all accounts, basis/earnings, prior rollover history | 15-year clock after beneficiary change unresolved |
| Arizona | residency period, filing status, conformity rule version, pension payer, lot acquisition data, prior 529 deductions | conformity or acquisition date unverified |

## 20. Annual maintenance checklist

Before enabling a new tax year:

1. ingest the IRS retirement-plan COLA notice;
2. ingest the HSA revenue procedure;
3. update IRA deduction and Roth contribution phaseouts;
4. update QCD, catch-up wage threshold, SIMPLE variants, QLAC, and indexed exception caps;
5. check final and proposed RMD regulations, especially the 1959 cohort;
6. check Roth catch-up applicability and correction guidance;
7. check inherited-IRA relief notices and beneficiary regulations;
8. check 529 and HSA post-enactment guidance;
9. verify Arizona's IRC conformity date, additions, subtractions, rate, and forms for the year;
10. refresh employer-plan capability schemas without assuming plans adopted optional features;
11. rerun every deterministic test and invariant;
12. retain the previous tax-year package for historical projections and amended-return support.

## 21. Research caveats and configurable boundaries

The original 14 open topics are resolved to an implementable state. The following are not research omissions; they are genuine authority or plan-data boundaries:

- **1959 RMD age:** proposed, not final.
- **2026 Roth catch-up operations:** statute effective, administrative transition expired, final regulations generally not yet mandatorily applicable; reasonable good-faith implementation remains relevant.
- **Arizona post-January 1, 2025 federal conformity:** must be refreshed from enacted, tax-year-specific state authority.
- **529 beneficiary change and 15-year Roth-rollover clock:** official guidance does not fully resolve the operational question.
- **Roth SEP/SIMPLE interaction with the ordinary Roth IRA contribution limit:** Notice 2024-2 reserves the effect for future guidance.
- **Nonqualified HSA and 529 earnings under NIIT:** the recommended classification is an inference from section 1411 categories and official Form 8960 instructions, not an express product-specific ruling.
- **Employer plans:** after-tax contributions, in-service distributions, in-plan Roth rollovers, loans, hardship distributions, and optional SECURE 2.0 features depend on the plan document.
- **Trust beneficiaries, nonqualified deferred compensation design, controlled groups, life-insurance MEC testing, and unusual NUA transactions:** require specialist review when facts move beyond the deterministic rules above.

## Sources

All sources below are primary government authorities or official agency guidance. Links were checked for this research pass through September 10, 2026.

[^1]: U.S. Treasury and Internal Revenue Service, [T.D. 10001 and related RMD regulations, Internal Revenue Bulletin 2024-33](https://www.irs.gov/irb/2024-33_IRB), including the reserved 1959 cohort in final regulations and age 73 in proposed REG-103529-23.

[^2]: Internal Revenue Service, [Treasury and IRS issue final regulations on Roth catch-up contributions](https://www.irs.gov/newsroom/treasury-irs-issue-final-regulations-on-new-roth-catch-up-rule-other-secure-2point0-act-provisions); Internal Revenue Service, [Notice 2023-62](https://www.irs.gov/pub/irs-drop/n-23-62.pdf).

[^3]: Internal Revenue Service, [Publication 575, Pension and Annuity Income](https://www.irs.gov/publications/p575), sections on designated Roth accounts, qualified distributions, and rollovers to Roth IRAs.

[^4]: Internal Revenue Service, [Topic no. 313, Qualified tuition programs](https://www.irs.gov/taxtopics/tc313), including 2026 K–12 and 529-to-Roth rules.

[^5]: Arizona Legislature, [A.R.S. § 43-1022, Subtractions from Arizona gross income](https://www.azleg.gov/ars/43/01022.htm).

[^6]: Arizona Legislature, [A.R.S. § 43-105, Internal Revenue Code definition](https://www.azleg.gov/ars/43/00105.htm).

[^7]: Internal Revenue Service, [Instructions for Form 8960, Net Investment Income Tax](https://www.irs.gov/instructions/i8960), especially retirement-plan distribution and NUA rules.

[^8]: Internal Revenue Service, [Instructions for Form 8606, Nondeductible IRAs](https://www.irs.gov/instructions/i8606), including IRA aggregation, basis, conversion, and Roth ordering rules.

[^9]: Internal Revenue Service, [401(k) and profit-sharing plan contribution limits](https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-401k-and-profit-sharing-plan-contribution-limits).

[^10]: Internal Revenue Service, [Non-governmental 457(b) deferred compensation plans](https://www.irs.gov/retirement-plans/non-governmental-457b-deferred-compensation-plans); Internal Revenue Service, [Comparison of tax-exempt and governmental 457(b) plans](https://www.irs.gov/retirement-plans/comparison-of-tax-exempt-457b-plans-and-governmental-457b-plans).

[^11]: Internal Revenue Service, [401(k) limit increases to $24,500 for 2026, IRA limit increases to $7,500](https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500).

[^12]: Internal Revenue Service, [SIMPLE IRA withdrawal and transfer rules](https://www.irs.gov/retirement-plans/simple-ira-withdrawal-and-transfer-rules).

[^13]: Internal Revenue Service, [Notice 2025-67](https://www.irs.gov/pub/irs-drop/n-25-67.pdf), 2026 retirement-plan, IRA, QCD, catch-up, SIMPLE, SEP, QLAC, and other indexed limits.

[^14]: Internal Revenue Service, [Publication 575, Pension and Annuity Income](https://www.irs.gov/publications/p575), section on lump-sum distributions and net unrealized appreciation.

[^15]: Internal Revenue Service, [Publication 969, Health Savings Accounts and Other Tax-Favored Health Plans](https://www.irs.gov/publications/p969), including monthly eligibility, the last-month rule, testing period, distributions, and death.

[^16]: Internal Revenue Service, [Publication 590-B, Distributions from Individual Retirement Arrangements](https://www.irs.gov/publications/p590b), surviving-spouse elections and beneficiary distribution rules.

[^17]: Internal Revenue Service, [How much salary can you defer if you're eligible for more than one retirement plan?](https://www.irs.gov/retirement-plans/how-much-salary-can-you-defer-if-youre-eligible-for-more-than-one-retirement-plan).

[^18]: Internal Revenue Service, [Revenue Procedure 2025-19](https://www.irs.gov/pub/irs-drop/rp-25-19.pdf), 2026 HSA and HDHP limits.

[^19]: Congress of the United States, [Public Law 119-21](https://www.govinfo.gov/content/pkg/PLAW-119publ21/pdf/PLAW-119publ21.pdf), sections 70413–70414 and 71306–71308 on 529 and HSA changes.

[^20]: Internal Revenue Service, [Publication 571, Tax-Sheltered Annuity Plans](https://www.irs.gov/publications/p571), 403(b) contribution limits, catch-ups, and controlled-business aggregation.

[^21]: Internal Revenue Service, [Publication 560, Retirement Plans for Small Business](https://www.irs.gov/publications/p560), self-employed contribution calculations and SEP/SIMPLE rules.

[^22]: Internal Revenue Service, [SIMPLE IRA plan FAQs](https://www.irs.gov/retirement-plans/retirement-plans-faqs-regarding-simple-ira-plans).

[^23]: Internal Revenue Service, [Exceptions to tax on early distributions](https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-exceptions-to-tax-on-early-distributions); Internal Revenue Service, [Publication 575](https://www.irs.gov/publications/p575).

[^24]: Internal Revenue Service, [Required minimum distributions FAQs](https://www.irs.gov/retirement-plans/retirement-plan-and-ira-required-minimum-distributions-faqs); Internal Revenue Service, [Publication 590-B](https://www.irs.gov/publications/p590b).

[^25]: Internal Revenue Service, [Rollovers of after-tax contributions in retirement plans](https://www.irs.gov/retirement-plans/rollovers-of-after-tax-contributions-in-retirement-plans), explaining Notice 2014-54 allocation treatment.

[^26]: Internal Revenue Service, [Tax inflation adjustments for tax year 2026](https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill); Internal Revenue Service, [Instructions for Form 709](https://www.irs.gov/instructions/i709), qualified tuition program five-year election and gift splitting.

[^27]: Internal Revenue Service, [Publication 550, Investment Income and Expenses](https://www.irs.gov/publications/p550), basis, investment income, gains, losses, and wash sales.

[^28]: Internal Revenue Service, [Publication 575, Pension and Annuity Income](https://www.irs.gov/publications/p575), nonqualified annuity and section 72 distribution rules.

[^29]: Internal Revenue Service, [Publication 525, Taxable and Nontaxable Income](https://www.irs.gov/publications/p525), life-insurance proceeds, surrender income, and accelerated death benefits.

[^30]: Arizona Legislature, [A.R.S. § 43-1011, Taxable income of resident individuals](https://www.azleg.gov/ars/43/01011.htm).

[^31]: Arizona Legislature, [A.R.S. § 43-1021, Additions to Arizona gross income](https://www.azleg.gov/ars/43/01021.htm).

[^32]: Internal Revenue Service, [Notice 2024-2](https://www.irs.gov/pub/irs-drop/n-24-02.pdf), section K on SIMPLE and SEP Roth IRAs and section L on optional Roth employer contributions.

[^33]: Internal Revenue Service, [Publication 590-A, Contributions to Individual Retirement Arrangements](https://www.irs.gov/publications/p590a), contribution eligibility, spousal IRAs, phaseouts, excess contributions, and recharacterizations.

[^34]: Internal Revenue Service, [Publication 970, Tax Benefits for Education](https://www.irs.gov/publications/p970), qualified tuition program distribution coordination, taxable earnings, and exceptions to the additional tax.
