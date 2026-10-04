# S5AA R49 — build report: spending, debt, defaults and disclosure

*Written by Claude on 2026-10-03 (Arizona, UTC−7). Branch `sprint/s5aa-r49`, from `ba9946d` (R45). Built in its own worktree, in
parallel with rounds R46–R48 and R50; the coordinator integrates, runs the gate and registers baselines. Nothing pushed or tagged.*

## 1. The commits

| commit | what |
|---|---|
| `6292431` | the prediction record (A-01), its scans, exposure runs, the `defaultPlan` experiment and the witness run at the base |
| `62964a1` | the repair: engine, validator, plan-value contract, app; the witness file; five tests adapted by intent; the schema catalogue regenerated; registers rebuilt; the app rebuilt and repinned |
| `070f721` | the witness cases that need engine internals moved to their own file (closeout had refused AA1-07, -25, -34, -37 as guarded only by an implementation-coupled test); no expectation changed |
| (this commit) | the measurements and this report |

## 2. What changed

**Engine (`src/engine.js`).**
- **AA1-25 (a)** `strategySpending()`: the flexibility cut stops at the strategy's entered floor —
  `spend = max(spend × (1 − f), min(spend, floor))`, floor = `min(floor, ceiling)` × price level (guardrails, Guyton-Klinger,
  floor-and-ceiling), `rmdFloor` × price level (remaining-life), `balance × min rate` (VPW); no floor, the whole cut as before.
  Read by the row's spending and by the cash reserve's sizing (`rowReserveSpend`), whose own rule is untouched.
- **AA1-37** `advanced.ltcOnsetAge`: entered, the deterministic onset is that age as entered; Monte Carlo draws
  `max(plan start age, onset − 10 + 20u)`; absent, the old rule. The draws are taken in the same order.
- **AA1-34** new `pmiStopAge(debt, startAge)` (exported; in the Worker list): an entered `pmiEndAge`; else, for a `"conventional"`
  mortgage with both terms (0 ≤ remaining ≤ term, term > 0), `startAge + (floor((remaining − term/2) × 12) + 1) / 12` (the month
  after the HPA midpoint); else null (while owed). Set per debt at the projection's start as a non-enumerable `_pmiStopAge`;
  `projectDebts()` charges PMI only in owed months before the stop (a direct caller gets the entered age only).
- **AA1-07** new `noteWorkingYearsShortfall()` (exported; in the Worker list) and the per-row check: `WORKING_YEARS_NOT_FUNDED_BY_PAY`
  (WARNING, once per run, state `{path: "employment.salary", age, shortfall}`) when the working share of
  (wages − contributions − the wage-only tax) less the working months' debt service and PMI is below zero. `projectDebts()` returns
  a new field `workingService` for it.

**Validator (`src/scenario-validator.js`).** WARNINGs `SPENDING_STAGES_OVERLAP`, `FLEXIBILITY_WITH_GUARDRAILS`
(path `retirement.flexibility`), `DEBT_PAYOFF_RESIDUAL` (≥ $0.50 left at a payoff age ≤ the plan's end) and
`INSURANCE_AFTER_INSURED_DEATH`; exported `debtPayoffResidual(debt, startAge, endAge)`; `ltcOnsetAge` in `ADVANCED_OPTIONAL_KEYS`.

**Contract (`src/plan-value-contract.json`).** `advanced.ltcOnsetAge` (0–120); debts `pmiEndAge` (0–120), `loanTermYears` (≥ 0),
`remainingTermYears` (≥ 0) — the engine now reads the two terms.

**App (`src/app-shell.html`).**
- Relabels and notes: "Standard · 10% (historical US stocks)" and a return note (historical US stocks, nominal, before fees,
  arithmetic mean, not a forecast); a fee note; both Social Security inputs "(today's dollars, from your/the spouse's SSA statement)"
  with the work-to-claim-age note; "Rule-based withdrawal order", "Tax-sensitive ordering goal (heuristic)" and a note that it
  ranks by fixed rules with no search or lookahead; a flexibility note (one year, never below the floor, stacks on guardrails);
  the dividends note (off = an assumed 1.5% qualified yield, reinvested; on at 0% for none); "Life insurance death benefit (estate
  measure)" with its note; life-age notes (the projection ends at the last modeled death); "Lifetime taxes (no missed-RMD excise)";
  the debt page's note (program and terms now set the PMI default).
