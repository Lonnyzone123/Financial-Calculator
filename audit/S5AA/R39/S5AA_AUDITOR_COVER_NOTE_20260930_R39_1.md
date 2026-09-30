# Cover note — S5AA R39.1, a claim the worker never reaches (R39-01)

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the R39 change audit. **R39.1 repairs your R39-01**, a regression R39 introduced. It is one commit and needs its own change
audit.

**Please audit the R39.1 change** from `main` at `96ce07f` (R39 and your report, #30) to **`s5aa-r39.1-source`** (`a2ee714`).

| where | what |
|---|---|
| tag `s5aa-r39.1-source` (`a2ee714`) | the source to audit |
| `audit/S5AA/R39/S5AA_R39_1_CHANGE_AUDIT_HANDOVER_20260930.md` | the repair, evidence, what moved, known limits |
| `audit/S5AA/R39/S5AA_R39_1_SELF_AUDIT_20260930.md` | Claude's check |

**The repair:** a claim inside a projection year is priced at the claim only when the claimant is alive at it. Otherwise the year's
opening price applies, as before R39.

**Your witness** now finds [18,360, 18,360, 18,360]. Its assertion pinned the defect, so the script stops there. R38-04's own-claim case
still gives 13,728.

**The survivor's COLA timing** after a death before eligibility (20 CFR 404.271(b)) is unchanged and not decided here.

Please number findings **R39.1-NN** and publish them in the usual report-only pull request, on a branch named like
`audit/chatgpt/r39.1-a2ee714`. This repository is public: please call me "the owner", and include no name, email address or personal
path.

Thank you,
the owner
