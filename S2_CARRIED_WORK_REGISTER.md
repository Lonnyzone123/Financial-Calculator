# S2 carried-work register

**Written 2026-09-12 for the bounded S2 closeout.** External closeout CQ-3a: *"All may carry to S5 with an owner, remaining work and affected capabilities named. Any finding that contradicts an S2 repair claim must also qualify that S2 entry."* Companion to `S2_CLOSURE_REGISTER.md`.

**Nothing here is closed by S2.** Each item is carried with the work that remains. An owner such as "S4 2b.2e", "S5 2b", "S5b 2b.5" or "S6 7.12" names the item in that sprint's task checklist. **Owners were found by searching every sprint checklist.** An earlier revision of this register searched `S5_TASK_CHECKLIST.md` only, called Q53 and Q54 "unplaced", and gave the ST2 gaps and Q56 generic owners -- all four already had homes in S4 or S6. Items with no home say so rather than borrowing one.

---

## 1. Q-series findings

| ID | State | Owner | Remaining work | Affected capabilities | Contradicts an S2 claim? |
|---|---|---|---|---|---|
| Q43 | **repaired** 2026-09-14 at `f5be69d`, narrower than the 2026-09-13 decision: scoped to (i), the exact-zero-payment case only. Widening to any underpayment filed as `Q76`, rebuild scope; `includePayment`'s default mismatch filed separately as `Q75` | S5 2b.3–2b.5 | none — done at this scope | debt projection; retirement spending in the payoff year | no |
| Q44 | **repaired** at `d34fcd1`, per (b) | S5 2c.1 | none — `homeEquityFallback` is gated on `advanced.networthOn`; measured harness EMPTY (control 8, expanded 8) | home-equity fallback spending; net-worth display | no |
| Q45 | **decided** 2026-09-13 (the owner): (d), defer to a calibrated matrix | S5 2d.3 (decision recorded); S103 task 13 (implementation, `MARKET` P1, added 2026-09-13) | Not repaired in S5 — record the `TAX §2.2`-shaped vectors as `UNREPRESENTABLE`/deferred in task 5.10 (renamed from 5.9 the same day, see `S5_TASK_CHECKLIST.md`); `Math.max(0, variance)` stays the only guard until S103. S5b task 2b.5 separately routes Q45 through its "flag, don't guess" disclosure mechanism as an interim mitigation — not a substitute for this repair | Monte Carlo volatility and success rate | no |
| Q46 | withdrawn — intentional, disclosed | — | none | — | — |
| Q47 | **decided** 2026-09-13 (the owner): leave disclosed-only — candidate (a) closed as "not implementing," not left open | S5 2f.2 | none — the disclosure fix (`c9f76ee`) is the final state for the old engine | Social Security for claimants working before full retirement age; rules disclosure | no |
| Q48 | repaired on `runPlan()`'s paths (`c9f76ee`) | S5 2n (the bypass residuals, §3); S5 2m (BC-02's double-serialize fix — also Q48-specific, see §3's BC-02 section) | **Both threads repaired 2026-09-14** — 2n at `0348418`, 2m at `1a2e065`, both measured EMPTY | direct engine callers | no — not an S2 register ID |
| Q49 | repaired on `runPlan()`'s paths (`5d34573`, `4c00cbb`) | S5 2n | **Repaired 2026-09-14** — the heat-map residual closed with 2n's gate move at `0348418`; a direct caller omitting the field still gets only downstream containment (unchanged, by design) | contributions | no — not an S2 register ID |
| Q50 | open — not covered by the Q51/Q52 swap decision (a single unclamped value, not an inverted pair); **repaired** 2026-09-14 at `567be43` per (c), both a validator range check and an engine clamp | S5 2h.4 | none — done | tax on dividends | no |
| Q51 | **repaired** 2026-09-14, both halves — engine `6950422`, app `885c354` | S5 2h.6 | none — done, per "disclose and swap" | three withdrawal strategies | no |
| Q52 | **repaired** 2026-09-14, same commits as Q51 | S5 2h.6 | none — done | VPW withdrawals | no |
| Q53 | **repaired** 2026-09-14 — engine `ca28d66`, validator `e15e187` | S4 2b.2e (placed at `af3acf2`): the flag inventory, contract and witnesses, done in S4 · S5 2l (added at `7dd8523`): the production repair, per S4-PA-13 | none — done, from one shared declarative definition | every boolean plan flag | no — RB-02 already enforces `cashHolding` |
| Q54 | open | S4 4.6 (placed at `af3acf2`), gated before the S5b 4.6 freeze | Derive generated debt payments from what they service. Moves the reference corpus | the reference corpus and baseline | no |
| Q55 | **repaired** 2026-09-14 at `d3308d4`, per reject/do-not-normalize | S5 2i.5 | none — an engine-side array guard refuses a non-array with the existing invalid-result error at all 9 sites; measured harness EMPTY | `runPlan()` on non-array fields — uncaught `TypeError` | no; see §5 (FM-04) |
| Q56 | closed to repair; design input | S6 7.12 (preserve as reference; do not fix) | none now | smart-withdrawal presets | no |
| Q57 | **repaired** 2026-09-14 at `b1f983b`, candidate (a) | S5 2j | none — a **type** check on `futureChanges[].value` now refuses a non-finite value the same shape as Q49; measured harness EMPTY | contribution schedules (an additive `"500"` deposits 1,000,500) | no |
| Q58 | **repaired** 2026-09-14 — engine/validator `0a463ab`, app load path `0464571` | S5 2k.3–2k.5 | 2k.2 still open (Proposal 15): one definition shared by the validator, the engine's dispatch and the generator's harvest | withdrawal-strategy selection | no |
| Q59 | **repaired** 2026-09-14 at `c2ff61b`, per (a) and (b) | S5 2q | none — both validator warnings land, measured harness EMPTY; corpus zero-warnings test exempts the two codes | pre-retirement household budget | no |

