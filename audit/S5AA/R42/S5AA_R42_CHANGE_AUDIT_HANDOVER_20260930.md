# S5AA R42 — change audit handover: R41F-01 to R41F-05

*Written by Claude, 2026-09-30 (Arizona, UTC−7), for ChatGPT's audit of the change from `s5aa-r41-source` (`984197c`) to
`s5aa-r42-source` (`c67c713`). Every figure below was read from its output at the commit named.*

## 1. What is asked

Audit the R42 change and number any findings **R42-NN**. Determine S5AA's status against E1 to E18 as amended by A-01 to
A-10, with GO or NO-GO on the report's first line.

## 2. How the status got here

- **ChatGPT's R41 change audit** (PR #40) determined GO at `984197c` on E15's browser evidence.
- **ChatGPT's R41F whole-model audit** (PR #42) then found five defects outside the R41 change and determined
  **NO-GO**, superseding that GO for status purposes.
- **Claude reproduced all five exactly** with the R41F script at `984197c`. It read POMS RS 02501.095 (including §B.4,
  the order when both the worker and the auxiliary work), RS 00615.320 and RS 00615.598.
- **The owner decided on 2026-09-30: "Repair all five in R42".**

## 3. The commits

| commit | what | gate |
|---|---|---|
| `550764b` | the prediction, before any edit (A-01): no corpus plan moves; each witness's figures hand-derived; the corpus scan and its positive control | 3,152 / 0 failing |
| `f016317` | **R41F-05:**<br>- a present `ssBenefit` or `spouseSS` that is not a finite number is `WRONG_TYPE` in the validator and `SCENARIO_NONNUMBER_PLAN_VALUE` in the engine, by path;<br>- Restore backup refuses it;<br>- `RESULT_CONTRACT.md` records it | 3,157 / 0 |
| `c28df6b` | **R41F-03:** the IRA window on a joint return is the longer of the owner's own work and the spouse's.<br>**R41F-04:** the Roth proxy reads each salary at its worked share (`ownerCompensation()` returns `selfWork` and `spouseWork`) | 3,162 / 0 |
| `82856a3` | **R41F-01:**<br>- the worker's excess is charged over the family pool (own plus the spousal part on the worker's record) in whole months, proportionally;<br>- the grace year spares the family's non-service months;<br>- the other's own test takes the remainder (RS 02501.095 B.4).<br>**R41F-02:** the survivor's limit passes the deceased's credited months, effective at their would-be full retirement age. Amended to carry the control declaration (§4) | 3,170 / 0 |
| `c67c713` | r21 registered (§4) | see §5 |

**Tests**, all hand-derived. Each was run against the unrepaired tree: its repair cases failed and its controls passed.
- `tests/audit-s5aa-r42-ss-benefit-typed.test.js`: 5 cases, the Restore backup route included.
- `tests/audit-s5aa-r42-ira-window-and-roth-proxy.test.js`: 5 cases:
  - $7,500, AGI $97,500 and taxes $17,005;
  - the reciprocal owner;
  - the Roth $7,500;
  - two controls.
- `tests/audit-s5aa-r42-ss-family-withholding-and-survivor-arf.test.js`: 8 cases:
  - $200,000 rows;
  - $100,440 for an excess between the worker's benefit and the family's;
  - after a death at 67.5: $36,000, and $45,000 in the row of death;
  - after a death at 64.5: $29,700, then $30,000 from the worker's would-be 67;
  - four controls.

**Your R41F script** reproduces the five measured "actual" figures at `984197c`. At `c67c713` its assertions of those
figures fail, as they should, because the figures are repaired; its output is in §5.

## 4. Corpus movement

**The prediction said no corpus plan moves. That was wrong in one plan** (self-audit SA42-06).

`seed:20` moves from row 67:
- the self (66 to 67) and the spouse (62) both work while claiming;
- the self's excess withholds $6,058.09, below the self's own $27,360;
- the spouse's own excess withholds the spouse's whole $13,356, which includes a $4,188 spousal part on the self's
  record;
- under RS 02501.095 B.4 the self's excess is charged over the family pool first: $6,058.09 × 4,188 / 31,548 =
  **$804.21** falls on the spousal part;
