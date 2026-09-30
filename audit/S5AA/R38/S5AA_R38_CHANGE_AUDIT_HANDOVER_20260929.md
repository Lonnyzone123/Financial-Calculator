# S5AA R38 — change audit handover: vesting at separation, vesting at 65, and the default filing status

*Written by Claude, 2026-09-29 (local, UTC−7), for the owner to send to ChatGPT. Every figure was measured on Windows 11 / Node 24.17.0 at
the commits named.*

## 1. What to audit

- **The change:** from `main` at `80dd944` (R33–R37 merged, with ChatGPT's R33–R37 change audit, #25) to **`s5aa-r38-source`** at
  **`678c556`**. The diff to audit is `80dd944..678c556`.
- **Three commits:** R35-01's repair, full vesting at normal retirement age, and the default filing status.
- **Please number findings R38-NN**, in the usual report-only pull request, on a branch like `audit/chatgpt/r38-678c556`.

## 2. The decisions this round applies

- **"start R38, include item 3 with age 65"** (the owner, 2026-09-29): repair R35-01; build IRC 411(a)'s full vesting at normal
  retirement age, taking the plan's normal retirement age as 65; change the default filing status.
- **"go with your recommendations"** (the owner, 2026-09-29, on R37's five open items). One of them is built here: a new plan files
  single. The other four were kept as built in R37:
  - the HSA's age-65 exception follows Q137's opening-age convention;
  - a joint account's percent of salary reads household salary;
  - the 1959 RMD card stays visible;
  - Monte Carlo guidance keeps withholding the shortfall amount and the cut. Figures from the failing paths are a wanted feature for the
    CPU engine rebuild.

## 3. What changed

### 3.1 R35-01: the row of separation — `be30de3`

**The defect** (ChatGPT's R35-01, P1, reproduced on `80dd944` before any change): R35 forfeited the unvested share of an account's
employer money at the owner's separation *before* the row credited its own deferrals and match. A retirement inside a row (45.5)
forfeited only earlier rows' employer money. The row's own match was deposited afterwards and kept whole, because no later row forfeits
once the separation is past.

**The repair:** the forfeiture now runs after the row's contributions, match and any redirected excess.
- A deferral deposited first dilutes the tracked employer share by exactly the dollars it adds (share × balance is unchanged), so a
  row that earns nothing forfeits what it did before. That covers a separation on a row boundary.
- The negative employer entry is unchanged, so the portfolio identity still holds.

### 3.2 Full vesting at normal retirement age — `cc3217f`

**The law, read at the source (26 USC 411):**
- 411(a) requires a qualified plan to make "an employee's right to his normal retirement benefit ... nonforfeitable upon the
  attainment of normal retirement age".
- 411(a)(8) sets that age at the earlier of the plan's own normal retirement age and the later of 65 and the fifth anniversary of the
  participant's entry.

**What was built:**
- The plan's own age is not an input. It is taken as 65, the owner's choice, which the statute's formula then also gives.
- `employerVestedShare(a, elapsed, ownerAge)` returns 1 at 65 or later.
  - The forfeiture passes the age at separation. That is the retirement age, since each owner retires at it on their own clock.
  - A deposit passes the owner's age as the row opens, so money earned before 65 is still tracked, and is kept whole at a separation at
    65 or later.
- The form's schedule label says so.

### 3.3 A new plan files single — `678c556`

**Before:** the app's default plan filed jointly with no spouse. Every untouched plan taxed one person on the joint brackets and showed
R37's `FILING_HOUSEHOLD_MISMATCH` card.

**Now:**
- A new plan files single.
- A saved plan keeps its own filing status: `normalizedPlan()` fills only missing keys.
- **The tests' copy of the default plan** (`tests/lib/golden-scenario-defs.js`, `extractDefaultPlan`) keeps the joint return. Every
  corpus plan, golden fixture, stored control, capture and test was written on it, including the married pairs, which never set a
  filing status themselves. This follows the precedent there: it already keeps the tests' starting age (29.5) apart from the app's (30)
  since 2026-09-28.
- **One test** read the app's default directly and was re-fixtured by intent to state `mfj`: `tests/audit-rmd-cash.test.js`.

## 4. Evidence

**Three new test files, 10 tests.** Each expectation is worked by hand in the file.

| file | tests | cases | failed before the change |
|---|---:|---|---|
| `audit-s5aa-r38-vesting-separation-row` | 5 | ChatGPT's 45.5 and 46.5, with the 46 control; profit share; a spouse separating inside a row on the spouse's own clock (44.25 at the start, retiring at 45.5); a pre-tax match landing in a synthesized account; a Roth match (fully vested) as a control | 6,000; 14,400; 5,500; 11,400; 3,000 pre-tax |
| `audit-s5aa-r38-vesting-normal-retirement-age` | 2 | 63, 20% vested: retiring at 65.5 keeps 30,000 (service alone 24,000); at 65, 24,000 (19,200); a cliff with no service, 30,000 (15,000); control: 64.5 forfeits to 12,600 | 24,000 on the first |
| `audit-s5aa-r38-default-filing-single` | 3 | the app's default files single and carries no filing warning; its first year at 30 with $60,000 is taxed 10,707.50 on the single brackets; the tests' base plan and the corpus's married pair still file jointly | `'mfj'`; 8,125 |

**Hand arithmetic for the filing test (2026 figures):**
- Federal: 60,000 − 16,100 = 43,900; 1,240 + 12% of 31,500 = 5,020.
- Arizona: 2.5% of 43,900 = 1,097.50.
- Payroll: 7.65% of 60,000 = 4,590.
- Total 10,707.50. Joint: 2,840 + 695 + 4,590 = 8,125.

Both figures were also confirmed on the engine.

**Gates, each at its commit in a separate worktree:**

| commit | tests | failing | closeout |
|---|---:|---:|---|
| `be30de3` | 3,094 | 0 | 12 / 0 |
| `cc3217f` | 3,096 | 0 | 12 / 0 |
| `678c556` | 3,099 | 0 | 12 / 0 |

Each gate also has 9 authorised todo.

## 5. What moved

**The control (4.7).** Nothing moved: `declare_r29` found 0 unpredicted and 0 undeclared differences after each of the three commits.
- The two vesting changes reach no control plan.
- The filing change reaches none, because the tests' base plan keeps the joint return (§3.3).
- Golden fixtures unchanged.

**The expanded corpus at `678c556`:**
- **71 entries, qualified boundary, invariant 7/7** (round-trip PASS, with 11 members skipped because they are built only inside the capture tool).
- **Nothing moved.** The output hash is unchanged from R37's capture at `4a9a15e`: `aaa16de138f2e72889e7861880e9c25fed272583e08d65294dfd7c504e5f3e22`. The input hash is unchanged too: `1d91d6733295298f22dcbce36b5c730fd014a7a51e1e7dfed1e9259c02fbc4ce`.
- **No corpus plan moved, so both vesting changes are witnessed by their hand tests only.**

## 6. Known limits

- **The tests' corpus still files jointly with no spouse** in the plans built on the default: the five golden plans, the historical and
  targeted plans, and 13 expansion members. They keep R37's filing card. This is deliberate: their inputs stay fixed. A new corpus built
  on the single return would be its own change.
- **The spouse's separation** is the same retirement age on the spouse's own clock; there is no separate spouse retirement age.
- **A death before separation** forfeits nothing and vests nothing: the model has no separation at death. Plans commonly vest fully at
  death, but the law does not require it.
- **Service** before the plan is still read from the entered vested percentage when `yearsOfService` is blank (R35's convention).
- **Found, not changed:** with `vesting` 100 and `yearsOfService` 0, an elected Roth match is routed and taxed as Roth (the Roth
  election checks `vesting === 100`), but the service rule then forfeits most of it at separation. The inputs disagree with each other.
  The statute (26 USC 402A) does not itself condition a Roth match on full vesting, so the rule rests on IRS guidance not yet checked.
  Reported to the owner, not built.
- **Also observed, not changed:** the income tax on an elected Roth match is drawn from the portfolio even in a year whose wages exceed
  its needs (Q96's treatment).

## 7. Where I would look first

1. A separation inside the row where an account also receives a redirected excess or a one-time transfer contribution.
2. The age-65 rule for a spouse-owned account when `spouseOn` is false.
3. The app's new-plan flow: a user who turns on a spouse now gets the filing card until they choose joint filing.
