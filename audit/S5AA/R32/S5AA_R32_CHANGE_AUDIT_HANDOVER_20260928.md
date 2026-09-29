# S5AA R32 — change audit handover: R30A-01 to R30A-03, R31-01, and the catch-up age

*Written by Claude, 2026-09-28 (local, UTC−7), for the owner to send to ChatGPT. Every figure was measured on Windows 11 /
Node 24.17.0 at the commits named.*

## 1. What to audit

- **The change:** from `main` at `0be9911` (your R30A and R31 reports and eb's R31 placement merged) to
  **`s5aa-r32-source`** at **`3017351`**.
- **Three commits**, each test-first: `0413792`, `8ef84d3`, `3017351`.
- **Please number findings R32-NN** and publish them in the usual report-only pull request, on a branch like
  `audit/chatgpt/r32-3017351`, under `audit/S5AA/R32/`.

## 2. Your findings and the owner's decisions

| finding | what you found | decision (the owner, 2026-09-28) | commit |
|---|---|---|---|
| **R30A-01** (P1) | An IRA rolled its after-tax money into a 401(k): $957 of tax too much. | "Move taxable part only" | `8ef84d3` |
| **R30A-02** (P2) | A Roth IRA into a Roth 401(k) was accepted. | "Refuse it" | `0413792` |
| **R30A-03** (P2) | A rollover between two living owners was accepted. | "Refuse it" | `0413792` |
| **R31-01** (P1) | The funding pool dated only the sending IRA: $16.23 of tax too much at +20%, $12.59 too little at −20%. | "Repair in R32" | `8ef84d3` |
| Catch-up age (conditional, not a finding) | Catch-ups read the row's opening age; the statute reads the age reached by the close of the taxable year. | "Use the year-end age" | `3017351` |

## 3. The rules, as built

**Sources, each read in full.**

| rule | source |
|---|---|
| Rollover into an employer plan | IRC 408(d)(3)(A)(ii): what goes into an employer plan "may not exceed the portion of the amount received which is includible in gross income". 408(d)(3)(H): the part rolled over is treated as income first, across all the owner's IRAs. |
| Same-owner rollover | 408(d)(3)(A): an IRA rollover is "for the benefit of such individual". 223(f)(5)(A): an HSA rollover is "for the benefit of such beneficiary". |
| Roth IRA into a plan | Publication 590-A: "A rollover from a Roth IRA to an employer retirement plan isn't allowed." |
| Catch-up ages | 219(b)(5)(B), 414(v)(5)(A), 414(v)(2)(B)(i) and 223(b)(3)(A) all read the age reached by the close of the taxable year. |

**`0413792` (R30A-02, R30A-03):**
- `transferIntoWorkplaceRefused()` also refuses a Roth IRA source.
- `transferBetweenOwnersRefused()` refuses a transfer between two of the five named sheltered types when both are the same
  tax class and their owners differ. The five are traditional IRA, traditional 401(k), Roth IRA, Roth 401(k) and HSA.
- **Engine:** records `TRANSFER_BETWEEN_OWNERS_REFUSED` and moves nothing. `transferAllowed()` refuses too, so the late
  preview agrees.
- **Validator:** reports `TRANSFER_BETWEEN_OWNERS`, and `TRANSFER_INTO_WORKPLACE_PLAN` for a Roth IRA into a 401(k).
- **Unchanged:**
  - transfers between different tax classes, which R29 rules treat as a distribution, a conversion or a contribution;
  - taxable to taxable, which is a gift;
  - the three custom wrappers;
  - the handling of an account at a death.

**`8ef84d3` (R31-01, R30A-01):**
- `runTransfer()` builds `datedPools`: each of the owner's traditional IRAs, carried to the transfer date at its own rate.
  It is used for the measure only; balances are not moved.
- The funding's recorded pool and provisional basis read `datedPools`.
- `transferIraIntoWorkplace()` covers a traditional IRA into a traditional 401(k).
  - The move is held to `datedPools` less basis.
  - Anything above that stays in the IRA with its basis, and a limit warning names the rule.
  - The settlement needs nothing more: the rolled dollars were taxable value.

**`3017351` (catch-up age):**
- `ownerCompensation()` reports the row's length.
- `auditContributions()` tests every catch-up at the opening age plus that length: IRA, 401(k), the 60–63 amount, HSA, and
  a one-time contribution's room.
- A caller that gives no length is read as a whole year.
- Each row is treated as a tax year, because the model has no calendar. No other age rule changes.

## 4. Evidence

**New tests:**

| file | tests |
|---|---|
| `tests/audit-s5aa-r32-rollovers-stay-with-the-owner.test.js` | 6 (R30A-02 on both owners and three dates; all 54 cross-owner pairs; your witnesses; controls) |
| `tests/audit-s5aa-r32-ira-pool-at-the-transfer-date.test.js` | 8 (your R31-01 witnesses at 61.25/61.75 and −20%; a spouse's IRA kept out; your R30A-01 witness; mixed; controls; a dated two-IRA rollover) |
| `tests/audit-s5aa-r32-catch-up-age-at-year-end.test.js` | 4 (the rows turning 50, 55, 60 and 64; controls) |

**Re-fixtured by intent:**
- **`tests/audit-s5aa-415c-catchup-room.test.js`** named each row by its opening age. The 60–63 rows now open at 59–62.
- **R29's sweep:** its rule now refuses a Roth IRA into a 401(k), with a dated note.

**Your repros at `3017351`:**

| repro | result |
|---|---|
| R30A | **0 mismatches and 0 conditional differences**, where it had 64 and 18 |
| R31 | 162 of 162 plans pass, where 22 failed |
| R30 and R29 | 0 each |

**Gate at `3017351`:** GATE PASSED, 2,972 tests, 2,963 passing, 0 failing, 9 authorised todo. Closeout accepted 12,
refused 0.

**The control (4.7):** the catch-up change moves three members, declared as "a catch-up limit reads the age the owner
reaches by the row's close". These are the three your report named as exposed:
- **seed:10:** the row turning 50 gains the $8,000 401(k) catch-up. Ending net worth rises $124,273.65 over the historical
  run.
- **seed:11:** the row turning 50 gains $9,100. Lifetime tax rises $20,401.74 and ending net worth $74,962.48.
- **seed:20:** the row turning 60 shelters $3,250 more of an over-limit deferral (that year's tax −$970.01), and the row
  turning 64 loses it (+$1,090.94). Lifetime tax falls $100.27 and ending net worth rises $1,329.21.

**The expanded corpus at `3017351`:**
- 70 plans. Output hash `e659f746c65e0e6e91cb1baadb6a64e721f9d890407100c2c826574902c3164d`; the input hash is unchanged.
- The invariant passes all 7 checks.
- Against r17: R29's three members and R32's three.

| member | fields |
|---|---|
| seed:4 | 28 |
| seed:9 | 4 |
| seed:13 | 1 |
| seed:10 | 228 |
| seed:11 | 272 |
| seed:20 | 421 |

**Self-audit sweeps:**

| sweep | size | at `3017351` | at `0be9911` |
|---|---|---|---|
| `audit/S5AA/R32/S5AA_R32_SELF_AUDIT_ROLLOVER_SWEEP.js` | 81 plans | **0** | **54** |

The rollover sweep's grid is three source returns × three second-IRA returns × three openings × three dates.
R29's, R30's and R31's sweeps: 0 each.

## 5. Contracts

- New engine exports, each in the Worker's function list: `transferBetweenOwnersRefused`, `transferIraIntoWorkplace`. Its
  type list is inside the function, because the Worker copies listed functions, not globals.
- New issue code `TRANSFER_BETWEEN_OWNERS_REFUSED` (engine, WARNING).
- New validator code `TRANSFER_BETWEEN_OWNERS` (ERROR).
- `ownerCompensation()` returns `rowDuration`.

## 6. Known limits

- **A rollover into a 401(k) measures the IRA's basis as it stands on the date.** It does not add that year's
  nondeductible contributions, which are only known when the year is settled. A rollover in a year with nondeductible
  contributions could move some of them.
- **A catch-up reads each row as a tax year.** A first or last row shorter than a year closes at its own end.
- **The custom wrappers' cross-owner moves are unchanged.** They are the model's own accounts, not named statutory ones.
- **R31's and R30's limits stand.**

## 7. Where I would look first

1. A rollover and a funding in the same row as an ordinary draw or a conversion.
2. The catch-up in a partial first row, e.g. a plan opening at 49.5.
3. Any transfer route not covered by your R30A matrix.
