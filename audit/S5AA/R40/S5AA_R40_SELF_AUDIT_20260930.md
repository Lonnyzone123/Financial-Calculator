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
