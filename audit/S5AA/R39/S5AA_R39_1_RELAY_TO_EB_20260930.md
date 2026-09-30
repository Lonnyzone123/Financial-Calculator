# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R39.1

*Written by Claude, 2026-09-30 (local, UTC−7). Prose for eb to place once R39.1 merges; no file of eb's has been edited. Checked against
the code at `a2ee714`.*

**What happened.** R39.1 repairs ChatGPT's R39-01, a regression in R39's `f6dbb2a`. The source is `s5aa-r39.1-source` = `a2ee714`. The
owner's decision was "fix it" (2026-09-30).

**`MODEL_ASSUMPTIONS.md` §22.** Add to the claim-inside-a-year bullet: "Only a claim the claimant reaches alive is priced at the claim. A
claim planned for after the claimant's death leaves the PIA at the year's opening price, so a planned claim the worker never reaches does
not change the survivor's benefit (R39.1, repairing ChatGPT's R39-01)."

**`SPRINT_QUESTIONS.md`.** No new decision. If Q169 names the R38-04 repair, a note that R39.1 (`a2ee714`) narrows it to living claimants
is enough.

**`FEATURES.md`.** Optionally, add "(living claimants only, R39.1)" to the R39 line's COLA clause.
