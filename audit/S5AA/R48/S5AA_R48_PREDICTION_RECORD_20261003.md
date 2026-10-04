# S5AA R48 — prediction record: Medicare, survivors and Arizona

*Written by Claude on 2026-10-03 (Arizona, UTC−7). Committed before any R48 edit to `src/` (A-01), and held to
`audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md`. Base: `sprint/s5aa-r48` at `ba9946d` (the R45 round; source
`s5aa-r45-source` = `9c7790e`). R48 is built in parallel with R46, R47, R49 and R50, each in its own worktree; the coordinator
integrates them.*

## The round

The owner's AA1 decisions of 2026-10-03 (`audit/S5AA/AA1/S5AA_AA1_CLAUDE_VERIFICATION_20261003.md`, "The owner's decisions",
untracked in the main checkout), as given to this round:

1. **AA1-23, Medicare premiums grow.** The Medicare charge -- the Part B premium and the IRMAA amounts (`irmaaMonthly()` returns
   the Part B premium plus the Part D surcharge of the tier), the Part B deductible and the Part D premium -- grows from 2026 at a
   Medicare growth rate: the new optional `advanced.medicareInflation` (percent) when entered, else `advanced.healthInflation`.
   The new optional `advanced.partDPremium` (monthly, per person, 2026 dollars) replaces the CMS base beneficiary premium when
   entered; the IRMAA Part D surcharge still applies on top. The growth factor is `(1 + g)^yearProgress`, the factor the
   pre-Medicare cost already uses, so with no Medicare rate both grow alike. The IRMAA thresholds keep indexing at the plan's
   inflation (`taxYearRules()`, unchanged). Both inputs in the form's Medicare section, contract-typed, in
   `ADVANCED_OPTIONAL_KEYS` and `staticIds`; disclosed on the "Later tax years" card and the Rules page.
2. **AA1-11, the prior-income prompt.** `IRMAA_PRE_PLAN_MAGI_ASSUMED` joins the app's `planWarningTitles` (a card); the two
   prior-year MAGI inputs get help text ("blank means ... below the first surcharge tier"); a validator WARNING
   (`IRMAA_PRIOR_INCOME_BLANK`) mirrors the engine's own condition (health costs on, someone 65 or older alive at a plan-year-0
   or -1 opening with the household retired inside that row, `householdRetireAge()`), firing when either prior-year MAGI is
   blank. The engine message changes only where exactly one of the two is entered (it said both years assume no surcharge).
3. **AA1-19, inherited IRA until 59½.** At the succession, a survivor under 59½ at that row's opening holds each of the
   deceased's traditional IRAs as an inherited IRA (spouse sole beneficiary): no 10% additional tax (IRC 72(t)(2)(A)(ii)); the
   required distribution as a spouse beneficiary (26 CFR 1.401(a)(9)-3(d) for the start, -5(d) for the divisor, the Single Life
   Table of -9(b), added to the rules package); its Form 8606 basis in its own pool (Pub. 590-B); from the first row opening at
   59½ or later, or the row after a contribution lands in it (1.408-8(c), a deemed election), it is the survivor's own and the
   basis joins the survivor's pool. Survivor 59½ or older: unchanged. The disclosure is rewritten.
4. **AA1-20, community property.** `profile.communityProperty` (boolean, optional, absent = false, in
   `src/boolean-flag-contract.json`, a form checkbox shown with a spouse, in `staticIds`). True: at the first death the basis of
   the joint taxable account and of both spouses' own taxable accounts resets in full to the opening value.
5. **AA1-16, Arizona subtractions.** (a) A.R.S. 43-1022(35): the amount deducted federally under IRC 151(d)(5)(C) (the
   engine's `section151`, so R47's end of the federal deduction after 2028 carries through) comes off Arizona's base, in
   `estimateTaxes()` and its mirror `taxSegmentLocal()`. (b) 43-1022(22)(c): 25% of the net long-term gain times the new optional
   `retirement.azPost2011GainShare` (percent, 0-100, absent = 0%: no subtraction, today's behaviour -- **a default for the owner
   to decide**). `measures.arizona_agi` subtracts both (Arizona AGI is gross income less the 43-1022 subtractions). The
   "Arizona estimate" card and Rules section say so. Two records join the Arizona rules.

## The checklist

