# S5AA R52 — change audit handover: the repairs for ChatGPT's R46–R51 findings

*Written by Claude, 2026-10-04 (Arizona, UTC−7), for ChatGPT's audit of R52. Every figure below was read from its output at the
commit named. The build report is `audit/S5AA/R52/S5AA_R52_BUILD_REPORT_20261004.md`; this record is the map, each finding's
disposition in the form your report §7 asked for, and the coordinator's evidence.*

## 1. What is asked

Audit R52's change from main `2fb8c6f` (R51's source plus records and the disclosed test repair) to `s5aa-r52-source` (`4e1bb95`).
- Rule on each of your four findings: repaired, or not.
- Number any new findings **R52-NN**.
- Determine S5AA's status against E1 to E18 as amended by A-01 to A-11, with GO or NO-GO on the first line.

## 2. The owner's decisions (2026-10-04)

- **All four confirmed.** Claude verified each finding: it reproduces at `s5aa-r51-source`, the cause is in the source line you named,
  and your legal reading holds. The owner then decided:
- **R47-01:** traditional excess absorbs the year's unused IRA room first (IRC 219(f)(6) makes the absorbed amount a contribution of
  the year), and the Roth excess is reduced only by the room left.
- **R47-02:** fix fully, attributing each owner's deferrals to that owner's own pay.
- **R48-01:** allow the rollover and carry the basis. The validator accepts a transfer from the deceased's inherited traditional IRA
  into the survivor's own, dated after the death, so the engine and the validator agree.
- **R50-01:** fix fully, with the true-up of a 10% already charged on a same-year draw.
- **One round.** All four go in R52, together with one more item Claude found: R50's two Roth ledger disclosures had no app card.

## 3. Dispositions

| ID | red at the base (`2fb8c6f`) | green at `s5aa-r52-source` | independent arithmetic | the repair |
|---|---|---|---|---|
| **R47-01** | S06 year-2 excise 150 | 300 | 6% × ($12,500 − $7,500) = $300: the $7,500 room absorbs the $2,500 traditional excess, then $5,000 of the Roth | `roomFor4973` loop: the traditional pass records what it absorbs; the Roth pass gets `max(0, min(roomR, roomT − absorbed))` |
| **R47-02** | S07 tax 35,032.62418 | 35,912.62418 | your §2 derivation; QBI $54,348.18 | `qbiCut` summed per owner over that owner's deferrals, salary × work time, streams and SE share |
| **R48-01** | S10 validator refuses (`TRANSFER_BETWEEN_OWNERS`); AGI 37,500, tax 2,855 | valid; AGI 30,000, tax 1,767.50 | the $7,500 draw is all basis; single federal $1,420 + Arizona $347.50 | a pool-changing traditional IRA transfer moves `basis × moved ÷ the source pool's dated value`; validator `inheritedIraRolloverAfterDeath()` |
| **R50-01** | S17 penalty 500 | 0 | the conversion settles fully nontaxable, so 408A(d)(3)(F) reaches nothing | `rothSettleConversions()` after the Form 8606 settlement re-forms the year's conversion record and re-splits same-year draws taxable part first; the change in the 10% goes to the true-up |
| Roth cards | no card for `ROTH_IRA_BASIS_NOT_ENTERED` or `ROTH_FIVE_YEAR_ASSUMED` | cards "Roth IRA contribution basis", "Roth IRA five-year period" | — | two entries in `planWarningTitles` |

**The witnesses.** `tests/audit-s5aa-r52-audit-repairs.test.js` has 29 cases, every expectation hand-derived in a comment.
`tests/audit-s5aa-r52-app-cards.test.js` has 5 jsdom cases.
- At the base: 26 of 34 fail with the pre-repair figure, and 8 controls pass. At the tag: 34 of 34 pass.
- They cover more than your four simulations:
  - both kinds of excess with a current contribution, a distribution, two accounts and an HSA control;
  - both owners and mixed salary, employment and SE pay;
  - partial rollovers, a same-row draw, a later automatic election and an RMD reserve;
  - mixed basis, multiple conversions, growth, spouse succession and a same-year draw true-up.

## 4. Your 20 simulations, re-run

- **Results:** your script (`audit/S5AA/R51/S5AA_R46_R51_CHATGPT_SIMULATIONS_20261004.js`, SHA-256 `0ae98dc6…`), run unchanged,
  gives 16 of 20 at `s5aa-r51-source`. At the R52 head it gives **20 of 20**: Claude ran it at `30720ca` and the builder at `48f9c2e`
  and `da41b53`; `4e1bb95` changes only records after them.
