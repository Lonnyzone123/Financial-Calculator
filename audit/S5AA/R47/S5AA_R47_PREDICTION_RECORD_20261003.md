# S5AA R47 — prediction record: federal tax and retirement accounts

*Written by Claude on 2026-10-03 (Arizona, UTC−7). Committed before any R47 edit to `src/` (A-01), and held to
`audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md`. Base: `sprint/s5aa-r47` at `ba9946d` (the R45 round; source
`s5aa-r45-source` = `9c7790e`).*

## The round

The owner's AA1 decisions of 2026-10-03 (`audit/S5AA/AA1`, "The owner's decisions", federal tax and accounts):

1. **AA1-30, the senior deduction ends after 2028.** IRC 151(d)(5)(C)(i): "In the case of a taxable year beginning before
   January 1, 2029". This reverses the owner's Q165 refinement ("keep it even after 2028"). Plan year *k* is tax year 2026 + *k*
   (taxYearRules(), R36); the per-year rules will carry that tax year (`meta.taxYear`), and `seniorDeduction()` returns 0 when it
   is after the stored `expiresAfter` (2028). Plan year 0 keeps the 2026 package object itself (R36's test holds that identity).
   The federal amount stays computed by the one function `seniorDeduction()` (R48's Arizona subtraction will read it).
2. **AA1-13, high earners' catch-up as designated Roth.** IRC 414(v)(7)(A): when the participant's wages (3121(a)) for the
   preceding calendar year from the employer sponsoring the plan exceed the threshold ($150,000 used for 2026: Notice 2025-67,
   "The Roth catch-up wage threshold for 2025 ... is increased from $145,000 to $150,000"), the catch-up is allowed only as
   designated Roth. The model: the catch-up part of that owner's deferral to that pre-tax plan is deposited to a linked Roth 401(k)
   of the same owner (synthesised when needed, as `employerMatchDestination()` synthesises one; it shares the plan's
   402(g)/catch-up/415(c) limits because those are already counted on the plan's item) and is not excluded from income.
   Prior-year FICA wages: the entered `priorYearFicaWages` in the first row; after it, the owner's salary wages in the prior row
   less that owner's HSA salary reduction (cafeteria-plan HSA contributions are not FICA wages, 3121(a)(5)(G); the engine models
   the HSA as a salary reduction, Q104). A first row with no entered figure cannot be tested (pre-tax, and the existing
   "enter prior-year FICA wages" warning). **414(v)(7)(B):** a plan with no Roth option allows no catch-up when (A) applies to a
   participant; new per-account flag `planOffersRoth` (boolean, absent = true: the owner's default "offers Roth"); false makes
   that owner's catch-up share a limit excess, which the limit policy handles. The model sees one participant, so the
   statute's plan-wide effect on other participants is outside it (documented). Final regulations apply to taxable years
   beginning after 2026; before then a reasonable good-faith interpretation is allowed (IR-2025-91); the statute itself applies
   from 2024 with the transition relief ended after 2025 (the rules package's four facts, unchanged). The model applies the rule
   in every row.
3. **AA1-27, IRC 4973.** Under `limitPolicy: "warn"` an IRA or HSA excess stays in the account; it now pays 6% a year on the
   excess carried at the year's close (4973(a)), capped at 6% of that owner's accounts of the kind at the year's close. The
   excess of a year is the sum of: this year's excess deposits (planned, and a one-time contribution moved over its room), and
   last year's excess reduced by (i) distributions — for traditional IRAs those included in gross income (4973(b)(2)(A); a
   Roth conversion's taxable part counts, Form 5329 line 11 "withdrawals ... included in your income"), for Roth IRAs all
   distributions (4973(f)(2)(A)), for HSAs those included under 223(f)(2) (4973(g)(2)(A)) — and (ii) the year's unused room
   (4973(b)(2)(C), (f)(2)(B), (g)(2)(B)), measured as what a one-time contribution of that kind could still add (the engine's
   one-time route), less any one-time contribution of the kind already moved. Kinds per owner: traditional IRA (4973(b)), Roth
   IRA (4973(f)), HSA (4973(g)). The tax is a tax of that year, owed with its return: it joins the row's settled tax and
   `taxOutstanding` (the R19 true-up), so it is paid in the next row and is a liability in net worth until then. 401(k) excess
   deferrals are not 4973 (unchanged). The "warn" option text and the contribution audit's warning for an IRA/HSA excess say so.
4. **AA1-45:** pre-tax workplace deferrals funded from self-employment pay reduce qualified business income (Treas. Reg.
   1.199A-3(b)(1)(vi): the 404 deduction is attributable "on a proportionate basis to the gross income received from the trade
   or business"), in the proportion they reduce AGI: the part of the deferrals the salary cannot absorb comes off employment-stream
   and SE pay (R33's line), SE pay's share of that, times the workplace (not HSA) share of the deferrals. **AA1-26:** an owner's
   compensation from SE is the profit less the deductible half of that owner's SE tax (IRC 219(f)(1), 401(c)(2)(A)(vi); Pub.
   590-A "reduced by ... the deductible part of your self-employment taxes"), Schedule SE per owner (92.35%; 12.4% to the wage
   base less the owner's payroll wages; 2.9%).
5. **AA1-32:** HSA contributions stop at Medicare entitlement (IRC 223(b)(7)). Each owner's Medicare start: an entered
   `profile.medicareStartAge` / `profile.spouseMedicareStartAge` (new, optional, finite, 0-120, own clock); otherwise 65 when the
   owner's Social Security claim (floored at 62 as the engine reads it) is 65 or earlier, or the owner has no benefit modelled
   (`ssPiaBase()` 0); otherwise max(65, claim − 0.5) (Part A "will start 6 months back from the date you apply for Medicare (or
   Social Security/RRB benefits), but no earlier than the first month you were eligible", CMS 11036; medicare.gov "Working past
   65": stop HSA contributions 6 months before applying). R44's proration follows the new date on both routes.

## The checklist

**C6, the readers** (engine.js line numbers at `ba9946d`):

| rule | reader | R47 | condition |
|---|---|---|---|
| senior | `taxYearRules()` :3815 | returns per-year rules carrying `meta.taxYear` = 2026 + plan year (plan year 0: the base object, unchanged) | senior |
| senior | `seniorDeduction()` :419 | 0 when the rules' tax year is after `expiresAfter` | senior |
| senior | `estimateTaxes()` :800 `section151` in the deduction | through `seniorDeduction()` | senior |
| senior | `estimateTaxes()` capital-loss carryover add-back :805, :824 (`section151`) | through `seniorDeduction()`; it enters the deduction and is added back, so the carryover is unchanged by construction (line 1 + 151 cancels) | none |
| senior | `taxSegmentLocal()` :993 (the funding solver's mirror; `solveSegmentFunding`, `quoteTaxFunding`) | the same in-force test | senior (a draw-funded witness) |
| senior | `verifyQuoteObligation()` :1145, the post-commit check :4392, the IRA settlement :4580 | through `estimateTaxes()` | senior |
| senior | `effectiveMarginalRate()` (exported; runPlan does not call it) | reads the 2026 rules: unchanged | none |
| senior | app: "Later tax years" card (app-shell :942), rules page paragraph (:1026) | text: ends after 2028 | text |
| catch-up | `rothCatchupStatus()` :162 | optional projected-wages argument | catchup |
| catch-up | `auditContributions()` :224 | Roth-required items carry their Roth catch-up; a no-Roth plan loses the catch-up share; warning texts | catchup |
| catch-up | deposit loop :4004 (deposit, `preTaxDeferrals`, `additions415`, match, coverage) | Roth part to the linked Roth 401(k), out of `preTaxDeferrals`; 415 room, match base and coverage unchanged | catchup |
| catch-up | `preTaxDeferrals` readers: `ordinaryIncomeBeforeIra` :4325, `ordinaryAtCommit` :4385, `baseline` :4352, `retiredPayCash` :4243 | see the smaller exclusion | catchup |
| catch-up | app first-row audit cards (:942), rules page (:1036) | warning text; "still models ... as pre-tax" rewritten (the phrases R11's test pins kept) | text |
| excise | `auditContributions()` limit warning :224 | IRA/HSA excess under "warn": the 6% sentence | text |
| excise | `withdrawFromAccountList()` :2390, transfer out (runTransfer) | Roth IRA and HSA (included part) distributions recorded per owner in the row's state | excise |
| excise | IRA settlement block :4580 | trad IRA distributions included in income per owner (settled figures where the owner settles) | excise |
| excise | row fields `taxSettled`, `taxOutstanding`, `networth`; next row `taxTrueUpPaid`, `taxes`; `lifetimeTaxes` | include the excise | excise |
| SE comp | `ownerCompensation()` :179 → `auditContributions()` IRA cap :236, the 415(c)(1)(B) deferral cap :231, `rowComp415` employer cap :4028, `transferRoom()` :4056, the app's first-row audit | SE part net of half SE tax | se |
| QBI | `estimateTaxes()` :811 `qbiAmount`; callers :4344 (pre-IRA), :4350, :4385, :4580 | new trailing argument, the SE-funded deferral | se |
| QBI | `taxSegmentLocal()` :1033 (`ctx.qbi` = `taxes.qbi`), `verifyQuoteObligation()` (`taxCtx.qbi`) | receive the reduced amount, no code change | se |
| HSA | `auditContributions()` planned route :201 (`hsaBefore65`), one-time route :246 (`oShare`) | the owner's Medicare start | hsa |
| HSA | contract (`plan-value-contract.json`), engine input gate, validator | two new optional numbers | inputs |
| HSA | app: two inputs, `readStatic`/`writeStatic`, `staticIds`; HSA note :1039 | | text |
| all | app `workerFunctions` (:627) | new top-level helpers added (the R45 lesson, SA45-A) | worker |

Not changed (other rounds' areas): Medicare premiums and IRMAA, and the R43 idle-spouse Medicare rule, keep 65 and the
household date; the validator's earned-income contribution warning (R45) still reads gross SE profit (validator-only, moves no
figure; noted for the build report).

**C1.** The scan (`prediction/r47_corpus_scan.js`) calls the engine where the engine decides: `seniorDeduction()`,
`ageAmountAges()`, `householdFilingFor()`, `taxYearRules()`, `householdWorkDurations()`, `ownerContributionWindow()`,
`auditContributions()` (catch-up shares, HSA items), `ssPiaBase()`. The Medicare start and the projected wages are mirrored from
the owner's rules (the helpers do not exist before the edit). `ownerCompensation()` is not exported, so the scan's audit runs as
a direct caller (annual durations) — a necessary condition.

**C2.** The catch-up condition requires the catch-up share to flow (contribution duration > 0) and the wage test; the HSA
condition requires an HSA item with a request and a contribution duration in a row past 65 and before the new start; the
senior condition requires a positive deduction in the row (Monte Carlo: age only).

**C3.** The SE condition requires a stream with a positive amount paying inside the horizon.

**C4.** Monte Carlo plans flagged: `golden:monte-carlo-fixed-seed` and `expansion:monte-carlo-sensitive-band`, senior only, by
age (someone 65+ alive by a row's close at plan year 3 or later): **named, every path exposed; the published result may move.**
Path-level measurement after the build: every path whose senior deduction was positive after 2028 changes.

**C5.** Directions: the senior movers by the scan's own estimate (the deduction removed times the federal marginal rate at the
row's approximate taxable income, under the row's indexed rules) — taxes up, balances down; second-order effects (taxable
Social Security, IRMAA, the tax on the tax-funding draw) push the measured rise above the estimate. Each witness's direction is
in its derivation in the test file.

**C7.** Each repair case has a control in the test file; at `ba9946d` the 7 controls pass and the 29 repair cases fail with the
pre-repair figure (`witness_runs/r47_tests_at_ba9946d.txt`).

**C8, how each comparison reads the moving fields.**
- **Control 4.7** (`tools/differential-harness.js`) compares every row value and `lifetimeTaxes` of the 36 control plans; the 19
  senior movers below will differ. They are declared in `tools/control-candidate-prediction.json` after the build, from the
  measured differences, as R43/R44 did (the coordinator re-derives the declaration after integrating the rounds in order).
- **The expanded capture** compares every row field entry by entry (taxes, taxSettled, taxOutstanding, balances, networth,
  lifetimeTaxes, `limitWarnings` text). The 40 senior movers move from their first post-2028 row with a senior.
- **Golden fixtures** (`tests/fixtures/golden-scenarios.fixtures.json`): `rmd-and-roth-conversion` moves (a corpus senior mover);
  `monte-carlo-fixed-seed` may move; the other three are not flagged (their MAGI is above the phase-out end in every senior
  row). The fixture is regenerated by intent with the reviewed diff.
- **Tests** pinning a figure of a plan with a senior after 2028, or pinning the changed texts, move. Named in advance:
  `audit-s5aa-r36-later-year-tax-indexing` (its header pins "kept after 2028 by D8"; its later-year figures include a senior),
  `audit-s5aa-r36-tax-year-rules-rounding` (D8 note; its identity and deep-equal checks are expected to hold),
  `audit-s5aa-r40-later-tax-years-card-rendered` (pins "which this plan keeps after 2028"), `roth-catchup-transition` (its header
  says the catch-up stays pre-tax; its "runPlan results do not move" control compares two plans that both project wages, so it is
  expected to hold), `rendered-results-warnings` (pins /catch-up contributions must be designated Roth/: the phrase is kept),
  `golden-scenarios`, `control-corpus`, `historical-replay` (declared differences), `audit-q15-worker-dependencies` /
  `worker-parity` (the Worker list), `boolean-flag-contract`, `audit-s5aa-r43-plan-value-contract`. No test is run as a full
  suite here (the coordinator runs the gate); a test that fails in the targeted runs or the gate and is not named here is a miss.

## Predictions

### 1. The corpus (`prediction/r47_corpus_scan_at_ba9946d.txt`)

- **catch-up, excise, SE, HSA: no corpus plan flagged** in either composition (no "warn" plan, no SE stream; no catch-up over the
  threshold — `expansion:s5aa-gap-working-household` earns exactly $150,000, which does not exceed it; no HSA contribution past 65
  with a claim after 65).
- **senior: 19 control plans and 40 expanded plans** (the 19 plus 21), each moving from its first row of plan year 3 or later with
  a positive senior deduction; taxes up, final totals and lifetime net worth down. Estimated federal tax increases (lifetime,
  before second-order effects), from the scan: `golden:rmd-and-roth-conversion` ~$17,188; `seed:1` ~$3,531; `seed:2` ~$11,197;
  `seed:5` ~$215; `seed:6` ~$790; `seed:10` ~$16,741; `seed:16` ~$3,443; `targeted:historical-spouse-ss` and
  `targeted:spouse-cola-income` ~$20,400 each; `targeted:historical-1929` ~$13,920; `-1966` ~$9,232; `-2000` ~$14,750;
  `targeted:arm-flag-on` ~$3,600; `targeted:collision-household-cash` ~$7,200; `targeted:explicit-cash-holding` ~$2,238;
  `targeted:funded-qcd` ~$1,440; `targeted:survivor-stateful` ~$3,000; `targeted:collision-rmd-retained-cash` ~$7,284; the four
  `expansion:other-asset-*` ~$6,600 each; the eight `expansion:debt-*` ~$9,000–$9,720 each; `s5aa-gap-working-household`
  ~$11,745; `s5aa-gap-death-while-working` ~$10,377; `s5aa-r6-gap-survivor-health-roth` ~$7,800; `s5aa-r6-gap-basis-conversion`
  ~$4,320; `s5aa-r14-rmd-conversion-under-loss` ~$1,320; `-two-iras-distinct-returns` ~$1,800; `-prototype-ids` ~$2,400;
  `s5aa-r15-rmd-transfer-to-taxable` ~$1,200. Measured lifetime-tax rises are expected within about −10% to +40% of these (the
  tax on the extra tax's funding draw, Social Security taxation and the plan's own inflation of later rows push it up).
  Monte Carlo: `golden:monte-carlo-fixed-seed`, `expansion:monte-carlo-sensitive-band` — named, every path exposed, the
  published result may move.
- **Every other corpus plan is unchanged.**

### 2. The witnesses

`tests/audit-s5aa-r47-federal-tax-and-accounts.test.js`, 36 cases (SHA-256 `8bfb7690…bbf3efa` at the pre-repair run). At
`ba9946d` 29 repair cases fail with the pre-repair figure and 7 controls pass. After the repair every case passes.

Two derivations were corrected before this record, on the base run, where the case's year or input does not change under the
repair (so the base engine's figure is the hand figure): the 2028 draw (`0.855 X = 36,399` gives X = 42,571.93, not 42,572.51 —
an arithmetic slip) and the SE cases' half SE tax (15.3% × 73,880 = 11,303.64 exactly; 5,651.82, not 5,651.8215). Both are
recorded here rather than silently re-expected.

### 3. The gate and the browser

- The coordinator's gate passes after the named adaptations, the control declaration and the golden regeneration; closeout 12/0/0.
- The new form inputs are exercised in the browser at the round's candidate (task 6.5).
