# Investment Calculator — Development Roadmap (external review edition)

**Last updated:** 2026-09-10 (revised after sprint S3 executed — §4.14)
**Audience:** the external auditor (ChatGPT). Self-contained — you do not need any other file to orient yourself, though every claim is traceable to one.

> ### ✅ Current status: the re-audit REOPENED FM-03 on 4 findings. All four repaired. Sprint S3 has since run. See §4.11 and §4.14.
>
> The 2026-09-10 whole-model audit returned **REOPEN** on 9 findings (§4.9); all nine were repaired plus Q15 across R1–R7 (§4.10). The 2026-09-11 **re-audit passed eight of the nine and Q15, and REOPENED the FM-03 repair** on four new findings — two P1, two P2 (§4.11). **All four are now repaired** across four checkpoints RR2-1 to RR2-4. Every figure in the re-audit was independently reproduced here, to the cent, before any of it was accepted. The re-audit was then inspected adversarially in turn (section 4.12): its four findings hold and its arithmetic is meticulous, but it missed a finding inside its own theory (**Q22**, repaired), missed that R4 had reintroduced FM-09s defect class, and passed four of nine findings on our own supplied tests.
>
> **Sprint S3 then ran (§4.14): seven tasks landed, and the one behaviour-preserving refactor deliberately did not** — its gate requires an accepted financial baseline, which is the verdict on this package. Nothing in S3 touched `src/engine.js`, `src/app-shell.html`, `src/scenario-validator.js`, the golden fixture or the shipped artifact; all five are byte-identical across the whole sprint, so S3 cannot have moved financial output. It did produce **nine new recorded findings (Q28–Q36)**, of which four are worth your time — see §4.14.
>
> **1093 tests, 1088 pass, 0 fail, 5 todo** (Q16, Q18, and three new ones marking recorded findings rather than pending work). Awaiting re-audit. **R2-T08 still gated.**
>
> The package described below was submitted and audited on 2026-09-10. The verdict was **REOPEN — do not advance to R2-T08 release packaging**, on **9 findings: 4 P1, 5 P2**, plus two corrections to Q15. Three of the four P1s have been independently reproduced here. **The sections below still describe the submitted state accurately; they are not yet repaired.** Read §4.9 first — it is the current front of the work, and it supersedes §10's reading order for the next round.

**Audit-pass status (superseded — this is the state that was submitted):** ⚠️ **REOPENED, then repaired, then built on twice — awaiting a whole-model re-audit.**
- R2-T01/T02: ✅ externally **PASS** at round 4 (2026-09-09), a *bounded source checkpoint* with six nonblocking follow-ups (§4.5). Unchanged by anything below.
- R2-T03 through R2-T07 and R4-F1 were implemented in one sprint, then externally audited (`SPRINT_EXTERNAL_AUDIT_20260909.md`), which returned **REOPEN on five findings** — three of them P1, and one a regression the sprint itself introduced. All five have since been reproduced, repaired and covered by first-failing tests (§4.6). **That repair round is NOT itself externally audited, and it is the highest-risk unaudited code in this package.**
- A further sprint then added six new modules **without touching any file under review** (§4.7). Also un-audited, but low-risk by construction rather than by argument — it is demonstrably incapable of having moved output for an existing scenario.
- A third sprint (**S2**, §4.8) then made the debt modules reachable from the app for the first time and added the first ARM payment-shock model, behind a **default-off** flag. It *did* edit `src/engine.js` and `src/app-shell.html`. Also un-audited. Its safety property is narrower than §4.7's but still checkable: the golden fixture is byte-identical.
- Not release qualification, at any point above. `ENGINE_VERSION` unchanged; shipped HTML still stale by design.

**If you are reviewing the whole model, these are the four things to weight, in this order.** The rest of the package has been through at least one external round, and re-covering it uniformly would spend the round on settled ground.
1. **The SA-01…SA-05 repairs (§4.6)** — three P1, one self-inflicted, touching `src/engine.js`, `src/app-shell.html` and `src/scenario-validator.js`. Never externally re-checked. This is where a whole-model read pays off most, and it is what gates R2-T08.
2. **The new-files-only sprint (§4.7)** — six new modules, first external look. The two financial ones (`debt-refinance.js`, `debt-arm.js`) carry real modelling content nobody outside this project has read.
3. **S2 (§4.8)** — the third leg of the debt work (`debt-recast.js`), the build-level bundling that makes all six debt modules reachable, and one bounded `projectDebts()` change that introduces ARM payment shock behind `advanced.armRecastOnReset` (default `false`).
4. **S3 (§4.14)** — two further financial modules (`debt-revolving.js`, `mortgage-vs-investing.js`), both bundled and neither wired, plus the baseline harness the next refactor will be measured against. **Lowest risk of the four by construction** — no file under review was touched — but the harness is the instrument that will certify a behaviour-preserving change, so an error in it would be worth more than an error in a module. §4.14 records that it was found running a *partial* engine, which is the kind of thing worth a second pair of eyes.

**The single most useful thing this round can return** is a verdict on the RA-01–RA-04 repairs (§4.11). Sprint S3's remaining task — the account-ID rate map, the one behaviour-preserving refactor — is gated on exactly that and on nothing else; its baseline is already captured and re-verified.

**Companion package:** the zip you received this file in. Its orientation document is `FULL_MODEL_AND_HANDOVER_20260910.md`.

**This is a living document, updated at the end of large development sprints and whenever a round of audit back-and-forth concludes with a resolution — it is not a one-time snapshot.** If you are reviewing an older copy, ask for the current one.

---

## 0. What this project is, in one paragraph

A retirement / investment projection model. Given a household's accounts, contributions, debts, spending policy, Social Security claiming choice and tax situation, it answers whether the money lasts — under Monte Carlo simulation and under historical replay of real return sequences. It ships as **one self-contained HTML file** that runs entirely offline, installed to a phone's home screen as a PWA. The user's primary device is Android; iPhone is a fully-functional supported baseline, not an afterthought.

---

## 1. Locked decisions — do not propose reopening these

These were each decided deliberately, and several were reopened once and re-closed. Proposals that contradict them will be rejected on process grounds, not merit.

| Decision | Resolution |
|---|---|
| **Delivery model** | Single self-contained HTML file, PWA via "Add to Home Screen", fully offline. No server, no Tauri, no Pyodide. |
| **WASM** | Evaluated for the Monte Carlo inner loop, benchmarked at 1.5–2× single-thread gain, **rejected** — not worth losing the single-readable-JS-file property. |
| **WebGPU** | **Adopted** as the primary compute path for the Full/Research tiers, JS as fallback. WGSL is plain text, so it does not carry WASM's tradeoff. |
| **New logic is written in JavaScript directly** | Not "author in Python, then port." Porting earned its keep only where an *independent, pre-existing* Python implementation existed to differentially test against. The porting step is itself where several real bugs were introduced. Scope: financial engine/calculation logic only — UI/presentation/infrastructure was never in question. |
| **Platform priority** | iOS-first for the *shared baseline* both platforms get in full (iOS Safari is the stricter platform — see the corrected rationale in §6: the strictness is about APIs, worker caps and storage, no longer about memory). Android then gets an additional enhancement layer on top. This is not "iOS is more important." |
| **Minimum supported iPhone** | **iPhone 15 Pro, on iOS 26 or later.** Decided 2026-09-09. This puts the iOS floor in the ~1GB+ heap class rather than the ~300–450MB class, and it guarantees WebGPU (Safari 26.0 ships WebGPU enabled by default on iOS 26), so the JS compute path is a genuine fallback rather than a co-primary tier. Older iPhones — including the base iPhone 15 — are out of scope, not degraded targets. See §6 for what this relaxes and what it does not. |
| **AI integration** | Out of scope entirely — struck, not scheduled. |
| **Bank/account aggregation** | Ruled out permanently. No Plaid/MX/Finicity, no third-party credentials, ever. All numbers are user-typed. |
| **Security scope** | Sized to the actual threat model (a local planning tool with typed numbers), not the encrypted-sync/compliance apparatus that only existed to support aggregation. |
| **Process weight** | One living plan doc, phase-scoped commits, fixture-first verification. Not the upstream Python engine's heavy ledger ceremony. |
| **Decision clock** | Balance-sensitive spending decisions (e.g. `constantPercent`) use **start-of-period known state only — no lookahead.** **Implemented**, then reopened as SA-04 and repaired (§4.6); awaiting external re-audit. Test must fail on any future-information use. |
| **Decision clock — inflation (SA-04)** | A spending decision uses the **last observed** CPI change, not the current period's own not-yet-realized outcome. Settled by user decision 2026-09-09 after the external sprint audit put it as a product-intent fork. The alternative — an ex-post amount indexed to contemporaneous inflation — was rejected. End-of-period `inflationFactor` accounting deliberately still uses the realized figure; configured forecast assumptions are known inputs and are preserved exactly. |
| **Synthetic RMD-cash holding policy (HR-02)** | The holding inherits the exact allocation/growth treatment of the account it was synthesized from. No new asset class or bespoke policy. **Implemented** as R2-T06, which introduced regression SA-03; repaired (§4.6), awaiting external re-audit. |

---

## 2. Ground rules for reviewing this package

These exist because each one has already caused a wrong conclusion at least once.

1. **`src/` is the code of record. The frozen Python provenance is not a second opinion.** It ships at `archive/engine-snapshot-backup/` — that path changed during the 2026-09-09 doc consolidation; earlier packages carried it as `engine-snapshot/`, and only the location moved, not the role. Its access, reserve, Social Security and taxes-off policies differ from the live model's. It is shipped only so the `fixtures/` can be regenerated and the ported JS modules verified. **Do not import policy from it.**
2. **`investment-calculator-v2c.html` is stale by design.** It is a *generated* file, and it has deliberately not been rebuilt since round 2 began. It is **not** evidence of the current source's behavior. Rebuilding is an authorized release step (R2-T08), not a mid-round action.
3. **If `jsdom` is unavailable in your sandbox, eight DOM consumer tests report as *skipped*, not failed.** That is intended behavior. It is not a product defect and not a concealed failure.
4. **A repair is only "done" when a test that was first confirmed *failing* now passes.** If a claimed fix has no first-failing test, say so.
5. **A calculation error must never be presentable as a financial outcome** (ARCH-02). A crashed run rendering as "your money ran out," or as an ordinary success percentage, is a P1 defect regardless of whether the math is right.
6. **Sources must equal uses** (ARCH-01). Cash committed must equal cash actually moved.
7. **No ZIP contains git history or `node_modules`.** Claims about HEAD or installed dependencies describe the author's checkout and cannot be reproduced from the ZIP. Treat them as reported, not verified.
8. **Stop-and-ask beats guessing.** If a repair would require an undocumented financial-policy decision, the correct outcome is to stop and record the question.

---

## 3. Code map

| Path | Role |
|---|---|
| `src/engine.js` | **The calculation engine.** All math. Node-loadable for testing with zero DOM. |
| `src/app-shell.html` | Markup, CSS, embedded 2026 rules JSON, UI, persistence, Web Worker orchestration. |
| `src/scenario-validator.js` | Scenario-shape validation. Currently wired into `importSettings()` only. |
| `src/ported/` | 14 modules ported from the Python engine: tax engine, lifetime tax optimizer, reserve manager, SCHD history, decision log, effectiveness grader, precise-math, and the Social Security stack (benefit, bridge, cashflow, diagnostics, longevity, mortality, optimizer, state, valuation). **Fixture-verified but mostly not yet wired into the live app.** |
| `src/debt-*.js` | **Seven** modules: debt amortization, **revolving/credit-card (S3, §4.14)**, payoff strategy (avalanche/snowball/custom), the adapter onto the calculator's own debt shape, refinance analysis, a real ARM model, and recast-vs-curtailment. **As of S2 (§4.8) all are bundled into the shipped file and reachable from the app** — but nothing calls them yet except `projectDebts()`, which uses `DebtAmortization.monthlyPayment()` for the ARM re-amortization in §4.8. Reachable is not the same as wired. |
| `src/mortgage-vs-investing.js` | S3 (§4.14). Pay the mortgage down or invest, as a 5×4 method-by-objective matrix; runs the engine twice per comparison and diffs. The only namespaced module that consumes the engine, which is why its engine dependency is **injected** rather than required — see §4.14. Bundled; **no UI**. |
| `tests/` | **1,093 tests.** `audit-*` = repair regressions; `*-adversarial` = boundary probes; plus golden scenarios, mathematical oracles, simulation identity, the universal row-level reconciliation invariant **and its net-worth counterpart (L4b)**, **Worker/main-thread output parity against the real built Worker**, a **near-miss survivor sweep**, a **schema drift test**, and a seeded property layer over the debt modules. |
| `tools/capture-baseline.js` | **The instrument a behaviour-preserving refactor is proven against.** Complete `runPlan()` output at full precision, **zero excluded fields**, over the fixed 36-scenario control composition, or the 49-scenario expanded composition added in S4 task 4. Versioned; refuses cross-version diffs. Since S4 5.4 it records the hash of every input and whether each is the committed bytes, and `--measured` refuses a capture whose inputs are not. Distinguishes `-0`/`NaN`/`±Infinity` from `null` end to end, recomputes every hash from the contents it claims to describe, and records the commit SHA plus a hash of the corpus *inputs* — which detects a **changed corpus**, something the output hash cannot see. |
| `tests/lib/scenario-generator.js` | Seeded, valid-by-construction scenario generation, ranges drawn from `scenario-validator.js`'s own bounds. Plus a bounded near-miss mode. |
| `tests/lib/worker-source.js` | Builds the real artifact to a scratch path and returns the source the app would actually hand a Web Worker — so Worker-side tests exercise what ships rather than a third, hand-assembled approximation. |
| `tests/lib/schema-catalogue.js` | A catalogue of the Scenario and Result shapes, **derived** from the live default plan and live results per mode, plus a committed snapshot. Backs a drift test that names any field added, removed or retyped. |
| `fixtures/` | Python-generated expected values + the `generate_*.py` scripts that produced them. |
| `tools/verify-phase2-extraction.js` | **Retired in place (P6 / Q31).** It re-derives the engine from the pre-Phase-2 ancestor `f06ac7c`, so every legitimate repair since reads as a mismatch. Running it prints why and exits 2. Its one still-valid check — each engine function declared exactly once — moved to `tests/no-duplicate-declarations.test.js` and was widened to the build output and the Worker source (S4 2.5). |
| `tools/bench-simulation.js` | Heap/wall-time measurement harness. Desktop V8 only — see §6 for why those numbers do not transfer to iOS. |
| `tools/verify-test-gate.js` | Release gate: discovers test files instead of trusting `package.json`'s list, requires `jsdom`, fails rather than accepting skips as qualification. Closes R4-F2. **Since S4 2b.2g it fails closed:** every summary counter must be read, and the todo set must match `tools/test-exception-registry.json` by name. The registry has two kinds: revival contracts, which stay todo, and carried residuals, which must leave it. |
| `tools/corpus-invariant.js` | S4 task 3. An independent second measurement of a capture: seven separate checks, none of which borrows `capture-baseline.js`'s corpus, hashing or canonicalisation. It measures the capture; it is not evidence the model is right. |
| `tools/verify-baseline-provenance.js` | S4 5.1. Replays each stored capture's own capture tool at its recorded commit and classifies what its provenance really identifies. |
| `tests/lib/household-ledger.js` | S4 task 6. The household cash-flow ledger as a test instrument (`HOUSEHOLD_LEDGER.md`); not a result field. |
| `tools/differential-harness.js` | S4 task 7. Engine-to-engine comparison over separately resolved trees in separate processes, exact, with a closed outcome set. Routes and criteria are in `DIFFERENTIAL_CUTOVER.md`. |
| `tools/requirements-register.js` + `tools/closeout-check.js` | S4 task 8. Every audit-fix ID in the engine, with its guarding tests (UNGUARDED 0). A carried finding is refused unless it has an owner, a downstream task and a deadline. |
| `tools/test-classification.js` | S4 task 9. Every test file classified as implementation-independent, implementation-coupled or infrastructure (148: 18 / 97 / 33). |
| `tools/build-device-benchmark.js` | S4 task 10. A self-contained phone benchmark page that runs the build's own engine (`DEVICE_BENCHMARK.md`). No device has run it. |
| `build.js` | `app-shell.html` + `engine.js` + `scenario-validator.js` + all **eight** namespaced modules → the shipped single file. Plain text substitution at three markers, no bundler. Each is wrapped in its own IIFE namespace rather than concatenated raw — several define `num` and `clamp` helpers that collide with the shell's and the engine's own. See §4.8. `build()` takes an optional output path so a verification build never touches the shipped artifact. **`DEBT_MODULES` is the single registry the build and the baseline harness both read; `buildWorkerSource()` in `app-shell.html` still hand-maintains its own copy of the name list — Q33, §4.14.** |

### Reference documents — what the rules ARE, kept separate from what is BUILT

Three documents, rewritten 2026-09-10 as implementation specifications and now held in `Resource Documents/`. **They are not claims about the engine, and reading them as such will generate findings that are not defects.** The earlier drafts they supersede are retained under `archive/` for provenance and should not be reviewed as current.

| Document | Contents |
|---|---|
| [`ACCOUNT_RULES_ENGINE_REFERENCE_2026.md`](Resource%20Documents/ACCOUNT_RULES_ENGINE_REFERENCE_2026.md) | Federal and Arizona account rules for TY2026 — contribution aggregation, distribution and RMD rules, inherited accounts, HSA and 529, early-distribution penalty matrix — plus deterministic test vectors, validation invariants, and required-fact stop conditions |
| [`TAX_RULES_ENGINE_REFERENCE_2026.md`](Resource%20Documents/TAX_RULES_ENGINE_REFERENCE_2026.md) | 2026 federal and Arizona tax spec — brackets, capital gains, NIIT, payroll, Social Security taxability — plus the calculation boundary and data contract, tax-funded withdrawal timing, a verification suite, and release gates |
| [`MARKET_DATA_ENGINE_REFERENCE_2026.md`](Resource%20Documents/MARKET_DATA_ENGINE_REFERENCE_2026.md) | Source, transformation, validation and governance standard for market data — approved source catalog, historical replay, Monte Carlo calibration, package manifest, acceptance tests, and licensing constraints |

**The counterpart is `FEATURES.md`'s Account types section**, which states what the engine actually implements — nine types, four tax classes, verified against `ACCOUNT_TYPES`, the embedded rules JSON and `withdrawFromClass()` / `ownerContributionEligibility()` by reading them, not from memory.

**The split is the point.** The reference documents say what the rules are; `FEATURES.md` says what is built; **the gap between them is a deliberate, visible statement of scope, not an oversight.** Where the engine does not model something the reference names — the Roth 5-year rule and its ordering, for instance — that absence is now recorded in one place rather than inferred from source.

Each reference document **states its own staleness schedule in its header**, because IRS dollar figures are republished annually and the code does not expire on that clock. Treat a figure in them as sourced-at-a-date, not as current.

---

## 4. Status ledger

### 4.1 Foundation — done

- Divergent calculator copies merged; regression harness rebuilt from scratch.
- Phase 2: `src/engine.js` extracted verbatim from the monolith — the functions the app already serialized to a Web Worker. Extraction is re-derivable from git history.
- Phases 5–8 + Phase 4: the 14 modules under `src/ported/` ported and fixture-verified by differential replay against the Python engine.
- Track J (debugging/observability module) — built, closing B-3 (silent persistence failures) and C-2 (unguarded worker serialization).
- Simulation identity + one `runScenario()` entry point — done, wired into both the Worker and same-thread fallback paths.
- Tax engine wiring — done (Social Security taxability bug + a 2025/2026 LTCG bracket mislabel both fixed).
- Real amortization schedule + closed-form oracle — done; multi-debt strategy comparison started.

### 4.2 Round-1 audit repairs — done and committed (T01–T09)

All seven confirmed bugs from round 1 are fixed, each in its own commit with a first-failing test.

| Task | Finding | Outcome |
|---|---|---|
| T01 | AUD-004 import containers | Fixed — malformed-import evidence preserved before normalization erases it |
| T02 | AUD-001 tax gross-up basis | Fixed — uses the actual account sold, not class-wide average |
| T03 | Tax-settlement policy question | **Resolved via round 2's finite-algebra rewrite (R2-001/002)** — see §4.4. Requalify alongside R2-T01/T02. |
| T04 | AUD-002 survivor benefit | Fixed — compare before zeroing the deceased partner's amount |
| T05 | AUD-003 RMD surplus | Fixed — proceeds beyond need are retained, not discarded |
| T06 | AUD-005 contribution window | Fixed — dollar contributions stop at retirement |
| T07 | AUD-006 income onset | Fixed — mid-period income prorates instead of returning $0 |
| T08 | AUD-007 debt timing | Fixed — attribution by actual payment date, not a blended fraction |
| T09 | RISK-001 decision clock | **Resolved — start-of-period known-state only, no lookahead.** Implementation queued, not yet in code. |

T10 (packaging/version bump) folded into round 2's R2-T08.

### 4.3 Round 2 — R2-T01/T02 passed after four review rounds

Round 2 concerns two contracts: **R2-T01, the quotation contract** (what the tax-funding quote promises before money moves) and **R2-T02, the settlement contract** (what actually happens to cash and accounts, plus the ARCH-02 validity contract).

| Round | Verdict | Response |
|---|---|---|
| R1 | Reopen T01 + T02, 4 findings | R2V-001 cash lost when cash sufficed but no positive account balances remained; R2V-002 non-finite settlement could report 100% success; R2V-003 calculation errors shown as financial failure; R2V-004 repeated manual classes reused the same quoted balance |
| R2 | Partial | Finite tax solver, named non-finite input rejection, committed-cash invariant |
| R3 | **Engine repairs PASS**; checkpoint FAIL on two UI consumers | All engine work accepted — cash-only settlement, duplicate classes, non-finite inputs, invalid-result contract, committed-cash invariant. Two ARCH-02 violations remained in the UI, not the math |
| **R4** | **PASS** (2026-09-09) | Both consumer defects fixed and confirmed closed by direct source-function probes. All previously-accepted engine repairs retained. Six nonblocking follow-ups recorded — see §4.5 |

**R3-UI-001** — the comparison chart drew a line for an invalid scenario using the active scenario's rows. Fixed: a scenario is plotted only with a real non-empty `rows` array; the legend distinguishes "calculation error, not plotted" from "not calculated yet."

**R3-UI-002** — the heat map's own `toggle` listener bypassed the guard; the error state didn't cancel a queued sweep; cells were classified with an unconditional balance. Fixed: the guard sits on `renderHeatmap()` itself, the queued sweep is cancelled and re-checked, and a new `classifyHistoricalCell()` in `engine.js` inspects the calculation-error signal before `failed` or the balance.

**Classification: externally PASS for the bounded R4 source checkpoint. Still NOT release-qualified** — full DOM/browser verification and the intentionally stale shipped artifact remain outside this approval.

**Reviewed identity (verified locally against the working tree, not merely reported):** ZIP `R2_T01_T02_EXTERNAL_REVIEW_20260909_R4.zip` → `4c83d52c21be93a7b43e4730c1688b3600e5772593b2d0eaab2a4b0b13775755`; `src/engine.js` → `2c996cfc…8904fe5f6f00`; `src/app-shell.html` → `84584586…b87709bf76`. R4 is the accepted baseline and is what is on disk. The accepted tax solver, committed-cash invariant and invalid-result contract are closed — not to be reopened without new evidence.

### 4.4 Verified state

```
npm test  →  915 tests: 913 pass, 0 fail, 0 skipped, 2 todo
```

The count moved 735 → 815 during the new-files-only sprint (§4.7), 815 → 841 during S2 (§4.8), and 841 → 915 during the post-REOPEN repair round (§4.10). The 2 todo entries are recorded findings Q16 and Q18, not skipped work. The 735 figure was the state immediately after the SA repairs.

`node tools/verify-test-gate.js` also passes: it discovers test files from disk rather than trusting `package.json`'s hand-maintained list, asserts `jsdom` is installed, and fails rather than accepting a skip as a pass.

Re-run locally on 2026-09-09 immediately after the R4 PASS: **633 pass, 0 fail, 0 skipped** — `jsdom` is installed in this checkout, so the eight DOM consumer tests genuinely execute here. They were *skipped* in the auditor’s sandbox; per ground rule 3 that is expected, and per the auditor’s own wording skips are not passes. Only the local run supports the 0-skipped figure.

`ENGINE_VERSION` unbumped, deliberately — version bump is R2-T08, gated on the full round-2 queue closing. Golden fixtures not regenerated; shipped HTML confirmed stale (round 2 in-progress source hash does not match shipped HTML — expected, per ground rule 2).

**Correction (2026-09-09):** earlier revisions of this section stated that all of round 2 was uncommitted by design. That was inaccurate — the round-2 source changes are committed (`fac84e3`), and the working tree is clean at `76b1c67` apart from the incoming R4 report. External acceptance closes the round; it was never the thing gating the commit. Per ground rule 7 you still cannot verify this from the ZIP — treat it as reported.


### 4.5 Carried follow-up ledger — accepted with follow-ups, open

The R4 PASS is explicitly *bounded*. These six items were recorded as **nonblocking** by the auditor: none of them blocks R2-T03, and none of them was demonstrated to produce an incorrect financial result. This section is the persistent home for them; they are closed here, not in the round-2 task table.

| ID | Item | Where | Status |
|---|---|---|---|
| **R4-F1** | **Missing-result heat-map guard.** The guard tests `activeResult && activeResult.calculationError`, so an *absent* active result (empty results array, nothing run yet) falls through and still schedules a historical sweep. The queued callback re-check has the identical shape. Requirement: demand a *present, usable* active result both at entry and inside the callback. | `src/app-shell.html` `usableActiveResult()` + entry and both callback re-checks | ✅ **Closed** 2026-09-09. Guard replaced with a positive present-and-usable predicate. Note the finding's stated trigger ("nothing run yet") is not reachable; the reachable one is the transient window after a scenario switch, before the recalculation lands. Both the entry guard and the callback guard have independent first-failing evidence. |
| **R4-F2** | **Eight DOM tests and the real-browser gate are externally unexecuted.** The auditor's function probes are bounded evidence for the two defects, not browser integration testing. A CI/release gate must ensure `jsdom` is installed and must **fail** rather than silently accept skipped DOM tests as qualification. | `tools/verify-test-gate.js` + `tests/verify-test-gate.test.js` | ✅ **Closed** 2026-09-09. The gate discovers test files rather than trusting `package.json`'s hand-maintained list, asserts `jsdom` is present, and **fails** rather than accepting skipped DOM tests as qualification. It does not make jsdom a browser (§8 item 5 stands) — it makes a skip-based false qualification impossible. |
| **R4-F3** | **Some maintained DOM tests run the app's real rolling-history loop** on a one-period fixture, so they are not stub-only despite the audit restriction. Future bounded consumer tests should inject fabricated results and stub history execution. | `tests/audit-r2-cash-settlement.test.js` DOM tests | Open for that file. ✅ Closed for `tests/audit-r4-heatmap-guard.test.js`, which now stubs historical sweeps and counts them instead of executing them. |
| **R4-F4** | **One comparison test title overstates its behavior.** The title says the invalid-active case plots only the valid comparison; the assertions and the implementation both *clear the entire chart*. Clearing is correct and accepted for the dedicated error screen — only the title is wrong. Rename it. | `tests/audit-r2-cash-settlement.test.js:591` | ✅ **Closed** 2026-09-09. Renamed; assertions and implementation were already correct. |
| **R4-F5** | Carried limitations restated, not closed by this checkpoint: general JSON-clone normalization; broader scenario-shape/finite validation; partial-diagnostic labelling and count consistency; no organic `TAX_COMMIT_SHORTFALL` reproduction. | §8 items 1–4 | Carried |
| **R4-F6** | Other audit items remain open: **R2-003 through R2-007**, HR-01/HR-02. Shipped HTML unchanged and stale, `ENGINE_VERSION` unchanged. **This checkpoint is not permission to release.** | §5.1 queue | Carried |

Scope note the auditor attached to the accepted work: `classifyHistoricalCell()` checks raw `simulatePlan()` error-age signals before financial failure and rejects non-finite ending balances, which matches its current heat-map caller. It is accepted **for that caller**, and is not established as a general validator for every possible result shape.


---

### 4.6 Sprint audit (R2-T03–T07 + R4-F1) — REOPENED on five findings, all now repaired

One sprint implemented R2-T03, R2-T04, R2-T05, R2-T06, R2-T07 and the R4-F1
follow-up back-to-back, under a brief that explicitly overrode ground rule 8
for that run only. It was then externally audited
(`SPRINT_EXTERNAL_AUDIT_20260909.md`), which returned **REOPEN**.

The audit confirmed the repairs were substantive — 75 supplied tests passed,
and reverse-diff checks independently showed many of them failing against the
pre-sprint source — but found five remaining defects, three of which could
silently produce materially wrong financial output. **One, SA-03, was a
regression the sprint itself introduced.**

| ID | Sev | Finding | State |
|---|---|---|---|
| **SA-01** | P1 | Accepted incomplete nested records are not inert. `retirement.stages = [{name:"Go-go"}]` passed both validators and **silently zeroed all retirement spending, with no calculation error** — `applyStage()`'s `age < s.start \|\| age > s.end` test is false on both sides when the boundaries are absent, so the stage applies. A recurring income with no `end` pays forever. | ✅ Repaired. A present record must now be a **complete** financial instruction; absent containers still migrate. Field sets taken from the records the app itself writes. See SPRINT_QUESTIONS.md Q7 (user decision: reject the import). |
| **SA-02** | P1 | A rejected import's queued calculation still published. `writeStatic()` → `setPage()` → `calculate()` starts work for the candidate *before* the apply phase can throw; the rollback restored three variables but never advanced the generation, so the candidate's job completed and wrote a **$9,000,000 projection onto the restored $1,000,000 scenario**, overwriting the rejection message with "Projection updated". | ✅ Repaired. Rollback now advances the generation, cancels workers and pending timers, and results publish only onto the scenario identity they were computed for. |
| **SA-03** | P1 | **Regression introduced by this project's own R2-T06 repair.** Registering the synthesized RMD holding's rate gave the source account's rate a second vote in the Monte Carlo return signal, so a **+2.5% period read as −1.667%**, falsely triggering the post-down-year cut ($18,000 instead of $20,000) in a period whose portfolio had grown. | ✅ Repaired. The policy signal is snapshotted where the rate set is authoritative and never re-derived from a structure that has since been extended. See Q8. |
| **SA-04** | P2 | The balance repair passed, but a later period's decision still multiplied `priorSpend` by **that same period's** not-yet-realized historical inflation: $40,000 → $44,000 on that information alone. The no-lookahead claim could not stand unqualified. | ✅ Repaired. Decisions now use the last observed CPI change. See Q6 (user decision: fix the lag, not document it as ex-post). |
| **SA-05** | P2 | The engine fix passed, but both UI callers still invoked `auditContributions()` without eligibility, so the account summary showed "1 warning" quoting the very limit violation R2-T04 removed. | ✅ Repaired. One shared `ownerContributionEligibility()` in the engine, used by `simulatePlan()` and both UI consumers, and registered for Worker serialization. |

