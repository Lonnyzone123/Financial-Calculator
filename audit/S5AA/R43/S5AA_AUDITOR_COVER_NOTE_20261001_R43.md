# Cover note — S5AA R43: R42-01 and Claude's R42F findings repaired, with the R42F review

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the R42 change audit. **I decided to repair R42-01, and to accept R42-02 as a disclosed miss:** the R42
prediction stands as written, with its comparison to actual. Claude's own full-model audit of the R42 source (R42F, PR
#45) reported 34 more findings. **I decided to repair all of them in the same round, R43.** I also changed three items the
model had declared:
- the spousal IRA follows IRC 219(c)(2);
- HSA contributions stop at 65;
- a survivor's costs start at the death unless the surviving spouse has a salary.

The source is **`s5aa-r43-source`** (`5b8f0d5`).

**What R43 changes, by area:**
- **Social Security** (R42-01, SA42F-02, -17, -18, -27): earnings-test withholding is charged month by month to the
  benefit payable in each month, and each benefit is credited for its own months. A claim at a half-year age no longer
  loses a COLA.
- **Federal tax and Medicare** (SA42F-01, -08, -09, -10, -22, -23): the 199A deduction on self-employment profit, the
  statutory phase-out widths, the Rule of 55 in the separation row, and the IRMAA tables.
- **Contributions** (SA42F-12 to -16, -24, -25, and two of the rulings).
- **Life events, RMDs and Medicare** (SA42F-03, -04, -11, -29, and the survivor ruling).
- **Cash flows** (SA42F-19, -20, -21, -26, -28).
- **Input checking** (SA42F-05, -06, -07, -30, -32): one plan-value contract, `src/plan-value-contract.json`, read by
  the validator and the engine alike.
- **Monte Carlo seeds, the result contract and historical starts** (SA42F-31, -33, -34).

The round was built in seven parts, each predicted before its edit and tested first, with hand-derived expectations.

**Five prediction misses are disclosed** in the self-audit:
- two plans moved where the record said none would (SA43-B, SA43-D);
- two named plans did not move (SA43-A, SA43-E);
- one moved in the opposite direction (SA43-C).

Each is traced to its cause in the engine. The expanded corpus is registered as baseline **r22**: nineteen entries differ
from r21, and its input hash moves because the Monte Carlo band member was re-chosen under the new seeds.

| where | what |
|---|---|
| tag `s5aa-r43-source` (`5b8f0d5`) | the source to audit; built artifact SHA-256 `eea770ab…94f` |
| `audit/S5AA/R43/S5AA_R43_CHANGE_AUDIT_HANDOVER_20261001.md` | what is asked; each part's commits, repairs and gate; the corpus movement; the checks; the browser check repeated on the final candidate; tests changed by intent |
| `audit/S5AA/R43/S5AA_R43_PREDICTION_RECORD_*.md` | the seven parts' predictions, each committed before its edits, with its scan and positive control |
| `audit/S5AA/R43/S5AA_R43_SELF_AUDIT_20261001.md` | Claude's errors this round: the five misses, the process errors, and the records' wrong date (SA43-J) |

**Please do two things in one report.** This replaces the separate R42F review (R42V) I had planned to ask for.

1. **Review Claude's R42F audit** (`audit/S5AA/R42F/S5AA_R42F_CLAUDE_FULL_MODEL_AUDIT_20260930.md`) as you reviewed R32F.
   For each SA42F finding, say whether you confirm, qualify or refute it. Number any new findings of your own on the R42
   source **R42V-NN**.
2. **Audit the R43 change** from `s5aa-r42-source` (`c67c713`) to `s5aa-r43-source` (`5b8f0d5`), including whether each
   repair matches the finding as you ruled on it. Number any findings **R43-NN**. If you refute a finding, please report
   its repair as an R43-NN finding, and I will decide whether to revert it.

Then determine S5AA's status against E1 to E18 as amended by A-01 to A-10. Put **GO** or **NO-GO** on the report's first
line.

**Two test changes deserve your eye:** R10's equal-age control now asserts a refusal (SA42F-30), and the contract's
`accessPct` range was removed after the part 5a prediction was committed. Both are set out in the handover, §6.

As before, a GO is administrative: not a release, and not household reliance. Closing the milestone, the `s5aa-closed`
tag and the go for S5b stay with me.

Please publish in the usual report-only pull request, on a branch named `audit/chatgpt/r43-5b8f0d5`. This repository is
public: please call me "the owner", and include no name, email address or personal path.

Thank you,
the owner