**C6, the readers.** `src/engine.js` at `ba9946d` was searched for every reader of each rule, table, function and field the round
changes (`.owner` -- 70 lines, each read --, `irmaaMonthly`, `partB`/`partD`, `azBase`/`azClamp`/`arizona_agi`,
`section151`/`Dsenior0`, `earlyWithdrawalPenaltyRate`, `rmdObligations`, the IRA-pool functions, `basisDollars`, the succession
block). Each reader and what R48 does to it:

| reader (engine.js at `ba9946d`) | R48 | condition |
|---|---|---|
| Medicare charge, household retired span :4197 | `(irmaaMonthly x 12 + deductible + Part D x 12) x (1+g)^yearProgress`; Part D from `partDPremium` when entered | medicare |
| Medicare charge, R43 idle spouse :4201 | the same factor and premium | medicare |
| `irmaaMonthly()` :2287 (also read by `rules-derived-functions` tests) | unchanged: its return is multiplied at the two sites | — |
| `taxYearRules()` IRMAA thresholds :3851-3855 | unchanged | — |
| `smartWithdrawalOrder()` IRMAA guard :2309 | reads thresholds only; unchanged | — |
| `IRMAA_PRE_PLAN_MAGI_ASSUMED` :5051 | message only when exactly one prior MAGI is entered | irmaaPrePlan |
| succession block :3940-3982 | IRAs to a survivor under 59½ tagged inherited; the decedent's basis to the inherited pool; community-property reset | inherited, community |
| `earlyWithdrawalPenaltyRate()` :2358, and its callers (the quote :2013, the optimizer weight :2309, the draw :2394, the transfers :4111) | 0 for an inherited account; the callers follow | inherited |
| `rmdObligations()` :3042-3112, and `rmdProtectedAmounts()`/the conversion reservation :2803, :3119 (callers) | the inherited IRAs leave the survivor's own IRA obligation and form their own (kind `inheritedIra`), payable from them only (1.408-8: aggregation only among IRAs held as beneficiary of the same decedent); no QCD credit (kind `ira` only) | inherited |
| `form8606Basis`, `iraPoolFor`, `iraBasisFractionFor`, `iraPoolsAtStart`, `iraBasisRecoveredFor`, `recordIraFlow`, `spendIraBasis` :494-608, and the by-owner tallies in `withdrawFromAccountList` :2392, `convert...` :2952-2966, the transfers :4091-4118, the row-end settlement :4580 | a third pool key, `inherited`, for a tagged account | inherited (basis) |
| `qcdOwnerRequests()` / `payQcdFromOwnerIras()` :2999-3017 | unchanged: QCDs start at 70½, the inherited status ends at 59½ | — |
| contributions :4004-4032 | a lawful contribution into a tagged IRA ends the status from the next row | inherited |
| `accountOwnerAge()`, the Rule of 55, vesting, still-working, HSA ages | unchanged (an IRA has no Rule of 55; the survivor's age is the owner's age) | — |
| `accountSuccessionClass()` :623, `SPOUSAL_ROLLOVER_ASSUMED` :4655-4705 | the joint-account assumption text names the switch; the message and `notModelled`/`authority` say the inherited status is modelled; `inheritedIra` in the payload | rolloverText |
| `estimateTaxes()` `azBase` :824, `measures.arizona_agi` :800 | less `section151` and the gain share | azSenior, azGain |
| `taxSegmentLocal()` `azClamp` :1065 | the same, as value/slope pieces (`Dsenior0`/`rDsenior`, `netGain`) | azSenior, azGain |
| `quoteTaxFunding()` ctx :2049 | carries the gain share | azGain |
| `taxConfigForFilingStatus()` `arizona_ltcg_subtraction: 0` :420 | unchanged: a filing-level config for the ported reference engine (`src/ported/tax-engine.js`), with no plan input; 0 is the default share's answer | — |
| input gate `nonNumberPlanValuePath()` / boolean gate | the four fields through the two contracts | inputs |

