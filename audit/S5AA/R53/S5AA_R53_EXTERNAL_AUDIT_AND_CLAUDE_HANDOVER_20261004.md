NO-GO — S5AA overall at `s5aa-r53-source`, `2a1f5bac6b5a458deb79d5b68fd044a14722f561`. R51F-01, R52-01 and the original R52-02 reproduction are repaired. One P2 finding, R53-01, remains in the broader restored-value repair: editing current age silently changes an untouched historical retirement age. This is the administrative determination under E1–E18 and A-01–A-11; it does not qualify release or household reliance.

# R53 external audit and handover

Independent review, 2026-10-04. The owner's full-model request remains the scope: sequential examination of the R53 repairs, carried full-model probes, earlier financial boundary simulations, 20 new focused simulations, independent monthly oracles, conservation and actual browser routing and input checks. Production source, existing tests, decision records and baselines were examined read-only. This report and its companion are the only proposed repository additions.

## 1. Pins and review order

| Item | Exact revision |
|---|---|
| Financial base / merged R52 audit | `cbce0ce98c28b24c55c4c5421cfabfba0ec89776` |
| Prospective prediction | `89a49f8744a0703269e8a3946a733fe626823ee9` |
| Item 1, monthly earnings test | `ff0237825dbe8c834c71a02e75e4f33cbc503290` |
| Item 2, restored fields | `87bddbae1baf97e61a7ed73b81c51caf88a059c9` |
| Item 3, new refusal | `fc2ee8063a2c486c702b7611773765954bb5d090` |
| Gate adaptation corrections | `6fc75a5dbc56c571e21a2868e1bf85bb615d890c` |
| Audited source, peeled annotated tag | `2a1f5bac6b5a458deb79d5b68fd044a14722f561` |
| Source PR #71 records head | `7453e9bcfdeae34d583c3b1578b10b62e3a6df94` |
| Main frozen for this report branch | `b446b1d7e5fb05873234277ac0fce9129664096e` |

The tag object itself is `679f2019c06abcc003d0edf46dd7e563707a491f`; peeling it resolves the cover note's `2a1f5ba`. There is no tag mismatch. Source, tests, tools and shipped HTML at the source pin and frozen main have no diff. Records added after the source pin were read from main: cover note, change handover, build report, prediction record, adapter check and relay to eb. CONTRIBUTING, AI review instructions, working rules and the amended checklist govern the review.

## 2. New finding

### R53-01 — P2: editing current age changes an untouched retirement date while still showing the old date

**Evidence and commit.** At `2a1f5bac6b5a458deb79d5b68fd044a14722f561`, restore a valid already-retired household with current age 70, retirement age 65 and end age 71. R53 initially keeps retirement age 65. Edit only current age to 70.3 and leave that field; normal form precision makes current age 70.5. The app then saves and posts retirement age **70.5**, although the retirement input still shows **65.0**. This reproduces through the actual Restore backup input in both fresh-build jsdom and Chrome 154's background Worker path. The intended plan, with age 70.5 and retirement age 65, also validates and projects normally.

**Affected code.** `src/app-shell.html:568`, `readStatic()`: the retirement clamp runs when **either** `v2-age` or `v2-retire` was edited:

```js
if (!untouched("v2-age") || !untouched("v2-retire"))
  p.profile.retireAge = Math.max(p.profile.age, p.profile.retireAge);
```

The kept retirement value is correctly read immediately before this statement, then overwritten by it. The same line's end-age clamp can also overwrite a kept end age after related edits. This finding's measured financial effect is the retirement-date overwrite. `src/engine.js:4599` uses `age - profile.retireAge` for the pension's accumulated COLA, so changing this historical date changes current income.

**Runnable reproduction and independent expected/actual.** Run the companion from the repository root, using a checkout of the source pin as `<source-root>`:

```powershell
node audit/S5AA/R53/S5AA_R53_CHATGPT_FOCUSED_SIMULATIONS_20261004.js <source-root> <output.json>
```

