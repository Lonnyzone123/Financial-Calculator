# S5AA R31: funding-date repair and account-transfer follow-up

**Verdict: NO-GO. R31-01 (P1) exposes an incompletely dated multi-IRA pool. R30A-01/-02/-03 also remain reproduced and open.**

Date: 2026-09-29 UTC (2026-09-28 UTC-7). Independent external audit for the owner. Source and all financial measurements in this report are **R31**, separate from the [R30A account audit, PR #12](https://github.com/Lonnyzone123/Financial-Calculator/pull/12).

## 1. Scope and provenance

- Repository: `Lonnyzone123/Financial-Calculator`.
- Change base: **`6e09347b4b471f916aa69f811d161efe748dd3ba`**.
- Audited source: **`8afe16d2fec7e6ebd0b561bffbe1653249b10de7`**, verified annotated tag **`s5aa-r31-source`**; tag object **`6480ffb60e0dabf1de36d10daab45c48c37b7898`**.
- Publication base: current main **`35c8d9adde655cb3f864e1c4f4b66a20e95909eb`**. The owner requested completion of R30 followed by audit of R31. No source measurements from different commits are blended.
- Reviewed the R31 cover note, change handover, self-audit and self-audit sweep; the implementation diff and both new test files; the repository working/review rules; and the account/model limitations established in R30A.
- Base -> source has one commit: engine/build changes, two new test files, and test/requirements registration. Source -> publication main adds R31 audit records/index only; calculator source is identical.

The source was examined read-only. This PR adds only this external report and its adjacent external reproduction. No implementation, tests, fixtures, baselines, index, decisions, tags or settings were altered. No supplied zip package was used.

## 2. R31-01 (P1): the "funding-date" aggregate pool dates only the sending IRA

**Primary rule.** Funding uses otherwise taxable value before basis, measured from the owner's aggregate IRA accounts at the funding date. Basis left after funding is not restored or reduced by later investment returns. See [Notice 2008-51, "Tax treatment of qualified HSA funding distributions"](https://www.irs.gov/irb/2008-25_IRB#NOT-2008-51), including its immediately-after-funding example, and [IRC 408(d)(9)(E)](https://www.law.cornell.edu/uscode/text/26/408). This witness uses one funding event, no QCD, no funding-year ordinary draw/conversion and no funding-year nondeductible contribution, so it does not depend on the disclosed ordering or contribution-date limitations.

**Evidence at `8afe16d2fec7e6ebd0b561bffbe1653249b10de7`.** [engine.js:3425](https://github.com/Lonnyzone123/Financial-Calculator/blob/8afe16d2fec7e6ebd0b561bffbe1653249b10de7/src/engine.js#L3425) temporarily dates `f.balance` using `dateGrowth`, then calls `iraPoolsAtStart(accounts)` without dating the same owner's other IRAs to that instant. [engine.js:3442](https://github.com/Lonnyzone123/Financial-Calculator/blob/8afe16d2fec7e6ebd0b561bffbe1653249b10de7/src/engine.js#L3442) records this mixed-date sum as `fundRow.qhfdPool`. The new [settlement formula, engine.js:500](https://github.com/Lonnyzone123/Financial-Calculator/blob/8afe16d2fec7e6ebd0b561bffbe1653249b10de7/src/engine.js#L500) and [row settlement:3890](https://github.com/Lonnyzone123/Financial-Calculator/blob/8afe16d2fec7e6ebd0b561bffbe1653249b10de7/src/engine.js#L3890) preserve the supplied measure. The original year-end recalculation is removed, but its replacement is not the whole owner's value on the funding date.

**Reproduction.** Run the adjacent script from the frozen source:

```text
node audit/S5AA/R31/S5AA_R31_EXTERNAL_AUDIT_REPRO_20260929.js
```

It adapts the existing R29 `basisPlan()` fixture: at age 60, $100,000 cash, empty source IRA, $200,000 wages, $8,600 nondeductible IRA contribution and $1,000 workplace deferral. Add a second, same-owner traditional IRA opening at $2,000. Source IRA/workplace/HSA earn 10%; the second IRA earns 20%; inflation/fees/dividends are zero. Fund the own HSA with $5,400 at **61.25**, then at 62 make a deductible $2,000 IRA contribution and receive $30,000 wages; the $100,000 expense empties both IRAs and the workplace account at the model's 62.5 draw.

**Hand ledger.** Basis $8,600 was created inside the projection; the second IRA's opening money is wholly pre-tax, not an invented opening-basis input.

- Source value at funding: $8,600 x 1.1^1.25 = **$9,688.115499**.
- Other IRA at that same instant: $2,000 x 1.2^1.25 = **$2,511.924335**.
- Correct aggregate: **$12,200.039833**. Taxable value $3,600.039833; $5,400 funding uses **$1,799.960167 basis**, leaving **$6,800.039833**.
- R31 instead uses the other IRA's value at 61, **$2,400**. Mixed-date pool $12,088.115499 consumes $1,911.884501 basis, leaving $6,688.115499: **$111.924335 too little basis**.
- Final IRA draw: `((8600 x 1.1^2 - 5400 x 1.1^0.75) + 2000) x sqrt(1.1) + 2000 x 1.2^2.5` = $10,083.169188. Workplace draw: $1,000 x 1.1^2.5 = $1,269.058706.
- Correct AGI: $30,000 + $10,083.169188 - $6,800.039833 + $1,269.058706 - $2,000 = **$32,552.188061**.

| Final-row figure | Independent expected | R31 actual | Actual minus expected |
|---|---:|---:|---:|
| Federal AGI | $32,552.188061 | $32,664.112396 | +$111.924335 |
| Total model tax | $4,432.567269 | $4,448.796297 | +$16.229029 |
| Tax outstanding | $0 | $0 | $0 |

Single/AZ fixture tax: taxable income is AGI - $16,100; federal $1,240 + 12% of the amount above the first $12,400; state 2.5% of taxable income; payroll $30,000 x 7.65%. Thus tax is overstated **$111.924335 x (12% + 2.5%) = $16.229029** and retained wealth understated by the same amount. No outstanding true-up explains it.

**Opposite direction and late execution.** With the second IRA at -20% and the same 61.25 funding, expected AGI/tax are **$31,540.910695 / $4,285.932051**, actual **$31,454.097269 / $4,273.344104**: tax understated **$12.587947**. At 61.75, non-sending IRAs are at the earlier spending-growth point (61.5), not the funding instant; the +20% case still overstates tax **$17.778010**. Opening-date funding and a flat second IRA are passing controls.

**Consequence and reach.** Tax can be over- or understated, and basis can be over- or under-recovered, whenever a basis-consuming funding is dated inside a row and another same-owner IRA changes value before that date. The 162-plan independent grid has **22 mismatching plans / 35 mismatching assertions**, not 22 distinct findings. None of the 70 expanded-corpus recipes has an enabled traditional-IRA-to-HSA funding transfer, so **none reached** this defect. R31's seven registered new tests pass; they do not cover this dated, independently growing second-IRA pool.

**Proposed repair / owner decision.** Claude should first reproduce and pin the two-IRA positive/negative return witnesses. Value **each** IRA in that owner's pool at one funding instant, using its own rate and the proper pre/post-draw reference point; preserve each balance's regular growth path rather than growing it twice. Guard different allocations, both owners, another owner's IRA that must not enter this pool, opening/early/late funding, ordinary flows before/after it and basis-not-consumed controls. The owner decides repair scope. The disclosed whole-year contribution/QCD-order convention must not be changed implicitly.

## 3. Repair disposition and carried findings

**R30-01: the seven original repro cases now pass, but the general funding-date repair is not fully requalified.** The gain case gives AGI **$31,990.656719**, tax **$4,351.145224**; the mixed-pool gain case **$32,328.774131 / $4,400.172249**; the loss case **$30,060.594036 / $4,071.286135**, each with zero outstanding tax. Four controls also pass. R31-01 extends that qualification boundary to a genuinely multi-IRA pool; it is not a renumbering of the identical seven-case evidence or a claim that those fixes failed.

The broad R30A probe was separately executed against R31, not inferred from the diff: **1,186 plan executions / 1,267 grouped checks; 1,185 PASS, 64 MISMATCH, 18 CONDITIONAL**. The same three confirmed findings remain, under their original identifiers:

| Carried finding | Fresh R31 observation | Relevant R31 code |
|---|---|---|
| R30A-01 (P1), all-basis IRA -> workplace | AGI $37,600 vs $31,000; tax $5,164.50 vs $4,207.50; net worth $180,765 vs $181,722 | [workplace guard:2554](https://github.com/Lonnyzone123/Financial-Calculator/blob/8afe16d2fec7e6ebd0b561bffbe1653249b10de7/src/engine.js#L2554), [transfer gate:3400](https://github.com/Lonnyzone123/Financial-Calculator/blob/8afe16d2fec7e6ebd0b561bffbe1653249b10de7/src/engine.js#L3400) |
| R30A-02 (P2), prohibited Roth IRA -> Roth 401(k) | Prohibited $10,000 move still runs; 10%-destination witness ends Roth class at $11,000 vs $10,000 | same guard/gate; [validator:975](https://github.com/Lonnyzone123/Financial-Calculator/blob/8afe16d2fec7e6ebd0b561bffbe1653249b10de7/src/scenario-validator.js#L975) |
| R30A-03 (P2), ordinary rollover changes living owners | IRA/HSA spouse witnesses still run; 54 owner-route matrix cases fail | [conversion-only owner guard:2555](https://github.com/Lonnyzone123/Financial-Calculator/blob/8afe16d2fec7e6ebd0b561bffbe1653249b10de7/src/engine.js#L2555), [mover:2253](https://github.com/Lonnyzone123/Financial-Calculator/blob/8afe16d2fec7e6ebd0b561bffbe1653249b10de7/src/engine.js#L2253) |

The R30A report provides primary legal citations, complete fixtures, account inventory and the transfer table. No new identifiers are assigned to these reproduced carried findings. Their missing eligibility safeguards are not repaired by a QHFD-basis change. The 18 contribution-age comparisons remain **conditional**, not a fourth carried defect, because the model has no independently established tax-year-end calendar age.

## 4. Executed verification

Runtime: Windows 11 NT **10.0.26200**, Node **v24.17.0**, jsdom **30.0.1**. Exact detached source and empty tracked diff verified. Local dependencies copied from the unchanged qualified R30 installation; package-lock is unchanged.

| Check | Fresh R31 result |
|---|---|
| Adjacent independent dated multi-IRA ledger | 162 plans, 486 assertions; 22 failing plans, 35 mismatching assertions; 451 passing assertions; exit 1 intentionally |
| Prior external R30 repro | 7 cases pass, 0 mismatches, exit 0 |
| Prior external R29 repro | 10 grouped checks pass, 0 mismatches, exit 0 |
| R31's two new registered files | 7 tests pass, 0 fail |
| Existing R30 dividend sweep | 552 plans / 1,320 checks, 0 problems |
| `tests/corpus-invariant.test.js` | 20 tests pass, 0 fail/skip/todo |
| Full `npm test` | **GATE PASSED: 2,954 tests, 2,945 pass, 0 fail/skip/cancel, 9 authorized TODOs; 362 files** |
| Broad R30A probe against R31 | Three carried findings reproduced; counts in section 3 |

The first gate invocation used `NODE_PATH` to share dependencies and unintentionally defeated the gate's synthetic missing-jsdom fixture: one test failed. That was reviewer setup interference, not a calculator finding. With local dependencies and `NODE_PATH` removed, the complete gate was rerun and the passing result above read. The nine TODOs remain the eight authorized mortgage-revival cases and `ACCOUNT-17-8` (415(c) per employer group).

**CI attribution.** [Run 36525245810](https://github.com/Lonnyzone123/Financial-Calculator/actions/runs/36525245810), job `109266735454`, passed with the same 2,954/2,945/0/9 counts on Windows Server 2025 NT 10.0.26100 / Node 24.17.0 / jsdom 30.0.1. The job's decoded logs were read. Its workflow head is `5e65954687af576a900368f6927c6bcbeaabea4c`; checkout is PR merge `49da51cde032f4b64368453d4f3610ecdb5bc19d`, **not the exact R31 tag**. Both diffs from the tag contain only six audit-record/index files, verified separately. No workflow run was returned for exact `8afe16d2fec7e6ebd0b561bffbe1653249b10de7`. The `gate-log-49da51cde032f4b64368453d4f3610ecdb5bc19d` artifact was listed (not downloaded); decoded job logs and the exact-tag local gate provide the counts quoted here.

**Expanded corpus.** A fresh in-memory capture on the exact R31 source contains all 70 recipes, no omissions, a qualified unchanged-input capture boundary, and no excluded result fields. Input hash **`9b107562529731ad36ac45395080bfc436be26ca2aed5f89722cfc1b0cf14827`**, output hash **`5a67d57e35136788bba4d96f4f24dcb721fbf4f70ab7fc3077021d7c6d122766`**; all 70 individual output hashes match the earlier qualified R30 capture. Source engine SHA-256 **`3fe84a4403b01cdd030797926938a64cd39943391bc3d0731c6bc379f4841f48`**; built HTML **`63b8982b54054aabfad5dee866ffd980709c90892fc4d0e34b4080091983e298`**. No baseline was written or accepted.

## 5. Limits and handover

R31's declared limitations stand: whole-year nondeductible contributions enter the funding basis calculation despite missing contribution dates; QCD is ordered before funding by model convention. R30A's exclusions also stand: custom account caps/legal identity, HSA coverage/Medicare/testing-period history, Roth ordering/five-year rules, salary-MAGI approximation, high-earner mandatory-Roth warning, working-period outside-funded contributions, per-employer-group 415(c), death assumptions and missing calendar anchor. They are not new findings.

Claude's 84-plan self-audit sweep was read but not separately executed from its records script in this review; its 0-problem claim is not substituted for the independent 162-plan grid. All before/after ordinary-conversion combinations, QCD combinations, inherited-account eligibility, plan acceptance and browser/worker presentation were not independently exhaustively qualified. Passing DOM/regression tests do not replace manual browser validation or legal qualification.

The owner chooses repairs. Claude should reproduce R31-01 and the three carried findings on Windows, make approved fixes test-first with independent expectations, disclose changed control/corpus figures and register any baseline through the existing process. This reviewer did not approve or merge the implementation PR, close a milestone, or change any policy record.

**Conclusion: NO-GO. R31 removes the original single-pool year-end-basis error, but its recorded aggregate funding value still mixes dates, and the three account-transfer safeguards remain open.**
