NO-GO

# S5AA R40.1 external change audit and status determination

**Audited source:** `s5aa-r40.1-source` = `978a6e48a3727935770ff19ecee8c8706402df1d`. **Change range:** `s5aa-r39.1-source` = `a2ee714ff5a3d32fd14ac4b1f0fcbfedeed8d5fd` through the audited source. The R40 records merge on `main` is `54d6a9e3b14c353ebf2f4a82ec90d20d3aa5c878`. **Environment:** Windows 11 (`10.0.26200`), Node `v24.17.0`.

## Determination

**No new R40-NN source finding in the cases checked. S5AA is NO-GO at the audited source because E15 remains unmet.** The handover expressly discloses that the task 6.5 comparator exercise did not run. Its desktop-browser smoke was on the earlier `s5aa-r40-source` (`4a2250a`), and covered guided setup, projection, cards and console errors only. Task 6.5 requires main-thread versus an **actual Worker**, an exception and a raw export. A-04 requires the affected browser check again if later work changes the built artifact or exercised behavior. Between `4a2250a` and `978a6e4`, `investment-calculator-v2c.html` changed by 48 insertions and 45 deletions, including RMD behavior, the reversion of the partial-row tax change and input refusals. The earlier smoke therefore cannot establish the final-source browser result. The archive close record's narrowing of the second-machine condition and the two clean-worktree replays do not supply this missing check.

This is an **explicitly disclosed evidence gap**, not a new R40-NN financial finding. My Node comparator runs below support task 6.3, but do not execute an actual browser Worker. A GO would require the final, rebuilt and hash-pinned candidate to complete task 6.5 with the main-thread/Worker comparison, exception and raw export, with the result and source SHA recorded. If fixing a failure changes the source, the final candidate needs a new frozen source and affected checks repeated. This status is administrative; it is neither release qualification nor household-reference qualification. The owner retains milestone closure, tags and the start of S5b.

## R40.1 change audit

