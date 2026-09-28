# S103 — task and subtask checklist

| Field | Value |
|---|---|
| Sprint | **S103** — and realistically the first of several |
| Theme | **Discharge the wiring debt.** Everything built, verified, and unreachable by a user. |
| Runs after | S102 (monthly timestep) |
| Standing rule this sprint exists to satisfy | S6 ground rule 9 — *a module is not done until it is reachable by a user* |

## What this sprint actually is

This is not a feature sprint. **It is the bill for a deliberate exception.**

During the rebuild window, wiring a feature into an engine about to be replaced was work done twice, so it was correctly deferred. That exception expired at cutover. What it left behind is a substantial inventory of code that is built, oracle-verified, tested, bundled — and that no user can reach:

- **The Social Security stack** — all 9 modules, fixture-verified end-to-end against the real Python engine. Unwired by design since Phase 4.
- **Reserve manager, dividend wiring, grading adapter, cash-flow refactor** — C3–C8, ported and partial.
- **The debt modules** — refinance, ARM, recast, revolving. Bundled and reachable from the code; nothing calls them and no UI surfaces any of them.
- **`mortgage-vs-investing.js`** — built in S3, un-bundled by decision register P19 two days later, now carrying a revival contract (`RC-04`) instead of a user.

The S3 audit spent most of its findings on this dead code rather than on the product. Q33 exists *because* a module was bundled but unbound. **That is the cost, and it is why the standing rule changed.**

## Scope honesty

**This is more than one sprint's work.** Track C2–9 alone was estimated at 13–23 days. Task 1 exists to size the rest, and the close-out is expected to hand off a sequence, not a completion.

## Preconditions

- [ ] S102 is closed; the engine steps monthly and reports annually
- [ ] The **entity registry** from S6 task 4b exists — task 7 below is its first real consumer
- [ ] The **sweep API contract** from S6 task 6.10 is decided — task 8 below is its first implementation
- [ ] Phases declare their input dependencies per S6 task 3.9 — task 9 depends on it
- [ ] `npm test` exits 0

## Tasks

### 1. Inventory the wiring debt, and measure it

**First, because nobody currently knows the size of this.**