Also closed from the audit's item 6: bounded history stubs for the heat-map
consumer tests (R4-F3 for that file), an independent first-failing probe for
the heat-map callback guard, and the Q2c reserve-equivalence policy quantified
and pinned by test.

**What this round is NOT.** These repairs are locally verified only —
**735 pass, 0 fail, 0 skipped** — and have not been externally audited. Three
of the five findings were P1, and one was self-inflicted, so a fresh external
checkpoint is the appropriate next gate rather than release work. Everything
the R4 checkpoint already accepted (the tax solver, the committed-cash
invariant, the invalid-result contract) is untouched by these five findings,
which concern different boundaries.

**Architecture conclusions carried from the audit**, for the work after this:

1. **Decision state versus execution state.** Opening balances, observed
   inflation and the period's policy-return statistic want to live in one
   small immutable context, with future realized data and mid-period
   account creation kept outside it. All three of SA-03, SA-04 and the
   original R2-T07 leak are the same mistake in different clothes.
2. **Rendering versus committing an import.** Rendering should not implicitly
   persist a candidate or start calculations.
3. **Shared eligibility versus presentation recomputation.** Independent UI
   recomputation with omitted arguments had already drifted once.

The indexed account/rate arrays remain fragile; an account-ID rate map would
make missing growth harder to introduce, but is a separate behaviour-preserving
refactor.

---

### 4.7 New-files-only sprint — six new modules, no file under review touched

A sprint run after the SA repairs was deliberately shaped so that **every task
created new files only.** Nothing in it modifies `src/engine.js`,
`src/app-shell.html` or `src/scenario-validator.js`. That constraint was the
direct lesson of §4.6: SA-03 was a regression that rode out inside an unrelated
task's diff, and the R4 report had already cautioned against combining
unrelated repairs.

**The property is demonstrated, not asserted.**
`git diff --stat <sprint-start>..<sprint-end> -- src/engine.js src/app-shell.html src/scenario-validator.js`
is **empty**. The only pre-existing files touched are one test file (a rename,
R4-F4) and `package.json` (registering new test files). Per ground rule 7 you
cannot verify this from the ZIP — but you *can* verify the consequence, which
is stronger: **no existing scenario's output can have moved**, because no code
on any existing execution path changed.

| Landed | What it is |
|---|---|
| `src/debt-refinance.js` | Refinance analysis: break-even month, total interest both ways, clock extension, closing costs financed vs. paid, cash-out, over a stated common horizon. Assembles from the already-oracle-verified `amortizationSchedule()` rather than a second amortization loop. |
| `src/debt-arm.js` | Real ARM: rate path from index + margin under initial/periodic/lifetime caps and a floor, re-amortising over the **remaining** term at each reset, plus worst/best-case brackets. Its identity test: with caps unbounded and a constant index, it must reproduce `amortizationSchedule()` exactly. |
| `tests/lib/scenario-generator.js` | Seeded valid-by-construction generation, ranges drawn from the validator's own `checkRange`/`checkEnum` declarations. Plus a bounded near-miss mode (capped at 200 cases) motivated directly by SA-01. |
| `tests/reconciliation-invariant.test.js` | **Track B L4** — the validation pyramid's one never-built layer. Asserts sources-equal-uses for every row of every path, across the golden set and a seeded generated sweep. Confirmed to detect a deliberately introduced imbalance before being trusted. |
| `tools/bench-simulation.js` | First performance instrumentation in the repository. See §6 for the measured figures and the caveat that governs them. |
| `tools/verify-test-gate.js` | Closes R4-F2. |

**Two corrections this sprint produced, both to claims made in earlier
revisions of this document.** They are listed here rather than quietly edited
because a reader holding an older package should be able to tell what changed:

1. **§5.2's "per-key reallocation" was stale.** The aggregation loop does sort
   21 times per projection year, but `values = new Array(validCount)` is
   hoisted outside both loops and `sort()` is in place — the array is allocated
   once per aggregation, not once per key. Corrected below.
2. **§6's memory figure was low by ~1.8×, and it does not change the
   conclusion.** Measured rather than derived: see §6.

**Two things this sprint deliberately did not do**, both recorded so they are
not mistaken for oversights. It did not wire any new module into the live
engine or UI — superseding the live single-step ARM model changes output for
every scenario carrying an ARM debt, which is a watched-session decision and
exactly the change class that produced SA-03. And it recorded defects rather
than repairing them, for the same reason.

---

### 4.8 Sprint S2 — the debt modules become reachable, and an ARM finally has payment shock

Run 2026-09-10, four tasks, one commit each (`daba57d`..`7e9e980`). **Engine edits were authorised for this sprint** — a deliberate reversal of §4.7's constraint — but spent on exactly one bounded behaviour change rather than taken as a broad licence.

**The safety property that replaced "new files only":** `tests/fixtures/golden-scenarios.fixtures.json` is **byte-identical** to its pre-sprint state (`git diff --stat` on it is empty), and `investment-calculator-v2c.html` was never rebuilt (`git status` on it clean). Per ground rule 7 you cannot verify the git claims from the ZIP — but the consequence is checkable from the source: the only behaviour change in this sprint is gated behind a flag that defaults `false`, and no scenario in the package sets it.

| Landed | What it is |
|---|---|
| `src/debt-recast.js` | Recast vs. curtailment. The same lump sum either buys **monthly cashflow** (recast: payment falls, term unchanged) or buys **interest and time** (curtailment: payment unchanged, term shortens). Reports payment delta, total interest and payoff month for both, against a do-nothing baseline, plus an explicit recast fee defaulting to zero. |
| `tests/debt-modules-properties.test.js` | Seeded randomized properties over all four F2 modules — 7 properties × 200 seeds, every seed named in its own assertion message so any failure is reproducible from one integer. |
| `build.js` + `/* DEBT_MODULES_SOURCE */` in `src/app-shell.html` | All six `src/debt-*.js` modules inlined into the shipped file, each wrapped in its own IIFE namespace. |
| `src/engine.js` `projectDebts()` + one `defaultPlan.advanced` field | ARM payment re-amortization at reset, behind `advanced.armRecastOnReset`, default `false`. |

