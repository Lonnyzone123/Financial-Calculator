# S5AA R48 — build report: Medicare, survivors and Arizona

*Written by Claude on 2026-10-03 (Arizona, UTC−7). Branch `sprint/s5aa-r48` in its own worktree, from `ba9946d` (the R45 round).
Built in parallel with R46, R47, R49 and R50; the coordinator integrates, runs the gate, registers baselines and opens the PR. Nothing
was pushed or tagged.*

## 1. Commits

| commit | what |
|---|---|
| `7fec79a` | the prediction record, the corpus scan and its output, the targeted test-exposure run, the witness run on the base (before any `src/` edit, A-01) |
| `126c7f1` | the repair: engine, validator, contracts, app, rules package; the witness file; 30 test files and `tests/lib/corpus-expansion.js` adapted by intent; golden fixtures regenerated; control 4.7 declarations; registers rebuilt; the app rebuilt and repinned |
| (this commit) | this report, the expanded captures before and after, the measured-against-predicted comparison, the C1 check |

## 2. What changed (the owner's AA1 decisions of 2026-10-03)

**AA1-23, Medicare premiums grow.** `medicareChargePerPerson()` (new; exported; in the app's `workerFunctions`) is one person's year of
Medicare: `irmaaMonthly()` (the Part B premium plus the tier's Part D surcharge) x 12, plus the Part B deductible, plus the Part D plan
premium x 12, all times `(1 + g)^yearProgress`. `g` is `advanced.medicareInflation` when entered, else `advanced.healthInflation` --
the factor the pre-Medicare cost already uses. `advanced.partDPremium` (monthly, per person, 2026 dollars) replaces the CMS base
premium ($38.99) when entered; the IRMAA Part D surcharge stays on top (42 USC 1395w-113(a)(7)). Both charge sites use it (the retired
household, and R43's idle spouse). The IRMAA thresholds keep indexing at the plan's inflation (`taxYearRules()`, unchanged). Both
inputs: `src/plan-value-contract.json` (`medicareInflation` above -100 to 100; `partDPremium` 0 or more), the validator's
`ADVANCED_OPTIONAL_KEYS` (and a 0-20 range warning for the rate), the form's Medicare section (read, written, in `staticIds`). The
"Later tax years" card, the Rules page's Medicare section and the rules package's Part D note say so.

**AA1-11, the prior-income prompt.** `IRMAA_PRE_PLAN_MAGI_ASSUMED` is in `planWarningTitles` ("Medicare surcharge in the first two
years"). The two prior-year MAGI inputs carry help text: "Blank means the income is assumed to be below the first surcharge tier."
The validator's new WARNING `IRMAA_PRIOR_INCOME_BLANK` mirrors the engine's own condition (health costs on; someone alive and 65+
at the plan-year-0 or -1 opening; the household retired inside that row, `householdRetireAge()` mirrored; the cut at the last death)
with either income blank. The engine message now names the one blank year when only one is entered (it said both years assumed no
surcharge). The mirror agrees with the engine on 142 of 142 runs (`prediction/r48_c1_check_126c7f1.txt`).

**AA1-19, inherited IRA until 59½.** At the succession, a survivor under 59½ at that row's opening holds each of the decedent's
traditional IRAs as an inherited IRA: the account is tagged `_inheritedIra` (and still re-owned, so every owner-keyed rule reads the
survivor). The tag is read by:
- `earlyWithdrawalPenaltyRate()`: 0 (IRC 72(t)(2)(A)(ii); 72(t)(3)(A) keeps only (A)(v) and (C) from IRAs). Its callers -- the quote,
  the optimizer's early-tax weight, the draw, the transfers -- follow.
- `rmdObligations()`: a separate obligation, kind `inheritedIra`, payable from those accounts only. Death before the decedent's
  required beginning date: from the year the decedent would have reached the applicable age (26 CFR 1.401(a)(9)-3(d)); otherwise from
  the year after the death. Divisor: the survivor's single life expectancy at their age in the year, redetermined each year
  (-5(d)(3)(iv)); after the beginning date the longer of that and the decedent's (at their age in the death year, less one per year
  since; -5(d)(1)(ii), (d)(3)(ii)). The Single Life Table (-9(b)) is in the rules package as `retirement.rmd.singleLife`.
- the Form 8606 pool: `iraPoolKey()` (new) keys an inherited IRA "inherited"; the decedent's basis goes to that pool, not the
  survivor's (Pub. 590-B); every pool function, the by-owner tallies (draws, conversions, transfers, HSA funding) and the row-end
  settlement read it.
From the first row opening at 59½ or later the tag is removed and its basis joins the survivor's pool; a contribution into it (the
planned route, or a transfer the engine treats as an IRA contribution) does the same from the next row (1.408-8(c), deemed election).
A survivor 59½ or older: unchanged. `SPOUSAL_ROLLOVER_ASSUMED` says so, adds `IRC 72(t)(2)(A)(ii)`, `26 CFR 1.401(a)(9)-3(d)`,
`-5(d)` to `authority`, lists the held IRAs in a new `inheritedIra` payload (`account`, `from`, `until`, `endedBy`), and its
`notModelled` now reads "an inherited IRA kept past 59 1/2", "an inherited workplace plan", "the 10-year rule election",
"non-spouse beneficiaries".

**AA1-20, community property.** `profile.communityProperty` (boolean, optional, absent = false; in `src/boolean-flag-contract.json`, so
both layers refuse a non-boolean; a form switch shown with a spouse, in `staticIds`). True: at the first death the joint taxable account
resets in full (not half) and the survivor's own taxable accounts reset in full, at the row's opening value, as the decedent's do (IRC
1014(b)(6); A.R.S. 25-211(A)); the succession record of a joint account names `IRC 1014(b)(6)` and `A.R.S. 25-211(A)`, and the
disclosure notes that a JTWROS-titled account may not qualify (A.R.S. 33-431). The joint-account assumption text with the switch off
now reads "community property, which resets both halves (IRC 1014(b)(6)), applies only when the plan says the household's property is
community property".

**AA1-16, Arizona subtractions.** In `estimateTaxes()` Arizona's base subtracts `section151` (A.R.S. 43-1022(35); the engine's own
federal 151(d)(5)(C) amount, so R47's end of the federal deduction carries through) and `arizonaPost2011GainRate(p) x max(0, net
capital gain)` (43-1022(22)(c): 25%, from the new rules record `az_subtraction_post2011_ltcg`, times `retirement.azPost2011GainShare` /
100; new optional input, 0-100, contract-typed, on the form in the dividends section). `taxSegmentLocal()` mirrors both (`Dsenior0`
with its slope; the gain piece on `netGain`); `quoteTaxFunding()` passes the rate. `measures.arizona_agi` reports Arizona AGI after both.
Two Arizona records join the rules (`az_subtraction_federal_senior_deduction`, `az_subtraction_post2011_ltcg`). The "Arizona estimate"
card and Rules section say what is subtracted; "Not modeled yet" no longer lists either. `taxConfigForFilingStatus()`'s
`arizona_ltcg_subtraction: 0` is unchanged: it is a filing-level config for the ported reference engine with no plan input.

## 3. Predicted against measured

### 3.1 The corpus (`prediction/r48_measured_vs_predicted_126c7f1.txt`)

| | predicted (`7fec79a`) | measured | verdict |
|---|---|---|---|
| expanded: movers | 47 flagged (Arizona 47, Medicare 2, rollover text 3); a flag is a necessary condition | 37 moved; 36 of them flagged | **miss: seed:20** (§4, M3) |
| flagged, not moved | allowed (necessary condition) | 11 Arizona-flagged plans unchanged (their Arizona base already 0 in the deduction rows) | as predicted |
| Arizona movers' direction | taxes down, totals up | every Arizona-only mover: lifetime taxes down ($13.75 to $2,938.14), final total up or unchanged (up to $15,094.82, golden:rmd-and-roth-conversion) | as predicted |
| seed:10 (Medicare, historical) | spending and withdrawals up, about $203,000 more charged; totals down, a shortfall may come earlier | spending summed over the plan +$197,716; withdrawals up; totals down mid-plan (−$24,175 at 75); shortfalls summed +$207,280; the last row's total unchanged; lifetime taxes −$237.80 | as predicted, except the last row (§4, M5) |
| seed:16 (Medicare) | as seed:10, about $292,000 | the growth is absorbed by outside income the plan spends (`surplusPolicy: spend`): totals unchanged; only the Arizona effect shows (lifetime taxes −$695.23) | **miss** of direction and size (§4, M5) |
| Monte Carlo | golden:monte-carlo-fixed-seed and expansion:monte-carlo-sensitive-band named, every path exposed; published result may move | both moved (golden: lifetime taxes −$22.87, final total +$300.90; band: first row 74 moved, headline figures unchanged) | as predicted (A-11) |
| rollover text | targeted:survivor-stateful, expansion:s5aa-gap-death-while-working, expansion:s5aa-r6-gap-basis-conversion move in the message | all three; survivor-stateful by its issue text only | as predicted |
| inherited / community / gain share / one-income message | no corpus plan | none moved by them | as predicted |
| control 4.7 | 19 flagged; issue text invisible there (LENGTH only) | 16 scenarios differ: 15 flagged + seed:20; survivor-stateful's text invisible, as read; 2,351 differences declared in `tools/control-candidate-prediction.json`, undeclared 0, declared-and-not-found 0 | miss: seed:20 |

### 3.2 The tests

Targeted runs only (the gate is the coordinator's): the 176 exposure files plus 12 corpus, register and app files at `126c7f1`'s tree:
1,700 tests, 1,696 pass, 3 authorized todos, 1 fail fixed before the commit (corpus-composition, M4); and the 181 other files that run the
engine, validator or app: 1,172 tests, 6 failures fixed before the commit (M4), 6 todos. Every failure was re-measured and is the rule's
movement; each is adapted by intent with its before and after figure in the test (list in §5).

| prediction | measured |
|---|---|
| `audit-s5aa-r40-part-d-base-premium` moves to `[3185.68, 3344.96, 3512.21]` and the couple's | exactly; the couple's `[6371.36, 6689.93, 7024.42]` |
| the Medicare-figure tests among r33, r35, `irmaa-pre-plan-lookback`, r43-plan-value-contract, r11 | r33 (2 cases) and r35 (2 cases) moved; the other three did not (conditional prediction) |
| r20's survivor case: `[10000, 0, 80000]` | exactly |
| r7's JOINT string | exactly |
| tests pinning Arizona tax of a senior with a deduction | 23 test files and the corpus-expansion checks (§5), 6 of them outside the targeted list (M4) |
| `arizona-return-partial` / `tax-named-income-measures` on `arizona_agi` | both |
| validator warning counts for `irmaaWarn` plans | none of the 9 exposed files moved; `scenario-generator` (not in the targeted list) did: M4 |
| r6 basis and spousal-rollover basis cases pass unchanged | they pass |
| conservation invariants pass | `household-ledger`, `reconciliation-invariant`, `networth-reconciliation` pass |

### 3.3 The witnesses

`tests/audit-s5aa-r48-medicare-survivors-arizona.test.js`, 32 cases. At the prediction it had 32 cases with 23 repair cases and 9
controls (SHA-256 `64a860ea…a6ac8`, `witness_runs/r48_tests_at_ba9946d.txt`). In the build three Arizona cases that called
`estimateTaxes()` directly were rewritten through `runPlan()` (the requirements register refuses a requirement guarded only by a test
that calls an engine internal; closeout went 12/5 → 12/0), a 50% gain-share case and a net-loss control were added, and M1 and M2 were
corrected. The committed file (SHA-256 `a2a70d545318a0966b68648c254463d98bf79c6dfda2a8f82cfd882957834bd5`) run on `ba9946d`: 22 repair cases fail with the pre-repair figure, 10 controls
pass (`witness_runs/r48_tests_final_file_at_ba9946d.txt`); at `126c7f1` all 32 pass.

## 4. Misses

- **M1 (witness premise).** The deemed-election case first kept the decedent's planned $5,000 IRA contribution after the death. The engine
  makes no planned contribution to a decedent's account after the year of death (it moved $2,500 in the death year and nothing after),
  so no contribution reached the inherited IRA. Corrected to a transfer the engine treats as an IRA contribution (51.5); recorded in the
  test. The hook also runs for planned contributions, which today cannot reach it.
- **M2 (witness arithmetic).** The added 50% gain-share case: 79,597.50 / 0.9890625 is 80,477.73, not 80,477.75 as first written.
- **M3 (a reader not listed, C6).** `seed:20` moved unflagged: lifetime taxes −$184.14, final total −$4,643.32, withdrawals up from 65.
  The row's wage-only BASELINE tax (`baseline=estimateTaxes(p,age,wages...)`, the part wages pay before the portfolio funds the rest)
  is a second `estimateTaxes()` call, on wage-only MAGI, low enough there for a partial senior deduction and so a partial Arizona
  subtraction, while the full return's MAGI ($405,598 at 65) takes none. The baseline fell, so the portfolio funds more: withdrawals
  +$138.84 at 65, +$315.04 at 70.
  The total tax is right (the full return); the split follows the existing convention, under which the baseline already took the
  federal senior deduction at the wage-only MAGI. The scan read the row's reported MAGI only. Direction opposite to the Arizona set.
- **M4 (test exposure).** Failures outside the targeted 176: `audit-cr2-findings`, `audit-ra01-surplus-provenance`,
  `audit-ra03-dividend-eligibility`, `audit-rb-findings`, `public-route-rb02` (Arizona figures); `scenario-generator` (generated seed
  120 raises the new validator warning; R45's lesson again: a new validator message needs the generator's no-warning test checked);
  `corpus-composition` (the capital-loss expansion members' checks in `tests/lib/corpus-expansion.js` carried the old Arizona formula).
  The 176-file list was built by grepping for Arizona, senior, Medicare and succession terms; these pin a tax figure without naming
  any of them.
- **M5 (Medicare size and direction).** The hand trace sized the extra Medicare charge (seed:10: about $203,000 against a measured
  $197,716 more spending) but assumed it would lower totals. In seed:16 the plan spends its outside-income surplus, which absorbs the
  charge: totals unchanged. In seed:10 the plan runs short late, so the last row's total is unchanged while shortfalls rise $207,280.
- **Before the prediction (recorded there):** two witness fixtures were corrected for the engine's imputed 1.5% dividend.

## 5. Tests adapted by intent (each change carries a comment naming R48 and the owner's decision, with the old figure)

Arizona senior-deduction subtraction (A.R.S. 43-1022(35)), 2.5% of the federal 151(d)(5)(C) amount:
`arizona-return-partial` (1,045 → 895; 1,340 / 1,392.50 → 1,040 / 1,242.50; `arizona_agi` less the deduction; the $52.50 exemption case
moved to $200,000, where the deduction is phased out), `tax-named-income-measures` (`arizona_agi`), `audit-s5aa-x08-payroll-arizona-
expectations` (2,045 → 1,932.50; 4,090 → 3,940; 545 → 395), `audit-s5aa-additional-standard-deduction` (the age effect 2,100 → 8,100,
the 63(f) amount still out; title corrected), `audit-r2-cash-settlement` (2,199 → 2,049; 45,667 → 45,817), `audit-r2-tax-quote`
(2,199 → 2,049; 35,801 → 35,951; the cash-only case moved from $20,000 to $30,000 of income because the liability became 0),
`audit-rc-findings` (27,366.40 → 27,330.40; 172,633.60 → 172,669.60; 13,774.00 → 13,661.50; 13,515.80 → 13,401.80),
`audit-rmd-cash` (2,402.339181 → 2,226.900585; spending 37,801 → 37,951), `audit-s5aa-r18-self-audit-capital-loss` (the Arizona-funded
row on base − 24,200), `audit-s5aa-r18-taxable-basis-in-dollars` (480 → 330), `audit-s5aa-r33-age-65-at-year-end` (5,099 → 4,949;
5,944 → 5,644; 880 → 730), `audit-s5aa-r33-loss-carryover-adds-back-151` (12,657.76 → 12,521.71), `audit-s5aa-r33-married-on-a-non-joint-
return` (controls 1,840 → 1,540, 5,099 → 4,949; the non-joint cases unchanged: no federal deduction, so none for Arizona),
`audit-s5aa-r35-working-spouse-wages-fund-spending` (7,247.50 → 7,097.50; 3,623.75 → 3,548.75), `audit-s5aa-r36-later-year-tax-indexing`
(5,099 / 5,020.75 → 4,949 / 4,870.75), `audit-s5aa-r43-tax` (1,840 → 1,540; 11,264.50 → 11,114.50), `audit-s5aa-survivor-filing-status`
and `public-route-f02` (joint row 12,039.77 → 11,688.89; single row 26,082.43 → 26,022.11), `audit-cr2-findings` (3,649 → 3,499),
`audit-ra01-surplus-provenance` (1,193,319.21 → 1,193,649.52), `audit-ra03-dividend-eligibility` (5,099 → 4,949), `audit-rb-findings`
and `public-route-rb02` (34,901 → 35,051), `tests/lib/corpus-expansion.js` (`lossRowAgi()`: 32,042.25 / 50,447.89 → 31,957.75 /
50,363.38).

Medicare growth: `audit-s5aa-r40-part-d-base-premium` (flat → grown, above); `audit-s5aa-r33-irmaa-lookback-status-and-top-tier` and
`audit-s5aa-r35-irmaa-pre-plan-and-partial-year` hold healthcare inflation at 0% in their fixtures (they test which tier and which return
a year reads; at 5.5% the row opening at 72 charged 3,545.74 for the 3,185.68 tier).

Inherited IRA: `audit-s5aa-r20-early-tax-uses-owner-age` (`[11111.11, 1111.11, 78888.89]` → `[10000, 0, 80000]`).
Community property: `audit-s5aa-r7-executed-succession` (the JOINT string).
Validator: `scenario-generator` (`IRMAA_PRIOR_INCOME_BLANK` joins the exempt list, asserted to occur, seed 120).
Contract: `boolean-flag-contract` (a `communityCouple` setup and an absent witness for `profile.communityProperty`).
Regenerated: `tests/fixtures/golden-scenarios.fixtures.json` (golden:monte-carlo-fixed-seed: lifetime taxes 2,242,033.60 → 2,242,010.73;
golden:rmd-and-roth-conversion: 123,793.34 → 120,998.18, last-row total 6,006,781.65 → 6,021,876.47); `tools/control-candidate-
prediction.json` (2,351 declarations replaced in place; their old `declared` sub-objects, left by earlier rounds, are dropped from the
replaced entries).

## 6. Tax-law claims checked at primary sources (2026-10-03)

- IRC 72(t)(1), (t)(2)(A)(i), (ii); 72(t)(3)(A) ("Subparagraphs (A)(v) and (C) of paragraph (2) shall not apply to distributions from an
  individual retirement plan"): law.cornell.edu/uscode/text/26/72; govinfo.gov USCODE-2023-title26 sec. 72.
- 26 CFR 1.401(a)(9)-3(c)(4), (c)(5), (d) (the spouse's delay to the year the employee would have reached the applicable age; the life
  expectancy rule the default for an eligible designated beneficiary): law.cornell.edu/cfr/text/26/1.401(a)(9)-3.
- 26 CFR 1.401(a)(9)-5(d)(1)(ii), (d)(3)(i)-(iv) (the greater of the two lives after the beginning date; the Single Life Table; the
  employee's life less one a year; the spouse's redetermined each year), (g)(3) (the election to be treated as the employee is a defined
  contribution plan provision): law.cornell.edu/cfr/text/26/1.401(a)(9)-5.
- 26 CFR 1.401(a)(9)-9(b), the Single Life Table, read twice (law.cornell.edu and govinfo.gov CFR-2025-title26-vol6), identical.
- 26 CFR 1.408-8(c) (the spouse's election; deemed when amounts are contributed or required distributions not taken; the year of death
  RMD), (e)(2)(ii) (aggregation only among IRAs held as beneficiary of the same decedent): law.cornell.edu/cfr/text/26/1.408-8.
- Publication 590-B (irs.gov/publications/p590b): the spouse beneficiary's start ("until the end of the year in which the IRA owner would
  have reached their required beginning date"), Table I or, if treated as own, Table III; inherited basis not combined unless treated as
  own.
- 42 USC 1395w-113(a)(7) (the income-related increase of the Part D premium): law.cornell.edu/uscode/text/42/1395w-113.
- IRC 1014(b)(6): law.cornell.edu/uscode/text/26/1014. A.R.S. 25-211(A) (azleg.gov/ars/25/00211.htm). A.R.S. 33-431(A)-(D)
  (azleg.gov/ars/33/00431.htm): joint tenancy and community property with right of survivorship each need express words.
- A.R.S. 43-1022, opening words, paragraph 22 (a)-(c) and paragraph 35 ("For taxable years beginning from and after December 31, 2024, to
  the extent not already excluded from Arizona gross income under the internal revenue code, the amount deducted for a qualified
  individual under section 151(d)(5)(C)"): azleg.gov/ars/43/01022.htm.
- The plain 2026 figures used in the witnesses are the rules package's (each with its source there).

## 7. Decisions for the owner

1. **The post-2011 gain share's default is 0% (absent): no Arizona gain subtraction unless entered** -- today's behaviour, as the task
   said. Alternatives: 100% (most assets held now were bought after 2011, but an unverifiable date allows nothing), or a default derived
   from the plan's start date.
2. **An entered Part D premium is in 2026 dollars and grows** at the Medicare rate, like the base premium it replaces.
3. **The growth factor is the pre-Medicare cost's `(1 + g)^yearProgress`**, continuous from the plan's start, not one step a calendar
   year; with a fractional start the first steps are fractions of a year.
4. **Inherited IRA scope:** traditional IRAs only (the decision names IRAs). A decedent's 401(k) still passes as the survivor's own, so a
   survivor under 59½ still pays the 10% on it, though a plan beneficiary's distributions are also excepted by 72(t)(2)(A)(ii).
   A Roth IRA needs nothing (the model charges no 10% on Roth draws).
5. **The status runs through every row that opens below 59½** (the year-opening convention of pooled draws) and **a contribution ends it
   from the next row**, so a draw in the contribution's own row is still exempt and the contribution's basis sits in the survivor's pool
   for that one row.
6. **Community property** resets the survivor's own taxable accounts and the joint account in full; a cash holding is left alone (its
   basis is its balance). The switch is plan-wide, so it cannot express separate property inside a community household.

## 8. Pending, and for the coordinator

- **The gate** (one at a time), the browser check (task 6.5, including the four new inputs), and baseline registration: the expanded
  capture at `126c7f1` differs from r24 in 37 entries (`prediction/expanded_126c7f1.json`; base `prediction/expanded_ba9946d.json`,
  equal to r24 on 71 of 71).
- **Integration:** golden fixtures and the control 4.7 declarations are this tree's; with R46/R47/R49/R50 merged they need re-deriving
  (`prediction/r48_declare_control.js --write`, `node tests/generate-golden-scenarios.js`). Likely textual conflicts: R47's senior
  deduction (the Arizona subtraction reads `section151` and `Dsenior0`, so it follows R47's end after 2028 with no further change);
  R49's additions to `planWarningTitles`; any round touching `estimateTaxes()`'s `azBase` or the validator's `ADVANCED_OPTIONAL_KEYS`.
- `defaultPlan` is unchanged.
- The scratch worktree at `ba9946d` used for the base capture is removed.

## 9. Suggested text for eb's files (prose; nothing of eb's was edited)

- **MODEL_ASSUMPTIONS (Medicare, section 11 / 18.4):** "Medicare premiums -- Part B with the income-related amounts, the Part B
  deductible and the Part D premium -- grow from their 2026 figures at the Medicare growth rate the plan enters, or at healthcare
  inflation, by the same factor as the pre-Medicare cost; the income thresholds rise with the plan's inflation. An entered Part D
  premium (monthly, per person, today's dollars) replaces the national base premium; any income-related Part D amount is added. A
  blank prior-year income is assumed below the first surcharge tier, and the app says so."
- **MODEL_ASSUMPTIONS (succession, 18.1):** "A survivor under 59½ at the death holds the deceased's traditional IRAs as an inherited IRA:
  no 10% additional tax; the spouse-beneficiary required distribution on the survivor's single life expectancy (from the year the
  deceased would have reached their required age when the death came before it); the deceased's IRA basis kept in its own pool. From
  the first year that opens at 59½ or later, or the year after a contribution to it, the survivor treats it as their own. A workplace
  plan passes as the survivor's own. With the plan's community-property switch on, every taxable account's basis -- joint and both
  spouses' own -- resets to its value at the first death (IRC 1014(b)(6)); off, the decedent's resets and half of a joint account."
- **MODEL_ASSUMPTIONS (Arizona, section 5):** "Arizona AGI also subtracts the federal senior deduction the return takes (A.R.S.
  43-1022(35), from 2025) -- so it follows the federal deduction's phase-out and end -- and 25% of net long-term capital gain on assets
  bought after 2011 (43-1022(22)(c)) for the share of realized gains the plan enters (none by default)."
- **FEATURES:** four inputs -- Medicare premium growth, Part D plan premium, "Our accounts are Arizona community property", share of
  realized gains on assets bought after 2011; the "Medicare surcharge in the first two years" card; the validator's prior-income prompt.
- **SPRINT_QUESTIONS:** record decisions 7.1 to 7.6 above as open for the owner, with 7.1 (the gain share default) first.
