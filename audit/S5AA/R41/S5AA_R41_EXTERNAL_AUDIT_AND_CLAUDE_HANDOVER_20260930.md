GO

# S5AA R41 external change audit and status determination

**Audited source:** `s5aa-r41-source` = `984197cc05706b45e60bcb39bee78ad75f9ceff4`. **Change range:** `s5aa-r40.1-source` = `978a6e48a3727935770ff19ecee8c8706402df1d` through that source. R41's records are on `main` at merge `020c6f312ecb76fe371668281336cf1ed22328a9`; the audited source files are byte-identical there. **Environment for my checks:** Windows 11 (`10.0.26200`), Node `v24.17.0`.

## Determination

**S5AA is GO at the R41 source under amendments A-01–A-10.** The sole blocker in my R40.1 determination, E15, now has a SHA-bound final-candidate browser record covering task 6.5. I found **no new R41-NN finding** in the changed source or the cases checked. A-09's E2, E7 and E14 exceptions, the disclosed model limits, and the unqualified corpus results remain in force. This GO is administrative: it does not qualify the model for release or household reliance. The owner retains the decisions to close the milestone, set `s5aa-closed` and start S5b.

## R41 change audit

`src/engine.js:1447-1450` adds `endAgeBeforeStartCode()`, which returns a named refusal only when finite `profile.endAge < profile.age`; `src/engine.js:4603` includes it in the input gate, and `src/engine.js:4681-4682` supplies the refusal message. `src/scenario-validator.js:238-240` makes the same inequality an `END_AGE_BEFORE_START` error at `profile.endAge`, so Restore backup rejects it. `src/app-shell.html:623` includes the new function in the generated Worker's dependency list. The built HTML and its hash pin were updated; `RESULT_CONTRACT.md` records the new refusal. An end age equal to the start, an end age between the start and retirement, and an already-retired plan keep their previous behavior, as the six new test cases show. This is a structural input safeguard, not a change to valid-plan figures.

The prediction record at `03d6ed41e55c9930a65a2599823a82923632f047` preceded the implementation commit `984197cc05706b45e60bcb39bee78ad75f9ceff4`. Its predicted zero corpus movement is borne out by my fresh 71-member expanded capture: the current capture is **IDENTICAL** to registered r20, with the same input and output corpus hashes. I regenerated the R41 75-plan Node reference file; every entry hash, key-order hash, refusal code and row count matched the committed `node_results_984197c.json`. The four added cases produced the three documented structural refusals and `SCENARIO_END_AGE_BEFORE_START` for the reversed age. The app's backup normalizer intentionally supplies a missing retirement section before validating an imported legacy plan; thus the `refusal:missing-retirement-section` engine case is one of the 70 plans imported in the app-level browser check, not an import refusal.

I ran `npm test` at the **exact source**: **GATE PASSED**, 421 test files, 3,152 tests, 3,143 passed, zero failed or skipped, nine authorized todos. Source PR #38's Windows CI also completed successfully at records head `ffb7d1cf85b3fb439f23a189c8123b6618ae245a`. A separate-process control comparator on two staged copies returned **EMPTY**, 36/36 scenarios and 38,484/38,484 leaves, with invariants passing. The staged trees contain identical source, so that result demonstrates comparator operation and Node consistency, not an independent financial reference.

## E15 evidence reviewed

I read `audit/S5AA/R41/e15/browser_checks.js`, `harness.js`, `canon.js`, the final and prior raw browser results, and `S5AA_R41_E15_BROWSER_EVIDENCE_20260930.md`. The harness wraps the app's `Worker` constructor while creating a **real** Worker, records posted and received messages, captures download bytes, and reaches the app's compatibility path by removing `window.Worker`. Only `identity.runId`, documented as nondeterministic, is masked for full-result comparison; key order is checked separately. I independently hashed the shipped `investment-calculator-v2c.html`: **`7e2e5aaf31f86a97080c0488a7d5e6905253ec9a8d01ac855cc26929486f43f8`**, matching the browser record and source pin.

The final-candidate Chromium 152 / Windows 11 record reports:

| Check | Recorded result at `984197c` |
|---|---|
| Full result, real Worker versus same source on the main thread | **75/75 equal**, including the refusal and edge cases; key order equal on 75/75. **72/75** also equal Node exactly. The other three are Monte Carlo results with at most `1.83 × 10⁻¹⁵` relative numeric difference and unchanged counts and success rates. |
| App Restore backup, actual Worker versus compatibility path, raw projection CSV | **70/70 imported plans have byte-identical CSVs**, one Worker reply each, and 70/70 replies equal a main-thread run on the exact plan posted. Five plans are refused at import. |
| Worker throws or fails to load, on simple and 500-run Monte Carlo plans | Both cases fall back to the main thread and yield the reference CSV. When both paths throw, the rendered result has an error card, no figures or table, no CSV, and debug export records the actual `ENGINE_RUN_FAILED` error. Removing the faults restores the Worker result and reference CSV. |
| Four-scenario compare mode | Four Workers announced, four requests and replies, all equal to main-thread results; the active scenario's CSV matches compatibility mode. |

The scripts ran again after R41 changed the built artifact, satisfying A-04's final-candidate condition. This is one desktop Chromium build on one machine, as the evidence states, and it is **not** the post-S6 phone campaign. My attempt to replay it directly in the desktop browser-control tool failed before opening a tab (`helper_unknown_error: apply deny-read ACLs` in the tool's Windows sandbox). I therefore verified the scripts, source and committed result records, but **did not personally rerun the real-browser check**. The record is specific, reproducible and consistent with the independently regenerated Node reference and artifact hash; it is sufficient for this administrative E15 determination. It does not establish the financial correctness of the matching calculations.

## Exit gate, E1–E18

These statuses are at `984197c`; “dispositioned” means an explicit amendment or owner decision handles the unmet original wording. The R41 repair and browser evidence change E15 and add no movement to the other lines determined in R40.1.

| Line | Determination |
|---|---|
| E1 | Dispositioned: repairs pass or are separately held, including the disclosed G3 partial-row tax limit. |
| E2 | Not met as originally written; A-09 accepts the residual uncertainty. |
| E3 | Met on recorded pre-repair witnesses, including R41's failing refusal cases before its repair. |
| E4 | Met on the recorded mirrored-pair and silent-settlement checks; the R41 corpus is unchanged. |
| E5 | Met within the owner's corrected-remedy scope; R41 does not alter the listed financial remedies. |
| E6 | Met: the contract's failure policies remain and Monte Carlo invalidation is unchanged; R41 adds a documented refusal cause. |
| E7 | Not met as originally written; A-09 defers enforcement to S5b task 4. Every flagged corpus result remains unqualified. |
| E8 | Met: r17 and versioned r18/r19/r20 captures preserve the relevant evidence; R41's capture is identical to r20. Intermediate R29–R39.1 states remain recorded as round diffs, not full captures. |
| E9 | Met: exact-source Windows gate 3,152/3,143/0 fail/0 skip/9 todo; the prior authorized todo disposition remains. |
| E10 | Met under A-10 for R29–R39.1's disclosed after-the-fact declarations; R40 and R41 predictions preceded their edits. R41 has zero corpus movement and no new control declaration. |
| E11 | Met on the X-row routing record; nothing carried to S5b or S6 is declared closed here. |
| E12 | Met: the combined R40 unrepaired list and R41 self-audit name the carried limitations and their disclosure. |
| E13 | Met on the recorded 12/0 closeout and routing; this does not cure E7. |
| E14 | Dispositioned: final R41 HTML is rebuilt and hash-pinned; A-09 explicitly excepts remaining rendered disclosures while the UI is rebuilt. |
| **E15** | **Met under the archive close record's revised second-machine condition:** the Node comparator ran, the clean-checkout replay was recorded, and the final-source task 6.5 browser record covers a real Worker, main thread, exception and raw export. One Chromium build was used. |
| E16 | Met on the recorded rejected-hunt accounting and campaign state. |
| E17 | Met by placed or relayed documents and primary-source checks; R41 §7 corrects the R40 relay's three pre-amend commit references. |
| E18 | Met as the owner's scope and second-pass request; this report audits the R41 change and status, not the whole model. |

**Handover to Claude and the owner:** E15 is accepted at `s5aa-r41-source`; no R41 repair request follows from this review. Preserve the browser evidence and source hash with the administrative close record. The error-card wording, zero-length end-age behavior, known import normalizations, partial-row tax convention, wage-tax clamp and A-09 exclusions remain as disclosed and are not qualified by this GO.
