# FLOWS — auditor's report (saved by the coordinating session; the auditor could not write .md files)

The yearly simulation loop and money conservation, frozen `main` at `2b2d5f2`. Report only. Scripts in this folder: `lib.js`,
`grid.js`, `coverage.js`, `probes.js`, `handrow.js`, `repro-01-spouse-wages-after-retirement.js`, `repro-misc.js`. Every repro
and the final grid were rerun before the report. The conservation grid found no leak beyond FLOWS-01.

## Findings
| ID | Sev | Claim | $ impact (repro) |
|---|---|---|---|
| FLOWS-01 | P1 | A younger spouse's salary after the household's retirement date never funds spending: the portfolio pays all of it and the net wages leave the model. | $52,752.50 a year of extra withdrawals |
| FLOWS-02 | P2 | `fixedNominal`'s input is labelled "Annual spending in today's dollars", but at a deferred retirement it is spent without inflation. | $60,000 against $141,794.70 in the first retired year |
| FLOWS-03 | P1 | The other-asset fallback ignores "Accessible share": it re-applies the share to the remaining value every year until the asset is nearly gone. | $396,875 drawn against $200,000 accessible |
| FLOWS-04 | P2 | VPW's "expected real return" reads `assumptions.returnRate` even when account allocations set every return. | $74,840.23 against $58,920.45 in year 1 |
| FLOWS-05 | P2 | A one-time expense dated at `endAge` is accepted with no warning and never charged. | $50,000 dropped |
| FLOWS-06 | P2 | A "Set annual spending" stage cancels the survivor spending reduction; a percent stage keeps it. | $20,000 a year |
| FLOWS-07 | P3 | The percentage-strategy descriptions say "Withdraws …%", but outside income reduces the withdrawal (declared in §3). | text only |

## 1. Scope covered
**Functions read in `src/engine.js`:**
- The loop: `simulatePlan`, all of it.
- Withdrawals: `withdrawFromAccountList`, `withdrawFromClass`, `nextWithdrawAccount`, `withdrawalComparator`, `retainedCashFirst`,
  `smartWithdrawalOrder`, `optimizedAccountScore`.
- Strategies: `strategySpending`, `canonicalWithdrawalStrategy`, `withResolvedStrategy`.
- Stages and events: `stageAmountAt`, `applyStage`, `eventAmount`, `otherIncomeFor`.
- Basis and dividends: `initTaxableBasis`, `addTaxableBasis`, `taxableBasisOf`, `taxableGainFraction`, `payOwnDividends`,
  `imputeRetainedYield`, `dividendEligibleAccounts`.
- Surplus and cash: `knownSurplusPolicy`, `surplusPolicyFor`, `retainExcessRmdCash`, `moveFunds`.
- Growth: `growAccounts`, `accountReturnForPeriod`, `accountExpected`, `accountVolatility`, `accountGlideWeights`.
- Other assets: `growOtherAssets`, `drawFromOtherAssets`.
- Checks and totals: `householdWorkDurations`, `checkRowInvariants`, the failure-age bookkeeping, the terminal true-up, and the
  result totals.

**Also read:** the app shell's labels and descriptions, `RESULT_CONTRACT.md`, `HOUSEHOLD_LEDGER.md`, all of
`MODEL_ASSUMPTIONS.md`, SPRINT_QUESTIONS Q19, Q59, Q64, Q65, Q108, Q109, and `S102_TASK_CHECKLIST.md` task 3.

**Reconciler.** A tapped in-memory copy of the engine, built like `tests/lib/engine-variant.js`, exposes each row's growth,
wages, wage-only baseline tax, employer contributions, outside deposit and QCD cash. Every run asserts its rows are byte-identical
to the real engine's. Three identities per row:
- **Portfolio:** Δtotal = contributions + employer + growth + outside deposit − dividends − withdrawals.
- **Household:** (income − wages − dividends) + withdrawals + dividends + non-portfolio draw = (spending − shortfall) + (taxes −
  baseline) + outside deposit + QCD.
- **Combined:** both together, from row fields plus growth, wages and baseline only.

The same pass checks the lifetime totals against their row sums; `firstShortfallAge`, `sustainedFailureAge`, `failureAge`;
`failed`, `successRate`; `realTotal`, the tax-class sum, `inflationFactor` and `networth`.

