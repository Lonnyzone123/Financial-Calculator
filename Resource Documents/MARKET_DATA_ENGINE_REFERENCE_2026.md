# Market Data Reference

Engine-facing source, transformation, validation, and governance standard.

| Field | Value |
|---|---|
| Status | Implementation reference |
| Audience | Engineers building historical replay, Monte Carlo, cash-flow, tax, and retirement-planning features |
| Scope | Market series, economic indexes, housing, property tax, demographic benchmarks, and mortality inputs |
| Research current through | 2026-09-10 UTC |
| Related references | [ACCOUNT_RULES_ENGINE_REFERENCE_2026.md](ACCOUNT_RULES_ENGINE_REFERENCE_2026.md), [TAX_RULES_ENGINE_REFERENCE_2026.md](TAX_RULES_ENGINE_REFERENCE_2026.md) |
| Legacy input | `../archive/MARKET_DATA_REFERENCE.md`, reviewed as a starting draft; see §17 for corrections |

This document does not bundle the underlying datasets and is not investment, tax, or legal advice. It defines what the engine may ingest, how fields must be interpreted, and which shortcuts are unsafe.

## 1. Executive decisions

The current annual return table can be replaced safely only if the implementation makes these rules explicit:

1. **Use a versioned data package, not mutable constants.** Every simulation result must identify the exact dataset version, source vintage, transform version, and random seed.
2. **Prefer direct first-party data.** BLS, Treasury, FHFA, SSA, Census, and CDC should be accessed from their own sites or APIs. FRED is useful for discovery, but its current terms materially restrict scraping, storage, database use, AI-related use, and third-party copyrighted series.[^1]
3. **Never count dividends twice.** A total-return series already assumes distributions are reinvested. If dividends fund spending as cash, model price return and cash distributions separately.
4. **Do not treat a yield as a return.** Treasury bill and constant-maturity series are quoted yields. They are not automatically the holding-period total returns required by a portfolio engine.
5. **Do not treat Shiller monthly dividends as payment records.** Shiller states that post-1926 monthly dividend and earnings values are linearly interpolated from S&P four-quarter totals. The price series is a monthly average of daily closes, not a month-end close.[^2]
6. **Keep live, back-tested, reconstructed, and synthetic observations distinct.** A pre-launch index back-test is hypothetical, may benefit from hindsight, and is not equivalent to actual fund performance.[^3]
7. **Use one synchronized return matrix for correlation.** Pairwise date deletion can produce an internally inconsistent or non-positive-semidefinite covariance matrix.
8. **Benchmarks are not defaults.** Median age, household income, retirement age, and retirement balances describe populations. They must not silently overwrite user-specific assumptions.
9. **Property tax is jurisdictional.** A national effective rate is a rough fallback, not a forecast of a specific bill. Assessed value, exemptions, levies, caps, overrides, and special districts must be separate concepts.
10. **Licensing is a release gate.** Public availability does not necessarily grant redistribution or product-use rights.

### Recommended delivery sequence

| Priority | Deliverable | Exit condition |
|---|---|---|
| P0 | Versioned annual replay package | Return definitions, CPI convention, provenance, hashes, tests, and legal status are complete |
| P0 | Dividend-safe accounting | Total-return mode and cash-dividend mode cannot both credit the same distribution |
| P0 | Yield-versus-return correction | Every cash and bond input is labeled as yield, price, or total return |
| P0 | Arizona property-tax correction | The 1% constitutional limit and its exceptions are represented accurately |
| P1 | Monthly engine inputs | Common calendar, missing-data policy, corporate actions, and annual aggregation pass |
| P1 | Correlated Monte Carlo | Calibrated matrix is positive semidefinite and reproducible |
| P1 | Mortality simulation | Age-specific conditional death probabilities replace a deterministic life-expectancy cutoff |
| P2 | Valuation-conditioned scenarios | All predictors are observable at the simulated decision date and cannot leak future data |

## 2. Data architecture and contract

Keep three layers:

1. **Raw layer:** the exact downloaded artifact, immutable and hashed.
2. **Normalized layer:** parsed observations with explicit dates, units, adjustments, and provenance.
3. **Engine layer:** annual or monthly fields whose financial meaning matches the simulation.

Never edit a raw file in place. A changed upstream file creates a new source vintage, even when the provider kept the same URL or filename.

### Required metadata for every series

| Metadata | Requirement |
|---|---|
| Identity | Stable internal dataset and series IDs |
| Source | Publisher, landing page, retrieval URL, and access timestamp |
| Vintage | Source release date or retrieval date, plus an immutable content hash |
| Coverage | First and last usable observation |
| Frequency | Daily, monthly, quarterly, annual, or event |
| Timing | Period start, period end, monthly average, close, ex-date, record date, or payable date |
| Units | Decimal return, percentage return, index level, dollars per share, yield, or probability |
| Adjustment | Nominal or real; seasonally adjusted or not; split-adjusted or raw |
| Return meaning | Price return, income return, total return, or yield only |
| Distribution handling | Paid as cash, reinvested, excluded, or embedded in total return |
| Geography and population | Country, state, county, household universe, or covered population |
| Provenance class | Actual, official estimate, reconstructed, interpolated, back-tested, derived, or synthetic |
| Rights status | Approved, internal-only, citation-required, permission-required, or unresolved |
| Transform | Code version and parameter set used to create the engine field |
| Quality state | Passed, warning, quarantined, or rejected |

## 3. Approved source catalog

The term “approved” below means methodologically suitable. It does not waive a rights review.

