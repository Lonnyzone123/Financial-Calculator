# Result contract — P5-02's intended-result contract

**Version 5 · written 2026-09-12; version 2 the same night, S4 task 2b.4 (BC-01); version 3 on 2026-09-16, S5 task 6.10 (Q2 (A)); version 4 on 2026-09-22, S5AA R12 round (R11-02); version 5 on 2026-09-24, S5AA R19 round (workstream A).** Machine-readable form: `tools/result-contract.json`. Checker: `tools/result-contract.js`. Qualification: `tests/result-contract.test.js`.

*Version 3 adds the five named income measures to every row (0 on the opening row, medians on Monte Carlo rows), versions the row fields (`introducedIn`), and checks each result under the version that produced it: the engine declares `RESULT_CONTRACT_VERSION`, captures record it as `meta.resultContractVersion`, the stored captures that predate it are version 2 by the provenance in `legacyCaptures`, and an unsupported version is refused (S-CONTRACT-VERSION). Arizona AGI is not a row field.*

*Version 5 adds the tax-liability ledger (S5AA workstream A: the annual per-owner IRA settlement, contract reviewed in ChatGPT's R18 audit, built on the owner's decision of 2026-09-23). Deterministic and historical rows carry `taxSettled` (the tax on the year's settled income), `taxTrueUpPaid` (last row's true-up, paid in this row; negative a refund received) and `taxOutstanding` (this row's true-up, owed into the next row; negative a refund due); all three are 0 on the opening row. `taxes` is the tax paid: this row's provisional tax plus `taxTrueUpPaid`. T-LIFETIME reads `lifetimeTaxes` as Σ `taxSettled` (assessed tax, the terminal outstanding included), and R-NETWORTH nets `taxOutstanding`. A final true-up the portfolio cannot pay is that row's shortfall, so T-SUCCESS keeps one meaning. Monte Carlo rows are unchanged. The five version-4 captures (r8 to r12) are listed in `legacyCaptures`.*

*Version 4 changes one requirement and no row field: R-AGE-SPAN requires S5AA decision 8's last-death cut, whether or not the result says so, and `PROJECTION_ENDS_AT_LAST_DEATH` must name it. The rule is frozen to version 4 and later. Versions 2 and 3 keep the reading their captures were taken under, and the seven stored version-3 captures are listed in `legacyCaptures` by commit and output hash, each with its own version, so none is re-judged and a current result cannot claim version 3 to escape the rule. It follows an external re-audit (R11-02): the R11 checker had applied the rule to "the current version" while the version stayed 3, and so re-judged the r6 capture, taken before decision 8.*

*Version 2 closes the four checker gaps the S2 closeout verdict witnessed (BC-01): non-finite top-level values (T-FINITE), malformed rows reported rather than thrown (S-ROW-RECORD), path counts as positive integers with the plan-dependent half of M-PATHS reported as skipped, and integer path counts on invalid results. No field changed meaning. See §5 and §7.*

*The checker, not the specification, was repaired on 2026-09-13 for S4-IR-03: rows are checked at every index, so a hole in a sparse array is an S-ROW-RECORD violation rather than silence or a thrown TypeError. See §7.*

---

## 1. What this is

The external audit carried *"the independent intended result contract"* from package 6. P5-02 had enforced thirteen required row fields, but those fields were **measured from stored output**, and *"observed output is not an independent specification."* The auditor's accepted definition (`Handover temp/S2_S3_CLOSEOUT_ANSWERS_20260912.md`, CQ-1) is:

- **In scope:** shape, types, meanings, units, nominal/real bases, per-mode differences, and structural/reconciliation invariants of a `runPlan()` result.
- **Out of scope:** certification of financial values — whether a tax figure or a success rate is *correct*. That is S5's conformance work.

### What "independent" means here

Per CQ-1c, expectations are **not inferred solely from observed output**. Every field meaning and every invariant cites its sources (§2): the consumers that read a result, and written project rules. Engine assertions are cited as **evidence, not automatically a specification**. Where sources disagree, the disagreement is listed in §6 and dispositioned — not silently resolved in the engine's favour.

**One thing this contract does not claim.** Its field *inventory* matches the derived schema catalogue (`tests/lib/schema-catalogue.js`) almost exactly (§7). That is expected — both describe fields that exist — and it is **not** the independence claim. The independence is in the meanings, units, bases, invariants and conflicts, each of which is sourced outside the output.

---

## 2. Sources

| ID | Source | What it establishes |
|---|---|---|
| S-TABLE | `src/app-shell.html` `renderTable()` | row values are nominal; the "real" view divides by `inflationFactor` |
| S-CSV | `src/app-shell.html` `exportCsv()` | the 26 exported row columns and their user-facing names *(corrected 2026-09-24 from 21: the app's header list has 26, including settled tax, true-up paid and outstanding, and RMD due, paid and unmet)* |
| S-STATS | `src/app-shell.html` results stats and guidance | `successRate` shown as a percentage; `realTotal` for retirement/end stats; lifetime taxes; first vs sustained shortfall guidance; `failureAge` as fallback for `sustainedFailureAge` |
| S-ERRUI | `src/app-shell.html` calculation-error display | `calculationError` checked first; path counts shown |
| S-R2V003 | R2V-003 / ARCH-02 (`runPlan()` comment) | a calculation error is a distinct outcome; `successRate` is only ever a real percentage |
| S-R2R002 | R2R-002 round 2 | the invalid-result contract applies to every mode; partial figures live only under `partialDiagnostics` |
| S-L4B | `SPRINT_BRIEF_20260910_S3.md:456` | `networth = total + (networthOn ? otherAssets − debtBalance + insurance : 0)` |
| S-P9 | `SPRINT_QUESTIONS.md:2192` (P9/Q35) | `debtPaymentsTotal = debtInterest + debtPrincipal + debtHousing`; `debtPayments` stays retirement-period only |
| S-CL02 | `S2_CLOSURE_NEW_CODE_ONLY_20260910.md:271` (CL-02) | RMD owed, distributed and unmet are three separate quantities |
| S-Q40 | `tools/capture-baseline.js` `FIELD_COUNTS` comment | Monte Carlo rows are percentile aggregates; per-component breakdowns deliberately absent |
| S-MCBAND | `archive/INVESTMENT_CALCULATOR_V2C_HANDOVER.md:191,446` | Monte Carlo reports median rows and a nominal 10th–90th percentile band |
| S-TAXCLASS | `src/scenario-validator.js` `TAX_CLASSES` | the tax classes are exactly taxable, preTax, roth, hsa |
| S-S100 | `S100_TASK_CHECKLIST.md:121` | shortfall and failure ages are threshold crossings on a continuous series |
| S-ENGINE | `src/engine.js` assertions | evidence of intent only |

---

## 3. Outcomes

A result is exactly one of three shapes, selected by `status` and `mode`.

| Outcome | `status` | `mode` | Top-level keys |
|---|---|---|---|
| **ok, per path** | `"ok"` | `simple` or `historical` | 16 |
| **ok, Monte Carlo** | `"ok"` | `monteCarlo` | 18 |
| **invalid** | `"calculation_error"` | any | 16 required, plus optional keys by cause |

`runScenario()` adds an optional `identity` object — `null` for `SCENARIO_NONSERIALIZABLE_INPUT` (Q48).

*(Added 2026-09-26, S5AA R25, `95bf5d0`, Q138; read in `src/engine.js` `nonNumberPlanValuePath` and `recordScenarioRefusal`, the `state.path` behaviour checked against `tests/audit-s5aa-r25-plan-number-fields-refused.test.js`.)* **A new refusal, `SCENARIO_NONNUMBER_PLAN_VALUE`** (ERROR; `state.path` names the field; no rows), is returned when any of these 15 plan fields is present and not a finite number: `profile.age`, `profile.retireAge`, `profile.endAge`; `assumptions.returnRate`, `assumptions.seed`, `assumptions.volatility`; `employment.salary`; `retirement.spending`, `retirement.dividendYield`, `retirement.dividendQualified`, `retirement.dividendGrowth`, `retirement.dividendStart`, `retirement.ssClaim`, `retirement.spouseClaim`; `advanced.correlation`. The validator already rejected all of these as `WRONG_TYPE`. An absent field is accepted. **A NaN Monte Carlo seed is refused, not treated as seed 0; an absent seed still falls back to 0.**

### Top level — ok, per path

| Key | Type | Unit / meaning |
|---|---|---|
| `status` | `"ok"` | |
| `mode` | `"simple"` \| `"historical"` | |
| `rows` | non-empty array | §4 |
| `calculationError` | `false` | checked first by every consumer |
| `calculationErrorAge`, `calculationErrorCode` | `null` | |
| `failed` | boolean | a row had shortfall > 0.01 |
| `successRate` | `0` or `100` | percent; one path either funds or does not |
| `firstShortfallAge` | number \| null | age of the first shortfall row |
| `sustainedFailureAge` | number \| null | age completing the first run of ≥ 2 consecutive shortfall rows |
| `failureAge` | number \| null | **deprecated alias** of `sustainedFailureAge` |
| `lifetimeContributions` | number | USD nominal, Σ row contributions |
| `lifetimeContributionsReal` | number | USD real, Σ contributions ÷ inflation factor |
| `lifetimeTaxes` | number | USD nominal, Σ row taxes (Σ row `taxSettled` from version 5) |
| `issues`, `limitWarnings` | array | |

### Top level — ok, Monte Carlo

As above, except: `calculationErrorAge` is **absent**; `successRate` is **continuous** in [0, 100] (valid paths funded ÷ valid paths × 100); `failed` is `successRate < 100`; the shortfall ages and lifetime totals are **medians across valid paths**; and three path counts are added — `requestedPathCount`, `validPathCount`, `calculationErrorPaths` (0 when ok).

### Top level — invalid

`status: "calculation_error"`, `calculationError: true`, a non-empty `calculationErrorCode`, and **every financial field `null`**: `rows`, `failed`, `successRate`, `firstShortfallAge`, `sustainedFailureAge`, `failureAge`, and the three lifetime totals. Partial figures survive only in `partialDiagnostics`, whose `label` says it is not the plan result. Optional by cause: `calculationErrorAge` (a simple/historical run's first error age; `null` for a pre-simulation rejection), and the three path counts (Monte Carlo).

---

## 4. Rows

### Per-path rows (simple, historical)

**Opening row** (`rows[0]`): a snapshot at the starting age — balances as supplied, every interval flow 0, `inflationFactor` 1, `realTotal` equal to `total`. It carries neither `calculationError` nor `calculationErrorCode`. **Every other row** covers the interval ending at its `age` — each whole-year boundary, plus `endAge` if fractional — and carries both.

> **CALLOUT — the opening row's `realTotal` is in the projection's own base dollars, and its base date is the START of the projection.**
>
> Every row reports `realTotal` as `total ÷ inflationFactor`, and the opening row's `inflationFactor` is **1** by definition: no time has elapsed, so no inflation has accrued. The opening `realTotal` therefore equals the opening `total` exactly.
>
> **That is correct, and it is not "a nominal value leaking into a real column".** The real series is denominated in dollars of the projection's **start date**, and on the start date real and nominal dollars are the same thing. A consumer that reads `realTotal` as "today's dollars" will read the opening row right only if "today" means the day the projection starts.
>
> **What it is NOT:** it is not a value deflated to some external base year, and it is not comparable across two projections that start at different dates without restating one of them. `R-OPENING` in the conformance table pins `inflationFactor` 1 and `realTotal = total`; `R-REAL` pins the ratio everywhere else. **Neither may be "fixed" by altering a correct opening value** — an external audit (S5AA G14, Q106) read this as a defect and it was verified correct against this contract.

| Field | Unit | Basis | Period | Meaning |
|---|---|---|---|---|
| `age` | years | — | row end | opening: starting age; else end of the interval |
| `total` | USD | nominal | row end | portfolio balance, all accounts |
| `realTotal` | USD | real | row end | `total ÷ inflationFactor`. **On the opening row this equals `total`** — see the callout below |
| `taxable`, `preTax`, `roth`, `hsa` | USD | nominal | row end | balance by tax class |
| `contributions` | USD | nominal | interval | employee **plus employer** contributions |
| `income` | USD | nominal | interval | outside income **plus wages** (conflict C2) |
| `spending` | USD | nominal | interval | spending requested |
| `withdrawals` | USD | nominal | interval | portfolio withdrawals |
| `dividends` | USD | nominal | interval | dividend cash paid out |
| `taxes` | USD | nominal | interval | taxes **plus penalties** |
| `rmd` | USD | nominal | interval | RMD **owed** |
| `rmdDistributed` | USD | nominal | interval | RMD actually distributed |
| `rmdUnmet` | USD | nominal | interval | RMD owed and not distributed |
| `shortfall` | USD | nominal | interval | spending eligible sources could not fund |
| `debtPayments` | USD | nominal | interval | debt payments in the **retirement** part of the interval only (C3) |
| `debtPaymentsTotal` | USD | nominal | interval | all debt payments |
| `debtInterest`, `debtPrincipal`, `debtHousing` | USD | nominal | interval | components of `debtPaymentsTotal` |
| `otherAssets` | USD | nominal | row end | non-portfolio asset value |
| `debtBalance` | USD | nominal | row end | outstanding debt |
| `nonPortfolioDraw` | USD | nominal | interval | cash drawn from non-portfolio assets |
| `inflationFactor` | ratio | — | row end, cumulative | price level since the start |
| `networth` | USD | nominal | row end | §5, R-NETWORTH |
| `magi` | USD | nominal | interval | modified adjusted gross income: the IRMAA measure; equals `irmaaMagi` from version 3 (R-MAGI-ALIAS) |
| `federalAgi` | USD | nominal | interval | federal AGI; version 3 onward |
| `ssProvisionalIncome` | USD | nominal | interval | Social Security provisional income (not AGI); version 3 onward |
| `seniorDeductionMagi` | USD | nominal | interval | senior-deduction MAGI, equal to federal AGI (no exclusion modelled); version 3 onward |
| `niitMagi` | USD | nominal | interval | NIIT MAGI, equal to federal AGI (no exclusion modelled); version 3 onward |
| `irmaaMagi` | USD | nominal | interval | IRMAA MAGI, equal to `magi`; version 3 onward |
| `taxSettled` | USD | nominal | interval | the tax on the year's settled income (Form 8606 settlement re-figured), plus penalties; per-path rows, version 5 onward |
| `taxTrueUpPaid` | USD | nominal | interval | last row's `taxOutstanding`, paid (negative: a refund received); per-path rows, version 5 onward |
| `taxOutstanding` | USD | nominal | interval | this row's true-up, owed into the next row (negative: a refund due); per-path rows, version 5 onward |
| `calculationError` | boolean | — | interval | ordinary rows only |
| `calculationErrorCode` | string \| null | — | interval | ordinary rows only |

### Monte Carlo rows

Every row carries `age`, the 26 financial fields `total`, `realTotal`, `taxable`, `preTax`, `roth`, `hsa`, `contributions`, `income`, `spending`, `withdrawals`, `dividends`, `taxes`, `rmd`, `shortfall`, `debtPayments`, `otherAssets`, `debtBalance`, `nonPortfolioDraw`, `inflationFactor`, `networth`, `magi`, `federalAgi`, `ssProvisionalIncome`, `seniorDeductionMagi`, `niitMagi` and `irmaaMagi` *(corrected 2026-09-29, S5AA R37 (SA32F-54): it said "the 21 fields `total` … `magi`"; the count is held to a run by `tests/audit-s5aa-r37-stale-texts.test.js`)*, plus `q10`, `q90` and `calculationError`. **Each financial field is the median of that field taken independently across valid paths.** `q10`/`q90` are the 10th/90th percentiles of `total` (nominal). `calculationError` is true if any path errored at that row.

**Deliberately absent** (S-Q40): `rmdDistributed`, `rmdUnmet`, `debtPaymentsTotal`, `debtInterest`, `debtPrincipal`, `debtHousing`, `calculationErrorCode`. The median of a component need not come from the same path as the median of the total, so a breakdown would not reconcile.

---

## 5. Invariants

Tolerance: `max(0.01, 1e-9 × |expected|)` — the tolerance `checkRowInvariants()` already uses.

| ID | Applies | Rule | Sources |
|---|---|---|---|
| R-FINITE | ok, all | every numeric row field is finite | S-R2R002 |
| T-FINITE | all outcomes, top level | every numeric top-level value present — required or optional — is finite; a nullable numeric is checked when non-null. *Added in v2: a `typeof` check admitted NaN and Infinity* | S-R2V003, S-R2R002, S-STATS |
| S-ROW-RECORD | ok, all | every row, **at every index of the array**, is a non-null object; anything else — including a hole in a sparse array — is a violation at its index, and invariants needing every row are reported as skipped. *Added in v2: a null row threw a TypeError. Holes since S4-IR-03 (2026-09-13): the checker walked rows with `every`/`forEach`, which skip them* | S-TABLE, S-CSV |
| R-AGE-ORDER | ok, all | row ages strictly increase | S-TABLE, S-STATS |
| R-AGE-SPAN | ok, all, *needs plan* | first age = `profile.age`; last age = `profile.endAge`, or the last-death cut where the plan's lifespans give one. *S5AA decision 8, tightened at R11 (external audit R10-08): the cut is the first row opening at which nobody the plan models is alive, derived by the checker from the plan and never from the result's own claim. Under the current contract version the result must meet it whether or not it says anything, and must carry `PROJECTION_ENDS_AT_LAST_DEATH` naming it (`stoppedAtRowOpening` the cut, `lastRowAge` the last row, `horizonEndAge` `profile.endAge`). Under an older version the disclosure selects the reading as it did, so captures taken before decision 8 are judged unchanged* | S-TABLE |
| R-OPENING | ok, per path | opening row: `inflationFactor` 1, `realTotal = total`, all flows 0 | S-TABLE, S-CSV |
| R-REAL | ok, all | `realTotal = total ÷ inflationFactor` | S-CSV, S-TABLE, S-STATS |
| R-CLASS | ok, per path | `total = taxable + preTax + roth + hsa` | S-TAXCLASS |
| R-NETWORTH | ok, per path, *needs plan* | `networth = total + (networthOn ? otherAssets − debtBalance + (age ≥ selfLife ? insurance : 0) : 0)`, less `taxOutstanding` from version 5 | S-L4B |
| R-DEBT | ok, per path | `debtPaymentsTotal = debtInterest + debtPrincipal + debtHousing` | S-P9 |
| R-RMD | ok, per path | `rmdUnmet = max(0, rmd − rmdDistributed)` | S-CL02 |
| R-NONNEG | ok, all | `shortfall ≥ 0`, `inflationFactor > 0`, `rmdUnmet ≥ 0` | S-CL02, S-STATS |
| T-LIFETIME | ok, per path | lifetime totals equal their row sums | S-STATS |
| T-SHORTFALL | ok, per path | shortfall and failure ages as defined in §3; `failureAge = sustainedFailureAge` | S-STATS, S-S100 |
| T-SUCCESS | ok, per path | `failed` iff a row has shortfall > 0.01; `successRate = failed ? 0 : 100` | S-R2V003 |
| M-PATHS | ok, Monte Carlo | both path counts are **positive integers**; `validPathCount = requestedPathCount = runs`; no error paths. Without a plan the `runs` comparison is **reported as skipped** (`M-PATHS:runs`). *Integers and the skip report added in v2* | S-ERRUI |
| M-SUCCESS | ok, Monte Carlo | `0 ≤ successRate ≤ 100`; `failed = successRate < 100` | S-R2V003 |
| M-BAND | ok, Monte Carlo | `q10 ≤ total ≤ q90` on every row | S-MCBAND |
| X-INVALID | invalid | financial fields null; `partialDiagnostics.label` present; path counts, where present, are integers ≥ 0 with `requestedPathCount` ≥ 1. *Path counts added in v2* | S-R2R002 |
| S-EXACT-KEYS | all | required keys present with their types; any other key reported as unspecified | — |

**No additive invariant applies to Monte Carlo rows** except R-REAL, which holds only because inflation is not stochastic across paths. If that ever changes, R-REAL must be re-derived for Monte Carlo, not relaxed.

---

## 6. Conflicts between sources, and their dispositions

| # | Conflict | Measured? | Disposition |
|---|---|---|---|
| **C1** | The derived catalogue records the invalid shape's `rows` as an array; the engine and R2R-002 make it `null`. Cause: the catalogue replaces `rows` with `[]` before describing the top level. | yes | **Contract follows R2R-002.** A limitation of the derived catalogue, recorded. |
| **C2** | The CSV header for `income` is "Retirement income", but the field includes pre-retirement **wages**. | by reading | **Label defect, carried.** The field's meaning is clear; whether to rename the column or split the field is a UI/product decision. |
| **C3** | `debtPayments` is retirement-period only, but the table and CSV column is plain "Debt payments". | by reading | **Label defect, carried** with C2. |
| **C4** | `failureAge` duplicates `sustainedFailureAge`; the UI reads it only as a fallback. | yes (T-SHORTFALL) | **Deprecated alias**; must stay equal until removed. |
| **C5** | `successRate` is 0/100 per path but continuous for Monte Carlo. | yes | **Intended mode difference** (S-R2V003), not a defect. |
| **C6** | L4b's written rule includes insurance in `networth` once age ≥ `selfLife`; **the engine's opening row omits it** when a plan starts after `selfLife`. | **yes — R-NETWORTH fires on `rows[0]`** | **Decided 2026-09-13 (the owner): the written rule stands — insurance counts from the first year.** Align the engine's opening row to it, in S5 task 2o; the C6 characterization test in `tests/result-contract.test.js` becomes a conformance assertion in the same commit. **Reconciled in S5 task 2o** *(corrected 2026-09-29, S5AA R37 (SA32F-48): this row still said it was carried until 2o landed)*: the opening row counts insurance from the first year, and `tests/result-contract.test.js` asserts it ("conflict C6, reconciled"). |
| **C7** | Monte Carlo rows omit the debt and RMD breakdowns and the row error code. | yes | **Intended** (S-Q40); recorded as a design gap there. |
| **C8** | Monte Carlo `limitWarnings` come from path 0 only. | by reading | Noted; warnings are deterministic inputs to every path, so no conflict is evident. |

---

## 7. Qualification of P5-02 against this contract

Measured at `3eefd75` (engine `494de216…ad51`), bounded per CQ-8b:

| Check | Result |
|---|---|
| Fresh successful results — all five golden scenarios (Monte Carlo capped at 25 paths) and eight hand-built plans covering every mode, four tax classes, net worth with assets/debt/insurance, fractional ages, sustained shortfall and RMD age | **0 violations, 0 unspecified keys, no rule skipped** |
| Invalid results — pre-simulation rejection; calculation error in simple, historical and all-paths Monte Carlo | **0 violations** |
| Stored after-CR2 historical entries (36: 17 simple, 16 historical, 3 Monte Carlo) | **Conform to the rules actually checked:** 0 violations, 0 unspecified. Plan-dependent checks were omitted — R-AGE-SPAN, R-NETWORTH, and the `runs` comparison in M-PATHS — so this is **partial** conformance |
| Two-way comparison with the derived catalogue | **one disagreement: C1** |
| Negative controls — one mutation per rule, including the invalid shape and an unspecified key | **every rule fires on its one mutation.** This did **not** cover non-finite top-level summaries, invalid path counts or malformed rows — the gap BC-01 found |
| **Version 2 (S4 task 2b.4, BC-01)** — hand-authored results in every outcome, independent of the engine, each broken in exactly one witnessed way | **Rejected at the exact path:** NaN and ±Infinity in every lifetime total (per-path and Monte Carlo), in all three Monte Carlo failure ages when non-null, and in an invalid result's `calculationErrorAge` (T-FINITE); path counts 0, 1.5 and −2 even when the two agree (M-PATHS), and 1.5 or −1 on an invalid result (X-INVALID); a `null`, array or numeric row at `rows[1]`, **without throwing** (S-ROW-RECORD); absent required fields. **Reported as skipped:** the `runs` comparison without a plan (`M-PATHS:runs`). **Accepted:** zero balances, 0% success, null failure ages, zero valid paths on an invalid result, and the documented `rows: null` invalid shape. Every new witness failed against the version 1 checker first, for the reason it names |
| Version 2 re-run over the engine | **No new violation.** Fresh results in every mode, every invalid path, and all 36 stored after-CR2 entries still conform, so BC-01 found no engine defect for S5 to own — the gaps were in the checker |
| **S4-IR-03 (external instrument audit, 2026-09-13)** — holes in the rows array, which `every`, `forEach` and `reduce` skip. The specification did not change; the checker did | **Rejected at the exact index, without throwing** (S-ROW-RECORD): a hole at the opening, an interior and the final row of a stored simple, historical and Monte Carlo result, with R-OPENING, T-LIFETIME, T-SHORTFALL and T-SUCCESS reported as skipped on the per-path ones; every index of an all-hole array; a hole kept by `structuredClone`. **Unchanged:** an explicit `undefined` row and a hole sent through JSON (it arrives as `null`) were already rejected, and `rows: []` on a successful result is still S-EXACT-KEYS. Before the repair a Monte Carlo result with `rows[3]` deleted, and one made only of holes, returned no violation, and a deleted per-path opening row threw; each witness failed against that checker first |
| Recorded conflict C6 | **reconciled in S5 2o:** a conformance assertion ("conflict C6, reconciled") holds the opening row to R-NETWORTH *(corrected 2026-09-29, S5AA R37 (SA32F-48): this row still described the characterization test from before 2o)* |

**P5-02's measured presence guards are retained** (`tests/near-miss-survivor-sweep.test.js`). This contract adds what they could not supply: meanings, units, bases, the invalid shape, and invariants, each from an independent source. **P5-02 is partially qualified against contract version 1** (closeout verdict 2026-09-13, condition 1). Its presence checks and the successful contract fixtures are accepted, but **the checker is not a complete corruption gate**. BC-01: numeric type checks admit `NaN` and `Infinity` in the Monte Carlo lifetime totals and failure ages; matching path counts may be zero or fractional; a `null` or primitive row throws `TypeError` instead of returning a violation; and without a plan, the `runs` comparison in M-PATHS is omitted without being reported as skipped. **Carried; owned by S4 `S4_TASK_CHECKLIST.md` 2b.4** since 2026-09-13, moved from the S5 result-contract/conformance role the verdict named (`a7483f1`; `S2_CARRIED_WORK_REGISTER.md` §3a).

---

## 7b. What S5AA added, and why `contractVersion` does NOT move (task 8.2)

**No row field was added, removed or redefined, and no calculation error code was added.** Every S5AA
change that a consumer can see arrives as an **issue** on the existing `issues` array, whose shape
(`code`, `severity`, `message`, `state`) is unchanged.

### Six new advisory issue codes, all `WARNING`

| code | said when | task |
|---|---|---|
| `HSA_QUALIFIED_SHARE_ASSUMED` | the plan holds an HSA — **including when the share is the 100% default**, because that is the assumption that is invisible | 4.4 |
| `SURVIVOR_BENEFIT_APPROXIMATED` | a survivor benefit is modelled | 4.7 |
| `ARM_RECAST_ALWAYS_APPLIED` | a plan carries the retired recast switch **and** an adjustable debt with a real reset age | 5.1 |
| `UNSUPPORTED_REVOLVING_DEBT` | the plan holds a credit card *(**retired, corrected 2026-09-26:** the code no longer exists in `src/`; a credit card has been modelled as minimum-payment revolving debt since `cb470cf` (S5AA X01) and is disclosed by `REVOLVING_DEBT_MINIMUM_MODELLED`, `SPRINT_QUESTIONS.md` Q110. This row is the original, kept as history.)* | 5.5 |
| `UNSUPPORTED_HISTORICAL_ALLOCATION` | historical replay is selected **and** allocations are set | 5.5 |
| `UNSUPPORTED_ROTH_ORDERING` | a Roth account is drawn (spending, tax funding, or a transfer to a non-Roth account) while its owner is under 59 1/2; a conversion into a Roth does not raise it; `state.firstDrawOwnerAge` names the owner's age at the first such draw. **A scheduled transfer is judged at its own age** (`advanced.transferAge`, moved to the source account's owner), so `firstDrawOwnerAge` is the owner's age on the transfer date; **a pooled draw** (spending, one-time expenses, tax funding) **is judged at the age its projection year opened at** *(added 2026-09-25, S5AA R24, `0acc073`; checked against the comment and message in the engine's `noteEarlyRothDraw`)* *(changed 2026-09-24 by S5AA R23, `9d58372`: it used to be raised from inputs, a Roth held with an early draw or a conversion possible; corrected here 2026-09-24 from the S5AA session's relay, checked against the engine's `noteEarlyRothDraw` on main)* | 5.5 |

### Two machine-readable flags on `issue.state`, and they are contract terms

- **`outsideSupportedDomain: true`** — this result is outside what the engine models on the named axis.
  **`state.exclusion`** names the axis and **`state.carriedTo`** names the task that owns it. A runner or
  a corpus boundary filters on **this one field**; it does not enumerate the codes, so an exclusion added
  later is caught without changing the filter.
- **`approximation: true`** — the figure is an approximation with a stated reason. `SURVIVOR_BENEFIT_APPROXIMATED`
  also carries **`capApplied: false`**, naming the specific rule that is not applied.

**Under F-2 above, neither flag invalidates a result** — an advisory warning is not a calculation error.
What they do is make an affected result **detectable**, which is what any exclusion policy needs first.

### Why the version does not move

Section 8 says to bump `contractVersion` **for any change of meaning, requirement or invariant.** Adding
advisory issues changes none of the three: every row field keeps its meaning, unit, basis and period;
every invariant in §5 is unchanged; nothing a consumer was entitled to rely on has been altered. A
consumer that ignores `issues` entirely sees **exactly** what it saw before.

**`contractVersion` stays at 3.** Recorded here so the decision is visible rather than inferred from its
absence.

*Later, and for a different reason:* version 4 (2026-09-22, the R12 round) is a changed **requirement** — decision
8's cut became mandatory in R-AGE-SPAN — which is exactly what §8 says a bump is for. The reasoning above, about
advisory issues, still stands.

### What S5AA R29 to R39.1 added — recorded late, in R40 (2026-09-30)

*These codes reached `src/` in R29 to R37 without being written here; R40 records them. Read in `src/engine.js` and
`src/scenario-validator.js` at `a2ee714` (`s5aa-r39.1-source`), each against the commit that introduced it. R38 to
R39.1 added none; R40 adds one refusal and one validator code, below.* **`contractVersion` stays at 5,** on the reasoning above and the precedent of R25's
`SCENARIO_NONNUMBER_PLAN_VALUE` (§1): no row field, unit, basis or invariant changed. An advisory issue changes nothing a
consumer relied on. A refusal is an existing outcome, `calculation_error` with no rows, reached by one more cause.

**Six advisory issues, all `WARNING`:**

| code | said when | `state` | introduced |
|---|---|---|---|
| `TRANSFER_INTO_WORKPLACE_REFUSED` | a scheduled transfer into a 401(k) is not payroll money, a same-character rollover from its owner's own plan or pre-tax IRA, or a conversion to its owner's own Roth; nothing moves | `path`, `from`, `to`, `age` | R29 `3a02ed1` (PCF-02) |
| `TRANSFER_BETWEEN_OWNERS_REFUSED` | a rollover between retirement or HSA accounts would pass from one living spouse to the other; nothing moves | `path`, `from`, `to`, `age` | R32 `0413792` (R30A-03) |
| `PENSION_STREAM_AFTER_DEATH_ASSUMED` | a pension stream with no survivor share entered is still paying after its owner's death inside the projection, so a 100% joint-and-survivor annuity is assumed | `path`, `approximation: true`, `assumed`, `streams` | R35 `a69c198` (SA32F-18) |
| `IRMAA_PARTIAL_FIRST_YEAR_COMPLETED` | health costs are on, the plan opens part-way through a year, and someone is 65 or over by plan year 2, so the first year's MAGI for the IRMAA lookback is completed by estimate | `path`, `approximation: true`, `rowDuration`, `completedWith` | R35 `ddf658a` (SA32F-24) |
| `FILING_HOUSEHOLD_MISMATCH` | married filing jointly with no spouse included, or single or head of household with a spouse included | `path`, `filing`, `spouseOn` | R37 `503db3c` (SA32F-35) |
| `EXPENSE_AFTER_PLAN_END` | a one-time expense with an amount is at or after the plan's end age, so no year charges it | `path`, `age`, `endAge`, `amount` | R37 `503db3c` (SA32F-38) |
| `INCOME_AFTER_PLAN_END` | a one-time income with an amount is at or after the plan's end age (on the self's clock), so no year pays it | `path`, `age`, `endAge`, `amount` | R43 (SA42F-28) |

