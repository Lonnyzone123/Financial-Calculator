# Cover note — S5AA R46 to R50: the AA1 repair rounds

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

The rest of my AA1 decisions are built. Five rounds were built in parallel from R45 and then combined in order, so I am asking for
**one audit covering all five**. Each round has its own source tag and its own stacked pull request.

**Please read the combined handover first:** `audit/S5AA/R50/S5AA_R46_R50_CHANGE_AUDIT_HANDOVER_20261003.md`. Each round's build
report (`audit/S5AA/R4x/S5AA_R4x_BUILD_REPORT_20261003.md`) has the detail. In short:

| round | what it changes | source tag |
|---|---|---|
| R46 | Monte Carlo draws one set of shocks a year, shared by every account; impossible correlations are refused; the reserve is the household's; the result label reads "All modeled spending funded" | `s5aa-r46-source` (`0fd83e1`) |
| R47 | the senior deduction ends after 2028 (Q165 reversed); the Roth catch-up above the wage threshold; the 4973 excise under "warn"; the self-employment fixes; HSA contributions stop at Medicare start | `s5aa-r47-source` (`86842f6`) |
| R48 | Medicare premiums grow; a Part D premium input; the prior-income prompt; inherited IRA status before 59½; community property; the Arizona senior and capital-gain subtractions | `s5aa-r48-source` (`56ed5fd`) |
| R49 | flexibility never cuts below the floor; LTC onset age; PMI end age and the payoff residual; the working-years check; hidden warnings shown, and the validator run while editing; relabels and notes | `s5aa-r49-source` (`ec6063f`) |
| R50 | a Roth IRA basis ledger with the five-year clocks; income received earlier in the first year | `s5aa-r50-source` (`5119d03`) |

- **Every prediction** was committed before any source edit and held to the R44.1 checklist.
- **Where a prediction missed a plan** (R47, R48, R50), I did not accept it as disclosed. As I did for R43, I required the corrected
  scan to be proven on the round's pre-repair tree. The proofs are in each round's `retro/` folder.
- **Combining the rounds** was measured at every step. Each side's movement survived unchanged and nothing else moved, except the one
  intended interaction: Arizona's senior subtraction ends with the federal deduction after 2028 (handover §4).
- **My decisions on the builders' questions** are in handover §7. A follow-up round, **R51**, makes four more changes:
  - spending flexibility off by default;
  - one Medicare date for premiums and the HSA;
  - the working-years check counts employment and self-employment pay;
  - a "plan offers Roth" checkbox.

Please audit the change from `s5aa-r45-source` (`9c7790e`) to `s5aa-r50-source` (`5119d03`) round by round. Number findings
**R46-NN** to **R50-NN**, and determine S5AA's status against E1 to E18 as amended by A-01 to A-11, with GO or NO-GO for each round
and overall on the first line. Please publish in the usual report-only pull request, on a branch named
`audit/chatgpt/r46-r50-<the main commit you audited>`, with the report in `audit/S5AA/R50/`. This repository is public: please call
me "the owner", and include no name, email address or personal path.

Thank you,
the owner
