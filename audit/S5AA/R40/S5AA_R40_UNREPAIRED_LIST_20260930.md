# S5AA R40 — what R29 to R40 knowingly left unrepaired (exit gate E12, task 5.6 with A-07's labels)

*Written by Claude, 2026-09-30 (local, UTC−7), at the R40 source.*

**Scope.** This list covers the limits R29 to R40 recorded. The list for S5AA before R29 is in the private archive's close
record (§4a and 5.6), which ChatGPT's R24G2 accepted for E12 at `d67b618`. That list is carried unchanged, including the
dividends-on gap assigned to S5b task 1 (A-07).

**Labels.** Each item carries one A-07 label and names where it is disclosed:
- a round's change handover §6 ("Known limits"), which is public;
- `MODEL_ASSUMPTIONS.md`;
- an engine issue code;
- an app card or form label.

**Qualification.** A-07: "an unsupported case is not a certified financial answer". A result that carries
`outsideSupportedDomain` is an unqualified reference value (A-09).

## Repaired since it was recorded — not unrepaired

| recorded | item | repaired |
|---|---|---|
| R29 §6 | a funding distribution does not count toward the year's RMD | R30 (the RMD credit) |
| R29 §6 | under `warn`, the whole planned amount is deducted | R33 `fd80c78` (only the lawful part is deducted; see the excise below) |
| R29 §6 | no expanded baseline registered after r17 | R40 `8fb0aca` (r18) |
| R35 §6 | the Roth match election reads the entered vested percentage | R39 `252faba` |
| R37 §6 | the app's default plan files jointly with no spouse | R38 `678c556` (single) |
| R38 §6 | `vesting` 100 with `yearsOfService` 0 routes a Roth match that is then forfeited | R39 `252faba` (Q168) |
| R32F suspicion | the long-term-care cost is never inflated | R40 `8f20d90` |
| R32F suspicion | no Part D premium, only its surcharge | R40 `d1572b1` |
| R32F suspicion | with a fractional self start, a spouse whose fraction is smaller than the self's reached the RMD start age a year late | R40 `d51d30d`, corrected at `3fbe9dc` after the audit of PR #35 (the age reached now follows the engine's own birth year) |

## Unsupported scope

