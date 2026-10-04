# S5AA R50 — build report: the Roth IRA basis ledger (AA1-36), and income earlier in the first tax year (AA1-31)

*Written by Claude on 2026-10-03 (Arizona, UTC−7). Branch `sprint/s5aa-r50`, built in the worktree from `ba9946d` (the R45 round). Not
pushed, not tagged, no baseline registered: integration, the full gate, the 4.7 declaration and the browser check are the
coordinator's.*

## 1. Commits

| commit | what |
|---|---|
| `88b7496` | prediction record, the corpus scan and test-exposure hook with their outputs, the witness run on `ba9946d` (A-01) |
| `2d9ede3` | the repair (engine, contract, app), the 26-case witness file, the adapted tests and fixtures, the registers and the rebuilt app |
| this commit | records: the measurement scripts and outputs, the captures, the C1 check, this report |

## 2. What changed

**AA1-36, the Roth IRA basis ledger** (`src/engine.js`; primary sources in §6).
- Each owner's Roth IRAs share one ledger (`newRothLedger()`, kept on `iraBasisState.roth` beside the Form 8606 basis): basis (regular
  contributions), each tax year's conversions with their taxable and nontaxable parts, the five-year period's first year.
- Every Roth IRA distribution runs through it in the statute's order (`rothIraTake()`): basis, conversions oldest year first (taxable
  part first), earnings. Qualified (59½ or older and the period run): untaxed, as before. Not qualified: basis free; a conversion
  dollar inside its five years bears the 10% on its taxable part; earnings are ordinary income and bear the 10%; the 10% is
  `earlyWithdrawalPenaltyRate()`'s (stops at 59½; the household exception applies; the Rule of 55 does not reach an IRA).
