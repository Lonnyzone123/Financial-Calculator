# Cover note — S5AA AA1: audit the model's assumptions and my decisions

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the R44.1 audit and the administrative GO. Before I close S5AA, I would like a different kind of audit.

So far you have checked whether the code does what the model says. **Now I would like you to check whether what the model says is
right:** every assumption it states, and every modelling decision I have made, compared with tax law and with personal-finance
planning standards.

**The full brief is `audit/S5AA/AA1/S5AA_AA1_ASSUMPTIONS_AUDIT_BRIEF_20261003.md`. Please read it first.** In short:

- **Scope:**
  - all 26 sections of `MODEL_ASSUMPTIONS.md`;
  - every modelling decision in `SPRINT_QUESTIONS.md` (grouped where several implement one rule);
  - the S2 closure decisions;
  - the 2026 figures in the rules package;
  - the spouse-retirement rules I decided on 2026-10-03 for round R45
    (`audit/S5AA/R45/S5AA_R45_OWNER_DECISIONS_20261003.md`). R45 is being built now, so a finding there can still change it.
- **Compare against:** federal tax law at primary sources (IRC, Treasury regulations, IRS publications, SSA's POMS, CMS); Arizona
  tax law; the CFP Board's standards and common professional planning practice; and published retirement research where an
  assumption leans on it. Keep law (checkable fact) and planning standards (professional judgment) apart.
- **For each item:**
  - a verdict: CONSISTENT, ACCEPTABLE SIMPLIFICATION, SHOULD CHANGE, JUDGMENT CALL, or UNVERIFIED;
  - the authority, with a link;
  - the consequence for households, with an approximate size;
  - a recommendation;
  - an estimate of how large the change would be (S, M, L or XL, defined in the brief).

  I decide what changes. Nothing changes until I do.
- **Lead with the ten findings** that matter most to households, then the full numbered findings (**AA1-NN**), then a table
  showing every item you reviewed.

This is not a GO / NO-GO determination, and it does not reopen R44.1's. It feeds my decisions on what to change before S5AA closes
and what to carry forward.

Please publish in the usual report-only pull request, on a branch named `audit/chatgpt/aa1-<the main commit you audited>`, with
the report in `audit/S5AA/AA1/`. This repository is public: please call me "the owner", and include no name, email address or
personal path.

Thank you,
the owner
