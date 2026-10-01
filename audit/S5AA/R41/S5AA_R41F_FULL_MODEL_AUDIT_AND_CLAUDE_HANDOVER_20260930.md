NO-GO

# S5AA R41F — whole-model external audit and Claude handover

**Audited source:** `s5aa-r41-source` = `984197cc05706b45e60bcb39bee78ad75f9ceff4`. The current `main` at the start of this audit was `02e6715b4ce0a103adbfbb202660f8a1f6a1d6e1`; `src/`, `investment-calculator-v2c.html`, `tests/` and `tools/` have no differences from the source tag. **Environment:** Windows 11, Node `v24.17.0`. **Date:** 2026-09-30 (Arizona). This is a whole-model second pass, not a change audit of R41's end-age guard. The adjacent `S5AA_R41F_EXTERNAL_REPRO_20260930.js` uses the public `validateScenario()` and `runPlan()` routes and pins the measured figures below.

## Determination

**S5AA is NO-GO at this unchanged R41 source.** Five new, reproducible findings affect Social Security income, IRA deposits and tax, or acceptance of an invalid Social Security input. R41's earlier administrative GO established the amended E15 browser evidence and found no defect in the *R41 change*; this broader pass has found defects outside that change. The prior GO is superseded for status purposes. E15's accepted record and the A-09 exceptions remain as recorded. These findings are not yet repaired, owner-dispositioned or enumerated as accepted limitations under E1 and E12. E3 needs independent red/green witnesses for any repair; E10 needs predictions before output-changing edits. The owner still decides remedies, merge, milestone closure, tags and S5b timing. This determination does not claim that every other path is correct.

| Finding | Priority | Household effect in the witness |
|---|---|---|
| R41F-01 — worker earnings test leaves an auxiliary benefit payable | P1 | Income overstated by **$18,000** in a full year; the condition repeats before the worker's FRA. |
| R41F-02 — survivor cap omits deceased worker's credited withholding months | P2 | Survivor income understated by **$6,300/year** after death. |
| R41F-03 — spousal IRA eligibility ends when the contributor's own work ends midyear | P2 | IRA underfunded **$3,750**; modeled tax overstated **$543.75** in this one year. |
| R41F-04 — Roth phaseout uses annual salary when the worker earns it for half a year | P2 | Eligible Roth deposit of **$7,500** is rejected or redirected. |
| R41F-05 — malformed entered Social Security benefit silently becomes zero | P2 | A valid **$30,000/year** income stream disappears with `status: ok`. |

## Reproduction and findings

Run `node audit/S5AA/R41/S5AA_R41F_EXTERNAL_REPRO_20260930.js` from the repository root. All five cases validate and return `status: ok` at the audited source. The script asserts the measured values; the expectations below are independently derived from the inputs and cited rules. Each witness has zero return, inflation, spending and COLA except where noted. The plan builder uses the app's parsed default plan, then overrides the named fields; the script is the exact input record.

### R41F-01 (P1): worker excess earnings must reach benefits on the worker's record

**Source:** `src/engine.js:3203-3209` computes the worker's earnings-test withholding against `selfGross` and the spouse's test independently against `spouseGross`; `ssEarningsTestWithholding()` at `:2087-2098` caps the worker's withholding at the worker's own benefit. The spouse's auxiliary benefit on that worker's record is not in this cap.