**Closeout verdict condition 3 (2026-09-13)** asked for an accountable owner for Q53 and Q54; the packaged register said "unplaced". **Met at `4bbbff4`:** S4 2b.2e and S4 4.6, both placed at `af3acf2`.

## 2. P19 dispositions without an ID-tagged witness

| ID | Module | State | Owner | Remaining work | Gate |
|---|---|---|---|---|---|
| ST2-01 | `mortgage-vs-investing.js` (excluded) | excluded, no ID-tagged witness | S4 2b.2c | a dedicated revival witness | **required before reintroduction** |
| ST2-04 | `mortgage-vs-investing.js` (excluded) | excluded, no ID-tagged witness | S4 2b.2c | a dedicated revival witness | **required before reintroduction** |
| ST2-06 | `mortgage-vs-investing.js` (excluded) | excluded, no ID-tagged witness | S4 2b.2c | a dedicated revival witness | **required before reintroduction** |

`tests/module-exclusion-registry.test.js` enforces that exactly these three lack a witness. **That is bookkeeping, not behavioural coverage** (CQ-4).

**S4 2b.2c offers two outcomes:** write the three witnesses, *or* record explicitly that they have no revival contract and may be revived unguarded. **The second is closed by the closeout answers:** CQ-4 accepts deferral only if a witness is *required before reintroduction*. The owner is S4; the permitted outcome is the witness.

## 3. Behavioural residuals — paths that bypass `runPlan()`'s gates (CQ-6)

`runPlan()`'s input gates cover `runPlan()`, `runScenario()` and the generated Worker. **The exported `simulatePlan()` and the historical heat map** — which does `testPlan = clone(p)` and then calls `simulatePlan()` directly — do not pass them. The universal "every public execution path" claim is withdrawn from the engine comments. R2R-001 is **not** reopened: its accepted scope was the quote-entry validator, which runs inside `simulatePlan()`.

**Reproductions:** `tests/audit-cq6-gate-bypass-residuals.test.js`, one `todo` test per residual, each failing today, each with a control showing `runPlan()` rejects the same input. **Owner: S5 block 2n** (added at `7dd8523`; previously "S5, engine input-defence ground"). The block covers:
- R1–R6;
- the shape decision: gates into `simulatePlan()`, or validation before the heat map's sweep (2n.1);
- whether `simulatePlan()` stays public (also 2n.1).

R6 is shared with 2g.3 (2n.4). Deadline: before S5b task 4 (2n.7). BC-02, below, is S5 block 2m. **Reachability:** none of these inputs can come from JSON import (validated) or the live UI (coerced) — direct programmatic input only.

| # | Input | Exported `simulatePlan()` | Heat-map path | Qualifies |
|---|---|---|---|---|
| R1 | non-finite balance | unflagged; portfolio silently zeroed, reported as a funding failure | same | the R2R-001 boundary-half comment |
| R2 | non-finite contribution | **flagged** by downstream containment — not a residual | **unflagged; JSON clone turns it into a zero contribution; reported as success with a lower balance** | Q49 |
| R3 | duplicate account id | accepted, unflagged | same | **RB-01** (S2 entry qualified) |
| R4 | invalid cash holding | accepted, unflagged (financial consequence not reproduced: needs retained surplus) | same | **RB-02** (S2 entry qualified) |
| R5 | circular reference in an account | throws `TypeError` | throws `TypeError` | Q48 |
| R6 | circular reference outside `clone()`'s arrays | — | — | `runScenario()` throws `RangeError`; pre-dates Q48 |

