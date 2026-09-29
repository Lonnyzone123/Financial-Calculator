# S5AA R37 — self-audit

*Claude's check of the round before it goes to ChatGPT, 2026-09-29 (local, UTC−7), at `4a9a15e`.*

## 1. What was checked, and how

- **Each finding against its repro and R32V's verdict.** SA32F-21 threw; SA32F-40 ran at 0%; SA32F-55's hash moved; each SA32F-51 case
  was accepted by one side. Each was reproduced before its change.
- **Every hand figure recomputed.**
  - Housing: 5,400 × 1.03 = 5,562 and × 1.03² = 5,728.86.
  - The HSA gross-up: 20,000 / 0.8 = 25,000.
  - The joint base: 10% of 160,000.
  - The surtax step: min(NII, MAGI − threshold).
  - The card minimums: 10,000 × 0.95¹² = 5,403.60 and × 0.98¹² = 7,847.17.
  - The clipped mean by numerical integration: 13.31%.
- **Movement:** every engine commit was probed against the control. The expanded corpus was captured at `4a9a15e` and compared with
  R36's capture over the same inputs: only `issues` moved, and every change is named in the handover (§5).
- **What the app shows** was read through the jsdom harness for the new cards, the Monte Carlo guidance, the joint base and the
  future-change pre-fill.

## 2. What the checks caught

- **My own premises, five times:**
  - a refusal code without the gate's `SCENARIO_` prefix;
  - `mfs` as a supported status (Q68 refuses it);
  - the opening row read as a charged row;
  - a joint account on a type that cannot be joint;
  - 0.98¹² worked by hand as 7,847.23 when it is 7,847.17.

  Each was corrected in the test, never in the engine.
- **A false claim in a commit message.** `503db3c` says the app rendered one engine issue code; it rendered three. I had taken the
  number from a note instead of the source. The code comment and the test were corrected at `890ff72`; the message cannot change.
- **The gate and closeout, twice.**
  - SA32F-51's first test read an engine internal, so closeout refused its only witness as coupled. It now pins the year through
    `runPlan()`.
  - The new warnings moved the Result schema catalogue. It was regenerated and the diff read: only optional `state` keys.
- **An overstatement in my own handover draft:** "each test failed before" and "every commit was probed". Both were narrowed to
  what was run.

## 3. Choices the owner may want to revisit

1. **The default plan files jointly with no spouse,** so a plan left at the default now shows the filing card.
2. **The HSA's 65 follows Q137's opening-age convention** rather than proration.
3. **A joint account's percent of salary is the household's.**
4. **The 1959 warning is now a visible card,** beyond the two warnings the recommendations named.
5. **Monte Carlo guidance withholds the amount and the cut** rather than computing a conditional failure distribution.

## 4. What remains

The handover's §6 known limits, and the eb relay: FEATURES.md and MODEL_ASSUMPTIONS.md §8, §9 and §18.3, plus the new text.
