# S5AA R42F — Claude's full-model audit at `s5aa-r42-source` (`c67c713`)

*Claude, 2026-09-30 (Arizona, UTC−7), at the owner's request: "Do a deep full model audit". It is report-only: this pull request
changes no code, test, fixture, baseline or decision record.*

## 1. What was audited

**The source** is **`s5aa-r42-source` = `c67c713`**, the R42 round as merged (PR #43, `main` at `0537493`). `git diff c67c713
0537493` on `src/`, `tests/`, `tools/` and the built app is empty, so these findings are findings on the R42 source. One finding
(SA42F-16) concerns a defect whose repair Claude has since built locally; it is not on `main`, and it goes into the next round
with the owner's other choices.

**Numbering:** SA42F-NN, a Claude audit of the R42 source with a letter (WORKING_RULES §5).

**Method:** a frozen `git archive` of `c67c713`, on Windows 11 and Node 24.17.0. **Eight areas**, each audited by a separate
Claude agent to one written standard (`SA42F/STANDARD.md`):

| area | folder | covers |
|---|---|---|
| Federal tax | `SA42F/TAX-FED/` | brackets and deductions, gains and dividends, Social Security taxation, NIIT, losses, the IRA deduction, payroll and SE tax, the 10%, later-year indexing, the gross-up |
| Arizona and health | `SA42F/STATE-HEALTH/` | Arizona tax, Medicare, IRMAA and its lookback, Part D, health and LTC costs, HSA taxes |
| Contributions | `SA42F/CONTRIB/` | limits, catch-ups, 415(c), Roth and IRA phase-outs, the spousal window, HSA, match, vesting, presets |
| RMDs and Roth | `SA42F/RMD-ROTH/` | RMD start, tables, the still-working exception, QCDs, conversions, Form 8606, transfers |
| Social Security | `SA42F/SOCSEC/` | PIA, COLAs, claiming, spousal and survivor benefits, the earnings test (R42's family withholding), pensions and streams |
| Core flows | `SA42F/FLOWS/` | the row loop, conservation, strategies, stages, reserve, other assets, dividends and basis |
| Life events | `SA42F/LIFE-EVENTS/` | deaths, the projection cut, filing over time, succession, basis step-up, survivor spending |
| Plumbing | `SA42F/PLUMBING/` | debts, Monte Carlo, historical replay, validator and engine parity, import, the result contract, the Worker |

**The standard for a finding:**
- a runnable reproduction, whose plan passes `validateScenario` with `runPlan` status `ok`, unless the defect is a crash, a wrong
  refusal or a validator–engine disagreement;
- a hand expectation computed from the rule, never from the engine;
- the law read at its primary source;
- a check that the behaviour is not already declared. The declared material is `MODEL_ASSUMPTIONS.md`,
  `SPRINT_QUESTIONS.md`, `RESULT_CONTRACT.md`, the R40 unrepaired list, R32F and R32V, R41, ChatGPT's R41F and R41 reports,
  and R42's handover, prediction and self-audit.

**Claude's coordinator check:**
1. **Every reproduction was rerun from the frozen tree:** all 41 ran, and every one printed the figures its area reported
   (`SA42F/coordinator_rerun/`).
2. **The published scripts give the same results.** The scripts here read the repository through `SA42F/harness.js`. Each
   absolute scratch path in a probe was replaced by a repository-relative one, and each was run again from this folder:
   **41 of 41 outputs byte-identical** to the frozen run.
3. **The key legal premises, re-read at the source:**
   - IRC 199A(a), (b)(3)(A) and (i) (SA42F-01);
   - 20 CFR 404.271: COLAs "beginning with December of the year they become eligible", not from the claim (SA42F-02);
   - Pub. 590-B: "If the owner died before the required beginning date, there is no required minimum distribution in the year
     of the owner's death" (SA42F-03);
   - POMS RS 02501.095 §B.4, the order of charging when both the worker and the auxiliary work (R42's own repair, confirmed
     sound).
4. **Overlaps merged.** Areas found some defects independently; each is listed once:
   - RMD-ROTH-01 with LIFE-EVENTS-01;
   - RMD-ROTH-02 with LIFE-EVENTS-02;
   - six areas reported untyped fields (SA42F-05);
   - PLUMBING-02 with LIFE-EVENTS-04.

**Source documents.** The auditors read Rev. Proc. 2025-32, the CMS July 28, 2025 Parts C and D announcement and Arizona's 2025
Form 140 instructions at their publishers' sites; their text copies are not republished here, and no script reads them.

**What was not checked:**
- the corpus reach of each finding (a repair round measures it);
- the browser beyond R41's task 6.5;
- the Monte Carlo and historical paths of most areas, beyond what PLUMBING and FLOWS ran.

## 2. What checked clean (selected; the area reports give every check)

- **Federal tax:** 100,000 isolated `estimateTaxes()` cases, about 40% on R36-indexed rules, all against an independent
  form-built reference. **0 mismatches** over $0.01 in tax, NIIT, payroll and SE tax, AGI and the carryover. The gross-up closes
  the funding equation to $0.0000 in four composite plans. Every 2026 constant matches Rev. Proc. 2025-32 and the IRS 2026
  limits.
- **Arizona and health:** 20,000 Arizona cases and an independent model of 10,268 health, Medicare, IRMAA, Part D and LTC rows,
  **0 mismatches**. Every 2026 CMS and Arizona figure matches its source.
- **Contributions:** independent sweeps of 400 and 500 plans over R42's spousal-IRA window, compensation caps, 402(g), catch-ups
  and part-year limits, **0 differences**. 20 years of limit indexing match each statute's rounding.
- **RMDs:** start ages, Table II (Pub. 590-B's own 25.3), the still-working exception, R40's age-reached repair, QCDs,
  conversions with RMDs and QCDs, and Form 8606 (Pub. 590-B's example).
- **Social Security:** 770 hand-formula checks of reduction, spousal, survivor and FRA factors, **0 mismatches**. A self/spouse
  swap sweep of 1,482 couples shows **0 asymmetries**. R42's family withholding matches RS 02501.095's B.4 example in dollars,
  and its survivor ARF matches RS 00615.598.
- **Flows:** the R40 conservation grid on new seeds and an extended grid, 4,787 plans and 91,667 rows; and Monte Carlo
  household identities over 1,500 paths. **0 money leaks** (the declared `WAGE_TAX_CLAMP` only; its worst is $942.50, above
  the R40 list's recorded $750.50, by the same mechanism).
- **Plumbing:**
  - 20 debt hand checks to the cent;
  - Monte Carlo re-aggregated independently over 300 paths, exact;
  - zero-volatility Monte Carlo equals simple mode on 145 plans;
  - 0 contract violations over 435 results (apart from SA42F-33);
  - the Worker's dependency closure is complete, and 6 of 6 dynamic runs equal the main thread.

## 3. Findings

Each entry gives the witness, the hand expectation against the engine's figure, the rule, and the script (run with `node`
from its area folder). The area reports in each folder carry the full arithmetic and the declared-material check.

### P1

**SA42F-01 (TAX-FED-02) — A self-employment profit stream bears SE tax but never gets the IRC 199A deduction, and nothing says
so.**
- **Witness:** single, 50, retired, an $80,000 `selfEmployment` stream.
- **Hand:** the QBI deduction is the lesser of 20% × QBI ($14,869.64) and 20% × taxable income ($11,649.64), so $11,649.64.
  Total tax is **$18,103.67**.
- **Engine:** $20,286.44, **$2,182.77 a year too much**, in every year the stream runs.
- **Rule:** IRC 199A(a). Below the threshold the wage limit does not apply ((b)(3)(A)). The sunset is removed, and (i) adds a
  $400 minimum.
- **Not declared:** the engine's own spec (`TAX_RULES_ENGINE_REFERENCE_2026.md`) puts QBI outside the core but requires it to be
  flagged, "never as an unlabelled zero". `repro-TAX-FED-02-no-qbi-deduction.js`.

**SA42F-02 (SOCSEC-01) — A claim at a half-year age loses one COLA for good: own, spousal and survivor benefits.**
- **Witness:** single, 62, $2,000 in today's dollars, claimed at 67.5, COLA 2.8%.
- **Hand:** the PIA steps 2,000 → 2,056.0 → … (rounded down to the dime each step), with 6 delayed months (× 1.04). Row 69 is
  **$29,448**.
- **Engine:** $28,644, then one COLA short in every later row (−$804, −$828, −$840). With a spouse, the spousal benefit is
  short too (row 69: $42,408 against $43,608), and so is the survivor's (−$840 a year).
- **Cause:** `ssPiaAt()` counts `floor(claim − anchor) + floor(age − claim)` COLAs, which is less than `floor(age − anchor)`
  whenever the claim's fraction is larger than the row's.
- **Rule:** 20 CFR 404.271; MODEL_ASSUMPTIONS §4 and §22 ("every COLA from the start to the claim" and after).
- `repro-SOCSEC-01-claim-inside-row-loses-cola.js`.

### P2

**SA42F-03 (RMD-ROTH-01, LIFE-EVENTS-01) — An owner who dies before the required beginning date is still charged that year's
RMD.**
- **Witness:** an IRA owner born 1954 dies at 73.5 in the first distribution year (2027; the RBD is April 1, 2028).
- **Hand:** RMD 0. With a $60,000 pension, AGI $60,000 and tax $1,840.
- **Engine:** RMD $37,735.85, AGI $97,735.85, tax $7,065.70 (**+$5,225.70**). The survivor's later RMDs are then on a smaller
  balance. The same happens to a 401(k) owner who retires and dies in one row.
- **Rule:** Pub. 590-B as quoted in §1; 26 CFR 1.401(a)(9)-2(a)(3)(ii) and -3.
- **Not declared:** MODEL_ASSUMPTIONS §18.1 says an untaken year-of-death RMD "is still due", which is true only on or after the
  RBD. `repro-RMD-ROTH-01-death-before-rbd.js`, `repro-LIFE-EVENTS-01-rmd-death-before-rbd.js`.

**SA42F-04 (RMD-ROTH-02, LIFE-EVENTS-02) — An account owned by "spouse" in a plan with no spouse is accepted, then read three
ways.**
- **Witness:** single, 75, an IRA of $300,000 with `owner: "spouse"`, and a hidden leftover `spouseAge` of 50. The app's owner
  select offers "Spouse" whatever the spouse switch says.
- **Hand,** reading the account as the only person's: RMD $12,195.12, the QCD excluded, no 10%.
- **Engine:** RMD 0 for ever (`rmdObligations()` has no spouse), QCD 0, and the 10% on every draw (`accountOwnerAge()` reads the
  hidden 50). That is +$2,290.99 of tax a year.
- **Rule:** IRC 72(t)(2)(A)(i); 401(a)(9). `repro-RMD-ROTH-02-…`, `repro-LIFE-EVENTS-04-spouse-owned-account-no-spouse.js`.

**SA42F-05 (PLUMBING-01, RMD-ROTH-03, SOCSEC-03, LIFE-EVENTS-03, CONTRIB-08, STATE-HEALTH-05) — R41F-05's defect class survives
in at least 25 other fields: untyped or unranged on both sides, and silently coerced.**

R42 typed `ssBenefit` and `spouseSS` only. The witnesses below are all `valid: true` and `ok`:

| field and value | engine's result |
|---|---|
| `conversionAmount "abc"` | Roth $0 where $60,000 |
| `contributionStop "abc"` | 401(k) $0 where $30,000 |
| `qcd "10,000"` | the QCD vanishes |
| `transferAmount "20,000"` | no transfer |
| `selfLife "abc"` | the person never dies, and their Social Security vanishes |
| `selfLife null` or `true` | the person is dead before the plan |
| `ltcYears "2"` | concatenates to "702": care $300,000 where $100,000 |
| debt `type "Mortgage"` | no housing costs |
| `annualChangeMode "Percent"` | read as dollars |
| `aime "abc"` or `-1` | falls back to the entered benefit |
| `ssCola "abc"` | the rules' 2.8% default |
| `ltcProbability −10` | care becomes income (−$30,000) |
| `healthCost −5,000` | spending falls |

A further 18 fields fail only under symptom codes (`TAX_QUOTE_NONFINITE_*`): pension, pensionCola, spouseSalary, growth,
withdrawalRate, floor, ceiling, healthCost and ltcCost when missing, matchRate, and others. Six string enums are checked by
neither side. In the app, Restore backup accepts all of these, and the form stores its fallback.

- **Rule:** S5AA task 1.1 and R25 ("the engine refuses what the validator rejects"), the SA-01 policy, and R41F-05's own P2.
- `repro-PLUMBING-01-untyped-fields-coerced.js` (and the five area witnesses).

**SA42F-06 (PLUMBING-02, LIFE-EVENTS-04) — The engine runs ten plans the validator refuses as errors.**

Task 1.1 requires that "the engine's gates refuse everything the validator refuses". Each witness is a validator ERROR with
`runPlan` `ok`:

| witness | engine | valid control |
|---|---|---|
| stages with only a name | lifetime spending $0 | $400,000 |
| an income with no `end` | pays to 70: $80,000 | $20,000 |
| `expenses[].amount "abc"` | $0 | $20,000 |
| `healthInflation 150` | health cost $75,000 | $13,230 |
| LTC on with `healthInflation` absent | care grows at 0% | — |
| `spouseAge true` or `"68"` | the spouse's benefit is lost; `"68"` concatenates | — |
| asset-class `returnRate true` | runs | — |
| `yearsOfService "3"` | runs | — |
| `payoffAge null` | the whole loan forced out in row 1 ($211,832.22) | $18,000 |

R25's own parity sweep cannot reach `spouseAge`, because its base plan has no spouse. Reach: direct engine and Worker callers;
the app's import validates first. `repro-PLUMBING-02-…`, `repro-LIFE-EVENTS-05-spouse-age-parity.js`.

**SA42F-07 (PLUMBING-03) — Three R35 flags are outside the boolean-flag contract, and the engine reads "true"/"false" strings
backwards.**

`fivePercentOwner`, `spouseSoleBeneficiary` and `currentEmployerPlan` are not in `boolean-flag-contract.json`. The validator
refuses their strings; the engine runs them:
- **`fivePercentOwner "true"`:** RMD $0, where $12,195.12 is due.
- **`spouseSoleBeneficiary "false"`:** Table II, $10,600.71, where the Uniform table gives $12,195.12.
- **`currentEmployerPlan "false"`:** the Rule of 55 waives the 10%, while the RMD test reads the same string the other way.

Rule: IRC 401(a)(9)(C)(ii); 1.401(a)(9)-9; 72(t); Q53. `repro-PLUMBING-03-…`.

**SA42F-08 (TAX-FED-01) — Later-year indexing widens the IRA-deduction and Roth phase-out ranges, which the statute fixes.**
- **Cause:** `taxYearRules()` indexes both ends of each range, so its width grows: in 2046 at 3% inflation, $18,000 against the
  statute's $10,000 single. It is already wrong in 2027.
- **Witness:** an active participant at $156,000, inflation 3%. In 2046 the deduction is $1,350 by law and $6,750 in the engine.
  Tax is **$1,323 too low** in 2046 and $886.90 too low in 2045.
- **Rule:** IRC 219(g)(2)(A)(ii), (7) and (8): only the starts are indexed. 408A(c)(3)(A) sets $15,000 / $10,000.
- The Roth half also moves deposits. `repro-TAX-FED-01-…`.

**SA42F-09 (TAX-FED-03) — Rule of 55: the row an owner separates in charges the 10% on draws that all follow the separation.**
- **Witness:** single, separating at 55.5 with the Rule of 55.
- **Hand:** taxes **$557.14** in the row.
- **Engine:** $3,209.68, which includes the 10% of $2,320.97. That is +$2,652.54. `earlyWithdrawalPenaltyRate()` compares the
  row's opening age (55) with the separation age (55.5), but retirement spending exists only after the separation.
- **Rule:** IRC 72(t)(2)(A)(v). The coordinator notes this sits beside Q137's declared opening-age convention, which the owner
  may extend to it. `repro-TAX-FED-03-…`.

**SA42F-10 (STATE-HEALTH-01) — A pre-plan IRMAA return entered as `mfs` is priced on the single table.**
- **Witness:** MAGI $150,000 married filing separately, living together.
- **Hand:** $9,540.88 a year.
- **Engine:** $6,070.48 (**−$3,470.40**) in each of the two lookback years.
- **Rule:** 20 CFR 418.1115(d); CMS 2026's MFS table. The validator allows `mfs`; the app has no field for it, so the case is
  reached by import only. `repro-STATE-HEALTH-01-…`.

**SA42F-11 (STATE-HEALTH-03) — A retired spouse on Medicare pays no Medicare while the self still works; swap the two people and
it is charged.**
- **Witness:** self 60, working; spouse 68, retired.
- **Engine:** Medicare $0. The same household with roles swapped is charged $3,185.68 a year, and the taxes are identical, so it
  is the same household.
- **Cause:** the health block runs only in the self's retired span.
- **Rule:** the model's own §18.4 ("each person 65 or over is charged Medicare") and Q121/D-6. Whether a spouse on a working
  partner's group plan pays is an input the model lacks, so one of the two results is wrong either way.
  `repro-STATE-HEALTH-03-…`.

**SA42F-12 (CONTRIB-01) — Employer money is not held to 100% of pay (415(c)(1)(B)).**
- **Witness:** salary $30,000, a $24,500 deferral and 25% profit sharing.
- **Hand:** total additions at most $30,000.
- **Engine:** $32,000. With a 100% match, $40,000. No warning in either case.
- **Rule:** IRC 415(c)(1)(B), (c)(2) and (c)(3)(D). R33 capped only the deferral. `repro-CONTRIB-01-…`.

**SA42F-13 (CONTRIB-02) — A deceased owner's unvested employer money is forfeited at the survivor's retirement.**
- **Witness:** the owner dies at 47; the spouse retires at 50.
- **Hand,** by the declared rule ("A death before separation forfeits nothing and vests nothing"): the 401(k) holds $40,000.
- **Engine:** forfeits $4,000 at the spouse's retirement, with three post-death years counted as service.
- **Rule:** R38 §6, the R40 list; IRC 411(a)(2)(B). `repro-CONTRIB-02-…`.

**SA42F-14 (CONTRIB-03) — The form's dated presets put a spouse's account on the primary person's clock.** "Increase 25% in five
years" stamps self age + 5, but since R33 a spouse account's changes are read on the spouse's age. A spouse of 53 gets the
increase from the first row ($87,500 against $75,000); a spouse of 40 gets it ten years in. Rule: Q166(b), and the preset's own
label. `repro-CONTRIB-03-…`.

**SA42F-15 (CONTRIB-04) — The shared HSA family limit is used up at an owner's annual rate, so the account order changes the
tax.** One household, $1,418.05 of tax apart by priority order. The planned path adds the annual rate; the one-time path in the
same function adds dollars. Rule: IRC 223(b)(5). `repro-CONTRIB-04-…`.

**SA42F-16 (CONTRIB-05) — R42's worked-share Roth proxy was not applied to the one-time contribution path.**
- **Witness:** R41F-04's own household. A one-time $7,500 transfer into the Roth moves **$0**, while the planned $7,500 is
  allowed.
- **Status:** the owner decided to repair it. Claude built and gated the repair locally: a prediction addendum `b32497d`, then
  the repair `4ab0e3f`, with a test that fails at $0 first. #43 had already merged when it was built, so it goes into the next
  round. It is not on `main`. `repro-CONTRIB-05-…`.

**SA42F-17 (SOCSEC-02) — AIME path: someone already past 62 at the plan's start gets 2026's bend points, not those of the year
they turned 62.**
- **Witness:** age 65, AIME $6,000, salary growth 3%.
- **Hand,** by R36's rule: $29,268.
- **Engine:** $31,980 (+$2,712). The COLAs from 62 are then added on top. `Math.max(0, 62 − floor(age))` in `ssPiaBase()`.
- **Rule:** 20 CFR 404.211 and 404.212. `repro-SOCSEC-02-…`.

**SA42F-18 (SOCSEC-04) — Survivor-benefit months withheld by the earnings test are credited to the survivor's own retirement
benefit, even months before it was claimed.**
- **Witness:** a survivor working at 60 to 63.
- **Engine,** row 68: $27,996, the retirement benefit credited with the survivor benefit's 30 months.
- **Law:** each benefit is adjusted for its own months, which gives $30,132. Even with no survivor adjustment at all the figure
  is $26,472.
- **Rule:** 20 CFR 404.412. R42 discloses only the spousal factor. `repro-SOCSEC-04-…`.

**SA42F-19 (FLOWS-01) — An other asset's "Available starting at age" is read at the row's opening, so a half-year availability
is pushed to the next row.**
- **Witness:** availability at 65.5, before a $100,000 expense at 65.75.
- **Engine:** shortfall $90,000 and success 0. Availability at 65 succeeds.
- **Rule:** the owner's R25 rule for half-year inputs (Q140, §19). `repro-FLOWS-01-…`.

**SA42F-20 (FLOWS-02) — The amount of a spending stage or income stream is today's dollars under "Match inflation", and nominal
dollars under the other growth modes.**
- **Witness:** at 3% inflation, a $40,000 stage at 65 opens at $53,756.66 under "Match inflation" and at $40,000 under "Fixed
  3%", which should agree. A rental stream: $40,317.49 against $30,000.
- **Cause:** "inflation" uses the plan's factor from its start; "fixed" and "cola" grow from the item's own start.
- **Status:** **an owner decision is needed** on which dollars the amount is in. The app's default fills the stage from the
  today's-dollars spending field. R32F and R40 left it open as a suspicion. `repro-FLOWS-02-…`.

**SA42F-21 (FLOWS-04) — "Years of spending in reserve" is sized on the hidden, never-inflated spending field.**
- **Witness:** guardrails at 4% of $3,000,000 (projected spending $120,000), reserve 2 years.
- **Hand:** the blended return is 6.68%.
- **Engine:** 6.84%, sized on 2 × the hidden $60,000. The ending total moves by $353,000 on that hidden input. The reserve never
  inflates. `repro-FLOWS-04-…`.

### P3

| | finding | witness and figures | script |
|---|---|---|---|
| SA42F-22 | STATE-HEALTH-02: later-year IRMAA joint thresholds are not twice the indexed single amount (42 USC 1395r(i)(3)(C)(ii)) | 2027: joint 223,000 against 224,000; a couple at $223,500 pays $8,668.16 against $6,371.36 | `repro-STATE-HEALTH-02-…` |
| SA42F-23 | STATE-HEALTH-04: a partial last row tests the age-65 amounts at the row's close, not the tax year's (A.R.S. 43-1023(E); IRC 63(f)) | +$817.50 in a final half-year row | `repro-STATE-HEALTH-04-…` |
| SA42F-24 | CONTRIB-06: the app's contribution-limit cards drop the spousal IRA window | the app shows no warning where the engine redirects $1,400 | `repro-CONTRIB-06-…` |
| SA42F-25 | CONTRIB-07: a future contribution change dated inside a row starts at the next row | $10,000 where $5,000 | `repro-CONTRIB-07-…` |
| SA42F-26 | RMD-ROTH-04: the "annual Roth conversion" runs only in the primary person's retired years, undisclosed | no conversion while working | `repro-RMD-ROTH-04-…` |
| SA42F-27 | SOCSEC-05: the AIME switch says "using 2026 bend points"; since R36 they are the year-62 bend points | $61,296 where the label implies $31,980 | `repro-SOCSEC-05-…` |
| SA42F-28 | FLOWS-03: a one-time income at or after the end age is never paid and not warned; the expense mirror is warned since R37 | income 0, no issue | `probe-02-cross-feature.js` case 6 |
| SA42F-29 | FLOWS-05: in a row where a death comes before a mid-row retirement, the survivor cut reads the retirement date, not the row's opening (decision 7) | $20,000 where $40,000 | `repro-FLOWS-05-…` |
| SA42F-30 | LIFE-EVENTS-05: a whole-number lifespan equal to the start age is not refused; the person is dead for the whole projected row | income 0, spending $30,000 | `repro-LIFE-EVENTS-02-whole-age-death-row.js` |
| SA42F-31 | PLUMBING-04: Monte Carlo seeds two apart share all paths but one | seed 44's paths 0–998 are seed 42's 1–999 | `repro-PLUMBING-04-…` |
| SA42F-32 | PLUMBING-05: the validator accepts a plan the engine always refuses (nobody alive at the start) | valid, then `SCENARIO_NOBODY_ALIVE_AT_START` | `repro-PLUMBING-05-…` |
| SA42F-33 | PLUMBING-06: an unknown-method refusal fails the repository's own contract checker (`mode`); RESULT_CONTRACT §7b says no code was added, but tasks 1.1/1.2 and R9 added seven, three named in no document | — | `repro-PLUMBING-06-…` |
| SA42F-34 | PLUMBING-07: a historical start before the data (1900, 1927), or between data years (1966.5), is silently replaced; only after-data is refused (§26) | 1900 replays 1928 | `repro-PLUMBING-07-…` |

## 4. For the owner: declared, but worth a ruling

- **The spousal IRA for the higher earner** (CONTRIB). MODEL_ASSUMPTIONS §20 lets either spouse use the couple's pooled
  compensation. IRC 219(c)(2) gives the spousal rule only to the spouse whose compensation is less, so the higher earner is
  limited to their own pay. Witness: pay of $4,000 against $3,000; the engine deposits $7,000 where the statute allows $4,000.
- **HSA contributions continue past 65** (STATE-HEALTH). This is declared as unsupported scope (the R40 list: Medicare
  coverage is not modelled). Claude's standard for the auditors wrongly said R37 had stopped them (§6).
- **A death before the household's retirement age** (LIFE-EVENTS). The survivor's spending and health costs wait for the dead
  self's retirement age, within the declared Q59/§7 boundary.

## 5. Unconfirmed suspicions (not counted)

Each is set out in its area report:
- Table II values beyond Pub. 590-B's example (only checked for consistency);
- LTC on the self's clock after the self's death;
- the IRMAA first-year completion annualizes one-time items, as R40's reverted tax rule did;
- "Tax-free income" is left out of IRMAA MAGI and provisional income, which is wrong if it is municipal interest;
- the 10% on a decedent's draws in the year of death;
- deflation and indexed amounts;
- the dividend-yield growth origin;
- the COLA clock in plans that open at a fractional age;
- the earnings test on a survivor benefit uses the retirement FRA band;
- import validates after normalization, so absent-field rules cannot fire on Restore;
- a 0.7-year first row counts 8 debt payments.

## 6. Claude's own errors in running this audit

- **The written standard carried a wrong premise.** It told the STATE-HEALTH auditor that R37 stopped HSA contributions at 65.
  R37 only declared the 20% tax's opening-age convention. The auditor caught it.
- **During the audit Claude asked the owner whether to fix SA42F-16 "in #43 now", saying #43 was not merged, without
  checking.** #43 had merged at 8:22 pm. The repair was built on the local branch, and goes into the next round instead.
- **Claude ran ChatGPT's R42 reproduction script before reading it in full.** It used `child_process` only to read the R41
  engine with `git show`.