**Why the bundling is not concatenation, and the evidence it was checked rather than assumed.** Dropping six module scopes into one script scope collides twice, verified in source before the work started: `clamp` (`src/engine.js` vs. `src/debt-arm.js` — same arity, and as it happens the same formula, so that collision is behaviourally silent, which makes it harder to detect, not safer) and **`num`** (`src/app-shell.html`'s `num(id, f)` **reads a DOM element by id**; `src/debt-refinance.js` and `src/debt-arm.js` define `num(v, fallback)` which **coerces a value** — same arity, opposite meanings). The naive-concatenation build was **constructed and observed failing first**: a debt module's internal `num(24, 0)` call resolved to the shell's DOM reader, which evaluated `root.querySelector("#24")` and threw `DOMException: Invalid selector #24`. The direction is worth stating precisely, because the planning note had it as an either/or — the shell's `num` is declared textually *last*, so it wins the hoisting contest and the **debt modules** are what break, not the UI. `tests/build-debt-bundling.test.js` holds both halves: the naive build must fail, the wrapped build must not.

**The `projectDebts()` change, stated as a defect first.** The rate stepped at `nextRateResetAge` to `resetRate`, but `monthlyPayment` stayed at the household's entered `paymentMonthly + extraPrincipalMonthly` for the entire projection and was never re-amortised. So a 4% ARM resetting to 8% kept paying the same amount and simply amortised more slowly. Because `debtFlow.retirementPayments` feeds `requested` retirement spending, **an ARM reset could not move retirement cashflow at all** — and payment shock is the entire reason a retirement plan would model an ARM rather than a fixed loan. First-failing evidence was captured against the committed pre-sprint engine: flag-off and flag-on produced *identical* payments, $1,432.25 both ways.

**Four things about that change to probe specifically:**

1. **The payment is recomputed every period after reset, not frozen at the reset moment.** The justification is the level-payment identity: recomputing `PMT(current balance, rate, remaining term)` at any point along an exactly-amortising schedule reproduces the same payment, so the stateless form and a frozen form agree *whenever the model is internally consistent*. That "whenever" is the thing to test — `projectDebts()` is a coarse period-stepping approximation, not a true monthly ledger, so if its balance trajectory ever departs from an exact amortisation the two forms diverge and the recomputed one silently tracks the departure. Remaining term is `Math.max(1, Math.round((d.payoffAge - periodStart) * 12))`, taken as self-consistent with the engine's own hard payoff at `d.payoffAge` in the same function.
2. **The flag is a transitional migration flag, not a modelling choice.** Real ARMs re-amortise unconditionally; the default-off behaviour is not an alternative model, it is the defect preserved deliberately so this sprint could not move output while this package was pending. The intended end state is unconditional.
3. **`DebtAmortization` is referenced from `src/engine.js` as a bare identifier.** In the shipped bundle it resolves to the IIFE namespace inlined immediately above the engine in the same script scope. Under Node it resolves via the global object, with the test file setting `global.DebtAmortization` before requiring the engine — mirroring the pre-existing `global.RULES` convention ~49 test files already use. It is an unusual pattern, it is deliberate, and it is why task 4 could not have preceded the bundling task.
4. **The schema cost was verified, not assumed.** `validateAdvanced()` checks fields with `if (advanced.X !== undefined)` and has no allowlist and no unknown-key rejection — the SA-01 completeness rules apply to nested records (`NESTED_RECORD_SPECS`), not to `advanced` scalars — so no validator change was needed. `normalizedPlan()` merges `defaultPlan.advanced` over every import, so previously saved scenarios pick the field up as `false` automatically and no migration was needed. `src/scenario-validator.js` was **not modified by this sprint**, verified by diff.

**One defect was found and deliberately NOT fixed — this is the first thing to check in this section.** `buildWorkerSource()` assembles the Web Worker's script independently of the main thread: the constants, plus each function named in `workerFunctions`, serialized via `fn.toString()`. `DebtAmortization` appears in neither list. So a calculation running **through the Worker** — the app's default path — with `armRecastOnReset:true` and an adjustable debt at or past reset would throw `ReferenceError: DebtAmortization is not defined` inside the worker, surfacing as an `error:` on the returned message rather than as a wrong number. It is unreachable today (no UI control, no scenario sets the field) and it fails loudly rather than silently, but it means **the feature as shipped is main-thread-only, and the flag must not be defaulted on until this is closed.** It was found by inspection, not by a failing test, because nothing in this suite drives a real background Worker. Recorded as `SPRINT_QUESTIONS.md` Q15 with the one-line fix written out. **If you think that reasoning is too comfortable — that a latent crash on the default calculation path should have blocked the task rather than been queued — that is a legitimate process finding and worth saying so.**

**Two test-level judgment calls, disclosed because an auditor should not have to find them:**

- **Two tolerances in the new property file were widened from the hand-written suite's 1e-6.** The property sweep runs to $2,000,000 principals over 480-month terms with resets as frequent as monthly, chaining far more re-amortization segments than the hand-written ARM identity (25 resets, $400,000). Worst-case drift was **measured across all 200 seeds before the bound was chosen** — ~1.8e-6 and ~2.6e-5 — and the bounds set to 1e-4 and 1e-3: roughly 40–50× headroom, still a hundredth and a tenth of a cent. Recorded as test calibration rather than as a finding about the modules. If you disagree that this is calibration rather than concealment, those measured numbers are what to attack.
- **One task-3 test was rewritten during task 4.** It originally compared the build byte-for-byte against one made from `git show HEAD:build.js` + `HEAD:src/app-shell.html`. That anchors to a moving target: the moment task 4 legitimately edited `app-shell.html` (by exactly 23 characters — `,armRecastOnReset:false`) the check failed on its own success. It was replaced by a structural check — `build()`'s output must equal its shell with each marker replaced by its own independently-read piece, in the right relative order — testing the same substitution-mechanics property without depending on git history.

**What S2 deliberately did not do.** It did not wire `src/debt-arm.js` into the live model: replacing the two-field single-step ARM with the real index + margin + caps model needs six or more new debt fields, validator rules, UI and migration, and would change output for every scenario carrying an adjustable debt. It added no UI. And it did not fix Q15.

---

### 4.9 Whole-model audit, 2026-09-10 — **REOPEN**, 9 findings (4 P1, 5 P2)

`FULL_MODEL_AUDIT_AND_CLAUDE_HANDOVER_20260910.md`. The package described in §4.6–4.8 was submitted and returned **REOPEN, with an explicit instruction not to advance to R2-T08.** Nothing in this section is repaired yet; this records the verdict and what was independently confirmed.

**The prior checkpoints held.** All five SA repairs passed for their named reproductions, and no new quote-versus-commit defect was established against R2-T01/T02. The new findings sit at *different* boundaries — which is the expected yield of widening from a delta audit to a whole-model read, and is the argument for having run the whole-model round.

| ID | Sev | Finding | Reproduced here |
|---|---|---|---|
| **FM-01** | P1 | **Historical SS uses the wrong owner/calendar mapping.** `growthFromCola` derives its history offset as `startAge − p.profile.age`; called for the spouse, `startAge` is the *spouse's* claim age while `p.profile.age` is the *self's* start age, so **the age gap between two people is treated as elapsed calendar time.** | ✅ **Exactly.** $12,000 → $13,200 from one edit to `HIST_COLA[2022]`. **And it is live against the shipped data**: the 2021 row already reads $13,044 = $12,000 × 1.087, i.e. 2022's real COLA on a 2021 payment |
| **FM-02** | P1 | **Two-senior deduction phases out once instead of per person.** The IRS worksheet reduces each person's $6,000 separately then adds; the code starts at $12,000 and subtracts one reduction. | ✅ **Exactly.** $9,000 vs. $6,000 at $200k joint MAGI. The single-senior case is identical either way — which is why the existing tests miss it |
| **FM-03** | P1 | **Outside-income surplus is omitted from settlement and retention.** `need = max(0, requested − outside)` discards the negative side; only surplus *RMD* cash reaches tax funding. | ✅ **Confirmed.** $60k pension − $20k spending leaves $40k unaccounted, *while the model sells $6,290 of investments to pay the tax bill*. No shortfall, no calculation error, no invariant issue |
| **FM-04** | P1 | **Thrown engine errors bypass the invalid-result contract**, leaving prior financial figures displayed. | ✅ **Structurally.** `Promise.resolve(plans.map(runScenario))` evaluates the engine *before* the promise exists, at two sites |
| **FM-05** | P2 | ARM is effectively recast every period after its single reset when `extraPrincipalMonthly` is set — prepayment breaks the level-payment premise §4.8 relied on | Accepted; §4.8 flagged that premise as the thing to test, and it did not hold |
| **FM-06** | P2 | An ARM reset *inside* a period is postponed to the next period, despite month-level payment stepping | Accepted |
| **FM-07** | P2 | A fractional opening period receives a full-year inflation uplift at the next decision | Accepted — **and partly a policy fork**, see below |
| **FM-08** | P2 | Clearing a numeric input does not invalidate in-flight work; stale results publish and mark the plan clean | Accepted |
| **FM-09** | P2 | **The new ARM flag has no boolean validation.** `"false"` validates clean and enables the feature by truthiness | ✅ **Confirmed.** Zero validator issues; `Boolean("false")` is `true` |

**Three of these deserve to be read as one lesson about the test suite rather than three separate defects.** 841 tests pass against source containing four P1s, and the audit's diagnosis of why is correct:

- **Consistency is not correctness (FM-02).** The deduction is computed twice and the quote/commit machinery verifies the two *agree*. They agree — on the same wrong rule. No amount of algebraic cross-checking can surface a misread statute; that needs a fixture whose expected value came from the IRS worksheet, not from the code. §5E of the audit generalises this and it is the single most useful architectural note in the report.
- **An identity can only catch what it contains (FM-03).** The L4 reconciliation invariant passes on FM-03's scenario because the omitted outside cash never enters the identity being asserted. It is a *portfolio* identity; FM-03 is a *household* cash defect. Money can leave the household without violating it.
- **"The validator does not reject X" is not "X cannot be enabled" (FM-09).** §4.8 above states, as a positive, that `validateAdvanced()` has no unknown-key rejection so no validator change was needed. That was true and it was the wrong thing to check.

**Q15 — corrected in both directions, and the proposed fix was wrong.** The gap was disclosed, so it is not counted as a new discovery, but two of this project's claims about it were corrected: it is **more reachable** than stated (an importable field needs no UI toggle), and **less severe** (the worker error is caught and the calculation transparently reruns on the main thread — the user gets a slow answer, not a dead one). More importantly the one-line repair written into `SPRINT_QUESTIONS.md` **does not work**: `monthlyPayment` calls the private `monthlyRate` helper, so serializing the public function alone loses its closure and throws `ReferenceError: monthlyRate is not defined`. The real fix packages a complete dependency graph once and feeds both entry points — see §5D of the audit on worker generation being a second, hand-maintained build system.

**The safety property that carried §4.7 and §4.8 does not survive this round.** Those sprints could promise "no existing output moved" (byte-identical golden fixture). **FM-01, FM-02, FM-03 and FM-07 are correctness repairs that change financial output by design.** The fixture must move, and the discipline changes from *prove nothing moved* to *explain every number that moved before updating the expected value*.

**Three findings are policy forks, not purely defects**, and are being put to the user rather than decided inside a repair: (a) **FM-03** — which account receives retained surplus cash, and whether the product should deliberately *spend* surplus rather than retain it; (b) **FM-07** — whether a partial opening period should get a full annual uplift, which may be an intended spending-calendar rule; (c) **FM-06** — the pre-existing flag-off ARM rate timing, whose correction moves existing output and so needs an explicit reviewed decision.

**Not received:** `FULL_MODEL_AUDIT_EVIDENCE_20260910.zip`, which the report says carries the reproduction scripts. Only the handover `.md` arrived. Not blocking — the P1s were reproduced independently here — but the auditor's exact probes cannot be rerun directly.

---

### 4.10 Repair round R1–R7 — all 9 findings repaired, plus Q15

Run 2026-09-10 in seven checkpoints, one bounded repair per commit, in an order chosen so the repairs that move **no** financial output land first and rebuild the safety net the output-moving ones are then verified against.

| Sprint | Finding | Repair |
|---|---|---|
| R1.3 | **FM-09** | `advanced` boolean flags validated as booleans. Validated, never coerced — `Boolean("false")` is `true`, and a test pins that so the coercion trap cannot be reintroduced. Absence still migrates. |
| R1.1/1.2 | **FM-04, FM-08** | Repaired together because the audit's §C identifies one root cause. Engine evaluation moved inside an exception-to-promise boundary at both sites; terminal failure now publishes a structured invalid result rather than leaving stale figures on screen. An emptied input now invalidates in-flight work like every other edit. |
| R1.4 | — | **Full-output baseline harness** (`tools/capture-baseline.js`), plus the pre-repair capture the rest of the round is diffed against. |
| R2 | **FM-02** | Senior deduction phases out **per person**. Corrected in the estimator *and* the solver's affine mirror together. |
| R3 | **FM-01** | Historical COLA indexing takes an owner-specific calendar origin. |
| R4 | **FM-03** | Outside-income surplus is tracked, funds tax **before** any asset is sold, and has an explicit destination. |
| R5 | **FM-07** | A spending decision applies the inflation actually accrued over the previous period. |
| R6 | **Q15, FM-05, FM-06** | The worker gets the complete debt dependency graph; the ARM payment is held between resets and lands on its true month. |

**Three user decisions were taken rather than guessed** (the SA round's lesson): D-1 surplus destination — retain into an account, with **selectable presets** (`advanced.surplusPolicy`: retain / invest / spend, defaulting to the conservative *retain*); D-2 partial-period inflation — scale to elapsed time; D-3 flag-off ARM reset timing — fix it.

#### The fixture protocol, and what it actually caught

§4.7 and §4.8 could promise a byte-identical golden fixture. **Four repairs here change financial output by design**, so that property was replaced with: *predict what will move before regenerating, then explain every number that did, and treat an unpredicted movement as a finding rather than widening the prediction to fit.*

It earned its keep twice, and both are worth reading as evidence about the process rather than the code:

1. **It caught a repair over-reaching.** R3's prediction was "no golden scenario moves". `rmd-and-roth-conversion` moved by exactly $1,008 — one 2.8% COLA step on a $36,000 benefit. Investigating rather than accepting it showed the repair had *also* changed the COLA **step count**, not just the index origin. That scenario is age 68 with `ssClaim: 67`, and `ssaBenefitAtClaim()` treats the entered figure as the **FRA-referenced PIA** rather than today's payment — so growth from the claim age forward is how the model brings it to the current year. The step-count change was cutting a legitimate year of indexing. **Reverted; only the index origin moves.** Without a written-down prediction that would have looked like an intended consequence of a P1 repair and been regenerated into the fixture.
2. **It surfaced an inconsistency inside a new construct.** R4's prediction did not include rising taxes; they rose. Investigation found the new zero-return cash holding was still being charged the 1.5% imputed dividend — taxing income it could not produce. Fixed, and the retain preset is now genuinely conservative rather than *invest* under another name.

#### Whole-round output reconciliation

**Corrected 2026-09-11**, per the re-audit's section 4: **ten comparable scenarios moved and two were added.** The original "twelve moved" conflated the two. A newly added capture has no pre-repair counterpart, so it cannot demonstrate pre/post movement -- the targeted spouse-SS scenarios are supported by direct counterfactual tests instead. Ten before/after movements, every one attributable:

| Cause | Scenarios |
|---|---|
| **FM-03** outside surplus retained instead of vanishing | `golden:rmd-and-roth-conversion`, seeds 1, 2, 5, 8, 10, 17 |
| **FM-02** two seniors above the joint phaseout | seeds 4, 18, 20 |
| **FM-01** spouse SS on the right calendar | `targeted:historical-spouse-ss`, `targeted:spouse-cola-income` |

A further **15 scenarios differ only in `identity.inputHash`** — benign, and worth stating plainly: two new schema fields (`surplusPolicy`, `armRecastOnReset`) are part of the hashed input. No output moved in those.

**Golden fixture:** regenerated once, for `rmd-and-roth-conversion` only, 11 lines. Direction confirmed at first-order before regenerating — its row 1 withdrawals went **10,798 → 0** (no assets sold while outside cash was available) and the portfolio rose $40,323, while deficit rows were untouched.

**Lifetime taxes rise** in the FM-03 scenarios (155,126 → 161,791 for the golden one). That is a real consequence, not a defect: money that used to vanish now exists, stays in the household, and is eventually taxed.

#### Three findings recorded rather than repaired (ground rule 11)

- **Q16** — in historical mode a claim predating the projection still grows on the projection's own first history years. Needs a decision on which rate applies to unavailable pre-start years. `todo` test attached.
- **Q17** — **the seeded generator cannot produce a spouse Social Security benefit at all.** It jitters unconstrained numerics around `defaultPlan`'s own value and `spouseSS` is 0, so it is 0 for every seed (verified across 200). Four corpus scenarios *look* like they cover FM-01 and all four have `spouseSS: 0` — the harness reported IDENTICAL for a genuine P1 repair. Mitigated by two hand-built targeted scenarios, proven to detect the defect when it is temporarily reintroduced. The real fix needs a range decision and belongs in the generator.
- **Q18** — with `incomeOffset:false`, outside cash still has no destination. The audit told this repair to preserve that policy separately, and what the setting *means* is unresolved. `todo` test attached.

#### Also fixed, and worth flagging as a process point

A **latent fragility in shared test scaffolding**: four DOM test files located the app by "the first `<script>` that isn't JSON". When `src/app-shell.html` gained a `<head>` carrying a PWA manifest/icon bootstrap, that predicate silently selected the bootstrap instead, **23 tests stopped exercising their subject**, and every one of them failed reporting an empty status string rather than anything about the behaviour it was written to check. Selection now keys off the app's own root lookup. Same shape as the audit's §E, one layer down: a test that quietly stops testing still reports something.

#### What this round did not do

The three behaviour-preserving refactors remain queued and unstarted. No UI work. `ENGINE_VERSION` unchanged and the shipped HTML still stale — **R2-T08 remains gated**, downstream of this round rather than part of it.

---

### 4.11 Repair round RR2 — the re-audit REOPENED FM-03, and was right on all four counts

`REAUDIT_AND_CLAUDE_HANDOVER_20260911.md` re-audited the R1–R7 repairs. Eight of the nine original findings and Q15 pass their named repair scope. **FM-03's repair was REOPENED** on four new findings — two P1, two P2. Every headline figure was independently reproduced here before any of it was accepted, from probes calling neither the repair's own helpers nor its oracles, and every one matched to the cent.

| Finding | Audit figure | Reproduced |
|---|---:|---:|
| RA-01 default vs. pre-R4, **zero outside income** | −$5,231.90 | −$5,231.90 |
| RA-01 `spend`, first retirement row | $38,058.60 | $38,058.60 (→ $41,447.96) |
| RA-02 Case A, cash receives market growth | $3,231.388404 | $3,231.388404 |
| RA-02 Case B, invest destination misses growth | $1,688.908169 | $1,688.91 |
| RA-03 fictitious dividend / extra tax | $1,038.075 / $25.95 | $1,038.08 / $25.95 |
| RA-04 non-finite values collapse to one hash | all equal | all four equal |

Two corroborations beyond the figures. `invest` reproduces the pre-R4 engine **exactly** ($1,192,661.89 both), which is the decisive evidence for RA-01 — the default did not drift, it changed behaviour a prior audit had accepted. And under `spend` the RMD surplus **escalates** ($5,000 → $38,058.60 → $41,447.96), so a preset meant for pension surplus was converting a fixed-nominal plan into an escalating-lifestyle one.

#### One mistake in three places, and a fourth that is worse

RA-01, RA-02 and RA-03 are not independent findings. R4 introduced two new constructs — a **household cash holding** and a **surplus policy** — and taught them only to the code paths R4's own tests walked.

- **RA-03** is the clearest instance. Cash was excluded from the imputed-dividend base because that is the branch the fixture prediction surfaced; the enabled-dividend branch computed its base *and* drew its cash from the entire taxable class, and was never inspected. The branch that failed got fixed; the rule that was wrong did not.
- **RA-01** is worse than a missed branch. The comment on `retainExcessRmdCash()` asserted that the pre-existing RMD path passes `asCash=false`. The live caller passes `surplusPolicy==="retain"`, true by default. The comment recorded the intended design and the code did the opposite — and the direct helper tests still defaulted to the old path, so **the suite agreed with the comment instead of with the caller.**
- **RA-02** is an ordering bug in policy costume. `rates` is index-aligned and built before settlement, so a mid-period account has no entry. R4 registered the RMD *source's* rate — right for the case it was written for, and exactly backwards for both cases FM-03 introduced: the preset named for holding cash grew at 10%, the preset named for investing did not grow at all.
- **RA-04 is the one to take most seriously.** `stripExcluded()` ran `JSON.parse(JSON.stringify(...))` *before* `canonical()`, so the non-finite tagging executed on values already turned to `null`. The test called `hashOf()` directly and passed. That is precisely the failure written up in §4.10 — *a test that quietly stops testing still reports something* — committed one file away, in the same round, by the author of that sentence.

**Ground rule added:** a repair that introduces a new *kind* of entity must enumerate every site reasoning about the category it joins — growth, dividends, withdrawal ordering, RMD basis, allocation, tax class, invariants — in the brief, before the repair. Fixing the site that failed is not evidence the rule is applied.

#### User decision, 2026-09-11

Asked whether `surplusPolicy` should govern outside income only or the whole household, the user answered: *"allow an option to direct where the money goes from each individual source."* That is the stronger answer. RA-01's defect is that provenance is **destroyed** where `availableCash = rmdCashForTax + outsideSurplus` collapses two pools into one scalar; a per-source destination cannot be implemented without carrying the split, so building it repairs the mechanism rather than special-casing the symptom.

`rmd` defaults to `invest` — which *is* its pre-R4 behaviour — so accepted behaviour is restored by a default rather than a special case. Absence and malformedness differ deliberately: absent means "use the default", while a present-but-unrecognised value falls back to `retain`, so a malformed import cannot resurrect the vanishing behaviour FM-03 fixed.

#### The checkpoints

| Sprint | Finding | Repair |
|---|---|---|
| RR2-1 | **RA-04** | Structural clone preserving non-finite; captures store the canonical form; every hash recomputed from the contents it claims to describe. Repaired **first**, because it is the instrument the other three are measured with. |
| RR2-2 | **RA-01** | Per-source surplus ledger and destination, validated in `scenario-validator.js` (including unknown source keys). Deposits grouped by destination, so a shared policy still makes exactly one deposit. |
| RR2-3 | **RA-02** | Destination growth registered from **policy**, not provenance. `suppressDraw` guarantees a synthesized account never shifts the RNG stream. |
| RR2-4 | **RA-03** | One `dividendEligibleAccounts()` definition, used by both dividend branches for the base **and** the draw. |

#### Reconciliation, and a prediction corrected

Against the state the re-audit reviewed, 27 scenarios changed `identity.inputHash` (one new hashed schema field — benign) and **three moved further**:

- **seed:10** — real, and fully attributed: forcing all five sources back to `retain` reproduces the prior numbers **bit for bit** (`lifetimeTaxes` 7450590.18932525, row-28 `taxable` 318192.2587649125). The per-source machinery is therefore behaviour-preserving; only the intended default differs.
- **seed:17, seed:18** — four fields each, 1 ULP. Irreducible rather than overlooked: `a*(x/t)+a*(y/t)` is not bitwise `a`, so attributing a residual across sources cannot be bit-preserving. A branch that skipped the split when all policies happen to agree would silence it and would be a worse liability than 1 ULP.

**The prediction was corrected rather than widened.** RR2-2 predicted `golden:rmd-and-roth-conversion` would move; it did not. Seven corpus scenarios have `rmdOn` true but only **two** produce RMD *surplus* — the rest consume all their RMD cash, so there is nothing for a destination policy to direct. "Has RMD" does not imply "has RMD surplus."

Separately, the §4.10 claim that "twelve scenarios show real movement" is **corrected** per the re-audit's §4: ten comparable scenarios moved and two were *added*. An added capture has no pre-repair counterpart and cannot demonstrate pre/post movement.

#### Two predictions that held, and why that is itself a finding

RR2-3 and RR2-4 both predicted **IDENTICAL**, and both were. That means **the 27-scenario corpus does not exercise RA-02 or RA-03 at all.** The seeded generator jitters *numerics* around `defaultPlan`'s values and never varies enumerated policy fields, so `surplusPolicy` is `"retain"` and `dividendOn` is `false` in every generated scenario. A P1 and a P2 were invisible to the entire baseline. Same root cause as **Q17**; recorded as **Q21**, and it belongs in the generator alongside Q17's fix.

#### Also recorded

**Q19** — pro-rata tax allocation across cash pools, and the suppressed-draw divergence under Monte Carlo. Both are choices, not derivations, and are written down so an auditor can challenge them without excavating a comment.

**Q20** — the worker function registry is hand-maintained and broke twice this round (`ReferenceError: SURPLUS_SOURCES is not defined`, then the two dividend helpers). Same shape as **Q15**, whose fix was to package the whole graph once. Deriving the engine's list belongs in S3.

#### What this round did not do

Q16 and Q18 remain open — both need product decisions, not repairs. Q17 and Q21 need a generator fix. The re-audit's seven required S3 brief updates are not applied. No UI work; `ENGINE_VERSION` unchanged; shipped HTML still stale. **R2-T08 remains gated.**

---

### 4.12 Adversarial inspection of the re-audit, and Q22

The re-audit was turned back on itself: every claim in it that could be checked here was checked. **Its four findings were correct and its arithmetic is meticulous** — Q17's sweep (76 of 200 seeds enable a spouse, zero have a nonzero `spouseSS`) reproduces exactly, its file counts reconcile (102 discoverable, 72 explicit entries + a 30-file glob + `regression-suite.js` = 103 declared), and its line citations are all precise. Its self-declared limits are honest.

Three problems survived that scrutiny.

**1. It missed a finding lying inside its own theory — now Q22.** RA-02 argues that FM-03 introduced a new *kind* of entity and that every site reasoning about the category it joined must be re-checked. The re-audit applied that to **growth** and **dividends** and stopped. **Withdrawal ordering** is the third site, and it was wrong: `retainExcessRmdCash()` created the holding with `priority: max + 1` — a line written to give a synthesized account a unique sort key, which silently became a spending policy of *last*.

| 100k invested @ 40% basis beside 100k retained cash; draw 50k | Realised gains |
|---|---:|
| As shipped (cash sorts last) | **$30,000.00** |
| Cash reachable first | **$0.00** |

Dominated on both axes — the asset earning the market return is sold while the zero-return holding is preserved, *and* capital gains are realised that spending 100%-basis cash would not have realised. It compounds for as long as the cash sits there.

**2. It missed that R4 reintroduced FM-09's exact defect class.** FM-09 *is* "a new `advanced` field shipped without type validation." R4 then added `advanced.surplusPolicy`, a new `advanced` string field, with **zero occurrences** in `scenario-validator.js` in the audited package. The re-audit passed FM-09 with the hedge *"not a general validation certification for every field"* rather than noticing the sibling repair under review had done it again.

**3. It applies two evidentiary standards without saying which is which.** FM-04, FM-08 and Q15 got genuine independent probes. **FM-01, FM-05, FM-06 and FM-07 pass on "supplied … tests pass" — our own tests.** That matters because the re-audit's own central demonstration, RA-04, is *proof that a supplied test can pass while the property it names is false*. Worst placed is FM-05, which §4.10's handover explicitly nominated as the thing to attack hardest, and where what had been wrong was a *premise* rather than an assertion. (Checked here and it does hold: `debts` is deep-cloned per `simulatePlan`, so `_armScheduledPayment` cannot leak across Monte Carlo runs. Correct — just under-evidenced.)

**One internal contradiction.** RA-02 requires both that "existing versus newly created zero-balance destinations must agree" and that the fix "does not accidentally alter unrelated draws." Under Monte Carlo an existing empty account consumes a `normal(random)` draw; a new one either consumes one (shifting the stream) or does not (differing from the existing one). The two are jointly unsatisfiable and the report asserts both. Resolved here as Q19, with no guidance from the report.

**One severity call worth pushing back on.** RA-03 is P2 because it "does not create net wealth" — but it reclassifies cash principal as taxable dividend income and moves lifetime taxes, and P1 is defined as *financial correctness*. RA-02, rated P1, affects only scenarios that synthesize a destination mid-period.

#### The Q22 repair

**User decision, 2026-09-11:** *"spend the cash first but changeable by preset."* `advanced.retainedCashOrder` is `first` (default) or `last`. Only the exact string `last` selects the buffer behaviour, so a malformed import gets the safe default — and the validator still *reports* the near-miss, because a user who typed `LAST` believes a setting is in force that is not.

**One comparator, three callers.** `orderedAccountsInClass()` (what `quoteTaxFunding` **quotes** against), `nextWithdrawAccount()`, and `withdrawFromClass()` (what actually **sells**) each held a hand-kept copy of the same sort, with a comment claiming the quote order was "guaranteed identical" to the withdrawal order. Applying a new ordering rule to two of three would have made the quote price a different sale than the one executed — the **R2-001** defect class this codebase has already been bitten by. Six tests pin that the three agree across both presets and both `withdrawalOrder` modes; they passed before the change, so they are regression guards rather than demonstrations.

#### A prediction that was half wrong, and what it taught

Predicted: ending balances up, realised gains down, **lifetime taxes down**. Balance rose as predicted (+$398,895.90 on `golden:rmd-and-roth-conversion`) — but lifetime taxes **rose $2,562.34**.

Explained rather than absorbed. The 1.5% imputed-dividend base is computed on **non-cash** taxable balances; cash is excluded by FM-03/RA-03. Spending cash first moves ~$399k out of a non-income-bearing category into an income-bearing one, and the preserved asset then throws off taxable income for 33 more years. The prediction reasoned only about realised gains at the moment of sale — a first-order effect — and the second-order effect swamped it.

**This belongs in the UI copy for the preset:** spending cash first leaves the household substantially better off, but it is *not* a tax reduction.

**Attribution is exact.** `retainedCashOrder: 'last'` reproduces the locked fixture to the cent (161,791.05 / 7,145,747.26 / 1,941,746.60), so the movement is the intended default and nothing else. The golden fixture was regenerated for that one scenario, 14 lines, by a script that **asserts** the other four are byte-identical rather than trusting it.

**Corpus:** 1 of 25 scenarios moves, and a sweep confirms exactly that one is sensitive to the ordering. The two conditions are near-mutually-exclusive here — outside surplus is what creates the holding, and a household with surplus income mostly does not need to sell. The exception is the Roth-conversion scenario, where conversions force tax bills despite surplus income. More evidence for **Q21**: this corpus barely reaches the new entity's code paths at all.

#### The S3 prewrites, converted — and two more RA-04 findings

The four `tests/s3-prewrite/` files were characterization tests by design: they asserted what the codebase does TODAY so the S3 brief's factual claims had a witness. All 25 passed, which made them a good witness and a useless signal for when the work is done. They now assert the state S3 must **reach** — 29 tests, 21 pass, 8 fail, every failure tied to a recorded finding.

**Not everything was flipped, and the exceptions carry the reasoning.** Controls stay green (a control that fails proves nothing about the thing under test). Pins stay green — `canonicalize`/`diffCaptures` must never be *created*, and a factory-less worker assembly must keep throwing, or someone "simplifies" the helper straight back into the defect. `duplicate-account-id` is mostly **not** flipped, because S3 task 5 is a *behaviour-preserving refactor*: there is no desired-but-absent behaviour to demand, and flipping those would mean asserting something false and then "fixing" it. And the `EXCLUDED` contract is not flipped to `runPlan`/zero-exclusion, because RA-04's acceptance says to choose that explicitly rather than silently relabel the current one — asserting it here would *be* the relabelling.

One genuine absence did get a red test: `scenario-validator.js` has **no account-id uniqueness rule at all**, so two accounts sharing an id validate with zero issues. Harmless only because `rates` is positional — the moment task 5 keys anything by id, a duplicate silently averages the return signal over one rate instead of two.

**The conversion surfaced two more RA-04-family findings, both now fixed:**

- **`-0` was indistinguishable from `0`.** `canonical()` tagged non-finite numbers but left `-0` alone, and `JSON.stringify(-0)` is `"0"`. Worse, `differences()` already contained `if (!Object.is(a, b))` — there for exactly this case — and the `if (a === b) return out;` fast path above it made that line **unreachable**, because `0 === -0`. A check that cannot run is worse than no check: it reads as coverage.
- **`meta.capturedAt` was a wall clock**, so two captures at the same source state differed as *files* while `verify` reported DETERMINISTIC — that command compares corpus hashes, which do not cover `meta`, so the harness could not see its own non-reproducibility. Replaced by `meta.sourceHashes`: a content hash per source file, hashed as raw **bytes**, which answers "which engine produced this capture?" and would have caught this session's CRLF incident.

**The gate learned about deliberate exemptions.** Its registration check exists to catch a file that runs nowhere *by accident*; a file unregistered *on purpose* is a different thing, and previously the only way to make the gate pass was to register deliberately-red tests into `npm test`. Exempt prefixes are now printed on every run — an exemption nobody sees is indistinguishable from a test nobody runs — and are excluded from the gate's own execution, because a release gate qualifies what ships and a prewrite's designed failures would keep it permanently red. Verified in both directions: an accidental orphan still fails it.

**1006 tests, 1004 pass, 0 fail, 2 todo. GATE PASSED.** Corpus IDENTICAL, predicted on the strength of a measurement taken first — zero negative zeros anywhere in the corpus output, so tagging `-0` could not move an existing hash.

---

### 4.13 S3 planning — the brief reworked against this re-audit, and the corpus blindness quantified

**All seven of §5's required S3 brief updates are applied** (`9beb24f`). Three were structural rather than editorial:

- **The Q15 task is deleted.** The brief prescribed the fix recorded in `SPRINT_QUESTIONS.md`, which the auditor executed and disproved — serializing `DebtAmortization.monthlyPayment.toString()` loses the closure over the private `monthlyRate` helper. R6's `__debtModulesFactory` already solves it. An unattended run following the old brief would have undone a correct repair to manufacture a first-failing state.
- **Task 2 migrates the existing harness rather than building one**, with the migration decision stated explicitly (repair and extend in place, to a versioned format; refuse cross-version diffs) rather than silently relabelling the current `runScenario`/two-exclusion format as the `runPlan`/zero-exclusion contract.
- **Gating is per-task, not sprint-wide.** RR2's gate names the *refactor*. Task 5 waits on RR2-5 plus an accepted financial baseline; task 1 has no collision with RR2 and does not wait.

**Q17 and Q21 are one finding, and it is larger than either was recorded as.** The seeded generator leaves most of the scenario schema at its default in every scenario. **The count is not quoted here on purpose — it has moved four times in two days and will move again.** `tests/s3-prewrite/generator-blindness.prewrite.test.js` reports it live; run that rather than trusting a figure in a document. For scale at the time of writing: **60 of 99 scalars blind, 17 of 24 boolean toggles never flipping** — after S3-4's repair, which moved 12 fields and left the shape intact. The mechanism is an allowlist — `generateScenario()` deep-clones `defaultPlan` and overwrites an explicit hand-written list — so anything off that list is the default in every scenario. Notably:

**Two of the blind flags should stop a reviewer**, and they matter more than any count:

| Field | State | Why it matters |
|---|---|---|
| `advanced.armRecastOnReset` | **`false` in every generated scenario** | This is the S2 feature behind **Q15, FM-05 and FM-06**. Three findings were raised, repaired and re-audited **on a flag the corpus cannot turn on.** |
| `retirement.incomeOffset` | **`true` in every generated scenario** | **Q18 is precisely about `incomeOffset:false`.** An open finding sits on a branch no generated scenario reaches. |
| `advanced.networthOn` | **`false` in every generated scenario** | Makes the planned L4b net-worth identity pass vacuously over the generated corpus. |

Genuinely repaired by S3-4: `spouseSS` (49 distinct values), `surplusPolicy` (3), `dividendOn` (2), `retainedCashOrder` (2).

This is why RR2-3 and RR2-4 both correctly predicted the whole corpus would be IDENTICAL after repairing a P1 and a P2: **neither defect was reachable by any generated scenario.** Repairing it is S3 task 1, and it runs first — capturing a refactor baseline over a corpus with this blindness is how FM-01 already read as IDENTICAL.

**A field landed blind while this was being written, and nothing caught it.** `advanced.retainedCashOrder` (the Q22 fix, `"first"`|`"last"`) was added to `defaultPlan` and not added to the generator's allowlist. It is live, not inert — `retainedCashFirst()` reads it and `scenario-validator.js` validates it — so a policy decision that had just been made had a corpus that could not test either branch of it. `tests/s3-prewrite/known-scalars.json` now rosters all 99 scalars and a guard fails when the set moves without the roster being updated (`df23535`). The guard was proven to fire, not assumed to.

**Four prewrites are committed and are first-failing** (`tests/s3-prewrite/`, 30 tests: 22 pass, 8 red by design). They began as characterization — recording what the code does today so the brief's claims had a witness rather than an assertion — and were converted, because a green prewrite cannot report when the work is done. Each goes green precisely when the defect it names is repaired. They are already tracking: `6b8629c` turned two green, and by `e6e2c58` **all thirty were green.**

**And green did not mean fixed.** The prewrites assert the fields a *recorded finding* names — `spouseSS`, `salary`, `dividendOn`, `surplusPolicy` — and every one of those now varies. The class does not: 60 of 99 scalars remained blind at `3eea516`, which recorded the correction rather than letting a green suite imply a property it never claimed. **A deliberately narrow assertion still reads as a completion signal when it turns green.** That is the same failure this round has been documenting, arriving from the other side, and it is the reason the two flags above are named explicitly instead of left inside a count.

*(**Correction, S4 task 2b.2f, 2026-09-12.** At `16cf460` these four files ran **29 pass, 1 fail** — neither "22 pass, 8 red" nor "all thirty green". The one red was the `CAPTURE_FORMAT === 2` pin, stale since format 3. They were exempt from the release gate the whole time, so they ran nowhere. Two of them, −0 through `canonical()` and through `differences()`, were **the only guard** for the repair described above. Those two now live in `tests/capture-baseline.test.js`. The other 28 were superseded by registered tests or lost their subject, and are archived to `archive/s3-prewrites/` with a reason each (`archive/README.md`). The gate's exemption is retired. The references above to `tests/s3-prewrite/` and `known-scalars.json` now resolve under `archive/s3-prewrites/`.)*

**The brief was hardened over six adversarial rounds, 42 defects.** Rounds 1–3 found errors in what it said, what it assumed was reachable, and what the rework itself introduced. **Rounds 4–6 found errors in how its facts were being established** — a scan reading `{seed, plan}` wrappers rather than plans, which could report nothing but "blind"; an API named from memory whose two functions do not exist; a probe reporting a field as unread by the engine minutes after the engine's own line was quoted. The brief's ground rule 24 — *a probe answering a factual question gets a control before its answer is used* — is written from those three, and is the reason the prewrites carry more weight than any single textual fix.

R2-T08 remains gated. ~~`FEATURES.md` does not fire: S3 has not run and no module is complete.~~ **S3 has since run — §4.14.**

---

### 4.14 S3 executed — seven tasks landed, the refactor did not, and the corpus was thinner than recorded

**Tests 1015 → 1093** (1088 pass, 0 fail, 5 todo). Commits `a7b3c6d`…`e78cb63`. **`src/engine.js` is byte-identical across the entire sprint**, along with `src/app-shell.html`, the golden fixture and the shipped artifact — so nothing here can have moved financial output, and that is checkable in one diff rather than reasoned about.

**Task 5, the one behaviour-preserving refactor, did not run.** Its gate requires RR2 closed **and** an accepted financial baseline. RR2 is closed; the baseline is not — `REAUDIT_PACKAGE_2_20260910.zip` is the outgoing submission this package answers, not a verdict. The gate was checked on arrival after every other task, per the brief, and the sprint stopped there deliberately. **Its baseline is captured, committed and re-verified as reproducing byte-identical at HEAD**, so the refactor can start the day a verdict lands.

**A bookkeeping correction first, because it shaped the rest.** The continuation note recorded task 2 as done. It was not: the prior session exported `corpus()` — one of ten criteria — and left the task's headline work undone, with its own prewrite saying so in a test name (*"PIN (pending a decision): the contract is still runScenario with two exclusions"*). Three later tasks consume that corpus, so completing it came first, and most of this sprint's findings came out of it.

**The baseline harness now captures `runPlan()` with zero exclusions.** RR2-1 was required to decide that contract and did not — it repaired RA-04 and said nothing about the entry point. Measured, not argued: 33/33 corpus scenarios byte-identical across two calls, with the control that the same measurement reports `runScenario()` non-deterministic in exactly one field. **That field is `runId`, not `scenarioId`** — `scenarioId` derives from the plan id and never varied, so format 1 had been excluding a field that did not need excluding. Cross-format diffs now throw rather than reporting the whole 13-field `identity` block as removed on every scenario.

**Three corpus gaps, each measured absent before being filled** — and the middle one is the one a reviewer should weigh:

| gap | what the measurement said |
|---|---|
| sequence-risk start years | 13 historical scenarios spanning 1928–2020, **none of 1929, 1966 or 2000** |
| flag-on ARM | 7 scenarios set `armRecastOnReset`, 4 carried an adjustable-rate debt, **zero did both** |
| reserved-id collisions | 8 distinct account ids, **neither `rmd-retained-cash` nor `household-cash` present** |

**The ARM row compounds §4.13's finding rather than repeating it.** §4.13 reported that three findings — Q15, FM-05, FM-06 — were raised, repaired and re-audited on a flag the corpus cannot turn on. It is worse than that: the flag and the debt type are varied *independently*, so even after `armRecastOnReset` starts flipping, the branch behind it is only reached when an adjustable debt coincides. It never did. **And the capture harness could not have run one anyway** — `loadEngine()` required `src/engine.js` alone, so the six debt namespaces were absent and the first scenario written to cross that branch crashed with `ReferenceError: DebtAmortization is not defined`.

That is the re-audit's own `buildLiveWorkerSource()` finding, in the instrument that certifies the refactor. **Recorded as Q30 and repaired** — from `build.js`'s own registry, so a seventh module is picked up automatically.

**Worker/main-thread output parity is now asserted** (`tests/worker-parity.test.js`), over the whole corpus, in all three modes, against the **real built** Worker source. Exactly one leaf is excluded — `identity.runId`, not the `identity` subtree, so the other 12 deterministic fields stay under comparison. The detection proof is permanent and runs against a *fixture* engine in two halves: an unregistered helper throws, and a **drifted** helper does not throw at all — it returns a wrong number on the Worker path only. A `ReferenceError` check cannot see the second class.

**A test passed through the migration while asserting nothing**, and it is worth naming because it is the third instance of one shape this round. `capture-baseline: the excluded fields really are stripped` looped with `if (!entry.result.identity) continue`. Format 2 has no `identity`, so it skipped every iteration and stayed green — found by reading, not by running. RA-04's own test reached only the last helper in a pipeline; §4.13's prewrites asserted named fields rather than the class. **All three report something while measuring less than their name claims.**

**The SA-01 class is alive, in a place the brief did not predict.** Every *required*-field omission is caught — 1,011 sites, 13 kinds, all rejected — with two controls that make that mean something (60/60 complete records validate; every rejection names the omitted field). So the live probe came from **optional** fields, which pass validation by construction: **506 omissions, 427 inert, 0 loud, 70 silent-and-material** across five sites.

The sharpest is `retirement.otherIncomes[].owner`. `otherIncomeFor()` computes `var spouse = i.owner === "spouse" && p.profile.spouseOn`, so an **absent** owner makes that false and a spouse-owned income is timed against *self's* age. Seed 100006: **lifetime taxes $398,269.81 → $568,735.44**, 61 leaves moved, no validation error, no `calculationError`. SA-01's mechanism exactly — an absent field makes a conditional false and the code proceeds as if answered. **Q32, recorded not repaired**; the fork (require / default at normalization / warn) is open, and `owner` is the one where no default is defensible.

**Two new modules, both reachable, neither wired.** `src/debt-revolving.js` answers a correctness gap — an $8,000 card at 22% with a 2% minimum **does not retire inside a 600-month cap**, having charged $55,653, while the amortizing model the engine currently applies claims 137 months and $13,912. `src/mortgage-vs-investing.js` (F3) is a 5×4 method-by-objective matrix whose first test is that two objectives pick **opposite winners** on identical inputs.

**Registering the seventh module proved the namespace list still has two definitions.** `build.js` generates the main-thread list from `DEBT_MODULES` and the repaired harness reads the same registry; **`buildWorkerSource()` hand-maintains a six-name array**. Measured in the real built Worker with a control: `typeof DebtRecast` → `"object"`, `typeof __debtModules.DebtRevolving` → `"object"`, `typeof DebtRevolving` → `"undefined"`. The code ships; only the binding is missing. Harmless while unwired, a `ReferenceError` the day it is wired — **Q15 one module later, recorded as Q33.** Not repairable in S3: `src/app-shell.html` is held byte-identical. The difference from Q15 is that the parity test now exists to catch it.

**L4b closes within a row — worst absolute error 0 across 1,016 rows**, both `networthOn` states, with a first-failing probe (debt added rather than subtracted) proving the sweep detects a wrong identity, and the seed row's missing insurance term asserted rather than smoothed. **Three gaps recorded as Q35**, and the first is a coverage claim a reviewer should discount: every corpus `otherAssets` record has **growth 0** and `nonPortfolioDraw` is > 0 on **zero of 1,016 rows**, so `drawFromOtherAssets()` has no corpus coverage at all and the across-row asset identity would have passed vacuously. The across-row **debt** identity cannot be closed at all — `debtPayments` is retirement-period-only, unexplained fraction reaching 1.0 — so the residual is stated and bounded rather than absorbed into a tolerance.

**Track A's schema catalogue was reached** (the brief expected it would not be). Derived from the live `defaultPlan` and live `runPlan()` output per mode, with a drift test whose control covers additions, removals *and* type changes. Its migration test runs the **real** `normalizedPlan()`, sliced out of the shell rather than reimplemented.

That produced the sprint's most useful refinement, and it qualifies something §4.13 and Q25 both state correctly. **`advanced.home` and `advanced.debt` are inert to the engine and live to the loader.** Zero occurrences in `engine.js` and `scenario-validator.js` — so declining to unblind them was right — but `normalizedPlan()` reads both and migrates them into records that *do* move output. **The corpus calls `runPlan()` directly and bypasses the loader entirely**, so defaulting, per-record normalization and the v2.1.0 migration have no corpus coverage, and any field whose only consumer is the loader measures as inert to every instrument this project has. Q36, alongside `advanced` accepting any key at all — a typo in `networthOn` is accepted silently and the household's net worth quietly omits their house.

**One instruction in the sprint brief is impossible, and it is a hazard rather than a typo.** `tools/verify-phase2-extraction.js` takes a required argument the brief omits, and run correctly reports **FAIL — 16 mismatches of 48**, including `growAccounts`, `simulatePlan`, `runPlan` and `quantile`. Those are precisely the functions R1–R7, RR2 and Q22 repaired: the tool re-derives what the engine *should* contain from the pre-Phase-2 ancestor `f06ac7c`, so every legitimate repair since is a mismatch to it. An unattended run told to "confirm it passes" has two bad options — declare the sprint failed, or edit the engine to match a pre-repair ancestor. **Q31.**

**`SPRINT_QUESTIONS.md` runs Q1–Q36**; S3 appended **Q28–Q36**. Nine entries, of which Q30, Q32, Q33 and Q36 are the ones worth a reviewer's time.

**Un-audited, and stacked on everything §4.11 and §4.12 already list:** all seven S3 tasks. Low risk by construction — no engine, validator or shell file was touched — but two new modules and roughly 80 new tests have had no external eyes.

### 4.15 S4 executed — the measuring apparatus verified and extended; no financial output moved

**2026-09-12 22:12 to 2026-09-13 04:28 MST, one unattended session, from `7ee78b9` to `488737f`.** S4 builds and verifies instruments. It made no engine change that moves a supported result. **Measured at the end:** a `capture --measured` of the control corpus at `488737f`, in a clean checkout, is **IDENTICAL** to the control S4 started from (output `91c2eb99…`, inputs `673495ef…`, boundary qualified). Gate: **1,654 tests / 1,631 pass / 0 fail / 23 todo, 147 files**.

- **Inherited instruments, observed firing (2b).**
  - `build.js`'s P5-01 backstop, plus a new witness that the build still *invokes* it.
  - The invisible-character gate.
  - `tools/verify-test-gate.js`, which now fails closed against a committed exception registry: 16 mutations.
  - Worker parity.
  - **BC-01 closed** in the result checker, contract version 2.
  - Q53's boolean-flag contract, written, with its four refusal witnesses owned by S5 2l.
- **Baseline trust (3, 4).**
  - An independent corpus invariant.
  - The control corpus pinned before any corpus change.
  - Additions arrive as a separate expanded composition. That composition gives `drawFromOtherAssets()` coverage, adds a Monte Carlo member that can fail, and carries Q54's debt sets, split and versioned.
- **Provenance (5).**
  - Every stored capture's provenance was classified by replay. Nine are historical or unqualified, including one that names the wrong commit.
  - `capture --measured` refuses any capture whose inputs are not the committed bytes.
  - Q40 is labelled exactly: Monte Carlo carries no debt breakdown.
- **Household ledger (6).** Defined before it was checked. Green across both corpora and red on injected unfunded movements. It found **Q59: the engine has no household budget before retirement** (`MODEL_ASSUMPTIONS.md` §7).
- **Differential harness (7).** Old-vs-old is empty on three routes: the Node module graph, a fresh build's main thread in jsdom, and its Worker source. 20 injected differences were detected. It is **not** a real-browser Worker run, by decision (`DIFFERENTIAL_CUTOVER.md`).
- **Requirements register (8).** 71 audit-fix IDs, **UNGUARDED 0**. A closeout check refuses to close a carried finding without an owner, a downstream task and a deadline.
- **Test classification (9).** 148 files: 18 implementation-independent, 97 implementation-coupled, 33 infrastructure. **18 to 57 behaviours are guarded only by coupled tests, and none has an assigned plan yet.**
- **Device benchmark (10).** The page and its protocol are built (`DEVICE_BENCHMARK.md`). **No device has been measured, so every §6 figure is still unmeasured.**

**Open, and recorded rather than softened.**
- Task 9's gate is partly met, and Task 10's is not met.
- The 9.4 list and the register's open items have no owners or deadlines, and the closeout check refuses them.
- The owner's decisions on Q53's absent flags, Q40's Monte Carlo semantics and Q59 are pending.
- C2, C3 and C6 have no checklist home.

The sprint's exit gate records which lines are true (`S4_TASK_CHECKLIST.md`).

**Un-audited:** all of S4. The plan audit suggests that its external close-out be a bounded instrument review rather than another whole-model audit. That choice is put to the owner, not assumed.

---

## 5. Forward queue

### 5.0 The simulation core is being rebuilt — added 2026-09-10, and it reorganises everything below

**The decision.** The simulation core is being replaced by a **new build, not a port**: phase-split, row-synchronous, columnar, float64, in JavaScript, written to a WASM-compatible subset so a later Rust port is a translation rather than a rewrite. The current engine is **not deleted** — it becomes the permanent differential oracle, and the rebuild's acceptance gate is an empty diff against it across the full corpus in all three modes.

**Measured, not estimated.** Taken 2026-09-10 against the real engine and the real aggregation algorithm:

| Measurement | Result |
|---|---|
| Current simulation core | 556.9 µs/path @1,000 paths = **7,735 ns/row** |
| No-allocation typed-array kernel, ~400 flops/row | **136 ns/row** |
| Implied CPU headroom | **~14×**, single-threaded, no GPU |
| Aggregation: columnar vs array-of-objects | 2.8–3.2× |
| **Aggregation: quickselect vs full sort** | **26–42×, bit-identical** |
| f32 vs f64 aggregation speed | ~0% — f32 buys memory only |

Two findings drove the decision. `aggregateMonteCarloRuns()` fully sorts N values per key per projection year to extract **one** median; selection is O(N) and is 42× faster at 10,000 paths with a bit-identical result. And the simulation core spends roughly **95% of its time on object churn rather than arithmetic** — 53 `.find()`/`.map()`/`.filter()`/`clone()` call sites, most inside the row loop.

**Estimated end state**, full feature set, 10,000 paths, iPhone 15 Pro: today ~34 s → **rebuilt ~0.8 s**.

**GPU is not being built, and the reason is recorded so the decision can be re-examined.** The quickselect finding removed the cheap, safe GPU target. What remains is a full WGSL port of `simulatePlan`, which would mean two engines at different precision (WGSL has no f64), two shader variants (Adreno 64-wide, Mali 16-wide), a mandatory CPU fallback since Android WebGPU coverage is ~70–78%, and roughly 150 ms of gain over an optimised CPU path. **Revisit trigger:** any feature needing more than ~50–100× a single run's work — a heatmap grid, a glidepath sweep. The chosen architecture keeps that door open at zero incremental cost.

**Sprint sequence.** Each has a committed checklist.

**Re-sequenced 2026-09-11.** S4 and S5 exchanged themes; two of S6's read-only registers and its differential harness moved to S4. **Split again 2026-09-12:** S5 reached 18 tasks and was cut after task 13, where the tax block ends — its tasks 14/15/15b/16/17 became **S5b** tasks 1/2/2b/3/4. Named with a suffix rather than renumbering S6 onward, because S100/S101/S103 and both artifacts name S6 tasks by number and those were swept clean in this same re-sequence. The reasoning is below the table. The complete old-ID → new-ID move table is `S4_TASK_CHECKLIST.md` §R2 and is the single definition of it.

| Sprint | Theme |
|---|---|
| **S4** | **Build the instrument** — corpus invariant, differential harness, household ledger, requirements register, test classification, device benchmark, repo normalisation. Makes every later measurement **believable** |
| **S5** | **Correct the reference engine** — 2026 rules conformance against the three specifications, plus the live debt and scope defects (Q43/Q44/Q45). Makes the oracle **correct**. 13 tasks |
| **S5AA** | **Repair the closed S5 engine after the external audit** — findings F1–F10 and G1–G19 (three external passes, the third hand-traced) and H-01–H-06 (a local hunt, reproduced by script). A **draft, not started**, added 2026-09-19 (UTC−7); the owner's answer of 2026-09-17 puts it before S5b. Plan text is in `Handover temp/`, untracked |
| **S5b** | **Close the reference engine’s books** — the two market-data corrections, the `TAX §10.2` / `ACCOUNT §19` disclosure contract, the register re-harvest, and the **definitive reference baseline**. Split from S5 on 2026-09-12 at the user’s decision; the seam is where the tax block ends. 5 tasks |
| **S6** | **Design the rebuild** — phase decomposition, field and entity registries, retained field set, data and rules versioning, decision register |
| **rebuild** | Strangler-fig, `simple` → `historical` → `monteCarlo`, empty-diff gate per mode |
| **S100** | Spend the differential gate — deferred output-moving changes, real-device validation, WASM go/no-go, external audit of the new engine |

**Added 2026-09-19 (UTC−7) at `3ec8adf`. This table predates S5's closure and S5AA; nothing above is rewritten.** S5 closed on 2026-09-16 at `420a910` on the owner's yes, within its recorded scope: not an external sign-off, and its provisional decisions stay unsettled (the closure record is in `S5_TASK_CHECKLIST.md`). S5b is not started, by the owner's instruction of 2026-09-16. S5AA is drafted and runs first. **The S6 to S100 rows are unchanged.** An external scope draft attributes 28 decisions to the owner that would change this sequence's rebuild assumptions (float32, the permanent oracle, single cutover, a flexible hundred-level backlog); they are **reported, not confirmed**, and are not applied here.

**Added 2026-09-19 (UTC−7) at `fb15827`, later the same day.** S5AA's own questions have since been answered by the owner in chat and recorded in the untracked draft in `Handover temp/`: 30 answers, none left open, on top of five from 2026-09-17. **No S5AA task has started, and the go is the owner's own to give.** The answers are not in a committed checklist; the plan owner commits `S5AA_TASK_CHECKLIST.md` after the go. The draft is now 19 sections, because a second revision of the two external documents (S6 prerequisite review revision 4, scope draft revision 12) was folded in as marked additions; the close-out list is still 53 tasks. **One answer routes work here:** 12.9 was answered so that no dividend output changes, and the dividends-on path's untaxed pre-retirement dividends are carried to `S5b_TASK_CHECKLIST.md` task 1 (a note was added there). The 28 decisions attributed to the owner by the external scope draft remain **reported, not confirmed**. Three S5AA answers touch related points, and only inside S5AA's own scope: which sprint owns each X row, the procedure for the reference's supported domain, and the three failure policies.

**Added 2026-09-19 (UTC−7) at `9bc166d`, later still.** `S5AA_TASK_CHECKLIST.md` is now committed as the plan of record (`53aa5f9`, local, not pushed), built from the three untracked drafts in `Handover temp/`: nine tasks (0–8), ground rules, stopping points, an 18-line exit gate and an 11-item close-out, with every answered decision recorded under its draft ID. Three decisions are still open and named in it (where the new fixtures live, whether `closeout-check` learns about S5AA, and who stops the hunt campaign). **S5AA has not started and the go is the owner's own.** The drafts remain the record of the reasoning, and where they differ the checklist wins. The plan owner spot-verified the commit, not line by line, and accepts the file; a plan-owner-committed version would win over it. Not verified, and the checklist says so: nothing in F, G or the X rows has been reproduced, the IRS and SSA citations are unchecked, and the 28 external scope decisions stay reported, not confirmed. The S5AA row in the table above still reads "draft"; nothing above is rewritten.

**Added 2026-09-19 (UTC−7) at `363287a`, later still.** Eight dated amendments (A-01 to A-08) are appended to `S5AA_TASK_CHECKLIST.md` (`363287a`, local), from an external review of the plan of record; the owner kept the reproduction barrier and applied the rest, and the checklist's own wording was corrected in three places that were mine (the prediction record's task list, the stale authority line, and the dividends-on label in 5.6). The plan owner read the amendments in full and found no conflict with the S5b or S6 text; they did not check them against the review, and their acceptance covers `53aa5f9`, not the amendments. **`53aa5f9` and `22f2872` are on origin** (a push at 21:35, not by the S5AA session), so "local, not pushed" in the paragraph above is out of date; `363287a` was the one local commit. **The A-07 line that assigns the dividends-on gap to S5b task 1 is a pending note:** S5b holds only a blockquote there and the owner's S5b hold stands, so a correction is appended to the checklist. The dividend probe is preserved in `Handover temp/S5AA_DIVIDEND_PROBE_20260919/` (untracked; one synthetic scenario, no independent expected value). **S5AA has not started; the go is the owner's own.** Nothing above is rewritten.

**Added 2026-09-19 (UTC−7) at `471d52d`, later still.** `363287a` and `471d52d` were pushed to origin at the owner's instruction; origin/sprint/r2-t03-t07-r4f1-20260909 reads `471d52d` and `git status -sb` shows no ahead or behind. **The two paragraphs above that call `363287a` and `471d52d` "local" are out of date on that point.** The commit that carries this paragraph is itself local until the owner says to push it. Nothing above is rewritten; S5AA has not started and the go is the owner's own.

**Added 2026-09-24 (UTC−7) at `da446bf`, much later, by the plan owner (bd9f75).** The S5AA rounds have since run on GitHub (`main` is the reviewed line; ChatGPT files its own report pull requests): **the paragraphs above that say S5AA "has not started", or call its commits "local", are out of date** and are kept as history. S5AA is **NO-GO** (the owner, 2026-09-21) and not closed; S5b has not started. **R22:** ChatGPT's full re-audit of `0a38065` recommended NO-GO with three findings; R22-02 and R22-03 were errors in the plan owner's documents and are corrected (PR #17, merged `da446bf`). **R23** repaired R22-01 (the Roth flag now follows an actual Roth draw by the owner's age, `9d58372`; r15 is the new baseline, 70 members; the S5AA session reports no figure differs from r14, which I did not re-check): merged as `132235d`, audited source tag `s5aa-r23.1-source` = `3bc8946`, awaiting ChatGPT's change audit. The decisions are registered as `SPRINT_QUESTIONS.md` Q115 to Q135.

**Added 2026-09-25 (UTC−7) at `01449e0`, by the plan owner.** ChatGPT's R23 change audit (PR #20, `1d31edc`) found R23-01 (a transfer scheduled at 59 1/2 judged at the year's opening age; the 10% on a pre-tax transfer to taxable had the same slip). **R24** repairs both at `0acc073` (merged `698a88d`; r16 baseline at `d67b618`, tag `s5aa-r24-source`); the pooled-draw convention at 59 1/2 is kept and disclosed (Q137). **ChatGPT's R24 change audit (PR #22, `01449e0`) found no new findings** and requalified R23-01, so **the sentence above that says R23 is "awaiting ChatGPT's change audit" is out of date.** Audited tags `s5aa-r22-audited`, `s5aa-r23-audited` and `s5aa-r24-audited` are pushed. The S5AA session reports that the owner has asked for a GO-readiness check next; S5AA stays **NO-GO** meanwhile. Registered as Q136 and Q137.

**Added 2026-09-26 (UTC−7) at `ea8f155`, by the plan owner.** ChatGPT's R24G2 (PR #30, `42ffe14`) determined GO under amendment A-09; its own deep audit R24F (PR #31, `43d9043`) then found four priority-2 findings and determined NO-GO. **Since the owner's rule of 2026-09-25 (`audit/S5AA/WORKING_RULES.md` §1 and §7, PR #29, as reported by the S5AA session), ChatGPT's latest determination sets the status, so S5AA is NO-GO, and the sentence above that says the next step is a GO-readiness check is out of date.** **R25** repairs all four at `95bf5d0`, `aeba9a0`, `9a40562` and `4b7d516` (merged as `ea8f155`, PR #32; audited source `s5aa-r25-source` = `4b7d516`), with no corpus movement reported (a capture identical to r16, which stays S5b's baseline); the owner is sending ChatGPT the R25 change audit. A validator-valid plan that fails with `TAX_SETTLEMENT_MISMATCH` from age 50, found in passing, goes to R26 (Q143). Registered as Q138 to Q143.

**Added 2026-09-26 (UTC−7) at `27a6758`, by the plan owner.** **R26** (`5a928d5`, `0b90445`; merged `6d958ce`, #34; tag `s5aa-r26-source` = `04f0426`) repaired the settlement mismatch, so **the sentence above that says it "goes to R26" is now done (Q143 implemented)**: it enforces the IRA compensation limit, gives the tax quote and the final tax one rule for an IRA deduction, and adds baseline **r17** (`04f0426`), which differs from r16 in exactly four members (`seed:2`, `seed:10`, `seed:14`, `seed:17`, checked). ChatGPT's R25 change audit (PR #33) was **NO-GO** with two findings in R25's own repairs (R25-01, a down-market mid-year transfer left its source negative; R25-02, PMI kept being charged after a mid-year payoff). **R27** (merged `fd491d6`, #35; tag `s5aa-r27-source` = `73e24c7`) repairs both (`5f48505`, `73e24c7`, `7318d89`) and records one narrow case as a known limit (Q148). No corpus figure moves in R27; r17 stands. Registered as Q144 to Q148. S5AA stays **NO-GO** (ChatGPT's latest determination); the owner is sending ChatGPT the R26 and R27 cover notes for change audits, as the S5AA session reports.

**Added 2026-09-30 (UTC−7) at `00dbb4b`, by the plan owner.** The S5AA rounds since R27 have run as pull requests in the public repository, which began on 2026-09-28 as a copy of the private `main` at `ee9757d`. **The paragraphs above that name R27 as the latest round, or call a round "out for" or "awaiting" ChatGPT's change audit, are out of date** and are kept as history. The round index is `audit/S5AA/README.md`; the owner's decisions are `SPRINT_QUESTIONS.md` Q149 to Q172; the modelling text is `MODEL_ASSUMPTIONS.md` §§18 to 26. **R28 and R28.1** (sources `56c8847` and `62e263d`, before the move) repaired ChatGPT's R26-01, R27-01, R27F-01 and R27F-02 and closed Q148's known limit. **No change audit of R28 or R28.1 was ever returned**; ChatGPT's later full-model PCF audit of the same engine found PCF-03, a gap in R28's dividend repair, which R29 repaired. **R29, R30, R31 and R32** (PRs #4, #7, #11 and #15) repaired the public copy's migration findings and then the transfer rules, step by step: ChatGPT's change audits kept **NO-GO** at R29 (R29-01, R29-02), R30 (R30-01; its R30A account and transfer audit added R30A-01 to R30A-03) and R31 (R31-01), and its R32 change audit **accepted the repair with carried limits and no new findings**. **R32F** (PR #17) is Claude's own full-model audit of the R32 source (55 findings, SA32F-01 to -55); ChatGPT's review of it, **R32V** (PR #18), was **NO-GO for full-model reliance** (37 findings confirmed, 17 qualified, one refuted as a new finding), and the owner decided eight questions on it (Q158 to Q165). **R33 to R37** (PRs #19 to #23) built those decisions and the rest of the R32F and R32V register: tax and contribution law, Social Security, cash flows and life events, and later-year tax indexing. ChatGPT's combined change audit of the five (PR #25) found no new blocker in R33, R34, R36 or R37 and one priority-1 finding, **R35-01** (an unvested employer match escaped forfeiture in the year of separation), so **NO-GO for an unqualified acceptance**. **R38** (PR #26) repaired R35-01, vested employer money in full at 65, and made a new plan file single; ChatGPT's R38 audit (PR #27) kept **NO-GO for unqualified full-model acceptance**, with R38-01 to R38-05. **R39** (PR #29) repaired those five and declared the QCD's opening-age convention; ChatGPT's R39 audit (PR #30) found **R39-01** (priority 2), a regression that R39's claim-date pricing caused in a survivor's benefit. **R39.1** (PR #32, source `s5aa-r39.1-source` = `a2ee714`) repaired it, and ChatGPT's R39.1 change audit (PR #33) **requalified R39-01 with no new finding**, stating that it neither certifies the full model nor determines the exit gate.

**Where S5AA stands, 2026-09-30.** Every ChatGPT report since R29 that determines status has said **NO-GO**; the R32 and R39.1 change audits accepted their repairs and say they do not determine it. **S5AA is NO-GO and not closed**, under the rule that ChatGPT's latest determination sets the status (`audit/S5AA/WORKING_RULES.md` §1 and §7). **R40** (PR #35, merged 2026-09-30 at `54d6a9e`; source tag `s5aa-r40.1-source` = `978a6e4`) closed the exit-gate gaps the S5AA session found on the way to a status determination: a baseline from r18, the R29 to R37 issue codes in `RESULT_CONTRACT.md`, amendment A-10 in the S5AA checklist, the conservation grid and a combined unrepaired list. It repaired three limits the S5AA session had found (the long-term-care cost now grows at healthcare inflation, each person on Medicare pays the Part D base premium, an RMD reads the age reached in the year) and reverted a fourth, the tax on a partial row, after the owner's pre-merge audit found that it annualized one-time amounts; that stays a disclosed limit for the engine rebuild. **ChatGPT's audit of R40 and its status determination had not been merged when this was written, so the account above stops at R39.1 for ChatGPT's findings.** The owner also said on 2026-09-30 that the UI will be rebuilt, with the current one kept as a reference (`SPRINT_QUESTIONS.md` Q172). S5b has not started (the owner's hold stands). **The documentation of these rounds** was placed by the plan owner: R29's rode on #7, and R30, R31, R32F to R38, R39 and R39.1 are #9, #13, #28, #31 and #34, each reviewed by the S5AA session before the owner's push. **Two relays, R28 and R32, were found unplaced on 2026-09-30 and are placed in the same pull request as this paragraph** (Q170 and Q171), and so is R40's (Q172). **Not checked here:** the S5AA session's reports of corpus movement and of each round's own gate counts. The plan owner ran the full gate on the branch carrying this paragraph and those placements, with `main` at `54d6a9e` merged in: 3,146 tests, 0 failing, 9 todo, and the closeout check accepted 12, refused 0. Nothing above is rewritten.

### 5.0.1 Audit status, corrected 2026-09-11 — the register moved faster than this section did

**An earlier revision of §5.0, written the same day, said "both outstanding audits reported and neither closed" and named CL-01 and CL-02 as live P1 defects requiring a repair round before S4. That is no longer true and the correction belongs on the record.**

Verified against the working tree at `1d43a9f`, by reading the source rather than the handovers:

| Finding | State | Evidence |
|---|---|---|
| **CL-01** (P1) prototype-sensitive duplicate-ID check | **Repaired** | `accountContractCode()` now uses `new Set()`. Its comment records the precise mechanism — `__proto__` is an inherited *accessor*, so assignment ran a setter instead of creating an own property, while `constructor` and `toString` are inherited *data* properties that assignment shadows normally. Testing a couple of dangerous-looking names would have missed it. |
| **CL-02** (P1) reserved RMD eroded by market losses | **Repaired** | The engine now reports the loss-eroded distribution explicitly instead of presenting an ordinary successful result. |
| **CL-03** capture loses raw distinctions | **Repaired** | `Object.create(null)` in `tools/capture-baseline.js`. |
| **EXT-02** (P1) name collisions hide changed results | **Repaired** | `new Map()` name indexes. |
| **ST2-05** annuity cancellation → $90,000 payment | **Repaired** | `src/debt-amortization.js` now computes `(p * r) / -Math.expm1(-n * Math.log1p(r))` — the numerically stable denominator. |
| **RP-01…RP-04** | **All four closed** | RP-01/RP-04 at `7656241`; RP-02/RP-03 at `55c272a` and `81d7f0f`. |
| **CR2-01, CR2-07** | Repaired | |
| **CR2-02…CR2-06** | Repaired in-tree, **reported open by the 12 September re-audit** | That re-audit read the reading package cut at `0a3d121`; the repairs land in `468e26a` and `db1874a`, which are **after** it. The finding is about package currency, not about the code. |

`1d43a9f` records the closure package re-cut with **all five rounds closed**.

**Two things follow, and they pull in opposite directions.** First, the blocking case for a repair round before S4 has largely dissolved — the two P1s that motivated it are fixed. Second, and less comfortably: **a re-audit reported five findings open against repairs that already existed**, because the package it was given predated them. That is a packaging-currency defect, and it costs an entire external round. Whatever process change prevents a stale cut being sent is worth more than any single repair in the table above.

**Caveat closed the same day, with execution.** The table above was first recorded from source reading alone, with the explicit warning that a repair in the tree is not a repair an auditor has accepted — which is precisely what bit the 12 September reviewer, who read *real* source that simply predated the fixes. The auditors' own unmodified suites have since been run against the current tree:

| Suite | Result |
|---|---|
| Revision-2 acceptance | **10 tests, 10 pass, 0 fail** |
| Closure acceptance | **12 tests, 12 pass, 0 fail** |
| Prior adversarial | **8 pass, 2 fail** — the two deliberately excluded, RC-03/RC-04 |
| Release gate | **1,250 tests, 1,242 pass, 0 fail, 8 todo** |

So the source reading was correct and now has execution behind it. **Five rounds and forty findings are closed.** Current package `61382c7`, SHA-256 `ad52ccb6f1d633d88063eae65be216a5492bc705195e78bb0c050450d2352dd8`, qualified from a clean extraction.

**Two things are deliberately *not* in that count, and must not be shown as closed.** **Q43** and **Q44** are now committed and disclosed but **OPEN and untriaged**. Q43 is a live-engine P1 candidate and explicitly not P19-excluded: a debt defaulting to `paymentMonthly: 0` forces its whole accumulated balance out at `payoffAge`, and against a large enough portfolio **the entire $150,558,533 is withdrawn with shortfall zero, `calculationErrorCode` null and `status: ok`** — the failure is completely silent. Against a smaller portfolio the same defect surfaces as an ordinary underfunded retirement. Neither presentation names what happened.

**Why rules conformance precedes the rebuild.** The gate is a differential diff. An oracle wrong on 2026 rules would certify wrong answers, and an oracle that builds only on one machine (Q27/Q39) cannot be reproduced. S4 and S5 fix each in turn. The rules work additionally *teaches* the tax phase's shape — splitting one MAGI into four parallel affine quantities is the hardest part of the phase decomposition, and S6 consumes that knowledge rather than rediscovering it.

**Why the instrument now precedes the rules work — re-sequenced 2026-09-11, and the reason is a dependency rather than a preference.** The previous S4's own precondition required capturing a pre-sprint baseline with `tools/capture-baseline.js`, because four of its tasks moved financial output by design. **That tool has now had seven defects found in it by an external auditor** (EXT-02, ST2-02, CL-03, CR2-04, CR2-05, FC-02, FCR-02), and the task that makes it trustworthy was scheduled *afterwards*. A sprint that moves financial output in four places was depending on a verification planned for the sprint after it.

Three further inversions were fixed at the same time, and each is the same shape — **an output scheduled after the last point at which it could be acted on**:

- The **differential harness** was the final task of the final preparatory sprint, so the instrument certifying the rebuild would have been built on the most-churned tree and proved only against a deliberately-injected fault. Built first, it is proved on a quiet tree, and then every output-moving commit in the corrections sprint exercises it for real against a diff predicted in writing beforehand. A harness that correctly predicts fifteen real changes has been tested against the failures nobody thought of; one proved by an injected fault has been tested against the one failure someone did.
- The **requirements register** and the **test classification** are read-only harvests whose outputs are *lists of work*: behaviours a rebuild could silently lose, and behaviours guarded only by implementation-coupled tests that need independent equivalents written before the rebuild starts. Both were scheduled last. They are now harvested in S4 and **re-harvested at S5b task 3**, which is the only arrangement that gives both room to act and completeness.
- The **device benchmark harness** has moved S6 → S5 → S4. It touches no engine code, and its critical measurement needs a real iPhone — the one deliverable in this plan whose date is set by someone other than us. It is now a parallel track from day one.

**Nothing was cut in the re-sequence and nothing was added except the re-harvest task.** Previously-recorded cuts stand: withholding and capital-gain character to S103, the property-tax model to S103, no feature wiring before cutover.

**The three behaviour-preserving refactors are folded into the rebuild and cancelled as standalone sprints.** None is a live bug; all three are structural consequences of the new architecture. **D-2** is the rebuild's data layout. The **account-ID rate map** is subsumed by scenario compilation — stable integer slot IDs make positional aliasing, SA-03's exact mechanism, impossible by construction. The **decision-state/execution-state context** becomes a phase boundary, enforced by architecture rather than by a context object. This frees the one-refactor-per-sprint slot entirely.

**Two numerical decisions an auditor should know about.**

1. **float64 for all computation and every threshold evaluation.** f32 is admitted only in the write-only retained output buffer, where no decision is made from it.
2. **`Math.pow` is a genuine determinism defect, deliberately deferred.** IEEE-754 mandates correct rounding for `+ − × ÷`, `sqrt` and FMA but **not** for `pow`/`exp`/`log`. The engine has 13 such call sites, so it is **not bit-reproducible between JavaScriptCore on iOS and V8 on Android today, at any precision.** The rebuild uses a pluggable math module defaulting to `Math.pow` so the diff gate holds; deterministic transcendentals ship in S100. An exact implementation is available because every exponent in the model is a multiple of 0.5, and `pow(x, n+0.5) = pow(x,n) × sqrt(x)` uses only IEEE-mandated operations.

Related: the engine's discontinuities — IRMAA tiers, guardrail bands, success/failure classification, age-eligibility gates — will be handled by **snap-to-grid quantisation of the decision input** rather than epsilon guards. Rounding MAGI to whole dollars before an IRMAA lookup is how the IRS assesses it, and it makes a threshold flip impossible rather than merely unlikely.

**Market data: two packages prepared, adopted at different times.** Both are committed under `Resource Documents/` with source hashes, transforms, validation invariants and test vectors, conforming to `MARKET_DATA_ENGINE_REFERENCE_2026.md` §2/§4.2/§5.1/§10.

- **CPI-U monthly** (BLS `CUUR0000SA0`, 1913-01 → 2026-07). Adopted in S6 as a **provable no-op** — December-to-December reproduces `HIST_INFLATION` to a median of 0.002 pp with **98 of 98 years inside 10 bp**. This also settled an open question: the engine's inflation series is definitively December-to-December, not annual-average (which matches only 13 of 97).
- **Fama-French CRSP market total return, monthly** (202607 vintage, 1926-07 → 2026-07). Index adoption decided; **landing deferred to after cutover.** It is an index change, not a resolution upgrade: geometric means agree to 4 bp across 98 years, but the median absolute annual difference is **1.85 pp**, the maximum **7.24 pp**, and **four years disagree on the direction of the market** (1934, 1939, 1953, 1994). It will move failure ages and guardrail crossings, and landing it before cutover would break the differential gate.

**What this means for audit rounds.** S4, S5 and S6 each produce a package on the established pattern. The rebuild produces the strongest evidence this project has been able to offer — a full-corpus differential result against an independent implementation of the same model — and S100 cuts that package. §6's hardware figures remain ⚠ PROVISIONAL until measured on a real iPhone; that measurement is **S4 task 10** (re-scoped 2026-09-11 from S6 task 4, via S5 task 9b — it is the longest-lead item in the plan) and it is the one input the plan cannot supply for itself.

---

**S3 has run (§4.14). Eight of nine tasks are done; one is gated on this package's verdict.** The brief is committed at `SPRINT_BRIEF_20260910_S3.md`.

| # | Task | State |
|---|---|---|
| 1 | **Generator coverage** — extend the allowlist, dead boolean toggles first | ✅ landed (prior session) |
| 2 | **Migrate the baseline harness** to `runPlan` / zero exclusions | ✅ landed `a7b3c6d` — recorded done earlier, and was not; see §4.14 |
| 3 | **Worker/main-thread parity, against the real build** | ✅ landed `e5ff503` |
| 4 | **Near-miss survivor sweep** — the SA-01-class hole hunt | ✅ landed `a582572` — **70 silent-material survivors**, Q32 |
| 5 | **Account-ID rate map** — the one behaviour-preserving refactor | ⛔ **NOT RUN. Gate closed** — needs an accepted financial baseline, i.e. a verdict on *this* package |
| 6 | `src/debt-revolving.js` | ✅ landed `628c247` — bundled, **not wired** |
| 7 | `src/mortgage-vs-investing.js` (F3) | ✅ landed `512b50d` — bundled, **no UI** |
| 8 | **L4b net-worth identity** | ✅ landed `98db985` |
| 9 | **Track A schema catalogue + migration test** | ✅ landed `e78cb63` — the brief expected this would not be reached |

**Task 5 is the only outstanding item, and the gate is the reason.** Its baseline is already captured, committed, and re-verified as reproducing byte-identical at HEAD (corpus hash `aeca9e75…`, input hash `8e85d21d…`). Nothing about it is blocked by engineering; it is blocked by wanting a *corrected, accepted* financial baseline to measure bit-identity against, which is what re-audit §5 asked for. **The most useful single thing this review can do for the next sprint is return a verdict on the RA-01–RA-04 repairs.**

**Task 1 ran before the baseline capture on purpose.** Capturing a refactor baseline over a corpus that cannot vary most of the schema is how FM-01 already read as IDENTICAL, and how RA-02 and RA-03 were invisible to all 27 scenarios (§4.13). §4.14 records what that corpus still could not reach even after the repair.

**The one-refactor-per-sprint rule is unchanged**, and S3's slot is still allocated to the account-ID rate map — unspent, not reassigned. The decision-state/execution-state context and D-2 remain out of scope for it, and no work was started on either. **R2-T08 remains gated.**

**What follows task 5**, in order: the Q32 policy decision (an absent `otherIncomes[].owner` silently re-times income, six figures); Q33 and Q36, both of which need `src/app-shell.html`, held byte-identical throughout S3; Q31 before the next brief inherits an impossible close-out instruction; the Q35 generator slice (`otherAssets` growth and availability, which gate `drawFromOtherAssets()` — currently zero coverage); then wiring `debt-revolving` into `projectDebts()` and surfacing the mortgage-vs-investing matrix, which land together because wiring the first is what makes Q33 bite.

### 5.0.2 Round 6 — the full closure re-audit, and the first round that found no live engine defect

**Superseding the package identity and gate figures in §5.0.1.** That section closed with "five rounds and forty findings are closed, current package `61382c7`". Rounds have since reported and been repaired. §5.0.1 stands as the record of what was true on 11 September and is not edited.

**Two identities, and they are not the same thing** (correction from the package-(4) verification addendum, and this section made the mistake itself). A commit names the **tested source revision**; the manifest names the **current archive**. §5.0.2 originally called `75ce988` / `c0817dcf…` "the current package" — those identify the *third* archive, whose code is what rounds 6 and 7 actually reviewed. The archive then moved when this very section was added to it. Both figures are correct about different things and neither is "current" on its own:

| | Value |
|---|---|
| Tested source revision (rounds 6–7 reviewed this code) | `75ce988` |
| Archive that carried it | `c0817dcf…90fc` |
| Current archive, and its declared commit | see `SHA256_MANIFEST.txt` — the file that always knows |

That is the same "true when written, read as current" failure this project has now hit five times, committed here by the text that was describing it. Package identity is therefore quoted from the manifest rather than restated in prose.

**The re-audit read the right tree, and said so checkably.** `S2_FULL_CLOSURE_REAUDIT_AND_CLAUDE_HANDOVER_20260912.md` names ZIP SHA-256 `2a64b9fc…8c0`, size 9,958,285 bytes, and reports the internal manifest verifying 491/491. That is the package this project cut, byte for byte.

**Several documents share the 12 September date, and they are not contradictory — they reviewed different byte sets** (corrected per the package-(4) addendum; the earlier phrasing "opposite conclusions" was wrong and unfair to the first reviewer). `S2_REPAIR_REAUDIT_AND_CLAUDE_HANDOVER_20260912.md` read the narrow package cut at `0a3d121`, which carried CR2-01's engine repair but lacked five others. Its findings about *those bytes* stand; they simply do not describe this tree. Superseded as a statement of current status, **not** refuted as a review. Naming which delivery a report read is what makes the difference legible, and is now done at the top of both handovers.

**Verdict: every prior finding closed for its original witness, and no new live retirement-calculation defect established.** After five consecutive rounds in which most findings turned out to be defects inside the previous round's repairs, this is the first round that did not find one in the engine. It found the same recursive pattern one layer out instead — four P2 findings, all in the build and measuring tools:

| Finding | Where | Reopens | What it was |
|---|---|---|---|
| **FC-01** | `build.js` | RP-02 | The require scanner mis-read five valid constructs, and the backstop could not catch any of them **because the backstop is the same scanner reading the same text a second time.** Described as an independent safety check; it never was one. |
| **FC-02** | `tools/capture-baseline.js` | CR2-04 | The array-index test was the unsigned-32-bit range — one larger than the index range — so `a['4294967295'] = 50000` was accepted as an index, dropped by `map()`, and captured to a hash **byte-identical to plain `[1]`**. Indexed accessors also bypassed the descriptor checks and ran twice, so the validated value was not the stored value. |
| **FC-03** | `tests/lib/schema-catalogue.js` | CR2-03 / CL-04 | The union deduplicated variants by structural key, which is order-dependent as soon as a scalar joins it. Also lost an own `__proto__` field — the fourth site of that assignment bug. |
| **FC-04** | `tests/near-miss-survivor-sweep.test.js` | RP-03 | The baseline validator walked rows only, so `successRate: NaN` compared against an identical copy returned **`inert`** — and `successRate` is in the harness's own material-field list. |

**All four original FC witnesses closed**, one commit each in the auditor's recommended order: `07b4b51`, `15411d7`, `3d67386`, `b24bd44`, with permanent witnesses at `1d79d43`. FC-01's fifth counterexample — division directly after `}` — is **refused by name rather than guessed**, because whether the brace closed a block or an expression is a parse-level fact no lexical lookback settles; every bundled module was checked first to confirm the refusal rejects no code that exists.

**Round 7 then established that "the witness passes" and "the family is closed" are different claims, and three of the four were only the former.** The FC repair re-audit read the same code and reported **FCR-01, FCR-02, FCR-03** — nine failing witnesses against the FC repairs, three passing controls. FC-03's schema repair held under a 120-permutation mixed-shape check and is the one family verified closed within its tested scope; **FC-01, FC-02 and FC-04 are correctly labelled "original witness closed, broader family reopened."**

| Finding | What the FC repair missed | Repair |
|---|---|---|
| **FCR-01** | The grammar still failed **open**. Whitespace inside the call parens and a comment before the paren are legal spellings the scanner did not know, so they were emitted unchanged and reached the browser as `ReferenceError`. The interpolation scanner and the backward head-scan were still *separate rule sets* with their own answers. | Three rule sets replaced by **one tokenizer**, paren heads tracked forward on a stack rather than by re-reading source backwards, and the grammar now **fails closed**: any `require` that is *called* and is not the supported sibling form is refused rather than passed through. Emitted text additionally parse-checked by V8, which is the one check that does not share the scanner's blind spots. |
| **FCR-02** | The hole check asked `i in value` (prototype chain); the descriptor check used `getOwnPropertyNames` (own only). An index supplied by a custom prototype satisfied one and was invisible to the other, then got read twice — validation saw 1, the capture stored 2. | The array domain stated once and checked before any element is read: ordinary `Array.prototype`, every index an **own data property**. Refuses with **zero getter invocations**. |
| **FCR-03** | The contract validated only fields that were *present*. Deleting `successRate`, `failed`, `firstShortfallAge` or the entire `rows` collection still returned **`inert`** — as did deleting a field from every row. | Presence checked before value, `rows` validated as a collection, and required row fields (measured across all three modes) checked on every row. A present, null `firstShortfallAge` stays legitimate; a missing one does not. |

**All three repaired** — `8cbe561`, `b5a9360`, `826ff9a`, witnesses at `203b940`. **Nothing in this round touched the financial engine**, which remains byte-identical to the package the FC round reviewed.

**One correction back to the auditor, recorded rather than quietly worked around:** FCR-01's published template witness does not fail as pasted. It is multi-line, and `endOfRegexLiteral` bails at a newline, so the mis-read regex swallows nothing. The defect is real — the single-line form of the same construct reproduces the reported `SyntaxError` exactly — but a test copying the published reproduction verbatim would have passed against the bug. Both forms are now permanent witnesses.

| Suite | Result |
|---|---|
| Auditor's FC acceptance suite | **13 tests, 13 pass, 0 fail** (was 3 pass / 10 fail) — run with the package **extraction** as root, so the repairs travel in the artifact |
| Auditor's prior suites | 15 pass / 1 fail — the single failure is the obsolete RP-03 assertion the re-audit itself explains in its §3, unchanged by this round |
| Release gate | **1,273 tests, 1,265 pass, 0 fail, 8 todo** — up exactly the 23 witnesses added; the 8 are the standing P19 revival contracts |
| Manifest, from a clean extraction | **492/492**, 0 mismatch, 0 missing |

**The re-audit's §5 corrections are applied to both handovers**, and each was verified here against file bytes rather than accepted: the narrow package *did* carry CR2-01's engine repair (`98dd3c31…` matches the closing baseline's recorded engine hash), so it was a mixed, incomplete delivery rather than uniformly stale source; the "rounds 4 and 5 — no movement" claim rests on a capture taken at `db1874a` whose engine and build hashes are **not** this package's, and now carries that limitation inline; and the capture-cost fix is cosmetic — the four sites still run the full corpus through all three modes.

**One consequence for sprint planning, and it is the sharpest thing in this round.** *(The task named below was S5 task 0; the 2026-09-11 re-scope moved it to **S4 task 3**, where it is now the first sprint's keystone. The four acceptance requirements are written into it.)* FC-02 is the **sixth** defect an external auditor has found in `tools/capture-baseline.js` (EXT-02, ST2-02, CL-03, CR2-04, CR2-05, now FC-02). That task was rewritten at `e814342` from *repair the harness* to *build a corpus-level invariant*, on the reasoning that four of the first five defects were the instrument reaching a verdict without looking at what it claims to describe. That reasoning holds. **The invariant as specified does not close them.** FC-02 escapes it — a silently dropped property still produces a full, correctly-counted, uniquely-named, non-empty capture — and FCR-02 escapes it for the same reason, bringing the tool's auditor-found total to **seven**.

So, per the package-(4) addendum, the caveat becomes **acceptance requirements rather than a warning**. **S4 task 3** is not complete until its measurement covers, as four separate checks:

1. **Raw-domain rejection** — unsupported shapes refused *before* traversal, with no accessor invoked and no value read. A completeness invariant must never be cited as closing this.
2. **Required-result-shape validation** — presence as well as value, for top-level fields and guaranteed row fields, on both operands.
3. **Persistence round-trip** — what was validated is what was stored, established by reading it back rather than by the encoder agreeing with itself.
4. **Corruption reaches a gate** — a corrupt verdict fails the run rather than being tallied and dropped.

Counting entries, checking names are unique and checking no hash equals an empty result is **necessary and not sufficient**. Writing that into the task before it is built is the whole reason it is recorded here.

**Round 8 repeated the lesson a third time, and it is now the standing rule of this sequence.** The package-(5) re-audit confirmed **FCR-02 closed within scope** and FC-03's schema closure still supported, then reopened the other two as **P5-01** and **P5-02** — audit-local IDs, unrelated to decision-register P5. Six failing witnesses, two findings, no new financial defect, engine byte-identical again.

| Finding | What the FCR repair missed | Repair |
|---|---|---|
| **P5-01** | Unifying three lexical rule sets removed their disagreement but left two decisions made by **spelling**: `regexMayStartAfter` asked only whether a word was in the keyword set, so `obj.return / require(…)` and `const of = 12; of / require(…)` both swallowed the call into a mis-read regex; and the refusal gate asked whether the *next token* was `(`, which `(require)('./x.js')` and `require?.('./x.js')` walk straight past. | One structural rule — an identifier after `.`/`?.` is a property, therefore a value — closing the whole keyword-named-member family at once. `of`/`in` leave the keyword set as a labelled spelling judgement. The loader test becomes positional: a code-position `require` is the loader unless it is a member access or an object-literal key, and must then match the supported form or be refused. **Plus the first genuinely independent check:** the output is rescanned with every `/` read as *division*, and a require for a **registered** module found that way fails the build. |
| **P5-02** | `rows` was checked for being an array, never for being a projection — so `rows: []` on both sides ran every loop zero times and returned `inert`. And the required row set was tied to the *materiality* list, so deleting `taxable`, `preTax`, `roth`, `hsa`, `income`, `shortfall` or `debtBalance` from every row also read `inert`. | A successful result must carry a non-empty projection; invalid results keep their own contract and are classified earlier. The required row set is now the **thirteen fields guaranteed across every mode**, measured against the stored baseline's 36 entries and 1,036 rows (zero empty projections, zero missing) and re-measured live. Row schemas are deliberately not required to match across modes. |

**Both repaired** — `9f1f876`, `3f9bf92`, witnesses `98b8047`. Gate **1,296 / 1,288 pass / 0 fail / 8 todo**. Two fixtures that omitted newly-required fields were repaired rather than the contract narrowed to fit them.

**The auditor retracted one claim, and confirmed our correction.** Its previous handover's multiline template example did not fail on the old scanner; reformatting had changed the lexer's behaviour, and the finding was carried by the single-line evidence instead. Both sides now hold the same rule: **preserve exact lexer-sensitive witness bytes.** Our witnesses are byte-exact and single-line for that reason.

**Closure states, stated precisely rather than flattened:** FCR-02 verified closed within the reviewed scope; FC-03's schema closure still supported; **FCR-01 and FCR-03 recorded as "original witnesses closed, broader families reopened by P5-01/P5-02"** — and now repaired in turn. The register should not be collapsed into "all tooling repaired."

**Q43 and Q44 remain open, untriaged, and are not among the forty-four.** The re-audit read them, agreed they are carried rather than closed, and added the constraint that should govern Q43's repair: **an uncapped scheduled balloon is not by itself proof that the calculation should be capped.** Define the accepted debt contract and the warning-or-refusal behaviour before choosing what to change. Q44 remains a scope and naming question.

**This is still not release approval**, and the re-audit says so explicitly. What it is: the engine's own witnesses all held under adversarial inspection by a reviewer reading the correct tree.

---

### 5.1 Round-2 queue — now moving

R2-T01/T02 passed on 2026-09-09, releasing the queue. R2-T03 through R2-T07 were then implemented in a single sprint rather than one checkpoint at a time — authorised by that sprint's brief, but **broader than the R4 report anticipated** ("do not combine unrelated repairs"). The external sprint audit reopened five findings across them (§4.6); all are repaired locally and none is externally re-audited. **R2-T08 remains gated.** In queue order:

| Task | Scope |
|---|---|
| **R2-T03** ✅ implemented, awaiting re-audit | Restore SS eligibility (R2-003: the survivor fix silently broadened unclaimed-benefit eligibility) and isolate COLA from payment segmentation (R2-004: an unrelated spouse event can accelerate the other person's COLA). Unblocked by the R4 PASS |
| **R2-T04** ✅ implemented (+ SA-05 repaired), awaiting re-audit | Owner eligibility before shared contribution allocation (R2-005: an inactive owner's contribution consumes the active owner's shared HSA limit) |
| **R2-T05** ✅ implemented (+ SA-01/SA-02 repaired), awaiting re-audit | Reject malformed imports atomically (R2-006: malformed entries pass checks, then replace state before crashing) |
| **R2-T06** ✅ implemented (+ SA-03 regression repaired), awaiting re-audit | Resolve the synthetic RMD holding's investment semantics (HR-02) — **resolved as a policy question** (§1); implementation still pending |
| **R2-T07** ✅ implemented (+ SA-04 inflation boundary repaired), awaiting re-audit | Establish the decision-clock evidence boundary — **resolved as a policy question** (§1) and implemented, on both the balance and the inflation input |
| **R2-T08** | Version and package the repaired engine honestly (R2-007). This is where the HTML is rebuilt and `ENGINE_VERSION` bumped. Not before. |

### 5.2 After round 2 closes

Decision-clock and HR-02 are implemented (§4.6); refinance/ARM/recast are built, and as of S2 (§4.8) all six debt modules are bundled and reachable, with ARM payment shock modelled behind a default-off flag. **Both of the items that used to head this list are therefore closed** — see §8 items 7 and 8 for what replaced them.

**Superseded 2026-09-10 by the audit REOPEN (§4.9).** The repair queue below comes first — the 9 findings, ordered so that result-contract and validation repairs (which move no financial output) land before the four that deliberately do. Only after that gate passes does the list that follows resume.

What remains after the repairs, in order: **closing Q15** (the Web Worker cannot see `DebtAmortization`, so the ARM payment-shock path is main-thread-only — it is the prerequisite for any UI control and for ever defaulting the flag on), surfacing refinance/ARM/recast in the UI at all, D-2 (columnar typed arrays), the two behaviour-preserving refactors the sprint audit named (a decision-state/execution-state context and an account-ID rate map), Track B's remaining regression fidelity, wiring the ported modules (Social Security stack, reserve manager, optimizer, grader) into the live app, dependency-aware recalc, mortgage-vs-investing, Monte Carlo/historical improvements, WebGPU compute path, then feature-group work. Full detail and current sequencing lives in the internal engineering log (not part of this package).

**Sequencing rule adopted after §4.6:** the three behaviour-preserving refactors run **one per sprint, never batched**, each verified against a pre-captured baseline. Batching unrelated engine changes into one unattended run is what the sprint audit charged for. Note also that L4 (§4.7) was built *before* those refactors on purpose — bit-identity alone would faithfully preserve a pre-existing accounting bug.

**Track D / D-2 — justification restated (2026-09-09).** D-2 (columnar typed arrays) was previously justified by memory: the 10,000-path Full tier sat near ~178MB against a ~150MB iOS budget. The minimum-supported-iPhone decision (§1) raises that budget to ~450–500MB, so **the memory argument no longer carries D-2 on its own.** It stays queued on two grounds that are independent of memory. First, **WebGPU consumes contiguous typed arrays** — an array of JS objects cannot be uploaded to a GPU buffer — so columnar storage is Track K's data-layout prerequisite, and guaranteeing WebGPU at the new floor makes D-2 more load-bearing, not less. Second, the aggregation hot loop sorts 21 times per projection year, and staying well under the 65% pressure rung (§6) is what keeps the compiled inner loop from being discarded mid-run. Any future package should cite those two reasons, not the ~178MB figure.

**Correction (2026-09-09), from §4.7:** earlier revisions of this paragraph said the aggregation loop sorts "with per-key reallocation." The sort count is right — `quantileKeys` has exactly 21 entries and `values.sort()` runs once per key per projection year — but the reallocation half was wrong. `values = new Array(validCount)` is hoisted outside both loops and `sort()` is in place, so the array is allocated once per aggregation, not once per key. The remaining costs are real (21 sorts per year, plus the per-key gather loop that fills the array); the allocation is not. **Measured, the aggregation is 19.6% of wall time at 500 paths rising to 27.9% at 10,000** — structural rather than defective, since simulation is O(paths) while aggregation sorts N values per key per year, so its share can only rise. It is the half of the runtime that scales worse.

**One adapter precondition to enforce before ever wiring the SS optimizer:** `buildSocialSecurityPlanningState` converts age via `Math.trunc(age)*12`. Passing this calculator's half-year age convention (e.g. 62.5) straight in would silently lose 6 months. Not a bug in the port — correct against its own integer-age contract — but a real precondition.

---

## 6. Hardware constraints that shape everything above

**Revised 2026-09-09**, after the minimum-supported-iPhone decision (§1) and a fresh review of current WebKit/iOS behaviour. Several figures in the previous revision were correct for the iPhone 8–14 era and are no longer correct at an iPhone 15 Pro floor. Where a number changed, the old one is named, so a reader holding an older package can tell which revision they have.

- **The memory ceiling scales with the device, up to a cap.** The previous revision said iOS enforces a "roughly fixed ~300–450MB per-page ceiling that does **not** scale with device RAM." That is wrong as a general statement. The WebContent process threshold follows roughly `min(3GB, min(physical_RAM, jetsam_limit))`. The ~300–450MB figure describes the iPhone 8–14 range; **iPhone 15 and later sit in the ~1GB+ class.** At the iPhone 15 Pro floor the ceiling is ~1GB+, not ~450MB. Installing to the home screen still does **not** raise it — memory is per WebContent process, and Add to Home Screen does not change that.

- **Safe working budget: ~450–500MB** of active JS heap for calculation data, replacing the previous ~150MB. The budget is set by the pressure ladder below, not by the kill ceiling.

- **The real limit is a performance cliff at 65%, not a crash at 100%.** WebKit escalates through three memory-pressure levels: **conservative (50%)** clears caches and forces garbage collection; **strict (65%) discards all JIT-compiled JavaScript**, along with media and font caches; **kill (100%)** runs synchronous cleanup and then reloads the page. Crossing the strict rung mid-run throws away the compiled Monte Carlo inner loop and drops it back to the interpreter — silently, while the run is still going. Tiers should therefore target the 50% rung. A practical consequence: a run that gets *slower* as path count rises may be deoptimising rather than doing more work. That is a distinct failure mode from running out of memory, and it is worth detecting explicitly.

- **The tier table remains ⚠ PROVISIONAL, now for a different reason.** The old derivation (10 values × 8 bytes per path, corrected to ~22 JS object properties per row ≈ 3× higher, putting the 10,000-path Full tier near ~178MB) was measured against a ~150MB budget and therefore read as "already past budget on iOS." Against a ~450–500MB budget that same tier fits with room. **The table needs full re-derivation, and D-2's justification is no longer primarily about memory** — see §5.2. Re-derivation still requires on-device measurement on an actual iPhone 15 Pro: Node/V8 heap figures do not transfer to JavaScriptCore on a phone.

- **The first actual measurements now exist (2026-09-09), and they revise the estimate upward by ~1.8× without changing the conclusion.** `tools/bench-simulation.js` (§4.7), on the `baseline` golden scenario forced to Monte Carlo, 72 rows per path, Node v24 / win32-x64, with `--expose-gc` and forced collection between samples so the figures are retained heap rather than garbage:

  | paths | retained | bytes/path | bytes/row | sim ms | agg ms | agg % |
  |---|---|---|---|---|---|---|
  | 500 | 16.0 MiB | 33,658 | 467 | 235.7 | 57.5 | 19.6% |
  | 1,000 | 32.1 MiB | 33,625 | 467 | 447.1 | 126.5 | 22.1% |
  | 2,500 | 80.1 MiB | 33,606 | 467 | 1,142.6 | 373.2 | 24.6% |
  | 5,000 | 160.2 MiB | 33,595 | 467 | 2,207.9 | 811.4 | 26.9% |
  | 10,000 | 320.3 MiB | 33,589 | 467 | 4,444.0 | 1,719.8 | 27.9% |

  Three readings, offered as measurements only — **no tier threshold is proposed here.** First, **10,000 paths retains ~320 MiB, not the ~178MB the old derivation gave** — consistent with 72 rows per path rather than the ~40 that derivation assumed. Against a ~450–500MB budget it still fits, so the correction does not reopen the D-2 memory argument; it closes it more firmly. Second, **there is no deoptimization signature on V8/desktop**: per-path cost is flat (0.94–1.00× of the smallest count) all the way to 10,000 paths. The JIT-discard failure mode described above is an iOS memory-pressure phenomenon and does not reproduce here — which is the expected result, now verified on one platform rather than assumed. Third, the aggregation's share of wall time rises with path count, which §5.2 explains.

  **This is V8 on a desktop. The constraint that governs the tier table is JavaScriptCore on an iPhone 15 Pro.** The two do not have comparable heap accounting and a Node bytes-per-path figure does not transfer to iOS. The harness prints this caveat in its own output header and carries it inside its JSON so the table cannot be lifted without it. The measurement is valid for exactly one purpose: a *relative* before/after comparison across a code change on identical hardware — which is what D-2 will need.

- **A device benchmark now exists, and no device has run it (S4 task 10, 2026-09-13).** `tools/build-device-benchmark.js` writes a self-contained page. The page runs the build's own Monte Carlo engine at increasing path counts and checks every result against Node. It reports the following, with anything the browser does not expose marked unavailable:
  - `hardwareConcurrency`, WebGPU adapter information and heap telemetry;
  - cold and warmed runs as distributions;
  - simulation and aggregation timed separately;
  - a per-path cost curve.

  A superlinear rise is reported as a **candidate** JIT-discard signature only. Memory pressure is never inferred from it. **Until a phone runs it, every figure in this section is still an inference, not a measurement** — the iPhone and Android runs are open (`DEVICE_BENCHMARK.md`).

- **Android's advantage is now parallelism, not memory.** With the iOS floor at ~1GB+ and per-core speed favouring the A17 Pro, the previous "~5–10× more usable memory" framing no longer describes the gap at the supported floor. What remains is worker count: **`navigator.hardwareConcurrency` is hard-capped at 4 on every iPhone from the 11 through the 17**, regardless of actual core count, as fingerprinting resistance. (Apple's own documentation states a cap of 2 on iOS; the observed value is 4.) The iOS worker budget is therefore a constant, not something to detect. A Research tier being Android-only is now a parallelism story, not a memory story.

- **SharedArrayBuffer is permanently unavailable to this project.** SAB requires cross-origin isolation, which requires the `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` **HTTP response headers**. A single self-contained offline file has no server to send them. This is not a preference: **Transferable objects are the only zero-copy path into a worker**, and structured-clone copying is the only alternative. The previous revision's "use Transferables, not structured-clone copies" was the right instinct — it is now a hard constraint rather than an optimisation.

- **Storage quotas, corrected.** The previous revision's "~5MB cap on iOS" for `localStorage` has been obsolete since iOS 17 / Safari 17. localStorage, IndexedDB, Cache API, Service Worker registrations and File System now share **one unified per-origin quota of up to 60% of total disk** for browser apps and home-screen web apps (15% for non-browser apps that display web content), under an overall cap of 80% of disk across all origins. Exceeding it throws `QuotaExceededError`; eviction is least-recently-used, and active pages plus persistent-mode origins are protected. **The debug log should still use IndexedDB rather than `localStorage` — but for the correct reason:** localStorage is synchronous and will stall the main thread, which matters given this project's stated preference for a slower launch over any runtime stutter. The 5MB reason is false and should not be cited again.

- **The seven-day purge exemption holds.** WebKit's tracking-prevention documentation confirms that the first-party domain of a home-screen web app is exempt from ITP's seven-day cap on script-writable storage: such an app is not part of Safari and keeps its own days-of-use counter, which actual use resets. A merely-bookmarked tab is not exempt. **Additionally call `navigator.storage.persist()`** — WebKit grants persistent mode on heuristics that include home-screen-web-app status, and persistent origins are protected from eviction under storage pressure. That is a free durability win and should not be left on the table.

- **Storage is not shared between Safari and the installed web app.** Data written in the Safari tab is invisible to the home-screen app, and vice versa. For this app that is a live trap: a household plan typed into Safari and then installed to the home screen opens empty. Handle it explicitly — prompt to install before data entry, or route the user across the boundary through the existing export/import path.

- **iOS 26 lowered the install friction.** Every site added to the Home Screen now opens as a web app **by default, even without a manifest**, via an "Open as Web App" toggle in the share sheet that is on by default. At an iOS 26 floor the manifest is no longer strictly required for standalone mode, though shipping it plus `apple-touch-icon` remains correct.

- **Workers survive backgrounding but not Jetsam** — unchanged. Checkpointing is still required.

**Confidence.** The quota rules, the ITP exemption, the WebGPU ship status and the iOS 26 Add-to-Home-Screen change come from WebKit's own blog and documentation. The per-device heap ceilings and the 50/65/100 pressure percentages are community-measured, not documented by Apple — directionally reliable, but the tier table stays ⚠ PROVISIONAL until confirmed on an actual iPhone 15 Pro. `navigator.hardwareConcurrency` is verifiable on any device in one line and should be checked rather than trusted.

---

## 7. Open questions that needed a human decision

All previously-open questions were resolved 2026-09-09 (see §1 for the decision-clock and HR-02 resolutions, §4.2/T03 for the tax-settlement resolution).

Two further questions were opened by the external sprint audit and **answered by the user**, not decided inside a repair:

- **SA-04 — is a spending decision start-of-period, or an ex-post amount indexed to contemporaneous inflation?** Resolved: **start-of-period**; the lag is a defect and was fixed. Recorded in §1 and in SPRINT_QUESTIONS.md Q6.
- **SA-01 — how should a present-but-incomplete nested import record be treated?** Resolved: **reject the import**, with an indexed error. Absent containers still migrate. Recorded in SPRINT_QUESTIONS.md Q7.

Every other fork taken during these rounds is recorded in `SPRINT_QUESTIONS.md` (**Q1–Q15** as of this revision) with the option chosen, the reasoning, and the file and line to change if a choice is disagreed with. Q9–Q14 come from the new-files-only sprint (§4.7); Q14 is not a fork at all but two measurements that contradicted claims this document had been making, both now corrected in §5.2 and §6.

**Q15 is the one entry that is not a resolved fork.** It is an open defect, found by inspection during S2 and deliberately recorded rather than repaired: the Web Worker's independently-assembled script has no `DebtAmortization`, so §4.8's ARM payment-shock path is main-thread-only. It is unreachable today and fails loudly rather than silently, but it is genuinely open, it gates the UI control for that flag, and it is the one item in this file that would become a live crash the moment someone turned the flag on without reading it.

---

## 8. Limitations carried forward, deliberately visible

1. `clone()`'s JSON round-trip normalizes non-JSON-safe values engine-wide. Contained for account `balance`/`basisPct` at the public boundary; general clone/schema hardening is separate follow-up work.
2. `TAX_COMMIT_SHORTFALL` has no organic reproduction. Source-level proof stands; no test-only production seam was added to manufacture one.
3. Partial-diagnostic labelling and count consistency across `partialDiagnostics` consumers is not formally specified beyond the fields currently emitted.
4. General scenario-shape validation remains `scenario-validator.js`'s job; non-finite scenario fields beyond the two named account fields are not enforced at the engine boundary.
5. Release qualification (R2-T08 / ARCH-06) is NOT RUN — stale HTML, unbumped version, no real-browser gate. A **test** gate now exists (`tools/verify-test-gate.js`, closing R4-F2) and makes a skip-based false qualification impossible, but **jsdom is still not a browser** and that is unchanged.
6. Known modelling simplifications, already documented and **not** to be conflated with defects: no dynamic per-lot basis tracking; independent per-account market shocks (which mechanically dilute variance by diversification-by-construction); no true reserve-balance tracking; no owner-specific RMD/Medicare/HSA rules; no earnings test; no future-year tax-table updates.
7. ~~**The `src/debt-*.js` modules are unreachable from the running app.**~~ **Closed by S2 (§4.8).** All six are now inlined by `build.js` at a `DEBT_MODULES_SOURCE` marker, each in its own IIFE namespace. **The residual limitation is narrower and still real: reachable is not wired.** Nothing calls them except `projectDebts()`, which uses `DebtAmortization.monthlyPayment()` for item 8's re-amortization. No UI surfaces refinance, ARM or recast analysis, so none of that modelling is visible to a user. It is disclosed here rather than presented as shipped capability.
8. ~~**`projectDebts()` models no ARM payment shock.**~~ **Attempted by S2 (§4.8) and found defective by the 2026-09-10 audit — see §4.9, findings FM-05, FM-06 and FM-09. The payment is re-derived every period rather than held between resets (wrong whenever extra principal is paid), a mid-period reset is postponed to the next period, and the flag itself accepts a non-boolean. Treat this as open, not delivered.** It sits behind `advanced.armRecastOnReset`, which defaults to `false` — so the defect's behaviour is what a default scenario still gets, deliberately, until this package clears audit. **Two residual limitations, both listed here rather than buried in §4.8:** (a) the fix is **main-thread-only** — `buildWorkerSource()` does not serialize `DebtAmortization` into the Web Worker, so enabling the flag on a Worker-run calculation throws `ReferenceError` there (loudly, as an error on the returned message, not as a wrong number); `SPRINT_QUESTIONS.md` Q15 carries the one-line fix, and the flag must not be defaulted on before it lands. (b) The live model still steps the rate exactly **once**, at `nextRateResetAge` — a real ARM adjusts repeatedly on a schedule under caps, which `src/debt-arm.js` models properly but which is not wired into the live engine and remains a watched-session change.
9. **The regression layer is a tripwire, not an identity.** `tests/golden-scenarios.test.js` locks 5 hand-written scenarios at 3 rows each (first/middle/last), 9 fields, rounded to 2 decimals. That is deliberate and it has a human-review workflow attached — but it should not be read as proof that a refactor preserved behaviour, and the three behaviour-preserving refactors queued in §5.2 will need a full-output baseline harness that does not exist yet.

---

## 9. Struck from scope entirely — please do not propose these

AI integration. Bank/account aggregation. Tauri, Pyodide, or any companion-server delivery model. Hand-written WASM. The full encrypted-sync/credential-store/compliance security apparatus. Separate iOS and Android builds. Native mobile apps.

---

## 10. What would be most useful from you now

> **This section describes the round that has now concluded.** It was answered on 2026-09-10 with a REOPEN verdict — see §4.9. It is kept as written because the focus areas it names are exactly where the findings landed, which is worth knowing when scoping the next round. **For the next submission, §4.9 and the repair queue supersede the reading order below.**

**This round is a whole-model review, not a delta audit.** Previous packages were scoped to a specific repair set. This one is the entire model, deliberately — but the reading order matters, because most of it has already been through at least one external round and a uniform sweep would spend the round re-covering settled ground.

**Weight your time here, in this order:**

1. **The SA-01…SA-05 repairs (§4.6) — highest value by a wide margin.** Three P1, one a regression this project introduced, all touching `src/engine.js`, `src/app-shell.html` and `src/scenario-validator.js`, and **never externally re-checked.** The architecture conclusions in §4.6 claim these were one root cause in three costumes; the most useful thing you can do is test whether that diagnosis is right, or whether a fourth costume is still in the code. SA-03 in particular was found by an auditor, not by the test suite — so ask what else of that shape the suite would also miss.
2. **The new-files-only sprint (§4.7) — first external look.** Six new modules. The two financial ones (`debt-refinance.js`, `debt-arm.js`) carry real modelling content and have never been reviewed by anyone. The other four are test/measurement infrastructure; for those, the useful question is whether they actually prove what they claim, particularly whether the L4 reconciliation invariant is asserting the engine's real identity or a tautology derived from the engine's own code.
3. **S2 (§4.8) — also a first external look, and the only place in this package where live financial behaviour changed.** Three specific asks. **(a)** `projectDebts()`'s re-amortization recomputes the payment every period rather than freezing it at reset, justified by a level-payment identity that holds only if the engine's coarse period stepping is an exact amortisation — test that premise rather than the arithmetic. **(b)** The bundling puts six previously-isolated module scopes into the app's single script scope; the two known collisions (`num`, `clamp`) are handled by IIFE namespacing and tested, but the useful question is whether anything *else* leaked, in either direction, that the two known cases didn't cover. **(c)** `src/debt-recast.js` is new modelling content — the recast-vs-curtailment trade — and nobody outside this project has read it.
4. **Confirm or challenge the ARCH-02 boundary** — carried forward, still the most valuable *standing* question. Are there result consumers beyond the comparison chart and heat map that could present a calculation error as a financial outcome? R4-F1 showed the *missing*-result case is a distinct hole from the *invalid*-result case; the same distinction may exist in consumers nobody has probed.
5. **Things we already know and are not asking you to find** — flagged so you do not spend the round rediscovering them: the debt modules are reachable but nothing calls them and no UI surfaces them (§8 item 7); the live ARM still steps its rate exactly once (§8 item 8b); and the ARM payment-shock path is main-thread-only because the Worker cannot see `DebtAmortization` (§8 item 8a, `SPRINT_QUESTIONS.md` Q15). All three are disclosed and queued. **If you think any of them is *worse* than stated — in particular if you think Q15 should have blocked S2 task 4 rather than being queued behind it — that is worth saying. Confirming them is not.**
6. **Nothing outstanding in §7 except Q15.** R2-T01/T02 is requalified (round 4, 2026-09-09) and its follow-ups in §4.5 are not being reopened. The decision-clock question that resurfaced twice is settled — start-of-period, no lookahead — but flag it if you see a reason to reopen.

**Ground rule 7 still applies:** no ZIP carries git history or `node_modules`, so any claim here about commits, diffs or test counts is reported rather than reproducible from the package. Where a claim's *consequence* is checkable from the source alone — as with §4.7's "no existing scenario's output can have moved" — check the consequence rather than taking the claim.

---

## Round 9 (P6-01, P6-02, S3-01, Q45) -- the package-6 re-audit

**Verdict: no blanket external requalification.** The P5 witnesses pass and the
engine is untouched for a fourth consecutive round (`e3f008ab...8e2e034`), but
the scanner family was still open, two comparator defects were reproduced, and
Q45 was independently confirmed.

**P6-01 -- four executable loaders still escaped.** Each is valid JavaScript
that runs correctly under a resolving `require`, and each was emitted unchanged
and reached the browser as `ReferenceError`. Measured against the tree *after*
the U+0001 repair: **three of the four still escaped.** Four separate
mechanisms -- ASCII-only identifier scanning (an escape-spelled `require` was
never seen); an object-literal-key exemption inferred from a FOLLOWING colon
alone (so a conditional's colon exempted it too); `await` sitting in
NON_VALUE_KEYWORDS (its division read as a regex opener); and a fallback
template helper that returned at `${` without tracking completion, so the
CLOSING backtick was read as a new OPENING one and everything after it was
skipped. All four close: three rewritten to values identical to their controls,
one refused by name. `aac7cb6`.

**P6-02 -- a regression gate returning a false pass.** Rows differing 100 -> 200
with `meta.hash` deleted from both sides printed `IDENTICAL — corpus hash
undefined` and exited 0: two absent values compared `undefined === undefined`
and took an equality shortcut past a per-entry diff that was working the whole
time. Absence read as agreement, the same shape as round 8's `rows: []`. The
shortcut now recomputes from the entries, and an absent hash is reported as
malformed. `e5830ef`.

**S3-01 -- and the correction matters more than the finding.** Input identity
was recorded at capture time and never read back, so two captures over
DIFFERENT corpora whose outputs happened to match reported an unqualified
IDENTICAL. **The cause previously disclosed here was wrong**: it was reported
that `corpusInputHash` is not exported and that `assertComparable()` had
therefore never been exercised. Both halves are false -- it IS exported, and
assertComparable IS reached by both entry points; it only ever compared FORMAT
VERSIONS. A missing check, not an unexercised one. That claim was quoted out of
a sprint checklist into an outbound auditor dispatch without opening the file it
described, which is the single rule this project was built on. Enforced now, and
deliberately asymmetric with the engine hash: the engine differing is usually
what is being measured; the INPUTS must match or the comparison means nothing.
`e5830ef`.

**Q45 -- confirmed, open, and two published claims corrected.** Six equally
weighted, equal-volatility assets at rho = -0.2 are **exactly on** the PSD
boundary: zero variance there is legitimate and the tiny negative residual is
floating-point roundoff, not an invalid matrix. The six-asset invalid witness is
**-0.25**. And zero return volatility does **not** imply ~100% success in
general -- a deterministic mean path can still fail. A specific calibrated plan
was measured; the universal inference was not, and must not be read as one.
Unrepaired by design, routed to S5 task 2d: it moves financial output and the
direction is partly a product decision.

**The standing lesson of this round is about documents, not code.** Two of the
errors corrected here -- the S3-01 mechanism and the Q45 emphasis -- were
*editorial*. Nothing was mis-measured. A claim was repeated from a summary
instead of a source, and a dramatic case was promoted over the quiet one that
actually mattered. A document can regress without containing a single false
statement, and reviewing for false statements will not catch it.

Gate **1,311 tests / 1,303 pass / 0 fail / 8 todo**. Witnesses `bf1fcc9`,
proved red before green -- including one that had to be rewritten because its
first cut passed against the unrepaired tool and therefore proved nothing.

---

## Round 10 (P7-01 … P7-04) -- the package-7 re-audit

**Verdict: no blanket S2 requalification.** The round-9 tooling witnesses hold
and the engine is untouched for a **fifth** consecutive round
(`e3f008ab...8e2e034`), but four issues remained: two in the scanner, one at the
comparator's public boundary, and one in a test of mine that proved nothing.

**P7-01 -- the first SILENT WRONG ANSWER in this family.** Every previous
escaping-loader defect produced a `ReferenceError`. This one produced a
different number. `obj.πrequire('./debt-amortization.js').x` returns 7; the build
emitted `obj.πDebtAmortization.x`, which returns **99** -- valid JavaScript, no
build error, nothing for a parse check to catch. Identifier scanning used ASCII
character classes, so a literal Unicode name SPLIT into punctuation plus a
fresh `require`; the member lookback then saw the pi instead of a dot and
rewrote the **suffix of somebody else's property**. The escaped spelling of the
same identifier survived intact, so the scanner disagreed with itself about one
name. Repaired with the real grammar -- ID_Start / ID_Continue -- so tokens
break where JavaScript breaks them. `07fe71e`.

**P7-02 -- a regression I introduced in round 9.** `obj. require('./x.js')`
built correctly in package (6) and was refused in package (7). One space. The
revived fallback decided member position from the preceding **character**, so
whitespace or a comment defeated the exemption and an ordinary method call was
reported as a surviving loader. Member position is a **token** fact; the
fallback now carries the previous non-trivia token. **And the controls that
should have caught it used UNREGISTERED specifiers**, so the registration
filter cleared them before the member logic was ever reached -- a control that
cannot reach the code it guards is not a control. `07fe71e`.

**P7-03 -- an empty diff is a claim.** `diffSnapshots()` returned a bare `[]`
whether input identity was verified or unknown; its only own property is
`length`, so a caller could not tell them apart. The refusal is **scoped to the
empty result**, because that is the success representation and the only value
mistakable for a pass -- a non-empty diff already says "these differ" and
carries no false assurance. The first, broader cut broke six tests that check
difference *detection*; bending their fixtures to fit it would have been fixing
the measurement to match the instrument. Zero fixtures were changed.
Diagnostic access is an explicit opt-in, deliberately **not** implied by
`allowIncomplete`. `2a1f472`.

**P7-04 -- and this is the one worth reading twice.** My round-9 CLI regression
test used `hash: 'h-' + total`, which is not a hash of anything. The unrepaired
tool rejected the fixture for **entry-hash** integrity long before reaching the
branch under test, and satisfied both assertions. The test passed against the
broken tool. **I did run it red first; I never checked that red was red for the
right reason** -- and the evidence was in my own probe output at the time,
printing "stored entry hash h-100... does not match", which I read past.
Fixtures are built through `captureEntry()` now, a precondition test asserts
their soundness rather than assuming it, and the proof is demonstrated: with
valid hashes and only `meta.hash` removed, the package-6 tool prints
`IDENTICAL — corpus hash undefined` and exits **0**, while the repaired tool
refuses and exits **1**. `9d1bcf9`.

**Packaging wording, corrected.** The round-9 dispatch said "no file was
removed". Narrowed to **"no declared payload was removed"**: eleven older,
unmanifested `.zip.sha256` files and the explicit directory entries are not in
the new archive. Not a missing model component, but not what the earlier
sentence claimed either.

**The standing lesson of this round.** Round 9's was that a document can regress
with no false statement in it. Round 10's is one level in: **a test can be run
red-then-green and still prove nothing, if the red was red for an unrelated
reason.** Verifying the failure is not the same as verifying the failure's
cause, and only the second one licenses the claim.

Round-10 witnesses: **7 of 11 fail pre-repair, 11 of 11 pass after** -- matching
the audit's own count of its acceptance suite. Gate **1,322 tests / 1,314 pass /
0 fail / 8 todo**. Q43, Q44 and Q45 remain open and unwaived; the eleven P19
dispositions remain containment; the independent intended result contract
remains outstanding.

---

## Round 11 (P8-01, P8-02) -- the package-8 re-audit

**Verdict: no blanket S2 requalification.** All four package-7 witness groups
pass, the engine is untouched for a **sixth** consecutive round
(`e3f008ab...8e2e034`), and two findings remained.

**P8-01 -- a property class applied to half a character tests nothing.** Round
10 replaced the ASCII identifier classes with the real `ID_Start`/`ID_Continue`
sets. It fixed the **classes** and left the **iteration** alone, so both
scanners still walked one UTF-16 code unit at a time. A supplementary-plane
identifier character is **two** code units, and the property class accepts the
whole character while rejecting each half -- so `U+10400` split exactly the way
pi used to, and `obj.<U+10400>require(...)` returned **99 instead of 7** again:
valid JavaScript, no error, nothing for a parse check to catch. The same failure
with an ASCII `a` in front, so continuation was broken too. **The regex was
never the boundary; the cursor was.** Both scanners now read a whole code point
and advance by its width, through one shared helper that returns the character
and the width together. Verified across five supplementary code points in four
Unicode blocks, at identifier start and inside identifiers -- the fix is about
**width**, not one glyph. `1e73bc4`.

**P8-02 -- completeness was one equality test.** Both entry points asked only
`meta.complete === false`, so a current-format snapshot that deleted the flag,
or set it to `null`, or to the **string** `"false"` -- truthy, and the exact
mechanism **FM-09** already repaired once in the engine's flag typing -- reached
an unqualified regression pass. So did `complete: true` with an omission
recorded two lines below it. `verifyIntegrity()` reported no problems for any of
them: correct content hashes establish that the **output** is intact and say
nothing about whether the **metadata** means what it claims. One validator now,
consulted by both entry points, because two call sites deciding separately what
"complete" means is Q20/Q33/Q38's family and this project has paid for it four
times. Legacy handling is a **format** question, not "any absent field predates
its own introduction". `2e37862`.

**The fixture line, and where it was crossed.** Five synthetic fixtures gained
`complete: true, omissions: []` -- truthful, because they are complete captures
with nothing omitted. The one that mattered is CR2-05's legacy control: it built
a **current-format** snapshot and deleted the field, while its own comment said
it tested format-1 and format-2 behaviour. That fixture *was* the thing the
audit warned about. It is genuinely legacy now, with its current-format
counterpart asserted beside it, so the control tests the policy rather than a
coincidence.

**The standing lesson, and it caught itself this round.** Round 10's was that a
test can be run red-then-green and still prove nothing if the red was red for an
unrelated reason. The P8-02 witnesses first asserted the new classification
helper and then the defect, so pre-repair they died on `completenessOf is not a
function` -- red, but never reaching the behaviour under test. **That is P7-04
wearing a different hat, one round after learning it**, and it was caught only
by reading *why* each test failed instead of counting that it did. Reordered so
the refusal is asserted first; the malformed rows now fail on *"Missing expected
exception: flag deleted returned a bare empty array"*, which is the defect.

Round-11 witnesses: **17 of 18 red pre-repair, 18 of 18 green after**. Gate
**1,340 tests / 1,332 pass / 0 fail / 8 todo**. Q43, Q44 and Q45 remain open and
unwaived; the eleven P19 dispositions remain containment; the independent
intended result contract remains outstanding.

### How findings are counted, recorded here so it is not re-derived

Agreed 2026-09-12 with the parallel tracker work, after two rounds of
re-deriving it:

> **Count once per distinct MECHANISM at first discovery-and-repair.** A later
> commit that refines or narrows the *same* mechanism updates that entry rather
> than adding a count, even across rounds and even when it needs its own commit.

So P6-01 counted separately from P5-01 (different code locations and
mechanisms sharing a family name), while P7-03 folded into S3-01 (same
mechanism, narrower boundary).

**And "closed" splits three ways, not two.** Of the total: some are **repaired**,
eleven are **excluded** under P19 (real, undisputed, un-bundled rather than
fixed), and a small number of the repaired were **regressions this project
introduced in its own earlier repairs** -- SA-03 and P7-02. That last category
is kept visible deliberately. It does not change the auditing standard; it keeps
the headline number from reading as though every finding were a pre-existing
defect found in original code.

**A regression is not an incomplete repair**, and conflating them inflates the
number on an honest recount. A regression breaks something that previously
worked (SA-03, P7-02). An incomplete repair closed its named case and stopped at
that case's edge (FCR-01/02/03, P5-01/02, P6-01, P8-01). The U+0001 backstop is
neither: that check never worked at any point, so nothing that had been working
was broken.

---

## Round 12 (P9-01, P9-02) -- the package-9 re-audit

**Verdict: no blanket S2 requalification.** The P8-01 Unicode witnesses and the
original P8-02 completeness witnesses all hold, the engine is untouched for a
**seventh** consecutive round (`e3f008ab...8e2e034`), and two findings remained
-- one of them a regression introduced by round 11's own repair.

**P9-01 -- "anything other than current format" is not a definition of legacy.**
Round 11's `completenessOf()` asked `formatVersionOf(s) !== CAPTURE_FORMAT` and
returned `legacy` **before looking at `complete` or `omissions` at all**. So a
format-2 capture carrying an explicit `complete: false` AND a recorded omission
reached a bare `[]` and an unqualified `IDENTICAL`, exit 0 -- which **package
(8) correctly refused**. A compatibility rule for metadata that is ABSENT was
overriding evidence that was PRESENT, which is backwards. Reproduced wider than
the audit's table: format **1** and an **absent** formatVersion false-passed
too, and the package-8 tool refused all four rows. A future format **4** and the
**string** `"3"` were also labelled as predating a contract they do not predate
-- nothing in this file had ever validated the encoding, and `hashForFormat()`
asks `Number(fv) >= 3`, which is why both still verified cleanly. `dac728c`.

**And the correction runs deeper than the regression.** The audit supplied a
counterexample **from inside our own package**:
`tools/baseline-20260910-after-CL-closure.json` records format **3**, verifies
cleanly, carries 36 entries and the known corpus-input hash -- and has neither
`complete` nor `omissions`. **So format 3 does not identify the completeness
contract.** The result ENCODING and the completeness METADATA CONTRACT began at
different times, and round 11 assumed they began together. Three questions are
now asked separately: can the tool read the encoding (against a real supported
set); is completeness metadata present; and what does present metadata say.
**Absent metadata is UNKNOWN in every supported format, the current one
included** -- not a pass, and not a declaration of incompleteness either.

**Unknown is guarded at the EMPTY result, not at the gate** -- the same
instrument P7-03 chose, for the same reason. A non-empty diff already says
"these differ" and carries no false assurance, so difference detection needs no
permission and the shipped format-1 and format-2 baselines are not stranded.
Only AGREEMENT is withheld. An unreadable encoding, by contrast, is refused
unconditionally: `allowIncomplete` says "I know this corpus is partial", which
is not a claim about whether the file can be read, so it cannot grant one.

**P9-02 -- the formatter consumed metadata the classifier had just rejected.**
`completenessOf()` correctly returned *malformed: meta.omissions is string, not
a list* -- and both display paths then did `(meta.omissions || []).map(...)` on
that string. The refusal **died inside its own error message** with `.map is not
a function`, and the real reason never reached the caller; the CLI printed half
a refusal and then a stack trace. Reproducing it found a **second dereference on
the same line** that the audit had not reported: a `null` omission RECORD
crashed the formatter too. Shape is checked at both levels now. `dac728c`.

**The CLI was also printing a false statement about a real file.** Its heading
asserted that every refused file *"declares itself incomplete"* -- untrue of a
malformed capture, and untrue of the after-CL artifact, which makes no
declaration at all. Each file now carries its own classified reason. A third
site, the CHANGED footer, was still asking `meta.complete === false` directly
and so stayed silent about malformed and unknown captures whose differences it
had just printed. All three sites use the one validator.

**Two controls now assert a different policy, deliberately.** CR2-05's legacy
control and the P8-02 legacy control both asserted that a format-2 capture with
absent metadata compares silently green, on the premise that format identifies
the completeness contract. The audit **retracted that premise** and supplied the
counterexample, so both controls were asserting something now believed false.
This is **not** a fixture bent to fit an instrument -- the distinction from
P7-03, where six tests measuring difference detection were left alone and the
refusal was narrowed instead: there the measurement was sound and the instrument
was wrong; here the stated policy changed underneath the control. What the
original control existed to protect is preserved and now asserted explicitly:
**shipped legacy baselines stay usable for difference detection.** This is a
real behaviour change for those baselines and is disclosed as one -- they no
longer report an unqualified pass, only a qualified one.

**The standing lesson, and why the witness helper exists.** Round 10's rule was
that red must be red for the right reason. P9-02 is what happens when it is not
checked at the ASSERTION level rather than the run level: the round-11 witness
asserted `/complete|omission/i`, and the formatter's crash text *"(...).map is
not a function"* contains the word "omissions" -- so **the accident satisfied
the assertion written to prove a deliberate refusal**, and the suite was green
over a live defect. A tighter regex does not fix that. Every refusal witness now
goes through one helper asserting the SHAPE of the outcome: that something was
thrown, that it was **not a TypeError**, and that the message carries the
classifier's own label. The trap is kept as a live assertion so it cannot
quietly reopen.

It caught something immediately, too. The first cut of the CR2-05
difference-detection control changed an entry hash without the corpus hash; the
tool correctly refused it at the integrity gate, **before** reaching the
behaviour under test. Red, and for the wrong reason -- found by reading the
reason. The fixture was made sound rather than the assertion loosened.

Round-12 witnesses: **13 new, 12 red pre-repair**; the thirteenth (numeric
format 3 with an explicit `complete: false`) is a **control** that correctly
passed before and after, and is labelled rather than counted. The two
superseded policy controls are red pre-repair by construction. Gate **1,353
tests / 1,345 pass / 0 fail / 8 todo**. Q43, Q44 and Q45 remain open and
unwaived; the eleven P19 dispositions remain containment; the independent
intended result contract remains outstanding.

### Counting: the rule needed sharpening, and then needed a boundary

The rule recorded above could not decide round 11's P8-01 on its own: its two
precedents pull opposite ways (P6-01 counted separately from P5-01 on
*different code location*; P7-03 folded into S3-01 on *same mechanism*), and
P8-01 is **same location, different mechanism**.

> **Sharpened test, for an INCOMPLETE REPAIR:** would a COMPLETE and CORRECT
> version of the earlier repair have prevented this one? If yes, it folds into
> that entry. If no, it counts.

It reproduces every prior decision: P7-03 folds; P6-01 counts (a correct P5-01
in a different location could not have reached it); P8-01 counts (a correct
character-class repair still splits a two-unit character).

> **Boundary:** that test governs incomplete repairs only. **A REGRESSION counts
> as its own mechanism**, because it breaks behaviour that previously worked --
> a defect that did not exist before cannot be "prevented" by completing the
> repair that created it. Without this boundary the test would silently fold
> SA-03 and P7-02, which are counted.

By that boundary **P9-01 counts as a regression** -- package (8) refused the
format-2 case and package (9) did not -- making three regressions this project
has introduced in its own repairs: **SA-03, P7-02, P9-01**. P9-02 counts as a
new mechanism. The deeper format-versus-contract correction inside P9-01 is a
design correction, not a separate finding.

**No cumulative total is recorded here**, as none ever has been in this
document; whether the tracker pages should carry one at all is an open
question, on the grounds that it has required re-deriving the whole
mechanism-distinctness history every round and has been restated or corrected
at nearly every step.

---

## Round 13 (P10-01, P9-02 reopened) -- the package-10 re-audit

**The unknown-completeness policy was ACCEPTED.** That was the change flagged
for pushback in the round-12 dispatch, since it altered real behaviour for the
shipped format-1 and format-2 baselines. The audit's words: *"a defensible
conservative change to the prior legacy control, not a defect merely because
the old control turns red."* The auditor's own package-9 suite ran 12 pass / 1
fail against it, that one failure being the superseded policy control, and
13/13 once that control was updated to the new policy. **Verdict remains: no
blanket requalification**, engine untouched for an **eighth** consecutive round.

Both residual items are **extensions of existing P9 families, not new
findings**, and the audit says so in terms -- with an explicit instruction not
to add four ledger entries for the four new witness shapes. **The count does not
move this round.**

**P10-01 -- an explicit null version is a DECLARATION, not an absence.**
`encodingOf()` tested `raw === undefined || raw === null` and handed both the
format-1 inference, so `"formatVersion": null` -- an **own field carrying a
value**, and a value that is not a supported integer -- was labelled an
undeclared format-1 encoding and reached a bare `[]` and an unqualified
`IDENTICAL`, exit 0. Both diagnostic permissions were irrelevant to it. The
fixture had valid entry and corpus hashes, matching input hashes, `complete:
true` and an empty omission list, so nothing unrelated was masking the result.
**This is the same shape of error P9-01 fixed one level up: inferring a
historical state from something that is not evidence of one.** DECLARED now
means the field is PRESENT, tested with `hasOwnProperty` -- absence is
inferred, a present value is read. Genuine absence is still format 1; `0`,
`false`, `""`, `"3"`, `4`, `3.5`, `[]` and `{}` all still refuse. None of the
14 stored baselines declares a null format, so nothing needed the exemption.
`fe5433d`.

**P9-02 reopened -- the fields inside the records.** Round 12 validated the
omissions COLLECTION (is it a list?) and each RECORD (is it an object?), and
then passed the record's FIELDS through `String()`. An **ordinary JSON record**
can carry `"toString": null` -- an own, non-callable property that `JSON.parse`
creates with no functions, getters, cycles or code execution anywhere in the
input. `String()` finds `toString` uncallable, falls through to `valueOf`, gets
the object back, and throws *"Cannot convert object to primitive value"*. So
**the refusal died inside its own error message again**, and the CLI printed
the classification and then a stack trace where its guidance should have been.

**Three repairs, three levels, each closing the level it was shown.** The rule
is now the class rather than the case: **no value is rendered through its own
conversion methods, at any level.** `safeText()` for displayed fields,
`safeJson()` for diagnostic labels -- `JSON.stringify` consults a value's own
`toJSON` and throws on cycles, so it was never the last word either. One
witness is deliberately beyond the reported case: a record whose `toString` and
`valueOf` both throw cannot come from JSON, and pre-repair it did worse than
crash the formatter -- **it replaced the refusal with its own message**. That is
the family; the JSON shape is the reachable instance of it. `fe5433d`.

**A false statement survived a repair by moving into the prose beside it.**
Round 12 stopped the tool telling operators that a file *"declares itself
incomplete"* when it declared nothing. The replacement label then told them the
capture's *"format 3 predates the completeness contract"* -- which for a
format-3 capture asserts the **opposite of the finding that produced the
label**, and for any capture states as fact something absence cannot establish.
The label now says only what is true, and a witness asserts the sentence rather
than only the logic. Two stale comments still describing the retracted
format-only policy were corrected the same way this project corrects
elsewhere: by naming what they used to say, not by deleting it.

**A dispatch overclaim, corrected.** Round 12's dispatch said unknown-
completeness captures "are refused at the empty case unless `--allow-incomplete`
is passed". True of the **API**, which requires the option to return `[]`. Not
true of the **CLI**, which prints a qualified `IDENTICAL` with **exit 1**
without any option -- it withholds the successful exit, not the display. The
behaviour is correct and the audit accepted it; the sentence describing it was
wider than the behaviour.

Round-13 witnesses: **9 new, 8 red pre-repair**; the ninth (genuine absence is
still format 1, every other spelling still refuses) is a **control** that
correctly passed before and after. Gate **1,362 tests / 1,354 pass / 0 fail / 8
todo**. Q43, Q44 and Q45 remain open and unwaived; the eleven P19 dispositions
remain containment; the independent intended result contract remains
outstanding.

### Counting: unchanged this round, by the rule as written

**P10-01 folds into P9-01** and **the reopened formatter case folds into
P9-02**: same mechanisms, narrower boundaries, and a complete and correct
version of each earlier repair would have covered them -- which is exactly the
sharpened test's "yes, it folds" branch. Neither is a regression: package (9)
did not handle a null version correctly either, and the audit explicitly
declines to claim package (10) introduced these. So the regression count stays
at three (SA-03, P7-02, P9-01), and no new mechanisms were established.

---

## Round 14 (P11-A, P11-B) -- the package-11 re-audit

**All twelve package-10 external assertions pass** (against five pass / seven
fail on the previous archive), all 112 supplied witnesses pass, and the
accepted package-9 policy control holds at 13/13. Engine untouched for a
**ninth** consecutive round. Both residuals are **extensions of the existing P9
diagnostic/validation families**, and the audit says so explicitly: do not
count the six new failing assertions as six defects. **The finding count does
not move.**

**P11-A -- the rule had an exception inside the helper written to enforce it.**
Round 13 stated the rule as *"no value is rendered through its own conversion
methods, at any level"* and then left `JSON.stringify` inside `safeJson()`. The
comment directly above that call **named the hazard** -- *"JSON.stringify
consults a value's own toJSON and throws on cycles, so it is not the last word
either"* -- and the next line did it anyway, inside a `try/catch`. **The
try/catch caught the throw; it never stopped `toJSON()` RUNNING, and it could
not undo what the call did.**

So a caller-supplied `toJSON` on `meta.complete` ran while its label was being
built, set `meta.complete = true` on the caller's own object, and the later
completeness gate reclassified the mutated input as complete and returned a
bare `[]`. The metadata was malformed at entry, both hash checks passed, and
input identity matched. **Rendering had a side effect that erased the condition
being rendered.** A non-mutating hook ran once during direct classification and
**three times** during an ordinary refusal, supplying its own displayed text.

Two repairs, because the audit is right that caching alone is not the fix.
Nothing reaches `JSON.stringify`, `String()` or implicit concatenation unless
it is a **primitive**, where there is no user code to run -- so nothing can
throw and there is nothing to catch. And **classification is computed once per
side and carried** through every decision and display path, which is a defect
on its own terms even with no callbacks: a verdict recomputed at each gate can
differ from the verdict a previous gate already acted on. `413e4b6`.

**P11-B -- object identity is not a statement about encoding compatibility.**
`assertComparable()` ran *before* the unsupported-encoding gate, read the raw
format declarations, and concatenated them into a mismatch message. Two
separately parsed copies of `{"formatVersion":{"toString":null}}` are
structurally identical and are **two distinct object references**, so `a !== b`
took the mismatch branch and the concatenation threw before the named refusal
was reached. The encoding gate now runs first and the comparison is between
**validated integers**. The CLI's gate moved above its `try`, and its catch
handler -- which concatenated the raw declaration a second time, so a refusal
escaped as a stack trace -- now describes both sides through the classifier.
`413e4b6`.

### The standing lesson, and it cost two witnesses this round

Round 10's rule was that red must be red for the right reason. Round 13 found
that a false statement can survive a repair by moving into the prose beside it.
**Round 14's is that the rule can survive while its enforcement acquires an
exception** -- and the exception was inside the function whose entire job was
the rule, under a comment that described the defect accurately.

It cost two witnesses immediately. Their first cut called the new helpers
before asserting anything, so against the unrepaired tool they died on *"is not
a function"* -- red, and never reaching the behaviour. **That is P7-04 for the
third round running**, caught again only by reading why each test failed rather
than counting that it did. Both now assert the defect through APIs that existed
before the repair and touch the new helpers last.

The classification-count witness was wrong a second way: it measured with
`{ allowIncomplete: true }`, which **skips the completeness gate** -- one of the
very sites doing the repeated classification -- so it recorded a low count
against the unrepaired tool and passed its own assertion before dying on the
helper. It now measures an ordinary passing diff, where every gate is reached:
**three reads before, two after.**

And that is P11-B's own shape as well. The API witness compared a snapshot with
**itself**, and a reference equals itself, so it could never take the mismatch
branch the CLI took. **A control that cannot reach the code it guards is not a
control** -- P7-02's lesson, in a third place. The same-reference case is kept
and labelled as a control beside the separately-parsed case that reaches it.

Round-14 witnesses: **7 new, 6 red pre-repair**, each failing on the behaviour
it names. Gate **1,369 tests / 1,361 pass / 0 fail / 8 todo**. Q43, Q44 and Q45
remain open and unwaived; the eleven P19 dispositions remain containment; the
independent intended result contract remains outstanding.

### Counting: unchanged again

**P11-A and P11-B both fold into P9-02 and P9-01 respectively** -- same
mechanisms, narrower boundaries, and a complete and correct version of each
earlier repair would have covered them, which is the sharpened test's "folds"
branch. The audit reproduced P11-A on package (10) as well and states it is not
a round-13 regression, so the regression count stays at three (SA-03, P7-02,
P9-01). No new mechanisms were established.

---

## Round 15 (package-12 re-audit) -- P11-A and P11-B ACCEPTED

**The first round since round 6 that found no new comparator defect.** The
audit's decision: *"Accept the P11-A and P11-B repairs within the bounded scope
tested. No new blocking comparator defect was found."* The package-11 suite
moves from **3 pass / 6 fail to 9/9**, without its acceptance assertions being
changed, and an additional **8/8 boundary matrix** passes -- ten invalid version
declarations through API and real CLI subprocesses; four callback forms
(`toJSON`, `toString`, `valueOf`, `Symbol.toPrimitive`) across four metadata
positions, **none of the sixteen callbacks running**; unknown completeness
crossed with unknown input identity; and one completeness read per API side.
Engine untouched for a **tenth** consecutive round.

**This is a repair requalification, not whole-model financial certification or
release approval**, and the audit says so in terms. Every financial
qualification below is unchanged.

Two **non-blocking** follow-ups, neither a new defect.

### H12-01 -- the claim was true of the API and described as true of both

*"Classification is computed once per side and carried through every decision
and display path"* was true of `diffSnapshots()`. **The CLI is a sequence of
calls and the round-14 dispatch described it as though it were one:** it built
its verdicts, then called `assertComparable()` without supplying them, so the
helper classified again. Measured here with an instrumented copy, reproducing
the audit's table exactly:

| Path | Classifier calls | Per side |
|---|---:|---:|
| API, complete and equal | 2 | 1 |
| CLI, complete and equal | 4 → **2** | 2 → **1** |
| CLI, complete and changed | 6 → **4** | 3 → **2** |

**This is the third time a two-entry-point tool has been described with one
sentence** -- P9-01's "declares itself incomplete" wording, round 13's
empty-case refusal that was the API's behaviour and not the CLI's, and now
this. The wording is narrowed to the boundary that holds, and the **measured
counts** are recorded rather than a slogan.

The residual two calls on the changed CLI path are **deliberate**: it calls the
public `diffSnapshots()`, which classifies for itself, **because the round-14
parameter that let any caller supply verdicts is now gone.** That parameter was
exported, which made it a channel for "trust these verdicts" past every gate
below it -- introduced to save re-running a pure function. Internal callers use
a non-exported helper; the exported boundary always classifies for itself.
Recomputation is also safe now in a way it was not before P11-A: with no value
able to run its own conversion methods, `completenessOf()` is a pure function of
the snapshot. `40f2072`.

**And the witness for it was wrong first.** It forged a COMPLETENESS verdict --
but the completeness gate lives in `diffSnapshots()`, not `assertComparable()`,
so the function correctly did not throw and the test was red **before and
after**, proving nothing in either direction. *Does the fixture reach the gate
this function actually owns* is the first of the three standing checks, and it
failed on the test written to demonstrate them.

### H12-02 -- a checklist shipped referencing records the archive does not contain

`S5_TASK_CHECKLIST.md` routes **Q47, Q48 and Q49** and discloses that their
source entries were uncommitted in another session. Verified in the delivered
archive at `54fc18f`: they appear **8, 6 and 5 times** in the checklist and
**zero times** in `SPRINT_QUESTIONS.md` or `SIMULATION_LOG.md`. They exist in
the working tree now, uncommitted.

So the defect was never authorship -- the records existed -- it was that **a
package is cut from a commit, and an uncommitted record in a concurrent
session's tree does not ship.** Cite a commit, not the tree, applied to
packaging: the same shape this project has now hit in every direction, from
reading a tree as committed to citing a summary as its source.

**It is closed in THIS package rather than disclosed.** The owning session
committed the records at `76f2c35` about twenty minutes after the measurement
above, and discharged the checklist's uncommitted stamp at `e3da728`; both are
ancestors of this package's revision. Verified inside the extraction rather
than from git alone: `SPRINT_QUESTIONS.md` carries Q47/Q48/Q49 **1/3/2** times
and `SIMULATION_LOG.md` **4/2/2**. Nothing was authored to close it and nothing
is disclosed as missing.

**And the measurement that found the gap became an instance of the gap.** The
zero counts were correct at `54fc18f` and stopped being correct while the round
was being written -- a verification that was true when run, read as current.
What made that recoverable in one message instead of an argument is that the
count was **stamped with the package commit it described**, which is the
convention's whole value and, exactly, its limit: the stamp said which state
the figure described. It did not say the figure was still true.

Carried without change: Q47-Q49 are **supplier-reported summaries**, not three
independently re-audited defects, and withdrawn **Q46 must not be revived from
its ID alone.**

### One wording correction, adopted

*"A stamped number is never wrong, only dated"* is too strong, and the audit is
right: **a commit stamp provides traceability, not proof.** The phrase
originated in the checklist session and this session endorsed it when it was
proposed, so the correction belongs here too. A stamp tells a reader which
state a figure described and lets them re-derive it; it does not establish that
the figure was correct for that state. No historical mechanism total is changed
by this audit, and none was recounted.

Gate **1,371 tests / 1,363 pass / 0 fail / 8 todo**. Q43, Q44 and Q45 remain
open and unwaived; the eleven P19 dispositions remain containment; the
independent intended result contract remains outstanding; S3 task 5 stays
retired; S5 task 10 retains normalisation, versioning, artifact rebuild, gate
and off-machine reproduction. **The count does not move: no new mechanisms were
established this round.**

---

## Round 16 (package-13 re-audit) -- comparator closure retained, and a record corrected

**H12-01 and H12-02 are resolved in the archive.** The audit re-measured the
classifier counts independently and got ours: API 2, CLI equal **4 to 2**, CLI
changed **6 to 4**, with the remaining two on the changed path recorded as
accurately disclosed rather than owed. `assertComparable()` is confirmed to
ignore caller-supplied verdicts, the internal helper is confirmed not exported,
and an independent forged-encoding-verdict probe requires a named refusal and
passes. **9/9 prior acceptance and 8/8 boundary tests hold; 121/121 supplied
witnesses pass. No further comparator repair is requested.**

**P13-H1 -- Q49's mechanism was wrong, and the engine was never the problem.**
Q49 said a non-finite `account.contribution` is defused by `clone()`'s JSON
round trip: `NaN` becomes `null`, `null` reads as `0`, so a corrupted
contribution silently becomes a $0 contribution. Reproduced over the audit's six
one-year deterministic controls, and **the claim does not hold**.

`clone()` never touches the value, and the precise mechanism matters because
our first statement of it was wrong twice. In execution order: `simulatePlan()`
**first** clones the full account objects into mutable working accounts
(`src/engine.js:1240`; `clone()` at `:19` is `JSON.parse(JSON.stringify(o))`,
copying whole objects rather than selected fields). **Later**,
`auditContributions(p, …)` (`:1264`) computes requested and allowed
contributions from **the original `p.accounts`**. Sanitising a copied account
therefore does not validate the original value the contribution calculation
uses.

| Eligible? | `contribution` | Result |
|---|---:|---|
| Yes | `0` | `ok`, contributions 0 |
| Yes | `1000` | `ok`, **contributions 1,000** — the control proving the path runs |
| Yes | `NaN` | **`calculation_error`, rows `null`** |
| No | `0` | `ok`, contributions 0 |
| No | `1000` | `ok`, contributions 0 — eligibility zeroes it |
| No | `NaN` | `ok`, contributions 0 — **identical to the zero control** |

**The original observation was real and was generalised.** The last row is
exactly "silently becomes a $0 contribution", and it describes the *ineligible*
case correctly. The eligible case is a calculation error. One fixture, one
configuration, one conclusion drawn about all of them.

**The finite control nearly did not exist.** The first cut of this reproduction
read **row 0**, where contributions are always zero — so the 1,000 case looked
identical to the 0 case and proved nothing about whether the contribution path
runs at all. Contributions land in the final row. **A control that cannot reach
the code it guards is not a control, for the fourth time**, and this one would
have made the whole table decorative.

**Recorded divergence, not smoothed over:** the audit reports error code
`TAX_QUOTE_NONFINITE_ACCOUNT`; this reproduction returns
`TAX_QUOTE_NONFINITE_CONTEXT`. The containment behaviour is identical and the
difference is presumably fixture-dependent, but the two fixtures are not
byte-identical and the two codes are not interchangeable inside a witness.

**And one correction the audit did not name.** Q48's entry states that Q48 and
Q49 *"share a root cause"* — `clone()`'s JSON round trip. They do not.
Replacing `clone()` addresses Q48 and does not touch Q49's path. Found by
reading the neighbouring entry rather than only the one under correction, which
is the cheap check this project keeps arriving at from different directions:
**a correction is not finished until the claims that leaned on it are checked
too.**

`SPRINT_QUESTIONS.md` carries the correction with the struck paragraph and the
old heading retained rather than deleted. **Q49 stays OPEN as an
input-validation issue** — this is downstream containment, not validation — and
the exposure limit is stated: an actual `NaN` cannot be encoded in ordinary
JSON, so this is the direct-JavaScript-input case only. It does not show that a
saved file can carry `NaN` or that the UI produces one.

**No production source changed this round.** Engine byte-identical for an
**eleventh** consecutive round. Q43, Q44 and Q45 remain open and unwaived; Q47
and Q48 remain supplier-reported open items; the eleven P19 dispositions remain
containment; the independent intended result contract remains outstanding. **The
count does not move: P13-H1 is a correction to a record, not a new mechanism.**

---

## Round 17 (package-14 record audit) -- a correction that did not finish

**Comparator closure and H12 closure stand.** No production code, tests,
dependency files or historical baselines changed; the comparator, engine and
builder hashes are unchanged. **No further comparator repair is requested.**

**The round-16 Q49 correction was right and incomplete.** The new explanation
states the behavioural distinction correctly -- and the retracted explanation
survived in three other places, so a reader following the entry into its
implementation options received **conflicting instructions from the same
document**. The correction box said *"do not call the inactive case harmless"*;
the next unstruck section did exactly that. **A correction is not finished when
the new text is right. It is finished when nothing still standing disagrees
with it.**

The previous handover asked for three documents. One received edits, and that
edit did not reconcile its own surroundings.

### Three corrections to our own statements, all found by the audit

**"Before any clone exists" is not the execution order.** The clone is at
`src/engine.js:1240` and the contribution audit at `:1264` -- **the clone
happens first**. The claim was directionally right about what is read and
wrong about when, and it was repeated into the dispatch, the roadmap and both
handovers before anyone checked the line numbers.

**"Clones account balances" is field-selective and wrong.** `clone(p.accounts)`
copies **whole account objects**; `clone()` is `JSON.parse(JSON.stringify(o))`.
That phrasing originated as the auditor's own shorthand for working-account
state, and we adopted it as though it described a field selection. **A shorthand
borrowed from someone else is still ours once we ship it.**

**"The original is still `NaN` after the run" proves nothing.** We offered it as
the direct disproof of "the clone defuses it". A deep clone ordinarily leaves
its source unchanged, so that observation is consistent with every hypothesis
including the retracted one. **The decisive evidence is the source path reading
the original plan**, plus the active/inactive finite and invalid controls. This
one is the worst of the three: an observation that felt like proof, reported as
proof, and load-bearing in the dispatch.

### The reconciliation

`SPRINT_QUESTIONS.md` Q49 is now internally consistent end to end -- heading,
opening, correction box, rationale and candidate directions. The "same root
cause as Q48" line is corrected at the point of use; the *"despite currently
being harmless"* rationale is struck and replaced with one that does not depend
on `clone()` at all; candidate direction **(c)** is **withdrawn** (there is no
`clone()` dependency to re-verify) and **(b)** is narrowed, because its premise
-- that `debts[].balance` and `otherAssets[].value` are safe "for the same
reason" -- rests on the claim that just failed. **Whether they share a mechanism
is now an open question rather than an established fact.** Q48 and Q49 stay
jointly triaged and must not be jointly implemented.

Verified by reading the whole revised section rather than searching for the
correction marker, as the audit asked: every surviving mention of "harmless",
"only protection" or "silently-defused" is inside struck text or a labelled
quotation of what was withdrawn.

Two files are **not** this session's to edit and are routed rather than changed:
`S5_TASK_CHECKLIST.md` (task 2g's heading, summary, 2g.2 and gate wording) and
`SIMULATION_LOG.md` (Batch 16's table and interpretation, which must gain an
adjacent dated correction rather than be rewritten).

**No production source changed.** Engine byte-identical for a **twelfth**
consecutive round. Q43, Q44, Q45, Q47, Q48 and Q49 remain open; the eleven P19
dispositions remain containment; the independent intended result contract
remains outstanding. **The count does not move.**

---

## Round 18 (package-15 re-audit) -- the Q49 reconciliation accepted, and both pending edits land

**Accepted:** the reconciled Q49 entry and its causal explanation, with comparator closure and the H12 corrections retained. **This is a documentation requalification** -- not Q49 implementation closure, and not whole-model or release approval. No production code, tests, dependencies or stored baselines changed; engine byte-identical for a **thirteenth** consecutive round.

**The two disclosed omissions are now closed, by their owners, and ship in this package.**

Round 17's dispatch named them as routed and explicitly declined to report them as done -- *"if they matter to the next package, they will appear in it; if they do not appear, they were not done."* The audit took exactly that position back: it verified their **absence from the package**, not their receipt in another session. Both then landed:

**`d4f4d5c` -- S5 task 2g.** The heading drops the shared-root framing; 2g.2 now says review together, do not implement together; 2g.2a states Q49's actual work so it is not re-derived as a `clone()` fix, including that a test covering only ineligibility proves nothing because eligibility sets the allowed contribution to zero. The gate line, which had asked for a decision on whether `clone()` keeps doing validation work, is corrected -- that is Q48's question alone.

**`4e37443` -- Batch 16.** The table row's original result is **struck rather than deleted** and the correction appended; the interpretation gains an adjacent dated correction scoping the zero-output observation to the **eligibility state it was measured in**; and the `debts[].balance` row is annotated in place, which is the one the retracted sweep would have carried along.

**Neither was written by this session, and neither is counted as a new mechanism** -- the audit is explicit that both belong to the existing record-correction finding.

### What the round establishes about the shape of the work

**The checklist's error was the expensive one, and it was never a wording problem.** 2g had been routed on a headline-only read: both entries were titled "a discovered defect, not a judgment call", both sat in `engine.js`'s always-reachable path, and both named `clone()`. From *"both name `clone()`"* came *"both root in `clone()`"* -- which is not the same claim -- and an implementation instruction was written on it. A task implementing one fix for both would have repaired Q48 and left Q49 exactly where it was, while reading as though the work were done.

**The block disclosed that it was written from a partial read, and the disclosure prevented nothing**, because the specific wrong claim had already been made in the sentence above the caveat. **A caveat about incompleteness does not neutralise a specific claim made despite it.**

**And the sweep-forward rule earned its place.** Two things leaned on the retracted shared-root claim: 2g.2's implementation instruction, and Q49's candidate direction (b), which proposed sweeping `advanced.debts[].balance` and `advanced.otherAssets[].value` as "safe for the same reason". Both had to move. **When a mechanism is retracted, sweep forward for what was built on top of it rather than fixing the sentence and stopping** -- recorded in the checklist as a subtask rather than only here, since that is where someone will act on it.

### One standing instruction on the divergent error code

The audit's recorded active fixture returns **`TAX_QUOTE_NONFINITE_ACCOUNT`**; this project's reproduction returns **`TAX_QUOTE_NONFINITE_CONTEXT`**. Both records stand and **neither code may be substituted for the other**. *(Field identified in round 19, at the audit's request: this project's value is the **public** `runPlan().calculationErrorCode`, not an internal reason. See round 19 below.)* The two fixtures are not byte-identical, the reason for the difference is unverified, and broadening an assertion to accept either would conceal the discrepancy rather than resolve it.

Q43, Q44, Q45, Q47, Q48 and Q49 remain open and unwaived; Q46 stays withdrawn; the eleven P19 dispositions remain containment; the independent intended result contract and S5 task 10's gates remain outstanding; S3 task 5 stays retired. **The count does not move.**

---

## Round 19 (package-16 re-audit) -- both Q49 corrections accepted; two follow-ups, one of them ours

**Accepted: both previously pending Q49 mechanism corrections. P13-H1's requested causal corrections are complete in the package.** Comparator closure and the H12 corrections stand. Q49's implementation remains open. Engine byte-identical for a **fourteenth** consecutive round; no production code, tests, dependencies or stored baselines changed.

Two new items, neither a comparator or engine regression, and the audit is explicit that closure is not held open for either.

### P16-H2 -- the error code was right and the LAYER was never stated

The simulation log recorded `NONFINITE_CONTEXT`; this project's dispatch and ledgers recorded `TAX_QUOTE_NONFINITE_CONTEXT`. The audit asked which function and field each observation came from rather than assuming one was wrong. Verified in source and by re-running the probe:

- `src/engine.js:587` returns the **internal quote reason** `"NONFINITE_CONTEXT"`.
- `src/engine.js:1404` is `calcErrorCode = "TAX_QUOTE_" + quote.code`, producing the **public** code.
- This project's reproduction observed **`runPlan().calculationErrorCode`**, whose value is **`TAX_QUOTE_NONFINITE_CONTEXT`**.

**~~So both records describe the same observation at two layers, and neither was wrong -- what was missing from both was the layer.~~ WITHDRAWN in round 21 -- see below. That explanation fitted every fact available to us and was not what happened.** A bare code name is ambiguous in a codebase that prefixes one layer with another's name, and two honest records can disagree while describing one event. **The fix is a label, not a value.** *Narrowed in round 20 at the audit's request, because the first phrasing overstated its own scope:* **the dispatch and these ledgers identify the public field; Batch 16's annotation is pending** with its owning session. "Every recorded code" was not true when written.

**No assertion has been widened to accept either code**, and the audit's `TAX_QUOTE_NONFINITE_ACCOUNT` fixture is untouched. The two fixtures remain distinct observations pending an exchanged runnable fixture.

### P16-H1 -- a modelling expectation written as a mandatory direction

Not this session's file, and routed rather than edited -- but **reproduced here before relaying**, because a routed finding that arrives unverified is a claim, not a finding. **Corrected by its owner at `05afbe6` and shipping in this round's archive**, which landed after the first cut and prompted a re-cut; the owner reproduced the counterexample independently before editing rather than taking the relay on trust.

`S102_TASK_CHECKLIST.md` ground rule 6 states that *"finer stepping increases within-year sequence exposure, so monthly withdrawal against monthly returns should show **more** sequence sensitivity, not less. A scenario moving the other way is a finding."*

The audit's counterexample reproduces **to the digit**. Start 100, spend 20 a year, two years, no taxes/fees/inflation; annual factors `[2, 0.5]` against `[0.5, 2]`; monthly cadence withdraws `20/12` before each month's return at the twelfth root of that year's factor, so both cadences see the same annual compounded return and the same annual spending:

| Cadence | Up then down | Down then up | Sequence sensitivity |
|---|---:|---:|---:|
| Annual | 70.000000 | 40.000000 | **30.000000** |
| Monthly | 71.138077 | 42.276154 | **28.861923** |

**Monthly sensitivity is lower, by 1.138077, and the arithmetic is correct.** A rule declaring that direction a finding would classify correct arithmetic as a defect -- and would do it in the gate whose purpose is to decide whether a cadence change was sound.

**The defect is the form of the claim, not the intuition behind it.** "Finer stepping changes within-year sequence exposure" is a reasonable expectation; *"and therefore the measure must move this way, and the other way is a bug"* is a different statement that needs a defined measure, a defined comparison, and evidence. **A prediction stated as an acceptance gate stops being a prediction** -- it can no longer be wrong, only disobeyed.

It is the same shape as the rule this project has hit repeatedly from other directions: a check that cannot fail for the right reason. Here the check fails for the *wrong* reason instead, which is worse, because it produces a finding rather than a silence.

### Carried without promotion

Batch 17's eight scenarios and two interaction observations -- manual withdrawal order making the optimisation goal inert, and flexibility compounding with guardrails -- are **supplier-reported observations**, not independently executed here and not promoted to confirmed defects. They need intended-behaviour and UI triage, and their presence in a log authorises no policy change.

Q43, Q44, Q45, Q47, Q48 and Q49 remain open; Q46 withdrawn; eleven P19 dispositions remain containment; the independent intended result contract and S5 task 10's gates remain outstanding; S3 task 5 stays retired. **The count does not move.**

---

## Round 20 (package-17 re-audit) -- S102 accepted; two corrections to our own account

**Accepted: P16-H1's S102 correction.** Comparator closure, the H12 corrections and the completed Q49 causal corrections all remain accepted. Engine byte-identical for a **fifteenth** consecutive round; no production code, tests, dependencies or stored baselines changed. **Q49 itself remains unfixed**, and none of this authorises starting the rebuild.

### Two corrections to what this project said about itself

**The ledger claimed more than it had done.** Round 19 wrote *"every recorded code now names the function and field it came from."* Batch 16 does not, and is not ours to edit -- so the sentence was false about the one record it most needed to be true of. **Narrowed to what actually holds:** the dispatch and ledgers identify the public field; Batch 16's annotation is pending. A correction that overstates its own completeness is the same defect as the claim it replaced, one level up, and this is the second time in four rounds a summary sentence has outrun the work beneath it.

**And the account of what ran contradicted itself.** Round 19's dispatch said the probe was **re-run** in section 1, and in section 4 that the counterexample was **the only newly executed calculation**. Both cannot be true. The fact: **both ran this round, in one script** -- the `runPlan()` probe that identified `calculationErrorCode`, and the cadence counterexample. Section 4 was wrong. **A manual probe and a formal suite are different things, but neither may disappear from the account of what was executed**, and the reason this matters is precisely that the probe was load-bearing: it is what established which field the reproduction observed.

### P17-H1 -- a gate credited with a protection it does not provide

Not this session's file. Routed, and **verified in source before relaying**.

`S6_TASK_CHECKLIST.md` task 7.12 states that someone repairing `mortgage-vs-investing.js` would do work *"the gate will reject."* **The comparison gate supplies no such consequence while the module stays excluded.** Confirmed:

- `build.js` carries **three** `excludedReason` modules -- `debt-payoff-strategy.js`, `debt-strategy-adapter.js`, `mortgage-vs-investing.js`. **Eleven refers to findings, not modules**, and the two numbers have been adjacent in this ledger for long enough to be worth stating plainly.
- `installDebtModules()` installs **only** `BUNDLED_MODULES`; its own comment records that excluded modules stay directly `require()`-able by their own test files.
- `sourceFiles()` maps from `BUNDLED_MODULES`, so excluded module contents are **deliberately omitted** from the capture's source hashes.
- `tests/module-exclusion-registry.test.js` asserts the exclusion set, absence from the artifact, absence of engine calls and matching harness installation. **It does not assert that an excluded implementation still computes a particular wrong answer.**

So a behaviour change confined to an excluded module moves neither the shipped engine's outputs nor the capture's source hashes. **A dedicated module witness or an explicit source-freeze check could detect it; the behaviour comparator cannot be credited with doing so.**

The instruction is to split 7.12's obligations rather than widen the corpus: reachable legacy behaviour gets finding-tagged characterisation fixtures under an explicit preservation decision; P19 keeps three module exclusions covering eleven finding dispositions and their revival gates. **Excluded behaviour must not be imported into the supported comparison corpus merely to preserve its defects.** If excluded-source changes are to be prohibited, that is a named freeze check to implement -- not a protection to attribute to output comparison.

**This is a source-based conclusion, not a mutation experiment.** No edit was made to an excluded module to observe what the gate did, here or by the audit.

### Still carried

Batch 17's eight scenarios and two interaction observations remain **supplier-reported and unpromoted**. S4's exit-gate additions and S6's remaining rebuild-planning tasks are **future requirements**, not completed work and not authorisation to begin. Q43, Q44, Q45, Q47, Q48 and Q49 remain open; Q46 withdrawn; eleven P19 dispositions remain containment; the independent intended result contract and S5 task 10's gates remain outstanding; S3 task 5 stays retired. **The count does not move.**

---

## Round 21 -- two corrections to round 20, both ours, and the worse one is a false disclosure

Neither came from the audit. Both surfaced within minutes of the round-20 dispatch going out, and both are recorded here before anything else because one of them means a dispatch went out with a wrong statement of fact in it.

### The two-layer explanation was a reconstruction, and it was wrong

Rounds 19 and 20 explained the `NONFINITE_CONTEXT` / `TAX_QUOTE_NONFINITE_CONTEXT` disagreement as **two honest records of one event at two layers**, neither wrong, each failing to say which layer it meant. It was coherent, it fitted every fact either session had, and **it is not what happened.**

The session that owns `SIMULATION_LOG.md` checked **its own original probe output**, which still existed. That output had already printed the **prefixed public form**. So the probe measured the public code correctly and **the prose recorded something else** -- a transcription slip, terminal output into writing. There was never a layer ambiguity to explain.

**Neither this session nor the checklist session asked whether the original capture still existed.** We had a disagreement between a log entry and a re-run, and we built an explanation for the difference instead of going to look. That is the defect this project has catalogued in every other direction all week -- **reasoning from a representation of the evidence while the evidence was still there** -- and it is the more embarrassing instance precisely because the explanation was *good*. A wrong reconstruction that fits every available fact does not feel like a guess.

**Recorded as a convention:** *when a log entry and a re-run disagree, check the original capture before constructing an explanation for the difference.* The explanation is the expensive path and it is the one that feels like work.

### And round 20's dispatch carried a false disclosure

Round 20 reported Batch 16's layer annotation as **absent from the package, "read out of a clean extraction"**. It was present. `d2dd5a1` is an ancestor of that package's revision `41e17cb`; the annotation shipped, and the dispatch said it had not.

**The check searched for `quote.code` and `internal quote reason`. The log used neither phrase.** The pattern missed, the search returned nothing, and **the nothing was reported as an absence.**

This is the fifth standing check -- *did the instrument say it finished* -- passing while the answer was still wrong, because **a completed search and a correct search are different claims.** The terminator proves the run did not die. It proves nothing about whether the pattern described the thing being looked for. A search for the wrong string completes perfectly.

**The sixth standing check, and it is the one this session needed three rounds ago:** *when a search reports an absence, confirm the pattern matches the thing in a case where it IS present.* An absence is only evidence if the instrument has been shown capable of producing a presence.

The other disclosure in the same table -- S6 task 7.12 still live -- **was accurate**; `7b13903` landed after the cut. One of two was wrong, which is the ratio that matters least: a disclosure offered as verified evidence is worth nothing if its method cannot distinguish "not there" from "not found".

### What actually landed, verified by reading the files rather than searching them

**`d2dd5a1` -- Batch 16's layer annotation**, all four occurrences, naming internal reason against public `calculationErrorCode`, with the transcription finding recorded. Disclosed by its own author, unprompted: that commit's message describes only the layer fix while its diff also carries **Batch 18 and 19**, roughly 150 unrelated lines swept in by staging the whole file. Nothing wrong in either batch; it is simply not the one-clause diff its message implies.

**`7b13903` -- S6 task 7.12's P19 bullet.** The obligation is split rather than the corpus widened. The clause kept intact: **excluded behaviour must not be imported into the supported comparison corpus merely to preserve its defects**, which would undo P19 in order to protect it. A source-freeze policy is a check to build, not a protection to attribute. Updating a package manifest is not a behavioural failure. The four future acceptance witnesses stay four, because they test four different things.

Its author also corrected a count error in the same place -- *"the eleven P19 exclusions"* -- where eleven is the number of **findings** and three is the number of **modules**. The two numbers have sat adjacent in this ledger all week, and the category boundary between them is invisible at a glance.

**Engine byte-identical for a fifteenth consecutive round. The count does not move.**

---

## Two findings from reading the simulation log and enumerating the todo set

Neither came from an audit round. Both came from doing what the audit has been asking for in a different form: going to the artifact instead of the summary of it.

### The eight todos are eight of ELEVEN P19 findings, and three have no revival contract

The gate has reported **8 todo** every round for eighteen rounds, and every ledger entry has described those eight as *"the standing P19 revival contracts"* -- the witnesses that must go green before an excluded module may ship again. Enumerated by name for the first time:

| Finding | Revival witness |
|---|---|
| RB-03 `lumpSumRecast` must write scheduled P&I, not the all-in outlay | yes |
| RB-04 the interest objective must use the entered payment | yes |
| RB-05 an invalid scenario must never yield a numeric objective or a winner | yes |
| RB-06 $500/month must add $6,000 a year regardless of contribution mode | yes |
| RB-07 `endingNetWorth` must include debt, or refuse | yes |
| RB-08 a horizon landing exactly on a row must select that row | yes |
| RC-03 a $50k cash investment must add $50k of basis | yes |
| RC-04 a debt that never amortizes must have no finite debt-free month | yes |
| **ST2-01** a full year of growth granted to all twelve months of a monthly contribution | **none** |
| **ST2-04** the engine runs ahead of refusals it already knows about | **none** |
| **ST2-06** a requested one-year window returns a lifetime success rate | **none** |

**ST2-01, ST2-04 and ST2-06 appear nowhere in `tests/` at all.** So the revival contract covers **eight of eleven dispositions**, and three excluded defects could be revived with nothing in the suite obliged to go green first.

**Nothing here is newly broken and no count changes** -- eleven dispositions is still eleven, and the exclusion registry still enforces exclusion correctly. What changes is what "8 todo" was taken to mean. **The number completed successfully every round and was never checked against what it claimed to count**, which is the sixth standing check applied to a figure rather than to a search: *a count is evidence only once it has been shown to enumerate the thing it is named after.*

### `accountPlannedContribution()` does have a guard on Q49's value, and it is a floor rather than a check

The simulation log's Batch 18 traced something Q49's record does not mention: `accountPlannedContribution()` ends with **`return Math.max(0, amount)`** (`src/engine.js:27`). Verified here across four input classes through the eligible fixture:

| Input | `accountPlannedContribution()` | `runPlan()` |
|---|---|---|
| `-5000` | **0** -- floored | `ok`, contributions 0 |
| `1000` (control) | 1000 | `ok`, contributions 1,000 |
| `NaN` | **`NaN`** -- propagates | `calculation_error`, rows null |
| `Infinity` | **`Infinity`** -- passes through | `calculation_error`, rows null |

**The clamp catches exactly one of the three invalid classes**, and it catches that one by construction rather than by intent: `Math.max` floors a negative and propagates a `NaN`. So Q49's entry is correct that no *validator* checks the field, and incomplete in a way that matters to whoever repairs it -- **a reader tracing the code finds a guard sitting on precisely this value and may reasonably conclude the field is defended.** It is defended against negatives only.

**`Infinity` is a fourth input class neither Q49 nor the audit's six controls exercised.** It behaves as `NaN` does -- same containment, same public code -- which strengthens the finding rather than complicating it: the gap is the **non-finite** class, not `NaN` specifically.

Recorded so the eventual repair does not have to rediscover it, and so that nobody reads `Math.max(0, amount)` as the validation Q49 says is missing. ~~Batch 18 also documented, and did not file, that **overlapping spending stages resolve by array order** -- `applyStage()` never breaks after a match, so the later stage in the array wins, silently, with no validator check on overlap.~~

**CORRECTED (P19-H1). The struck sentence is wrong in two ways, and this session propagated it from the log without testing it.** `applyStage()` does not resolve by array order; it **composes sequentially by MODE**. A `percent` stage **multiplies** the running base; an `amount` stage **replaces** it. So percentages **compound**, and mixed overlaps depend on order. Reproduced against the function extracted from the shipped engine -- age 65, both stages active 60-70, base 100,000, inflation factor 1 -- and matching the audit's figures exactly:

| Stages, in array order | Result |
|---|---:|
| one 120% stage | 120,000 |
| **two 120% stages** | **144,000** |
| amount 80,000, then 120% | 96,000 |
| 120%, then amount 80,000 | 80,000 |

Two percent stages take 100,000 to **144,000**, which disproves "cannot inflate by stacking" directly. **"The later stage wins" is true only of amount-only overlaps**, and that is the scope the claim should always have carried.

**The propagation is the finding, not the arithmetic.** The log recorded a measurement and an explanation; this session repeated the explanation into three shipped documents while independently verifying neither. It is the same defect as the withdrawn two-layer reconstruction, one step earlier in the chain: **a claim adopted from a neighbouring record because it was plausible and adjacent to work that had been checked.** Being in a log this project maintains is not evidence.

No engine change follows from this. Whether overlap should compose, be rejected, or have a defined precedence is a policy question for UI triage, and the corrected record must not be read as licence to change the engine to match either reading.

---

## A dispatch is a representation of the evidence too

Round 22's S6 wording request describes a state the file had already left. `S6_TASK_CHECKLIST.md:345` reads *"three P19-excluded modules carrying eleven excluded finding dispositions"* -- the requested wording, in substance -- and has since `fa43d0d`. The surviving *"eleven P19 exclusions"* strings are both **records of the old wording**, inside dated correction notes; changing either would delete the record of the error rather than the error.

**The request came from our own handover.** Round 21's dispatch, line 48, says *"Line 345, the task heading, is a live claim."* That was true when written and false from `fa43d0d`. The audit read the dispatch rather than the file, and asked for a change already made.

**This is the failure this project has catalogued all week, arriving from the outside and pointing at us.** A claim taken from a representation of the evidence rather than the evidence -- except here **we wrote the representation.** Every dispatch is read as evidence by someone who does not have the tree in front of them, which is exactly what makes it a representation.

### The gap the existing conventions leave

A commit stamp says **when** a figure was true. A register name says **of what**. Neither covers a claim about **another file's current state**, and those are the claims that age fastest -- they stop being true the moment someone fixes the file, which is the outcome the disclosure was trying to produce.

> **A dispatch claim about another file's state must name the revision it was observed at.** *"Line 345 is a live claim at `4c0f4cf`"* tells a reader to re-check before acting. *"Line 345 is a live claim"* does not, and cannot, because nothing in it says it could have expired.

The cost here was two minutes, and only because the dispatch named the exact line. **The same disclosure without a line number would have produced a search of a file that no longer contains the string** -- and, on the sixth check's own logic, an absence that nobody could tell from a mis-patterned search.

### A seventh standing check, from the audit's own methodology

Round 22's P19-H2 makes a point worth more than the finding it settles:

> **Comparing two row totals cannot establish the absence of coordination.** A matching total is consistent with coordination *and* with coincidence, and does not distinguish them.

Generalised: **an instrument whose output is identical under both hypotheses it is being used to choose between has not tested either.** That is the empty-diff problem moved from a gate into a measurement, and it subsumes several of the earlier checks -- an empty diff cannot distinguish "no difference" from "nothing compared"; a probe reading a coordinate where both arms are structurally zero cannot distinguish them either; a control saturated for every strategy cannot rank them.

**Seventh standing check:** *before believing a measurement, ask what its output would be under the hypothesis you are trying to rule out. If the answer is "the same", the measurement is not evidence.*

---

## Q43 repaired, and Q54 found sideways from it

**Q43 -- a debt payment explicitly set to zero is no longer accepted in silence.**
`validateDebt()` warned only on a NEGATIVE payment, so zero -- the literal
out-of-the-box state of every debt added through the UI -- passed clean.
`PAYMENT_BELOW_INTEREST` now fires on an explicit zero against a positive
balance and rate, names the interest it fails to cover, and names the
`payoffAge` consequence when one is set. **It warns; the plan stays valid.**

**The engine is untouched** -- `e3f008ab…8e2e034`, unchanged -- and that is the
point of repairing at the validator: validator output is not part of the
captured result, so this **cannot move the reference baseline**. It also honours
the round-6 constraint that *an uncapped scheduled balloon is not by itself
proof the calculation should be capped*, and that the accepted debt contract
must be defined before any refusal behaviour is. **The defect repaired is the
silence, not the amount.**

**What was verified and what was not**, because the difference is load-bearing.
Reproduced directly: the runaway balance ($20,000 at 20% reaching $866,458 by
age 74) and the validator's silence (`valid: true, issues: []`). **Not**
reproduced here: the portfolio drain. `debtPayments` -- the retirement-funded
field that feeds `requested` -- stayed 0, and a $1,056,551 payoff moved the
ending total by nothing at a $2M portfolio *and* at $300K, which is impossible
if it were funded from the portfolio. The original reproduction used
`golden-scenario-defs` scenario 8 rather than a hand-built plan. **The repair is
justified by what was verified and scoped to it.**

### Q54 -- and the first version of the repair was too broad, which found it

Warning on underpayment *generally* broke two tests, and the reason is a finding
in its own right: **roughly a third of generated corpus debts do not cover their
own interest.** `scenario-generator.js:614` draws `paymentMonthly` from a flat
`d.float(200, 3500)` while `balance` and `rate` are drawn separately, so whether
a debt services its interest is decided by an accident of three independent
draws.

| Batch | Debts | Underpaying | Share |
|---|---:|---:|---:|
| 120 @ seed 1 | 91 | 33 | 36.3% |
| 120 @ seed 1000 | 84 | 31 | 36.9% |
| 120 @ seed 5000 | 98 | 33 | 33.7% |
| 500 @ seed 1 | 345 | 110 | 31.9% |
| 500 @ seed 20000 | 324 | 112 | 34.6% |

Stable, and not a tail -- the median debt covers its interest only 1.4-1.8×, so
the distribution sits near the boundary. The worst case found: **$418,773 at
11.77% paying $224 against $4,107/month**, servicing **5.5%** of its own
interest, with `payoffAge: 77`. **Q43's exact shape, generated rather than
authored, inside the reference corpus.**

**This is not an engine defect** -- `projectDebts()` negative-amortizes these
correctly and deliberately (the B-6 fix). The question is whether the corpus the
rebuild will be judged against should hold a third of its debts in a state
nobody chose.

**And it already distorted a repair.** Q43's check is scoped to an explicit zero
rather than to underpayment generally **because the broader, arithmetically
correct check fires on a third of the reference corpus**. Widening it until the
disagreeing tests went quiet would have been fixing the measurement to match the
instrument; the boundary is instead pinned by a test that asserts a
positive-but-insufficient payment is deliberately **out** of scope.

Any fix to Q54 changes the corpus and therefore **moves the reference baseline**,
so it lands before the S5 task 10 freeze or not at all. Gate **1,380 / 1,372 /
0 fail / 8 todo**.

## Q47, Q48 and Q49 repaired -- and the engine streak ends

Three supplier-reported findings, repaired at **`5d34573`** (Q49) and
**`c9f76ee`** (Q47 and Q48, one commit because `package.json` registers both
witnesses on one line and a split would leave a commit whose gate fails on a
registered file that does not exist yet).

**The byte-identical engine streak ends at `5d34573`.** `e3f008ab…e034` →
`68c8bc9d…b6d2` → `494de216…ad51`. Deliberate and disclosed: Q49 and Q48 each
require a check at the public execution boundary, and that boundary is in
`engine.js`. Neither change can move a corpus result. The Q49 gate returns
`null` on 600 generated plans (1,786 accounts), after a positive control showed
it returns the code on an injected `NaN`; the Q48 gate fires only when
`JSON.stringify` throws on an input `clone()` would have thrown on first. No
corpus capture, Monte Carlo or release campaign was run. Gate **1,417 / 1,409 /
0 fail / 8 todo**.

### Q49 -- validated at both layers, and absence deliberately left alone

`accounts[].contribution` had no explicit check anywhere, and what happened to
an invalid value depended on eligibility: eligible, downstream
`TAX_QUOTE_NONFINITE_CONTEXT`; ineligible, a quiet zero identical to a
legitimate one. Now the validator reports `WRONG_TYPE` and warns
`NEGATIVE_CONTRIBUTION`, and `nonFiniteScenarioInputCode()` returns
`SCENARIO_NONFINITE_CONTRIBUTION` before `clone()`.

**Absence is flagged at neither layer, by decision.** `normalizeAccount()`
backfills `contribution: 0` -- the supported missing-field default Q49's own
entry says to preserve -- and the validator suite already pins that posture for
id/priority/balance. A draft that flagged it as `MISSING_FIELD` broke eleven
validator tests and would have silently added an issue to three more; it was
withdrawn before commit. **Safety of the lenient posture was measured, not
read**: an old saved file without the field restores at 0 through the real
import path, and a `null` is refused and named. The refusal is the control --
without it, "import succeeded" cannot tell a passed check from an unreached one.

**A new rejection code needs its own message branch.** The `runPlan()` ladder
falls through to the cash-holding message, so a new code added without a
branch reports a reason belonging to a different defect. The witness asserts
the message, not only the code.

### Q48 -- three mechanisms, and a repair only the Worker could see was incomplete

`clone()` is `JSON.parse(JSON.stringify(o))`, and `JSON.stringify` throws on a
cycle, a `BigInt` and a throwing `toJSON` -- **the last throws `Error`, not
`TypeError`**, so a guard written for "circular reference" would pass every
cycle test and miss it. `nonSerializableScenarioInputCode()` reads exactly
`clone()`'s three arrays: a cycle on `profile` is never cloned and runs to
`ok`, and stringifying the whole plan would have turned that into an error.

**The first version passed every main-thread test and was incomplete.** The
generated Worker calls `runScenario()`, whose identity hash recursed on the same
cycle and posted `RangeError: Maximum call stack size exceeded` after
`runPlan()` had already rejected correctly. `runScenario()` now returns
`identity: null` for this one rejection, narrowed so no captured fingerprint
changes. **This is why the Worker arm exists**, and it is the RB-01/RB-02 lesson
again: the Worker is an execution path, not a copy of the main thread.

### Q47 -- disclosed, not implemented, with a witness that fails if the disclosure goes stale

Candidate (b): the rules paragraph now says the package does not apply the
earnings test and nothing is withheld, in its two neighbours' form. **The
witness is two-sided.** It reads the paragraph from a scratch build, and it pins
the engine fact the caveat asserts -- a claim at 62 while earning 120,000
changes row `income` by exactly the salary, with a control that the benefit is
paid at all. Implement the earnings test and the engine half fails, forcing the
caveat to be revisited. Candidate (a) remains an engine behaviour change and a
baseline move that needs its own decision.

### Q57 -- found sideways from Q49: a string contribution is concatenated

Building Q49's JSON wrong-type arm found that `contribution: "1000"` deposited
10,000, then 10,005, then **100,010** -- `+=` concatenating, with the deposit set
by the digit count of the increment. The first discriminating run could not
discriminate: a one-year plan has `elapsed` 0 in its only contributing year, so
the increment never entered the arithmetic. Q49 closes `contribution` at both
layers. **`futureChanges[].value` is still live**: an additive `"500"` deposits
**1,000,500** with `status: "ok"`. Validator-defended and UI-coerced, so direct
JavaScript input only -- Q55's profile. Filed OPEN.

### Every witness was run against its unrepaired parent

| Witness | Tests | Fail at parent | Pass at parent, and why that is right |
|---|---:|---:|---|
| Q49 (core) | 16 | 11 | 5: both controls, legitimate values run and validate, the pinned absence decision |
| Q48 | 15 | 11 | 4: the control, the `runScenario()` identity control, the profile-cycle scope pin, the Worker control |
| Q47 | 2 | 1 | 1: the engine half, which pins behaviour rather than the repair |

**The first Q47 run against its parent was invalid and looked like a result.**
It reported `fail 1` and named no test: `tests/lib/harness.js` reads the pinned
artifact at require time, the scratch tree lacked it, and the file died on load.
Standing check 3 at the level of a whole file. A mutation tree must carry the
pinned artifact, and a failure count that names no test is a load error until
shown otherwise.

**And a witness run through that same pinned artifact cannot see a shell
change at all.** `loadCalculator()` boots `investment-calculator-v2c.html`,
which is stale by design, so an import or disclosure test built on it passes
whether or not the change exists. Q47's and Q49's DOM witnesses boot a scratch
build for exactly that reason.

### Residuals, and one coverage claim that was already overstated

- **The historical heat map calls `simulatePlan()` directly**, after its own
  `clone(p)`, and **`simulatePlan` is exported**. Neither path passes
  `runPlan()`'s gates. That is equally true of the pre-existing R2R-001 balance
  gate, whose comment says it covers "every public execution path". A comment's
  coverage claim is a representation of the evidence, not the evidence.
- A cycle outside `clone()`'s three arrays still throws `RangeError` through
  `runScenario()` -- measured, pre-existing, outside Q48's scope.
- A direct `runPlan()` caller that bypasses normalisation and omits
  `contribution` still gets only downstream containment.

### What this does not change

Q44, Q45 and Q54 need decisions, not repairs. **The intended-result contract is
still undefined, and still blocks a closure submission.** The last package cut,
`d17c6a4`, predates all of this: everything since round 21 is unpackaged, and
nothing has been dispatched.

## Correction -- the intended-result contract is not undefined

**The round entry above says the contract "is still undefined". That is wrong,
and so is the history behind it** that this session's handover and scoping
documents carried: that the phrase appears in none of the original registers
and that neither side has ever said what it requires. Both came from searching
for the exact phrase. **The requirement is P5-02's successful-result contract,
under another name.** No dispatch sent the auditor the wrong claim; it lived in
internal documents and in the entry above.

The lineage, from the auditor's own texts:

| Where | What it says |
|---|---|
| Baseline-verdict review (before rev2) | P5-02's tests must *"establish that the accepted shape matches the intended result contract"* |
| Our rev2 dispatch | accepted as a gap: the thirteen required row fields were **measured from stored output** |
| Package 6 | *"Still open … observed output is not an independent specification"*; action: *"Publish the intended result contract and qualify P5-02 closure against it"* |
| Package 8 | *"P5-02's independent intended result contract remains outstanding"* |
| Packages 10–12 | *"Field presence does not establish the independent intended result contract"* |
| Packages 15–19 | carried alongside the S5 task 10 gates |

It has been carried from **package 6**, not package 10. `tests/lib/schema-catalogue.js`
states that it is **derived from live `runPlan()` output** -- the observed shape
the auditor has said does not count.

**What is genuinely unsettled is narrower than "undefined":** whether the
contract covers result shape only or intended values as well, whose intent
defines it, and whether it gates S2 closure or travels with S5 task 10. Those
three are put to the auditor, with a proposed definition, in
`Handover temp/S2_S3_CLOSEOUT_QUESTIONS_20260912.md`.

**The general lesson, already in this ledger under another finding and missed
again here:** a search for the phrase you believe in finds your belief. The
requirement was there in the lineage the whole time, in different words.

## Bounded S2 closeout -- the auditor's conditions, met or carried

The external closeout answers (`Handover temp/S2_S3_CLOSEOUT_ANSWERS_20260912.md`)
accepted **"bounded S2 register closeout, with explicitly carried residuals"**,
with conditions. No full campaign, corpus capture, release suite or fresh
baseline. **The answers define acceptance criteria; they verify nothing that
has not yet been packaged.**

| Condition | Where it is met |
|---|---|
| CQ-1 -- intended-result contract | `RESULT_CONTRACT.md` + `tools/result-contract.{json,js}` + `tests/result-contract.test.js` (`abb9b8d`); P5-02 re-stated against it |
| CQ-2 -- counts derived, not targeted | `S2_CLOSURE_REGISTER.md` counts block, re-derived by `tests/s2-closure-register.test.js` (`2d4b90a`) |
| CQ-3a/3d -- carried work with owners | `S2_CARRIED_WORK_REGISTER.md` (`2d4b90a`) |
| CQ-3b -- Q43 is mitigation | Q43 relabelled in `SPRINT_QUESTIONS.md` and in the registers (`2d4b90a`) |
| CQ-3c -- Q47 characterization, conflicting claim corrected | Q47 heading qualified against `app-shell.html:369`; witness relabelled (`2d4b90a`) |
| CQ-4 -- ST2 gaps deferred, owned; list is bookkeeping | carried register §2; exclusion-registry test comment (`2d4b90a`) |
| CQ-5a -- targeted re-verification | `Handover temp/S2_CQ5A_REVERIFICATION_20260912.md` |
| CQ-6 -- universal claim withdrawn; residuals reproduced | engine comments (`2d4b90a`); `tests/audit-cq6-gate-bypass-residuals.test.js` (`abb9b8d`, `2d4b90a`) |
| CQ-7 -- S3 task dispositions | the table below |
| CQ-8 -- package contents and execution | the next package cut |

**The engine moved again, comments only.** `494de216…ad51` → `34b2ab9a…bc59`
at `2d4b90a`. The claim "comments only" was checked, not assumed: a script
stripped every block comment from both versions and compared the remainder
byte for byte before writing.

### What meeting the conditions found

- **The heat-map path is worse than "skips the gate".** Its JSON `clone(p)`
  turns a non-finite contribution into a **zero** contribution before
  `simulatePlan()` runs, and the cell reports success with a lower balance and
  no flag. A non-finite balance becomes a silently zeroed portfolio. The Q49
  mechanism this ledger once *retracted* for `runPlan()` is real on that path.
- **RB-01 and RB-02 are qualified, not reopened.** Their acceptance named
  *"Import, direct engine, and Worker"*; the exported `simulatePlan()` still
  accepts a duplicate id and an invalid cash holding unflagged. Both are
  `repaired -- scoped`, with reproductions.
- **R2R-001 is not reopened.** Its accepted scope was the quote-entry
  validator (round 2 offered it as one of two alternatives; round 3 passed it
  "for the specified repair scope"), and that validator runs inside
  `simulatePlan()`. The comment had carried the other option's wording.
- **The contract found a real disagreement (C6).** L4b's written rule counts
  insurance in `networth` past `selfLife`; the engine's opening row does not,
  when a plan starts past it. Kept as written, pinned, carried to a product
  decision.
- **Four instruments were wrong first, and each was caught by a control:**
  a residual first written as a `todo` *passed* (the direct path already
  flags a non-finite contribution), so it reproduced nothing; two "long
  horizon" fixtures meant to produce invalid results ran cleanly for 271 rows;
  the register parser counted the fold table as dispositions; and a
  zero-violation contract check was not evidence until every rule had been
  shown to fire on a broken result.

### S3 task dispositions (CQ-7)

"Seven of nine" was this project's own imprecise phrase. S3 has nine tasks,
with task 3 in two parts; **eight landed and one was cancelled**. Three are
matched to commits **by the files they touched**, because those commits are
labelled by their S3 audit item rather than by task number.

| Task (`SPRINT_BRIEF_20260910_S3.md`) | Disposition | Commit |
|---|---|---|
| 1 -- generator coverage | landed | `e6e2c58`, `fcd570b` (both rewrite `tests/lib/scenario-generator.js`) |
| 2 -- baseline captures `runPlan()` with zero exclusions | landed | `edcac90` (corpus exported), `a7b3c6d` (completion), `b6a18f1` (defect in its own test) |
| 3a -- `buildLiveWorkerSource()` fixed and extracted | landed | `edcac90` (creates `tests/lib/worker-source.js`) |
| 3b -- Worker / main-thread parity | landed | `e5ff503` |
| 4 -- near-miss survivor sweep | landed | `a582572` |
| 5 -- the behaviour-preserving refactor | **cancelled** -- folded into the rebuild; no verdict releases it | `S3_CODE_HANDOVER_20260910.md:370` |
| 6 -- `debt-revolving.js` | landed | `628c247` |
| 7 -- mortgage versus investing | landed; module excluded under P19 | `512b50d` |
| 8 -- L4b net-worth identity | landed | `98db985` |
| 9 -- schema catalogue | landed | `e78cb63` |

This does not certify S3's work; the auditor has said as much.

Gate at `2d4b90a`: **1,448 tests / 1,430 pass / 0 fail / 18 todo** -- eight
P19 revival contracts and ten CQ-6 residual reproductions, every one of the
ten failing today.

## Correction -- six carried-work owners were wrong in the dispatched package

The package dispatched for the bounded closeout (`5c79ffe6…9c9b`, cut at
`ec50aa7`) carries an `S2_CARRIED_WORK_REGISTER.md` that names the wrong
owner for **Q53, Q54, ST2-01, ST2-04, ST2-06 and Q56**, and omits the S5b 2b.5
co-owner of Q43-Q45. The owners were found by searching the S5 checklist
only; S4 and S6 already held all six at `ec50aa7`. Reported by another session,
verified against `ec50aa7`, corrected at `4bbbff4` (one file, +12/−10).

**Not re-cut** -- the package was already with the auditor, and its hash is not
changed under a dispatch. A correction note follows it
(`Handover temp/S2_CLOSEOUT_CORRECTION_1_20260912.md`). No disposition, count,
label, witness or result changes; `S2_CLOSURE_REGISTER.md` is untouched.

**The lesson is the one this ledger already holds under "search pattern
encodes the answer", in a new place:** an owner search bounded to the sprint
you expect to own something finds only owners in that sprint. The same
closeout had just corrected an S5-only claim about R2R-001's scope by reading
further back -- and then searched one checklist for owners.

## The bounded closeout verdict -- granted with conditions, and the conditions recorded

The auditor granted **bounded S2 register closeout, with explicitly carried
residuals**, with four conditions and two new residuals
(`Handover temp/S2_BOUNDED_CLOSEOUT_VERDICT_20260913.md`). *"Unconditional
closeout is not granted until these dispositions are recorded."* They were
recorded at `18ab807` by **carrying**, as the verdict allows, not by repairing.

| Condition | Recorded |
|---|---|
| 1 -- P5-02 partially qualified; BC-01 owned by S5 result-contract/conformance work | register label `repaired -- partially qualified` (counts still derived: 45 / 1 / 2 / 11); `RESULT_CONTRACT.md` §7; carried register §3a |
| 2 -- BC-02 added to Q48's residuals | carried register §3; engine comment and Q48 record withdraw "cannot reject a plan `clone()` accepts"; failing `todo` plus control |
| 3 -- Q53 and Q54 given an accountable owner | already met at `4bbbff4` (S4 2b.2e, S4 4.6); noted in the carried register |
| 4 -- the 36 entries conform to the rules actually checked; execution was bounded testing including limited Monte Carlo | `RESULT_CONTRACT.md` §7 and the contract test's title |

Cleanup the verdict asked for: CR2-01's incidental `debt-refinance.js` site
removed; P19-H1/H2 accepted, with the last unqualified "later wins" sentence
struck by its owner at `c18d3c5`; C6's test named a characterization test.

**The engine moved once more, comments only:** `34b2ab9a…bc59` →
`3a0c0455…b4fd`. Gate **1,450 / 1,431 / 0 fail / 19 todo** -- eight revival
contracts, ten CQ-6 residuals, one BC-02 residual, every residual failing today.

### What the verdict found, and why both were misses of the same kind

- **BC-01.** Every rule in the checker had a negative control -- one
  mutation each -- and every control fired. None of them put a non-finite
  value in a *top-level summary*, a zero in a *path count*, or a `null` where
  a *row* belongs. **One control per rule proves the rule can fire; it does
  not prove the rule covers its field.** The claim "the checker is qualified"
  rested on the first while meaning the second.
- **BC-02.** The Q48 comment argued that a pre-serialization cannot reject
  anything `clone()` accepts, because for an array `JSON.stringify` throws
  exactly when `clone()` would. True for data. **False for a callback, which
  is code, and runs once per serialization.** The equivalence was reasoned,
  not measured, and the 16-fixture CQ-5a comparison could not have caught it:
  none of its inputs carried a callback. This ledger already holds the
  general rule under Q48 itself -- a guard written for one case passes that
  case and misses the next.

Both were reproduced before being recorded: BC-02 on both engines (one call
and `ok` on `e3f008ab`; two calls and an uncaught throw on `34b2ab9a`).

### Next

The auditor is told the conditions are recorded
(`Handover temp/S2_CLOSEOUT_CONDITIONS_RECORDED_20260913.md`), alongside the
earlier owner correction. **Repairing BC-01 or BC-02 is not required for S2**;
each has bounded acceptance cases in the verdict if it is scheduled.

## S2 closed -- bounded register closeout, unconditional

**2026-09-13.** The auditor granted **bounded S2 register closeout, unconditional
within the agreed scope** (`Handover temp/S2_CLOSEOUT_FINAL_VERDICT_20260913.md`),
accepting the conditions-recorded note and correction 1 as **addenda to the
audited package**. All four conditions are satisfied. **No re-cut, further
audit round or test rerun is required.**

| What | State |
|---|---|
| Basis of acceptance | the audited package (`5c79ffe6…9c9b`, cut at `ec50aa7`) plus the recorded dispositions (`18ab807`) |
| Supplier-reported, not independently verified | the newer commits, engine hash `3a0c0455…b4fd`, and the 1,450-test gate result |
| Not granted | whole-model financial certification, release approval, a definitive baseline |
| Remains unfixed and owned | BC-01 (S5 result-contract/conformance role, placement pending), BC-02 (S5 2g), and everything in `S2_CARRIED_WORK_REGISTER.md` |
| S3 | no additional gate imposed; task dispositions recorded in this ledger (`ec50aa7`) |

**How it closed, in one line each.** The intended-result contract was not
undefined; it was P5-02's, and naming it let it be answered. Register counts
were derived, not asserted. Every condition was met by **carrying** with an
owner rather than by repairing under time pressure. Six owners and two
qualification claims were wrong in what was dispatched, and each was
corrected in writing before the auditor had to find it.

**What carries forward from this closeout to every later one:** a disposition
is only as strong as the instrument behind it -- one negative control per rule
shows the rule can fire, not that it covers its field (BC-01); and a
reasoned equivalence must be measured on every kind of input it claims,
including the kinds that are code (BC-02).

### Owner change -- BC-01 moves from S5 to S4 2b.4 (2026-09-13)

Recorded after S2 closed; **nothing reopens**. The closeout verdict carried
BC-01 to "the S5 result-contract/conformance work", and the entries above
record it that way, with placement pending. On 2026-09-13, on the S4 plan
audit's finding S4-PA-02, the owner moved it into S4: it is now
`S4_TASK_CHECKLIST.md` **2b.4** (2b.4a-e, committed `a7483f1`), qualified
before E1 because S4 tasks 3 and 7 rely on the checker. The verdict required
an owner, and BC-01 still has one, so no condition is affected. An engine
violation the qualified checker finds becomes a named S5 finding, not a
contract edit (2b.4e). The live owner cells change in the commit that adds
this entry: `S2_CARRIED_WORK_REGISTER.md` §3a, `S2_CLOSURE_REGISTER.md`
P5-02, `RESULT_CONTRACT.md` §7, `FEATURES.md` and the
`tests/result-contract.test.js` header. The entries above are left as
written.

## S4 closed -- the external instrument review signs off, and the owner records the closure

**2026-09-13 (UTC−7).** The bounded external instrument review has signed off
(`Handover temp/S4_INSTRUMENT_FINAL_SIGNOFF_20260914.md`, dated 2026-09-14 UTC,
untracked). Its verdict: **"ACCEPTED within the recorded scope and carry-forward
conditions"**. S4-IR-04-R1 is repaired, and the final reviewer objection is
discharged. The sign-off accepts the measuring instruments and their disclosed
limitations; it is **not** certification that the financial engine is correct.
The owner then recorded S4's closure under the exit gate of `S4_TASK_CHECKLIST.md`,
at `4cc563d` (2026-09-13 17:55 −0700, which is 00:55 UTC on the 14th).
**Nothing in S2 reopens.**

| What | State |
|---|---|
| Reviewed | package `c8d57fcc…7473`, manifest commit `a11dd6d`; all 562 manifest-listed files matched |
| Re-run by the reviewer (Node v24.19.0, Linux) | the nine IR-04-R1 acceptance tests; the review's two-case probe; `node tools/closeout-check.js`, which returned COMPLETE_WITH_CARRY_FORWARD with 62 accepted and 0 refused |
| Supplied by eb, not re-run (Node v24.17.0, Windows) | the release gate, in the checkout at `45abae2` and in the packaged extraction: 1,701 tests, 1,677 pass, 0 fail, 24 todo |
| Run by no one | a financial simulation campaign, a phone benchmark, the historical hazardous L4 replay |
| Not granted | certification that the financial engine is correct |

**Dispositions, with their qualifiers.** Keep the qualifiers whenever the
verdict is repeated.

- S4-IR-01, S4-IR-03, D11 and D14: accepted within the reviewed scope.
- S4-IR-02: accepted for the submitted inventory.
- D12: accepted for the supplied extraction.
- D13: its bounded reporting acceptance is retained; universal detection is
  still limited by S4-IR-05.
- S4-IR-04 and S4-IR-04-R1: accepted repair.
- S4-IR-05: an accepted carry-forward to S5 block 2p; **the defect remains open.**

**Carry-forward conditions still in force:**

1. S4-IR-05 is repaired with bounded diagnostics in S5 block 2p, and its todo
   witness is promoted, before the definitive capture in S5b task 4.
2. The independent guards (S5 block 2r) and their re-check (S5b task 3.4) are
   completed.
3. Second-machine reproducibility is kept as one of S6's preconditions.
4. Device and memory figures stay labelled unmeasured. The rebuilt engine is
   benchmarked (S6 7.3b), and no benchmark page built before `45abae2` is used.

**What this means for S2's carried work.**
- **BC-01 was closed inside S4.** The closing commit is `b471925`
  (`RESULT_CONTRACT.md` version 2), ticked in S4 2b.4 at `16cf460`. That is
  S4's own record. The instrument review later accepted one further checker
  repair, S4-IR-03, within its reviewed scope.
- **The register's live cell changes in the commit that adds this entry.**
  `S2_CARRIED_WORK_REGISTER.md` §3a now says BC-01 is closed. Until this entry,
  that section still listed BC-01's work as open.
- **`S2_CLOSURE_REGISTER.md` is left as the S2 record.** P5-02 was partially
  qualified against contract version 1 when S2 closed, and that stays true.
- **BC-02 remains carried** (S5 2g) and is one of the 62 scheduled items.

**Next.** S5's precondition that S4 is closed is met. S5 runs under its own
checklist and execution authorization, and starting it is the owner's call.

### Correction -- BC-02's S5 block, and two owner cells brought current (2026-09-13)

The S4-closed entry above says "BC-02 remains carried (S5 2g)". **That was
already wrong when it was written.** `7dd8523` (2026-09-12 22:13 −0700) moved
BC-02's repair to S5 block 2m, and the carry-forward schedule the owner reviewed
names 2m. The same commit gave the CQ-6 bypass residuals their own block (2n)
and Q53's production repair its own block (2l). df found this and routed it
here at the owner's request; it was checked against `S5_TASK_CHECKLIST.md` at
`89dc893` before being applied.

The live cells change in the commit that adds this entry:
- **`S2_CARRIED_WORK_REGISTER.md` §1, Q53.** The owner is now split per
  S4-PA-13: S4 2b.2e did the flag inventory, contract and witnesses; S5 2l
  owns the production repair.
- **§3, CQ-6.** The owner is S5 block 2n, replacing "S5, engine input-defence
  ground".
- **`tests/audit-cq6-gate-bypass-residuals.test.js`.**
  - Its owner lines and todo reason strings now name 2n and 2m.
  - Its BC-02 comment no longer calls the callback policy undecided; the
    decision is recorded in S5 2m.1.
- **The exception registry's note** that flagged the stale BC-02 reason is
  updated to match.
- **No test identity changed.** The gate matches todos by identity, not by
  reason text.

The "BC-02 (S5 2g)" in the S2-closed entry was true when written, because it
predates `7dd8523`. Both entries are left as written.

### Five unplaced items registered -- handed over by 0e (2026-09-13)

0e, the session that ran S2 closure rounds 1–5, handed over five items. They
existed only in these ledgers, and nobody has owned them since S2 closed:
- CR2-01's first deliberate non-repair: a transfer is not credited against the
  RMD;
- CR2-01's second deliberate non-repair: the other transfer pairings;
- a counting category for findings closed by another session;
- `seed:1`, a scenario that configures CR2-01's path and never runs it;
- the unreviewed `MAX_TERM_MONTHS` ceiling.

They are now rows U1–U5 in `S2_CARRIED_WORK_REGISTER.md` §7, each marked
**no home** until the owner routes it. **Nothing reopens.** Each was a disclosed
decision or observation, not a new defect. The details are 0e's report. What
was checked at `3c9f846` is only that none of them has a home anywhere else.

### Correction -- U1-U5 routed, all five (2026-09-13)

The entry above says U1-U5 are "each marked no home until the owner routes it."
That was true when written and is no longer true: the owner routed all five the
same day, in `investment-calculator-eb-s5-kickoff`'s chat. The live cells
change in the commit that adds this entry -- `S2_CARRIED_WORK_REGISTER.md`
§7's Owner and Remaining-work columns now carry the decisions:

- **U1** (CR2-01's RMD credit) and **U2** (the other transfer pairings) --
  both to **S103**. U1: credit the transfer against the RMD, matching IRS
  treatment -- deferred rather than done in S5 because crediting it edits
  the reservation mechanism CL-02 built. U2: model the pairings properly
  (real contribution limits, real tax/penalty consequences per pairing) --
  a feature build, not a repair.
- **U3** (the counting category) -- settled as a **standing process rule,
  no sprint home needed**: credit whoever actually discovered and repaired
  a finding first, regardless of whose nominal package/session range it
  fell in.
- **U4** (the dead `seed:1` scenario) -- to **S5**, decided fix-now rather
  than defer: it must be repaired or replaced, with a check that every
  configured corpus path actually executes, before S5b task 4 freezes the
  corpus for good.
- **U5** (the `MAX_TERM_MONTHS` ceiling) -- deferred, no sprint assigned.
  It is pinned and tested, nothing is actively broken; review it whenever
  a later sprint (S103 or S6) has other reason to touch debt-term logic.

The "no home" line in the entry above was true when written, because it
predates this routing. Left as written, per this file's own convention.
