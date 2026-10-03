# S5AA — 50-scenario math and output audit, 2026-10-02

**Result:** no discrepancy found in the tested cases. This is a bounded simulation audit, not a new release or household-reliance qualification and not a change to the R44.1 administrative GO determination.

**Audited executable source:** `s5aa-r44-source` = `06e551e3feb46d15cc3eff6dfc10f5e1f84e6460`. **Current main records head at the start of this check:** `c05208ccf6bbc84a16c114d4abccbcef06005801` (the merge of external R44.1 PR #51). I verified no difference between the source tag and this checkout in `src/`, `tests/`, `tools/` or the built HTML. Review environment: Windows 11 Pro, Node 24.17.0. This pull request contains only this report and its adjacent read-only reproduction script.

## Two reproducible batches of 50

### 1. Varied-plan conservation sweep

Command: `node audit/S5AA/R40/S5AA_R40_CONSERVATION_GRID/grid.js 50 20261002`.

All **50** generated plans validated and ran `ok`; **1,097** projected rows were checked. The sweep compared portfolio, household-cash and combined-balance equations row by row, and also checked top-level sums, class totals, real totals, net worth and failure-age outputs for all 50 plans. It found **0 failures** and no residual over its per-row tolerance. Maximum absolute residuals were **$7.57 × 10⁻¹⁰** for portfolio/combined and **$5.24 × 10⁻¹⁰** for household cash. The plans included 29 couples, 36 with RMDs, 26 with dividends, 17 with health costs, 11 with long-term care, 13 with debts and 7 with Roth conversions; all nine spending strategies appeared. These categories overlap.

The conservation check uses read-only taps of the engine's internal flow amounts and verifies the tapped variant produces identical public rows. It detects lost or invented money relative to those recorded flows. It is **not** an independent oracle for the legality or amount of each tax, dividend, health bill or debt payment.

### 2. Independent closed-form math checks

Command: `node audit/S5AA/R44.1/S5AA_R44_1_MATH50_REPRO_20261002.js`.

The adjacent script built **50** distinct valid plans through `validateScenario()` and public `runPlan()`, in five families of 10. It checked **140** projected rows against formulas stated in the script. All 50 passed; maximum absolute balance difference was **$1.75 × 10⁻¹⁰**, with **zero** tax and RMD differences to the precision reported.

| Family | Independent expectation | Result |
|---|---|---|
| Roth-only spending | With zero return and other income, balance after year `n` is opening Roth balance minus `n × spending`; each draw equals spending and tax is zero. | 10/10 passed. Example: $100,000 less three $5,000 draws = **$85,000**. |
| Compound growth | With no cash flows, balance after `n` years is `opening × (1 + annual return)^n`. | 10/10 passed. Example: $200,000 at 5% for four years = **$243,101.25**. |
| Planned taxable deposits | With zero return, income, spending and tax, balance is opening plus `n × annual deposit`. The deposit is an external funding source in these isolated plans. | 10/10 passed. Example: $20,000 plus five $1,000 deposits = **$25,000**. |
| Single-filer pension tax | Pension is the sole income, at age 60, with cash held at zero return. Federal ordinary tax is computed from the 2026 single brackets and $16,100 deduction in [IRS Rev. Proc. 2025-32](https://www.irs.gov/irb/2025-45_IRB). Arizona uses the model's disclosed inferred $16,100 state deduction and the [2.5% rate](https://azdor.gov/individuals/withholding-tax-individual). | 10/10 passed. At $80,000 pension, federal tax **$8,770**, modeled Arizona tax **$1,597.50**, total **$10,367.50**, AGI **$80,000**, and ending cash **$169,632.50** from $100,000 opening cash. The state deduction is a model assumption pending the final 2026 form; this checks its arithmetic, not final state-law qualification. |
| Age-73 IRA RMD | A single owner's obligation is the opening IRA balance divided by **26.5**, the [IRS Publication 590-B Uniform Lifetime Table](https://www.irs.gov/publications/p590b) divisor. With no return or spending and RMD below the deduction, that amount leaves the IRA and appears in taxable cash; total balance and taxes remain unchanged. | 10/10 passed. Example: $95,000 ÷ 26.5 = **$3,584.90566** moved, with no unmet RMD. |

## Interpretation and limits

These 100 executions provide two kinds of evidence: varied accounting reconciliation across 1,097 rows, and independent expected values in 50 isolated plans. **No new finding** was observed at the audited commit. The closed-form plans deliberately remove interacting features to make the expected figures unambiguous. They do not independently certify Social Security taxation, capital-gain stacking, NIIT, tax gross-up, dividend basis, HSA rules, debt amortization, historical paths or Monte Carlo quantiles. Some of those features occur in the varied sweep, where only their accounting treatment and output consistency were checked. The previously disclosed model limits and S5b carry remain unchanged.

**Handover to the owner and Claude:** the two commands above reproduce the measured evidence. No source repair is requested from this check. Keep the status distinction: the prior R44.1 GO is administrative, and these passing scenarios do not make the outputs household reference values.
