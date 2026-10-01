# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R41

*Written by Claude, 2026-09-30 (local, UTC−7). Prose for eb to place in eb's own files once R41 merges; no file of eb's has been
edited.*

## 0. What happened

ChatGPT's R40.1 report (PR #36, merged) found no new R40-NN finding and determined **NO-GO on E15 alone**: task 6.5,
the desktop-browser check on the final candidate (main thread against an actual Worker, an exception and a raw export),
had not run. The owner chose Claude's recommendation, **"go with your recommendations"**: run task 6.5 and bring the
evidence back.

The check passed on `978a6e4` (`s5aa-r40.1-source`). It also found one defect: a backup whose end age is before its
starting age was restored with only a warning and projected backwards (ages 29.5, then 28.5). The form cannot produce
it. The owner decided, on 2026-09-30, **"Repair now"**, before ChatGPT sees the evidence. R41 repairs it, and the browser
check was repeated on the repaired candidate. The source tag is `s5aa-r41-source`; its commit is named in
`audit/S5AA/R41/S5AA_R41_E15_BROWSER_EVIDENCE_20260930.md`.

## 1. `SPRINT_QUESTIONS.md` — one new entry for the owner's decisions of 2026-09-30

- **(a) Run task 6.5** ("go with your recommendations", on ChatGPT's R40.1 NO-GO). Status: done, evidence in
  `audit/S5AA/R41/`.
- **(b) "Repair now":** an end age before the starting age is refused. The engine refuses it as
  `SCENARIO_END_AGE_BEFORE_START`, with no rows. The validator reports it as an ERROR, `END_AGE_BEFORE_START`, so the
  app's import refuses the backup. An end age **equal** to the start is still projected (one row). Status: IMPLEMENTED
  2026-09-30 (S5AA R41). Witness: `tests/audit-s5aa-r41-end-age-before-start-refused.test.js`.

## 2. `MODEL_ASSUMPTIONS.md`, suggested text

**§26, input refusals.** Add: "A projection whose ending age is before its starting age is refused
(`SCENARIO_END_AGE_BEFORE_START`), and the validator reports it as an error, so a backup carrying it is not restored.
The form cannot produce it, since it raises the ending age to at least the retirement age and the retirement age to at
least the starting age. An ending age equal to the starting age is projected as one row (R41)."

## 3. The status trackers

The ledger and README status lines can say that R41 ran task 6.5 for ChatGPT's E15 and repaired the one defect it found,
with ChatGPT's determination on R41 still to come. **A correction to the R40 relay, which you have already applied in
Q172:** three of its commit citations named the first forms of two amended commits (`2881ceb` twice and `434f19c`); the
commits on `main` are `9fd61c2` and `c300508`. R41's records state the correction (the E15 evidence document, §7).

## 4. Nothing for `FEATURES.md` or the Roadmap

Task 6.5 is not the post-S6 phone campaign, and the records say so.
