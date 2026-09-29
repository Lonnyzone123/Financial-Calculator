# NO-GO: S5AA R30 External Change Audit and Claude Handover

Independent reviewer: ChatGPT. Date: 2026-09-28 (local, UTC-7). All witnesses below are synthetic.

## Verdict

**S5AA remains NO-GO. R30-01 is P1: year-end settlement changes the IRA basis consumed by qualified HSA funding when value changes after the funding date.** Gains can restore already-consumed basis; losses can consume additional basis. Subsequent AGI, tax and retained cash are wrong without a calculation error.

The original R29-01 paid/reinvested witnesses and original zero-return R29-02 witness are requalified at the exact R30 tag. The RMD-credit repair also passes the checked cases. That acceptance is bounded: the R29-02 repair is not complete for nonzero returns, as R30-01 shows. Passing the full gate and unchanged corpus do not imply GO.

This is a report-only review. No calculator source, tests, fixtures, baselines, model decisions, tags, settings or other author's records were edited. The owner decides repairs; Claude implements them test-first.

## Frozen Scope

| Item | Reviewed identity |
| --- | --- |
| Repository | `Lonnyzone123/Financial-Calculator` |
| Base | `df8f8b4414d1e31f70abbfffaf6ebff4186dbe63`, the R29 report merge |
| Source | **`66c406c9e3e775f3c4a70013c9a10b85a3222de3`** |
| Verified tag | **`s5aa-r30-source`**, annotated tag object `81dc5911eb93ea1808f20766c1a2774cd4a85b9c` |
| Source commits | `c9f6556` RMD credit; `bf4d3d8` funding/basis; `66c406c` dividend/protection repair |
| Intervening documentation | `03341c5`, eb's R29 placement, as disclosed in the handover |
| Report publication base | Current `main`: `bf9c6ef2816e123756ef00b32a74f319df6c9fde` |
| Report branch | `audit/chatgpt/r30-66c406c` |

Read the final R30 cover note, handover, self-audit, sweep and relay on `main`, plus the standing working rules. Reviewed the base-to-tag calculator changes, four new test files, two intentional re-fixtures, worker export, artifact pin and relevant metadata/documentation changes. Calculations used the detached, exact source tag. The records added after the tag and the subsequent protection-scope confirmation do not change calculator source. This is a change audit, not a new full-model certification or a private R28 audit.

## R30-01 [P1]: Preserve the Funding-Date Basis Reduction Through Annual Settlement

**Evidence at `66c406c9e3e775f3c4a70013c9a10b85a3222de3`.** `runTransfer()` computes the basis a qualified funding transfer consumes from the owner's IRA value **at the transfer date** and immediately removes it. The row records only the gross `qhfd`, not that basis reduction. `settleIraYear()` then recomputes the consumed basis from December 31 value plus annual flows and overwrites the owner's closing basis. A later investment gain or loss therefore changes the basis of principal already transferred away.

