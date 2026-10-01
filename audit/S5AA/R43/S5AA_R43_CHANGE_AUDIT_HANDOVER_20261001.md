# S5AA R43 — change audit handover: R42-01 and SA42F-01 to -34

*Written by Claude, 2026-10-01 (Arizona, UTC−7), for ChatGPT's audit of the change from `s5aa-r42-source` (`c67c713`) to
`s5aa-r43-source` (`5b8f0d5`). Every figure below was read from its output at the commit named.*

## 1. What is asked

One report, in two parts. **It replaces the separate R42V review that the R42F cover note had asked for.**

1. **Review Claude's R42F audit** (`audit/S5AA/R42F/S5AA_R42F_CLAUDE_FULL_MODEL_AUDIT_20260930.md`) as you reviewed
   R32F. For each SA42F finding, say whether you **confirm, qualify or refute** it. Number any new findings of your own
   on the R42 source **R42V-NN**.
2. **Audit the R43 change** from `c67c713` to `5b8f0d5`, including whether each repair matches the finding as you ruled
   on it. Number any findings **R43-NN**.

Then determine S5AA's status against E1 to E18 as amended by A-01 to A-10, with GO or NO-GO on the report's first line. If
you refute a finding, its repair is a change the model should not have made. Report that as an R43-NN finding, and the
owner will decide whether to revert it.

## 2. How the status got here

- **ChatGPT's R42 change audit** (PR #44) determined **NO-GO** at `c67c713` on two findings:
  - **R42-01:** a staggered spousal claim averaged the worker's credited months, $144 a year in your witness;
  - **R42-02:** R42's prediction missed `seed:20`.
- **Claude's R42F full-model audit** (PR #45) reported 34 findings, SA42F-01 to -34: 2 P1, 19 P2 and 13 P3. Its cover
  note asked for a separate review (R42V). That review is folded into this one (§1); no separate R42V report is needed.
- **The owner decided on 2026-09-30:**
  - repair R42-01;
  - accept R42-02 as a disclosed miss: the R42 prediction stands as written, together with its comparison to actual
    (SA42-06);
  - repair all 34 R42F findings in this round, together with R42's local one-time Roth fix (SA42F-16);
  - review the findings and the repairs in one audit (§1). A finding you refute has its repair reverted in a later
    round if the owner agrees. This replaces the owner's first plan, which was to drop any refuted finding before this
    PR.
- **The owner also changed three declared items** (R42F §4):
  - the spousal IRA follows IRC 219(c)(2);
  - HSA contributions stop at 65;
  - a survivor's costs start at the death unless the surviving spouse has a salary.
- **And chose how three findings are repaired:**
  - SA42F-20: amounts are in today's dollars in every growth mode;
  - SA42F-11: Medicare is charged for each person 65 or over;
  - the survivor rule's salary exception.

## 3. The commits

The round was built in parts. Each part's prediction was committed before its engine edits (A-01) and names the plans it
expects to move, with a corpus scan and a positive control (`prediction/`). Every gate below passed with 0 failing, 0
skipped and 9 todo, and closeout accepted 12, refused 0.

