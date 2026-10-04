# S5AA R45 — Claude's self-audit before handover

*Written by Claude, 2026-10-03 (Arizona, UTC−7). Checked against the prediction (`ade9e9d`) and the commits to the source candidate
`9c7790e`. Each line names its evidence.*

## 1. Predicted against measured

| | predicted (`ade9e9d`) | measured | verdict |
|---|---|---|---|
| control composition | no movement | 4.7 passes undeclared at `265347a`, `1e1bf8e` and `9c7790e` | as predicted |
| expanded composition | exactly `expansion:s5aa-gap-working-household`, 67 → 56; final total down "several hundred thousand to over a million"; lifetime taxes up; conversions unmoved | exactly that entry; −$1,678,276.53; +$204,514.81; conversions unmoved; pay-first about $84,000 a year against the hand-traced $85,000 | as predicted |
| C1 after the build | the scan's date equals `householdRetireAge()` | 107 of 107 corpus plans equal (`prediction/r45_c1_check.js`) | as predicted |
| witnesses | 14 repair cases fail before, 23 pass after | 14 failed at `bde158f` (`witness_runs/`); 23 pass at every later commit | as predicted |
| named test adaptations | R43's salary control; SA42F-29 | both, with the figures in the handover §6 | as predicted |
| conservation invariants | pass unchanged | pass | as predicted |

## 2. What was not predicted, or was wrong

- **SA45-A, the Worker function list** (defect; the gate on `1096145`, 40 Worker-route failures; repaired in `c1ddc71`). The two new
  helpers were not added to the app's named Worker list. Lesson: a new top-level engine function needs the Worker list in the
  same commit; `registry-single-definition`-style checks do not cover it.
- **SA45-B, R41's already-retired control** pinned the warning rule 8 removes. Not named.
- **SA45-C, SA42F-26's label test** pinned the conversion label R45 rewrites. Not named.
- **SA45-D, the scenario generator** wrote `spouseRetireAge` for every spouse. Claude's first search listed the line and did not
  follow it up; generated seed 98 then raised the new spouse warning. The fix keeps every corpus input unchanged (both specs
  re-derive their pins).
- **SA45-E, the form listeners** (defect; found by task 6.5 at `1e1bf8e`; repaired in `9c7790e`). The four R45 inputs, and R35's two
  IRMAA inputs since R35, did not recalculate or save on change. No test held the form's reads to its listeners; one does now.
- **SA45-F, a carried test's derivation** left out the age-50 IRA catch-up ($670 expected; $760 is right). Not a witness.

**The common cause of B to E:** C6 searched the engine's readers, and the exposure hook covered tests that run the engine. The
validator's warnings, the form's text and the form's wiring changed too, and no search was made for tests or code that pin those.
For later rounds: a repair that changes a validator message, a form label or a form input searches the tests for that message,
label or id before the prediction is written, and the browser check exercises each new input.

## 3. Tax-law claims checked at the primary source

- **IRC 219(b)(5)(B), (C)** (the IRA catch-up in SA45-F's test): $1,000, indexed after 2023 from calendar 2022, rounded down to a
  multiple of $100 (law.cornell.edu, read 2026-10-03). The model indexes the 2026 figure ($1,100) at the plan's inflation (Q165's
  convention for price-linked amounts).
- **IRC 72(t)(2)(A)(v)** (the Rule of 55 witness) and **401(a)(9)(C)** (the still-working witness): unchanged rules, already checked
  at R35 and R39; R45 changes only whose retirement age each reads.
- **IRC 408A(c)(3)** (the Roth width test): the reduction runs over $15,000 for a single filer; only the start is indexed (R43,
  SA42F-08, confirmed by ChatGPT's R43 audit).
- R45's household-date rules are the owner's planning decisions, not tax rules; AA1 rated them (AA1-38 to -40), and the owner's
  AA1 decisions are built.

## 4. The gate and the browser

- **Gate:** `265347a` and `1e1bf8e` passed 3,289 tests, 3,280 pass, 0 fail, 9 authorized todos; closeout 12/0/0. `9c7790e` passed 3,290 tests, 3,281 pass,
  0 fail, 9 authorized todos (one more test: the form-listener test); closeout 12/0/0.
- **Task 6.5 at `1e1bf8e`** (R41's scripts, unchanged, Chromium 152 on Windows 11; artifact SHA-256 `72e64e28…`):
  - **A:** the Worker equals the main thread on 75 of 75 plans; 72 equal Node; the other three are the same Monte Carlo plans as at
    R44 (`golden:monte-carlo-fixed-seed`, `seed:9`, `expansion:monte-carlo-sensitive-band`);
  - **B:** 70 imported, 70 CSVs byte-identical across the Worker and main-thread paths, 70 of 70 Worker replies equal the main-thread
    engine; the same 5 refused at import;
  - **C:** a Worker fault or load fault falls back with the identical CSV; with both failing no figures are shown and the debug export
    records `ENGINE_RUN_FAILED`; recovery is exact;
  - **D:** four concurrent Workers, each equal to the main thread;
  - **E:** the three plans differ from Node by at most 5.57 × 10⁻¹⁵ relative, with no count, rate or path count moving.
  - **The new inputs:** present; setting them stored `spouseRetireAge` 63, `spendingStartAge` 61.5, `conversionStartAge` 62 and
    `healthCoverageEndAge` 64 only when another input changed; editing or blanking them alone did nothing (SA45-E).
- **Task 6.5 at `9c7790e`** (artifact SHA-256 `f27d1a6b…`): A to E repeat the `1e1bf8e` results exactly (75/75 Worker equals main,
  72 equal Node, the same three Monte Carlo plans at most 5.57 × 10⁻¹⁵ relative; 70 imported, 70 CSVs and 70 Worker replies equal;
  the fault cases and recovery as before; four concurrent Workers equal). **The six inputs,** each changed on its own: spouse
  retirement age 63, spending start 61.5, conversion start 62 then 66, coverage end 64, IRMAA MAGI 300,000 and 250,000 -- each
  stored and recalculated at once; blanking each removed its field.
- **A capture of `9c7790e`** equals r24 on all 71 entries.

## 5. Records

- The relay to eb (`S5AA_R45_RELAY_TO_EB_20261003.md`) is prose for eb's files; none of eb's files was edited.
- Times are Arizona (UTC−7), read with `TZ=MST7`.