The validator (`ADVANCED_OPTIONAL_KEYS`, the new warning, the health-inflation-style range warning for `medicareInflation`), the
contracts and the app (inputs, `readStatic()`, `writeStatic()`, `staticIds`, `planWarningTitles`, the "Later tax years" and
"Arizona estimate" cards, the Rules page's Medicare and Arizona sections) move no engine figure. No new top-level engine function
is planned that a run needs outside existing ones; any that is added joins `workerFunctions` in the same commit (SA45-A).

**The R45 lesson: what pins a message, label, id, list or default.**
- *Validator messages:* the new code is new; no test pins its absence by name. Tests that assert "no warnings" for a plan the new
  warning reaches: the exposure hook names every `validateScenario` call it reaches (below: 9 files under `irmaaWarn`); those
  asserting zero warnings or a warning count are measured in the targeted run.
- *Form labels and ids:* new ids only (`v2-medicare-inflation`, `v2-part-d-premium`, `v2-community-property`, `v2-az-gain-share`);
  the two IRMAA labels gain a note; R45's listener test (`audit-s5aa-r45-carried-test-gaps`) holds every read id to `staticIds`.
- *`staticIds`:* four ids added; no test pins its length.
- *`workerFunctions`:* unchanged unless a helper is added (then added, SA45-A).
- *`defaultPlan`:* not changed. Every new field is optional and absent by default.
- *Card text:* `rendered-results-warnings` and `rendered-rule-disclosures` pin phrases of the Arizona card and section
  ("2.5% rate (ENACTED)", "federal AGI less federally taxable Social Security", "basic standard deduction (INFERRED until the
  final Form 140)", "$2,100 for each person 65 or older (ENACTED)"): kept. `audit-s5aa-r40-later-tax-years-card-rendered` pins
  four sentences of the "Later tax years" card: kept, one sentence added.
- *Disclosure text:* `audit-s5aa-r7-executed-succession` pins the JOINT assumption string exactly (it changes: adapted by intent);
  `audit-s5aa-r35-basis-resets-at-death` asserts "half of its cost basis" and "Community property" (kept); `audit-s5aa-spousal-
  rollover` asserts `/inherited IRA/` in the message and `notModelled` includes "beneficiaries" (both kept).
- *Rules JSON:* a `singleLife` table and two Arizona records are added; tests that enumerate Arizona records
  (`tax-wiring`, `rules-record-shape`, `arizona-return-partial`, `audit-s5aa-x08-...`, `public-route-fm02`,
  `rendered-rule-disclosures`, `audit-s5aa-r36-tax-year-rules-rounding`) run in the targeted set.
- *Control prediction:* `tools/control-candidate-prediction.json` gets this round's declarations (control 4.7 must find exactly
  them); the coordinator re-derives them on integration.

**C1.** Every scan fact the engine decides is asked of the engine: `householdRetireAge()`, `householdSeniorAges()`,
`householdWorkDurations()`, `householdFilingFor()`, `ageAmountAges()`, `seniorDeduction()` on the row's reported
`seniorDeductionMagi`, the `SPOUSAL_ROLLOVER_ASSUMED` payload for what passed and when, and R40's output-neutral FLOWS tap for
per-account balances and the 10% tax.

**C2.** The Arizona condition tests that a federal senior deduction is taken in that row (not only that someone is 65); the
Medicare condition tests that someone is charged in that row.

**C3.** The Medicare charge must flow (a row with a positive charged span); the inherited condition needs an IRA passing with value;
the gain condition needs an entered share (none is).