| Engine concept | Recommended source | Engine use |
|---|---|---|
| Long-history U.S. large-cap proxy | Robert Shiller, **ie_data.xls** | Monthly price, interpolated dividend, CPI, real fields, CAPE, and long-history replay research[^2] |
| Broad U.S. equity total return | Kenneth French Data Library, market factor | Monthly broad-market return, with **market return = Rm-Rf + RF**[^4] |
| Cross-asset annual check | NYU Damodaran historical returns | Independent annual reasonableness check, not the sole production feed[^5] |
| Actual SCHD experience | Schwab Asset Management | NAV or market-price performance, distribution events, inception, expenses, and split metadata[^6] |
| General inflation | BLS **CUUR0000SA0** | CPI-U, U.S. city average, all items, not seasonally adjusted |
| Social Security COLA basis | BLS **CWUR0000SA0** plus SSA COLA rules | CPI-W monthly values and statutory third-quarter comparison[^7] |
| Medical inflation | BLS **CUUR0000SAM** | Optional medical-care price escalation, not a personal medical-cost forecast |
| Treasury bill quotes | U.S. Treasury daily bill rates or Federal Reserve H.15 | Yield observations that require an explicit return construction[^8][^9][^29] |
| Home-price appreciation | FHFA HPI purchase-only indexes | National, state, and local single-family price appreciation[^10] |
| Property-tax fallback | Census ACS-derived rates; ATTOM as a methodology check | Rough effective-rate benchmark when a real tax bill is unavailable[^11][^12] |
| Arizona taxable-value rules | Arizona Constitution and statutes | Limited Property Value growth, reset-like exceptions, and constitutional limits[^13][^14][^15] |
| Wage index | SSA National Average Wage Index | Wage-indexing scenario, not typical household income[^16] |
| Typical worker benchmark | SSA median net compensation | Context-only worker benchmark[^17] |
| Mortality | SSA actuarial life table | Conditional annual death probabilities by exact age and sex[^18] |
| Current mortality benchmark | CDC final mortality data | Context and cross-check, not a substitute for a life table[^19] |
| Household and age context | Census Bureau | Context-only median household income and population age[^20][^21] |
| Retirement timing context | EBRI Retirement Confidence Survey | Expected-versus-actual retirement assumptions and early-retirement stress cases[^22][^23] |

## 4. Equity data

### 4.1 Shiller long-history data

Use the landing page rather than a hardcoded download URL because the download target can change. Parse headers by name, not by spreadsheet column position.

Shiller describes monthly stock price, dividends, earnings, interest rates, CPI, and CAPE data beginning in January 1871. The key limitations are part of the data definition:

- Stock prices are monthly averages of daily closing prices.
- Monthly dividends and earnings from 1926 forward are computed from S&P four-quarter totals with linear interpolation.
- Pre-1926 dividends and earnings are interpolated from annual Cowles data.
- CPI-U begins in 1913; the pre-1913 price index is a splice to a different historical source.
- The workbook includes an alternative total-return construction introduced in 2018.[^2]

Consequences:

- This is a historical S&P composite proxy, not a claim that one unchanged modern investable index existed for the full period.
- Average-to-average monthly returns should not be silently joined to month-end ETF returns.
- Interpolated monthly dividends are acceptable for annual research aggregates, but not for exact dividend dates, tax lots, or intra-year cash funding.
- Pre-1913 “CPI” observations must carry a **spliced** provenance flag.

If the workbook supplies a real total-return index and CPI, nominal total return can be reconstructed up to an arbitrary scale:

~~~text
nominal_total_return_index[t]
    = real_total_return_index[t] * CPI[t] / CPI_anchor

nominal_total_return[t]
    = nominal_total_return_index[t]
      / nominal_total_return_index[t-1] - 1
~~~

The positive constant **CPI_anchor** cancels from returns. Validate the result against an independent annual total-return source before release.

Do not rebuild exact monthly total return from the interpolated annualized dividend field unless the transformation is documented and tested. If such a reconstruction is necessary, name it **estimated_total_return**, not **actual_total_return**.

### 4.2 Fama-French broad-market return

The Fama-French market factor represents the value-weighted return of eligible U.S.-incorporated common stocks on NYSE, AMEX, and Nasdaq minus a one-month Treasury bill rate. Reconstruct the market return as:

~~~text
market_total_return = (Rm_minus_Rf + RF) / 100
~~~

The published files use percentage units, so dividing by 100 is mandatory before passing values to an engine that expects decimals.[^4]

This is broader than the S&P 500. Do not label it S&P 500 return. It is useful when the engine concept is “U.S. public equity market” rather than “large-cap U.S. equity.”

Beginning with the January 2025 release, the Data Library moved from CRSP FIZ to CIZ inputs. Under FIZ, monthly returns were month-to-month holding-period returns with dividends reinvested at month-end. Under CIZ, monthly returns compound daily returns with dividends reinvested on ex-dates.[^24] Treat this as a methodology event:

- Record the chosen current or legacy series family.
- Do not splice FIZ and CIZ without a named transform and comparison report.
- Expect historical values to change when source processing or CRSP data change.
- Preserve an archive hash for every released engine package.

### 4.3 Annual cross-check

Damodaran publishes annual U.S. returns from 1928 for the S&P 500 including dividends, Treasury bills, 10-year Treasury bonds, Baa corporate bonds, real estate, and gold. The page states that multiple data services are used and that the bill measure was changed to an annual average rate because it better reflects earnings.[^5]

Use it to:

- Spot sign, scale, and year-alignment errors.
- Check cumulative wealth and annual compounding.
- Review known stress years.

Do not use it as the only production source without separately confirming provenance, rights, methodology, and the meaning of each return column.

### 4.4 Actual funds and indexes

SCHD is a useful concrete dividend-equity implementation, but it is not a century-long asset class. Schwab lists fund inception as 2011-10-20, a 0.060% expense ratio as of the research date, and an objective of tracking the Dow Jones U.S. Dividend 100 Index before fees and expenses.[^6]

Rules:

- Use actual fund NAV returns for fund experience.
- Use market-price returns only if the simulation intentionally includes market-price deviations.
- Deduct fund expenses only when they are not already reflected in the chosen return series.
- Do not append a pre-inception synthetic back-test and label the whole history “SCHD.”
- Store the fund, its benchmark index, and any synthetic extension as separate series.