- the spouse's excess "from any remaining benefits" takes the other $12,551.79;
- household withholding falls from $19,414.09 to $18,609.88, Social Security rises $804.21, and every later figure
  follows.

The scan had excluded rows where the spouse's own test already withholds the whole spousal part.

- **Control 4.7:** 313 `seed:20` differences re-valued in `tools/control-candidate-prediction.json`; 0 unpredicted after
  the declaration.
- **Expanded:** **r21** (`tools/baseline-20260930-s5aa-expanded-r21.json`):
  - captured at `82856a3` twice in clean worktrees, byte-identical;
  - invariants 7/7;
  - output hash `6b999210…f808`, input hash unchanged;
  - against r20 exactly one entry differs, `seed:20`.

A wider scan run before the Social Security edit had also found no plan. It tested any withholding with a spousal part
on the worker's record, but kept the same exclusion, so it missed `seed:20` too.

## 5. Checks

| check | result |
|---|---|
| gate at `c67c713` (the source) | GATE PASSED: 3,170 tests, 3,161 pass, 0 fail, 0 skipped, 9 todo; closeout accepted 12, refused 0. Each earlier commit's gate is in §3 |
| control 4.7 at `c67c713` | found 15,717, **unpredicted 0**, declared-but-not-found 0 |
| expanded capture | r21, as §4 |
| your R41F witnesses at `c67c713` | `e15/r41f_witnesses_after.js` builds your five plans exactly and prints, without your script's pre-repair assertions:<br>- **R41F-03:** deposit $7,500, AGI $97,500, taxes $17,005;<br>- **R41F-04:** AGI $130,000, Roth $7,500;<br>- **R41F-01:** row 63 $200,000;<br>- **R41F-02:** row 69 $36,000, row 68 $45,000, living control $54,000;<br>- **R41F-05:** validator `WRONG_TYPE`, engine `SCENARIO_NONNUMBER_PLAN_VALUE`, control $30,000.<br>Every figure is the prediction's. Your script itself stops at its first assertion of a pre-repair figure (`7500 !== 3750`), as it should |
| the tests against the unrepaired trees | `witness_runs/`: each R42 test file's run before its repair. Its repair cases fail and its controls pass |
| the build | `investment-calculator-v2c.html` at `c67c713`: SHA-256 `1e44b9ae91b11ab0b4ee6ca6f90349ed0b525c3370c50c9a43ed25abf5bf16cd`, 986,255 bytes, the pin in `tests/lib/harness.js`; `node build.js` reproduces it byte for byte |
| **task 6.5, repeated on the final candidate (A-04)** | R41's scripts (`audit/S5AA/R41/e15/`), unchanged, in Chromium 152 on Windows 11, at 8:11 pm (Arizona). Raw: `e15/browser_results_c67c713.json`; Node's reference: `e15/node_results_c67c713.json`.<br>- **A:** the Worker equals the main thread on 75 of 75 plans; 72 equal Node, `seed:20`'s moved figures included.<br>- **B:** 70 imported, 70 CSVs byte-identical between the Worker and main-thread paths, 70 of 70 Worker replies equal the main-thread engine; 5 refused at import.<br>- **C:** with a Worker fault, or a load fault, the app falls back with the identical CSV; with both paths failing, the error card shows with no figures, the CSV is refused, and the debug export records the error; recovery is exact.<br>- **D:** four concurrent Workers, each equal to the main thread.<br>- **E:** the three Monte Carlo plans differ from Node by at most 1.83 × 10⁻¹⁵ relative, with no count or rate moving.<br>The same results as at `984197c`. This is still one desktop browser, and not the post-S6 phone campaign |

## 6. Disclosed, not repaired

- **The spousal reduction factor's adjustment** for spousal months withheld before the recipient's full retirement age
  is not modelled. Your witness's spouse is past full retirement age.
- **The other person's grace-year cap** is held to their service-month pay less the spousal part already taken, a
  conservative reading.
- **Every limit R41 left disclosed stands:** the partial-row tax convention, the wage-tax clamp, A-09's exclusions, the
  error card's wording, and an end age equal to the start.
