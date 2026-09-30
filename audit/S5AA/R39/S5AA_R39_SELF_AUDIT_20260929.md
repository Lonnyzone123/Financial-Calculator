# S5AA R39 — self-audit

*Claude's check of the round before it goes to ChatGPT, 2026-09-29 (local, UTC−7), at `f7ea076`.*

## 1. What was checked, and how

- **Every ChatGPT witness, before any change.** `audit/S5AA/R38/S5AA_R38_EXTERNAL_REPRO_20260929.js` was run on `d02c509`. Each printed
  ChatGPT's figures exactly:
  - R38-01: 3,750 / 12,250 / 36,000 / 18,500;
  - R38-02: 9,667.50, with a 4,667.50 control;
  - R38-03: 9,000 pre-tax;
  - R38-04: 12,480;
  - R38-05: 0 against 3,905.63.

  Each mechanism was then read at the lines ChatGPT cites.
- **The law at the source:**
  - the IRS exceptions page ("during or after the year the employee reaches age 55");
  - IRS Notice 2024-2, Q&A L-3, read in the IRS PDF (page 72; the IRB web page's fetch was truncated);
  - 26 USC 402A (a) and (c) at law.cornell.edu;
  - 401(a)(9)(C) and 408(d)(8) as the engine already cites them.
- **Every hand figure recomputed** (handover §4).
- **Each new test run against the tree before its change.** The defect tests failed with the values in the handover's §4; the controls
  passed on both.
- **Neighbouring suites after each change:**
  - contributions, limits and HSA (36 files, 268 tests);
  - Rule of 55 (6 tests);
  - Roth match and vesting (29 tests);
  - Social Security (181 tests);
  - RMD, succession and survivor (227 tests);
  - QCD (56 tests).
- **Movement:**
  - the control was probed after each engine change;
  - the expanded corpus was captured at `f7ea076` and compared with R38's capture (handover §5);
  - R33's federal reference sweep and R34's Social Security reference cases were rerun at `f7ea076` (§2).

## 2. What the checks caught

- **My own wrong statement in R38's records.** R38's handover and self-audit said the statute (402A) does not condition a Roth match on
  full vesting. The fetch summaries I read showed 402A(a) and (c), never (f). 402A(f)(3) limits a "matching contribution" to one
  "nonforfeitable at the time received", and Notice 2024-2 L-3 applies it. It is corrected in R39's handover §3.3.
- **A wider reach than reported (R38-05).** ChatGPT's witness sets `currentEmployerPlan: true`. A blank flag inferred from the
  account's contribution field reaches the same 0, with no flag entered at all. The repair covers both, and so does the test.
- **One slip in my own process.** I launched the last three gates as a shell background job instead of the tool's background mode. I
  confirmed the commit had landed and the gate process was running before going on.

- **The reference runners, rerun at `f7ea076`:** R33's federal sweep checked 13,815 returns with 0 mismatches, and R34's Social Security reference checked 25 cases with 0 mismatches. The expanded corpus and the control are unmoved.

## 3. Choices the owner may want to revisit

1. **A row that is itself part of a tax year** keeps the limit for that share (R38-01). The plan does not know what was deposited before it
   opened.
2. **The HSA keeps its proration by months** of eligibility, read from the contribution window.
3. **The QCD, 59½ and 65 opening-age conventions** are all declared, to be decided together at the engine rebuild.

## 4. What remains

- The handover's §6 known limits.
- The eb relay: MODEL_ASSUMPTIONS text for R38-01 to R38-05 and the QCD; SPRINT_QUESTIONS Q168 built.
