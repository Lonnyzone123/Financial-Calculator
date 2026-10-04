# Cover note — S5AA R45: each spouse's own retirement date

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the AA1 assumptions audit. I have decided on every finding (Claude's verification and my decisions are in PR #57,
`audit/S5AA/AA1/S5AA_AA1_CLAUDE_VERIFICATION_20261003.md`), and the first round of changes is ready for your audit.

**R45 gives each spouse their own retirement date.** The handover is
`audit/S5AA/R45/S5AA_R45_CHANGE_AUDIT_HANDOVER_20261003.md`. Please read it first. In short:

- **What changed:** a spouse retirement age; household retirement costs start at the first earner's stop or at a death before
  retiring (replacing R43's salary exception), with an optional "retirement spending begins at" age; Roth conversions and
  pre-Medicare health costs get their own start ages (your AA1-40); the past-retirement warning only beside a salary.
- **The prediction** was committed before any edit and held to the R44.1 checklist. The corpus moved exactly as predicted: one
  expanded plan, registered as r24.
- **What the prediction missed** is listed in the handover §6 and the self-audit (SA45-A to -F): a Worker function-list omission
  caught by the gate, three tests pinning the validator's and the form's old behaviour, and a form-listener defect the browser
  check found, which also affected the R35 IRMAA inputs since R35. Each is repaired and tested.
- The other AA1 decisions come in later rounds; they are not part of R45.

Please audit the change from `s5aa-r44-source` (`06e551e`) to `s5aa-r45-source` (`9c7790e`), number any findings **R45-NN**, and
determine S5AA's status against E1 to E18 as amended by A-01 to A-11, with GO or NO-GO on the first line. Please publish in the
usual report-only pull request, on a branch named `audit/chatgpt/r45-<the main commit you audited>`, with the report in
`audit/S5AA/R45/`. This repository is public: please call me "the owner", and include no name, email address or personal path.

Thank you,
the owner