- A "How the tax figures are estimated" card on every results page: partial first/last years taxed with a whole year's brackets and
  deductions; pooled withdrawals judged at the year's opening age (59½, and 65 and 70½ likewise); all gains long-term; no missed-RMD
  excise; Monte Carlo debts on one schedule with median rows.
- The LTC onset input `v2-ltc-onset` (read, written, in `staticIds`) with the disclosed default rule.
- The debt editor: "PMI ends at (your age)" in the mortgage details, with a note; "Estimated lump sum due at the payoff age" beside
  the payoff age, refreshed on every debt edit.
- `planWarningTitles` (below) and the "Plan checks" list in the header (`v2-plan-checks`): `validateScenario()` on the active plan
  at each `calculate()` (after `readStatic()`) and at load; WARNINGs only; hidden when empty (the default plan has none).

**`planWarningTitles` — added, with the reason.** Each is an engine disclosure that tells the user something the projection assumed
or did not do, which no other card states: `UNSUPPORTED_ROTH_ORDERING`, `SURVIVOR_FILING_STATUS_MODELLED`,
`SPOUSAL_ROLLOVER_ASSUMED`, `WORKING_YEARS_NOT_FUNDED_BY_PAY` (the owner's four); `TRANSFER_CONVERSION_REFUSED`,
`TRANSFER_BETWEEN_OWNERS_REFUSED`, `TRANSFER_INTO_WORKPLACE_REFUSED`, `CONVERSION_IRA_NEEDS_ROTH_IRA` (an entered action was not
carried out); `IRA_BASIS_FROM_PROJECTION_ONLY`, `HSA_QUALIFIED_SHARE_ASSUMED`, `PENSION_AFTER_DEATH_ASSUMED`,
`PENSION_STREAM_AFTER_DEATH_ASSUMED`, `SURVIVOR_BENEFIT_APPROXIMATED`, `REVOLVING_DEBT_MINIMUM_MODELLED`,
`QCD_OPENING_YEAR_CAP_ASSUMED`, `UNSUPPORTED_HISTORICAL_ALLOCATION` (assumptions that move figures); `PROJECTION_ENDS_AT_LAST_DEATH`,
`DEATH_BEFORE_PLAN_START` (the horizon; pairs with the life-age relabel); `ARM_RECAST_ALWAYS_APPLIED`, `SS_CLAIM_AGE_BOUNDED`,
`DIVIDEND_QUALIFIED_CLAMPED` (an entered value read differently). **Not added:** `IRMAA_PRE_PLAN_MAGI_ASSUMED` and
`IRMAA_PARTIAL_FIRST_YEAR_COMPLETED` (Medicare/IRMAA, round R48's); `SPENDING_FLOOR_CEILING_SWAPPED` and `VPW_RATE_BOUNDS_SWAPPED`
(already cards, "Spending bounds"); the ERROR codes (the calculation-error card handles them).

## 3. Pending for the owner

- **AA1-25 (c), flexibility defaults to off.** Not built: it needs `defaultPlan.retirement.flexibility` 10 → 0, which the rules
  reserve to the owner. Measured on a scratch copy of `ba9946d` (`prediction/r49_flexibility_default_experiment_at_ba9946d.txt`):
  **51 of 71 expanded-corpus inputs move** (every golden, targeted and expansion plan inherits it; the 20 generated seeds draw their
  own) and **8 outputs move**: `golden:monte-carlo-fixed-seed` (final $304,502,979 → $303,070,379), `targeted:historical-1929`
  ($2,887,915 → $2,587,857), `-1966` ($5,203,633 → $4,788,666), `-2000` ($3,869,168 → $3,601,559),
  `expansion:other-asset-draw-historical`, `expansion:monte-carlo-sensitive-band` (success 84.6% → 83.0%),
  `expansion:s5aa-r14-rmd-conversion-under-loss` ($263,039 → $252,082) and `-prototype-ids` ($294,121 → $275,589). The corpus input
  hashes, the baseline and every default-derived test plan would need re-registration. **The owner decides.**
- **Control 4.7's declarations** (`tools/control-candidate-prediction.json`) are the coordinator's step: 124 undeclared differences
  and 122 declarations not found, in exactly the 11 predicted scenarios (§4; `prediction/r49_control_47_at_070f721.txt`).

## 4. Predicted against measured

| | predicted (`6292431`) | measured | verdict |
|---|---|---|---|
| expanded composition | exactly 11 entries: 9 by one new issue only, `seed:5` in rows, `seed:17` named (23 of 24 paths) | exactly those 11 (`prediction/r49_measured_expanded_070f721_vs_ba9946d.txt`; captures in `prediction/`) | as predicted |
| the 9 working-years plans | `issues` +1, rows unchanged, first ages 58, 58, 67, 48, 38, 45, 35, 59, 60 | rows unchanged, +1 issue each, the same ages and shortfalls (`prediction/r49_c1_check_after_build.txt`) | as predicted |
| `seed:5` direction | spending up in the rows opening 84 and 85 (to the floor), final total and lifetime taxes down/up | spending $162,374 → $211,445 (85) and $162,439 → $214,723 (86); final total −$6,056; lifetime taxes +$69.85 | direction as predicted |
| `seed:5` size | final total down ~$100,000–150,000 | down $6,056 | **miss (SA49-A)** |
| `seed:17` (C4) | named; exposed paths 0–14, 16–23; published result may move | changed paths exactly 0–14, 16–23 (path 15 unchanged), measured per path on both trees (`prediction/r49_mc_paths_seed17_ba9946d_vs_070f721.txt`); medians move from 62 (spending 52,945 → 53,051), final total and success unchanged | as predicted |
| ltc / pmi | no corpus plan | none moved | as predicted |
| control 4.7 | differences in exactly these 11 control scenarios | undeclared differences in exactly those 11 | as predicted |
| golden fixtures | none move | `golden-scenarios` passes | as predicted |
| C1 after the build | the issue fires on exactly the scanned plans; `pmiStopAge` = the scan's rule | 9 of 9; 2 of 2 corpus mortgages equal | as predicted |
| witnesses | 26 fail at the base, all pass after | 26 failed at `ba9946d`; 34 of 34 pass at `070f721` (the 33 cases plus one `pmiStopAge` case split out; `witness_runs/`) | as predicted |
| named test adaptations | `scenario-validator` (well-formed debt), `contribution-and-debt-projection` (zeroed result), R37's debt-page note | all three, as predicted | as predicted |
| other tests | the rest of the exposed tests pass | three more failed (SA49-B, -C, -D) | **misses** |
| closeout | 12/0/0 | refused 4 at `62964a1` (SA49-E); 12/0/0 at `070f721` | **miss**, repaired |

Targeted runs (no full gate, per the rules), at the repair's tree before the split: 221 test files that could pin what changed (every engine- and validator-exposed file,
every jsdom/app file, every file naming `strategySpending`, `projectDebts`, the contract, LTC, PMI, flexibility, `staticIds`, the
Worker list, `planWarningTitles`, the registers or closeout): 1,844 tests, 1,835 pass, 0 fail, 9 authorized todos
(`witness_runs/r49_targeted_tests_summary.txt`, file list beside it). `control-corpus.test.js` run alone: 13 pass, the declaration
test fails as predicted.

## 5. The misses

- **SA49-A, `seed:5`'s size.** The first-order size assumed every restored spending dollar came out of the portfolio. In those rows
  the household's outside income already exceeds the restored spending (income $220,854 against spending $211,445 in the row closing 85, with $73,609 of it cash dividends), so it
  is paid first from income the base row did not spend; the portfolio fell $16,275 at 85 and $6,056 at the end. The direction was
  right; the size came from the scan's restored-dollar sum, not from the row's funding. Lesson: size a spending change from the
  row's sources (outside income versus the need), not from the change in spending.
- **SA49-B, `rendered-results-warnings` E14** pinned the page's card list (it asserted three disclosures are NOT rendered, "the day
  someone wires the rest up, this test is what tells them the ground moved"). My search for tests pinning `planWarningTitles`
  searched for the name, not for the disclosures' rendered text. Adapted by intent: the same household now reads all three, each
  under its own title.
- **SA49-C, `scenario-generator`** holds generated scenarios to no WARNING but Q59's two exempt codes. The validator exposure run
  flagged this file (175 residuals, 104 flexibility-on-guardrails) and I misread it as errors-only. Adapted by intent: the two new
  codes report what the generator draws on purpose (a payment drawn apart from balance and rate; flexibility drawn for every
  strategy), are exempt on the same terms, and must occur.
- **SA49-D, the schema catalogue** (`tests/fixtures/schema-catalogue.fixture.json`) records each mode's result shape; its historical
  sample now carries the working-years issue, so `issues` gained an element shape (`code`, `message`, `severity`,
  `state{age, path, shortfall}`). Regenerated deliberately (`node tests/lib/schema-catalogue.js --write`), diff read: that one
  element shape only.
- **SA49-E, closeout refused AA1-07, -25, -34, -37 as coupled-only:** the witness file used `simulatePlan()`, `rng` and `pmiStopAge`,
  so the classifier made it implementation-coupled and the requirements it guards had no independent test. Repaired in `070f721` by
  moving those cases to `tests/audit-s5aa-r49-spending-debt-disclosure-internals.test.js`; the main file is
  implementation-independent. No expectation changed. The witness file's SHA-256 at the base run was `5f216b3d…b6410b`; after the
  split it is `0ba708d2…c0e0e5`, and the internals file `fce358d1…aae85c`.

## 6. Tests adapted by intent (before → after)

| test | before | after |
|---|---|---|
| `scenario-validator` "a well-formed debt entry produces no issues" | $1,500/month on $250,000 at 6%, 40 → 65: no issues | that payment leaves $76,751.51 (DEBT_PAYOFF_RESIDUAL); the debt pays $1,611 (amortizing: $1,610.75) and raises nothing |
| `contribution-and-debt-projection` "no debts returns a zeroed result" | six zero fields | seven: `workingService: 0` added |
| `audit-s5aa-r37-inert-mortgage-fields` "the debt page lists them" | the old note, word for word | the new note (program and terms set the PMI default); its engine test unchanged and passing (no PMI in its plan) |
| `rendered-results-warnings` E14 | three disclosures NOT rendered | all three rendered, under "Survivor's filing status", "Credit card minimum payment", "Adjustable-rate loan" |
| `scenario-generator` "no WARNING-level issues" | exempt: Q59's two codes | exempt: those two plus `DEBT_PAYOFF_RESIDUAL` and `FLEXIBILITY_WITH_GUARDRAILS`; all four must occur |
| `schema-catalogue` fixture | historical `issues` element: none | the working-years issue's shape |

## 7. Law checked at the primary source

- **12 USC 4902(c)** (law.cornell.edu, read 2026-10-03): PMI may not "be imposed on residential mortgage transactions beyond the first
  day of the month immediately following the date that is the midpoint of the amortization period of the loan if the mortgagor is
  current". **4901(7)**: the midpoint is "halfway through the period that begins upon the first day of the amortization period
  established at the time a residential mortgage transaction is consummated and ends upon the completion of the entire period over
  which the mortgage is scheduled to be amortized." **4901** "private mortgage insurance" excludes insurance under the National
  Housing Act (FHA), title 38 (VA) and title V of the Housing Act of 1949 (USDA). **4902(b)** (automatic termination at the
  scheduled 78% of original value) and **(g)** (high-risk loans) were read; neither is modelled (the app's note says 78% often comes
  sooner). <https://www.law.cornell.edu/uscode/text/12/4902>, <https://www.law.cornell.edu/uscode/text/12/4901>
- **IRC 4974(a), (e)**: 25% of the shortfall, 10% if timely corrected — the excise the notes say is not included.
  <https://www.law.cornell.edu/uscode/text/26/4974>
- **IRC 1222(1), (3)**: short-term = held not more than 1 year; long-term = more than 1 year (the long-term-only note).
  <https://www.law.cornell.edu/uscode/text/26/1222>
- **IRC 72(t)(1), (2)(A)(i)**: the 10% additional tax, and the exception for distributions "made on or after the date on which the
  employee attains age 59½" (the crossing-year note). <https://www.law.cornell.edu/uscode/text/26/72>
- **The SSA statement's work assumption** (the note beside both Social Security inputs) rests on the AA1 verification's finding
  (AA1-28, CONFIRMED there at ssa.gov). ssa.gov refused this session's reads (HTTP 403 on the statement page and its PDFs), so I
  did not re-read it; the note's wording ("assumes you keep working at about your current pay until you claim") is the
  verification's and should be re-checked at ssa.gov by whoever next has access.

## 8. Suggested text for eb's files (not edited)

**MODEL_ASSUMPTIONS.md**
- *Spending flexibility (section on withdrawal strategies):* "After a year whose portfolio return is negative, spending is cut by the
  flexibility percentage for the next year only. Since S5AA R49 the cut never takes spending below the floor entered for the strategy —
  the spending floor of guardrails, Guyton-Klinger and floor-and-ceiling, the remaining-life strategy's minimum withdrawal, VPW's
  minimum rate — and spending already below it (a stage, the survivor reduction) is neither cut further nor raised. Overlapping
  percentage stages multiply; the validator warns, and warns when flexibility stacks on guardrails or Guyton-Klinger. The default
  flexibility is 10% (whether it should be 0 is pending for the owner)."
- *Long-term care:* "Care starts at `advanced.ltcOnsetAge` when entered (the primary's age, as entered); Monte Carlo draws the start
  uniformly from 10 years before to 10 years after it, never before the plan's start. Blank: at max(65, round(retirement age + 10)),
  weighted by the probability in the simple and historical projections; in Monte Carlo, with that probability, at
  max(65, round(retirement age + 5 + 20u))."
- *Debts:* "PMI stops at the debt's `pmiEndAge` when entered. Otherwise a conventional mortgage with its original and remaining terms
  stops PMI after the midpoint of its amortization (12 USC 4902(c)), on the primary's clock, at the start of the projection month
  after the one holding the midpoint; the automatic 78% termination (4902(b)) is not modelled. FHA, VA, USDA and other programs keep
  PMI while a balance is owed. The validator warns when the scheduled payments leave a balance at the payoff age, which the plan pays
  in one sum; the debt editor shows that sum." Section 9's inert-field list: `mortgageType` and `loanTermYears` are no longer inert
  where PMI is charged (they and `remainingTermYears` set the PMI default).
- *Section 7 (no working-years budget):* "Since S5AA R49 a warning, `WORKING_YEARS_NOT_FUNDED_BY_PAY`, names the first working year
  whose pay — the working share of salary less the wage-only payroll and income tax and the contributions, less the debt payments and
  PMI made in the working months — is below zero. No figure moves. Employment and self-employment income streams are not counted as
  pay (they are outside income under the surplus setting)."
- *Disclosures:* the app now shows the engine disclosures listed in §2 as cards, and runs the validator on the active plan.

**FEATURES.md**
- "Long-term care: an optional onset age." "Debts: an optional PMI end age, with the federal midpoint as the conventional-loan
  default; the lump sum due at a payoff age shown beside it." "Plan checks: the plan's validator warnings, listed in the header as
  you edit." "Results: engine disclosures shown as cards; a card on how the tax figures are estimated." Withdrawal order: "Rule-based
  withdrawal order" with a "Tax-sensitive ordering goal (heuristic)" (renamed from the optimizer).

**SPRINT_QUESTIONS.md**
- New, for the owner: "AA1-25 (c): should `defaultPlan.retirement.flexibility` be 0? Measured: 51 of 71 expanded inputs and 8 outputs
  move (S5AA R49 build report §3)."
- New, recorded limit: "The working-years check counts salary as pay; employment and self-employment streams are outside income.
  Should they count?"
- New, recorded limit: "PMI's automatic 78% termination (12 USC 4902(b)) is not modelled; the default is the midpoint, the latest the
  law allows."