**Remaining work:** decide whether the gates move into `simulatePlan()` (an engine change on the heat map's path, which the heat-map's own classification would then see) or whether the heat map calls `runPlan()`-equivalent validation before its sweep. **Affected capabilities:** the historical heat map; any embedding caller of `simulatePlan()`.

### BC-02 — Q48's precheck serializes the input a second time (closeout verdict condition 2)

**On `runPlan()`'s own path, not a bypass.** `nonSerializableScenarioInputCode()` calls `JSON.stringify()` and discards the bytes; simulation then serializes the same object again. A `toJSON` callback therefore runs twice. **Reproduced:** a callback that returns ordinary account data once and throws on the next call was called **once** and returned `status: "ok"` on engine `e3f008ab…`, and is called **twice** and throws uncaught on `34b2ab9a…`; a harmless callback also now runs twice. Direct programmatic input only — JSON cannot encode a callback.

| Owner | Remaining work | Acceptance, per the verdict |
|---|---|---|
| S5 block 2m (moved from 2g at `7dd8523`) | **Repaired 2026-09-14 at `1a2e065`** (ticks `c9a86e3`), per the owner's 2026-09-13 policy: `runPlan()` clones the input once under the error boundary and reuses that clone via its stored serialized text, so a callback runs exactly once. Not a second serialization pass. Measured harness against `986006b`: control EMPTY (36/36) and expanded EMPTY (49/49), both qualified; no narrowing. | ordinary JSON data, cycles, BigInt, always-throwing callbacks and stateful callbacks; status, callback counts under the chosen policy, and balance/flow results; valid controls; the non-array (Q55) and identity-cycle (R6) issues kept distinct — all now witnessed by `tests/audit-bc02-clone-once.test.js` |

**Repaired.** The `RESIDUAL BC-02` reproduction in `tests/audit-cq6-gate-bypass-residuals.test.js` was promoted out of `todo` in the same commit set — it is an ordinary passing test now, not a carried residual. `tools/carry-forward-schedule.json`'s `BC-02` and `COUPLED-ONLY-BC-02` entries were removed the same way (closeout errors on a schedule entry for an item nothing still generates).

## 3a. Result-contract checker gap — BC-01 (closeout verdict condition 1)

**P5-02 is partially qualified against `RESULT_CONTRACT.md` v1.** Its presence checks and successful contract fixtures are accepted; `tools/result-contract.js` is not a complete corruption gate.

**Closed 2026-09-13 in S4 task 2b.4** (`b471925`, ticked at `16cf460`). This is S4's own record.
- `RESULT_CONTRACT.md` version 2 rejects each mutation witnessed below at its exact path.
- Re-run over the engine, version 2 found no new violation, so BC-01 left no engine defect for S5 to own.
- The S4 external instrument review later found one further checker defect, S4-IR-03, and accepted its repair within its reviewed scope.

The two tables below are kept as carried. S2's disposition of P5-02, partially qualified against version 1, stays as recorded in `S2_CLOSURE_REGISTER.md`.

| Defect | Witnessed by the auditor on a stored result |
|---|---|
| Numeric type checks use `typeof`, which admits non-finite values | `NaN` in any of the three Monte Carlo lifetime totals or three failure ages; `Infinity` in `lifetimeTaxes` — all return `violations: []` |
| No positive-integer constraint on matching path counts | both path counts set to `0`, or to `1.5`, without a plan — accepted |
| Plan-dependent part of M-PATHS omitted without being reported | no plan supplied → the `runs` comparison is not in `skipped` |
| A malformed row throws instead of returning a violation | a `null` row → `TypeError` at `Object.keys(row)`, simple and Monte Carlo |

| Owner | Remaining work |
|---|---|
| **S4 — `S4_TASK_CHECKLIST.md` 2b.4** (2b.4a–e), since 2026-09-13. The verdict named the S5 result-contract/conformance role; the owner moved it into S4 on the plan audit's finding S4-PA-02 (`a7483f1`), because S4 tasks 3 and 7 rely on the checker. An engine violation the qualified checker finds becomes a named S5 finding (2b.4e) | Explicit finite-number requirements (including nullable numerics when non-null); positive-integer path counts for successful Monte Carlo; validate a row is a non-null record before enumerating it, returning a structural violation; report the plan-dependent M-PATHS portion as skipped; add the auditor's mutations as acceptance tests asserting **exact violation paths**. Do not weaken the contract to absorb corrupted values |

