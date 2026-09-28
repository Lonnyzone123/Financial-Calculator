# S5b — task and subtask checklist

| Field | Value |
|---|---|
| Sprint | **S5b** |
| Track | **N** — continues from S5 |
| Theme | **Close the reference engine's books.** The two market-data corrections, the runtime disclosure contract, the register re-harvest, and the definitive baseline. |
| Runs after | S5 (correct the reference engine) |
| Runs before | S6 (design the rebuild) |
| Questions | **Derive at sprint start.** See `S4_TASK_CHECKLIST.md` §C2 — canonical, not restated here. |
| Handover | Ask at close-out. Do not presume. |

---

## ⚠ Split from S5 on 2026-09-12, at the user's decision

**S5 reached 18 tasks — the largest sprint in the plan. The seam is after S5 task 13** because the tax block ends there and everything after it is independent of the tax work: two market-data corrections, a runtime contract, a read-only re-harvest, and the baseline capture.

**It is named S5b rather than renumbering S6 onward**, deliberately. S100, S101, S103 and both artifacts all name S6 tasks by number, and those references were swept clean in the 2026-09-11 re-sequence. A suffix costs one awkward name; a renumber costs a fresh sweep and a fresh chance to miss one.

**The complete old-ID → new-ID move table is `S4_TASK_CHECKLIST.md` §R2** — the single definition, updated with this split. Old S5 tasks 14 / 15 / 15b / 16 / 17 are this sprint's **1 / 2 / 2b / 3 / 4**.

## Why the seam is here and not elsewhere

Tasks 1 and 2 are **market-track corrections** (`MARKET` P0 #2/#3 and the property-tax honesty fix) that touch no tax path. Task 2b is a **result-contract** change. Task 3 is **read-only**. Task 4 **closes the books**.

None of them depends on the tax block, and the tax block does not depend on them — so a sprint boundary here costs nothing but a handover, and buys a checkpoint before the single most consequential artifact in the plan gets captured.

## The discipline carries over unchanged

**Predict the diff before you run it.** Tasks 1 and 2 move financial output and run through **S4 task 7's differential harness** with the shape of the movement written down first. **An unpredicted movement is a finding, not a result to accept** — S5 ground rule 10, and it applies here identically.

## Preconditions

- [ ] **S5 is closed** and its handover answered. *(**Split, 2026-09-16 by bd9f75.** **S5 is closed:** TRUE, at `420a910` — the owner answered "yes" in chat on 2026-09-16 to closing S5 within its recorded scope, on the run's GO recommendation. Qualifiers carried forward, not softened: not an external sign-off (the last external verdicts said "keep S5 open," and no external reviewer has examined R9's or R10's repairs); not release qualification (`TAX §10.3`'s six blockers still block); the provisional decisions listed in `S5_AUDIT_HANDOVER_20260916_CLOSEOUT.md` §7.2 are carried unsettled; 31 lines remain open by decision, 243 ticked. **Its handover answered:** NOT TRUE, by the same standard S4's own version of this line used — S4's read "answered" only once an external reviewer's sign-off actually arrived (`4cc563d`, "ACCEPTED within the recorded scope and carry-forward conditions"). S5's handover has had no external reply of any kind. The owner's internal closure decision closes S5; it does not answer the handover. This precondition's second half stays open until an external answer lands — not this session's or the run's to close.)*
- [ ] `npm test` exits 0. Confirm `RC-04` (decision register P19) is still the only deliberately-excluded witness. *(**Corrected 2026-09-12:** false by sprint start — there are **eight** deliberately-excluded witnesses (`RB-03`…`RB-08`, `RC-03`, `RC-04`, re-derived at `dd67679`). **Derive the set by name** with `S4_TASK_CHECKLIST.md` §C's command instead of confirming a number.)*
- [ ] **S4 task 1** (`.gitattributes`) has landed. If it is still held open, **task 4 cannot run** and this sprint holds open with it — see the dependency note below.
- [ ] Capture the pre-sprint baseline with the verified harness, on the normalised tree.
- [ ] **S4 task 2b.2 confirmed `tools/verify-test-gate.js` fires.** Task 4.5 uses it as the gate before the definitive baseline is captured; if 2b.2 found it accepting a skipped DOM test, that is fixed before task 4 runs.

- [ ] **S5AA is closed before this sprint starts.** *(Added 2026-09-19 (UTC−7) at `3ec8adf` by the S5AA task-list session [a90ab6]. Nothing above is rewritten.)* S5AA is a repair sprint between S5 and S5b. It was opened by three external audit passes on the closed S5 engine (findings F1–F10 and G1–G19; the third pass was hand-traced and ran nothing) and by a local bug hunt (H-01–H-06, reproduced by script). Two of the owner's answers of 2026-09-17, as recorded in the S5AA draft: S5AA runs **before** S5b, because task 4's definitive baseline would otherwise freeze the defects; and the audit is **not** the answer to S5's handover, so the second half of the first precondition above stays unmet. The S5AA task list and its close-out list are **drafts in `Handover temp/`, untracked, and nothing has started**: they wait for the owner's go and about twenty decisions. S5b stays not started (the owner, 2026-09-16), and task 4's capture is taken only after S5AA's last output-moving commit. The close-out draft also lists items outside the F/G findings that touch S5b's own work (its five-task block, Q43/Q44/Q45 and task 2b, Q47/Q49/Q50, S4's carry-forwards). **Which sprint owns each is an open decision, not settled here.**

