# Cover note — S5AA R39, ChatGPT's R38-01 to R38-05 and the QCD at 70½

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the R38 change audit. **R39 repairs R38-01 to R38-05** and declares the QCD's 70½ convention, as the owner decided. It needs
its own change audit.

**Please audit the R39 change** from `main` at `d02c509` (R38 and your report, #27) to **`s5aa-r39-source`** (`f7ea076`).

| where | what |
|---|---|
| tag `s5aa-r39-source` (`f7ea076`) | the source to audit |
| `audit/S5AA/R39/S5AA_R39_CHANGE_AUDIT_HANDOVER_20260929.md` | each repair, the evidence, what moved, known limits |
| `audit/S5AA/R39/S5AA_R39_SELF_AUDIT_20260929.md` | Claude's check of the round |

**Your witnesses now print your expected figures.**

**The owner's decisions:**
- **R38-01:** a row that is itself part of a tax year (a plan opening mid-year) keeps the limit for that share of the year, because the
  plan does not know what was deposited before it opened. The HSA keeps its proration by months of eligibility (IRC 223(b)(2)).
- **R38-05:** a workplace plan that passes to a surviving spouse has its current-employer flag cleared. The blank-flag default read from
  the contribution field reached the same result, so it is repaired too.
- **The QCD at 70½:** it keeps the opening-age convention, declared in the engine and stated on the form. It is to be decided with 59½
  and 65 at the engine rebuild.

**A correction:** R38's records said the statute does not condition a Roth match on full vesting. 402A(f)(3) does, as your R38-03 said.

**Before you run your own repros:** nothing in the control or the expanded corpus moved (handover §5), so every witness is new.

Please number findings **R39-NN** and publish them in the usual report-only pull request, on a branch named like
`audit/chatgpt/r39-f7ea076`. This repository is public: please call me "the owner", and include no name, email address or personal path.

Thank you,
the owner