## 4. Result-contract conflicts (`RESULT_CONTRACT.md` §6)

| # | Conflict | Owner | Remaining work |
|---|---|---|---|
| C6 | L4b's written rule includes insurance in `networth` once age ≥ `selfLife`; **the engine's opening row omits it** when a plan starts after `selfLife` | S5 block 2o | **Decided 2026-09-13 (the owner): insurance counts from the first year**, as the written rule says. The engine's opening row is aligned in S5 block 2o, with the diff predicted first; the characterization test in `tests/result-contract.test.js` then asserts conformance |
| C2 | CSV column "Retirement income" for `income`, which includes pre-retirement wages | the rebuild (`S6_TASK_CHECKLIST.md` 7.3a) | **Decided 2026-09-13 (the owner): change the data to match the label, not the label** — split pre-retirement wages out of this column. Lands in the rebuild, not S5 |
| C3 | Column "Debt payments" for `debtPayments`, which is retirement-period only | the rebuild (`S6_TASK_CHECKLIST.md` 7.3a) | **Decided 2026-09-13 (the owner): change the data** — export debt payments for every year under this column. Lands in the rebuild, not S5 |

## 5. Cross-references outside the S2 register

| Earlier finding | Contradicted by | Note |
|---|---|---|
| FM-04 (full-model audit) — thrown engine errors enter the invalid-result contract | Q55 (uncaught `TypeError` on non-array fields); residual R6 (`runScenario()` `RangeError`) | FM-04 is not an S2 register ID. Recorded so its broader reading is not relied on. |

## 6. S5 task 10 gates — carried unchanged

Normalisation · versioning · artifact rebuild (`investment-calculator-v2c.html` is stale by design and carries none of the post-pin repairs) · required gate · off-machine reproduction. The accepted after-CR2 reference (`d08cd65a…3788`) remains a **historical** reference with its original provenance (CQ-5b).

## 7. Open by decision, with no home yet — handed over by 0e (2026-09-13)

**Reported by 0e, not verified, except where marked.** 0e ran S2 closure rounds 1–5. These items appear only in the lockstep ledgers (`S2_CLOSURE_WHOLE_MODEL_HANDOVER_20260910.md` §8 and its new-code-only companion). A ledger mention is history, not ownership, so since S2 closed nobody has held them.

**Checked at `3c9f846`:**
- None of the five has a home in any sprint checklist, `SPRINT_QUESTIONS.md`, this register or `MODEL_ASSUMPTIONS.md`.
- "fourth category" and "dead scenario" return no hits. The same search does find "self-inflicted", so an absence would have shown up as a hit.

**Routing each item is the owner's call.** Until the owner routes it, its owner cell says so.

**All five routed 2026-09-13, by the owner, in `investment-calculator-eb-s5-kickoff`'s chat.** U1 and U2 to S103 (both touch the reservation mechanism or need real feature machinery); U3 settled as a standing process rule, no sprint home needed; U4 to S5, ahead of S5b task 4's corpus freeze; U5 deferred, no sprint assigned yet. Each row's Owner and Remaining-work cells carry the decision, not just the destination.