- [ ] **Follow-up, 2026-09-19 (UTC−7), by the S5AA task-list session [a90ab6]; nothing above is rewritten.** The note in the previous bullet said the S5AA lists were drafts "waiting for the owner's go and about twenty decisions". **That is out of date:** the owner has since answered the decisions in chat (none open), and `S5AA_TASK_CHECKLIST.md` now exists as the plan of record. **S5AA has still not started; the go is the owner's own,** and this precondition stays unticked until S5AA is closed. One S5AA decision routes work here: see the note under Task 1 (the dividends-on gap carried from S5AA 12.9).

## Dependency order

```
1 (dividends)      ──┐
2 (property tax)   ──┤
                     ├──► 2b (flag, don't guess) ──► 3 (re-harvest) ──► 4 (definitive baseline — MUST BE LAST)
S5 task 2  ──────────┤          ▲
S5 task 4  ──────────┘          └── 2b needs S5 task 2's decisions (what Q43/Q44/Q45 do)
                                    and S5 task 4's UNSUPPORTED vocabulary
```

**Tasks 1 and 2 are independent of each other** and of everything else here.

**Task 2b carries two dependencies back into S5** and they are the reason it sits where it does: S5 task 2 decides *what* Q43, Q44 and Q45 should each do, and S5 task 4 defines `UNSUPPORTED`. This task decides *how any of it is reported to a user*. Run the other way round and the sprint ships three mechanisms for one contract — the Q20/Q33/Q38 pattern created rather than closed.

**Task 3 must follow 1, 2 and 2b**, because it re-harvests registers over everything S5 and this sprint changed.

**Task 4 must be last, and needs S4 task 1 to have landed.** If `.gitattributes` is still held open when 1–3 are done: **do not start 4.** Hold the sprint open, or move S4 task 1 and this task to the front of S6 together. Capturing the definitive baseline on a non-normalised tree hands the rebuild an oracle only one machine can reproduce — exactly what Q39 describes.

---

## Task 1 — Dividend-safe accounting and yield-versus-return (MARKET P0 #2, #3)

`MARKET §1` executive decisions 3 and 4.

- [ ] 1.1 **Never count dividends twice.** A total-return series already assumes reinvestment. Total-return mode and cash-dividend mode **must not both credit the same distribution**
- [ ] 1.2 Model price return and cash distributions separately where dividends fund spending as cash
- [ ] 1.3 **Do not treat a yield as a return.** Label every cash and bond input as `yield`, `price`, or `total_return`
- [ ] 1.4 Audit the existing dividend path — `dividendEligibleAccounts()`, `takeCashFromAccounts()`, the imputed dividend rate — against 8.1. Note that R4's repair already found the zero-return cash holding being charged an imputed dividend
- [ ] 1.5 Add a test that fails if both modes credit the same distribution

