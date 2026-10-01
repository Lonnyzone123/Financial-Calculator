# S5AA R43 — prediction record, part 3: contributions

*Written by Claude on 2026-10-01 (Arizona, UTC−7). Committed before the part 3 engine and app edits, as amendment A-01
requires. Base: `b131aeb`, part 2 built and gated (3,196 tests, 0 failing, 9 todo; closeout 12/0/0). The round's
decisions are in part 1.*

## What part 2 taught this scan

Part 2's prediction missed twice; the self-audit records both:
- **An over-prediction:** `seed:3` and `seed:17` were predicted to move and did not. Every flagged row was past their
  contribution stop.
- **An unpredicted movement:** `expansion:monte-carlo-sensitive-band` moved under SA42F-22. The scan read averaged Monte
  Carlo rows, but IRMAA is charged per path.

So this scan:
- requires every contribution to flow, with the owner inside the engine's own contribution window
  (`ownerContributionWindow()`);
- names a stochastic plan whenever its condition depends on a value that varies by path.

## The repairs, as they will be built

- **The owner's ruling, the spousal IRA (IRC 219(c)(1)(B), (c)(2)).** On a joint return:
  - the spouse with the higher (or equal) compensation is held to their own compensation left after workplace deferrals
    and HSA contributions;
  - the spouse with less compensation is held to their own plus the other's, less the other's IRA contributions.

  The planned path and the one-time path both apply it. A spouse with no pay keeps using the worker's.
- **The owner's ruling, HSA contributions stop at 65.** An owner's HSA deposits flow only until their 65th birthday,
  prorated within the row (223(b)(7), with Medicare enrollment at 65 assumed and disclosed). A deposit stopped this way is
  not a limit excess, so it is not redirected, as with an owner who is not working.
- **SA42F-12.** Employer money (match and profit sharing) is held so that the owner's non-catch-up deferrals plus
  employer money do not exceed their pay for the row (415(c)(1)(B), (c)(3)(D)). This is a running total per owner across
  their workplace accounts, with a warning.
- **SA42F-13.** When a deceased owner's workplace account passes to the survivor, its unvested employer share stops being
  tracked. The survivor's later retirement forfeits nothing of it (R38 §6: "a death before separation forfeits nothing").
- **SA42F-14.** The form's dated presets stamp a spouse-owned account's change at the spouse's age plus five (or ten).
- **SA42F-15.** The shared HSA family base is used up in dollars (each owner's rate times their window), not at the rate.
  Where it does not bind, the arithmetic is unchanged.
- **SA42F-24.** The app's contribution-limit cards call `auditContributions()` with `ownerContributionWindow()`, the
  window the projection uses, so the spousal IRA window is seen.
- **SA42F-25.** A planned change dated strictly inside a row is time-weighted across the row. A row no change splits keeps
  its arithmetic.

## Predictions

### 1. The corpus

`audit/S5AA/R43/prediction/contrib_corpus_scan.js`, run on `b131aeb` (output: `prediction/contrib_corpus_scan_at_b131aeb.txt`).
Its **positive control flags every witness and none of the controls**.

| repair | control (36) | expanded (71) |
|---|---|---|
| ruling, HSA at 65 | **`seed:4`** (historical): the self is 67 at the start, works to 75 with a contribution stop at 74, and plans an $11,835.22 HSA | the same |
| ruling, spousal IRA; SA42F-12, -13, -15, -25 | none | none |
| SA42F-14, -24 (app only) | none | none |

So:
- **Control 4.7:** `seed:4` moves, and nothing else. Every HSA deposit stops: the lawful part, and the over-limit part the
  plan now redirects to taxable. The HSA's tax exclusion goes with them, so taxes rise and the HSA and taxable balances
  fall.
- **Expanded capture:** `seed:4` moves too. `expansion:monte-carlo-sensitive-band` keeps part 2's movement, and the other
  69 entries equal r21.

**Limits:**
- `seed:4` is historical. Its movement is a property of its ages, not its returns, so it is named outright.
- The spousal IRA condition bounds each owner's pay by salary times the part worked. Employment streams are not added. No
  corpus row comes near the condition.

### 2. The witnesses, hand-derived from the rules and the inputs

The tests are in `tests/audit-s5aa-r43-contributions.test.js`. Each defect test was run on `b131aeb` and fails at the
figure shown as "today". The controls pass.

| | witness | today | predicted |
|---|---|---|---|
| ruling, spousal IRA | joint, both 45; pay $4,000 and $3,000; the higher earner asks $7,500 | $7,000 | **$4,000** (own pay) |
| ruling, both ask | the same, both asking $7,500 (the spouse's IRA a Roth) | $7,000 / $0 | **$4,000 / $3,000**: the lower earner has $3,000 + ($4,000 − $4,000) |
| ruling controls | the lower earner alone; a non-working spouse | $7,000; $7,500 | unchanged |
| ruling, HSA at 65 | spouse 64.5, working, a $4,000 HSA | $4,000 a row | **$2,000** in the row they reach 65, then **$0** |
| ruling, HSA control | an owner of 63 | $4,000, $4,000 | unchanged (65 is reached at the second row's close) |
| SA42F-12 | $30,000 of pay, a $24,500 deferral, 25% profit sharing | 401(k) $32,000 | **$30,000** |
| SA42F-12 | a $20,000 deferral, a 100% match up to 100% of pay | $40,000 | **$30,000** |
| SA42F-12 control | $60,000 of pay | — | $39,500, unchanged |
| SA42F-13 | the owner dies at 47; the household separates at 50 | $36,000 from 51 | **$40,000** throughout |
| SA42F-14 | "25% in five years" on a spouse's account, the spouse 53 or 40 | stamped at 50 | **58** and **45**; the primary person's account keeps their clock |
| SA42F-15 | the family limit, the spouse's window half the row | HSA $4,375 (spouse first) | **$8,750** in either order, $4,375 redirected |
| SA42F-24 | the app's card call | reads `ownerContributionEligibility()` | reads `ownerContributionWindow()`; the projection deposits $8,600 and redirects $1,400 |
| SA42F-25 | "set to $0 at 46.5" on a $10,000 401(k) | $10,000 in the row closing at 47 | **$5,000** |
| SA42F-25 control | the change at 47 | — | unchanged |

### 3. The gate and the browser

- **Gate:** passes, with the new tests; closeout 12/0/0.
- **Browser:** the app changes (the preset and the limit cards), so the round's final candidate repeats task 6.5 (A-04).