**Four refusals,** each an `ERROR` issue `SCENARIO_<cause>` and the same `calculationErrorCode`, with `status`
`"calculation_error"` and no rows (the "invalid" shape in §3). `validateScenario()` refuses each of the same plans: a
start after the data as `OUT_OF_RANGE`, a debt amount or class volatility as `WRONG_TYPE`, `NEGATIVE_AMOUNT` or
`NEGATIVE_VOLATILITY`, and missing reset terms as `DEBT_RESET_TERMS_MISSING` (only since R40 `d4fd3a9`: until then the
validator accepted that plan and the engine refused it):

| `calculationErrorCode` | refused when | introduced |
|---|---|---|
| `SCENARIO_HISTORY_START_AFTER_DATA` | historical replay starts after the last year of return data | R37 `e923123` (SA32F-51) |
| `SCENARIO_INVALID_DEBT_AMOUNT` | a debt's payment, extra principal, PMI, property tax, insurance or HOA is negative or not a number | R37 `e923123` (SA32F-51) |
| `SCENARIO_INVALID_CLASS_VOLATILITY` | an asset class's volatility is negative or not a number | R37 `e923123` (SA32F-51) |
| `SCENARIO_DEBT_RESET_TERMS_MISSING` | an adjustable debt resets its rate at an age but has no reset rate or no payoff age | R37 `ad62460` (SA32F-21) |
| `SCENARIO_NONFINITE_DEBT_RESET_AGE` | an adjustable debt's reset age is present (not absent or `null`) and not a finite number, such as the string `"35"` | R40 `7cd1a1a` (the audit of PR #35) |

