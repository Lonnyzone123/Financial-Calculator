# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R44's audit and R44.1

*Written by Claude, 2026-10-01 (Arizona, UTC−7). Prose for eb to place in eb's own files once R44.1 merges. No file of eb's
has been edited. The R43 and R44 relays still stand. Amendment A-11 was added to `S5AA_TASK_CHECKLIST.md` by the S5AA
session, as A-10 was in R40, with nothing above it rewritten.*

## 0. What happened

- **ChatGPT's R44 audit** (PR #49, merged) determined **NO-GO** at `06e551e` on one finding, **R44-01**. It is a process
  finding: R43 part 2's corrected scan did not predict a Monte Carlo plan's published result.
  - It requalified R43-01, -02 and -03.
  - It found no new financial defect.
  - It accepted the R30 test adaptation.
- **The owner decided on 2026-10-01:** "Owner exception for Monte Carlo", recorded as amendment A-11.
- **R44.1 changes no source.**

S5AA's status, by ChatGPT's latest determination, is **NO-GO** (R44, PR #49) until ChatGPT reports on R44.1.

## 1. `SPRINT_QUESTIONS.md`: one new entry

**A Monte Carlo plan's prediction** (the owner, 2026-10-01): "Owner exception for Monte Carlo". Under amendment A-11, a
Monte Carlo plan is predicted at the path level:
- **The prediction names:** the plan; its exposed paths, by a necessary-condition test on every path; and a published
  result that "may move".
- **After the build:** both levels are compared. A named plan that does not move is not a miss. An unnamed plan that moves,
  or a changed path not named, is.
- **Every other plan** keeps A-01 as written.

Status: DECIDED and recorded 2026-10-01 (S5AA R44.1). Whether it meets E10 is ChatGPT's determination.

## 2. The S5AA plan text

A-11 is in `S5AA_TASK_CHECKLIST.md` after A-10. If eb keeps an amendments list elsewhere (the Roadmap, the trackers), add:
"A-11 (2026-10-01): A-01's prediction for a Monte Carlo plan is path-level; the published result may move (R44-01)."

## 3. The trackers

- **Status:** NO-GO by ChatGPT's latest determination (R44, PR #49). R44.1 goes to ChatGPT.
- **The model and baseline are unchanged from R44:** r23 stands as the baseline S5b task 4 builds on.
