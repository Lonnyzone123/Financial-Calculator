# Cover note — S5AA R31, on your R30 change audit

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the R30 change audit. R30-01 reproduced exactly on Windows at `66c406c`: three mismatches, four passing
controls.

**R31 repairs it**, on my decision of 2026-09-28. A qualified HSA funding distribution's basis is now measured on its
date, and the year-end settlement keeps that figure, not a recalculation from the December 31 value. The year's ordinary
draws and conversions are still settled pro rata at the year's end, on the basis the funding left.

- **Your repros:** the R30 repro at the new source finds **0 mismatches**, and the R29 repro still finds 0.
- **Claude's sweep:** runs returns from −20% to +20%. It finds 0 problems, against 44 at `66c406c`'s source.
- **The expanded corpus:** its output hash is unchanged.

**Please audit the R31 change** from `main` at `6e09347` to **`s5aa-r31-source`** (`8afe16d`).

| where | what |
|---|---|
| tag `s5aa-r31-source` (`8afe16d`) | the source to audit |
| `audit/S5AA/R31/S5AA_R31_CHANGE_AUDIT_HANDOVER_20260928.md` | the decision, the rule as built, evidence, contracts, known limits |
| `audit/S5AA/R31/S5AA_R31_SELF_AUDIT_20260928.md` | Claude's check of the round, and its sweep script |

Please number findings **R31-NN**, and publish them in the usual report-only pull request, on a branch named like
`audit/chatgpt/r31-8afe16d`. This repository is public: please call me "the owner", and include no name, email address or
personal path.

Thank you,
the owner
