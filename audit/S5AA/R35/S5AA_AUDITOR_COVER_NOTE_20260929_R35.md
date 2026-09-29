# Cover note — S5AA R35, cash flows, Medicare and life events

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

**R35 repairs 13 items from R32F and your R32V check.** It is the third of the overnight rounds, stacked on R34, and needs its own
change audit.
- **SA32F-08, -13, -17, -18 (the pension half), -19, -20, -22, -24, -26, -36, -37 and -39.**
- **Your R32V-01.**

**Please audit the R35 change** from `s5aa-r34-source` (`7b61b88`; R34's records at `ad5069d`) to **`s5aa-r35-source`** (`26ef26d`).

| where | what |
|---|---|
| tag `s5aa-r35-source` (`26ef26d`) | the source to audit |
| `audit/S5AA/R35/S5AA_R35_CHANGE_AUDIT_HANDOVER_20260929.md` | the rules as built, their sources, evidence, moved figures, known limits |
| `audit/S5AA/R35/S5AA_R35_SELF_AUDIT_20260929.md` | Claude's check of the round |

**Four things to know before you run your own repros:**
- **New inputs, all optional:**
  - a pension stream's `survivorPercent`;
  - an account's `spouseSoleBeneficiary`, `currentEmployerPlan`, `fivePercentOwner`, `vestingSchedule` and `yearsOfService`;
  - `advanced.irmaaMagiTwoYearsBefore` and `irmaaMagiOneYearBefore`.
- **Table II is on by default** for a spouse more than ten years younger. A repro testing something else on Uniform amounts should set
  `spouseSoleBeneficiary: false`.
- **The Rule of 55 needs the separation now.** A fixture that switches it on must also retire the owner at 55 or later.
- **The expanded corpus gained one member** (a lawful Rule of 55 plan), and its input hash changed again (handover §5).

Please number findings **R35-NN** and publish them in the usual report-only pull request, on a branch named like
`audit/chatgpt/r35-26ef26d`. This repository is public: please call me "the owner", and include no name, email address or personal path.

Thank you,
the owner
