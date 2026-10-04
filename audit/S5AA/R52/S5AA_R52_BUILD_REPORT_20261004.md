# S5AA R52 build report: the repairs for ChatGPT's R46–R51 audit

*Written by Claude, 2026-10-04, 4:55 am (Arizona, UTC−7), on branch `sprint/s5aa-r52`, from main `2fb8c6f`; head `30720ca`.
Nothing was pushed or tagged and no baseline was registered. The control files, `tools/baseline-*`, the reference trees,
`defaultPlan` and eb's files are untouched. The coordinator's integration is in §11.*

**Result:**
- All four findings and the cards change are repaired.
- ChatGPT's 20 simulations pass 20 of 20, and only S06, S07, S10 and S17 move.
- The expanded corpus does not move: 71 of 71 entries are equal, as predicted.

## 1. Commits

| commit | what |
|---|---|
| `ebc6f38` | the prediction record, committed before any `src/` edit (A-01); the tap mirror, the corpus scan, the test-exposure run over all 443 files, and the witness and simulation runs at the base |
| `a148aa9` | the four engine and validator repairs (R47-01, R47-02, R48-01, R50-01); `rothSettleConversions` added to `workerFunctions` and the exports; the witness `tests/audit-s5aa-r52-audit-repairs.test.js` (29 cases); registers; the app rebuilt and repinned |
| `48f9c2e` | the two Roth ledger cards in `planWarningTitles`; the witness `tests/audit-s5aa-r52-app-cards.test.js` (5 jsdom cases); registers; the app repinned |
| `da41b53` | a comment and test-header citation corrected (1.408A-6 A-8(b), not A-8(b)(2)(ii)); no figure moves; the app repinned |
| `30720ca` | the measurements: captures, the C1 check, the simulation runs, the witness runs and the all-files log |

Closeout at every source commit: 12 accepted, 0 refused, 0 errors.

## 2. What changed (`src/engine.js`, `src/scenario-validator.js`, `src/app-shell.html`)

**R47-01: traditional first.** In the 4973 loop, the traditional pass records what it absorbs, `min(left, roomT)`. The Roth pass then
subtracts `max(0, min(roomR, roomT − absorbed))` where it used to subtract `roomR`.
- Since `roomR ≤ roomT` always, this is exactly 408A(c)(2)'s room once the deemed contribution counts.
- The HSA is unchanged, and so is any case where the traditional pass absorbs nothing.
- The deemed contribution gets no deduction; the deduction treatment is kept.

**R47-02: per-owner attribution.**
- Per-owner tallies of pre-tax deferrals and their workplace part are kept, keyed by the account owner; a joint account counts
  as the primary's.
- `qbiCut` is now the sum over owners of `min(max(0, D_o − W_o), S_o) × (SE_o/S_o) × min(1, Dwp_o/D_o)`.
  - `W_o` is that owner's salary × work duration. The two sum to the row's `wages`, so a one-earner plan is unchanged.
- Every reader takes this one variable: the estimator, `taxCtx.qbi`, the quote, commit and settlement, and R51's working-years
  stream tax.

**R48-01: the basis follows the money.**
- **Engine:** after `moveFunds()`, a traditional IRA → traditional IRA transfer across `iraPoolKey()` pools moves
  `basis × min(1, moved / datedPools[src])`. It moves on `iraBasisState` and on both pools' `iraBasisAtRowStart`, so later draws
  and the settlement see it.
- **Validator:** a new `inheritedIraRolloverAfterDeath()` lifts `TRANSFER_BETWEEN_OWNERS` only when all of these hold:
  - both accounts are traditional IRAs, and the plan has a spouse;
  - at the opening of the transfer's row, the source's original owner is dead and the destination's is alive. This mirrors the
    engine's opening and 0.0001 tolerance, and `householdSurvivorship()`'s "lifespan below the age".

**R50-01: the conversion ledger takes the settled split.**
- The ledger keeps per-row tallies: conversions by Roth owner and IRA pool, and the real draws taken from this year's records.
  `rothIraTake()` also returns what it took from the current year.
- A new `rothSettleConversions()` runs right after the Form 8606 settlement. Per owner:
  1. `delta = Σ(amount × settled fraction − provisional nontaxable)`;
  2. it re-forms the year's record, re-splitting that year's draws taxable part first;
  3. it returns the change in the 10%, which is added to `iraTrueUp` and the row's `taxSettled`.
- Contribution basis is never touched. When there is no delta, the result is bit-identical to before.

**The cards:** `ROTH_IRA_BASIS_NOT_ENTERED: "Roth IRA contribution basis"`; `ROTH_FIVE_YEAR_ASSUMED: "Roth IRA five-year period"`.

## 3. Predicted against measured

