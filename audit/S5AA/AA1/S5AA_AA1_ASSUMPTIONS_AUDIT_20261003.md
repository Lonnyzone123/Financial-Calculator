AA1 reviewed 47 substantive rule groups: 11 CONSISTENT, 3 ACCEPTABLE SIMPLIFICATION, 25 SHOULD CHANGE, 7 JUDGMENT CALL, and 1 UNVERIFIED; this is an assumptions audit, not a release verdict.
Audited main commit: `9327bf6520457ddc2035f0ebaa859e1d16f48202` (2026-10-03). The R45 document describes planned rules, not implemented behavior.

# S5AA AA1 — model assumptions and owner decisions

## Method and interpretation

The 43 rule groups below are the counting units. A section or question can cite more than one group when it contains several decisions. A **CONSISTENT** row means the stated rule agrees with the linked authority within the supported fact pattern; it does not certify every calculation path. For a planning convention, “consistent” means a reasonable, clearly stated convention, not legal compulsion. Dollar examples are isolated sensitivities, not recalculated household plans, and omit interactions unless stated. “Should change” is an audit recommendation for the owner's decision; no model or source file was changed. Sources were checked as available on 2026-10-03. The audit treats the S2 register as a disposition record, not an assertion of financial correctness.

## Ten findings with the greatest household consequence

1. **AA1-24 — SHOULD CHANGE, L.** Monte Carlo draws independently by account. A new 30-family experiment ran 278,000 Monte Carlo paths: a $1 million Roth equity case changes success from 59.8% to 99.2% when one account becomes twenty; measured first-year risk falls from 19.68% to 4.46%. The appended empirical follow-up also reproduces a deterministic reserve error and invalid covariance silently becoming zero risk. Use common market shocks with explicit asset-class correlation before presenting probability as household evidence.
2. **AA1-07 — SHOULD CHANGE, XL.** The plan has no pre-retirement household cash-flow ledger. Contributions or excluded debt can be paid without corresponding cash, and R45's first-stop rule creates a sharp cost transition. Build a continuous wage, tax, expense and debt ledger across working and retired years.
3. **AA1-33 — SHOULD CHANGE, M.** The default “standard” expected return is 10% with zero fee. $100,000 compounded 20 years is about $673,000 at 10% versus $321,000 at 6%, before withdrawals. Present net-of-fee assumptions and an explicit range or stress case; do not imply 10% is a professional forecast.
4. **AA1-30 — SHOULD CHANGE, M.** The enhanced $6,000-per-eligible-senior federal deduction continues after its statutory 2028 sunset. A two-senior household below the phaseout can show about $2,640 too little federal tax in 2029 at a 22% marginal rate. End it after 2028 unless law changes.
5. **AA1-20 — SHOULD CHANGE, L.** A joint taxable account receives only half basis adjustment at death, even when Arizona community-property treatment may adjust both halves. On a $1 million account with $400,000 basis, the missing $300,000 adjustment could move later federal and Arizona gain tax by about $52,500 at assumed 15% and 2.5% rates. Record property character or present both cases.
6. **AA1-36 — SHOULD CHANGE, XL.** Roth IRA ordering and five-year clocks are omitted. Early-retirement withdrawals can be taxed or penalized differently depending on whether dollars are contributions, conversions, or earnings. Add the missing basis and conversion-year ledger before optimizing Roth withdrawals.
7. **AA1-11 — SHOULD CHANGE, M.** First-two-year IRMAA defaults to below-threshold prior MAGI. For a couple whose relevant prior return is $300,000, the omitted 2026-equivalent surcharge can be about $5,770 a year. Make the lookback return a first-class planning input or display a scenario range.
8. **AA1-13 — SHOULD CHANGE, L.** High-earner workplace catch-up remains pretax when the 2026 Roth rule applies. An $8,000 catch-up at a 24% marginal federal rate shifts about $1,920 of current tax, before future Roth effects. Model the required Roth source and plan availability.
9. **AA1-16 — SHOULD CHANGE, L.** Arizona is reduced to a basic deduction, age exemption and Social Security subtraction. The omitted Arizona senior subtraction and qualifying post-2011 capital-gain subtraction can move state tax by roughly $150 per eligible senior and $625 per $100,000 qualifying gain, respectively, at 2.5%.
10. **AA1-35 — SHOULD CHANGE, L.** “Minimum lifetime taxes” and other withdrawal “optimization” presets are fixed ranking heuristics, with no lookahead or within-year tax-class split. The repository records cases of identical results for different goals. Rename the controls as heuristics until a tested search exists.

## Full findings — federal income tax

### AA1-01 — Cash-pool tax allocation — CONSISTENT

The pro-rata assignment of tax paid from several cash pools (§1; Q19) is a funding convention, not a federal tax characterization. It preserves the household's total tax liability; [CFP Board's practice standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct) call for reasonable assumptions and clear presentation. The allocation is stated and reproducible. Confidence: high.

### AA1-02 — Return on an account created midyear — ACCEPTABLE SIMPLIFICATION

**Model:** §2/Q2 give an account synthesized after the year's return draw the expected return, rather than pretending it shared a return drawn before it existed. **Standard:** [CFP Board's practice standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct) require assumptions suited to the analysis; there is no prescribed intra-year return convention. **Effect:** a $100,000 transfer made halfway through a year earns about $2,500 if a 5% annual return is prorated versus $5,000 if a full year is assigned. This is an example of timing sensitivity, not a measured engine discrepancy. **Recommendation/scope:** keep the disclosed convention and show transfer timing in exports; S, because clarification only. Confidence: medium.

### AA1-03 — Outside cash offsets portfolio draws — CONSISTENT