S&P describes the dividend index as screening for at least 10 consecutive years of cash dividends, then applying yield, five-year dividend growth, return on equity, and free-cash-flow-to-debt measures.[^25] That methodology is informative, but it does not make pre-launch results actual or guarantee future dividend stability.

### 4.5 SCHD split and distributions

Schwab states that SCHD completed a 3-for-1 split effective 2024-10-10 and began post-split trading on 2024-10-11.[^6] Its displayed distribution history includes a 2024-09-25 distribution of $0.7545 per pre-split share and a 2024-12-11 distribution of $0.2645 per post-split share.[^6]

An engine must choose one share basis:

- **Post-split basis:** divide all pre-split per-share prices and distributions by 3.
- **Event basis:** retain raw values, triple share count on the split date, and leave total position value unchanged.

Never sum raw pre-split and post-split per-share distributions into one annual figure. Add a regression test around 2024 that fails if the split creates an artificial price loss, wealth gain, or dividend jump.

## 5. Inflation, COLA, and real values

### 5.1 CPI-U

Use BLS series **CUUR0000SA0**, CPI-U, U.S. city average, all items, not seasonally adjusted, for historical purchasing-power escalation. BLS provides direct public API access to historical time series.[^26]

BLS says CPI-U covers more than 90% of the U.S. population, is not an individualized inflation measure, excludes investment items, and is a conditional rather than complete cost-of-living measure.[^7] These limitations belong in user-facing explanations.

For a year-end engine:

~~~text
inflation_dec_to_dec[y] = CPI[December y] / CPI[December y-1] - 1
~~~

For average annual cash flows:

~~~text
inflation_annual_average[y]
    = average(CPI[months in y])
      / average(CPI[months in y-1]) - 1
~~~

Both are valid but answer different timing questions. The package must name the convention. Do not mix December-to-December inflation with annual-average income growth without an explicit timing bridge.

BLS says CPI-U and CPI-W are final when issued except for rare corrections, while seasonally adjusted CPI can be revised for up to five years. BLS also recommends unadjusted data for escalation.[^7] This supports using the not-seasonally-adjusted series in historical cash-flow replay.

### 5.2 CPI-W and Social Security COLA

Do not use CPI-U as if it were the statutory Social Security COLA series. SSA bases COLA on CPI-W:

1. Average CPI-W for July, August, and September of the current year.
2. Compare it with the third-quarter average for the last year in which a COLA became effective.
3. If positive, round the percentage increase to the nearest 0.1%.
4. If the increase is nonpositive or rounds to zero, no COLA applies.[^27]

For exact historical benefits, ingest the official SSA COLA history. For projections, either model the statutory rule from simulated monthly CPI-W or identify a simplified annual COLA assumption as synthetic.

### 5.3 Medical inflation

BLS **CUUR0000SAM** can drive a separate medical-care price scenario. It still measures an average consumer category, not insurance premiums, long-term care, an individual condition, or a specific household. A medical expense model should permit a user override and a scenario spread above or below general CPI.

### 5.4 Real-return identity

Use the exact multiplicative identity:

~~~text
real_return = (1 + nominal_return) / (1 + inflation) - 1
~~~

Subtracting inflation from nominal return is only an approximation. It is least reliable when either rate is large.

## 6. Cash and fixed income

### 6.1 Treasury bills

TreasuryDirect explains that bills mature in 4 to 52 weeks, are sold at discount or par, and pay face value at maturity.[^8] Treasury’s daily rates page distinguishes:

- **Bank discount rate:** based on par value, discount, and a 360-day year.
- **Coupon-equivalent or investment yield:** based on purchase price and a 365- or 366-day year.[^9]

For a bank-discount quote **d**, face value **F**, and actual days to maturity **n**:

~~~text
purchase_price = F * (1 - d * n / 360)
hold_to_maturity_return = F / purchase_price - 1
~~~

This return applies only when the bill is bought on the priced date and held to maturity. A monthly rolling 13-week bill strategy also needs:

- Auction or secondary-market purchase timing.
- Remaining maturity at each observation.
- Mark-to-market pricing when a bill is sold before maturity.
- Reinvestment timing and transaction assumptions.

The familiar FRED series **TB3MS** can help locate the Federal Reserve measure, but it is a monthly average secondary-market discount rate, not a total-return series.[^30] Prefer the direct Treasury or Federal Reserve release for production ingestion.

### 6.2 Notes and bonds

A constant-maturity Treasury yield such as a 10-year yield is also not a bond return. A return series must include coupon income and price change. Acceptable approaches are:

- A licensed total-return index with redistribution rights.
- A transparent synthetic constant-maturity strategy with coupon, duration, roll, and repricing rules.
- A buy-and-hold bond ladder with explicit security cash flows.

If an approximation is used:

~~~text
approx_price_return
    = -modified_duration * change_in_yield
      + 0.5 * convexity * change_in_yield^2

approx_total_return = coupon_income + approx_price_return
~~~

Label this derived approximation and validate it against a total-return benchmark. Never place a quoted yield directly in a field named **bond_return**.

### 6.3 Fixed-income source caution

Some commercial bond total-return indexes visible through public portals have short displayed histories or redistribution restrictions. A dataset is not cleared for a shipped product merely because a chart can be viewed. The rights ledger must identify the original data owner, not only the portal.

## 7. Dividends, cash funding, and DRIP

### 7.1 Economic accounting

Choose one of two mutually exclusive modes for each equity sleeve and period:

**Total-return mode**

- Apply total return to the position.
- Do not add a separate dividend cash flow.
- Suitable when all distributions are treated as reinvested.

**Price-plus-cash mode**

- Apply price return to the position.
- Credit actual or modeled distributions to cash.
- Spend, tax, or reinvest that cash according to account rules.