**Grid.** Fixed-seed plans, method `simple`, zero volatility, varying:
- single or couple;
- taxable, cash holding, IRA, 401(k), Roth, HSA, spouse-owned and joint accounts;
- dividends on or off;
- expenses and stages (percent, amount-fixed, amount-inflation);
- rental, employment, one-time, tax-free, household-owned, pension and Social Security incomes;
- other assets with the fallback, debts, conversions, LTC, health costs and RMDs;
- surplus policies;
- returns −3% to 7%, fees and inflation;
- all 9 strategies, all 4 orders, all 3 timings;
- fractional ages, working rows and low balances.

**Grid results:**
- **Final run (seeds 21–30):** 7,000 plans and 143,654 rows, all valid and `ok`, **0 leaks**; every total and contract check
  passed. The only residual class is `WAGE_TAX_CLAMP` (26 rows), part of FLOWS-01.
- **Earlier runs:** 7,440 more plans, same result.
- **Coverage for one seed:** 1,899 shortfall rows, 627 fallback rows, 2,132 RMD rows and 1,332 debt rows.

**Hand checks.**
- `handrow.js`, 17 of 17 pass:
  - a full pre-tax row: $50,000 of spending draws $55,459.06, grossed up for tax on the whole draw;
  - a dividend row: $40,000 paid, $597.50 tax, $9,402.50 retained;
  - an empty-portfolio row: a $15,099 shortfall, first shortfall at 68, sustained at 69.
- `probes.js`, 23 of 26 pass:
  - growth at monthly (0.5), quarterly (0.625) and annual timing, with the fee applied once;
  - `incomeFirst`, `fixedReal`, `guardrails`, `constantPercent`, rmd-style, `vpw` and `floorCeiling`;
  - whole-year and half-year stage boundaries.
  - The three mismatches are FLOWS-02, -03 and -05.

**Law read at the source:** Rev. Proc. 2025-32 §4.01, §4.03, §4.14; IRC 151(d)(5); IRC 3101; A.R.S. 43-1011.01; A.R.S. 43-1023.

## 3. Per finding
### FLOWS-01 (P1): a working spouse's wages are dropped once retirement spending starts
- **Rule (arithmetic and conservation):**
  - `householdWorkDurations()` (engine.js :74) has the spouse work until the spouse's own age reaches `profile.retireAge`.
    Retirement spending starts at the primary's `retireAge`.
  - `outside` is `ss + pension + other.cash + dividendCash`, so wages are not part of it. Wages pay only the wage-only
    `baseline` tax, and the rest of the salary is never used.
  - The same dollars entered as a spouse `employment` income stream do offset spending.
  - A second mechanism, `WAGE_TAX_CLAMP`: the portfolio's tax obligation is `max(0, taxes.total − baseline.total)`, so when the
    portfolio's own capital-loss deduction takes the tax below the wage-only baseline, the saving vanishes ($90 in grid plan 90,
    seed 12345).
- **Repro:** `node repro-01-spouse-wages-after-retirement.js`. MFJ, self 65 and retired, spouse 60 with $60,000 salary, $60,000
  fixed-nominal spending, a $1,000,000 Roth.

| Item | Arithmetic | Amount |
|---|---|---|
| Payroll | 60,000 × 7.65% | 4,590.00 |
| Federal | (60,000 − 32,200 − 1,650 − 6,000) × 10% | 2,015.00 |
| Arizona | (60,000 − 32,200 − 2,100) × 2.5% | 642.50 |
| Net wages | | 52,752.50 |
| Roth draw | 60,000 − 52,752.50 | **7,247.50** |

- **Engine:** withdrawals **$60,000.00** (+$52,752.50 a year). The row's taxes, $7,247.50, match. Entered as an income stream,
  withdrawals are $7,247.50. The run is valid and `ok` with no issues.
- **Not declared:** §7 and Q59 declare no budget before retirement; these are retirement rows. The `HOUSEHOLD_LEDGER` class
  `UNALLOCATED_WAGES` hides them, and no document declares this.

### FLOWS-02 (P2): fixedNominal ignores "today's dollars" at a deferred retirement
- The input is labelled "Annual spending in today's dollars" and is shared with `incomeFirst`. The description says "Withdraws
  the same dollar amount every year". The engine returns `r.spending` for `fixedNominal`, with no inflation up to retirement;
  `incomeFirst` returns `r.spending × inflationFactor`.
