# S5AA R37 — change audit handover: safeguards, validator, warnings and texts

*Written by Claude, 2026-09-29 (local, UTC−7), during the owner's overnight run of R33–R37, for the owner to send to ChatGPT. Every
figure was measured on Windows 11 / Node 24.17.0 at the commits named.*

## 1. What to audit

- **The change:** from `s5aa-r36-source` at `cf643a8` (R36's records at `013062b`) to **`s5aa-r37-source`** at **`4a9a15e`**. R37 is
  stacked on R36's pull request; the diff to audit is `013062b..4a9a15e`.
- **Twelve commits,** one per group of findings, plus two repairs that the gate or closeout demanded (§4).
- **Please number findings R37-NN**, in the usual report-only pull request, on a branch like `audit/chatgpt/r37-4a9a15e`.

## 2. The decisions this round applies

- **The recommendations of record** for R37 (repair plan §6):
  - housing costs rise with the plan's inflation, disclosed;
  - an expense at `endAge` is warned about;
  - filing status against household is a warning, not a refusal.
- **Decision 7** ("Keep average, disclose") for SA32F-42.
- **Q137** (the owner, 2026-09-24, "Keep it and disclose it"), applied to the HSA's age-65 exception (SA32F-44, §3.5). That extension
  is Claude's reading; the owner may prefer proration.
- **Claude's choices where R32V asked for one definition** (each flagged to the owner):
  - a joint account's percent of salary reads the household's salary (SA32F-45);
  - Monte Carlo guidance withholds the amount and the cut rather than building a conditional failure distribution (SA32F-41);
  - the 1959 warning is shown as a card with the two new warnings (§3.3).

## 3. What changed, by finding

### 3.1 Engine safeguards — `ad62460` (SA32F-21, -40, -55)
- **An adjustable debt with a reset age** and no `payoffAge` (the engine threw a RangeError) or no `resetRate` (it charged 0% after
  the reset) is refused at the input gate: `SCENARIO_DEBT_RESET_TERMS_MISSING`. The app's form always supplies both.
- **`stableStringify()`** hashes what JSON keeps: an `undefined` or function value drops its key, and is `null` in a list. An accepted
  input's `inputHash` is the same before and after a JSON round trip.

### 3.2 The validator and `runPlan()` agree — `e923123`, test repaired at `3b45dfa` (SA32F-51)
Each case is refused by both, by name:
- **`runs` above 10,000:** the validator's ceiling is now the engine's.
- **`inflation`, `fee`, `historyStart` not numbers:** `SCENARIO_NONNUMBER_PLAN_VALUE`.
- **A historical start after the last data year:** `SCENARIO_HISTORY_START_AFTER_DATA`. The historical method only; elsewhere the
  field is inert.
- **A debt's extra principal, PMI, property tax, insurance or HOA** that is negative or not a number, and a payment that is not a
  number: `SCENARIO_INVALID_DEBT_AMOUNT`. `Math.max(0, Number(x) || 0)` made each zero. A **negative payment** keeps the validator's
  decided `NEGATIVE_PAYMENT` warning.
- **An asset class's volatility** that is negative or not a number: `SCENARIO_INVALID_CLASS_VOLATILITY`. The pairwise blend let a
  negative one cancel risk.

### 3.3 Plan warnings, shown as cards — `503db3c`, catalogue at `79a1d56` (SA32F-27, -35, -38)
- **SA32F-27:** `PROPOSED_RULE_USED` for each person born in 1959 whom the plan carries to 73, the spouse included, with that person's
  path.
- **SA32F-35:** `FILING_HOUSEHOLD_MISMATCH` (WARNING) for a joint return with no spouse included, or a single or head-of-household
  return with one. Married filing separately is refused by Q68; the tables do not define it.
- **SA32F-38:** `EXPENSE_AFTER_PLAN_END` (WARNING) for an expense at or after `endAge`, which no row charges.
- **The app shows these three and the 1959 warning as result cards.** Before, it rendered three engine issue codes: the strategy name
  and two swapped spending bounds. `503db3c`'s message said one; that was wrong and is corrected in the code at `890ff72`.

### 3.4 Housing costs — `dd25fe6` (SA32F-43)
- **Property tax, insurance and HOA** rise with the price level the row's spending uses: `inflationFactor`, the plan's inflation
  compounded to the row's start.
- **PMI** is a term of the loan and stays as entered.
- **The form's housing switch says so.**

### 3.5 The HSA at 65 — `e7fabeb` (SA32F-44), declared, no behaviour change
A pooled draw is judged at the age its year opened at, the convention Q137 settled for 59½. In a year that opens before the owner
turns 65, the whole non-qualified draw owes the 20%. The engine's comment declares it; MODEL_ASSUMPTIONS §18.3 goes to eb.

### 3.6 Monte Carlo guidance and the return process — `890ff72` (SA32F-41, -42, -52, -53)
- **In Monte Carlo** the shortfall cards keep the ages, labelled as the median among unsuccessful paths, and withhold the amount. The
  spending suggestion stays without a percentage. The rows are medians across all paths, so they cannot size either. Simple mode and
  historical replay keep both.
- **A Monte Carlo card** says:
  - the expected return is an arithmetic mean;
  - draws are held to [−95%, +200%] (by integration, a 10% mean at 80% volatility averages 13.31%; at 30% or less the mean moves
    under 0.01 point);
  - a partial year grows by (1 + r)^t, so its spread scales with t.
- **A simple-mode card** says it shows the average path, not the typical outcome.

### 3.7 Contributions and strategy text — `05f35fa`, `6dd41d9` (SA32F-45, -46, -49)
- **A joint account's percent of salary** is the household's salary (plus the spouse's only when included) in the engine, the
  validator's earned-income check and the form.
- **"Add future contribution change"** starts at the account's planned annual dollars, not a percentage copied into a dollar field.
- **`constantPercent` and `floorCeiling`** say the percentage sets spending, which outside income helps pay.

### 3.8 The marginal-rate helper and inert fields — `44a63eb` (SA32F-47, -50)
- **`effectiveMarginalRate()`:**
  - takes `base.niiOther` and a source `investmentOrdinary` (ordinary income that is net investment income);
  - refuses a base amount it does not read.
  - Nothing in the engine or app calls it.
- **The debt page** says the mortgage program, original amount, property value and original term change nothing.

### 3.9 Stale texts — `4a9a15e` (SA32F-54; SA32F-48's RESULT_CONTRACT part)
- **RESULT_CONTRACT.md:** the Monte Carlo row has 26 financial fields, named (it said 21); conflict C6 is recorded as reconciled.
- **`tools/result-contract.json`:** S-CSV has 26 columns.
- **The revolving-debt disclosure** says a card's own minimum is used when its record carries one.

## 4. Evidence

**Twelve new test files, 36 tests.** For every finding, a test in its file failed on the previous code for the finding's reason.
The witnesses that pin present behaviour pass on both: the four mortgage fields' inertness, the HSA convention, the clamp's
integration, and the card's own minimum. SA32F-44 is a declaration, so its test pins today's behaviour and requires the comment. The
Monte Carlo disclosure assertions and the strategy wording were written after their change; the old text was checked by hand not to
contain them. Hand expectations:
- SA32F-43: 5,400 → 5,562 → 5,728.86 at 3%; PMI a flat 600.
- SA32F-44: 25,000 drawn, 5,000 owed.
- SA32F-45: 16,000 and 10,000.
- SA32F-47: exactly 0.038.
- SA32F-54: 5,403.60 against 7,847.17.

**Gates, each at its commit in a separate worktree:**

| commit | tests | failing | closeout |
|---|---:|---:|---|
| `ad62460` | 3,056 | 0 | 12 / 0 |
| `e923123` | 3,062 | 0 | **12 / 1 refused**: COUPLED-ONLY-SA32F-51 (the test read `engine.HIST_RETURNS`) |
| `3b45dfa` | not gated alone; closeout 12 / 0 on the tree | | |
| `503db3c` | 3,066 | **1**: schema-catalogue (the new warnings' state) | 12 / 0 |
| `79a1d56` | 3,066 | 0 | 12 / 0 |
| `dd25fe6` | 3,069 | 0 | 12 / 0 |
| `e7fabeb` | 3,071 | 0 | 12 / 0 |
| `890ff72` | 3,074 | 0 | 12 / 0 |
| `05f35fa` | 3,077 | 0 | 12 / 0 |
| `6dd41d9` | 3,081 | 0 | 12 / 0 |
| `44a63eb` | 3,085 | 0 | 12 / 0 |
| `4a9a15e` | 3,089 | 0 | 12 / 0 |

Each gate also has 9 authorised todo.

## 5. What moved

**The control (4.7).** Only `503db3c` moves any plan: 18 plans each gain one WARNING in `issues`, and no figure moves.
- 11 file jointly with no spouse included: the five golden plans, the three historical plans, arm-flag-on, and the two collision plans.
- 6 file single or head of household with a spouse included: seed:3, 4, 13, 14, 17 and 18.
- seed:12 has an expense at its end age, 59.
- Declared. Golden regenerated, unchanged: it carries no issues.

Every other engine change was probed against the control and moved nothing: `ad62460`, `e923123`, `dd25fe6`, `05f35fa` and `4a9a15e`.
The rest change no path `runPlan()` runs: `e7fabeb` is a comment, `890ff72` and `6dd41d9` change only the app, and `44a63eb`'s
helper is called by nothing.

**The expanded corpus at `4a9a15e`:**
- **71 entries, invariant 7/7.** Output hash `aaa16de138f2e72889e7861880e9c25fed272583e08d65294dfd7c504e5f3e22`. The input hash is
  unchanged, `1d91d6733295298f22dcbce36b5c730fd014a7a51e1e7dfed1e9259c02fbc4ce`: no member was added or re-chosen.
- **Against R36's capture over the same inputs, 32 members moved, and every changed leaf is in `issues`.** No row, no lifetime total and
  no ending net worth moved.
  - 30 members gain `FILING_HOUSEHOLD_MISMATCH`, and seed:12 gains `EXPENSE_AFTER_PLAN_END`. A new first issue shifts the list, which
    is why some members show 10 or 21 changed leaves.
  - `expansion:s5aa-gap-working-household` moves only in the reworded `REVOLVING_DEBT_MINIMUM_MODELLED` message (the control
    capture carries no messages, so it did not see this).

## 6. Known limits

- **No corpus plan carries mortgage housing amounts or a joint percent-of-salary account,** so SA32F-43 and SA32F-45 are witnessed
  by their hand tests only.
- **The app's default plan files jointly with no spouse,** so a plan left at the default shows the filing card. Whether the default
  should change is the owner's.
- **Housing costs** follow the plan's inflation, not a housing index.
- **A joint account's deposits** follow the primary person's contribution window.
- **The HSA's 65** and the 10% at 59½ are judged at the year's opening age (Q137); proration is left to the engine rebuild.

## 7. Where I would look first

1. The new input-gate refusals against imported plans that the form did not write.
2. `FILING_HOUSEHOLD_MISMATCH` on a survivor's rows: it is recorded once, from the plan's inputs.
3. The Monte Carlo cards against a plan whose unsuccessful paths are few.
