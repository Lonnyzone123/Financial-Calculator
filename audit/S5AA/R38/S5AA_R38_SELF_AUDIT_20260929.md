# S5AA R38 — self-audit

*Claude's check of the round before it goes to ChatGPT, 2026-09-29 (local, UTC−7), at `678c556`.*

## 1. What was checked, and how

- **R35-01 against ChatGPT's own witness.** The adjacent repro (`audit/S5AA/R37/S5AA_R33_R37_EXTERNAL_REPRO_20260929.js`) was run on
  `80dd944` before any change. It printed 6,000, 8,400 and 14,400 where 3,600, 8,400 and 12,600 are right. The mechanism was read in
  the source: the forfeiture loop ran before the contribution block.
- **The law at the source.**
  - 26 USC 411(a) (nonforfeitable at normal retirement age) and 411(a)(8) (its definition), read at law.cornell.edu.
  - 26 USC 402A(a) and (c)(1), read for the Roth-match question in §3. Neither conditions a Roth match on full vesting, so I made no
    claim that they do.
- **Every hand figure recomputed.**
  - Vesting: 3,000 + 20% × 3,000; 9,000 + 40% × 9,000; 7,500 + 40% × 7,500 on the spouse's clock (service 2 + floor(45.5 − 44.25)); 15,000
    matched at 65.5.
  - The single and joint first-year tax: 10,707.50 and 8,125, also confirmed on the engine.
- **Each new test run against the tree before its change.** The defect tests failed with the values in the handover's §4. The controls
  passed on both.
- **Movement:** the control was probed after each change. The expanded corpus was captured at `678c556` and compared with R37's capture
  (handover §5).

## 2. What the checks caught

- **My own premise, once.** The Roth-match control first asserted a closing Roth balance of 6,000. The engine holds 5,565, because the
  income tax on an elected Roth match (435, consistent with 12% federal and 2.5% Arizona on 3,000) is drawn from the portfolio (Q96). The control now asserts
  what it controls: the rows' contributions sum to 6,000, with no negative employer entry. The tax draw is recorded as observed, not
  changed.
- **A wrong forecast of my own.** I told the owner that the filing change would move the five golden plans and about 24 corpus plans.
  The first full run with the change showed exactly that: 25 failures, most in the control and golden checks. It also showed that the
  corpus's inputs themselves change, which the round-trip forbids. `extractDefaultPlan` already keeps the tests' starting age apart from
  the app's, so it now keeps the filing status the same way, and nothing in the corpus moves. The owner has been told.
- **A command-line limit.** `npm run test:list` exceeds Windows' command-line length. The full list was run through a spawn wrapper
  instead. The gate itself (`verify-test-gate`) is unaffected.

## 3. Choices the owner may want to revisit

1. **The plan's normal retirement age is 65,** the owner's choice. A plan whose own age is earlier (for example 62) vests earlier. There
   is no input for it.
2. **The test corpus keeps the joint return,** so its no-spouse plans still show the filing card. A corpus rebuilt on the single return
   would be its own change.
3. **The Roth-match inconsistency** (handover §6): `vesting` 100 with `yearsOfService` 0 routes a match to Roth, taxes it, and then
   forfeits most of it. It needs the IRS guidance checked before a rule is chosen.

## 4. What remains

The handover's §6 known limits, and the eb relay (FEATURES.md and MODEL_ASSUMPTIONS.md text for vesting and the default filing status).
