# S5AA R47 — build report: federal tax and retirement accounts

*Written by Claude on 2026-10-03 (Arizona, UTC−7). Branch `sprint/s5aa-r47`, built in its own worktree from `ba9946d` (the R45
round). Not pushed, not tagged; no baseline registered. The coordinator integrates the rounds in order and runs the gate.*

## 1. Commits

| commit | what |
|---|---|
| `0f333b8` | prediction record, corpus scan and its output on `ba9946d`, the witness run on `ba9946d` (before any `src/` edit, A-01) |
| `f02e26a` | the repair: engine, app, contracts, witnesses, adapted tests, golden fixture, control 4.7 declaration, registers, app rebuilt and repinned |
| (this commit) | this report, the expanded captures, the measurement scripts and outputs |

## 2. What changed (the owner's AA1 decisions of 2026-10-03)

1. **AA1-30, the senior deduction ends after 2028.** `taxYearRules()` gives each later plan year's rules its tax year
   (`meta.taxYear` = 2026 + plan year; plan year 0 still returns the package object itself, and a later year with no index
   movement is a copy of the package carrying its year, cached by year). New `seniorDeductionInForce()` compares it with the
   stored `expiresAfter` (2028); `seniorDeduction()` returns 0 when it is out of force, and the funding solver's mirror
   (`taxSegmentLocal()`) counts no eligible person then. The amount is still figured only by `seniorDeduction()` (R48's Arizona
   subtraction can read it). The capital-loss carryover's 151 add-back reads `seniorDeduction()`; it cancels in the worksheet
   line, so the carryover never moves. App: the "Later tax years" card ("the senior deduction ends after 2028, as the law says")
   and the rules page paragraph. This reverses the owner's Q165 refinement.