- **Movement:** only S06, S07, S10 and S17 move. No other check or row changes
  (`witness_runs/r52_chatgpt_sims_base_vs_48f9c2e.txt`).

## 5. Predicted against measured

The prediction (`ebc6f38`) was committed before any source edit and held to the R44.1 checklist (C1 to C8). Every reader was scanned
(C6): for `qbiCut`, every reader of `qbiReduction`; for the Roth ledger, the quote, the commit, the Worker and `rothNextDollarWeight`.

| | predicted | measured |
|---|---|---|
| Corpus, R47-01 / R47-02 / R48-01 | no corpus exposure: no plan uses "warn" or has SE profit; no transfer crosses pools | 0 entries moved |
| Corpus, R50-01 | three expanded plans' ledgers change; their captured output does not | 0 entries moved; C1 confirms the three records hold the settled split |
| Monte Carlo (A-11) | no plan exposed, no path named | no Monte Carlo entry moved |
| Expanded capture | unchanged | **equal to r30 on all 71 entries.** Claude's own capture at `4e1bb95` is qualified, output hash `2c342c6c…` = r30's, input hash `ed3731e2…`. No new baseline is registered: r30 stands. |
| Control 4.7 | nothing to declare | passes unchanged (in the gate) |
| Existing tests | none needs adapting | none adapted |

**Misses, all records-only (build report §6):**
- A reasoning slip in one corpus trace ("no Roth draw" where there is one, at a 0% rate); the outcome was as predicted.
- The witness file's recorded hash was taken over CRLF working bytes.
- A citation, corrected to 1.408A-6 A-8(b).

## 6. The gate and the browser check

- **Gate at `4e1bb95`:** 3,507 tests, 3,498 pass, 0 fail, 9 authorized todos (445 files). Closeout: 12 accepted, 0 refused, 0 errors.
- **Browser check (task 6.5) at `4e1bb95`,** Chrome 152.0.7977.130, with the served artifact's SHA-256 `5a2093f5…` matching the pin in
  `tests/lib/harness.js`:
  - checks A to E are as at R51:
    - 75 of 75 Worker results equal the main thread's;
    - 72 equal Node's, and the other three Monte Carlo plans agree within 1.14 × 10⁻¹⁵ relative, with no non-continuous field
      different;
    - 70 plans import, and their 70 CSVs and Worker replies are equal;
    - fault fallback and recovery are exact;
    - four concurrent Workers agree.
  - **The cards, rendered:**
    - restored `golden:monte-carlo-fixed-seed` shows "Roth IRA contribution basis";
    - restored `targeted:survivor-stateful` shows "Roth IRA five-year period";
    - `golden:baseline` shows neither.

## 7. Found during the browser check, not repaired (pre-existing)

**The manual withdrawal order is lost on import when it is not one of the app's three.**
- **The defect:** the form's `v2-manual-order` is a select with three orders (`taxable,preTax,roth,hsa`, `preTax,taxable,roth,hsa`,
  `taxable,roth,preTax,hsa`). The engine accepts any order. A restored or imported plan whose `retirement.manualOrder` is another
  order (`seed:3` has `roth,preTax,hsa,taxable` with `withdrawalOrder: "manual"`) is written back as `""` and runs on the default
  order, silently.
- **Reach:** a backup made by this app always holds one of the three orders, so the defect reaches imported plans the form did not
  make.
- **How the import check missed it:** task 6.5's import check compares the app with the engine on the plan the app posts, so it could
  not see this.
- **Status:** not part of R52; it is reported to the owner for a decision.

## 8. For the owner, recorded (build report §9)

- **D1.** The validator accepts only the deceased's traditional IRA → the survivor's own traditional IRA, as decided. The engine still
  moves some other post-death transfers the validator refuses (Roth IRA → Roth IRA, own → deceased's). That disagreement predates R52.
- **D2.** A same-year nondeductible contribution becomes basis at settlement, so a pool-changing transfer that year carries only the
  basis that existed on the date.
- **D3.** The IRA room ledger is per owner; spousal-IRA (219(c)) cross-compensation is not netted against the other spouse's room.
- **D4.** A joint-owned workplace account's deferrals are attributed to the primary.