For a simplified end-of-period reinvestment:

~~~text
ending_value = beginning_value * (1 + price_return) + cash_distribution
~~~

If cash distribution is represented as a yield on beginning value:

~~~text
ending_value / beginning_value - 1
    = price_return + distribution_yield
~~~

That additive identity is timing-specific. With intra-period reinvestment, use event dates or a total-return index.

### 7.2 DRIP tax treatment

IRS Publication 550 says dividends used to buy additional stock remain reportable dividend income. If a plan permits purchase below fair market value, the fair market value of the acquired shares on the payment date is dividend income; service charges withheld from cash dividends are also included in dividend income.[^28]

For mutual-fund shares acquired by reinvesting distributions, the IRS states that original cost basis is the amount of the distribution used to buy each full or fractional share. For discounted DRIP stock, basis is full fair market value on the payment date.[^28]

Therefore:

- Each reinvestment purchase creates acquisition data for a new full or fractional lot.
- Quarterly reinvestment for ten years creates about 40 reinvestment lots, plus any original purchase lot.
- Taxable income is recognized even when no cash reaches the investor.
- Basis, share quantity, acquisition date, account, and source distribution event must reconcile.

Qualified-dividend status is not created by turning on DRIP. For common stock, Publication 550 generally requires holding the stock for more than 60 days during the 121-day period beginning 60 days before the ex-dividend date, with additional rules and exceptions.[^28]

Inside a traditional IRA, Roth IRA, or qualified plan, current-year dividend tax and taxable-account lot basis generally do not operate the same way as in a taxable brokerage account. Keep account tax treatment outside the market-data layer.

### 7.3 Minimum viable lot model

If full lots are too expensive for the first release, the smallest defensible taxable-account approximation is:

- Separate short-term and long-term basis pools.
- Add each reinvested distribution to basis.
- Age short-term basis into long-term status on a documented schedule.
- Prohibit claims of tax-lot optimization.

A single blended **basisPct** cannot reproduce specific identification, FIFO, holding periods, wash sales, or qualified-dividend holding tests. Label outputs accordingly.

## 8. Housing and property tax

### 8.1 Home-price appreciation is not housing total return

FHFA publishes public single-family house-price indexes back to the mid-1970s across all states and more than 400 cities. Its weighted repeat-sales method uses repeat sales or refinancings involving mortgages purchased or securitized by Fannie Mae or Freddie Mac.[^10]

The FHFA HPI is appropriate for price appreciation. It does not include:

- Rent or imputed housing service.
- Mortgage leverage or financing cost.
- Property tax, insurance, maintenance, or capital improvements.
- Buying and selling costs.
- Local property-specific quality changes.

Model those separately. Never compare an unlevered HPI appreciation rate directly with an equity total return and call both total return.

### 8.2 Effective property-tax benchmarks

Tax Foundation’s 2026 table uses 2024 American Community Survey inputs. It reports Arizona owner-occupied property tax at 0.48% of housing value and rank 47 when states are ordered from highest effective rate. Its county table reports 0.44% for Maricopa County and 0.70% for Pima County.[^11]

ATTOM reports a 2024 national average effective rate of 0.86% for single-family homes and 0.41% for Arizona. Its method uses assessor tax data and average estimated market values from an automated valuation model.[^12]

The differing Arizona estimates are not necessarily errors. They use different universes and denominators. Engine rules:

- Prefer the user’s latest actual annual bill divided by the corresponding assessed or market value.
- Next prefer a jurisdiction-specific assessor calculation.
- Use a county or state effective rate only as a disclosed fallback.
- Record the methodology and vintage with the fallback.
- Do not infer a precise household bill from a national average.

### 8.3 Arizona rules

Arizona’s ordinary Limited Property Value rule is:

~~~text
LPV[t] = min(full_cash_value[t], LPV[t-1] * 1.05)
~~~

The statute says current LPV is prior-year LPV plus 5% and cannot exceed current full cash value.[^14]

The comparable-ratio method can apply after omitted property, an objectively verifiable use change, construction or destruction worth at least 15% of full cash value, a split or consolidation, the end of senior valuation protection, or the end of another statutory valuation.[^15] An ordinary sale is not listed as an automatic trigger. Therefore, “ordinary sale does not itself reset LPV” is a statutory inference, not a universal promise about every title or property event.

The Arizona Constitution’s separate residential tax limit is often misstated. It limits the maximum ad valorem taxes collected from residential property to 1% of full cash value, but excludes bonded debt, certain improvement or special-purpose district charges, and voter-approved overrides.[^13] It is not simply a 1% tax-rate cap applied to LPV, and an actual bill can exceed 1% of full cash value because excluded charges remain.

Senior valuation protection is a separate feature. The constitutional text says it can terminate on conveyance to a nonqualifying person, after which property reverts to current full cash value.[^13]

### 8.4 Property-tax engine fields

Do not collapse these into one growth rate:

| Field | Meaning |
|---|---|
| market_value | Estimated sale value |
| full_cash_value | Jurisdictional valuation concept |
| limited_or_assessed_value | Taxable-value base before applicable assessment ratio |
| assessment_ratio | Portion of value subject to levy, if applicable |
| primary_levy | Ordinary tax rate or calculated levy |
| excluded_levies | Bonds, overrides, districts, or other exceptions |
| exemptions_and_credits | Owner, age, disability, veteran, or other relief |
| gross_tax | Tax before credits |
| net_tax | Household bill after credits |
| jurisdiction | State, county, municipality, school district, and special districts |
| law_version | Effective date and legal source set |

## 9. Demographic, income, retirement, and mortality context

These are verified context values, not automatic model defaults:

| Metric | Latest verified value at research date | Correct use |
|---|---:|---|
| U.S. median population age, 2025 | 39.4 | Population context; Census reports 39.2 for 2024 and 39.4 for 2025[^20] |
| Real median household income, 2024 | $83,730 in 2024 dollars | Household context, not an individual wage[^21] |
| SSA National Average Wage Index, 2024 | $69,846.57 | Wage indexing; it rose 4.84% from 2023[^16] |
| SSA estimated median net compensation, 2023 | $43,222.81 | Typical-worker context; latest table year differs from AWI[^17] |
| Worker expected retirement age, 2026 survey median | 65 | Scenario input or comparison[^23] |
| Retiree actual retirement age, 2026 survey median | 62 | Early-retirement scenario anchor[^23] |
| Retirees leaving earlier than planned | 46% | Stress-test rationale, not an individual probability[^23] |
| U.S. life expectancy at birth, 2024 | 79.0 total; 81.4 female; 76.5 male | Population context[^19] |
| Additional life expectancy at age 65, 2024 | 19.7 total; 20.8 female; 18.4 male | Context only; not a planning horizon cutoff[^19] |

The 2026 EBRI survey was fielded online in January 2026 with a total sample of 2,544, including a caregiver oversample. Its published fact sheet also reports that health or disability, company changes, and being able to afford earlier retirement were common, nonexclusive reasons for retiring early. It finds 74% of workers planned paid work in retirement, while 31% of retirees reported actually doing so.[^22][^23]

### 9.1 Mortality implementation

Use the SSA table’s annual conditional death probability **q[x]** at exact age **x**:

~~~text
dies_during_year = uniform_0_1 < q[age]
~~~

For two people, draw separate mortality events unless the model explicitly includes common shocks. Preserve sex-specific tables when that input is used. Offer a conservative longevity override because a population table does not capture individual health, wealth, family history, or future mortality improvement.

SSA identifies the current table as a 2023 **period** life table used in the 2026 Trustees Report. A period table applies 2023 mortality rates throughout the remaining lifetime; it is not a cohort forecast of improving future mortality.[^18]

Do not terminate a plan at “life expectancy.” Life expectancy is an average remaining duration, so a large share of people survive beyond it.

### 9.2 Retirement-balance benchmarks

The prior draft’s age-based Vanguard balance table is not approved as an engine default. Exact values were not confirmed from a primary report during this research pass, and a defined-contribution participant balance is not total household retirement wealth. If reintroduced:

- Cite the primary report and report year.
- Preserve participant universe, plan type, tenure, and median-versus-average labels.
- Do not compare it directly with household income or total net worth.
- Keep it in educational context, not default-generation logic.

## 10. Transformation specification

### 10.1 Normalized observation

Each normalized observation should contain:

~~~text
series_id
observation_date
period_start
period_end
value
unit
frequency
timing_convention
adjustment
provenance_status
source_vintage
quality_flags
~~~

The parser must reject duplicate primary keys unless the source explicitly publishes vintages and the key includes vintage.

### 10.2 Calendar alignment

1. Convert all source dates to an unambiguous ISO date.
2. Record whether a value is a month-end observation or a monthly average.
3. Join required Monte Carlo inputs on one common calendar.
4. Do not forward-fill market returns.
5. Forward-fill a policy assumption only when its contract explicitly allows it.
6. Quarantine partial current periods from released annual history.

If a monthly-average equity price is combined with month-end CPI, label the timing mismatch. Prefer internally consistent source pairs or use annual aggregation before cross-series estimation.

### 10.3 Return formulas

Price return:

~~~text
price_return[t] = adjusted_price[t] / adjusted_price[t-1] - 1
~~~

Annual return from monthly returns:

~~~text
annual_return[y] = product(1 + monthly_return[m]) - 1
                   for all 12 months m in year y
~~~

Cumulative wealth:

~~~text
wealth[T] = initial_wealth * product(1 + return[t])
~~~

All simple returns must be greater than or equal to -1. Values below -1 normally indicate a percentage-versus-decimal error, a corporate-action error, or corrupt data.

### 10.4 Canonical annual replay row

~~~text
calendar_year
us_equity_price_return
us_equity_cash_distribution_rate
us_equity_total_return
dividend_equity_price_return
dividend_equity_cash_distribution_rate
dividend_equity_total_return
cash_total_return
bond_total_return
cpi_u_inflation_dec_to_dec
cpi_w_q3_change
home_price_return
source_coverage_flags
~~~

Not every engine mode should consume every field. Total-return and price-plus-cash fields exist together for reconciliation, but the accounting layer must select exactly one treatment.

## 11. Historical replay

### 11.1 Window construction

For an annual source covering **first_year** through **last_year** and a horizon of **H** years:

~~~text
valid_start_years:
    first_year through last_year - H + 1

window:
    start_year through start_year + H - 1

number_of_windows:
    last_year - first_year - H + 2
~~~

A 55-year sequence from 1971 through 2025 contains exactly 55 annual observations.

Default policy:

- Use chronological contiguous windows.
- Do not wrap from the last year to the first.
- Do not recycle a short historical sequence to fill a longer horizon.
- If the requested horizon exceeds coverage, fail with a clear reason or switch to an explicitly selected bootstrap or Monte Carlo mode.
- Show the first and last year used in every result.

### 11.2 Replay semantics

Historical replay must preserve observed cross-asset and inflation relationships within each date. Do not independently shuffle equity, bond, cash, and CPI years. Independent shuffling destroys the scenario actually experienced.

The market-data module supplies period values. The account engine controls contribution, spending, tax, withdrawal, rebalancing, and return timing. Keep that operation order documented in one place and test it; changing data sources must not silently change cash-flow order.

### 11.3 Data-vintage rule

A run created with dataset version **v** remains reproducible even after upstream history is revised. New source data creates version **v+1**. Store:

- Package checksum.
- Source file checksums.
- Transform commit or build ID.
- Inclusion dates.
- Known methodology events.
- Test report.

## 12. Monte Carlo calibration

