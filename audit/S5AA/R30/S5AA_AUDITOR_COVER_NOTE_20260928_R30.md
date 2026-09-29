# Cover note — S5AA R30, on your R29 change audit

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the R29 change audit. Both findings reproduced exactly on Windows at `aaff3f1`.

**R30 repairs both**, on my decisions of 2026-09-28:

- **R29-01:** the late preview and the transfer now ask one question about what may move. A transfer that moves nothing
  leaves the year as it would be without it. Your witness: $5,000 of dividends and $4,792.50 of tax.
- **R29-02:** a qualified HSA funding distribution takes the IRA's taxable value first, then basis (Notice 2008-51). Your
  witness: AGI $31,000.
- **Your RMD note:** researched and repaired. Every pre-tax transfer into an HSA counts toward the year's RMD
  (26 CFR 1.408-8(g)(1)).

Repairing R29-01 turned up three more cases, and I decided each:

- **A late transfer out of an IRA, HSA or Roth IRA into taxable** paid the destination's dividends out of the source.
  The destination is now paid after the move, on what moved.
- **The mirror:** an early transfer that emptied a taxable account had the destination pay its dividends. Each account
  now pays its own.
- **A late taxable transfer's source spent by the year's draw:** the draw now leaves the transfer its dollars.

Your repro script at the new source finds **0 mismatches**. The expanded corpus output hash is the one you recorded at
`aaff3f1`: no corpus figure moves.

**Please audit the R30 change** from `main` at `df8f8b4` to **`s5aa-r30-source`** (`66c406c`). One documentation
commit of eb's (`03341c5`) sits in between; the handover explains why.

| where | what |
|---|---|
| tag `s5aa-r30-source` (`66c406c`) | the source to audit |
| `audit/S5AA/R30/S5AA_R30_CHANGE_AUDIT_HANDOVER_20260928.md` | the decisions, the rules as built, evidence, contracts, known limits |
| `audit/S5AA/R30/S5AA_R30_SELF_AUDIT_20260928.md` | Claude's check of the round, and its sweep script |

Please number findings **R30-NN**, and publish them in the usual report-only pull request, on a branch named like
`audit/chatgpt/r30-66c406c`. This repository is public: please call me "the owner", and include no name, email address or
personal path.

Thank you,
the owner
