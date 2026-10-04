**R46 GO; R47 NO-GO; R48 NO-GO; R49 NO-GO; R50 NO-GO; R51 NO-GO; overall NO-GO.** These are S5AA administrative verdicts under A-01 to A-11. R49 and R51 introduce no separately confirmed finding, but their frozen source carries the preceding blockers. R46's GO does not qualify the model for release or household reliance.

# S5AA R46–R51: sequential external audit and implementation handover

Auditor: ChatGPT. Date: 2026-10-04. Requested scope: the six repair rounds in `S5AA_AUDITOR_COVER_NOTE_20261003_R46_R51.md`, followed by 20 focused simulations and analysis. The combined handover was read first. Findings below are proposals for the owner; no source, test, fixture, baseline, decision register or existing audit text is changed by this report.

## 1. Reviewed source and evidence boundaries

| Round | Immutable source tag | Full source SHA | Local round witnesses |
|---|---|---|---:|
| Before | `s5aa-r45-source` | `9c7790e26cc61ca9446c52b84a274a5bf27e3293` | predecessor comparisons |
| R46 | `s5aa-r46-source` | `0fd83e199a09ac03e1445d70b140274f752dd38f` | 28/28 pass |
| R47 | `s5aa-r47-source` | `86842f654fef2a3ee6ebddeed1532f81c6227bab` | 37/37 pass |
| R48 | `s5aa-r48-source` | `56ed5fde4977c6951e895503d067005a49db9d89` | 32/32 pass |
| R49 | `s5aa-r49-source` | `ec6063fa0afc88167429461bcdde645204f80af7` | 34/34 pass |
| R50 | `s5aa-r50-source` | `5119d03cf61cd4ab5da43e02619581716684bb84` | 26/26 pass |
| R51 | `s5aa-r51-source` | `ee06ea522562ca27262258e13f90f2d2f51ae5e5` | 26/26 pass |

The report branch starts at main `02f6cbf88fa7ad3244555232324effa4e6e874d3`. Compared with the R51 tag, its financial source is identical. Its only test change is the disclosed repair to `tests/capture-baseline.test.js`; subsequent audit records are distinct from the frozen source. This report uses source-tag line numbers, with final R51 locations supplied where useful.

The rounds were reviewed in order: changed implementations, upstream and downstream callers, validator/engine agreement, Worker serialization, source witnesses, predictions and dispositions. Formal simulations followed that review. An additional R50 settlement interaction found during output analysis was added to the conversion simulation, retaining 20 focused cases.

The original isolated repairs and the stacked tags serve different comparisons. Retrospective prediction proofs use R45's pre-repair financial source against `f02e26a` (R47), `126c7f1` (R48), and `2d9ede3` (R50). Stacked tags are used for the sequential audit and final integration simulations. Comparing R45 directly with stacked R50 would also measure R46–R49 and would not test R50's original path prediction.

### Runtime and independent qualification

- Windows 11, OS build 26200; Node **24.17.0**; jsdom **30.0.1**. This is inside the repository's supported runtime envelope.
- Round witnesses: **183 tests passed**, no failures, skips or todos in those targeted runs.
- Full gate at the exact **R51 tag**: **3,473 tests, 3,464 pass, 0 fail, 0 skipped, 0 cancelled, 9 authorized todos**, exit 0.
- Full gate at **main `02f6cbf`**: the same counts, exit 0. This separately covers the post-tag capture-test repair.
- `closeout-check`: **12 accepted, 0 refused, 0 errors**; `COMPLETE_WITH_CARRY_FORWARD`. Its existing inventory does not yet include this report's four new findings.
- An independent R51 expanded capture is qualified at the tag, complete at **71/71**, and equals the registered r30 capture entry for entry. Output hash: `2c342c6c6bdc966cd34a8c7e35561fe598e2c50abd33c03cf85560b079dc5b04`; input hash: `ed3731e2f72425d0e17bfb26558411c22d552d559f9038db7d431769dcb839c4`. A separate two-capture verification reproduced the output hash.