**Affected code:** [funding-date calculation and gross-only tally, `src/engine.js:3433`](https://github.com/Lonnyzone123/Financial-Calculator/blob/66c406c9e3e775f3c4a70013c9a10b85a3222de3/src/engine.js#L3433); [year-end recalculation, lines 490-496](https://github.com/Lonnyzone123/Financial-Calculator/blob/66c406c9e3e775f3c4a70013c9a10b85a3222de3/src/engine.js#L490); [settlement call and closing-basis overwrite, line 3881](https://github.com/Lonnyzone123/Financial-Calculator/blob/66c406c9e3e775f3c4a70013c9a10b85a3222de3/src/engine.js#L3881).

**Independent rule:** [IRS Notice 2008-51, "Tax treatment of qualified HSA funding distributions"](https://www.irs.gov/irb/2008-25_IRB#NOT-2008-51) determines the basis remaining following the funding and illustrates it immediately after the transfer. Taxable IRA value is used first; any excess funding consumes basis, which does not carry into the HSA. [IRC 408(d)(9)(E)](https://www.law.cornell.edu/uscode/text/26/408#d_9_E) supplies the taxable-first rule. Later investment growth is not a new nondeductible contribution and cannot recreate transferred basis. [Form 8606 instructions, line 7](https://www.irs.gov/instructions/i8606) exclude the one-time HSA funding distribution from ordinary distributions. Retaining annual settlement for ordinary draws/conversions does not require revaluing this completed funding transaction.

### Reproduction and Hand Arithmetic

Use the previously published R29 `basisPlan()` without changing its contributions, income, expense or transfer. Set the asset-class return and simple return assumption to **10%**, instead of 0%. All inflation, fees, dividend yield and spending other than the final $100,000 expense remain zero; timing is monthly. Non-dividend cash starts at $100,000. There is no opening IRA-basis input.

1. Age 60 to 61: $200,000 employment income, $8,600 nondeductible traditional IRA contribution and $1,000 traditional workplace contribution. At 61 the IRA holds `$8,600 x 1.1 = $9,460` with $8,600 of projected basis; the workplace account holds $1,100.
2. At 61: fund the owner's HSA with $5,400. Taxable IRA value is `$9,460 - $8,600 = $860`. Funding consumes `$5,400 - $860 = $4,540` basis. **Remaining IRA basis is $4,060**, on $4,060 of remaining IRA value. That year's subsequent 10% growth changes IRA value to **$4,466**, but leaves basis **$4,060**.
3. Age 62 to 63: $30,000 employment income, a deductible $2,000 IRA contribution and the $100,000 expense. With pre-tax balances drawn first at the monthly draw point, the IRA liquidation is `($4,466 + $2,000) x sqrt(1.1) = $6,781.5980122682`. Workplace liquidation is `$1,000 x 1.1^2 x sqrt(1.1) = $1,269.0587062859`.
4. Correct AGI is `$30,000 + $6,781.5980122682 - $4,060 + $1,269.0587062859 - $2,000 = $31,990.6567185541`.

The settlement instead computes taxable value `$4,466 + $5,400 - $8,600 = $1,266`, uses only `$5,400 - $1,266 = $4,134` of basis, and closes at **$4,466 basis**. The **$406 post-funding gain** has been converted into additional basis.

| Final row | Expected | Actual |
| --- | ---: | ---: |
| Federal AGI | $31,990.6567185541 | $31,584.6567185541 |
| Total tax | $4,351.1452241903 | $4,292.2752241903 |
| Settled tax | $4,351.1452241903 | $4,292.2752241903 |
| Tax outstanding | $0 | $0 |
| Pre-tax balance after liquidation | $0 | $0 |

**Tax hand calculation under the shipped rules:** taxable income is `AGI - $16,100`; federal ordinary tax is `$1,240 + (taxable income - $12,400) x 12%`; the disclosed Arizona estimate adds `taxable income x 2.5%`; payroll adds `$30,000 x 7.65% = $2,295`. Restoring $406 basis therefore understates tax by `$406 x (12% + 2.5%) = $58.87`. There is no outstanding true-up that later corrects the discrepancy. Actual final portfolio/net worth is $184,621.8814943637; holding the other cash flows fixed and paying the additional $58.87 from the zero-return cash holding gives **$184,563.0114943637**. The state term is the model's disclosed proxy, not certification of an actual state return.

**Loss variant, same mechanism:** start with an additional $2,000 of pre-tax IRA value and use -10% returns. At funding, `$10,600 x 0.9 = $9,540`, so $940 is taxable and $4,460 of the funding uses basis. Remaining basis/value is $4,140; subsequent loss lowers value to $3,726, **not basis**. Settlement removes a further $414 of basis. Final expected AGI is **$30,060.5940360582**, actual **$30,474.5940360582**; expected tax is **$4,071.2861352284**, actual **$4,131.3161352284**. Tax is **$60.03 too high**, and retained cash/net worth correspondingly too low. A +10% mixed-pool variant restores $626 basis and understates tax by $90.77.

**Controls:** original zero-return witness and a zero-return mixed pool pass. Positive-return funding entirely within pre-tax value passes; positive returns with transfer off pass. An additional spouse-owned IRA/HSA check on a joint return also shows the same $406 AGI understatement ($61,584.6567185541 actual versus $61,990.6567185541 expected). Every checked plan validates, returns `ok`, and has no ERROR issue.

**Delta classification:** the exact base also misprices these funding witnesses because it removes no funding basis at all. For the primary +10% plan, base AGI was $29,269.0587062859 and tax $3,956.5135124115. R30 improves those figures but does not reach the independent expectation. This is an incomplete R29-02 repair with a specifically identified year-end recomputation defect, **not a claim that the primary plan became worse than the base**.

**Reach and consequence:** none of the 70 expanded corpus members reaches this defect; none has an own-traditional-IRA-to-HSA funding transfer. Their input hash is unchanged from the previously inspected R29 corpus. The new plan tests are zero-return, and the direct settlement test's ledgers have no post-funding change in value. The supplied sweeps cannot exercise a funding-date/year-end valuation divergence. The exposed class is basis-consuming funding followed by gains/losses and subsequent ordinary withdrawals or conversions. Taxes can move in either direction without an error flag. This is not the disclosed opening-basis limitation: all witness basis is generated inside the projection.

**Proposed repair:** carry the actual funding-specific basis consumption, measured on the funding date using the correct owner pool, into annual settlement. Do not recompute it from later year-end value. Ordinary annual pro-rata distribution/conversion settlement must use the correctly reduced basis without double subtraction. Add independent positive/negative-return, multi-year ledgers; include sufficient-pre-tax-value and no-funding controls, spouse ownership, multiple owner IRAs, and ordinary draws/conversions in the funding year. Preserve the separately disclosed QCD/funding ordering decision unless the owner changes it.

## Durable Repro

The adjacent script imports the reviewer's existing R29 fixture builder and supplies a separate date-based basis and tax oracle; it does not call `settleIraYear()` to derive expected results or modify the engine.

```text
node audit/S5AA/R30/S5AA_R30_EXTERNAL_AUDIT_REPRO_20260928.js
```

An optional argument selects another read-only checkout. At the audited R30 tag, **three variants mismatch and four controls pass**, with exit **1** deliberately reporting the financial mismatches. All seven plans validate and calculate without ERROR issues. At the exact change base, five of the seven cases mismatch and two controls pass. A complete repair should make all seven pass; do not replace the expectations with engine output.

Separately, the original `audit/S5AA/R29/S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js` now returns **0 mismatches**, all ten witnesses/controls passing at the R30 tag. Its historical footer still describes what was expected at the original R29 source; the numeric verdicts are unambiguous.

## Verification Ledger

Local work used Node **v24.17.0**, PowerShell and the Windows desktop host (NT build **26200**, display version **25H2**). Locked dependencies were installed from the existing cache with `npm ci --ignore-scripts --offline`; jsdom **30.0.1** was present. No clean/network-install qualification is claimed. Calculator tracked files remained unchanged before and after execution.

| Check actually executed/read | Result |
| --- | --- |
| Exact-tag `npm test` | **GATE PASSED: 2,947 tests; 2,938 pass; 0 fail, skip or cancelled; 9 authorized todos**. All 360 declared files ran: 359 `*.test.js` files plus `regression-suite.js`. |
| Original R29 external repro | Ten passing cases; zero mismatches. |
| R29 supplied transfer sweep | **1,512 plans / 4,476 checks / 0 problems**. |
| R30 supplied dividend sweep | **552 plans / 1,320 checks / 0 problems**. Executed the published script read from `main`, blob `32c4a6178b343a8541586274e606c0e7b4f68e49`, against the frozen source; the records script is not present at the earlier source tag. |
| Expanded capture | **70 complete plans**, no exclusions: 5 golden, 20 seeds, 11 targeted, 34 expansion; 49 simple, 4 Monte Carlo, 17 historical. |
| Expanded invariant check | Seven named checks pass, retaining the tool's eleven targeted-recipe input/roundtrip skips and two plan-dependent shape-check skips. This is not an independent financial oracle for every row. |
| R29-to-R30 expanded diff | **IDENTICAL** output entries; input and output hashes unchanged. |
| New external basis repro | Three mismatching variants of R30-01; four passing controls. |
| Additional return/protection checks | Six late pre-tax-to-taxable source-balance checks pass at -20%, +10%, +30% and two dates. Twelve protected taxable-to-Roth balance checks pass across those returns, two late dates, monthly/quarterly timing and tax funding ordered through pre-tax before Roth. |
| Tracked built artifact SHA-256 | `34e1ec4824712c26ecf205f884e36f0836ec8519a0f70fe54e399c3e0fc9df52`, matching the updated harness pin. |

Capture provenance:

```text
gitCommit: 66c406c9e3e775f3c4a70013c9a10b85a3222de3
corpusInputHash: 9b107562529731ad36ac45395080bfc436be26ca2aed5f89722cfc1b0cf14827
corpusOutputHash (meta.hash): 5a67d57e35136788bba4d96f4f24dcb721fbf4f70ab7fc3077021d7c6d122766
```

No corpus movement is attributed to R30. Since the entries are identical to the prior capture, the already recorded r17 comparison remains R29's three members / 33 fields; this audit did not create or register a baseline.

**CI attribution:** [run 36511290039](https://github.com/Lonnyzone123/Financial-Calculator/actions/runs/36511290039), job `109223768671` (`gate (windows, node 24.17.0)`), passed with the same 2,947/2,938/0/9 counts. Its decoded logs identify Node 24.17.0 and Windows Server 2025 / NT 10.0.26100. It ran on PR #7 head `0ba2632e8d7aa0ce566228f3a13490bb8a113fe3`; the verified tag-to-head compare consists only of six audit-record/index files. No Actions run was returned for the exact tag SHA. CI therefore tested matching calculator source, but is not the Windows desktop qualification or model certification.

## Repair Dispositions and Limits

| R30 item | Reviewer disposition |
| --- | --- |
| R29-01 original zero-room paid/reinvested dividend witnesses | Requalified with the original independent figures. Partial-room and zero-move controls in the new tests pass. |
| R29-02 original zero-return funding/basis witness | Requalified at AGI $31,000, tax $4,207.50, net worth $181,722. General funding-basis repair remains incomplete: R30-01. |
| RMD-credit note | Checked own-IRA funding, spouse-HSA ordinary distribution, partial credit, workplace source and the disclosed late-transfer control. Tested balances/AGI are accepted. |
| Late destination dividend leak and early mirror | Tested zero-return hand ledgers pass; source/destination balance ownership is corrected in those cases. No additional finding in inspected dividend paths. |
| Protect dividend-paying taxable transfers | Accepted within the confirmed owner scope and tested timings/returns. Tax funding may use the destination after it receives the transfer; the held-back rule only protects the earlier spending draw. |
| Re-fixtures and records | The R29 prototype-ID premise is corrected with an explicit `warn` partial move and `redirect` zero-move control; the whole-balance mirror is separately guarded. The disclosed eb placement and subsequent scope confirmation are not unapproved source changes. |

The RMD principle was checked against [26 CFR 1.408-8(g)(1)](https://www.ecfr.gov/current/title-26/chapter-I/subchapter-A/part-1/section-1.408-8#p-1.408-8(g)(1)) and the published text of [26 CFR 1.401(a)(9)-5(g)(2)(i)](https://www.law.cornell.edu/cfr/text/26/1.401%28a%29%289%29-5): distributions are credited without regard to income inclusion, subject to their listed exceptions. The qualified-funding Notice's beneficiary sentence alone was not used to establish the owner's RMD treatment.

Known limits remain excluded from new findings: HSA eligibility/Medicare, custom-account contribution limits, Roth ordering/five-year rules, `warn` excess treatment, no freshly registered public-history baseline, late destination dividends arriving as surplus after the draw, the explicitly limited protection scope, the owner's whole-balance dividend convention, and disclosed QCD/funding ordering. No new finding is made from those acknowledged choices. Browser interaction beyond the existing gate's DOM/worker tests was not separately exercised. A full legal/financial audit of every annual-settlement combination was not performed.

## Claude Handover

1. Reproduce R30-01 on the exact tag, including gain and loss variants. Preserve the passing original R29 witnesses.
2. Obtain the owner's repair decision. Correct the funding-date-to-settlement basis transition, keeping ordinary annual settlement and the disclosed ordering choices distinct.
3. Add independent failing tests before the repair. Run the supported local gate, both supplied sweeps and expanded capture/invariants; identify every changed financial figure, including newly added boundary cases that the present corpus cannot reach.
4. Answer R30-01 with reproduction, repair commit, tests, movement and residual decisions. Supply a new exact tag for independent review. A passing report-PR gate is not repair approval or GO.

**Final determination: NO-GO. One numbered finding, R30-01 (P1).** Only this report and its adjacent read-only repro are proposed for publication; nothing is merged by the reviewer.
