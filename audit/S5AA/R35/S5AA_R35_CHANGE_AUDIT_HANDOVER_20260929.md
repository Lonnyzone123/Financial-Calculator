# S5AA R35 — change audit handover: cash flows, Medicare and life events (13 items from R32F / R32V)

*Written by Claude, 2026-09-29 (local, UTC−7), during the owner's overnight run of R33–R37, for the owner to send to ChatGPT. Every
figure was measured on Windows 11 / Node 24.17.0 at the commits named.*

## 1. What to audit

- **The change:** from `s5aa-r34-source` at `7b61b88` (R34's records at `ad5069d`) to **`s5aa-r35-source`** at **`26ef26d`**. R35 is
  stacked on R34's pull request; the diff to audit is `ad5069d..26ef26d`.
- **Twelve commits and one fix, each test-first and each gated green:**

| commit | findings | what changed |
|---|---|---|
| `a69c198` | SA32F-18 (pension half) | a pension stream pays its entered survivor share after its owner's death (default 100%, disclosed) |
| `6c37633` | SA32F-19 | a working spouse's net pay after the household's retirement date pays spending first |
| `f9f37a8` | SA32F-36 | fixed-nominal spending is today's dollars grown to the retirement date, then held (decision 6) |
| `4d4fe76` | SA32F-39 | a set spending stage takes the survivor reduction |
| `ede3786` | SA32F-20 | an other asset's accessible share is a sub-balance |
| `efda32d` | SA32F-37, R32V-01 | the prior-period signal and VPW's rate are the portfolio's own, balance-weighted |
| `beb246a` | SA32F-17 | a taxable account's basis resets at a death: own in full, joint half, up or down (decision 4) |
| `6fbd379` | SA32F-08 | the Joint and Last Survivor Table for a spouse more than ten years younger and the sole beneficiary |
| `e779604` | — | commit 8's comment cited an ID the register does not carry; wording only |
| `d4be17c` | SA32F-26 | the still-working exception for the current employer's plan |
| `056a044` | SA32F-22 | the Rule of 55 needs a separation in or after the year of 55 |
| `ddf658a` | SA32F-24 | the two returns before the plan price IRMAA's first years; a partial first year is completed |
| `26ef26d` | SA32F-13 | vesting is decided at separation, on credited service (decision 5b) |

- **Please number findings R35-NN**, in the usual report-only pull request, on a branch like `audit/chatgpt/r35-26ef26d`.

## 2. The owner's decisions this round implements

- **R32F §4, 2026-09-29:** decision 4 ("own full, joint half"), refined the same night to "a loss also resets"; decision 5b ("vest over
  six years"); decision 6 ("inflate fixed-nominal spending to retirement").
- **For R34–R37:** "Follow law everywhere": where the law gives a rule, build it rather than disclose a gap, even if it needs new
  inputs. Non-law modelling choices keep Claude's recommendations of record (the R33 repair plan, §4).

## 3. The rules, as built, with their sources

**A pension stream at its owner's death** (SA32F-18, `a69c198`). No statute sets a private pension's survivor share; the plan and the
election do (a single-life annuity stops; a joint-and-survivor annuity pays its elected share, e.g. IRC 417(b)'s 50%). Each `pension`
income stream carries `survivorPercent` (0–100; the form shows it on a pension row). Absent, it is 100%, the main pension's declared
assumption, and `PENSION_STREAM_AFTER_DEATH_ASSUMED` names the streams. A death inside a row pays the whole amount before it and the
share after.

**A working spouse's pay** (SA32F-19, `6c37633`). Spending starts at the primary's retirement age; a younger spouse works on to their
own. The net pay earned after the retirement date (that share of the row's wages, less the same share of the pay-funded contributions
and of the wage-only tax) now pays spending before the portfolio, up to the spending. Pay beyond the spending is spent outside the model,
as pay before retirement always is: a stated convention.

**Fixed-nominal spending** (SA32F-36, `f9f37a8`; decision 6). The base is grown by the first retired row's inflation factor, then held.
The first retired row spends what `incomeFirst` spends in it. The strategy description says so.

**A set spending stage and the survivor reduction** (SA32F-39, `4d4fe76`). No law decides the precedence (R32V). The rule of record: a
set amount names the household's spending, as the entered spending does, so the survivor reduction applies to it once. A percent stage
is unchanged.

**An other asset's accessible share** (SA32F-20, `ede3786`). The accessible part is a sub-balance: set at the first draw to that share of
the value (growth scales both alike), grown with the asset, reduced by each draw, and kept off the asset's enumerable fields.

**The returns spending decisions read** (SA32F-37, R32V-01, `efda32d`). No law sets either. The recommendation of record:
- the prior-period signal (the flexibility cut, Guyton's skip) is the portfolio's balance-weighted return for the period, as the accounts
  actually grew (net of the fee), with household cash at its own 0%, in every method;
- VPW paces on the portfolio's balance-weighted expected return (each account's allocation, or the flat rate without one), less the fee.

**Basis at a death** (SA32F-17, `beb246a`; decision 4). IRC 1014(a): fair market value at death, up or down. The decedent's own taxable
accounts reset in full; a joint account resets half, the decedent's assumed share (2040(b)): half the old basis plus half the value. The
value is the balance when the account passes (the first row after the death). Retirement accounts and HSAs are untouched (income in
respect of a decedent). Community property (1014(b)(6)) is named as not modelled.

**Table II** (SA32F-08, `6fbd379`). 26 CFR 1.401(a)(9)-5(c)(2): where the sole designated beneficiary is a spouse more than ten years
younger, the divisor is the Joint and Last Survivor Table of 1.401(a)(9)-9(d).
- **The table** is in the rules package, owner ages 72–120 by spouse ages 0 to owner − 11. It was read from eCFR, the whole table
  assembled and checked for duplicates and symmetry, and the region's text checksum-verified before it was pinned.
- **Sole beneficiary** is each pre-tax account's `spouseSoleBeneficiary` (default true, as 18.1 assumes the spouse inherits; on the form).
- **Timing:** the spouse must be alive at the row's opening ("determined as of January 1").
- **Several IRAs:** each IRA's amount uses its own divisor, and the IRA total is their sum (1.408-8, question and answer 9).

**The still-working exception** (SA32F-26, `d4be17c`). IRC 401(a)(9)(C)(i)–(ii): a qualified-plan participant who is not a 5-percent
owner begins at the later of the applicable age and retirement from the employer maintaining the plan; never an IRA.
- **Inputs:** each workplace account's `currentEmployerPlan` (absent: yes when it receives contributions) and `fivePercentOwner`; both
  are on the form.
- **The exception holds** while the owner is paid and retires at least a year after the row opens. The retirement year is the first
  distribution year.

**The Rule of 55** (SA32F-22, `056a044`). IRC 72(t)(2)(A)(v): a distribution after separation from service in or after the year the
employee turns 55, from that employer's plan.
- **The switch stays**, as the household's certification that its workplace plans are with the employer it leaves (R32V note H allows
  it).
- **The facts are checked:** the owner has left work (their retirement age, own clock) in or after the year of 55, read with the plan's
  birth-year convention as `floor(retireAge − startAge) + floor(startAge) >= 55`; and the account is not marked as another employer's.

**IRMAA's first years** (SA32F-24, `ddf658a`). 20 CFR 418.1135.
- **The inputs:** the MAGI, and optionally the filing status, of the two returns before the plan (`advanced.irmaaMagiTwoYearsBefore`,
  `irmaaMagiOneYearBefore`, `irmaaFiling…`). They are accepted as optional keys, where blank means not entered, and the form's health
  section has two fields.
- **Entered,** they price plan years 0 and 1, and the pre-plan assumption (MODEL_ASSUMPTIONS 11) is not disclosed.
- **A partial first row** is completed to a year at last year's entered rate, or at the row's own annual rate. This is disclosed where it
  prices a premium (`IRMAA_PARTIAL_FIRST_YEAR_COMPLETED`).

**Vesting** (SA32F-13, `26ef26d`; decision 5b). IRC 411(a)(2)(B).
- **Deposits:** employer money is deposited in full, and its share of the account is tracked.
- **Service** at the plan's start is `yearsOfService` if entered. Otherwise it is read from the entered vested percentage on the schedule
  (`vestingSchedule`: six-year graded by default, where 20% is two years, or a three-year cliff). Each completed year adds one.
- **At the owner's separation,** the unvested share of the employer money is forfeited, booked as a negative employer contribution so the
  portfolio identity holds. The form offers the schedule.

## 4. Evidence

**New tests** (12 files, 35 tests). Each expectation is worked by hand in the file, and each defect test failed on the engine before its
change with the audit's figure. The hand figures include:
- the Rule of 55's 20,557.14 and 23,209.68 draws, matched to the cent;
- Table II's 3,952.57 at 75/64.

**Re-fixtured by intent** (14 files; each says why in place):
- **Table II:** four files testing conversions, transfers and QCD sources on Uniform-table amounts now name the spouse as not the sole
  beneficiary.
- **The succession:** two files' texts now say the basis resets.
- **The Rule of 55:** six fixtures state a qualifying separation, and the boolean-flag contract's witness retires at 55.
- **The Roth match:** it lands in full until separation.
- **The Monte Carlo band member:** its declared step moves to 27.

**Gates.** Each commit was gated in a separate worktree at the commit. At `26ef26d`: GATE PASSED, 3,045 tests, 3,036 passing, 0
failing, 9 authorised todo. Closeout accepted 12, refused 0.
- **One refusal, fixed:** commit 8's gate refused its comment (register test 8.1: an unregistered ID; the closeout read "Q&A-9" as an
  open item). Fixed by `e779604` and re-gated green.

**Your external repros at `26ef26d`:**

| repro | result |
|---|---|
| R29 | 3 mismatches, the same as R33 and R34 (the basis plan) |
| R30 | 0 |
| R30A | 2 mismatches, the same basis plan |
| R31 | 0 |
| R32 | 0 |

**Claude's R34 Social Security reference:** 0 of 25 mismatches.

## 5. What moved

**The control (4.7).** Every move was traced against the commit before, first moved row by first moved row, and declared per commit:
- `6c37633` (SA32F-19): seeds 3, 4, 16, 17, 18. Each has a younger spouse still on salary after the retirement age. seed:3's row 59–60
  withdrawals fell 184,631.80 → 51,637.82.
- `f9f37a8` (SA32F-36): seeds 16 and 20.
  - seed:20 (59, retiring at 69, 5.3% inflation): the base grows ×1.676; its 61.56% stage takes 35,333 of the 57,396.
  - Its old rows varied because `surplusPolicy` "spend" spent outside-income surplus on top of a small staged amount.
- `efda32d` (R32V-01, SA32F-37): six plans.
  - golden Monte Carlo and seed:17: the unweighted mean of the accounts' draws became their balance-weighted return.
  - seed:9: VPW with allocations.
  - seed:10: historical mode, bond tent and fee.
  - The two spouse-SS targeted plans hold no accounts, so history's 2022 loss no longer cuts their spending.
  - Golden Monte Carlo was regenerated.
- `056a044` (SA32F-22): seed:1 switches the Rule of 55 on but retired at 53. From 59 the optimized order draws the HSA instead of the
  now-penalised 401(k).
- **No control plan moves** at `a69c198`, `4d4fe76`, `ede3786`, `beb246a` (every control couple dies together), `6fbd379`, `d4be17c`,
  `ddf658a` or `26ef26d`.

**The expanded corpus at `26ef26d`:**
- **71 entries, qualified boundary, invariant 7/7.** Output hash `e02909d47ab23c9a1d9ae46f1c87056ab5b4a459f61eae0eef573e4f8bced6de`,
  input hash `6e2f80c41a04761a287a01a9bdbb72df926c009945305bbe88985dac782ea347`.
- **The inputs changed in two members:**
  - `expansion:monte-carlo-sensitive-band` was re-chosen by its declared rule (family version 5, step 27, 84.4%). R32V-01's weighted
    signal lifted step 26 to 85.2%; measured on commit 5's engine, the same step was 84.8%.
  - **A new member,** `expansion:s5aa-r35-rule55-separation-at-55`. The Rule of 55 needs a separation at 55 or later now, and no corpus
    plan reached it lawfully; the corpus-path check forbids pinning a new gap. It is hand-checked: 20,557.14 drawn, 557.14 of tax.
- **Against R34, both captured over today's inputs, 20 members moved:**

| member | fields | lifetime tax | ending net worth |
|---|---:|---:|---:|
| golden:monte-carlo-fixed-seed | 585 | −48,712.06 | +199,253.39 |
| seed:1 | 77 | −200.77 | +187.56 |
| seed:3 | 113 | −155,749.29 | +1,248,670.97 |
| seed:4 | 131 | −24,487.29 | +884,486.95 |
| seed:9 | 115 | −63,993.71 | +215,787.58 |
| seed:10 | 29 | 0.00 | 0.00 |
| seed:16 | 379 | +9,534.60 | +78,511.69 |
| seed:17 | 105 | 0.00 | −1,453.68 |
| seed:18 | 259 | −39,710.91 | +638,402.10 |
| seed:20 | 287 | +66,068.96 | −441,340.96 |
| targeted:historical-spouse-ss | 60 | 0.00 | −43,143.57 |
| targeted:spouse-cola-income | 77 | 0.00 | −58,080.91 |
| expansion:other-asset-draw-growth-0 | 43 | 0.00 | +79,999.98 |
| expansion:other-asset-draw-growth-4 | 43 | 0.00 | +144,075.37 |
| expansion:other-asset-draw-historical | 31 | 0.00 | +242,343.87 |
| expansion:other-asset-two-assets-late-access | 28 | 0.00 | +257,845.27 |
| expansion:monte-carlo-sensitive-band | 468 | −83,723.17 | +2,870,427.62 |
| expansion:s5aa-gap-working-household | 129 | −999.53 | +1,308.39 |
| expansion:s5aa-gap-death-while-working | 235 | −20,979.61 | +155,031.55 |
| expansion:s5aa-r14-rmd-two-iras-distinct-returns | 45 | 0.00 | 0.00 |

- **The other-asset members:** SA32F-20; the inaccessible share is no longer drawn.
- **The working household:** SA32F-08. The IRA owner is 11 years older than the spouse, so Table II applies from 75.
- **Death-while-working:** SA32F-19, the spouse's $90,000 of pay funds the retired self's spending, then SA32F-17's basis reset after
  that spouse's death.
- **The two-IRA member:** last-digit floating-point differences only, from summing each IRA's amount separately.

## 6. Known limits

- **The wage-tax clamp** (R32F FLOWS-01's second mechanism) is not repaired: a portfolio loss that takes the tax below the wage-only
  baseline still loses the saving. Only the pay-funds-spending half is built.
- **A working spouse's surplus pay** is not saved (the pre-retirement convention).
- **The Roth match election** still reads the entered vested percentage, not the service-grown one. A partly vested employee who
  becomes fully vested is still refused, which is conservative.
- **Row approximations:**
  - the still-working exception reads "retires at least a year after the row opens";
  - Table II's January 1 is the row's opening;
  - the basis reset reads the value at the first row after the death, not the date of death.
- **Vesting:** service is inferred from the percentage when not entered. A death before separation forfeits nothing (many plans vest at
  death); this is not a stated rule of every plan.
- **The IRMAA partial year** is completed by estimate; the filing statuses of the pre-plan returns default to the plan's.
- **A pension stream's survivor share defaults to 100%,** as the main pension's does, and the main pension still has no survivor field.
- **A rollover into a workplace plan** dilutes the tracked employer share only through the contribution path.

## 7. Where I would look first

1. The employer-share tracking across a Roth-match destination and a later rollover.
2. The spouse's-pay offset against the tax quote in a row where the pay exceeds the spending.
3. Table II for a spouse who dies inside the distribution year (the rule keeps Table II for that year; the row reads the opening).
