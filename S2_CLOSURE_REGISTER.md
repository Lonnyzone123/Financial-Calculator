# S2 closure register — enumerated

**Generated 2026-09-12 from repository sources, not from the round narrative; revised the same day for the bounded closeout.** Exclusions from `build.js` `findingIds`; witnesses from `tests/`; sites from `src/` and `tools/`. **Every** matching file is listed, not the first — an earlier revision showed one arbitrary member of each set and was corrected by the external audit (`CR2-01` appears in two files, `CR2-03` in four).

**S2 CLOSED (2026-09-13): bounded S2 register closeout, unconditional within the agreed scope** — `Handover temp/S2_CLOSEOUT_FINAL_VERDICT_20260913.md`. The conditional grant (`Handover temp/S2_BOUNDED_CLOSEOUT_VERDICT_20260913.md`) was made unconditional once conditions 1–4 and residuals BC-01 and BC-02 were recorded here and in `S2_CARRIED_WORK_REGISTER.md` (`18ab807`). The audited package (`5c79ffe6…9c9b`, cut at `ec50aa7`) plus the recorded dispositions are the basis of acceptance; later commits, engine hashes and test counts are supplier-reported. **Not granted:** whole-model certification, release approval or a definitive baseline. BC-01, BC-02 and all other carried work remain unfixed and owned.

**What closure of this register means** (external closeout CQ-2): its dispositions and supporting evidence are accepted within scope. It does **not** mean every engine defect is repaired. Everything carried out of S2 is in `S2_CARRIED_WORK_REGISTER.md`.

### Disposition labels

| Label | Meaning |
|---|---|
| **repaired** | the defect's mechanism is removed on every path its acceptance criterion names |
| **repaired — scoped** | removed on the paths through `runPlan()` (so `runScenario()` and the generated Worker); a named bypass path is carried as a behavioural residual with a reproduction |
| **repaired — partially qualified** | repaired, with its closure re-stated against an independent specification whose checker enforces it only partially; the gap is carried |
| **excluded (P19)** | contained by excluding the module from the shipped bundle; **not** financially repaired |

