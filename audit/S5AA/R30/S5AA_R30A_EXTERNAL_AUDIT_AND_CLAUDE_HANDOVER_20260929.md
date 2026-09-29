# S5AA R30A: account and transfer audit

**Verdict: NO-GO on the R30 source. Three new findings: R30A-01 (P1), R30A-02 and R30A-03 (P2).**

Date: 2026-09-29 UTC (2026-09-28 UTC-7). Independent external review for the owner. This is the second report on the R30 source, not a source repair or a revision of another reviewer's words.

## 1. Source and scope

- Repository: `Lonnyzone123/Financial-Calculator`.
- Audited source: **`66c406c9e3e775f3c4a70013c9a10b85a3222de3`**, verified tag `s5aa-r30-source` (annotated tag object `81dc5911eb93ea1808f20766c1a2774cd4a85b9c`).
- Scope: all nine account types implemented by `ACCOUNT_TYPES`, their contribution/distribution primitives, and scheduled transfers, including both ownership directions and spouses transferring between their own accounts.
- Read: README, CONTRIBUTING, `docs/AI_REVIEW_INSTRUCTIONS.md`, `audit/S5AA/WORKING_RULES.md`, the R29/R30 handovers and audit records, and current model assumptions. Account rules were checked against the primary sources linked below.
- Publication base: current main **`35c8d9adde655cb3f864e1c4f4b66a20e95909eb`**. Main advanced during this review: PR #11 merged the R31 HSA-funding repair. **The findings and measurements below remain exclusively on R30, not on R31.** The owner authorized a separate R31 follow-up. No R31 repair is accepted by this report.
- The earlier [R30 change audit, PR #10](https://github.com/Lonnyzone123/Financial-Calculator/pull/10), found R30-01, concerning funding-date IRA basis. That finding remains true of the frozen R30 source, is not renumbered here, and must not be described as an independently verified current-main defect after R31.

Source, tests, fixtures, baselines and decision records were not edited. This report and its adjacent read-only reproduction are the only publication changes. No package was supplied or substituted for the tagged repository source.

## 2. Findings

### R30A-01 (P1): an IRA-to-workplace rollover accepts nondeductible IRA basis

**Rule.** An IRA rollover into an eligible employer plan cannot include the otherwise nontaxable portion. The special allocation treats eligible rolled dollars as taxable value first; it does not authorize moving IRA basis into the plan. See [IRC 408(d)(3)(A)(ii) and (H)](https://www.law.cornell.edu/uscode/text/26/408).

**Evidence and code at the audited SHA.** [Workplace refusal, engine.js:2545](https://github.com/Lonnyzone123/Financial-Calculator/blob/66c406c9e3e775f3c4a70013c9a10b85a3222de3/src/engine.js#L2545) and [transferAllowed, engine.js:3391](https://github.com/Lonnyzone123/Financial-Calculator/blob/66c406c9e3e775f3c4a70013c9a10b85a3222de3/src/engine.js#L3391) accept matching pre-tax classes without measuring the source owner's taxable IRA value. [moveFunds, engine.js:2244](https://github.com/Lonnyzone123/Financial-Calculator/blob/66c406c9e3e775f3c4a70013c9a10b85a3222de3/src/engine.js#L2244) moves the balance. [IRA-flow recognition, engine.js:3433](https://github.com/Lonnyzone123/Financial-Calculator/blob/66c406c9e3e775f3c4a70013c9a10b85a3222de3/src/engine.js#L3433) does not recognize a pre-tax-to-pre-tax distribution. Basis therefore remains in the IRA ledger while its dollars enter the workplace plan.

**Reproduction.** The adjacent script's `R30A-01 all-basis IRA -> workplace, later liquidation` adapts the already-published R29 `basisPlan()` fixture. Start at 60 with $100,000 cash and empty sheltered accounts; all returns, dividends, fees and inflation are zero. In the first row, $200,000 wages and a $1,000 workplace deferral make the $8,600 IRA contribution nondeductible. The resulting IRA consists entirely of $8,600 basis created inside the projection. At 61, schedule an $8,600 move into a traditional 401(k). At 62, contribute $2,000 deductible IRA money, receive $30,000 wages, and pay a $100,000 expense, drawing pre-tax accounts first.

The amount legally eligible for that rollover is **zero**. Refusing it leaves $8,600 IRA basis to recover on liquidation, $2,000 taxable IRA money, and the $1,000 workplace balance. AGI is $30,000 + $2,000 + $1,000 - $2,000 = **$31,000**. R30 instead lets the later $2,000 IRA distribution consume stranded basis, while taxing the $8,600 moved into the workplace plan as well as its $1,000 original balance: AGI **$37,600**.

| Final-row figure | Independent expected | R30 actual | Actual minus expected |
|---|---:|---:|---:|
| Federal AGI | $31,000 | $37,600 | +$6,600 |
| Total model tax | $4,207.50 | $5,164.50 | +$957.00 |
| Net worth | $181,722 | $180,765 | -$957 |

Tax arithmetic under the fixture's 2026 single/AZ model: expected taxable income $14,900; federal tax $1,240 + $2,500 x 12% = $1,540; state $372.50; payroll $2,295. Actual taxable income $21,500; federal $2,332; state $537.50; same payroll. The overstatement is $6,600 x (12% + 2.5%) = **$957**. The no-rollover control agrees with the independent AGI/tax expectation and retains $957 more wealth. This is not a missing opening-basis input: the fixture generates the basis using existing contribution behavior.

**Reach and consequence.** Later ordinary income/tax can be overstated and spendable wealth understated. None of the expanded corpus's 70 recipes contains an enabled traditional-IRA-to-workplace transfer; none reaches this witness. Pure pre-tax rollover matrix controls pass, so matching tax class alone conceals the basis case.

**Proposed repair.** Subject to the owner's decision, allow only the eligible taxable portion of the owner's aggregate IRA pool and preserve basis in the IRA ledger, or refuse this route until its allocation is modeled. Claude should first pin all-basis, mixed-basis and multiple-IRA cases, ordinary distributions in the same row, and a valid pre-tax-only rollover. Do not repair by consuming IRA basis as though it were eligible employer-plan basis.

### R30A-02 (P2): Roth IRA -> Roth 401(k) is accepted as a rollover

**Rule.** This direction is prohibited even for the same owner. The reverse direction, designated Roth account -> Roth IRA, is permitted when its conditions are met. See [Publication 590-A, "Rollover From a Roth IRA"](https://www.irs.gov/publications/p590a) and the [IRS rollover chart, Roth IRA row](https://www.irs.gov/pub/irs-tege/rollover_chart.pdf).

**Evidence and code at the audited SHA.** [scenario-validator.js:975](https://github.com/Lonnyzone123/Financial-Calculator/blob/66c406c9e3e775f3c4a70013c9a10b85a3222de3/src/scenario-validator.js#L975) accepts matching tax classes. The engine's [workplace guard:2545](https://github.com/Lonnyzone123/Financial-Calculator/blob/66c406c9e3e775f3c4a70013c9a10b85a3222de3/src/engine.js#L2545), [transfer gate:3391](https://github.com/Lonnyzone123/Financial-Calculator/blob/66c406c9e3e775f3c4a70013c9a10b85a3222de3/src/engine.js#L3391) and balance mover do the same; none checks this type-directed prohibition.

**Reproduction and arithmetic.** The script's `R30A-02 Roth IRA into Roth 401(k)` starts at 60 with $10,000 in a Roth IRA earning 0%, an empty own Roth 401(k) earning 10%, $100,000 cash, and $20,000 wages. Schedule the entire move at 60; no spending or dividends. Expected refusal leaves Roth-class wealth **$10,000**. R30 returns `ok`, moves the prohibited $10,000, and reports **$11,000 = $10,000 x 1.10** in Roth-class wealth. This is an allocation/eligibility error; the $1,000 observation is return on money placed in the wrong destination, not cash created by the transfer or an estimate of an IRS penalty.

**Reach and consequence.** Six dedicated same-owner matrix cases fail: self/self and spouse/spouse, each at opening, quarter-year and three-quarter-year dates. None of the 70 corpus recipes enables this reverse Roth route. A zero-return aggregate-only check cannot observe the wrong destination.

**Proposed repair.** Introduce an explicit source-type/destination-type eligibility rule, reject Roth IRA -> employer Roth account in both validation and calculation, and retain the valid employer Roth -> Roth IRA route. Test both owners and dated execution, not just an unchanged total balance.

### R30A-03 (P2): an ordinary sheltered rollover can change living owners

**Rule.** IRA rollover provisions identify the same individual's receiving account/plan; a divorce-instrument transfer is a distinct exception. HSA rollover treatment requires the same beneficiary, with separate divorce and death rules. See [IRC 408(d)(3)(A), (d)(6)](https://www.law.cornell.edu/uscode/text/26/408), [IRC 223(f)(5), (7), (8)](https://www.law.cornell.edu/uscode/text/26/223), and [Publication 575, qualified domestic relations orders](https://www.irs.gov/publications/p575). Marriage alone is not an ordinary-rollover exception.

**Evidence and code at the audited SHA.** [lawfulConversionDestination, engine.js:2546](https://github.com/Lonnyzone123/Financial-Calculator/blob/66c406c9e3e775f3c4a70013c9a10b85a3222de3/src/engine.js#L2546) checks ownership for pre-tax-to-Roth conversions, but [transferAllowed:3391](https://github.com/Lonnyzone123/Financial-Calculator/blob/66c406c9e3e775f3c4a70013c9a10b85a3222de3/src/engine.js#L3391) has no corresponding ordinary-rollover owner guard. [moveFunds:2244](https://github.com/Lonnyzone123/Financial-Calculator/blob/66c406c9e3e775f3c4a70013c9a10b85a3222de3/src/engine.js#L2244) likewise does not constrain ownership.

**Reproduction and arithmetic.** The two `R30A-03` witnesses use living spouses, both 60, joint filing, $20,000 wages each, and no death, divorce instrument or QDRO. Transfer $10,000 at 60 from the self-owned 0%-return traditional IRA to an empty spouse-owned 10%-return traditional IRA. Repeat with HSAs (qualified-medical percentage 0). Refusal should leave the relevant sheltered class **$10,000**. Actual is `ok` with **$11,000 = $10,000 x 1.10**, having silently reassigned $10,000 to the other owner outside contribution limits. No owner-route refusal occurs. Again, the growth difference exposes the destination; this report does not invent a tax amount for a transaction whose appropriate default is refusal.

**Reach and consequence.** All **54** ordinary cross-owner same-class named-sheltered matrix cases fail: nine directed type pairs, three dates and both owner directions. No enabled transfer in the 70-member corpus crosses owners. The route can bypass owner-specific contribution limits and relocate balances subsequently used for ownership, basis and RMD calculations. Automatic spousal treatment at death is a separate disclosed model choice and is not this finding.

**Proposed repair.** Require the same owner for ordinary sheltered rollovers. Any supported divorce/QDRO/death exception needs an explicit separate path and its own accounting. If the owner instead chooses a distribution followed by a spouse contribution, apply source distribution taxes and destination contribution eligibility/room. Preserve legal taxable gifts and the existing death path.

## 3. Account-by-account rules and results

These are the nine implemented types, not certification of every financial product. All figures below are **2026 limits**, not assumed future-year law. See [Notice 2025-67, pp. 1-2](https://www.irs.gov/pub/irs-drop/n-25-67.pdf) for retirement limits; [Rev. Proc. 2025-19](https://www.irs.gov/pub/irs-drop/rp-25-19.pdf) for HSA limits.

| Implemented type | Rule checked | Audit result / boundary |
|---|---|---|
| `taxable` | Basis, realized gain/loss, dividends; in-kind taxable-to-taxable basis carry. [Pub. 550](https://www.irs.gov/publications/p550) | $1,000 draw from $10,000 with 60% basis realizes $400. Dated sale probes at -20% and +10% returns pass. Long-term-gain proxy and absent death step-up remain limitations. |
| `traditionalIRA` | $7,500 combined IRA limit; $1,100 catch-up; compensation and deduction restrictions; aggregate owner basis. [Pub. 590-A](https://www.irs.gov/publications/p590a) | Shared-room, compensation and distribution controls pass. R30A-01 and R30A-03 fail. Opening basis remains unmodeled; witness basis is created inside projection. |
| `rothIRA` | Same combined IRA room; no deduction; MAGI eligibility and qualified-distribution conditions. [Pub. 590-A](https://www.irs.gov/publications/p590a) | Shared-room/high-salary-proxy controls pass. R30A-02/-03 fail. Five-year tests and detailed distribution ordering are not qualified. |
| `traditional401k` | $24,500 shared employee deferral; $8,000 catch-up, or $11,250 for the applicable 60-63 tax-year ages; $72,000 additions limit excluding catch-up. | Shared traditional/Roth room and employer-match controls pass; R30A-01/-03 affect transfers. Per-employer-group 415(c) remains an authorized TODO. |
| `roth401k` | Same shared employee room; qualified distributions require the applicable five-year and qualifying-event tests. [Pub. 575](https://www.irs.gov/publications/p575) | Match-character controls pass; R30A-02/-03 fail. Roth employer match is income, not payroll wages, under [Notice 2024-2, L-2/L-6](https://www.irs.gov/irb/2024-02_IRB). These controls assert balances/AGI, not all payroll consequences. |
| `hsa` | $4,400 self/$8,750 family base; $1,000 eligible-owner catch-up; family base shared, each spouse's catch-up in their own HSA. Nonmedical distribution income and 20% additional tax before 65. [Pub. 969](https://www.irs.gov/publications/p969) | Shared family room/two catch-ups and draw fractions at 50/60/65 pass. R30A-03 fails. Coverage/Medicare eligibility and testing-period compliance remain unmodeled. |
| `customTaxable` | Model's taxable wrapper, with no named statutory contribution cap. | Primitive basis/draw and generic routing checks pass; no independent legal account qualification is claimed. |
| `customTraditional` | Model's pre-tax wrapper, no named statutory contribution cap. | Primitive income/penalty and generic routing controls pass, including a model RMD-credit probe. This is not qualification of a 403(b), 457, annuity or inherited account. |
| `customRoth` | Model's Roth wrapper, no named statutory contribution cap. | Primitive early-Roth marker/generic routing checks pass, subject to the disclosed Roth exclusions; no statutory product qualification. |

RMD controls: at 75, a $5,000 distribution from $100,000 pre-tax balance credits the $100,000 / 24.6 = $4,065.04065 obligation without a duplicate withdrawal. Living Roth IRA/Roth 401(k) balances have no RMD. IRA aggregation and separate workplace obligations are distinct rules; see [IRS RMD FAQs](https://www.irs.gov/retirement-plans/retirement-plan-and-ira-required-minimum-distributions-faqs). This sample does not qualify all beneficiary, employment-exception or table-selection cases.

### Transfer classification reference

This table records researched eligibility categories for **ordinary own-account transfers**, not an assertion that the application checks every condition. Employer acceptance, eligible-distribution status and source/destination tax history still matter. [IRS rollover chart](https://www.irs.gov/pub/irs-tege/rollover_chart.pdf), [Pub. 575](https://www.irs.gov/publications/p575), [Pub. 969](https://www.irs.gov/publications/p969).

`K` = in-kind taxable move; `R` = eligible rollover; `V` = taxable conversion; `D` = distribution with source-specific tax rules; `C` = regular cash contribution subject to eligibility and remaining room; `Q` = qualified HSA funding distribution; `X` = refuse the scheduled rollover/contribution route. `D+C` is not a tax-free rollover. A Roth `D` is not automatically qualified simply because this fixture is age 60.

| From \ To | Taxable | Traditional IRA | Roth IRA | Traditional 401(k) | Roth 401(k) | HSA |
|---|---|---|---|---|---|---|
| Taxable | K | sale+C | sale+C | X | X | sale+C |
| Traditional IRA | D | R | V | R, taxable portion only | X | Q, own HSA and conditions |
| Roth IRA | D | D+C | R | X | X | D+C in this model |
| Traditional 401(k) | D | R | V | R | V, same-plan in-plan route only | D+C |
| Roth 401(k) | D | D+C | R | X | R | D+C |
| HSA | D | D+C | D+C | X | X | R, same beneficiary |

The model selects QHFD only for traditional IRA -> own HSA; law can also permit a qualifying Roth-IRA funding distribution. That modeled choice is not a new finding. QHFD is direct, not deductible, generally once per lifetime (with a narrow coverage-change exception) and has a testing period. Missing eligibility/history inputs prevent unconditional legal qualification. The three custom wrappers are deliberately not added to the legal rollover chart.

### Age-clock limitation, not R30A-04

Catch-up eligibility is based on tax-year-end age: [IRC 219(b)(5)(B)](https://www.law.cornell.edu/uscode/text/26/219), [IRS 401(k) eligibility snapshot](https://www.irs.gov/retirement-plans/issue-snapshot-401k-plan-catch-up-contribution-eligibility), Notice 2025-67's ages attained in the year, and Pub. 969's HSA year-end test. The engine instead calls its contribution helper with row-opening owner age ([engine.js:135](https://github.com/Lonnyzone123/Financial-Calculator/blob/66c406c9e3e775f3c4a70013c9a10b85a3222de3/src/engine.js#L135), [3335](https://github.com/Lonnyzone123/Financial-Calculator/blob/66c406c9e3e775f3c4a70013c9a10b85a3222de3/src/engine.js#L3335)).

However, `MODEL_ASSUMPTIONS.md` explicitly discloses no calendar anchor (section 4) and age-based rows crossing tax years (section 14). A closing row age is therefore **not independently established as December 31 age**. The script labels 18 differences **CONDITIONAL**, not defects; they assume closing age is tax-year-end age. For example, a $60,000-wage 63->64 traditional-401(k) row shelters $35,750; if the actual tax year ends at 64, correct room is $32,500 and model tax would be understated $406.25 = $3,250 x (10% + 2.5%). Without the calendar premise, that is not a proved tax error.

The owner should decide a contribution tax-year/age convention before this can be qualified. Do not silently replace every opening-age test, especially the separately approved pooled-withdrawal penalty convention. No fourth finding is assigned.

## 4. Executed evidence and coverage

Run from the frozen R30 checkout:

```text
node audit/S5AA/R30/S5AA_R30A_EXTERNAL_AUDIT_REPRO_20260929.js
```

Optional argument: checkout root; for detailed output use `node audit/S5AA/R30/S5AA_R30A_EXTERNAL_AUDIT_REPRO_20260929.js . --verbose`. The script imports the already-published R29 fixture helper. Exit **1 is intentional** while confirmed failures remain; this is a read-only external probe, not a registered baseline or gate change.

Final observed result: **1,186 runPlan executions; 1,267 grouped checks: 1,185 PASS, 64 MISMATCH, 18 CONDITIONAL.** Repeated checks expose **three findings**, not 64 independent defects.

| Group | Checks | Pass | Mismatch | Conditional |
|---|---:|---:|---:|---:|
| Type/date/owner transfer matrix | 972 | 912 | 60 | 0 |
| Same-account no-op | 9 | 9 | 0 | 0 |
| Distribution primitives | 81 | 81 | 0 | 0 |
| Contributions / age boundaries | 180 | 162 | 0 | 18 |
| Visible integration witnesses / no-roll control | 5 | 1 | 4 | 0 |
| RMD credit | 3 | 3 | 0 | 0 |
| Shared limits, match, Roth RMD and dated sales | 17 | 17 | 0 | 0 |

Matrix: nine source types x nine destination types x three dates (60, 60.25, 60.75) x four ownership combinations (self/self, self/spouse, spouse/self, spouse/spouse). Expected refusal covers ordinary named-sheltered owner changes and Roth IRA -> Roth 401(k). Other matrix expectations follow the documented model's generic/custom contribution conventions; their passes do not prove every legal plan condition. Distribution probes cover all nine types at ages 50/60/65 and HSA qualified-medical fractions 0/50/100; Roth early-marker passes do not validate five-year tests or earnings ordering.

Additional fresh check on R30: **74 existing account-focused test files, 526 tests passed, 0 failed/skipped/todo/cancelled**, Node v24.17.0, Windows 11. Existing regression tests therefore do not detect the three new findings.

The full `npm test` gate was already run on this exact source earlier in this review: **2,947 tests, 2,938 passed, 0 failed/skipped/cancelled, 9 authorized TODOs**, 360 files. For this broader report its saved gate output was read back, not represented as a newly rerun full gate. The TODOs are eight mortgage-revival contract items and `ACCOUNT-17-8` (415(c) per employer group). CI attribution and earlier R29/R30 sweeps remain in PR #10; report-PR CI is not model qualification.

Qualified R30 expanded capture: 70 members (5 golden, 20 seeded, 11 targeted, 34 expansion); 49 simple, 4 Monte Carlo, 17 historical. Input hash `9b107562529731ad36ac45395080bfc436be26ca2aed5f89722cfc1b0cf14827`; output hash `5a67d57e35136788bba4d96f4f24dcb721fbf4f70ab7fc3077021d7c6d122766`; built HTML SHA-256 `34e1ec4824712c26ecf205f884e36f0836ec8519a0f70fe54e399c3e0fc9df52`. The source-hash manifest's nine files were freshly matched to the R30 checkout. This report does not regenerate or accept a new baseline.

Fresh corpus-recipe inspection found 11 enabled transfers, all same-owner, none on the three newly failing routes. Thus **none reached** these three findings. Seeds 10/11/20 contain possible catch-up clock exposure; that is recipe reach only, not three independently recomputed tax errors or a claim that their headlines move. Browser/UI behavior, every multi-IRA/QCD combination, employer-plan identity/acceptance, inherited accounts, estate transfers, five-year Roth histories and real-calendar filings were not independently qualified here.

## 5. Handover

1. The owner chooses whether to repair the three findings; no approval is inferred from this PR or a passing check.
2. Claude reproduces each on Windows at the named source and pins independent expectations before any repair. Keep type, owner and IRA-basis eligibility distinct; identical tax class is insufficient.
3. Account for changed corpus/control figures and register any new baseline through the existing process. Zero reached recipes do not imply zero risk.
4. Preserve the disclosed exclusions: custom-account caps, HSA eligibility/history, Roth ordering/five-year rules, salary-MAGI proxy, mandatory-Roth catch-up warning, outside-funded working contributions, per-employer-group 415(c), and separate death assumptions. They were not promoted into new findings.
5. Independently review R31 at its own tag/full SHA. Do not use this R30 report to accept its funding-date repair, and do not close the sprint based on regression CI alone.

**Conclusion: NO-GO for the frozen R30 source. One new relied-on tax error and two defeated transfer safeguards are independently demonstrated; the contribution calendar boundary remains an explicitly conditional limitation.**
