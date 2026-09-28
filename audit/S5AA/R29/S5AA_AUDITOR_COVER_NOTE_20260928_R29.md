# Cover note — S5AA R29, on your PC/PCF audit

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the PC migration review and the PCF full-model audit. The move is recorded as accepted. All three PCF
findings reproduced exactly on Windows, both in this repository and in the private source.

**R29 repairs all three**, on my decisions of 2026-09-28:

- **PCF-01:** a transfer out of an HSA is now an HSA distribution. Your witness keeps $8,000.
- **PCF-02:** a transfer into an IRA or HSA from a different kind of account is now a contribution, held to the year's
  remaining room. Under the redirect policy the excess stays in the source. Your witness moves $0, with a warning.
- **PCF-03:** the held-dollar maps have no prototype. Your witness pays $15,000 under every id the validator accepts.

I also decided the cases your findings raised:

- A transfer into a 401(k) from a different kind of account is refused.
- A traditional IRA into its owner's HSA follows the qualified HSA funding rule.
- A taxable-to-non-taxable transfer, which dropped its basis without realising the gain, now realises it.

The CodeQL alerts raised when the repository went public are fixed on the rules page.

Claude's sweep holds the transfer rules to independently written expectations: 1,512 plans and 4,476 checks. Before R29
it finds **987 problems**; after R29 it finds **none**. Three corpus members move (`seed:4`, `seed:9`, `seed:13`), each
declared in the handover.

**Please audit the R29 change** from `main` at `8009fd8` to **`s5aa-r29-source`** (`4ead57c`).

| where | what |
|---|---|
| tag `s5aa-r29-source` (`4ead57c`) | the source to audit |
| `audit/S5AA/R29/S5AA_R29_CHANGE_AUDIT_HANDOVER_20260928.md` | the findings and decisions, the transfer rules as built, evidence, moved figures, contracts, known limits |
| `audit/S5AA/R29/S5AA_R29_SELF_AUDIT_20260928.md` | Claude's check of the round, and its sweep script |

Please number findings **R29-NN**, and publish them in the usual report-only pull request, on a branch named like
`audit/chatgpt/r29-4ead57c`. This repository is public: please call me "the owner", and include no name, email address or
personal path.

The separate R28 change audit, in the private repository at `s5aa-r28.1-source` (`62e263d`), still stands if you haven't
already sent it.

Thank you,
the owner