- `src/engine.js` grows the LTC cost with `advanced.healthInflation`, charges the per-person Medicare Part D base premium, reads the RMD age reached under the engine's birth-year convention, rejects a non-number adjustable-debt reset age, and reverts the initial partial-row tax scaling. The tax limitation remains expressly listed in `audit/S5AA/R40/S5AA_R40_UNREPAIRED_LIST_20260930.md`.
- `src/scenario-validator.js` validates healthcare inflation and brings adjustable-debt reset inputs into closer parity with the engine. The built HTML and hash pin were updated. I reviewed the changed source, relevant tests, prediction records, handover, self-audit, unrepaired list, r18/r19/r20 captures and source PR #35's pre-merge audit corrections. The R40 prediction record was committed before the first implementation edit (`e54125a` before `8f20d90`); its corrective addendum preceded the correction (`20e7a41` before `b97fe0a`).
- [CMS's 2026 Parts C and D announcement](https://www.cms.gov/files/document/july-28-2025-parts-c-d-announcement.pdf) gives the 2026 base beneficiary premium as **$38.99 per month**. [IRS Publication 590-B](https://www.irs.gov/pub/irs-pdf/p590b.pdf) instructs use of age as of the birthday in the distribution year for its life-expectancy table. These sources support the narrow Part D and age-reached premises; they do not independently validate all projected tax or benefit amounts.
- On Windows 11, `npm test` at the exact source returned **GATE PASSED**: 420 files; 3,146 tests; 3,137 passed; zero failed or skipped; nine authorized todos. The 12 targeted R40 health, RMD and partial-row tests also passed. Source PR #35's Windows gate completed successfully at its records head `dd58fba49d47b32324eef3b09718a8576246ffa4`.
- The R40 conservation grid, rerun with seed 777, produced 1,000 plans and 20,457 rows, zero failures or leak flags, and four disclosed `WAGE_TAX_CLAMP` rows, matching its stored record. This is a balance invariant, not an external reference for tax correctness.
- I staged two independent trees and ran `tools/differential-harness.js compare --composition control`: **EMPTY**, 36/36 scenarios, 38,484/38,484 leaves, invariants PASS. All 12 differential-harness tests passed, including rejection of identical corruption, mismatched corpora and incomplete capture, and detection of candidate-only mutations. These were Node runs, not a real browser Worker run.
- Independent r20 capture comparison found all 71 inputs unchanged. Against r18, exactly six members moved (`seed:1`, `seed:3`, `seed:6`, `seed:10`, `seed:16`, `expansion:s5aa-r6-gap-survivor-health-roth`); against r19, five partial-row tax entries returned to their r18 values (`golden:baseline`, `golden:monte-carlo-fixed-seed`, `golden:reserve-and-bond-tent`, `golden:guardrails-withdrawal-strategy`, `expansion:monte-carlo-sensitive-band`). No unexpected movement appeared. The first 51 control declarations in the pre-R40 file remain unchanged in the final file, which contains 53 declarations.

The built-route and worker-parity tests exercise the bundled sources through VM/jsdom. `tests/build-routes.test.js` itself states that real browser Worker execution is not covered. I attempted to start the desktop browser-control runtime twice; initialization failed before a browser state could be read because its Windows sandbox ACL helper returned `helper_unknown_error: apply deny-read ACLs`. I therefore make no claim that I independently completed task 6.5.

## Exit gate, E1–E18

The statuses below apply the written gate and amendments A-01–A-10 to `978a6e4`. “Dispositioned” means the cited amendment or owner decision expressly handles a line; it does not turn excluded results into qualified reference values.

| Line | Determination at R40.1 |
|---|---|
| E1 | Dispositioned: repairs are passing or named as held, including G3's remaining partial-row tax limit in the combined unrepaired list. |
| E2 | Dispositioned by A-09's accepted residual evidence uncertainty. |
| E3 | Met on the recorded pre-repair witnesses and round handovers. |
| E4 | Met on the recorded mirrored-pair and silent-settlement checks; no contrary movement found in r20. |
| E5 | Met within the owner's corrected-remedy scope; R40 does not reverse those remedies. |
| E6 | Met: `RESULT_CONTRACT.md` §7a states the failure policies; no Monte Carlo invalidation change appears in R40. |
| E7 | Not met as originally written; A-09 expressly defers enforcement to S5b task 4. The nine flagged r20 entries remain unqualified. |
| E8 | Met for the current boundary: r17 remains, and versioned r18/r19/r20 captures preserve the later states. Intermediate R29–R39.1 states are evidenced by round diffs, not full captures. |
| E9 | Met: exact-source Windows 11 gate, 3,146 tests, 3,137 pass, zero failure/skip, nine authorized todos. |
| E10 | **Met under A-10's narrow administrative substitution.** R29–R39.1 declarations were written after implementation and cannot prove prediction; the amendment says so. Their first 51 declarations are preserved. R40's prediction and corrective addendum preceded their respective edits, and the measured r20 movements match the recorded mechanism. This qualifies no household output. |
| E11 | Met on the X-row routing record; no S5b/S6 carry is declared closed here. |
| E12 | Met: R40's combined unrepaired list names each later limit and its disclosure location. |
| E13 | Met on the recorded 12/0 closeout and carry routing; this does not cure E7. |
| E14 | Dispositioned: rebuilt, hash-pinned HTML and tested R40 wording; A-09 expressly excepts the remaining rendered disclosures while the UI is rebuilt. |
| **E15** | **Blocked.** The final-source task 6.5 desktop-browser comparison with an actual Worker, exception and raw export is absent. Node comparator and earlier guided smoke do not replace it. |
| E16 | Met on the recorded rejected-hunt accounting and campaign state. |
| E17 | Met by documents placed or relayed to their owners and source checks for the R40 tax/Medicare claims; R40's eb relay awaits placement after merge. |
| E18 | Met as an owner scope request and second-pass request; this R40.1 report is the requested change audit, not a new whole-model certification. |

**Handover to Claude and the owner:** retain the R40.1 source and r20 movement evidence. Arrange and record task 6.5 on the final candidate, explicitly covering the actual browser Worker, main-thread comparison, exception and raw export. Bring the SHA-bound evidence back for an E15 determination. The disclosed partial-row tax convention, wage-tax clamp and A-09 exclusions remain unqualified by this report.