| ID | Disposition | Evidence |
|---|---|---|
| `CL-01` | repaired | witness: `audit-cl-findings.test.js`, `audit-fc-findings.test.js`, `worker-parity.test.js` · sites: `src/engine.js`, `tools/capture-baseline.js` |
| `CL-02` | repaired | witness: `audit-cl-findings.test.js` · sites: `src/engine.js`, `tools/capture-baseline.js` |
| `CL-03` | repaired | witness: `audit-cl-findings.test.js`, `audit-cr2-findings.test.js`, `audit-fc-findings.test.js`, `capture-baseline.test.js`, `worker-parity.test.js` · sites: `tools/capture-baseline.js` |
| `CL-04` | repaired | witness: `audit-cl-findings.test.js`, `audit-cr2-findings.test.js`, `audit-fc-findings.test.js`, `audit-st2-findings.test.js` · sites: `tools/capture-baseline.js` |
| `CL-05` | repaired | witness: `audit-cl-findings.test.js`, `audit-cr2-findings.test.js`, `audit-st2-findings.test.js` · sites: `src/scenario-validator.js`, `tools/capture-baseline.js` |
| `CL-06` | repaired | witness: `audit-cl-findings.test.js` · sites: `src/scenario-validator.js` |
| `CL-07` | repaired | witness: `audit-cl-findings.test.js`, `audit-st2-findings.test.js` · sites: `tools/capture-baseline.js` |
| `CR2-01` | repaired | witness: `audit-cr2-findings.test.js` · sites: `src/engine.js` (the transfer path). *`src/debt-refinance.js` was listed until 2026-09-13 because a comment there compares another problem to CR2-01; that is an incidental ID mention, not a repair site.* |
| `CR2-02` | repaired | witness: `audit-cr2-findings.test.js` · sites: `src/scenario-validator.js` |
| `CR2-03` | repaired | witness: `audit-cl-findings.test.js`, `audit-cr2-findings.test.js`, `audit-fc-findings.test.js` |
| `CR2-04` | repaired | witness: `audit-cr2-findings.test.js`, `audit-fc-findings.test.js` · sites: `tools/capture-baseline.js` |
| `CR2-05` | repaired | witness: `audit-cr2-findings.test.js` · sites: `tools/capture-baseline.js` |
| `CR2-06` | repaired | witness: `audit-cr2-findings.test.js` · sites: `src/debt-refinance.js` |
| `CR2-07` | repaired | witness: `audit-cr2-findings.test.js` |
| `EXT-02` | repaired | witness: `audit-fc-findings.test.js`, `audit-st2-findings.test.js`, `worker-parity.test.js` · sites: `tools/capture-baseline.js` |
| `EXT-03` | repaired | witness: `audit-st2-findings.test.js` · sites: `src/debt-amortization.js` |
| `FC-01` | repaired | witness: `audit-fc-findings.test.js` |
| `FC-02` | repaired | witness: `audit-fc-findings.test.js` · sites: `tools/capture-baseline.js` |
| `FC-03` | repaired | witness: `audit-fc-findings.test.js` |
| `FC-04` | repaired | witness: `audit-fc-findings.test.js`, `near-miss-survivor-sweep.test.js` |
| `FCR-01` | repaired | witness: `audit-fc-findings.test.js` |
| `FCR-02` | repaired | witness: `audit-fc-findings.test.js` · sites: `tools/capture-baseline.js` |
| `FCR-03` | repaired | witness: `audit-fc-findings.test.js`, `near-miss-survivor-sweep.test.js` |
| `P5-01` | repaired | witness: `audit-fc-findings.test.js` |
| `P5-02` | **repaired — partially qualified** | witness: `audit-fc-findings.test.js`, `near-miss-survivor-sweep.test.js`, `result-contract.test.js` · partially qualified against `RESULT_CONTRACT.md` v1 (`abb9b8d`), per closeout verdict condition 1: presence checks and successful contract fixtures accepted; checker gap **BC-01** carried; owner S4 `S4_TASK_CHECKLIST.md` 2b.4 (moved from the S5 role 2026-09-13, `a7483f1`) |
| `P6-01` | repaired | witness: `audit-fc-findings.test.js` |
| `P6-02` | repaired | witness: `audit-fc-findings.test.js` · sites: `tools/capture-baseline.js` |
| `P7-01` | repaired | witness: `audit-fc-findings.test.js` |
| `P7-02` | repaired | witness: `audit-fc-findings.test.js` · sites: `tools/capture-baseline.js` |
| `P7-04` | repaired | witness: `audit-cr2-findings.test.js`, `audit-fc-findings.test.js` |
| `P8-01` | repaired | witness: `audit-fc-findings.test.js` |
| `P8-02` | repaired | witness: `audit-cr2-findings.test.js`, `audit-fc-findings.test.js` · sites: `tools/capture-baseline.js` |
| `P9-01` | repaired | witness: `audit-cr2-findings.test.js`, `audit-fc-findings.test.js` · sites: `tools/capture-baseline.js` |
| `P9-02` | repaired | witness: `audit-cr2-findings.test.js`, `audit-fc-findings.test.js` · sites: `tools/capture-baseline.js` |
| `RB-01` | repaired | witness: `audit-cl-findings.test.js`, `audit-rb-findings.test.js`, `audit-rc-findings.test.js`, `capture-baseline.test.js`, `scenario-validator.test.js` · sites: `src/engine.js`, `src/scenario-validator.js` · **Qualification lapsed 2026-09-14** (was "repaired — scoped"): its acceptance named *"Import, direct engine, and Worker"*, and the exported `simulatePlan()` and the heat map still accepted a duplicate id unflagged. **From `0348418` (S5 2n, CQ-6): both routes now run `runPlan()`'s input gates and refuse it too** — `audit-cq6-gate-bypass-residuals.test.js`'s reproduction is now an ordinary passing test, not a carried residual. Measured harness `213ca08` vs `0348418`: EMPTY/EMPTY. |
| `RB-02` | repaired | witness: `audit-cl-findings.test.js`, `audit-rb-findings.test.js` · sites: `src/engine.js`, `src/scenario-validator.js`, `tools/capture-baseline.js` · **Qualification lapsed 2026-09-14** (was "repaired — scoped"): same acceptance wording, and the exported `simulatePlan()` and the heat map still accepted an invalid cash holding unflagged. **From `0348418` (S5 2n, CQ-6): both routes now refuse it too**, same measured harness as RB-01. |
| `RB-03` | excluded (P19) | revival witness: `audit-rb-findings.test.js`, `module-exclusion-registry.test.js`, `mortgage-vs-investing.test.js` |
| `RB-04` | excluded (P19) | revival witness: `audit-rb-findings.test.js` |
| `RB-05` | excluded (P19) | revival witness: `audit-rb-findings.test.js` |
| `RB-06` | excluded (P19) | revival witness: `audit-rb-findings.test.js` |
| `RB-07` | excluded (P19) | revival witness: `audit-rb-findings.test.js` |
| `RB-08` | excluded (P19) | revival witness: `audit-rb-findings.test.js`, `module-exclusion-registry.test.js`, `mortgage-vs-investing.test.js` |
| `RB-09` | repaired | witness: `audit-rb-findings.test.js`, `schema-catalogue.test.js` |
| `RC-01` | repaired | witness: `audit-cl-findings.test.js`, `audit-rc-findings.test.js` · sites: `src/engine.js`, `tools/capture-baseline.js` |
| `RC-02` | repaired | witness: `audit-cl-findings.test.js`, `audit-rc-findings.test.js` · sites: `src/engine.js`, `tools/capture-baseline.js` |
| `RC-03` | excluded (P19) | revival witness: `audit-rc-findings.test.js`, `module-exclusion-registry.test.js`, `mortgage-vs-investing.test.js` |
| `RC-04` | excluded (P19) | revival witness: `audit-rc-findings.test.js`, `module-exclusion-registry.test.js` |
| `RC-05` | repaired | witness: `audit-cr2-findings.test.js`, `audit-rc-findings.test.js` · sites: `tools/capture-baseline.js` |
| `RP-01` | repaired | witness: `audit-rp01-self-transfer.test.js` · sites: `src/engine.js` |
| `RP-02` | repaired | witness: `audit-fc-findings.test.js`, `audit-rp01-self-transfer.test.js`, `build-debt-bundling.test.js` |
| `RP-03` | repaired | witness: `audit-fc-findings.test.js`, `audit-rp01-self-transfer.test.js`, `near-miss-survivor-sweep.test.js` |
| `RP-04` | repaired | witness: `audit-rp01-self-transfer.test.js`, `near-miss-survivor-sweep.test.js`, `worker-parity.test.js` · sites: `tools/capture-baseline.js` |
| `S3-01` | repaired | witness: `audit-fc-findings.test.js` · sites: `tools/capture-baseline.js` |
| `ST2-01` | excluded (P19) | **no ID-tagged witness** — deferred, owned, required before reintroduction (carried register) |
| `ST2-02` | repaired | witness: `audit-cr2-findings.test.js`, `audit-fc-findings.test.js`, `audit-st2-findings.test.js` · sites: `tools/capture-baseline.js` |
| `ST2-03` | repaired | witness: `audit-st2-findings.test.js` |
| `ST2-04` | excluded (P19) | **no ID-tagged witness** — deferred, owned, required before reintroduction (carried register) |
| `ST2-05` | repaired | witness: `audit-cr2-findings.test.js`, `audit-st2-findings.test.js` · sites: `src/debt-amortization.js`, `src/debt-payoff-strategy.js` |
| `ST2-06` | excluded (P19) | **no ID-tagged witness** — deferred, owned, required before reintroduction (carried register) |

