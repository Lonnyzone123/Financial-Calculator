# NO-GO: S5AA R29 External Change Audit and Claude Handover

Independent reviewer: ChatGPT. Date: 2026-09-28 (local, UTC-7).

## Verdict

**S5AA remains NO-GO. Two P1 findings remain in the reviewed transfer behavior.** Passing the gate, sweep, and corpus invariants does not establish that the newly combined transfer rules produce correct financial figures.

| Finding | Severity | Result |
| --- | --- | --- |
| R29-01 | P1 | A late transfer capped to zero still removes the requested dollars from the taxable dividend base, understating income and tax. |
| R29-02 | P1 | Qualified HSA funding never retires IRA basis consumed by the funding, so later deductible money can be withdrawn tax-free. |

R29-01 is an interaction regression introduced by applying the new cap without updating the late-transfer dividend preview. R29-02 is an unrepaired pre-existing basis gap in the funding path now explicitly adopted as a qualified HSA funding distribution; it is **not** claimed to be a newly introduced output regression. Neither is a disclosed limitation in the R29 handover.

The original PCF-01, PCF-02 and PCF-03 witnesses are rechecked and accepted **as those witnesses**, not as certification of every related combination. No source, test, fixture, baseline, decision record, tag or repository setting was changed by this audit. The owner decides repairs; Claude implements them test-first.

## Frozen Source and Scope

- Repository: `Lonnyzone123/Financial-Calculator`, not the similarly named working project.
- Change base: `8009fd84e94aa5a31f6b26630e2cdf274d569a3f`.
- Audited source: **`aaff3f1bb50e1f47944b9e3bc22fe13bacbbf591`**, verified tag **`s5aa-r29.1-source`**. Annotated tag object: `ebc715af65b278ba0a060040f83f97599a79ea3d`.
- Earlier `s5aa-r29-source` at `4ead57c` is not the final review target.
- Scope: R29 transfer classification, contribution room, HSA distributions/funding, realized gains, dated dividends, workplace refusal, worker exports, validator boundaries, rules-page rendering, associated tests and declared corpus movement.
- Read: repository `README.md`, `CONTRIBUTING.md`, `docs/AI_REVIEW_INSTRUCTIONS.md`, `audit/S5AA/WORKING_RULES.md`, the R29 cover note, change handover, self-audit, sweep and relay. Final cover note/handover amendments were read on `main`; calculations used only the frozen tag.
- Publication base: current `main`, `993f76ba87ff80cb5d35078b0f20d649351d65e1`. Its changes relative to the audited tag are records and security/dependency policy files, not calculator source. The audit branch is `audit/chatgpt/r29-aaff3f1`.
- This is not a new full-model certification or an audit of the separate private R28 source. Prior exit-gate exceptions and residual model limits remain outside this change audit.

## Reproduction

The adjacent `S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js` is read-only with respect to the calculator. Run from a checkout of the exact audited tag with Node 24.17.0:

```text
node audit/S5AA/R29/S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js
```

The optional first argument selects another source checkout. The script imports that checkout's engine, validator, native rules and default-plan extractor; it makes no engine modifications. It independently supplies expected financial amounts, requires every witness to validate and calculate without ERROR issues, and prints expected/actual JSON. At the audited tag, exit **1** and **three mismatching witnesses** are expected: paid and reinvested R29-01, plus R29-02. Seven controls pass. A repaired source should eliminate the mismatches, not change their expected values.

## R29-01 [P1]: Use the Allowed Transfer in the Late Dividend Preview

**Evidence at `aaff3f1bb50e1f47944b9e3bc22fe13bacbbf591`.** A valid retired single plan at 60, ending at 61, holds $50,000 in a full-basis taxable source, an empty Roth IRA and $100,000 in non-dividend cash. Returns, inflation, fees and spending are zero; taxable dividend yield is 10%, fully qualified; annual pension is $50,000. It asks to transfer $50,000 at **60.75**, with monthly withdrawals and `redirect`. Pension is not IRA compensation. No money may move into the Roth IRA.