**Gate:** MARKET P0 exit conditions met. **This moves financial output** — predict what moves before regenerating, and treat an unpredicted movement as a finding.

> **Carried in 2026-09-19 (UTC−7) from S5AA decision 12.9 (the owner, in chat; the S5AA draft is untracked in `Handover temp/`).** S5AA changes no dividend output: `dividendStart` is defined as when modelled dividend cash starts being paid out to spend, and the imputed 1.5% charge on the `dividendOn:false` path stays, because `MODEL_ASSUMPTIONS.md` §5 says it is deliberate. **The gap carried here:** with `dividendOn:true` the engine taxes no dividends before retirement whatever the yield (the cash path starts at `max(age, retireAge, dividendStart)`), while the `dividendOn:false` path charges the imputed rate from row 0. Decide whether reinvested dividends before the start are taxed on the dividends-on path, without double counting (1.1). That would move output for dividends-on plans only, and it overlaps 1.4. **Starting evidence, one synthetic case** (age 40, retiring at 55, simple method) read at `3ec8adf`: about $29,000 of tax over 15 years between the two paths before retirement. It is not a general figure, and no IRS source on reinvested-dividend treatment was read. Reported by the S5AA session; this is not a task until the plan owner words it.

## Task 2 — Arizona property tax: the *correction* only

**Cut back 2026-09-10.** Measured first: `property tax` appears **once** in `src/engine.js` and four times in `src/app-shell.html`; `LPV`, `assessedValue` and `assessed` appear **zero times**. There is a flat rate input and nothing else.

`MARKET §1` decision 9 asks for assessed value, exemptions, levies, caps, overrides and special districts as *separate concepts* — **that is a model that does not exist, which makes it a feature build, not a correction.** Building it into an engine about to be replaced is work done twice. Split accordingly:

**In scope here — the honesty corrections, which cost almost nothing:**

- [ ] 2.1 A national effective rate is presented as a **rough fallback**, never as a forecast of a specific bill. This is a labelling fix on an existing input
- [x] 2.2 Correct the stale `FEATURES.md` claim that the Arizona LPV "no reset at sale" rule is absolute — it has statutory exceptions *(**Done 2026-09-16 (UTC−7) by bd9f75**, in passing while closing S5 close-out item 15 — same claim, same fix.)*
- [ ] 2.3 Record the 1% constitutional limit and its exceptions as a **documented known gap** with a citation, so the figure does not need re-researching when it is built

**Deferred to S103** — the actual property-tax model: assessed value, exemptions, levies, caps, overrides and special districts as separate concepts. MARKET P0 #4's exit condition moves with it.

**Gate:** no user-facing text presents the fallback rate as a specific-bill forecast; the LPV claim is corrected; the gap is documented with its source.

## Task 2b — The "flag, don't guess" contract (`TAX §10.2`, `ACCOUNT §19`) — **NEW**

**Added 2026-09-11 from a sweep of the three specification documents against sprint coverage. `TAX §10` and `ACCOUNT §19` were cited in no sprint at all.**

**Both specs state the same rule in different words**, and it is the rule three separate findings have now broken:

- `TAX §10.2` — *"Set a visible flag rather than silently approximating"* — and lists seven input categories that must raise one, including collectibles / unrecaptured §1250 / §1202, material AMT adjustments, multiple states or part-year status, and **missing basis, acquisition date, pension source or IRA basis data needed to classify income**.
- `ACCOUNT §19` — *"Return an unresolved result, not a guessed number, when a material fact is absent"* — with a per-module table of minimum facts and stop conditions for IRA deduction, Roth distribution, employer Roth, RMD, inherited accounts, backdoor and mega-backdoor Roth, NUA, HSA, 529 and Arizona.

