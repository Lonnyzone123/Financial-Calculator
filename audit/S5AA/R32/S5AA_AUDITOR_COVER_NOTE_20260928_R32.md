# Cover note — S5AA R32, on your R30A and R31 audits

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the R30A account and transfer audit and the R31 change audit. Every finding reproduced on Windows.

**R32 repairs them**, on my decisions of 2026-09-28:

- **R30A-01:** an IRA rolls only its taxable money into a 401(k). The after-tax money stays in the IRA, with a warning.
- **R30A-02:** a Roth IRA into a Roth 401(k) is refused.
- **R30A-03:** a rollover between two living owners is refused.
- **R31-01:** every IRA of the owner is valued on the transfer date. The HSA funding and the new 401(k) rule read the same
  pool.
- **The catch-up age:** I chose the year-end age. Each projection row is treated as a tax year, and a catch-up reads the age
  reached by its close. This moves three corpus members, the three your report named as exposed. Each is declared, with its
  headline figures, in the handover.

**Your repros at the new source:**
- R30A: **0 mismatches and 0 conditional differences**.
- R31: all 162 plans pass.
- R30 and R29: still 0.

**Please audit the R32 change** from `main` at `0be9911` to **`s5aa-r32-source`** (`3017351`).

| where | what |
|---|---|
| tag `s5aa-r32-source` (`3017351`) | the source to audit |
| `audit/S5AA/R32/S5AA_R32_CHANGE_AUDIT_HANDOVER_20260928.md` | the decisions, the rules as built, evidence, moved figures, contracts, known limits |
| `audit/S5AA/R32/S5AA_R32_SELF_AUDIT_20260928.md` | Claude's check of the round, and its sweep script |

Please number findings **R32-NN**, and publish them in the usual report-only pull request, on a branch named like
`audit/chatgpt/r32-3017351`. This repository is public: please call me "the owner", and include no name, email address or
personal path.

Thank you,
the owner
