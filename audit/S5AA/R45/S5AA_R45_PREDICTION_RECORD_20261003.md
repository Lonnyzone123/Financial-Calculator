# S5AA R45 — prediction record: each spouse's own retirement date, and the household date

*Written by Claude on 2026-10-03 (Arizona, UTC−7). Committed before the R45 engine, validator, contract and app edits (A-01), and
held to `audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md`. Base: `sprint/s5aa-r45` at `bde158f` (= `main`), whose
source is the S5AA GO source (`s5aa-r44-source`, `06e551e`) plus records only.*

## The round

The owner decided on 2026-10-03 that each spouse has their own retirement date
(`S5AA_R45_OWNER_DECISIONS_20261003.md`), and the same day, on ChatGPT's AA1 assumptions audit, adjusted the rules
(`audit/S5AA/AA1/S5AA_AA1_CLAUDE_VERIFICATION_20261003.md`, "The owner's decisions"). The rules built here:

1. **`profile.spouseRetireAge`** is the spouse's retirement age on the spouse's own clock. Absent, the spouse retires at
   `profile.retireAge` on their own clock, as today.
2. **The household date is the first stop,** on the primary's clock: the primary's retirement; an earning spouse's retirement;
   the primary's death before retiring with the spouse alive (whatever the spouse earns: this replaces R43's salary
   exception); an earning spouse's death before their own retirement with the primary alive. A spouse with no salary stops
   nothing. Whoever still works has their net pay fund spending first (R35's pay-first, made symmetric).
3. **`retirement.spendingStartAge`** (new, optional, primary's clock): when entered, it replaces the first stop as the
   household date (AA1-38/39).
4. **The household date drives** retired spending, the strategy's anchor, debt-and-housing costs, the reserve and pay-first.
5. **`advanced.healthCoverageEndAge`** (new, optional, primary's clock): pre-Medicare health costs start there; absent, at the
   household date (AA1-40). Medicare costs and the R43 idle-spouse Medicare rule keep the household date.
6. **`advanced.conversionStartAge`** (new, optional, primary's clock): Roth conversions start there; absent, at
   `profile.retireAge`, exactly as today. Conversions leave the household-date list the owner first decided (AA1-40).
7. **Each person's own date** drives their work and wages, Social Security's service months, the 401(k) still-working RMD
   exception, the Rule of 55 and vesting at separation.
8. **Unchanged, on `profile.retireAge`:** the pension, long-term-care onset, the glide path, the bond tent, dividends paid out
   from retirement, and the disclosures that describe them.
9. **The validator:** "retirement age before the current age" warns only beside a salary, for either spouse; the
   earned-income check counts employment and self-employment streams; the spouse's work window reads `spouseRetireAge`.
10. **The contract:** the four new or newly read fields are optional finite numbers, 0 to 120.
11. **Also in the round (owner, 2026-10-03):** the stale engine comments at `engine.js:3840` (LTC does not move at a death) and
    `:1479-1484`; tests for SA42F-12's warning text, SA42F-08's Roth width and the validator-only divergences; the app's inputs.

## The checklist

**C6, the readers.** `src/engine.js` was searched for every reader of `profile.retireAge` (24 lines), of `costRetireAge` and
`costRetiredDuration` (R43's household date), and of `retiredDuration`. Each reader and what R45 does to it:

| reader (engine.js at `bde158f`) | today | R45 | scan condition |
|---|---|---|---|
| `householdWorkDurations()` :78-79 | spouse works to `retireAge` on own clock | to `spouseRetireAge` on own clock | own |
| Social Security service-month boundary :3219 | spouse retires at `retireAge` on own clock | `spouseRetireAge` | own |
| RMD still-working :3076, :3081 | both owners read `retireAge` | each owner's own date | own |
| Rule of 55 separation :2340 | both owners read `retireAge` | each owner's own date | own |
| vesting at separation :4010 | both owners read `retireAge` | each owner's own date | own |
| `costRetireAge` :3843 | R43's rule | `householdRetireAge(p)`, new and exported | household |
| `costRetiredDuration` :3964, read by spending :4200, strategy anchor :4158, debts :4200, one-time-expense share :4533, prior spend :4611, Medicare :4167, idle-spouse Medicare :4171 | from `costRetireAge` | from the household date | household |
| pre-Medicare health :4164 | `costRetiredDuration` | from `healthCoverageEndAge`, default the household date | health |
| reserve, `accountReturnForPeriod()` :3695 and `rowReserveSpend` :3899 | `age >= retireAge` | `age >= household date` | reserve |
| pay-first :4211-4213 | `retiredDuration` (primary), `retiredFrom = max(age, retireAge)` | the household date | household |
| conversions :4113 | `retiredDuration` (primary) | from `conversionStartAge`, default `retireAge` | conversion |
| pension :4159, dividends :4026, :4184, LTC :3863, glide :2272, bond tent :3695, disclosures :5142-5159 | `retireAge` | unchanged | — |
| IRMAA first-years disclosure :5017 | `retireAge < rowEnds` | the household date (the Medicare charge it describes follows it) | household |
| input gate `nonNumberPlanValuePath()` :1283 and the contract | — | the four fields through `plan-value-contract.json` | inputs |

The validator's readers (`scenario-validator.js` :230 retirement warning, :1023-1053 work window and earned income) and the app's
form (inputs, read and write, the static-id list) are changed by rule 9 and the app step; they move no engine figure.

**C1.** The scans call the engine where the engine decides: the own-window condition uses `householdWorkDurations()` on a copy
with the date swapped. The household date is mirrored from the engine source (today's `costRetireAge`) and from the owner's
rules (the new date), because the new helper does not exist before the edit. After the build, the record checks the scan's
new-date function against the exported `householdRetireAge()` on every corpus plan.

**C2.** Not a limit repair; no condition rests on a cap.

**C3.** The household condition requires the date difference inside the projection (`min(old, new) < endAge`). A salary counts
only when entered (> 0).

**C4.** No Monte Carlo plan is flagged in the corpus. In the test suite every exposed plan is simple or historical except where
the exposure file says otherwise; any Monte Carlo test that moves is measured on both levels.

**C5.** The corpus mover's direction is a hand trace (below), because no input on the pre-repair engine starts spending while
the primary still works. Each witness's direction is in its own derivation in the test file.

**C7.** Every witness's control is in the test file beside it, and passes on `bde158f`; every repair case fails there with the
pre-repair figure (`witness_runs/r45_tests_at_bde158f.txt`).

**C8, how each comparison reads the moving fields.**
- **Control 4.7** replays the 36-plan control composition. No control plan is flagged, so 4.7 must show no movement.
- **The expanded capture** compares every row field entry by entry (spending, income, withdrawals, taxes, balances,
  `limitWarnings` text). The one mover is expected to move in its rows from the household date on.
- **Golden fixtures and tests:** a test pinning a figure of an exposed plan moves. The exposure file names every test plan run
  through `src/engine.js`; each test that fails is found in the gate, re-measured, and either moves by the rule (adapted by
  intent, recorded) or is a miss.

## Predictions

### 1. The corpus

`prediction/r45_corpus_scan.js` on `bde158f` (`prediction/r45_corpus_scan_at_bde158f.txt`): the control composition (36 plans)
flags nothing; the expanded composition (71) flags one plan, under the household condition only.

**`expansion:s5aa-gap-working-household` moves** (simple, MFJ; self 52 retiring at 67 on $150,000; spouse 63 earning $26,000;
$120,000 fixed-nominal spending; conversions $30,000 a year; two debts with payments included; 5% return, 0% inflation).
- The spouse retires at their own 67, the self's 56: the household date moves **67 → 56**.
- **Direction, by hand trace of the row closing at 57 (56→57):** today spending is 0 there. After R45 it is $120,000, plus the
  two debts' scheduled payments, which already flow in retired months. The self still earns $150,000; pay-first gives the
  self's net pay (wages less contributions less the wage tax, about $150,000 − $42,000 − $23,000 ≈ $85,000) to spending
  first. So withdrawals rise by roughly $35,000 plus the debt payments and the tax on the draw, each year from 57 to 67.
- **Size:** about eleven such years at a 5% return: the final total falls by several hundred thousand dollars to over a
  million, and lifetime taxes rise. The exact figures are measured after the build.
- **Conversions do not move:** they keep the self's 67 (no `conversionStartAge`).

**Every other corpus plan is unchanged.** The nine plans carrying `spouseRetireAge` carry it equal to `retireAge`.

### 2. The tests

`prediction/r45_test_exposure_hook.js`, loaded into the full test suite on `bde158f`, names every exposed test plan
(`prediction/r45_test_exposure_at_bde158f.txt`; 400 calls). The household date moves in plans of these test files:
`audit-s5aa-post-death-household`, `-r39-survivor-inherits-no-employer-flag`, `-r42-ira-window-and-roth-proxy`,
`-r43-contributions`, `-r43-life-events`, `-r6-roth-phaseout-filing`, `-r7-executed-succession`, `-spousal-rollover`,
`-wages-end-at-death`, `build-routes`, `corpus-composition`, `corpus-configured-paths`, `household-ledger`,
`near-miss-survivor-sweep`, `networth-reconciliation`, `reconciliation-invariant`. The spouse's own window changes in plans of
`audit-s5aa-r24-transfer-age-at-59-half` (a non-earning spouse already retired: no work or cost moves), `-r44-contribution-routes`
(the spouse's date 75 against 70, both past a one-row horizon, and the household date stays 70) and `corpus-configured-paths`
(a non-earning spouse).

- **Expected to fail and be adapted by intent:** the R43 life-events "survivor with a salary" control (its premise is the salary
  exception R45 removes) and SA42F-29's year-of-death case (household 60.5 → 60.25); any test pinning the working-household
  plan's rows. Each adaptation is recorded with its before and after figures.
- **Expected to pass unchanged:** the conservation invariants (`household-ledger`, `reconciliation-invariant`,
  `networth-reconciliation`): their reconcilers count pay-first dollars (R40), and an earlier household date only moves more
  wages through that path.
- Every other exposed test is checked in the gate; a failure not listed here is reported as a miss.

### 3. The witnesses

`tests/audit-s5aa-r45-spouse-retirement-dates.test.js`, 23 cases (SHA-256 `a952b993…0358d7` at the pre-repair run). On `bde158f`
the 14 repair cases fail with the pre-repair figure and the 9 controls pass:

| case | expected (hand-derived) | at `bde158f` |
|---|---|---|
| older earning spouse stops at own 63 (self 61) | spending $40,000 from 61; self's pay covers it | 0 |
| no spouse date: spouse to own 65 (self 63) | spending from 63 | 0 |
| younger spouse retiring at own 58 | no wages after the self's 63 | $50,000 |
| self dies at 55, spouse earning | spending from 55, survivor's pay first | 0 |
| earning spouse dies at 62 | spending from 62 | 0 |
| conversions start at 62 | Roth $20,000 at 63 | 0 |
| coverage to 64 | no health cost before 64 | $12,000 |
| spending begins at 63 / at 61 | 0 at 63 / $40,000 at 62 | $40,000 / 0 |
| spouse left at own 50, Rule of 55 | draw $22,222.22 | $20,000 |
| spouse working to own 76, RMD at 73 | $0 | $18,867.92 |
| past retirement age without a salary | no warning | warns |
| the four fields as text or negative | refused by both layers | accepted |
| self-employment income counts as earned | no warning | warns |
| controls: no-salary spouse; no spouse date for a younger spouse; no-salary death; no conversion age; no coverage age; no override; left at own 55; retired at own 70 | as before | pass |

After the repair every case passes. A case whose derivation proves wrong in the build is corrected and recorded as a
prediction miss, not quietly re-expected.

### 4. The gate and the browser

- **Gate:** passes after the adaptations; closeout 12/0/0.
- **Browser:** the round's final candidate repeats task 6.5 (A-04), including the four new inputs.