## Counts — derived from the table above

The counts below are **computed from the table**, not asserted beside it (CQ-2: *"do not treat 59 or 48 as immutable acceptance targets"*). `tests/s2-closure-register.test.js` re-derives them from this file and fails if this block disagrees.

<!-- counts:begin -->
| Disposition | Count |
|---|---:|
| repaired | 47 |
| repaired — partially qualified | 1 |
| excluded (P19) | 11 |
| **Total** | **59** |
<!-- counts:end -->

**Repaired in total: 48**, of which 2 are scoped with carried bypass residuals and 1 is partially qualified against an independent specification, with its checker gap carried. **Excluded: 11**, contained and not financially repaired.

## Folded — real findings, not separately counted

| ID | Folds into | Why |
|---|---|---|
| `P7-03` | `S3-01` | same mechanism, narrower boundary |
| `P10-01` | `P9-01` | a present `null` is the same inference the encoding gate already owned |
| `P11-A` | `P9-02` | the rule's exception lived inside the helper enforcing it |
| `P11-B` | `P9-01` | object identity deciding encoding compatibility |

## Accepted record and planning corrections — no mechanism, never counted

| ID | Subject | Disposition |
|---|---|---|
| `H12-01` | CLI classify-once wording | corrected and accepted |
| `H12-02` | Q47–Q49 records absent from archive | corrected and accepted |
| `P13-H1` | Q49's causal explanation | corrected and accepted |
| `P16-H1` | S102's directional gate | corrected and accepted |
| `P16-H2` | error-code layer label | corrected and accepted |
| `P17-H1` | S6 7.12 gate attribution | corrected and accepted |
| `P19-H1` | Batch 18 stage-overlap explanation | **corrected** in `SIMULATION_LOG.md` at `c10889a` (sequential composition by mode); overlap *policy* routed separately; **accepted** in the closeout verdict. The unqualified "later wins" sentence left standing just above the correction was struck by its owner at `c18d3c5` |
| `P19-H2` | Batch 19 RMD-coordination explanation | **corrected** in `SIMULATION_LOG.md` at `c10889a`; no second RMD offset added; **accepted** in the closeout verdict |

These are corrections to **what was written**, not to the model. They are listed so the register accounts for every finding ID the audit has issued, rather than only those that moved the count.

## What the enumeration establishes

**Traceability gaps (3), deferred.** `ST2-01`, `ST2-04`, `ST2-06` carry no ID-tagged test. This is a traceability gap, not necessarily an absence of behavioural coverage. **`tests/module-exclusion-registry.test.js` enforces the list of the three — that is bookkeeping, not behavioural coverage** (CQ-4). Each is deferred with an owner and **must have a dedicated witness before its module is reintroduced**; see the carried register. Eight of the eleven P19 dispositions carry a revival witness.

**The exclusion set is machine-enumerable.** `build.js` carries an explicit `findingIds` array on each excluded module (`a656e86`), enforced by `module-exclusion-registry.test.js`, replacing the range notation an earlier revision had to parse.

**Scope.** This register records the S2 closure register only. It does **not** establish whole-model closure, certify financial values, or approve release.
