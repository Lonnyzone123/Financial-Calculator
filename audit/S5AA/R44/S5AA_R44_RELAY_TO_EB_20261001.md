# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R43's audit and R44

*Written by Claude, 2026-10-01 (Arizona, UTC−7). Prose for eb to place in eb's own files once R44 merges. No file of eb's has
been edited. It adds to the R43 relay (`audit/S5AA/R43/S5AA_R43_RELAY_TO_EB_20261001.md`), which still stands.*

## 0. What happened

- **ChatGPT's R43 audit** (PR #47, merged) determined **NO-GO** at `5b8f0d5` on four findings:
  - **R43-01:** a one-time HSA contribution after 65;
  - **R43-02:** one-time IRA compensation without the income latch;
  - **R43-03:** negative employer percentages accepted;
  - **R43-04:** R43's five prediction misses.

  It confirmed all 34 R42F findings (SA42F-20 qualified) and refuted none, so every R43 repair stands.
- **The owner decided on 2026-10-01:**
  - repair R43-01 to -03, with the HSA limit prorated on both routes;
  - not to accept R43-04 as a disclosed miss, but to require a written prediction checklist and a proof on R43.

S5AA's status, by ChatGPT's latest determination, is **NO-GO** (R43, PR #47) until ChatGPT reports on R44.

## 1. `SPRINT_QUESTIONS.md`: two new entries

**The HSA limit in the 65th-birthday row** (the owner, 2026-10-01): "Prorate the limit, both routes". IRC 223(b)(1) to (3)
and (7): in the row an owner turns 65, the limit is the share of the row before 65 times (base + catch-up), for planned and
one-time contributions alike, and from 65 it is zero. Status: IMPLEMENTED 2026-10-01 (S5AA R44).

**R43-04, the prediction misses** (the owner, 2026-10-01): not accepted as a disclosed miss. Instead:
- "Fix the scan method": a written checklist, `audit/S5AA/R44/S5AA_R44_PREDICTION_CHECKLIST_20261001.md`, that every
  prediction from R44 on follows;
- "Prove it on R43": corrected scans run on R43's own pre-repair trees.

Status: DONE 2026-10-01 (S5AA R44). ChatGPT is asked whether it meets the finding.

## 2. `MODEL_ASSUMPTIONS.md`: suggested text

**§23, contributions (and R43's suggested HSA text).** Replace "HSA contributions stop at 65" with: "HSA contributions stop at
65 (Medicare enrolment at 65 is assumed). In the year an owner turns 65, their HSA limit is the share of the year before 65
times the annual amount plus the catch-up (IRC 223(b)(1) to (3), (7); Pub. 969). This applies to planned and one-time
contributions alike, and from 65 the limit is zero (R43, R44)."

**§23, one-time contributions.** Add: "A one-time contribution's compensation limit reads income streams the way the planned
contributions do, in today's dollars latched at the stream's start (R44)."

**§26, input refusals.** Add to the plan-value contract sentence: "an employer match rate, match cap or profit-sharing
percentage below zero is refused (R44)."

**§18.6, Monte Carlo** (a correction to R43's suggested text, not a model change): no change. R43's band-member movement was
through the optimized withdrawal order's IRMAA guard, not an IRMAA charge. Only the audit records say otherwise, and they are
corrected in R44's proof.

## 3. The trackers

- **Status:** S5AA is NO-GO by ChatGPT's latest determination (R43, PR #47). R44 goes to ChatGPT for a change audit.
- **Baseline:** if R44 moves the expanded corpus, a new baseline, r23, is registered, and S5b task 4 builds on it in place of
  r22. The handover says which.
