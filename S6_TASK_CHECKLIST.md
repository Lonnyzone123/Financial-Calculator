# S6 — task and subtask checklist

| Field | Value |
|---|---|
| Sprint | **S6** |
| Track | **N** — continues from S5 |
| Theme | **Design the rebuild.** The decisions, schemas and data machinery that must be settled before a single line of the new engine is written. |
| Runs after | S5 (correct the reference engine) → S5b (close the books) |
| Runs before | The CPU engine rebuild |
| Questions | **Derive at sprint start.** See `S4_TASK_CHECKLIST.md` §C2 — canonical, not restated here. |
| Handover | Ask at close-out. Do not presume. |

---

## ⚠ Re-scoped 2026-09-11. Three tasks left this sprint; nothing was cut. Move table: `S4_TASK_CHECKLIST.md` §R2 — **one definition.**

**What left, and why:** the differential harness and the two read-only registers moved to **S4**. All three were instruments or inventories, and all three were scheduled at the very end of the last preparatory sprint. Their outputs are things you *act on* — a corpus-coverage number, an `UNGUARDED` list, a list of behaviours needing independent test guards — and there was no sprint left in which to act on them. The device-benchmark harness had already moved S6 → S5 and has now moved again to S4, because the iPhone measurement is the one deliverable whose date is set by someone other than us.

**What is left is what S6 was always actually for: the design.** Six tasks, three of them **USER DECISION**, and the sprint is now small enough that they get the attention they need.

## Why this sprint is different from every sprint before it

**S6 produces documents and decisions, not engine code.** Its gates are therefore different in kind: for a design task the gate is *"the artifact exists, is reviewed, and the user has agreed to it"* — not *"a test passes."* Several tasks are explicitly **product decisions the sprint may not take unattended.** Those are marked **USER DECISION** and must stop and ask.

**The one thing S6 must not do is start writing the new engine.** A rebuild that begins before its phase decomposition and field registry are settled will encode whatever shape the first author happened to have in mind — which is the failure this sprint exists to prevent.

## Preconditions

- [ ] **S5 and S5b are both closed**, including their handovers.
- [ ] The **definitive reference baseline** from S5b task 4 is captured, hashed, and unambiguous. Everything in this sprint measures against it. **It is only valid if S4 task 3's corpus invariant passed first** — a baseline captured with a harness that can certify a reduced corpus is not a baseline.
- [ ] The repository is normalised (S4 task 1) and a fresh clone on a second machine builds and tests green. *(**S4 close-out 11, recorded as a limitation 2026-09-13 (the owner):** S4 had one machine, so the second-machine check has not run anywhere yet. It is carried here.)*
- [ ] **S4 task 7's differential harness** is green and its corpus coverage is stated as a number (re-stated at S5b task 3.6).
- [ ] **S4 task 8's requirements register and task 9's classification were re-harvested at S5b task 3.** Both describe the engine as it is now, not as it was three sprints ago.
- [ ] `npm test` exits 0.