§3/Q18/Q22 route income and retained cash to funding before selling investments. This is a reasonable cash-flow ordering convention under the [CFP Board's practice standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct); it is not a tax-law requirement. Confidence: high.

### AA1-07 — No working-years budget — SHOULD CHANGE

**Model:** §7/Q59 say the pre-retirement household budget is absent: contributions and some debt service are treated as funded from outside the plan. **Standard:** a retirement recommendation should consider cash flow and competing obligations; see [CFP Board practice standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct). **Effect:** $20,000 annual contributions plus $12,000 debt payments that are outside the model require $32,000 annual after-tax cash, but a projection can still show the full $20,000 added to assets with no affordability test. **Recommendation/scope:** build a continuous annual household cash-flow ledger, with a visible unfunded-cash warning until then. XL: working-year income, payroll and income tax, living costs, debt, contributions, and retirement transition all interact. Confidence: high.

### AA1-09 — Inert fields with material labels — SHOULD CHANGE

**Model:** §9/Q25 accept `debt.taxDeductible`, `expenses[].kind`, `debt.owner`, and four mortgage fields without financial effect; the app discloses some of this. **Law/standard:** mortgage interest and state/local deductions are conditional itemized deductions under [IRS Publication 17](https://www.irs.gov/publications/p17); merely ticking “tax deductible” cannot establish eligibility. **Effect:** if allowable itemized deductions exceed the $32,200 2026 joint standard deduction by $10,000, federal tax could be overstated about $2,200 at a 22% marginal rate. The owner/expense labels can also imply allocation the model does not perform. **Recommendation/scope:** mark these inputs as reference-only at the control itself; implement itemization and ownership only with complete eligibility rules. S for immediate disclosure, XL for itemization; counted as XL. Confidence: high.

### AA1-10 — Household income uses primary member age — SHOULD CHANGE

**Model:** §10/Q32 time a household-owned recurring income on the primary member's age. **Standard:** no tax rule dictates an arbitrary planning-age anchor; the [CFP Board standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct) favor assumptions that match the client's facts. **Effect:** for a spouse five years younger, an income ending at “age 70” can stop five calendar years earlier than intended. At $10,000 a year, the gross cash difference is $50,000. **Recommendation/scope:** label the age as primary-member age and offer a calendar date for genuinely household-owned income. L, a new timing input affects all projection modes. Confidence: high.

### AA1-17 — Result and tax-ledger labels — CONSISTENT

§17 and §18.5 distinguish tax assessed from tax paid after annual IRA settlement. That distinction is consistent with annual federal tax accounting and the [Form 8606 instructions](https://www.irs.gov/instructions/i8606). This verdict concerns the stated measure definitions, not a test of every row. Confidence: high.

### AA1-30 — Enhanced senior deduction survives its sunset — SHOULD CHANGE

**Model:** §25/Q46/Q165 and `src/engine.js` `seniorDeduction()` continue a $6,000 per-person deduction after 2028, although the embedded rule metadata says `expiresAfter:2028`. **Law:** the [IRS describes eligibility only for 2025–2028](https://www.irs.gov/newsroom/check-your-eligibility-for-the-new-enhanced-deduction-for-seniors). **Effect:** two fully eligible seniors receive $12,000 too much deduction in 2029; at a 22% marginal rate that is $2,640 understated federal tax for that year. Phaseout, taxable income and other interactions can change the amount. **Recommendation/scope:** stop the deduction after 2028 and separately model any enacted extension. M: one tax rule, tests, and affected corpus rows. Confidence: high.

### AA1-31 — First and last partial rows treated as full tax years — SHOULD CHANGE

**Model:** §25/Q172 apply full-year deductions and brackets to only the income in a fractional opening or closing projection row. **Law:** federal income tax is annual, with the real tax year's income; [IRS Publication 17](https://www.irs.gov/publications/p17) describes the annual return. **Effect:** with only $30,000 of a $60,000 annual pension in a half-year row, the row may absorb a full-year standard deduction although the other six months' income is absent. The repository's example gives $1,767.50 versus $3,058.75 under its comparison, about $1,291 lower. That comparison is illustrative; actual tax depends on the omitted months and other income. **Recommendation/scope:** ask for tax-year-to-date income or begin projections at a full tax year; do not annualize one-time items. L: timing, tax ledger, and input changes. Confidence: high.

### AA1-45 — QBI omits some business-linked deductions — SHOULD CHANGE

**Model:** §25 and the 2026 rules package define self-employment QBI as profit less deductible half of self-employment tax, while explicitly omitting self-employed health-insurance and retirement-plan deductions. **Law:** [IRS QBI guidance](https://www.irs.gov/newsroom/qualified-business-income-deduction) includes deductions attributable to the business, including those two categories. **Effect:** if $10,000 of otherwise deductible business-linked costs are present and the taxpayer is below the QBI limitation threshold, omitting them can overstate QBI by $10,000 and the QBI deduction by up to $2,000, understating federal tax up to $440 at a 22% marginal rate. If the calculator cannot represent those deductions anywhere, the wider return is incomplete as well. **Recommendation/scope:** accept these business deductions as tax inputs and subtract them in both AGI and QBI as appropriate; until then flag QBI as conditional. L: self-employment inputs and tax ledger. Confidence: high on rule, medium on incidence among supported plans.

## Capital gains and dividends

### AA1-05 — The dividend-off branch assumes a qualified 1.5% yield — SHOULD CHANGE

**Model:** §5/§18.4/Q105/Q126 impute taxable dividends at 1.5% of taxable holdings, all qualified, while the control reads “off.” **Law:** [IRS Publication 550](https://www.irs.gov/publications/p550) distinguishes ordinary and qualified dividends, with holding-period conditions. **Effect:** on $1 million, the assumed dividend is $15,000. If it is actually ordinary income, a 22% versus 15% comparison is about $1,050 federal tax undercount; if the holding pays none, charging 15% on that $15,000 overstates tax by $2,250. **Recommendation/scope:** rename the control to payout-versus-reinvestment, expose yield and qualified fraction, and offer a genuine zero-dividend case. L: account inputs, tax ledger and both simulation branches. Confidence: high.

### AA1-21 — Dollar basis, losses and annual IRA settlement — CONSISTENT

§18.2–18.3/Q120/Q129–131/Q152/Q157 track dollar basis, realize pro-rata gain/loss on taxable sales, carry net capital losses, and settle nondeductible IRA basis per owner. Those stated rules match the supported cases in [IRS Publication 550](https://www.irs.gov/publications/p550) and the [Form 8606 instructions](https://www.irs.gov/instructions/i8606). All taxable gains are assumed long term; that separate simplification is AA1-04. Confidence: medium.

### AA1-04 — Every realized security gain is long term — SHOULD CHANGE

**Model:** §18.2 does not record tax lots or acquisition dates, so every sale's gain is long term. **Law:** [IRS Publication 550](https://www.irs.gov/publications/p550) applies short-term treatment to assets held one year or less. **Effect:** $20,000 of short-term gain at an assumed 22% ordinary rate versus 15% long-term rate makes about $1,400 federal tax understatement, before NIIT or state effects. **Recommendation/scope:** keep as a clearly marked long-term-only scenario assumption in results, and add lot/holding-period support if the tool is to model active trading. S disclosure now; full lot model XL, so counted XL. Confidence: high.

## Social Security

### AA1-12 — Preprojection COLA and current-dollar benefit — CONSISTENT

§4/§22/Q16/Q160 advance a benefit entered in today's dollars to the claim date using the assumed COLA, including when claiming predates the projection. This is coherent with [SSA's COLA explanation](https://www.ssa.gov/cola/) and the form's input convention. The assumed future COLA itself remains uncertain. Confidence: medium.

### AA1-28 — Benefit and claiming estimates — JUDGMENT CALL

**Model:** §22/Q47/Q91–92/Q114/Q158–60 use a simplified entered benefit, claim adjustment, earnings test and survivor formula rather than a complete SSA earnings record and claiming history. **Authority:** [SSA's retirement benefit formula](https://www.ssa.gov/oact/cola/Benefits.html) depends on indexed lifetime earnings; [SSA POMS](https://secure.ssa.gov/apps10/poms.nsf/partlist!OpenView) contains detailed auxiliary and survivor rules. **Effect:** if a $2,000 monthly entered amount is off by 10%, the gross benefit changes $2,400/year before tax and survivor interactions. **Recommendation/scope:** retain a user-entered SSA-statement-based amount, request its date/dollar basis and compare alternative claim ages explicitly. L: richer earnings and claim inputs; genuine planning alternatives exist. Confidence: medium.

## Medicare and IRMAA

### AA1-11 — The first two IRMAA lookback years — SHOULD CHANGE

**Model:** §11 defaults missing pre-plan MAGI to below the first tier. **Authority:** [SSA's IRMAA policy](https://secure.ssa.gov/poms.nsf/lnx/0601101010) generally uses a return two years earlier; [CMS 2026 tiers](https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles) give the surcharge. **Effect:** a joint $300,000 lookback return is in the $274,000–$342,000 tier: Part B $405.80 rather than $202.90 and Part D IRMAA $37.50 monthly, or ($202.90 + $37.50) × 12 × 2 = $5,769.60 annually for two covered people. This assumes both have Medicare and omits plan premiums. **Recommendation/scope:** require prior MAGI or show a visible tier range; M, because input and initial-year Medicare calculation change. Confidence: high.

### AA1-23 — Part D base is not a plan premium; premiums stay nominal — SHOULD CHANGE

**Model:** §18.4/§25/Q172 use $38.99 per person monthly as Part D's plan premium and hold both it and Part B's $202.90 nominally constant after 2026. **Authority:** [CMS states Part D premiums vary by plan](https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles); its [$38.99 base-beneficiary premium](https://www.cms.gov/files/document/july-28-2025-parts-c-d-announcement.pdf) is a formula input, not each enrollee's bill. **Effect:** base B+D is ($202.90+$38.99)×12=$2,902.68/person in 2026; at an illustrative 3% annual increase it would be about $5,245 after 20 years, $2,342/person/year more. A specific Part D plan can differ already in 2026. **Recommendation/scope:** let the user enter Part D premiums and a Medicare-premium growth scenario, with CMS-year refresh. L: inputs and lifetime health-cost engine. Confidence: high.

## Retirement accounts, RMDs and QCDs

### AA1-14 — Per-owner QCD and RMD ordering — CONSISTENT

§14/§18.3/§21.1–21.3/Q83–84/Q90/Q125/Q128–29/Q156/Q169/Q171 distinguish each owner's IRA obligation, take the RMD before conversion, and credit qualifying distributions to that obligation. The stated rules are consistent with [IRS Publication 590-B](https://www.irs.gov/publications/p590b). The age-70½ intra-year convention is separately assessed under AA1-22. Confidence: medium.

### AA1-13 — Required Roth workplace catch-up modelled pretax — SHOULD CHANGE

**Model:** §13 states that catch-up contributions remain pretax even when the 2026 high-earner Roth requirement applies. **Law:** [IRS catch-up guidance](https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-catch-up-contributions) puts the 2026 prior-year employer-wage threshold at $150,000 for plans with Roth features. **Effect:** $8,000 treated as pretax rather than Roth shifts about $1,920 of current federal tax at a 24% marginal rate; later withdrawal taxation moves in the opposite direction. **Recommendation/scope:** model prior-year employer FICA wages and plan Roth availability; route required catch-up to Roth and tax correctly. L: new eligibility input and account contribution flow. Confidence: high.

### AA1-26 — Self-employed IRA compensation and spousal stop age — SHOULD CHANGE

**Model:** §20/Q144–45/Q162/Q166/Q176 allow IRA contributions against gross self-employment profit and tie some spousal IRA opportunities to the general contribution stop age. **Law:** [IRS Publication 590-A](https://www.irs.gov/publications/p590a) uses self-employed compensation after the deduction for half of self-employment tax and qualified-plan contributions, and permits a joint-return spousal IRA on combined eligible compensation. **Effect:** $10,000 net profit with about $1,413 self-employment tax leaves roughly $9,294 compensation after the half-tax deduction, a $706 difference before any self-employed plan contribution; an $8,600 spousal contribution omitted after one spouse retires could move a 22% deduction by $1,892 if deductible. **Recommendation/scope:** derive IRA compensation from Schedule SE inputs and decouple spousal IRA stop from workplace deferral stop. L: contribution windows, tax, and spouse inputs. Confidence: high.

### AA1-46 — Workplace employer match and vesting tax class — CONSISTENT

Q95–Q96/Q168–Q169 distinguish catch-up deferrals from the §415(c) employer-additions limit and distinguish a designated Roth employer match from a pretax match. The repaired stated rules match [IRS Notice 2025-67](https://www.irs.gov/irb/2025-49_IRB) and [IRS Notice 2024-2 on designated Roth matching contributions](https://www.irs.gov/irb/2024-02_IRB). This verdict is for the stated rule, not the separate high-earner Roth *employee catch-up* mismatch in AA1-13. Confidence: medium.

### AA1-32 — HSA contributions stop at birthday 65, not enrollment — SHOULD CHANGE

**Model:** §23/Q177/Q179 stop HSA contribution eligibility at age 65, presuming Medicare enrollment and without an HDHP-coverage history. **Law:** [IRS Publication 969](https://www.irs.gov/publications/p969) bars HSA contributions when enrolled in Medicare, not merely on turning 65; qualified HDHP coverage is also required. **Effect:** a Medicare deferrer with eligible self-only HDHP coverage could miss $4,400 basic plus $1,000 catch-up in 2026; at an illustrative combined 24.5% marginal tax rate, that is up to $1,323 current tax opportunity. The opposite error is possible for an under-65 person without qualifying coverage. **Recommendation/scope:** add coverage and Medicare enrollment months, including retroactive Part A issue, before granting contribution room. L: new person-year coverage inputs and tax eligibility. Confidence: high.

### AA1-27 — Warn-and-permit excess contribution policy — SHOULD CHANGE

**Model:** §21 and the account form permit an explicit `warn` policy that leaves excess IRA/HSA dollars in a tax-favored account, while warning rather than computing ongoing excess-contribution consequences. **Law:** [IRS Publication 590-A](https://www.irs.gov/publications/p590a) and [Publication 969](https://www.irs.gov/publications/p969) describe 6% annual excise taxes while excess remains, subject to correction rules. **Effect:** $5,000 uncorrected excess can incur $300 per year (6%×$5,000), plus earnings/tax interactions. **Recommendation/scope:** make the warning unmistakable in results and either prevent excess or model correction and excise-tax years. M for restricting the planning path and result warning; L for full excise ledger. Counted M. Confidence: high.

### AA1-36 — Roth IRA ordering and five-year periods — SHOULD CHANGE

**Model:** `FEATURES.md`/Q111 acknowledge no Roth contribution, conversion and earnings ordering ledger or five-year clocks. **Law:** [IRS Publication 590-B](https://www.irs.gov/publications/p590b) orders distributions: regular contributions, conversions and rollovers, then earnings, with separate conversion five-year recapture periods. **Effect:** a $50,000 early draw could be tax-free regular contributions or could include taxable earnings and/or up to $5,000 additional tax on a $50,000 taxable conversion amount; the actual result depends on account history. **Recommendation/scope:** collect Roth contribution and conversion histories, then apply ordering and clocks before withdrawal ranking. XL: new basis/history capability across account and tax engines. Confidence: high.

### AA1-22 — Age thresholds tested at row opening — ACCEPTABLE SIMPLIFICATION

**Model:** §12/§18.3/Q137/Q169 judge pooled withdrawals at the opening age for 59½, 65 and 70½; a dated transfer uses its own date. A person born in 1949 is also treated as born before July because the plan stores no birth month. **Law:** [IRS Publication 590-B](https://www.irs.gov/publications/p590b) applies the 59½ exception to the actual distribution date and QCD age 70½ when paid; the birth-month boundary matters for the 1949 RMD cohort. **Effect:** for an undated $50,000 otherwise taxable IRA draw in a crossing year, charging 10% to the whole amount can overstate tax by up to $5,000 if actually drawn after 59½; the repository reports an $8,820 lifetime difference in one test plan. **Recommendation/scope:** preserve the conservative convention only with a prominent crossing-year flag; add a birth month or explicit RMD cohort override for 1949. S for flag; L for dated annual funding and cohort input. Counted S. Confidence: high.

### AA1-18 — Missed RMD excise tax outside the ledger — SHOULD CHANGE

**Model:** §18.3/Q128 display an unpaid RMD shortfall but do not project excise tax. **Law:** [IRS Publication 590-B](https://www.irs.gov/publications/p590b) describes the tax and correction/waiver rules. **Effect:** a $10,000 uncured shortfall could create a $2,500 statutory 25% excise, potentially reduced to $1,000 if corrected timely; waiver is fact dependent. **Recommendation/scope:** mark such a result as tax-incomplete and offer a correction scenario instead of silently showing a clean tax total. S for warning, M for excise calculation; counted S. Confidence: high.

### AA1-15 — Recurring-income end date and permitted tax-free receipts — CONSISTENT

§15/Q85 prorate an income that ends inside a row. Q127 allows a separately identified tax-free gift/inheritance rather than taxing every receipt as compensation. The date convention is consistent with [CFP Board's planning standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct); a bona fide gift is generally outside federal income under [IRC §102](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section102&num=0&edition=prelim), though gift/estate rules outside this model can apply. Confidence: high.

## Survivors and estates

### AA1-19 — Survivor filing and inherited-account election — SHOULD CHANGE

**Model:** §18.1/Q116–19 files the death year jointly and then single, without qualifying surviving spouse/head-of-household status; a spouse always treats the deceased's IRA as their own. **Law:** [IRS Publication 501](https://www.irs.gov/publications/p501) allows qualifying surviving spouse status for up to two later years when the dependency and household tests hold; [Publication 590-B](https://www.irs.gov/publications/p590b) permits an eligible spouse to retain an inherited IRA instead of treating it as their own, with different early-distribution treatment. **Effect:** a surviving spouse under 59½ who needs $50,000 from a deceased spouse's IRA may avoid a $5,000 additional tax by retaining beneficiary treatment; a survivor with an eligible child may also have lower income tax than single status. These are conditional, not automatic. **Recommendation/scope:** add dependent-child/household and IRA-beneficiary elections, with a survivor scenario comparison. XL: new filing status and inherited-account capability. Confidence: high.

### AA1-20 — Community-property basis at death — SHOULD CHANGE

**Model:** §18.1/Q161 reset a solely owned taxable account's basis in full and a jointly titled account's basis only one half. **Law:** [IRC §1014(b)(6)](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section1014&num=0&edition=prelim) can give both halves of qualifying community property a death-date basis; [IRS Publication 551](https://www.irs.gov/publications/p551) explains this treatment. Joint title alone does not prove community property, and the estate-inclusion requirements matter. **Effect:** a $1 million qualifying community account with $400,000 basis would have $600,000 unrealized gain before death. Half adjustment leaves $300,000 gain that a full adjustment would remove. If later sold and all that gain were otherwise taxed at 15% federal plus 2.5% Arizona, the difference is $52,500; brackets, NIIT and other losses can change it. **Recommendation/scope:** collect separate/community-property character and beneficiary facts or show both basis scenarios. L: ownership input, basis, and survivor taxes. Confidence: high.

### AA1-08 — Insurance proceeds and net worth — JUDGMENT CALL

**Model:** §8/Q44 count entered insurance from the first projected year in certain net-worth presentations, including when the plan starts after an entered death age. **Standard:** [CFP Board's standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct) require assumptions suited to the decision; “net worth” may reasonably be present economic resources or an end-of-life estate measure, but the two should be labelled separately. **Effect:** a $500,000 policy can increase displayed net worth by $500,000 even though it is unavailable for ordinary spending before the insured death; if the policy is already paid, omitting it can understate estate resources. **Recommendation/scope:** split spendable assets from death proceeds and label both measures. M: presentation and asset timing. Confidence: medium.

## Arizona tax

### AA1-16 — Arizona subtractions and charitable increase omitted — SHOULD CHANGE

**Model:** §16/Q166 model basic standard deduction, $2,100 age exemption and full Social Security subtraction, omitting other applicable state adjustments. **Law:** [A.R.S. §43-1022](https://www.azleg.gov/ars/43/01022.htm) includes a subtraction linked to the federal enhanced senior deduction and a 25% subtraction for qualifying post-2011 net long-term capital gain; [A.R.S. §43-1041](https://www.azleg.gov/ars/43/01041.htm) provides a charity-related standard-deduction increase under conditions. **Effect:** a qualifying $6,000 senior subtraction changes Arizona tax up to $150 at 2.5% per eligible person; $100,000 of qualifying gain × 25% × 2.5% = $625. A $2,000 qualifying charity increase would be $50 at that rate. Taxable-income floors and eligibility matter. **Recommendation/scope:** add the senior subtraction with its federal sunset, capital-gain vintage/eligibility, and qualifying charity input; otherwise state that the Arizona estimate omits these. L: new state-tax inputs and gain classification. Confidence: high on statutory existence, medium on 2026 form implementation.

## Spending and withdrawal strategy

### AA1-25 — Dated spending stages and guardrail combinations — JUDGMENT CALL

**Model:** §19/Q64–65/Q140–41 prorate dated stages, while overlapping percentage stages multiply and flexibility plus guardrails stack. **Research:** [Guyton and Klinger](https://www.financialplanningassociation.org/article/journal/MAR06-decision-rules-and-maximum-initial-withdrawal-rates) describe a particular decision-rule set, not a universal standard for combining controls. **Effect:** two 10% spending cuts applied multiplicatively give 0.9×0.9=0.81, a 19% cut; applying them additively gives 20%. On $100,000 baseline spending the difference is $1,000 in that year, before any additional guardrail. **Recommendation/scope:** retain composability if intended, but show the combined effective adjustment and an overlap warning. M: spending-rule presentation and tests. Confidence: high.

### AA1-35 — Withdrawal “optimizer” is a ranking heuristic — SHOULD CHANGE

**Model:** `FEATURES.md`/Q56 explain `optimizationGoal` presets choose a fixed tax-class ranking, use one class for an entire shortage and cannot look ahead. **Standard:** [CFP Board's standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct) require a recommendation's assumptions and limitations to be understood; the repository's own controlled cases show preset outcomes often coincide. **Effect:** if $40,000 of a $60,000 draw could fit a lower bracket and the rest should come from taxable assets, a one-class draw cannot express that split. At an illustrative 10-percentage-point tax-rate gap on $20,000, the year can differ by $2,000; actual result needs household recomputation. **Recommendation/scope:** rename current controls “withdrawal order preferences” now, and reserve “optimize/minimum lifetime taxes” for a solver with bracket splitting, lookahead and verification. S for honest labels; XL for solver, counted L as an interim plus substantive redesign path. Confidence: high.

### AA1-37 — Longevity, long-term care and withdrawal horizon — JUDGMENT CALL

**Model:** §18.4/§26 and R45 rule 7 place long-term-care onset at a fixed primary-age offset, use user-entered life ages and stop the projection at the last modeled death. **Standard/research:** [Society of Actuaries longevity research](https://www.soa.org/globalassets/assets/files/research/projects/research-key-finding-longevity.pdf) shows longevity is uncertain; [CFP Board standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct) favor stress testing material assumptions. **Effect:** extending a $60,000 annual spending plan by five years adds $300,000 nominal spending before inflation, health costs, and returns. An LTC onset five years early at $50,000 per year adds $250,000 before inflation/insurance. **Recommendation/scope:** show multiple longevity and LTC timing scenarios, including a survivor's own age; no single onset date is professionally mandated. L: scenario controls across strategies and health-cost timing. Confidence: medium.

## Returns, inflation and Monte Carlo

### AA1-24 — Account count changes Monte Carlo risk — SHOULD CHANGE

**Model:** §18.6/Q45/Q66/Q112/Q133 draw each account independently. **Standard:** economically identical holdings share market shocks; [Vanguard's capital-market model description](https://externalcrewnet.vanguard.com/content/corporatesite/us/en/corp/vemo/vemo-return-forecasts.html) treats asset-class returns and their covariance as drivers of portfolio risk. This is a modeling principle, not a tax-law fact. **Effect:** with ten equal independent 20%-volatility accounts, portfolio standard deviation is 20%/√10≈6.32%, while ten accounts tracking the same asset remain 20%. The repository's example changes a success estimate 35.9%→48.3% with no economic allocation change. **Recommendation/scope:** sample common asset-class shocks, preserve within-class correlation, test account-split invariance and report Monte Carlo assumptions beside probability. L: simulation core and baseline distributions. Confidence: high.

Q102's historical replay repeats the finite return history when a requested horizon runs past the sample. That is a scenario convention, not a longer independent historical record; label the wrap and show the number of distinct years. Q66's account-by-account reserve sizing is another account-splitting sensitivity and should be included in the invariance test. A 30-year sequence repeated twice is 60 simulated years but only 30 distinct observed years. This does not change AA1-24's verdict or scope.

### AA1-33 — 10% standard return and zero fee default — SHOULD CHANGE

**Model:** `src/app-shell.html` defaults to 10% annual expected return, 18.5% volatility and zero investment fee; §26/Q164 call the return an arithmetic mean. **Standard:** [CFP Board's standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct) require reasonable assumptions, and forward-looking return estimates should be tied to allocation, horizon and fees; [Vanguard's forecasts](https://externalcrewnet.vanguard.com/content/corporatesite/us/en/corp/vemo/vemo-return-forecasts.html) are ranges, not a timeless 10% for every portfolio. **Effect:** $100,000×1.10^20≈$672,750 versus $100,000×1.06^20≈$320,714, a $352,036 gap before withdrawals. Arithmetic mean also exceeds compound growth when volatility is present. **Recommendation/scope:** default to a documented asset-mix/net-fee scenario range, show real and nominal assumptions, and stress lower returns. M: defaults and copy; L if redesigned around asset classes. Confidence: high that the present universal default is unsafe, medium on any replacement number.

### AA1-06 — Debt ledger and historical/Monte Carlo boundary — ACCEPTABLE SIMPLIFICATION

**Model:** §6/Q35/Q40 expose a detailed debt ledger in deterministic modes; Monte Carlo paths have less debt reconciliation detail. **Standard:** [CFP Board standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct) call for a transparent recommendation; they do not mandate identical diagnostic columns in every stochastic path. **Effect:** a $100,000 mortgage balance may be included in total net worth while path-level principal/interest timing cannot be independently audited from the same output. This limits verification, not necessarily the computed outcome. **Recommendation/scope:** label the missing path diagnostics and include median-path debt reconciliation when rebuilding output. M: result contract and aggregation. Confidence: medium.

## Debt and housing

### AA1-34 — PMI charged until mortgage balance reaches zero — SHOULD CHANGE

**Model:** §20/§26/Q62/Q113/Q147 charge PMI while any balance remains, with `originalAmount` and `propertyValue` inert. **Law:** for covered borrower-paid PMI, the [CFPB explains requested cancellation at 80% and automatic termination at 78% of original value](https://www.consumerfinance.gov/ask-cfpb/when-can-i-remove-private-mortgage-insurance-pmi-from-my-loan-en-202/), subject to conditions and exceptions. FHA mortgage insurance and lender-paid products differ. **Effect:** $150/month continued five years past an eligible termination date overstates spending $150×12×5=$9,000. **Recommendation/scope:** ask loan/insurance type and original value, compute eligibility, and permit a manual end date. L: debt schema, amortization, spending and forms. Confidence: high.

### AA1-44 — Forced payoff at an entered age — JUDGMENT CALL

**Model:** Q43/Q107/Q139 let an entered payoff age trigger a lump-sum debt settlement at that date, potentially much larger than the scheduled payment. **Standard:** [CFP Board's planning standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct) support modelling a household's chosen debt-payoff plan, but a payoff date is ambiguous unless it means the household will fund the residual principal. **Effect:** a $100,000 balance with a $20,000 annual scheduled payment can require an additional $80,000 cash in the payoff year if the date is treated as a hard deadline, before interest and timing. **Recommendation/scope:** label the field “force full payoff,” show the estimated residual lump sum beside it, and offer a scheduled-amortization alternative. M: debt UI, validation and spending timing. Confidence: high.

### AA1-47 — Refinance measures and ARM contract caps — CONSISTENT

Q9–Q10 report both cash-flow and net-position refinance break-even, show remaining balances for a shorter selected horizon, and default to a horizon that retires both loans; the labels avoid claiming one metric proves a refinance beneficial. Q11/Q94 distinguish an ARM's contractual initial, periodic and lifetime adjustment limits and recalculate payment where the note calls for it. These stated policies are consistent with [CFPB's ARM cap explanation](https://www.consumerfinance.gov/ask-cfpb/what-are-rate-caps-with-an-adjustable-rate-mortgage-arm-and-how-do-they-work-en-1951/) and [CFPB's warning about payment resets](https://www.consumerfinance.gov/ask-cfpb/if-i-am-considering-an-adjustable-rate-mortgage-arm-what-should-i-look-out-for-in-the-fine-print-en-1947/). This is a rule review of modules that are not surfaced as a live refinance recommendation. Confidence: medium.

### AA1-29 — Vesting and filing defaults — JUDGMENT CALL

**Model:** §24/Q162/Q167 use a six-year vesting ramp and default new plans to single status. **Law/standard:** [IRS vesting guidance](https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-vesting) permits different qualified-plan schedules; actual plan terms control. [CFP Board standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct) favor client-specific inputs. **Effect:** if $30,000 of employer match is assumed 60% vested but the plan's actual schedule is 100%, projected assets differ $12,000 at separation before growth. **Recommendation/scope:** label vesting as an example schedule and request actual plan schedule and filing status during setup. M: default/form and vesting selection. Confidence: high.

## R45 — planned spouse retirement dates

### AA1-38 — First earner stop as household-cost anchor — JUDGMENT CALL

**Model:** R45 rules 1–3 make each earner's stop date individual, but start the *retired* household cost budget at the first earning person's stop; remaining net wages fund costs first. **Standard:** [CFP Board standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct) call for household cash flow; there is no universal “first versus last retirement” rule. **Effect:** if one spouse stops at 56 and the other at 67, an entered $70,000 retired budget begins 11 years earlier than a last-stop rule: $770,000 nominal gross cost before inflation, offset by continuing wages. First stop is defensible if it marks a true change in household spending; §7's absent working budget makes the transition discontinuous. **Recommendation/scope:** implement the first-stop rule only with an explicit “costs begin” date or a pre-retirement budget and show the remaining wage offset. L: timing and cash-flow model. Confidence: high.

### AA1-39 — Death before retirement automatically starts retired costs — SHOULD CHANGE

**Model:** R45 rule 4 counts either earner's death as a retirement stop and starts the full retired household budget, even when the survivor continues working. **Standard:** [CFP Board standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct) require survivor facts; death changes household size and may create funeral, dependent and childcare costs, none equal by definition to “retired spending.” **Effect:** for $70,000 retired spending and a 70% survivor factor, the chosen start can move annual costs by $49,000 or $70,000 depending on whether the factor is applied; compared with a $50,000 actual survivor working budget, the difference could be $1,000 or $20,000. **Recommendation/scope:** use a separate survivor working-year budget or require a dated expense change rather than equating death with retirement. L: survivor spending and pre-retirement ledger. Confidence: high.

### AA1-40 — R45 anchors conversion and health costs to the first stop — SHOULD CHANGE

**Model:** R45 rules 5–8 start Roth conversions, reserve and health costs at the first stop, while LTC, glide, bond tent and dividend payout remain on primary age. **Law/standard:** [IRS Publication 590-B](https://www.irs.gov/publications/p590b) imposes conversion taxation in the conversion year; [CMS Medicare guidance](https://www.medicare.gov/basics/get-started-with-medicare/sign-up/when-can-i-sign-up-for-medicare) ties coverage choices to eligibility and employment, not a spouse's stop date. The timing choices are planning judgments, not statutory retirement dates. **Effect:** a $50,000 conversion begun while the other spouse still earns $150,000 can enter higher brackets and later IRMAA; at a 10-point incremental federal rate difference that is $5,000 in one year before state tax and Medicare. Premedicare or Part B costs can likewise be wrong if coverage persists through the working spouse. **Recommendation/scope:** separate conversion start, coverage transition, reserve start and investment glide dates from the household-cost date; keep the primary-age LTC rule only as an explicitly stress-tested assumption. L: several date inputs and engine gates. Confidence: medium.

## 2026 figures and administrative disposition

### AA1-41 — Checked 2026 federal, SSA, CMS and HSA figures — CONSISTENT

The numeric groups inventoried below match the linked primary announcements for their stated year and supported filing statuses: [IRS Rev. Proc. 2025-32](https://www.irs.gov/irb/2025-45_IRB#REV-PROC-2025-32), [IRS Notice 2025-67](https://www.irs.gov/irb/2025-49_IRB), [IRS Rev. Proc. 2025-19](https://www.irs.gov/irb/2025-21_IRB), [SSA's 2026 COLA facts](https://www.ssa.gov/news/en/cola/factsheets/2026.html), and [CMS 2026 premiums/IRMAA](https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles). This is a value/source check, not a determination that each value is applied correctly. The wrong application or future-year assumption is addressed under AA1-11, -13, -23 and -30. Confidence: high for enumerated values.

### AA1-42 — Final Arizona 2026 Form 140 implementation — UNVERIFIED

**Model:** `src/app-shell.html` marks Arizona basic standard deductions `INFERRED` and the head-of-household charity cap `FORM_PENDING`. **Authority sought:** [2026 Arizona Chapter 140](https://www.azleg.gov/legtext/57Leg/2R/laws/0140.pdf), [A.R.S. §43-1041](https://www.azleg.gov/ars/43/01041.htm), and the [Arizona Department of Revenue forms site](https://azdor.gov/forms/individual). **Effect:** the $16,100/$24,150/$32,200 amounts follow the enacted federal-linked base, but final Form 140 mechanics and any administrative clarification were not confirmed; a $1,000 deduction difference is at most about $25 state tax at 2.5% before floors. **Recommendation/scope:** reconcile against final 2026 Form 140 and instructions when published; retain `INFERRED`/`FORM_PENDING` provenance until then. S for provenance, M if figures or computation change; counted M. Confidence: medium on statute, low on unpublished instructions.

### AA1-43 — S2 closure versus excluded modules — CONSISTENT

`S2_CLOSURE_REGISTER.md` distinguishes 47 repaired, one partially qualified, and 11 P19 exclusions; `S2_CARRIED_WORK_REGISTER.md` still owns U1–U6. Treating exclusion as containment rather than a financial fix is consistent with the register and [CFP Board's duty to communicate material limitations](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct). The mortgage-versus-investing module remains excluded; its hypothetical output was not treated as a live financial rule in this audit. Confidence: high.

## Coverage ledger

The table assigns each of the 26 `MODEL_ASSUMPTIONS.md` sections to one or more numbered rule groups. A section with several groups has several verdicts; the count in the report's first line counts each rule group once. The linked findings provide the authority. The short section label here is an index, not a replacement for the full finding.

| Assumption section | Audited rule group and verdict |
|---|---|
| §1 tax pools | AA1-01 CONSISTENT |
| §2 midyear account | AA1-02 ACCEPTABLE SIMPLIFICATION |
| §3 outside income | AA1-03 CONSISTENT |
| §4 preprojection COLA | AA1-12 CONSISTENT |
| §5 dividend-off yield | AA1-05 SHOULD CHANGE |
| §6 debt ledger | AA1-06 ACCEPTABLE SIMPLIFICATION; AA1-44 JUDGMENT CALL |
| §7 omissions/working budget | AA1-07 SHOULD CHANGE; AA1-09 SHOULD CHANGE; AA1-36 SHOULD CHANGE |
| §8 insurance/net worth | AA1-08 JUDGMENT CALL |
| §9 inert fields | AA1-09 SHOULD CHANGE; AA1-34 SHOULD CHANGE |
| §10 household income age | AA1-10 SHOULD CHANGE |
| §11 pre-plan IRMAA | AA1-11 SHOULD CHANGE |
| §12 birth-1949 RMD convention | AA1-14 CONSISTENT for the statutory cohorts; AA1-22 ACCEPTABLE SIMPLIFICATION for missing birth month |
| §13 Roth catch-up | AA1-13 SHOULD CHANGE; AA1-46 CONSISTENT for separate employer-match rules |
| §14 QCD | AA1-14 CONSISTENT |
| §15 income end age | AA1-15 CONSISTENT |
| §16 Arizona return | AA1-16 SHOULD CHANGE; AA1-42 UNVERIFIED for final 2026 form mechanics |
| §17 result contract | AA1-17 CONSISTENT |
| §18 deaths, basis, settlement, RMD, dividends, MC | AA1-04, -05, -14, -18, -19, -20, -21, -22, -23, -24, -37 (verdicts in those findings) |
| §19 dated spending/transfers | AA1-02 ACCEPTABLE SIMPLIFICATION; AA1-25 JUDGMENT CALL |
| §20 compensation and PMI | AA1-26 SHOULD CHANGE; AA1-34 SHOULD CHANGE |
| §21 transfers and RMDs | AA1-14 CONSISTENT; AA1-27 SHOULD CHANGE |
| §22 Social Security | AA1-12 CONSISTENT; AA1-28 JUDGMENT CALL |
| §23 contribution/tax rules | AA1-13 SHOULD CHANGE; AA1-26 SHOULD CHANGE; AA1-32 SHOULD CHANGE; AA1-46 CONSISTENT |
| §24 vesting and filing | AA1-29 JUDGMENT CALL; AA1-46 CONSISTENT for match tax class |
| §25 future tax law and partial rows | AA1-23, -30, -31, -45 SHOULD CHANGE; AA1-42 UNVERIFIED |
| §26 housing and MC | AA1-06 ACCEPTABLE SIMPLIFICATION; AA1-24, -33, -34 SHOULD CHANGE; AA1-37 and -44 JUDGMENT CALL; AA1-47 CONSISTENT for refinance/ARM policy |

`FEATURES.md` omissions were also checked. Roth ordering/five-year rules map to AA1-36; a real withdrawal optimizer to AA1-35; itemization/SALT and interest deductibility to AA1-09; inherited IRA and qualifying survivor status to AA1-19; monthly cash-flow planning to AA1-07; loan-type/PMI detail to AA1-34; longevity and LTC scenarios to AA1-37. AMT, estate tax for high-net-worth households, disability, 529s, richer real-estate modeling, monthly history, and new account types remain declared out of scope. They were not silently treated as modelled; the relevant result should state when a household needs one. A $16 million taxable estate, for example, can require estate-tax analysis that this tool cannot supply; that is a capability boundary, not a claim of $0 estate tax. [IRS estate tax information](https://www.irs.gov/businesses/small-businesses-self-employed/estate-tax) is the primary-law reference.

### Sprint-question coverage, Q1–Q181

The table below is deliberately one row per Q so the coverage can be machine-counted. `AA1-NN` assigns that question's substantive modelling decision to the verdict and authority in its finding; a question can have a secondary topic discussed elsewhere. `Process/implementation` means the entry asks for a repair witness, validation, generator, build, corpus, audit, or routing decision rather than a new modelling premise; it was read and excluded under the brief's process exception. This classification does not reverse an earlier repair or certify code. Q172 and Q175 mix process and model: their substantive clauses are mapped to findings. Duplicate Q2c amendment is included in Q2.

| Q | Assumptions-audit disposition |
|---:|---|
| Q1 | AA1-25 JUDGMENT CALL |
| Q2 | AA1-02 ACCEPTABLE SIMPLIFICATION |
| Q3 | AA1-19 SHOULD CHANGE |
| Q4 | Process/implementation: no independent model premise |
| Q5 | Process/implementation: no independent model premise |
| Q6 | AA1-25 JUDGMENT CALL |
| Q7 | Process/implementation: no independent model premise |
| Q8 | Process/implementation: no independent model premise |
| Q9 | AA1-47 CONSISTENT |
| Q10 | AA1-47 CONSISTENT |
| Q11 | AA1-47 CONSISTENT |
| Q12 | Process/implementation: no independent model premise |
| Q13 | Process/implementation: no independent model premise |
| Q14 | Process/implementation: no independent model premise |
| Q15 | Process/implementation: no independent model premise |
| Q16 | AA1-12 CONSISTENT |
| Q17 | Process/implementation: no independent model premise |
| Q18 | AA1-03 CONSISTENT |
| Q19 | AA1-01 CONSISTENT |
| Q20 | Process/implementation: no independent model premise |
| Q21 | Process/implementation: no independent model premise |
| Q22 | AA1-03 CONSISTENT |
| Q23 | Process/implementation: no independent model premise |
| Q24 | Process/implementation: no independent model premise |
| Q25 | AA1-09 SHOULD CHANGE |
| Q26 | Process/implementation: no independent model premise |
| Q27 | Process/implementation: no independent model premise |
| Q28 | Process/implementation: no independent model premise |
| Q29 | Process/implementation: no independent model premise |
| Q30 | Process/implementation: no independent model premise |
| Q31 | Process/implementation: no independent model premise |
| Q32 | AA1-10 SHOULD CHANGE |
| Q33 | Process/implementation: no independent model premise |
| Q34 | Process/implementation: no independent model premise |
| Q35 | AA1-06 ACCEPTABLE SIMPLIFICATION |
| Q36 | AA1-09 SHOULD CHANGE |
| Q37 | Process/implementation: no independent model premise |
| Q38 | Process/implementation: no independent model premise |
| Q39 | Process/implementation: no independent model premise |
| Q40 | AA1-06 ACCEPTABLE SIMPLIFICATION |
| Q41 | Process/implementation: no independent model premise |
| Q42 | Process/implementation: no independent model premise |
| Q43 | AA1-44 JUDGMENT CALL |
| Q44 | AA1-08 JUDGMENT CALL |
| Q45 | AA1-24 SHOULD CHANGE |
| Q46 | AA1-30 SHOULD CHANGE |
| Q47 | AA1-28 JUDGMENT CALL |
| Q48 | Process/implementation: no independent model premise |
| Q49 | Process/implementation: no independent model premise |
| Q50 | AA1-05 SHOULD CHANGE |
| Q51 | AA1-25 JUDGMENT CALL |
| Q52 | AA1-25 JUDGMENT CALL |
| Q53 | Process/implementation: no independent model premise |
| Q54 | Process/implementation: no independent model premise |
| Q55 | Process/implementation: no independent model premise |
| Q56 | AA1-35 SHOULD CHANGE |
| Q57 | Process/implementation: no independent model premise |
| Q58 | Process/implementation: no independent model premise |
| Q59 | AA1-07 SHOULD CHANGE |
| Q60 | Process/implementation: no independent model premise |
| Q61 | Process/implementation: no independent model premise |
| Q62 | AA1-34 SHOULD CHANGE |
| Q63 | Process/implementation: no independent model premise |
| Q64 | AA1-25 JUDGMENT CALL |
| Q65 | AA1-25 JUDGMENT CALL |
| Q66 | AA1-24 SHOULD CHANGE |
| Q67 | Process/implementation: no independent model premise |
| Q68 | Process/implementation: no independent model premise |
| Q69 | AA1-10 SHOULD CHANGE |
| Q70 | AA1-28 JUDGMENT CALL |
| Q71 | Process/implementation: no independent model premise |
| Q72 | Process/implementation: no independent model premise |
| Q73 | Process/implementation: no independent model premise |
| Q74 | AA1-25 JUDGMENT CALL |
| Q75 | AA1-06 ACCEPTABLE SIMPLIFICATION |
| Q76 | Process/implementation: no independent model premise |
| Q77 | Process/implementation: no independent model premise |
| Q78 | Process/implementation: no independent model premise |
| Q79 | AA1-41 CONSISTENT |
| Q80 | Process/implementation: no independent model premise |
| Q81 | Process/implementation: no independent model premise |
| Q82 | Process/implementation: no independent model premise |
| Q83 | AA1-14 CONSISTENT |
| Q84 | AA1-14 CONSISTENT |
| Q85 | AA1-15 CONSISTENT |
| Q86 | Process/implementation: no independent model premise |
| Q87 | AA1-21 CONSISTENT |
| Q88 | AA1-21 CONSISTENT |
| Q89 | AA1-21 CONSISTENT |
| Q90 | AA1-14 CONSISTENT |
| Q91 | AA1-28 JUDGMENT CALL |
| Q92 | AA1-28 JUDGMENT CALL |
| Q93 | AA1-14 CONSISTENT |
| Q94 | AA1-47 CONSISTENT |
| Q95 | AA1-46 CONSISTENT |
| Q96 | AA1-46 CONSISTENT |
| Q97 | AA1-14 CONSISTENT |
| Q98 | AA1-21 CONSISTENT |
| Q99 | AA1-32 SHOULD CHANGE |
| Q100 | Process/implementation: no independent model premise |
| Q101 | AA1-06 ACCEPTABLE SIMPLIFICATION |
| Q102 | AA1-24 SHOULD CHANGE |
| Q103 | Process/implementation: no independent model premise |
| Q104 | AA1-32 SHOULD CHANGE |
| Q105 | AA1-05 SHOULD CHANGE |
| Q106 | AA1-17 CONSISTENT |
| Q107 | AA1-44 JUDGMENT CALL |
| Q108 | AA1-25 JUDGMENT CALL |
| Q109 | AA1-25 JUDGMENT CALL |
| Q110 | AA1-34 SHOULD CHANGE |
| Q111 | AA1-36 SHOULD CHANGE |
| Q112 | AA1-24 SHOULD CHANGE |
| Q113 | AA1-34 SHOULD CHANGE |
| Q114 | AA1-28 JUDGMENT CALL |
| Q115 | AA1-19 SHOULD CHANGE |
| Q116 | AA1-19 SHOULD CHANGE |
| Q117 | AA1-19 SHOULD CHANGE |
| Q118 | Process/implementation: no independent model premise |
| Q119 | AA1-19 SHOULD CHANGE |
| Q120 | AA1-21 CONSISTENT |
| Q121 | AA1-19 SHOULD CHANGE |
| Q122 | AA1-19 SHOULD CHANGE |
| Q123 | AA1-14 CONSISTENT |
| Q124 | AA1-14 CONSISTENT |
| Q125 | AA1-14 CONSISTENT |
| Q126 | AA1-05 SHOULD CHANGE |
| Q127 | AA1-15 CONSISTENT |
| Q128 | AA1-18 SHOULD CHANGE |
| Q129 | AA1-14 CONSISTENT |
| Q130 | AA1-21 CONSISTENT |
| Q131 | AA1-21 CONSISTENT |
| Q132 | AA1-24 SHOULD CHANGE |
| Q133 | AA1-24 SHOULD CHANGE |
| Q134 | Process/implementation: no independent model premise |
| Q135 | AA1-22 ACCEPTABLE SIMPLIFICATION |
| Q136 | AA1-22 ACCEPTABLE SIMPLIFICATION |
| Q137 | AA1-22 ACCEPTABLE SIMPLIFICATION |
| Q138 | Process/implementation: no independent model premise |
| Q139 | AA1-44 JUDGMENT CALL |
| Q140 | AA1-25 JUDGMENT CALL |
| Q141 | AA1-25 JUDGMENT CALL |
| Q142 | AA1-02 ACCEPTABLE SIMPLIFICATION |
| Q143 | Process/implementation: no independent model premise |
| Q144 | AA1-26 SHOULD CHANGE |
| Q145 | AA1-26 SHOULD CHANGE |
| Q146 | AA1-02 ACCEPTABLE SIMPLIFICATION |
| Q147 | AA1-34 SHOULD CHANGE |
| Q148 | AA1-07 SHOULD CHANGE |
| Q149 | AA1-14 CONSISTENT |
| Q150 | AA1-14 CONSISTENT |
| Q151 | AA1-14 CONSISTENT |
| Q152 | AA1-21 CONSISTENT |
| Q153 | AA1-05 SHOULD CHANGE |
| Q154 | Process/implementation: no independent model premise |
| Q155 | AA1-05 SHOULD CHANGE |
| Q156 | AA1-14 CONSISTENT |
| Q157 | AA1-14 CONSISTENT |
| Q158 | AA1-28 JUDGMENT CALL |
| Q159 | AA1-28 JUDGMENT CALL |
| Q160 | AA1-12 CONSISTENT; AA1-28 JUDGMENT CALL |
| Q161 | AA1-20 SHOULD CHANGE |
| Q162 | AA1-26 SHOULD CHANGE; AA1-29 JUDGMENT CALL |
| Q163 | AA1-25 JUDGMENT CALL |
| Q164 | AA1-33 SHOULD CHANGE |
| Q165 | AA1-30 SHOULD CHANGE; AA1-45 SHOULD CHANGE |
| Q166 | AA1-26 SHOULD CHANGE |
| Q167 | AA1-29 JUDGMENT CALL; AA1-32 SHOULD CHANGE; AA1-41 CONSISTENT |
| Q168 | AA1-46 CONSISTENT |
| Q169 | AA1-22 ACCEPTABLE SIMPLIFICATION; AA1-46 CONSISTENT |
| Q170 | AA1-02 ACCEPTABLE SIMPLIFICATION |
| Q171 | AA1-14 CONSISTENT |
| Q172 | AA1-23 SHOULD CHANGE; AA1-31 SHOULD CHANGE |
| Q173 | Process/implementation: no independent model premise |
| Q174 | Process/implementation: no independent model premise |
| Q175 | AA1-39 SHOULD CHANGE |
| Q176 | AA1-26 SHOULD CHANGE |
| Q177 | AA1-32 SHOULD CHANGE |
| Q178 | AA1-39 SHOULD CHANGE |
| Q179 | AA1-32 SHOULD CHANGE |
| Q180 | Process/implementation: no independent model premise |
| Q181 | Process/implementation: no independent model premise |

The process/implementation rows include generator design, schema validation, build/worker wiring, audit handoffs, corpus captures and repairs. Their underlying *financial rule*, when one was named, is assigned above to its substantive question or assumption section. Q9–Q11's unexposed refinance/ARM policies are reviewed at AA1-47. Q175's survivor-cost decision is audited at AA1-39 even though the Q entry also routes repair work. The nine RB entries below are separate from the numbered Q series. The brief refers to ten RB entries, but only RB-01 through RB-09 occur in `SPRINT_QUESTIONS.md` at this commit; no RB-10 could be audited.

### Review-board and S2 closure coverage

| Item | Verdict and audit disposition |
|---|---|
| RB-01 duplicate account IDs; RB-02 cash holding contract | CONSISTENT as repaired input-contract decisions; see S2 register and [CFP Board's requirement for reliable information](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct). These are validation rules rather than independent household assumptions. |
| RB-03–RB-08 mortgage-versus-investing findings | CONSISTENT as exclusions (AA1-43); not a claim that their financial rules are correct. No live recommendation may rely on this module. |
| RB-09 schema drift protection | CONSISTENT as a repaired process control (AA1-43); no household finance premise. |
| S2 closure: 47 repaired, P5-02 partially qualified, 11 P19 excluded | CONSISTENT as dispositions (AA1-43); the S2 closeout itself says this is not whole-model certification. |
| S2 carried U1 (RMD transfer credit), U2 (transfer pairings) | CONSISTENT for the later documented R15/R29–R32 rule resolution (AA1-14/AA1-27); the historical carried register should not be read as proof these remain unrepaired. |
| S2 carried U3–U4; BC-01/BC-02; C2/C3 | Process/implementation; no separate modelling verdict. The S2 and later S5 records govern their status. |
| S2 carried U5 150-year debt cap | ACCEPTABLE SIMPLIFICATION: a protective software ceiling above realistic loan terms, [CFPB mortgage guidance](https://www.consumerfinance.gov/owning-a-home/loan-estimate/) supplies the consumer context. A 151-year entered term is refused, with no realistic household loss; S scope for disclosure, high confidence. This is an ancillary convention under AA1-06, not another counted group. |
| S2 carried U6 account-split Monte Carlo | SHOULD CHANGE, AA1-24; explicit disclosure does not make the probability invariant to irrelevant account count. |

### Planned R45 rule coverage

| R45 rule | Verdict and finding |
|---:|---|
| 1 — distinct spouse retirement age, fallback | CONSISTENT with household-specific timing; [CFP Board standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct). The fallback preserves the old convention. |
| 2 — first earning stop starts household costs and remaining net pay funds them | JUDGMENT CALL, AA1-38. |
| 3 — non-earner stop ignored | JUDGMENT CALL, AA1-38; reasonable as an employment-cost anchor, but it cannot infer that a non-earner's care or household costs stay unchanged. |
| 4 — death counts as stop on either side | SHOULD CHANGE, AA1-39. |
| 5 — costs, strategy balance, debt/housing, conversions and reserve share household date | SHOULD CHANGE, AA1-38/AA1-40; especially conversion and health dates. |
| 6 — each person's wages, contributions, earnings test, Rule of 55 and vesting use own date | CONSISTENT with [IRS early distribution rules](https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-exceptions-to-tax-on-early-distributions) and [SSA earnings-test policy](https://www.ssa.gov/benefits/retirement/planner/whileworking.html). |
| 7 — LTC/pension/glide/bond tent/dividends stay on primary age | JUDGMENT CALL, AA1-37/AA1-40; the pension must actually be primary-owned. |
| 8 — past-retirement warning only with salary | CONSISTENT as an input-consistency warning under [CFP Board standards](https://www.cfp.net/ethics/code-of-ethics-and-standards-of-conduct). |

### 2026 rules-package figure check

I inventoried **48 structured `provision_id` records** in the embedded JSON and compared **19 figure families** below, including every ordinary and capital-gain bracket/threshold schedule and the limits and thresholds the model advertises. A family may contain several scalar entries. Values are at `src/app-shell.html`, `<script id="v2b-rules-2026">`; this table is a source-to-package comparison, not a runtime test. `C` denotes AA1-41 CONSISTENT; `U` denotes AA1-42 UNVERIFIED. The package's 7 SALT parameter records are *recorded but unused*, so their presence does not create an itemization path (AA1-09). The 1959 RMD start age is tagged `PROPOSED_REGULATION`, not official final guidance.

| # | Compared figures in package | Primary authority | Verdict |
|---:|---|---|---|
| 1 | 2026 ordinary brackets: single $12,400/$50,400/$105,700/$201,775/$256,225/$640,600; joint $24,800/$100,800/$211,400/$403,550/$512,450/$768,700; HOH $17,700/$67,450/$105,700/$201,750/$256,200/$640,600; rates 10/12/22/24/32/35/37% | [IRS Rev. Proc. 2025-32](https://www.irs.gov/irb/2025-45_IRB#REV-PROC-2025-32) | C |
| 2 | Long-term gain 0/15/20% thresholds: single $49,450/$545,500; joint $98,900/$613,700; HOH $66,200/$579,600 | [IRS Rev. Proc. 2025-32](https://www.irs.gov/irb/2025-45_IRB#REV-PROC-2025-32) | C |
| 3 | Basic standard deductions $16,100/$32,200/$24,150, additional aged $1,650 or $2,050 unmarried non-survivor | [IRS Rev. Proc. 2025-32](https://www.irs.gov/irb/2025-45_IRB#REV-PROC-2025-32) | C |
| 4 | Enhanced senior $6,000 each, MAGI $75,000/$150,000, 6% phaseout, expiration after 2028 | [IRS senior deduction](https://www.irs.gov/newsroom/check-your-eligibility-for-the-new-enhanced-deduction-for-seniors) | C as metadata; application SHOULD CHANGE, AA1-30 |
| 5 | NIIT 3.8%, MAGI $200,000/$250,000; Additional Medicare 0.9%, wages $200,000/$250,000; employee OASDI 6.2%, Medicare 1.45% | [IRS NIIT](https://www.irs.gov/individuals/net-investment-income-tax), [SSA 2026 facts](https://www.ssa.gov/cola/factsheets/2026.html) | C |
| 6 | Social Security income-tax base $25,000/$32,000, upper $34,000/$44,000, maximum 85%; $3,000 capital-loss offset is fixed in the engine | [IRS Publication 915](https://www.irs.gov/publications/p915), [IRS Publication 550](https://www.irs.gov/publications/p550) | C |
| 7 | QBI 20%, thresholds $201,750/$403,500, phase ranges $75,000/$150,000, minimum $400 for at least $1,000 QBI | [IRS Rev. Proc. 2025-32](https://www.irs.gov/irb/2025-45_IRB#REV-PROC-2025-32), [IRS QBI](https://www.irs.gov/newsroom/qualified-business-income-deduction) | C as figures; calculation SHOULD CHANGE, AA1-45 |
| 8 | IRA $7,500 plus $1,100 catch-up; Roth MAGI phaseouts single $153,000–168,000, joint $242,000–252,000 | [IRS Notice 2025-67](https://www.irs.gov/irb/2025-49_IRB) | C |
| 9 | Traditional IRA deduction phaseouts single/HOH $81,000–91,000, joint active $129,000–149,000, spouse-only active $242,000–252,000 | [IRS Notice 2025-67](https://www.irs.gov/irb/2025-49_IRB) | C |
| 10 | Workplace $24,500 deferral, $8,000 catch-up, ages 60–63 $11,250, $72,000 total additions, $360,000 compensation, $150,000 prior-year Roth-catch-up wage threshold | [IRS Notice 2025-67](https://www.irs.gov/irb/2025-49_IRB) | C as figures; application SHOULD CHANGE, AA1-13 |
| 11 | HSA $4,400/$8,750, $1,000 catch-up, HDHP deductible $1,700/$3,400 and out-of-pocket ceiling $8,500/$17,000, nonqualified additional tax 20% | [IRS Rev. Proc. 2025-19](https://www.irs.gov/irb/2025-21_IRB), [IRS Publication 969](https://www.irs.gov/publications/p969) | C as figures; eligibility SHOULD CHANGE, AA1-32 |
| 12 | QCD annual $111,000, split-interest sublimit $55,000; RMD start cohorts 70½/72/73/75 and age 70½ QCD eligibility | [IRS Notice 2025-67](https://www.irs.gov/irb/2025-49_IRB), [IRS Publication 590-B](https://www.irs.gov/publications/p590b) | C except 1959 cohort remains proposed, see below |
| 13 | Uniform Lifetime divisors sampled at ages 73, 75, 100 and 120 (26.5, 24.6, 6.4, 2.0); joint table not rekeyed cell by cell | [IRS Publication 590-B Appendix B](https://www.irs.gov/publications/p590b) | C for sample; unchecked cells listed below |
| 14 | SSA COLA 2.8%, taxable wage base $184,500, coverage quarter $1,890, earnings-test $24,480/$65,160, PIA bends $1,286/$7,749 | [SSA 2026 fact sheet](https://www.ssa.gov/cola/factsheets/2026.html), [SSA PIA formula](https://www.ssa.gov/oact/cola/piaformula.html) | C |
| 15 | Survivor earliest 60, minimum 71.5%, deceased early-claim cap 82.5% | [SSA survivor benefits](https://www.ssa.gov/benefits/survivors/survivorchartred.html), [SSA POMS RS 00615.320](https://secure.ssa.gov/poms.nsf/lnx/0300615320) | C for values; individual benefit remains a simplification, AA1-28 |
| 16 | Medicare Part B $202.90, deductible $283, Part D base $38.99; IRMAA single $109k/$137k/$171k/$205k/$500k, joint $218k/$274k/$342k/$410k/$750k; B monthly $202.90/$284.10/$405.80/$527.50/$649.20/$689.90; D surcharge $0/$14.50/$37.50/$60.40/$83.30/$91 | [CMS Part B/IRMAA](https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles), [CMS Part D base](https://www.cms.gov/files/document/july-28-2025-parts-c-d-announcement.pdf) | C as figures; application SHOULD CHANGE, AA1-11/AA1-23 |
| 17 | Arizona 2.5%, basic $16,100/$24,150/$32,200 inferred, age exemption $2,100, full Social Security subtraction | [Arizona 140ES](https://azdor.gov/sites/default/files/document/FORMS_INDIVIDUAL_2026_140ESBooklet.pdf), [2026 Chapter 140](https://www.azleg.gov/legtext/57Leg/2R/laws/0140.pdf), [A.R.S. §43-1022](https://www.azleg.gov/ars/43/01022.htm), [§43-1023](https://www.azleg.gov/ars/43/01023.htm) | C for enacted elements; U for final Form 140 mechanics, AA1-42 |
| 18 | SSA own-claim earliest 62, latest 70, FRA 67 for 1960+ births; first 36 early months 5/9 of 1% per month, later months 5/12 of 1%, delayed credit 8% yearly | [SSA retirement-age benefit reduction](https://www.ssa.gov/oact/quickcalc/early_late.html), [SSA full retirement age](https://www.ssa.gov/benefits/retirement/planner/ageincrease.html) | C for published parameters; simplified claim estimate AA1-28 |
| 19 | Self-employment net-earnings factor 92.35%, OASDI 12.4%, Medicare 2.9%, $400 net-earnings floor | [IRS Schedule SE instructions](https://www.irs.gov/instructions/i1040sse), [SSA tax rates](https://www.ssa.gov/cola/factsheets/2026.html) | C for published parameters; compensation/QBI applications AA1-26/AA1-45 |

The **1959 birth cohort** deserves explicit provenance: the package labels age 73 `PROPOSED_REGULATION` because SECURE 2.0's text overlaps cohorts and Treasury reserved the issue in final regulations. [IRS RMD regulations](https://www.irs.gov/irb/2024-33_IRB) and [subsequent IRS regulatory timing](https://www.irs.gov/irb/2025-02_IRB) support retaining a provisional label, not stating age 73 as an unqualified final rule. Its value was reviewed as provisional; a final cohort rule remains unchecked. The SALT cap records ($40,400/$20,200; phaseout $505,000/$252,500; 30% rate, $10,000/$5,000 floor) were compared to [Public Law 119-21](https://www.govinfo.gov/content/pkg/PLAW-119publ21/pdf/PLAW-119publ21.pdf) only as inactive provenance. Their use is blocked by missing itemization (AA1-09).

## Disagreement with earlier dispositions

- S2 U6 and Q133 chose “disclose now, replace in the engine rebuild.” This audit agrees the disclosure is accurate but judges the present Monte Carlo *probability* materially misleading, because account count alone moves it. AA1-24 recommends treating that metric as unqualified until shared shocks exist. This does not reopen R44.1's administrative GO.
- Q177/Q179 treat age 65 as a sufficient HSA contribution stop and were recorded as closed. [Publication 969](https://www.irs.gov/publications/p969) ties eligibility to Medicare enrollment and HDHP coverage; AA1-32 therefore reaches a different *assumption* verdict without disputing that the code follows the owner decision.
- Q165's explicit decision to keep the enhanced senior deduction after 2028 is contrary to the current statutory window. AA1-30 is a law finding, not a code defect; the rules metadata itself records the sunset.
- Earlier §16 treats the narrow Arizona return as a disclosed scope limit. Because the omitted subtractions apply directly to supported senior and taxable-investment households, AA1-16 recommends either modelling them or surfacing a result-level estimate limitation.
- R44.1 accepted change-audit and administrative criteria. It did not adjudicate every financial premise. No R44.1 result is treated here as a release certification or GO/NO-GO reversal.

## What was not verified

1. Final 2026 Arizona Form 140 and instructions were not located as published at the audit date. Chapter 140 and current statutory text support the inferred values, but a form-level reconciliation is still needed (AA1-42).
2. The 1959 RMD cohort's final Treasury disposition was not confirmed; the package appropriately marks the rule proposed. A future final regulation can change the result for that cohort.
3. The entire Uniform Lifetime and Joint and Last Survivor divisor matrices were not rekeyed cell by cell; the listed ages were sampled against IRS Publication 590-B. This is the boundary of the figure check, not a positive finding against the matrix.
4. I did not construct household tax returns, obtain an SSA earnings record, a Medicare Part D plan quote, mortgage note, beneficiary designation, property-character documents, or employer vesting/HDHP records. The conditional examples above illustrate direction and scale; actual household figures require those facts.
5. `SPRINT_QUESTIONS.md` has RB-01 through RB-09; the brief's tenth RB entry was absent at the audited commit. I did not infer its content.

## Empirical follow-up: 30 household families and account partitions

30 household families and 150 primary batches reproduce materially incorrect account-dependent risk; reserve sizing also changes deterministic results, and an invalid correlation setting silently becomes zero risk. No essential accounting or numerical invariant failed in the exercised batches.

Audited engine: `9327bf6520457ddc2035f0ebaa859e1d16f48202`; engine SHA-256: `8b7ad07e8a1c4fd2fc23378bcfa36132118ef62a9d87c1941c257653e36bcd24`. The report branch contains an earlier documentation-only commit; engine and rules remain those of the audited commit. These are synthetic scenarios, not forecasts or household recommendations.

### Method and coverage

- Run the shipped `runPlan()` Monte Carlo engine. A separately compiled, unchanged source with two read-only observation hooks captures first-period balance-weighted rates and path summaries. Four small batches returned exactly the same complete results as the uninstrumented engine. Twenty-four saved paths were also rerun directly through uninstrumented `simulatePlan()`, with exact matching terminal wealth, tax totals, failures and first-shortfall ages.
- 30 families × 5 partitions × 1,000 paths = **150,000 primary paths**. Partitions contain 1, 2, 5, 10 or 20 accounts **per original sleeve**, giving **1–80 total accounts**. Each sleeve preserves account type, owner, holdings, aggregate balance, basis dollars and contributions. Maximum checked input-dollar drift: 0.
- **128,000 supplemental paths**, including three additional seeds for five families; unequal 95/5 and 50/20/15/10/5 partitions; rename, repeat, ordering and empty-account checks; default spending flexibility; fifteen 5,000-path one-year distributions; RMD-enabled pretax comparisons; allocation-equivalence and correlation probes. Total: **218 Monte Carlo batches / 278,000 paths**, plus 65 deterministic control paths. Small instrumentation-equivalence runs and the 24 direct verification paths are excluded from that headline count.
- Six input account types: taxable brokerage, traditional IRA, traditional 401(k), Roth IRA, Roth 401(k), and HSA. RMD scenarios also exercise engine-generated taxable holdings. Tax classes cover taxable, pretax, Roth and HSA. Single and joint filing; balances $250,000–$5 million; starting annual portfolio spending $0–$100,000; initial spending rates 0–9%; horizons 5, 30 and 40 years.
- Asset assumptions: stocks 7% mean / 20% volatility; bonds 3.5% / 6%; cash 3% / 1%; international stocks 7% / 22%; REITs 6% / 18%. Within-account cross-asset correlation = 0.25. These values are test inputs, deliberately held constant rather than validated capital-market forecasts. MC16 raises stock volatility to 35%; MC01/02 set cash volatility to zero. Holdings use the engine's asset-class interface, not individual security prices.
- Default age/retirement age 65, terminal age 95, 2.5% fixed inflation, no fees, no employment, contributions, Social Security, pensions, debts, health expenses, LTC, conversions or transfers. Life ages 120 keep the entered projection horizon active. MC21 starts and retires at 55 and ends at 95 (early Roth draws trigger the engine's UNSUPPORTED_ROTH_ORDERING warning, so its tax treatment is a disclosed limitation); MC26 starts at 55, retires at 65 and ends at 95. MC22 uses 4.5% inflation and 1% fee. MC12/30 are married; all input accounts belong to self to avoid an owner-change confound.
- Spending is fixed real with **flexibility = 0** except MC27/28, which use guardrails/Guyton with the default 10% down-year cut, a 60%-of-initial-real-spend floor and 150% ceiling. MC29 uses constant percentage, no flexibility. Manual tax-class order taxable → pretax → Roth → HSA avoids mixing the withdrawal optimizer question into the primary test. RMDs are enabled for MC12/13/14/24/28/30; disabled in isolated pretax MC05/09, with explicit RMD-enabled follow-ups below. MC06 HSA qualified-medical share = 50%; MC14 HSA uses the engine default 100%. MC08 taxable basis = 30%; other taxable inputs have 100% basis. Dividend payouts are disabled and dividendYield is explicitly zero; the engine's separately disclosed imputed 1.5% taxable yield remains applicable. No tax-law accuracy claim follows from these simulations.
- MC12/24 wrapper balance shares taxable/IRA/Roth = 20/50/30; MC13 taxable/traditional401k/Roth401k = 40/40/20; MC14 taxable/IRA/Roth/HSA = 35/35/25/5; MC26 taxable/Roth = 50/50; MC28 taxable/traditional401k/Roth401k = 30/40/30; MC30 taxable stock / IRA bond / Roth cash = 50/40/10. Other families have one original sleeve.
- Seed = 42791. Additional seeds = 19073, 880301, 20261003. Public engine path-seeding is reused. Changing account count consumes different RNG draws, so matching seeds are **not matching annual market paths**; success comparisons are distribution comparisons, not paired-path statistical tests. Wilson 95% intervals are stored for every ordinary Monte Carlo batch. At 1,000 paths, the worst-case single-rate sampling margin is approximately 3.1 percentage points; do not interpret the displayed tenth of a point as forecast precision.

### Findings

#### MC-A — Identical holdings receive independent shocks — SHOULD CHANGE, L, high confidence

`accountReturnForPeriod()` (engine line 3695) draws one independent normal shock per account; the account mapping is at line 4114. The correlation input affects `accountVolatility()` within an account (line 2274), but does not correlate the realized returns of separate accounts. Tax wrappers and record partitions are treated as different economic exposures.

For identical holdings with weights `w_i`, the engine's opening portfolio volatility is `sigma * sqrt(sum(w_i²))`; shared identical holdings should remain `sigma` because their pairwise correlation is 1. Equal splits give `sigma/sqrt(n)`. This follows the portfolio covariance identity described in [Markowitz's Nobel lecture](https://www.nobelprize.org/uploads/2018/06/markowitz-lecture.pdf): portfolio variance includes covariance terms. It is a mathematical modeling principle, not a tax-law question.

In the 5,000-path one-year equity experiment, measured volatility falls **19.68% → 4.46%** when one account becomes twenty, close to the erroneous theoretical 20%/√20 = 4.47%. The mean remains about 7%, so the narrower distribution is caused by omitted covariance, not lower requested risk or lower mean return. The 60/40 experiment falls **12.61% → 2.86%**, despite unchanged aggregate holdings.

MC03 ($1 million Roth equity, $40,000 initial spending, 30 years) reports success **59.8% → 99.2%**, a **39.4 percentage-point increase**. Median terminal nominal wealth rises **$527,065 → $2,256,435**. Baseline Wilson intervals are 56.7%–62.8% and 98.4%–99.6%. Across all four seeds, one-account success is 57.1–60.4%, while twenty-account success is 98.6–99.6%. This is materially larger than sampling noise.

Unequal splits behave as the incorrect balance-weighted formula predicts. With 95/5 shares, measured equity risk is 18.38% and success 61.9%; with 50/20/15/10/5 shares, risk is 11.19% and success 86.3%. The artificial diversification depends on balance distribution, not merely the account counter. For different sleeve holdings, the model can additionally lose cross-asset correlation: a single 60/40 Roth account theoretically has 12.8125% volatility at rho 0.25, whereas separate stock and bond Roth accounts receive independent returns and theoretically have 12.2376%. The measured 1,000-path values are 12.39% and 11.81%; the analytic formula, rather than this small sample difference, establishes the omission.

**Recommendation:** generate one vector of correlated asset-class shocks per path and year; apply each account's allocation to that vector, including cross-wrapper identical exposures. Test partition equivalence on the same class shocks before tax settlement, and for ordinary identical tax/owner sleeves through settlement. Account-level genuinely independent risk, if desired, requires a separate explicit input. Scope L: RNG contract, returns, asset covariance, fixtures and Worker parity.

#### MC-B — Reserve fraction changes with account partition — SHOULD CHANGE, M, high confidence

The reserve rule (line 3695) computes `min(account.balance, household annual spending × reserveYears) / household portfolioTotal` for **each account's** blend toward a 3% return. A $1 million portfolio with $40,000 spending and three reserve years should retain a 12% household reserve under the stated interpretation. One account gets a 12% blend; twenty $50,000 accounts each get a 5% blend. With equal account weights this is an effective 5% household blend, not 12%.

The direct deterministic rate is **6.52% in one account versus 6.80% in twenty** (equity mean 7%, reserve return 3%). An actual one-year deterministic projection ends at **$1,023,916.59 versus $1,026,662.37**, a $2,745.78 difference after the same monthly-timed $40,000 spending. The 30-year deterministic reserve controls differ by **$190,597** for Roth equity and **$221,359** for the mixed 60/40 household. The latter's cumulative taxes also differ by **$5,009**. Twenty-eight of thirty deterministic controls agree within one cent; these two reserve cases fail the partition check. This is independent of random sampling.

**Recommendation:** compute the household reserve amount once and allocate reserve dollars across accounts using an explicit policy; use each account's assigned reserve divided by that account's balance when blending its return. Preserve the total assigned reserve and avoid double allocation. Scope M if the current blend convention is retained; L for an actual cash sleeve and liquidation policy. This expands AA1-24/Q66 with measured evidence.

#### MC-C — Impossible covariance silently becomes zero risk — SHOULD CHANGE, M, high confidence

Five equal asset allocations, each with 20% volatility, accept a constant pairwise correlation of −0.5. The implied correlation matrix has eigenvalues **−1, 1.5, 1.5, 1.5, 1.5**, so it cannot be a covariance/correlation matrix. The calculated portfolio variance is `0.20² × [1/5 + (4/5) × (−0.5)] = −0.008`. `Math.sqrt(Math.max(0,variance))` silently yields zero rather than refusing the invalid assumptions.

The uninstrumented public engine returns **status ok**, no issues, and identical one-year q10/median/q90 of **$1,070,000** on a $1 million no-spending plan. It presents five individually volatile assets as certain 7% growth. For five active classes, an equicorrelation matrix requires rho ≥ −1/(5−1) = −0.25. At −0.25, zero portfolio variance for these exactly equal inputs is a mathematically valid boundary; that control is distinct from the invalid −0.5 case.

**Recommendation:** validate covariance feasibility for active classes; refuse impossible matrices with a usable diagnostic. Only tiny negative roundoff near zero should be clamped. Scope M: input gate, covariance calculation and precise boundary controls. Q45/AA1-24 already identifies covariance limits; this is the executable failure size.

#### MC-D — Input order and empty accounts shift seeded outcomes — SHOULD CHANGE for reproducibility, M, high confidence

MC12 repeats and account renames return exactly identical metrics and all retained path summaries. Reversing the account array, with economic inputs and priorities preserved, changes success **69.8% → 71.4%**. Adding an empty Roth account changes it to **72.2%**, and median terminal wealth changes **$1,579,967 → $1,748,933**. These differences are compatible with sample variation; they are **not evidence of a systematic economic gain** from an empty account. They demonstrate that unused and reordered records consume/assign market draws differently and defeat common-random-path comparisons.

**Recommendation:** key shocks to the economic exposure and period, using a canonical asset-class list; keep empty record creation and tax-routing bookkeeping from shifting the market stream. Fold this into MC-A's repair. Reported same-seed account comparisons must not be described as identical market paths until that contract is fixed.

#### MC-E — Success is not a constant-lifestyle probability — JUDGMENT CALL for the metric; SHOULD CHANGE if presented as lifestyle adequacy, M, high confidence

The failure criterion is any modeled spending/tax shortfall exceeding one cent (line 4548), not an externally fixed desired-income floor. MC29 spends 9% of the current portfolio annually, so the target shrinks with assets. It reports **100% success** in every tested seed and partition. With one account, median final-year requested spending is **$6,375.73 nominal**, about **$3,040 in starting purchasing power**, compared with $22,500 initially: an approximately **86.5% real lifestyle decline**, despite 100% success. Guardrails and Guyton also change the amount requested; their success numbers cannot be compared to fixed spending as though the lifestyle promise were equal.

Separately, default flexibility can lower spending by 10% after a negative prior-period return even when `strategy = fixedReal`. Enabling it in MC03 changes one-account success **59.8% → 62.7%**. That is a declared spending policy, not an arithmetic error; it needs to appear in the probability's meaning. The primary fixed-spending matrix explicitly turns it off.

**Recommendation:** display the criterion as “all modeled obligations funded,” alongside real spending distributions, shortfall amounts and a user-entered minimum real lifestyle threshold. Distinguish adaptive-spending success from maintaining a fixed target. Scope M: outcome summaries and presentation; no need to redefine depletion silently.

### Direction and limits of the distortion

Twenty-account partitions increase success in **20** families, decrease it in **4**, and leave it unchanged in **6**. The maximum increase is MC21, **45.4 points** (subject to its unsupported early-Roth tax treatment); the largest decrease is MC13, **-23.4 points**. Suppressed risk can remove favorable tail outcomes from an underfunded plan: MC17 falls **8.7% → 0.3%** and does so under every follow-up seed. This rejects the blanket assumption that the error always makes success look better.

These counts describe observed point estimates, not thirty separate claims of statistical significance; MC16's 0.8-point increase, for example, is within ordinary sampling uncertainty. An unchanged success rate does not prove invariance. MC19, with no withdrawals, stays at 100% while median terminal wealth moves **$4,304,688 → $7,234,531**. Long-horizon values include evolving independent account balances and account-level withdrawal selection; the initial sigma/√n formula describes opening risk, not a claim that constant equal account weights are maintained for thirty years.

All primary batches retain 1,000 valid paths. No essential ledger/numerical invariant or ordinary calculation error is reported. Twenty-seven existing return-generation, RNG-seeding and Monte Carlo-invariant tests pass. Those tests verify the implemented formulas and guards; their passing does not validate the financial independence assumption. The deterministic controls strongly localize the split-only systematic return difference to the reserve feature in these cases. This audit does not establish full tax-law correctness, calibration to actual securities, optimization correctness or safety for household reliance.

### Thirty-family result matrix

“n” means accounts per original sleeve; a three-sleeve household has 3n accounts. Success figures are percentages. Δ compares n=20 with n=1. Initial spending is before inflation; MC26's first retired spending is further inflated by its ten-year wait.

| ID | Holdings / household variation | Opening assets | Initial spend | Years | Original sleeves | n=1 | n=2 | n=5 | n=10 | n=20 | Δ points |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| MC01 | Zero-volatility cash, Roth | $1,000,000 | $40,000 | 30 | 1 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| MC02 | Zero-volatility cash, taxable | $1,000,000 | $40,000 | 30 | 1 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| MC03 | Equity, Roth, 4% spending | $1,000,000 | $40,000 | 30 | 1 | 59.8 | 70.7 | 85.5 | 95.1 | 99.2 | 39.4 |
| MC04 | Equity, taxable, full basis | $1,000,000 | $40,000 | 30 | 1 | 59.7 | 70.4 | 85.2 | 95.0 | 99.2 | 39.5 |
| MC05 | Equity, traditional IRA | $1,000,000 | $40,000 | 30 | 1 | 54.9 | 64.2 | 78.7 | 91.2 | 96.9 | 42.0 |
| MC06 | Equity, HSA, 50% qualified draws | $1,000,000 | $40,000 | 30 | 1 | 59.7 | 70.5 | 85.3 | 95.0 | 99.2 | 39.5 |
| MC07 | 60/40, Roth | $1,000,000 | $40,000 | 30 | 1 | 65.1 | 72.4 | 86.5 | 94.8 | 99.0 | 33.9 |
| MC08 | 60/40, taxable, 30% basis | $1,000,000 | $40,000 | 30 | 1 | 63.9 | 71.0 | 85.5 | 94.1 | 98.2 | 34.3 |
| MC09 | 60/40, traditional 401(k) | $1,000,000 | $40,000 | 30 | 1 | 56.9 | 64.8 | 74.8 | 87.2 | 94.8 | 37.9 |
| MC10 | Bonds, Roth, 5% spending | $500,000 | $25,000 | 30 | 1 | 4.0 | 1.6 | 0.4 | 0.0 | 0.0 | -4.0 |
| MC11 | Cash, Roth, small household | $250,000 | $10,000 | 30 | 1 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| MC12 | 80/20, three tax classes, joint | $2,000,000 | $80,000 | 30 | 3 | 69.8 | 83.3 | 95.5 | 99.3 | 100.0 | 30.2 |
| MC13 | 40/60, three tax classes, 5% | $500,000 | $25,000 | 30 | 3 | 26.7 | 24.3 | 17.3 | 10.2 | 3.3 | -23.4 |
| MC14 | Five assets, four tax classes | $2,000,000 | $80,000 | 30 | 4 | 85.6 | 93.5 | 99.0 | 99.9 | 100.0 | 14.4 |
| MC15 | US/international equity, Roth | $750,000 | $37,500 | 30 | 1 | 50.4 | 57.7 | 67.3 | 79.9 | 89.9 | 39.5 |
| MC16 | 35% volatility, 7% spending | $250,000 | $17,500 | 30 | 1 | 14.2 | 15.5 | 15.0 | 16.7 | 15.0 | 0.8 |
| MC17 | Underfunded equity, 9% spending | $250,000 | $22,500 | 30 | 1 | 8.7 | 5.9 | 3.0 | 1.5 | 0.3 | -8.4 |
| MC18 | Equity, wealthy, 2% spending | $5,000,000 | $100,000 | 30 | 1 | 90.2 | 97.2 | 100.0 | 100.0 | 100.0 | 9.8 |
| MC19 | Equity, no withdrawals | $1,000,000 | $0 | 30 | 1 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 0.0 |
| MC20 | Equity, five-year horizon | $1,000,000 | $40,000 | 5 | 1 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 0.0 |
| MC21 | Equity, forty-year horizon | $2,000,000 | $80,000 | 40 | 1 | 45.4 | 53.5 | 66.3 | 80.5 | 90.8 | 45.4 |
| MC22 | 60/40, 1% fee, 4.5% inflation | $1,000,000 | $40,000 | 30 | 1 | 22.7 | 21.4 | 16.2 | 11.9 | 6.4 | -16.3 |
| MC23 | Equity, three-year cash reserve | $1,000,000 | $40,000 | 30 | 1 | 58.0 | 68.1 | 85.3 | 94.5 | 99.3 | 41.3 |
| MC24 | 60/40 mixed wrappers, cash reserve | $1,000,000 | $40,000 | 30 | 3 | 65.7 | 78.2 | 92.7 | 98.5 | 100.0 | 34.3 |
| MC25 | Equity with bond tent | $1,000,000 | $40,000 | 30 | 1 | 62.3 | 70.6 | 86.1 | 95.7 | 99.3 | 37.0 |
| MC26 | 80/20 with ten-year glide | $1,000,000 | $40,000 | 40 | 2 | 69.9 | 79.4 | 92.0 | 98.0 | 99.9 | 30.0 |
| MC27 | Equity with guardrails | $1,000,000 | $50,000 | 30 | 1 | 69.2 | 78.7 | 94.5 | 98.6 | 100.0 | 30.8 |
| MC28 | 60/40 mixed wrappers, Guyton | $1,000,000 | $50,000 | 30 | 3 | 91.4 | 97.8 | 100.0 | 100.0 | 100.0 | 8.6 |
| MC29 | Equity, 9% constant percentage | $250,000 | $22,500 | 30 | 1 | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 | 0.0 |
| MC30 | Separate stock/bond/cash sleeves | $2,000,000 | $80,000 | 30 | 3 | 49.5 | 51.5 | 65.0 | 77.2 | 82.9 | 33.4 |

#### Terminal nominal wealth and taxes, all families

Median values are separate marginal medians, not a single realizable path. Do not add separately aggregated tax-class medians or reconcile median rows as though they were one household ledger.

| ID | Wealth n=1 | Wealth n=20 | Wealth q10 n=1 | Wealth q10 n=20 | Wealth q90 n=1 | Wealth q90 n=20 | Lifetime taxes n=1 | Lifetime taxes n=20 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| MC01 | $0 | $0 | $0 | $0 | $0 | $0 | $0 | $0 |
| MC02 | $0 | $0 | $0 | $0 | $0 | $0 | $0 | $0 |
| MC03 | $527,065 | $2,256,435 | $0 | $810,445 | $7,858,162 | $4,520,647 | $0 | $0 |
| MC04 | $515,161 | $2,199,830 | $0 | $797,201 | $7,702,580 | $4,468,299 | $9,711 | $19,309 |
| MC05 | $287,858 | $1,900,865 | $0 | $486,894 | $7,401,410 | $4,118,461 | $126,127 | $126,127 |
| MC06 | $522,989 | $2,243,518 | $0 | $805,517 | $7,850,589 | $4,513,640 | $2,758 | $2,758 |
| MC07 | $486,073 | $1,055,493 | $0 | $404,204 | $3,650,131 | $1,915,549 | $0 | $0 |
| MC08 | $443,643 | $993,948 | $0 | $358,335 | $3,537,291 | $1,851,226 | $21,376 | $24,855 |
| MC09 | $242,992 | $771,371 | $0 | $148,063 | $3,266,388 | $1,592,614 | $126,127 | $126,127 |
| MC10 | $0 | $0 | $0 | $0 | $0 | $0 | $0 | $0 |
| MC11 | $0 | $0 | $0 | $0 | $0 | $0 | $0 | $0 |
| MC12 | $1,579,967 | $2,983,726 | $0 | $1,658,115 | $8,872,231 | $4,579,075 | $114,493 | $168,661 |
| MC13 | $0 | $0 | $0 | $0 | $307,284 | $0 | $6,317 | $7,513 |
| MC14 | $1,432,729 | $1,754,171 | $0 | $1,184,188 | $4,261,251 | $2,368,586 | $194,348 | $226,285 |
| MC15 | $7,625 | $825,713 | $0 | $0 | $4,118,161 | $2,048,131 | $0 | $0 |
| MC16 | $0 | $0 | $0 | $0 | $384,867 | $183,101 | $0 | $0 |
| MC17 | $0 | $0 | $0 | $0 | $0 | $0 | $0 | $0 |
| MC18 | $11,789,916 | $24,059,909 | $23,909 | $15,048,390 | $62,529,354 | $37,360,306 | $0 | $0 |
| MC19 | $4,304,688 | $7,234,531 | $1,054,935 | $5,105,105 | $16,970,303 | $10,448,511 | $0 | $0 |
| MC20 | $1,063,287 | $1,148,524 | $542,217 | $997,399 | $1,902,471 | $1,323,987 | $0 | $0 |
| MC21 | $0 | $5,354,035 | $0 | $82,779 | $27,058,713 | $15,959,425 | $0 | $0 |
| MC22 | $0 | $0 | $0 | $0 | $1,145,143 | $0 | $0 | $0 |
| MC23 | $342,018 | $1,905,986 | $0 | $685,316 | $6,524,535 | $3,814,807 | $0 | $0 |
| MC24 | $354,318 | $859,754 | $0 | $478,082 | $2,275,912 | $1,280,013 | $54,115 | $68,930 |
| MC25 | $511,001 | $2,012,813 | $0 | $811,734 | $7,097,092 | $4,052,174 | $0 | $0 |
| MC26 | $739,722 | $1,399,029 | $0 | $687,790 | $4,390,925 | $2,362,412 | $2,950 | $7,176 |
| MC27 | $642,838 | $1,536,559 | $0 | $725,537 | $5,102,649 | $2,883,179 | $0 | $0 |
| MC28 | $737,279 | $845,418 | $36,856 | $613,453 | $1,930,362 | $1,085,485 | $39,039 | $51,014 |
| MC29 | $67,305 | $101,088 | $15,228 | $45,003 | $282,617 | $217,991 | $0 | $0 |
| MC30 | $0 | $676,940 | $0 | $0 | $4,079,466 | $2,127,328 | $65,997 | $63,496 |

#### Independent seed replications

Each cell contains success n=1 → n=20, in percent; 1,000 paths per batch.

| Family | 42791 | 19073 | 880301 | 20261003 |
|---|---:|---:|---:|---:|
| MC03 | 59.8 → 99.2 | 60.4 → 98.6 | 57.1 → 99.6 | 59.6 → 99.4 |
| MC07 | 65.1 → 99.0 | 64.3 → 98.5 | 61.9 → 99.6 | 64.3 → 99.3 |
| MC17 | 8.7 → 0.3 | 9.4 → 0.4 | 8.8 → 0.2 | 9.0 → 0.0 |
| MC23 | 58.0 → 99.3 | 58.1 → 99.1 | 56.2 → 99.6 | 57.9 → 99.5 |
| MC29 | 100.0 → 100.0 | 100.0 → 100.0 | 100.0 → 100.0 | 100.0 → 100.0 |

#### RMD-enabled follow-ups

Isolated pretax MC05/09 primary cases deliberately disable RMDs for a tax-wrapper probe. With RMDs enabled, MC05 reports 56.0% → 96.8%, and MC09 57.3% → 95.8%. The account-splitting distortion persists with the mandatory-distribution feature active. These are different modeling cases; do not substitute those values into the primary matrix.

### Reproduction and artifacts

The local experiment bundle contains `run-experiment.cjs`, `diagnostics.cjs`, `verify.cjs`, all 150 full input plans, machine-readable primary and supplemental results, first 30 path summaries for every observed batch, seed data, source hashes and confidence intervals. Run with Node from the experiment folder: `node run-experiment.cjs`, then `node diagnostics.cjs`, then `node verify.cjs`. Source files are never modified. The public report-only PR contains this written evidence rather than personal local paths or generated runtime files.

The following minimal witness can be saved in the repository root as a temporary .cjs file to reproduce the primary equity endpoints without the observation hooks:

```js
const fs = require('node:fs');
const shell = fs.readFileSync('src/app-shell.html', 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require('./tools/capture-baseline.js').installDebtModules();
const engine = require('./src/engine.js');
const base = require('./tests/lib/golden-scenario-defs.js').extractDefaultPlan(shell);
for (const n of [1, 2, 5, 10, 20]) {
  const p = JSON.parse(JSON.stringify(base)); p.setupComplete = true;
  Object.assign(p.profile, {age:65, retireAge:65, endAge:95, filing:'single', spouseOn:false});
  Object.assign(p.assumptions, {method:'monteCarlo', runs:1000, seed:42791, returnRate:7, volatility:20, inflation:2.5, fee:0});
  Object.assign(p.retirement, {strategy:'fixedReal', spending:40000, withdrawalRate:4, flexibility:0, ssBenefit:0, spouseSS:0, pension:0, selfLife:120, spouseLife:120, dividendOn:false, dividendYield:0, withdrawalOrder:'manual', manualOrder:'taxable,preTax,roth,hsa'});
  Object.assign(p.advanced, {assetsOn:true, correlation:0.25, assetClasses:[{id:'stocks',name:'stocks',returnRate:7,volatility:20}], rmdOn:false});
  p.accounts = Array.from({length:n}, (_,i)=>({id:'a'+i, name:'Roth '+i, type:'rothIRA', taxClass:'roth', owner:'self', balance:1e6/n, basisPct:0, contribution:0, contributionMode:'amount', annualChange:0, annualChangeMode:'amount', frequency:1, changeTiming:'year', futureChanges:[], allocation:{stocks:100}, matchOn:false, matchCap:0, matchRate:0, profitShare:0, vesting:100, priority:i+1}));
  const r = engine.runPlan(p);
  console.log(n, r.successRate, r.rows.at(-1).total, r.calculationError);
}
```

This supplement supplies new measured evidence for AA1-24 and the spending-metric caveat. It does not alter the original 47 rule-group verdict counts or authorize an engine change. The owner decides which recommendations to implement.

## Second empirical follow-up: 60 additional families and 10 stress comparisons

Completed 60 additional household families and ten baseline-versus-stress comparisons, using **404,000 additional Monte Carlo paths**. Account partition still changes modeled risk and success; deterministic controls identify reserve sensitivity and an implicit RMD/basis-pooling policy. No essential accounting/numerical invariant or ordinary calculation error was reported in these runs.

Engine audited: `9327bf6520457ddc2035f0ebaa859e1d16f48202`; SHA-256 `8b7ad07e8a1c4fd2fc23378bcfa36132118ef62a9d87c1941c257653e36bcd24`. Source and embedded rules match the first experiment. This is synthetic engine evidence, not a return forecast, tax-law certification or recommendation for a real household.

### What was run

- **60 new regular families:** 12 allocations × 5 household configurations, IDs MC31–MC90. Each runs 1, 2, 5, 10 and 20 accounts per original sleeve, with 1,000 paths per batch: **300 batches / 300,000 paths**. These are additional input cases, rather than reusing the previous thirty.
- **10 stress comparisons:** each has baseline and stressed plans at both n=1 and n=20, with 2,000 paths per cell: **40 batches / 80,000 paths**. “n” always denotes accounts per original sleeve; the three-sleeve survivor household has 3 and 60 input accounts, while the other stress cases have 1 and 20.
- **Seed replications:** six of the new allocation families (MC31/41/51/61/71/81, all small-Roth configurations), two additional seeds, two partitions: **24 batches / 24,000 paths**. Primary seed 42791; replication seeds 19073 and 20261003. These check allocation sensitivity, not every ownership/feature combination.
- **120 deterministic control paths** compare n=1 and n=20 for every regular family. Six feature-combination batches gave exactly matching complete tapped and uninstrumented results. An additional **104 selected paths** across regular and all stress cells were independently recomputed through the uninstrumented engine; terminal values, tax totals, shortfalls, requested spending and first two closing balances match exactly. Small verification runs are excluded from the 404,000 headline count.
- Across both rounds: **90 regular household families, ten stress comparisons and 682,000 primary/follow-up Monte Carlo paths**. This excludes small reproduction and verification reruns. All 364 new Monte Carlo cells have valid ordinary results and preserve their full path denominator; ordinary depleted households remain valid financial outcomes.
- Nine supported **input** account types now covered: taxable, traditional IRA, traditional 401(k), Roth IRA, Roth 401(k), HSA, custom taxable, custom traditional and custom Roth. 1–80 input accounts, $100,000–$10 million opening assets, self/spouse/joint ownership, manual and optimized ordering, RMDs, dividend payout/reinvestment, nonqualified HSA draws, reserve blends, guardrails and floor/ceiling spending. The engine can create additional retained or RMD accounts during settlement.
- Every partition preserves account type, owner, tax class, allocation, HSA-qualified share, aggregate balance, basis dollars and contributions. No inputs are refused or dropped. Random draws remain assigned per account, so changing n is not a matched annual market-path comparison. Same-seed comparisons are distribution comparisons; seed reuse across cases does not make the sixty families statistically independent observations.
- Wilson 95% intervals accompany every success estimate. At 1,000 paths the maximum single-rate margin is approximately 3.1 percentage points; at 2,000 it is 2.2 points. Small point-estimate differences are not treated as statistically significant. These intervals describe simulation sampling only, not model uncertainty or forecast reliability.

### New input grid

Asset-class mean/volatility assumptions remain stocks 7%/20%, bonds 3.5%/6%, cash 3%/1%, international stocks 7%/22%, REITs 6%/18%. Within-account cross-asset correlation is 0.25; returns are nominal. These are fixed test assumptions. The twelve allocation rows are: 100% stocks; 90/10; 80/20; 70/30; 60/40; 50/50; 40/60; 20/80 stock/bond; 100% bonds; 50/50 US/international stocks; 35/20/25/10/10 stocks/international/bonds/cash/REITs; and 40/30/30 stocks/REITs/bonds.

The five configurations are:

| Configuration | Opening assets / initial spending | Sleeves and balance shares | Horizon and feature variations |
|---|---|---|---|
| A: Small Roth | $100,000 / $4,500 | Roth IRA 100% | Age 65→85; fixed real, no flexibility |
| B: IRA + workplace | $750,000 / $30,000 | Traditional IRA / traditional401k 50/50, self-owned | Age 65→95; RMDs enabled |
| C: Joint, separate owners | $1.5m / $67,500 | Joint taxable 20%, self IRA 50%, spouse Roth IRA 30% | Primary 65, spouse 64; 30 years; allocation row mod 3 selects fixed real, guardrails, or floor/ceiling. Odd allocation rows use optimized order, even rows manual order |
| D: Four tax classes | $3m / $120,000 | Joint taxable 25%, self traditional401k 45%, spouse Roth401k 25%, spouse HSA 5% | Primary 70, spouse 66; 30 years; HSA medical share 25%. Allocation row mod 3 = 0 uses a three-year reserve; = 1 enables 3% dividends with 85% qualified share; = 2 uses neither |
| E: Custom wrappers | $10m / $200,000 | Custom taxable 25%, custom traditional 50%, custom Roth 25%, self-owned | Age 65→100; RMDs on; taxable basis 20%; fee 0.5%; inflation 3.5% |

Allocation rows are indexed from zero. Other cases use 2.5% fixed inflation, zero fee and 100% taxable basis. RMDs are on for B/C/D/E. All accounts within a family hold the same allocation; this is the controlled partition variable. Salaries, contributions, Social Security, pensions, health costs, debts, LTC, conversions and transfers are off in the regular grid. Life ages 120 preserve the entered horizon. Fixed-real and floor/ceiling plans have flexibility zero; guardrails use the inherited 10% down-year cut, 20% upper/lower bands, 10% adjustment, a real floor of 60% and ceiling of 150% of initial spending. No early Roth ordering issue is introduced in this grid because Roth owners are at least 64 at entry. HSA draws assume 25% qualifying expenses where present; this is a test input, not proof that medical expenses exist.

### Findings from the sixty additional families

#### Account-driven diversification persists across wrappers and owners

Among the new n=1 versus n=20 comparisons, success increases in **58**, decreases in **2**, and is unchanged in **0**. The largest increase is **MC48: 40.6 percentage points**; the largest decrease is **MC72: -24.1 points**. These counts describe point estimates, not sixty separate significance tests.

For joint separate owners with all-equity holdings, MC33 reports **59.8% → 99.8%** and median terminal wealth **$720,667 → $2,445,350** when the same three economic sleeves become sixty input accounts. Their owners, tax treatment, aggregate basis and economic allocations are unchanged. For the custom-account equity case, MC35 reports **87.2% → 100.0%**, demonstrating that the defect is not confined to IRA labels.

The largest absolute median-wealth difference is **MC35: $15,300,673**. A high-dollar effect is a consequence of the selected synthetic capital and horizon, not a forecast of an investor's achievable benefit. Opening risk follows the previously demonstrated independent-account covariance formula; later portfolio weights evolve with returns, withdrawals, tax settlement and retained accounts. The [portfolio covariance identity in Markowitz's lecture](https://www.nobelprize.org/uploads/2018/06/markowitz-lecture.pdf) requires identical exposures to share their shocks regardless of account label or owner.

#### Deterministic controls and reserve locality

**8 of 60** deterministic partition pairs differ by more than one cent in terminal wealth or lifetime taxes. Changed cases are MC34, MC45, MC49, MC50, MC64, MC79, MC85, MC90. The table below gives the exact attribution evidence; reserve-enabled cases are checked against their feature definitions, rather than inferring a reserve cause from the Monte Carlo outcome alone.

| Family | n=20 minus n=1 terminal wealth | Difference in lifetime taxes | Reserve enabled |
|---|---:|---:|---|
| MC34 | $1,312,033 | $50,421 | Yes |
| MC45 | $3,919 | $-3,762 | No |
| MC49 | $826,553 | $20,942 | Yes |
| MC50 | $22,300 | $-20,534 | No |
| MC64 | $442,474 | $11,631 | Yes |
| MC79 | $1,312,033 | $50,421 | Yes |
| MC85 | $255 | $-125 | No |
| MC90 | $1,666 | $-997 | No |

Account partition changes the per-account reserve blend even with deterministic returns. The household reserve should be computed once and assigned to actual reserve exposure; its amount should not depend on record count. Four reserve-enabled cases reproduce the reserve rule. The other four discrepancies are traced separately below to RMD deposit routing and taxable-basis pooling; they are not reserve defects. No tax-law correctness conclusion is implied by a balanced or invariant ledger.


#### RMD reinvestment creates an implicit tax-lot policy — JUDGMENT CALL for pooling; SHOULD CHANGE disclosure, M, high confidence

Four non-reserve custom-wrapper cases also change under deterministic returns: MC45, MC50, MC85 and MC90. The engine reinvests excess RMD cash into the first taxable account by priority (`retainExcessRmdCash()`, lines 2679–2689). New cash adds full dollar basis to that account. Later sales recover basis pro rata within each account (`withdrawFromAccountList()`, line 2365), and manual withdrawals take the first-priority account. Splitting the original taxable balance concentrates the RMD's new, higher-basis purchases in one small pool, rather than mixing them into the entire original account. The investments remain the same, but the engine has implicitly changed the basis pool selected for sale.

In deterministic MC50, at age 95, both partitions have taxable balance **$2,557,712.71** and aggregate basis **$875,440.14**. In n=1 the account's basis fraction is **34.23%**; in n=20 the first-selected taxable account's fraction is **78.68%**. A sale from that pool therefore realizes a different gain. The first material annual divergence is the row ending at age 96. By the horizon, n=20 has **$22,299.73 more wealth and $20,534.42 less lifetime tax**, despite no random returns and no reserve.

The causal controls turn RMDs off, retain the RMD surplus as dedicated cash, or add an initially empty dedicated taxable RMD-investment destination at priority zero to both partitions. **Each control removes all four differences to less than one cent.** Four modes × two partitions × four families give 32 further deterministic cases; every tapped result exactly matches an uninstrumented run. The third control keeps RMD investing active and isolates the destination/basis-pooling mechanism rather than merely removing the distribution.

This is not sufficient evidence of faulty tax arithmetic. [IRS Publication 550](https://www.irs.gov/publications/p550) distinguishes specific-share identification and permitted average-basis treatment for qualifying mutual-fund/DRIP shares; a pooled basis method is not a universal method for every taxable security. Actual lot selection, basis elections, and purchase routing can legitimately affect realized gains. The experiment demonstrates an **implicit account-based lot-selection assumption**, so these four discrepancies must not be attributed to the reserve bug or presented as proof that any real-world account split is tax-neutral.

**Recommendation:** disclose the per-account pooled-basis sales method and the automatic RMD deposit destination. Make purchase routing/basis treatment explicit, or track tax lots independently of account partitions. If a partition-invariance guarantee is offered, preserve the same lot-selection and purchase-routing policy within that guarantee. Scope M for disclosure and destination controls; XL for a full security/tax-lot ledger. This refines AA1-21's supported pro-rata-basis convention and AA1-24's partition checks, without relabeling lawful tax-lot choices as an arithmetic error.

### Ten stress comparisons

Except ST08 ($2m and three sleeves) and ST10 (taxable, retirement at 60), each stress baseline uses a $1m Roth portfolio, age 65→95, fixed-real $40,000 initial spending, zero flexibility/fee, and 2.5% inflation. ST08 has $80,000 initial spending; ST10 has $40,000 plus pre-Medicare health costs. Holdings remain unchanged between baseline/stress except the specified market-assumption changes; both n partitions preserve the same exposure in each cell.

| ID | Stress | Exact change from baseline |
|---|---|---|
| ST01 | Persistently lower returns | Stock/international 7%→3%, bonds 3.5%→2%, cash 3%→1%, REITs 6%→2.5% |
| ST02 | Double annual volatility | Stock volatility 20%→40%; same mean return |
| ST03 | Persistent 7% inflation | Inflation 2.5%→7%; same nominal returns |
| ST04 | Early common market losses | First annual equity returns −35% and −15% in every account, then ordinary Monte Carlo |
| ST05 | Large early expenses | Add $200,000 at age 65 and $100,000 at age 70 |
| ST06 | Severe long-term care | LTC probability 25%→100%, annual cost $100k→$200k, duration 3→5 years |
| ST07 | Fifty-year retirement | Horizon 30→50 years; life ages remain 120 |
| ST08 | Early spouse death | Spouse lifespan 100→75; keep 25% survivor spending reduction |
| ST09 | Two-percent annual fee | Fee 0%→2%; same gross asset assumptions |
| ST10 | Pre-Medicare healthcare costs | Retire at 60; pre-Medicare health cost $12k→$60k, medical inflation 5.5%→8% |

ST01/03/05/06/08/09/10 use 60/40 holdings; ST02/04 use equity; ST07 uses 80/20. ST06 baseline already enables LTC at 25% probability, $100k/year and three years; the stressed version raises those inputs to 100%, $200k and five years, with 5.5% medical inflation and no insurance in both. The engine's drawn onset range is retained. ST08 enables self/spouse Social Security inputs of $2,500/$1,500 monthly, claimed at 65; self lifespan 100, spouse baseline lifespan 100, survivor spending cut 25%, RMDs enabled, taxable/IRA/Roth shares 30/40/30 and joint/self/spouse owners respectively. ST10 retires at 60 and ends at 95; its medical-cost field is exercised before Medicare eligibility, rather than assuming the field charges the same expense after age 65. Pre-plan IRMAA MAGI inputs are explicitly zero.

#### Special method for the early-loss sequence

ST04's two prescribed market years are a **conditional stress**, not draws from the unconditioned normal forecast. The public `simulatePlan()` accepts a caller-supplied market RNG. For every account, the first two Box–Muller pairs are chosen to generate z=−2.1 and z=−1.1; with mean 7% and sigma 20%, these give exactly −35% and −15%. The same shocks apply across every identical holding. The underlying seeded RNG is advanced for each substituted uniform, then ordinary Monte Carlo resumes. No engine source or return formula is changed. Only this all-Roth, no-synthetic-account case uses the prescribed sequence, and the observer asserts the account count remains constant in the affected periods.

Every observed first-two-period return matches the prescription within 1e−12, and the independently rerun paths match their saved first/second-year balances. Results are aggregated with the shipped `aggregateMonteCarloRuns()`; every direct path gets the essential invariant checks. The other 38 stress cells use ordinary `runPlan()`. Market independence after the forced two years still exists in the current engine, so the stress results do not repair the covariance defect or describe the correctly correlated probability.

#### Stress results

Each cell has 2,000 paths. Figures are success percentages. “Stress split gap” is stressed n=20 minus stressed n=1; it measures the current engine's account sensitivity under that stress, not a benefit from opening more accounts.

| ID | Baseline n=1 | Stressed n=1 | Baseline n=20 | Stressed n=20 | Stress split gap, points |
|---|---:|---:|---:|---:|---:|
| ST01 | 64.3 | 22.6 | 99.0 | 6.3 | -16.3 |
| ST02 | 59.1 | 23.3 | 99.1 | 65.9 | 42.7 |
| ST03 | 64.3 | 11.1 | 99.0 | 0.1 | -11.0 |
| ST04 | 59.1 | 12.3 | 99.1 | 1.1 | -11.2 |
| ST05 | 64.3 | 29.8 | 99.0 | 22.9 | -6.9 |
| ST06 | 55.3 | 3.9 | 78.3 | 0.0 | -3.9 |
| ST07 | 62.3 | 35.3 | 99.1 | 65.2 | 30.0 |
| ST08 | 100.0 | 100.0 | 100.0 | 100.0 | 0.0 |
| ST09 | 64.3 | 34.9 | 99.0 | 38.9 | 4.0 |
| ST10 | 40.5 | 16.0 | 61.4 | 1.8 | -14.2 |

The largest absolute stressed account-split gap is **ST02: 42.7 points**. Early common losses change n=1 success **59.1% → 12.3%**, and n=20 **99.1% → 1.1%**. Even when both partitions receive the same first two losses, the later account-wise independence changes their conditional outcomes.

The survivor comparison requires particular care: an early death removes income, but also activates the entered 25% spending reduction and the modeled account succession/basis conventions. Its success can rise despite the loss of a spouse. That direction alone is not an arithmetic bug; inspect the income and spending assumptions, and the existing AA1 survivor-tax limitations, before drawing a household conclusion. ST02 uses the engine's −95%/+200% return clamp; stress outcomes reflect that truncation rather than an unconstrained Gaussian distribution. ST06's large late-life expenses are inflated from the plan start at the health-cost rate and are deliberately severe. Zero success under a stress is ordinary depletion, not evidence of a calculation failure.

#### Stress terminal wealth and unmet obligations

Median shortfall sums are nominal dollars over the simulated horizon, not discounted liabilities. Lifetime taxes and portfolio values are separate marginal medians. A zero median shortfall does not mean every path succeeds.

| ID | Median wealth, baseline n=1 | Stressed n=1 | Baseline n=20 | Stressed n=20 | Median cumulative shortfall, stressed n=1 | Stressed n=20 |
|---|---:|---:|---:|---:|---:|---:|
| ST01 | $478,119 | $0 | $1,050,024 | $0 | $520,429 | $365,065 |
| ST02 | $512,877 | $0 | $2,256,925 | $561,370 | $973,143 | $0 |
| ST03 | $478,119 | $0 | $1,050,024 | $0 | $2,039,642 | $1,803,773 |
| ST04 | $512,877 | $0 | $2,256,925 | $0 | $994,991 | $868,598 |
| ST05 | $478,119 | $0 | $1,050,024 | $0 | $515,507 | $287,947 |
| ST06 | $165,886 | $0 | $837,392 | $0 | $2,383,142 | $2,249,465 |
| ST07 | $544,983 | $0 | $1,588,849 | $984,645 | $1,505,359 | $0 |
| ST08 | $5,500,052 | $5,456,681 | $6,156,425 | $6,090,938 | $0 | $0 |
| ST09 | $478,119 | $0 | $1,050,024 | $0 | $316,532 | $77,406 |
| ST10 | $0 | $0 | $185,888 | $0 | $1,193,135 | $1,019,453 |

### All sixty regular comparisons

n is accounts per sleeve. The configuration key A–E supplies balance, tax types, owners, horizon and feature flags above. All success figures are percentages.

| ID | Allocation | Config | Original sleeves | n=1 | n=2 | n=5 | n=10 | n=20 | Δ points | Median wealth n=1 | Median wealth n=20 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| MC31 | Equity | A | 1 | 74.8 | 84.2 | 96.6 | 99.5 | 100.0 | 25.2 | $71,513 | $146,610 |
| MC32 | Equity | B | 2 | 69.4 | 79.1 | 93.8 | 99.0 | 100.0 | 30.6 | $794,580 | $1,518,666 |
| MC33 | Equity | C | 3 | 59.8 | 71.8 | 85.7 | 95.2 | 99.8 | 40.0 | $720,667 | $2,445,350 |
| MC34 | Equity | D | 4 | 73.9 | 88.5 | 98.2 | 99.7 | 100.0 | 26.1 | $2,698,793 | $6,162,979 |
| MC35 | Equity | E | 3 | 87.2 | 96.4 | 99.9 | 100.0 | 100.0 | 12.8 | $21,733,671 | $37,034,344 |
| MC36 | 90/10 | A | 1 | 77.2 | 86.9 | 97.4 | 99.7 | 100.0 | 22.8 | $73,428 | $133,258 |
| MC37 | 90/10 | B | 2 | 69.3 | 79.9 | 94.3 | 99.1 | 100.0 | 30.7 | $704,208 | $1,292,819 |
| MC38 | 90/10 | C | 3 | 94.0 | 99.0 | 100.0 | 100.0 | 100.0 | 6.0 | $1,903,972 | $2,338,593 |
| MC39 | 90/10 | D | 4 | 77.8 | 89.9 | 98.2 | 99.8 | 100.0 | 22.2 | $3,390,218 | $5,436,425 |
| MC40 | 90/10 | E | 3 | 88.9 | 97.3 | 100.0 | 100.0 | 100.0 | 11.1 | $20,226,058 | $31,837,765 |
| MC41 | 80/20 | A | 1 | 79.7 | 88.7 | 98.1 | 99.9 | 100.0 | 20.3 | $74,387 | $120,052 |
| MC42 | 80/20 | B | 2 | 69.6 | 80.5 | 94.1 | 98.9 | 100.0 | 30.4 | $658,182 | $1,074,639 |
| MC43 | 80/20 | C | 3 | 93.7 | 98.9 | 100.0 | 100.0 | 100.0 | 6.3 | $1,716,942 | $2,318,093 |
| MC44 | 80/20 | D | 4 | 77.9 | 89.4 | 98.0 | 99.7 | 100.0 | 22.1 | $2,877,464 | $4,435,261 |
| MC45 | 80/20 | E | 3 | 90.3 | 97.8 | 100.0 | 100.0 | 100.0 | 9.7 | $18,344,809 | $27,399,133 |
| MC46 | 70/30 | A | 1 | 81.8 | 90.6 | 98.6 | 99.9 | 100.0 | 18.2 | $73,874 | $107,529 |
| MC47 | 70/30 | B | 2 | 70.0 | 80.0 | 93.5 | 98.6 | 100.0 | 30.0 | $585,845 | $883,805 |
| MC48 | 70/30 | C | 3 | 58.2 | 67.8 | 78.5 | 91.3 | 98.8 | 40.6 | $396,461 | $1,065,077 |
| MC49 | 70/30 | D | 4 | 73.6 | 87.0 | 97.0 | 99.7 | 100.0 | 26.4 | $1,595,044 | $3,329,664 |
| MC50 | 70/30 | E | 3 | 91.1 | 98.4 | 100.0 | 100.0 | 100.0 | 8.9 | $16,608,744 | $23,159,417 |
| MC51 | 60/40 | A | 1 | 84.6 | 91.9 | 99.0 | 100.0 | 100.0 | 15.4 | $71,263 | $95,308 |
| MC52 | 60/40 | B | 2 | 69.2 | 78.8 | 92.7 | 97.9 | 100.0 | 30.8 | $451,698 | $695,897 |
| MC53 | 60/40 | C | 3 | 96.2 | 99.7 | 100.0 | 100.0 | 100.0 | 3.8 | $1,510,554 | $1,652,405 |
| MC54 | 60/40 | D | 4 | 76.9 | 87.9 | 97.0 | 99.7 | 100.0 | 23.1 | $1,875,804 | $2,694,151 |
| MC55 | 60/40 | E | 3 | 92.4 | 98.8 | 100.0 | 100.0 | 100.0 | 7.6 | $14,528,446 | $19,144,160 |
| MC56 | 50/50 | A | 1 | 87.7 | 92.8 | 99.5 | 100.0 | 100.0 | 12.3 | $66,748 | $84,316 |
| MC57 | 50/50 | B | 2 | 67.8 | 76.6 | 90.8 | 96.4 | 99.5 | 31.7 | $348,905 | $513,812 |
| MC58 | 50/50 | C | 3 | 97.9 | 99.9 | 100.0 | 100.0 | 100.0 | 2.1 | $1,426,860 | $1,733,563 |
| MC59 | 50/50 | D | 4 | 74.7 | 85.7 | 94.9 | 99.3 | 100.0 | 25.3 | $1,414,458 | $1,999,616 |
| MC60 | 50/50 | E | 3 | 93.0 | 99.0 | 100.0 | 100.0 | 100.0 | 7.0 | $12,347,338 | $15,643,731 |
| MC61 | 40/60 | A | 1 | 89.6 | 94.8 | 99.6 | 100.0 | 100.0 | 10.4 | $61,618 | $73,520 |
| MC62 | 40/60 | B | 2 | 65.2 | 72.8 | 86.9 | 93.8 | 98.8 | 33.6 | $226,557 | $347,738 |
| MC63 | 40/60 | C | 3 | 43.1 | 48.8 | 50.6 | 54.5 | 60.7 | 17.6 | $0 | $85,119 |
| MC64 | 40/60 | D | 4 | 63.7 | 74.2 | 88.6 | 97.9 | 100.0 | 36.3 | $556,863 | $1,268,284 |
| MC65 | 40/60 | E | 3 | 93.6 | 99.2 | 100.0 | 100.0 | 100.0 | 6.4 | $10,178,516 | $12,275,282 |
| MC66 | 20/80 | A | 1 | 92.7 | 96.9 | 99.9 | 100.0 | 100.0 | 7.3 | $48,847 | $54,459 |
| MC67 | 20/80 | B | 2 | 51.7 | 55.7 | 63.2 | 68.8 | 75.6 | 23.9 | $16,570 | $66,786 |
| MC68 | 20/80 | C | 3 | 99.1 | 100.0 | 100.0 | 100.0 | 100.0 | 0.9 | $876,218 | $905,876 |
| MC69 | 20/80 | D | 4 | 52.7 | 59.2 | 64.4 | 73.1 | 82.0 | 29.3 | $116,790 | $282,755 |
| MC70 | 20/80 | E | 3 | 93.0 | 98.9 | 100.0 | 100.0 | 100.0 | 7.0 | $6,024,883 | $6,970,470 |
| MC71 | Bonds | A | 1 | 90.0 | 95.0 | 99.5 | 100.0 | 100.0 | 10.0 | $33,951 | $37,826 |
| MC72 | Bonds | B | 2 | 26.6 | 22.2 | 12.6 | 6.6 | 2.5 | -24.1 | $0 | $0 |
| MC73 | Bonds | C | 3 | 97.5 | 99.8 | 100.0 | 100.0 | 100.0 | 2.5 | $669,510 | $761,614 |
| MC74 | Bonds | D | 4 | 23.5 | 17.9 | 8.4 | 2.8 | 0.2 | -23.3 | $0 | $0 |
| MC75 | Bonds | E | 3 | 80.0 | 90.2 | 98.7 | 99.8 | 100.0 | 20.0 | $2,523,696 | $3,102,352 |
| MC76 | US/international | A | 1 | 83.0 | 91.5 | 99.0 | 100.0 | 100.0 | 17.0 | $94,843 | $150,305 |
| MC77 | US/international | B | 2 | 76.2 | 89.0 | 98.0 | 99.6 | 100.0 | 23.8 | $1,123,054 | $1,570,390 |
| MC78 | US/international | C | 3 | 70.6 | 81.9 | 93.8 | 98.9 | 100.0 | 29.4 | $1,324,634 | $2,495,493 |
| MC79 | US/international | D | 4 | 84.3 | 94.3 | 99.3 | 100.0 | 100.0 | 15.7 | $3,439,849 | $6,278,829 |
| MC80 | US/international | E | 3 | 94.5 | 99.3 | 100.0 | 100.0 | 100.0 | 5.5 | $26,293,187 | $37,550,743 |
| MC81 | Five assets | A | 1 | 91.5 | 96.4 | 99.9 | 100.0 | 100.0 | 8.5 | $80,598 | $97,144 |
| MC82 | Five assets | B | 2 | 75.2 | 86.7 | 96.6 | 99.4 | 100.0 | 24.8 | $552,133 | $706,415 |
| MC83 | Five assets | C | 3 | 98.5 | 100.0 | 100.0 | 100.0 | 100.0 | 1.5 | $1,618,715 | $1,654,094 |
| MC84 | Five assets | D | 4 | 86.0 | 94.2 | 98.9 | 100.0 | 100.0 | 14.0 | $2,240,566 | $2,780,904 |
| MC85 | Five assets | E | 3 | 97.0 | 99.9 | 100.0 | 100.0 | 100.0 | 3.0 | $16,200,991 | $19,603,434 |
| MC86 | Stocks/REITs/bonds | A | 1 | 89.1 | 94.4 | 99.6 | 100.0 | 100.0 | 10.9 | $78,039 | $97,777 |
| MC87 | Stocks/REITs/bonds | B | 2 | 73.2 | 84.6 | 95.7 | 99.2 | 100.0 | 26.8 | $555,861 | $726,829 |
| MC88 | Stocks/REITs/bonds | C | 3 | 98.2 | 100.0 | 100.0 | 100.0 | 100.0 | 1.8 | $1,655,007 | $1,954,711 |
| MC89 | Stocks/REITs/bonds | D | 4 | 83.2 | 92.4 | 98.4 | 99.9 | 100.0 | 16.8 | $2,166,344 | $2,828,430 |
| MC90 | Stocks/REITs/bonds | E | 3 | 95.9 | 99.4 | 100.0 | 100.0 | 100.0 | 4.1 | $15,990,211 | $19,799,545 |

### Additional seed checks

Each entry is n=1 → n=20, in percent; 1,000 paths per cell.

| Family | Seed 42791 | Seed 19073 | Seed 20261003 |
|---|---:|---:|---:|
| MC31 | 74.8 → 100.0 | 74.6 → 100.0 | 74.3 → 100.0 |
| MC41 | 79.7 → 100.0 | 79.9 → 100.0 | 79.1 → 100.0 |
| MC51 | 84.6 → 100.0 | 84.3 → 100.0 | 84.9 → 100.0 |
| MC61 | 89.6 → 100.0 | 90.6 → 100.0 | 89.4 → 100.0 |
| MC71 | 90.0 → 100.0 | 91.2 → 100.0 | 90.2 → 100.0 |
| MC81 | 91.5 → 100.0 | 92.0 → 100.0 | 91.6 → 100.0 |

### Recommendations and limitations

The new evidence supports the existing recommendations: use shared correlated asset-class shocks; compute a household reserve once; validate covariance feasibility; preserve market streams when records are split/reordered; and show the spending/shortfall meaning beside success. Implement partition-equivalence checks for identical type/owner/holding sleeves with ordinary and stress sequences, including taxable basis, RMDs, spouse owners, custom types, dividends and HSA shares. Revalidate distributions after that repair rather than treating the current success rates as benchmarks to preserve.

The basis-method paragraph cites the IRS distinction between permitted methods; no additional 2026 tax-table validation or universal withdrawal recommendation is made. These simulations exercise the audited snapshot, not a later R45 implementation; optimized order is included as implemented, without establishing it solves a lifetime tax optimum. The reserve attribution is based on deterministic controls; changes in taxes between different household configurations can be legitimate and are not classified as split-only errors. The stress cases are illustrative and not assigned real-world likelihoods. No production engine, rules package or tests are changed; the owner still decides repairs.

### Reproducibility

The local bundle contains `expand-experiment.cjs`, `verify-expansion.cjs`, `trace-rmd-basis.cjs`, `analyze-expansion.cjs`, `plot-expansion.py` and `expanded-results/` with all 364 full input plans, source hash, complete parameter definitions, primary/stress/replication results, Wilson intervals, deterministic controls and first thirty path summaries per Monte Carlo cell. From the bundle folder, run `node expand-experiment.cjs`, then `node verify-expansion.cjs`, then `node trace-rmd-basis.cjs`, then `node analyze-expansion.cjs`. The nine input types and parameter grid above are sufficient to construct the ordinary comparisons using the earlier report's root-level witness. The ST04 prescription and path-seed calls are specified above. Generated runtimes and personal local paths are excluded from the public report-only PR.
