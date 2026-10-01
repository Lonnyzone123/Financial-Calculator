# S5AA R43 — self-audit

*Written by Claude, 2026-10-01 (Arizona, UTC−7), before the round went to the owner. The prediction records are in this
folder, one per part. Every miss below was found by measurement, not argued away. Each is traced to its cause in the
engine's own call, and each prediction record still stands as written.*

## Prediction misses

| | part | what the record said | what happened | cause |
|---|---|---|---|---|
| SA43-A | 2 (tax), `268e80e` | `seed:3` and `seed:17` move (SA42F-08, the Roth phase-out widths) | **neither moved** (over-prediction) | every flagged row is after the plan's contribution stop (`seed:3` stops at 59, rows 62 to 66; `seed:17` stops at 60, rows 61 and 62), so no Roth deposit is made there. The scan compared the Roth *limits* and never tested the contribution window |
| SA43-B | 2 (tax) | the expanded corpus moves only where named | **`expansion:monte-carlo-sensitive-band` moved**, unpredicted: lifetime taxes 5,806,879.69 → 5,817,864.81 | SA42F-22 (joint IRMAA thresholds = 2 × single). Reverting SA42F-22 alone restores r21 exactly. The scan read the aggregated result rows, but IRMAA is charged per path, and one path's lookback MAGI sits between the old and new joint thresholds. Control 4.7 was clean (0 unpredicted): the member is in the expanded corpus only |
| SA43-C | 3 (contributions), `f4aeac1` | `seed:4` moves, and "taxes rise and the HSA and taxable balances fall" | `seed:4` moved and nothing else did, but in the **opposite direction**: taxable and taxes fell by orders of magnitude, and the HSA balance rose | `seed:4`'s HSA request compounds two future changes (+11,738% at 66, +10,705.88% at 52) to about $151M a year. The excess over the limit was redirected to taxable (contributions $152,119,451 a row at r21), and that money's income drove taxes the HSA paid. Stopping the HSA at 65 stops the redirect (contributions $718,704). Reverting only the HSA-at-65 line restores $152,119,451. The scan predicted the plan, not the direction |
| SA43-D | 4a (life events), `16f3119` | no expanded member beyond the control's | **`expansion:s5aa-r6-gap-survivor-health-roth` moved**: lifetime taxes 170,879.32 → 170,856.73; row 65 spending 0 → 3,185.68 | SA42F-11's Medicare term. The spouse's lifespan (66) equals their age at that row's opening, so the engine counts them alive in their year of death (decision 7), while their work window is 0. The scan's alive test was strict (death after the opening) where the engine's is not. The lesson: scans should call the engine's own survivorship helpers |
| SA43-E | 4b (cash flows), `5c8be5b` | `seed:8` moves (SA42F-20, "rental fixed from 49") | **it did not move** (over-prediction) | its stream starts and ends at 49, a zero-length stream that never pays. The scan did not test that a stream pays (end after start) |

**One wording error in a record:** part 4a writes the validator path as `accounts.1.owner`. The real path, which the test
uses, is `accounts[1].owner`.

## Process errors

| | what went wrong | where it stands |
|---|---|---|
| SA43-F | **A gate was started with the shell's `&`**, not the tool's background option, repeating R42's SA42-03 | that gate (part 3, `dd18f31`) ran to completion and its log was read: 3,212 tests, 0 failing. Every later gate used the background option |
| SA43-G | **Closeout refused part 2's and part 5b's first commits** with COUPLED-ONLY: each new test file called an engine internal (`irmaaMonthly`; `simulatePlan` and `rng`), so the requirements it witnessed had only implementation-coupled guards | each was rewritten to reach the engine through `runPlan` only, and the internal checks moved to a file that is coupled by design (`tests/rng-seeding.test.js`). Both commits were amended before any push. Closeout is 12/0/0 at every gated commit |
| SA43-H | **An engine comment named "D-3"**, meaning roadmap track D's item 3 (per-path seeding). The requirements register read it as a new site for FM-06's decision D-3 | reworded to "roadmap track D, item 3"; the register entry it had created is gone. The ID was Claude's and wrong, so this is not a regeneration to absorb a bad ID |
| SA43-I | **Five gates failed on tests a narrower run would have caught first:**<br>- part 3: three tests, SA-05 and R2-005 fixtures with a spouse of 70 contributing to an HSA;<br>- part 4b: six tests, the golden fixture and five AUD-006 expectations under the today's-dollar latch;<br>- part 5a: 95 tests, fixtures holding values the contract now refuses;<br>- part 5b: 18 tests, the device benchmark's fake engines (no `monteCarloPathSeed`) and the band member's reviewed input fingerprint | each was adapted, with its reason in the commit, and amended. See "Tests changed by intent". The seed change should have been run against the device benchmark and corpus-composition tests before it was committed, since both read the seeding |

| SA43-J | **The prediction records and the r22 file name carry the wrong date.** The seven prediction records say "2026-10-01 (Arizona, UTC−7)" and are named `…_20261001.md`. They were written on 2026-09-30 between 9:58 pm and 11:37 pm Arizona, as their commits' −0700 timestamps show. The shell's `TZ=America/Phoenix date` printed UTC on this machine | the records are left as committed: rewriting a committed prediction would blur A-01's order. The commit timestamps are authoritative. This self-audit, the handover and the relay were written after midnight, on 2026-10-01 |

## Tests changed by intent (flag for the auditor)

- **R10's equal-age control is now a refusal (SA42F-30).** `tests/audit-s5aa-r10-*` held that a whole-number lifespan equal
  to the start age runs. Under SA42F-30 that plan has nobody alive at the start and is refused. The control now asserts the
  refusal.
- **The contract's `accessPct` range was removed after the part 5a prediction was committed.** The engine clamps the value,
  and the earlier WARNING decision for it is kept. The validator upgrades a WARNING at the same path in place, so no path
  is reported twice.
- **About 20 older fixtures were adapted in part 5a.** Their values (misspelled account types `traditionalIra` and
  `rothIra`, income growth modes `none` and `percent`, stage mode `set`, a missing income end, equal-age lifespans, a bare
  stage) are now refused by the contract. Each test keeps its subject.
- **R2-005's HSA fixtures** use a spouse of 64 (stop at 64.5) in place of 70, and a self of 64 in place of 65.
- **Five AUD-006 expectations** use `AT_60_5 = 1.02^0.5`, the today's-dollar latch for a stream starting at 60.5.
- **The Monte Carlo band member was re-chosen by its declared rule** under the new seeds: step 31 (84.6%), family version
  7. `tools/corpus-spec-expanded.json` re-pins only its fingerprint (`pin-inputs`), as R36 did. The expanded corpus's
  input hash changes with it.
- **`tests/rng-seeding.test.js` pins the new seed scheme**, written out independently. Round D's per-path independence
  is kept.

## Declared, not repaired

- **The spousal reduction factor's adjustment** for spousal months withheld before full retirement age (carried from
  R42).
- **Two validator-only rules:** the legacy `"recurring"` income type in `targeted:spouse-cola-income`, and
  `TRANSFER_INTO_WORKPLACE_PLAN` (`seed:9`). The engine refuses the transfer, not the plan.
- **199A assumptions:** not a specified service business, material participation, and no W-2 wages or qualified
  property. SE health insurance and retirement contributions do not reduce qualified business income.
- **Medicare at 65 is assumed**, both for the HSA stop and for SA42F-11. Pre-Medicare costs keep their household rule.

## Checks

Listed with their results in `S5AA_R43_CHANGE_AUDIT_HANDOVER_20261001.md`.