### 12.1 Decide what is being simulated

Do not begin with a mean and volatility. Begin with the economic field:

- Equity price return plus dividend cash.
- Equity total return with reinvestment.
- Nominal bond total return.
- Cash total return.
- Inflation index change.
- Home-price appreciation.
- Dividend growth or distribution yield.

The variables must match the accounting mode used by the engine.

### 12.2 Arithmetic, geometric, and log parameters

CAGR is useful for describing historical wealth growth:

~~~text
CAGR = (ending_wealth / beginning_wealth)^(1 / years) - 1
~~~

It is not automatically the one-period arithmetic mean required by a return generator.

For positive gross returns, log return is:

~~~text
g[t] = ln(1 + simple_return[t])
~~~

Monthly log means and covariances annualize exactly under an independent-increments assumption:

~~~text
annual_log_mean = 12 * monthly_log_mean
annual_log_covariance = 12 * monthly_log_covariance
~~~

The common rule **annual volatility = monthly volatility times sqrt(12)** is model-dependent and does not repair serial correlation or regime changes.

If a lognormal simple-return model targets arithmetic mean **m** and log volatility **s**, use:

~~~text
log_mean = ln(1 + m) - 0.5 * s^2
~~~

Never feed an arithmetic simple-return mean directly into a log-return generator.

### 12.3 Correlation and covariance

Build the matrix from synchronized observations with the same frequency and return definition. The ordinary unweighted average of off-diagonal correlations is:

~~~text
average_pairwise_correlation
    = 2 / (n * (n - 1)) * sum(correlation[i,j] for i < j)
~~~

If the UI intends a portfolio-weighted average correlation, define it separately:

