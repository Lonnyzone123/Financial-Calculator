# S5AA R32F — Claude's full-model audit at `2b2d5f2`

*Claude, 2026-09-29 (local, UTC−7), at the owner's request ("do a deep full model audit"). It is report-only: this pull
request changes no code, test, fixture, baseline or decision record.*

## 1. What was audited

- **The source:** `main` at **`2b2d5f2`**, the merge of R32 (PR #15). Its `src/`, `tests/`, `tools/` and `package.json` are
  byte-identical to **`s5aa-r32-source`** (`3017351`); `git diff 3017351 2b2d5f2` on those paths is empty. So these findings
  are findings on the R32 source.
- **Numbering:** they are numbered **SA32F-NN**, a Claude audit of the R32 source with a letter (WORKING_RULES §5).
- **Method:** the audit read a frozen `git archive` of `2b2d5f2`, on Windows 11 and Node 24.17.0.
- **Eight areas,** each audited by a separate Claude agent to one written standard:

| area | folder | covers |
|---|---|---|
| Federal tax | `SA32F/TAX-FED/` | brackets, deductions, gains and dividends, SS taxation, NIIT, losses, the gross-up loop |
| Arizona and health | `SA32F/STATE-HEALTH/` | Arizona tax, IRMAA and Medicare, health and LTC costs, the 10% and HSA additional taxes |
| Contributions | `SA32F/CONTRIB/` | limits, match and vesting, phase-outs, the redirect and warn policies |
| RMDs and Roth | `SA32F/RMD-ROTH/` | RMDs, QCDs, conversions, IRA basis, Roth ordering |
| Social Security | `SA32F/SOCSEC/` | claiming, survivors, the earnings test, COLA, pensions and other incomes |
| Core flows | `SA32F/FLOWS/` | the yearly loop, withdrawals and strategies, basis and dividends, money conservation |
| Life events | `SA32F/LIFE-EVENTS/` | deaths, filing status, succession, step-up, household edges |
| Debt and plumbing | `SA32F/DEBT-MC-CONTRACT/` | debt modules, Monte Carlo and historical runs, validator versus engine, the Worker, the result contract |

**The standard for a finding:**
- a runnable reproduction, whose plan passes `validateScenario` with `runPlan` status `ok` (except for a crash or a wrong
  refusal);
- a hand expectation computed from the rule, never from the engine;
- the law read at its primary source;
- a check against `MODEL_ASSUMPTIONS.md`, `SPRINT_QUESTIONS.md`, the S2 registers, `FEATURES.md`, the resource documents and
  the R29–R32 known limits.

A behaviour those declare is not reported as a finding.

**Claude's coordinator check:**
1. **Every script, rerun.** Every reproduction was rerun, and every mismatch reproduced exactly.
2. **The key law claims, re-read at the source:**
   - the CMS 2026 Part B and D tables ("Greater than or equal to $500,000");
   - Publication 590-B's Table II rule and its example ("Your applicable denominator is 25.3");
   - POMS RS 00615.320 (the widow(er)'s limit applies after the age reduction);
   - IRC 219(g) (the phase-out reduces "the dollar limitations").
3. **SA32F-11's mechanism, confirmed in the code.**
4. **The published scripts, checked against the local run.** The scripts in `SA32F/` were adapted to this checkout: the
   shared loader `SA32F/harness.js` reads the repository root, and generated files go to the system temp folder. Each was
   run both from the audit's working copy and from this folder, and the outputs compared (§7).

**What was not checked:**
- the corpus reach of each finding (the corpus members a repair would move). A repair round measures it.
- ssa.gov pages refused automated fetches. The Social Security auditor read them in a browser; the POMS and eCFR texts were
  fetched directly.

**Four problems were found independently by two areas,** and each is listed once:
- SOCSEC-01 with LIFE-02;
- SOCSEC-02 with LIFE-01;
- RMDROTH-01 with LIFE-03;
- STHLTH-01 with LIFE-08.

## 2. What checked clean

- **Every 2026 constant in the rules package matches its source:**
  - federal: Rev. Proc. 2025-32 and IRC 151(d)(5)(C);
  - retirement limits: Notice 2025-67 and Rev. Proc. 2025-19;
  - IRMAA and Part B: CMS 2026;
  - Social Security: the SSA 2026 fact sheet and bend points;
  - the Uniform Lifetime Table: all 48 divisors from 73 to 120+;
  - the QCD cap of $111,000.
- **Federal tax:** 8,073 isolated `estimateTaxes()` returns against an independent reference built from the forms. 8,070
  match to the cent on tax, NIIT, AGI, taxable Social Security and the carryover; the other 3 are SA32F-32.
- **The tax gross-up:** equals a 200-step hand bisection to the cent in 7 plans, including one crossing the Social Security
  band, the senior phase-out, the 0%/15% band and NIIT at once.
- **Money conservation:** 7,000 generated plans (143,654 rows, all 9 strategies, 4 orders and 3 timings), plus 7,440 in
  earlier runs. There were 0 leaks outside SA32F-19. Every row satisfies the portfolio and household identities, and the
  lifetime totals equal their row sums.
- **Arizona:** 14 of 14 hand checks match.
- **Symmetry:** swapping self and spouse gives identical rows in 6 life-event variants.
- **Deaths:** every death row closes to the cent in 8 continuity variants.
- **The Worker:** static analysis of all 179 functions the app's Worker copies found no missing helper or global. The
  Worker's output matches the main thread on 48 plans.
- **The result contract:** matches every emitted key across 40 plans; `tools/result-contract.js` reports 0 violations.
- **Also correct:**
  - amortization, the ARM caps, revolving debt;
  - Monte Carlo quantiles and seed determinism;
  - the historical replay;
  - R32's catch-up at the year-end age, applied consistently (a 60-plan sweep, 0 mismatches).

## 3. Findings: 21 P1, 22 P2, 12 P3

Severities follow WORKING_RULES §5. Code references are `src/engine.js` lines at `2b2d5f2`, unless another file is named.

For each finding, the full five-part write-up is in its area's `FINDINGS.md`, under the area ID:
- the evidence;
- the hand expectation, with its arithmetic;
- the source quote;
- the reproduction;
- why it is not a declared limit.

"Decision" means the repair needs the owner's choice; the choices of 2026-09-29 are in §4.

### P1

| ID | area ID | finding | code | impact in the repro | repair |
|---|---|---|---|---|---|
| SA32F-01 | SOCSEC-01, LIFE-02 | A survivor's benefit is the deceased's already-reduced benefit × the survivor age factor. The law uses the PIA × the factor, limited to the larger of the deceased's reduced benefit or 82.5% of PIA (20 CFR 404.338; POMS RS 00615.301, .320). The disclosure calls the result "too high"; it is too low. | :2932–2937 | −$4,500 to −$8,162 a year | the rule |
| SA32F-02 | SOCSEC-02, LIFE-01 | A worker who dies before their planned claim age leaves the survivor nothing (42 USC 402(e)(1): "died a fully insured individual"). Reverses R2-003(b) / Q3a's "posthumous claim". | :2892–2893 | −$24,000 to −$36,000 a year | decision 1 |
| SA32F-03 | SOCSEC-03 | No spouse's benefit (20 CFR 404.333). Entering it as the spouse's own benefit applies the wrong reduction and earns delayed credits. | :2833 | −$18,000 a year; the workaround +$900 to +$4,320 | decision 2 |
| SA32F-04 | SOCSEC-04 | The PIA gets no COLA between eligibility at 62 and the claim (20 CFR 404.271). The entered benefit is paid as nominal at the claim. | :1990 | −$4,737 a year at a claim at 67 | decision 3 |
| SA32F-05 | SOCSEC-05 | One FRA for both people: the spouse is read at the self's FRA. | :1934 | −$400 to −$640 a year | the rule |
| SA32F-06 | SOCSEC-06 | The earnings test counts gross self-employment profit, not net earnings from self-employment (20 CFR 404.429; SS Act §211). | :1969 | +$1,912.50 withheld | the rule |
| SA32F-07 | SOCSEC-07 | No grace-year monthly test (20 CFR 404.435), so benefits are withheld for months after retirement. | :1969 | −$2,760 in the retirement year | the rule |
| SA32F-08 | RMDROTH-01, LIFE-03 | A spouse more than 10 years younger still gets the Uniform table, not Table II (1.401(a)(9)-5(c)(2); Pub. 590-B). The model already assumes the spouse inherits (§18.1). | :2703, :2728 | +$112.47 a year per $100,000 at 75/64 | the rule |
| SA32F-09 | STHLTH-01, LIFE-08 | For two years after a death, the lookback MAGI of a joint return is priced on the single bands (20 CFR 418.1115). `SURVIVOR_FILING_STATUS_MODELLED` states the single bands as the rule. | :3557 | +$2,885 to +$5,207 a year, 2 years | the rule |
| SA32F-10 | CONTRIB-01 | The IRA deduction phase-out tapers the contribution; IRC 219(g)(1) reduces the limit (Pub. 590-A Worksheet 1-2 line 7). | :566 | $4,000 contributed, $2,000 deducted instead of $3,750 | the rule |
| SA32F-11 | (coordinator; RMDROTH x-note) | A 401(k) deferral funded by wages entered as an `employment` income stream is deposited pre-tax but never excluded. The exclusion is `Math.max(0, wages − preTaxDeferrals)` over salary wages only, while stream wages count as compensation (:134). Q98 repaired payroll tax only. | :3668, :134 | AGI 100,000 instead of 90,000; tax +$2,450 | the rule |
| SA32F-12 | CONTRIB-05 | `contributionStop` is read on the self's age for the spouse's accounts, though the spouse's wages run on the spouse's own age. | :82, :3372 | a younger spouse loses $10,000 a year | decision 5a |
| SA32F-13 | CONTRIB-06 | `vesting` forfeits the unvested share of every match permanently (411(a)(2)(B): fully vested within 6 years). | :3403 | −$48,000 over 10 years | decision 5b |
| SA32F-14 | CONTRIB-07 | Profit sharing is paid only when `matchOn` is true. | :3395 | −$5,000 a year | the rule |
| SA32F-15 | CONTRIB-11 | A spousal IRA stops silently once the non-working spouse passes retireAge (219(c); 219(d)(1) repealed; 408A(c)(4)). | :77, :163 | −$7,500 a year | decision 5c |
| SA32F-16 | TAXFED-03 | The age-65 standard-deduction addition and the senior deduction test the row's opening age. IRC 63(f)(1)(A) and 151(d)(5)(C)(ii)(I) read the age attained before the close of the year, and R32 treats each row as a tax year. | :323, :331, :667 | +$966 single, +$1,836 couple, in the turning-65 row | the rule |
| SA32F-17 | LIFE-04 | A decedent's solely-owned taxable account keeps its basis. §18.1's stated reason ("titling and state law the plan does not record") fails for sole ownership under IRC 1014(a). | :533; MA §18.1 | +$5,427.71 a year of tax | decision 4 |
| SA32F-18 | LIFE-05 | An other income of type Social Security, or of type pension, keeps paying after its owner's death (42 USC 402(a)); the pension gets no disclosure. | :3145 | +$24,000 a year | the rule |
| SA32F-19 | FLOWS-01 | A younger spouse's salary after the household's retirement date never funds spending. `outside` (:3583) omits wages, so the portfolio pays all spending and the net wages leave the model. As an income stream, the same wages do offset spending. | :3583, :74 | +$52,752.50 a year of withdrawals | the rule |
| SA32F-20 | FLOWS-03 | The other-asset fallback re-applies "Accessible share" to the remaining value on every call. | :2190 | $396,875 drawn against $200,000 accessible | the rule |
| SA32F-21 | DMC-01 | `runPlan()` throws an uncaught RangeError on a validator-valid adjustable debt with a reset age and no `payoffAge`. The app fills `payoffAge` on load, so only direct callers reach it. | :2118 | no result | the rule |

### P2

| ID | area ID | finding | code | repair |
|---|---|---|---|---|
| SA32F-22 | STHLTH-02 | The Rule of 55 exempts every 401(k) draw from 55, even after a separation at 50 (72(t)(2)(A)(v)); −$2,000 on a $20k draw. | :2039, :3695 | the rule |
| SA32F-23 | STHLTH-03 | IRMAA misses the top tier at exactly $500,000 / $750,000 (the code uses `>`; CMS "Greater than or equal to"); −$580.80 a year per person. | :1991 | the rule |
| SA32F-24 | STHLTH-04 | A plan opening at a fractional age feeds a half-year MAGI into the plan-year-2 IRMAA lookback; −$2,884.80 once. | :2006, :3280 | the rule, or extend §11 |
| SA32F-25 | SOCSEC-08 | `retirement.ssFra` is not validated; an FRA of 60 or 75 is accepted and paid from. | `scenario-validator.js` (no check); `app-shell.html:516` | the rule |
| SA32F-26 | RMDROTH-02 | A 401(k) owner still working past the RMD start age is charged RMDs (401(a)(9)(C)(i)); the plan does not hold the facts the exception needs. | :2728 | disclose, or model it |
| SA32F-27 | RMDROTH-03 | The 1959-cohort warning checks only the self's birth year. | :4533 | the rule |
| SA32F-28 | CONTRIB-02 | In the Roth phase-out the engine allows 7,500 × factor − traditional; 408A(c)(2)–(3) takes the lesser of the reduced limit and 7,500 − traditional. $3,000 a year is sent to taxable. | :40 | the rule |
| SA32F-29 | CONTRIB-03 | The Roth phase-out has no $200 minimum and no $10 rounding (408A(c)(3)(A) imports 219(g)(2)). | :40 | the rule |
| SA32F-30 | CONTRIB-04 | A 401(k) deferral above the owner's own pay is deposited and excluded in full (415(c)(1)(B)); no warning. | :142 | the rule |
| SA32F-31 | CONTRIB-08 | Under `limitPolicy: "warn"`, an excess deferral is still excluded from income (402(g)(1)(A)); −$1,210 of tax. | :3371–3407 | the rule |
| SA32F-32 | TAXFED-01 | Line 25 of the capital-gains worksheet (the regular-tax cap) is missing; up to $57 a year. | :179 | the rule |
| SA32F-33 | TAXFED-04 | A spouse on a single or head-of-household return still gets the spouse's age amounts; the validator is silent. | :323, :331 | the rule |
| SA32F-34 | TAXFED-05 | The capital-loss carryover omits the section 151 add-back of the senior deduction (1212(b)(2)(B)(ii)). | :2259 | the rule |
| SA32F-35 | LIFE-06 | Filing status is never checked against the household. A one-person plan filed joint is taxed jointly with no warning. | `scenario-validator.js:225` | a warning |
| SA32F-36 | FLOWS-02 | `fixedNominal` spending, labelled "in today's dollars", is not inflated to a deferred retirement ($60,000 against $141,794.70). | :3021; `app-shell.html:277` | decision 6 |
| SA32F-37 | FLOWS-04 | VPW paces on `assumptions.returnRate` even when the allocations set every return (+27% in year 1). | :3021 | the rule |
| SA32F-38 | FLOWS-05 | A one-time expense dated at `endAge` is accepted and never charged. | :2974 | a warning, or charge it |
| SA32F-39 | FLOWS-06 | A "Set annual spending" stage cancels the survivor spending reduction. | :2973 | the rule |
| SA32F-40 | DMC-02 | An adjustable debt with no `resetRate` goes to 0% after its reset, with no warning. | :2115 | the rule |
| SA32F-41 | DMC-03 | The Monte Carlo guidance tells a 51.9%-success plan it is "short by about $0" and offers a 1% cut. | `app-shell.html:935–936` | the rule |
| SA32F-42 | DMC-04 | Monte Carlo reads `returnRate` as an arithmetic mean while simple mode compounds it (30-year median $11.47M against $17.45M). Neither is declared. | :1993, :3201 | decision 7 |
| SA32F-43 | DMC-05 | Mortgage property tax, insurance and HOA are never inflated. | :2114 | the rule, or declare |

### P3

| ID | area ID | finding |
|---|---|---|
| SA32F-44 | STHLTH-05 | The HSA's age-65 exception is read at the row's opening for pooled draws; only 59½ is declared (§18.3). |
| SA32F-45 | CONTRIB-09 | The UI's account total uses both salaries for a joint percent account; the engine uses the self's (`app-shell.html:553`). |
| SA32F-46 | CONTRIB-10 | "Add future contribution change" pre-fills a percent as dollars (`app-shell.html:548`). |
| SA32F-47 | TAXFED-06 | `effectiveMarginalRate()` (:719) omits NIIT on rental and non-qualified-dividend income and ignores unknown keys; `runPlan` and the app don't use it. |
| SA32F-48 | LIFE-07 | MODEL_ASSUMPTIONS §8 and RESULT_CONTRACT's C6 row still say opening-row insurance is unbuilt; it landed at `4c104e9` (private archive). |
| SA32F-49 | FLOWS-07 | The strategy descriptions say "Withdraws …%" despite the declared income offset (§3). |
| SA32F-50 | DMC-06 | Four mortgage inputs change nothing and are missing from §9's list: `mortgageType`, `originalAmount`, `propertyValue`, `loanTermYears`. |
| SA32F-51 | DMC-07 | Validator gaps: `runs` above the engine's limit, `historyStart` after the data, non-number `inflation`/`fee`, negative extra principal, text PMI, negative volatility. |
| SA32F-52 | DMC-08 | A fractional year's return spread scales with t, not √t. |
| SA32F-53 | DMC-09 | The [−95%, +200%] return clamp raises the mean at 80% volatility (13.8% realised against 10%). |
| SA32F-54 | DMC-10 | Stale texts: FEATURES.md (ARM recast, the Worker's debt list), the revolving-debt disclosure's 2%, `result-contract.json` S-CSV's column count, RESULT_CONTRACT's Monte Carlo fields. |
| SA32F-55 | DMC-11 | `stableStringify` (:4674) hashes keys whose value is `undefined`, so `inputHash` changes after a JSON round trip. |

### Declared, with a large effect

**SA32F-D1 (TAXFED-02): federal tax amounts frozen at 2026 in a nominal projection.**
- Brackets, the standard deduction, the age-65 addition, the 0%/15% thresholds and the wage base stay at 2026 dollars while
  incomes inflate: +$17,644 of tax over 14 years on a $60k inflating pension.
- The freeze is declared (the app's "Fixed tax-year boundary" card; README), so it is not a defect. Its consequence is not.
- It departs from `Resource Documents/TAX_RULES_ENGINE_REFERENCE_2026.md` §8.1.
- Decision 8.

## 4. The owner's decisions (2026-09-29)

Claude laid out the options with a recommendation, and the owner chose. Each choice is quoted as selected.

| # | question | finding | the owner's choice |
|---|---|---|---|
| 1 | When someone dies before claiming, what does the surviving spouse get? | SA32F-02 | "Pay by law": the deceased's FRA benefit plus delayed credits earned before death, reduced for the survivor's age. The survivor-side claim-age gate (Q3b) stays. |
| 2 | Add the spouse's 50% benefit? | SA32F-03 | "Build it": up to half the worker's FRA benefit, with the spousal reduction and no delayed credits; it cannot start before the worker files. |
| 3 | What dollars is the entered benefit in? | SA32F-04 | "Today's dollars": grown at the COLA field from the plan's start to the claim; the earnings-based path takes COLAs from 62; the field is relabelled. |
| 4 | Basis at a death? | SA32F-17 | "Own full, joint half": a decedent's own taxable accounts are fully stepped up and joint accounts half, with a disclosure that community property can step up more. |
| 5a | Whose age stops a spouse's contributions? | SA32F-12 | "Each owner's own". |
| 5b | How does the vested percentage work? | SA32F-13 | "Vest over 6 years": the entered percentage rises to 100% within 6 years; only what is unvested at retirement is lost. |
| 5c | Spousal IRA after the non-working spouse's retire age? | SA32F-15 | "Allow while joint pay". |
| 6 | Fixed-nominal spending "in today's dollars" with a later retirement? | SA32F-36 | "Inflate to retirement", then hold flat. |
| 7 | What does "Expected annual return" mean? | SA32F-42 | "Keep average, disclose": Monte Carlo keeps the arithmetic mean; a disclosure says simple mode shows the average path, not the typical one. |
| 8 | Tax law after 2026? | SA32F-D1 | "Index, own round": price-linked amounts indexed at the plan's inflation, labelled as a model assumption; statutory fixed amounts stay fixed; in a round of its own. |

Every other finding has a rule to repair to. Which findings to repair, and when, stays the owner's.

## 5. Suspicions not confirmed (not findings)

Each area's `FINDINGS.md` §5 lists them. The ones most worth a later look:
- the partial first row takes a full year's deduction and brackets;
- a spouse's RMD start and QCD eligibility can lag by up to a row;
- `customTraditional` sits outside the Form 8606 pool;
- Medicare premiums ignore `healthInflation`, and LTC is never inflated;
- the Part D surcharge is charged with no Part D base premium.

## 6. The area reports and scripts

**What each `SA32F/<AREA>/FINDINGS.md` holds:**
- the area auditor's report, saved by Claude's coordinating session (the agents could not write report files);
- a scope section: the functions read, the sources and the plans run;
- the five-part write-up of each finding;
- the declared behaviours confirmed;
- the suspicions.

**Running the scripts:**
- Run each with `node <file>` from its folder; the Worker scripts need `node --expose-internals`.
- `SA32F/harness.js` loads this checkout. To audit another checkout, copy `SA32F/` into it.
- `SA32F/RMD-ROTH/x_deferral.js` is SA32F-11's reproduction.

## 7. Evidence that the published scripts match

The published scripts were run beside the audit's working copies, and their outputs compared. The result is in the pull
request's description.