| item | disclosed in |
|---|---|
| HSA eligibility: coverage, and Medicare from 65, is not modelled; a transfer into an HSA at 83 is allowed the room | R29 §6; `MODEL_ASSUMPTIONS.md` ("Not modelled: HSA eligibility") |
| Custom accounts: no contribution limit group; a custom tax-deferred account is its own RMD plan and outside the Form 8606 pool (a SEP modelled as one would get the pro-rata basis wrong); a joint custom account's RMD reads the self's age | R29 §6; R32 §6; the Form 8606 pool part is disclosed **here** (R32F's reading, not re-probed in R40) |
| A Roth IRA's five-year and ordering rules | engine issue `UNSUPPORTED_ROTH_ORDERING`, `outsideSupportedDomain` |
| Social Security for children, disability and remarriage | R34 §6; the survivor disclosure |
| Statutory changes: the SALT schedule's 2030 reset, future Acts | R36 §6 |
| A survivor rolling a workplace plan into their own employer's plan | R39 §6 |
| The 6% excise tax on an IRA excess kept under `warn` (IRC 4973) | R33 §6 |
| Annuity income with an exclusion ratio (no annuity income type) | recorded in R32F's Social Security area; disclosed **here** |

## Disclosed approximation

| item | disclosed in |
|---|---|
| **Row-opening ages.** The QCD's 70½, the 10% at 59½, the HSA's 65, Medicare eligibility and the filing status read the age at a row's opening. The QCD's convention is declared on the form. Deferred to the engine rebuild by the owner (R39). R40 reads the RMD start and divisor at the age reached in the row by the engine's own birth year (`d51d30d`, corrected at `3fbe9dc`); the rest are unchanged | R37 §6; R39 §6; Q137; the QCD form label |
| **No birth month.** SSA's "born on January 1" rule and the year-of-FRA earnings band are read from the whole age | R34 §6 |
| The earnings test is annual, prorated to the row (Q91). The survivor reduction is the rules package's reading of SSA's figures (Q92) | R34 §6 |
| **Later years' figures.** They index by the plan's inflation and salary-growth rates, standing in for the C-CPI-U, CPI-U and wage index, from the 2026 base (one rounding step can differ) | R36 §6; the "Later tax years" card, now read rendered (R40 `6dccadb`) |
| Medicare premiums (Part B, and since R40 the Part D base premium) stay at 2026's | `MODEL_ASSUMPTIONS.md` (later years); R36 §6 |
| The Part D base beneficiary premium is the proxy for a plan's own premium | R40 rules `medicare.partD.about`; **here** |
| The long-term-care insurance benefit stays as entered (no inflation rider) while the cost inflates | R40 engine comment; **here** |
| A pension stream with no survivor share is paid in full after its owner's death (100% joint and survivor) | engine issue `PENSION_STREAM_AFTER_DEATH_ASSUMED`; R35 §6 |
| IRMAA's partial first year is completed by estimate | engine issue `IRMAA_PARTIAL_FIRST_YEAR_COMPLETED`; R35 §6 |
| **Vesting and service.** Service is inferred from the vested percentage when blank. A death before separation forfeits and vests nothing. The spouse's separation is their retirement age on their own clock | R35 §6; R38 §6 |
| Row approximations: the still-working exception reads "retires at least a year after the row opens"; Table II's January 1 is the row's opening; the basis reset reads the first row after a death (the app warns) | R35 §6 |
| **Part-year limits.** The one-time contribution path (a transfer into an IRA or HSA) holds a partial row to the whole annual limit. Excess warnings state the annual-rate excess | R39 §6 |
| **Partial-row tax.** A partial first or last row is taxed as a whole tax year holding only the row's income, so the first year's tax is understated where the household earned before the plan opened (a half-year $60,000 pension row: 1,767.50, where half of the year's tax is 3,058.75). R40 repaired it by taxing the row as its share of a year (`607101a`) and reverted that at `b97fe0a`: the audit of PR #35 showed it annualizes one-time amounts ($56,958 against $20,221.85 on a $100,000 expense in a tenth-of-a-year row) | **here**; `tests/audit-s5aa-r40-partial-row-whole-year-convention.test.js` |
| The Rule of 55 in the year of 55 reads the plan's birth-year convention | R39 §6 |
| A Roth match's allocation reads the vesting at the row's opening | R39 §6 |
| **Social Security timing.** A COLA falling inside a row after a claim is paid from the next row (R2-004). The survivor's COLA timing after a death before eligibility (20 CFR 404.271(b)) is unqualified | R39 §6; R39.1 §6; ChatGPT's R39.1 audit |
| A catch-up reads each row as a tax year | R32 §6 |
| **IRA basis on a date.** A rollover into a 401(k) measures the IRA's basis without that year's nondeductible contributions. A funding counts the whole year's nondeductible contributions. A QCD comes before a funding in the same year | R30 §6; R31 §6; R32 §6 |
| **Dividends around a transfer.** A late destination's dividend cash is surplus. Dollars kept back to pay a taxable source's dividends earn for the rest of the year | R30 §6 |
| **Tax proxies.** The Roth MAGI is the declared salary proxy. The wage-only baseline (Q59) splits wage-paid and portfolio-paid tax; household AGI is right | R33 §6 |
| **The wage-tax clamp** (R32F FLOWS-01's second mechanism) is not repaired: a portfolio loss that takes the tax below the wage-only baseline loses the saving. R40's conservation grid finds 2 to 4 such rows per 1,000 plans, worst $750.50 | R35 §6; `S5AA_R40_CONSERVATION_GRID/` |
| A working spouse's surplus pay is not saved | R35 §6 |
| Housing costs follow plan inflation. A joint account's deposits follow the primary person's window | R37 §6 |
| The entered AIME is read at today's wage level | R36 §6 |

## Intended assumption (the owner's decisions)

| item | decided |
|---|---|
| The senior deduction continues after 2028 (D8, "Keep it even after 2028") | R36; the "Later tax years" card |
| Social Security in today's dollars (decision 3) | R34 |
| A partial row takes its share of each annual contribution limit | R39 |
| The plan's normal retirement age is 65 for full vesting | R38 |
| The app's default plan files single. The tests' corpus keeps joint filing (`TEST_FILING`), so its inputs stay fixed | R38 |
| The QCD's opening-age convention, declared on the form | R39 |

## Repair assigned before reference freeze

The dividends-on gap, S5b task 1 (A-07), carried from before R29. It is unchanged.

## Later feature work

| item | where |
|---|---|
| Monte Carlo figures for the failing paths (shortfall amount and cut) | a CPU-rebuild wanted feature (R37, R38); `FEATURES.md` |
| A partial row's tax that annualizes recurring income and counts one-time items once (the design R40's reverted repair 3 lacked) | the engine rebuild (R40); relayed to eb |
| The income tax on an elected Roth match is drawn from the portfolio even in a year whose wages exceed its needs (Q96's treatment) | R38 §6, observed, not changed |

## R32F's unconfirmed suspicions not examined in R40

R40 examined the five R32F's summary named as most worth a look (four confirmed and repaired above; the custom-account pool is
listed under unsupported scope). These others are recorded in `audit/S5AA/R32/SA32F/*/FINDINGS.md` §5 and were not re-examined:
- the Roth MAGI proxy's partial row;
- `futureChanges[].age` on the self's clock for a spouse's account;
- `changeTiming: "period"` compounding;
- two workplace accounts each with their own match cap and 415(c) room;
- priority 0 tying with 1 (import only);
- the simple-mode flexibility signal;
- one-time amounts' dollars;
- the self-audit's unreconciled historical and Monte Carlo paths;
- the year-of-death age-65 amounts;
- the year-of-FRA band (disclosed above);
- "Match inflation" growth from the plan's start;
- the SE and wage timing notes;
- the debt modules' leftover minimum and refinance time value;
- a 0.7-year first row counting eight payments.

Some are already settled elsewhere: the single-filer-with-spouse case is R37's filing warning, the stream-wage deferral is
R33's SA32F-11, and the IRMAA top tier is R33's SA32F-23. None is claimed here as a defect or as correct.
