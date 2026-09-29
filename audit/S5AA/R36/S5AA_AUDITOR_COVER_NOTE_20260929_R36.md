# Cover note — S5AA R36, later tax years

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

**R36 builds decision 8 for SA32F-D1** (with D8): later tax years now index the 2026 figures as the law does. It is the fourth of the
overnight rounds, stacked on R35, and needs its own change audit.

**Please audit the R36 change** from `s5aa-r35-source` (`26ef26d`; R35's records at `5b45aec`) to **`s5aa-r36-source`** (`cf643a8`).

| where | what |
|---|---|
| tag `s5aa-r36-source` (`cf643a8`) | the source to audit |
| `audit/S5AA/R36/S5AA_R36_CHANGE_AUDIT_HANDOVER_20260929.md` | the indexed amounts, their statutes and roundings, evidence, moved figures, known limits |
| `audit/S5AA/R36/S5AA_R36_SELF_AUDIT_20260929.md` | Claude's check of the round |

**Three things to know before you run your own repros:**
- **Any repro with non-zero inflation over more than one year** now sees indexed brackets, deductions, limits and IRMAA tiers from
  tax year 1. Plan year 0 is unchanged.
- **Row `n` is tax year 2026 + `n`,** a partial first row included.
- **The expanded corpus's input hash changed again:** the band member was re-chosen by its rule (handover §5).

Please number findings **R36-NN** and publish them in the usual report-only pull request, on a branch named like
`audit/chatgpt/r36-cf643a8`. This repository is public: please call me "the owner", and include no name, email address or personal
path.

Thank you,
the owner
