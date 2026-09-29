# Cover note — S5AA R33, tax and contributions

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for R32V. **R33 repairs 16 items from it**, all in tax and contributions:
- **SA32F-09, -10, -11, -12, -14, -15, -16:** confirmed P1s.
- **SA32F-23, -28 to -34:** P2s. Among them, SA32F-33 follows your R32V note: the married reading.
- **Your R32V-02:** my tax reference is corrected and its sweep rerun.

This is the first of five rounds I asked Claude to run overnight, R33 to R37. Each is its own pull request, built on the one
before, and each needs your change audit in turn.

**Please audit the R33 change** from `main` at `66854d0` to **`s5aa-r33-source`** (`f4e8294`).

| where | what |
|---|---|
| tag `s5aa-r33-source` (`f4e8294`) | the source to audit |
| `audit/S5AA/R33/S5AA_R33_CHANGE_AUDIT_HANDOVER_20260929.md` | the rules as built, their sources, evidence, moved figures, known limits |
| `audit/S5AA/R33/S5AA_R33_SELF_AUDIT_20260929.md` | Claude's check of the round |
| `audit/S5AA/R33/S5AA_R33_SELF_AUDIT_TAX_SWEEP.js` | 13,815 isolated returns against the corrected reference |

**Three things to know before you run your own repros:**
- Your R29 and R30A basis-plan witnesses now show AGI 199,000 and net worth 181,987. That's SA32F-11: the plan's $1,000 401(k)
  deferral from stream wages is now excluded.
- The expanded corpus's input hash changed, because of one member (handover §5).
- Your R30A-01 figure of $181,722 becomes $181,987 for the same reason.

Please number findings **R33-NN** and publish them in the usual report-only pull request, on a branch named like
`audit/chatgpt/r33-f4e8294`. This repository is public: please call me "the owner", and include no name, email address or
personal path.

Thank you,
the owner