- Inputs: `accounts[].contributionBasis` (absent = 0; `ROTH_IRA_BASIS_NOT_ENTERED`, a WARNING, once per run when the default prices a
  dollar); `profile.rothFirstContributionYear` and `profile.spouseRothFirstContributionYear` (absent: met when a Roth IRA is held at
  the start, `ROTH_FIVE_YEAR_ASSUMED` once per run when a distribution at 59½+ in plan years 0–4 rests on it; else the first Roth IRA
  inflow's year).
- Readers: the draw (`withdrawFromAccountList()`), the tax quote (`rothQuotePieces()`: per account and ledger segment when a segment
  is taxed, else the old pooled piece, bit for bit), the optimizer (`rothExposureWeight()`: earnings at 30 + 45 while the 10%
  applies, conversions inside five years at 45, as a share of the Roth class), contributions, conversions, transfers (into a Roth
  IRA: conversion / contribution / Roth 401(k) rollover at 59½+ as basis; out of a Roth IRA: a distribution at the transfer's own
  age), succession (`rothLedgerSuccession()`: basis and conversions pass; the earlier period end), Monte Carlo (the two disclosures
  carried from a later path, as the flag is).
- **Roth 401(k): left as today and disclosed** (decided in the round; justification in the prediction record, rule 7). The flag
  `UNSUPPORTED_ROTH_ORDERING` now fires only for a Roth 401(k) or a custom tax-free account drawn before 59½; text and `exclusion`
  say so.

**AA1-31, `profile.priorIncomeThisYear`.** `estimateTaxes()` is now a wrapper over the old function (`estimateTaxesForYear()`): on a
partial first row with the input entered, federal (with NIIT) and Arizona tax = tax(prior + row) − tax(prior alone); payroll and SE
tax unchanged; the row's MAGI measures stay the row's own. The funding solver's mirror adds the prior income to its ordinary base and
the prior-alone tax to `Tbase` (`quoteTaxFunding()`). The last row at a death is untouched (Pub. 559).

**Contract** (`src/plan-value-contract.json`): `profile.priorIncomeThisYear` ≥ 0; the two first-year fields 1998–2200;
`accounts[].contributionBasis` ≥ 0. **App** (`src/app-shell.html`): the three profile inputs (read, written, in `staticIds`), the Roth
IRA basis input in the account editor, the 15 new engine functions in `workerFunctions`; `defaultPlan` unchanged.

## 3. Predicted against measured

Expanded captures at `2d9ede3` and at `ba9946d` (a scratch worktree, node_modules by junction; its capture equals r24 on all 71
entries), compared entry by entry (`prediction/r50_measure.js`, output `prediction/r50_measured_2d9ede3_vs_ba9946d.txt`; captures in
`prediction/`). **Exactly the seven predicted entries differ.**

| entry | predicted | measured | verdict |
|---|---|---|---|
| `seed:3` | taxes up ~$50k–$90k; final total down by more; flag off; both disclosures on | lifetime taxes +$73,155.38; final −$137,584.91; flag off; `ROTH_FIVE_YEAR_ASSUMED`, `ROTH_IRA_BASIS_NOT_ENTERED` on | as predicted |
| `seed:14` | HSAs drawn 56–59 instead of the Roth; taxes stay $0; final total moves only by return differences; flag off; no basis disclosure | rows 57–74 move in `hsa` and `roth` (totals, spending and withdrawals by at most $0.000000005, floating point); lifetime taxes $0 → $0; final total unchanged; flag off; no disclosure | as predicted |
| `seed:9` (MC) | 52/52 paths named; published may move; flag off; basis disclosure on | 52/52 changed, all named; published moved (lifetime taxes +$1,319,614.17, final −$777,718.55, success 100 → 100); as predicted for issues | as predicted |
| `golden:monte-carlo-fixed-seed` (MC) | 7 paths named; published may move; flag off; basis disclosure on | 16 paths changed (the 7 named and 9 more); published moved (24 rows, from 58; success and medians of total and taxes unchanged); flag off; **no** basis disclosure | **misses SA50-C, SA50-D** |
| `expansion:monte-carlo-sensitive-band` (MC) | 95 paths named; published may move; flag off; basis disclosure on | 110 changed (the 95 and 15 more); published moved (lifetime taxes +$168,260.75, final +$1,652,839.11, success 84.6 → 84.6); flag off; disclosure on | **miss SA50-C** |
| `targeted:survivor-stateful` | `ROTH_FIVE_YEAR_ASSUMED` only | exactly that; no row moves | as predicted |
| `expansion:s5aa-r19-ira-contribution-conversion-same-year` | flag removed only | exactly that | as predicted |

Path-level detail: `prediction/r50_mc_paths_at_2d9ede3_vs_ba9946d.txt` and `prediction/r50_mc_paths_named_vs_changed.txt`.
**C1 after the build** (`prediction/r50_c1_check.js`, output `r50_c1_check_at_2d9ede3.txt`): the scan's opening ledger equals
`newRothLedger()` on 71 of 71 corpus plans; its ordering equals `rothIraTake()`/`rothQualified()` on 3,456 of 3,456 grid cases.
**Witnesses:** 15 repair cases failed at `ba9946d` with the pre-repair figure, 11 controls passed (`witness_runs/r50_tests_at_ba9946d.txt`);
all 26 pass at `2d9ede3` (`witness_runs/r50_tests_at_2d9ede3.txt`). The file's SHA-256 moved from `85502ec9…7fbfb5` (prediction) to
`78e97c8a…7f08` at `2d9ede3`: the SA50-A correction, and one added input case (`spouseRothFirstContributionYear` as text or 2201).

**Tests** (targeted runs only; 214 files at concurrency 3 after the repair: 2,016 tests, 2,005 pass, 9 authorized todos; the two
failures are 4.7, left to integration, and a capture-boundary 5.4 case that passes alone — a concurrent test rewrites an input file
under it):

| test | predicted | measured |
|---|---|---|
| `audit-s5aa-r23-roth-flag-follows-draws`, `-r23-roth-flag-worker`, `-r24-transfer-age-at-59-half`, `audit-s5aa-supported-domain` | fail; adapt by intent | failed (4 + 2 + 3 + 3 cases); adapted (§4) |
| `golden-scenarios` (Monte Carlo golden) | may fail | failed; fixture regenerated (§4) |
| `schema-catalogue` | fail | failed; snapshot regenerated (§4) |
| `control-corpus` 4.7 | fail until declared | fails; declaration pending (§5) |
| the conservation and comparison tests (`household-ledger`, `reconciliation-invariant`, `networth-reconciliation`, `boolean-flag-contract`, `corpus-invariant`) | pass | pass |
| candidates that might pin a figure (`audit-q70-claim-age-bounds`, `audit-s5aa-r45-spouse-retirement-dates`, `debug-module`, `worker-parity`, `near-miss-survivor-sweep`, …) | possibly fail | pass |
| `corpus-configured-paths` | not named | **failed: miss SA50-B** |
| `scenario-generator` ("nothing declared fixed that the engine reads") | not named | **failed on the build, fixed before commit: SA50-E** |

## 4. Misses, and the tests adapted

**Misses.**
- **SA50-A (a witness derivation).** The widow case filed the year of the death single; it is a joint year (the engine's F-02
  convention; IRC 6013(a)(2) allows the joint return for the year of death). $1,758.06 / $8,241.94 was expected; $1,666.67 / $8,333.33
  is right (E = 15,000 + x under the $32,200 deduction, x = 0.1E). Corrected in the test with a note.
- **SA50-B (`corpus-configured-paths`).** `retirement.preserveRoth` stopped executing in the corpus. Its only executing scenario,
  `seed:19` (Roth IRA, no basis entered, optimized order), drew the Roth at 45 with the switch off; R50's ledger weight already ranks
  that Roth behind the HSA, so the switch no longer changes its draws (measured: on `ba9946d` the switch-off variant raised the flag
  at 45; at `2d9ede3` the two variants are identical). `seed:19` itself does not move. Re-pinned in `tools/corpus-path-gaps.json`
  (within the test's frozen `GAPS_WHEN_PINNED`, so the shrink-only test holds), with a `regrown` entry saying why. The scan looked
  only at plans' own draws, not at a switch's counterfactual.
- **SA50-C (Monte Carlo paths, C4/A-11).** Changed and not named: golden 9 paths (3, 31, 59, 155, 170, 217, 222, 310, 462), sensitive
  band 15 (66, 159, 174, 178, 188, 264, 271, 312, 321, 325, 342, 355, 368, 384, 386). The scan named only paths whose draws hit a taxed
  segment and argued the optimizer weight was subsumed. It is not: the weight reads the exposed *share* of the Roth class, so it also
  re-ranks a path whose early Roth draw comes wholly from basis (golden path 3: $19,355 at 59 against $178,500 of in-plan
  contributions — free under the ledger, yet the Roth now ranks behind the 401(k)). No published result moved that was not named.
- **SA50-D (an issue on the golden).** `ROTH_IRA_BASIS_NOT_ENTERED` was predicted for `golden:monte-carlo-fixed-seed` and is not
  raised: with the Roth re-ranked, no path draws a taxed Roth IRA dollar (the same cause as SA50-C; seed:14's trace anticipated it,
  the golden's did not).
- **SA50-E (a build defect, caught before commit).** The Monte Carlo carry read `n.state`; `tests/scenario-generator.test.js` treats any
  `.state` in the engine source as a read of `profile.state`. Written `n["state"]`, as the existing carry's comment requires.

**Adapted by intent** (each with an R50 comment in the file):

| file | before | after |
|---|---|---|
| `audit-s5aa-r23-roth-flag-follows-draws` | the expense at 45, spouse at 50 / control at 62, transfer at 45 and Monte Carlo cases draw a Roth IRA; `exclusion` "non-qualified Roth withdrawals" | they draw a Roth 401(k) (still untaxed: same balances); `exclusion` "non-qualified Roth 401(k) and custom Roth withdrawals" |
| `audit-s5aa-r23-roth-flag-worker` | both Worker cases draw a Roth IRA | a Roth 401(k); same balances |
| `audit-s5aa-r24-transfer-age-at-59-half` | the flag cases' source is a Roth IRA | a Roth 401(k); same balances and ages |
| `audit-s5aa-supported-domain` | `withRoth()` adds a Roth IRA; the conversion case converts a traditional IRA | a Roth 401(k); the conversion case converts the same plan's traditional 401(k), with a control that the conversion runs |
| `tests/fixtures/golden-scenarios.fixtures.json` | Monte Carlo golden, summarised row at 63: `preTax` 8,955,407.79 | 8,950,413.62 (the only field that moved) |
| `tests/fixtures/schema-catalogue.fixture.json` | issue `state` fields `carriedTo`, `exclusion`, `firstDrawOwnerAge`, `outsideSupportedDomain` in the catalogued run | removed (the run no longer raises the flag) |
| `tools/corpus-path-gaps.json` | gaps: `guytonSkipInflation` | + `retirement.preserveRoth` (SA50-B) |

## 5. Pending, and why

- **4.7's declaration** (`tools/control-candidate-prediction.json`): the control movers are `seed:3`, `seed:9`, `seed:14`,
  `golden:monte-carlo-fixed-seed` (figures and issues) and `targeted:survivor-stateful` (issues). The differences 4.7 finds at
  `2d9ede3` are in `prediction/r50_control_differences_at_2d9ede3.txt` (398 undeclared, 384 declared and not found — the older
  declarations of the same scenarios' rows); the script `prediction/r50_control_differences.js` re-runs it on the integrated tree. Left
  to the coordinator because the exact differences depend on the order the parallel rounds land in.
- **The app shows neither new disclosure** (it renders only a short list of engine issue codes as cards) — the disclosure round's area.
- **The browser check** (task 6.5) of the three profile inputs and the Roth IRA basis input — the coordinator's integration.
- **No baseline registered** (rule).

## 6. Tax law checked at the primary source (read 2026-10-03)

- IRC 408A(d)(1), (d)(2)(A)–(B), (d)(3)(F)(i)–(ii), (d)(4)(A)–(B): <https://www.law.cornell.edu/uscode/text/26/408A> — the
  exclusion, the qualified-distribution test and its five-taxable-year period, the conversion recapture limited to the includible
  amount, aggregation, and the ordering (contributions, then conversions FIFO, taxable portion first).
- Treas. Reg. 1.408A-6 A-1 to A-10: <https://www.law.cornell.edu/cfr/text/26/1.408A-6> — A-2 (one period per owner, from the first
  regular or conversion contribution's year), A-3 (a spouse treating as own is not a beneficiary), A-4 (prior distributions count
  "whether or not they were qualified"), A-5 (the 10% on earnings and on conversions within five years; exceptions apply), A-7(b) (a
  spouse's period ends at the earlier), A-8/A-9 (the order, year-end aggregation, same-year contributions and conversions aggregated).
- Treas. Reg. 1.408A-10 A-3, A-4: <https://www.law.cornell.edu/cfr/text/26/1.408A-10> — a designated-Roth rollover: investment in the
  contract is regular contribution, all of a qualified distribution; the Roth IRA period starts no later than the rollover year.
- Treas. Reg. 1.402A-1 A-4, A-6: <https://www.law.cornell.edu/cfr/text/26/1.402A-1> — the designated-Roth period of participation is
  per plan; IRC 72(e)(8): <https://www.law.cornell.edu/uscode/text/26/72> — pro-rata recovery (the Roth 401(k) decision); 72(t)(3)(A) —
  the Rule of 55 does not apply to an IRA.
- IRC 6013(a)(2): <https://www.law.cornell.edu/uscode/text/26/6013> — the joint return for the year of a death (SA50-A).
- IRS Pub. 559, "Standard Deduction": <https://www.irs.gov/publications/p559> — "the full amount of the appropriate standard deduction
  is allowed regardless of the date of death" (the last row needs nothing).
- A.R.S. 43-1011(A): <https://www.azleg.gov/ars/43/01011.htm> — Arizona tax "for each taxable year on the entire taxable income"
  (AA1-31's whole-year treatment for Arizona).

## 7. Suggested text for eb's files (not edited here)

**MODEL_ASSUMPTIONS.md** — the Roth section (Q111's): *"A Roth IRA keeps a basis ledger per owner (IRC 408A(d)(4); Treas. Reg.
1.408A-6): regular contributions, then each year's conversions (taxable part first), then earnings. A distribution that is not
qualified — the owner under 59½ at the year's opening (a transfer at its own date), or the owner's five-year period not run — takes
contributions free, bears the 10% on a conversion's taxable part within five years of it, and is taxed on earnings, with the 10%
under 59½. Opening basis is the entered contribution basis (blank = none, the cautious reading, disclosed); the five-year period runs
from the entered first-contribution year, or is taken as met for a Roth IRA held at the start (disclosed). A surviving spouse takes
over the ledger. A Roth 401(k) or custom tax-free account is still modelled as untaxed at every age and is flagged when drawn before
59½. Not modelled: conversions before the plan (enter those older than five years as basis), the disability and first-home
exceptions, and a transfer into a Roth IRA dated after the year's draw counting before it."* — §25 (partial rows): *"When income
received earlier in the plan's first tax year is entered, a partial first row's federal and Arizona income tax is the tax on the
whole year's ordinary income less the tax on the earlier income alone; payroll tax is unchanged, and the row's MAGI (IRMAA, the IRA
deduction) is still the row's own. Blank, the partial row is taxed as a whole year holding only its own income, as before. The last
row ending at a death is correct as it is."*

**FEATURES.md** — omissions: replace "Roth ordering and five-year clocks" with *"Roth 401(k) basis recovery and its plan five-year
period (a Roth IRA's ordering and clocks are modelled since S5AA R50); Roth IRA conversions made before the plan."* Inputs: *"Roth IRA
contribution basis; first Roth IRA contribution year (each spouse); taxable income received earlier in the first year."*

**SPRINT_QUESTIONS.md** — Q111: *"Narrowed by S5AA R50 (the owner's AA1 decision on AA1-36, 2026-10-03): Roth IRAs are modelled;
the exclusion remains for a Roth 401(k) or custom tax-free account drawn before 59½."* Q172: *"S5AA R50 (AA1-31): an optional
`profile.priorIncomeThisYear` completes the first partial year when entered; blank keeps the disclosed convention."* New entries for
the owner (below).

## 8. For the owner

1. **Roth 401(k) left as today (disclosed)** rather than pro-rata — confirm, or ask for 72(e)(8) with a per-plan basis input.
2. **The optimizer's Roth weight** reads the exposed share of the Roth class, so it re-ranks a Roth whose early draws would come from
   basis (SA50-C). An ordering-aware weight (cost of the next dollar drawn) would move fewer plans; the share form matches the HSA
   weight. Keep, or ask for the ordering-aware form.
3. **`ROTH_FIVE_YEAR_ASSUMED`** fires for any 59½+ Roth IRA distribution in plan years 0–4 by an owner who held a Roth IRA at the start
   with no year entered — a common case in the test plans. Keep as decided ("DISCLOSE"), or narrow it.
4. **The first partial row's MAGI** stays the row's own when earlier income is entered (the Medicare round's area): the IRMAA lookback
   two years later still reads part of the year (R35 completes it at last year's rate or the row's own).
