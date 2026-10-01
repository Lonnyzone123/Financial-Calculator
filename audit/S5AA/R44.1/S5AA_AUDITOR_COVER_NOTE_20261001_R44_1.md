# Cover note — S5AA R44.1: R44-01

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the R44 audit, and for requalifying R43-01 to -03. On R44-01, **I chose the owner exception you offered for
Monte Carlo forecasts.** It is recorded as **amendment A-11** in `S5AA_TASK_CHECKLIST.md`.

**A-11, in short:** for a Monte Carlo plan only, a prediction names the plan and the paths exposed to the change. The
exposure test is run on every path and is a necessary condition, so it may name more paths than change but must not miss
one. The prediction says the published result "may move".
- **After the build,** the handover compares both levels: which paths changed, and whether the published result moved.
- **Not a miss:** a named plan whose result does not move.
- **A miss:** an unnamed plan whose result moves, or a changed path that was not named.
- **Every other plan** keeps A-01 as written.

**R44.1 changes no source.** It contains:
- **A-11.**
- **A revised prediction checklist.**
  - C4 applies A-11, and forbids a stage that approximates a path's state from removing a path.
  - C8 now requires the record to say how each comparison reads a field before predicting at that level, which is what
    caused SA44-A.
- **R43 part 2 re-examined under A-11,** with every path measured on both trees:
  - **the golden plan:** the exposure test names 5 paths, including all 4 that changed (path 390 among them);
  - **the band member:** it names 13, including all 6 that changed.
- **Why path 390 was missed:** R44's second stage rebuilt each path's state from published row fields, which is not the
  engine's state at the draw, and so it dropped path 390. Under the revised C4, that stage may not remove a path.

| where | what |
|---|---|
| `S5AA_TASK_CHECKLIST.md`, amendment A-11 | the owner's exception and its scope |
| `audit/S5AA/R44.1/S5AA_R44_1_R44_01_RESPONSE_20261001.md` | R43 part 2 under A-11, path 390, revised C8 |
| `audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md` | the revised checklist (supersedes R44's) |
| `audit/S5AA/R44.1/*_check*.js` and `.txt` | the scripts and raw outputs |

**Please review R44.1** (the records on branch `sprint/s5aa-r44.1`, as merged; the source is unchanged at `s5aa-r44-source` =
`06e551e`):
- say whether A-11 and the revised checklist meet R43-04 and R44-01;
- number any findings **R44.1-NN**;
- determine S5AA's status against E1 to E18 as amended by A-01 to A-11, with **GO** or **NO-GO** on the report's first line.

As before, a GO is administrative: not a release, and not household reliance. Closing the milestone, the `s5aa-closed` tag
and the go for S5b stay with me.

Please publish in the usual report-only pull request, on a branch named `audit/chatgpt/r44.1-06e551e`. This repository is
public: please call me "the owner", and include no name, email address or personal path.

Thank you,
the owner
