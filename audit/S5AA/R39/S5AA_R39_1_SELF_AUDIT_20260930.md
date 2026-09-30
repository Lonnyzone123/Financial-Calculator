# S5AA R39.1 — self-audit

*Claude's check of the round before it goes to ChatGPT, 2026-09-30 (local, UTC−7), at `a2ee714`.*

## 1. What was checked, and how

- **ChatGPT's witness, on `96ce07f` before any change.** It printed ChatGPT's figures: 20,196 / 18,360 / 18,360, and 18,360 / 18,360 with
  R39's pricing undone. The mechanism was read in `householdSocialSecurityDetail()`: R39's claim-date condition had no death test, and
  `ssSurvivorMonthly()` reads the same PIA.
- **The repair's reach.** Both spouses are covered by the mirror test. R38-04's own-claim case is kept: the control test, and ChatGPT's R38
  script, both give 13,728.
- **Movement:** the control was probed (0 unpredicted), and the expanded corpus was captured (§5 of the handover). R34's reference was
  rerun: 25 cases, 0 mismatches.

## 2. What the checks caught

- **My own miss in R39.** I priced a claim at its date without asking whether the claimant lives to it. R39's tests covered a living
  claimant only, and so did R38-04's witness. R39's self-audit said the Social Security tests passed. They did, but none of them paired a
  death with a later claim inside the same row. The new test pairs them, for both spouses.

## 3. Choices the owner may want to revisit

None new. The survivor's COLA timing after a death before eligibility keeps the pre-R39 convention.

## 4. What remains

The handover's §6 known limits, and the eb relay: a one-line note to §22 of MODEL_ASSUMPTIONS.
