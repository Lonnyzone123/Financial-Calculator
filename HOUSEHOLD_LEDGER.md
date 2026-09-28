# The household cash-flow ledger — the accounting, defined before the check

**S4 task 6.6 (S4-PA-06).** This document is the definition. It comes first on purpose, in its own commit ahead of the code: a household equation can be made to balance by defining savings or spending as whatever is left over, and the only defence is to fix the accounting before any code can be tuned to pass. `tests/lib/household-ledger.js` implements this and nothing more. **If the two disagree, this document is the authority and the code is the defect.**

## 1. Why it exists

`tests/reconciliation-invariant.test.js` (L4) asserts a **portfolio** identity: opening + contributions + employer + growth + outside deposits − dividends − withdrawals = closing. FM-03 was a **household** defect: outside income beyond spending simply ceased to exist. L4 could not see it, because cash that never enters the portfolio cannot unbalance the portfolio. Anything that is received and never used, or used and never funded, is invisible to every portfolio check. This ledger is the check for that class.

## 2. Boundary, period, currency

- **Boundary: the household's cash.** Money counts when it crosses into or out of the household's hands. Balances inside the portfolio, the other-assets balance sheet and debt balances are outside this boundary. Their own identities hold them: L4 for the portfolio, L4b for other assets, P9 for the debt ledger.
- **No stored household cash balance.** The engine keeps none: cash a household retains is deposited into a named holding account *inside* the portfolio (FM-03's repair). So opening and closing household cash are both zero by construction, and the identity is a per-period flow identity: **sources = uses**.
- **Period: one projection row.** Row *i* covers the interval from row *i−1*'s age to row *i*'s age. Row 0 is the opening snapshot and carries no flows.
- **Currency: nominal dollars, as the row reports them.** No deflation is applied.

## 3. Sign convention

Every source and every use is entered as a **non-negative amount**. `residual = sources − uses`. A positive residual means cash the household received that no use accounts for. A negative residual means cash used that no source funded.

## 4. Observable inputs

- **Row fields**, as `simulatePlan()` returns them: `income`, `dividends`, `withdrawals`, `nonPortfolioDraw`, `spending`, `shortfall`, `taxes`, `contributions`, `debtPaymentsTotal`, `debtPayments`.
- **Four values the engine computes but does not put on the row**, read through **read-only taps** on an **in-memory copy** of `src/engine.js` (`tests/lib/engine-variant.js`):
  - **employer contributions** and the **retained outside-surplus deposit**, from the flows the engine hands its own `checkRowInvariants()`;
  - **wages**, where the engine sums them;
  - **qualified charitable distribution (QCD) cash paid**, `min(qcd, rmdGross)`, the same quantity the engine's committed cash settlement uses.

  **The file on disk is never edited, so no engine byte, fixture or source hash moves (ground rule 9).** A tap only calls a hook and changes nothing, and that is **asserted rather than assumed**: every swept plan and path is also run through the real engine, and the rows must be identical. Every tap marker must occur exactly once in the source, or the variant refuses to load.

## 5. Categories — how every flow maps, so nothing counts twice

| | Category | Computed as |
|---|---|---|
| **Source** | External cash income | `income − dividends` (wages, Social Security, pension, other income received as cash) |
| **Source** | Portfolio cash paid out | `withdrawals + dividends` |
| **Source** | Non-portfolio asset proceeds | `nonPortfolioDraw` (the home-equity / other-asset fallback) |
| **Use** | Funded spending | `spending − shortfall` |
| **Use** | Taxes | `taxes` (penalties included, as the row reports them) |
| **Use** | Household cash paid into the portfolio | employee contributions (`contributions − employer`) + retained outside-surplus deposits |
| **Use** | Debt payments outside spending | `debtPaymentsTotal − debtPayments` |
| **Use** | Charitable distributions (QCD) | QCD cash paid |

How the flows that are easy to double-count are treated:

- **Sales and withdrawals.** The gross proceeds are portfolio cash paid out. **A capital gain is not cash**, and market appreciation is never a receipt; the growth term belongs to L4, never to this identity.
- **Dividends** are counted **once**, as portfolio cash paid out. The engine puts dividend cash inside `income`, so external income subtracts it. Dividend cash the household does not spend comes back to the portfolio as a household deposit.
- **Required minimum distributions** are part of gross withdrawals. The part the engine re-deposits is already netted out of `withdrawals` by the engine, so it never appears.
- **A QCD** leaves the IRA inside `withdrawals` and goes straight to charity. It is therefore also a use, and never counted as spending.
- **Withholding** is not modelled. Taxes are a single use in the period they are incurred.
- **Transfers between accounts** — Roth conversions and the `transferOn` move — stay inside the portfolio and are **not household cash**. Only the taxes they cause are a use.
- **Employer contributions** enter the portfolio from outside the household. They are **not household cash**.
- **Debt principal is a cash use and a liability reduction, not interest.** P9 splits `debtPaymentsTotal` into interest, principal and housing; this identity counts the payment **once**, as a whole. Payments a debt's `includePayment` flag puts inside retirement spending are part of funded spending, and every other payment is the separate "debt payments outside spending" use.
- **Unpaid obligations stay visible.** Spending the household could not fund is `shortfall`, and it is subtracted from spending: **it is never booked as funded**. Debt payments with no modelled source are counted as a use and then classified as unfunded (section 7). They are never balanced away.

## 6. Tolerance

`max($0.01, 1e-9 × the row's largest magnitude)`, taken over sources, uses, spending, shortfall, income and withdrawals. That is the resolution double precision can hold at that magnitude and no more. Rows whose tolerance exceeds $1 exist only at extreme generated magnitudes; they are **counted and reported as low-resolution**, not hidden.

## 7. Classes — exhaustive, and the residual is never turned into an account

Every row lands in exactly one class. **The residual is a diagnostic result, never an automatically invented cash account or savings entry.**

| Class | Condition | What it means |
|---|---|---|
| `CLOSED` | `|residual| ≤ tolerance` | Every dollar in has a use and every use has a source |
| `UNALLOCATED_WAGES` | `0 < residual ≤ wages` | Wages the engine does not allocate. **It models no pre-retirement consumption**, so wages beyond contributions, taxes and debt payments leave the model unaccounted for. A boundary of the model, stated rather than balanced |
| `UNFUNDED_CONTRIBUTION_OR_DEBT` | `0 < −residual ≤ employee contributions + debt payments outside spending` | Contributions or debt payments made with **no modelled cash source**. There is no pre-retirement household budget: a contribution can exceed wages, or occur with none, and a debt whose payments are outside spending is paid from nothing. Visible, never balanced |
| `FAIL_CASH_UNUSED` | `residual > 0`, beyond wages | Cash received that no use accounts for — **FM-03's class** |
| `FAIL_USE_UNFUNDED` | `−residual` beyond contributions and debt payments outside spending | Spending, taxes, deposits or charity funded from nowhere |

**The check passes when no row is a `FAIL`.** The two diagnostic classes are reported with counts on every sweep, because they are findings about the model, not noise.

## 8. Where it is strong, where it is weak, and what it cannot establish (6.5)

- **Strong.** A row with no wages, no employee contributions and no debt payments outside spending **must close exactly**. Nothing else is available to explain a residual there. That covers retired periods, where the household's cash flows are fully modelled.
- **Weak, and said plainly.** Working-period rows are **bounded, not conserved.** A defect smaller than the row's wages (cash unused) or smaller than its contributions plus outside-spending debt payments (use unfunded) can hide inside a diagnostic class. The faults that prove the check (section 10) are therefore placed where the bands are empty.
- **It cannot establish:**
  - that spending, taxes or contributions are the *right* amounts — only that each is funded and used;
  - the split between consumption and included debt payments when a shortfall occurs;
  - timing within a period;
  - anything on the portfolio side (L4's job) or the other-asset side (L4b's);
  - a defect that misreports a flow **and** its funding consistently, since this identity trusts the row fields and taps as reported;
  - Monte Carlo **percentile rows** (section 9).

## 9. Modes and paths

- **`simple` and `historical`:** one path, every row.
- **`monteCarlo`:** individual paths, never percentiles. The check runs `simulatePlan()` with `runPlan()`'s own per-path generators — `rng(seed + 2i)` and `rng(seed + 2i + 1)`, as `tests/reconciliation-invariant.test.js` does — on a **bounded deterministic sample: the first 50 paths of each scenario.** **Household conservation is never asserted over percentile rows**: independently selected percentiles need not describe any one household. Monte Carlo's *reported* rows therefore stay unqualified for this ledger, as they do for the debt ledger (`MODEL_ASSUMPTIONS.md` section 6, Q40). The per-path sample is what qualifies the mode's *arithmetic*.

## 10. The faults it must catch, and the one it must not

Each fault is a declared injection into the same in-memory variant. Nothing on disk changes.

| Fault | Injection | Must be caught by | While |
|---|---|---|---|
| **Drop an income receipt** | Outside-income surplus is never retained (FM-03 regressed) | the household ledger | L4 still balances |
| **Duplicate a transfer** | Other-asset proceeds credited to household cash twice | the household ledger | L4 still balances |
| **Portfolio valuation error** | Late growth never reported to the reconciler (L4's own historical proof) | L4 | the household ledger still balances |

The third row is what makes the two identities **independent**. Each is red-proved on the other's blind spot, and each control stays green.

## 11. Relation to the existing household check

`tests/audit-fm03-outside-cash.test.js` is FM-03's reproduction. Its oracle closes on `closing − (opening − withdrawals)`, so it is exact only with returns, inflation and fees at zero, which is how it is built. **It stays separate** as the audit's own reproduction of that defect. This ledger does not need that restriction, and its "drop an income receipt" fault *is* FM-03's class, regressed and caught across the corpus.

## 12. What was measured before the check was written

A design probe was run at `ac2c34b`, before any instrument existed, so that this definition describes what the arithmetic actually does. With the four taps, over the control and expanded capture corpora (Monte Carlo at 50 paths), it measured:

- **taps:** output-neutral on every scenario;
- **L4:** 0 mismatches;
- **FAIL rows:** 0;
- **counts, control (6,478 rows):** 3,559 `CLOSED`, 2,870 `UNALLOCATED_WAGES`, 49 `UNFUNDED_CONTRIBUTION_OR_DEBT`;
- **counts, expanded (10,248 rows):** 6,029 `CLOSED`, 4,170 `UNALLOCATED_WAGES`, 49 `UNFUNDED_CONTRIBUTION_OR_DEBT`;
- **faults:** all three were caught by the identity they target, while the other stayed balanced.

Before the QCD tap existed, the five QCD rows of `targeted:funded-qcd` were the only failures, each short by exactly the $5,000 distribution. That is why charitable distributions are a category of their own. **These are the probe's figures, stamped with its commit. The test reports its own on every run.**