**Why this is a defect and not a feature request.** The engine does not merely fail to model these — it **returns a confident number for them**. That is a wrong answer under this sprint's own wrong-answer-versus-not-modelled test, and it is precisely the shape of **Q43** (a $150M withdrawal with `status: "ok"`), **Q44** (spending an asset the display says is not counted) and **Q45** (a zero-volatility portfolio from an invalid correlation). Three instances in two days, all of the same rule being absent.

**Named here too, 2026-09-14 (the owner's answer to Proposal 12): `Q47`.** The Social Security earnings test is this family's sharpest instance, not merely a related case — S5 task 2f's own words are *"those three are silently wrong. This one is actively claimed"*: a disclosure page stated a rule the engine did not apply. Q47's own direction was already decided and landed (disclosed-only, `c9f76ee`), so it needs no routing through 2b.5's mechanism — but naming it here closes S5 task 2f.4, which held pending exactly this pairing.

**Note the trap in how this sprint already handles the gap.** Tasks 5 and 10 record unsupported cases as `UNSUPPORTED` (retired from `UNREPRESENTABLE`, S5 task 4.3, 2026-09-14) **in test fixtures**. That is a statement to *us*, in the test suite. It is not the engine telling a *user* at runtime that their input left the modelled space. Satisfying the first and calling the second done is the same substitution this project keeps finding.

**Scope deliberately: the contract and the inventory, not the full implementation.** Implementing every `§19` stop condition is a large build on an engine about to be replaced — the same reasoning that deferred withholding. So this task does what task 6.11 does with the three-ledger contract: it establishes the **structure** and hands the rebuild a list.

- [ ] 2b.1 Inventory every `TAX §10.2` category and every `ACCOUNT §19` row against the engine: does it flag, silently approximate, or not arise? **The count of "silently approximates" is this task's real output**
- [ ] 2b.2 Adopt `UNSUPPORTED` from **task 4**'s vocabulary as the runtime status, not a new term. Task 4 already defines it as *"engine does not have the inputs needed for a reliable calculation — stop, route, or return a bounded estimate with a warning"*; this is the task that gives it a consumer
- [ ] 2b.3 Define **one** mechanism for surfacing it — a field on the result contract, reachable from `runPlan()`. **Not a console warning and not debug-only JSON:** `FEATURES.md` already records that engine-level warnings *"currently only reach the debug/JSON export, not a panel a user would see"*, and a flag no user sees is the defect this task exists to fix
- [ ] 2b.4 Wire the **three or four highest-count** categories from 15b.1 and no more. Record the rest as a list the rebuild inherits
- [ ] 2b.5 Route **Q43, Q44 and Q45** through this mechanism rather than each inventing its own — task 2 decides *what* each should do, this decides *how it is reported*. Sequence accordingly: task 2 first, this after. **Q45 specifically, clarified 2026-09-13 on a question from `investment-calculator-84`:** S5 task 2d.3 decided (d) — defer the actual repair (a calibrated correlation matrix) whole to S103, `Math.max(0, variance)` staying the only guard for the life of the old engine. That decision is about the *fix*, not the *disclosure*. Routing Q45 through this mechanism is a separate, milder action — flagging the invalid-correlation case rather than silently returning a confident zero-volatility number — and is exactly the "flag, don't guess" pattern this task exists to build. **It is intended and unaffected by 2d.3's deferral**, not a stale reference to a routing that no longer exists
- [ ] 2b.6 **This is a result-contract change.** Predict the diff per ground rule 10; adding a warning field should move no financial number, so a moved number is a finding

**Gate:** one mechanism, reachable from `runPlan()`, with the inventory published as a count. Q43/Q44/Q45 all report through it. The categories left unwired are named, not implied.

## Task 3 — Re-harvest the two registers — **NEW, and it is the whole reason they were built early**

**Added 2026-09-11 with the re-scope; moved to S5b 2026-09-12 with the split. Read-only. Must follow S5 in full and this sprint's tasks 1–2b, and precede task 4.**

**S4 tasks 8 and 9 built the requirements register and the test classification against the engine as it stood then.** S5 has since changed the tax paths substantially, added a spec-vector suite, repaired two live debt defects, and consolidated three registries. **Both harvests are now incomplete.**

The split is deliberate, and it is the answer to a real dilemma: a register built **once and early** goes stale before it is used; a register built **once and late** arrives after there is time to act on it. Building it early gives you the `UNGUARDED` list with a sprint's worth of room to close it; re-harvesting here gives you completeness. Neither alone does both.

- [ ] 3.1 Re-run **S4 task 8**'s harvest. Every audit-fix comment this sprint added — and every one it *changed the meaning of* — appears in the register with a guarding test or an explicit `UNGUARDED` marker
- [ ] 3.2 Report the **`UNGUARDED` delta**, not just the new total. Did this sprint close entries, open them, or both? An `UNGUARDED` count that went *up* across a correctness sprint is a finding
- [ ] 3.3 Re-run **S4 task 9**'s classification over every test file S5 and this sprint added — the spec vectors, the Arizona boundary tests, the SE-tax combined-cap test, the QCD cap and sublimit tests, the Q43 consequence test
- [ ] 3.4 **Re-check task 9.4's list.** Behaviours guarded only by implementation-coupled tests were supposed to get implementation-independent equivalents during this sprint. Say how many did, and name the ones that did not *(**Scheduled 2026-09-13 (the owner):** the implementation-independent guards are written in S5 block 2r, and this subtask is their deadline and re-check. Severity: the 18 test-level coupled items high, the other 39 medium. The closeout check holds each item to this deadline.)*
- [ ] 3.5 Cross-check against `SPRINT_QUESTIONS.md` closures so a requirement retired by a question closed in S5 or here is not resurrected
- [ ] 3.6 Re-state **S4 task 7's differential-harness corpus coverage** as a final number — S5's spec vectors (task 5) and enlarged fixtures (task 2), and this sprint's task 1, all joined the corpus after the harness was built

**Gate:** both registers describe the engine as it is at the end of this sprint — which is the end of all pre-rebuild engine change — not as it was at the start of S4. The `UNGUARDED` delta is stated. Task 9.4's list is either empty or has a named owner per remaining item.

**Why it is not part of task 4.** Task 17 closes the *engine's* books — version, package, baseline. This closes the *record's* books. They are different artifacts with different failure modes, and folding a read-only harvest into the task that captures the definitive baseline is how a harvest gets skipped under time pressure.

## Task 4 — R2-T08: version, package, and capture the definitive baseline

**Must be last in this sprint and in the whole pre-rebuild sequence. Requires S4 task 1 (`.gitattributes`) to have landed. This closes the reference engine's books.**

- [ ] 4.1 Confirm **S4 task 1** landed — the definitive baseline must be captured on a normalised tree
- [ ] 4.2 Bump `ENGINE_VERSION`
- [ ] 4.3 Rebuild `investment-calculator-v2c.html` from `src/`
- [ ] 4.4 Regenerate `SHA256_MANIFEST.txt`
- [ ] 4.5 Confirm `tools/verify-test-gate.js` (R4-F2) passes — it must fail rather than accept skipped DOM tests
- [ ] 4.5a **LAST MOMENT for a characterisation fixture. Confirm before capturing, not after.** *(Added 2026-09-12 on the owner’s instruction, from S6 task 7.12’s deadline rather than its filing.)* **The corpus denominator freezes at 4.6.** A finding-tagged fixture for a known defect that is not in the corpus **before that moment is not in the denominator the rebuild measures against** — and one added afterwards changes the frozen set, which is the single thing the freeze exists to prevent.

  - [ ] Every known defect either **has a characterisation fixture tagged with its finding id**, or is **named in E5’s unprotected list**. There is no third state, and **after 4.6 neither can be changed**
  - [ ] **The obligation is S5b-or-earlier work; this subtask is only where it is ENFORCED.** Filed as part of S6 task 7.12 it would have been written after the deadline it depends on — *filing an item where it will be written is not the same as filing it where it must be done*

- [ ] 4.6 **Capture the definitive reference baseline.** This is the artifact S6 freezes and the rebuild diffs against for its entire life. Hash it and state it unambiguously. **Confirm before capturing: Q54's ordinary and adversarial debt sets are already frozen, versioned and pinned** (`S4_TASK_CHECKLIST.md` 4.6 named this capture explicitly as the deadline — "before S5b task 4.6" — and per the owner's SPLIT AND VERSION decision, S4-PA-12, done at `d3dc52a`/`b9db405`, gate met `9fa2713`). Named explicitly here rather than left implicit, per this project's own convention, since nothing else in this task's own text pointed back at it. *(Added 2026-09-13, later the same day, on a report from `investment-calculator-bd`, who flagged it as worth confirming without checking it themselves; checked here and found genuinely missing.)* **Also confirm before capturing, added 2026-09-16 on a report from `investment-calculator-4c`/S5 Kickoff:** neither corpus (control or expanded) has ever drawn a `selfEmployment`-type `otherIncomes` entry or a `priorYearFicaWages` field — both are S5-added inputs (tasks 7 and 11) with zero corpus coverage. If the definitive baseline should exercise either, the corpus needs a member that does before this capture, not after.
- [ ] 4.7 Verify it reproduces byte-identically from a **fresh clone on a different machine** *(**Scope corrected 2026-09-16, per the owner's answer to S5's question 10 (A), on a report from `investment-calculator-4c`/S5 Kickoff.** 4.7's corpus-invariant ROUND-TRIP check re-runs the *current* engine against the stored control capture and requires identical results — which means it blocks ANY output-moving commit landing after the control was captured, not just changes to this baseline itself. The owner's answer: ROUND-TRIP runs against the engine that actually captured the control (`e157733`, tagged `s5-u4-successor-control`), not against whatever engine happens to be at HEAD when 4.7 runs. S5 task 8 (Arizona) is written and gated on this understanding.)*
- [ ] 4.8 Record honestly what is and is not audited in this version

