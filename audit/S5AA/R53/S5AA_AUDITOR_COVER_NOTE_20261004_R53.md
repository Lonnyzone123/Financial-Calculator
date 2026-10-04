# Cover note — S5AA R53: the repairs for R51F-01, R52-01 and R52-02

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the R51F full-model audit and the R52 audit. Claude verified all three findings: each reproduces, the cause is where you
said, and your legal reading holds. R53 carries my decisions on them.

**Please read the handover first:** `audit/S5AA/R53/S5AA_R53_CHANGE_AUDIT_HANDOVER_20261004.md`. In short:

- **R51F-01:** the grace year now has a monthly test. A benefit month with wages at or below the monthly exempt amount is not
  withheld, and any self-employment profit in a month counts as services. F01–F03 now give $10,800. In the year of full retirement
  age the monthly amount is the higher one ($5,430 for 2026, 404.430(a)(2)(ii)).
- **R52-02:** a restored backup keeps every validated value unless the user edits that field. U02 now keeps its transfer at 45.75,
  with its $375 of additional tax. An unlisted manual withdrawal order is kept as well.
- **R52-01:** I decided that an end age before the retirement age is refused everywhere: by the validator, the engine and the import,
  each with a message that names it. U01 is therefore refused at import rather than projected. Before that refusal was added, the
  restore change alone kept U01's end age at 41 (106,050).
- **Your companion scripts:** many of your cases enter "still working when the plan ends" as a retirement age after the end age, so
  the refusal stops them. I kept the refusal, and Claude built an adapter (`audit/S5AA/R53/S5AA_R53_COMPANION_ADAPTER.js`, a
  `node -r` preload) so your scripts can be rerun unedited. It enters such plans with the retirement age at the end age.
  - It is output-neutral: before the refusal, every one of your verdicts is identical with and without it.
  - With it at the head: the R51F probes give 36/36, the R46–R51 simulations 20/20, and the R52 boundary cases 20/20 plus U02. H01
    is unchanged, and U01 is refused.
  - For future probes, please enter such a household with the retirement age equal to the end age.
- **The corpus does not move.** The expanded capture equals r30, so r30 stands.

Please audit the change from main `cbce0ce` to `s5aa-r53-source` (`2a1f5ba`). Please rule on each of R51F-01, R52-01 and R52-02, and
on the refusal. Number any new findings **R53-NN**, and determine S5AA's status against E1 to E18 as amended by A-01 to A-11, with GO
or NO-GO on the first line.

Please publish in the usual report-only pull request, on a branch named `audit/chatgpt/r53-<the main commit you audited>`, with the
report in `audit/S5AA/R53/`. This repository is public: please call me "the owner", and include no name, email address or personal
path.

Thank you,
the owner
