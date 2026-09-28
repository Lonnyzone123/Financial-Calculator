# S100 — task and subtask checklist

| Field | Value |
|---|---|
| Sprint | **S100** — the first sprint after the engine simulation rebuild |
| Track | **N** |
| Theme | **Spend the differential gate.** Everything deliberately deferred *because* it would have broken old-vs-new bit-identity, plus closing the rebuild's books. |
| Runs after | The CPU engine rebuild, cutover complete |
| Numbering | Deliberately discontinuous. S7–S99 are reserved for however many sprints the rebuild itself takes. |

## Why this sprint exists, and why it could not have happened earlier

The rebuild is verified by diffing the new engine against the old one. That gate only works while both engines compute the *same* answers, so every change that deliberately moves output had to wait behind it — not because the changes are risky, but because landing one would have destroyed the instrument measuring the rebuild.

Cutover spends the gate. These changes are unblocked the moment it happens, and they have been queued and specified for a long time.

**Ordered by increasing blast radius.** Each is its own gated commit with its own fixture prediction. They are not batched.

## Preconditions

- [ ] **Cutover is complete.** The new engine is the only engine on the ship path.
- [ ] The differential harness reported an empty diff (or every difference explained and accepted) across the full corpus, in all three modes.
- [ ] The old engine remains in the test tree as the oracle — it is not deleted.
- [ ] `npm test` exits 0.
- [ ] A fresh baseline is captured **from the new engine**. Everything below is measured against it, not against the S5 reference baseline.

## Dependency order

```
1 (retire old engine from ship) ──► 2 (version + package)
3 (real-device validation) ──────► 5 (WASM go/no-go)
4 (own-your-pow) ────────────────► 5
6 (cut the audit package) ─── last
```

Task 4 precedes task 5 because the WASM decision partly rests on cross-platform determinism, which task 4 establishes.

---

> **⚠ Note added 2026-09-19 (UTC−7) at `3ec8adf` by the S5AA task-list session [a90ab6]. Nothing in this checklist has changed.** An external scope draft reports two decisions attributed to the owner that would change this sprint if the owner confirms them: the old engine becomes a reference **archived after the replacement audit**, not kept "permanently" as the oracle (task 1 and the third precondition); and the hundred-level numbers become a **flexible backlog** replanned after that audit, not a fixed sequence (the "What follows S100" section). **Reported, not confirmed; not applied.**

## Task 1 — Retire the old engine from the ship path, keep it as the oracle

- [ ] 1.1 Remove the old engine from `build.js`'s bundle — it must not reach `investment-calculator-v2c.html`
- [ ] 1.2 Keep `src/engine.js` (or its archived equivalent) **in the test tree**, reachable by the differential harness, permanently
- [ ] 1.2a **State the mechanism, then prove it — 1.2 asserts a requirement and task 1.1 changes the thing it depends on, in the same task.** *(Added 2026-09-12.)*

  1.2 says the old engine stays *"reachable by the differential harness, permanently."* **It does not say how**, and 1.1 removes the engine from `build.js`'s bundle in the same breath. A requirement whose mechanism is unstated is a requirement nobody can check has survived.

  - [ ] Record **how** the harness reaches it. `tools/capture-baseline.js` currently `require()`s `src/engine.js` **directly**, not through the bundle, so un-bundling should be survivable — **but "should be" is precisely what 1.2 is asserting and nobody has confirmed**
  - [ ] **Run the harness after 1.1 lands, not before.** The order matters: confirming reachability against the pre-1.1 tree proves nothing about the post-1.1 one, which is this project's whole recurring lesson pointed at its own task ordering
  - [ ] Check the **dependency graph**, not just the entry point. `installDebtModules()` iterates `BUNDLED_MODULES` from `build.js` to install the globals the engine expects. If 1.1 touches that registry, the engine may still load and then fail on a missing global — **which surfaces as a wrong answer rather than a load error**
  - [ ] If the old engine is archived rather than left in place, **the harness's path to it is updated in the same commit** and the archived copy is verified to produce byte-identical output against the frozen baseline. An oracle that moved and was not re-checked is not an oracle
  - [ ] Add a test asserting the old engine loads and runs one corpus scenario. **It is permanent infrastructure now** — 1.4 reclassifies it as *deliberate oracle* rather than *unsupported* — and permanent infrastructure with no test is what the exclusion registry exists to prevent