**Affected code:** [new contribution cap, `src/engine.js:3370`](https://github.com/Lonnyzone123/Financial-Calculator/blob/aaff3f1bb50e1f47944b9e3bc22fe13bacbbf591/src/engine.js#L3370), [uncapped late preview, line 3412](https://github.com/Lonnyzone123/Financial-Calculator/blob/aaff3f1bb50e1f47944b9e3bc22fe13bacbbf591/src/engine.js#L3412), [dividend use, line 3499](https://github.com/Lonnyzone123/Financial-Calculator/blob/aaff3f1bb50e1f47944b9e3bc22fe13bacbbf591/src/engine.js#L3499), and [late execution, line 3568](https://github.com/Lonnyzone123/Financial-Calculator/blob/aaff3f1bb50e1f47944b9e3bc22fe13bacbbf591/src/engine.js#L3568).

The late preview uses `min(requested, source date value)` before the contribution clamp in `runTransfer()`. `transferHeld` therefore subtracts the requested $50,000 for the last quarter of the year even though the actual transaction moves **$0**. The warning correctly says $0 moved; the Roth balance is zero; calculation status is `ok` with no ERROR issue.

| First projected row | Expected | Actual |
| --- | ---: | ---: |
| Roth IRA balance | $0.00 | $0.00 |
| Paid dividends | $5,000.00 | $3,750.00 |
| Federal AGI | $55,000.00 | $53,750.00 |
| Total tax | $4,792.50 | $4,761.25 |
| Ending portfolio/net worth | $195,207.50 | $195,238.75 |

**Hand arithmetic:** unchanged holdings require `$50,000 x 10% x 1 = $5,000`, not `$50,000 x 10% x 0.75 = $3,750`. With the shipped single $16,100 standard deduction and ordinary brackets, federal tax on the $50,000 pension is `$12,400 x 10% + $21,500 x 12% = $3,820`; these qualified dividends remain in the zero-rate band. The model's Arizona estimate is `($55,000 - $16,100) x 2.5% = $972.50`, giving $4,792.50 total. Missing $1,250 of dividends understates that state estimate by **$31.25**, leaving net worth **$31.25 too high**. This uses the model's disclosed state proxy, not a certification of actual Arizona filing liability.

**Controls:** transfer off, at 60, and at 60.5 each produce $5,000 dividends, $55,000 AGI and $4,792.50 tax. Setting payout start to 65 exercises reinvestment: actual AGI is $3,750 versus the independent $5,000 expectation and the no-transfer control. The affected code also understates the reinvested basis addition. A separate 0%-qualified-dividend check yields tax $5,211.25 instead of $5,392.50, a **$181.25** understatement. Thus the defect is not limited to the state proxy or to paid dividends.

**Regression evidence:** at base `8009fd8`, the late fixture actually moved $46,250 after the dividend draw; its $3,750 dividend allocation followed a real transfer. R29 correctly prevents that contribution but leaves the old planned allocation intact. This report does not claim the base's unrestricted contribution was correct.

**Test gap:** [the new source-dividend assertion, `tests/audit-s5aa-r29-held-dollars-prototype-ids.test.js:69`](https://github.com/Lonnyzone123/Financial-Calculator/blob/aaff3f1bb50e1f47944b9e3bc22fe13bacbbf591/tests/audit-s5aa-r29-held-dollars-prototype-ids.test.js#L69), expects $22,500 on a $300,000 source under the default redirect policy, zero compensation and an empty Roth. Its premise says money moved, but the cap allows no contribution. That expectation should be $30,000 for a zero move, or its fixture must deliberately permit the stated transfer. Checking several account IDs does not repair the wrong financial premise.

**Reach/consequence:** none of the 70 expanded corpus members reaches this capped late-dividend combination. All eleven enabled corpus transfers are at integer year openings. Valid fractional-date plans with paid or reinvested taxable yield are exposed; partial caps also use the requested rather than allowed amount. Household income, taxes, dividend cash allocation and taxable basis can therefore be wrong without an error result.

**Proposed repair:** make the preview and execution share the same refusal/remaining-room decision, and reconcile dividend held-dollar accounting to what can actually move after the draw. Do not merely special-case zero room: cover partial room, source depletion, workplace refusal, paid/reinvested dividends and each withdrawal timing. Add an independent zero-move/no-transfer equivalence test and a partial-cap hand ledger. Keep ordinary IDs and prototype-sensitive IDs in those controls.

## R29-02 [P1]: Remove IRA Basis Actually Consumed by Qualified HSA Funding

**Evidence at `aaff3f1bb50e1f47944b9e3bc22fe13bacbbf591`.** The accepted own-traditional-IRA-to-HSA path avoids ordinary distribution accounting entirely, including the transition of the owner's IRA basis. That is correct only while the funding is entirely from pre-tax IRA value. Once it consumes nondeductible principal, the consumed basis remains available in later years.

**Affected code:** [funding classification, `src/engine.js:2522`](https://github.com/Lonnyzone123/Financial-Calculator/blob/aaff3f1bb50e1f47944b9e3bc22fe13bacbbf591/src/engine.js#L2522), [distribution/basis exclusion, line 3401](https://github.com/Lonnyzone123/Financial-Calculator/blob/aaff3f1bb50e1f47944b9e3bc22fe13bacbbf591/src/engine.js#L3401), and [annual basis settlement, line 482](https://github.com/Lonnyzone123/Financial-Calculator/blob/aaff3f1bb50e1f47944b9e3bc22fe13bacbbf591/src/engine.js#L482). No funding-basis adjustment is supplied to that settlement.

**Independent rule:** [IRS Notice 2008-51, "Tax treatment of qualified HSA funding distributions"](https://www.irs.gov/irb/2008-25_IRB#NOT-2008-51) applies the funding first to amounts that would be taxable on a full IRA liquidation. Its $2,000-value/$200-basis/$1,500-funding example leaves the $200 basis intact. Funding above the taxable pool consumes basis instead; that excess basis does not carry into the HSA. Consequently an all-basis IRA cannot transfer principal away while retaining the basis of that departed principal. This is different from ordinary pro-rata IRA distribution pricing.

**Valid three-year witness, all returns/yields/inflation zero:**

1. Age 60 to 61: $200,000 employment income; $8,600 traditional IRA contribution and $1,000 traditional workplace contribution. Workplace coverage and income above the deduction phaseout make the IRA contribution entirely nondeductible. Opening IRA basis was zero, so all $8,600 basis is created **inside the projection**. Cash starts at $100,000; HSA starts empty.
2. Age 61 to 62: both planned contributions stop; income is zero. Fund the owner's HSA with $5,400 from the IRA at 61. The IRA has no pre-tax value, so remaining IRA value **and basis** must be `$8,600 - $5,400 = $3,200`. Workplace value is still $1,000. The HSA receives $5,400 with neither ordinary income nor a deduction.
3. Age 62 to 63: $30,000 employment income; add $2,000 to the IRA with no workplace contribution/coverage that year. This IRA contribution is deductible. A $100,000 one-time expense and manual order `preTax,taxable,roth,hsa` liquidate the $5,200 IRA and $1,000 workplace balance.

**Hand arithmetic:** the final IRA's taxable draw is `$5,200 - $3,200 = $2,000`. Final AGI is `$30,000 wages + $2,000 IRA income + $1,000 workplace income - $2,000 IRA deduction = $31,000`.

| Final projected row | Expected | Actual |
| --- | ---: | ---: |
| Federal AGI | $31,000.00 | $29,000.00 |
| Total tax | $4,207.50 | $3,917.50 |
| Pre-tax balance | $0.00 | $0.00 |
| HSA balance | $5,400.00 | $5,400.00 |
| Ending portfolio/net worth | $181,722.00 | $182,012.00 |

The stale basis shields the later **deductible** $2,000 contribution again. Tax is **$290 too low**, and final net worth **$290 too high**. Hand tax under the shipped rules: federal `($12,400 x 10%) + ($2,500 x 12%) = $1,540`; Arizona proxy `$14,900 x 2.5% = $372.50`; payroll `$30,000 x 7.65% = $2,295`; total **$4,207.50**. The missing $2,000 is in the 12% ordinary federal band and 2.5% state estimate: `$2,000 x 14.5% = $290`.

**Controls/classification:** the funding-year account balances and zero AGI are correct, so a one-row funding test misses the defect. With transfer off, final AGI is $31,000, tax $4,207.50 and total $181,722; it liquidates more IRA principal but recovers the corresponding genuine basis. Both plans validate, return `ok`, and have no ERROR issue. The same final $29,000 AGI was independently observed at base `8009fd8`: this is a pre-existing, undisclosed missing basis transition left unaddressed by R29's new explicit funding rule, not a new delta in that witness. It does **not** depend on the disclosed lack of opening IRA-basis input.

**Reach/consequence:** none of the 70 expanded corpus members has an own-traditional-IRA-to-HSA funding transfer. The supplied sweep has zero opening/projected IRA basis and one-year plans, so it cannot expose subsequent reuse. The affected class is funding that consumes some or all basis generated by nondeductible projected contributions, followed by taxable IRA principal or growth. Income and tax are understated; retained cash/net worth are overstated.

**Proposed repair:** model a separate qualified-funding basis transition using the source owner's aggregate IRA taxable pool: consume taxable value first and only then reduce the basis actually transferred. Carry that reduction through annual settlement; do not charge ordinary income, take an HSA deduction or apply ordinary pro-rata distribution treatment. Add all-basis and mixed-pool multi-year hand expectations, including a control where sufficient pre-tax value leaves basis unchanged, and a later deductible contribution/liquidation. Pool and owner boundaries must remain explicit. The owner should decide any broader funding-election/eligibility scope separately.

## Verification Ledger

Local executions used Node **v24.17.0**, PowerShell and the Windows desktop host (NT build **26200**, display version **25H2**). The audited source was unchanged; only this report and its adjacent repro were added after verification. Dependencies were installed with `npm ci --ignore-scripts --offline` using the existing cache; jsdom **30.0.1** was present. No clean-install/network-install qualification is claimed.

| Check actually run/read | Result |
| --- | --- |
| `npm test` at the exact tag | Gate passed: **2,925 tests; 2,916 pass; 0 fail; 0 skip; 0 cancelled; 9 authorized todos**. All 356 declared files ran (355 matching `*.test.js`, plus `regression-suite.js`). |
| R29 supplied transfer sweep | **1,512 plans; 4,476 checks; 0 problems**. Its one-year, zero-return, single-owner witnesses do not cover the two findings above. |
| Expanded capture | **70 complete plans**: 5 golden, 20 seeds, 11 targeted, 34 expansion; modes 49 simple, 4 Monte Carlo, 17 historical. No excluded entry. |
| Expanded corpus invariant check | All seven named checks pass. Independent input/roundtrip and relevant shape checks retain the tool's disclosed skips for the eleven targeted recipes. These are not independent financial oracles for every row. |
| Diff versus registered r17 expanded baseline | Expected nonzero `CHANGED` result: **3 members / 33 fields**, matching the handover's `seed:4`, `seed:9`, `seed:13`. No fixture/baseline was updated. |
| Adjacent independent boundary repro | Ten witnesses/controls: **three financial mismatches**, seven passing controls; all validate and calculate `ok`. |
| Other targeted checks | Shared spousal IRA compensation/remaining room, planned HSA room, direct-HSA deduction and zero-return taxable-source gain recognition at opening/mid/late dates behaved as expected in the checked cases. |

Expanded capture provenance:

```text
gitCommit: aaff3f1bb50e1f47944b9e3bc22fe13bacbbf591
corpusInputHash: 9b107562529731ad36ac45395080bfc436be26ca2aed5f89722cfc1b0cf14827
corpusOutputHash (meta.hash): 5a67d57e35136788bba4d96f4f24dcb721fbf4f70ab7fc3077021d7c6d122766
```

The output hash is from the capture metadata, not a hash of this report.

**Declared movement rechecked:** `seed:13` adds one HSA-room warning; `seed:4` has 28 changed fields, including lifetime taxes `$105,933,597.5023472 -> $105,937,429.16504052` and final net worth lower by approximately $4,521.54; `seed:9` has the new workplace-refusal issue and three Monte Carlo percentile changes. This r17 comparison is the disclosed comparison, not an assertion that the private-history baseline is a fresh public-base capture.

**CI attribution:** [gate run 36501594075](https://github.com/Lonnyzone123/Financial-Calculator/actions/runs/36501594075), job `109193454069`, passed with the same 2,925/2,916/0/9 counts, Node 24.17.0, on **Windows Server 2025 / NT 10.0.26100**. It ran on PR #4 head `a96bbf148e971807ec75358514f1c56b69ef1830`, not literally the audited tag. The verified tag-to-head compare contains only four audit-record amendments, so the tested calculator source matches. No Actions run was returned for the exact tag SHA. [CodeQL run 36501590808](https://github.com/Lonnyzone123/Financial-Calculator/actions/runs/36501590808) was successful; the rules-page tests and source inspection support the text-node/HTTPS repair in the inspected paths. CI is not the local Windows desktop qualification or a model certification.

## Repair Dispositions and Disclosed Limits

| R29 item | Reviewer disposition |
| --- | --- |
| PCF-01, HSA transfer out | Original witness and tested qualified-share/age behavior accepted. No new defect found in those checks. |
| PCF-02, contribution cap | Original zero-compensation transfer witness accepted. Late-dividend accounting is incomplete: R29-01. |
| PCF-03, prototype-sensitive IDs | Original $15,000 destination witness accepted; null-prototype maps repair the key collision. The late-source test has the separate R29-01 premise defect. |
| Workplace refusal | Engine/validator boundary accepted for tested pairings; no blanket certification of all rollover law. |
| Own IRA-to-HSA funding | Exclusion, no deduction and contribution-room behavior accepted in zero-basis checks; basis transition incomplete: R29-02. |
| Taxable-source gain | Date-basis gain recognized in the checked zero-return early/mid/late cases; no new issue found there. |
| Rules-page DOM repair | Inspected text-node rendering and HTTPS link restrictions accepted in scope. |

Known limits in handover section 6 remain excluded from new findings: HSA eligibility/Medicare, custom-account limits, RMD credit for funding/non-taxable destinations, Roth ordering/five-year rules, `warn` treatment of excess, and the absence of a newly registered expanded baseline. No attempt was made to reopen those choices.

One disclosed RMD interaction was reproduced for clarity, **not numbered as a new finding**: at 80, a self IRA with $100,000 transfers $9,750 to the spouse's HSA, with $60,000 pension and RMD enabled. The engine also withdraws `$100,000 / 20.2 = $4,950.4950495`, leaving pre-tax $85,299.5049505 and AGI $64,950.4950495. The handover's no-credit language covers the observed behavior. Its broader treatment of ordinary distributions into another person's HSA merits a separate owner decision, without changing this audit's finding count.

## Claude Handover

1. Reproduce R29-01 and R29-02 on the frozen tag before editing source. The report-only repro deliberately fails its financial oracle at that tag.
2. Ask the owner which proposed repairs to implement. Preserve the distinction between the new cap/dividend interaction and the pre-existing funding-basis gap.
3. Add independent regression tests with the figures above. Repair preview/commit consistency and the funding-specific basis transition without weakening controls or substituting engine-generated expectations.
4. Run the supported local gate, the supplied sweep, and the expanded capture/invariant checks. Declare every corpus movement; newly added boundary fixtures are necessary because none of the current 70 members reaches these defects.
5. Answer finding by finding with reproduction, repair commit, tests, financial movement and remaining decisions, then supply a new exact source tag for independent review. Do not interpret this report or a passing report-PR check as repair approval, a merge instruction or GO.

**Final determination: NO-GO.** Source remains read-only; this pull request contains only the independent audit report and reproduction script.
