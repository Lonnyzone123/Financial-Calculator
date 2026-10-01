# Cover note — S5AA R44: R43-01 to R43-04

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the R43 audit, and for ruling on every R42F finding. Claude reproduced R43-01, -02 and -03 exactly with your
script. **I decided to repair all three in R44.** For R43-01 I chose to follow IRC 223(b) on both routes: in the year an
owner turns 65, the HSA limit is prorated by the share of the year before 65, for planned and one-time contributions alike.

**I did not accept R43-04 as a disclosed miss.** I asked for two things:
- **a written prediction checklist** that every prediction from R44 on follows;
- **a proof on R43's own trees** that corrected scans would have predicted what actually moved.

The source is **`s5aa-r44-source`** (`06e551e`).

**What R44 changes:**
- **R43-01:** a one-time HSA contribution at 66 now moves $0. In the year a spouse turns 65 halfway through, the limit is
  (8,750 + 1,000) × 0.5 = $4,875 on both routes.
- **R43-02:** the one-time route reads a future stream at its latched today's-dollar amount, so your $7,500 moves in full.
- **R43-03:** a negative match rate, match cap or profit-sharing percentage is refused by both layers.

**On R43-04:**
- **The proof:** the corrected scans name exactly the plans that moved in parts 3, 4a and 4b, with `seed:4`'s direction
  right. In part 2 they catch the band member and drop the two over-predictions. One Monte Carlo plan remains named: four
  of its paths do change, but its published result does not, and the checklist now classes such a plan as a stochastic
  prediction.
- **A correction:** building the part 2 scan showed that R43's stated cause of SA43-B was wrong. The band member has no
  health costs; it moved through the optimized withdrawal order's IRMAA guard.
- **R44's own prediction,** the first held to the checklist, named two plans. `seed:4` moved exactly as predicted, to the
  cent. One detail missed: `seed:13`'s change is warning text, which control 4.7 compares only by length. It is disclosed.

| where | what |
|---|---|
| tag `s5aa-r44-source` (`06e551e`) | the source to audit |
| `audit/S5AA/R44/S5AA_R44_CHANGE_AUDIT_HANDOVER_20261001.md` | what is asked; the repairs and witnesses; R43-04's checklist and proof; R44's prediction against actual; the checks |
| `audit/S5AA/R44/S5AA_R44_PREDICTION_CHECKLIST_20261001.md` and `S5AA_R44_R43_04_RETRO_PROOF_20261001.md` | the checklist (C1 to C8) and the proof, with scripts and raw outputs in `prediction/retro/` |
| `audit/S5AA/R44/S5AA_R44_SELF_AUDIT_20261001.md` | Claude's errors this round |

**Please audit the R44 change** from `s5aa-r43-source` (`5b8f0d5`) to `s5aa-r44-source`. Number any findings **R44-NN**, say
whether the R43-04 work meets your finding, and determine S5AA's status against E1 to E18 as amended by A-01 to A-10. Put
**GO** or **NO-GO** on the report's first line.

As before, a GO is administrative: not a release, and not household reliance. Closing the milestone, the `s5aa-closed` tag
and the go for S5b stay with me.

Please publish in the usual report-only pull request, on a branch named `audit/chatgpt/r44-06e551e`. This repository is public:
please call me "the owner", and include no name, email address or personal path.

Thank you,
the owner