**Gate:** packaged artifact hashes to the harness pin; the version identifies exactly this state; the baseline reproduces off-machine.

---

---

---

## Ground rules

**Carried from S5 unchanged.** They are not restated in full; the two that bite hardest here are named because this sprint's tasks 1 and 2 are the ones most likely to trip them.

1. Every task states its own gate. Not done until the gate passes **and** `npm test` is green.
2. Per-task durations are **floors, not targets.**
3. **No task may weaken an existing test to pass.**
4. Any figure from a specification is cited by document and section.
5. Authority status is a **typed field**, never prose — the vocabulary is whatever **S5 task 4** chose. **No task invents a value.**
6. Re-locate by symbol, not by line. Record drift.
7. Commit per task.
8. **Record findings rather than fix them** where a fix requires a policy judgment.
9. **No feature wiring.** Defects only. Wiring belongs to S103+.
10. **Predict the diff before regenerating.** Write down what you expect to move, and roughly how much, *before* running the harness. **An unpredicted movement is a finding.**

## Stopping points

Stop and hand over rather than continue if **any** of these occur:

- [ ] Task 1's fixture regeneration produces a movement it did not predict (ground rule 10)
- [ ] Task 2b cannot reach a single reporting mechanism — three findings each inventing their own is the outcome this task exists to prevent
- [ ] Task 3's `UNGUARDED` count went **up** across S5 and this sprint without an explanation
- [ ] `tests/reconciliation-invariant.test.js` goes red and is not green again within the task that broke it
- [ ] **S4 task 1 is still held open when tasks 1–3 are done — hold, do not run task 4**

