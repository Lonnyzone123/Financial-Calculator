# S5AA R36 — change audit handover: later tax years (SA32F-D1, decision 8)

*Written by Claude, 2026-09-29 (local, UTC−7), during the owner's overnight run of R33–R37, for the owner to send to ChatGPT. Every
figure was measured on Windows 11 / Node 24.17.0 at the commits named.*

## 1. What to audit

- **The change:** from `s5aa-r35-source` at `26ef26d` (R35's records at `5b45aec`) to **`s5aa-r36-source`** at **`cf643a8`**. R36 is
  stacked on R35's pull request; the diff to audit is `5b45aec..cf643a8`.
- **One engine commit.** Every tax path reads the rules package, so the change is one mechanism: each row reads its own tax year's
  figures.
- **Please number findings R36-NN**, in the usual report-only pull request, on a branch like `audit/chatgpt/r36-cf643a8`.

## 2. The owner's decisions this round implements

- **Decision 8** (R32F §4, 2026-09-29), "Index, own round": price-linked amounts indexed at the plan's inflation, labelled as a model
  assumption; statutory fixed amounts stay fixed; in a round of its own.
- **D8,** the same night: "Keep it even after 2028": the senior deduction continues.
- **"Follow law everywhere"** (for R34–R37). Each amount indexes by its own statute's rule and rounding. Wage-linked amounts use the
  salary-growth field, the recommendation of record, standing in for the national average wage index.

## 3. The rule, as built, with its sources

**The mechanism.**
- `taxYearRules(base, f, w, taxYear, fTop)` returns the rules for one tax year. `simulatePlan()` is now a wrapper around
  `simulatePlanRows()`: it gives each row its year's rules and puts the 2026 rules back however it returns or throws.
- **Row `yi` is tax year 2026 + `yi`,** a partial first row included.
- **Prices:** each row advances the price index by one whole year of its own inflation (the plan's, or the history's). This stands in
  for the C-CPI-U (brackets, deductions, limits) or the CPI-U (IRMAA).
- **Wages:** each row advances the wage index by one year of salary growth, standing in for the national average wage index.
- **A zero-inflation, zero-growth year** is the 2026 rules object itself.
- **Every figure is indexed from its 2026 amount,** standing in for each statute's own base year. Where the statute rounds the
  increase, the increase is rounded; where it rounds the amount, the amount is.

**What indexes, and how (each read at the source on 2026-09-29):**

| amount | statute | rounding |
|---|---|---|
| ordinary brackets | IRC 1(f)(3), (f)(7) | the increase down to $50 |
| 0%/15% capital-gains thresholds | 1(j)(5)(C) | the increase down to $50 |
| standard deduction, age-65 addition | 63(c)(4), (c)(7) | the increase down to $50 |
| Arizona standard deduction | A.R.S. 43-1041 as reset by Chapter 140 (conforms to federal) | as federal |
| IRA limit / IRA catch-up | 219(b)(5)(C) | the amount down to $500 / $100 |
| IRA deduction and Roth phase-outs | 219(g)(8), 408A(c)(3)(D) | the increase to the nearest $1,000 |
| elective deferral, catch-up, 60–63 catch-up | 402(g)(4), 414(v)(2)(C), (E) | the increase down to $500 |
| total additions | 415(d)(4)(B) | the increase down to $1,000 |
| compensation limit | 401(a)(17)(B) | the increase down to $5,000 |
| Roth catch-up wage threshold | 414(v)(7) | the increase down to $5,000 |
| HSA limits, HDHP amounts | 223(g)(2) | the increase to the nearest $50 (the $1,000 catch-up is fixed) |
| QCD cap and split-interest amount | 408(d)(8)(G) | the amount to the nearest $1,000 |
| IRMAA thresholds | 42 USC 1395r(i)(5) | the amount to the nearest $1,000; the $500,000/$750,000 top tier fixed until 2028, then indexed from the second plan year's prices |
| OASDI wage base | 42 USC 430(b) | nearest $300 (a $150 multiple up) — wages |
| earnings-test exempt amounts | 42 USC 403(f)(8)(B) | the monthly amount to the nearest $10 — wages |
| PIA bend points (the AIME path) | 42 USC 415(a)(1)(B) | nearest $1, set by the wage index for the year the person turns 60 (their eligibility year's), with the entered AIME indexed alike — wages |

**What stays fixed:** the NIIT and Additional Medicare thresholds; the Social Security taxation bases; the $3,000 loss limit; the
senior deduction's $6,000 and its thresholds (continued after 2028, D8); Arizona's $2,100 age-65 exemption; the SALT figures (recorded,
not applied); statutory ages and rates.

**The form's "Fixed tax-year boundary" card** is replaced by a "Later tax years" card that says what indexes, by what stand-in, and
what the law fixes.

## 4. Evidence

**New tests** (2 files, 8 tests):
- `tests/audit-s5aa-r36-later-year-tax-indexing.test.js` (2): the public route. A single 67-year-old with a $60,000 pension at 3% inflation pays 5,099 in 2026 and 5,020.75 in 2027, worked by hand. It failed on R35 with 5,099 for both years.
- `tests/audit-s5aa-r36-tax-year-rules-rounding.test.js` (6): every indexed figure one year on at 3% prices and 4% wages, each rounding worked by hand, plus the fixed amounts and the identity at zero inflation.

**Re-fixtured by intent** (2 files, each saying why):
- The Monte Carlo fault variant's marker moves to `simulatePlanRows()`, called once per `simulatePlan()` call.
- The RMD cash fixture isolates inflation as it isolates growth.

**Gate at `cf643a8`,** in a separate worktree at the commit: GATE PASSED, 3,053 tests, 3,044 passing, 0 failing, 9 authorised todo. Closeout accepted 12, refused 0.

**One design error, caught before commit.** The first build indexed by elapsed time, so a plan opening at 29.5 got half a year's inflation in its 2027 row. The trace showed the golden plans moving at "elapsed 0.5"; each row now advances the index by one whole tax year.

## 5. What moved

**The control (4.7).** All 28 plans that move were traced against R35:
- **Tax year 0 is untouched** in every one: row 0 reads the 2026 rules object itself.
- **Each plan first moves in tax year 1 or later,** in tax-linked fields: tax year 1 for 23 of them; seed:1 in year 7, seed:12 in year 9, and the historical 1929, 1966 and 2000 plans in years 16, 4 and 3.
- **Unchanged:** targeted:historical-spouse-ss, spouse-cola-income and survivor-stateful do not move.
- **Declared as one change;** golden regenerated.

**The expanded corpus at `cf643a8`:**
- **71 entries, qualified boundary, invariant 7/7.** Output hash `487599407e3df23360bea01545bca337d9f0ec003e3546351553ebf3625957ba`, input hash `1d91d6733295298f22dcbce36b5c730fd014a7a51e1e7dfed1e9259c02fbc4ce`.
- **The band member.** The one input change is `expansion:monte-carlo-sensitive-band`, re-chosen by its rule (family version 6, step 32, 85.0%, inside the band's inclusive edge; 100% / 85.0% / 55.2% at half, full and 1.5x the volatility).
  - **Attributed:** step 31 is 80.2% on R35's engine and 85.6% on R36's.
- **Against R35, both captured over today's inputs, 37 members moved.** The headline figures:

| member | fields | lifetime tax | ending net worth |
|---|---:|---:|---:|
| golden:baseline | 944 | −7,534,059.50 | +37,877,105.76 |
| golden:monte-carlo-fixed-seed | 1011 | −4,848,412.59 | +26,059,618.72 |
| golden:rmd-and-roth-conversion | 395 | −66,936.73 | +209,550.18 |
| golden:reserve-and-bond-tent | 949 | −6,791,194.04 | +33,402,645.04 |
| golden:guardrails-withdrawal-strategy | 944 | −8,831,264.50 | +47,198,248.80 |
| seed:1 | 124 | −14,587.58 | +16,981.77 |
| seed:2 | 283 | +15,114.13 | −3,425.01 |
| seed:3 | 107 | −86,881.76 | +92,499.66 |
| seed:4 | 229 | −317,260.74 | +405,630.96 |
| seed:5 | 267 | −753,816.54 | +509,688.37 |
| seed:6 | 128 | −193,322.41 | +166,523.41 |
| seed:7 | 216 | −379,108.82 | +1,185,864.91 |
| seed:8 | 368 | −460,352.65 | 0.00 |
| seed:9 | 357 | −792,899.82 | +653,604.80 |
| seed:10 | 350 | −25,074.44 | −46,958.61 |
| seed:11 | 430 | −1,882,786.62 | +1,734,122.04 |
| seed:12 | 51 | −2,176.40 | 0.00 |
| seed:13 | 130 | −22,207.25 | +3,917.56 |
| seed:14 | 163 | 0.00 | −9,831.45 |
| seed:15 | 218 | −208,918.72 | +304,490.83 |
| seed:16 | 368 | −377,855.88 | +21,037.72 |
| seed:17 | 141 | −62,261.52 | +16,928.05 |
| seed:18 | 437 | −603,457.94 | +1,002,504.38 |
| seed:19 | 302 | −382,414.32 | +742,818.92 |
| seed:20 | 435 | −1,652,306.04 | +2,358,686.53 |
| targeted:historical-1929 | 118 | −16,529.67 | +25,292.05 |
| targeted:historical-1966 | 253 | −288,780.94 | +693,127.38 |
| targeted:historical-2000 | 251 | −47,611.95 | +129,428.95 |
| expansion:debt-ordinary-amortizing-15y | 183 | −2,840.33 | +3,728.31 |
| expansion:debt-ordinary-amortizing-5y | 170 | −2,815.97 | +3,573.37 |
| expansion:debt-ordinary-zero-interest | 170 | −2,865.82 | +3,656.46 |
| expansion:debt-ordinary-zero-balance | 170 | −2,898.43 | +3,710.83 |
| expansion:debt-ordinary-payoff | 183 | −2,434.47 | +3,087.95 |
| expansion:debt-adversarial-q54-worst | 128 | −21,165.77 | 0.00 |
| expansion:debt-adversarial-interest-only | 183 | −2,621.10 | +3,451.84 |
| expansion:debt-adversarial-a-cent-below | 170 | −2,936.72 | +3,780.01 |
| expansion:monte-carlo-sensitive-band | 1000 | −9,275,607.60 | +46,940,292.44 |

- **The eight debt members** are multi-year plans with inflation; each pays less tax once its brackets and deduction index.
- **The band member's ending net worth** is its 1,000-path Monte Carlo figure over a 65-year horizon at 2.6 times the golden spending.

## 6. Known limits

- **The index stand-ins.** Each price-linked amount rises with the plan's single inflation rate. The law uses the C-CPI-U for most
  amounts and the CPI-U for IRMAA, each over its own months. The wage-linked amounts use the salary-growth field.
- **The 2026 base.** Indexing starts from the 2026 published figure, not each statute's own base year, so a figure can differ by one
  rounding step from the one the IRS will publish.
- **The entered AIME** is read at today's wage level and indexed to the year the person turns 60.
- **Statutory changes are not modelled:** the SALT schedule's 2030 reset and any future Act. The senior deduction continues by the
  owner's choice (D8), not by law.
- **Medicare premiums themselves** (Part B, Part D) are 2026's in every year; only the IRMAA thresholds index.

## 7. Where I would look first

1. A plan opening at a fractional age: its second row is 2027, indexed by a whole year.
2. The quote solver's mirror against the committed tax, in a row whose brackets have just indexed.
3. The IRMAA top tier across plan years 1 and 2.