~~~text
weighted_average_correlation
    = (w' * covariance * w - sum(w[i]^2 * variance[i]))
      / (2 * sum(w[i] * w[j] * stdev[i] * stdev[j] for i < j))
~~~

The denominator must be positive. The two statistics are not interchangeable, so the UI label must identify which one is shown.

Required matrix controls:

- Use one common observation set, or document a coherent missing-data estimator.
- Test symmetry and a unit diagonal for a correlation matrix.
- Test eigenvalues within numerical tolerance.
- Apply a documented shrinkage or nearest-positive-semidefinite repair if necessary.
- Store both raw and repaired matrices.
- Fail if repair materially changes the matrix beyond a declared tolerance.

### 12.4 Distribution choice

A multivariate normal on simple returns can generate returns below -100%. Safer baseline choices are:

- Correlated log returns for assets whose gross values stay positive.
- Historical block bootstrap when preserving fat tails and short-run dependence matters.
- A regime or heavy-tail model, only after it is calibrated and validated.

Inflation and interest rates may need separate processes because they can be persistent and are not well represented by independent equity-like draws.

### 12.5 Dividend consistency in Monte Carlo

Use one of these designs:

1. Simulate total return only and assume reinvestment.
2. Jointly simulate price return and cash distribution rate.
3. Simulate total return and a cash-distribution component, then solve price return so the components reconcile under the chosen timing convention.

Do not simulate total return, price return, and dividend yield independently. That overdetermines the identity and usually creates hidden double counting.

### 12.6 Reproducibility

Every result must record:

- Pseudorandom generator family and library version.
- Seed.
- Number of paths.
- Time step.
- Parameter dataset version.
- Matrix-repair method.
- Draw distribution and any truncation.
- Rebalancing and cash-flow timing.

Golden tests must reproduce selected paths bit-for-bit within a pinned runtime, or within a documented numerical tolerance across runtimes.

## 13. Valuation-conditioned scenarios

Shiller CAPE can support an optional research mode, but not a hidden adjustment to baseline returns.

Rules:

- Use only the CAPE observation available at the scenario start.
- Estimate coefficients with an expanding or training window ending no later than that date.
- Never normalize a start-date CAPE using future observations.
- Keep valuation-conditioned expected return separate from realized historical replay.
- Report the unconditioned result beside the conditioned result.
- Cap or regularize extreme forecasts.
- Version the formula, coefficients, training period, and predictor definition.

A defensible research specification might regress future multi-year real returns on a start-date earnings-yield transform. It should be described as an empirical scenario model, not a timing rule or guaranteed forecast.

## 14. Package manifest

Suggested manifest:

~~~yaml
dataset_id: market-history-us
dataset_version: 1.0.0
created_at_utc: 2026-09-10T00:00:00Z
transform_version: market-pipeline-1
frequency: annual
calendar: calendar-year
currency: USD
return_unit: decimal
inflation_convention: december-to-december
first_year: 1928
last_complete_year: 2025
source_files:
  - source_id: shiller-ie-data
    retrieved_at_utc: ...
    sha256: ...
    rights_status: unresolved
  - source_id: bls-cpi-u
    series_id: CUUR0000SA0
    retrieved_at_utc: ...
    sha256: ...
    rights_status: approved
methodology_events:
  - date: 2025-01
    series_id: ff-market
    event: CRSP FIZ-to-CIZ source transition
quality:
  status: passed
  report_sha256: ...
~~~

The actual manifest must not claim **approved** rights status until the responsible reviewer has documented that determination.

## 15. Validation and acceptance tests

### 15.1 Structural

- Required columns exist and have documented types.
- Dates are strictly ordered within a series.
- No unexplained duplicates.
- No missing month inside a complete released year.
- Partial current years are excluded from annual replay.
- Units are decimals inside the engine.
- All values are finite.

### 15.2 Financial identities

- Annual return equals the product of monthly gross returns minus 1.
- Real return satisfies the exact nominal/inflation identity.
- Reinvested total return reconciles with price and distribution components within tolerance.
- A stock split leaves total position value unchanged before market movement.
- A zero-return, zero-cash-flow portfolio keeps constant nominal value.
- A -100% simple return produces zero value and never a negative asset balance.

### 15.3 Source-specific

- Shiller price timing is labeled monthly average.
- Shiller dividend provenance is labeled interpolated.
- Pre-1913 Shiller inflation is labeled spliced.
- Fama-French percentage values are converted once, not twice.
- FIZ and CIZ observations are not silently mixed.
- SCHD’s October 2024 3-for-1 split passes price, shares, and distribution tests.
- Treasury yields cannot populate a total-return field without a transform.
- FHFA HPI is labeled appreciation, not housing total return.

### 15.4 Simulation

- Correlation matrix is symmetric and positive semidefinite within tolerance.
- Same seed and package version reproduce the same test paths.
- Historical replay never uses data after the displayed end year.
- A historical window has exactly the requested number of periods.
- Cross-asset historical rows retain common dates.
- No simple simulated return is below -100%.
- Dividend cash is credited at most once.

### 15.5 Legal and provenance

- Every output field traces to source observations and a transform.
- Every source has a rights status and reviewer.
- Permission-required data cannot enter distributable builds.
- Every package and raw source has a checksum.
- Source citations and required notices are retained.

## 16. Licensing and distribution

This section is a product-control checklist, not legal advice.

### 16.1 FRED

FRED’s current terms say third-party copyrighted series can require owner permission, prohibit unapproved scraping and extraction, prohibit storing or archiving FRED content, and prohibit using FRED services or content in connection with software or AI development.[^1] For this engine:

- Use FRED pages to discover series and understand metadata only after confirming permitted use.
- Pull government-origin series from the original agency when possible.
- Do not assume a FRED CSV URL grants redistribution or product-storage rights.
- Re-review terms before any release.

### 16.2 S&P Dow Jones Indices

S&P’s disclaimer says its content, including index data, may not be reproduced, distributed, modified, or stored in a database without prior written permission. It also defines pre-launch values as hypothetical back-tests and warns of hindsight and look-ahead concerns.[^3]

Therefore:

- Do not ship S&P index data solely because it is visible online.
- License it, substitute a cleared source, or keep it out of the distributable package.
- Label all pre-launch history.

### 16.3 Shiller, Fama-French, Schwab, and Damodaran

These sources are valuable for research and cross-checking, but public access does not by itself settle commercial redistribution:

- Shiller’s landing page does not present a clear permissive dataset license in the material reviewed.
- Fama-French returns depend on CRSP inputs and have documented methodology changes.
- Schwab fund data and S&P benchmark data have separate owners and terms.
- Damodaran describes multiple upstream data services.

Keep rights status **unresolved** until a documented review approves the intended use.

### 16.4 Government sources

Prefer direct agency data for BLS, Treasury, FHFA, SSA, Census, and CDC. Preserve attribution, source metadata, and applicable API or site terms. A government publisher still does not remove the need to check third-party components, logos, or embedded licensed material.

## 17. Corrections to the previous draft

| Previous statement or implication | Corrected treatment |
|---|---|
| Shiller monthly dividends can drive exact cash flows | They are interpolated from four-quarter totals after 1926, so they are not payment-event data |
| S&P history is one unchanged modern investable index | Treat the long series as a historical composite proxy with reconstructed portions |
| Long-run CAGR can be a default expected return | Keep historical CAGR as description only; forecast assumptions must be explicit and versioned |
| A Treasury yield can stand in for return | Derive a holding-period return or use a cleared total-return series |
| SCHD distribution history can be summed directly across 2024 | Normalize the October 2024 3-for-1 split first |
| Arizona has a 1% rate cap on LPV | The Constitution limits covered ad valorem taxes collected to 1% of full cash value and lists exceptions |
| Arizona’s 0.48% rate means “14th-most-competitive” | The cited 2026 table ranks it 47 by highest effective rate, meaning among the lower-rate states |
| Arizona LPV always follows prior LPV plus 5% | That is the ordinary rule; statutory modification, use, split, omission, and protection-ending cases can use a comparable ratio |
| Median U.S. age in 2024 was 39.1 | The cited current Census release reports 39.2 in 2024 and 39.4 in 2025 |
| Ten years of quarterly DRIP creates about 41 new lots | It creates about 40 reinvestment lots, plus the original lot if one exists |
| Vanguard age balances are ready for default logic | They are removed pending primary-source verification and are unsuitable as total-wealth defaults |

## 18. Maintenance cadence

| Source family | Review trigger |
|---|---|
| BLS CPI | Each monthly release; seal only complete periods |
| Treasury and Federal Reserve rates | Each production refresh and whenever quote methodology changes |
| Shiller | Each workbook refresh; compare headers and historical revisions |
| Fama-French | Each monthly release and every documented CRSP methodology event |
| SCHD | Each distribution, split, merger, liquidation, index, or fee event |
| FHFA HPI | Each monthly or quarterly release used by the product |
| SSA AWI and life tables | Each annual publication or Trustees Report update |
| Census, CDC, and EBRI context | Annual review; never silently update simulation defaults |
| Property-tax laws | Annual review and event-driven review after ballot, statute, or court changes |
| Rights and terms | Before release, then at least annually and whenever a provider changes terms |

For every refresh, generate a diff showing added periods, revised historical values, schema changes, methodology events, validation results, and changes to simulation outputs.

## 19. Open implementation choices

These require product decisions rather than more data gathering:

1. Is the primary equity concept large-cap U.S. equity, broad U.S. public equity, or an investable fund?
2. Are dividends always reinvested, always spent, or account-specific?
3. Is annual inflation December-to-December or annual-average?
4. Does historical replay use only the common coverage of every selected asset, or allow explicit proxy substitutions?
5. Which fixed-income strategy is being modeled: bills held to maturity, a rolling bill index, a constant-maturity bond, or a bond fund?
6. Is pre-inception dividend-equity history prohibited, or allowed only as a separately labeled synthetic research scenario?
7. Is mortality period-based, cohort-adjusted, or stress-tested with longevity multipliers?
8. Which data can be packaged for end users under the intended commercial and technical use?

No implementation should infer these choices from column names.

## Sources

[^1]: Federal Reserve Bank of St. Louis, [FRED Legal Notices, Information and Disclaimers](https://fred.stlouisfed.org/legal/), accessed 2026-09-10.

[^2]: Robert J. Shiller, [Shiller Data](https://shillerdata.com/), including the description and download link for **ie_data.xls**, accessed 2026-09-10.

[^3]: S&P Dow Jones Indices, [Legal Disclaimers](https://www.spglobal.com/spdji/en/disclaimers/), especially the content-use and back-tested-performance sections, accessed 2026-09-10.

[^4]: Kenneth R. French, [Description of Fama-French Factors](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/f-f_factors.html), accessed 2026-09-10.

[^5]: Aswath Damodaran, NYU Stern, [Historical Returns on Stocks, Bonds and Bills: 1928-2024](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html), page dated January 2026.

[^6]: Schwab Asset Management, [Schwab U.S. Dividend Equity ETF, SCHD](https://www.schwabassetmanagement.com/products/schd), including fund profile, split notice, and distributions, accessed 2026-09-10.

[^7]: U.S. Bureau of Labor Statistics, [Consumer Price Index Frequently Asked Questions](https://www.bls.gov/cpi/questions-and-answers.htm), accessed 2026-09-10.

[^8]: U.S. Treasury, TreasuryDirect, [Treasury Bills](https://www.treasurydirect.gov/marketable-securities/treasury-bills/), accessed 2026-09-10.

[^9]: U.S. Department of the Treasury, [Daily Treasury Bill Rates](https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_bill_rates), including quote-basis definitions, accessed 2026-09-10.

[^10]: Federal Housing Finance Agency, [FHFA House Price Index](https://www.fhfa.gov/data/hpi), accessed 2026-09-10.

[^11]: Tax Foundation, [Property Taxes by State and County, 2026](https://taxfoundation.org/data/all/state/property-taxes-by-state-county/), using 2024 American Community Survey data.

[^12]: ATTOM, [2024 U.S. Property Tax Analysis for Single-Family Homes](https://www.attomdata.com/news/market-trends/home-sales-prices/2024-annual-tax-report/), updated July 2025.

[^13]: Arizona Legislature, [Arizona Constitution, Article IX, Section 18](https://www.azleg.gov/const/9/18.htm), accessed 2026-09-10.

[^14]: Arizona Legislature, [A.R.S. 42-13301: Limited property value](https://www.azleg.gov/ars/42/13301.htm), accessed 2026-09-10.

[^15]: Arizona Legislature, [A.R.S. 42-13302: Modifications, omissions and changes](https://www.azleg.gov/ars/42/13302.htm), accessed 2026-09-10.

[^16]: Social Security Administration, [National Average Wage Index](https://www.ssa.gov/oact/cola/AWI.html), accessed 2026-09-10.

[^17]: Social Security Administration, [Average wages, median wages, and wage dispersion](https://www.ssa.gov/oact/cola/central.html), accessed 2026-09-10.

[^18]: Social Security Administration, [Actuarial Life Table](https://www.ssa.gov/oact/STATS/table4c6.html), 2023 period table used in the 2026 Trustees Report.

[^19]: National Center for Health Statistics, [Mortality in the United States, 2024](https://www.cdc.gov/nchs/products/databriefs/db548.htm), Data Brief 548, January 2026.

[^20]: U.S. Census Bureau, [Women Still Outnumbered Men Among the Oldest, but Gap Is Narrowing](https://www.census.gov/library/stories/2026/04/age-and-sex.html), April 2026.

[^21]: U.S. Census Bureau, [Median Income of Asian and Hispanic Households Rose From 2023 to 2024](https://www.census.gov/library/stories/2025/09/median-household-income.html), September 2025.

[^22]: Employee Benefit Research Institute, [2026 Retirement Confidence Survey](https://www.ebri.org/retirement/retirement-confidence-survey), methodology and sample description.

[^23]: Employee Benefit Research Institute and Greenwald Research, [2026 RCS Fact Sheet 2: Expectations About Retirement](https://www.ebri.org/docs/default-source/rcs/2026-rcs/rcs_26-fs-2.pdf?sfvrsn=1e29022f_3), 2026.

[^24]: Kenneth R. French, [Data Library](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html), notice describing the January 2025 CRSP FIZ-to-CIZ transition.

[^25]: S&P Dow Jones Indices, [Dow Jones U.S. Dividend 100 Index](https://www.spglobal.com/spdji/en/indices/dividends-factors/dow-jones-us-dividend-100-index/) and [15-year index review](https://www.spglobal.com/spdji/en/education/article/reflecting-on-15-years-with-15-facts-the-dow-jones-us-dividend-100-index/), accessed 2026-09-10.

[^26]: U.S. Bureau of Labor Statistics, [Public Data API: Getting Started](https://www.bls.gov/developers/home.htm), accessed 2026-09-10.

[^27]: Social Security Administration, [Latest Cost-of-Living Adjustment](https://www.ssa.gov/oact/cola/latestCOLA.html), including the statutory CPI-W formula, accessed 2026-09-10.

[^28]: Internal Revenue Service, [Publication 550, Investment Income and Expenses, 2025](https://www.irs.gov/publications/p550), sections on qualified dividends, dividends used to buy more stock, basis, and holding periods.

[^29]: Board of Governors of the Federal Reserve System, [H.15 Selected Interest Rates](https://www.federalreserve.gov/releases/h15/), accessed 2026-09-10.

[^30]: Federal Reserve Bank of St. Louis, [3-Month Treasury Bill Secondary Market Rate, Discount Basis, TB3MS](https://fred.stlouisfed.org/series/TB3MS), used here for metadata and discovery only, accessed 2026-09-10.
