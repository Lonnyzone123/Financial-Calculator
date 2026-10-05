# S5AA R54 item 4 — prediction record: five ranges widened, the seed's whole-number rule, the engine's MAGI refusal

*Written by Claude on 2026-10-04, 8:10 pm Arizona time (UTC−7). Committed before any edit to `src/` or the contract (A-01), held to the
R44.1 checklist. Base: `sprint/s5aa-r54` at `a961481` (item 3, verified by the coordinator: gate 4,073 / 4,064 / 0 / 9 PASSED, capture =
r30). Scripts and outputs: `audit/S5AA/R54/item4/`.*

## The decisions (the owner, 2026-10-04, about 7:50 pm)

1. Widen five ranges in the form AND the contract together: fee 0–5% (was 0–2); withdrawal rate 0–25% (was 0–15); guardrail spending
   adjustment ≥ 0 (was ≥ 1; the guardrails keep ≥ 1); dividend growth −50% to 20% (was −20); survivor spending reduction 0–75% (was 0–50).
   Check every downstream reader.
2. An entered seed must be a whole number of at least 1 (the form's `Math.max(1, Math.floor(seed))`); an absent seed keeps the engine's
   fallback, 0. The owner accepted that an entered 0 is refused.
3. The engine refuses a negative prior-year MAGI, as the validator does; null or absent stays accepted; R51F F26 must stay at 0 failures.
4. The blur-only input ranges: record only.

## How each is built (definitions, before the edit)

**1. Every site of the five fields** (searched in `src/app-shell.html`; no hint text states any of these ranges, and no range slider but the
fee's):

| field | input attribute | range slider | readStatic()/save() clamp | contract |
|---|---|---|---|---|
| fee | `max="2"` → `max="5"` | `addRange` `["v2-fee",0,2,.01]` → `0,5` | `clamp(…,0,2)` → `0,5` (readStatic) | max 2 → 5 |
| withdrawal rate | `max="15"` → `max="25"` | none | `clamp(…,0,15)` → `0,25` | max 15 → 25 |
| adjustment | `min="1"` → `min="0"` | none | `Math.max(1,…)` → `Math.max(0,…)` | min 1 → 0 |
| dividend growth | `min="-20"` → `min="-50"` | none | `clamp(…,-20,20)` → `-50,20` | min −20 → −50 |
| survivor reduction | `max="50"` → `max="75"` | none | save() `clamp(…,0,50)` → `0,75` | max 50 → 75 |

**Downstream readers (C6)**, every occurrence in `src/engine.js` and `src/app-shell.html`:
- `fee`: `accountReturnForPeriod()` (`ret -= fee/100`, then `clamp(ret, −.95, 2)`), the VPW real rate (`max(−.5, …)`), the glide/reserve
  blend's expected return (`expected − fee/100`). A 5% fee is a −5% return adjustment; no cap assumed 2%. The app's insight ("Test lower
  investment fees" above 0.25%) reads it as a number. Fine.
- `withdrawalRate`: `strategySpending()` only (`rate = withdrawalRate/100`): fixedReal's first year (`retireBalance × rate`), constantPercent
  (`balance × rate`), guardrails/Guyton (the initial amount and the bands `rate × (1 ± guardrail/100)`), floorCeiling (`balance × rate`,
  clamped to floor and ceiling). No cap at 15%; draws are limited by the balance as before. Fine.
- `adjustment`: the guardrails/Guyton branch only — `amount *= 1 − adjustment/100` above the upper band, `× (1 + adjustment/100)` below
  the lower. At 0 the band still triggers and the amount is multiplied by 1: no division by the adjustment anywhere. Fine.
- `dividendGrowth`: the dividend yield's growth `yield × (1 + g/100)^(age − start)`, at two sites. At −50% the yield halves each year
  (stays positive). The engine's finite-input list names it. Fine.
- `survivorSpendingReduction`: `strategySpending()` — `survivorFactor = 1 − clamp(reduction, 0, 50)/100`. **This engine clamp would hold a
  valid 75 to 50 silently; it is widened to 0–75 with the rest** (the one engine read changed by decision 1).
- The contract readers (validator `validatePlanValueContract()`, engine `planValueContractViolation()`, the app's Worker source) read the
  new numbers unchanged.

**2. The seed.** The contract has no integer support. The narrowest rule in both layers: a contract key `"integer": true`, read by
`validatePlanValueContract()` (an `OUT_OF_RANGE` ERROR, "expected a whole number of at least 1") and by `planValueContractViolation()`
(`SCENARIO_PLAN_VALUE_OUT_OF_RANGE`), and a new entry `{ "path": "assumptions.seed", "min": 1, "integer": true }`. Absent stays valid (the
contract skips an absent value) and the engine's fallback (`Number(seed)` not finite → 0) is unchanged. A non-finite seed keeps its earlier
code (`SCENARIO_NONNUMBER_PLAN_VALUE`, checked first). F26 mutates the new entry with NaN, ±Infinity, '123' and null — each already refused by
both layers (the validator types the seed) — so its count rises by 5 and its failures stay 0.

**3. The MAGI.** A nullable contract entry would trip F26 (it expects null refused), so the refusal is in the engine's own input gate:
`negativePriorMagiCode(p)` in the first stage after R53's end-age check, code `NEGATIVE_PRIOR_MAGI` → `SCENARIO_NEGATIVE_PRIOR_MAGI`, with
its message, in the Worker function list and the exports, and documented in `RESULT_CONTRACT.md` (contractVersion stays 5). A finite number
below 0 is refused; null, absent and 0 are accepted. The validator's own `OUT_OF_RANGE` (R35) is unchanged.

## The stop condition (`item4/r54i4_stop_scan.js`, `r54i4_stop_scan_at_a961481.txt`)

| scanned | entered seed 0 / non-integer / negative, or negative MAGI | inside a widened range only |
|---|---|---|
| control (36), expanded (71) | **0, 0** | 0, 0 |
| `defaultPlan` (seed 42791), 5 golden definitions | 0 | — |
| generator seeds 1–5,000 (every seed a whole number) | 0 | 0 |
| `tests/fixtures`, the R40 grid (3,000) | 0, 0 | — |
| the four companions' stored plans (at `33a5b59`) | 0 | — |

**No plan is refused: item 4 is built.** The widening refuses nothing new.

## The tests: exposure by hook (`item4/r54i4_hook.js`, all 451 files; 27 records in 6 files)

| file | what | predicted |
|---|---|---|
| `rng-seeding` | seed 0 (engine); NaN | **the absent-seed test fails** (it compares an absent seed with an entered 0) → adapted: the fallback is derived (path 0 of an absent-seed run equals `simulatePlan()` seeded `pathSeed(0, 0, ·)`), determinism kept, and an entered 0 asserted refused. NaN keeps NONNUMBER (passes). |
| `audit-s5aa-r54-form-ranges-refused` (item 3's witness) | adjustment 0, growth −25, reduction 75, fee 2.5 | **fails** → adapted: the five rows take the new ranges (fee −1/50 and edges 0/5; withdrawal −4/80, 0/25; adjustment −1, 0; growth −55/25, −50/20; reduction −1/80, 0/75); the import case uses a 6% fee ("at most 5"). |
| `audit-s5aa-r54-restore-keeps-all` (item 2's witness) | seed 42.7, fee 2.5, MAGI −5 (validator) | **fails** → adapted: seed 42.7 leaves the family list (now refused); the 2.5% fee case returns to "restored and kept, 97,500" (the reverse of item 3's); from storage the 2.5% fee is kept again. |
| `audit-s5aa-r43-plan-value-contract` | max+1 / min−1 of the old ranges | pass: it reads the contract, so its bad values move with it. |
| `audit-s5aa-r35-irmaa-…` | MAGI −5 (validator only) | pass. |
| `audit-s5aa-r25-…` | seed NaN | pass (NONNUMBER first). |

Also: `audit-sa04-decision-inflation` returns to its text before item 3 (its adjustment of 0 is valid again; item 3 had made it 1).
Every other test is predicted to pass; a failure not named here is a miss.

## The witness

`tests/audit-s5aa-r54-widened-ranges-seed-magi.test.js` (5 tests; SHA-256 `971adce9c92226abd0a2faeebcd5c60dc4cd4fea3435fd42a416badbb54d76fe`):
- each widened range: the new edge accepted and projected, just past it refused in both layers (fee 5 / 5.01, withdrawal 25 / 25.01,
  adjustment 0 / −0.01, growth −50 / −50.01, reduction 75 / 75.01);
- downstream, hand-derived: a 5% fee, 100,000 × 0.95 = **95,000**; a 25% constant-percentage draw, **25,000** spent and **75,000** left;
  guardrails at 4% after a −30% year (balance under 4,000 / 4.8%): a 0% adjustment keeps **4,000**, the 10% control cuts to **3,600**; a
  couple with the spouse's life at 70.5 and a 75% survivor reduction: **40,000** in the year both are alive at its opening, **10,000** after
  (the engine's old clamp: 20,000); a −50% dividend growth projects;
- through the form: each field typed at its new edge saves the edge, and typed just past it is clamped to the edge (before: the old edge);
- the seed: 0, 1.5 and −3 refused in both layers (`OUT_OF_RANGE`, `SCENARIO_PLAN_VALUE_OUT_OF_RANGE`); 1 accepted; absent projected;
- the MAGI: −5 refused by the engine (`SCENARIO_NEGATIVE_PRIOR_MAGI`) and the validator (`OUT_OF_RANGE`); null, absent and 0 accepted.

At `a961481` (`item4/witness_runs/r54i4_witness_at_a961481.txt`): 53 checks, 20 pass, 33 fail — each new edge refused (OUT_OF_RANGE /
SCENARIO_PLAN_VALUE_OUT_OF_RANGE), the downstream test stops at its first refused plan, the form saves the old edges (2, 15, 1, −20, 50), the
seeds run, and the engine runs a −5 MAGI; the "past" values, the seed controls and the MAGI null/absent/0 controls pass.

## Companions, capture

- Capture: no corpus plan has a survivor reduction above 50, an entered seed outside the rule or a negative MAGI, and no other engine read
  changes: **predicted equal to r30**.
- R53 focused: 20/20, 140, grid 400/800, hunt 4/4, exit 0 — unchanged.
- R51F (adapter): identical verdicts; F26's mutation count 320 → **325**, failures 0. R46–R51, R52: identical.
