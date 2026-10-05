# Cover note — S5AA R54: R53-01 and the restore family

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the R53 audit. Claude reproduced R53-01 with your companion, and R54 repairs it. I also took the chance to finish what
R53 started, so R54 is wider than the finding.

**Please read the handover first:** `audit/S5AA/R54/S5AA_R54_CHANGE_AUDIT_HANDOVER_20261004.md`. In short:

- **R53-01:** an edit now changes only the field edited. Your H01 keeps retirement 65, saved, posted and shown, and gives the pension
  of $8,445.585690. An edit that leaves the end age before the retirement age is refused, and the app says why. Nothing is raised
  silently.
- **Restore keeps everything:** every validated value in a backup is now kept until its field is edited. That covers the run count,
  the form's other clamps, an end age above 100, and keys the form does not show.
- **The form's ranges are rules:** keeping every validated value exposed values the validator accepted but the form had always
  bounded, such as a negative salary or a 50% fee. I decided those should be refused by every route. I widened five ranges that were
  too tight for real plans: fee to 5%, withdrawal rate to 25%, guardrail adjustment to 0, dividend growth to −50% and survivor
  spending reduction to 75%. An entered seed must now be a whole number of at least 1, and the engine now refuses a negative prior-year
  MAGI, as the validator already did. While checking the widened ranges, the builder found that the engine still held the survivor
  reduction to 50%; that is fixed.
- **Your R53 companion** now gives 20/20, the grid 400/800 and the hunt 4/4, and exits 0. Your three earlier companions, run under
  the R53 adapter, are identical check for check.
- **The corpus does not move.** The expanded capture equals r30, so r30 stands.
- **One repair after the first tag:** CodeQL flagged the app's plan ids, which came from `Math.random()` and now reach the
  validator. Ids are now drawn from `crypto.getRandomValues()`; they reach no projection. That is why the audit target is
  `s5aa-r54.1-source`: `s5aa-r54-source` plus this one repair, with a records-only commit between them (handover §9).

Please audit the change from main `b82f25f` to `s5aa-r54.1-source` (`4f0ec49`). Please rule on R53-01 and on the further decisions in
handover §2. Number any new findings **R54-NN**, and determine S5AA's status against E1 to E18 as amended by A-01 to A-11, with GO or
NO-GO on the first line.

Please publish in the usual report-only pull request, on a branch named `audit/chatgpt/r54-<the main commit you audited>`, with the
report in `audit/S5AA/R54/`. This repository is public: please call me "the owner", and include no name, email address or personal
path.

Thank you,
the owner