**Witness:** married; worker age 62, spouse 67, worker salary $200,000, worker PIA $3,000/month claimed at 62, spouse PIA $0 and spousal claim 67, no COLA. Row ending at worker age 63 has $200,000 wages. The worker's reduced benefit is $2,100/month = $25,200/year; the spouse's unreduced auxiliary benefit is $1,500/month = $18,000/year. The 2026 lower exempt amount is $24,480, making the worker's excess `(200,000 - 24,480) / 2 = $87,760`. This exceeds the **$43,200 total family benefit**. [SSA's charging rule](https://secure.ssa.gov/apps10/poms.nsf/links/0302501095) expressly applies the number holder's excess earnings to the worker **and auxiliaries** on the worker's record; [SSA's 2026 amounts](https://www.ssa.gov/oact/cola/rtea.html) establish the threshold and $1-for-$2 rate. **Expected row income: $200,000. Actual: $218,000.** The model withholds only the worker's $25,200 and leaves $18,000 auxiliary cash. Later taxes, spending funding and portfolio figures can move with the phantom income. This is a joint-record auxiliary case, not the disclosed annual-row approximation or the separate test of an auxiliary's own earnings.

**Proposed repair:** allocate the worker's excess to all benefits payable on that worker's record, then apply any auxiliary's own earnings test to its remainder. Record credited withholding months per person under SSA's adjustment rules. Add an independent family-benefit witness and a control where only the auxiliary works.

### R41F-02 (P2): survivor cap ignores the deceased worker's ARF

**Source:** `src/engine.js:3119-3125` correctly passes `ssCreditedMonths` into the living worker's `ssClaimFactor()`, but `ssSurvivorMonthly()` at `:2140` calls `ssClaimFactor(p,deceased)` without those months when setting the reduced-retirement-benefit limit. `ssCreditedMonths` is accumulated at `:4346`.

**Witness:** the same plan, with worker death at age 67.5 and an older surviving spouse. The worker's early-claim months from 62 to FRA 67 were withheld, so the living worker's adjustment of the reduction factor restores the $3,000/month PIA at FRA. A control changing only the worker's life to 120 yields $54,000 family income at age 69: $36,000 worker plus $18,000 spouse auxiliary. The spouse is beyond survivor FRA. [SSA's RIB-LIM rule](https://secure.ssa.gov/poms.nsf/lnx/0300615320) uses the greater of 82.5% of the deceased's PIA or the retirement benefit the deceased would have received after the ARF; [SSA's deceased-worker ARF rule](https://secure.ssa.gov/poms.nsf/lnx/0300615598) credits deduction months while the worker was alive. **Expected survivor row income at age 69: $36,000/year. Actual: $29,700/year** (`82.5% × $3,000 × 12`). The survivor's yearly cash flow is understated by $6,300 for the remaining modeled years. The general `SURVIVOR_BENEFIT_APPROXIMATED` warning covers remarriage, disability and children; it does not disclose dropping the worker's earned ARF months.

**Proposed repair:** carry the deceased worker's credited months into the survivor RIB-LIM calculation, with the correct effective month, including the before-FRA-death rule. Test both living-worker and deceased-worker paths on the same withholding history and a no-withholding control. R41F-01's family withholding change may alter auxiliary credits, so predict and test these together.

### R41F-03 (P2): a full-year spousal IRA contribution is cut to the contributor's own half-year of work

**Source:** `src/engine.js:89-100` sets `selfIra` to `self` whenever `self > 0`, and only falls back to spouse work when `self === 0`; `:3716` multiplies the allowed IRA dollars by that duration. It never credits the spouse-funded remainder after the self's work ends inside the row.

**Witness:** joint return, self age 45 and spouse 44, normal retirement age 45.5, contribution stop 55, self annual salary $10,000 earned for half the row ($5,000), spouse salary $100,000 earned for the full row, planned self traditional IRA contribution $7,500. The row ending at age 46 is a **full tax year**, with $105,000 household compensation. [IRS spousal IRA guidance](https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-ira-contribution-limits) allows a joint filer with little or no own compensation to use the couple's combined compensation; the [2026 IRA limit is $7,500](https://www.irs.gov/irb/2025-49_IRB). **Expected IRA deposit: $7,500; actual: $3,750.** Expected federal AGI is `$105,000 - $7,500 = $97,500`; actual is `$101,250`. Under the model's 2026 federal/AZ/payroll rules, expected total taxes are **$17,005**, actual **$17,548.75**. The $543.75 difference is $450 federal at the 12% marginal rate plus $93.75 Arizona at the model's 2.5% rate. This is not the disclosed convention for an incomplete first or last row; the spouse works the uncredited half of a full row.

**Proposed repair:** compute each IRA owner's contribution window as the union of their own work and any eligible spouse work over the row, bounded by the owner's life, stop age and joint-return period. Keep dollar limits and compensation checks separate from duration. Test reciprocal owner ages and the case where both stop halfway.

### R41F-04 (P2): Roth IRA phaseout compares annual-rate salary to half-year wages

**Source:** `src/engine.js:44-45` builds the declared salary-only MAGI proxy from `salary + spouseSalary`. The projection at `:3705-3706` computes actual wages as each rate multiplied by that owner's work duration, but passes unprorated salary rates into `auditContributions()` at `:166`. The Roth phaseout therefore reads a different year's income from the row's modeled federal AGI.

**Witness:** joint return; self age 44, spouse 45; common retirement age 45.5; self salary $0, spouse annual salary rate $260,000 but spouse works only half of this **full self row**; self Roth IRA request $7,500. Actual wages and AGI are **$130,000**, well below the [IRS 2026 joint Roth phaseout of $242,000–$252,000](https://www.irs.gov/irb/2025-49_IRB). Under the calculator's disclosed *salary-only* proxy, the correct proxy is $130,000. **Expected Roth deposit: $7,500; actual: $0** with a Roth-only account, because the proxy reads $260,000. A taxable account can instead receive a redirected $7,500, which still leaves the Roth balance short. The R40 unrepaired list named the “Roth MAGI proxy's partial row” as an **unconfirmed suspicion not examined**; this witness confirms the duration mismatch in a full row with a spouse retiring halfway. The salary-only MAGI approximation itself remains disclosed and is not challenged here.

**Proposed repair:** feed actual modeled row wages into the Roth proxy, preserving the documented salary-only exclusion of other income, and test partial employment in a full row, both owner directions, phaseout boundary values and redirect/warn policy.

### R41F-05 (P2): a nonnumeric Social Security amount is accepted as a zero benefit

**Source:** `src/scenario-validator.js:517-610` checks claim ages and several retirement scalars but does not type-check `retirement.ssBenefit` or `spouseSS`. The engine's numeric input refusal list at `src/engine.js:1230-1240` also omits them. `ssPiaBase()` at `:2113-2115` turns `Number('abc') || 0` into zero. The app's Restore backup validates the normalized scenario at `src/app-shell.html:868-886`, then its form reader at `:534` uses the numeric fallback zero.

**Witness:** single, age 66 through 68, claim 67, monthly entered benefit $2,500, no COLA, other income, spending or return. The valid input yields **$30,000** income in the age-68 row. Replacing just `retirement.ssBenefit` with the string `"abc"` leaves `validateScenario().valid === true`; `runPlan()` returns `status: ok`, no field error and **$0** income. In a separate app Restore backup check, this malformed field was accepted and subsequently stored as zero. A typo or malformed imported backup can silently erase an important income stream and materially change the plan. This is distinct from a deliberately absent benefit (`0`).

**Proposed repair:** type-check the present SS benefit fields in both validator and engine input gate; reject malformed raw backup values before normalization can erase them. Mirror the existing numeric-field parity test and add a Restore backup witness. Preserve the intended treatment of a missing field in a legacy backup.

## Breadth checks and limits

| Area | Check performed and result at this source |
|---|---|
| Gate and build routes | `npm test`: **GATE PASSED**, 421 files, 3,152 tests, 3,143 pass, zero fail/skip, nine authorized todos. Passing tests did not include these five witnesses. |
| Federal tax, Arizona and health | Independent 13,815-case federal reference sweep showed zero mismatches in its tested bracket/deduction/gain combinations; focused tax/health checks passed. Hand case with ordinary income, gains, qualified dividends and Social Security reproduced the federal, NIIT and Arizona totals. Prior R40/R41 disclosures for partial-row tax, Part D premium proxy and later-year indexing remain limits; no new finding from the cases examined. |
| Core flows and life events | Fresh R40 conservation grid: `node audit/S5AA/R40/S5AA_R40_CONSERVATION_GRID/grid.js 2000 20261001`: **2,000 valid plans, 41,080 rows, zero failures or unrecorded money leaks**, 14 disclosed `WAGE_TAX_CLAMP` flags. Death, ownership, RMD, dividend, conversion, spending and debt paths were in the generated mix. An identity can pass when a flow is omitted on both sides. |
| Debt, simulation, worker | Closed-form $100,000 mortgage at 6% APR, $1,000/month matched $93,832.2188 closing balance and $5,832.2188 interest. Zero-volatility, 50-run Monte Carlo matched the simple run's $778,684.6287743205 final balance and 100% success; seeded repeats matched. I reviewed the R41 static Worker wiring and accepted E15 record but did not rerun the desktop browser exercise: browser control could not initialize on this host (`apply deny-read ACLs`). E15's earlier SHA-bound evidence remains the record. |

These checks are bounded samples and invariants, not a certification of the whole model or every 2026 figure. The five findings came from deliberately constructed cross-feature cases outside the gate's current witnesses. The model's already disclosed limitations in `S5AA_R40_UNREPAIRED_LIST_20260930.md` and the R41 handover are not reopened by this report unless a finding expressly says why its case differs.

## Handover

Claude should reproduce all five cases at `984197cc05706b45e60bcb39bee78ad75f9ceff4`, record independently justified expected outputs and unaffected controls **before** editing source, then implement only the owner's chosen remedies. The Social Security findings share withholding history and should be assessed together; the IRA findings share work-duration inputs. Re-run the full Windows gate, the named witnesses, the control/expanded corpus comparison and the final-source browser check if the built app or exercised behavior changes. Record predicted versus actual movement and disclose any owner-accepted residual limit. A green gate alone cannot clear this NO-GO.