- [ ] 1.3 Confirm the shipped artifact shrinks by the expected amount and contains no dead reference
- [ ] 1.4 Update the module-exclusion registry so the old engine's status is *deliberate oracle*, not *unsupported* — a different category from P19's `mortgage-vs-investing.js`
- [ ] 1.5 Record in the requirements register that the old engine's role has changed
- [ ] 1.6 **The oracle's diffing life ends at S101 — decided 2026-09-12, accepted rather than pinned.** *(The output side of its shelf life. The input side — `src/engine.js` feature-frozen from S5b task 4 — was already recorded.)*

  S101's own preamble states the boundary: *"two engines on different market data cannot produce one [empty diff]."* From CRSP adoption, the old engine can no longer certify the new one on `historical` mode.

  **The decision: accept the expiry. Do not pin the old engine to the pre-CRSP series.**

  **Why, and the reasoning matters more than the conclusion because the cost argument cuts the other way.** Pinning looks expensive — to diff, both sides need the same inputs, so the *new* engine would also have to reach a retired series. But S6 task 1's three-layer versioned-dataset machinery is built for exactly that, so pinning would cost far less than it first appears. **The decision therefore does not rest on cost.**

  It rests on three things:

  - **The oracle's job is bounded by design.** It exists to certify that the new engine reproduces the old one. That job completes at cutover. Everything after is deliberate change, verified by predict-and-reconcile — and S101's own method never invokes the oracle.
  - **The capability that matters post-cutover survives untouched.** The interesting question after S101 is *"did S102's monthly flip do what we predicted?"* — that is **new-at-commit-A versus new-at-commit-B**. S4 task 7's harness runs two implementations over one corpus; nothing requires one of them to be the old engine.
  - **Accepting is reversible; pinning is a standing obligation.** If a `historical`-mode defect surfaces later, the vintage machinery can reconstruct the comparison *then, deliberately, for a reason*. Pinning maintains a retired data path continuously against a need that may never arrive — and an unused path in this repository is what rots into a second definition nobody checks.

  - [ ] State in the module-exclusion registry entry (1.4) that the oracle's `historical`-mode diffing ends at S101, and that this was chosen rather than overlooked
  - [ ] **`simple` and `monteCarlo` are unaffected and stay diffable against the old engine indefinitely.** Say so, or the expiry reads as total
  - [ ] **Record the caveat this creates, because it is the real cost of the decision.** After S101, the strongest available evidence for `historical` is a *matched prediction*, not an empty diff. Those are not equivalent: an empty diff is a machine-checked assertion over the full corpus; a matched prediction is a human judgment that the movements are the expected ones. **Nobody should later cite a reconciled sprint as though a differential gate stood behind it**

**Gate:** the shipped bundle contains one engine; the differential harness still runs; `npm test` green.

**Do not delete the old engine.** It is the only independent implementation of this financial model that exists, and it is worth more as a permanent oracle than the repository space it occupies.

## Task 2 — Version and package the new engine honestly

The R2-T08 discipline, applied to the new engine.

- [ ] 2.1 Bump `ENGINE_VERSION` to a number that clearly signals a new implementation, not an increment
- [ ] 2.2 Regenerate `SHA256_MANIFEST.txt`
- [ ] 2.3 Confirm `tools/verify-test-gate.js` passes — it must fail rather than accept skipped DOM tests
- [ ] 2.4 Record honestly what is and is not audited in this version. **The new engine has had no external audit at this point** — say so plainly
- [ ] 2.5 Record which behaviors are *deliberately* divergent from the old engine, if any survived cutover as accepted differences

**Gate:** the packaged artifact hashes to the harness pin; the version identifies exactly this state; the "not yet audited" statement is present and unambiguous.

## Task 3 — Real-device validation of the rebuilt engine

**The rebuild's performance claims are projections until this task runs.** S4 task 10 measured the *old* engine on real hardware; this measures the new one.

- [ ] 3.1 Run the S4 task 10 benchmark harness against the new engine on the **primary Android device**
- [ ] 3.2 Run it on a **real iPhone** at or near the iPhone 15 Pro floor
- [ ] 3.3 Compare against the rebuild's targets: simulation time, aggregation time, retained memory at each tier
- [ ] 3.4 Confirm the **JIT-discard signature** is absent — a superlinear rise in per-path cost as path count grows. `ROADMAP_EXTERNAL_REVIEW.md` §6 predicts it under iOS memory pressure; the rebuild's smaller footprint should push it further away
- [ ] 3.5 Confirm worker scaling on both platforms — iOS caps `hardwareConcurrency` at 4 regardless of core count
- [ ] 3.6 **Set the real tier table.** It has carried a ⚠ PROVISIONAL tag since it was written; this is the task that removes it
- [ ] 3.7 Record any target the rebuild missed, and by how much

