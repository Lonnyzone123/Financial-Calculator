# DEBT-MC-CONTRACT — auditor's report (saved by the coordinating session; the auditor could not write .md files)

Debt modules, Monte Carlo and historical runs, validator versus engine, the app's Worker, and the result contract, frozen `main`
at `2b2d5f2`. The repro scripts are in this folder; each runs as `node <script>`. The two Worker scripts need
`node --expose-internals`, which loads Node's bundled acorn. All were rerun before the report.

**Scope:**
- About 290 `runPlan`/`runScenario` runs, plus 21,400 single paths through `simulatePlan`.
- **The Worker, part (d): no gaps.**
  - Static analysis of the 179 listed functions, against the 11 constants and 5 debt namespaces the Worker receives, found
    nothing missing. A control run shows the analysis catches removals.
  - Worker output matched the main thread on all 48 plans.
  - A deep-frozen RULES changed nothing.
- **Result contract:** matches every emitted key across 40 plans; the repo's checker reported 0 violations.

## Findings
| ID | Sev | Claim | $ impact |
|---|---|---|---|
| DMC-01 | P1 (by the rubric; only direct engine callers reach it) | `runPlan()` throws an uncaught `RangeError` on a validator-valid plan: an adjustable debt with a reset age and no `payoffAge` | No result |
| DMC-02 | P2 | An adjustable debt with no `resetRate` becomes 0% interest after its reset, with no warning (`null` or a string is refused) | $17,672.56 of year-2 interest becomes $0 |
| DMC-03 | P2 | Monte Carlo guidance pairs the median age among failing paths with the median row's shortfall: a plan with 51.9% success is told it is "short by about $0" and offered a 1% cut | Wrong warning |
| DMC-04 | P2 | Monte Carlo treats `returnRate` as an arithmetic mean; simple mode compounds it, and the "Standard · 10%" preset equals the history's geometric mean (10.02%). Not declared | 30-year median $11.47M vs $17.45M simple (65.7%) |
| DMC-05 | P2 | Mortgage property tax, insurance and HOA stay at their entered nominal amount forever while spending is inflated. Not declared | $55,004 less over 25 years (3% inflation, $4,800 a year) |
| DMC-06 | P3 | Four mortgage inputs change nothing and are not in §9's declared list: `mortgageType` (including "Interest-only"), `originalAmount`, `propertyValue`, `loanTermYears` | None |
| DMC-07 | P3 | Validator gaps (below) | Edge |
| DMC-08 | P3 | A fractional year draws a full annual return and compounds `(1+R)^t`, so its spread scales with t instead of √t | Half-year q90/q10: 1.244 vs 1.373 |
| DMC-09 | P3 | The [−95%, +200%] return clamp raises the mean at 80% volatility (the UI maximum) | 13.8% realised vs 10% entered |
| DMC-10 | P3 | Stale text in FEATURES.md, `result-contract.json`, RESULT_CONTRACT.md and the revolving-debt disclosure (below) | Text only |
| DMC-11 | P3 | `stableStringify` hashes keys whose value is `undefined`, so `inputHash` changes after a JSON round trip | Provenance only |

**DMC-07, the validator gaps:**
- `runs: 20000` on a simple plan is accepted, then refused by the engine.
- `historyStart` 2030 silently replays from 1928.
- A non-number `inflation` or `fee` passes, then fails under unrelated error codes.
- Negative extra principal and a text PMI silently become $0.
- A negative asset-class volatility gets no warning.

**DMC-10, the stale texts:**
- FEATURES.md still says ARM recast is "default off", and that the Worker's debt list is hand-maintained with `DebtRevolving`
  unbound.
- The revolving-debt disclosure says 2% for every card, but the engine uses a card's own minimum (5% in the D11 repro).
- `result-contract.json` S-CSV says 21 columns; there are 26.
- RESULT_CONTRACT.md lists 21 Monte Carlo row fields, missing the five version-3 fields.

## Per finding
**DMC-01.**
- **Repro:** `validator-probe.js` V3. A $300,000 mortgage, `rateType` adjustable, `nextRateResetAge` 61, `resetRate` 8,
  `payoffAge` deleted.
- **Validator:** `valid: true`; `payoffAge` is optional.
- **Engine:** in `projectDebts`, the recast term `Math.max(1, Math.round((d.payoffAge - monthAge) * 12))` is NaN.
  `monthlyPayment(balance, rate, NaN)` then hits `normalizeTerm`, which throws "requires a finite term in months, got NaN".
- **Why it's a finding:** RESULT_CONTRACT §3 and Q100 promise the invalid-result shape on every public path.
- **Reach:** the app's `normalizeDebt()` fills `payoffAge: 75` on load and import, so the UI never hits it. Direct callers and
  corpus generators do; in the Worker it becomes `{error}`, and the main-thread fallback then rejects.