2. **AA1-13, a high earner's catch-up is designated Roth.** `auditContributions()` gives a pre-tax workplace item the Roth part of
   its catch-up (`rothCatchUp`) when `rothCatchupStatus(a, projected)` requires it; the row deposits that part to a linked Roth
   401(k) of the same owner (`rothCatchupDestination()`, synthesised once per plan like `employerMatchDestination()`, found again
   by a non-enumerable link) and leaves it out of `preTaxDeferrals` (so it is taxed; it stays FICA wages). The 402(g), catch-up and
   415(c) limits are unchanged because they were applied to the plan's item before the split; the match base and active-
   participant coverage are unchanged. Prior-year FICA wages: the entered `priorYearFicaWages` in the first row; from the second
   row the owner's salary wages of the prior row less that owner's HSA salary reduction (run state `priorFicaWages`). New
   `accounts[].planOffersRoth` (boolean contract, default true): false makes a required catch-up a limit excess (414(v)(7)(B)).
   No form control (the engine's other per-account election, `matchRoth`, has none either). Warning texts and the rules page
   rewritten (the phrases R11's test pins kept).
3. **AA1-27, IRC 4973.** Under "warn", per owner and kind (traditional IRA, Roth IRA, HSA): the year's excess deposits (planned
   items' `excess`, and a one-time contribution moved over its room) plus last year's excess less the year's distributions
   (traditional: included in income, from the Form 8606 ledger; Roth IRA: all; HSA: the included part — recorded in
   `withdrawFromAccountList()` and for a transfer out) and less the year's unused room (the one-time route's room, less one-time
   contributions already moved). 6% of the smaller of that and the owner's accounts of the kind at the year's close joins the
   row's `taxSettled` and `taxOutstanding` and is paid in the next row (`taxTrueUpPaid`), as R19's true-up is; net worth carries it
   until then. The "warn" option text and the audit's IRA/HSA limit warning say the 6% applies.
4. **AA1-45 / AA1-26, self-employment.** `estimateTaxes()` takes a new trailing argument, the SE-funded workplace deferral: the part
   of the deferrals the salary cannot absorb (R33's line) times SE pay's share of the stream pay it comes off, times the workplace
   (not HSA) share of the deferrals; QBI is reduced by it. The four row calls pass it; the solver and `verifyQuoteObligation()`
   already read `taxes.qbi`. `ownerCompensation()` nets each owner's SE profit of the deductible half of their own SE tax
   (`seDeductibleHalfFor()`, Schedule SE with the wage base left after the owner's payroll wages); that reaches the IRA limit, the
   415(c)(1)(B) deferral and employer-addition caps, `transferRoom()` and the app's first-row audit.
5. **AA1-32, the HSA's Medicare start.** `medicareStartAge(p, owner)`: an entered `profile.medicareStartAge` /
   `spouseMedicareStartAge` (contract: optional finite 0-120), else 65 when the claim (as `ssClaimStartAge()` reads it) is at 65
   or earlier or no benefit is modelled, else claim − 0.5. Both HSA routes (planned `hsaBefore65`, one-time `oShare`) read it. App:
   two inputs beside the claiming ages (read, written, in `staticIds`), and the HSA note.

New top-level functions, all in the app's `workerFunctions` and exported: `seniorDeductionInForce`, `medicareStartAge`,
`seDeductibleHalfFor`, `rothCatchupDestination`. `defaultPlan` is unchanged.

## 3. Predicted against measured

### The witnesses

36 cases at the prediction (29 repair cases failing with the pre-repair figure, 7 controls passing at `ba9946d`). After the repair
all pass. Two coupled cases (the direct `taxYearRules()`/`seniorDeduction()` check and the audit-warning check) were moved to
`tests/audit-s5aa-r47-internals.test.js` (one gained an indexed-year assertion) so the main file stays public-route; the
requirements register's AA1 items would otherwise be "coupled only" and closeout refused them. The main file now holds 35 cases (the audit-warning case kept its option-text check) and the internals file 2: 37 in all, all
passing (the commit message's "34 public-route cases" undercounts by one). SHA-256 at `f02e26a`: main file
`23bb5b6b…16713`, internals `c76589f7…6e6e2` (at the prediction the main file was `8bfb7690…bbf3efa`).

### The corpus (expanded captures of `ba9946d` and `f02e26a`, `prediction/r47_expanded_capture_*.json`; per-entry figures in
`prediction/r47_movers_ba9946d_f02e26a.txt`)

- **Catch-up, excise, SE: none predicted, none moved.**
- **HSA: none predicted; one moved — a miss.** `seed:13`: its one-time transfer into an HSA at 65 (claim at 70, so Medicare at
  69.5) now has $8,750 of room where it had $0; the source holds nothing then, so $0 moves either way and only the
  `limitWarnings` text changes. The scan tested only planned HSA items, not a one-time contribution into an HSA (C6 named the
  one-time route as a reader, but the scan had no condition for it).
- **Senior: 40 predicted (19 control); 22 moved as predicted in direction, 18 did not move, and 1 unpredicted plan moved.**
  - The 18 that did not move (`targeted:historical-spouse-ss`, `targeted:arm-flag-on`, `targeted:survivor-stateful`, the four
    `expansion:other-asset-*`, the eight `expansion:debt-*`, `s5aa-r6-gap-basis-conversion`, `s5aa-r14-rmd-two-iras-distinct-returns`,
    `s5aa-r15-rmd-transfer-to-taxable`) have a positive senior deduction after 2028 but no taxable income left for it to reduce:
    their tax is the same with or without it. **Miss (scan design):** the condition tested that the deduction was positive, not
    that it was binding — a deduction moves tax only where taxable income before it exceeds zero. The same flaw inflated the size
    estimates (the marginal rate at `ti + 1` was charged even where `ti` was 0).
  - `seed:20` (unpredicted, **miss**): its full return's MAGI (~$405,000) phases the deduction out entirely, so the scan saw none;
    but the wage-only `baseline` return (the tax on wages, paid outside the portfolio) had MAGI near $161,000 and a deduction.
    Without it the baseline tax rises ($652.59 in the first row), the portfolio funds that much less, and the final total RISES
    $21,351.17 while lifetime tax rises $853.33. C6 listed `baseline` only as a `preTaxDeferrals` reader, not as a senior-
    deduction reader with its own MAGI. `expansion:s5aa-r6-gap-survivor-health-roth` moves the same way (−$0.43 lifetime tax,
    +$123.19 final total), against the prediction's "taxes up".
  - Sizes (lifetime tax, predicted federal estimate → measured): `golden:rmd-and-roth-conversion` 17,188 → 9,993.85;
    `seed:1` 3,531 → 2,149.55; `seed:2` 11,197 → 13,836.72; `seed:5` 215 → 178.23; `seed:6` 790 → 790.05; `seed:10` 16,741 →
    1,141.46; `seed:16` 3,443 → 709.45; `targeted:spouse-cola-income` 20,400 → 1,720.39; `targeted:historical-1929` 13,920 →
    4,705.87; `-1966` 9,232 → 5,411.22; `-2000` 14,750 → 12,164.04; `targeted:collision-household-cash` 7,200 → 7,200.00;
    `targeted:explicit-cash-holding` 2,238 → 2,238.34; `targeted:funded-qcd` 1,440 → 1,684.21;
    `targeted:collision-rmd-retained-cash` 7,284 → 7,062.54; `s5aa-gap-working-household` 11,745 → 14,127.32;
    `s5aa-gap-death-while-working` 10,377 → 9,026.57; `s5aa-r14-rmd-conversion-under-loss` 1,320 → 720.00;
    `s5aa-r14-rmd-prototype-ids` 2,400 → 1,653.28. The record's band (−10% to +40%) holds for 7 of these 19 (`seed:2`, `seed:6`, `collision-household-cash`,
    `explicit-cash-holding`, `funded-qcd`, `collision-rmd-retained-cash`, `s5aa-gap-working-household`); the other 12 are **size
    misses**, all overestimates, consistent with the binding flaw above (not traced plan by plan).
  - Monte Carlo (C4/A-11, `prediction/r47_path_level_ba9946d_f02e26a.txt`): `golden:monte-carlo-fixed-seed` — 500 paths, all
    exposed, 179 changed, none changed unexposed; published result moved (success 100 → 100; rows move from age 65).
    `expansion:monte-carlo-sensitive-band` — 500 exposed, 18 changed, none unexposed; published result moved (success 84.6 → 84.6).
    Both as predicted ("named, every path exposed; the published result may move").
- **Control 4.7:** 17 control plans moved (the 19 predicted less the three that did not move, plus `seed:20`); declared in
  `tools/control-candidate-prediction.json` by `prediction/r47_declare_control.js` (2,065 differences new or changed, 2,059 earlier
  declarations replaced or removed); 4.7 passes. The coordinator must re-run that script on the integrated engine (the declaration is cumulative).
- **Golden fixture:** `rmd-and-roth-conversion` (predicted) and `monte-carlo-fixed-seed` (predicted "may move": last-row total
  −$1,300.24) moved; regenerated by `tests/generate-golden-scenarios.js` after reviewing the diff. The other three did not move, as
  predicted.

### The tests (targeted runs only; no gate run)

All 406 test files were run in targeted batches (concurrency 3-4, never the gate): every file passes at `f02e26a` or at a working
state differing from it only by the register rebuild, the witness split and `medicareStartAge()`'s guard for a plan with no
`retirement` section (the 62 contribution/tax files were re-run at `f02e26a`: 578 pass, 1 authorized todo). Closeout: accepted 12, refused 0, errors 0.

Adapted by intent (each with a comment naming R47 and the decision):

| test | before | after | named in the prediction? |
|---|---|---|---|
| `audit-s5aa-r40-later-tax-years-card-rendered` | `/the senior deduction, which this plan keeps after 2028/` | `/the senior deduction ends after 2028, as the law says/` and no "keeps after 2028" | yes |
| `audit-s5aa-r36-tax-year-rules-rounding` | message "kept, unindexed, after 2028 (D8)" | message only; the deep-equal still holds | yes |
| `audit-s5aa-r36-later-year-tax-indexing` | header "kept after 2028 by D8" | header only (it reads plan years 0-1) | yes |
| `audit-s5aa-r43-contributions` | `/Contributions stop at each person’s 65th birthday/` | the new Medicare-start sentence | **no (miss: an app text pinned elsewhere)** |
| `audit-s5aa-survivor-filing-status`, `public-route-f02` | $12,039.77 every row; $26,082.43 after a death; survivor "more than double"; flat rows | rows 74+ (tax year 2029+): $13,723.98 joint and $26,648.98 single, hand-derived in the file; "nearly double" (1.9×, now 1.94×); flat within each law | **no (miss: the category was named, these files were not)** |
| `boolean-flag-contract` | — | a `highEarnerCatchup` setup and an absent-true witness for `accounts[].planOffersRoth` | the file was named |
| `golden-scenarios` fixture, control 4.7 declaration | — | regenerated / re-declared | yes |

Expected to hold and held: `roth-catchup-transition` (including its "runPlan results do not move" control), `rendered-results-warnings`,
the conservation and reconciliation tests, `worker-parity`, `audit-q15-worker-dependencies`.

### Misses (all recorded, none quietly re-expected)

1. **Witness derivations** (found on the base run before the prediction was committed, recorded there): the 2028 draw
   (42,571.93) and the SE half-tax rounding (5,651.82).
2. **Witness derivations found in the build:** the 2029 draw divided wrongly (43,414.04, not 43,413.45); the no-Roth case's
   taxable balance ignored the engine's imputed 1.5% dividend on the redirected dollars (the case now switches dividends on at 0%);
   the SE one-time case's taxable check ignored the retained surplus of the SE income (dropped; the IRA figure carries the case).
3. **Scan:** a positive deduction is not a binding one (18 false movers, 12 size overestimates); the wage-only `baseline` return
   is a separate reader with its own MAGI (`seed:20`, and the direction of `s5aa-r6-gap-survivor-health-roth`); the one-time HSA
   route had no scan condition (`seed:13`).
4. **Tests not named:** `audit-s5aa-r43-contributions`, `audit-s5aa-survivor-filing-status`, `public-route-f02`.
5. **Closeout:** the first build of the witness file was implementation-coupled (two direct engine calls), which refused the six
   AA1 register items; fixed by moving those two cases to a coupled file of their own.

## 4. Tax-law claims checked at primary sources (read 2026-10-03)

- IRC 151(d)(5)(C)(i): "In the case of a taxable year beginning before January 1, 2029" — https://www.law.cornell.edu/uscode/text/26/151
- IRC 414(v)(7)(A)-(E): the Roth catch-up rule, (B) "paragraph (1) shall not apply to the plan unless the plan provides that any
  eligible participant may make the participant's additional elective deferrals as designated Roth contributions", (E) indexing
  rounded down to $5,000 — https://www.law.cornell.edu/uscode/text/26/414
- Notice 2025-67: "The Roth catch-up wage threshold for 2025, which under section 414(v)(7)(A) is used to determine whether an
  individual's catch-up contributions ... for 2026 must be designated as Roth contributions, is increased from $145,000 to
  $150,000" — https://www.irs.gov/pub/irs-drop/n-25-67.pdf
- IR-2025-91 (Sept. 15, 2025): final regulations generally apply to contributions in taxable years beginning after Dec. 31, 2026
  (later for certain governmental and collectively bargained plans); before then a reasonable, good-faith interpretation —
  https://www.irs.gov/newsroom/treasury-irs-issue-final-regulations-on-new-roth-catch-up-rule-other-secure-2point0-act-provisions
- IRC 4973(a), (b), (f), (g) (6%, the year-end value cap, the reductions for distributions and unused room) —
  https://www.law.cornell.edu/uscode/text/26/4973 ; Form 5329 instructions (2025), line 11 "withdrawals from your traditional
  IRAs that are included in your income" — https://www.irs.gov/instructions/i5329
- Treas. Reg. 1.199A-3(b)(1)(vi) ("the deduction for contributions to qualified retirement plans under section 404 ... on a
  proportionate basis to the gross income received from the trade or business") — https://www.law.cornell.edu/cfr/text/26/1.199A-3
- IRC 219(f)(1) and 401(c)(2)(A)(v)-(vi) — https://www.law.cornell.edu/uscode/text/26/219 ,
  https://www.law.cornell.edu/uscode/text/26/401 ; Publication 590-A (2025), "Self-employment income" —
  https://www.irs.gov/publications/p590a
- IRC 223(b)(7) ("zero for the first month such individual is entitled to benefits under title XVIII ... and for each month
  thereafter") — https://www.law.cornell.edu/uscode/text/26/223 ; CMS product 11036 (Part A "will start 6 months back from the
  date you apply for Medicare (or Social Security/RRB benefits), but no earlier than the first month you were eligible"; automatic
  Part A and B at 65 for someone already getting Social Security; stop HSA contributions 6 months before applying) —
  https://www.medicare.gov/publications/11036-enrolling-medicare-part-a-part-b.pdf ; medicare.gov "Working past 65" —
  https://www.medicare.gov/basics/get-started-with-medicare/medicare-basics/working-past-65
- 3121(a)(5)(G) (cafeteria-plan HSA contributions are not FICA wages) is the engine's existing Q104 reading; not re-read here.

**Readings the auditor should look at:** a Roth conversion's taxable part counted as a traditional IRA distribution "included in
gross income under 408(d)(1)" for 4973(b)(2)(A) (it is includible through 408A(d)(3)(A)'s "would be includible" language; Form
5329 line 11 says withdrawals included in income); the model's plan-wide 414(v)(7)(B) effect reduced to this participant; the
Medicare start for someone with no benefit entered kept at 65.

## 5. Known limits introduced or left (for the owner and eb)

- Medicare premiums, IRMAA and the R43 idle-spouse Medicare rule still start at 65 and the household date (another round's area);
  only the HSA reads the new Medicare start. A claim after 65 therefore has HSA contributions to 66.5 (say) while the model charges
  Medicare premiums from 65.
- A partial first row's wages stand for the prior year's FICA wages in the second row (no earlier-in-year income: AA1-31's planned
  input should feed it).
- `seDeductibleHalfFor()` does not know the owner's HSA salary reduction (it is set after compensation is read), so above the
  wage base the compensation can read slightly high.
- The 4973 excess of an owner who dies stays with them; the accounts move to the survivor, so the cap ends the tax.
- The validator's earned-income contribution warning (R45) still reads gross SE profit.
- No form control for `planOffersRoth`.

## 6. Suggested text for eb's files (not edited here)

- **MODEL_ASSUMPTIONS.md (tax rules after 2026 / R36 section):** "The enhanced senior deduction (IRC 151(d)(5)(C)) applies only
  to tax years beginning before 2029; plan year k is tax year 2026 + k, so from plan year 3 (2029) there is none. (S5AA R47, AA1-30,
  reversing Q165's 'keep it after 2028'.)"
- **MODEL_ASSUMPTIONS.md (contributions):** "Above the IRC 414(v)(7) threshold ($150,000 of prior-year FICA wages used for 2026,
  indexed), a pre-tax workplace plan's catch-up is deposited to a designated Roth balance of the same plan and taxed in the year.
  Prior-year wages are the entered figure for the first year and the prior year's projected salary from that employer, less any
  HSA salary reduction, after that. A plan marked as offering no Roth contributions allows no catch-up then (414(v)(7)(B))."
- **MODEL_ASSUMPTIONS.md (limit policy):** "Under 'Show warning and permit it', an IRA or HSA excess stays in the account and pays
  IRC 4973's 6% each year on the excess carried at year end (at most 6% of those accounts' value), reduced by distributions
  included in income (any Roth IRA distribution) and by later unused contribution room; it is paid with the next year's taxes.
  401(k) excess deferrals are not charged it."
- **MODEL_ASSUMPTIONS.md (self-employment):** "Self-employment counts as compensation net of the deductible half of its SE tax.
  Pre-tax plan deferrals funded from SE pay (the part the salary cannot cover) reduce qualified business income in proportion."
- **MODEL_ASSUMPTIONS.md (HSA):** "HSA contributions stop when Medicare starts: 65 for someone who claims Social Security by 65 or
  has no benefit entered, otherwise six months before the claim; an entered Medicare start age overrides it. Medicare premiums
  still start at 65."
- **FEATURES.md:** two new inputs, "Medicare starts at (your age)" and "Spouse Medicare starts at"; the designated Roth catch-up;
  the 4973 excise under "warn".
- **SPRINT_QUESTIONS.md:** Q165's refinement is reversed by the owner's AA1 decision of 2026-10-03 (AA1-30), implemented at
  `f02e26a` (S5AA R47); a new entry recording the five AA1 decisions as implemented, with the readings in section 4.

## 7. Decisions for the owner

- Whether Medicare premiums (and IRMAA's first year) should follow the same Medicare start as the HSA (today: 65).
- Whether `planOffersRoth` needs a form control.
- The conversion reading in 4973(b)(2)(A) (section 4), if the auditor disagrees.