## Exit gate — what must be **true**, not merely **reported**

**Added 2026-09-12.** Six of the eight sprints had a close-out and no exit gate, and they are not the same document: **the close-out reports; the exit gate decides.** Every downstream precondition that reads *"S<prev> is closed"* resolved to whatever the closer said it meant. **A checklist that lists gates is not a checklist that collects them.**

**Common clauses, applying to every line below.** Each item **names its evidence and the commit it was true at** (S4 §N's stamping convention). `npm test` exit 0 is **recorded, not assumed**. **A no-go must name what is missing and what it blocks** — a verdict that can only say yes is 6.8's vacuous pass in another costume. The verdict is the user's, on a stated recommendation. **A line that cannot be made true is not a reason to soften it:** record it, say what it blocks, hand it forward. An exit gate relaxed to let a sprint close converts a known gap into an unknown one.

### This sprint is closed when every line below is true

**This gate is the strictest of the five, deliberately.** It freezes the reference baseline the **entire rebuild** diffs against for however many of S7–S99 it takes. **A soft close here is the only one that cannot be repaired later**, because everything downstream is measured against the artifact it produces.

- [ ] **E1. The definitive reference baseline is captured, WITH ITS HASH AND THE COMMIT**, and reproduces byte-identically from a fresh clone on a second machine
- [ ] **E2. `tools/verify-test-gate.js` was confirmed FIRING BEFORE the capture**, not merely present. This sprint's own precondition requires it; the gate collects **proof it was honoured**, not proof it was read
- [ ] **E3. The corpus denominator is fixed and STATED AS A NUMBER.** Every later coverage claim in the rebuild is a fraction of it, and a fraction whose denominator nobody wrote down is not checkable
- [ ] **E4. Per-phase non-trivial exercise counts are recorded.** **S5b is the only moment this can happen** — after the freeze it is too late, because the corpus stops moving and nobody re-derives what each phase actually exercises
- [ ] **E5. Every known defect with NO corpus fixture is flagged as unprotected, by name.** That list is the set of behaviours a rebuild implementer could silently "fix" with nothing to stop them — S6 task 7.12's caveat landing here rather than in the rebuild
- [ ] **E6. Task 1's dividend change is green old-vs-old AND demonstrated detecting an injected difference**, both halves
- [ ] **E7. No fixture moved, or each that did is named and explained** — and per ground rule 3 as amended, explained *before* it was regenerated
- [ ] **E8. Task 4's dependency on S4 task 1 (`.gitattributes`) is either discharged or recorded blocked with the blocker named**
- [ ] **E9. Every USER DECISION answered or owned**, including task 2b's disclosure-contract directions

**The verdict here is binary by nature:** the baseline is frozen and is the oracle, or it is not. **There is no partial state the rebuild can start against.**

## Close-out

- [ ] 1. **The predicted-versus-actual diff record for tasks 1 and 2.** Together with S5's, this is the differential harness's full qualification record
- [ ] 2. Any task whose real size materially exceeded its floor
- [ ] 3. **Task 2b's "silently approximates" count** — the number of `TAX §10.2` / `ACCOUNT §19` categories where the engine returns a confident number it should be flagging, and which of them got wired
- [ ] 4. **The `UNGUARDED` delta from task 3**, and S4 task 9.4's remaining list of behaviours needing implementation-independent guards
- [ ] 5. **The definitive reference baseline hash** — S6 freezes it, so it must be unambiguous
- [ ] 6. Confirmation a fresh clone on a different machine builds and tests green
- [x] 7. Two stale market-track claims in `FEATURES.md`, if S5 did not fix them in passing: the DRIP lot count is approximately **40**, not 41; and the Arizona LPV "no reset at sale" rule has statutory exceptions *(**Done 2026-09-16 (UTC−7) by bd9f75, closing S5's own close-out item 15.** Both fixed in `FEATURES.md`. Nothing carries here.)*
- [ ] 8. **`MODEL_ASSUMPTIONS.md`** — task 2's labelling fix lands here, and so does Q44's reading (a) if that was the choice
- [ ] 9. **A statement that `src/engine.js` is now feature-frozen.** Task 4 is the last planned change to it; from that commit the differential harness diffs every new-engine commit against this one hashed baseline. A feature added to the old engine after this point invalidates the harness's old-vs-old proof and gets built twice
- [ ] 10. **Ask the user: whole-model or new-code-only for the S5b handover.** This sprint moves financial output in two tasks and changes the result contract in a third, which argues for whole-model — but it is the user's call