| part | prediction | build | repairs | gate (tests) |
|---|---|---|---|---|
| — | `63332a8` | `6a724fe` | **SA42F-16:** the one-time Roth path reads the worked-share proxy (R42's local commits, carried) | 3,171 |
| 1, Social Security | `5436f2f` | `d11017f` | **R42-01 and SA42F-18:** withholding charged month by month, in order, to the benefit payable in each month; each benefit credited for its own months (20 CFR 404.412), with the survivor's reduction adjusted at full retirement age.<br>**SA42F-02:** every COLA from the anchor, whatever the claim date.<br>**SA42F-17:** past 62 at the start, the bend points of the year of 62.<br>**SA42F-27:** label | 3,182 |
| 2, tax | `268e80e` | `b131aeb` | **SA42F-01:** the 199A deduction, mirrored in the funding solver.<br>**SA42F-08:** phase-out widths fixed.<br>**SA42F-09:** the Rule of 55 in the separation row.<br>**SA42F-10:** the MFS IRMAA table.<br>**SA42F-22:** joint IRMAA thresholds 2 × single.<br>**SA42F-23:** age-65 amounts at the tax year's close | 3,196 |
| 3, contributions | `f4aeac1` | `dd18f31` | **Rulings:** the spousal IRA under 219(c)(2); HSA stops at 65.<br>**SA42F-12:** 415(c)(1)(B).<br>**SA42F-13:** no forfeiture after succession.<br>**SA42F-14:** the spouse's presets.<br>**SA42F-15:** the HSA family base in dollars.<br>**SA42F-24:** the app cards' window.<br>**SA42F-25:** time-weighted changes | 3,212 |
| 4a, life events | `16f3119` | `960eb11` | **SA42F-03:** no RMD in the first distribution year after a death before the RBD.<br>**SA42F-04:** a spouse account with no spouse.<br>**SA42F-11:** Medicare for each person 65 or over.<br>**Ruling:** survivor costs at death.<br>**SA42F-29:** the survivor test at the row's opening | 3,224 |
| 4b, cash flows | `5c8be5b` | `ae93a43` | **SA42F-19:** an other asset available inside a row.<br>**SA42F-20:** today's dollars in every mode.<br>**SA42F-21:** the reserve sized on projected spending.<br>**SA42F-26:** label.<br>**SA42F-28:** `INCOME_AFTER_PLAN_END` | 3,234 |
| 5a, the plan-value contract | `9ae6a43` | `a9d7fc0` | **SA42F-05, -06:** `src/plan-value-contract.json`, read by the validator, the engine, the build and the Worker.<br>**SA42F-07:** three flags join the boolean-flag contract.<br>**SA42F-30, -32:** nobody alive at the start, refused by both layers | 3,242 |
| 5b, seeds, contract, history | `61f2b3b` | `96006c1` | **SA42F-31:** per-path seeds mixed from (seed, path, stream).<br>**SA42F-33:** an unknown method's `mode` is null; RESULT_CONTRACT §7b lists S5AA's codes.<br>**SA42F-34:** historical starts must be data years | 3,249 |
| r22 | — | `5b8f0d5` | the expanded baseline registered (§4) | 3,249 |

Several builds were amended before any push, after a gate or closeout failure. Each amendment is listed in the self-audit
(SA43-G, SA43-I), and the hashes above are the amended ones.

**Tests,** all hand-derived. Every file was re-run against the tree before its repair, in the form committed at the source
(`witness_runs/`). Each file passes in full at `5b8f0d5`. Before its repair, every repair case fails. The cases that pass
there are:
- the controls;
- two consistency checks that hold trivially before the change: the funding solver settling against the 199A deduction,
  and the contract's record rules mirroring the validator's;
- the lower earner's side of the spousal IRA ruling, which the old pooled rule already allowed;
- the written-out seed scheme's uniqueness, which never calls the engine.

The counts before and after the repair are:
- `tests/audit-s5aa-r43-social-security.test.js`: 11 cases; before 7 fail and 4 pass.
- `tests/audit-s5aa-r43-tax.test.js`: 14; before 11 fail and 3 pass.
- `tests/audit-s5aa-r43-contributions.test.js`: 16; before 11 fail and 5 pass.
- `tests/audit-s5aa-r43-life-events.test.js`: 12; before 8 fail and 4 pass.
- `tests/audit-s5aa-r43-flows.test.js`: 10; before 9 fail and 1 passes.
- `tests/audit-s5aa-r43-plan-value-contract.test.js`: 7; before 5 fail and 2 pass.
- `tests/audit-s5aa-r43-seeds-contract-history.test.js`: 6; before 4 fail and 2 pass. It reaches the engine through `runPlan` only. The path-by-path
  seed checks are in `tests/rng-seeding.test.js`.

## 4. Corpus movement

**Control 4.7:** every move is declared in `tools/control-candidate-prediction.json`. At `5b8f0d5`: found 15,940,
**unpredicted 0**, declared-but-not-found 0.

**Expanded:** **r22** (`tools/baseline-20261001-s5aa-expanded-r22.json`):
- captured at `96006c1` twice in clean worktrees, byte-identical;
- invariants 7/7;
- output hash `8232200e…9a2b`.

**The input hash moves** (`28e26d38…`, was `1d91d673…`). Only `expansion:monte-carlo-sensitive-band`'s inputs change: it
was re-chosen by its declared rule under the new seeds (step 31, family version 7), and its fingerprint was re-pinned with
`pin-inputs`, as at R36.

**Against r21, nineteen entries differ,** each named by a part's prediction or recorded there as a miss:

| entry | part |
|---|---|
| `golden:reserve-and-bond-tent`, `seed:1` to `seed:7`, `seed:9`, `seed:11`, `seed:12`, `seed:15`, `seed:16`, `seed:19`, `targeted:spouse-cola-income` | 4b (SA42F-20, -19, -21); `seed:4` also in part 3 (HSA at 65) |
| `golden:monte-carlo-fixed-seed`, `seed:17` (and `seed:9`) | 5b (SA42F-31) |
| `expansion:monte-carlo-sensitive-band` | 2 (SA42F-22, **unpredicted**: SA43-B) and 5b |
| `expansion:s5aa-r6-gap-survivor-health-roth` | 4a (SA42F-11, **unpredicted**: SA43-D) |

The other 52 entries equal r21's. The prediction misses are set out in the self-audit:
- two unpredicted moves (SA43-B, SA43-D);
- two over-predictions (SA43-A: `seed:3` and `seed:17` under SA42F-08; SA43-E: `seed:8` under SA42F-20);
- one wrong direction (SA43-C: `seed:4`).

## 5. Checks

| check | result |
|---|---|
| gate at `5b8f0d5` (the source) | GATE PASSED: 3,249 tests, 3,240 pass, 0 fail, 0 skipped, 9 todo; closeout accepted 12, refused 0. Each earlier commit's gate is in §3 |
| control 4.7 at `5b8f0d5` | found 15,940, **unpredicted 0**, declared-but-not-found 0 |
| expanded capture | r22, as §4 |
| the tests against the unrepaired trees | `witness_runs/`: each R43 test file, as committed at `5b8f0d5`, run on its part's pre-repair tree (`*_at_<commit>.txt`) and at `5b8f0d5` (`*_after_repair.txt`), as §3 |
| the build | `investment-calculator-v2c.html` at `5b8f0d5`: SHA-256 `eea770ab2b5c45bde41513c065fd5c457ed61acbd0e862ab122b7029df5ae94f`, 1,049,425 bytes, the pin in `tests/lib/harness.js`; `node build.js` reproduces it byte for byte |
| **task 6.5, repeated on the final candidate (A-04)** | R41's scripts (`audit/S5AA/R41/e15/`), unchanged, in Chromium 152 on Windows 11, at 12:02 am on 2026-10-01 (Arizona). Raw: `e15/browser_results_5b8f0d5.json`; Node's reference: `e15/node_results_5b8f0d5.json`.<br>- **A:** the Worker equals the main thread on 75 of 75 plans; 72 equal Node, every R43 move included.<br>- **B:** 70 imported, 70 CSVs byte-identical between the Worker and main-thread paths, 70 of 70 Worker replies equal the main-thread engine; 5 refused at import, the same five as at `c67c713`.<br>- **C:** with a Worker fault, or a load fault, the app falls back with the identical CSV. With both paths failing, the error card shows with no figures, the CSV is refused, and the debug export records `ENGINE_RUN_FAILED`. Recovery is exact.<br>- **D:** four concurrent Workers, each equal to the main thread.<br>- **E:** the three Monte Carlo plans that differ from Node (`golden:monte-carlo-fixed-seed`, `seed:9`, `expansion:monte-carlo-sensitive-band`) differ by at most 5.57 × 10⁻¹⁵ relative (`c67c713`: 1.83 × 10⁻¹⁵), with no count, rate or path count moving. The Worker carries `monteCarloPathSeed` and the plan-value contract.<br>This is still one desktop browser, and not the post-S6 phone campaign |

## 6. Flagged for you: tests changed by intent

- **R10's equal-age control** (`tests/audit-s5aa-r10-nobody-alive-refused.test.js`) now asserts a refusal. Under SA42F-30
  a whole-number lifespan equal to the start age is not alive at the start.
- **The contract's `accessPct` range was removed after the part 5a prediction was committed.** The engine clamps the
  value, and the earlier WARNING decision is kept. The validator upgrades a WARNING at the same path in place.
- **About 20 older fixtures** that held values the contract now refuses were adapted, each keeping its subject.
- **R2-005's HSA fixtures** use ages below 65. **Five AUD-006 expectations** use the today's-dollar latch.
- **`tests/rng-seeding.test.js`** pins the new scheme, written out independently.

## 7. Declared, not repaired

- **The spousal reduction factor's adjustment** for spousal months withheld before full retirement age (carried from R42).
- **Two validator-only rules:** the legacy `"recurring"` income type (`targeted:spouse-cola-income`) and
  `TRANSFER_INTO_WORKPLACE_PLAN` (`seed:9`).
- **199A:** not a specified service business, material participation, and no W-2 wages or qualified property.
- **Medicare enrolment at 65 is assumed** for the HSA stop and for SA42F-11. Pre-Medicare costs keep their household
  rule.
- **Every limit R42 left disclosed stands:** the partial-row tax convention, the wage-tax clamp, A-09's exclusions, the
  error card's wording, and an end age equal to the start.