- **Repro:** `repro-misc.js`: age 40, retiring at 65, 3.5% inflation, $60,000.
- **Hand:** 60,000 × 1.035^25 = **$141,794.70**. **Engine:** $60,000 ($25,388.82 in start-date dollars).
- Which of the label and the engine is wrong is the owner's call.

### FLOWS-03 (P1): the fallback ignores the accessible share
- The field is "Accessible share", and the app's "Potentially accessible" total is `value × accessPct`. `drawFromOtherAssets()`
  re-applies `accessPct` to the current value on every call.
- **Repro:** `repro-misc.js` and `probes.js` #12: no portfolio, $60,000 a year of spending, a $400,000 asset with 0% growth,
  available from 60, 50% accessible.
- **Hand:** at most **$200,000** can be drawn, so the first shortfall is at 64.
- **Engine:** $60,000 five times, then $50,000, $25,000, $12,500, $6,250 and $3,125: **$396,875** in total, first shortfall at
  66, $3,125 left.
- **Not declared:** `SIMULATION_LOG` Batch 10 observed it and called it "clean", but that log is not a settled document.

### FLOWS-04 (P2): VPW paces spending on the flat return field
- VPW is described as using "expected real return". The engine uses `(1+(returnRate−fee)/100)/(1+infl/100)−1`, reading only
  `assumptions.returnRate`; with `assetsOn`, growth comes from the class weights instead.
- **Repro:** `repro-misc.js`: ages 65 to 95, 3.5% inflation, a $1,000,000 account at 60/40 (stocks 10%, bonds 4.5%, so 7.8%
  expected), with `returnRate` 10.
- **Hand:** real rate 1.078/1.035 − 1 = 4.1546%; annuity factor (1 − 1.041546^−30)/0.041546; year 1 **$58,920.45**.
- **Engine:** $74,840.23 (+27%), while the account grows at 7.8%.

### FLOWS-05 (P2): an expense at the end age is dropped with no warning
- `eventAmount` counts `start ≤ age < end`, and the last row ends at `endAge`. The validator is silent.
- **Repro:** a plan from 60 to 65 with a $50,000 expense at 65: spending $0 in every row, end total $1,000,000, no issue. A
  one-time income at `endAge` meets the same boundary.

### FLOWS-06 (P2): an amount stage cancels the survivor reduction
- The survivor factor is applied before `applyStage`, and an `amount` stage sets `base = value`, replacing the reduced figure.
- **Repro:** a couple both 68, self dying at 70, a 25% reduction, $80,000 `incomeFirst` spending, and a stage from 68 to 80, run
  as `amount` $80,000 and as `percent` 100%.
- **Hand:** $60,000 in the survivor rows ending 72 to 74. **Engine:** amount stage $80,000; percent stage $60,000.
- Not declared; Q65 covers only overlapping stages.

### FLOWS-07 (P3): the strategy descriptions contradict the declared income offset
- "Withdraws the selected percentage…" (`constantPercent`), "Withdraws a percentage" (`floorCeiling`), "increases the dollar
  withdrawal" (`fixedReal`); the engine treats the amount as spending offset by outside income (§3). With 4% of $1,000,000 and
  a $30,000 pension, spending is $40,000 but withdrawals are $10,880.

## 4. Declared behaviours confirmed
- §1 pro-rata tax allocation; §2 mid-year account (a retain holding gets a zero rate); §3 income offset; §5 imputed 1.5% yield;
  §7 and Q59; §18.2 dollar basis (a paid dividend leaves basis unchanged); §18.4 VPW and rmd-style horizon; §18.5 tax ledger
  (`lifetimeTaxes` = Σ `taxSettled`); §19 stage proration; S102 task 3 withdrawal-timing fudge; inflation bases (Q109); Q64 and
  Q65; the tax-on-tax gross-up; the empty-portfolio shortfall and failure ages.

## 5. Suspicions not confirmed
- `optimizedAccountScore` uses `Number(a.priority)||1`, so priority 0 ties with 1 (import-only; the UI clamps to ≥ 1).
- The `simple`-mode flexibility and Guyton signal is `returnRate/100`, ignoring the fee and the asset classes. Not measured.
- One-time amounts and fixed/none-growth amount stages are nominal at their own dates; the UI does not say so.
- `historical` and Monte Carlo paths were not reconciled here.