| | predicted (`ebc6f38`) | measured | verdict |
|---|---|---|---|
| Corpus: R47-01, R47-02, R48-01, the validator | no corpus exposure: no plan uses "warn" or has SE profit, and no transfer crosses pools | 0 entries moved | as predicted |
| Corpus: R50-01 | three expanded ledgers change (r6-gap-basis-conversion, r19-same-year, r19-conversion-and-qcd); captured output unchanged | 0 entries moved (`prediction/r52_measured_2fb8c6f_vs_48f9c2e.txt`); C1: the three records hold the scan's settled split (`r52_c1_check_at_48f9c2e.txt`) | as predicted (one reasoning slip, §6) |
| Monte Carlo (C4) | no plan exposed; no path named | no MC entry moved | as predicted |
| Expanded capture | unchanged | 71 vs 71, 0 differ; output hash `2c342c6c…` (r30's) at 2fb8c6f, 48f9c2e and da41b53; input hash `ed3731e2…` | as predicted |
| Control 4.7 | nothing to declare | the control ⊂ expanded; nothing moved | as predicted |
| Tests | all pass. The four batches that failed only under the hook were the exposure hook's own. `corpus-configured-paths` passes: `penaltyException` still executes in seed:19 and r6-gap-one-owner-draw | all 445 files in batches at 48f9c2e: 3,507 tests, 3,498 pass, 0 fail, 9 todo; witnesses 34/34 at da41b53 | as predicted |
| ChatGPT's 20 simulations | 20/20; no passing case changes | 20/20 at 48f9c2e and da41b53; only S06, S07, S10 and S17 checks or rows moved (`witness_runs/r52_chatgpt_sims_base_vs_48f9c2e.txt`) | as predicted |

## 4. Each finding: red at the base, green at the head

| finding | base (`2fb8c6f`) | head |
|---|---|---|
| R47-01 (S06) | year-2 excise 150 | 300 |
| R47-02 (S07) | tax 35,032.62418 | 35,912.62418 |
| R48-01 (S10) | validator refuses (`TRANSFER_BETWEEN_OWNERS`); AGI 37,500, tax 2,855 | valid; AGI 30,000, tax 1,767.50 |
| R50-01 (S17) | penalty 500 | 0 |
| The cards | no card | the card is shown when the engine raises the code, and not otherwise |

**The witnesses:** at the base, 26 of 34 fail with the pre-repair figure and 8 controls pass (`witness_runs/r52_tests_at_2fb8c6f.txt`); at
da41b53, all 34 pass (`r52_tests_at_da41b53.txt`).

**The repair cases:**
- **R47-01:** excise 420 (with a current contribution), 240 (with a Roth distribution), 300 (two accounts), 300 (beside an HSA excess).
- **R47-02:**
  - both owners: 40,024.530225;
  - mixed salary, employment and SE in one owner: 34,223.55;
  - quote and commit through a grossed-up IRA draw: W = 63,858.97;
  - the working-years shortfall: 712.62418 (no warning at the base).
- **R48-01:**
  - a partial move: AGI 30,000;
  - an inherited draw, then a late transfer: AGI 0, then 30,000;
  - a partial move, a draw, then the later automatic election: AGI 0 at 49 and 62;
  - the RMD reserve: AGI 0 at 76–78, RMD 3,750 at divisor 35.3;
  - the validator: transfers before the death, in the death row, Roth→Roth and own→deceased are still refused.
- **R50-01:**
  - mixed basis: 375;
  - two years' conversions: 0;
  - a scheduled-transfer conversion: 0, with Roth 2,500 left;
  - the pool grows after the conversion: 138.89;
  - the survivor takes the ledger: 0;
  - a same-year draw: settled 55,670.235, outstanding −2,487.50.

## 5. Tests adapted

None.

## 6. Misses

1. **A reasoning slip in a corpus trace; the outcome was as predicted.** For `expansion:s5aa-r19-ira-contribution-conversion-same-year`
   the prediction says "no Roth draw". In fact the Roth IRA pays $993.75 in the conversion's own row. The plan has
   `penaltyException: true`, so the rate is 0 and the output is unchanged, as predicted. The C1 check now accounts for same-year draws.
2. **The witness file's hash.**
   - The prediction recorded SHA-256 `47497748…` for `tests/audit-s5aa-r52-audit-repairs.test.js`. That was over CRLF working-copy
     bytes.
   - The committed LF blob at `a148aa9` is `f10cf22d…`, with the same content. At `da41b53` the citation fix makes it `11adcaf0…`.
   - The app-cards file matches its recorded `7d8f7e19…`.
3. **A citation.** "1.408A-6 A-8(b)(2)(ii)" in the prediction, the engine comment and the test header should be A-8(b). It is fixed in
   `da41b53`; the committed prediction keeps the old text.

No derivation was re-expected.

## 7. Law checked at primary sources (2026-10-04)

- **IRC 219(f)(6)(A)** ([law.cornell.edu/uscode/text/26/219](https://www.law.cornell.edu/uscode/text/26/219)): unused deduction room
  means the taxpayer "shall be treated as having made an additional contribution for the taxable year", up to the 4973(b)(2) excess.
- **IRC 4973(b)(2)(C) and (f)(2)(B)** ([law.cornell.edu/uscode/text/26/4973](https://www.law.cornell.edu/uscode/text/26/4973)): the
  traditional room is measured "without regard to section 219(f)(6)"; the Roth room is "over the amount contributed by the individual to
  all individual retirement plans", with no such exclusion.
- **IRC 408A(c)(2)** ([law.cornell.edu/uscode/text/26/408A](https://www.law.cornell.edu/uscode/text/26/408A)): the Roth limit is the 219
  maximum less "contributions for such taxable year to all other individual retirement plans".
- **IRC 408A(d)(3)(F):** the 10% within five years applies "as if such portion were includible".
- **Form 5329 instructions** ([irs.gov/instructions/i5329](https://www.irs.gov/instructions/i5329)):
  - Part III line 10 is the "contribution limit for traditional IRAs less your contributions to traditional IRAs and Roth IRAs";
  - Part IV's Roth limit is "reduced by the amount you contributed to traditional IRAs".
  - The statute does not itself order the two kinds. Traditional first is the owner's decision, consistent with 219(f)(6) making the
    absorbed amount a current-year contribution.
- **26 CFR 1.199A-3(b)(1)(vi)** ([law.cornell.edu/cfr/text/26/1.199A-3](https://www.law.cornell.edu/cfr/text/26/1.199A-3)): 404 and
  similar deductions are attributable "on a proportionate basis to the gross income received from the trade or business".
- **Pub. 590-B** ([irs.gov/publications/p590b](https://www.irs.gov/publications/p590b)): a spouse may treat an inherited IRA as their
  own "by rolling it over into your IRA". Basis "remains with the IRA", combined only by a spouse treating it as their own.
- **26 CFR 1.408A-6** ([law.cornell.edu/cfr/text/26/1.408A-6](https://www.law.cornell.edu/cfr/text/26/1.408A-6)):
  - A-5(b): the 10% reaches the amount includible on conversion;
  - A-7(b): spouse succession;
  - A-8(b): within a conversion, the includible portion comes out first;
  - A-9(a), (c): distributions and a year's conversions are aggregated.
- **26 CFR 1.401(a)(9)-9(b):** the Single Life Table, age 51 = 35.3.
- **26 CFR 1.401(a)(9)-5(d):** the greater of the beneficiary's and the employee's remaining life expectancy, the spouse's redetermined
  each year.

## 8. Suggested text for eb's files (not edited)

- **MODEL_ASSUMPTIONS, IRA and HSA excess:** "Under the warn policy, each owner has one IRA room per year. The year's unused room absorbs
  carried traditional excess first, and that absorbed amount counts as a contribution of the year (IRC 219(f)(6)). Carried Roth excess
  is reduced only by the room left after it. HSA room is separate."
- **MODEL_ASSUMPTIONS, QBI:** "Pre-tax workplace deferrals reduce qualified business income only to the extent the deferring owner's own
  salary cannot fund them. The rest is spread over that owner's employment and self-employment pay, and the self-employment share
  reduces QBI (Treas. Reg. 1.199A-3(b)(1)(vi)). A spouse's salary never shields the other owner's deferral."
- **MODEL_ASSUMPTIONS, inherited IRAs:** "A scheduled transfer from the deceased's traditional IRA into the survivor's own, dated after
  the death, is allowed. Form 8606 basis moves with it in proportion to the inherited IRA's value on the date."
- **MODEL_ASSUMPTIONS, the Roth ledger:** "Each year's Roth conversion record takes the year-end Form 8606 split. A Roth IRA draw taken
  the same year from that record is re-split, taxable part first, and its 10% is trued up in the next row. Contribution basis is kept
  separate from conversion principal."
- **FEATURES:** "The Results page shows the Roth IRA disclosures 'Roth IRA contribution basis' and 'Roth IRA five-year period' as cards."
- **SPRINT_QUESTIONS:** R47-01, R47-02, R48-01 and R50-01 are repaired in R52, with D1 to D4 below as open items.
- **Noted, not changed:** the app's Rules text on QBI ("20% of the profit less half its self-employment tax") does not mention
  SE-funded deferrals (true since R47). It is an app-text item for a later round.

## 9. Decisions for the owner

- **D1 (the validator's reach).** Only the deceased's traditional IRA → the survivor's own traditional IRA is accepted, as decided.
  - The engine still moves other post-death rollovers the validator refuses: Roth IRA → Roth IRA and own → deceased's (both checked
    at the base), and 401(k) → 401(k) and HSA → HSA (not checked).
  - That disagreement predates R52. The witness pins the Roth and reverse-direction refusals.
- **D2.** A same-year nondeductible contribution to the source pool becomes basis only at settlement, so a pool-changing transfer that
  year carries only the basis that existed on the date. Recorded as a limit.
- **D3.** The IRA ledger is per owner. Spousal-IRA (219(c)) cross-compensation is not netted against the other spouse's room.
- **D4.** A joint-owned workplace account's deferrals are attributed to the primary.

## 10. Housekeeping

- **Captures:** the captures at 2fb8c6f and 48f9c2e (about 2.1 MB each) are in `prediction/`. The da41b53 capture has the same output
  hash and stayed in scratch.
- **Scratch:** the base worktree and its junction were removed; the main checkout's node_modules is intact.