**DMC-02.**
- **Repro:** `debt-probe.js` D10 and `validator-probe.js` V4. $300,000 at 6%, paying $1,798.65, resets at 61, no `resetRate`.
- **Hand, keeping 6%:** B12 = 300000·1.005^12 − 1798.65·(1.005^12 − 1)/0.005 = $296,315.96; the next 12 months' interest
  Σ Bₘ·0.005 = $17,672.56.
- **Engine:** `debtInterest` is 0 in years 2 and 3. `Number(undefined)` gives NaN, and `NaN || 0` makes the rate 0%.
- **Why it's a finding:** Q94 records `resetRate` undefined only together with no reset age.

**DMC-03.**
- **Repro:** `mc-probe.js` M5. $1M, 6% return, 18.5% volatility, $60,000 fixed spending, ages 60–90, 1,000 runs, seed 5.
- **Result:** success 51.9%, first shortfall age 79, sustained failure 80, and a median-row shortfall of $0 at both ages.
- **UI code:** `app-shell.html` L935 prints `money(confirmedRow.shortfall)`; L936 computes
  `cut = clamp(shortfall/spending*100, 1, 50)`, which gives 1%.
- **Hand:** every failing path has a shortfall above $0.01 at its first shortfall age (T-SHORTFALL), so the amount quoted must
  be positive. The $0 only reflects that more than half the paths are still funded at that age.

**DMC-04.**
- **Repro:** `mc-probe.js` M1, M1b, M1c, M1d. $1M, no flows, 30 years, the defaults of 10% and 18.5%.
- **Hand:** E[ln(1+R)] = 0.08049 by Simpson quadrature, giving a median CAGR of 8.38% and a median ending of $11.19M; the mean
  ending is 1.1^30 × $1M = $17.45M.
- **Engine:** Monte Carlo median $11.465M (CAGR 8.47%, within sampling error); the mean of 400 paths is 1.009 × the hand mean;
  simple mode is exact; historical replay from 1928 equals the product of the series.
- **History, 1928–2025:** geometric mean 10.02%, arithmetic 11.85%, standard deviation 19.4% (MARKET_DATA reference §12.2).
  Nothing declares which mean `returnRate` is.

**DMC-05.**
- **Repro:** `housing-probe.js`. `debtHousing` is $4,800 in every row, $120,000 over the plan.
- **Hand, indexed like spending:** Σ 4800·1.03^k for k = 0..24 = $175,004.47; at 85 that is $9,757.41 a year.
- No document says housing costs stay nominal.

**DMC-06.** `declared-probe.js`: results are byte-identical for each variant, while the control (rate 7%) moves them. The engine
never reads these fields (grep count 0). `remainingTermYears` also changes nothing in the engine; in the UI it only rewrites
`payoffAge`.

**DMC-07, 08, 09, 11.** Repros are `validator-probe.js`, `mc-probe.js` M2, `mc-clamp-probe.js` and `hash-probe.js`.
- **DMC-08 hand:** exp(2·1.28155·0.17488·√0.5) = 1.373. The engine's own rule would give 1.251; it returned 1.244.
- **DMC-09 hand:** μ + σ[φ(a) + aΦ(a)] − σ[φ(b) − b(1−Φ(b))] = 13.31%. The engine returned 13.77% (standard error about 0.57
  points).

## Declared behaviours confirmed
- **Amortization:** closed form to 1e-9 (D1: $296,315.96 balance, $17,899.78 interest).
- **Payments:** the final payment is exact, extra principal works, and payments leave the portfolio.
- **Payoff month (§19):** confirmed.
- **ARM recast (Q94):** $1,432.25 becomes $2,159.76 at the reset.
- **`debt-arm.js` caps:** 2/2/5, correct in both directions.
- **Revolving (Q110):** exact.
- **§6 negative principal:** −$6,167.78.
- **§9 inert fields:** confirmed.
- **§20 PMI while owed:** $600.
- **Payoff before the plan starts:** as documented.
- **Q113, PMI never cancels:** confirmed at 41% loan-to-value.
  - New angle: 12 USC 4902(c) ends PMI at "the midpoint of the amortization period", with no property value needed.
  - The 78%/80% thresholds in 4901 use "original value", which the schema does not hold.
- **Q102, Q112, §18.6 and P4:** confirmed.
- **Monte Carlo checks:**
  - success rate and quantiles match hand figures on synthetic cases;
  - seed determinism holds;
  - the heat map matches `runPlan` on 24/24 cells;
  - cyrb53 matches an independent implementation.

## Suspicions not confirmed
- `debt-payoff-strategy.js` (excluded): the leftover minimum in a debt's final month is not added to the payoff pool.
- `debt-refinance.js`: net position ignores the time value of money.
- A first row of 0.7 years counts as 8 payments, while housing costs use the exact 0.7.
