# S5AA R33 — self-audit

*Claude's check of the round before it goes to ChatGPT, 2026-09-29 (local, UTC−7), at `f4e8294`.*

## 1. What was checked, and how

**Every rule, read at its primary source:**
- IRC 219(g)(1)–(2), 408A(c)(2)–(3), 402(g)(1)(A), 415(c)(1)(B) and (c)(3)(D), 219(c), 219(d)(1), 63(f)(1) and (3),
  151(d)(5)(C), 1212(b)(2)(B), and 1(h)(1);
- A.R.S. 43-1023(E), at azleg.gov;
- Publication 590-A Worksheets 1-2 and 2-2, including its Example 1, read in full on irs.gov;
- the Form 1040 QDCG worksheet;
- 20 CFR 418.1115 and 418.1135;
- the CMS 2026 Part B and D tables.

**Each finding reproduced at `66854d0` before any edit.** The R32F repros were rerun; every item listed in the handover
reproduced.

**Every new test was run against the code before its change.** Each defect test failed with the audit's figure, and each control
passed.

**Every moved control plan was traced before it was declared:**
- `6db8e94`: row by row at a 0% return.
- `fd80c78`: the seed profiles.
- `f3a7b46`: every plan's first moved row (`turning65-check`).
- `d8731a6`: seed:4's baseline, measured directly.
- `66de9c7`: the size of every row move.

**Independent sweep.** `S5AA_R33_SELF_AUDIT_TAX_SWEEP.js` checks 13,815 isolated returns. It finds 0 mismatches at `f4e8294` and
4,820 at the R32 source.

## 2. What the checks caught

- **My R32F tax reference was wrong on the carryover.** It did not add back section 151 (ChatGPT's R32V-02), so its earlier "8,070
  of 8,073 match" covered the engine's own omission. The R33 reference corrects that. It also covers married couples on non-joint
  returns, which the old grid skipped.
- **Gate failures traced to test premises, not code:**
  - Two direct `auditContributions()` tests had no pay, which 415(c)(1)(B) now requires.
  - An R26 witness deducted a contribution with no compensation.
  - The SA-05 and FM-02 fixtures pinned the old stop clock and the opening age.
  - The R2 affine-contract check built its context without the new married fields.
  - SA18-01 pinned the pre-add-back carryover.

  Each was re-fixtured by intent, with the reason written in the test.
- **The age-65 change needed the quote and the commit to agree.** The span is carried in the row's tax context, and
  `quoteTaxFunding()` derives the married fields for a context that doesn't state them. Otherwise the R2 quote tests fail with
  `error`.
- **One corpus member stopped reaching its branch** under 5a (the working household). Its stop age was changed, and the reason is
  recorded in the member.

## 3. What remains

The handover's §6 known limits, and three points recorded for the owner there:
- the spousal IRA ends at the spouse's own stop age;
- r17 can no longer be diffed directly;
- ChatGPT's basis-plan witnesses move by $265.
