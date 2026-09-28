# Differential cutover criteria — what "the diff is empty" means, and what it does not cover

**S4 task 7.5.** Written after the instruments existed and were measured, so every claim below names the instrument that makes it and the figure it produced. S5 moves financial output one predicted change at a time. The rebuild then has to reproduce the corrected engine. Both are judged here.

## 1. Three routes, and what each compares

7.4a's decision (the owner, 2026-09-13, on S4-PA-01): the Node module graph **and** a fresh scratch build in jsdom. **A controlled real-browser run is out of S4's scope.**

| Route | Reference → candidate | Instrument | Corpora |
|---|---|---|---|
| **1. Node module graph** | reference tree's engine → candidate tree's engine | `tools/differential-harness.js compare` | control and expanded |
| **2. Fresh build, main thread** | candidate Node → the candidate's fresh build, as the page runs it in jsdom | `tests/build-routes.test.js` | control and expanded |
| **3. Fresh build, Worker source** | that build's main thread → the Worker source it generates, through structured-clone `postMessage` in a Node vm | `tests/build-routes.test.js`, and `tests/worker-parity.test.js` (Node → built Worker) | control |

## 2. "The diff is empty" — precisely

**Route 1** is empty only when `compare` reports the verdict `EMPTY` (exit 0) and every one of these holds:

- **The two sides are separately resolved trees**, each captured by **its own** `tools/capture-baseline.js` in **its own** process. The same directory on both sides is refused.
- **Both operands pass the corpus invariant, each in its own tree.** An empty diff between two identically damaged captures is refused, not passed.
- Both captures are **complete** and captured the **same corpus inputs**, with the same format.
- Every scenario's full result was walked, **exactly**, with no tolerance. Every outcome falls in the closed set: `VALUE`, `TYPE`, `MISSING_FIELD`, `EXTRA_FIELD`, `LENGTH`, `MISSING_SCENARIO`, `EXTRA_SCENARIO`, `ORDER`. Anything else is `UNKNOWN`, and `UNKNOWN` fails the run.
- **Missing, `null`, zero and negative zero are four different things.**

For a measured cutover, add `--measured`. Each side must then be a checkout whose every declared input is the committed bytes of its recorded commit.

**Route 2** is empty when `tests/build-routes.test.js`'s route-2 test finds **0 differences** over both corpora. **Route 3** is empty when its route-3 test finds **0 differences**, and `tests/worker-parity.test.js` is green.

## 3. Which differences are acceptable — only predicted ones

**No category of difference is acceptable by kind.** A difference is acceptable only when it was **predicted in writing before the run**: scenario or scenario class, field, direction, and rough size. That is S5's discipline, and it is what turns each output-moving commit into a live exercise of the harness. **An unpredicted difference is a finding, not a result to accept.**

Things that are **not** differences, because they are not compared:

- Capture metadata: commit, source and input-graph digests, runtime, boundary. These identify which implementation ran, and the harness reports them beside the verdict.
- `identity.runId`, on route 3 only. It is seeded from the clock, and it is the only field that differs between two identical `runScenario()` calls, as `tests/worker-parity.test.js` measured.

**Tolerances.** There are none. A future cross-runtime comparison that needs one must specify it **per field and unit**, with a justification. Statuses, path counts and threshold decisions stay exact. A tolerance must never hide a decision flip, and the harness lists changes to `status`, `calculationError` and `failed` on their own.

## 4. The Worker boundary, named

- **Route 3 compares the Worker *source* the build generates**, run in a Node `vm` through the structured-clone algorithm a Worker boundary uses, at both send boundaries.
- **Real browser Web Worker execution is NOT covered.** It is out of scope by decision (7.4a). No S4 gate or cutover criterion may claim it: an empty diff here says nothing about how a browser schedules, loads or isolates a Worker.
- **jsdom has no `Worker`.** In route 2 the page runs its own engine inline, on its no-worker path, which is exactly the path being compared.