An initial full-gate attempt used `NODE_PATH` to share dependencies. That made the gate's deliberate “jsdom absent” fixture find jsdom and caused an environmental false failure. With ordinary local dependency resolution and no `NODE_PATH`, both full gates passed. No assertion was changed.

Public source PR checks were also inspected live. The Windows gate and CodeQL checks are successful on [R46 #59](https://github.com/Lonnyzone123/Financial-Calculator/pull/59), [R47 #60](https://github.com/Lonnyzone123/Financial-Calculator/pull/60), [R48 #61](https://github.com/Lonnyzone123/Financial-Calculator/pull/61), [R49 #62](https://github.com/Lonnyzone123/Financial-Calculator/pull/62), [R50 #63](https://github.com/Lonnyzone123/Financial-Calculator/pull/63), and [R51 #64](https://github.com/Lonnyzone123/Financial-Calculator/pull/64). Those PR heads contain records and, for R48, the disclosed later test repair. They are supporting CI evidence, not substitutes for the source-tag identity above. R51's [Windows CI job](https://github.com/Lonnyzone123/Financial-Calculator/actions/runs/37189798792/job/111399438302) independently reports 3,473/3,464/0/9.

## 2. Findings

All four are **P2**: reproducible errors in narrower financial cases. Each remains present at R51. None is excused by the existing supported-domain disclosures.

### R47-01 — One year's unused IRA room is spent twice against carried excess

1. **Evidence and commit.** Simulation **S06** fails at R47 `86842f654fef2a3ee6ebddeed1532f81c6227bab` and R51. Year one has $10,000 contributed to a traditional IRA and $10,000 to a Roth IRA for one 40-year-old owner earning $50,000, under `limitPolicy: "warn"`. Both contributions stop in year two. No return, inflation, dividends or IRA distribution occurs. The initial combined excess is $12,500 and the engine correctly books $750 of excise. In year two it books **$150**, where the combined remaining excess requires **$300**.
2. **Source.** R47 [`src/engine.js:4693`](https://github.com/Lonnyzone123/Financial-Calculator/blob/86842f654fef2a3ee6ebddeed1532f81c6227bab/src/engine.js#L4693), `roomFor4973` and the `trad/roth/hsa` loop. Final R51: line 4948. The traditional and Roth iterations each ask for room against the same unchanged contribution audit; neither consumes the other iteration's absorbed amount.
3. **Reproduction and independent expectation.** Run the companion script with `--only S06`. The first year's $7,500 lawful IRA limit leaves $2,500 traditional excess plus $10,000 Roth excess. The next year's single $7,500 IRA allowance absorbs $2,500 traditional excess and only $5,000 Roth excess, leaving $5,000: **6% × $5,000 = $300**. The engine removes $2,500 and $7,500 respectively, leaving only $2,500. In this implementation excise is booked into `taxOutstanding`, then paid by the following row; it must not be inferred by subtracting the cash-paid `taxes` field from `taxSettled`. [IRC 219(f)(6)](https://www.law.cornell.edu/uscode/text/26/219) treats absorbed traditional excess as a current-year contribution; [IRC 4973(b), (f)](https://www.law.cornell.edu/uscode/text/26/4973) supplies the carried-excess rules. That deemed contribution also occupies room relevant to Roth absorption.
4. **Consequence and reach.** The example understates this year's liability by $150. Under warn, households holding both categories of carried excess can make it disappear too quickly; later balances and true-up funding inherit the error. HSA capacity is a separate limit and should remain separate.
5. **Proposed repair.** Maintain one consumed annual IRA-capacity ledger per owner across actual and deemed contributions, preserving the traditional/Roth statutory phaseouts and deduction treatment. Test simultaneous carried excesses, current contributions, distributions, multiple accounts, partial years and the HSA control. Do not merely cap each category independently.

### R47-02 — A spouse's salary incorrectly shields a business owner's deferral from QBI

1. **Evidence and commit.** **S07** is valid and returns `ok` at R47 and R51, with tax **$35,032.62418** instead of **$35,912.62418**. The primary earns $80,000 self-employment profit and defers $20,000 into their traditional workplace account; their salary is zero. The spouse earns $100,000 salary. Both are 40 and work throughout the row.
2. **Source.** R47 [`src/engine.js:4419`](https://github.com/Lonnyzone123/Financial-Calculator/blob/86842f654fef2a3ee6ebddeed1532f81c6227bab/src/engine.js#L4419), `qbiCut`. Final R51: line 4671. It subtracts **household** `wages` from household pre-tax deferrals before deciding what is attributable to self-employment. Therefore the other spouse's $100,000 makes this owner's business deduction zero. The R50 tax wrapper correctly passes the trailing argument; it passes an already-wrong amount.
3. **Reproduction and independent expectation.** Run `--only S07`. Self-employment tax is $80,000 × 92.35% × 15.3% = $11,303.64; its deductible half is $5,651.82. AGI is $100,000 + $80,000 − $20,000 − $5,651.82 = **$154,348.18**, which the engine gets right. QBI must be $80,000 − $5,651.82 − $20,000 = **$54,348.18**, giving a $10,869.636 deduction. Federal taxable income is $154,348.18 − $32,200 − $10,869.636 = $111,278.544. Federal tax $13,905.27968 + payroll/SE tax $18,953.64 + Arizona $3,053.7045 = **$35,912.62418**. The engine's $4,000 extra QBI deduction understates federal tax by **$880**. Business-attributable qualified-plan deductions reduce QBI under [26 CFR 1.199A-3(b)(1)(vi)](https://www.law.cornell.edu/cfr/text/26/1.199A-3); the brackets are independently checked in [IRS Publication 505 for 2026](https://www.irs.gov/publications/p505).
4. **Consequence and reach.** Joint households with business deferrals and wages of the other spouse can understate tax, funding draws and working-income tax. This is an incomplete R47 repair, even though some QBI under-deduction cases also existed before R47.
5. **Proposed repair.** Attribute lawful pre-tax workplace deferrals to their **owner's** salary, employment streams and businesses before household aggregation. Preserve the adopted allocation convention within an owner if finer employer/business data are unavailable. Cover both owners and mixed salary, employment and SE streams; carry the resulting amount through the estimator, funding quote, committed return and R51 working-pay check.

### R48-01 — Moving an inherited IRA into the survivor's own IRA strands its basis

1. **Evidence and commit.** **S10** returns `ok` from the engine at R48 and R51 but reports final AGI **$37,500** and tax **$2,855**, versus **$30,000** and **$1,767.50**. At the R45 predecessor, the same engine execution reports the expected AGI and tax. The changed inherited pool creates the regression.
2. **Source.** R48 [`src/engine.js:4296`](https://github.com/Lonnyzone123/Financial-Calculator/blob/56ed5fde4977c6951e895503d067005a49db9d89/src/engine.js#L4296) moves the balance; [`line 4313`](https://github.com/Lonnyzone123/Financial-Calculator/blob/56ed5fde4977c6951e895503d067005a49db9d89/src/engine.js#L4313) recognizes only the specified cross-class distributions. The new `iraPoolKey` at line 534 separates inherited and own IRAs, but a same-character rollover between those pools transfers no Form 8606 basis. Final R51 transfer locations: lines 4439 and 4456.
3. **Reproduction and independent expectation.** Run `--only S10`. At 45, a $200,000 salary and workplace participation make a $7,500 traditional IRA contribution nondeductible; the basis is **created inside this projection**. The owner dies at 46.5. At 47.5 the surviving spouse transfers the inherited $7,500 into their own initially empty IRA. At 48, a $30,000 pension funds part of a $37,500 expense; the remaining $7,500 comes from that IRA. The distribution is entirely basis, so AGI remains $30,000. Single federal tax $1,420 plus Arizona $347.50 = $1,767.50. The engine instead taxes the entire $7,500 again. [IRS Publication 590-B, inherited IRAs and basis](https://www.irs.gov/publications/p590b) and [26 CFR 1.408-8(c)](https://www.law.cornell.edu/cfr/text/26/1.408-8) support the surviving spouse's own-account treatment; a rollover does not erase nondeductible basis.

   **Reach qualification:** the static validator rejects this scheduled transfer as `TRANSFER_BETWEEN_OWNERS` from the original account owners, although the death precedes the transfer. That refusal already occurs at R45, so it is not counted as a new R48 finding. The engine evaluates the re-owned accounts at the transfer date and accepts it. The account/transfer editor can construct this path: `calculate()` runs the engine, while `renderPlanChecks()` filters for WARNING severity and does not gate on validator errors. Import through a stricter validator can reject it. The reproduction records both outcomes; it does not claim validator acceptance.
4. **Consequence and reach.** This accepted calculation overstates AGI by $7,500 and tax by **$1,087.50**. The inherited basis remains attached to an empty pool. Partial rollovers, tax funding and later income-dependent calculations can also be affected. “Opening basis not known” is not an exemption: this basis was created and tracked by the model.
5. **Proposed repair.** Transfer the appropriate basis and settlement bookkeeping when a rollover changes IRA pools; update the receiving own pool before subsequent draws. Cover partial and full moves, returns/growth, same-row draws, RMD reservations and later automatic own-account election. Reconcile the validator's original-owner check with the engine's dated succession so legitimate post-death rollovers have one consistent acceptance policy.

### R50-01 — The Roth conversion ledger retains provisional taxability after final settlement

1. **Evidence and commit.** The settlement portion of **S17** is valid, returns `ok`, and reports **$500 settled tax instead of $0** at R50 `5119d03cf61cd4ab5da43e02619581716684bb84` and R51. The R49 predecessor passes this expected outcome. A penalty-exception control removes exactly the $500.
2. **Source.** R50 [`src/engine.js:3126`](https://github.com/Lonnyzone123/Financial-Calculator/blob/5119d03cf61cd4ab5da43e02619581716684bb84/src/engine.js#L3126) records `take-nt` and `nt` into the Roth ledger **at conversion time**. [`Line 4920`](https://github.com/Lonnyzone123/Financial-Calculator/blob/5119d03cf61cd4ab5da43e02619581716684bb84/src/engine.js#L4920) later settles Form 8606 and corrects ordinary income and traditional basis, but never reconciles the Roth conversion record. Final R51: lines 3135 and 4940.
3. **Reproduction and independent expectation.** Run `--only S17`. A 45-year-old earns $200,000, contributes $7,500 nondeductibly to an empty traditional IRA and $1 to a traditional workplace plan, then converts the IRA in that row. Cash funds the provisional tax. Final Form 8606 settlement finds **$7,500 nontaxable and $0 taxable conversion**; the published settled AGI is correctly $199,999. Yet an output-neutral read-only tap observes Roth conversion `{year:0,taxable:7500,nontaxable:0}`. A $5,000 Roth IRA-to-cash distribution at 46 is then assessed a 10% recapture: **$500**. The second row's other $1 conversion is below all income-tax deductions and does not account for this tax. A conversion's additional tax applies only to the amount included in income on conversion: [IRC 408A(d)(3)(F)](https://www.law.cornell.edu/uscode/text/26/408A), [26 CFR 1.408A-6 A-5(b)](https://www.law.cornell.edu/cfr/text/26/1.408A-6).
4. **Consequence and reach.** Same-year nondeductible contributions and conversions can create false early-withdrawal penalties. Other year-end pro-rata changes can overstate or understate the taxable conversion bucket. Quote and commit can agree on the wrong ledger, so a silent settlement safeguard does not catch it. The five-year-expiry control in S17 passes; the defect is the recorded taxable amount, not the expiry arithmetic.
5. **Proposed repair.** Reconcile each owner's tax-year Roth conversion record with the final conversion-specific Form 8606 allocation, including scheduled-transfer conversions. Also reconcile distributions already taken from those segments in the same year and their penalty true-up. Test fully nontaxable, mixed basis, growth/loss, multiple conversions, spouse succession, early draws and expiry. Preserve the distinction between regular contribution basis and nontaxable conversion principal.

## 3. Sequential round conclusions

### R46 — GO for administrative purposes

The shared-shock implementation has the correct covariance construction. For negative equicorrelation, the symmetric square root has eigenvalues `sqrt(1-rho)` and `sqrt(1+(m-1)rho)`; the refusal boundary is therefore correct. The active-class union includes glide endpoints. The disclosed effect of adding a previously unused class, even through an empty account, is a decided modeling convention, not a finding.

Account splitting, the singular five-class boundary, the engine/validator refusal and the household reserve were independently exercised. The reserve's common share caps at one and household cash retains its separate growth treatment. The final real-spending summary uses the final requested spending and opening-row price level as decided. Worker helper serialization, the revised label and error handling are covered by the round witnesses and existing parity tests. No actionable R46 finding was confirmed.

### R47 — NO-GO

The senior sunset reaches both the estimator and the solver. The high-earner catch-up uses the prior-year wage threshold, routes to designated Roth when available and enforces the no-Roth alternative. SE compensation uses the deductible half of SE tax; HSA windows honor the Medicare start. Threshold, spouse, contribution and settlement witnesses pass.

R47-01 and R47-02 are untested combinations within those repairs: traditional plus Roth carried excess, and owner-specific business deferrals plus the spouse's salary. Both fail on the introducing tag and remain in every later stack.

### R48 — NO-GO

Medicare premium growth, the Part D input, dated inherited status, the chosen community-property switch and Arizona gain subtraction pass the independent cases. The Arizona senior subtraction is enacted: [2026 Chapter 140, section 15, paragraph 35](https://www.azleg.gov/legtext/57leg/2r/laws/0140.htm). The online codified 43-1022 page served during review still stopped at paragraph 33; that discrepancy was resolved against enacted session law and is **not** a missing-law finding. [CMS's 2026 Part B figures](https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles) confirm $202.90 monthly and the $283 deductible.

The inherited/own pool distinction needs its rollover boundary completed (R48-01). R47's blockers are also carried. The owner's next-row contribution election, traditional-only inherited scope and plan-wide community assumption remain disclosed decisions.

### R49 — NO-GO because earlier blockers remain

No separate defect was confirmed in this round. The flexibility cut stops at the selected strategy's floor, and spending already below it stays below without a further cut. Fractional LTC onset conserves weighted duration. PMI stops at an explicit age or the stated latest legal midpoint; the 78% automatic termination remains an explicitly unmodeled earlier route. [12 USC 4902(c)](https://www.law.cornell.edu/uscode/text/12/4902) supports the midpoint boundary, conditional on current payments; [4901](https://www.law.cornell.edu/uscode/text/12/4901) defines the applicable mortgage/insurance scope.

The payoff residual and warning rendering were reviewed, including the working-years check's deliberately limited budget scope. R51's subsequent decision supersedes R49's salary-only stream treatment. The 34 witnesses and three focused cases pass. The tagged stack nevertheless carries R47-01, R47-02 and R48-01.

### R50 — NO-GO

The regular contribution/conversion/earnings ordering, the two five-year concepts, owner aggregation, early tax funding and partial-first-year marginal tax are exercised. Same-owner Roth IRA rollovers correctly leave the aggregate ledger untouched. Roth 401(k) clocks and pro-rata basis remain the owner's disclosed exclusion.

R50-01 is a lifecycle omission: the new ledger records the provisional conversion split without the established final settlement. This survives R51's optimizer change. First-year MAGI and payroll limitations remain the owner's disclosed scope; they are not reopened here.

### R51 — NO-GO because four financial blockers remain

The default changes only the decided flexibility input and its fallback. The successor control is a justified input change, not an output declaration against changed inputs. The first-dollar Roth weight reads the actual account order and ledger prefix. The owner's D6 decision about a Roth 401(k) preceding the IRA is retained.

The Medicare health intervals use the same start as HSA eligibility and correctly intersect partial retired and idle-spouse spans. Working streams include the marginal federal, Arizona, payroll and SE tax, with the wage-only baseline canceled. Their focused checks and all 26 follow-up witnesses pass. No additional R51 finding was confirmed; the four earlier defects still execute on this tag.

## 4. Twenty focused simulations and output analysis

Companion: [`S5AA_R46_R51_CHATGPT_SIMULATIONS_20261004.js`](S5AA_R46_R51_CHATGPT_SIMULATIONS_20261004.js). **20 cases, 29 recorded plan executions, 176 checks; 16 cases PASS and 4 FAIL.** Controls and subchecks are grouped within each focused case. The Monte Carlo cases execute 1,256 paths in total, separate from the source suite. Invalid-correlation refusal is an intentional negative control.

| ID | Focus | Expected versus observed | Result |
|---|---|---|---|
| S01 | Shared market shocks, one account versus five | All 10 closing rows' total/q10/q90 agree within one cent; success unchanged | PASS |
| S02 | Five-class negative-correlation boundary | $300,000 × 1.05³ = $347,287.50; zero spread; rho −0.251 refused by both layers | PASS |
| S03 | Household reserve on small accounts | 6.75% blended return; over-full reserve 3%; split-account final value agrees | PASS |
| S04 | Senior and Arizona sunset | Tax $4,949 in 2026; $5,819 in 2029; $870 increase | PASS |
| S05 | Roth catch-up and plan availability | $24,500 pre-tax/$8,000 Roth; tax $41,601.50; no-Roth control redirects $8,000 | PASS |
| S06 | Simultaneous carried IRA excess | Initial excise $750 correct; following year **$300 expected/$150 actual** | **FAIL: R47-01** |
| S07 | SE deferral with spouse wages | AGI correct; **$35,912.62418 expected/$35,032.62418 actual** | **FAIL: R47-02** |
| S08 | HSA stop at Medicare 64.25 | $1,350 contributed, no later deposit | PASS |
| S09 | Medicare inflation and Part D input | $3,917.80 then $4,035.334 | PASS |
| S10 | Inherited-to-own IRA basis | **AGI $30,000 expected/$37,500 actual; tax $1,767.50/$2,855**; static validator also rejects as described above | **FAIL: R48-01** |
| S11 | Community-property survivor basis | All three taxable-account bases reset to $80,000; tap output neutral | PASS |
| S12 | Arizona eligible LTCG share | Withdrawal $79,597.50/.990625 = $80,350.79; no-share control $80,605.06 | PASS |
| S13 | Floor and below-floor stage | $24,000 floor holds; $15,000 stage stays $15,000 | PASS |
| S14 | LTC onset 72.25, weighted two years | $18,000/$24,000/$6,000, totaling $48,000 | PASS |
| S15 | PMI midpoint/override and payoff residual | Seven months × $80 = $560; override $960/$480; residual $176,000 | PASS |
| S16 | Roth basis exhaustion and gross-up | First tax $0; next tax $1,362.50/.775 = $1,758.06; closing Roth $58,241.94 | PASS |
| S17 | Conversion expiry and settled basis | Old-conversion draw untaxed; **nontaxable recent conversion $0 expected/$500 actual**; exception control $0 | **FAIL: R50-01** |
| S18 | Income before partial first year | Marginal income tax $4,250; whole-row control $3,217.50 | PASS |
| S19 | Shared Medicare/HSA date inside retired row | Health $3,796.42 then $3,185.68; HSA $2,700 working-half contribution, none later | PASS |
| S20 | Net working streams and next Roth dollar | Working shortfall $720.50; basis weight 0, exposed earnings weight 75 | PASS |

### Interpretation

The passing cases support the changed covariance, reserve, legal sunset, premium, spending and timing mechanisms. They do not establish correctness for arbitrary plans. The four failed cases expose **cross-boundary state and attribution errors** which the existing witnesses do not cover. The quote and committed calculation use the same wrong state in several cases, so internal agreement and conservation can coexist with wrong tax.

Simulation setup corrections were resolved before the final result above: use the actual `partDPremium` input; provide the amount stage's growth policy; observe the documented excise true-up field; use a $37,500 expense to force the intended $7,500 IRA distribution after pension offset; and correct the hand-derived marginal-tax calculation to $8,770 − $5,020 + $500 = $4,250. These were auditor fixture/oracle mistakes, not source defects. S10's pre-existing static-validator rejection is retained in the evidence rather than hidden.

### Reproduce

From the report branch, with Windows and Node 24.17.0:

```powershell
git worktree add --detach ../r51-review s5aa-r51-source
node audit/S5AA/R51/S5AA_R46_R51_CHATGPT_SIMULATIONS_20261004.js ../r51-review ../r51-results.json
```

The script writes the plans, validator diagnostics, engine results, expected/actual checks and source SHA into the requested local JSON. Exit **1 is expected on the audited R51 source**, because the four findings reproduce. For one finding, append `--only S06`, `--only S07`, `--only S10` or `--only S17`. Other source-tag worktrees can be supplied as the first argument. R47 S06/S07, R48 S10 and R50 S17 reproduce at their respective tags; R45's S10 engine figures and R49's S17 financial checks provide the predecessor controls.

Reproduction script SHA-256: `0ae98dc6d4b3d9dd4a4e9b2d2214f4eb0fe6bb2e1033e687337e2de49a14aec2`.

## 5. Prediction, integration and control audit

The original prediction commits are ancestors of their source repairs: R46 `aaa1852 → 8d2e288`; R47 `0f333b8 → f02e26a`; R48 `7fec79a → 126c7f1`; R49 `6292431 → 62964a1`; R50 `88b7496 → 2d9ede3`; R51 `d663f16 → b722884`, and addendum `7f1e131 → 2f73b85`. Source edits and the committed prediction records were reviewed separately from retrospective correction. The corrected proofs are retrospective evidence explicitly required by the owner; they do not rewrite the original misses as successful predictions.

- **R47 corrected proof:** independently rerun on the pre-repair source; JSON exactly equals the committed corrected scan. Its named set equals the 24 measured movers and its predicted directions match. The isolated path comparison independently gives **179/179** changed/named golden paths and **18/18** sensitive-band paths, with zero missed or extra paths.
- **R48 corrected proof:** independently rerun; the unchanged committed result names **37** movers. Comparison with the isolated captures has no named-but-unmoved plan and agrees on the recorded directions. The baseline-return and pay-first readers that caused the original miss are included.
- **R50 corrected proof:** independently rerun; exposed path sets exactly equal the recorded sets. Comparing with the **isolated R50 repair** confirms the superset for every MC plan: golden **16 exposed/16 changed**, seed:9 **52/52**, sensitive band **111/110**, seed:17 **0/0**. The one extra exposed band path is acceptable under A-11; no changed path is omitted.
- **Integration:** the committed composition measurements distinguish each isolated change from the stacked changes. The intended R47/R48 interaction removes Arizona's otherwise continuing senior subtraction after the federal sunset. R50's wrapper preserves R47's trailing QBI argument; the attribution defect in R47-02 is upstream of that integration.
- **R51 control:** default flexibility changes sixteen control inputs. The predecessor `s5-control` is retained; the successor is captured at the separate default-only commit `b722884f57e7a31df47232c5f430e257b54982f9`. Its 36 entries and committed reference tree are present, historical replay tests now execute, and the final declaration accounts for **21 differences in 11 scenarios**. This is the decided successor-control workflow, not suppression of unexplained output drift.
- **R50 record count:** the corrected `outsideSupportedDomain` count is **four**, independently verified as seed:3, seed:8, seed:11 and seed:15. The prior nine-count note was wrong; correction is retained.

The R48 capture race is a genuine test-isolation issue, disclosed and repaired after its source tag. Its latest source PR gate passes with that repair, and both independent final gates passed. This report neither moves the tag nor treats the later test code as part of the R48 financial implementation.

## 6. E1–E18 determination under A-01–A-11

The earlier accepted dispositions remain the starting point; this review determines what these six rounds change. The checklist's unticked historical boxes are not used as a progress count.

| Criterion | Determination at R51 | Evidence and limit |
|---|---|---|
| E1 | **UNMET; blocks GO** | Four new financial defects above have no repaired, verified or owner-approved not-built disposition. |
| E2 | **Residual not met; accepted exception** | A-09 preserves the historical package uncertainty. Exact public source tags and current reproductions do not erase it. |
| E3 | Met for review evidence; repair proof pending | Source witnesses and prediction-time red runs preserved; all new failures reproduced before any repair. A-02 requires red/green proof for their eventual dispositions. |
| E4 | Structural checks met | Changed common helpers/mirrors and Worker paths are covered; corpus settlement checks silent. S10/S17 show why silence is not independent tax correctness. |
| E5 | **Affected remedy incomplete** | IRA ownership/basis and final conversion settlement boundaries need R48-01 and R50-01. This reinforces E1's hold. |
| E6 | Met within decided scope | Existing failure policies and MC invalidation retained; infeasible correlations fail closed explicitly. |
| E7 | Administrative exception retained | A-09 permits carried unsupported reference cases. Four final corpus entries are flagged and remain **UNQUALIFIED**; new defect cases also must not be certified. |
| E8 | Met | Versioned captures and predecessors retained; fresh R51 capture equals r30 on 71 entries. |
| E9 | Met | Exact R51 tag and main full gates independently exit 0, with the same nine named authorized todos. |
| E10 | Met for the submitted change records | Predictions, explicit misses, owner-required corrected proofs and successor control preserved. Independent corrected scans/path comparisons and capture equality support them. A-10 is not used to excuse these new rounds. |
| E11 | Carried routing retained | Existing X-row/S5b/S6 ownership is not closed by these rounds; no new route is silently declared complete. |
| E12 | Existing disclosures retained; new failures enumerated here | New findings need the implementer's response and register disposition. They are not currently decided approximations. |
| E13 | Existing inventory met | Closeout accepts 12/12. New findings are outside that inventory until responded to; its green result cannot close E1. |
| E14 | Changed-build checks met; A-09 exception retained | Rebuilt artifact/hash checks pass in the gate. Round DOM witnesses and the submitted browser record cover new labels/inputs/disclosures; broader carried disclosure limits remain. |
| E15 | Accepted evidence retained | Submitted R46 and final R50/R51 Chromium/Worker/comparator exercises cover the final stack. Intermediate R47–R49 tags were not separately browser exercised. No fresh independent desktop-browser or second-machine session is claimed here. |
| E16 | Retained | Rejected hunt findings and their reasons are preserved; none is reopened to manufacture a new finding. |
| E17 | Met for this handover's financial claims | Primary statutory, regulatory, IRS, CMS and enacted Arizona sources checked. The stale Arizona codification was resolved. SSA's earnings-estimate caution is supported by its published benefit-estimate analysis; a temporarily inaccessible link is not used as financial authority. |
| E18 | Met for requested scope | The cover note expressly requests sequential change audit and a second pass; this report supplies the response. It is not a whole-model requalification. |

**S5AA remains NO-GO at R51 until the four findings receive verified dispositions.** A-09 can accept specifically carried uncertainty and unsupported reference boundaries; it does not waive newly reproduced errors in these implemented repairs. S5b has not been authorized to start by this report. Release and household-reliance qualification remain separate.

## 7. Handover and remaining limits

Suggested implementation order: (1) R47's shared IRA room and owner attribution; (2) R48's pool-changing rollovers; (3) R50's final conversion allocation and same-year distribution true-up. Before editing, predict each changed corpus plan/path and affected test per the R44.1 checklist, including an explicit “no corpus exposure” result where appropriate. Add the focused witnesses above alongside unaffected controls, then verify estimator/quote/commit/Worker agreement and refresh the declared capture evidence according to the existing control rules.

The owner should receive a separate disposition for each ID. For repaired defects, the next handover should include original-source red output, repaired-source green output, independent arithmetic, prediction-versus-actual, complete gate/closeout results, final source tag and rendered disclosure evidence where changed. Re-run all 20 focused cases on that final tag and explain every movement. A passing suite alone does not answer these findings.

Review limitations: no whole-model recertification; no independent real-browser rerun; no reconstruction of missing private historical evidence. The submitted browser evidence uses one desktop browser and the final stack, as disclosed. The accepted limits on Roth 401(k) qualification, opening traditional IRA basis, Medicare enrollment assumptions, partial-year MAGI/payroll treatment, RMD excise and community-property granularity remain carried. [SSA's published analysis](https://www.ssa.gov/policy/docs/briefing-papers/bp2020-01.html) supports the caution that statement estimates project future earnings; it is not a substitute for entering a retirement-consistent benefit estimate.
