# Cover note — S5AA R41: the task 6.5 evidence for E15

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the R40.1 audit and determination. You found no new R40-NN finding and held S5AA at NO-GO on one line,
**E15**: task 6.5, the desktop-browser check on the final candidate, had not run. **R41 runs it, and I am bringing the
evidence back for your E15 determination.**

**It also found one defect, which I had repaired before sending.** A backup whose end age is before its starting age was
restored with only a warning, and the projection ran backwards (ages 29.5, then 28.5). The form cannot produce it; only
Restore backup let it through. Now the engine refuses it and the validator reports it as an error. The repair was
predicted first, and no corpus figure moves. Because the source changed, the final candidate is **`s5aa-r41-source`**, and
the whole browser check was repeated on it, as A-04 requires.

| where | what |
|---|---|
| tag `s5aa-r41-source` (`984197c`) | the final candidate: `s5aa-r40.1-source` plus that one repair; built artifact SHA-256 `7e2e5aaf…43f8` |
| `audit/S5AA/R41/S5AA_R41_E15_BROWSER_EVIDENCE_20260930.md` | **the evidence:** the candidate and environment, the method, every result bound to its SHA, the other checks, and how to reproduce |
| `audit/S5AA/R41/e15/` | the scripts as run, and the raw results for `984197c` and for `978a6e4` |
| `audit/S5AA/R41/S5AA_R41_PREDICTION_RECORD_20260930.md` | the repair's prediction, committed before the edit (`03d6ed4`) |
| `audit/S5AA/R41/S5AA_R41_SELF_AUDIT_20260930.md` | Claude's errors this round, and three things observed and not repaired |

**In brief, on `984197c`,** in Chromium 152 on Windows 11:
- **Main thread against an actual Worker:** identical full results on all 75 plans (the expanded corpus plus four
  refusal and edge cases). 72 are also identical to Node. The other three are Monte Carlo plans that differ from Node by
  at most 1.83 × 10⁻¹⁵ relative, from Chromium's and Node's `log`, `cos` and `exp`. No count or rate moves.
- **The raw export:** the projection CSV is byte-identical between the app's Worker path and its main-thread path for all
  70 plans the import accepts. Compare mode ran four concurrent Workers, and each matched.
- **The exception:** with a Worker that throws, and with one that fails to load, the app fell back to the main thread
  with the identical CSV. With both paths throwing, it showed the error card with no figures, refused the CSV, and the
  debug export recorded the actual error. After the faults were removed, it recovered exactly.

**Please determine E15** at `s5aa-r41-source` (`984197c`). Please also audit the R41 change, from `s5aa-r40.1-source`
(`978a6e4`) to `s5aa-r41-source`, numbering any findings **R41-NN**, and say whether S5AA is **GO** or **NO-GO** against E1
to E18 as amended by A-01 to A-10. Put GO or NO-GO on the report's first line.

**Three things you should know:**
- The browser is the Claude desktop app's built-in Chromium. A stock Chrome or Edge was not available to Claude this
  time; the scripts run in any browser if you want a second.
- This is not the post-S6 phone campaign.
- R40's relay to eb cited three commits by their pre-amend IDs. The evidence document, §7, corrects them.

As before, a GO is administrative: not a release, and not household reliance. Closing the milestone, the `s5aa-closed`
tag and the go for S5b stay with me.

Please publish in the usual report-only pull request, on a branch named `audit/chatgpt/r41-984197c`. This repository is
public: please call me "the owner", and include no name, email address or personal path.

Thank you,
the owner
