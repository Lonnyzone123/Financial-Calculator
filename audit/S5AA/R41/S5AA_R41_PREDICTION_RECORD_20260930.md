# S5AA R41 — prediction record: an end age before the starting age is refused

*Written by Claude on 2026-09-30 (Arizona, UTC−7), committed before the engine or validator is edited, as amendment A-01
requires. Base: `main` at `4a31a28`, whose engine and app are those of `s5aa-r40.1-source` (`978a6e4`; `git diff 978a6e4
4a31a28 -- src tests tools investment-calculator-v2c.html` is empty).*

## What was found

The owner had task 6.5 run, the desktop-browser check that ChatGPT's R40.1 report names as the only blocker (E15).
The check passed on `978a6e4`; its evidence is recorded with this round. While it ran, one plan in the browser corpus,
an edge Claude added (`edge:end-age-before-start`: the baseline plan with `profile.endAge` one year below
`profile.age`), was **accepted by the app's "Restore backup" and projected backwards**:

- `validateScenario()` returns `valid: true`, with one WARNING, `INCONSISTENT_AGES` at `profile.endAge`. That warning
  compares the end age with the **retirement** age (`src/scenario-validator.js:234`); nothing compares it with the
  starting age. The import refuses a backup only on an ERROR (`reviewImportedScenarios()`, `src/app-shell.html:876`).
- `runScenario()` returns no calculation error and two rows, at ages **29.5 and then 28.5**.
- The form cannot produce it. `readStatic()` sets `retireAge` to at least the starting age and `endAge` to at least
  `retireAge` (`src/app-shell.html:534`); measured in the browser, an age of 90 with an end age of 80 posted an end age
  of 90. The import's own upgrade only caps `endAge` at 100 (`src/app-shell.html:511`).

The owner decided on 2026-09-30: **"Repair now"**, before ChatGPT sees the E15 evidence.

## The repair, as it will be built

- **Engine:** the input gate refuses a plan whose `profile.endAge` is below `profile.age`, both finite numbers, with
  `SCENARIO_END_AGE_BEFORE_START`: no rows, an ERROR issue, as the other gate refusals do. The function joins the
  Worker's function list.
- **Validator:** the same condition is an ERROR, `END_AGE_BEFORE_START` at `profile.endAge`, so the app's import refuses
  such a backup and the validator and the engine agree.
- **Not changed:** an end age **equal** to the starting age (the form produces it at an age of 90 or more, and it
  projects one row, measured), an end age between the starting age and the retirement age (the existing warning), and a
  retirement age below the starting age (an already-retired household; ten corpus plans carry that warning today).

## Predictions

1. **No corpus plan reaches the new refusal.** `audit/S5AA/R41/prediction/end_age_corpus_check.js`, run on `4a31a28`:
   control 36 plans and expanded 71, **none** with an end age before or equal to its start. The only age issues the
   validator reports on the corpus are `INCONSISTENT_AGES` at `profile.retireAge` (ten expanded plans, one of them in the
   control), which the repair does not touch.
2. **Control 4.7:** zero movement, so zero unpredicted, and no declaration added to
   `tools/control-candidate-prediction.json` (53 declarations stay 53).
3. **Expanded capture:** equal to **r20** (`tools/baseline-20260930-s5aa-expanded-r20.json`, input hash
   `1d91d6733295298f22dcbce36b5c730fd014a7a51e1e7dfed1e9259c02fbc4ce`) in all 71 entry hashes, so no new baseline is
   registered.
4. **The new test**, hand-derived and not compared with another engine run:
   - the end age one year below the start, in simple, Monte Carlo and historical modes: `calculationErrorCode`
     `SCENARIO_END_AGE_BEFORE_START`, `rows` null, one ERROR issue naming the ages;
   - the validator: an ERROR `END_AGE_BEFORE_START` at `profile.endAge` on that plan, none on the controls;
   - controls, each projected as today: end age equal to the start (one row, at the starting age); end age between the
     start and the retirement age (the `INCONSISTENT_AGES` warning still at `profile.endAge`, rows to the end age);
     retirement age below the start (the warning at `profile.retireAge`).
   Against `4a31a28` the refusal and validator assertions fail and the controls pass; that run is recorded in the
   self-audit.
5. **Gate:** passes, with the new test's cases added to the count; closeout 12/0/0.
6. **The browser check is repeated on the repaired, rebuilt and hash-pinned candidate** (A-04), with the same scripts,
   and is predicted to give the same results as on `978a6e4`, plus the new refusal: the edge plan refused at import and,
   in the Worker and on the main thread alike, refused by the engine.