**Gate:** measured figures for both platforms recorded against targets; the tier table is derived from measurement rather than inference; §6's provisional tags are resolved or explicitly carried forward with reasons.

## Task 4 — Deterministic transcendentals (own-your-`pow`)

Deferred by S6 design decision 6.2. IEEE-754 mandates correct rounding for `+ − × ÷`, `sqrt` and FMA, but **not** for `pow`, `exp` or `log` — so JavaScriptCore on iOS and V8 on Android Chrome may return different last-bit results. For an iOS-and-Android product that means the engine is not bit-reproducible across its own two target platforms, and no amount of float64 fixes it.

- [ ] 4.1 Implement deterministic `pow`/`exp`/`log` behind the pluggable math interface the rebuild already carries
- [ ] 4.2 **Exploit the half-year convention:** every exponent in the model is a multiple of 0.5, and `pow(x, n + 0.5) = pow(x, n) × sqrt(x)` where the integer part is exponentiation by squaring. Multiplication and `sqrt` are both IEEE-mandated, so this path is exactly reproducible
- [ ] 4.3 Handle the residual case where an age or duration is *not* on the half-year grid — either constrain inputs to the grid or document the fallback and its determinism properties
- [ ] 4.4 Predict the fixture movement before regenerating. It should be last-bit only; **anything larger is a finding**
- [ ] 4.4a **"Last-bit only" is the right prediction for continuous values and the wrong one for classifications — split them.** *(Added 2026-09-12.)*

  Deterministic transcendentals change `normal()`, which calls `Math.log` and `Math.cos` — **neither IEEE-mandated** — so every Monte Carlo draw moves at the last bit, and 4.4's prediction is correct for balances, taxes and every continuous field.

  **Success rate is not continuous.** It is a threshold classification, so a path sitting within a last-bit of the failure boundary **flips**, and the reported rate moves by `1/pathCount` — **0.01 pp at 10,000 paths**, per flipped path. As written, 4.4 would read that as *"larger than last-bit, therefore a finding"* when it is the expected consequence of the change.

  - [ ] Predict the two separately: **continuous fields, last-bit**; **classifications, a bounded number of flips**
  - [ ] Bound it before regenerating — count how many corpus paths finish within a last-bit of the failure threshold, and predict flips at no more than that
  - [ ] A flip count **above** the bound is a genuine finding. A flip count **at or below** it is the change working
  - [ ] Applies to every discrete output, not only `successRate` — `failureAge`, `firstShortfallAge` and `sustainedFailureAge` are all threshold crossings on a continuous series
  - [ ] **If S6 task 6.15's snap-to-grid landed first, predict zero flips** and treat any flip as a finding. Quantising the classification input is precisely what makes this category disappear rather than merely shrink — record which of the two orders actually happened
- [ ] 4.4b **Four claims this plan carries as assumptions are cheap to measure against the old engine, and one of them is already doubtful. Measure them before the freeze at S5b task 4.** *(Added 2026-09-12.)*

  **The window argument, stated accurately rather than as received.** It is *not* true that all four need the engine unfrozen — three need only a **test harness wrapping** the engine, and can be done any time:

  | Claim | Where it sits | Needs an engine edit? |
  |---|---|---|
  | RNG stream equivalence and the Box–Muller **draw count per row** | S6 6.12 | **No** — wrap `rng()` and count calls |
  | The `quantile()` interpolation convention | S6 6.13 | **No** — already read at `cd39880`; see 6.13 |
  | *"Every exponent in the model is a multiple of 0.5"* | **this task** | **No** — wrap `Math.pow` and log exponents |
  | Seven proposed **phase boundaries** hold with no forward references | S6 3 | **Yes** — see S6 task 3 |

  **So only the phase-boundary instrumentation is genuinely window-limited.** The other three are unmeasured because nobody measured them, not because the window is closing. That distinction matters: a real deadline gets priority, a self-imposed one gets discipline.

  **This task's own claim is the doubtful one.** S100 task 4 rests on *"every exponent in the model is a multiple of 0.5"*, which is what makes `pow(x, n+0.5) = pow(x,n) × sqrt(x)` exact using only IEEE-mandated operations. **Inspection at `cd39880` could not establish it.** The call sites include `Math.pow(1+g, duration)` and `Math.pow(1+g, yearProgress)` where `yearProgress = age - start` — **computed values, not literals** — and `withdrawalTiming: "quarterly"` introduces a `× 0.625` factor into the timing arithmetic.

  **Unverified, not disproven.** It may hold in practice if every `duration` and `yearProgress` lands on a half-year grid. But it cannot be settled by reading the call sites, and the whole determinism argument rests on it.

  - [ ] Wrap `Math.pow` across the full corpus in all three modes and **log every exponent**. The claim holds iff every logged value is an exact multiple of 0.5
  - [ ] **If it fails, S100 task 4's approach changes, not just its estimate.** Exponentiation by squaring plus `sqrt` is exact; a general `pow` is not, and the alternative is a correctly-rounded implementation or accepting that cross-platform bit-identity is unreachable for those sites. **That is a different task, and learning it here is much cheaper than learning it mid-sprint**
  - [ ] Record the result either way with its commit, per §N. A measured *"holds across the corpus at `<commit>`"* is worth far more than the assertion it replaces