**C4.** Two Monte Carlo plans are exposed, both by the Arizona condition, which for a Monte Carlo plan reads ages alone (a path's
MAGI may differ from the median row's): `golden:monte-carlo-fixed-seed` and `expansion:monte-carlo-sensitive-band`, **named, with
every path exposed (the condition is age-only, identical on every path, so path 0 equals `runPlan(runs: 1)` trivially); the
published result may move.** No Monte Carlo plan is exposed to the other rules.

**C5.** Directions and sizes: below, from hand traces (no pre-repair input charges a grown Medicare premium or subtracts the senior
deduction from Arizona's base). Each witness's direction is in its own derivation.

**C7.** Every witness has its control beside it in the test file (9 controls); all pass on `ba9946d`; every repair case (23) fails
there with the pre-repair figure (`witness_runs/r48_tests_at_ba9946d.txt`).

**C8, how each comparison reads the moving fields** (read from `tools/differential-harness.js` `compareValues()` and the stored
control capture `tools/baseline-20260914-s5-control.json`):
- **Control 4.7** compares every leaf of each stored result against the live one; an array of a different length is one LENGTH
  difference and only the common prefix is compared. The stored capture of `targeted:survivor-stateful` holds `issues: []`, so the
  rewritten `SPOUSAL_ROLLOVER_ASSUMED` message is invisible there (the existing declaration is `LENGTH issues 3`); its numbers are
  visible. Rows, taxes, totals and status fields are compared value by value.
- **The expanded capture** hashes each entry's whole result, issues and their messages included (`captureEntry()`), and
  `cmp_exp.js` compares entry hashes: a message change moves an entry.
- **Tests:** a test pinning a figure of an exposed plan moves; each failure in the targeted run is re-measured and either moves by
  the rule (adapted by intent, recorded with before and after figures) or is a miss.

## Predictions

### 1. The corpus

`prediction/r48_corpus_scan.js` on `ba9946d` (`prediction/r48_corpus_scan_at_ba9946d.txt`):

- **control (36): 19 flagged.** Medicare: `seed:10` (historical; 22 rows at 4.05%), `seed:16` (16 rows at 7.39%). Arizona: those
  two and 17 more (`golden:monte-carlo-fixed-seed`, `golden:rmd-and-roth-conversion`, `seed:1`, `seed:2`, `seed:5`, `seed:6`,
  and 11 `targeted:` plans; full list in the scan output). Rollover text: `targeted:survivor-stateful` (invisible at 4.7, C8).
- **expanded (71): 47 flagged** -- the 19, plus 28 expansion plans under the Arizona condition, and two more under rollover text
  (`expansion:s5aa-gap-death-while-working`, `expansion:s5aa-r6-gap-basis-conversion`, both also under Arizona).
- **No corpus plan** is exposed to the inherited IRA (no traditional IRA passes to a survivor under 59½), carries a new input,
  or has exactly one prior-year MAGI entered.
- **Not flagged, unchanged (24):** `golden:baseline`, `golden:reserve-and-bond-tent`, `golden:guardrails-withdrawal-strategy`,
  `seed:3, 4, 7, 8, 9, 11, 12, 13, 14, 15, 17, 18, 19, 20`, and seven expansion plans (scan output).

Directions and sizes (C5):
- **Medicare movers, `seed:10` and `seed:16`:** health cost up in every Medicare row after the first; by the first-tier hand
  trace about **$203,000** (seed:10) and **$292,000** (seed:16) more charged over the plan, before tax and growth. Spending and
  withdrawals up, taxes up on the extra draws, totals and net worth down by more than the charge (lost growth); a shortfall may
  appear or come earlier. These dominate their Arizona effect.
- **Arizona movers:** taxes down in each row with a senior deduction and a positive Arizona base, by 2.5% of the deduction at
  most ($150 a person a year; the scan's sums run from $44.84 to $6,000 over a plan); withdrawals down by about that, totals up by
  that plus its growth. A row whose Arizona base is already 0 does not move; so a flagged plan may not move at all (the condition
  is necessary). Monte Carlo: named, all paths exposed, the published result may move.
- **Rollover-text movers:** the three plans' `SPOUSAL_ROLLOVER_ASSUMED` message and payload (`notModelled`, `authority`,
  `inheritedIra: []`) move in the expanded capture; no figure moves from it.

### 2. The tests

`prediction/r48_test_exposure_hook.js`, loaded into a targeted run of the 176 test files that could pin what R48 changes
(`prediction/r48_test_exposure_files.txt`), on `ba9946d` (`prediction/r48_test_exposure_at_ba9946d.txt`; 1,560 tests, 1,556
pass, 3 authorized todos, 1 hook artefact). Exposed: Arizona 125 files (a necessary condition), Medicare 16, rollover text 44,
inherited 3, validator warning 9.

- **Expected to fail and be adapted by intent** (each with before and after figures in the build report):
  - `audit-s5aa-r40-part-d-base-premium` (5% health inflation: `[3185.68, 3185.68, 3185.68]` becomes `[3185.68, 3344.96,
    3512.21]`, and the couple's likewise);
  - the Medicare-figure tests among `audit-s5aa-r33-irmaa-lookback-status-and-top-tier`, `audit-s5aa-r35-irmaa-pre-plan-and-
    partial-year`, `irmaa-pre-plan-lookback`, `audit-s5aa-r43-plan-value-contract`, `audit-s5aa-r11-disclosures-match-execution`
    that pin a charge in a row after the first at a nonzero rate;
  - `audit-s5aa-r20-early-tax-uses-owner-age`, "after a death the survivor's age governs the rolled-over IRA" (survivor 51:
    `[11111.11, 1111.11, 78888.89]` becomes `[10000, 0, 80000]`, no 10%);
  - `audit-s5aa-r7-executed-succession` (the JOINT assumption string);
  - every test pinning Arizona tax, taxes, withdrawals or totals of a plan with a federal senior deduction and a positive Arizona
    base -- the Arizona 125 are the necessary set; the ones that pin such a figure are found and measured in the targeted run;
  - `arizona-return-partial` / `tax-named-income-measures` if a case with a senior deduction pins `arizona_agi` as federal AGI less
    taxable Social Security;
  - tests holding a validator warning count for a plan in `irmaaWarn`.
- **Expected to pass unchanged:** `audit-s5aa-r6-basis-per-owner` and `audit-s5aa-spousal-rollover`'s basis case (their
  survivors, 47, hold the IRA as inherited, but each inherited pool is all basis, so AGI stays 0); the conservation invariants
  (`household-ledger`, `reconciliation-invariant`, `networth-reconciliation`): they reconcile cash, and the new charge and
  subtraction are ordinary health spending and tax.
- **Expected to fail until the coordinator acts:** tests comparing a live capture with a registered baseline (r24) or with the
  control prediction (4.7, if run before this round's declarations are written); this round writes its own 4.7 declarations and
  registers no baseline.
- Every other failure is a miss.

### 3. The witnesses

`tests/audit-s5aa-r48-medicare-survivors-arizona.test.js`, 32 cases (SHA-256 `64a860ea121268eb3ca53745f8a7d6f48a0b5b60f0d4d366267371bfb6a26ac8`
as run on the base). On `ba9946d` the 23 repair cases fail with the pre-repair figure and the 9 controls pass:

| case | expected (hand-derived) | at `ba9946d` |
|---|---|---|
| Medicare at 5%, rows 67-69 | 3,185.68 / 3,344.96 / 3,512.21 | 3,185.68 flat |
| Medicare rate 3% replaces 5% | 3,185.68 / 3,281.25 / 3,379.69 | flat |
| Part D $50 at 4% | 3,317.80 / 3,450.51 / 3,588.53 | 3,185.68 flat |
| IRMAA tier 3, 5% | 6,070.48 / 6,374.00 / 3,512.21; $50 premium at 0%: 6,202.60 | 6,070.48 / 6,070.48 / 3,185.68 |
| idle spouse 68, row 62 | 3,344.96 | 3,185.68 |
| the two inputs typed | refused by both layers | accepted |
| validator prompt | `IRMAA_PRIOR_INCOME_BLANK` | none |
| card and help text | present | absent |
| survivor 51, inherited draw | W 43,763.16, tax 3,763.16 | 49,559.60 |
| RMD, death before the RBD | 14,164.31 at 74 and 75 | 0 |
| RMD, survivor 59 at the death | 17,857.14 at 74, 0 at 75 | 0 |
| RMD, death after the RBD | 15,432.10, then 15,835.55 | 15,432.10, then 0 |
| inherited basis pool | AGI 0 | 5,454.55 |
| contribution ends it | held 51 to 52, `contribution` | no payload |
| disclosure | inherited, 59 1/2, authority 72(t)(2)(A)(ii) | old text |
| community property | 100,000 x 3, either death | 70,000 / 100,000 / 40,000 |
| switch typed | refused by both layers | accepted |
| Arizona senior, $60,000 / $100,000 | 895 / 1,932.50 | 1,045 / 2,045 |
| Arizona senior, projection | W 42,396.49 | 42,571.93 |
| gain share 50% / 100% / net loss | 1,222.50 / 1,097.50 / 272.50 | 1,347.50 / 1,347.50 / 272.50 |
| gain share, projection | W 80,350.79 | 80,605.06 |
| share typed | refused by both layers | accepted |
| form ids | read, written, listened | absent |
| controls: 0% Medicare; prompt controls; survivor's own IRA (49,559.60); survivor 59½ (43,763.16); RMD survivor 60 (0); basis survivor 60 (5,454.55); no community property (70,000 / 100,000 / 40,000); Arizona under 65 (1,097.50); no share (1,347.50) | as before | pass |

Two fixtures were corrected while the witnesses were written, before this record: the community-property and gain-projection
plans now turn dividends on at a 0% yield, because with dividends off the engine imputes a 1.5% yield, reinvested as basis and
taxed (the first run showed 72,250 / 101,500 / 43,000 and W 80,954.07). Neither was a derivation of the rule.

After the repair every case passes. A case whose derivation proves wrong in the build is corrected and recorded as a miss.

### 4. Gate and browser

The gate is the coordinator's (one at a time). This round runs its witnesses and the targeted set. The browser check (task 6.5)
falls to the coordinator's integrated candidate, including the four new inputs.
