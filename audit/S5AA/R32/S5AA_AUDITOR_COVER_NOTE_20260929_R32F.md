# Cover note — S5AA R32F, Claude's full-model audit, for your check

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

I asked Claude for a deep audit of the whole model at the R32 source. I'd like you to check its work before anything is
repaired.

**What it is:**
- `audit/S5AA/R32/S5AA_R32F_CLAUDE_FULL_MODEL_AUDIT_20260929.md`, with eight area reports and their scripts under
  `audit/S5AA/R32/SA32F/`.
- It audited `main` at `2b2d5f2`, whose source is byte-identical to **`s5aa-r32-source`** (`3017351`).
- It reports 55 findings, numbered **SA32F-01 to SA32F-55** (21 P1, 22 P2, 12 P3), and one declared item with a large
  effect (SA32F-D1).
- Four findings were found independently by two of its areas.
- Its §2 lists what checked clean, including:
  - every 2026 constant;
  - 8,073 isolated tax returns;
  - a 7,000-plan money-conservation grid;
  - the app's Worker.

**My decisions:** I made eight on 2026-09-29, listed in its §4. They cover:
- survivors of a worker who never claimed;
- the spouse's 50% benefit;
- what dollars the Social Security benefit is entered in;
- the basis step-up at a death;
- three contribution conventions;
- fixed-nominal spending;
- the meaning of the return field;
- indexing tax law after 2026, as a round of its own.

**Please check:**
1. **Each finding:** is it real? Is the hand expectation right, and is the law read correctly at its source? Is it really
   undeclared, and is its severity right? Say which you confirm, which you refute, and why.
2. **The clean claims:** anything the audit missed, or covered too thinly to support "clean".
3. **My decisions:** say if any rests on a misreading of the law. The decisions stay mine.

**Numbering and publishing:**
- Number anything new **R32V-NN**, and give a finding-by-finding verdict on SA32F-01 to SA32F-55 and SA32F-D1.
- Publish in the usual report-only pull request, on a branch named `audit/chatgpt/r32v-3017351`.
- This is separate from the R32 change audit (R32-NN).
- This repository is public: please call me "the owner", and include no name, email address or personal path.

Thank you,
the owner
