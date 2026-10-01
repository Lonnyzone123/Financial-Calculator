# Cover note — S5AA R42: R41F-01 to R41F-05 repaired

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the R41F whole-model audit. Claude reproduced all five findings exactly with your script, and read the two
Social Security rules at SSA's POMS. **I decided to repair all five in one round, R42.** The source is
**`s5aa-r42-source`** (`c67c713`).

**What R42 changes:**
- **R41F-01:** a worker's excess earnings reach the family's benefits on the worker's record, in whole months. The
  spouse's own excess applies to what is left, as RS 02501.095 B.4 orders.
- **R41F-02:** a survivor's 82.5% limit reads the deceased's credited months, effective from the deceased's (would-be)
  full retirement age.
- **R41F-03:** an IRA owner's window on a joint return is the longer of the two spouses' work.
- **R41F-04:** the Roth limit's salary-only proxy reads each salary at the share actually worked.
- **R41F-05:** a Social Security benefit that is not a number is refused, by both the validator and the engine.

Each repair was predicted before the edit, tested first, and its expected figures were hand-derived.

**One prediction was wrong, and it is disclosed.** The prediction said no corpus plan moves. `seed:20` moves, from row
67: its Social Security rises $804.21. There both spouses work while claiming early. Under SSA's order, part of the
worker's withholding falls on the spouse's spousal benefit, which the spouse's own earnings would have withheld anyway.
Claude's scan had excluded that case. The movement is traced to the cent, declared, and registered as baseline **r21**.

| where | what |
|---|---|
| tag `s5aa-r42-source` (`c67c713`) | the source to audit; built artifact SHA-256 `1e44b9ae…16cd` |
| `audit/S5AA/R42/S5AA_R42_CHANGE_AUDIT_HANDOVER_20260930.md` | what is asked; each finding's repair, witness and expected figures; the corpus movement; the checks; the browser check repeated on the final candidate |
| `audit/S5AA/R42/S5AA_R42_PREDICTION_RECORD_20260930.md` | the prediction, committed before the edits (`550764b`), with its scan and positive control |
| `audit/S5AA/R42/S5AA_R42_SELF_AUDIT_20260930.md` | Claude's errors this round, including the missed prediction (SA42-06), and what was observed and not repaired |

**Please audit the R42 change** from `s5aa-r41-source` (`984197c`) to `s5aa-r42-source` (`c67c713`). Number any findings **R42-NN**,
and determine S5AA's status against E1 to E18 as amended by A-01 to A-10. Put **GO** or **NO-GO** on the report's first
line.

**One limit is disclosed and not repaired:** the adjustment of the spousal reduction factor for spousal months withheld
before the recipient's full retirement age. Your witness's spouse is past full retirement age.

As before, a GO is administrative: not a release, and not household reliance. Closing the milestone, the `s5aa-closed`
tag and the go for S5b stay with me.

Please publish in the usual report-only pull request, on a branch named `audit/chatgpt/r42-c67c713`. This repository
is public: please call me "the owner", and include no name, email address or personal path.

Thank you,
the owner