- [ ] 4.5 **Assert cross-platform identity**: the same scenario produces byte-identical results on iOS Safari and Android Chrome. This is the first time that has ever been true
- [ ] 4.6 Retire `Math.pow`/`Math.exp`/`Math.log` from the engine entirely so the property cannot silently regress
- [ ] 4.7 **`MODEL_ASSUMPTIONS.md` — S100 was the only post-cutover sprint with no entry for it, and it is the one making a user-visible numerical promise.** *(Added 2026-09-12.)*

  S101, S102 and S103 all carry a `MODEL_ASSUMPTIONS.md` task. This sprint carried none, while making the engine **bit-reproducible across iOS and Android for the first time** — a property a user can observe (the same plan on a phone and on a partner's phone now agrees exactly) and one they would otherwise have no reason to expect.

  - [ ] Record the cross-platform determinism guarantee, and its **limit**: it holds for the operations the engine controls, and the half-year convention (`pow(x, n+0.5) = pow(x,n) × sqrt(x)`) is why it is achievable at all
  - [ ] **If S6 task 6.15's snap-to-grid lands in this sprint**, every grid adopted goes here too. *"MAGI is rounded to whole dollars before the IRMAA tier lookup, because that is how the IRS assesses it"* is the canonical entry that file exists for — and S5's close-out already reserved the slot for it
  - [ ] Record task 4.4a's classification-flip result if any success rates moved. **A user whose plan went from 71% to 71.01% deserves the sentence explaining why**, and "we made the arithmetic reproducible" is a better answer than silence

**Gate:** identical results across both platforms for the full golden set; fixture movement is last-bit and predicted; no `Math.pow` remains in engine code.

## Task 5 — WASM go/no-go — **USER DECISION**

- [ ] 5.1 Assemble the inputs: task 3's real-device measurements, task 4's determinism result, and the rebuild's actual achieved speed against its estimate
- [ ] 5.2 Answer the question the whole rebuild was structured to make answerable: **is the JS engine fast enough on a real phone?** If it is, WASM is optional
- [ ] 5.3 Weigh the two WASM-specific wins that are not about raw speed: no deoptimization (immune to WebKit discarding JIT-compiled code at the 65% pressure rung) and control over transcendentals (now partly obtained by task 4 anyway)
- [ ] 5.4 Weigh the cost: new toolchain, harder debugging, `src/ported/*` needing porting again, and **linear memory that grows but never shrinks** — a permanently elevated resident footprint on a device whose OS kills by resident size
- [ ] 5.5 Confirm the rebuild actually held to the WASM-compatible subset (S6 decision 6.4), so a port would be a translation rather than a rewrite. **If it did not, that is a finding about the rebuild, and it should be recorded whichever way the decision goes**
- [ ] 5.6 **Stop and get the user's decision.** Record it with its reasoning either way
- [ ] 5.7 **Before asking, confirm the "yes" branch has somewhere to land — it did not until 2026-09-12, and a decision whose affirmative outcome leads nowhere answers itself.**

  `WASM` appeared **zero times** in S101, S102 and S103, and this sprint's "What follows S100" table listed only CRSP, the monthly timestep and feature wiring. So *"yes, build it"* had no sprint, no sequence position and no owner, while *"not now"* required nothing.

  **That is the plan making the decision rather than the user.** It is the same shape as the S103 deferral gap — work that carries a destination nothing reconciles against — pointed at a decision branch instead of a deferral.

  - [ ] The table below now carries a conditional **S104** row. Confirm it is still there, and that it names what a port would actually involve, before the question is put
  - [ ] Put both branches to the user **with their costs attached**: "not now" is free and reversible; "yes" is a toolchain, a re-port of `src/ported/*`, harder debugging, and linear memory that grows but never shrinks on a device whose OS kills by resident size
  - [ ] Record **which branch the plan was shaped to expect**, so a future reader can tell a considered "not now" from a default one

**Gate:** a recorded decision with its evidence. "Not now" is a valid outcome and should be recorded as deliberately as "yes."

## Task 6 — Cut the external audit package for the new engine

**Last. The new engine has never been externally audited, and it is now the only engine that ships.**

- [ ] 6.1 Assemble the package on the established pattern — runnable source, tests, baselines, manifest, hashes
- [ ] 6.2 Write the focus section. It must name: **the whole rebuild** as new code, task 4's numerical change, and anything task 3 revealed
- [ ] 6.3 Include the differential harness result as evidence — old-vs-new across the full corpus is the strongest evidence this project has ever been able to offer an auditor
- [ ] 6.4 Include the requirements register with its `UNGUARDED` count, so the auditor can see what is *known* to be unguarded rather than discovering it
- [ ] 6.5 Confirm `tools/build-package.ps1` still forces the line-ending export policy
- [ ] 6.6 **Ask the user: whole-model or new-code-only.** For this package the answer is almost certainly whole-model — the entire engine is new code — but ask rather than presume

**Gate:** package builds, hashes, and reproduces from a clean extract on a machine that is not this one.

---

## What follows S100

Queued deliberately, not forgotten. Each is its own audited change and each moves financial output:

| Next | Change | Why it waits |
|---|---|---|
| **S101** | **CRSP index adoption** — `MARKET_DATA_FF_MONTHLY_PACKAGE_2026.md`, already prepared and hash-pinned | Moves outcomes: median 1.85 pp annually, up to 7.24 pp, and four years that disagree on the *direction* of the market. Needs its own fixture re-baselining and its own audit |
| **S102** | **Monthly timestep flip** | The rebuild ships timestep-parametric at annual. Flipping needs monthly historical data — the CRSP package supplies returns, the CPI-U package supplies inflation, and both are already in `Resource Documents/` |
| **S104** *(conditional)* | **WASM/SIMD port** — only if task 5 returns "go". Added 2026-09-12 because the affirmative branch previously had no destination, which is how a USER DECISION answers itself | Needs task 3's real-device figures, task 4's determinism result, and confirmation that the rebuild actually held to the WASM-compatible subset (S6 decision 6.4). If it did not, a port is a rewrite and that is a finding about the rebuild rather than an argument about WASM || **S103+** | **Mortality simulation** (`MARKET` P1) — age-specific conditional death probabilities replacing the deterministic `endAge` cutoff | **Nothing is modelled today** — `mortality`, `lifeExpectancy` and `survivalProb` have zero occurrences in `src/engine.js`, and the horizon is a fixed `profile.endAge`. So it is a feature build, not a correction, and it moves every terminal-wealth and success-rate figure. Added to this table 2026-09-11: it was in no sprint and no queue |
| **S103+** | **Valuation-conditioned scenarios** (`MARKET` P2) — with the spec's own constraint that all predictors be observable at the simulated decision date and cannot leak future data | Lowest priority in `MARKET`'s sequence; recorded here so it is queued rather than forgotten. The look-ahead-leak constraint is the part that must survive into whoever builds it |
| **S103+** | **Feature wiring** — the Social Security stack, reserve manager, optimizer and grader; the debt-module UI surface; F3's mortgage-vs-investing matrix; Track G dependency-aware recalc | All were deliberately *not* wired into the old engine, because wiring a feature into an engine about to be replaced is work done twice |

**The deferred-change queue is the point.** Three sprints' worth of changes were held behind the differential gate rather than being lost. Anything added to that queue between now and cutover belongs in this table.

## Ground rules

Carried unchanged:

1. Every task states its own gate.
2. Per-task durations are floors, not targets.
3. No task may weaken an existing test to pass.
4. Re-locate by symbol, not by line.
5. Commit per task; task 4 predicts its fixture movement before regenerating.
6. Record findings rather than fix them where a fix requires a policy judgment.
7. **One output-moving change per commit, never batched.** Task 4 is the only output-moving change in this sprint; S101 and S102 each carry exactly one more.

## Exit gate — what must be **true**, not merely **reported**

**Added 2026-09-12, set by the owner.** S100 was the **last of the eight sprints with no closure verdict**. Its close-out carries eight items and **every one of them RECORDS; none DECIDES** — including item 4, *"the WASM decision and its reasoning"*, which reports a decision rather than requiring one. That is the S4 pattern in the sprint that ends the rebuild.

**Common clauses, applying to every line below.** Each item **names its evidence and the commit it was true at** (S4 §N's stamping convention). `npm test` exit 0 is **recorded, not assumed**. **A no-go must name what is missing and what it blocks** — a verdict that can only say yes is 6.8's vacuous pass in another costume. The verdict is the user's, on a stated recommendation. **A line that cannot be made true is not a reason to soften it:** record it, say what it blocks, hand it forward. An exit gate relaxed to let a sprint close converts a known gap into an unknown one.

### This sprint is closed when every line below is true

- [ ] **E1. The new engine is the only engine on the ship path, verified FROM THE BUILT ARTIFACT** rather than from the module graph. A module graph says what is imported; the artifact says what ships, and those answer different questions
- [ ] **E2. The old engine is still reachable by the differential harness, DEMONSTRATED BY RUNNING IT AFTER THE REMOVAL LANDS** — dependency graph, not entry point. **This is the line to defend hardest.** If the oracle quietly stops being reachable, **every empty diff claimed after S100 is meaningless and nothing says so** — and because `installDebtModules()` iterates `BUNDLED_MODULES`, the failure mode is a **wrong answer rather than a load error**. An empty diff and an unrunnable comparison are indistinguishable from outside, which is why only a demonstration closes it. This is task 1.2a promoted to a gate
- [ ] **E3. The successor baseline is captured FROM THE NEW ENGINE, with its hash and commit, and the corpus denominator restated.** **This makes S100 the second S5b:** S101, S102 and S103 all measure against this baseline, so it inherits S5b's property that **a soft close here cannot be repaired later**
- [ ] **E4. The WASM go/no-go is DECIDED and its branch recorded — not deferred.** This exists because of **this sprint's own task 5.7**: the affirmative branch has no sprint, no owner and no sequence position, so **"yes, build it" is currently the plan's default BY SILENCE.** A verdict permitting S100 to close with that open recreates the exact defect 5.7 was written to catch
- [ ] **E5. Cross-platform bit-identity achieved or not, with evidence — and if not, what it costs.** "Not achieved" is an acceptable answer; "not measured" is not
- [ ] **E6. The deferred-change queue is RECONCILED — what this sprint actually spent, not what is queued.** A queue that only ever grows was never a queue
- [ ] **E7. `npm test` exit 0 recorded with its commit, and the todo set NAMED rather than counted.** Per S4 task 2b.2c: an unchanging number is not a checked number, and "8 todo" held for ten rounds while three dispositions had no witness

**Verdict: go/no-go on S101 starting.** A no-go names what is missing and what it blocks.

## Close-out

- [ ] 1. Real-device figures for both platforms, against targets
- [ ] 2. The resolved tier table, with the PROVISIONAL tag removed
- [ ] 3. Cross-platform bit-identity: achieved or not, with evidence
- [ ] 4. The WASM decision and its reasoning
- [ ] 5. Whether the rebuild held to the WASM-compatible subset
- [ ] 5c. **`MODEL_ASSUMPTIONS.md` (4.7)** — the cross-platform determinism guarantee and its limit, any snap-to-grid grids adopted, and any success-rate movement from 4.4a. This sprint was the only post-cutover one with no entry for that file, while making the most user-visible numerical promise in the plan
- [ ] 5d. **The WASM decision's branch, and whether the plan was shaped to expect it** (5.7) — a considered "not now" and a default one should be distinguishable a year from now
- [ ] 6. `FEATURES.md`, `ENGINEERING_LOG.md`, `ROADMAP_EXTERNAL_REVIEW.md` and the roadmap artifact all updated — this is a large sprint *and* a cutover, so every update trigger fires
- [ ] 7. The S101+ deferred-change queue, current
- [ ] 8. **Ask the user: whole-model or new-code-only for the S100 handover.**
