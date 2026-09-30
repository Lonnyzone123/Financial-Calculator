# S5AA R40 — Claude's self-audit

*Claude, 2026-09-30 (local, UTC−7), at `4a2250a` (`s5aa-r40-source`). What I checked, and every error of my own this round, before the
handover goes out.*

## Errors of my own, and what caught them

| | what | caught by | disposition |
|---|---|---|---|
| SA40-01 | **SALT was scaled.** The first draft of repair 3 scaled the SALT parameters, which the engine never reads (it has no itemization path) | `tests/salt-cap-parameters.test.js`, in the gate at `4d84aa7` | removed; the commit was amended to `607101a` before anything was pushed |
| SA40-02 | **A prediction miss.** `seed:16` was predicted to move under the LTC repair and does not. Its surplus policy is `spend`, so the care cost displaces spent surplus | the control check after the edit | explained (tapped `ltc` = 110,379.85 in its care row, the requested total unchanged); recorded, not re-predicted |
| SA40-03 | **A second-order effect missed.** The prediction record says a partial row's AGI "does not move". It moves by $68.48: the gain realized by the sale that pays the extra tax, which also explains the $11.98 between predicted and measured tax | measurement | recorded in `607101a` and the handover; the record stays as committed |
| SA40-04 | **A rounding slip.** The record gives the spouse witness's second year as 3,773.59; the correct figure is 3,773.58 (96,226.42 / 25.5 = 3,773.5849) | writing the test | recorded in `d51d30d` |
| SA40-05 | **Cited before read.** I cited Treas. Reg. 1.401(a)(9)-9(c) and Publication 590-B (Table III) in `d51d30d` and its test before reading either at the source | this self-audit | both read afterwards, and both hold: paragraph (c) is the Uniform Lifetime Table; Pub. 590-B: "If you are figuring your required minimum distribution for 2026, use your age as of your birthday in 2026" |
| SA40-06 | **A measured figure in a re-fixture.** The R9 dividend re-fixture uses 1.5% of the tax sale as its realized loss. That figure was measured, not derived; the test says so | — | disclosed in the test |
| SA40-07 | **Two amended commits.** Two commits were amended (`95f66c6` → `d1572b1`, `4d84aa7` → `607101a`) so that every commit on the branch passes its gate | — | both were local and unpushed; neither SHA appears in any record |
| SA40-08 | **One gate started the wrong way.** One gate was started with a shell `&` instead of the tool's background option | — | its log was read to the end (`8f20d90`: 3,132 / 0 fail) before it was relied on |

## Choices that are mine, not the owner's

- **The LTC insurance benefit is not inflated** while the cost is (a policy's benefit is a contract figure; no inflation rider is
  modelled). I told the owner; they have not ruled on it.
- **Repair 3 leaves the retirement block unscaled.** The IRA deduction and Roth phase-out ranges read a partial row's MAGI against
  whole-year ranges. It is disclosed in the unrepaired list.
- **The Part D base beneficiary premium is used as the proxy for a plan's premium.** It is disclosed.

## What I checked

- **The gate, in a clean worktree, read from each log.** Every run below had 0 failing, 0 skipped and 9 authorized todo, with
  closeout 12 accepted / 0 refused:

  | commit | tests | passed | note |
  |---|---|---|---|
  | `12fd286` | 3,125 | 3,116 | `47a7333`'s identical tree before it was carried onto the branch |
  | `8fb0aca` | 3,126 | 3,117 | |
  | `d4fd3a9` | 3,128 | 3,119 | |
  | `6dccadb` | 3,129 | 3,120 | |
  | `8f20d90` | 3,132 | 3,123 | |
  | `d1572b1` | 3,135 | 3,126 | its first form, `95f66c6`, failed 7 (SA40-07) |
  | `607101a` | 3,138 | 3,129 | its first form, `4d84aa7`, failed 3 (SA40-01) |
  | `d51d30d` | 3,140 | 3,131 | |
  | `4a2250a` | 3,140 | 3,131 | the source |

  **Not gated on their own:**
  - `03a0ca7` (documents only). The five tests that read `RESULT_CONTRACT.md` ran at it: 39 / 0.
  - `e54125a` (records only).

  Every later gate includes both.
- **Control test 4.7** at `4a2250a`: 15,717 differences, 0 unpredicted, 0 declared-but-not-found.
  - The declarations grew from 51 to 54, one each for repairs 1 to 3 (repair 4 moves nothing).
  - The first 51 are unchanged from `a2ee714`, and the first 35 unchanged from the public copy.
  - The recorded values of the scenarios that moved are updated in place.
- **The corpus.** r19 captured twice at `d51d30d`, byte-identical, invariants 7/7. Eleven members move against r18, exactly those
  predicted. Nine carry `outsideSupportedDomain`. The settlement codes (`TAX_SETTLEMENT_MISMATCH`, `QUOTE_SETTLEMENT_UNVERIFIED`) are
  absent from every entry.
- **The conservation grid**, updated for R35's pay-funds-spending, at the final engine, 3 seeds × 1,000 plans: 0 leak flags. There are
  2 to 4 wage-tax-clamp rows per seed, the mechanism R35 disclosed. It reads the engine's own `retiredPaySpent`, so it shows money is
  conserved, not that that amount is right.
- **The R33 tax sweep:** 13,815 returns, 0 mismatches. **The R34 Social Security reference:** 25 cases, 0 mismatches.
- **Every ChatGPT repro in the repository, run at `4a2250a`.** Each stop is explained in the handover.
- **A desktop-browser smoke check.** The built app, served locally, completed guided setup and computed a projection with its cards
  rendered and no console errors.
