# Relay to eb — S5AA R54: R53-01, the restore family, and the form's ranges as rules

*Written by Claude, 2026-10-04 (Arizona, UTC−7). This is prose for eb to place once R54 merges. No file of eb's has been edited.*

## 1. `MODEL_ASSUMPTIONS.md` (§28.7, Restore backup, and the input ranges)

- **Edits change only their own field** (replacing R53's clamp sentence):

  > Editing a field changes only that field. Editing the current age never moves the retirement or end age, and editing the
  > retirement age never moves the end age. The retirement field itself cannot be entered below the current age. An edit that leaves
  > the end age before the retirement age (or the current age) is refused. The status line, Plan checks and the results page name
  > the refusal, and no projection figures are shown.

- **Restore backup:**

  > Restore backup, and every later calculation, keep each restored value exactly as validated until the user edits that field.
  > This covers the Monte Carlo run count (for example 24), every value the form would round or clamp, an end age above 100, and
  > keys the form does not show, which are carried unchanged.

  This replaces R53's "Not kept" list. What the form still normalises, none of which changes a projection: a blank scenario name becomes "Scenario N"; the strategy's letter case is normalised (the engine resolves it the same way); and a community-property switch left off is stored as absent (the default).

- **The input ranges (new):**

  > A value outside the form's range is refused by the validator (`OUT_OF_RANGE`) and the engine
  > (`SCENARIO_PLAN_VALUE_OUT_OF_RANGE`), through `src/plan-value-contract.json`, which both layers read. A restored or imported plan
  > cannot carry one into the projection.

  The ranges:
  - salaries, spending, floor, ceiling and SS benefits ≥ 0;
  - fee 0–5%;
  - withdrawal rate 0–25%;
  - guardrails ≥ 1 and adjustment ≥ 0;
  - dividend yield 0–20, qualified share 0–100 and growth −50 to 20;
  - flexibility 0–50;
  - VPW minimum 0–25 and maximum 0–100;
  - RMD multiplier 0–200 and floor ≥ 0;
  - SS COLA 0–15;
  - survivor spending reduction 0–75;
  - correlation −1 to 1;
  - healthcare inflation 0–100;
  - Medicare inflation −99 to 100;
  - Part D 0–100,000;
  - prior income 0–1e9;
  - volatility ≥ 0.

  Further rules:
  - An entered Monte Carlo seed must be a whole number of at least 1; an absent seed uses the engine's documented fallback.
  - A negative prior-year MAGI is refused by both layers (`SCENARIO_NEGATIVE_PRIOR_MAGI`); blank means not entered.
  - Ranges the form applies only when a field is left (return, inflation, salary growth, pension COLA, reserve years) are not rules,
    and restored values outside them are kept.

- **The survivor spending reduction:** the engine used to hold it to 50% on its own. It now applies up to the 75% the input allows.

## 2. `FEATURES.md`

- "Restore backup keeps every value exactly, including run counts such as 24, fees, rates, end ages above 100 and keys the form does
  not show, until the user edits that field."
- "Out-of-range values in a backup (for example a negative salary or a fee above 5%) are refused at import, with a message naming each
  one."
- "Editing a field changes only that field; an edit that leaves the end age before the retirement age is refused and named on the
  page."

## 3. `SPRINT_QUESTIONS.md`

- **R53-01** is repaired in S5AA R54 as the owner decided on 2026-10-04 (source tag `s5aa-r54-source` = `f704638`, once pushed). It
  awaits ChatGPT's audit. The corpus is unchanged; r30 stands.
- **The owner's decisions during the build (2026-10-04):**
  - the form's ranges become rules, refused by every route;
  - five ranges widened (fee 5%, withdrawal 25%, adjustment 0, dividend growth −50%, survivor reduction 75%);
  - the seed bounded to a whole number of at least 1;
  - a negative prior-year MAGI refused by the engine;
  - the blur-only ranges recorded, not bounded.
- **New, for the owner, not yet ruled on** (build report §6):
  - D1, the retirement field's floor at the current age;
  - D3, the older error card's wording ("an internal reconciliation problem");
  - D4, an end age above 120 kept with a warning;
  - D5, typed-and-reverted counts as edited;
  - D6, the `integer` contract key used only for the seed;
  - D7, engine clamps now unreachable;
  - D8, the blur-only ranges.
- **Closes:** R53's D2 (the rest of the restore family).