| # | Item | What was left, and why | Owner | Remaining work |
|---|---|---|---|---|
| U1 | CR2-01 (a): a pretax→taxable transfer is not credited against the RMD | CR2-01 (`468e26a`) made the transfer recognise income. Under IRS rules a distribution to a taxable account satisfies the RMD, so a $20,000 transfer arguably reduces a $4,065.04 obligation instead of sitting on top of it. This is not a double tax: the household is taxed on exactly what left the account, but it distributes more than required. It was left alone because crediting it edits the reservation CL-02 repaired. Measured by 0e (age 75, $100k IRA): the RMD is withdrawn in full with and without the transfer, and nothing is withdrawn twice | **S5AA R15** (was S103, routed by the owner 2026-09-13; pulled forward 2026-09-22) | **Decided 2026-09-13 (the owner): credit it — a distribution satisfies the RMD regardless of destination account.** Deferred to S103 rather than done in S5, since it edits the reservation mechanism directly; S103 changes the reservation, keeping CL-02's witnesses. *(Added 2026-09-24 (UTC−7), from the S5AA session's combined relay; commits checked to exist, behaviour not re-derived by the plan owner: pulled forward by the owner 2026-09-22 and repaired in S5AA's R15 round at `4b5aff1` (external audit of `1e6faae`, R14-01): a pre-tax to taxable transfer counts toward its own obligation, up to what is unpaid; conversions, rollovers and QCDs keep their own rules. CL-02's witnesses stand. A regression of this repair (R15-01: a partial transfer made an ordinary shortfall an error) was repaired at `dcd7247`. The 2026-09-13 text above is kept as history.)* |
| U2 | CR2-01 (b): the other transfer pairings | taxable→preTax, taxable→roth and taxable→hsa act as contributions with no limit applied. hsa→taxable recognises nothing, where in reality it is taxable plus a penalty. These are new features, not repairs. Rejecting them at import would break four corpus seeds (including 4, 9 and 13) and the generator | **S103** (routed by the owner, 2026-09-13) | **Decided 2026-09-13 (the owner): model all the pairings properly** — real contribution limits and real tax/penalty consequences per pairing, in S103. Not blocked or documented-as-gap in the interim; the corpus seeds stay as they are until S103 lands. *(Added 2026-09-24 (UTC−7), from the S5AA session's combined relay, not re-measured by the plan owner: a transfer from a taxable account into a pre-tax, Roth or HSA account also realises no capital gain; it carries its basis away untaxed (in the corpus, `seed:4` moves $56,260 carrying $17,213 of unrealised gain). U2 stays in S103, unchanged in decision, and is disclosed to auditors as known and unrepaired, with Q45, Q54, C2 and C3.)* |
| U3 | Counting: a finding closed by another session inside a package's range | The count has three categories: repaired, excluded under P19, and self-inflicted regression. CR2-07 (`690af84`) and S3-03 were closed inside 0e's range by other sessions' work. That was disclosed in the ledger, but the total does not separate them. df sharpened the point: when two sessions repair one mechanism independently, "count once at first discovery-and-repair" has to say whose discovery it was | **Settled — process rule, no sprint home needed** (the owner, 2026-09-13) | **Decided 2026-09-13 (the owner): a fourth category — credit whoever actually found and repaired it first**, regardless of whose nominal package/session range it fell in. Applies to any future overlap; nothing further to route |
| U4 | A dead scenario: `seed:1` | `seed:1` carries CR2-01's exact pretax→taxable configuration. It falls from $2,347,837 to $0 in its first year and then reports seventeen rows of zeros, so the corpus configured CR2-01's path and never ran it. RP-01 and Q43 had the same property. Nothing in the harness notices a scenario that has stopped being a test | **S5 block 2s** (routed by the owner, 2026-09-13; landed at `cd03408` after a first draft misplaced it inside task 5 — see `S5_TASK_CHECKLIST.md` §2s's own note) | **Decided 2026-09-13 (the owner): fix now, before S5b task 4's corpus freeze.** Repair or replace the dead scenario, and add a check that every configured corpus path actually executes at least once. *(Corrected 2026-09-13: this cell used to speculate between "S5 task 1's registry-consolidation spirit" and "task 5's corpus work" — it landed at neither; block 2s was created for it specifically, outside the tax block's ordering chain, which is why it moved there from a first draft at task 5.9.)* |
| U5 | `MAX_TERM_MONTHS = 1800` (150 years) | A judgement call in B2 (`fbb63cd`), which CR2-06 extended to comparison horizons. **Verified present:** `src/debt-amortization.js` documents it, and tests import and pin it (0e: above `profile.endAge`'s validator cap), so it cannot drift silently. The ceiling itself was never reviewed | **Deferred — not a priority** (the owner, 2026-09-13) | **Decided 2026-09-13 (the owner): defer.** It's pinned and tested, nothing is actively broken; review whenever a later sprint (S103 or S6) has reason to touch debt-term logic anyway |
| U6 | The account-split Monte Carlo model *(added 2026-09-24 (UTC−7), from the S5AA session's combined relay; the plan owner has not re-measured the figures)* | Monte Carlo draws each account's return independently, so splitting the same investments across more accounts makes the portfolio look less volatile than it is (S5AA's own test example: ten equal accounts at 20% volatility behave like about 6.3%, and one retirement example's success rate rose from 35.9% to 48.3% with no economic change). Percentiles and success rates overstate diversification for households with several accounts. It relates to Q45's correlation calibration and Q66's per-account reserve | **CPU engine rebuild** (decided by the owner 2026-09-23) | **Decided 2026-09-23 (the owner): disclose now, replace with shared market shocks in the engine rebuild.** Disclosed in `MODEL_ASSUMPTIONS.md` and `FEATURES.md` (2026-09-24). ~~Not repaired in the old engine~~ **Repaired in the old engine 2026-10-03 by S5AA R46 (`69808e9`, source `0fd83e1`), on the owner's AA1 decision, ahead of the CPU rebuild: one set of correlated asset-class shocks per year, shared by every account (`SPRINT_QUESTIONS.md` Q185). The rebuild must keep it.** |
