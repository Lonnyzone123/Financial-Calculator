# Cover note — S5AA R40: the change, and S5AA's GO/NO-GO status

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the R39.1 audit. This time I am asking for two things in one report: an audit of the R40 change, and **your
determination of S5AA's status, GO or NO-GO**.

Before asking for the status, I had Claude check the exit gate. It found lines that R29 to R39.1 had left open: no registered corpus
baseline since r17, no predictions for R29 to R39.1's output movements, undocumented result codes, and no combined unrepaired list.
**R40 closes them.** Along the way it found four undisclosed limits, and I had them repaired.

**Before merging, I had the pull request audited as well.** Three independent reviews found defects in two of the four repairs:
- **The partial-year tax repair annualized one-time amounts.** I had it reverted, and the old behaviour is now a disclosed limit.
- **The spouse RMD repair read the wrong birth year.** It was corrected.
- The reviews also found some smaller items, which were fixed.

That is why the source is **`s5aa-r40.1-source`**; the first tag, `s5aa-r40-source`, stays where it is.

**The standing R40 repairs:**
- the long-term-care cost is inflated;
- Medicare charges the Part D premium;
- a required distribution reads the age reached in the year, by the engine's own birth year.

For E10 I added amendment **A-10**.

| where | what |
|---|---|
| tag `s5aa-r40.1-source` (`978a6e4`) | the source to audit and to determine the status at |
| `audit/S5AA/R40/S5AA_R40_CHANGE_AUDIT_HANDOVER_20260930.md` | what is asked; how the status got here; every finding since your R24G2 and where it stands; what R40 changed, predicted against measured, and the pre-merge audit's fixes; the evidence; **E1 to E18 line by line** |
| `S5AA_TASK_CHECKLIST.md`, end | amendment A-10 |
| `audit/S5AA/R40/S5AA_R40_PREDICTION_RECORD_20260930.md` and `…_PREDICTION_ADDENDUM_AUDIT_FIXES_20260930.md` | the predictions, each committed before the engine was edited |
| `audit/S5AA/R40/S5AA_R40_UNREPAIRED_LIST_20260930.md` | what R29 to R40 knowingly left unrepaired, labelled (E12) |
| `audit/S5AA/R40/S5AA_R40_SELF_AUDIT_20260930.md` | Claude's own errors this round, the pre-merge audit's findings (AUD35-01 to -13), and the checks |

**Please audit the R40 change** from `s5aa-r39.1-source` (`a2ee714`) to `s5aa-r40.1-source` (`978a6e4`). Number any findings
**R40-NN**.

**Then determine S5AA's status at `978a6e4`** against E1 to E18 as amended by A-01 to A-10:
- Does A-10 give E10 what it needs?
- Is every other line true, or dispositioned?
- If anything blocks, what exactly is missing?

Put **GO** or **NO-GO** on the report's first line.

A GO under A-09 is administrative: not a release, and not household reliance. Declaring the milestone closed, the `s5aa-closed` tag and
the go for S5b stay with me.

**Two things you should know:**
- `audit/S5AA/WORKING_RULES.md` §7 and §9 are out of date. The handover replaces them for this request.
- **The app's UI will be rebuilt, with the current one as its reference.** So the disclosures the current app does not render stay the
  explicit exception A-09 made for E14.

Please publish in the usual report-only pull request, on a branch named `audit/chatgpt/r40.1-978a6e4`. This repository is public: please
call me "the owner", and include no name, email address or personal path.

Thank you,
the owner
