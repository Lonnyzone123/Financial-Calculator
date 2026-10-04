# S5AA R50 — prediction record: the Roth IRA basis ledger, and income earlier in the first tax year

*Written by Claude on 2026-10-03 (Arizona, UTC−7). Committed before any R50 edit to `src/` (A-01), and held to
`audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md`. Base: `sprint/s5aa-r50` at `ba9946d` (the R45 round; source
`s5aa-r45-source` = `9c7790e`).*

## The round

The owner's AA1 decisions of 2026-10-03 (`audit/S5AA/AA1/S5AA_AA1_CLAUDE_VERIFICATION_20261003.md`, "The owner's decisions"):

**AA1-36, a Roth IRA basis ledger (scope L).** Primary sources read 2026-10-03: IRC 408A(d)(1)–(4) (law.cornell.edu); Treas. Reg.
1.408A-6 A-1 to A-10 and 1.408A-10 A-3, A-4 (law.cornell.edu, eCFR text); 1.402A-1 A-4; IRC 72(e)(8).

1. **One ledger per owner** over all their Roth IRAs (408A(d)(4)(A); 1.408A-6 A-2, A-9): basis (regular contributions), then each
   tax year's conversions, oldest first, each year's taxable part before its nontaxable part, then earnings (408A(d)(4)(B); 1.408A-6
   A-8). **Every** Roth IRA distribution uses the ledger up in that order, qualified or not (408A(d)(4)(B)(i), "when added to all
   previous distributions"; 1.408A-6 A-4, prior distributions "whether or not they were qualified").
2. **`accounts[].contributionBasis`** (Roth IRA only; dollars of regular contributions already in the account): contract list entry,
   finite number ≥ 0, account-editor input. Absent = 0 (conservative), disclosed by a new WARNING `ROTH_IRA_BASIS_NOT_ENTERED` once
   per run, when the default actually prices a dollar (a non-qualified distribution reaches earnings, its owner having held Roth IRA
   money at the start with no basis entered on any of their Roth IRAs).
3. **In-plan inflows.** A regular contribution to a Roth IRA adds basis; a conversion (the annual conversion or a pre-tax → Roth IRA
   transfer) is recorded by its tax year with its taxable and nontaxable parts; a taxable- or HSA-to-Roth-IRA transfer (a
   contribution) adds basis; a Roth 401(k) or custom-Roth rollover into a Roth IRA adds basis only when its owner is 59½ or older on
   the transfer date (1.408A-10 A-3: a qualified designated-Roth distribution is all regular contribution; otherwise the investment in
   the contract, which the plan does not record, is taken as 0 — conservative, said in the text).
4. **The five-year period** (408A(d)(2)(B); 1.408A-6 A-2): from `profile.rothFirstContributionYear` /
   `profile.spouseRothFirstContributionYear` (calendar years, 1998–2200); absent, met when the owner holds a Roth IRA balance or basis
   at the start — disclosed by a new WARNING `ROTH_FIVE_YEAR_ASSUMED` once per run when a distribution at 59½ or older in plan years
   0–4 rests on it — else it starts with the first tax year a Roth IRA of the owner receives money. Plan year k is tax year 2026 + k
   (the engine's existing convention).
5. **Qualified** (59½ or older at the engine's ages — the year-opening age for a pooled draw, a transfer's own date — and the period
   run): untaxed, as today. **Not qualified:** basis free; a conversion dollar within five tax years of its own year bears the 10% on
   its taxable part while under 59½ (408A(d)(3)(F); 1.408A-6 A-5(b)); earnings are ordinary income and, under 59½, bear the 10%
   (1.408A-6 A-5(a)); the 10% reads `earlyWithdrawalPenaltyRate()` (so `advanced.penaltyException` applies; the Rule of 55 does not
   reach an IRA, 72(t)(3)(A)).
6. **Succession.** A surviving spouse who treats the Roth IRA as their own takes its basis and conversions; their five-year period ends
   at the earlier of the two (1.408A-6 A-7(b)); their own age decides (A-3).
7. **Roth 401(k): left as today and disclosed (decided here).** 72(e)(8) recovers basis pro rata per plan against the investment in
   the contract, and the designated-Roth qualified test runs on a separate five-year period of participation per plan (1.402A-1 A-4);
   the plan records neither, and in-service access is plan-specific. The corpus holds no Roth 401(k) drawn before 59½ (scan below).
   The common path, separation and a rollover into a Roth IRA, is modelled by rule 3. `UNSUPPORTED_ROTH_ORDERING` stays only for a
   Roth 401(k) or a custom tax-free account drawn before 59½, with text saying so.
8. **The optimizer** ranks the Roth class behind its exposed share: for each non-qualified owner, earnings (income weight 30, plus 45
   while under 59½) and conversions inside their five years (45 while under 59½), as a share of the Roth class — the scale the HSA
   weight already uses. A qualified owner, or a ledger with nothing exposed, adds nothing.

**AA1-31, income earlier this tax year.** `profile.priorIncomeThisYear` (finite ≥ 0; contract scalar; form input; `staticIds`):
ordinary income received earlier in the plan's first tax year. When entered and the first row is partial, that row's federal (with
NIIT) and Arizona income tax = tax(prior + row) − tax(prior alone), inside `estimateTaxes()` (so the quote's verification, the commit,
the baseline and pay-first all read it), mirrored in the funding solver by adding the prior income to the ordinary base and the
prior-alone tax to `Tbase`. Payroll and self-employment tax are not recomputed: they are charged on the row's own wages and
profit, and the prior figure is total ordinary income with no wage split (FICA is per wage payment, and the earlier months' FICA was
withheld when paid; the only interaction, the year's OASDI base and the 0.9% threshold, is a recorded limit). The row's MAGI measures
(the IRMAA lookback, the IRA deduction phase-out, the displayed AGI) keep the row's own income — the Medicare round's area; recorded.
The last row ending at a death is correct as it is (IRS Pub. 559: "the full amount of the appropriate standard deduction is allowed
regardless of the date of death") and is left alone.

## The checklist

**C6, the readers** (`src/engine.js` at `ba9946d`), and each one's condition:

| reader | today | R50 | condition |
|---|---|---|---|
| `withdrawFromAccountList()` :2390 (spending and tax-funding commits) | a Roth dollar is untaxed; `earlyRoth` flags any Roth type | a Roth IRA dollar runs through the ledger (income, 10%); `earlyRoth` only for a non-ledger Roth | ledger |
| `quoteTaxFunding()` :1941, Roth class (pooled piece :2028) | one free piece | per account and ledger segment, each with its rIncome/rPenalty, when any segment is taxed; else the pooled piece (bit for bit) | ledger |
| `taxSegmentLocal()` :936 / `solveSegmentFunding()` :1080 | read the pieces | unchanged for Roth; AA1-31: ordinary base + prior, `Tbase` + prior-alone tax | prior |
| `verifyQuoteObligation()` :1140 → `estimateTaxes()` :792 | — | AA1-31 inside `estimateTaxes()` | prior |
| `estimateTaxes()` callers :4243 (pay-first), :4344 (IRA deduction), :4352 (`taxes`, `baseline`), :4387 (commit) | pass `duration` | AA1-31 applies on the first partial row | prior |
| `effectiveMarginalRate()` :850 | no row span | unchanged (not a run path) | — |
| `smartWithdrawalOrder()` :2308 (three calls in the row loop) | Roth weight fixed | + the exposed-share weight (rule 8) | ledger |
| `earlyWithdrawalPenaltyRate()` :2358 | read | read for the Roth 10% | — |
| `noteEarlyRothDraw()` :3798, calls :4307, :4383, transfer :4118, Monte Carlo carry :5311/:5331 | every Roth type | non-ledger Roth only; new text; the two disclosures carried the same way | flag |
| contribution deposit :4004 | — | Roth IRA contribution → basis | ledger |
| `convertPreTaxToRoth()` :2951 | — | conversion → tranche | ledger |
| `runTransfer()` :4072–4118 | Roth out: flag only | Roth IRA out: a distribution (income to `transferTaxable`, 10% to `transferPenalty`); inflows per rule 3 | ledger |
| death handoff :3962–3982 | IRA basis moves | the ledger merges (rule 6) | ledger |
| row loop :3909 | — | the ledger's tax-year index | ledger |
| input gate / `plan-value-contract.json` | — | the four new fields | inputs |

**Pinned text, ids and lists (the R45 lesson).** Searched in `tests/` and `src/`: the `UNSUPPORTED_ROTH_ORDERING` text and state
(`exclusion`, `carriedTo`, `firstDrawOwnerAge`) are pinned by `audit-s5aa-r23-roth-flag-follows-draws`, `-r23-roth-flag-worker`,
`-r24-transfer-age-at-59-half`, `audit-s5aa-supported-domain` (X02) and the issue-state shape in `tests/fixtures/schema-catalogue.fixture.json`;
each draws a **Roth IRA** before 59½, so each is expected to fail and to be adapted by intent (its fixture moves to a Roth 401(k),
which keeps the flag, or its figure is re-derived). No form label or input id changes; new ids join `staticIds` (held by
`audit-s5aa-r45-carried-test-gaps`); new top-level engine functions join `workerFunctions` in the same commit (SA45-A); `defaultPlan`
does not change.

**C1.** The ledger does not exist before the edit, so the scan taps the pre-R50 engine (read-only, asserted output-neutral) for every
Roth draw with its owner and owner's age, every Roth IRA inflow, every transfer and every death, and replays them through rules 1–6
(R45's precedent: mirrored where no helper exists yet). After the build the record checks the scan against the engine.

**C2.** No cap: not applicable. **C3.** A Roth draw counts only when a dollar moves (the tap fires on `w > 0`).

**C4.** Monte Carlo plans are named with their exposed paths (every path replayed with its own seeding): "the published result may
move".

**C5.** Directions below are hand traces from the base draws; seed:14's is checked on the pre-R50 engine with the order the optimizer
will use.

**C7.** Every witness repair case has a near-miss control beside it in the witness file; on `ba9946d` the 15 repair cases fail with the
pre-repair figure and the 11 controls pass (`witness_runs/r50_tests_at_ba9946d.txt`).

**C8, how each comparison reads the moving fields.** The expanded capture stores the whole result (rows and issue records) and is
compared entry by entry; control 4.7 compares the control capture through `tools/differential-harness.js`, issues included (R23's
declaration counted "one issue fewer each"), so every control mover below — figures or issues — must be declared in
`tools/control-candidate-prediction.json` at integration (pending for the coordinator: the differences depend on the order the rounds
land in). Golden fixtures and tests pin live output.

## Predictions

### 1. The corpus

`prediction/r50_corpus_scan.js` on `ba9946d` (`prediction/r50_corpus_scan_at_ba9946d.txt`). No corpus plan carries an R50 input, so
AA1-31 moves nothing and every Roth IRA opens with basis 0. No corpus plan draws a Roth 401(k) or custom Roth before 59½.

**Figures move (control and expanded):**
- **`seed:3`** (historical, manual order `roth,…`, head of household, $1.09M Roth IRA, $3.47M taxable): the Roth is drawn at 58
  ($18,731) and 59 ($51,441), before 59½, all earnings. Direction: taxes up, the Roth lower from 58. Size: $70,173 of earnings
  becomes ordinary income with the 10%, at the plan's marginal rate (its row at 59 already pays $107,313, so 24%–35% federal) plus 2.5%
  Arizona, and the funding draws are themselves Roth earnings (gross-up): about $50,000–$90,000 more lifetime tax; the final total
  ($12.73M) falls by more, with 15 years of lost growth. From 60 the draws are qualified.
- **`seed:14`** (historical, optimized order, single, $1.35M Roth IRA beside three HSAs): today the Roth pays $700,750 at 56–59. With
  the Roth fully exposed the optimizer ranks the qualified HSAs first; on the pre-R50 engine with that order the HSAs pay every dollar
  of 56–60 and no Roth dollar is drawn before 59½. So: the composition moves (HSAs drawn 56–59, the Roth kept), lifetime taxes stay $0,
  and the final total moves only by the accounts' return differences (direction by their allocations; small against $6.64M). From the
  row at 60 the Roth is qualified and ranks first again.
- **`seed:9`** (Monte Carlo, manual): 52 of 52 paths exposed, path 0 among them — named; the published result may move (and very likely
  does).
- **`golden:monte-carlo-fixed-seed`** (Monte Carlo, optimized): 7 of 500 paths exposed (240, 256, 282, 341, 408, 427, 496), path 0 not —
  named; the published result may move. Being optimized, a path may instead reorder (as seed:14) and draw no taxed Roth dollar.
- **`expansion:monte-carlo-sensitive-band`** (expanded only; Monte Carlo, optimized): 95 of 500 paths exposed, path 0 not — named; the
  published result may move.

**Issues only (no figure):**
- `UNSUPPORTED_ROTH_ORDERING` is removed from all six entries that carry it today (the five above that draw a Roth IRA early, and
  `expansion:s5aa-r19-ira-contribution-conversion-same-year`, whose $993 Roth IRA draw at 45 comes from its conversion with the penalty
  exception on: free under the ledger).
- `ROTH_IRA_BASIS_NOT_ENTERED` is added to seed:3, seed:9, golden:monte-carlo-fixed-seed and expansion:monte-carlo-sensitive-band
  (on a path that still draws early); seed:14 only if a Roth dollar is still drawn before 59½ (the trace above says not).
- `ROTH_FIVE_YEAR_ASSUMED` is added to `targeted:survivor-stateful` (the spouse, 69, draws the Roth IRA inherited from the self, whose
  period is assumed met, in plan years 0–4) and to seed:3 (the Roth drawn at 60 in plan year 2).

**Every other corpus plan is unchanged.**

### 2. The tests

`prediction/r50_test_exposure_hook.js`, loaded into the 175 candidate files on `ba9946d` (`prediction/r50_test_exposure_at_ba9946d.txt`;
candidates `r50_test_exposure_candidates.txt`). Expected to fail and be adapted by intent, each recorded with before and after figures:
- the Roth-flag tests above (Roth IRA fixtures → Roth 401(k), or re-derived figures): `audit-s5aa-r23-roth-flag-follows-draws`,
  `-r23-roth-flag-worker`, `-r24-transfer-age-at-59-half`, `audit-s5aa-supported-domain`;
- tests pinning a corpus mover's live output: `control-corpus` (4.7, until the coordinator declares), `golden-scenarios` (the
  Monte Carlo golden, if its published result moves), `monte-carlo-sensitive-band`, `schema-catalogue` (the new issue states);
- any test whose plan draws a Roth IRA early and pins a figure: candidates `audit-q70-claim-age-bounds`, `audit-s5aa-r45-spouse-retirement-dates`
  (one call), `audit-cl-findings`, `audit-rb-findings`, `debug-module`, `worker-parity`, `near-miss-survivor-sweep`;
- any test pinning an exact issue list on a plan that gains `ROTH_FIVE_YEAR_ASSUMED` (many calls in the strategy, transfer and
  public-route files).
Expected to pass unchanged: the conservation and comparison tests (`household-ledger`, `reconciliation-invariant`,
`networth-reconciliation`, `boolean-flag-contract`, `corpus-invariant`), which compare two runs or reconcile flows: the extra tax is
booked as tax and funded by draws. A failure not named here is a miss.

### 3. The witnesses

`tests/audit-s5aa-r50-roth-ledger-and-prior-income.test.js`, 26 cases (SHA-256 `85502ec9…7fbfb5` at the pre-repair run). On `ba9946d`
15 repair cases fail with the pre-repair figure and 11 controls pass:

| case | expected (hand-derived) | at `ba9946d` |
|---|---|---|
| no basis, $20,000 at 50 | tax $3,209.68; Roth $76,790.32; basis disclosure | 0; 80,000 |
| basis $30,000, second year | tax $1,111.11; Roth $58,888.89 | 0 |
| qualified at 60, period assumed | disclosure raised | none |
| first contribution 2024, at 60 | tax $2,067.25; Roth $57,932.75 | 0 |
| conversion drawn in its year at 50 | tax $4,186.11; Roth $5,813.89 | $1,767.50 |
| 2026 conversion drawn at 54 | tax $2,222.22; Roth $7,777.78 | 0 |
| in-plan contribution, $8,000 draw | tax $111.11; Roth $8,888.89 | 0 |
| spouse inherits $25,000 basis | tax $1,758.06; Roth $8,241.94 | 0 |
| Roth IRA → cash at 45 | tax $1,000; cash $9,000 | 0 |
| optimizer, fully exposed Roth | IRA drawn: tax $3,209.68; Roth $100,000 | Roth drawn |
| Roth IRA at 50 | no `UNSUPPORTED_ROTH_ORDERING` | flagged |
| Roth 401(k) at 50 | untaxed, flagged, text names the Roth 401(k) | old text |
| prior $30,000, half row, $60,000 pension | tax $4,350.00 | $1,767.50 |
| prior $40,000, half row, IRA funding | tax $1,695.91 | 0 |
| new fields as text / out of range | refused by both layers | accepted |
| controls: basis covers draw; qualified at 60; 2021 first year; conversion at 60; conversion at 55; $7,000 contribution draw; basis covers both widow years; transfer of basis; optimizer with full basis; prior absent; whole first row | as before | pass |

After the repair every case passes. A derivation that proves wrong in the build is corrected and recorded as a miss.

### 4. Not done here

The full gate, the browser check (task 6.5) and the 4.7 declaration belong to the coordinator's integration.