- **Primary sources, read this round:**
  - CMS's July 28, 2025 memo ($38.99);
  - 42 CFR 423.286(c);
  - Treas. Reg. 1.401(a)(9)-9(c);
  - Publication 590-B's Table III instruction.

## The audit of PR #35, before merge (the owner: "you do a audit on #35 before we merge")

Three independent reviews of `f4183b9` tried to break the four repairs, the validator repair and the re-fixtured tests. Every finding
below was reproduced; each reviewer also listed what it checked and found correct.

| | severity | finding | disposition |
|---|---|---|---|
| AUD35-01 | P1 | **Repair 3 annualized one-time amounts.** A $100,000 one-time expense in a tenth-of-a-year row was taxed as if $1,000,000 recurred: $56,958 against $20,221.85 | **reverted**, the owner's decision "Revert and disclose" (`b97fe0a`). The whole-year treatment is disclosed; a rule telling recurring income from one-time items goes to the engine rebuild |
| AUD35-02 | P2 | **Repair 3 left the IRA deduction phase-out unscaled,** and its comment's reason (R39's stretch) was false | moot after the revert |
| AUD35-03 | P3 | **Repair 3's death-row claim was false.** A death can fall in a partial first row | moot after the revert |
| AUD35-04 | P1 | **Repair 4 read the spouse's calendar age against `rmdStartAge()`'s whole-age birth year.** At the 1959/1960 line the first RMD fell in a year neither reading gives | **corrected** (`3fbe9dc`): the age reached is the engine's birth year counted forward |
| AUD35-05 | P2 | **Repair 4 moved the self's own Table II figure** (4,784.69 to 4,950.50) | corrected with AUD35-04; a test now pins 4,784.69 |
| AUD35-06 | P3 | **Repair 4's test said "born 1953";** `rmdObligations()` depended on `endAge` and on a 1e-9 sliver | the test was rewritten; the row span is gone |
| AUD35-07 | P2 | **A numeric-string debt reset age passed both refusals** (0% after the reset, or a RangeError). It predates R40 | **fixed** (`7cd1a1a`) |
| AUD35-08 | P3 | **The validator and the engine disagreed next to the new rule** (a present non-number reset rate, a NaN reset age) | fixed with AUD35-07 |
| AUD35-09 | P3 | **The Part D premium and the care cost's growth were not stated in the app** | **fixed** (`9fd61c2`), wording only |
| AUD35-10 | P3 | **Healthcare inflation was unvalidated.** At −150 or 1e40 it gave a calculation error; a non-number silently gave 0% | **fixed** (`c300508`): the validator types and ranges it, and the engine refuses a non-number, as R25's parity test requires |
| AUD35-11 | P3 | **The R9 dividend re-fixture read the engine's own withdrawals** | moot after the revert, which restored the original test |
| AUD35-12 | P3 | **Record slips:** `8f20d90`'s message says "the first two failed before" (all three did); the R6 re-fixture's message calls 6,371.36 "the auditor's figure" | the first is recorded here (the commit is pushed); the second is corrected in the r20 commit |
| AUD35-13 | P3 | **A direct call of the exported `simulatePlanRows()` leaves the last row's rules in place.** It predates R40 (R36) and no production caller makes one | **not fixed**; disclosed here |

### Further errors of my own, found by the audit or in fixing it

| | what |
|---|---|
| SA40-09 | **Repair 3's premise.** The rule "a year earning at the row's rate" was wrong for anything that is not a rate (AUD35-01). My prediction checked only the golden plans' recurring wages |
| SA40-10 | **Repair 4 mixed two birth-year readings** (AUD35-04). My own witness, self 72 and spouse 72.5, was not a defect under the engine's documented reading |
| SA40-11 | **Fix C's code was written before its test.** The new case was then shown to fail against the committed engine without it |
| SA40-12 | **Fix D's first form typed a field the engine did not refuse.** The R25 parity test caught it in the gate. The commit was amended (`c300508`) and fix E replayed onto it (`9fd61c2`); the first forms, `434f19c` and `2881ceb`, were never pushed |
| SA40-13 | **Two more gates were started with a shell `&`** (fixes C and D); both logs were read to the end |
| SA40-14 | **The Part D sentence first used `money()`,** which rounds $38.99 to $39. The rendered test caught it |

## At the final source, `978a6e4` (`s5aa-r40.1-source`)

The checks above were run at `4a2250a`, the first source. After the audit's fixes, at `978a6e4`:

- **The gate, read from each log.** Every run below had 0 failing, 0 skipped and 9 authorized todo, with closeout 12 / 0:

  | commit | tests |
  |---|---|
  | `b97fe0a` | 3,139 |
  | `3fbe9dc` | 3,141 |
  | `7cd1a1a` | 3,142 |
  | `c300508` | 3,145 (its first form, `434f19c`, failed 1: SA40-12) |
  | `9fd61c2` | 3,146 |
  | `978a6e4` | 3,146 / 3,137 passed |

  `20e7a41` (records only) was not gated on its own.
- **Control test 4.7:** 15,717 differences, 0 unpredicted. There are 53 declarations: 51 at `a2ee714` plus repairs 1 and 2. Repair 3's
  entries were restored by the revert.
- **r20:** captured twice at `9fd61c2`, byte-identical, invariants 7/7, nine flagged. It is exactly as predicted: the five members
  repair 3 had moved equal r18, and the other 66 equal r19.
- **References:** the tax sweep 13,815 / 0; the Social Security reference 25 / 0.
- **The conservation grid:** 0 leak flags in 3 × 1,000 plans.
- **ChatGPT's repro scripts:** the same results as at `4a2250a`, each stop explained in the handover.
- **The browser smoke check** was not rerun. Only wording changed in the app, and that wording is read rendered by
  `tests/audit-s5aa-r40-app-states-r40-charges.test.js`.