Its `hunt` section is this reproduction, separate from the 20 promised cases. A single household has a $100,000 qualified Roth IRA, a $10,000 annual pension with 10% COLA from retirement at 65, zero salary, spending, returns, inflation, dividends and fees. Restore, then edit only current age as described. For the remaining half-year [70.5, 71):

`pension = 10,000 × 1.10^(70.5 − 65) × 0.5 = 8,445.585690332558`.

Both income amounts are below the modeled income-tax deductions; settled tax is zero. The pension is retained as cash, so closing wealth is the opening Roth plus pension.

| Figure | Expected | Actual |
|---|---:|---:|
| Current age after explicit edit | 70.5 | 70.5 |
| Untouched saved/posted retirement age | 65 | 70.5 |
| Retirement age still shown by form | 65.0 | 65.0 |
| Pension in the half-year | $8,445.585690 | $5,000 |
| Closing portfolio and net worth | $108,445.585690 | $105,000 |
| Settled tax | $0 | $0 |

**Consequence and reach.** This case understates income and closing wealth by **$3,445.585690**, while the displayed retirement date agrees with the user's original entry. It reaches restored already-retired plans whose retirement age precedes current age, when current age is subsequently edited; other retirement-date consumers can also move. No direct engine corpus member is exposed to the edit route. The 71-entry engine capture does not exercise it, and ordinary import parity does not detect it. At the R52 base, retirement already becomes 70 during initial restore, then 70.5 after the edit. This is a residual failure of R53's new preservation contract, not a new engine regression.

**Proposed repair / owner decision.** Preserve a valid untouched historical retirement age during a current-age edit. Apply the retirement field's entry clamp when that field is edited. Handle an actual invalid relationship explicitly under the adopted refusal rule, or obtain an owner decision permitting a clearly displayed dependent-field adjustment. Add the above restore → age-only edit witness with expected retirement 65, pension $8,445.585690 and wealth $108,445.585690; compare displayed, saved and posted values. The current plan is valid, so no dependent correction is needed in this reproduction.

The build report describes the dependency predicate, but the owner decision, cover note and relay promise that a field changes only when that field is edited. D2 lists other range clamps and unsupported restore values; it does not exempt the two age clamps specifically included in the repair. This finding is an inconsistency with the adopted policy, rather than a reclassification of D2's disclosed limitations.

## 3. Dispositions, audited sequentially

| Finding / item | Independent result | Disposition |
|---|---|---|
| R51F-01, grace-year monthly earnings | F01–F03 each $10,800; F02 settled tax $5,546.10 and closing portfolio $119,271.40 | **Closed by R53 repair** |
| R52-02, original 45.75 transfer | Date 45.75 kept; tax $57,038.985; net worth $113,632.25 | **Original finding closed**; broader field-preservation implementation has R53-01 |
| R52-01, imported horizon 41 extended to 60 | At item 2: horizon 41 kept and $106,050 projected. At final source: refused by validator, engine and import with current storage unchanged | **Closed through owner's refusal decision** |
| Unlisted restored manual order | Kept as a selectable extra option, including scenario switches and separate Roth/cash withdrawal results | **Verified repaired** |
| New end-before-primary-retirement refusal | All engine methods refuse; R41 start-age error retains precedence; equality accepted; younger spouse may keep working after primary horizon | **Verified against adopted scope** |
| Earlier R47-01, R47-02, R48-01 and R50-01 repairs | Original and R52 boundary companions remain green under supported working horizons | **Remain closed** |
| R53-01 | Retirement still changes after an age-only edit | **Open; blocks GO** |

### Item 1: monthly Social Security test

Read `otherIncomeFor()`'s dated work intervals and owner conversion, salary rates and work durations, `householdSocialSecurityDetail()`'s new boundaries, service flags, annual cap, family allocation, charged-month walk and later reduction-factor credits. Income growth factors feed the same annual rate used for cash; spouse intervals are moved to the primary clock before segmentation. No contribution deferral is subtracted from the wage amount used for this test. Non-work streams do not enter the dated-work list.