> **⚠ Notes added 2026-09-19 (UTC−7) at `3ec8adf` by the S5AA task-list session [a90ab6]. Nothing above is rewritten, and nothing in this checklist has changed.**
> - **S5AA now runs between S5 and S5b** (the owner's answer of 2026-09-17, recorded in the S5AA draft), so the first precondition above also waits for S5AA to close.
> - **Two external planning documents are inputs to task 7, not decisions.** A scope and rebuild-plan draft (revision 10) and an S6 prerequisite review (revision 2) sit untracked in `Handover temp/`. Both were written without the source, the tests or these checklists.
> - **Reported by, not verified:** the draft lists 28 decisions "supplied by the owner". None is confirmed in a repo record, so none is applied here. If the owner confirms them, they would conflict with this checklist and the decision register in task 6 on: float32 for retained outputs (the draft excludes it); the old engine kept as a permanent oracle (the draft archives it after the replacement audit); the single-cutover, no-gradual-rollout wording (the draft has incremental construction and a brief overlap of both complete apps, still with no production dispatcher); the timestep as a constant (the draft wants an explicit calendar and event model); global snap-to-grid (the draft says it is not a general rule); GPU (outside current scope); and the device measurements in task 2 (the draft runs a phone campaign after S6 closes).
> - **The review proposes, and nobody has adopted,** seven S6 closeout gates, an exit rule for starting the replacement, and a list of architecture decisions to make concrete by S6. Whoever writes task 7 should read both documents first.

## Dependency order

```
1 (data package machinery + 1b tax-rules versioning) ── independent, start any time
2 (consume device measurements) ── needs S4 task 10's Android result
                                            │
3 (phase decomposition) ──► 4 (field + entity registry) ──► 5 (retained field set)
   USER DECISION               USER DECISION                   USER DECISION
   consumes S5 task 6's                                         consumes 2's budget
   affine record and                                                  │
   S4 task 6's ledger                                                 ▼
                                                            6 (design decisions register)
                                                               accumulates throughout
                                                                    │
                                                                    ▼
                                                            7 (write the rebuild checklist)
                                                               LAST. Needs 3, 4 and 5 agreed.
                                                               No rebuild commit before it
```

**Tasks 1 and 2 are independent** and can run in any order alongside the design chain.

**Task 3 gates 4, which gates 5.** That chain is the spine of the rebuild and each link is a stop-and-ask.

**Task 6 accumulates from day one** — every decision taken anywhere in this sprint lands in it as it is taken, not reconstructed at close-out. A decision recorded three weeks later is a decision whose reasoning has been lost, and a decision without its reasoning gets relitigated.

**Nothing here is blocked on external parties except task 2**, and task 2's stop condition is explicitly *record the gap*, not *wait*.

---

## Task 1 — Versioned data package machinery + CPI-U adoption (MARKET P0 #1)

The infrastructure the new engine consumes. `MARKET §1` executive decision 1 and delivery-sequence P0.

- [ ] 1.1 Build the three-layer structure from `MARKET §2`: **raw** (immutable, hashed), **normalized** (parsed, with units and provenance), **engine** (fields whose financial meaning matches the simulation)
- [ ] 1.2 Every simulation result must identify **dataset version, source vintage, transform version, and random seed**
- [ ] 1.3 Implement the required per-series metadata table from `MARKET §2`
- [ ] 1.4 **Adopt `MARKET_DATA_CPI_U_MONTHLY_PACKAGE_2026.md`** as the first package through the machinery
- [ ] 1.5 Assert the adoption is a **provable no-op**: December-to-December values reproduce `HIST_INFLATION` to within 10 bp on all 98 overlapping years, and **no fixture moves**
- [ ] 1.6 Record the annual convention explicitly — the engine is a **December-to-December** series (98 of 98 years within 10 bp; annual-average matches only 13 of 97). An unnamed convention is a defect, not a default
- [ ] 1.7 Wire the package's §8 validation invariants as ingestion assertions
- [ ] 1.8 Licensing check — `MARKET §1` decision 10 makes it a release gate

### 1b. Extend the same versioning to **tax rules** — the gap that created the tax-conformance sprint

`RULES.federal.ordinaryBrackets`, the standard deduction, the LTCG bands, the IRMAA thresholds, the RMD tables and the Arizona figures are **one flat literal with no year attached and no provenance.** Nothing in the repository can answer "which tax year is this projection using?" or "where did this number come from?" — which is precisely the condition that made the tax-conformance sprint necessary, and which will recreate it every year forever unless it changes.

- [ ] 1b.1 Apply the same three-layer structure: raw (the published source), normalized (parsed with citations), engine (the values the code reads)
- [ ] 1b.2 Every rule value carries a **tax year**, a **source citation**, and the **typed authority status** S5 task 4 introduced. **Corrected 2026-09-14, the owner's answer to Proposal 21 (SPRINT_QUESTIONS.md Q79 (a)):** the four values previously listed here (`ENACTED` / `INFERRED` / `PROPOSED_REGULATION` / `FORM_PENDING`) predated S5 task 4's own choice and were wrong — the chosen set is seven values, TAX §1.2's six plus `PROPOSED_REGULATION`: `ENACTED`, `OFFICIAL_2026`, `INFERRED`, `FORM_PENDING`, `MODEL_ASSUMPTION`, `UNSUPPORTED`, `PROPOSED_REGULATION`. S5 builds that field for Arizona and the 1959 RMD cohort; this generalises it to every rule
- [ ] 1b.3 Every simulation result identifies its **rules vintage**, alongside the dataset version and seed from 1.2
- [ ] 1b.4 A projection that spans 2026–2065 uses 2026 rules for all of it. **That is an assumption, not a fact** — surface it as one rather than leaving it implicit
- [ ] 1b.5 Wire the S5 spec vectors as the ingestion assertions for the 2026 vintage — they already exist and they already encode the right answers *(Note added 2026-09-16, on a report from `investment-calculator-4c`/S5 Kickoff: `tests/rules-record-shape.test.js` (S5 task 12, `dd75d79`) is the list this task inherits for the record shape itself — the never-overwrite-a-year rule and the RMD-start-age records it holds are the pattern 1b generalises to every rule, not just a spec-vector source.)*
- [ ] 1b.6 Confirm the next tax year becomes a **data change with a diff**, not another sprint of its own

**Gate:** the engine reports which tax year it computed with; adding a hypothetical 2027 vintage requires no engine edit.

**Gate:** MARKET P0 exit condition — "Return definitions, CPI convention, provenance, hashes, tests, and legal status are complete." Plus: adopting CPI-U moves **zero** fixtures. A moved fixture means the transform is wrong.

**Explicitly NOT in this task:** the CRSP market-return package. It is adopted **after** the rebuild cutover, as its own audited change — it moves outcomes (median 1.85 pp annually, up to 7.24 pp, four years disagreeing on direction) and would break the rebuild's differential gate if the two engines used different market data.

## Task 2 — Consume the device measurements — **harness built in S4 task 10**

**Moved S6 → S5 on 2026-09-10, then S5 → S4 on 2026-09-11.** The harness is built as early as the plan allows, for two reasons: task 5's memory budget depends on its output, and the iPhone measurement is an external dependency whose timing nobody here controls. Leaving it in S6 would have made the retained-field decision wait on borrowing a phone.

`ROADMAP_EXTERNAL_REVIEW.md` §6's claims — the ~450–500MB budget, the 50%/65%/100% pressure rungs, the tier table — are inferences from WebKit documentation, not data, and every memory decision in the rebuild rests on them. What remains here is *using* what S5 measured. *(Corrected 2026-09-12: what **S4** measures — the harness moved S5 → S4 on 2026-09-11, per the line above, and S4 task 10 has not yet run.)*

- [ ] 2.1 Confirm S4 task 10 produced an Android result *(**As of 2026-09-13:** the page to run is the one built from `c4d2a93` with `--max-lag-ms 5000` (the owner's phone limit), page SHA-256 `d90c5f6494649f9531de64be42c4ca026680f60d1494735b4e5be81818c6a062`. A page built before `e637f1b` must not be used: its responsiveness timer could not see a stall (S4-IR-04). The run is the owner's.)* *(**2026-09-13, UTC−7:** nor a page built before `45abae2`, which includes that `c4d2a93` page. A stall that ended in an exception did not stop it (S4-IR-04-R1). Generate the rebuilt engine's page from the repaired harness.)* *(**The owner decided later on 2026-09-13 not to run it on the current engine: the rebuilt engine will be measured on Android.** So 2.1 will find no Android result for this engine. Record Android as unmeasured beside the iPhone (2.2), and carry the measurement to the rebuilt engine (7.3b).)*
- [ ] 2.2 Confirm whether the **iPhone** measurement happened. If not, **record it as an explicit unmeasured risk against tasks 4b, 5 and the tier table** — never let a budget set from inference appear to be set from data *(**Decided 2026-09-13 (the owner): record the iPhone as unmeasured.** Task 5 carries the iPhone memory figures as an unmeasured risk.)*
- [ ] 2.3 Feed the measured budget into task 5's arithmetic
- [ ] 2.4 Mark each §6 figure **confirmed**, **revised**, or **still unmeasured**

**Gate:** task 5's memory budget cites either a measurement or an explicitly-labelled inference.

<details>
<summary>Original harness specification — moved to S4 task 10, not yet built (corrected 2026-09-12: this read “now implemented in S4 task 10”)</summary>

- [ ] 2.1 Build a self-contained benchmark page: runs the `bench-simulation` measurements in-browser and displays a copyable JSON result
- [ ] 2.2 Report per device: `hardwareConcurrency`, WebGPU availability and adapter info, retained heap at each path count, wall time split simulation/aggregation, per-path cost curve (the deoptimization signal)
- [ ] 2.3 Detect and report the **JIT-discard signature** — a superlinear rise in per-path cost, which §6 predicts on iOS under memory pressure and which does not reproduce on desktop V8
- [ ] 2.4 Host it somewhere a phone can reach
- [ ] 2.5 **Measure Android first** — it is the primary device and `chrome://inspect` over USB from Windows gives full DevTools today
- [ ] 2.6 **Measure a real iPhone.** No emulator answers these questions: memory limits and `hardwareConcurrency` reflect the host, not the phone, and there is no iOS simulation on Windows at all. Either borrow a device, use `ios-webkit-debug-proxy` with one over USB, or send the link to someone who has one
- [ ] 2.7 Record results against §6's provisional figures and mark each as **confirmed**, **revised**, or **still unmeasured**

Original gate: §6 no longer carries a PROVISIONAL tag on any figure the rebuild depends on, or the remaining ones are explicitly listed as unmeasured risks.

</details>

## Task 3 — Phase decomposition — **USER DECISION**

**The spine of the rebuild. Nothing downstream can be settled without it.**

The current engine is path-major narrative: for each path, walk 72 rows; within each row, run every step in order. The rebuild is row-synchronous and phase-split: for each row, for each phase, process all paths.

- [ ] 3.0 **Demonstrate the boundaries before asking anyone to agree them — this converts the sprint's biggest stop-and-agree into a measurement.** *(Added 2026-09-12, from a proposal by the tracker-publishing session.)*

  **3.1 proposes seven phases. Nothing demonstrates that they are boundaries.** Asking for agreement on a decomposition that has never been tested against the code is asking for a judgement nobody is in a position to make — and it is the same defect as **S100 task 5.7**, where a USER DECISION's affirmative branch had no destination and the plan's shape was quietly answering the question.

  **The measurement is cheap and the failure signal is unambiguous.** Instrument the old engine to dump row state at each proposed boundary, for one scenario. **A forward reference across a boundary means the boundary is wrong** — phase *k* reading state that phase *k+1* has not written yet is a decomposition error, and it shows up as a read of an undefined or stale field rather than as a wrong number.

  - [ ] 3.0a Instrument at the **seven proposed boundaries**, not at a convenient subset — a boundary that is never tested is a boundary that is assumed
  - [ ] 3.0b **This is the one measurement in this family that genuinely needs the engine unfrozen** (see S100 task 4.4b): it requires inserting dump points, which is an engine edit. **Do it before S5b task 4**, or do it on a branch that never merges
  - [ ] 3.0c Run it across **all three modes**. `simple` may satisfy a decomposition that `monteCarlo` violates, and the withdrawal cascade's `while (need > 0)` — already flagged at 3.4 as the known non-vectorizable site — is where a forward reference is most likely
  - [ ] 3.0d **A boundary that fails is a finding about the proposal, not about the engine.** Move it and re-run. The output of this subtask is a phase list that has survived a test, which is what 3.10 should be putting to the user instead of a candidate
  - [ ] 3.0e **Check the source, not the tracker.** The proposal this subtask came from was derived from the tracker's documentation of the architecture rather than from reading `src/engine.js`, and says so on its own page. The seven-phase list is therefore **a description of a description** until someone checks it — the exact shape recorded in [[cite-a-commit-not-the-tree]], and the reason this subtask exists rather than a straight adoption of the proposal
  - [ ] 3.0f **3.0e was done, and the candidate list in 3.1 is CONTRADICTED BY THE SOURCE IN THREE PLACES.** *(Added 2026-09-12 on the owner's instruction. Found by the tracker-publishing session reading `src/engine.js`; every line below re-verified here against the file at HEAD before it was written down.)*

    **Read 3.1's candidate shape as a claim, then read the engine. The three failures are three DIFFERENT KINDS, and that is the part that matters:**

    | # | the claim | what the source does | failure mode |
    |---|---|---|---|
    | 1 | `grow` is one phase | **two calls per period**, `growAccounts(accounts,rates,preGrowth)` and `growAccounts(accounts,rates,Math.max(0,duration-preGrowth))`, straddling income, spending, withdrawal and tax | **MISSING STAGE** — fixable by adding |
    | 2 | `grow` → `contribute` | `auditContributions` runs first, `portfolioBeforeGrowth` is captured next, growth follows | **WRONG ORDER** — fixable by swapping |
    | 3 | `withdraw` then `settle_tax` | one settlement: quote → commit → re-estimate → reconcile | **FALSE BOUNDARY** — fixable only by REMOVING a split |

    - [ ] **Only the third survives a reorder.** A reviewer who "corrects" 3.1 by resequencing it fixes claims 1 and 2 and **entrenches claim 3**, because a false boundary looks like a correctly-ordered pair. Classify each failure before fixing any of them
    - [ ] **Claim 3 is a FIXED POINT, not an interleave, and the engine says so itself.** `quoteTaxFunding()` decides what to sell; `withdrawFromClass()` commits it; `estimateTaxes()` **re-estimates with the realised withdrawals folded in**; the result is reconciled against the quote. The tax computation depends on the withdrawals **and** the withdrawals depend on the tax quote.

      **The decisive evidence is an error code:** `TAX_COMMIT_SHORTFALL`, raised when `Math.abs(w.amount - byClass[cls]) > .01`. **You only need a name for "the quote and the commit disagreed" if they are two halves of ONE settlement that can fail to agree.** Two sequential phases cannot diverge — the second consumes the first's output. The engine names the failure mode of its own protocol
    - [ ] **This is 3.3's test failing in the direction 3.3 anticipated**: *phase k reading state that phase k+1 has not written yet is a decomposition failure*. Interleaved stages can sometimes be re-ordered into a sequence. **A fixed point cannot be split at all** — any boundary drawn through it puts a phase edge inside a loop
    - [ ] **STATUS, stated precisely because a corrected list is not a settled one.** This is **static reading of one file at HEAD**. It establishes that three specific claims are false. It does **not** establish the right number of stages, that any replacement grouping is better, or that no other boundary fails. **3.0's instrumentation across all three modes remains the thing that settles it — this is an argument for running 3.0, not for skipping it.** **It has since been run ONCE — see 3.0h, which adds a FOURTH contradiction (`withdraw` is split as well) and is labelled STARTED, NOT DISCHARGED**
    - [ ] **The lesson that came with the finding, recorded because it is the more transferable half.** The first corrected list produced in response to this — an eight-stage sketch — **split `withdraw` from `settle-tax` again**, reproducing the exact defect it had just reported, and its author caught and disclosed it. **A corrected list written by the person who just found the defect is not immune to the defect.** Whatever replaces 3.1 gets checked against the source the same way, by someone who did not write it

  - [ ] 3.0g **Decide the decomposition with S102's TARGET shape in view, not today's — the hardest boundary is one a later sprint deletes.** *(Added 2026-09-12 on the owner's instruction.)*

    The split point between the two growth calls is `preGrowth`, and it is keyed entirely on `withdrawalTiming`: `annual` → `duration`, `quarterly` → `duration * .625`, otherwise `duration * .5`. **`S102` task 3 is titled *"Delete the `withdrawalTiming` fudge"***, and its 3.2 requires deciding whether the field becomes a real within-year schedule or a retired field.

    - [ ] **So the least defensible seam in the phase list is scheduled for removal by a sprint that is already written.** Deciding the decomposition against today's engine encodes a boundary the plan intends to erase, and the rebuild then carries a split whose only justification has been deleted
    - [ ] **Record which boundaries are ARTEFACTS OF THE CURRENT ENGINE and which are structural.** A structural boundary survives S102; an artefact boundary must be marked as provisional at decision time, or nobody will remember it was one
    - [ ] **This does not block task 3** — S102's outcome is not needed to run 3.0. It changes what the decision must be recorded ALONGSIDE: a phase list with no note about which seams are temporary is a list that will be defended after its reason is gone

  - [ ] 3.0h **3.0 HAS BEEN RUN ONCE. First empirical phase trace this project has had — and it is STARTED, NOT DISCHARGED.** *(Added 2026-09-12 on the owner's instruction. Run by the tracker-publishing session; line positions re-verified here against `src/engine.js` at HEAD rather than against the instrumented copy.)*

    **Method, and the constraint first.** `src/engine.js` was **not touched** — it has been byte-identical across 22 consecutive package commits with an external audit in flight, so the probe writes an **instrumented copy to scratch**, asserts the tracked file is unchanged afterwards and prints it, asserts exactly one match per anchor insertion, and refuses if instrumentation did not change the copy. Rules and `BUNDLED_MODULES` bootstrapped exactly as `tools/capture-baseline.js` does, so the graph traced is the one the harness certifies against.

    **Observed: 71 periods, all three modes, TWO sequences.**

    | accumulation (26 periods) | drawdown (45 periods) |
    |---|---|
    | `growAccounts` @1310 | `growAccounts` @1310 |
    | — | **`withdrawFromClass` @1380** — spending / RMD |
    | `estimateTaxes` @1381 ×2 | `estimateTaxes` @1381 ×2 |
    | `quoteTaxFunding` @1401 | `quoteTaxFunding` @1401 |
    | ↳ `estimateTaxes` @403 — inside `verifyQuoteObligation` | ↳ `estimateTaxes` @403 |
    | `withdrawFromClass` @1408 — tax commit | `withdrawFromClass` @1408 |
    | `estimateTaxes` @1410 | `estimateTaxes` @1410 |
    | `growAccounts` @1599 | `growAccounts` @1599 |

    - [ ] **`withdraw` IS SPLIT TOO — a fourth contradiction, and the static reading missed it.** `@1380` spending, `@1408` tax commit, **with the entire tax block between them.** So 3.1 is wrong about `withdraw` in exactly the way 3.0f found it wrong about `grow`: **both are two stages with other work in between, not one**
    - [ ] **`estimateTaxes` runs FOUR times per period from THREE sites** — two baselines at `@1381`, the re-estimate at `@1410`, and `@403` inside `verifyQuoteObligation`. **The quote re-computes the tax in order to check itself**
    - [ ] **The settlement is therefore QUOTE → SELF-VERIFY → COMMIT → RE-ESTIMATE**, a four-element loop rather than 3.0f's three. `TAX_COMMIT_SHORTFALL` is the failure mode of the **commit half only**. 3.0f's fixed-point reading holds and understated it
    - [ ] **THE ONE RESULT THAT REMOVES A RISK RATHER THAN ADDING ONE, and it should be read first: the structure is IDENTICAL in `simple`, `historical` and `monteCarlo`.** Two sequences, differing solely by the presence of the spending withdrawal — which a pipeline handles as a **zero-work phase**. **Whatever the right decomposition is, it does not have to vary by mode.** Nobody had established that, and 6.8's mode-by-mode gating made it a live question

    - [ ] **WHY THIS IS STARTED AND NOT DISCHARGED, stated by the person who ran it.** It traces **four functions on ONE golden scenario**. 3.0a asks for **all seven proposed boundaries** instrumented with forward references checked across each; this observes the **CALL ORDER OF THE MUTATORS**, which falsifies boundary claims but **does not enumerate READS**. A boundary can still be wrong for a reason this probe cannot see — *a phase reading a local that a later phase writes, where neither is one of these four functions*
    - [ ] **THE DENOMINATOR IS ONE.** The two-sequence result may be a property of that scenario rather than of the engine; a plan with **no RMD, no conversion or no debt** could produce a third sequence and would not have been seen. **Do not cite "two sequences" as an engine property until the scenario set is stated as a number**
    - [ ] **Partial narrowing, and only partial:** every *real* call site between 1290 and 1600 in the tracked file was observed in the trace, so **no branch in that region went unexecuted**. That says nothing about code a different plan shape would reach

    - [ ] **TWO VERIFICATION ERRORS ON THE CHECKING SIDE, recorded because they are about how this was confirmed rather than about the engine.** The probe identifies call sites from a stack line in the **instrumented copy** — a second representation of position — and the positions were therefore checked independently against the tracked file. They coincide. **In doing that check, the reader's own earlier static reading was found wrong twice:** a site grep windowed at `> 1390` had **excluded `@1379`/`@1380`**, which is precisely why the split `withdraw` was missed in 3.0f; and a per-line comment detector classified four block-comment mentions as call sites, because it could not see a `/*` opened on an earlier line. **A filter that excludes evidence looks exactly like evidence that is not there** — and the instrumented run found what the windowed read could not

  - [ ] 3.0i **3.0 HAS AN ANSWER: FOUR OF THE SEVEN PROPOSED BOUNDARIES ARE REAL, THREE ARE NOT.** *(Added 2026-09-12 on the owner's instruction. 107,235 periods across 15 runs — 5 golden scenarios × 3 modes. `src/engine.js` untouched and asserted unchanged after writing, as in 3.0h.)*

    **The test, stated because the operationalisation is the arguable part.** In straight-line code a phase cannot literally read a value a later phase has not yet written, so "forward reference" is not directly observable. The observable failure is **CONTIGUITY**: if the work of phase X appears at positions interleaved with phase Y's, X is not a phase — **it is two pieces of work sharing a name.** A phase is contiguous iff its marker positions within one period form an unbroken run.

    | phase | verdict | broken in |
    |---|---|---|
    | `contribute` · `income` · `decide` · `record` | **CONTIGUOUS** | — |
    | `grow` | **BROKEN** by decide, income, tax, withdraw | **107,232 of 107,235** |
    | `tax` | **BROKEN** by withdraw | 106,518 |
    | `withdraw` | **BROKEN** by tax | 67,284 |

    Canonical sequence: `contribute ×3 · grow · income · decide · withdraw · tax ×4 · withdraw · tax · grow · record`

    - [ ] **The three failures are THREE DIFFERENT THINGS and must not be written up as one.** `grow` is broken in essentially every period observed — not a misplaced phase but **two operations bracketing the whole period that happen to share a function**. `tax` and `withdraw` **break EACH OTHER**, at different counts only because the spending withdrawal is absent in accumulation
    - [ ] **THE MUTUAL INTERRUPTION IS THE ROBUST RESULT — if only one line of this run survives review, it is this one.** You cannot reorder two things each of which interrupts the other. That is 3.3's test confirmed **by execution rather than by reading**, and it is the structural fact behind 3.0f's fixed point
    - [ ] **The four that held are worth as much as the three that did not.** `contribute`, `income`, `decide` and `record` were never in dispute; they are now **POSITIVELY ESTABLISHED rather than merely unchallenged**. A decomposition needs to know which of its parts it can keep, and this is the first evidence that any of them hold

    **THREE LIMITS, recorded WITH the verdict rather than after it. A four-of-seven result carrying no note about what contiguity cannot do reads as far more settled than it is.**

    - [ ] **LIMIT 1 — SCENARIOS, NOT THE CORPUS.** Five golden scenarios, not the 33-entry frozen corpus. The denominator is **5**, far better than 3.0h's 1, and still not the set the rebuild is measured against. A targeted or generated entry could reach code these five do not
    - [ ] **LIMIT 2 — CONTIGUITY IS NOT READ-DEPENDENCY, so 3.0a's actual question is UNTOUCHED.** A phase can still be wrong because it reads a local a later phase writes, and this probe cannot see that. Position data falsifies boundary claims; it does not enumerate reads
    - [ ] **LIMIT 3 — THE VERDICTS ARE RELATIVE TO MARKER PLACEMENT, and this is the one that constrains how the result may be used.** Three consequences, each independently disqualifying as a way of *choosing* a decomposition:

      - [ ] **CONTIGUITY HAS TRIVIAL OPTIMA AT BOTH ENDS AND MUST NEVER BE AN OPTIMISATION TARGET.** It is a property of an ASSIGNMENT of code positions to labels, not of the code. Split every operation into its own phase and each has one marker, so all are trivially contiguous; merge everything into one phase and it is trivially contiguous too. **Perfect scores sit at both extremes and both are useless** — singletons give a pipeline no parallelism and maximal synchronisation, one phase gives no pipeline at all. **Anyone who "fixes" the list by maximising this number arrives at fifteen singleton phases and a green board**
      - [ ] **The probe now prints its OWN refutation before it prints the result** — a `DEGENERATE BASELINES` block showing the proposed labelling at 2 breaks against **both degenerate labellings at ZERO**. *The metric's own red test: demonstrating that it passes on two things known to be useless, which is the same move as proving a control can fail before believing it passed.* Anyone maximising the number now has to read that on the way past
      - [ ] **THE FAILURES NEED OPPOSITE REPAIRS AND THE METRIC FLAGS THEM IDENTICALLY.** Relabel `grow_pre`/`grow_post` and 107,232 breaks vanish — nothing fixed, only renamed. Relabel `tax`+`withdraw` as one `SETTLEMENT` and their mutual interruption vanishes too — **and that one is the correct repair.** `grow` is fixed by SPLITTING, `tax`/`withdraw` by MERGING; same signal, opposite remedies. **Contiguity DETECTS but does not CLASSIFY** — 3.0f's taxonomy still has to come from reading what the code does, and `TAX_COMMIT_SHORTFALL` is why the settlement is a merge rather than a split
      - [ ] **UNMARKED CODE CANNOT BREAK ANYTHING.** The markers select what is visible, so work with no marker is not merely unmeasured — it is **incapable of producing a failure**. This result is silent about the withdrawal cascade's internals, `applyStage`, and anything else uninstrumented. **A different grouping could yield a different verdict, and nothing in the probe detects that**
      - [ ] **Consequence for whoever replaces 3.1: this test can REFUTE a candidate list and cannot PROPOSE one**, because the labels were taken from the list under test. A replacement grouping needs its own justification and then its own run

    - [ ] **A silent analysis bug worth carrying, because it failed in the direction nobody doubts.** `monteCarlo` runs `simulatePlan` once per path, each restarting the period index at 0 — so keying periods on that index alone **merged every path's period 0 into one bucket** and reported **50 "distinct sequences" that were concatenations**. First run: 948 periods. Corrected: 107,235. **A bucketing key that is not unique looks exactly like a corpus with more variety in it.** Pair it with 3.0h's windowed grep: **a window that excludes evidence and a key that merges it both produce a confident wrong answer with no symptom** — and the merging key is harder to doubt, because more variety reads as richness rather than breakage

- [ ] 3.1 Draft the phase list against `simulatePlan`'s current row body — candidate shape: `grow` → `contribute` → `income` → `decide_spending` → `withdraw` → `settle_tax` → `record`
- [ ] 3.2 For each phase, define: inputs read, state written, and whether it can be data-parallel across paths
- [ ] 3.3 Place every ordering constraint the audit history established — the decision clock's three leak sites, SA-04's prior-observed-inflation rule, S5 task 7's above-the-line SE deduction, `TAX §2.4`'s AGI dependency order
- [ ] 3.4 Identify phases that **cannot** vectorize cleanly — the withdrawal cascade's `while (need > 0)` is the known one — and decide masking vs compaction
- [ ] 3.5 Map **S4 task 9.3**'s implementation-coupled test list onto phases, so each orphaned test has a destination
- [ ] 3.6 Decide where the decision-state / execution-state boundary falls — phase-splitting should make it structural rather than a context object
- [ ] 3.7 **Consume S5's record of the affine/breakpoint structure.** S5 task 6 turned one MAGI into four parallel affine quantities with slope companions, and S5 task 8 added Arizona's breakpoints to the solver's walk. That is the hardest part of the tax phase, and S5 is the only place that knowledge exists — task 6 was asked to record it *while writing the code*, precisely so this task does not have to rediscover it
- [ ] 3.8 **Consume S4 task 6's household cash-flow ledger.** The ledger defines a sources-and-uses identity that must hold at a period boundary, which is a constraint on where phase boundaries may fall — a phase split that makes the identity unassertable is the wrong split
- [ ] 3.9 **Name incremental recompute as a decomposition constraint, now — not when Track G arrives.** `FEATURES.md` wants live what-if sliders, which depend on dependency-aware recalculation (Track G). Phase-splitting is a natural fit: if each phase declares the inputs it reads, a changed input invalidates a known set of phases and everything upstream of them can be reused. But that is only true if phase state is **checkpointable at a row boundary** and phases declare their input dependencies. Both are free to design in and expensive to retrofit — a phase that reaches into ambient state forecloses partial recompute permanently. Decide: do phases declare their reads, and is per-row state serialisable enough to resume from?
- [ ] 3.10 **Stop and get user agreement before proceeding to task 4**

**Gate:** a written phase list, agreed, with ordering constraints justified by the audit record rather than by intuition.

## Task 4 — Field registry schema — **USER DECISION**

- [ ] 4.1 Define what a field declaration contains: name, type, unit, producing phase, retention class, quantiled?, charted?, units convention
- [ ] 4.2 Consume the retention-class annotations S5 task 12 attached to the parameters it touched
- [ ] 4.3 Specify what is generated from the registry: buffer layout and offsets, aggregation loop, worker transfer shape, result contract
- [ ] 4.4 Confirm the registry makes "add a field" a one-line declaration rather than a six-site edit — this is the direct answer to feature growth bloating the row
- [ ] 4.5 Define the columnar index formula and pin it: `index(field, row, path) = ((field * ROWS) + row) * pathCount + path` — **path-fastest**, because the selection pass runs 1,512 times per aggregation and wants each `(field, row)` block contiguous
- [ ] 4.6 Design the worker stitch — path-fastest means a worker's paths are strided, so each worker owns its own buffer and the main thread stitches per `(field, row)` block

### 4b. The *entity* registry — accounts, debts and assets as declared types

**Same idea as the field registry, applied to the thing that actually varies per scenario.** Today an account's behaviour is decided at each site that touches it: `accountType(t).limitGroup` here, a `taxClass === "preTax"` comparison there, a `.find()` by id somewhere else. That per-site handling is the shape SA-03 came from.

- [ ] 4b.1 Five new account types are already queued and deliberately out of S5's scope — **403(b), 457(b), SEP-IRA, SIMPLE IRA, inherited IRA** — and each has genuinely different rules (457(b) has no early-withdrawal penalty; inherited IRAs run a 10-year clock with their own RMD treatment; SIMPLE has a two-year penalty cliff). Adding five types to per-site handling multiplies the sites, not the declarations. **Routed here 2026-09-14, night (the owner), answer 1 (A):** S5 task 5's inherited/SEP/SIMPLE IRA spec vectors (ACCOUNT §17 Tests 5, 6, 7 and 10) went `UNSUPPORTED` for exactly this reason and stay here, with `S103_TASK_CHECKLIST.md` task 7 as the other half. **Also routed here:** the per-plan RMD aggregation vector (§18 #8) and the 415(c) contribution-limit vector (Test 8) — both need the entity registry's per-account-type declarations before they can be satisfied
- [ ] 4b.2 Declare each account type **once**: contribution limit group, tax class, penalty rule, RMD applicability, early-withdrawal treatment, employer-match eligibility, ordering preference
- [ ] 4b.3 Same for debt types and asset types
- [ ] 4b.4 Every engine site reads the declaration rather than re-deriving from a type string comparison
- [ ] 4b.5 Confirm this composes with task 6.5's scenario compilation — slot IDs solve *aliasing*, the entity registry solves *behaviour*. They are different problems and both are needed
- [ ] 4b.6 Verify by adding one of the five queued types **as a declaration only**, and confirming no engine site needed editing. That is the acceptance test for the whole idea

- [ ] 4.7 **Stop and get user agreement on both registries**

**Gate:** two schema documents, agreed, each with a worked example — a new field added end to end, and a new account type added as a declaration with no engine edit.

## Task 5 — Retained field set — **USER DECISION, and it is a product call**

**The single biggest memory lever in the rebuild.** Not every field needs a per-path quantile.

- [ ] 5.1 Enumerate the full expected field set at feature completion — today's 22, plus S5's additions, plus the SS stack, reserve manager, optimizer, and grader when wired
- [ ] 5.2 Classify each into **three** tiers, not two:
  - **retained + quantiled** — all paths' values retained, because a quantile needs them
  - **retained, median-path only** — one path's series
  - **intermediate only** — never leaves the row loop
- [ ] 5.2b **A fourth axis, and it must be settled here or not at all: raw path retention.** `FEATURES.md` wants a **Monte Carlo path visualizer** — today's chart shows only the q10/q90 band, so "a bad-but-plausible sequence has no concrete visual story." That needs *individual whole paths*, which is a different memory shape from everything above: not "all paths for one field" but "all fields for a few paths." Decide now: how many sample paths are retained in full, chosen how (fixed seeds? quantile-representative? worst-case?), and at what cost. **A sampled subset is cheap — 20 full paths at 40 fields is under 500 KB — but only if the buffer is designed for it.** Retrofitting a whole-path slice into a quantile-shaped buffer means redoing the layout.
- [ ] 5.3 Compute the resulting memory at each tier against the budget task 2 measured, **including the raw-path allowance**
- [ ] 5.4 Decide the retained-output precision: **f64 for all computation** is settled; the open question is whether the **write-only retained buffer** is f32. It halves memory (230 MB → 115 MB at 40 fields), affects no decision, and resolves a $2M balance to about 12 cents against a UI that rounds to dollars
- [ ] 5.5 **Stop and get user agreement** — 5.2 and 5.4 are both product calls

**Gate:** a classified field list with the memory arithmetic shown, agreed, and fitting the measured budget with headroom below the 50% pressure rung.

## Task 6 — Rebuild design decisions register

**Accumulates across the sprint; closes last. One entry per decision, each with its reasoning, so the rebuild does not relitigate them.**

- [ ] 6.1 **Precision policy** — f64 for all computation and all decisions; f32 only in the retained output buffer if task 5.4 agrees; no f32 anywhere a threshold is evaluated
- [ ] 6.2 **Pluggable math module** — the new engine calls its own `pow`/`exp` behind an interface, defaulting to `Math.pow` so the differential gate against the old engine holds. Own-implementation transcendentals ship **after cutover** as their own audited change. *(Reason: IEEE-754 mandates correct rounding for `+ − × ÷ sqrt` and FMA but not for `pow`/`exp`/`log`, so JavaScriptCore and V8 may differ — a real problem for an iOS+Android product, but not one to solve while the diff gate depends on matching the old engine.)*
- [ ] 6.3 **Timestep parametrization** — steps-per-year as a compile-time constant. **Ship at annual**, prove bit-identity, flip to monthly later as a separately-audited change. Monthly additionally requires monthly historical data, which is a Track I sourcing task
- [ ] 6.4 **WASM-compatible subset coding standard**, written down before any code: no hot-path allocation; no closures over per-path state; all state in typed arrays indexed by integer; fixed-size arrays only, no growable structures (`magiHistory` becomes a ring buffer); integer slot IDs, never string keys; error codes, not exceptions; no polymorphic dispatch
  - [ ] 6.4a **Every fixed-size structure states its required depth and who determines it — `magiHistory` is the one that will bite.** *(Added 2026-09-12.)*

    6.4 requires `magiHistory` become a **ring buffer**, because the subset admits fixed-size arrays only. Today it is **unbounded**: `magiHistory.push(taxes.magi)` once per row, read by IRMAA as `magiHistory[magiHistory.length - RULES.medicare.irmaa.lookbackYears]`.

    **Nothing states the required depth.** Size the ring to 2 because IRMAA's lookback is 2, and any consumer reading further back **silently gets the wrong year** — not a crash, not a reconciliation break, a plausible number from the wrong row. That is the same silent-wrong-answer class as Q45, in the same lookback S5 task 6.6a was added to pin.

    - [ ] Enumerate **every** reader of `magiHistory` before sizing it — re-locate by symbol and grep the source, do not work from this list
    - [ ] The depth is **`max(all consumers' lookbacks)`**, derived rather than assumed, and it is **read from the rules** (`RULES.medicare.irmaa.lookbackYears`) rather than hardcoded — otherwise a rules-vintage change silently under-sizes the buffer, which task 1b makes a live possibility rather than a hypothetical
    - [ ] **A read beyond the ring's depth must fail loudly, not wrap.** A ring buffer indexed past its depth returns a *valid-looking* older value, which is the worst available behaviour
    - [ ] Apply the same rule to every other structure this standard converts. **`magiHistory` is the one with a known consumer and a known lookback; it is unlikely to be the only fixed-size conversion**, and the others have not been enumerated
- [ ] 6.5 **Scenario compilation** — all scenario-level constants resolved once into flat arrays before simulating, with stable integer slot IDs for accounts, debts and assets. This subsumes the deferred account-ID rate map: positional aliasing (SA-03's exact mechanism) becomes impossible by construction
- [ ] 6.6 **Worker partitioning** — transferable `ArrayBuffer` per worker, not `SharedArrayBuffer`. **See 6.12: seeding must stay a pure function of the global path index, and this is the decision that can silently break it.** *(Reason: SAB needs COOP/COEP headers, which constrain PWA hosting; transferables are zero-copy for this access pattern because no two workers touch the same path. iOS caps `hardwareConcurrency` at 4 regardless.)*
- [ ] 6.7 **Migration strategy** — new build, not a port; old engine as oracle; mode-by-mode verification (`simple` → `historical` → `monteCarlo`); single cutover commit. *(No users to serve, so the dispatcher, flags and gradual rollout are unnecessary — but the differential diffing is the valuable half and is retained.)*
- [ ] 6.8 **Substitute discipline for "must keep working"** — the new engine must be green on the full differential corpus for everything it claims to support, at every commit.

  **⚠ As originally written this rule was vacuously satisfiable, and the correction is the rule's whole value.** *(Corrected 2026-09-12.)* On day one the new engine claims to support **nothing**, so it is green over **zero modes** and passes. That is **ST2-02's exact shape — a corpus gate certifying an empty sweep — sitting inside the rule that governs the entire rebuild**, alongside P5-02's `rows: []` satisfying *"is an array"* and FC-04's validator walking rows while the `NaN` sat elsewhere.

  The clause *"for everything it claims to support"* is doing necessary work: early on the engine genuinely cannot do `historical`, and demanding otherwise would stop the rebuild before it starts. But unqualified, **the engine grades its own homework by choosing the syllabus.**

  - [ ] 6.8a **Declare a support set, and make it monotonic.** The new engine states which modes and which scenario classes it claims, and **that set may only grow.** A commit that narrows it is a regression and fails, whatever the diff says
  - [ ] 6.8b **The pass line carries the count.** *"Green"* is never reportable without *"over what"* — `green over 3 modes / 36 corpus entries` and never bare `green`. This is §N's convention applied to a gate instead of a figure: **the number says of what, and a bare pass says nothing**
  - [ ] 6.8c **A claimed mode with no corpus entries exercising it fails**, rather than passing empty. The claim and the coverage are two assertions and neither implies the other — the lesson S4 task 3's corpus invariant exists to enforce, applied to the rebuild's own gate
  - [ ] 6.8d **Set the floor now:** the first commit that claims a mode must diff clean over every corpus entry in that mode. The rebuild may take as long as it takes to claim the first one; what it may not do is accumulate commits that pass because they promise nothing
- [ ] 6.9 **Deferred-fix disposition** — record that D-2 (columnar), the account-ID rate map, and the decision-state/execution-state context are **folded into the rebuild** and cancelled as standalone sprints. None is a live bug; all three are prophylactic, and all three are structural consequences of this architecture
- [ ] 6.10 **The sweep/optimizer API, decided but not built.** Six wanted features are the same shape underneath — SS-claim optimisation, Roth-ladder search, glidepath sweeps, decision heatmaps, goal-seek ("what contribution reaches 90% success"), and sensitivity/tornado analysis. Each is *evaluate the model over a parameter set and rank the results*. Six bespoke implementations means **six chances to get RNG seeding wrong**, and D-3's per-path seeding is exactly the kind of invariant that breaks silently when re-derived. Decide the shared contract now — parameter space in, evaluations out, with seeding, path count, early termination and cancellation handled **once** — and record that the first sweep feature built is the one that implements it. **Do not build the layer before it has a consumer**; do not let the first consumer foreclose it.
- [ ] 6.11 **Reproducibility rule for sweeps:** a sweep evaluating the same parameter point twice must return the same answer, and two parameter points must not share a path sequence unless that is deliberate (a common-random-numbers design, which is often *wanted* for ranking — decide explicitly which)

- [ ] 6.12 **The RNG is a frozen artifact, reproduced bit-for-bit — and this is a hard blocker on `monteCarlo` cutover that nothing previously named.** *(Added 2026-09-12.)*

  `src/engine.js` seeds every path explicitly — re-locate by symbol, it was `:1854` — as `simulatePlan(p, rng(baseSeed + i*2), 0, rng(baseSeed + i*2 + 1), …)`: **mulberry32** (`rng()`, was `:730`), **two streams per path**, keyed to the **global** path index, with `baseSeed` falling back to `0` on a non-finite seed.

  **`monteCarlo` mode's cutover gate is an empty diff.** That is achievable only if the new engine reproduces the same PRNG algorithm *and* the same path→seed mapping *and* the same draw order within a path. **The RNG is therefore not an implementation choice in the rebuild — it is a fixed input, like the market data.**

  - [ ] Record the algorithm, the seeding formula and the non-finite fallback as **specification**, not as observed behaviour
  - [ ] **Record the draw order too.** Reproducing the generator is not enough if the new engine consumes draws in a different sequence — `normal()` takes **two** uniforms per value via Box–Muller, so any change to how many draws a row consumes desynchronises every subsequent value on that path
  - [ ] Cross-reference decision **6.2**: `normal()` calls `Math.log`, `Math.sqrt` and `Math.cos`. `sqrt` is IEEE-mandated; `log` and `cos` are not. So the pluggable math module's default **must** stay `Math.*` until after cutover — 6.2 already requires that, and this is the second reason for it. Do not let S100 task 4 decide them separately
  - [ ] **Constraint on 6.6, and it is how this gets violated silently:** worker partitioning strides paths across workers. **Seeding must remain a pure function of the global path index, never a worker-local one.** If it is not, every path still gets a seed, the engine still runs, the results still look plausible — and the diff can never close. The failure surfaces as *"the diff will not go empty"* deep into the rebuild, with the cause three design decisions upstream
  - [ ] Carry the old engine's guard across. `tests/rng-seeding.test.js` already pins this, including *"adjacent paths draw from independent streams, not a shared sequential one"* and a non-finite-seed case recording that a `NaN` seed once **collapsed every path onto one `rng(NaN>>>0)` stream**. **The old engine is guarded; the new engine's design was not.** Point the same tests at the new engine

- [ ] 6.13 **Aggregation by selection, not sorting — the plan's largest measured win, and it had no entry here.** *(Added 2026-09-12.)*

  `aggregateMonteCarloRuns()` fully sorts N values per key per projection year to extract **one** median. Selection is O(N), sorting is O(N log N), and quickselect measured **26–42× faster at 10,000 paths with a bit-identical result** — a larger win than the columnar layout, needing no layout change. This is the measurement that reframed the whole roadmap, and task **4.5** already leans on it (*"the selection pass runs 1,512 times per aggregation"*) to justify path-fastest ordering. It belongs in the register that exists so the rebuild does not relitigate decisions.

  - [ ] Record it as a decision with its measurement attached, not as an optimisation to rediscover
  - [ ] **Quickselect is NOT a drop-in for `quantile()`, and this subtask previously understated that. Corrected 2026-09-12 by reading the function at `cd39880`.**

    `quantile(a, q, sorted)` computes `p = (a.length-1) * q`, then `l = floor(p)`, `h = ceil(p)`, and returns **`a[l] + (a[h]-a[l]) * (p-l)`** — a **linear interpolation between two elements**, which is generally **not an element of the array at all**.

    **This is not an even-N median edge case. Most quantiles interpolate.** At 10,000 paths, `q10` gives `p = 9999 × 0.1 = 999.9`; `q90` gives `8999.1`. Both interpolate. A quickselect returning *one element* is wrong for nearly every order statistic this engine takes.

    - [ ] Bit-identity requires **two selections plus the interpolation** — `a[l]` and `a[h]`, then the same arithmetic in the same order. It is still O(N) and still far cheaper than a full sort, but it is **an implementation nobody has written yet**, not a property of quickselect
    - [ ] **Reproduce the arithmetic exactly**, including operand order. `a[l] + (a[h]-a[l])*(p-l)` and `a[l]*(1-(p-l)) + a[h]*(p-l)` are algebraically equal and **not bit-equal** in floating point
    - [ ] Where `p` is an integer, `l === h` and the interpolation is a no-op — confirm the implementation handles that without a redundant second selection
    - [ ] **The measured 26–42× stands**; what needed correcting is the claim that bit-identity comes for free. It does not — it comes from reproducing this function
  - [ ] Confirm it holds for **every order statistic the engine takes**, not only the median. `q10` and `q90` are on the row and are selections too

- [ ] 6.14 **The result contract's error and warning semantics — S5b task 2b produces a list and nothing here receives it.** *(Added 2026-09-12.)*

  Task **4.3** lists "result contract" among what the field registry generates, but that is **field shape**. `calculationErrorCode`, `calculationError`, `calculationErrorPaths`, `limitWarnings`, `issues` and `status` are a different contract — and **Q43, Q44 and Q45 are all failures of it** rather than of arithmetic.

  **S5b task 2b is deliberately scoped to "the contract and the inventory, not the full implementation," and explicitly hands the rebuild a list.** This is the entry that takes delivery of it.

  - [ ] Define the new engine's error and warning contract: which statuses exist, what `UNSUPPORTED` means at runtime, and how a per-path failure aggregates into a run-level verdict
  - [ ] Consume S5b task 2b's inventory — the `TAX §10.2` / `ACCOUNT §19` categories where the old engine returns a confident number it should be flagging, and which of them were left unwired
  - [ ] **A warning is part of the diff.** `capture-baseline.js` captures `runPlan()` with `EXCLUDED = []`, so `limitWarnings` and `issues` are compared like any financial field. Adding a warning in the new engine is an output movement and takes the same prediction discipline
  - [ ] Decide where a warning surfaces. `FEATURES.md` records that engine warnings *"currently only reach the debug/JSON export, not a panel a user would see"* — a contract satisfied only inside the result object repeats the defect S5b task 2b exists to fix

- [ ] 6.15 **Snap-to-grid quantisation at every discontinuity — decided here, built in the rebuild or later, and it had no owner anywhere until now.** *(Added 2026-09-12. Placement is the user's decision: the decision is recorded here, the implementation is not a pre-rebuild task.)*

  `ROADMAP_EXTERNAL_REVIEW.md` records this as a settled architecture choice: the engine's discontinuities — **IRMAA tiers, guardrail bands, success/failure classification, age-eligibility gates** — are handled by **snap-to-grid quantisation of the decision input**, deliberately *instead of* epsilon guards. Across all seven sprint checklists it appeared exactly once, in an S5 close-out line beginning *"if snap-to-grid quantisation lands"* — a conditional with nothing to make it true.

  **Why quantisation rather than epsilon guards, recorded so the rebuild does not relitigate it.** An epsilon guard makes a threshold flip *unlikely*; rounding the decision input to the grid the rule actually uses makes it **impossible**. Rounding MAGI to whole dollars before an IRMAA lookup is not an approximation — it is how the IRS assesses it, so the quantised answer is the *more* correct one.

  - [ ] Enumerate every discontinuity and name the grid each snaps to. The four above are the known set; the phase decomposition (task 3) is where others will surface
  - [ ] Each grid is justified against the **real-world rule**, not chosen for convenience — the same discipline S102 task 2.3 applies to cadences
  - [ ] Record where the implementation lands: **the rebuild, or S100 as its own audited change.** It is not a pre-rebuild task
  - [ ] **If it lands after cutover it moves output**, so it takes a prediction and its own commit, exactly like S100 task 4
  - [ ] Every grid adopted is a **user-facing model assumption** and goes in `MODEL_ASSUMPTIONS.md` — *"MAGI is rounded to whole dollars before the IRMAA tier lookup, because that is how the IRS assesses it."* S5's close-out already reserves the slot
  - [ ] **Cross-reference 6.1 and S100 task 4.** Precision policy says no f32 where a threshold is evaluated; deterministic transcendentals perturb every Monte Carlo draw at the last bit. Quantisation is what stops that perturbation reaching a *classification*, which is why the three decisions belong together rather than apart

- [ ] 6.16 **How the new engine becomes a shipped artifact — generation and bundling, neither of which the plan decides.** *(Added 2026-09-12.)*

  **Two questions, one subject: nothing in this sprint says how the new engine gets from source to the Worker a user runs.**

  ### 6.16a — Generated code has no home

  **4.3 says the field registry generates** *"buffer layout and offsets, aggregation loop, worker transfer shape, result contract."* Nothing says whether that output is **generated at build time or committed to the tree**.

  - [ ] Decide it explicitly. **Both options have a named failure mode and neither is obviously right.** Committed output can drift from the registry that produced it — which is Q20/Q33/Q38 exactly, *a set defined twice with one copy hand-maintained*, and this time the hand-maintained copy is machine-written, which makes it look trustworthy. Generated-at-build puts the aggregation loop through the build path, and see 6.16b for what that costs
  - [ ] **Whichever is chosen, drift must be detectable.** If committed, a test regenerates and compares — failing on any difference. If generated, the generator runs in the gate and its output is hashed. **An artifact nobody can prove matches its source is a second definition regardless of who wrote it**
  - [ ] Decide whether generated output is **reviewable**. A generated aggregation loop appearing in a diff as 400 unreadable lines is a change nobody reviews, and this project has already recorded what an unreviewable diff costs — a committed `U+0000` made a test file's diffs report *"Binary files differ"* for an unknown period under external audit

  ### 6.16b — The new engine's build path is undecided

  **`buildWorkerSource` appears in S4 and S5 and nowhere in S6.** So nothing states whether the new engine goes through the same Worker generator and the same `build.js` require-rewriting as the old one.

  That path has produced **seven audit findings across six consecutive rounds** (FC-01, FCR-01, P5-01, P6-01, P7-01, P7-02, P8-01 — see §N in `S4_TASK_CHECKLIST.md` for the current figure and how to refresh it), plus one self-discovered dead-backstop defect. It is the most defect-dense component in the project.

  - [ ] Decide whether the new engine reuses it, replaces it, or bypasses it. **Reuse is defensible** — it is repaired, witnessed, and replacing a bundler mid-rebuild is its own risk — **but it must be a decision rather than a default**
  - [ ] **6.4's WASM-compatible subset interacts with this and the interaction is not obvious.** A subset with no closures over per-path state and integer slot IDs rather than string keys is a *different shape of source* from what the current scanner was hardened against. Whether that makes its job easier or introduces constructs it has never seen is unknown and worth one look before assuming the former
  - [ ] **This is the other half of S4 task 7.4a.** That asks what the differential gate *compares* — module graph or built artifact. This asks how the new engine *becomes* a built artifact. **Decide them together:** if the gate compares module-graph output only, then the bundling path is never exercised by the gate at all, and the component with seven findings is the one nothing checks

- [ ] 6.17 **A tax-aware withdrawal order — routed here from S5 task 9.5, the owner's decision 2026-09-14 (night), answer 3 (A).** *(Added 2026-09-14.)*

  S5 task 9 rebuilt the effective-marginal-rate recomputation; its own 9.5 asked that the comparator choosing which account to draw from *use* those recomputed rates, so the withdrawal order responds to SS inclusion, senior-deduction phaseout, NIIT and capital-gain stacking rather than treating every source as equally taxed. **Decided against landing in S5**: `withdrawalComparator()`/`optimizedAccountScore()` (checked at S5 task 8b.1's 2026-09-14 investigation) currently rank accounts by priority and volatility/cash-share/reserve scoring only — no tax rate at all — so this is new comparator logic, not a bounded repair, and belongs with the rebuild's own design rather than as a behaviour change to the engine about to be replaced.
  - [ ] Decide whether the recomputed effective marginal rate (task 9's own mechanism, or its rebuild equivalent) feeds `optimizedAccountScore()` directly, or whether tax-awareness becomes a separate ranking pass ahead of the existing volatility/cash-share scoring
  - [ ] State whether this only applies under `withdrawalOrder: "optimized"` (today's gate on `optimizedAccountScore()` running at all) or becomes the unconditional default
  - [ ] Predict the diff: a tax-aware comparator changes which account is drawn first in any scenario where classes have materially different marginal rates — this moves financial output and needs its own before/after, not folded into an unrelated rebuild commit

**Gate:** every decision recorded with its reasoning. A decision without a reason is an assumption waiting to be relitigated.

## Task 7 — Write the rebuild's own checklist — **the rebuild has no document, and that is the gap this closes**

**Added 2026-09-12 at the user's decision.** Discovered by asking which sprints carried a ground-rules section: **eight checklists exist — S4, S5, S5b, S6, S100, S101, S102, S103 — and there is no rebuild checklist at all.** Verified against `git ls-files`, not against a tracker.

**It is not that the rebuild's ground-rules section is missing. The largest single body of work in the plan has no document**, so it has no rules, no tasks, no gates and no definition of done. S100's header reserves **S7–S99** for *"however many sprints the rebuild itself takes"*, and that reservation has been standing in for a decomposition nobody has written.

**Why that matters more than a missing file.** The rebuild's discipline currently exists as **design-register entries in task 6** — 6.4's WASM-compatible coding standard, 6.7's migration strategy, 6.8's substitute discipline and its floors. **A register entry says *we decided X*. A ground rule says *you may not do Y*.** They are not interchangeable: a decision is something you revisit with a reason, a rule is something you notice yourself breaking. **A rule with no document to live in is a decision wearing a rule's clothes.**

### Sequencing, and it is deliberate

- [ ] 7.0 **Runs after tasks 3, 4 and 5 — all three USER DECISION tasks — and before the first rebuild commit without exception.** The phase list, the field registry and the retained field set are **what this checklist decomposes into tasks**. Writing it earlier would decompose a design nobody has agreed, which is the same error as S6's own ground rule 8 in a different costume

### What it must produce

- [ ] 7.1 **A ground-rules section in the form the other eight sprints use.** Not a summary of task 6's register — rules, stated as prohibitions and obligations, in a document a person executing the rebuild will actually open
- [ ] 7.2 **"No task may weaken an existing test to pass", carried explicitly and for its reason rather than as boilerplate.** That rule was present in six sprints where compliance is cheap and absent from the two where it is hard, which is how it was found. **The rebuild is the hardest case in the plan** — a from-scratch engine whose every intermediate state fails most tests by construction — and it is the one stage with no rule against relaxing one
- [ ] 7.3 **Take task 6.8's floors as INPUT, not as inherited rules.** Adopt, amend or reject each — **and record the reason either way.** A floor rejected with a reason is a decision; a floor silently dropped is a gap that will be rediscovered by an auditor
- [ ] 7.3a **Carry C2 and C3 as rebuild requirements.** *(Added 2026-09-13 on the owner's decision.)* The CSV export changes its **data** to match its labels, not its labels: pre-retirement wages split out of the "Retirement income" column (C2), and debt payments exported for every year under "Debt payments" (C3). Decided to land in the rebuild, not S5 (`S2_CARRIED_WORK_REGISTER.md` §4)
- [ ] 7.3b **Measure the rebuilt engine on Android.** *(Added 2026-09-13 on the owner's decision.)* S4's device benchmark was not run on the current engine: the owner will measure the rebuilt one on the owner's Android phone instead. The rebuild checklist schedules that run, says which of task 5's memory-budget figures it confirms or revises, and until then carries them as unmeasured risks. The iPhone stays unmeasured (2.2)
- [ ] 7.4 **A sprint-level definition of done, and a close-out that collects its own gates rather than listing them.** This is S4's exit-gate finding applied one stage later: *a checklist that lists gates is not a checklist that collects them*. The rebuild spans several sprints, so it needs a per-sprint verdict **and** a rebuild-level one
- [ ] 7.5 **The task decomposition for however many of S7–S99 the rebuild takes.** That numbering has been a placeholder for work nobody has scoped; this is where it stops being one
- [ ] 7.6 **Carry the standing conventions rather than reinventing them**: stamp every count with the commit it was true at and name the register it counts (`S4_TASK_CHECKLIST.md` §N); cite a commit rather than the working tree; predict a diff before regenerating; one output-moving change per commit; **exit-gate items are lettered (`E1`, `E2`, …), never numbered**

  - [ ] 7.6a **Why the letters, because the reason is no longer visible from the code.** *(Added 2026-09-12 on the owner's instruction.)* They began as an accident: seven sprints' exit gates were written with lettered items for no recorded reason, and `tools/xref-scan.py` counted `- [ ] N.` items as task definitions — so **a numbered exit-gate item would have been extracted as a task**, and a reference to a task that did not exist would have silently resolved against it. That is the defect that hid three dangling references to a **task 8 that S6 has never had** — phrased that way deliberately: written as a bare citation, this very sentence was flagged as a live dangling reference by `tools/xref-scan.py` at `0aa9419`, one commit after the rule went in. **A reference does not stop being a citation because the sentence around it says the target is fictional.** The classifier has `the old S<n> task <id>` for ids that moved; it has no form for ids that never existed, and prose about a defect is the place those get written. **Since `733b18e` the tool no longer depends on the convention** — `Exit gate` is in `NON_TASK_NAMES` and a synthetic self-test proves the blanking works for every name in that list. **So this rule now protects the next author, not the scanner.** Say that here, or someone tidies `E1`–`E7` into `1`–`7`, is being entirely reasonable, and re-opens nothing visible.

    Verified at `374f02c`, all seven: S4 `E1`–`E8`, S5 `E1`–`E8`, S5b `E1`–`E9`, S100 `E1`–`E7`, S101 `E1`–`E8`, S102 `E1`–`E9`, S103 `E1`–`E7`. **56 lettered items, zero numbered.** The rule **codifies existing practice and renames nothing.**

  - [ ] 7.6b **S6 has no exit-gate section, and that is a DECISION rather than an omission.** Its closure verdict is **close-out item 7** — *a go/no-go on starting the rebuild, with anything still blocking it named explicitly* — which is a verdict in substance under a different heading. **Named here deliberately rather than scoping the rule around it:** a rule that quietly excludes S6 leaves S6 looking non-compliant with something nobody decided it should have, and invites a future reader to "fix" it by adding a section it was never meant to carry. *(This was also found the wrong way round once — a search for a section titled `Exit gate` reported S6 as having no closure verdict at all, which is the pattern-encodes-the-expected-shape error. S6 had one; it was not where the pattern looked.)*

  - [ ] 7.6c **The lettering creates a FIFTH NAMESPACE that no instrument checks — write it down now, because after this rule it is permanent rather than incidental.** `xref-scan.py`'s `REF` expects a **digit-initial** id after `task|design decision|close-out|decision`, and **`exit gate` is not in that keyword list**. Red-tested rather than read off the regex: `S100 task 5.7`, `S5b close-out 6` and `S6 design decision 6.3` all match; `S100 exit gate E2`, `S102 exit gate E7` and `S5b exit gate E9` are **not seen**. The controls matching is what makes this a finding rather than a guess.

    **Zero such references exist today**, so it is latent in exactly the way the S104 ground-rule gap was latent — **the first person to cite an exit-gate item gets no checking at all, and both tools will report clean while doing it.**

    - [ ] **If coverage is built, the reference half must print its denominator.** It will find **zero references**, and *"0 dangling"* over an empty set is **ST2-02 in a new costume** — the gate that certified an empty sweep, which is where this entire family started
    - [ ] **The extractor half is NOT vacuous and that distinction is the reason it is worth building at all:** there are **56 real `E`-ids** across seven files, so a present/absent control pair genuinely proves the tool can see exit-gate items even while nothing cites them. **Two halves — one non-vacuous, one that must not be allowed to look like a pass**

  - [ ] 7.6d **A self-test must call the PRODUCTION PATH, not a copy of it.** *(Added 2026-09-12.)* **A self-test that does not call the production path tests a thing that RESEMBLES the production path**, and nothing in its output can tell you which it did.

    **The worked example, because it happened inside the tool built to catch this class.** `tools/xref-scan.py` gained an exit-gate namespace with six synthetic reference cases — valid, invalid, empty-pool, out-of-scope, namespace routing, and a task id cited as an exit-gate item. Good cases. They called `_EG_REF`, **a second copy of the scan's own `REF` pattern**, written as a local convenience so the resolver had something to call without restructuring the file.

    Demonstrated by breaking both versions identically — removing `exit gate` from the **scan's** keyword alternation:

    | | self-test | the scan | refusal |
    |---|---|---|---|
    | two copies | **PASS** | `exit gate=3` silently gone | none |
    | one definition | all six FAIL | — | fires |

    **Three references vanished from the scan while the tool reported green.** Not noise — false confidence, the same signature as the close-out over-match that hid three dangling references, which is the defect that file was written to close. Fixed at `f77af48`: one definition, placed above the self-test that exercises it, with a comment saying why it must not be redefined at the scan site.

    - [ ] **This is Q20/Q33/Q38's family for the fifth time** — two definitions of one thing, kept in step by hand. The rebuild will have many more opportunities: **a test double, a fixture builder, a reimplemented selector in a test helper.** Each is the same trade, convenience now against a check that validates the convenience
    - [ ] **The test:** if the production path were deleted, would this test still pass? If yes, it is not testing it

  - [ ] 7.6e **Never do an unguarded string replacement. Assert every anchor matches EXACTLY ONCE and fail otherwise.** *(Added 2026-09-12.)* Three sessions hit this in three different mechanisms in a single day, and **all three failed in the MECHANISM rather than the content — so the edit looked applied:**

    | how it failed | what the anchor did |
    |---|---|
    | a shell heredoc collapsed `\\b` to `\b`, which Python read as a **backspace character** | matched **zero** |
    | a heredoc mangled a backslash inside a regex being injected for a break test | matched **zero**, and the "break" ran against unmodified code |
    | `REF = <pattern>` is a **substring** of `_EG_REF = <pattern>` | matched **two** |

    **The third is the nastiest and the reason this is a rule rather than an anecdote:** the anchor was correct, looked unique, and matched twice only because of a name created three lines earlier in the same edit. An unguarded `replace()` would have deleted the definition outright and left a file that still parsed.

    - [ ] **A failure injection that does not inject is indistinguishable from a control that does not fire.** Assert the source actually CHANGED as well as that the anchor was unique — the second row above is a break test that tested nothing and would have been recorded as "the refusal did not fire"
    - [ ] **Write the edit script so it writes only after every replacement has matched.** All three were caught before anything reached disk, because the script held its result in memory until the last assertion passed
    - [ ] **When prose carries delimiters — backticks, quotes, backslashes — put it in a file and splice by reference** rather than through a shell heredoc. Two of the three above were the shell layer silently eating a character

### The four questions the rebuild document must answer that nothing currently asks

*Added 2026-09-12, proposed by the tracker-publishing session as **verified absences** — each grepped across S4, S5b, S6 and S100 at `9aa42a4` and returning zero hits, rather than reasoned about. A fifth candidate was withdrawn on contact: "must be executable by a session that was not in S6" is already covered, `handover` appearing 8 times in S4, 4 in S5b and 3 in S6. **Each carries an amendment, per 7.3's reason-either-way and 7.9's rule against adopting a set unread.***

- [ ] 7.10 **What abandonment looks like — the rebuild has no stop condition.** Zero hits for `abandon`, `rollback` or reverting the cutover. The cutover is **one commit, no dispatcher, no flags, no gradual rollout**, which makes *"we are not going to finish"* a decision with no criterion attached. **A multi-sprint from-scratch rewrite with no stop condition does not get abandoned. It gets extended.**

  > **SEQUENCED 2026-09-12 on the owner’s instruction.** **FIRST within task 7.** It is the item that becomes UNWRITABLE later — nobody can decide what abandonment looks like while deciding whether to abandon. By task 7 the tripwire’s instrument exists (corpus coverage) and pricing the no-cutover fallback is pure planning, cheapest before anyone is invested.
  >
  > **UNRESOLVED UPSTREAM, found while verifying this sequencing: the tripwire’s review point attaches to phase group 1, and S6 task 3 — which defines the phases — is a USER DECISION that is still open.** 3.1’s own text calls the seven-phase list *“a description of a description until someone checks it”*. So 7.10 stays first, and **it cannot be FULLY written until task 3 resolves**; drafted against a provisional phase list, the tripwire ends up pointing at a boundary nobody kept.
  >
  > **SHARPENED 2026-09-12: it is worse than "task 3 is open". THE CANDIDATE ANSWER 7.10 WOULD HAVE INHERITED IS CONTRADICTED BY THE SOURCE** — see S6 task 3.0f. `grow` is **two calls straddling income, spending, withdrawal and tax**, so *"phase group 1 = grow + record + skeleton"* is **not a coherent first slice**: it would have to reach past the tax phase to include the second growth call. **The tripwire’s review point therefore has no boundary to attach to yet**, and drafting it against 3.1 as written would anchor it to a slice the engine does not have.

  - [ ] Build it as a **tripwire on an instrument that already exists** rather than as prose. Corpus coverage is already the metric: a rebuild sprint that does not increase it is a finding rather than a result. **Three consecutive such findings is a mandatory stop-and-review** — not automatic abandonment, and "continue, for this reason" is a valid outcome. It cannot be gamed because the denominator freezes at S5b task 4
  - [ ] **AMENDED: the tripwire starts at the phase-group-1 review point, not at sprint 1.** Coverage legitimately does not increase while the early sprints build the phase skeleton — there is no diffable output yet to cover anything. Three consecutive non-increases would fire on day one, on honest work, **and a tripwire that fires on honest work gets disabled**
  - [ ] Keep the pre-committed review after **phase group 1** (grow + record + skeleton — the first diffable output), because that is the first moment real effort data exists to review against an estimate
  - [ ] **PRICE THE FALLBACK NOW, and this is the stronger half.** S100's entire theme is spending the differential gate, and **S101, S102 and S103 are all authored assuming cutover happened.** If the rebuild stops, four authored sprints are invalidated and **nothing records that dependency anywhere.** Write down which of their tasks survive a no-cutover world — it converts an unknown into a number, at S6 prices rather than at S7-through-S99 prices

- [ ] 7.11 **Measure what the gate costs before promising to run it at every commit.**

  > **SEQUENCED 2026-09-12 on the owner’s instruction.** **SPLIT. The MEASUREMENT is an input to task 7, not a part of it — it runs after S4 task 7 and before this document is written.** S4 task 7.2 proves the differential harness **old-vs-old**, so the nine-gate decomposition is priceable the moment that harness exists: no rebuild, no S6 decisions, just wall-clock per gate. **That number then constrains what this document can honestly say about 6.8.** Filed as a task-7 item, the measurement would have happened while writing the document that depends on it; sequenced as an input, task 7 writes tiers from a number rather than from an intention. **The declared per-commit subset and the amendment to 6.8 stay here.** Zero hits for `runtime`, `wall-clock` or cost-per-commit. **6.8 requires green at every commit**: nine gates, the ninth through the built artifact and the real Worker, `monteCarlo` at full path count. **Nobody has measured one sweep.**

  - [ ] **This is measurable today, without the new engine** — S4 task 7 already runs green old-vs-old. Run the nine-gate decomposition against old-vs-old and record **wall-clock per gate**. The gate can be priced before the thing it gates exists
  - [ ] Declare tiers — **per-commit, per-sprint, at-cutover** — and amend 6.8 to *"green on the declared per-commit set at every commit, and on the full set at every sprint boundary"*, with **6.8a's only-grows rule applied to the per-commit subset as well** so it cannot quietly shrink
  - [ ] **AMENDED: tie the full-set run to the sprint's exit gate, not to "every sprint boundary".** A boundary is a date; an exit gate is a condition that must be true to close. Left as a boundary, **the per-commit subset becomes the real gate and the full set becomes ceremonial** — which is the decay this subtask exists to prevent
  - [ ] **AMENDED: re-measure when the corpus grows.** S5 task 5 adds the spec vectors and tasks 2 and 14 enlarge the fixtures, so a cost measured at S4 is stale before the rebuild starts. **Stamp the measurement with the commit and the corpus size it was taken at**, per §N *(Corrected 2026-09-12: "task 14" is S5's **pre-split** numbering — dividend-safe accounting was task 14 of the pre-split S5 (e.g. `d89b230`) and is now **S5b task 1**. S5b 3.6 describes the same growth as S5's tasks 5 and 2.)*
  - [ ] The reason this is not bookkeeping: **a rule too expensive to honour gets honoured in the easy case.** That is the same finding that produced the S101/S102 ground rules, aimed at 6.8 itself. Making the honest weaker rule explicit beats letting the strong one decay by attrition
- [ ] 7.12 **The rebuild reproduces known defects, deliberately — and nothing says so.**

  > **SEQUENCED 2026-09-12 on the owner’s instruction.** **SPLIT, on a HARD DEADLINE. The FIXTURES are S5b-or-earlier work — enforced at S5b task 4.5a, immediately before the corpus denominator freezes at 4.6.** A fixture added after the freeze changes the frozen set. **Only the RULE stays here:** the rebuild reproduces known defects deliberately, and repairing them is S100 work. **The unprotected-defect caveat inherits the same deadline** — S5b’s exit gate E5 is where that flag must be raised, because after the freeze nobody can add a fixture to clear it. Zero hits for reproduce-the-defect, bug-for-bug or must-not-fix. **The gate is an empty diff against an engine with open findings, and with three P19-excluded modules carrying eleven excluded finding dispositions.** *(Made explicit 2026-09-12: the previous wording said "eleven P19 exclusions", which is defensible as eleven excluded FINDINGS and reads naturally as eleven excluded MODULES. It is three modules. The ambiguity is left unresolved nowhere in this file, because it is exactly the ambiguity that produced the error corrected three bullets below.)* An implementer who encounters **Q45** — a negative cross-asset correlation silently zeroing a portfolio's modelled volatility — and **fixes it** will fail the gate and reasonably conclude their own code is wrong.

  - [ ] **Do not hand-maintain the list.** That is Q20/Q33/Q38 and it drifts. Put **a corpus fixture per known defect, tagged with its finding ID**, so the gate itself asserts the defect is reproduced. *"Do not fix it"* stops being a rule someone must remember and becomes **a test that fails if they do** — a documentation rule converted into an instrument, which is the direction everything else moved on 2026-09-12
  - [ ] **AMENDED, and this is the amendment to insist on: derive the defect list at REBUILD START, not from any list written in S6.** The proposal named Q43, Q44, Q45, Q47, Q48 and Q49 — **and S5 task 2 is going to close several of them.** A list written in S6 and read at S7 is a hand-maintained set that has drifted from its source: **Q20/Q33/Q38 reintroduced one level up, inside the very subtask whose mechanism exists to avoid it.** Derive from the open-question register at rebuild start, and the fixture mechanism stays sound *(Already happening, as of `dd67679`: Q48 and Q49 are repaired on `runPlan()`'s paths, Q47 is disclosed with candidate (a) undecided, and Q43 is mitigated, not repaired (`S2_CARRIED_WORK_REGISTER.md` §1). The list this bullet warns about has drifted before the rebuild started — which is its point. *(Corrected 2026-09-13, on a report from `investment-calculator-84`: Q47 is decided now, not undecided — disclosed-only, candidate (a) closed as "not implementing" (`S5_TASK_CHECKLIST.md` block 2f.2 / Task 00 item 6). Left uncorrected this would itself become a second instance of the drift this bullet exists to name.)*)*
  - [ ] **The reachability caveat is an output, not a footnote.** A fixture can only protect a defect **the corpus reaches**. Q44 may not be exercised by any of the 33 scenarios, and if no fixture reaches it the gate cannot protect it. **Publish the list of known defects with no corpus fixture** — that list is the set of behaviours an implementer could silently "fix" with nothing to stop them
  - [ ] That list is **floor 3's per-phase coverage question arriving from a different direction and landing on the same gap**: a claimed protection with no entry exercising it protects nothing, exactly as a claimed mode with no entry exercising it proves nothing
  - [ ] **P19's exclusions need a SEPARATE obligation, and the previous version of this bullet was wrong twice.** *(Corrected 2026-09-12 at round 19, verified in source at `05afbe6` before editing.)*

    > **What it said:** *"Record the **eleven P19 exclusions** the same way. They are real, undisputed defects parked behind un-bundling — an implementer who reads `mortgage-vs-investing.js` and repairs what they find there has done work **the gate will reject**."*
    >
    > **Wrong on the count.** `build.js` carries `excludedReason` on **three** modules — `debt-payoff-strategy.js`, `debt-strategy-adapter.js`, `mortgage-vs-investing.js`. **Eleven refers to finding dispositions, not modules**, and the two numbers sit adjacent in the ledger where they are easy to read as one. I read them as one.
    >
    > **Wrong on the consequence, which matters more.** The comparison gate supplies no such rejection while a module stays excluded. Four static checks, all confirmed at `05afbe6`: `installDebtModules()` installs **only** `BUNDLED_MODULES`, so the harness never loads an excluded module; `sourceFiles()` maps from `BUNDLED_MODULES`, so excluded contents are **deliberately omitted from the capture's source hashes**; and `tests/module-exclusion-registry.test.js` asserts the exclusion *set*, artifact absence, engine-call absence and harness installation — **zero behavioural assertions** on excluded values.
    >
    > **So a behaviour change confined to an excluded module moves neither the shipped engine's outputs nor the capture's source hashes.** A dedicated module witness or a named source-freeze check could detect it. **The behaviour comparator cannot be credited with doing so.**
    >
    > **It is the inverse of the S102 ground-rule-6 defect, and that is the framing to carry.** There, a gate was credited with detecting something it would have **misreported** — correct behaviour called a finding. Here, a gate is credited with rejecting something it **cannot see**. **Both are claims about what a check delivers, made without checking the check.**

    - [ ] **Split the obligation; do not widen the corpus.** Reachable legacy behaviour gets **finding-tagged characterisation fixtures under an explicit preservation decision** — that is the first half of 7.12 and it stands. P19 separately keeps **three module exclusions covering eleven finding dispositions**, each with its revival gate
    - [ ] **Excluded behaviour must NOT be imported into the supported comparison corpus merely to preserve its defects.** That would undo P19 in order to protect it — and `RC-04`'s revival contract exists precisely so those defects are recorded without being shipped
    - [ ] **If prohibiting excluded-source changes is the policy, implement it as a NAMED FREEZE CHECK.** It is a thing to build, not a protection to attribute to output comparison. Note also that updating a package manifest is not itself a behavioural failure
    - [ ] **Four acceptance witnesses, deliberately distinct**, because they test four different things: in an isolated copy, a harmless edit confined to an excluded module leaves the artifact and output comparison **unchanged**; a source-freeze check rejects it **only if that check is the declared policy**; reintroducing an excluded module **trips the exclusion guard**; and a reachable output change **trips the behaviour comparison**
    - [ ] **No mutation to an excluded module was made to observe any of this** — the conclusion is source-based, by both the audit and this checklist. If the four witnesses are built, they run in an isolated copy

  - [ ] **Q56 — preserve the smart-withdrawal presets' identical outputs, and do not "fix" them: this is reference material by the owner's explicit direction, not a defect.** *(Added 2026-09-12 on the owner's instruction. `SPRINT_QUESTIONS.md` Q56; traces in `SIMULATION_LOG.md` Batches 17 and 24.)* `retirement.optimizationGoal`'s five presets **frequently produce identical output across all five values**. Q56 records that the owner does not want the current smart-withdrawal system repaired, and intends to use its present behaviour as input to a **new smart-withdrawal system designed after the rebuild**.

    - [ ] **The empty-diff gate will force the rebuild to reproduce the collapse.** An implementer who notices five selectable goals producing one answer and corrects it **breaks the gate and destroys the reference the owner asked to keep** — the same trap as every other preserved behaviour in this item, arriving from a decision rather than from an open finding
    - [ ] **Record it as preserved-by-decision, not as a known defect.** It must not enter a defect list, a repair backlog, or a reproduce-now-repair-later queue. Its disposition is **redesign after cutover**, and conflating it with the defects above would schedule a repair the owner has declined
    - [ ] **The UI consequence is outside this sprint and recorded so it is not lost:** a layout offering five goals whose outputs are identical presents a choice the engine cannot distinguish. That belongs to whichever sprint surfaces the presets, not to the rebuild

- [ ] 7.13 **Name the frozen inputs, and give each one an invalidation SCOPE rather than a boolean.**

  > **SEQUENCED 2026-09-12 on the owner’s instruction.** **AFTER 7.10, and task 7 is the FIRST moment it can be written completely.** It needs every freeze to be KNOWN: the S5b baseline and corpus have frozen by then, and the RNG (6.12) and quantisation grid (6.15) freeze during S6 itself. **Earlier, the list is incomplete; later, the rebuild has already started against unrecorded assumptions.** The invalidation SCOPES are the part that must not slip — without them one legitimate input change reads as *“the whole gate is untrustworthy”* and gets ignored. The rebuild depends on the S5b-frozen baseline, the RNG as a frozen artifact (6.12), the market-data vintage, the rules JSON embedded in `app-shell.html`, the quantisation grid (6.15), the 33-scenario corpus, and `src/engine.js` itself. **Across S7–S99 some of these will be touched, and nothing says which are frozen, by what, or what happens if one moves mid-rebuild.**

  - [ ] A manifest with hashes, **recomputed by the gate rather than trusted.** That is **P6-02 exactly** — metadata is a claim about content, not the content
  - [ ] **Give each input an invalidation scope, and this is the part that matters more than the freeze.** Market data moving invalidates `historical` comparisons only; the RNG moving invalidates `monteCarlo` only; the rules JSON moving invalidates everything. **Without scopes, one legitimate change to one input reads as "the whole gate is now untrustworthy" — and the practical response to that is to ignore it**
  - [ ] **AMENDED: name who may change each input and by what process.** *"Frozen"* with no enforcement is a label, not a constraint. An input whose freeze nobody owns will be changed by someone who did not know it was frozen, and the manifest will record that it moved without recording that it should not have
  - [ ] **AMENDED: `src/engine.js` is already frozen by S5b task 4 — reference that freeze, do not re-declare it.** Two freezes on one file is two things to keep in step, and the second one to be written is the one that goes stale. The manifest cites S5b task 4 as the authority and records only the hash
  - [ ] Cross-reference **6.12**: the RNG's freeze is stated there as a design decision and here as an enforceable input. **Both are needed and they are not duplicates** — 6.12 says what must be reproduced, this says what happens if it moves

### What it must not do

- [ ] 7.7 **Do not start writing the new engine.** S6 ground rule 8 governs this task as much as any other — **and this is the task most likely to blur that line**, because decomposing work into tasks and beginning it feel adjacent. The output is a document
- [ ] 7.8 **Do not restate task 6's register as rules.** Some entries are genuinely rules (6.4's coding standard), some are genuinely decisions (6.7's migration strategy), and **sorting them is the work rather than a formatting step**
- [ ] 7.9 **Do not resolve the five floors by adopting all of them.** Adopting everything is indistinguishable from not having read them, and 7.3's reason-either-way requirement exists to make that visible

**Gate:** a committed rebuild checklist exists, with ground rules, a definition of done, a close-out that collects its gates, and a task decomposition. Every one of task 6.8's floors **and each of 7.10 through 7.13** is adopted, amended or rejected with a recorded reason. **The rebuild does not begin until this file exists.**

**Why this is S6's last task and not S6's first.** It depends on everything else in the sprint, and it is the one deliverable whose absence is invisible: the plan reads as complete because S7–S99 are reserved, and a reserved number looks like a plan.
---

## Ground rules

Carried from S4 and S5, with two additions:

1. Every task states its own gate. **For design tasks the gate is *artifact exists, reviewed, agreed*** — not *a test passes*.
2. Per-task durations are **floors, not targets.**
3. No task may weaken an existing test to pass.
4. Any figure taken from a specification is cited by document and section.
5. Re-locate by symbol, not by line.
6. Commit per task.
7. **Record findings rather than fix them** where a fix requires a policy judgment.
8. **Do not start writing the new engine.** Tasks 3, 4 and 5 must be agreed first. A rebuild begun before its decomposition is settled encodes whatever shape the first author had in mind.
9. **A module is not *done* until it is reachable by a user.** *(Standing rule, adopted here, applying to every sprint from now on.)*

   "Built" and "wired" have split apart repeatedly and the cost is now measurable. The Social Security stack (9 modules, fixture-verified), the reserve/dividend/grading adapters, and most of the debt modules are all built and unreachable — and the S3 audit spent most of its findings on that dead code rather than on the product. Q33 exists *because* a module was bundled but unbound. `mortgage-vs-investing.js` was built in S3, un-bundled by P19 two days later, and now carries a revival contract instead of a user.

   **The rule:** a task that creates a module also wires it and surfaces it, or the task is explicitly split with the wiring scheduled at the same time — never "later."

   **The one standing exception, which expires at cutover:** during the rebuild window, wiring a feature into the engine being replaced is work done twice. That exception is *why* the current backlog exists, it is deliberate, and it is discharged in S103. It does not license new instances — anything built from cutover onward is wired in the same sprint.

10. **New: a decision is recorded when it is taken, not at close-out.** Task 6 is open from day one. A decision reconstructed weeks later has lost its reasoning, and a decision without its reasoning is an assumption waiting to be relitigated.

## Stopping points

- [ ] Task 1.5 shows CPI-U adoption moving a fixture — **the transform is wrong and must not be papered over**
- [ ] Task 2 cannot reach a real iPhone. **This does not block the sprint**, but it must be recorded as an unmeasured risk against every memory decision in tasks 4 and 5 — a budget set from inference must never be allowed to look like one set from data
- [ ] Task 3 cannot place an ordering constraint the audit record establishes — a decomposition that cannot express a known constraint is the wrong decomposition
- [ ] Task 4b's acceptance test fails: adding one of the five queued account types **as a declaration only** still requires an engine edit
- [ ] Task 5's memory arithmetic does not fit the measured budget with headroom below the 50% pressure rung
- [ ] 6.12 cannot state the RNG seeding as a reproducible specification — **`monteCarlo` mode cannot be cut over without it**, and discovering that mid-rebuild is far more expensive than stopping here
- [ ] Task 7 cannot decompose the rebuild because tasks 3, 4 or 5 are unresolved — **that is a stop, not a reason to write a decomposition of an unagreed design**
- [ ] **Any USER DECISION task reaching its stop point without an answer**

## Close-out

- [ ] 1. **The agreed phase list**, with every ordering constraint justified by the audit record rather than by intuition
- [ ] 2. **The field registry and entity registry schemas**, each with its worked example — a new field added end to end, and a new account type added as a declaration with no engine edit
- [ ] 3. **The retained field set**, classified across all four axes, with the memory arithmetic shown and the raw-path allowance included
- [ ] 4. Which `ROADMAP_EXTERNAL_REVIEW.md` §6 hardware figures are now **confirmed**, **revised**, or **still unmeasured** — carried forward from S4 close-out item 9 and updated
- [ ] 5. **The design decisions register, complete** — every decision with its reasoning
- [ ] 5b. **Task 7's rebuild checklist, committed**, with its ground rules, its definition of done, and every one of 6.8's floors adopted, amended or rejected **with a reason recorded either way**
- [ ] 5a. **6.12 specifically** — the RNG specification, the draw order, and the statement that seeding keys to the global path index. It is the one design decision whose violation cannot be detected until `monteCarlo` refuses to diff clean
- [ ] 6. Confirmation that the engine reports which **tax year** and which **dataset vintage** it computed with, and that adding a hypothetical 2027 vintage requires no engine edit
- [ ] 7. **A go/no-go on starting the rebuild**, with anything still blocking it named explicitly. **It is not a go until task 7 has produced the rebuild checklist** — a go/no-go on work that has no document decides nothing
- [ ] 8. **Ask the user: whole-model or new-code-only for the S6 handover.** Note that this sprint produces almost entirely documents, which may make an external audit round a poor fit — raise that rather than assuming
