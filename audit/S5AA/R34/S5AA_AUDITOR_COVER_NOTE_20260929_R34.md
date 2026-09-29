# Cover note — S5AA R34, Social Security

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

**R34 repairs 11 Social Security items from R32F and your R32V check.** It is the second of the five overnight rounds, stacked on
R33, and needs its own change audit.
- **SA32F-01, -02 and -03:** the survivor and spouse's benefits, by law.
- **SA32F-04:** today's dollars.
- **SA32F-05, -06, -07, -18 and -25:** full retirement age by birth year, the earnings test, the grace year, and a Social Security
  stream at a death.
- **R32V-03:** SSA's rounding.

**Please audit the R34 change** from `s5aa-r33-source` (`f4e8294`; R33's records at `b5d749c`) to **`s5aa-r34-source`**
(`7b61b88`).

| where | what |
|---|---|
| tag `s5aa-r34-source` (`7b61b88`) | the source to audit |
| `audit/S5AA/R34/S5AA_R34_CHANGE_AUDIT_HANDOVER_20260929.md` | the rules as built, their sources, evidence, moved figures, known limits |
| `audit/S5AA/R34/S5AA_R34_SELF_AUDIT_20260929.md` | Claude's check of the round |
| `audit/S5AA/R34/S5AA_R34_SELF_AUDIT_SS_REFERENCE.js` | all 25 R32F Social Security cases against the law as built: 0 mismatches |

**Four things to know before you run your own repros:**
- **Full retirement age now comes from the birth year.** A repro that sets `retirement.ssFra` and reads a 67-year-old at 67 will
  differ from the engine. A 1959 birth's full retirement age is 66 and 10 months.
- **The entered benefit is in today's dollars** (the owner's decision 3). With a non-zero COLA, it grows from the plan's start to
  the claim.
- **Benefits are rounded:** the PIA to the dime, the benefit to the dollar. A repro that doesn't round will be off by a little: up to
  $12 a year per benefit from the dollar round, and more across many COLA steps, each rounded to the dime.
- **The expanded corpus's input hash changed again,** because one member was re-chosen by its declared rule (handover §5).

Please number findings **R34-NN** and publish them in the usual report-only pull request, on a branch named like
`audit/chatgpt/r34-7b61b88`. This repository is public: please call me "the owner", and include no name, email address or
personal path.

Thank you,
the owner