The primary sources support monthly protection in a grace year, the higher monthly limit in the FRA year and credits for partially withheld months. For 2026, $24,480/12 = $2,040 and $65,160/12 = $5,430. Sources checked independently: [SSA exempt amounts](https://www.ssa.gov/oact/cola/rtea.html), [20 CFR 404.430](https://www.ecfr.gov/current/title-20/chapter-III/part-404/subpart-E/section-404.430), [20 CFR 404.435](https://www.law.cornell.edu/cfr/text/20/404.435), [early-claim reduction](https://www.ecfr.gov/current/title-20/chapter-III/part-404/subpart-E/section-404.410), [monthly dollar rounding](https://www.law.cornell.edu/cfr/text/20/404.304), and [POMS reduction-factor credits](https://secure.ssa.gov/poms.nsf/lnx/0300615482).

The model still defines the grace year as the row the owner stops working in and judges a split month part by part at the segment's rate. Any positive SE profit is treated as services, per the owner's cautious approximation. Those disclosed conventions remain conventions; the oracles below use month-aligned dates and do not certify actual SE hours or a real calendar's partial-month adjudication.

### Item 2: restored fields

Read loaded-value recording, displayed-text equality, protected number blur handling, all 11 primary half-year fields, seven optional dates, the two age clamps, optional-date deletion and manual-order option replacement. Untouched fields survive calculations, blur, salary edits, an optional-date edit and scenario switching in the tested cases. The original transfer and pre-59.5 distribution figures are repaired. The dependency clamp in R53-01 prevents a blanket preservation conclusion.

### Item 3: refusal and adapted tests

Read validator `src/scenario-validator.js:248–255`, engine `endAgeBeforeRetirementCode()` at `src/engine.js:1630`, input-gate order at `src/engine.js:5361`, refusal message and Worker function registration. Refusal is explicit and preserves R41 precedence. The contract correctly keeps version 5 and adds a cause of an existing refused outcome. Primary retirement and end use the primary age clock; spouse retirement is deliberately outside this rule.

Reviewed the changes to all 46 existing test files, the helper and three new witness files. Most old edits add `retireAtEnd()`; six revival todos are adapted to keep reaching their original failures. The other substantive changes are one glide-helper horizon, two obsolete warning assertions and five empty-work return-shape assertions. Existing financial dollar expectations were not relaxed. The RB-07 vacuous pass was caught and corrected, and all nine authorized todos remain todos in the final gate.

## 4. Twenty new focused simulations and output analysis

The companion runs these **without the adapter**. Every accepted projection uses `retireAge <= endAge`. All **20/20** cases and **140/140** checks pass at the source pin. Financial expectations are arithmetic; acceptance, date, display and routing checks are counted separately within that total. The supplemental `hunt` then fails the untouched-date and financial expectations in R53-01; the script's final **exit 1 is expected** on this source. Exit 2 means a harness error.

| ID | Focus | Independently expected and observed outcome |
|---|---|---|
| G01 | Low wages, then high wages after claim | Three protected checks; SS $5,400 |
| G02 | High wages, then low wages | Same $5,400 protection with reversed service timing |
| G03 | Two small streams jointly exceed limit | Annual rates $12,000 + $12,600; SS $0 |
| G04 | Two streams jointly at limit | Annual rates $12,000 + $12,480; SS $10,800 |
| G05 | Tiny SE profit in three benefit months | Disclosed services rule; SS $5,400 |
| G06 | SE stops at claim | Six protected checks; SS $10,800 |
| G07 | Younger spouse's own dated job | Thirty early months; $1,666 × 6 = $9,996 |
| G08 | Other owner's large salary | Spouse's own low wages retain $10,800 |
| G09 | Job after retirement, ending at claim | Six protected checks; SS $10,800 |
| G10 | Claim before retirement, low ongoing salary | Nine non-service checks of $1,766; SS $15,894 |
| G11 | FRA-year combined wages exactly at limit | $5,430/month; $1,933 × 6 = $11,598 |
| G12 | FRA-year wages $1/month over limit | Service months and sufficient excess; SS $0 |
| G13 | Partial final year | Three protected checks; SS $5,400 |
| U14 | All 18 dates, blur and unrelated salary edit | All stored/displayed dates exact; first pension row $8,280.606024 |
| U15 | Two scenarios, different unlisted orders | Roth/cash closings $40k/$50k versus $50k/$40k |
| U16 | Draw at 59.25, then explicit date edit | Restored additional tax $1,000; edited 59.5 qualified draw tax $0 |
| U17 | Edit one optional date | Conversion start 68.3 → 68.5; other 17 dates unchanged |
| N18 | Earlier end than primary retirement | Three methods refuse, no rows; actual import leaves saved scenarios byte-identical |
| N19 | Refusal precedence and strict boundary | Start-age code wins; end 0.00000001 below retirement is refused |
| N20 | End equals primary retirement, younger spouse works | One full working year: ($100k + $1k) × 1.05 = $106,050 |

For G01–G06 the $100,000 salary pays $50,000 before retirement. The independently summed stream cash is removed from row income to isolate SS. Annual excess is sufficient to exhaust the applicable service-month benefit cap. G03/G04 test the **sum** of wages rather than each stream individually. G10 shows that low wages can protect benefit months even before the entered retirement date. G11/G12 distinguish the two FRA-year outcomes at the correct higher limit. U14–U17 compare requested values with saved/displayed values and financial output, which worker/main agreement alone cannot establish.

**Additional monthly oracle grid:** 400 reproducible plans, seed 20261004, 800 independently calculated benefit and FRA-credit figures, all pass. The oracle enumerates six benefit months, adds active wages, applies the disclosed SE services convention, caps annual withholding at service-month benefits and counts full/partial withheld months for ARF. It tests zero, tiny, at-limit and above-limit rates in up to five dated streams, then verifies the later FRA row. This grid is included in the companion's `monthlyGrid` output.

## 5. Carried full-model coverage and adapter qualification

Reran the three prior companions unedited on the base, item-2 source and final source, with and without the approved adapter where applicable:

| Companion | Base | Item 2, raw | Final, raw | Final, adapter |
|---|---|---|---|---|
| R51F full model | 33/36; original three SS failures | 36/36 | 29/36; seven intended horizon refusals | **36/36, 175 checks** |
| R46–R51 sequential simulations | 20/20 | 20/20 | 13/20; seven intended horizon refusals | **20/20, 176 checks** |
| R52 financial boundaries | 20/20; U01/U02 fail | 20/20; both UI witnesses pass | Stops at first newly invalid working horizon | **20/20**; U02 passes, U01 import refused |

R52's supplemental H01 remains the already disclosed annual Roth-distribution aggregation limitation. Its failure and the obsolete U01 acceptance expectation explain that old companion's nonzero exit. Neither is a new R53 regression, and neither was silently counted as a new pass.

Independent check-by-check comparisons reproduce the adapter record: item 2 without/with adapter gives 175, 176 and 112 identical verdict tuples; adapted item 2/final gives 175, 176 and 111 identical tuples, excluding U01. Beyond verdicts, the full stored results of 36 R51F and 29 original executions and all 20 stored boundary row sets agree after excluding execution identity. These are exact-script qualifications, not proof that changing retirement is neutral for every possible plan. The adapter mutates the input only during synchronous calls and restores the original retirement/spouse fields in `finally`; it never intercepts app imports. New probes bypass it entirely.

Independently replayed the builder's neutrality instrumentation over its 41 engine-reached test files at the base: **238/238 readable distinct plans identical**, ten hostile getter inputs unreadable by the copier. Two instrumentation-only controls fail because the neutrality hook deliberately reruns a supported input hook, producing two calls rather than one; both files pass all 17 tests without instrumentation. These replay counter failures are not model failures and are not included as gate passes.

The carried full-model run includes 936 independent tax calculations / 5,688 components: 864 ordinary/preferential/SS cases and 72 SE/QBI cases. Worst dollar error is $2.91 × 10^-11. Ten independent withdrawal bisections agree within $2.33 × 10^-10. Its finite-number, enum and boolean mutation sweeps remain green. Together with the account basis, IRA excise, survivor, HSA, historical and seeded Monte Carlo cases, these retain the prior full-model breadth; no finite suite certifies every household combination.

Fresh conservation sweep: **1,000 plans, 20,405 rows**, no invalid or non-ok plans, no unexplained failures. Worst portfolio residual $1.75 × 10^-9. Eight instances of the already classified `WAGE_TAX_CLAMP` remain; maximum household/combined residual $276.376143 is that known class, not zero residual. Conservation is a cash identity and does not establish rule correctness or catch a coherently changed input such as R53-01.

## 6. Predictions, baseline, gate and browser

The prediction commit precedes all source changes. Replayed its base-tree scan with its own versioned read-only taps: 36 control and 71 expanded plans, zero omissions, 629/1,144 grace rows, no eligible withholding exposure, and no horizon stop-condition case. All MC paths are traversed with that tree's own seeding, meeting A-11's necessary-condition check. Generator seeds 1–5,000 and fixtures have no new refusal. The tap is specifically tied to the base's old grace assignment; trying it unadapted on final source gives a marker mismatch, so the qualifying exposure replay is correctly performed on the base.

Fresh committed-input-qualified captures at both final source and frozen main contain 71 entries, no exclusions: 50 simple, 17 historical and four MC. Both equal r30 exactly:

- Output hash **`2c342c6c6bdc966cd34a8c7e35561fe598e2c50abd33c03cf85560b079dc5b04`**.
- Input hash **`ed3731e2f72425d0e17bfb26558411c22d552d559f9038db7d431769dcb839c4`**.

No baseline update is needed. M1–M3 are retained as disclosed prediction/coverage misses: three additional app/variant files, empty-work shape pins and revived todos. Correcting their adaptations preserves financial expectations and the nine todo dispositions. Corpus and named witness movements match the predictions. The broader promise that untouched age fields survive later edits misses R53-01; the green initial-restore witnesses do not qualify that promise.

**Local exact-source gate:** Windows 11 / Node 24.17.0 / jsdom 30.0.1; 448 files, **3,600 tests, 3,591 pass, zero fail or skip, nine authorized todos; GATE PASSED**. Closeout: 12 accepted, zero refused/errors. Read the source PR's [CI run 37235235795](https://github.com/Lonnyzone123/Financial-Calculator/actions/runs/37235235795), job 111532902397 and log: Windows Server 2025 / Node 24.17.0, same counts and GATE PASSED. Its nonexpired gate-log artifact has SHA-256 `2fecbb8f84ea1c493ce99decacc2e91f601ea9f59c2d60bfdd6bee28cf2edae7`. The tag itself has no separate workflow run; the source PR's tested records head adds no production changes over the tag.

**Fresh actual browser:** Chrome 154 on Windows, scratch build hash equal to the committed artifact and test pin. Replayed A–E: 75/75 Worker results equal main thread; 72/75 equal Node exactly. Three MC differences are only continuous-number rounding, maximum relative 1.1379371100244551 × 10^-15, no discrete differences. All 70 accepted imports have equal worker/main CSVs and replies; five existing import refusals remain. Worker run/load faults recover to exact compatibility results; double failure exposes no numeric result; subsequent recovery works; four concurrent Workers agree.

Additional raw browser comparisons for the 20 new plans plus the R53-01 hunt give **21/21 Worker/main equality**. The new horizon and old start-age plans refuse import; the other 19 import. All tested initial precision fields and orders are preserved. A subsequent real age edit saves/posts retirement 70.5 while displaying 65.0, and the returned Worker row has $5,000 income and $105,000 wealth. Re-running the intended saved plan with retirement 65 gives the independently derived $8,445.585690 / $108,445.585690. This demonstrates why correct routing of a changed input is insufficient for UI correctness.

| Source file | SHA-256 at audited source |
|---|---|
| `src/engine.js` | `124fa1691551d3b0557df72650840d1cf4903e5afc3662b4f4725344c2a749e0` |
| `src/app-shell.html` | `a0af8bc60bc70317a4c75edb75d5616488c4d880bcf648037fafd29d18babf24` |
| `src/scenario-validator.js` | `2b4f198ef84acb32128e2389b1570145d51d333e03d556457b5c08a3a4878e75` |
| Shipped / fresh served HTML, 1,196,575 bytes | `945e98149a0c0b56ade99335e4be831d71b183531eef2046c34eeceda74ddbac` |

## 7. Acceptance determination and carried limits

| Gate | R53 determination |
|---|---|
| E1/E3/E5 repair dispositions, reproductions and adopted remedies | Original three findings close; **R53-01 is open** in the adopted preservation remedy |
| E2 | Existing residual uncertainty accepted under A-09; unchanged |
| E4 mirrored output / settlement | Corpus unchanged; no new settlement failure in exercised runs |
| E6 failure policies | Explicit new refusal verified; MC invalidation policy unchanged |
| E7 | Deferred enforcement under A-09 remains; flagged references remain unqualified |
| E8 acceptance fixtures / preserved captures | Three new witnesses and unchanged r30 capture verified; add R53-01 edit witness |
| E9 gate / todos | Met locally and source PR CI; all nine authorized todos retained |
| E10 / A-01 / A-11 | Prospective corpus and named repair predictions verified; M1–M3 retained; later edit preservation claim fails R53-01 |
| E11/E12 carried work and disclosures | Previous routes remain carried, plus the open R53-01 remedy |
| E13 closeout registry | 12 accepted, zero refused/errors; this does not dispose of R53-01 |
| E14 rebuilt artifact / changed disclosures | Fresh/committed hash exact; new form option and refusal read; broader A-09 rendering exception remains |
| E15 comparator and desktop browser | Routing/fallback/concurrency met; semantic input/display preservation fails in R53-01 |
| E16 prior hunt accounting | Prior rejected claims and stated limits not reopened; new hunt is separately reproduced |
| E17 documents / primary citations | Relay to eb read; legal claims checked; blanket preservation text needs R53-01 resolution |
| E18 scope | Full-model reruns plus R53 source focus, 20 new cases and browser input audit completed |

D2's unchanged limits remain: MC runs rounded to hundreds, other form range clamps, end age above 100 capped despite validator maximum 120, and dropped inert keys `ssFra`, `pensionStart`, `pensionAge`. D4's SE-services convention, part-by-part split-month interpretation, shared import refusal prefix and pre-existing blank manual order behavior remain disclosed. The earlier annual Roth aggregation, basis/qualification assumptions, working-pay boundary, historical proxy data, state-tax domain and other carried limitations are not re-certified by these passes. A-09's E2/E7/E14 exceptions permit only administrative closure, not release or household reliance. Nothing here authorizes starting S5b or changing an owner decision.

## 8. Handover and reproduction

Repair R53-01, retain the demonstrated original closures, and rerun the current-age edit against the final candidate with displayed/saved/posted values agreeing. Re-run affected app paths, the independent companion and final artifact/browser checks. If dependent date edits are desired instead, the owner must explicitly resolve that policy and its presentation; the current age-only reproduction has no invalid relationship requiring a correction.

Companion: `audit/S5AA/R53/S5AA_R53_CHATGPT_FOCUSED_SIMULATIONS_20261004.js`, SHA-256 **`e358062971d0f3584f6f97512ab0ef68a62d0ed187ffe3964a8d8454c577a592`**. It writes the full plans, actual rows, expected values, saved plans, monthly oracle records and R53-01 hunt to a caller-chosen JSON file. Expected final-source outcome: 20/20 focused cases, 140/140 checks, 400/400 monthly plans / 800 financial checks, then the two R53-01 hunt failures and exit 1. The companion requires the repository's declared dependencies; it changes no source and loads no adapter. Existing companions are reused unedited under the owner's adapter with the qualifications above.

The report-only branch starts from the frozen main revision above. This review proposes no production repair, fixture change, baseline update or merge.