- [ ] 1.1 Enumerate every module in `src/` and `src/ported/` and classify: **reachable by a user** / **called by the engine but not surfaced** / **bundled but never called** / **not bundled**
- [ ] 1.2 For each unreachable one, record what wiring it needs: an engine call site, a UI surface, a validator rule, a schema field, a migration — or several
- [ ] 1.3 Record the test coverage each already has, so wiring does not re-litigate verified behaviour
- [ ] 1.4 **Publish the count.** It is the sprint's most useful output and it sizes everything below
- [ ] 1.5 Sequence the remainder into S104+ from that count
- [ ] 1.6 **Reconcile against what was deferred *to* this sprint, not only against what is unwired.** *(Added 2026-09-12, and the reason is that three deferrals had already been missed this way. Corrected 2026-09-13, on a report from `investment-calculator-84`: a fourth landed the same way the same day — see task 13, added below. Corrected again 2026-09-14, on a report from `investment-calculator-4c`: a fifth — itemization, task 14, deferred by S5's own task 13 and task 2e.3 to "the sprint that builds itemization", which was here all along and had no task naming it either. "Three" below is preserved as it stood on 2026-09-12; read it as history, not a current count.)*

  Withholding, the capital-gain character buckets and the Arizona property-tax model were each deferred here **by name** — and until 2026-09-12 this sprint had no task for any of them. Nobody wrote the wrong thing. **This sprint's task list was written from its theme** — *discharge the wiring debt* — **and all three are tax or market model builds rather than wiring.** The deferrals said "S103" and S103 never looked.

  That is **Q42's shape one level down**: work that goes unworked because it carries a label nothing reconciles against. Q42's fix was to cross-reference audit ID spaces; the same fix applies to sprint deferrals.

  - [ ] Grep every earlier checklist for `S103` and confirm each hit has a task here. Tasks 9, 10 and 11 came from exactly that sweep
  - [ ] Do the same for **S104+** as this sprint hands work forward — a deferral is not delivered until the receiving sprint has a task
  - [ ] **A deferral whose destination sprint has a different theme is the risky kind.** Record it in the destination as well as the origin, because the origin is not read again

**Gate:** every module classified; the sequence for the rest is written down.

### 2. Social Security stack — wire C2

- [ ] 2.1 Wire the 9 ported modules into the live engine
- [ ] 2.2 **The adapter precondition, recorded long ago and still live:** `buildSocialSecurityPlanningState` converts age via `Math.trunc(age)*12`. Passing this calculator's half-year convention (62.5) straight in **silently loses 6 months**. Not a bug in the port — correct against its own integer-age contract — but a real precondition
- [ ] 2.3 MFJ extension — no Python reference exists, so this is new design rather than a port
- [ ] 2.4 Surface it: a user must be able to see and change what the stack computes
- [ ] 2.5 Reconcile against the existing simpler SS path — two implementations must not both be live

**Gate:** a user can reach it; the half-year conversion is asserted by a test; only one SS implementation is live.

### 3. Reserve manager, dividends, grading, cash-flow — C3/C4/C5/C8

- [ ] 3.1 Reserve adapter (C3) — note the pre-tax/HSA gap is not modelled upstream
- [ ] 3.2 Dividend wiring (C4) — coordinate with S5b task 1's dividend-safe accounting so total-return and cash-dividend modes still cannot double-credit
- [ ] 3.3 Grading adapter (C5) — `src/ported/effectiveness-grader.js`, deferred by its own file comments as "Phase 9" work
- [ ] 3.4 Cash-flow refactor (C8)
- [ ] 3.5 Each gets a UI surface in the same task, per ground rule 9

**Gate:** each is reachable; none duplicates an existing live path.

### 4. Debt modules — wire and surface

- [ ] 4.1 Wire `debt-revolving.js` into `projectDebts()`. This is a **correctness** gap, not a feature: `DEBT_TYPES` offers `creditCard` at 20% while `projectDebts()` amortizes it like a term loan. An $8,000 card at 22% with a 2% minimum does not retire inside a 600-month cap, having charged $55,653, while the amortizing model claims 137 months and $13,912
- [ ] 4.2 **Wiring revolving is what makes Q33 bite** — the Worker has the code and no binding. If S5 task 1 closed the registry duplication, verify it here; if anything regressed, this is where it surfaces
- [ ] 4.3 Surface refinance, ARM, recast and revolving in the UI — the first time any of this becomes visible
- [ ] 4.4 The `armRecastOnReset` toggle, and the decision on flipping its default now that the audit has cleared
- [ ] 4.5 Replacing the live single-step ARM with `debt-arm.js`'s real index+margin+caps model needs six or more new debt fields, validator rules, UI and migration — **this remains a watched-session change**, not an unattended one

**Gate:** a user can see every debt module's output; the credit-card inaccuracy is fixed rather than merely measured.

### 5. `mortgage-vs-investing.js` — revive or retire

- [ ] 5.1 P19 un-bundled it as unsupported. `RC-04` in `tests/audit-rc-findings.test.js` is its **revival contract** and must go green before the module may ship again
- [ ] 5.2 The contract names the actual defect: the adapter reported `monthsUntilDebtFree = 1200` for a debt whose principal never falls — that is `simulateDebtPayoff()`'s safety cap relabelled as a payoff month. **Keep months simulated separate from payoff month, and return a null payoff with the residual principal**
- [ ] 5.3 Fix it, then re-bundle, then surface the 5×4 method-by-objective matrix
- [ ] 5.4 The deduction-treatment decision it has been waiting on — **user decision**
- [ ] 5.5 If it is not going to be revived, **retire it properly** rather than leaving a revival contract nobody intends to satisfy

**Gate:** `RC-04` green and the module shipped, or the module deleted and the contract retired. Not a third state.

### 6. Track G — dependency-aware recalculation and live sliders

**The first consumer of S6 task 3.9's incremental-recompute design.**

- [ ] 6.1 Classify inputs so unrelated changes skip recompute
- [ ] 6.2 Tiered debounce: 0 ms UI-only → 300 ms simulation → explicit Run for the largest tiers
- [ ] 6.3 Use the phase dependency declarations — a changed input invalidates a known set of phases; everything upstream is reused
- [ ] 6.4 Live what-if sliders, which is what the whole mechanism was for
- [ ] 6.5 Target: INP ≤ 200 ms at p75
- [ ] 6.6 **If phases did not end up declaring their reads, this task is blocked and that is a finding about the rebuild.** Record it rather than working around it

**Gate:** a slider moves and only the affected phases recompute, demonstrated by measurement rather than asserted.

### 7. The five queued account types — as declarations

**The acceptance test for S6's entity registry.** **Routed here 2026-09-14, night (the owner), answer 1 (A):** S5 task 5's inherited/SEP/SIMPLE IRA spec vectors (ACCOUNT §17 Tests 5, 6, 7 and 10) went `UNSUPPORTED` in S5 for exactly the reason this task exists — the engine has no per-account-type declaration yet. Satisfy them here, alongside `S6_TASK_CHECKLIST.md` task 4b.1's per-plan RMD (§18 #8) and 415(c) (Test 8) vectors, once the registry exists.

- [ ] 7.1 403(b), 457(b), SEP-IRA, SIMPLE IRA, inherited IRA
- [ ] 7.2 Each has genuinely different rules — 457(b) has no early-withdrawal penalty; inherited IRAs run a 10-year clock with their own RMD treatment; SIMPLE carries a two-year penalty cliff; SEP has employer-only contributions
- [ ] 7.3 **Add each as a declaration and confirm no engine site needed editing.** If an engine edit is required, the registry is incomplete and *that* is the finding — record it rather than editing the site quietly
- [ ] 7.4 Validator rules, schema fields and migration for each
- [ ] 7.5 UI surface, per ground rule 9

**Gate:** five new types, zero engine edits. Anything else means the registry did not achieve what it was built for.

### 8. The first sweep feature — and the shared layer it must implement

**S6 task 6.10 decided the contract and deliberately did not build it. This is where it gets built, by its first consumer.**

- [ ] 8.1 Pick the first: the **Social Security claiming optimizer** is the natural candidate — the search space is bounded (97 claim months each, 9,409 couple combinations), the objective is well-behaved enough for coarse-to-fine search, and the SS stack is being wired in task 2 anyway
- [ ] 8.2 Implement it **through** the shared contract, not beside it — parameter space in, ranked evaluations out
- [ ] 8.3 Seeding, path count, early termination and cancellation handled **once**, in the layer
- [ ] 8.4 Honour S6 task 6.11: the same parameter point evaluated twice returns the same answer, and the common-random-numbers decision is explicit
- [ ] 8.5 **Do not brute-force with full Monte Carlo per cell.** 9,409 combinations × 1,000 paths is ~12.5 minutes. Search deterministically or on a small path sample, then run full Monte Carlo on the top handful — roughly 0.8 s, and it is standard practice
- [ ] 8.6 Record which of the other five features the layer is expected to carry, and what each would need

**Gate:** the optimizer works, and a second sweep feature could be added without touching its internals.

### 9. Withholding, liability, payments and funding cash — **the deferral nobody received**

**Added 2026-09-12. Deferred here by name from the old S4 task 6, cut 2026-09-10 — and this sprint had no task for it until now.**

The full specification is preserved in `S5_TASK_CHECKLIST.md`'s deferred appendix with its original gate. It was cut on the wrong-answer-versus-not-modelled test: `withhold`, `estimatedPayment`, `safeHarbor` and `refundable` have **zero occurrences**, so withholding is not modelled at all, there is no wrong answer for the differential diff to certify, and implementing it in an engine about to be replaced means implementing it twice.

**That reasoning was right, and the deferral still went nowhere.** See task 1.6 below for why.

- [ ] 9.1 Model `gross_distribution`, `tax_withheld`, `net_cash_received` separately (`TAX §7.1`)
- [ ] 9.2 Add `total_tax_liability` versus `net_tax_payment_cash`
- [ ] 9.3 Withholding reduces the balance due but is **not** an additional tax cost
- [ ] 9.4 Guard the double-subtraction: if withholding was already netted from gross receipts it must not be subtracted from spendable cash a second time
- [ ] 9.5 For IRA and pension payments, the withheld amount is part of the gross distribution and is included in determining the taxable amount
- [ ] 9.6 Satisfy the vectors S5 task 5 recorded as `UNSUPPORTED` (retired from `UNREPRESENTABLE`, S5 task 4.3) — they were filed there precisely so the new engine would have them
- [ ] 9.7 **Q40, decided 2026-09-13 (the owner): Monte Carlo carries one real run's whole debt breakdown at each percentile of the total.** Built here, with the cash ledger, because the ledger inherits the choice. It reconciles, and it is labelled a sample, not a quantile, with deterministic tie handling. Until it lands, Monte Carlo rows carry no breakdown (`MODEL_ASSUMPTIONS.md` §6, `SPRINT_QUESTIONS.md` Q40)

**Gate:** a test asserting that introducing withholding at a constant liability leaves total tax unchanged and moves only the timing of cash. `tests/reconciliation-invariant.test.js` stays green — this is the task most likely to break the net-worth identity.

### 10. Capital-gain character buckets — **the second unreceived deferral**

**Deferred here from the old S4 task 7, trimmed 2026-09-10 on the same test.** `unrecaptured` and `section1202` have **zero occurrences**; nothing is modelled, so nothing was certified wrong.

- [ ] 10.1 Implement the `TAX §2.2` character buckets — unrecaptured §1250, §1202, collectibles — as separate concepts from the ordinary/qualified split
- [ ] 10.2 Satisfy the `TAX §2.2` vectors S5 task 5 recorded as `UNSUPPORTED` (retired from `UNREPRESENTABLE`, S5 task 4.3)
- [ ] 10.3 **The trap, recorded when the deferral was taken:** `app-shell.html:470` carries `collectibles` as an **asset-type label**, an unrelated concept. Re-locate by symbol. A name collision between an asset type and a gain bucket is exactly how the two get conflated by whoever builds this
- [ ] 10.4 Check the `TAX §10.2` escalation flags: collectibles, unrecaptured §1250 and §1202 are **named categories that must raise a visible flag**. If this task lands the buckets, several of S5b task 2b's "silently approximates" entries close with it — reconcile the two lists rather than leaving both open

**Gate:** the `TAX §2.2` vectors pass; the `app-shell.html` label collision is resolved or explicitly documented; S5b task 2b's inventory is updated for whatever this closes.

### 11. The Arizona property-tax model — **the third unreceived deferral**

**Deferred here from the old S5 task 9 (now S5b task 2), cut 2026-09-10.** S5b keeps only the honesty corrections — a national effective rate labelled as a rough fallback, the LPV claim corrected, the 1% limit documented as a known gap. The model itself is a feature build.

`MARKET §1` decision 9 asks for **assessed value, exemptions, levies, caps, overrides and special districts as separate concepts** — none of which exists today: `LPV`, `assessedValue` and `assessed` have zero occurrences and there is a flat rate input and nothing else.

- [ ] 11.1 Model the six concepts separately rather than as one effective rate
- [ ] 11.2 Implement the 1% constitutional limit and its exceptions, from the citation S5b task 2 recorded so the figures would not need re-researching
- [ ] 11.3 The Arizona LPV "no reset at sale" rule **has statutory exceptions** — the corrected claim from S5b, now load-bearing rather than a doc fix
- [ ] 11.4 `MARKET` P0 #4's exit condition moves with this task and is satisfied here, not in S5b

**Gate:** `MARKET` P0 #4's exit condition met; a projection can distinguish a levy change from a valuation change.

### 12. PMI is charged for the life of the loan and never cancels — **from `SIMULATION_LOG.md` Batch 11**

**Added 2026-09-12 from a sprint-planning read of the simulation log. The log flagged it deliberately and routed it nowhere:** *"Not written up as a Q entry — flagging here for whoever next touches the housing-cost modeling to decide if it's in scope."* This task is that decision, taken rather than deferred again.

**Measured, not inferred.** Batch 11 scenario 6 traced `debtHousing` across the full 20-year payoff of a mortgage starting at exactly 80% LTV. The **$2,160/yr PMI charge is perfectly flat from age 46 through age 65**, dropping to `$0` only the year *after* the loan is fully repaid.

**Real mortgages cancel PMI automatically** once the balance reaches 78–80% LTV under the **Homeowners Protection Act** — typically many years before payoff. The model has no such logic: PMI is a flat cost for the entire life of any loan with a nonzero `pmiMonthly` and `balance > 0`.

**It is not a crash and not a reconciliation break** — Batch 11 confirmed 0 mismatches. It is a modelling simplification that makes **any long mortgage with PMI look more expensive than reality**, for however many years PMI would actually have been cancelled. The error direction is conservative for the household, which is why nothing else caught it.

- [ ] 12.1 Implement automatic PMI cancellation at the statutory LTV threshold, against the original property value per the Act — **not** against a current estimate, which is a different rule
- [ ] 12.2 Distinguish **automatic termination** (78% LTV, lender-initiated) from **borrower-requested cancellation** (80%, on request) — they have different trigger points and the model needs to say which it implements
- [ ] 12.3 Decide whether the midpoint-of-amortization rule applies, since it terminates PMI regardless of LTV
- [ ] 12.4 Predict the movement: **every scenario carrying a nonzero `pmiMonthly` gets cheaper**, by a predictable amount and from a predictable year. An unpredicted movement, or a scenario getting *more* expensive, is a finding
- [ ] 12.5 **Sequence with task 11.** Both are housing-cost modelling and both change `debtHousing`; landing them separately gives each its own attributable fixture movement

**Gate:** PMI terminates at the modelled threshold rather than at payoff; the rule implemented is named; the fixture movement is predicted and one-directional.

### 13. The calibrated correlation matrix (Q45) — **the fourth unreceived deferral, added 2026-09-13**

**Added 2026-09-13, on a report from `investment-calculator-84` that found task 1.6's own sweep, written 2026-09-12, missed this deferral because it was decided the day after.** Deferred here by name from `S5_TASK_CHECKLIST.md` block 2d.3 (Task 00 item 4): *"(d), defer to a calibrated matrix. Explicitly a feature build (`MARKET` P1), routed to S103 rather than closed in S5."*

`accountVolatility()` (`src/engine.js`, re-locate by symbol) models cross-asset correlation as **one scalar on every off-diagonal pair** — an equicorrelation matrix, positive semidefinite only above a floor that rises toward zero as asset classes are added. Below the floor, `Math.max(0, variance)` silently clamps a mathematically invalid input to a plausible-looking zero-volatility result; between the floor and the point variance actually goes negative, the engine returns a finite, plausible wrong answer with no flag at all. Full measurement in `SPRINT_QUESTIONS.md` Q45.

**Not fixed for the life of the old engine, by decision.** `Math.max(0, variance)` stays the only guard until this task lands — that was 2d.3's explicit trade-off, not an oversight. **Separately, S5b task 2b.5 routes Q45 through the "flag, don't guess" mechanism as an interim disclosure** (a visible warning on an invalid-correlation input) — that is a milder, independent action and does not substitute for this task; do not read 2b.5 landing as having closed this deferral.

- [ ] 13.1 Replace equicorrelation with a real calibrated multi-asset correlation matrix — positive semidefinite by construction, not merely validated after the fact
- [ ] 13.2 Satisfy the `MARKET` P1 vectors `S5_TASK_CHECKLIST.md` task 5.10 recorded as `UNSUPPORTED` (retired from `UNREPRESENTABLE`, S5 task 4.3)
- [ ] 13.3 Retire `Math.max(0, variance)`'s silent clamp once the matrix that made it necessary is gone — a guard kept past the defect it guarded is a defect of its own
- [ ] 13.4 Predict the movement: any scenario with a real (non-equicorrelation-equivalent) cross-asset structure gets a different modelled volatility. An unpredicted movement elsewhere is a finding

**Gate:** the `MARKET` P1 vectors pass; the equicorrelation clamp is gone; the movement is predicted and scoped to scenarios with genuine cross-asset correlation structure.

### 14. Itemization — the SALT cap, mortgage-interest deduction, and three fields S5 declared inert pending it — **the fifth unreceived deferral**

**Added 2026-09-14, on a report from `investment-calculator-4c`, the owner's answer (a) to Proposal 10.** S5 task 13 could not build the federal SALT cap — the engine has no itemize-versus-standard election, so a cap has nothing to cap — and deferred it here "to the sprint that builds itemization". S5 task 2e.3 separately declared `debt.taxDeductible` inert-by-design for the same reason: a mortgage-interest deduction is itself an itemization path. Both deferrals said "wherever itemization gets built"; this is that task, receiving both by name — the same reconciliation discipline S103 task 1.6 applies to every deferral aimed at this sprint.

- [ ] 14.1 Build a minimal itemize-versus-standard election: compute itemized deductions, compare to the standard deduction, apply whichever is larger — the precondition every field below needs
- [ ] 14.2 The federal SALT cap, with the parameters S5 task 13 already recorded so they don't need re-researching: 2026 cap $40,400, MAGI phaseout from $505,000, $10,000 floor. `F-SALT-01` (skipped at S5 task 13.2, with citation) expects an MFJ cap of $25,400 at SALT MAGI $555,000 — land it un-skipped here
- [ ] 14.3 Mortgage-interest deduction — `debt.taxDeductible` (S5 task 2e, declared inert-by-design with a forward pointer here) asserts that deductibility is modelled; implement it against the itemize path this task builds
- [ ] 14.4 `expenses[].kind` (`'expense'` vs `'withdrawal'`) and `debt.owner` (`'self'` vs `'spouse'`) — S5 task 2e's other two inert fields, routed here by the same decision as `debt.taxDeductible`. Implement, per that decision, rather than remove or leave inert
- [ ] 14.5 Reconcile against S5b task 2b's disclosure contract: if this task closes any of the "silently approximates" entries that contract inventoried, update its count rather than leaving both records to drift apart

**Gate:** the itemize-versus-standard election is real and tested; the SALT cap enforces at the recorded parameters with `F-SALT-01` passing; the three S5-declared-inert fields do what their field names claim.

### 15. Account-rules vectors S5 task 5 found no home for — traditional-IRA phaseout, after-tax 401(k)/415(c), HSA months, 529, NUA

**Added 2026-09-14, on the owner's decision (night, answer 1 (A)).** S5 task 5 imported and categorised the `ACCOUNT` spec vectors against the live engine (landed at `9202941`); of its 15 `UNSUPPORTED` results, five closed in S5 itself and four (Tests 5, 6, 7, 10 — inherited/SEP/SIMPLE IRA) route with S103 task 7 / S6 task 4b.1 above. **The remaining six route here:**

- [ ] 15.1 `ACCOUNT §17` Test 1 — the traditional-IRA deduction phaseout (active-participant MAGI limits)
- [ ] 15.2 `ACCOUNT §17` Test 9 — after-tax 401(k) contributions and the combined §415(c) annual-additions limit (employee + employer + after-tax, across the whole limit, not just the elective-deferral piece S5 task 11 covers)
- [ ] 15.3 `ACCOUNT §17` Test 11 — HSA eligibility measured in months, not a flat annual figure
- [ ] 15.4 `ACCOUNT §17` Test 12 — 529 plan contribution and distribution rules
- [ ] 15.5 `ACCOUNT §17` Test 13 — Net Unrealized Appreciation (NUA) treatment on employer-stock distributions
- [ ] 15.6 `ACCOUNT §17` Test 15 and `§18` #1–#4, #7, #11, #12, #14 — the remaining named invariants these six vectors imply, enumerated from the spec document rather than assumed from the vector list alone
- [ ] 15.7 `ACCOUNT §17` Test 7 — Form 8606 basis tracking and the pro-rata rule for partially-deductible traditional IRAs (backdoor Roth conversions read this)

**Gate:** all six vectors and their named invariants pass; each cites its `ACCOUNT` section and test number in the implementing commit.

**Precondition, added 2026-09-16 on a report from `investment-calculator-4c`/S5 Kickoff.** Today the engine has exactly one workplace-account type: `401(k)`. A 403(b) or governmental 457(b) plan is entered as a `401(k)` — there is no distinct account type for either, so nothing here can assume one exists without also building it. 15.2's §415(c) work and 15.6's remaining invariants should each confirm, before assuming a per-type field, whether the vector genuinely needs 403(b)/457(b) told apart from 401(k) or whether the shared-limit treatment (`ACCOUNT_RULES_ENGINE_REFERENCE_2026.md`'s own §402(g) note: 401(k)/403(b) share one aggregate, governmental 457(b) is separate) already covers it without a new type.

## Ground rules

Carried, plus the one this sprint exists for:

1. Every task states its own gate.
2. Per-task durations are floors, not targets.
3. No task may weaken an existing test to pass.
4. Commit per task.
5. Record findings rather than fix them where a fix requires a policy judgment.
6. **A module is not done until it is reachable by a user.** The rebuild-window exception has expired. Anything this sprint builds, it wires.

## Stopping points

- [ ] Task 1's inventory is materially larger than expected — re-sequence rather than pushing through
- [ ] Task 7 requires an engine edit to add an account type — the entity registry is incomplete
- [ ] Task 6 finds that phases do not declare their reads — incremental recompute is foreclosed and that is a rebuild finding
- [ ] Task 5 cannot make `RC-04` green — decide revive-or-retire rather than leaving it in limbo

## Exit gate — what must be **true**, not merely **reported**

**Added 2026-09-12.** Six of the eight sprints had a close-out and no exit gate, and they are not the same document: **the close-out reports; the exit gate decides.** Every downstream precondition that reads *"S<prev> is closed"* resolved to whatever the closer said it meant. **A checklist that lists gates is not a checklist that collects them.**

**Common clauses, applying to every line below.** Each item **names its evidence and the commit it was true at** (S4 §N's stamping convention). `npm test` exit 0 is **recorded, not assumed**. **A no-go must name what is missing and what it blocks** — a verdict that can only say yes is 6.8's vacuous pass in another costume. The verdict is the user's, on a stated recommendation. **A line that cannot be made true is not a reason to soften it:** record it, say what it blocks, hand it forward. An exit gate relaxed to let a sprint close converts a known gap into an unknown one.

### This sprint is closed when every line below is true

**Nothing downstream reads this sprint, so its gate faces release rather than a successor — but it has a job the other four do not.**

- [ ] **E1. Every feature named reachable is reachable BY A USER through the shipped artifact, DEMONSTRATED rather than asserted.** That is S6 ground rule 9's whole point and this is the sprint that discharges it
- [ ] **E2. Nothing was wired that has no test**
- [ ] **E3. The artifact hash moved, and the move is accounted for.** A wiring sprint that does not change the artifact has not wired anything
- [ ] **E4. Anything left unreachable is listed BY NAME with why**, and sequenced into S104+ per task 1.5
- [ ] **E5. Subtask 1.6's deferral reconciliation ran** — every earlier checklist grepped for `S103`, every hit having a task here, and the same done forward for S104+
- [ ] **E6. THE THREE S6 DESIGN DECISIONS GET A VERDICT FROM REALITY**, and this is the line worth defending hardest if only one survives. This sprint is the **first real consumer** of the entity registry (S6 task 4b), the sweep API contract (6.10) and phase-declared input dependencies (3.9). Report back on each: **did the design survive its first consumer, and if not, what did it get wrong.**

  **A design decision that has never been used is an opinion.** S103 is where three of them stop being opinions, and that result currently has nowhere to go. **Every other gate in this plan collects evidence that already exists; this one generates evidence nobody else can.**
- [ ] **E7. Every USER DECISION answered or owned**

## Close-out

- [ ] 1. The wiring-debt inventory and its count
- [ ] 2. The sequence for S104+
- [ ] 3. Whether the entity registry held (task 7's zero-engine-edit test)
- [ ] 4. Whether the sweep layer held (task 8's second-consumer test)
- [ ] 5. Whether incremental recompute was actually available (task 6)
- [ ] 6. `FEATURES.md` — this sprint completes several genuinely user-recognisable features, so its update trigger fires hard
- [ ] 7. `MODEL_ASSUMPTIONS.md` for any new user-facing choice
- [ ] 8. **Ask the user: whole-model or new-code-only.**