The validator reports that last case, and a present non-number reset rate (the engine's `SCENARIO_NONFINITE_DEBT_RATE`), as
`WRONG_TYPE` since R40 `7cd1a1a`. R40 `c300508` also adds `advanced.healthInflation` to the plan fields refused as
`SCENARIO_NONNUMBER_PLAN_VALUE` (§3), as the validator now types it.

**Five validator codes,** all `error`, from `validateScenario()`, not part of the result: `TRANSFER_INTO_WORKPLACE_PLAN`
(R29 `3a02ed1`) and `TRANSFER_BETWEEN_OWNERS` (R32 `0413792`) on `advanced.transferTo`;
`PENSION_SURVIVOR_PERCENT_OUT_OF_RANGE` (R35 `a69c198`) when a stream's `survivorPercent` is outside 0 to 100;
`NEGATIVE_AMOUNT` (R37 `e923123`) on a negative debt amount; and `DEBT_RESET_TERMS_MISSING` (R40 `d4fd3a9`) on the
missing `resetRate` or `payoffAge` of an adjustable debt with a reset age.

### What S5AA R41 added (2026-09-30)

*Found by the task 6.5 browser check; the owner decided "Repair now". The commit is named in
`audit/S5AA/R41/`.* **`contractVersion` stays at 5,** on the reasoning in the R29 to R39.1 subsection above: a refusal is
an existing outcome reached by one more cause.

| `calculationErrorCode` | refused when | introduced |
|---|---|---|
| `SCENARIO_END_AGE_BEFORE_START` | `profile.endAge` is below `profile.age`, both finite numbers. An end age equal to the starting age is projected (one row) | R41 |

Until R41 such a plan returned `status` `"ok"` with rows running backwards, and the validator only warned. The validator
now reports it as `END_AGE_BEFORE_START`, an `error` at `profile.endAge`, so the app's import refuses the backup; the
existing `INCONSISTENT_AGES` warnings (an end age before the retirement age, a retirement age before the start) are
unchanged.

### What S5AA R42 added (2026-09-30)

*ChatGPT's R41F whole-model audit; the owner decided "Repair all five in R42". The commits are named in
`audit/S5AA/R42/`.* No new code. `retirement.ssBenefit` and `retirement.spouseSS` join the plan fields refused as
`SCENARIO_NONNUMBER_PLAN_VALUE` (§3) when present and not a finite number (R41F-05), and the validator reports them as
`WRONG_TYPE`. Until R42 such a value ran as a zero benefit with `status` `"ok"`. `contractVersion` stays at 5.

---

## 7a. Failure policies — stated BEFORE any new scheduler is built (S5AA task 8.2)

**These three are written here, and here first, because a scheduler that decides them implicitly decides them wrongly.** A campaign runner, a batch harness or any future scheduler reads this section rather than inventing a rule at the point it first hits a failure.

### F-1 — A valid household that depletes is a FINANCIAL OUTCOME, not an error

A plan that runs out of money has been computed correctly. `status` is `ok`, `failed` is `true`, and `firstShortfallAge` and `sustainedFailureAge` carry the ages. **It is counted in the denominator, it is reported, and it is never dropped or retried.** Treating depletion as a failure of the run is the single most common way a success rate becomes meaningless.

### F-2 — A path with a SOFTWARE or CALCULATION error is PRESERVED and INVALIDATES the affected result — never dropped from the denominator

A row carrying `calculationError` or a run carrying `calculationErrorCode` is a defect in the computation, not an outcome of the plan. Such a path:

- **is kept**, with its code and the age it first occurred at;
- **invalidates the result it belongs to** — that result may not be presented as a qualified reference value;
- **stays in the denominator.** Monte Carlo reports `requestedPathCount` and `validPathCount` separately for exactly this reason: a success rate computed over survivors only is a rate over a population chosen by the defect.

**Dropping such a path silently improves every statistic that contains it.** That is why this is a contract term and not a runner's choice.

### F-3 — A CAMPAIGN SCENARIO failure is recorded, and the campaign continues — unless stability or evidence integrity is at risk

One scenario failing is data. The campaign records it with its scenario name and its code and moves to the next. It stops only when continuing would corrupt what it is gathering: when the failure indicates the harness itself is unstable, or when continuing would overwrite, truncate or cast doubt on evidence already collected.

**The Monte Carlo invalidation rule is unchanged by this section.** It is restated, not amended; changing it requires its own decision and a `contractVersion` bump.

---

## 8. Changing this contract

- Bump `contractVersion` for any change of meaning, requirement or invariant.
- **A historical snapshot that fails a newer version is recorded, not fixed** — list it in `tests/result-contract.test.js`. Never adjust the contract to make a stored entry pass.
- A new result field is added here, with sources, **before** consumers rely on it. The catalogue drift test will name any field that arrives without being specified.
