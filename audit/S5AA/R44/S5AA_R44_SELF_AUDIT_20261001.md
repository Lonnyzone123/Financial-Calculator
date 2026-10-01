# S5AA R44 — self-audit

*Written by Claude, 2026-10-01 (Arizona, UTC−7), before the round went to the owner.*

## Claude's own errors this round

| | what went wrong | found by | where it stands |
|---|---|---|---|
| SA44-A | **The prediction said `seed:13` moves in control 4.7 through its limit warning's text ($8,750 of room → $0). It does not appear there.** Control 4.7 records a `limitWarnings` difference as a LENGTH (one warning against the capturing engine's none), so a change of text inside it is not a difference. The prediction did not read how that comparison treats a list of strings | the control probe after the build: 31 differences, all `seed:4` | an over-prediction at the control level only. The text did change (`r44_seed4_check…` prints `seed:4`'s; `seed:13`'s reads $0). The expanded capture, which compares the text, does see it: there exactly `seed:4` and `seed:13` moved, as predicted (handover §6). The checklist's C8 is to say how each comparison reads a field before predicting it |
| SA44-B | **The scan's first draft decided for itself what counts as a contribution,** against checklist C1, and flagged `seed:5`, whose one-time transfer runs from one HSA to another | the C5 direction run, before the prediction was committed: `seed:5`'s final figures did not move with the transfer off, and the pre-repair warnings had no limit note | the condition now calls the engine's `transferIsContribution()`, which is false for an HSA-to-HSA transfer. Disclosed in the prediction record |
| SA44-C | **The first R43-01 positive controls were built with the primary person at 64.5.** Rows are tax years closing on the primary person's birthdays, so that person's 65th birthday is always a row boundary, and the witnesses were not witnesses | the controls themselves (C7): the "witnesses" were not flagged | rebuilt with a spouse whose age is a half year off, as R43's ruling witness was, before the prediction was committed. The test file's witnesses are built the same way |
| SA44-D | **R43's stated cause of SA43-B was wrong.** R43's self-audit and handover said one band path's IRMAA charge moved. The band member has health costs off, so it is never charged IRMAA; it moved through the optimized withdrawal order's IRMAA guard | building the corrected part 2 scan for the R43-04 proof | corrected in `S5AA_R44_R43_04_RETRO_PROOF_20261001.md` and the handover §5. The committed R43 records are left as they are |

## Checks

Listed with their results in `S5AA_R44_CHANGE_AUDIT_HANDOVER_20261001.md` §7.