## 5. Coverage — numerator and denominator

Measured 2026-09-13, old versus old, on the tree of `a82307f` plus the routes test committed at `f661a6d`: two staged trees for route 1, a fresh build of the same tree for routes 2 and 3.

| | Control corpus | Expanded corpus |
|---|---|---|
| Scenarios, route 1 | 36 / 36 | 49 / 49 |
| Modes, route 1 | simple 17/17, historical 16/16, monteCarlo 3/3 | simple 28/28, historical 17/17, monteCarlo 4/4 |
| Leaves compared, route 1 | 30,859 / 30,859 | 39,766 / 39,766 |
| Distinct fields, route 1 | 49 | 49 |
| Status fields, route 1 | `status`, `calculationError`, `calculationErrorCode`, `failed`, `successRate`, `firstShortfallAge`, `sustainedFailureAge`, `failureAge`: 36/36 each; `calculationErrorPaths`, `requestedPathCount`, `validPathCount`: 3/3 (Monte Carlo only) | the same fields: 49/49; Monte Carlo fields 4/4 |
| Route 2 | 36 scenarios, 30,859 leaves, 0 differences | 49 scenarios, 39,766 leaves, 0 differences |
| Route 3 | 36 scenarios, 31,667 leaves (808 in `identity`), 0 differences | **not run** — route 3 covers the control corpus only |
| Routes | **3 of the 3 in S4's decided scope.** A fourth, real browser routes, is out of scope by decision | |

Monte Carlo is compared exactly as `runPlan()` returns it, percentile rows included: 3 control scenarios, 4 expanded. What those rows can and cannot establish is `MODEL_ASSUMPTIONS.md` section 6's matter (Q40), not this diff's.

## 6. Named exclusions and outstanding requirements

| What is not compared | Why | Owner |
|---|---|---|
| The exported `simulatePlan()` and the historical heat map's path | Every route drives `runPlan()`, or `runScenario()` on route 3. These two bypass `runPlan()`'s gates — the **ten CQ-6 residuals**, carried as todo witnesses | S5 block **2n** |
| A plan whose `toJSON` is stateful (**BC-02**) | `runPlan()` throws on it today; carried as a todo witness | S5 block **2m** |
| Unsupported JavaScript inputs (NaN, a Proxy, a function-valued field, a non-JSON-faithful plan) | **Rejection cases, not parity cases.** The capture refuses them before any engine runs (S4 task 3) | — |
| The tracked `investment-calculator-v2c.html` | Stale by design. Only the artifact pin reads it, as the `historical` lane; every browser-integration test boots a fresh build (7.4b). **Out of date as a claim of fact, 2026-09-16: the S5 audit round rebuilt and pinned the shipped file (`64f6b98`, sha256 `3f927702…b776`), so it is not stale right now — the design (this diff never compares it, and only the artifact pin reads it) still holds.** | S5b task **4.3** still rebuilds it, at the freeze |
| Real browser Worker execution | Out of scope by decision (7.4a) | — |

## 7. Running it

Reference: a pinned worktree of the commit being compared against. Candidate: the tree under test.

```
git -c core.longpaths=true worktree add --detach <reference-dir> <reference-commit>
npm run diff:engine -- --reference <reference-dir> --candidate . --composition control
npm run diff:engine -- --reference <reference-dir> --candidate . --composition expanded
node --test tests/build-routes.test.js tests/worker-parity.test.js
```

- **Per commit** (7.6): run it against the parent, with the corpus composition the change claims to touch.
- **Per mode:** the corpus covers all three modes. `compare --json` writes per-mode coverage, so a claim about one mode reads its own numerator and denominator.
- **Measured cutover:** add `--measured`, and give each side a clean, committed checkout.
- **Exit codes:** 0 `EMPTY`; 1 `DIFFERENT`, where each difference is named by scenario and field; 2 `REFUSED` or `UNKNOWN`.
