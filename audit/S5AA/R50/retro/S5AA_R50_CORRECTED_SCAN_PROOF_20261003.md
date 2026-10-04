# S5AA R50 — the corrected scan, proved on the pre-repair tree

*Written by Claude on 2026-10-03 (Arizona, UTC−7), on the owner's decision of that day: R50's prediction misses SA50-B, SA50-C and
SA50-D are not accepted as merely disclosed (as at R43 and R44). Method as R44's retro proof
(`audit/S5AA/R44/S5AA_R44_R43_04_RETRO_PROOF_20261001.md`) and R44.1's path-level check (`audit/S5AA/R44.1/exposure_superset_check.js`).
Pre-repair tree: `ba9946d`. R50 tree: `2d9ede3` (R50 alone, before any integration). Both in scratch detached worktrees with a
`node_modules` junction, removed afterwards.*

## The cause of the misses

The R50 prediction scan (`audit/S5AA/R50/prediction/r50_corpus_scan.js`) named a plan or path only where a Roth IRA distribution
reached a taxed or penalized segment of the new ledger, and argued that the optimizer's ledger weight was covered by that test. It was
not: `rothExposureWeight()` reads the exposed **share** of the Roth class, so it re-ranks the Roth in a row whose Roth draw comes
wholly from basis (golden path 3: $19,355 at 59 against $178,500 of in-plan contributions). That one reader explains all three misses:
- SA50-C: Monte Carlo paths that changed without being named (golden 9, sensitive band 15);
- SA50-D: the basis disclosure predicted for the golden and not raised (the re-ranking removes the taxed draw);
- SA50-B: `retirement.preserveRoth` stopping executing in the corpus (its counterfactual on `seed:19` is re-ranked the same way).

## The corrections (`r50_corpus_scan_v2.js`)

Each names its checklist item; everything else is v1's.
- **C6, the optimizer reader.** At every call of `smartWithdrawalOrder()` in the pre-repair run, a read-only tap records the engine's own
  arguments: the plan as the engine holds it, a copy of the accounts, the MAGI history, the prior return and that year's rules. The scan
  replays the R50 ledger to that moment. It then asks the **R50 engine's own** `smartWithdrawalOrder()` (C1) for the order with and
  without the ledger. Without the ledger, the function is the pre-repair one: the weight is 0.
- **When a path counts as exposed.** The two orders differ, **and** the row then draws from a class at or past the first place they
  differ. A class ranked before that place is reached first in both orders, so its draw, and the need or tax it meets, cannot change.
- **Why this is a necessary condition (C4).** Until the first such row, or the first taxed Roth IRA dollar, the two trees hold the same
  state. So the test may name more paths than change, but never fewer.
- **SA50-B.** For `retirement.preserveRoth`, which sits on the same Roth score, the same test is run on the plan with the switch off.
  Exposure there names `tests/corpus-configured-paths.test.js`.
- **SA50-D.** A disclosure raised by a taxed draw on an optimized plan that the optimizer test also exposes is predicted as "may be
  added", since the re-ranking can come first and remove the draw.

## The result

**The scan on `ba9946d`** (`r50_corpus_scan_v2_at_ba9946d.txt`; the path lists are in `r50_corpus_scan_v2_paths_at_ba9946d.txt` and
`exposed_paths_at_ba9946d.json`) names exactly the seven entries that moved, and `seed:19`'s switch:

| entry | v2 names | measured (R50 records, expanded captures `2d9ede3` vs `ba9946d`) |
|---|---|---|
| `seed:3` | figures from 58 (a taxed Roth IRA draw); flag removed; both disclosures added | moved; flag removed; both added |
| `seed:14` | figures from 56 (the optimizer: the Roth ranks behind the HSA, a Roth draw at or past the change); flag removed; basis disclosure "may add" | moved (HSA and Roth only); flag removed; not added |
| `targeted:survivor-stateful` | adds `ROTH_FIVE_YEAR_ASSUMED` | exactly that |
| `expansion:s5aa-r19-ira-contribution-conversion-same-year` | flag removed | exactly that |
| `seed:9` (MC) | 52 of 52 paths; published may move | 52 changed; published moved |
| `golden:monte-carlo-fixed-seed` (MC) | 16 of 500 paths; basis disclosure "may add" | 16 changed; published moved; not added |
| `expansion:monte-carlo-sensitive-band` (MC) | 111 of 500 paths; basis disclosure "may add" | 110 changed; published moved; added |
| `seed:19` | `preserveRoth` off is exposed: whether the switch still executes may change (`corpus-configured-paths`) | the switch stopped executing (SA50-B) |

No other plan is named, and no other plan moved.

**Path level** (`r50_exposure_superset_check.js`, output `r50_exposure_superset_check_ba9946d_2d9ede3.txt`). Every path of every Monte
Carlo plan in the expanded composition was simulated on both trees, as `runPlan()` simulates it on that tree: the plan's seed, with
`monteCarloPathSeed(seed, i, 0)` and `(seed, i, 1)`.

| plan | flagged | changed | every changed path flagged | flagged and unchanged |
|---|---|---|---|---|
| `golden:monte-carlo-fixed-seed` | 16 | 16 (3, 31, 59, 155, 170, 217, 222, 240, 256, 282, 310, 341, 408, 427, 462, 496) | **yes** | 0 |
| `seed:9` | 52 | 52 | **yes** | 0 |
| `expansion:monte-carlo-sensitive-band` | 111 | 110 | **yes** | 1 (path 474) |
| `seed:17` | 0 | 0 | yes | 0 |

**The corrected exposure test is a superset of every changed path in every Monte Carlo plan** (the script's last line:
`SUPERSET HOLDS FOR EVERY MONTE CARLO PLAN: true`). It names the 9 golden and 15 band paths that v1 missed. Its one over-flag (band path
474) is allowed under C4, and the published results of the three named plans moved as "may move" allows.

## For later rounds

A ranking weight is a reader of every input it reads, not only of the draws it prices. When a repair adds or changes an optimizer
weight, the scan asks the repaired engine's own ranking function, at the pre-repair tree's recorded calls, whether the order changes
where the row draws. It does not argue the reader is subsumed by another condition.
