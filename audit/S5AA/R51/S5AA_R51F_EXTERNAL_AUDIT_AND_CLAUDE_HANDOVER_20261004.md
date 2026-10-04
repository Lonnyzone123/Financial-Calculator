# S5AA R51F: full-model external audit and implementation handover

**Verdict: NO-GO.** One additional P2 financial defect is confirmed: **R51F-01**, the Social Security grace-year earnings test. The four financial findings in the preceding R46–R51 audit remain reproducible. Passing tests and conservation checks do not close those findings or qualify affected household figures.

Auditor: ChatGPT. Date: 2026-10-04. The owner requested a full-model audit after the sequential R46–R51 review. This is the second report on that financial source, hence the R51F identifier. Source, tests, fixtures, captures, decision records and previous reports were examined read-only. This report and its reproduction companion are the only additions.

## 1. Frozen source and scope

| Identity | Value |
|---|---|
| Frozen main | `2fb8c6fbd4f283705ad70b568f20a42dd2f8311f` |
| Frozen tree | `1a49b8cfe915fb6825e25c8ae7b6218c98817afa` |
| Financial source tag | `s5aa-r51-source` |
| Financial source SHA | `ee06ea522562ca27262258e13f90f2d2f51ae5e5` |
| Report branch | `audit/chatgpt/r51f-2fb8c6f` |
| Previous audit | [R46–R51 report, merged PR #66](https://github.com/Lonnyzone123/Financial-Calculator/pull/66) |

The frozen main includes the previous report, its reproduction script and the previously disclosed capture-test repair. A fresh comparison of `src/` and `build.js` against the R51 tag is empty. Main was frozen at the start of this pass; later changes are not part of these conclusions. Source references below use frozen main, whose relevant engine line numbers equal R51's.

At publication, main had advanced five documentation-only commits to `5ff3f5b5f24428d9ccb7e442b7978f34e7bd438d` (merged PR #67). No source, test or build file changed. Those records now assign the four previous findings to **R52**, including the post-death validator route and same-year penalty true-up (`SPRINT_QUESTIONS.md` Q192). Their recorded status is decided/not yet built. This audit remains frozen at `2fb8c6f`; it does not audit the R52 development branch. The later documentation does not close the independently reproduced discrepancies.

This pass expanded from the changed rounds to the live model: projection clocks, contributions, employer amounts, withdrawals, basis, conversions, transfers, succession, federal/AZ tax calculations and funding, Social Security, healthcare and IRMAA, spending policies, debts, other assets, deterministic/historical/Monte Carlo projections, validation, aggregation, Worker generation and UI import/export/error handling. It traced computations through callers and final settlement, rather than relying on isolated helper output alone.

Recorded decisions were checked before classifying suspicious behavior. In particular, the full-model request supplies E18's scope; it does not revoke the opening-age draw convention, Q59's working-income boundary, historical proxy limitations, the conversion-start decision or the carried per-employer contribution limitation.

## 2. Confirmed new finding

### R51F-01 [P2] — Any positive job stream incorrectly disables the retirement-year monthly earnings rule

**1. Evidence and commit.** At `2fb8c6fbd4f283705ad70b568f20a42dd2f8311f`, F01–F03 in the companion all pass static validation, return engine status `ok`, and produce too little Social Security. The defect was independently reproduced through actual backup imports, real browser Workers, the compatibility calculation path and CSV export. No unsupported-domain issue explains these witnesses.

**2. Affected code.** [`src/engine.js:3571–3572`](https://github.com/Lonnyzone123/Financial-Calculator/blob/2fb8c6fbd4f283705ad70b568f20a42dd2f8311f/src/engine.js#L3571) requires `!(earnings && earnings.streamSelf > 0)` / `streamSpouse > 0` for grace-year treatment. These are aggregate stream earnings for the entire row, not earnings in each benefit month. [`ssSingle` and `ssFamily`, lines 3621 and 3627](https://github.com/Lonnyzone123/Financial-Calculator/blob/2fb8c6fbd4f283705ad70b568f20a42dd2f8311f/src/engine.js#L3621), consequently apply the annual excess to benefits that should be payable. The earnings object is supplied at [lines 4560–4562](https://github.com/Lonnyzone123/Financial-Calculator/blob/2fb8c6fbd4f283705ad70b568f20a42dd2f8311f/src/engine.js#L4560). Dated employment intervals already exist in `otherIncomeFor`; a positive row total cannot establish that work continues above the exempt amount after retirement.

**3. Reproduction and independent expectation.** Run the companion command in §5. Its F02 plan has:

- Primary age 65, retirement and first benefit entitlement at 65.5, end age 66; single, AZ.
- Salary $50,000 annually, stopping at retirement: $25,000 actually earned in the row.
- A separate employment stream of $12,000 annually, age 65 to 66, with zero growth: $1,000 per month.
- Full-retirement-age monthly benefit $2,000; claim at 65.5; zero COLA. The model's birth cohort has FRA 67.
- $100,000 in an established Roth IRA; zero investment return, fees, inflation, dividends, spending and contributions. Other cost/debt/conversion features are off.

The grace-year rule protects eligible benefit months even when annual earnings exceed the annual exemption. A month with wage services no greater than the monthly exempt amount can be a non-service month; a modest part-time job does not automatically cancel that status. The regulation explicitly illustrates this situation. [20 CFR 404.435(a)(7), (b)(1), Example 1](https://www.law.cornell.edu/cfr/text/20/404.435).

SSA's published 2026 under-FRA monthly limit is **$2,040**. The F02 worker earns only $1,000 in each of the six benefit months and has no self-employment. All six therefore qualify under the monthly rule. [SSA special earnings-limit rule](https://www.ssa.gov/benefits/retirement/planner/rule.html). The 18 early-claim months reduce the $2,000 PIA by `18 × 5/900`, producing **$1,800 per month**, or **$10,800** for six months. [20 CFR 404.410(a)](https://www.law.cornell.edu/cfr/text/20/404.410).

Instead, the engine charges annual withholding of `($37,000 − $24,480)/2 = $6,260`, yielding **$4,540** of benefits. The annual formula is valid for its proper circumstances; the eligibility switch selects it incorrectly here.

| F02 figure | Independent expectation | Actual | Actual minus expected |
|---|---:|---:|---:|
| Social Security received | $10,800.00 | $4,540.00 | −$6,260.00 |
| Federal AGI | $46,180.00 | $40,859.00 | −$5,321.00 |
| Settled total tax | $5,546.10 | $4,907.58 | −$638.52 |
| Closing portfolio | $119,271.40 | $113,649.92 | −$5,621.48 |

The downstream arithmetic is independent of the engine: provisional income is $37,000 + $10,800/2 = $42,400; taxable benefits are $9,180 under IRC 86. Deduction is $16,100 + $2,050 + $6,000 = $24,150. Taxable ordinary income is $22,030, federal tax $2,395.60, AZ tax under the declared model parameters $320, and employee payroll tax $2,830.50. Total tax is $5,546.10. The wage-only baseline on $25,000 is $2,017.50. Within the declared Q59 boundary, the retained outside receipts are $12,000 + $10,800 less incremental tax of $3,528.60, giving the expected closing portfolio. [IRC 86](https://www.law.cornell.edu/uscode/text/26/86), [2026 federal brackets and deductions, Rev. Proc. 2025-32 §§4.01, 4.14](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf), [IRS payroll rates](https://www.irs.gov/taxtopics/tc751).

Related witnesses and controls:

| Group | Employment stream | Expected benefits | Actual benefits | Result |
|---|---|---:|---:|---|
| F01 | $20,000 annual rate, ends at 65.5 before benefits begin; $10,000 earned | $10,800 | $5,540 | FAIL |
| F02 | $12,000 annual rate throughout the year; $1,000 monthly after retirement | $10,800 | $4,540 | FAIL |
| F03 | F02 on the spouse's clock and wages, MFJ | $10,800 | $4,540 | FAIL |
| F04 | $30,000 annual rate, $2,500 monthly after retirement | $0 | $0 | PASS, above-limit control |
| F05 | Zero employment stream | $10,800 | $10,800 | PASS |

**4. Consequence and reach.** The failure is in a narrower but ordinary retirement-transition case: employment streams that end before claim, or continuing wage streams below the monthly exemption, in a retirement/grace year before FRA. Both owners are affected. The three witnesses are accepted by the real app; all three Worker results equal the Node and browser-main results, and all three CSVs preserve the affected outputs. This is a financial error with successful calculation status, rather than a blocked import or an unreachable helper.

No member of the existing 71-entry expanded corpus was confirmed affected by this mechanism. Its three plans containing employment streams do not exercise the witnessed retirement/claim/stream intersection. That coverage gap explains why exact corpus agreement and the green gate do not catch this defect. Future benefit-adjustment credits, tax/MAGI, IRMAA, withdrawals and Monte Carlo results may also move when the wrongly withheld benefits feed later calculations; those later dollar effects were not independently quantified in this pass.

**5. Proposed repair.** Determine wage services and eligibility in benefit months from the owner-specific salary retirement date and dated income streams; use the monthly exempt amount for grace-year non-service months. Preserve the annual test in later years and in nonqualifying months, family withholding allocation and adjustment-of-reduction-factor credits. Add stream start/end breakpoints as needed. Do not fix this simply by ignoring all stream earnings: F04 must continue to withhold.

Test first: ended employment before claim; ongoing wages below, exactly at and above the monthly limit; claim and work boundaries inside a year; multiple streams; both owners; FRA-year handling; and later annual-test behavior. Self-employment substantial services depend on work performed, not merely profit; the current input has no hours/service record. Any expansion for that case needs an explicit input or recorded approximation. The wage-only witnesses above already supply enough data for a repair without inventing self-employment facts.

## 3. Earlier defects reconfirmed on frozen main

The original 20-case companion was rerun on `2fb8c6f`: **16 PASS, 4 FAIL**, the same four mechanisms and amounts. These retain their original identifiers. Their full five-part findings, primary-source checks and proposed repairs remain in [the preceding report](S5AA_R46_R51_EXTERNAL_AUDIT_AND_CLAUDE_HANDOVER_20261004.md).

| Open finding | Current engine location | Reconfirmed discrepancy | Reach qualification |
|---|---|---|---|
| R47-01 | line 4948 | Carried traditional/Roth excess: $300 second-year excise expected, $150 actual | Warn policy; one owner's shared annual IRA room used twice |
| R47-02 | line 4671 | Business owner's workplace deferral plus spouse salary: tax understated $880 | Supported joint-household income/contribution interaction |
| R48-01 | lines 4439, 4456; pool helper line 542 | Inherited-to-own IRA move strands basis: $1,087.50 excess tax | Engine/editor reach; the pre-existing static validator refuses the original owner-changing plan on strict import |
| R50-01 | lines 3135, 4940 | Finally nontaxable conversion retains provisional taxable Roth record: false $500 penalty | Supported conversion and later pre-59½ Roth draw |

The R48 validator refusal is retained in the evidence; it is not relabeled a valid import. The financial mismatch also remains independently checked. The four findings are not closed by inclusion of the previous report in main.

## 4. Full-model coverage and output analysis

### 4.1 Fresh independent probes

The new companion contains **36 named scenario/helper groups, 175 top-level checks and 36 recorded projection executions**, plus the numerical and refusal matrices below. **33 groups PASS; F01, F02 and F03 FAIL**, all manifestations of R51F-01. Matrix helper calls and invalid-input runs are counted separately; they are not described as thousands of distinct household simulations.

| Area | Probes and independent checks | Observed result and limit |
|---|---|---|
| Projection time and growth | F06–F09, F22: ten-year compound return, fractional terminal period, five-year nominal/real spending, real-dollar conversion, interior/end-boundary expenses | Closed forms pass. Expenses at the exact end are deliberately excluded and warned |
| Spending policies | F10, F28; earlier S13: all nine opening-state formulas, percentage depletion, flexibility floors/stages | Pass. Opening-state helper checks are not a proof of every multi-year policy interaction |
| Contributions/employer limits | F23; earlier S05, S06, S07, S08: compensation, catch-up routing, excess carry, SE attribution, Medicare stop | Controls pass; R47-01 and R47-02 remain open |
| Federal/AZ tax, SS inclusion, NIIT/payroll | F25: **864 calculations / 5,184 component comparisons** across three filing statuses, two age cases, ordinary income, capital gains and SS | No mismatch; maximum component error $0.00000000000728. No itemization/AMT/foreign exclusions/credits are certified |
| SE tax and QBI | F34: **72 calculations / 504 component comparisons**, including the $400 net-earnings boundary, per-person wage-base room, Additional Medicare and QBI phase-in/minimum | No mismatch; maximum component error $0.0000000000291. This no-plan-deferral helper matrix does not negate R47-02's integration error |
| Tax funding and taxable sales | F11, F24: independent bisection of cash minus independently computed tax, at deduction/bracket boundaries and with zero-basis gains | Pass; traditional funding maximum gross error $0.000000000233. Oracle calls no engine tax/rule helper |
| Basis, losses and conversions | F35; earlier S09, S10, S11, S12, S16, S17, S18 | Loss-carry controls and other independent witnesses pass; R48-01 and R50-01 remain open |
| SS claiming, earnings and household clocks | F01–F05, F29; existing round witnesses and broad corpus | Early/delayed benefit factors and controls pass. Grace-year failure independently confirmed for both owners |
| RMD/QCD/HSA/penalties | F12, F13, F30; earlier S08, S10, S11, S16, S17 | Controls pass within recorded opening-age/birthday conventions. These do not certify every inherited-beneficiary configuration |
| Healthcare, IRMAA and LTC | Earlier S04, S14, S19; source trace of Medicare spans/lookback/settlement; conservation sweep | Witnesses pass. Probabilistic LTC is an expected-cost approximation, not a simulation of individual care episodes |
| Debt and housing | F14–F17; earlier S15: live fixed-rate closed form, fractional payoff, credit-card minimum, remaining-term ARM recast, PMI | Pass. The live ARM remains a single-reset model; the standalone multi-reset module does not replace it |
| Other assets/net worth | F18 and row reconciliation | Midyear availability spends only the accessible half-year budget; remaining asset and shortfall reconcile |
| Monte Carlo | F19, F20, F33; earlier S01–S03: zero-volatility closed form, seed repeatability, input immutability, changed-seed sensitivity, Gaussian quantiles, common shocks/PSD/reserves | Pass. Quantile and split-account checks have distinct purposes; consistency is not a legal oracle |
| Historical projections | F21, fresh browser corpus and heat-map source route | Declared two-year proxy replay arithmetic passes. No independent market-series requalification or bond-history validation is claimed |
| Input/result contracts | F26, F27, F31, F32, F36 | **656 invalid-input mutations** refused: 270 scalar numeric, 139 nested numeric, 238 boolean and 9 malformed/nonserializable/identity cases. Overflow of finite inputs also removes primary figures |
| UI/Worker/export | Fresh 75-plan browser protocol plus three new defect witnesses | Worker/main equality, accepted-import CSV equality, fallback/refusal/recovery and concurrent comparison checked; details below |

The federal constants in the separate oracle were checked against Rev. Proc. 2025-32, not copied at runtime from `RULES`. Social Security taxation uses IRC 86; NIIT uses [IRC 1411](https://www.law.cornell.edu/uscode/text/26/1411). SE arithmetic uses [Schedule SE](https://www.irs.gov/pub/irs-pdf/f1040sse.pdf), with the published [2026 SSA wage base](https://www.ssa.gov/oact/cola/cbb.html), and QBI uses [IRC 199A](https://www.law.cornell.edu/uscode/text/26/199A). The downloaded Schedule SE is the 2025 form; its rates/mechanic were checked, and its 2025 dollar base was not reused as 2026's. Arizona tests check the declared 2026 model assumptions; pending Arizona forms remain a qualification condition.

For the one-year 10,000-path Gaussian check, independent population targets were median $105,000, q10 $92,184.48 and q90 $117,815.52. Actual values were $104,952.26, $92,059.25 and $117,739.15. The predeclared sampling tolerance was $2,000; the largest observed error was $125.24. This is a distribution sanity check of the engine's declared arithmetic-normal process, not evidence that real markets are normal or that a real household's success probability is calibrated.

### 4.2 Fresh money-conservation sweep

The existing output-neutral R40 tap/reconciler was freshly run with **1,000 generated plans, seed 20261004, 20,405 projected rows**. It asserts tapped versus untapped rows match before using internal flow observations.

- Invalid inputs: 0. Non-`ok` model results: 0. Unclassified reconciliation failures: 0. Lifetime totals checked: 1,000.
- Maximum portfolio residual: **$0.000000001746**.
- Maximum household/combined residual: **$276.376143**; eight classified residual checks were `WAGE_TAX_CLAMP`.

The eight are reconciler residual checks, not a claim of eight unique bad households. The known clamp loses a portfolio-loss tax saving when total tax falls below the wage-only baseline. It is explicitly carried in [R40's unrepaired list](../R40/S5AA_R40_UNREPAIRED_LIST_20260930.md), so it is not assigned a new finding number. **The sweep does not prove all money is conserved:** it found this disclosed nonzero residual, and an identity cannot detect a flow omitted from both sides. It also cannot detect understated Social Security when the same understated amount feeds both sources and ending cash.

### 4.3 Fresh real-browser qualification

An isolated headless Chrome **154.0.0.0** session on Windows 11 loaded an HTML artifact freshly built from frozen main. It used the repository's R41 `canon.js`, `mathprobe.js`, `harness.js` and `browser_checks.js`, via localhost and a separate scratch browser profile. No existing browser profile or historical artifact was substituted.

| Check | Result |
|---|---|
| A: 71 expanded plans + four refusal/edge plans | **75/75 Worker equals browser main**; 72 exact Node hashes; all key-order comparisons agree; no Worker error |
| B: actual Restore backup and CSV export | **70 accepted, 70 identical Worker/main CSVs**, one Worker response per accepted import; 70/70 app Worker responses equal main on the exact posted plan |
| B: strict import refusals | `seed:9`, `targeted:spouse-cola-income`, debt-reset-age string, health-inflation string, end-before-start; missing-retirement migrates through documented normalization |
| C: Worker load/run faults, deterministic and MC cases | Compatibility fallback preserves CSV; when both calculations fail, no visible dollar figures, tables or chart remain and CSV is refused; debug records failure; restoring calculation recovers reference CSV |
| D: concurrent compare | Four actual concurrent Workers, four responses; every per-scenario result equals main; active CSV equal |
| E: Node/browser differences | Three MC plans only; no noncontinuous differences, no success-rate change, no valid-path-count change |
| New finding witnesses | **3/3 imports accepted**, 3/3 Worker/main/Node equal, 3/3 CSVs equal; exact posted plans and returned wrong income/AGI/tax/portfolio captured |

The three MC results differ from Node in 127, 30 and 120 numeric fields respectively. Maximum relative differences are `9.1304e-16`, `6.0582e-16` and `1.13794e-15`. Success rates remain 95.8%, 100% and 85%; valid path counts remain 500, 52 and 500. Main and Worker math probes agree. This records the actual numerical envelope rather than calling cross-runtime results bit-identical. The `1.13794e-15` maximum is explicitly retained.

Browser agreement establishes that the app carries the computations faithfully. It does not make the computations correct: the grace-year witnesses agree across all routes and remain wrong against the independent expectation.

### 4.4 Gate and closeout

Fresh local `npm test` at frozen main, Windows 11 build 26200, Node **24.17.0**, jsdom **30.0.1**:

**3,473 tests; 3,464 PASS; 0 FAIL; 0 skipped; 0 cancelled; 9 authorized todos; exit 0; GATE PASSED.** The runner executed 443 declared test files, including the explicitly listed regression suite. The nine exceptions are the eight excluded revival-contract witnesses and `ACCOUNT-17-8`, the carried per-employer 415(c) contract. No test or exception was weakened.

Fresh `closeout-check`: **COMPLETE_WITH_CARRY_FORWARD; 12 accepted, 0 refused, 0 errors**. Its registered inventory is not an independent closure of the five external financial findings now open. The public [PR #66 CI run](https://github.com/Lonnyzone123/Financial-Calculator/actions/runs/37193639044) was also inspected and is successful at its report-branch head `540feada2d0764754251fb0447ee7835b0a52ac8`. That is supporting evidence, not a claim that the merge SHA has a separately observed PR-triggered CI run.

## 5. Reproduction and retained evidence

Run from a checkout of frozen main with its ordinary installed dependencies; use a scratch output directory outside tracked records:

```powershell
node audit/S5AA/R51/S5AA_R51F_FULL_MODEL_PROBES_20261004.js . <scratch>/r51f-probes.json
node audit/S5AA/R51/S5AA_R46_R51_CHATGPT_SIMULATIONS_20261004.js . <scratch>/r46-r51-rerun.json
node audit/S5AA/R40/S5AA_R40_CONSERVATION_GRID/grid.js 1000 20261004 > <scratch>/conservation.json
npm test
node tools/closeout-check.js
```

The new companion's **exit 1 is expected on this source**, signaling F01–F03's independently wrong figures; it is not a green test suite. Its JSON includes full witness plans, validation, results, expectations and comparison summaries. The previous companion likewise exits 1 for its four findings. No generated JSON replaces a reference capture. The new companion has no browser dependency; the separately executed real-browser protocol is the R41 sequence documented above.

| Retained artifact | SHA-256 |
|---|---|
| New published companion | `4ae6a8df13999c59219097194a5564e425a0d23bbb0d65c59037589f91f3951d` |
| Fresh HTML, 1,176,759 bytes | `769391690f42143082cdfbaeeebfdab7daff91c4d30194429a9781f6d6dfbe57` |
| Generated Worker source, 616,119 characters | `10b1c2c2b057ea4e74966d9946c102619ca5d25691c64250550ca0736578ab65` |
| Fresh conservation JSON | `79d155303fd445b199e9024e588c0bbe9f5f79f0ccb57c89a0eb48e764da2a17` |
| Fresh 75-plan browser results JSON | `cf909434d5eacce63111edddb697fbf2610b215228573effe8782817a1f8b95d` |
| Fresh full-gate log | `3e07fe4e47771732e57b2fea4afa4cda2d35e33b865bd14520dc8ea7fa65a495` |

These hashes identify retained local evidence; generated timestamps mean raw JSON/log hashes are not asserted as repeat-run expectations. Reproducible financial assertions and witness plans are in the published companion. The scratch browser driver/results are retained locally, not registered as reference artifacts.

## 6. Decisions, exclusions and practical limits

Suspicious cases checked and not assigned new numbers:

- **Per-employer workplace annual additions:** two workplace accounts can together exceed one employer's limit if they actually belong to the same employer. This is already carried as `ACCOUNT-17-8`; there is no employer-group input. The green gate explicitly retains its todo. It remains a financial qualification limit.
- **Wage-tax clamp:** freshly measurable above, already disclosed. No claim of universal household conservation is made.
- **Rule of 55:** current-employer inference for RMDs differs from the penalty switch's certification convention. The recorded decision treats the switch as owner certification and enforces separation timing; this pass did not turn that documented premise into a new defect.
- **Conversion-start fallback:** the later AA1 decision uses the primary retirement age unless separately entered. The older proposed household-anchor wording was superseded.
- **HSA-adjusted SE compensation:** the R47 report expressly carries the slightly high compensation approximation; the broader audit does not silently certify it.
- **Historical allocations and rolling replay:** the live heat map makes the individual historical calls. `runPlan`'s rolling flag is not a missing standalone loop. Historical account allocations remain outside the declared proxy replay's supported domain.
- **Opening-age/death-year and expense conventions:** these were tested against their recorded meanings. A helper test using the wrong strategy label, HSA field name, historical return series or expense end-boundary expectation was corrected before classification; those initial probe setup errors are not findings.

The bundled refinance/recast/multi-reset ARM modules are building blocks; bundling does not establish that their calculations replace live engine debt mechanics. The excluded mortgage-versus-investing and payoff-strategy adapter surfaces remain excluded and carry their revival contracts. The ported Python tax/SS/lifetime optimizer modules are not the live arbitrary-account retirement engine. Their gate tests establish their recorded helper behavior, not live-model integration or global optimality. The UI explicitly calls its live withdrawal ordering a heuristic.

This is a broad source/behavior audit, not an exhaustive proof of every input combination or a line-by-line revalidation of all archived requirements. Public records do not include every private predecessor decision. Independent oracles cover the cases and scope named above; equality, corpus stability and bookkeeping identities have narrower evidentiary roles. Pending 2026 tax forms, age-based annual approximations, missing pre-plan data and supported-domain exclusions remain conditions on financial reliance. No tax-filing, actuarial or market-data certification is claimed.

## 7. Implementation handover and status

1. Reproduce **R51F-01** using F01–F05; retain F04's above-limit control and verify both owners through actual UI/Worker routes.
2. Complete the four earlier repairs already assigned to R52 under their existing IDs and five-part handovers. Do not close R48-01 by only hiding the plan behind its existing static-validator rejection.
3. Write independent expectations before edits, and commit prospective path/output predictions under A-01/A-11. Preserve chronology, basis/true-up and cash identities when fixing the shared interactions.
4. Rerun the targeted witnesses, full gate and any capture/Worker route whose financial source changes. Explain measured output movement; do not regenerate baselines to conceal it.
5. Record each disposition with its repair commit/test or explicit owner decision. Keep carried limitations and unsupported reference values visibly unqualified.

**E18 scope is now explicit: full model. E1 does not support GO while these newly confirmed supported financial behaviors remain wrong. The overall administrative verdict remains NO-GO; this report supplies no release or household-reliance qualification.**
