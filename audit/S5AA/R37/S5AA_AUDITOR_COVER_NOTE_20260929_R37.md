# Cover note — S5AA R37, safeguards, validator, warnings and texts

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

**R37 repairs the rest of the R32F/R32V register:** the engine safeguards, the validator gaps, three plan warnings, housing costs,
the Monte Carlo guidance and disclosures, and the stale texts. It is the last of the overnight rounds, stacked on R36, and needs its
own change audit.

**Please audit the R37 change** from `s5aa-r36-source` (`cf643a8`; R36's records at `013062b`) to **`s5aa-r37-source`** (`4a9a15e`).

| where | what |
|---|---|
| tag `s5aa-r37-source` (`4a9a15e`) | the source to audit |
| `audit/S5AA/R37/S5AA_R37_CHANGE_AUDIT_HANDOVER_20260929.md` | each finding's change, evidence, what moved, known limits |
| `audit/S5AA/R37/S5AA_R37_SELF_AUDIT_20260929.md` | Claude's check of the round |

**Three things to know before you run your own repros:**
- **New input-gate refusals:** `SCENARIO_DEBT_RESET_TERMS_MISSING`, `SCENARIO_HISTORY_START_AFTER_DATA`,
  `SCENARIO_INVALID_DEBT_AMOUNT` and `SCENARIO_INVALID_CLASS_VOLATILITY`. Text or a negative in a debt amount is now refused rather
  than made zero.
- **New warnings:** `FILING_HOUSEHOLD_MISMATCH` and `EXPENSE_AFTER_PLAN_END`. A default plan (joint filing, no spouse) now carries the
  first.
- **The expanded corpus's input hash is unchanged;** only `issues` moved (handover §5).

Please number findings **R37-NN** and publish them in the usual report-only pull request, on a branch named like
`audit/chatgpt/r37-4a9a15e`. This repository is public: please call me "the owner", and include no name, email address or personal
path.

Thank you,
the owner
