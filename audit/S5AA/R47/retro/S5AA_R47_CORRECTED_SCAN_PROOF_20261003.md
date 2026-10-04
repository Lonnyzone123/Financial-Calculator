# S5AA R47 — the corrected scan, proved on the pre-repair tree

*Written by Claude on 2026-10-03 (Arizona, UTC−7), on the owner's decision of that day: R47's prediction misses are not accepted
as disclosed (as at R43/R44). Required: a corrected scan that tests whether the senior deduction actually reduces taxable
income, covers the wage-only `baseline` return and the one-time HSA route, computes direction per C5, and, run on `ba9946d`,
names exactly the entries that moved. The files are beside this record: `r47_corpus_scan_v2.js` and its output
(`r47_corpus_scan_v2_at_ba9946d.txt`, `.json`), `r47_compare_v2.js` and `r47_path_compare_v2.js` with theirs.*

## What was done

1. **The truth** is R47's own measurement: the expanded captures of `ba9946d` and `f02e26a`, each taken from a clean tree
   (`audit/S5AA/R47/prediction/r47_expanded_capture_*.json`). They differ in 24 of 71 entries.
2. **The corrected scan** was run on `ba9946d` only, in a scratch detached worktree with a node_modules junction, reading only
   that tree's engine, rules and corpus. It reads the engine's own figures through read-only taps on an in-memory variant of
   that engine (`tests/lib/engine-variant.js`). For every plan and every Monte Carlo path, the variant's rows are asserted
   equal to the real engine's. The scan's recomputation of each row's two returns was also checked against the engine's own
   figures: no mismatch on any row.
3. **The comparison** (`r47_compare_v2.js`) checks the plans the scan names against the plans that moved, and each predicted
   direction against the measured one. `r47_path_compare_v2.js` measures, path by path, which Monte Carlo paths changed
   between the two trees (in a second scratch worktree at `f02e26a`, used for measurement only). Both scratch worktrees were
   removed afterwards.

## The four corrections

1. **Binding, not just positive (C2).** For each row of tax year 2029 or later, the row's full return is recomputed twice by
   the engine's own `estimateTaxes()`, with that row's own arguments and rules object: once as the engine has it, and once with
   the enhanced deduction set to $0 and nothing else touched. The row counts only where the total differs. This removes the 18
   plans the R47 scan flagged that did not move: their deduction was positive but had no taxable income left to reduce. It also
   gives first-order sizes close to the measured ones (for example `golden:rmd-and-roth-conversion` +$9,960 against +$9,993.85
   measured; `seed:16` and `seed:10` exact).
2. **The `baseline` return (C6).** The wage-only return is recomputed the same way, at its own MAGI. The funding obligation is
   the full return *less* this one, so a higher baseline tax means the portfolio funds less. This names `seed:20`: its full
   return is phased out (dT = 0), but the first changed row's baseline rises $652.59. It also names
   `expansion:s5aa-r6-gap-survivor-health-roth` (dT = 0, dB = $72): the portfolio funds less, so the final total rises.
3. **The one-time HSA route (C6).** For a scheduled transfer into an HSA in a row where its owner is past 65 and before the new
   Medicare start, the scan works out the room under each share, mirrored from the tree's one-time route. It sets the dollars
   that would move against what the source holds on the transfer date. This names `seed:13`: the room goes from $0 to $8,750,
   but the source holds $0, so only the limit note changes.
4. **Direction (C5), from each changed row's own funding.** The extra obligation (dT − dB) is funded the way the engine funds
   tax. The row's cash goes first and a sale covers the rest. Cash left after tax is split pro rata over its sources, and each
   source's surplus policy decides it: "spend" means spending; "retain"/"invest" means the portfolio. An unfunded row becomes
   shortfall. A smaller obligation shrinks the sale first, and past that the cash residual grows. Lifetime tax rises with
   dT > 0. Where dT = 0, it has no first-order change, and its second-order sign is not predicted: two effects oppose (less
   gain realised now, more balance earning later).

## Result

**Exact.** The scan names 24 entries in the expanded composition; the same 24 moved. No named plan failed to move. Every
predicted direction matches the measurement: final total, lifetime tax (where predicted), spending and shortfall, as follows.

| entry | predicted | measured |
|---|---|---|
| `golden:rmd-and-roth-conversion`, `seed:1`, `seed:5`, three `targeted:historical-*`, `targeted:spouse-cola-income`, `targeted:collision-household-cash`, `targeted:explicit-cash-holding`, `targeted:funded-qcd`, `targeted:collision-rmd-retained-cash`, `s5aa-gap-working-household`, `s5aa-gap-death-while-working`, two `s5aa-r14-*` | lifetime tax up, final total down | the same |
| `seed:2` | tax up, total down, spending down | the same (spending −$12,399.82) |
| `seed:6` | tax up, total down, shortfall up | the same (shortfall +$451.59) |
| `seed:10` | tax up, total unchanged, shortfall up | the same (shortfall +$1,141.46) |
| `seed:16` | tax up, total unchanged, spending down $709.45 | the same (−$709.45) |
| `seed:20` | total up, spending up; lifetime tax second order | total +$21,351.17, spending +$3,305.51; lifetime tax +$853.33 |
| `s5aa-r6-gap-survivor-health-roth` | total up; lifetime tax second order | total +$123.19; lifetime tax −$0.43 |
| `seed:13` | only the HSA limit note changes | rows equal, `limitWarnings` text differs |
| `golden:monte-carlo-fixed-seed` | named, 179 binding paths; the published result may move | 179 paths changed, the same 179; published result moved |
| `expansion:monte-carlo-sensitive-band` | named, 18 binding paths; the published result may move | 18 paths changed, the same 18; published result moved |

In the control composition the scan names 18 entries: the 17 that control 4.7 declares, plus `seed:13`. 4.7 compares
`limitWarnings` by length, so a text-only change is invisible there (the R44 lesson, SA44-A); the expanded capture compares the
text.

## Remaining gap

- **The second-order sign of lifetime tax when dT = 0** (`seed:20`, `s5aa-r6-gap-survivor-health-roth`) is not predicted. The
  scan says so rather than guessing. Measured: +$853.33 and −$0.43. Every first-order direction for those two plans is right
  (final total up; spending up for `seed:20`).
- **Some conditions remain necessary-only by construction.** Each binding test runs on the pre-repair path, so a row after the
  first changed one is tested in its pre-repair state, not its repaired one. Here that cost nothing: no named plan failed to
  move.
- **Sizes are first-order.** They agree closely with the measurement where the funding is simple. They run under or over where
  later rows compound (for example `targeted:historical-1929` +$4,019 first order against +$4,705.87 measured). C5 asks for the
  direction and an approximate size.
