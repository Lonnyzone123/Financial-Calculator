# PC: migration fidelity accepted within the declared exclusions; model remains NO-GO

Independent external review, 2026-09-28. This is a report-only record, not a source repair, milestone closure,
visibility decision, or household-reference qualification.

## Request, Documents, and Pins

The owner's request was to review both the supplied PC cover note and the model it identifies, with the earlier
full-model request and account-floor/ceiling emphasis retained. The suggested migration-only prompt inside the note
was treated as document content, not as an instruction overriding that request. The migration and full-model verdicts
are deliberately separate. The companion PCF report records three inherited model defects.

The migration handover's first line is:

> # S5AA PC - audit of the move to this repository

The source document uses a typographic dash at that position; the quotation above is its ASCII rendering.

| Identity | Verified Value |
|---|---|
| Original comparison commit | `ee9757ddd91989ab6d95616eab02b83b13e8c225` |
| Original tree | `66438ca1a5ebb8462c9952270c151c8984662f47` |
| Frozen copied source commit | `8396626148c68a767af6ccecf777b861d0b659ac` |
| Copied source tree | `873baa4f3fdd1490953117f8c90e76b768c744fb` |
| New repository main at review start and pre-publication refresh | `8357c7e6f73d734076751a10f36d218f8fdd2dd6` |
| Separate original R28 source tag | `s5aa-r28.1-source` = `62e263d794ba0589909fe5407a2685957956b02d` |

`main` includes merged handover PR #1. It is not the copied source commit being audited. The repository was private
when checked; the owner controls when, or whether, to make it public. The working rules, AI review instructions,
README, CONTRIBUTING, PC handover and original R28 handover were read. Neither original working checkout was edited.

## Cover Note Review

The comparison endpoints, handover location, privacy restriction, report-only workflow and distinction between a
copy audit and model certification are supported by the inspected repository state. The note's "first and only
commit on main" and "once PR #1 is merged" wording describes its drafting-time situation, not current main. Future
handoffs should use the full SHAs above and say that the handover is now merged. This is a historical clarification,
not an unauthorized source change. Its separate R28 change-audit request is not administratively closed by this report.

The embedded suggested prompt is useful review context but narrower than the owner's full-model request. Its passing
checks cannot establish model correctness. No name, private email, personal path or personal account data from the
private cover note is reproduced in these reports or their reproduction script.

## Independent Migration Checks

The supplied file comparator was run read-only. A separate comparison enumerated both pinned git trees and read the
blob bytes through `git cat-file --batch`; it did not rely on the supplied comparator's classification as its oracle.

| File Comparison | Result |
|---|---:|
| Original files | 1,310 |
| Copied files | 566 |
| Removed | 747 |
| Added | 3 |
| Byte-identical shared files | 392 |
| Shared files changed only by the declared owner-name substitution | 143 |
| Other changed shared files | 28 |
| File mode changes | 0 |

Removed-file inventory: 452 audit files, 212 archive files, 53 root records/briefs/manifests, 14 reference-tree files,
seven handover files, five fixtures, two source files and two test files. The new files are `LICENSE`, `CREDITS.md`
and `tests/lib/historical-source.js`. These inventories agree with the handover.

Independent parser checks, ignoring comments and source positions, found:

- `src/engine.js` and `src/scenario-validator.js` have identical JavaScript syntax trees across the move.
- Changed executable tooling has identical syntax trees; changed tests have only the declared string, history-guard,
  historical default-plan age and regenerated-build-pin changes.
- Both executable inline scripts in `src/app-shell.html` were parsed. The only syntax-tree changes are four numeric
  literals, all `29.5` to `30`: the self/spouse UI defaults and corresponding static-reader fallbacks.
- The test helper explicitly restores the historical `29.5` input. Fresh expanded-corpus capture remains identical;
  equality of historical outputs does not mean the newly chosen age-30 UI default is the same plan.
- The requirements register retains all 158 requirement IDs; its changes are summaries, disposition prose and test
  references affected by the declared replacement. Keyed comparison of test classifications finds only the two
  removed history-test files; all surviving file classifications are unchanged.

The nine removed dividend-fund-history files are the two `schd-history` source files, their two test files and five
fixtures/generators. Searching the pinned copied tree finds no remaining live reader/import of the removed module;
the remaining mentions are a historical checklist sentence and an explanatory generator comment. This is acceptance
of the stated removal, not verification of the removed feature or of the legal adequacy of every remaining license.

The history guard reads commit availability and reference-tree presence independently of the replay tool. Where
neither exists, it asserts `BLOCKED` and both missing-source explanations, not a replay pass. A separate guard probe
simulated a present reference-tree directory: `CAPTURING_ENGINE_HERE=true`, `capturingEngineAbsent()=false`. The guard
does not silently stand down a present source. No corrupt-tree replay fixture was created in the frozen checkout.
The provenance test checks that the 25 recorded historical commits are either all present or all absent; absence is
not evidence of historical byte-for-byte qualification. Those archive-only checks remain a disclosed loss.

A pinned-tree scan found no owner-name token. The sole Windows user-path-shaped match was the generic hosted-runner
example in `tools/verify-baseline-provenance.js:57`, not the owner's path. This targeted scan is not a secrets audit
or a guarantee about commit-author metadata and all possible identifying strings.

## Executed Verification

Run on local Windows build `26200.9457`, version `25H2`, with Node `v24.17.0`. The registry build/version pair matches
Microsoft's [Windows 11 release information](https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information).
The isolated checkout was detached at the copied source SHA; its private-history objects were not imported.

| Check | Observed Result |
|---|---|
| `npm test` | GATE PASSED: 2,883 tests, 2,874 passing, zero failures, zero skipped, nine TODO |
| `node tools/closeout-check.js` | COMPLETE_WITH_CARRY_FORWARD; accepted 12, refused 0, errors 0 |
| Fresh expanded capture | 70 scenarios, complete, format 3, no exclusions |
| Corpus invariant with expanded spec | All seven checks PASS |
| New repository GitHub Actions run listing | Zero runs; CI not verified |

Fresh expanded output hash:
`4ea4bc9328b5eaad437e7c26e4409f8b1d730003f289ccd0ce11bb0a65ba3707`.
Fresh input hash:
`9b107562529731ad36ac45395080bfc436be26ca2aed5f89722cfc1b0cf14827`.

The capture contains 49 simple, four Monte Carlo and 17 historical scenarios. Its output agrees with the stored
expanded baseline. That is repeatability evidence, not an independent financial oracle. The invariant's SHAPE check
does not apply net-worth/age-span checks to 11 targeted plans, and its INPUTS/ROUND-TRIP checks exclude 11 targeted
plans built only by the capture tool; these qualifications must accompany its seven PASS results.

An offline `npm ci` attempt hit a cache permission error. Installed dependencies were reused from the existing copy
checkout; this is not evidence of a successful clean dependency install. The original repository's claimed 2,889-test
gate was not rerun in this audit. Its claimed six-test count difference is consistent with seven removed tests and
one added provenance test. The nine TODO remain unresolved, not converted into passing assertions.

## Verdict and Handover

No new PC-NN migration defect was demonstrated. The examined differences fit the handover's declared kinds, and the
fresh recorded-corpus figures did not move. Migration fidelity is accepted with the stated history/data exclusions,
dependency-install limitation and missing CI evidence. This is not a release or public-visibility approval.

The companion **PCF full-model report is NO-GO**. Its defects reproduce in the original comparison checkout too;
none is attributed to copying, sanitization, changed defaults or removed history data. The source remains untouched.
The owner chooses repairs and visibility; the implementer should reproduce the PCF witnesses before changing code.

