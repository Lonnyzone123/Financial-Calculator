# Sprint questions — judgment calls made without stopping

Created per `SPRINT_BRIEF_20260909.md` ("Override for this sprint: don't stall
on judgment calls"). Each entry is a genuine policy fork that the roadmap's
normal ground rule 8 would have escalated as "needs a human decision," but
which was instead decided by the most conservative reading of the locked
decisions in `ROADMAP_EXTERNAL_REVIEW.md` §1 and of existing patterns in
`src/`, then implemented and recorded here.

**Each entry names the file and line so the task can be rewritten if the
choice is disagreed with.** Nothing here is closed; this is a review queue.

---

## 2026-09-09 — Q1. Which balance counts as "start-of-period known state" for the decision clock?

**Task:** 1 (decision clock, R2-T07).

**The fork.** ROADMAP §1 locks "start-of-period known state only — no
lookahead," but does not say *where* the period's start is, and
`simulatePlan()` performs several distinct cash movements between the top of
a period and the spending decision:

| # | Movement | Known at the decision? |
|---|---|---|
| 1 | account contributions + employer match | yes — user-configured |
| 2 | `transferOn` account-to-account transfer | yes — user-configured |
| 3 | `conversionOn` Roth conversion | yes — user-configured, net zero to the total |
| 4 | `growAccounts(accounts, rates, preGrowth)` — the period's realized market return | **no** |
| 5 | `dividendCash = takeCashFromClass(...)`, sized off the **post-growth** taxable balance | **partly** — the rate is configured, but the base is post-growth |

Movements 1–3 are unambiguously known; movement 4 is unambiguously not. The
fork is movement 5.

**Chosen option.** The decision base is `portfolioBeforeGrowth` — the total
after movements 1–3 and before movements 4 and 5. Dividend cash is therefore
**not** subtracted from the balance the spending decision is computed against.

**Why.** Dividend cash is sized off the post-growth taxable balance, so
subtracting it would re-admit exactly the information the locked decision
excludes, just laundered through a second variable. Choosing the pre-growth
snapshot is the only option that keeps the boundary a single, checkable line
in the source. It also required no new variable: `portfolioBeforeGrowth` was
already captured one statement above `growAccounts()` for the `rates`
computation, so the information boundary is now stated by a name rather than
implied by line position — which is why this bug resurfaced twice.

**Note on the direction of the change.** This is conservative on
*information*, not uniformly conservative on *dollars*. In a down period the
pre-growth base is higher than the post-growth base, so `constantPercent`
now spends slightly more than it used to in bad years (and less in good
years). That is the intended consequence of removing lookahead — a plan
should not get to cut spending using a market outcome it cannot yet have
seen — but it is a real behavioral change and is flagged here explicitly.

**Not affected, verified rather than assumed.** `rmdFor(accounts, age, p,
openingPreTax)` already uses `openingPreTax`, captured at the very top of
the loop iteration before *any* of movements 1–5. That is both leak-free and
the legally correct prior-year-end RMD basis; it was left alone.

**Where:** `src/engine.js:746` (the `retireBalance` latch) and
`src/engine.js:750` (the `strategySpending()` call site — both the `balance`
argument and the null-anchor fallback). Evidence:
`tests/audit-decision-clock-lookahead.test.js`.

---

## 2026-09-09 — Q2. "The account it was synthesized from" — which one, and inherit the allocation or the realized rate?

**Task:** 2 (synthetic RMD-cash holding, R2-T06 / HR-02).

**The fork.** ROADMAP §1 says the holding "inherits the exact allocation/growth
treatment of the account it was synthesized from," but the referent is not
stated and three sub-questions had to be answered to implement it.

### Q2a — which account is the source?

Two readings. The holding is a **taxable** destination, but it is synthesized
*only when no taxable account exists*, so "the taxable account it stands in
for" has no referent by construction. The only reading that names a real
account is **the pre-tax account the RMD proceeds were actually drawn out
of**. Chosen.

### Q2b — the RMD can drain several pre-tax accounts. Which is "the" source?

**Chosen: the first account `withdrawFromClass()` actually drains**, i.e. the
engine's own existing draw order for that class (`optimizedAccountScore` when
`withdrawalOrder === "optimized"`, otherwise `priority`).

**Why.** The alternative — largest contributor by dollars — is arguably more
defensible financially, but it is a *new* ordering rule invented for this one
site. Reusing the engine's existing ordering adds no policy, and it matches
`retainExcessRmdCash()`'s own established `sort(...)[0]` pattern for picking
the destination. `withdrawFromClass()` now reports its draw order via an
additive `sources` field rather than having the sort duplicated at the call
site, so the two can never drift apart.

### Q2c — inherit the source's *allocation*, or its *realized rate*?

**Chosen: both, at their respective layers.** The synthesized account carries
a **copy** of the source's `allocation` (so every *later* period derives its
own return and volatility exactly as the source does), and for the **creation
period only** it is registered with the source account's own already-drawn
rate rather than a freshly computed one.

**Why not recompute.** Under Monte Carlo, `accountReturnForPeriod()` calls
`normal(random)`, which consumes two draws. Recomputing would shift the RNG
stream for every subsequent period of any run that touches this path —
silently moving results in scenarios that have nothing to do with RMDs. That
is a much larger blast radius than the defect being fixed. Reusing the
realized rate is also the more literal reading of "the **exact** growth
treatment of the account it was synthesized from."

**Known divergence this creates — flagged, not hidden.** When
`advanced.reserveOn` is set, `accountReturnForPeriod()` blends in a 3% reserve
return whose weight depends on *that account's own balance*
(`reserve = Math.min(ac.balance, spending * reserveYears)`). Inheriting the
source's realized rate therefore inherits a blend computed from the *source
account's* balance, not from the holding's much smaller one. A same-allocation
explicit destination would get a slightly different blend. This is a genuine,
bounded inconsistency in the `reserveOn` case only; the equivalence test in
`tests/audit-r2-rmd-holding.test.js` runs with `reserveOn: false`. If the
reviewer prefers exact equivalence under `reserveOn` over RNG-stream
stability, this is the sub-decision to reverse.

**Unreachable-branch note.** If there is no source account there is no RMD and
therefore no retained cash, so the no-source branch cannot be reached. It
deliberately leaves the rate *absent* (preserving the old skip) rather than
substituting the plan-wide fallback rate — that fallback is precisely the
bespoke policy HR-02 forbids.

**Where:** `src/engine.js:564` (`withdrawFromClass`, additive `sources`),
`src/engine.js:606-612` (`retainExcessRmdCash` signature + allocation
inheritance), `src/engine.js:781` (source capture) and `src/engine.js:868-897`
(creation-period rate registration). Evidence:
`tests/audit-r2-rmd-holding.test.js`.

---

## 2026-09-09 — Q3. Two micro-forks inside R2-T03 (both narrow, both deliberate)

**Task:** 3 (SS eligibility + COLA isolation, R2-T03 / R2-003 / R2-004).

Most of R2-T03's fix boundary was explicitly specified by the audit, and the
acceptance numbers ($12,480 both ways; $36,000 both-claimed; zero for the
age-50 case) pinned the design. Two sub-decisions were not specified.

### Q3a — a person whose claim age exactly equals their death age

`selfClaimEstablished = selfClaim < selfDeath - 1e-9` uses a **strict**
inequality, so someone who dies at exactly their claim age establishes no
benefit for a survivor to inherit.

**Why.** The looser `<=` would let a claim be established at the instant of
death, which is closer to the posthumous-claim behavior R2-003(b) exists to
remove than to the "already-established benefit" T04 exists to retain. The
strict form is the conservative side of a zero-width boundary. Note this
condition cannot change any *living* person's outcome: if someone is alive at
a segment they have already claimed in, then `selfClaim <= segStart <
selfDeath` holds by construction. It only ever bites for the dead.

**Where:** `src/engine.js:707-708`. Evidence: the "claim/death coincide" test
in `tests/audit-r2-survivor.test.js`.

### Q3b — the recipient gate is "reached their own claim age," not "has a nonzero own benefit"

These two readings are indistinguishable in most scenarios and give opposite
answers in exactly the case the audit calls out: a survivor with **no benefit
of their own** who is **past their selected claim age** must still receive the
larger benefit ($36,000), while a 50-year-old survivor must receive nothing.
Only the claim-age reading satisfies both. Recorded because the distinction is
easy to lose in a later refactor and there is no test-visible difference
outside these two cases.

**Where:** `src/engine.js:733-734`. Evidence: the paired "zero-own-benefit
recipient" and "50-year-old survivor" tests in
`tests/audit-r2-survivor.test.js`.

**Not invented here.** Broader real-world survivor eligibility (SSA's actual
age-60 survivor rules, remarriage, disability, dependent children) remains an
explicitly unresolved policy question. This repair restores the project's
prior narrow boundary and nothing more, per the audit's own stop condition.

---

## 2026-09-09 — Q4. How strict should nested-import-record validation be?

**Task:** 5 (atomic rejection of malformed imports, R2-T05 / R2-006).

**The fork.** The audit requires validating "present nested record shapes and
required financial fields," and simultaneously names the fix risk as
"excessive validation could reject legacy backups." Those pull in opposite
directions and the line between them was not specified.

**Chosen rules — two, both narrow.**

1. **An entry must be a plain object.** Unambiguous: a null or primitive
   entry cannot be rendered, edited or projected, only thrown on. This is the
   demonstrated crash.
2. **A listed financial field must be a finite number *if present*.** Absent
   stays legal. An absent field is inert (`Number(undefined)` yields `NaN`,
   the comparison fails, the entry contributes nothing); a present-but-
   malformed one is worse, because the engine coerces it and produces a
   silently wrong financial answer — which ARCH-02 ranks above a crash.

**Which fields are listed, and why not all of them.** Only fields the engine
reads as money or as a timing boundary:

| Container | Listed |
|---|---|
| `retirement.stages[]` | `start`, `end`, `value` |
| `retirement.expenses[]` | `age`, `amount` |
| `retirement.otherIncomes[]` | `amount`, `start`, `end` |
| `accounts[].futureChanges[]` | `age`, `value` |

Deliberately **not** listed: `stages[].annualChange` and
`otherIncomes[].growth`. The engine already reads both through a documented
`Number(x) || 0` fallback, so a malformed value there is inert rather than
unusable. Flagging them would reject legacy backups for no correctness gain.
If the reviewer wants maximum strictness instead, these two are the fields to
add.

**Also not touched:** whether a field must be *present at all*. No new
required-field rule was introduced, because that is exactly the legacy-
migration compatibility the audit told this repair to preserve.

**Second decision — rollback scope.** Validation can never be proven
exhaustive, so `importSettings()`'s apply phase now snapshots
`app`/`results`/`resultsDirty` and restores them if anything in the phase
throws. The restore re-renders so the UI matches the state that is actually
live again, and that re-render is separately guarded: whatever broke the
apply may well break the re-render too, and a failed re-render must not
prevent the state rollback that has already happened. The failure message
distinguishes "could not be applied" from the pre-existing "not a valid
backup," since those are now genuinely different situations.

**Where:** `src/scenario-validator.js:367-436` (`validateNestedRecords` and
its two call sites) and `src/app-shell.html:812-833` (the atomic apply
phase). Evidence: `tests/audit-r2-import-records.test.js`, whose DOM cases
assemble the app in memory from `src/` rather than going through
`tests/lib/harness.js` — that harness loads the deliberately stale shipped
artifact, so an assertion made through it would have silently tested old
code.

---

## 2026-09-09 — Q5. R4-F1's stated trigger is not reachable; a different one is

**Task:** 6 (missing-result heat-map guard, R4-F1).

**Not a policy fork — a correction to the finding's own reachability claim,
recorded because it changes what the repair is defending against.**

R4-F1 describes the trigger as "an absent active result (empty results array,
nothing run yet)." The guard is genuinely wrong as written — `activeResult &&
activeResult.calculationError` makes an absent result *satisfy* the condition
rather than trip it, so control falls through into scheduling and publishing a
98-year historical sweep for a scenario that was never run. That is a source
fact and it is fixed.

But the specific state the finding names is **not reachable**, and the two
obvious routes to it both self-heal:

| Route | Why it heals |
|---|---|
| Cold load onto a persisted `page: "results"` | `setPage("results")` recalculates whenever `resultsDirty \|\| !results[app.active]` |
| The Reset button (`results[app.active] = null`) | its replacement plan has rolling history off, so the *next* guard catches it regardless |

**What IS reachable is the in-flight window.** Switching scenarios sets
`app.active` to an index with no result yet and starts a recalculation; until
that recalculation lands, `results[app.active]` is `undefined`. Opening the
heat map in that window is an ordinary sequence — switch scenario, open the
heat map — and on a real device running a large Monte Carlo projection the
window is seconds wide, not microseconds. That is what
`tests/audit-r4-heatmap-guard.test.js` drives, and it is confirmed failing
against the pre-repair guard.

**Evidence scope, stated rather than glossed.** The repair applies the same
present-and-usable predicate at all three sites R4-F1 names. First-failing
evidence exists for the **entry guard** only. The callback's two re-checks are
closed by construction — same predicate, same function — and the second of
them cannot be independently reachable in any case: the 98-year sweep loop
between the two re-checks is synchronous, so nothing can yield to the event
loop and change `results` between them. If the reviewer wants independent
first-failing evidence for callback re-check #1, it would need a test seam
that suspends the recalculation, which this sprint did not add.

**Definition of "usable" adopted:** a result object that is present, carries
no `calculationError`, and has a real non-empty `rows` array. That is the same
standard R3-UI-001 already set for the comparison chart, deliberately, rather
than a new one. It also catches an invalid result independently, since
`applyInvalidResultContract()` sets `rows` to `null`.

**Where:** `src/app-shell.html:835-845` (`usableActiveResult` and
`heatmapNotCalculatedMessage`), `:857` (entry), `:869` and `:874` (callback
re-checks). Evidence: `tests/audit-r4-heatmap-guard.test.js`.

---

# Round 2 — decisions taken after the external sprint audit (2026-09-09)

`SPRINT_EXTERNAL_AUDIT_20260909.md` returned **REOPEN** on five findings. All
five were independently reproduced here before any code changed. The user
re-authorised the ground-rule-8 override for this round and answered the two
policy forks directly; those answers are recorded as Q6 and Q7 rather than
being decided unilaterally.

## 2026-09-09 — Q6. SA-04: is the spending decision start-of-period, or an ex-post indexed amount?

**USER DECISION: fix the lag.** The auditor framed this as a genuine
product-intent fork, and it was put to the user rather than guessed.

**The fork.** A later period's spending decision multiplied `priorSpend` by
that same period's historical inflation, before the period had elapsed.
Reproduced here: holding the entire scenario, all market returns and period
1's ending balances identical, changing only period 2's own inflation moved
period 2's decision from **$40,000 to $44,000**.

Either the product intends a start-of-period decision — in which case this is
a defect — or it intends an annual *ex-post* amount indexed to contemporaneous
inflation, in which case it is correct but must be documented as distinct from
the decision clock. The implementation made no such distinction, so the
no-lookahead claim could not stand either way.

**Chosen: start-of-period.** A decision now uses the last **observed** CPI
change. This makes ROADMAP §1's "start-of-period known state only" true
without qualification rather than true-for-balances-only.

**Mechanism, and why it is narrower than it sounds.** `annualInflation` is used
in exactly two places in `simulatePlan()`, wanting opposite things:

| Use | Requirement | Change |
|---|---|---|
| `inflationFactor *= (1+annualInflation)` at period END | ex-post accounting; must use the REALIZED figure | none — and it was already correct at decision time, since it only ever reflects completed periods |
| the last argument to `strategySpending()` | a DECISION input | now `priorObservedInflation` |

So one argument moved, not the inflation model.

**Configured forecasts are preserved exactly.** For `simple` and `monteCarlo`,
`assumptions.inflation` is an intentionally known input. Because it is
constant, a one-period lag on observed data is arithmetically identical to the
assumption itself. That equivalence is asserted by a test rather than assumed,
which is also why no golden fixture moved.

**Where:** `src/engine.js` — the `priorObservedInflation` declaration, the
`strategySpending()` call site, and the end-of-period update beside
`priorReturn`. Evidence: `tests/audit-sa04-decision-inflation.test.js`,
including a positive control that a PREVIOUSLY OBSERVED inflation outcome must
still move a later decision by exactly one step.

## 2026-09-09 — Q7. SA-01: how strict should nested-import-record validation be?

**USER DECISION: reject the import.** This supersedes Q4's narrower rule.

**Why Q4 was wrong.** Q4 rested on the premise that an absent field is inert.
The audit disproved it against the comparisons the engine actually performs:
`applyStage()`'s rejection test is `age < s.start || age > s.end`, and with
both boundaries absent BOTH comparisons are false, so the stage is *applied*.
A missing `mode` takes the amount branch and a missing `value` becomes zero.
`retirement.stages = [{name: "Go-go"}]` therefore passed both validators and
silently **zeroed all retirement spending, with no calculation error** — a
plan made to look better by deleting its lifestyle. Q4's "omits optional
fields is accepted" test was codifying the defect, and has been replaced.

**Chosen rule.** A **present** record must be a **complete** financial
instruction. An absent **container** still migrates to an empty array — that
is the real legacy-migration compatibility, and its tests are retained.

Field sets are taken from the records the app itself writes, not invented:

| Container | Required | Also validated if present |
|---|---|---|
| `retirement.stages[]` | `start`, `end`, `mode`, `value` | `annualChange`, `growthMode` |
| `retirement.expenses[]` | `age`, `amount` | `kind` |
| `retirement.otherIncomes[]` | `type`, `amount`, `start`, plus `end` unless `type === "oneTime"` | `growth`, `owner`, `growthMode` |
| `accounts[].futureChanges[]` | `age`, `mode`, `value` | — |

**Reversing Q4's rate-field carve-out.** Q4 deliberately left `annualChange`
and `growth` unvalidated because the engine reads them through
`Number(x) || 0`. The audit's counter stands: that fallback silently
substitutes an assumption, and it does not even catch everything — the string
`"Infinity"` is truthy after conversion and passes straight through it. Both
are now validated when present, while remaining optional.

**A detail worth keeping.** `accountPlannedContribution()`'s unrecognized-mode
branch means **"dollar"** — checked against the UI's own select options rather
than assumed. An absent `mode` therefore silently picks a policy, which is why
`mode` is required rather than merely enum-checked.

**Where:** `src/scenario-validator.js` — `NESTED_RECORD_SPECS`,
`FUTURE_CHANGE_SPEC`, `validateRecordEntry`, `validateNestedRecords`.
Evidence: `tests/audit-r2-import-records.test.js`, including end-to-end
assertions that an accepted import retains its intended spending and income
behaviour rather than only reporting `valid === true`.

## 2026-09-09 — Q2c AMENDED. The reserve exception, quantified and pinned

Q2c disclosed that inheriting the source account's realized rate cannot also
satisfy exact equivalence with an explicit destination under `reserveOn`. The
audit accepted this as a disclosed policy exception rather than a hidden
defect, corrected one detail, and required it be pinned by test.

**Correction:** the reserve share's denominator is `portfolioTotal`, not the
source account balance.

**Quantified, and now asserted:** a $2,000,000 source, $20,000 spending, a
three-year reserve, 10% base return, no fee or bond tent.

| Account | Reserve | Share | Rate |
|---|---:|---:|---:|
| source ($2,000,000) | `min(2000000, 60000)` = 60,000 | 0.03 | **9.79%** |
| explicit empty destination | `min(0, 60000)` = 0 | 0 | **10%** |

**Recorded policy:** the holding inherits the **source's** realized rate,
reserve blend included. Exact equivalence with an explicit empty destination
holds **only when `reserveOn` is false**, which is the scope of the HR-02
equivalence test — now asserted in that test rather than left implicit.

**Where:** `tests/audit-r2-rmd-holding.test.js`, the Q2c section.

## 2026-09-09 — Q5 AMENDED. The callback guard now has independent evidence

Q5 recorded that R4-F1's callback re-checks were closed by construction rather
than by an independent failing test. The audit disagreed, and was right: the
guard can be reached with a controlled timeout.

Two corrections to what Q5 said:

1. **"Self-heals" was too strong.** Cold-load entry does call calculation, but
   its completion is asynchronous, so the empty-result window is *transient*,
   not unreachable. The scenario-switch example remains the reachable case.
2. **The callback guard is now independently tested.** The sweep's own timer
   is intercepted rather than scheduled, the active result is cleared without
   scheduling any work, and the callback is then fired deliberately. The first
   attempt at this was wrong in an instructive way: clearing the result by
   switching scenarios also calls `calculate()`, which bumps `calcGeneration`,
   so the callback's *generation* guard pre-empted the check under test and the
   probe passed without ever reaching it. Confirmed first-failing against the
   pre-repair guard only after that was corrected.

The claim that the two callback re-checks cannot disagree with each other
still stands — the sweep loop between them is synchronous.

**Where:** `tests/audit-r4-heatmap-guard.test.js`.

## 2026-09-09 — Q8. SA-03 was a regression this project introduced, not an inherited defect

Recorded because it is the one finding that was self-inflicted, and because
the shape of the mistake is worth not repeating.

R2-T06 correctly registered a rate for the synthesized RMD holding so it would
receive its remaining-period growth. But `rates` had two consumers with
incompatible needs: `growAccounts()` wants one entry per account that
**exists**, while the Monte Carlo policy signal (`sum(rates)/rates.length`,
carried into the next period as `priorReturn`) wants one entry per market
exposure the period actually **had**. Those were the same set until R2-T06
made an account able to be born mid-period.

The result: a genuinely +2.5% period read as −1.667%, falsely triggering the
post-down-year flexibility cut and reducing the next period's spending from
$20,000 to $18,000 — in a period whose portfolio had *grown*.

**Fix:** snapshot the policy signal (`periodReturnSignal`) at the moment the
rate set is authoritative, and never re-derive it from `rates` afterwards. The
existing arithmetic-mean policy is deliberately preserved; a portfolio-weighted
signal may be worth having, but that is a separate policy change and was not
needed here. No extra random draw is taken.

**Where:** `src/engine.js` — `periodReturnSignal` at the rate-construction
site, consumed at the `priorReturn` assignment. Evidence:
`tests/audit-sa03-return-signal.test.js`.

# Round 3 — judgment calls taken during the new-files-only sprint (2026-09-10)

## 2026-09-09 — Q9. Refinance break-even: which definition?

`refinanceAnalysis()` has to answer "when does this pay off?", and there are
two established answers that can differ by years. Neither is wrong; picking
one silently would have buried a real analytical choice inside a number.

- **Cash-flow break-even** (the conventional one, and what most calculators
  print): months until the cumulative payment saving exceeds the closing
  costs paid in cash. It cannot see the clock extension, so a 30-year refi
  that raises lifetime interest still shows a flattering two-year break-even.
- **Net-position break-even**: the first month at which total cash gone plus
  debt still owed is strictly lower on the refinance side. Because the
  outstanding balance is inside the measure, it charges the refinance for
  retiring principal more slowly.

**Chosen: report both, named separately, neither one presented as "the"
break-even.** That keeps the module a measurement rather than a judgment,
which is this sprint's selection rule. A null means "never" on both — an
exact no-op refinance (same rate, same term, zero cost) reports null for
both rather than "month 1", which is pinned by test.

**Sub-fork inside it: does cash taken out count as a cost recovered?** No.
Cash-out is loan proceeds, not a recovered cost; crediting it would collapse
every cash-out refinance to month 1. It is excluded from the cash-flow
figure and fully accounted for in the net-position figure.

**If disagreed with:** `src/debt-refinance.js`, the `breakEvenMonth` /
`cashFlowBreakEvenMonth` block inside `refinanceAnalysis()`'s single pass.
Evidence: `tests/debt-refinance.test.js`, section 7.

## 2026-09-09 — Q10. The refinance comparison horizon's default

Comparing a 23-year remainder against a fresh 30-year is apples-to-oranges,
so the horizon is an explicit input. Its default still had to be something.

**Chosen: `max(remaining term, replacement term)`** — the one horizon that
smuggles in no judgment, because at it both loans are certainly retired and
nothing is truncated. Horizon figures therefore equal lifetime figures at
the default, which is asserted by test. Any shorter horizon is a real
analytical choice and must be stated by the caller, who then also receives
the balance each side still owes at that point so the comparison can be
closed rather than left open.

Rejected: defaulting to the *shorter* term (truncates the longer loan while
it still owes money, and flatters whichever side is longer), and defaulting
to a fixed "typical tenure" figure such as 84 months (a behavioural
assumption about the borrower, which is exactly the kind of policy answer an
unattended run must not pick).

**If disagreed with:** `src/debt-refinance.js`, `DEFAULT_HORIZON` and the
`defaultHorizon` assignment in `refinanceAnalysis()`.

## 2026-09-09 — Q11. ARM caps: what exactly does a "lifetime cap" cap?

`armRatePath()` had to commit to a cap convention, and US ARM disclosures use
two that are not equivalent:

- an **absolute maximum note rate** ("never above 11.25%"), and
- a **maximum rise over the initial rate** ("never more than 5 points above
  the start rate", the "5" in a 2/2/5 note).

**Chosen: support both, as separate named fields, and let the tighter one
bind.** `lifetimeCapPct` is the absolute ceiling; `lifetimeIncreaseCapPct` is
the rise. Neither is inferred from the other, so the caller states which
instrument they actually hold instead of the module guessing. This turns a
policy fork into a caller input, which is the outcome this sprint's selection
rule prefers.

**Sub-fork: do the caps constrain the contractual START rate?** No. Caps
constrain **adjustments**. A lifetime cap set below the start rate therefore
does not retroactively rewrite the note -- the start rate stands for the whole
fixed period, and the first *adjustment* is what gets pulled down to the cap.
The alternative (clamping the initial rate on day one) would silently restate
the borrower's signed rate, which is a worse failure than being conservative.

**Sub-fork: floor versus ceiling, when a misconfiguration puts the floor above
the ceiling.** The ceiling is applied last and wins, because a lifetime cap is
a hard maximum on the note.

**Sub-fork: what is the worst case when the note has no lifetime bound at
all?** `armBrackets()` **throws** rather than returning a bracket. An unbounded
worst case is undefined, not merely large, and picking a stand-in ceiling would
be exactly the quiet policy answer an unattended run must not give.

**If disagreed with:** `src/debt-arm.js`, `lifetimeCeiling()` and the clamp
block inside `armRatePath()`'s reset loop; the refusal is at the top of
`armBrackets()`. Evidence: `tests/debt-arm.test.js`, sections 4, 5 and 7.

## 2026-09-09 — Q12. What ranges should a generator use for fields nothing constrains?

The brief's rule for `tests/lib/scenario-generator.js` is "draw ranges from
`scenario-validator.js`'s own `checkRange` bounds and `checkEnum` sets — do not
invent new ranges." That covers six numeric fields and six enumerations. It does
not cover most of the plan: `returnRate`, `volatility`, `inflation`,
`retirement.spending`, account balances and contributions, debt rates and
payments are all unconstrained by the validator.

**Chosen: jitter every unconstrained numeric around `defaultPlan`'s OWN value**
(a bounded multiplicative factor, floored at zero where the validator warns on
negatives). The app's shipped defaults are the only non-arbitrary anchor
available; picking "reasonable" absolute ranges here would be inventing exactly
what the rule forbids, one level down.

**Two sub-decisions worth naming:**

1. **The bounds are parsed out of `src/scenario-validator.js` at load time**,
   not copied into the generator. They are inline literals inside `checkRange()`
   calls and are not exported, and this sprint does not edit that file to export
   them. A hardcoded copy would drift silently — the exact failure mode this
   project has been bitten by before. `assertBoundsPresent()` turns a validator
   rename into a loud failure rather than a silent fallback to invented ranges.
   Precedent: `golden-scenario-defs.js` already brace-extracts `defaultPlan`
   straight out of `app-shell.html`. The same technique reads
   `NESTED_RECORD_SPECS` / `FUTURE_CHANGE_SPEC` (which the near-miss mode needs
   to know what "required" means) and the withdrawal-strategy names out of
   `src/engine.js`'s own dispatch.

2. **Ages are drawn ordered, and filing status is consistent with `spouseOn`.**
   Neither is an invented bound. The validator itself reports
   `INCONSISTENT_AGES` when `retireAge < age` or `endAge < retireAge`, so an
   unordered draw would not generate scenarios that validate clean. `'mfj'`
   with no spouse is not a shape the app's own UI can produce; the validator has
   no cross-field rule for it, so restricting it is a conservative consistency
   choice rather than a constraint read from code — flagged here because it is
   the one place the generator goes beyond what the validator states.

**Load-bearing detail an auditor should check:** the validator classes every
range violation as a WARNING, and `valid` is false only on an ERROR. A generator
drawing `basisPct` at 150 or `ssClaim` at 75 would still produce "valid"
scenarios. The self-test therefore asserts **zero issues of any severity**, not
zero errors; the weaker assertion would let four of five known failure modes
through. Demonstrated in the header of `tests/scenario-generator.test.js`.

**If disagreed with:** `tests/lib/scenario-generator.js` — `extractRangeBounds()`
and the `d.jitter(...)` call sites in `generateScenario()`.

## 2026-09-09 — Q13. The reconciliation equation: the brief's wording does not match the engine's

Not a policy fork — a documentation discrepancy, recorded because anyone
reading the brief and then the L4 layer will trip over it.

`SPRINT_BRIEF_20260910.md` task 4 states the invariant as:

> opening + contributions + employer + growth **+ dividends** − withdrawals
> **− taxes − spending − debt payments** = closing

`checkRowInvariants()` in `src/engine.js` actually computes:

> opening + contributions + employer + growth **− dividends** − withdrawals
> == `row.total`   (tolerance `max(0.01, |total| * 1e-9)`)

Three differences, and the engine is right in all three:

1. **Dividends are subtracted, not added.** They leave the portfolio as cash to
   be spent; adding them would double-count.
2. **Taxes, spending and debt payments are not separate terms.** They are funded
   out of `withdrawals` and are already inside it. Adding them again would
   subtract the same money twice.
3. **`row.total` is the PORTFOLIO, not net worth.** Net worth is a separate row
   field that also carries other assets, debt balance and insurance. The
   brief's shape reads as a net-worth identity.

**Chosen: implement the engine's identity, and say so.** The brief's own body
(as opposed to its headline sentence) already names the real component list —
"`checkRowInvariants(issues, row, {opening, contributions, employer, growth,
dividends, withdrawals, ...})`" — so the loose wording is in the summary line
only.

**Where:** `tests/reconciliation-invariant.test.js` header states the asserted
equation explicitly so it cannot be confused with the brief's phrasing again.

**Worth noting for whoever builds the net-worth analogue:** the net-worth
identity in the brief's shape is a genuinely different and also-useful check,
and it is NOT currently asserted anywhere. It would need `otherAssets`,
`debtBalance`, `nonPortfolioDraw` and `insuranceValue` reconciled across
consecutive rows. That is a separate layer, not a correction to this one.

## 2026-09-09 — Q14. Two measured observations that contradict documented claims

Not judgment calls. Recorded because both claims live in documents that get
cited when D-2 is justified, and this sprint is not allowed to edit those
documents (ground rule 12).

### Q14a — the aggregation loop no longer does "per-key reallocation"

`ROADMAP_EXTERNAL_REVIEW.md` §5.2 justifies D-2 partly on: *"the aggregation
hot loop sorts 21 times per projection year with per-key reallocation."*

The sort count is correct — `quantileKeys` has exactly 21 entries and
`values.sort(byValue)` runs once per key per projection year. **The
reallocation half is stale.** `values = new Array(validCount)` is hoisted
outside both loops and `sort()` is in place, so the array is allocated once per
aggregation, not once per key. The remaining costs are real (21 sorts per year,
and the per-key gather loop that fills the array), but a future package should
not cite an allocation that the current code does not perform.

### Q14b — measured retained heap is ~1.8x the superseded ~178MB estimate

`tools/bench-baseline-20260910.json`, on the `baseline` golden scenario forced
to Monte Carlo (72 rows per path), Node v24 / win32-x64:

| paths | retained | bytes/path | bytes/row | sim ms | agg ms | agg % | us/path |
|---|---|---|---|---|---|---|---|
| 500 | 16.0 MiB | 33,658 | 467 | 235.7 | 57.5 | 19.6% | 471.5 |
| 1,000 | 32.1 MiB | 33,625 | 467 | 447.1 | 126.5 | 22.1% | 447.1 |
| 2,500 | 80.1 MiB | 33,606 | 467 | 1,142.6 | 373.2 | 24.6% | 457.1 |
| 5,000 | 160.2 MiB | 33,595 | 467 | 2,207.9 | 811.4 | 26.9% | 441.6 |
| 10,000 | 320.3 MiB | 33,589 | 467 | 4,444.0 | 1,719.8 | 27.9% | 444.4 |

Three readings, offered as measurements only — **no tier threshold is proposed
here, and per the task's scope boundary that judgment stays with the user:**

1. **No deoptimization signature on V8/desktop.** Per-path cost is flat
   (0.94–1.00x of the smallest count) to 10,000 paths. The JIT-discard failure
   mode §6 describes is an iOS memory-pressure phenomenon; it does not
   reproduce here, which is the expected result now actually verified on one
   platform rather than assumed.
2. **The aggregation's share of wall time grows with path count**, 19.6% ->
   27.9%. Structural, not a defect: simulation is O(paths) while aggregation
   sorts N values per key per year, so its share can only rise. It is the half
   of the runtime that scales worse.
3. **10,000 paths retains 320 MiB here, against the ~178MB figure §6 says
   should no longer be cited.** Consistent with 72 rows per path rather than
   the ~40 the older derivation assumed. **This is a V8-on-desktop figure and
   does not transfer to JavaScriptCore on an iPhone 15 Pro** — the harness
   prints that caveat in its own output and carries it inside its JSON, and it
   is repeated here so the table above cannot be lifted without it.

# Round 5 — findings recorded during the post-REOPEN repair round (2026-09-10)

## 2026-09-10 — Q16. A claim that predates the projection still grows on the projection's own first history years

**Recorded, not fixed. Found by the fixture protocol, during R3 (FM-01).**

**The residual.** FM-01's repair gives `growthFromCola()` an owner-specific
calendar origin, which fixes the spouse/self age-scale confusion. It does not
address a narrower case the audit separately flagged: when a benefit was
claimed **before the projection opens**, the index offset
`Math.max(0, Math.floor(startAge - origin))` clamps to zero, so those
pre-projection years are grown using the projection's **own first history
years**. That is the same borrowing-from-the-wrong-time shape as FM-01
itself, one level down.

**Scope: HISTORICAL mode only.** In `simple` and `monteCarlo` the rate is a
configured constant that is perfectly well defined for any year, so nothing
is borrowed.

**Why it was not fixed here, and this is the useful part.** An earlier
revision of the R3 repair *did* try to fix it, by starting the COLA accrual
at the later of the claim age and the owner's opening age. **That was wrong,
and the fixture protocol caught it.** The prediction for R3 was "no golden
scenario moves"; `golden:rmd-and-roth-conversion` moved anyway, by exactly
$1,008 — one 2.8% COLA step on a $36,000 benefit. Investigating the
unpredicted movement showed why: that scenario is age 68 with `ssClaim: 67`,
and `ssaBenefitAtClaim()` treats the entered figure as the **FRA-referenced
PIA**, not as today's payment. COLA growth from the claim age forward is how
the model brings that PIA to the current year, so removing a step silently
cut a legitimate year of indexing.

**The decision this needs.** Which rate should apply to pre-projection years
whose actual COLA is unavailable? Candidates: the configured `ssCola`
assumption (consistent with how simple mode already handles every year), or
the real historical COLA for the actual calendar years implied by the claim
(requires knowing the plan's real start year, which the model does not carry).
**Do not simply stop growing** — that is the option already shown to be wrong.

**Where:** `src/engine.js`, `growthFromCola()`'s index offset. Evidence and a
`todo`-marked reproducing test: `tests/audit-fm01-ss-calendar.test.js`, the
"FM-01 residual (Q16)" case.

## 2026-09-10 — Q18. With `incomeOffset:false`, outside cash still has no destination

**Recorded, not fixed. Found during R4 (FM-03).**

FM-03's repair tracks outside-income surplus and disposes of it per the D-1
preset. It is deliberately gated on the offset policy being **on**, because
the audit's repair note says in as many words: *"Preserve the selected
`incomeOffset:false` policy separately."*

With `incomeOffset:false` the outside income does not reduce the portfolio
draw, so the household sells assets for the full requested amount **and**
receives the outside income — which then has nowhere to go, exactly as
before. The household identity does not close on that path.

**Why this is a policy question rather than an obvious defect.** What
`incomeOffset:false` *means* is unresolved. Two readings, and they imply
opposite repairs:

- **"Income is spent outside the plan"** — the household consumes it on
  things the projection does not model. Then the cash legitimately leaves and
  the identity should be closed by recording it as spending, not retention.
- **"Income is ignored for withdrawal sequencing only"** — it is still the
  household's money and should accumulate. Then it should follow the same
  D-1 preset as the offset-on path.

Choosing wrong changes outcomes for every plan using that setting, so it is
put here rather than decided inside a repair.

**Where:** `src/engine.js`, the `offset ? Math.max(0, outside - requested) : 0`
guard. Evidence: `tests/audit-fm03-outside-cash.test.js`, the
"FM-03 residual (Q18)" `todo` case.

## 2026-09-10 — Q17. The seeded generator cannot produce a spouse Social Security benefit at all

**Recorded, not fixed. Found while verifying R3.**

`tests/lib/scenario-generator.js` jitters every unconstrained numeric around
**`defaultPlan`'s own value** (Q12's rule, deliberately, so the generator
invents no ranges of its own). `defaultPlan.retirement.spouseSS` is **0**.
Multiplicative jitter around zero is zero, so **`spouseSS` is 0 for every
generated scenario** — verified across 200 seeds, which produce exactly one
distinct value.

**Consequence.** No generated scenario can exercise spouse Social Security.
That is the exact path FM-01 lives on, and it is also where the survivor
logic (R2-T03, SA-repair territory) lives. The seeded sweep therefore reports
"no change" for repairs on that path not because nothing changed, but because
nothing was exercised — the same failure shape as the audit's section E
warning about oracles that cannot disagree.

Four corpus scenarios *look* like they cover FM-01 (historical mode, spouse of
a different age) and all four have `spouseSS: 0`, so the harness reported
IDENTICAL for a genuine P1 repair.

**Interim mitigation, applied.** `tools/capture-baseline.js` now appends two
hand-built targeted scenarios — `targeted:historical-spouse-ss` and
`targeted:spouse-cola-income` — so the baseline harness can detect a
regression on that path. Proven: temporarily reintroducing the FM-01 defect
moves exactly those two scenarios and nothing else.

**The real fix** belongs in the generator, and it needs a decision, which is
why it is recorded rather than made: giving `spouseSS` a nonzero draw means
choosing a range, and Q12's whole rule is that the generator invents no
ranges. The honest options are to anchor it to `defaultPlan.retirement.ssBenefit`
(the self's own default, which is nonzero) or to have `defaultPlan` carry a
nonzero spouse figure. Either is a deliberate change to the generator's
contract.

**Where:** `tests/lib/scenario-generator.js`; mitigation in
`tools/capture-baseline.js`'s `corpus()`.

# Round 4 — findings recorded during the S2 sprint (2026-09-10), not decided unilaterally

## 2026-09-10 — Q15. Task 4's fix is unreachable through the Web Worker path — a finding, not a fix, per ground rule 11

**Not a policy fork.** Recorded because it is a genuine defect surfaced while
implementing task 4, outside that task's own scope (it names only
`src/engine.js` and the one `defaultPlan.advanced` field in
`src/app-shell.html`), and ground rule 11 requires recording rather than
opportunistically repairing a defect found this way.

**The gap.** `projectDebts()`'s new `armRecastOnReset` branch calls
`DebtAmortization.monthlyPayment(...)` as a bare identifier. In the main
thread this resolves correctly: task 3's bundling places
`var DebtAmortization = (function(){...})();` in the exact same script scope,
immediately before `ENGINE_SOURCE`. But `buildWorkerSource()`
(`src/app-shell.html`, function `buildWorkerSource`) builds the Web Worker's
script as an entirely separate, independently-assembled string —
`RULES`/`ACCOUNT_TYPES`/`HIST_*`/version constants (JSON-stringified) plus
each function named in `workerFunctions` (`src/app-shell.html`, the
`workerFunctions` array, which already lists `projectDebts`), each
serialized via `fn.toString()`. `DebtAmortization` is not among those
constants and has no entry in `workerFunctions`, so the worker's own script
never defines it.

**Consequence, if ever reached.** Any calculation that runs through the
Worker (the app's default calculation path) with `armRecastOnReset:true` and
an adjustable-rate debt at or past its reset age would throw
`ReferenceError: DebtAmortization is not defined` inside the worker, on the
`self.onmessage` handler's own `try/catch` — surfacing as `error:` in the
message the app receives, not a silent wrong number. That is at least the
right failure shape (loud, not quiet), but it is still a crash the feature
must not ship with.

**Why this is not reachable today, and does not block this sprint.** There is
no UI control for `armRecastOnReset` this sprint (by design — "the flag is
settable by import and by test... a UI toggle belongs with the full ARM
feature, in a watched session"), and no existing scenario sets the field, so
no current code path can trigger this. It was found by inspection while
implementing task 4, not by a failing test, and is recorded here rather than
fixed because fixing it means editing `buildWorkerSource()` beyond the one
field task 4 was authorised to add — exactly the kind of file-touched-but-
not-task-named edit ground rule 9 says to stop and record rather than make.

**The fix, when this is picked up** (most likely alongside the UI toggle, in
a watched session): add a `DebtAmortization` line to `buildWorkerSource()`'s
returned string, reconstructed the same way the existing constants are —
e.g. `'\nvar DebtAmortization={monthlyPayment:'+DebtAmortization.monthlyPayment.toString()+'};'`
— since only `monthlyPayment` is called from inside the worker's copy of
`projectDebts()`. `Function.prototype.toString()` on the main thread's
already-executed `DebtAmortization.monthlyPayment` returns its real source,
the same mechanism `workerFunctions.map(function(fn){return fn.toString()})`
already relies on for every other function. Adding the whole `DebtAmortization`
object to `workerFunctions` directly would not work as-is — that array expects
bare function references, not a namespace object with methods.

**Where:** `src/app-shell.html`, function `buildWorkerSource` (the
`workerFunctions` array and its returned string), and `src/engine.js`'s new
`projectDebts()` branch (the `DebtAmortization.monthlyPayment(...)` call).
No test currently exercises the real Worker path with this flag on -- the
DOM test suite stubs or same-thread-executes calculations rather than
running a real background Worker (see R4-F3/Q5's discussion of why DOM tests
here are stub-based), so this gap has no first-failing test attached; it is
recorded as inspection-found per ground rule 11's own allowance for that.

## 2026-09-11 — Q19. Two allocation choices inside the RA-01/RA-02 repairs that are choices, not derivations

Recorded here rather than left in a source comment, so an auditor can
challenge them without excavating the code.

**(a) Tax is allocated across cash pools PRO-RATA.** One tax bill can be
funded from several pools — RMD proceeds and each outside-income source — and
which pool pays changes how much of each is left to direct under its own
policy. The repair applies the surviving fraction uniformly, which is the
pro-rata split and conserves exactly: the per-source residuals sum to the
pooled residual. It was preferred over "RMD pays first" or "outside pays
first" because it is order-independent, and the same rule is reused to
attribute `outsideSurplus` (a residual of the total) back to pension, Social
Security, other income and dividends — one rule to audit rather than two.

Nothing in the prior audits requires pro-rata. If a household should be
modelled as spending its forced RMD proceeds before its pension, that is a
different and defensible answer, and it would change how much of each source
reaches its destination in mixed cases.

**(b) A synthesized destination never consumes an RNG draw.** An account
created mid-period has no entry in the index-aligned `rates` array. Computing
one the normal way would call `normal(random)` under Monte Carlo and shift
the stream for every later period of every run — moving results far outside
the repair that created the account. So `accountReturnForPeriod()` gained a
`suppressDraw` flag that omits the volatility term and uses the expectation.

Under `simple` and `historical` this is *exactly* what an equivalent
pre-existing account receives, because neither method draws. Under Monte
Carlo it is deliberately the expectation rather than a draw. That is a stated
divergence between a created and a pre-existing destination, in one method,
in one period. The alternative — consume the draw and accept the stream shift
— is defensible if a reviewer thinks distributional fidelity in that period
matters more than reproducibility across the run.

## 2026-09-11 — Q20. The worker function registry is hand-maintained, and this is the second time it has bitten

`buildWorkerSource()` in `src/app-shell.html` builds the Web Worker from an
explicit `workerFunctions` array plus a hand-written list of serialized
constants. Adding `SURPLUS_SOURCES`, `surplusPolicyFor()` and
`knownSurplusPolicy()` to the engine in RR2-2 broke four worker tests with
`ReferenceError: SURPLUS_SOURCES is not defined`, and RR2-4's
`dividendEligibleAccounts()`/`takeCashFromAccounts()` needed the same
treatment.

This is the same shape as **Q15**, where `monthlyPayment` reached the worker
without the private `monthlyRate` it closes over. Q15 was fixed by packaging
the *whole* debt graph through one factory. The engine's own graph is still
enumerated by hand.

The registry did its job here — the tests failed loudly rather than shipping
a broken worker — but "a registry that must be updated in lockstep with an
unrelated file" is a standing tax on every engine change, and the failure
mode is a runtime `ReferenceError` in a background thread rather than a build
error. Deriving the list, or applying Q15's factory approach to the engine
itself, belongs in the S3 refactor sprint.

**Status: DECIDED 2026-09-13 (the owner) — (b), route to S6's bundler decision.**
S6 already plans to replace this packaging with a real bundler; building a
generated list now in S5 risks implementing it twice, and a missing
function fails loudly (route 3 + `worker-parity`), so nothing silently
breaks while it waits. Recorded in S5 task 1's close-out at `7016cc4` as
"second definition, detected loudly by route 3 + worker-parity" — the
`workerFunctions` array holds 96 entries; the probe exercised only that
array, not the Worker's constants list or the engine's own
`module.exports`, which name the same family under two more copies. S5
task 1.6 stays open pending Proposal 18's question of whether it can close
with the Q20 family routed away. *(This entry had no `Status:` line before
today; added now rather than left implicit, per this file's own
convention.)*

## 2026-09-11 — Q21. The seeded generator cannot produce any non-default policy value, so it never exercised RA-02 or RA-03

RR2-3 predicted the whole 27-scenario corpus would be **IDENTICAL** after
repairing RA-02, and it was. RR2-4 predicted the same for RA-03, and it was.
Both predictions holding is the finding: **two genuine defects, one of them
P1, were invisible to every scenario in the baseline corpus.**

The cause is the same as **Q17** (`spouseSS` is 0 for every generated
scenario because `defaultPlan`'s is 0). `generateScenario()` jitters
*numerics* around `defaultPlan`'s own values and never varies enumerated or
boolean policy fields. So across all 20 seeds:

- `surplusPolicy` is `"retain"` in every scenario — `invest` and `spend` are
  never exercised, and RA-02 Case B lives entirely in `invest`;
- `dividendOn` is `false` in every scenario — the enabled-dividend branch
  that RA-03 is about is never entered;
- combinations that need *two* non-default settings at once (dividends on
  **and** a retained cash holding) are unreachable by construction.

The RA-02 and RA-03 repairs are covered by 50 hand-written tests, so the
behaviour is pinned. What is not pinned is the corpus's ability to *notice* a
regression in either — the fixture protocol's "did this move only what it was
supposed to move?" is answered against a corpus that cannot reach these
paths.

Q17's fix needs a declared monetary range. This one needs a declared *policy
space*: which enumerated fields should the generator vary, and should it
sample combinations or just marginals. Both belong in the generator and both
should land before corpus coverage is relied on again.

## 2026-09-11 — Q22. Retained cash is drawn LAST, so the engine sells growing assets while idle cash sits (found by adversarially inspecting the re-audit)

Found while turning the re-audit's own method back on the re-audit. RA-02's
whole theory is that FM-03 introduced a new *kind* of entity and that every
site reasoning about the category it joined must be checked. The re-audit
applied that theory to **growth** (RA-02) and **dividends** (RA-03) and
stopped. **Withdrawal ordering was not examined, and it is wrong.**

`retainExcessRmdCash()` creates the household cash holding with
`priority: max(existing priorities) + 1` — deliberately **last** in its tax
class. `withdrawFromClass()` therefore exhausts every invested taxable
account before touching it.

Measured directly, 100,000 invested at 40% basis beside 100,000 of retained
cash at 100% basis, drawing 50,000 for spending:

| | Realised capital gains |
|---|---:|
| As shipped (cash sorts last) | **30,000.00** |
| If cash were reachable first | **0.00** |

and the invested account — earning the market return — is the one sold, while
the zero-return holding is preserved untouched.

**The cost is doubled and it compounds.** The household forgoes the return on
the asset it sold *and* realises capital gains it did not need to realise,
every period, for as long as the cash sits there. A 100%-basis, zero-return
holding is the strictly dominant thing to spend first on both axes.

**Why this is recorded rather than fixed.** It is a genuine policy question,
not an unambiguous defect:

- The economics say spend cash first — it is dominated on return and on tax.
- But a user who chose `retain` may mean "hold this as a buffer", which is an
  argument for spending it last. That intent already has a separate feature
  (`advanced.reserveOn` / `reserveYears`), which is an argument that `retain`
  should NOT silently duplicate it.
- Whichever answer is right, the current behaviour is **unstated**. It falls
  out of `priority: max + 1`, a line written to give a synthesized account a
  unique sort key, not to express a spending policy.

This is the third site in the same family (growth, dividends, withdrawal
order). The ground rule added in RR2 — enumerate every site reasoning about
the category a new entity joins, in the brief, before the repair — should be
applied to this entity in full rather than one site at a time. Remaining sites
not yet audited: `smartWithdrawalOrder`/`optimizedAccountScore` scoring of a
zero-return, empty-allocation holding; `moveFunds` transfers naming
`household-cash`; and `taxClassBalance` consumers other than the two already
repaired.

**ANSWERED 2026-09-11 (user):** *"spend the cash first but changeable by preset."*
Implemented as `advanced.retainedCashOrder`: `first` (default) or `last`.
Repaired in commit `81e677d`; see ROADMAP_EXTERNAL_REVIEW.md section 4.12.

Two things the repair surfaced that were not in the original write-up:

- **The three sort sites were a latent hazard, not just duplication.**
  `orderedAccountsInClass()` quotes the tax sale, `withdrawFromClass()`
  executes it, and `nextWithdrawAccount()` picks the next account -- each with
  its own hand-kept copy of the sort. Changing two of three would have made
  quoteTaxFunding price a different sale than the one performed. Now one
  comparator with three callers, and six tests pin that they agree.
- **Spending cash first RAISES lifetime taxes**, which contradicted the
  prediction. The 1.5% imputed-dividend base is computed on non-cash taxable
  balances, so preserving investments moves money into an income-bearing
  category. On the golden scenario: +398,895.90 of wealth for +2,562.34 of
  lifetime tax. Worth stating in any UI copy for this preset -- "spend cash
  first" is better for the household but is not a tax reduction.

## 2026-09-11 — Q23. Duplicate and reserved account ids are WARNINGS, not errors

`src/scenario-validator.js` now reports a duplicate account id and a user
account wearing one of the engine's own synthesized ids
(`rmd-retained-cash`, `household-cash`). Both are **WARNING**.

`reviewImportedScenarios()` refuses an import on any ERROR, so raising one
would reject saved plans that import perfectly well today — a user-facing
regression, to pre-empt a defect that does not yet exist. Nothing has ever
prevented duplicate ids, so such plans are out there. Reporting and refusing
are different things, and the engine must still compute deterministically for
these plans either way (pinned by the prewrite's regression guards).

**When to escalate:** the moment S3 task 5 actually keys anything by account
id. At that point a duplicate stops being cosmetic and starts averaging the
period return signal over one rate instead of two. Escalating then is a
one-line change; escalating now breaks imports for no benefit.

## 2026-09-11 — Q24. The generator now states ranges and a policy space of its own

`tests/lib/scenario-generator.js` was built on a rule it stated proudly in its
own header: *derive everything, invent nothing*. Every range came from the
validator's `checkRange` bounds, every enumeration from the validator's own
exported arrays, and every unconstrained numeric was jittered around
`defaultPlan`'s own value.

That rule is what made Q17 and Q21 possible. A field whose default is `0`
jitters to `0` forever; a field the generator never mentions never moves. So
`spouseSS` was 0 across all 200 seeds, `surplusPolicy` was `"retain"`
everywhere and `dividendOn` was `false` everywhere — and a P1 (RA-02) plus a
P2 (RA-03) were unreachable by every scenario in the corpus.

**Declared ranges** (money, which nothing in the validator bounds):

| Field | Range | Zero drawn |
|---|---|---|
| `employment.salary` | 30,000–300,000 | 25% |
| `employment.spouseSalary` | 20,000–220,000 (spouse only) | 35% |
| `retirement.ssBenefit` | 800–5,000 | 15% |
| `retirement.spouseSS` | 600–4,000 (spouse only) | 30% |

Zero is drawn deliberately: a household with no Social Security is a real
shape, and a corpus that only ever sees non-zero benefits is as blind as one
that only ever sees zero.

**Declared policy space:** `surplusPolicy`, `surplusPolicyBySource.rmd`,
`retainedCashOrder`, `dividendOn` (with yield/qualified/start when on), and
`survivor` when a spouse exists.

**MARGINALS, NOT COMBINATIONS — and this is the honest limit.** Each field is
drawn independently, so combinations occur at their natural joint frequency
rather than being enumerated. Measured effect across the 25-scenario corpus:

| | Before | After |
|---|---:|---:|
| `dividendOn` true | 0 | 12 |
| `surplusPolicy: invest` | 0 | 8 |
| `spouseSS > 0` | 0 of 200 | 5 |
| survivor modelling | 0 | 3 |
| **sensitive to retained-cash ordering (Q22)** | **1** | **1** |

The last row did not move, and it is the one that matters most for what this
change was supposed to prove. Q22's defect needs **two** conditions at once —
a retained cash holding must exist *and* the household must need to sell — and
those are close to mutually exclusive: outside surplus is what creates the
holding, and a household with surplus income mostly does not need to sell.
Independent marginal sampling cannot fix that. Only deliberate combination
coverage can.

**Open:** should the generator sample combinations (a covering array over the
policy fields, or seeded scenarios built to satisfy a named combination), and
if so which combinations are worth naming? Until it does, marginal coverage of
a policy field is **not** evidence that the interactions behind it are covered.

**MEASURED AFTER THE FIX, AND IT IS PARTIAL.** A parallel analysis framed the
mechanism more accurately than the note above did: it is not primarily a
jitter rule, it is an **allowlist**. `generateScenario()` deep-clones
`defaultPlan` and overwrites an explicit hand-written list of fields, so
anything not on that list keeps its default forever, regardless of what that
default is. Under that framing the fix here moved 12 fields and left the shape
of the problem intact:

| | Before S3-4 | After S3-4 |
|---|---:|---:|
| scalars blind across 200 seeds (of 99) | 72 | **60** |
| boolean toggles that never flip (of 24) | 19 | **17** |

Seventeen never-flipping booleans is seventeen whole features no generated
scenario has ever entered: `assetsOn`, `glideOn`, `transferOn`, `healthOn`,
`ltcOn`, `networthOn`, `rule55`, `penaltyException`, `preserveRoth`,
`homeEquityFallback`, `ssAdvanced`, `irmaaGuard`, `rmdSmoothing`,
`guytonSkipInflation`, `rollingHistory` — and two that should stop anyone:

- **`advanced.armRecastOnReset` is false in every generated scenario.** That is
  the S2 feature behind Q15, FM-05 and FM-06. Three findings were raised,
  repaired and re-audited on a flag the corpus cannot turn on.
- **`retirement.incomeOffset` is true in every generated scenario.** Q18 is
  *precisely about* `incomeOffset: false`. That open finding sits on a branch
  no generated scenario reaches.

**The prewrites going green did not mean the generator was fixed.** They assert
the fields they name, and they now pass; the corpus is still blind to 60
scalars. That is the same mistake this round has been documenting from the
other side — a green suite implying a property it never claimed — and it is
worth stating plainly rather than leaving the tally to imply otherwise.

**Also note:** the seeded corpus is not comparable across this change. Every
`seed:N` now describes a different scenario than the same name did before, so
diffing `tools/baseline-20260911-after-S3.json` against any earlier capture is
meaningful for `golden:*` and `targeted:*` entries only.

## 2026-09-11 — Q25. Five defaultPlan scalars are never read by the engine — three of them look like real gaps

Deciding which blind generator fields were worth fixing needed a test that was
not a matter of taste, so: **does `src/engine.js` read the field at all?** A
field it never reads cannot produce coverage however it is varied. Of 60 blind
scalars, 55 are read. These five are not:

| Field | Reads in engine.js | Assessment |
|---|---:|---|
| `profile.state` | 0 | No state-tax model exists; `RULES` has no state table. Plausibly by design. |
| `assumptions.returnPreset` | 0 | A UI label that sets `returnRate`; the engine reads only the rate. By design. |
| `advanced.home` | 0 | **A user-facing net-worth input no projection consumes.** |
| `advanced.debt` | 0 | **As above.** |
| `advanced.homeGrowth` | 0 | **An appreciation rate for an input that is itself unread.** |

The last three are the concern. Net worth appears to be computed from
`accounts` / `otherAssets` / `debts`, which suggests `home` / `debt` /
`homeGrowth` are superseded inputs still present in `defaultPlan` and still
(per `src/app-shell.html`) surfaced to the user. If the UI collects a home
value, a mortgage balance and an appreciation rate that no projection reads,
a household can enter its largest asset and see nothing change.

**Not repaired here** — establishing whether these are dead, superseded, or
wired up somewhere this check missed is a scoped investigation, and removing
a user-facing field is a product decision. `INTENTIONALLY_FIXED` in the
generator names all five with this reason, and a test fails if the engine ever
starts reading one, so the claim cannot rot silently.

## 2026-09-11 — Q26. The corpus can now REACH Q18's branch, and still cannot detect its defect

`retirement.incomeOffset` was `true` in every generated scenario; it is now
false in roughly 25 of 60. Q18 — outside cash having no destination when
income offset is disabled — is *precisely* about that branch.

**The suite stayed green, and that is the finding.** Q18's defect is a
**household** identity failure: cash that should exist does not. The seeded
sweep asserts **L4**, which is a **portfolio** identity — sources equal uses
*within the portfolio*. The whole-model audit already said this about FM-03:
*"It did NOT violate the L4 row invariant and could not — that is a PORTFOLIO
identity and this is a HOUSEHOLD defect, so the omitted cash never enters the
equation being asserted."*

So the generator fix moved the corpus from *cannot reach the branch* to *can
reach the branch and cannot check it*. That is real progress and it is not
coverage. `tests/audit-fm03-outside-cash.test.js` carries a household
source/use oracle written by hand; the sweep does not.

**Open:** should the seeded sweep assert a household identity alongside L4?
It would need a charitable-outflow term for QCDs (see the note in
`tests/audit-ra01-surplus-provenance.test.js`, where the pure-cash residual
came up short by exactly the donation) and a decision on what `incomeOffset:
false` is supposed to mean — which is Q18 itself. Until then, treat "the
seeded sweep passes" as evidence about the portfolio ledger only.

## 2026-09-10 — Q27. The repository has no `.gitattributes`, so every fresh checkout is CRLF

`core.autocrlf=true`, blobs are stored LF, and there is no `.gitattributes`.
So **git writes CRLF into every working tree on checkout**, including a fresh
clone.

That broke `build.js` outright until this round's repair — a fresh clone could
not build, and 41 tests failed inside a shipped package. The repair made
`build.js` line-ending agnostic, which fixes the symptom that was measured.
**The underlying condition is unchanged:** any future code that matches on
`\n`, hashes file bytes, or compares source text will hit the same thing, and
will hit it on someone else's machine rather than here.

This has already cost real time twice. A `git stash`/`pop` round-trip
mid-session rewrote `src/engine.js` as CRLF and broke the build for 37 tests;
and `tools/capture-baseline.js`'s new `meta.sourceHashes` hashes source files
as raw **bytes**, so it reports a different hash for the same commit checked
out on a machine with a different `autocrlf` setting.

**The obvious fix has a wide blast radius.** Adding `* text=auto eol=lf` would
re-normalise every tracked file on the next checkout — a whole-repository
touch, in the middle of a round where the package's manifest hashes are
evidence an auditor is checking. It would also invalidate every stored
`sourceHashes` block.

**Open:** add `.gitattributes` (and when — most safely immediately after an
audit closes, not before), or leave the condition and require every future
file-reading tool to normalise on read the way `build.js` now does. The second
is what is in force by default, and it is a rule nobody has agreed to or
written down anywhere but here.

## 2026-09-10 — Q28. The baseline capture is now `runPlan()` with zero exclusions (format 2)

**A decision, taken deliberately, recorded here so it can be challenged without
excavating code.** `SPRINT_BRIEF_20260910_S3.md` task 2 makes it ("the
migration decision, made here") and required RR2-1 to decide the contract
first; RR2-1 (`e577dcf`) repaired RA-04 in `tools/capture-baseline.js` and said
nothing about the entry point, which is the brief's stated fallback case:
implement the migration and record it.

**What changed.** Format 1 captured `runScenario()` and excluded two fields as
non-deterministic (`identity.scenarioId`, `identity.runId`). Format 2 captures
`runPlan()` and excludes **nothing**.

**Why it is strictly stronger.** `Date.now()` and `Math.random()` appear
exactly twice in the engine, both inside `generateScenarioId()` /
`buildSimulationIdentity()`. `runPlan()` calls neither — only `runScenario()`
does. Measured over the whole corpus: **33/33 scenarios produce byte-identical
`runPlan()` output on two consecutive calls**, with the control that the same
measurement reports `runScenario()` as non-deterministic, differing in exactly
one field (`runId` — not `scenarioId`, which turns out to be derived from the
plan id and is stable for a corpus plan).

So the rule the harness enforces changes from *"these two fields may move"* to
*"nothing may move"*. There is no longer a list that can quietly widen, which
was the one change to this file that would have destroyed its value.

**What it costs.** Format 1 captures stay readable and are **refused for
diffing** against format 2 — `diffSnapshots()` throws. A cross-format diff
would report the entire 13-field `identity` block as removed on every scenario,
which is a fact about which function was called and not about the engine: a
result-shaped object with no result in it. The eight existing
`tools/baseline-2026*.json` files are format 1 and are now historical.

**If you disagree:** `CAPTURE_FORMAT` and `EXCLUDED` at the top of
`tools/capture-baseline.js`, and `capture()`'s call to `engine.runPlan`.

---

## 2026-09-10 — Q29. A corpus scenario carries an income type the validator rejects

**Found while verifying that every targeted scenario validates. It does not.**

`targeted:spouse-cola-income` — a hand-built corpus entry added during the
R1–R7 round as an FM-01 / spouse-COLA probe — sets

```
retirement.otherIncomes[0].type = "recurring"
```

and `validateScenario()` returns **`valid: false`** on it:

> `UNRECOGNIZED_VALUE`: `"retirement.otherIncomes[0].type"` is `"recurring"`,
> which is not one of pension, rental, employment, investment, socialSecurity,
> taxFree, other, oneTime

The scenario still *runs* — 21 rows, no `calculationError` — because the engine
only distinguishes `oneTime` from everything else, so an unrecognised type
behaves as a generic recurring income. That is precisely why nobody noticed.

**Why it matters.** This scenario is in the baseline corpus, so it contributes
to the capture that certifies the S3 refactor. It is a shape **no user can
enter through the UI**, which means part of the safety property is asserted
over an input outside the validated input space. The FM-01 evidence it was
built to provide is weaker than it looks.

**Not fixed, deliberately** (ground rule 11). Changing `"recurring"` to a valid
type would change that scenario's output, which is a financial-output movement
smuggled into a harness task — exactly what the one-refactor-per-sprint rule
exists to prevent. It needs its own change with its own before/after.

**Open:** is the right repair to correct the scenario, or to add `"recurring"`
to the validator's accepted list? The engine's behaviour suggests the value was
always meant to be legal; the validator suggests it never was. Nothing records
which. `src/scenario-validator.js`'s `otherIncomes` type check, and
`targetedAdditions`' neighbour `spousePair` in `tools/capture-baseline.js`.

---

## 2026-09-10 — Q30. The baseline harness was running a PARTIAL engine, and nothing could see it

**The instrument that certifies the refactor could not run the engine the app
ships.** `loadEngine()` in `tools/capture-baseline.js` did

```
require('src/engine.js')
```

and nothing else — so the six debt namespaces `build.js` bundles into
`__debtModulesFactory` were simply absent from the capture's engine.

`projectDebts()` reaches `DebtAmortization.monthlyPayment()` only inside
`if (armRecastOnReset && pastReset && scheduledPayment === null)`. So the gap
was invisible for exactly as long as no captured scenario had **both** the flag
on and an adjustable-rate debt — and measurement says none ever did:

| in the pre-S3 corpus | count |
|---|---:|
| `advanced.armRecastOnReset === true` | 7 |
| carries a `rateType: "adjustable"` debt | 4 |
| **both at once** | **0** |

The generator varies the two independently and they never coincided. The first
scenario written to cross that branch (`targeted:arm-flag-on`) crashed the
capture outright with `ReferenceError: DebtAmortization is not defined`.

**This is the same defect the re-audit found in `buildLiveWorkerSource()`** —
a hand-assembled engine that is neither the main thread nor the shipped worker
— living in the instrument that is supposed to certify the refactor, which is a
worse place for it.

**Repaired as part of task 2**, rather than only recorded, because task 2's own
corpus could not be captured otherwise. `installDebtModules()` now reads
`build.js`'s own `DEBT_MODULES` registry, so there is one definition of "which
modules the engine needs" and the seventh module S3 task 6 adds is picked up
without anyone remembering to. A test asserts the installed list equals
`build.js`'s registry.

**The general form is the open question.** There are now three known
assemblies of this engine — `build.js`'s real one, the test helpers', and this
harness's — and two of the three have been found wrong by someone running a
case the assembly could not handle. Nothing enumerates them or checks them
against each other. See Q20 (the hand-maintained worker registry), which is the
same shape.

---

## 2026-09-10 — Q31. `verify-phase2-extraction.js` cannot pass any more, and a close-out criterion still asks for it

`SPRINT_BRIEF_20260910_S3.md`'s close-out says *"Confirm `node
tools/verify-phase2-extraction.js` passes."* It does not pass, it cannot, and
nothing in the sprint caused that.

**Two separate problems.**

**1. The command in the brief is incomplete.** The tool takes a required
argument — the pre-Phase-2 original — and throws a usage error without one:

```
git show f06ac7c:investment-calculator-v2c.html > original.html
node tools/verify-phase2-extraction.js original.html
```

Anyone following the close-out line literally gets a stack trace and could
easily read it as a sprint failure.

**2. Run correctly, it reports FAIL — by design, now.** 48 items re-extracted,
**16 mismatches**, 0 function-count anomalies. The mismatched functions include
`growAccounts`, `simulatePlan`, `runPlan` and `quantile`.

Those are exactly the functions R1–R7, RR2 and Q22 repaired. The tool
re-derives what `src/engine.js` *should* contain by re-running the extraction
against commit `f06ac7c`, the pre-Phase-2 ancestor. Every legitimate engine
repair since then is, to this tool, a mismatch. It was a genuine provenance
proof on the day the extraction happened and it has been quietly measuring
something else ever since.

**Verified as pre-existing:** `src/engine.js` is untouched in this session —
`git status` clean on it throughout, and ground rule 9 reserves the file for
task 5, which did not run.

**Why it matters more than a stale doc line.** The failure mode is not that the
check is useless; it is that the check still *reports*, in the vocabulary of a
correctness proof, on a comparison that stopped being meaningful. An unattended
run told to "confirm it passes" has two bad options — treat the sprint as
failed, or make the engine match a pre-repair ancestor — and the second is
catastrophic and looks like diligence.

**Open:** retire the tool, re-baseline it against a post-repair commit, or keep
it and change the close-out line to state the expected mismatch count with the
reason. Whichever is chosen, the brief's close-out line needs the argument
added. Same family as Q20 and Q30: a check whose subject moved out from under
it while it went on returning clean-looking numbers.

---

## 2026-09-10 — Q32. The SA-01 class is alive, in optional fields, in five places

**S3 task 4's sweep. Recorded, not fixed** (ground rule 11, D3). Reproducing
tests are `todo`-marked in `tests/near-miss-survivor-sweep.test.js` and carry
their seeds.

### The good half first

**Every REQUIRED-field omission is caught.** Enumerated deterministically —
**1,011 sites, 13 distinct kinds, across 60 seeds** — and the validators
rejected every one. SA-01's own case (a `retirement.stages` entry with only
`name`) is now rejected with four `MISSING_FIELD` errors and never reaches the
engine.

That claim carries two controls, because "everything was rejected" is exactly
the shape of an answer a broken probe returns:

- **60/60 complete records validate**, so the probe is not measuring "generated
  scenarios never validate".
- **Every rejection names the omitted field**, so it is not measuring
  "something else was wrong with the plan".

### The finding

The near-miss corpus only ever omitted **required** fields. **Optional** fields
— present on a record, absent from its `required` list — pass validation *by
construction* and are just as able to change the answer.

**506 optional-field omissions across 60 seeds. None rejected. Classification:**

| class | count |
|---|---:|
| inert | 427 |
| silent, immaterial | 9 |
| loud (`calculationError`) | 0 |
| **silent and material** | **70** |

**Zero loud.** Not one of these announces itself.

| site | material cases |
|---|---:|
| `retirement.otherIncomes[].growthMode` | 36 |
| `retirement.stages[].growthMode` | 15 |
| `retirement.otherIncomes[].owner` | 9 |
| `retirement.otherIncomes[].growth` | 5 |
| `retirement.stages[].annualChange` | 5 |

### The sharpest one — `otherIncomes[].owner`, seed 100006

`otherIncomeFor()` computes

```js
var spouse = i.owner === "spouse" && p.profile.spouseOn,
    ownerAge = spouse ? p.profile.spouseAge + (periodStart - p.profile.age) : periodStart,
```

An **absent** `owner` makes `spouse` false, so a spouse-owned income is timed
against **self's** age instead — shifted by the whole age gap.

On seed 100006, with a spouse-owned investment income of $24,091.72 starting at
age 84:

```
lifetime taxes  with owner : 398,269.81
lifetime taxes  without    : 568,735.44
                     delta : +170,465.63
```

61 leaves move across `income`, `magi`, `shortfall` and `taxes` on 15 rows. No
validation error. No `calculationError`.

**This is SA-01's mechanism exactly.** SA-01 was `age < s.start || age > s.end`
being false on both sides because the boundaries were absent. This is
`i.owner === "spouse"` being false because the owner is absent. In both cases
an absent field makes a conditional false and the code proceeds as though it
had been given a real answer.

`household` reaches the same branch, incidentally — `i.owner === "spouse"` is
false for it too — so a household-owned income is also timed against self.

**Status: DECIDED 2026-09-14, night (the owner), on the household-owned case specifically.** A household-owned income is timed by self's ages — accepted, not a defect. Recorded in `MODEL_ASSUMPTIONS.md` and on the input's own label (`S5_TASK_CHECKLIST.md` block 2.6). Separately, the `owner`-**absent** case this section measured is resolved by `Q69`: an other income with no owner is now refused at the input gate rather than silently timed against self. The wider required/default/warn fork for the other four optional-field kinds (`growthMode`, `growth`, `annualChange`) remains open, per the original text below.

### Why this is a question and not simply a bug

An optional field's absence *should* mean "use the default". The defect is not
that defaults exist; it is that **these defaults are silent semantic choices
that change six-figure outputs**, and nothing states them. A user hand-editing
an import, or an importer that drops an empty field, gets a different plan with
no indication.

**Open, and genuinely a fork:**

1. **Make them required.** Honest, and consistent with how the required fields
   are already treated — but it breaks every existing saved scenario that omits
   them.
2. **Default them explicitly at normalisation**, so the engine never sees an
   absent value and the default is written down in one place.
3. **Warn.** A `WARNING`-severity validator rule naming the field and the
   default it will receive — the same transitional shape Q23's duplicate-id
   rule uses.

Option 2 is probably right for `growthMode`/`growth`/`annualChange`, where a
default is defensible. `owner` is different: there is no defensible default for
*whose* income it is, and defaulting it to self silently re-times the money.

**Not decided here** — this is an engine/validator change and S3's engine
budget belongs to task 5. `otherIncomeFor()` and `applyStage()` in
`src/engine.js`; `NESTED_RECORD_SPECS` in `src/scenario-validator.js`.

### The guard that is in place meanwhile

`KNOWN_MATERIAL_SITES` in the sweep pins these five kinds. A material finding
at a **sixth** kind fails the sweep loudly. A known kind that stops
reproducing also fails — because that is either a repair (remove it in the same
commit as the fix) or the sweep quietly stopped reaching it, which is worse.

---

## 2026-09-10 — Q33. Adding a seventh debt module proved there are still two definitions of "which namespaces exist"

**S3 task 6 added `src/debt-revolving.js`. Registering it in `build.js`'s
`DEBT_MODULES` was supposed to be the whole job. It was not, and the reason is
Q15 wearing a new hat.**

Three places need to know which debt namespaces exist. Two read the registry;
one hand-maintains a copy.

| consumer | how it gets the list | picked up module 7? |
|---|---|---|
| `build.js` main-thread destructuring | generated from `DEBT_MODULES` (line ~158) | **yes** |
| `tools/capture-baseline.js` `installDebtModules()` | reads `build.js`'s `DEBT_MODULES` | **yes** |
| `src/app-shell.html` `buildWorkerSource()` | **hard-coded six-name array** | **no** |

The worker's line reads:

```js
["DebtAmortization","DebtPayoffStrategy","DebtStrategyAdapter","DebtRefinance","DebtArm","DebtRecast"]
  .map(function(n){return "var "+n+"=__debtModules."+n+";"}).join("")
```

**Measured inside the real built worker**, with a control:

```
typeof DebtRecast                    -> "object"     (control: the mechanism works)
typeof __debtModules.DebtRevolving   -> "object"     (the code DID ship)
typeof DebtRevolving                 -> "undefined"  (the binding does not exist)
```

So the module's source is inside `__debtModulesFactory` and reaches the worker
intact. Only the `var` that names it is missing.

**Harmless today**, because task 6's scope boundary is explicit that
`debt-revolving.js` is bundled and reachable but **not wired** into
`projectDebts()`. Nothing in the worker refers to `DebtRevolving`, so nothing
throws.

**A `ReferenceError` on the first day anyone wires it.** The main thread would
compute; the Worker would throw; and — because `runPlansBackground()` falls
back to `plans.map(runScenario)` when Workers are unavailable — the failure
would appear only for users whose browser actually uses Workers. That is Q15's
signature precisely: *"the worker is a second build system."*

**Not fixed here.** Ground rule 9 and safety property 10(d) hold
`src/app-shell.html` byte-identical for the whole of S3. A `todo`-marked test
in `tests/debt-revolving.test.js` records the state with its control.

**What is different from Q15, and worth noting:** `tests/worker-parity.test.js`
now exists (S3 task 3b). Once this module is wired, the parity sweep runs every
corpus scenario through the real built Worker, so this class of gap fails a
test instead of reaching a user. Q15 was found by an auditor executing a
proposed fix; this one was found by adding a module, and the next one should be
found by CI.

**Open:** the durable repair is to stop hand-maintaining the list — have
`buildWorkerSource()` derive the names from `__debtModules` itself
(`Object.keys(__debtModules)`), which needs no registry at all and cannot drift.
That is a one-line change to `src/app-shell.html` and it should be made in the
first sprint that is allowed to touch that file. See Q20, which is the same
argument about `workerFunctions`.

---

## 2026-09-10 — Q34. `build.js` rewrites requires by scanning raw text, so a COMMENT can break the build

**Small, real, and found by writing a comment.** S3 task 7's module header
explains why it cannot require the engine. Writing the example require
literally in that comment broke the build:

```
build: unrecognised sibling require inside a debt module: require('./sibling.js')
```

`rewriteSiblingRequires()` in `build.js` runs a regex over the module's raw
source. It has no notion of comments or strings, so any text matching
`require('./name.js')` anywhere in the file — prose, a docstring, a disabled
line, an error message — is treated as a real import and validated against the
debt-module registry.

**Why it is worth recording rather than shrugging at.** The failure is loud,
which is good. But it makes the file's *documentation* load-bearing on the
build, and the failure message names a module (`sibling.js`) that does not
exist and never did — so the first read is "something is wrong with my
imports", not "your comment is being parsed". That cost a build cycle here and
would cost more from someone without the context.

It is also the same family as Q27 (`build.js` was not line-ending agnostic) and
Q30 (a hand-assembled engine): **a text-level tool applied to something that
is not text-shaped.** Each one is individually minor and they keep arriving.

**Not fixed** — `build.js` is editable this sprint only by tasks 6 and 7, and
only to register a module (ground rule 9). This would be a behaviour change to
the bundler.

**Open:** strip comments before rewriting (the bundler already has
`stripHeaderComment`, so the machinery is half there), or at minimum make the
failure message say that comments and strings are scanned too. Worth doing
alongside the Q33 repair, since both are in the same bundling path.

Meanwhile the workaround is in place and documented at the site: the module
header describes the require in prose instead of quoting it.

---

## 2026-09-10 — Q35. Three gaps L4b found: two in corpus coverage, one in what the engine exposes

**S3 task 8. The within-row net-worth identity closes exactly — worst absolute
error 0 across 1,016 corpus rows. Everything below is about the parts that do
not, and why.**

### 1. The corpus cannot check the across-row ASSET identity

The identity is

```
otherAssets[i] == (otherAssets[i-1] - nonPortfolioDraw[i]) * (1 + growth)
```

and it holds exactly in hand-built cases at 0%, 3% and 7% growth. Over the
corpus it also "holds" — vacuously:

| measured over the corpus | value |
|---|---|
| scenarios carrying `otherAssets` | 9 |
| distinct `otherAssets` growth rates | **`[0]`** — every one |
| rows where `nonPortfolioDraw > 0` | **0 of 1,016** |

With zero growth and zero draws the identity reduces to
`otherAssets[i] == otherAssets[i-1]`, which is true and says nothing. Running
the real assertion over the corpus would have produced a green test with no
content — the same shape as the vacuous `identity` guard task 2 found, and the
`networkOn`-gated insurance test criterion 4 warned about.

**`drawFromOtherAssets()` has NO corpus coverage at all.** Not weak coverage —
none. Nothing generated has ever drawn on a non-portfolio asset.

The gap is asserted rather than noted: a test asserts the growth set is exactly
`[0]` and that draw rows are 0, and its failure message says to fold the corpus
into the real assertion and delete the guard. Improving the generator turns
this into a failing test that asks to be strengthened, instead of silently
leaving a stronger assertion unwritten.

**Open:** add `otherAssets` growth and availability to the generator's
allowlist (task 1's mechanism). `available`, `availableAge`, `accessPct` and
`liquidity` all gate `drawFromOtherAssets`, so all four need varying together —
the same "a toggle that gates other fields must flip with them" rule task 1
established.

### 2. The across-row DEBT identity cannot be closed from what a row exposes

A row carries `debtPayments`, which is `debtFlow.retirementPayments` —
payments made **during retirement only**. In pre-retirement years it is `0`
while `debtBalance` moves anyway, so

```
debtBalance[i-1] - debtBalance[i]   vs   debtPayments[i]
```

compares two different quantities. Measured: the unexplained fraction reaches
**1.0** — completely unexplained. No tolerance rescues that, and widening one
until it passed is what task 8's criterion 3 explicitly forbids.

`projectDebts()` returns `{retirementPayments, totalPayments}` and neither is
split into principal and interest, so the identity is not closeable without an
engine change.

**What is asserted instead:** `debtBalance >= 0` on every row of every
scenario, and a bound test that FAILS if the residual ever becomes small —
because that would mean the engine started exposing enough to close the
identity properly, and the bound should then be replaced by the real thing.

**Open:** expose per-period debt interest on the row (or a per-debt breakdown).
That is an engine change and S3's engine budget belongs to task 5.

### 3. `debtBalance` is not monotonic, and that is correct

Worth writing down because it looks like a bookkeeping error and is not.
`debtBalance` **rises** on 45 of 983 corpus row pairs, by as much as **$72,733
in a single year**.

Every case is a generated debt whose payment is below its monthly interest —
rates of 10.6%–11.29% against payments of a few hundred dollars. That is
negative amortization, and `projectDebts()` models it correctly: the balance
grows.

A test asserts the explanation rather than the observation: for every scenario
whose debt balance rises, some debt must have `balance * rate / 12 >
paymentMonthly`. If a rising balance ever appears **without** an underwater
debt, that is a different problem and the test says so.

**Noticed in passing, not investigated:** generated debts have no `type` field
at all (`undefined/fixed@10.94`). Nothing in this sprint depends on it —
`DEBT_TYPES` is a UI concern and `projectDebts()` keys off `rateType`, not
`type` — but a generated debt is therefore not a shape the UI can produce, and
task 4's near-miss sweep does not cover `advanced.debts` records. Related to
Q32's family.

---

## 2026-09-10 — Q36. Two things the schema catalogue revealed

**S3 task 9. Recorded, not repaired — the task's scope boundary is explicit
that no validator change belongs in it.**

### 1. `advanced` accepts any key at all

A scenario carrying a field that exists nowhere in the schema validates
cleanly:

```js
plan.advanced.thisFieldDoesNotExistAnywhere = 12345;
validateScenario(plan).valid   // -> true, and no issue mentions the field
```

`validateAdvanced()` checks the values of keys it knows about and has no
allowlist, so an unknown key is neither rejected nor warned about. Known and
true, and now asserted.

**Why it matters more than a typo guard.** The failure it permits is a *typo in
a real field*: `advanced.networthOn` misspelled as `advanced.networthon` is
accepted silently, the real toggle keeps its default of `false`, and the
household's net worth quietly omits their house. Nothing anywhere says so. That
is the SA-01 shape again — an absent value taken as a real answer — reached by
a different route.

The assertion is written to fail if this is ever fixed, with a message saying
to close this entry and delete the test rather than leave a pin on the old
behaviour. It carries a control: a KNOWN key with a bad value
(`surplusPolicy: "notAPolicy"`) IS rejected, so "the validator said nothing"
is about unknown keys and not about a validator that says nothing.

**Open:** an allowlist derived from `defaultPlan.advanced` — which the
catalogue now produces — at `WARNING` severity first, following the
transitional discipline Q23's duplicate-id rule and S2's `armRecastOnReset`
both used.

### 2. `advanced.home` and `advanced.debt` are inert to the ENGINE and live to the LOADER

A refinement of Q25 and of S3 task 1's "inert" classification. **Both are
correct as stated and both are easy to over-read**, so this is worth writing
down rather than leaving implied.

What was measured, and is still true: these two scalars appear **zero** times
in `src/engine.js` and zero times in `src/scenario-validator.js`. So varying
them cannot move `runPlan()` output, and S3 task 1 was right not to spend a
generator slot unblinding them — the brief's warning that they "would show as
unblinded in the detector while contributing nothing to a capture" was sound.

What that does **not** mean is that they are dead. `normalizedPlan()` in
`src/app-shell.html` reads both, and migrates them:

```
advanced.home  > 0  ->  otherAssets record { type: "primaryResidence", value, growth }
advanced.debt  > 0  ->  debts record       { type: "mortgage", balance }
```

guarded by `advanced.v210Migrated`. Those records **do** move output. Verified:
two otherwise-identical v1 scenarios differing only in `advanced.home` produce
different `networth` on row 0 once normalized.

**They are not vestigial. They are migration inputs**, and they are the only
route by which a pre-2.1.0 saved scenario keeps its house.

**The general point, which is the reusable one.** The corpus calls `runPlan()`
directly and therefore bypasses `normalizedPlan()` entirely. So the whole
loader — defaulting, per-record normalization, and the v2.1.0 migration — has
**no corpus coverage at all**, and any field whose only consumer is the loader
measures as inert to every instrument this sprint built. Task 9's migration
test is currently the only thing exercising that path.

**Open:** should the corpus include a normalization stage, so captures describe
what the app actually runs rather than what the engine accepts? That would be a
change to the capture contract (Q28's territory) and wants deciding
deliberately, not as a side effect. Related: Q30 and Q33, which are the same
observation about assemblies — what the tests run and what ships are not
automatically the same thing.

---

## 2026-09-10 — Q37. A capture recorded the *enclosing* repository's commit as its own provenance

**Found by building the S3 audit handover folder — the third consecutive time
that extracting the tree and running the suite found something no check inside
the repository could.** Fixed, with first-failing evidence.

### What happened

`gitCommit()` in `tools/capture-baseline.js` was:

```js
return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, ... }).trim();
```

`git rev-parse HEAD` **walks up the directory tree.** So a tree extracted into
a directory that happens to sit inside a git checkout resolved *that
checkout's* HEAD and wrote it into the manifest as the capture's provenance.

Not a missing value. A **confidently wrong one** — and the test that caught it
states the principle it violates: *provenance that is absent should say so.*
Provenance that is wrong is worse than none, because nothing about it looks
suspicious: it is a valid 40-hex SHA in the right field.

### The measurement, with the control that makes it mean something

| where the tree was extracted | `gitCommit()` returned |
|---|---|
| standalone, outside any repository | **`null`** — correct |
| nested inside this repository | **`b4c8b1f09b2c…`** — the *outer* repo's HEAD |

The control is the second row's companion fact: from the nested directory,
`git rev-parse HEAD` **succeeds** and `git rev-parse --show-toplevel` returns
`C:/Calculator merge`, not the nested directory. So returning `null` has to be
a decision the code makes; git will not make it for us by failing.

### Why the previous repair did not catch it

`b6a18f1` had already fixed the *neighbouring* defect — the test asserted only
the SHA branch of a function documented as returning "the SHA **or null**", so
the suite could only pass inside a checkout. That repair added:

```js
const inCheckout = fs.existsSync(path.join(__dirname, '..', '.git'));
```

and its commit message said both branches were now asserted **"against the same
condition the tool uses."** They were not. `fs.existsSync('.git')` and
`git rev-parse HEAD succeeds` are different conditions, and they disagree in
exactly the nested case. The test was right and the tool was wrong, so the test
failed — which is the good outcome, but it took extracting the tree to see it.

**That is the reusable part.** A repair that says "now both branches are
checked against the same condition" is making a claim about two pieces of code
agreeing, and that claim deserves the same control any other measurement does.

### The fix

The SHA is only ours if the repository git found **is this directory**:

```js
const toplevel = run(['rev-parse', '--show-toplevel']);
if (path.resolve(toplevel) !== path.resolve(ROOT)) return null;
return run(['rev-parse', 'HEAD']);
```

`gitCommit` is now exported so the property is assertable directly rather than
only through a full `capture()`.

### The test

Builds a **real nested extraction** rather than mocking git, because the defect
is entirely about what git does with a working directory: a copy of the tool at
`<nested>/tools/` has `ROOT = <nested>`, which is not a git toplevel, while git
still answers from the enclosing repository. It carries two controls — that git
resolves a SHA from there at all, and that the nested directory is not its own
toplevel — and it asserts the ordinary case still records this repository's own
HEAD, so the guard cannot have been "fixed" by breaking it.

Observed failing before the fix, with the message naming the outer SHA.

### What is still open

**Nothing in the manifest is self-validating.** `meta.gitCommit` is now correct
or `null`, but a reader has no way to tell from the file alone whether the SHA
describes the tree the capture came from. The `sourceHashes` block is the thing
that could answer that — it hashes `src/engine.js`, `src/app-shell.html`,
`src/scenario-validator.js` and `build.js` — but nothing cross-checks the two.
A capture claiming commit X while its source hashes match commit Y would pass
every check this tool has.

Related: Q30 (the capture was running a partial engine), Q33 and Q20 (two
definitions of one list). All four are the same shape — **an instrument
reporting confidently about something it is not actually measuring** — and
three of the four were found by running the code somewhere other than where it
was written.

---

# Round 6 — re-audit 2 findings (RB-01…RB-09), recorded 2026-09-10

**Verdict: REOPEN / KEEP RELEASE GATED.** Source:
`REAUDIT_2_AUDIT_AND_CLAUDE_HANDOVER_20260910.md`, reviewing
`REAUDIT_PACKAGE_2_20260910.zip` at manifest commit `b6a18f1`. Nine findings —
**seven P1, two P2**. The four RA repairs and every other listed prior repair
took a **bounded PASS**; these nine are new counterexamples, and RB-01
escalates the already-recorded Q23.

**This section is the register, not a re-transcription.** The audit document
carries each finding's full locations, repair guidance and acceptance criteria
and stays authoritative for those. What is recorded here is what the project
owes: the mechanism, the figure reproduced *locally* before anything was
accepted, where the red test lives, and which queue step repairs it.

**Every finding below has a red test in `tests/audit-rb-findings.test.js`**,
`todo`-marked so the suite stays green, each asserting the CORRECT behaviour so
it goes green exactly when its finding is repaired. All ten were **observed
failing** at their intended assertion — not at a control or precondition —
before the markers were added. Step 0 of the audit's own queue; it repairs
nothing.

**Reproduced locally to the cent, independently of the audit's own probes:**
RB-02 (all four figures), RB-03 (`1144.7879526304` against an annuity-equation
oracle), RB-04 (`17854.73` vs `18000`), RB-06 (`12000 → 7212000`), RB-07
(`200000` vs `250000`), RB-08 (age `40.5` selected for a horizon landing on
`41`). RB-01's routing defect reproduces exactly (preTax `112000` vs `100000`);
its ancillary MAGI and tax figures do **not**, because the audit does not
publish every scenario field — stated rather than tuned until they matched.

---

## RB-01 · P1 · Duplicate account ids already misroute contributions and tax deductions

`accounts.find(x => x.id === item.account.id)` returns the **first** match, so a
second account sharing an id never receives its own contribution — and
deductibility is then decided from that wrong destination. Two accounts with id
`same`: a $12,000 taxable contribution lands in the pre-tax 401(k), closing it
at **$112,000 instead of $100,000**.

**The total portfolio still reconciles**, which is exactly why an aggregate
cash check cannot see it — the same shape as FM-03's household-vs-portfolio
distinction.

**This escalates Q23.** That entry deferred rejection to `WARNING` on the
stated grounds that the risk was a future rate-map concern. The contribution
and transfer paths already resolve by id today, so the premise is contradicted
by a current financial error. **D4's "ship as WARNING this sprint" decision
does not survive this.**

**Not repairable by array order:** a duplicate referenced by a transfer cannot
be disambiguated by position without guessing. Queue step 1.

## RB-02 · P1 · The `cashHolding` category has no enforced contract

`cashHolding: "false"` — the string — is **truthy**, survives the real
normalizer unchanged, and is accepted with **no validation issue at all**. It
pins the account's return to zero and makes it the destination for retained
household cash. On a **Roth**:

| end of year | bad flag | control (flag absent) |
|---|---:|---:|
| Roth | $134,602.50 | $110,000.00 |
| taxable retained cash | $0 | $34,602.50 |
| total | $134,602.50 | $144,602.50 |

$34,602.50 of pension surplus deposited into a Roth. Pension income is not IRA
compensation, so this is a routing error independent of any tax-law review.
**The generated Worker reproduces it exactly, with `status:"ok"`** — not a
Node-only or direct-helper artifact.

**Changing the predicate to `=== true` is not sufficient**: `true` on a Roth
still violates the destination contract, which needs taxable class and cash
basis. Queue step 1.

## RB-03 · P1 · Recast output is read as scheduled payment, then the extra is added again

`src/debt-recast.js` deliberately reports `recast.monthlyPayment` as the
**all-in outlay including existing extra principal**. The comparison writes that
into `mortgage.paymentMonthly` and leaves `extraPrincipalMonthly` untouched —
and `projectDebts()` adds the two.

$100,000 at 6%, 20 years remaining, existing $500/month extra, $10,000 lump.
Scheduled P&I after recast is **$644.7879526303554** from the annuity equation;
the field holds **$1,144.7879526304**. The engine then pays $1,644.79/month:
**$19,737.46 a year against $13,737.46 expected.**

Scheduled P&I and total outlay need distinct fields. **Do not redefine the
standalone module's output semantics** without migrating its consumers. Queue
step 3.

## RB-04 · P1 · The interest objective measures a different mortgage

`mortgageInterestOverHorizon()` calls an amortizer that **derives its own
payment** from balance/rate/term, ignoring the entered `paymentMonthly`, the
payoff-age balloon and adjustable-rate events.

$300,000 at 6% with an entered $1,500/month: interest is exactly $1,500/month,
so the balance never moves and a year costs exactly **$18,000**. The objective
reports **$17,854.73**. After a $50,000 lump sum it reports the *same*
$14,878.94 for principal-only curtailment and for recast, because it recomputes
a payment for both — their real first-year interest differs ($14,916.11 vs
$14,878.94).

**Importing `DebtAmortization` on both sides is not agreement:**
`projectDebts()` uses it only for a particular ARM payment calculation. Queue
step 4.

## RB-05 · P1 · The comparison bypasses the invalid-result contract

An account balance of the string `bad` makes `runPlan()` correctly return
`status:"calculation_error"`, code `SCENARIO_NONFINITE_ACCOUNT`, null financial
outputs. The comparison still returns `applicable:true` with a number.

With `monteCarlo`, the same rejected input reports **0% success** — no path was
ever run: the engine rejects before simulation and `num(null, 0)` coerces the
null into zero. **A genuine 0% must stay distinguishable from a failure to
compute.** ARCH-02 at a new consumer. Queue step 2.

## RB-06 · P1 · `investMonthly` confuses dollars with percentages

The module adds `amount × 12` straight onto `account.contribution`. The engine
reads that field as a **percentage** when `contributionMode === "salaryPct"`.

Salary $120,000, taxable account contributing 10%: applying $500/month changes
the field from `10` to `6010`, and annual contributions from $12,000 to
**$7,212,000** — an increment of **$7,200,000 instead of $6,000**. No
contribution cap limits a taxable destination.

A second reproduction: a household already retired sees the field increase by
$6,000 and contributions change by **zero**, because planned contributions stop
with employment while the extra-mortgage-payment branch keeps operating.

**Do not repair by converting every salaryPct account to dollar mode** — that
destroys its salary-linked behaviour. The additional dollars want to be a
separate scheduled cash flow with its own start/end, funding source and
destination. Queue step 5.

## RB-07 · P1 · "Ending net worth" silently becomes portfolio-only scoring

The objective reads `row.networth` without requiring `advanced.networthOn`,
which **defaults to false** — and with it off, that field is portfolio value
only.

Opening investments $200,000, mortgage $300,000, $50,000 deployed either way,
**horizon zero**. True post-action net worth is **−$50,000 in both branches**.
The comparison reports **$200,000 versus $250,000** and declares investing the
winner by $50,000, never counting the mortgage reduction. Horizon zero isolates
it: no return, tax or payment schedule can explain the difference.

Either require a debt-inclusive metric or refuse. **Do not silently flip the
user's unrelated scenario setting to obtain an answer**, and portfolio-only
scoring, if wanted, needs its own name. Queue step 6.

## RB-08 · P2 · Fractional horizons use row count as elapsed time

`rowAtHorizon()` selects `rows[Math.floor(horizonYears)]`, but row zero is an
opening snapshot and the first period can be fractional. Starting at age 40.5
with ages `[40.5, 41, 42]`, a **0.5-year horizon lands exactly on the age-41
row** and the function returns age **40.5**. Meanwhile the interest objective
uses six months, so two objectives in the same comparison stop sharing a time
window.

Narrower than "every fractional start is wrong": the documented "last row
inside the horizon" convention can legitimately pick 41 for a one-year horizon
from 40.5. The defect is skipping a row that sits exactly on the request.
Queue step 6.

## RB-09 · P2 · Schema drift protection is materially narrower than claimed

Two independent omissions:

1. The catalogue describes `defaultPlan`, where accounts, debts, incomes,
   stages and other assets are **empty arrays** — literally
   `accounts[] : (empty by default)`. Every field of those records is outside
   the contract.
2. It describes `rows[0]` and the first successful result per mode only. The
   **ordinary** row carries 24 fields against the opening row's 22, omitting
   `calculationError` and `calculationErrorCode`; rejection and
   calculation-error variants are not represented at all.

**The audit's counterexample, reproduced:** adding `newFinancialField` to row 1
and deleting its `calculationErrorCode` produces an **identical** catalogue.
That directly contradicts S3 task 9's claim that adding or removing a field
anywhere fails the drift test — the claim was true for the opening row and for
scalar plan fields, and false for everything else.

Keep default-value drift separate from schema drift. Queue step 7.

---

## What step 0 also did

**Preserved known-good state.** `tools/baseline-20260910-pre-RB-repairs.json`
— format 2, 33 scenarios, corpus hash `aeca9e754674bd69…`, input hash
`8e85d21d2b95bc03…` — captured before any repair, so every subsequent
checkpoint's financial movement is measurable against a stated "before". Same
role R1.4 played for the last round.

**And found that the audited artifact cannot be reproduced.** The reviewed ZIP
hashed `952648d6…`; it was overwritten locally when the package was re-cut to
ship the S3 handover, and rebuilding from the same commit `b6a18f1` yields
`904b7bb8…` — **the packaging script is not byte-reproducible**, because zip
entry timestamps come from extraction time. The script's own header claims
tracked-only packaging "means the package is reproducible from a commit"; that
is true of contents and false of bytes.

**The evidence itself is intact.** The audit's three published source hashes
were checked against the blobs at `b6a18f1` and all three match, so the
reviewed content is pinned by commit and independently verifiable. Only the
envelope hash is unrecoverable. Recorded here rather than quietly re-cut,
because §7 says to preserve that ZIP as the evidence baseline and it is the
one instruction step 0 could not carry out.

## 2026-09-10 — Q38. The seeded corpus harvests its strategy list by regex from engine source

**Found by tripping it, during the P2 attempt. Guard strengthened; the coupling
itself is still open.**

`tests/lib/scenario-generator.js` builds its withdrawal-strategy enumeration by
running `/strategy===?"([a-zA-Z]+)"/g` over `src/engine.js`, then draws
`strategy: d.pick(STRATEGIES)`.

**What that means.** Any edit that removes or rewords a `strategy==="x"`
comparison silently shrinks the enumeration, `d.pick()` chooses differently at
every seed, and **the entire generated corpus changes with no semantic cause.**

**How it presented.** P2 collapsed
`offset = p.retirement.strategy==="incomeFirst" || p.retirement.incomeOffset`
to `offset = true`. That expression held the only occurrence of `"incomeFirst"`
in the engine. The harvest quietly returned eight names instead of nine, and the
resulting baseline diff showed 12 scenarios moving with figures that looked like
a severe financial regression — one scenario's spending appeared to jump from
$155,228 to $77,121,451. None of it was real. Isolating `incomeOffset` on the
unmodified engine changed that scenario's spending by **nothing at all**, and a
field-by-field diff of the generated plans showed a single moved field:
`strategy`, `floorCeiling` -> `fixedReal`.

**The guard that was there did not guard.** It read
`if (STRATEGIES.length < 5) throw` — a check that survives losing four of nine.

**Open.** The regex harvest is a second definition of a list the engine owns,
the same shape as Q20/Q33 (the Worker binding array) and the `retainedCashOrder`
blindness. The durable repair is for the engine to DECLARE its strategies and
for the generator to read that declaration, with a test asserting the
declaration matches the dispatch. Until then the exact-set check is the
trip-wire.

## 2026-09-10 — Q39. Q27's CRLF condition is not latent: it fails 25 tests on a fresh checkout

**Demonstrated, not reasoned about.**

Q27 recorded that `core.autocrlf=true` with no `.gitattributes` means git writes
CRLF into every working tree, and predicted that "any future code that matches
on `\n`, hashes file bytes, or compares source text will hit the same thing."

It already does. Running `git checkout -- src/` — an ordinary operation —
restores `src/engine.js` and `src/scenario-validator.js` with CRLF endings, and
**25 tests fail immediately**, across `audit-r2-import-records`,
`audit-fm04-fm08-result-contract` and `R3-UI-001`. The mechanism is a single
assertion shape that several DOM harnesses share:

```js
assert.ok(noFooter.startsWith("'use strict';\n"));   // false when the file is CRLF
```

Converting the three sources to LF makes all 25 pass again with no other
change. The repository's committed content is fine; what is broken is what git
puts on disk.

**Why it matters now.** These are the harnesses that assemble the live app for
UI-contract testing, so on a fresh clone the project cannot verify its own
result contract. It also means a green suite here is partly a property of how a
working tree happened to be written, which is not a property anyone chose.

**Consequence for P5.** The decision register already sequences `.gitattributes`
behind both audits closing, because normalising rewrites every tracked file and
would invalidate the pre-repair baseline and the S3 package manifest. That
sequencing stands. This entry records that the cost of waiting is real and
measurable rather than theoretical, and that the normalisation should be the
first thing done once both audits close.

## 2026-09-10 — Q40. The debt ledger covers deterministic modes only

**Recorded while implementing P9. Not a defect; an undecided semantic.**

P9 exposes `debtPaymentsTotal`, `debtInterest`, `debtPrincipal` and
`debtHousing` on the row, and they reconcile exactly:

```
debtPaymentsTotal === debtInterest + debtPrincipal + debtHousing
```

verified across all 210 debt-bearing rows in the corpus.

**Monte Carlo rows do not carry them,** and deliberately so. Its rows are
percentile aggregates across runs, and "the 50th-percentile interest paid" has
no obvious meaning: the median of a component need not come from the same run
as the median of the total, so an aggregated breakdown would not reconcile with
the aggregated payments the way the deterministic one does. Publishing four
fields that silently fail their own identity would be worse than not
publishing them.

**Open.** Either (a) aggregate each component independently and state plainly
that the identity does not hold across percentiles, (b) carry a single run's
whole breakdown at each percentile of the total, so it reconciles but is a
sample rather than a quantile, or (c) leave Monte Carlo without a debt
breakdown and say so in the model assumptions. This needs deciding before the
household cash-flow ledger is built, because the ledger inherits the choice.

**Status: DECIDED 2026-09-13 (the owner) — (b).** Monte Carlo carries one real
run's whole breakdown at each percentile of the total: it reconciles, and it
is labelled a sample rather than a quantile, with deterministic tie handling.
It is built in S103 with the household cash-flow ledger that inherits it
(`S103_TASK_CHECKLIST.md` 9.7). Until then Monte Carlo rows carry no
breakdown, as `MODEL_ASSUMPTIONS.md` §6 says. Decided, not closed: the
repair has not landed.

## 2026-09-10 — Q19 CLOSED, Q16 CLOSED: the ratified choices are now public

**P3 and P4** ratified Q19's two allocation choices as they stand -- pro-rata
tax allocation across cash pools, and the expectation rather than an RNG draw
for an account the engine synthesizes mid-period. Neither needed a code
change; both needed to stop living only in a source comment.

**P1** closed Q16 with an interim rule (pre-projection claims index at the
configured COLA) and a named successor blocked on a calendar anchor the engine
does not carry.

All four are now recorded in `MODEL_ASSUMPTIONS.md`, created for this purpose,
which is what the re-audit meant by "record them in the eventual public model
assumptions". That document also captures P2's removal of the income-offset
toggle, the 1.5% imputed-dividend trap, and the boundaries of the debt ledger
(Q35 partial, Q40).

Its last section states plainly what is still missing: a household cash-flow
ledger. The net-worth identity cannot establish that a contribution or a tax
payment was actually funded, and two findings in this re-audit hid behind that.

## 2026-09-10 — Q41. A verification script reported a vacuous loop as a finding

**Raised as CL-07 by the S2 closure re-audit. Confirmed here, and the mechanism
is worse than the finding.**

The S2 closure handover claimed, as its headline coverage result, that **"not one
row anywhere produces a non-zero RMD"**. The closing baseline contains **25 such
rows across three scenarios**: `golden:rmd-and-roth-conversion` (12), `seed:2`
(3), `targeted:collision-rmd-retained-cash` (10).

**How.** The check read:

```js
cb.corpus().forEach(x => {
  const r = x.result;          // corpus() entries are {name, plan} -- no result
  if (!r || !r.rows) return;   // so this skipped all 33 entries
  r.rows.forEach(row => { if ((row.rmd || 0) > 0) anyRmdRow++; });
});
```

It printed `0`, and the zero was read as evidence of absence rather than as
evidence of nothing having been examined.

**This repository already documents that exact defect.**
`tests/capture-baseline.test.js` carries a test rewritten for it, whose comment
reads: *"a loop-with-a-guard over a collection that can legitimately be empty
needs a count assertion or it cannot speak for anything."* The script had no such
assertion.

**Where it spread.** Three delivered documents, one of them inside a package
already sent to an external auditor mid-review, plus a commit message and the
project's own reporting. All three documents are corrected and carry a visible
correction notice.

**The rule this earns.** A verification script needs a control exactly as much as
a test does. Any ad-hoc measurement whose conclusion is *"zero occurrences"* must
first assert that it examined a non-zero population, and the corrected counts in
those documents now lead with `CONTROL rows visited: 1016`.

**What survived.** The other four reachability counts were computed from
`e.plan`, which corpus entries do carry, and all four hold: no duplicate account
ids, no invalid cash-holding flags, no survivor paired with a stateful spending
strategy, and nine QCD requests none of which reach an RMD row. The QCD
conclusion was *correct* but its evidence was the same vacuous loop -- it held by
luck, and is now measured.

**The corrected reading is also sharper than the original.** The corpus reaches
the RMD path in 25 rows and asserts nothing about the outcome. That is exactly
the gap CL-02 exploited: a reserved obligation eroded by market losses,
distributing $3,252.03 against $4,065.04 owed, reported as ordinary success.
"Cannot reach" would have been a coverage problem; "reaches without asserting"
is a stronger and more useful criticism.

## 2026-09-11 — Q42. An entire audit ID space was never tracked, and the cards that had no second name went unworked

`ALL_AUDIT_SOLUTIONS_AND_TEST_PLAN_FOR_CLAUDE_20260910.md` is the consolidated
S3 external audit brief: roughly 39 repair cards across `S3-01`…`S3-16`, the
carried `Q` questions, `RB`/`RC`, `ST2`, `EXT`, `RISK-01` and `ZERO`. It arrived
on 2026-09-10 and **was never committed** — it lived only in the untracked
`Handover temp/`. Committed to the repository root in the same change as this
entry, matching where every other audit source sits.

### What that cost

**Not one of `S3-01`…`S3-16` appears in any tracked document.** Grepping the
whole repository outside `Handover temp/` returns zero hits for `S3-01`,
`S3-03`, `S3-05`, `S3-06`, `S3-07`, `S3-08`, `S3-09`, `S3-15` and `S3-16`.

The work from this brief did get done — but **only where a card happened to
coincide with another family's ID**. S3-02 was repaired as EXT-02, S3-13 as B2,
S3-10 tracked as RC-03, S3-11/S3-12 as the excluded-module routing, and
Q32/Q33/Q35/Q36 closed as decisions P7/P10/P9/P8. Every card carrying a second
name was worked. Every card carrying only an `S3-0x` number was not.

This is an ID-space collision, not a prioritisation decision, and it is
invisible from the inside: the covered cards make the family look handled. The
three round closures — round 1's fourteen, the S3 round-2 queue at `3b6865c`,
and CL-01…CL-07 — are all accurate about their own families and silent about
this one.

### Disposition, verified 2026-09-11 against `21fe75d`

Each OPEN below was reproduced, not inferred.

| Card | State | Evidence |
|---|---|---|
| S3-01 | **not verified** | `corpusInputHash()` is computed, stored in `meta`, and `assertComparable()` runs on both diff paths — but neither is exported, so the refusal behaviour was not exercised |
| S3-02 | closed | repaired as EXT-02 |
| S3-03 | OPEN, **repaired 2026-09-11 at `690af84`** | the capture source inventory holds **4 entries** — engine, app-shell, scenario-validator, build.js — and **no debt module**, though the bundle registers eight |
| S3-04 | closed | the 1929/1966/2000 fixtures now carry $1,500,000 across two accounts with $60,000 spending, against the brief's "no accounts and no portfolio" |
| S3-05 | OPEN, **repaired 2026-09-11 at `a69d13d`** | `tests/worker-parity.test.js` still calls `JSON.parse(JSON.stringify(...))` at five sites before canonicalising, so `NaN` to `null` and `-0` to `0` escape both comparison directions |
| S3-06 | OPEN, **repaired 2026-09-11 at `9e5b6fd`** | `tests/near-miss-survivor-sweep.test.js:190` — `if (typeof before !== 'number' \|\| typeof after !== 'number') continue` is the documented "damaged output classified immaterial" path |
| S3-07 | OPEN, **repaired 2026-09-11 at `e965dae`** | `tests/networth-reconciliation.test.js` contains no finiteness guard at all, so a `NaN` operand makes the tolerance predicate quietly false |
| S3-08 | **not reproduced** | the file asserts no median accounting identity, so the described defect is not present in it today |
| S3-09 | closed | the nested-extraction test builds a real fixture; `6c8df8d` repaired its portability inside a delivered package |
| S3-10 | excluded | same defect as RC-03, under P19 |
| S3-11, S3-12 | excluded | `src/mortgage-vs-investing.js`, under P19 |
| S3-13 | closed | repaired as B2 |
| S3-14 | n/a | never issued; the brief records it as intentionally unused |
| S3-15 | OPEN, **repaired 2026-09-11 at `c765929`** | `balance: "bad"` and `balance: NaN` both return `payoffMonth 0`, which reads as *paid off*; `annualRatePct: "bad"` returns `totalInterest 0`. No status field distinguishes any of it from a valid result |
| S3-16 | OPEN, **repaired 2026-09-11 at `c765929`** | `maxMonths: 1e12` exhausts the heap rather than refusing — it killed the probe process, and did so again under a 96 MB cap |
| Q29 | closed | the spouse-COLA fixture validates with zero issues; the income type is supported |
| Q34 | OPEN, **repaired 2026-09-11 at `6c3259a`** | `rewriteSiblingRequires()` makes three substitutions where one is correct — require-like text in a comment and in a string literal are both rewritten |

**Stamped 2026-09-12, adopting the owner's convention.** Each repaired row now names
the commit it was true at, rather than only a date. A stamped claim is never
wrong, only dated — and it is self-reporting, because a reader seeing an old
stamp knows to re-derive, where a bare claim gives no signal at all.

Which this table already needed. **Q34's row is superseded:** the scanner it
describes was replaced wholesale at `8cbe561` (FCR-01), which put three
divergent lexical rule sets behind one tokenizer and made the grammar fail
closed on any `require` it cannot resolve, then hardened again at `9f1f876`
(P5-01). The row remains accurate about `6c3259a` and describes code that no
longer exists. Read it as history, not as the current state of `build.js`.

### Why S3-15 and S3-16 are the sharp ones

Every other open card is in test or capture infrastructure. These two are in
`src/debt-revolving.js`, which **P10 deliberately kept bundled** — it is not in
the P19 exclusion. So unlike the eight excluded-module findings, an unbounded
allocation and "invalid input reads as debt-free" reach the shipped artifact.

### The generalisable point

An audit's findings are only as durable as the ID space that carries them. This
brief consolidated six previous documents and renumbered as it went; the
renumbering is what made it useful to read and what made it impossible to track,
because every other record in this project keys on the original families. A
consolidated document needs its own cross-reference committed alongside it, or
it silently becomes a second definition of what is open — the same failure shape
as Q20, Q33 and Q38, one level up from code.

---

## 2026-09-11 — Q43. Forced debt payoff at `payoffAge` can dump an unbounded lump sum onto retirement spending

**Not a judgment call — a discovered defect, undecided.** Filed here because
this document is the project's running observation log and no
defect-tracking document exists at this scope yet; unlike every entry above,
this one records something found, not a fork resolved. Full trace and
reproduction script live in `SIMULATION_LOG.md` (Batch 1, 2026-09-11) and this
session's own transcript.

**The defect.** A newly-added debt defaults `paymentMonthly` to `0`
(`normalizeDebt()`, `src/app-shell.html:510`), and nothing validates or warns
that a payment doesn't cover accruing interest — `src/scenario-validator.js:658`
only warns on a *negative* payment. `projectDebts()` (`src/engine.js:784`)
correctly negative-amortizes an underpaying debt (intentional, covered by
`tests/debt-projection-divergence.test.js`, the B-6 fix), but when the debt
reaches its `payoffAge`, the engine forces the **entire remaining balance** —
however inflated by years of negative amortization — to be paid as one lump
sum out of retirement spending (`debtFlow.retirementPayments` feeds
`requested` in `simulatePlan`). `tests/contribution-and-debt-projection.test.js:184`
tests that the forced payoff zeroes the debt's own balance, but never follows
the consequence into `runPlan()`'s cash flow.

**Reproduction.** A single $20,000 debt at 20% APR with `paymentMonthly: 0`,
`payoffAge: 75`, in a plan retiring at 65: balance reaches ~$123M by age 74,
then forces a ~$150.7M withdrawal at age 75 that wipes a ~$70M portfolio to
exactly $0 with a $93.9M unmet shortfall. `calculationErrorCode` stays `null`
throughout — it reads as an ordinary underfunded-retirement failure, not as
what actually happened.

**Why it's reachable, not just a constructed edge case.** `paymentMonthly: 0`
is the literal out-of-the-box state of every debt a user adds through the UI.
Nothing in the form, the validator, or the calculation flags that a payment
doesn't cover interest until the number has already run away for years.

> **MITIGATED 2026-09-12 — not repaired (external closeout CQ-3b).** `c71c24d`
> adds a validator warning, `PAYMENT_BELOW_INTEREST`, when a debt with a positive
> balance and rate has an **explicitly zero** `paymentMonthly`. It changes nothing
> in the engine: the forced payoff at `payoffAge` still applies unconditionally,
> and a positive-but-insufficient payment is deliberately outside the warning,
> because about a third of generated corpus debts underpay their own interest
> (Q54). Candidate (b) — capping or flagging the forced payoff — is untouched.
> **Carried to S5.** The underlying forced-payoff behaviour is unresolved, and the
> round-6 constraint stands: the accepted debt cash-flow contract must be defined
> before any refusal behaviour is. Everywhere this was called "repaired", read
> "mitigated".

**Status: REPAIRED 2026-09-14, scoped narrower than the 2026-09-13 decision below.** The exact-zero-payment forced payoff at `payoffAge` now returns `DEBT_ZERO_PAYMENT_FORCED_PAYOFF`, a calculation error, instead of an unflagged withdrawal (`f5be69d`). The owner's 2026-09-13 decision was "(c), both — warn on underpayment and cap/flag the payoff"; asked to choose the exact form since every option moves the frozen control corpus differently, the owner narrowed to **(i): flag only the case already warned on** (payment explicitly zero on a positive balance and rate) — baseline-safe, no control-corpus debt has this shape. **Widening to any underpayment (the decision's original "warn" half) is filed as `Q76`, rebuild scope, not S5 work.** The `includePayment` default mismatch is filed separately as `Q75`. Full record: `S5_TASK_CHECKLIST.md` block 2b.3–2b.5.

**Status, superseded above: DECIDED 2026-09-13 (the owner) — (c), both.** Warn when `paymentMonthly`
doesn't cover the debt's own accruing interest, *and* cap/flag the forced
payoff at `payoffAge`. Full record, including the `includePayment` default
mismatch found the same day (the normalizer defaults it `true`, the raw
engine treats an absent field as `false`), is `S5_TASK_CHECKLIST.md` block
2b.3 / Task 00 item 2. Decided, not repaired: neither half has landed.
*(As it stood before the decision:)*

**Original status, retained as history: OPEN.** Not yet triaged into a disposition (repair vs. accepted
behavior vs. deferred). Candidate directions, undecided: (a) warn when
`paymentMonthly` doesn't cover the debt's own accruing interest, (b) cap or
flag the forced payoff at `payoffAge` rather than applying it unconditionally,
or (c) both. Whoever picks this up should also decide whether it needs to go
through the S2/S3 exclusion-table routing in `S3_AUDIT_DISCLOSURE_ADDENDUM_20260910.md`
§5 — `projectDebts()` is called directly from `simulatePlan()`, not through
`mortgage-vs-investing.js` or `debt-strategy-adapter.js`, so it is **not** one
of the P19-excluded modules and is reachable from the live app today.

**Addendum, 2026-09-11, measured at `a3055d2`: the mechanism across portfolio
sizes, because
two sessions each mis-generalised it from a single fixture.** The entry above
reports one instance correctly; the general rule is *withdraw up to whatever
the portfolio holds, and the remainder becomes shortfall*. Same debt
throughout — $20,000 at 20% APR, `paymentMonthly: 0`, `payoffAge: 75`, age 30
to 100, $40,000 spending — varying only the portfolio:

| portfolio | growth | portfolio at 74 | withdrawals at 75 | shortfall at 75 |
|---|---|---|---|---|
| $200,000 | 0% | $0 | $0 | $150,515,465 |
| $5,000,000 | 0% | $4,640,000 | $4,640,000 | $145,875,465 |
| $5,000,000 | 7% | $97,646,693 | $101,006,524 | $49,508,941 |
| $200,000,000 | 0% | $199,640,000 | $150,515,465 | $0 |

The last row is the one that settles it: given enough portfolio, the **entire**
forced payoff is withdrawn and the shortfall is zero. The money is genuinely
sold, not merely recorded as unmet.

Recorded because both sessions reviewing this independently reported
"withdrawals at the payoff age is $0, nothing is sold" — true, but only of a
portfolio already dead by 74, which is the least interesting case and the one
both happened to construct. A repairer told that would look at the shortfall
accounting, when the withdrawal path is where the money actually moves. The
control neither review had was a portfolio that survives to the payoff age.

A third claim, also retracted: the failure mode does **not** change with
horizon. `calculationErrorCode` is `null` at `endAge` 80 and 100 alike. An
earlier report of `TAX_QUOTE_NONFINITE_ACCOUNT` at long horizons came from a
probe whose account was built with `Object.assign({}, plan.accounts[0], …)`
against a default plan that has **no accounts** — so the account carried no
`type` and no `taxClass`, and the tax solver had nothing to quote against.
A malformed fixture, not a property of the engine.

## 2026-09-11 — Q44. `networthOn: false` doesn't stop `homeEquityFallback` from spending an asset the net-worth display claims isn't counted

**Also a discovered defect, not a judgment call.** Full trace in
`SIMULATION_LOG.md` (Batch 6, 2026-09-11).

**The observation.** With `advanced.networthOn: false`, the `networth` row
field is always exactly equal to `total` (the liquid portfolio) — correct,
since that flag's stated job is "should assets/debts count toward net worth."
But `retirement.homeEquityFallback` (`src/engine.js:1552`) is not gated on
`networthOn` at all: once the portfolio hits $0, it keeps drawing real cash
out of `otherAssets` regardless of that flag. In the traced repro, a
household draws down $700k+ of home equity via `nonPortfolioDraw` over 13
years while `networth` reports a flat `$0` throughout.

**Severity, honestly stated.** Nothing here is numerically wrong — every
value is finite, sane, and reconciles; this is not in the same class as Q43.
The concern is scope/naming: a toggle whose label reads as "should this data
affect the plan" only ever controlled one summary field's display, while the
underlying `otherAssets` data fully participates in retirement funding either
way, on or off.

**Status: DECIDED 2026-09-13 (the owner) — (b), real scope leak.** Gate
`homeEquityFallback` on `advanced.networthOn` — a behaviour change; predict
the diff first (ground rule 10). Full record: `S5_TASK_CHECKLIST.md` block
2c.1 / Task 00 item 3. Decided, not repaired: the fix has not landed.
*(As it stood before the decision — two readings:)*

**Status: OPEN, undecided between two readings.** (a) Working as intended —
`otherAssets` always fund retirement once entered, and `networthOn` was
never meant to gate anything but the net-worth stat's display — in which case
the fix is documentation/labeling, not code. (b) A real scope leak — a user
who disables net-worth tracking without deleting their asset data has no way
to know the simulation still relies on it, in which case `homeEquityFallback`
should check `networthOn` too. Whoever triages this should pick one and, if
(b), decide whether that's a behavior change requiring the same review as any
other live-path fix.

---

## 2026-09-11 — Q45. A negative cross-asset correlation silently produces a **zero-volatility** portfolio, and adding asset classes makes it easier to hit

**Found while sweeping the three engine specification documents against sprint
coverage.** `MARKET` delivery-sequence P1 asks for "Correlated Monte Carlo —
calibrated matrix is positive semidefinite and reproducible," and executive
decision 7 warns that a covariance matrix can come out non-positive-semidefinite.
Checking whether that was already handled found a different route to the same
failure, in shipped code.

### What the engine does

`accountVolatility()` (`src/engine.js`, symbol — around `:733`) models
cross-asset correlation as **one scalar applied to every off-diagonal pair**:

```js
for (var i=0;i<weights.length;i++)
  for (var j=0;j<weights.length;j++)
    variance += weights[i]*weights[j]*vols[i]*vols[j]*(i===j?1:p.advanced.correlation);
return Math.sqrt(Math.max(0,variance))
```

That is an **equicorrelation matrix**. It is positive semidefinite only when
**rho >= -1/(n-1)** for n asset classes. Below that floor the variance can go
negative, and `Math.max(0, variance)` silently clamps it.

**Nothing enforces the floor.** `src/app-shell.html:324` offers
`min="-1" max="1" step="0.05"`, and `scenario-validator.js:628` is
`checkRange(c, advanced.correlation, 'advanced.correlation', -1, 1)`. Both
accept the full range regardless of how many asset classes exist.

### Measured, by running the real function

The shipped `accountVolatility()` was extracted from `src/engine.js` and
executed directly. Default asset classes are the three in `defaultPlan` —
stocks 18.5%, bonds 7%, cash 1% — so the floor is **-0.5**.

| Allocation | rho = 0 | rho = -0.5 (floor) | rho = -1 (UI minimum) |
|---|---|---|---|
| 60/30/10 | 11.2973% | 10.1489% | 8.8527% |
| 33/33/33 | 6.6018% | 5.1343% | 3.0231% |
| 20/50/30 | 5.1020% | 3.3045% | **0.0000%** |

**A conservative 20/50/30 portfolio at rho = -1 has exactly zero volatility.**

### The sharper case: the floor rises as the user adds asset classes

Asset classes are user-editable. With equal weights and equal volatilities:

| n | PSD floor | rho = -0.3 | rho = -0.2 |
|---|---|---|---|
| 3 | -0.5000 | 3.651% | 4.472% |
| 4 | -0.3333 | 1.581% | 3.162% |
| 5 | -0.2500 | **0.000%** | 2.000% |
| 6 | -0.2000 | **0.000%** | **0.000%** |
| 8 | -0.1429 | **0.000%** | **0.000%** |

**With five asset classes, rho = -0.3 gives a risk-free portfolio — but only
with equal weights and equal volatilities, which is how this table was built.**
See the MEASURED section below: with realistic weights and real volatilities the
clamp does not fire until about rho = -0.5, and **the band between the PSD floor
and the clamp is the actual finding.** The unqualified version of this sentence
was wrong, was relayed, and is corrected here rather than removed.

### Why it matters, and why it is the familiar shape

In Monte Carlo a zero-volatility portfolio has no downside sequence at all, so
**every path is the mean path and the success rate goes to ~100%**. The error
direction is the dangerous one: it **overstates** the plan's safety.

Worse than the clamp is the band above it. Between the PSD floor and the point
where variance goes negative, the engine returns a **finite, plausible-looking
volatility computed from a mathematically invalid matrix** — no clamp, no
warning, nothing to notice. That is FC-02's shape exactly: a finite wrong answer
is harder to catch than an infinite one.

And it is Q43/Q44's shape at the result-contract level — reachable from the UI,
silently wrong, `calculationErrorCode` untouched.

### MEASURED 2026-09-11 — and the measurement **corrects this entry's original emphasis**

*Subtask 2d.2 run. The engine was loaded exactly as `tools/capture-baseline.js` loads it and the real `runPlan()` was called in `monteCarlo` mode, 3,000 paths, seed 12345, `strategy: "fixed"`, on the golden base accounts ($250k taxable / $400k 401k / $90k Roth). Spending was calibrated by bisection so that **rho = 0 lands at 70% success** — see "why calibration was necessary" below.*

**Three asset classes (18.5 / 7 / 1), allocation 60/30/10, spending $108,878. PSD floor −0.5.**

| rho | successRate | Δ vs rho=0 | failureAge |
|---|---|---|---|
| 0.5 | 66.47% | −3.57 pp | 88 |
| 0 | **70.03%** | — | 89 |
| −0.3 | 72.73% | +2.70 pp | 90 |
| −0.5 *(floor)* | 74.40% | +4.37 pp | 90 |
| −0.7 **non-PSD** | 76.30% | +6.27 pp | 91 |
| −1.0 **non-PSD** | 79.90% | +9.87 pp | 91 |

**Five asset classes (18.5 / 19 / 17 / 7 / 1), allocation 35/20/10/25/10, spending $115,311. PSD floor −0.25.**

| rho | successRate | Δ vs rho=0 | failureAge | volatility |
|---|---|---|---|---|
| 0.5 | 58.90% | −11.13 pp | 87 | — |
| 0 | **70.03%** | — | 91 | 7.895% |
| −0.2 | 78.73% | +8.70 pp | 94 | 6.047% |
| −0.25 *(floor)* | 81.67% | +11.63 pp | 95 | 5.489% |
| −0.3 **non-PSD** | 85.23% | **+15.20 pp** | 95 | **4.867%** |
| −0.5 **non-PSD** | **100.00%** | **+29.97 pp** | **none** | **0.000% — clamped** |

### The correction: the clamp is the footnote, the silent band is the finding

**This entry originally led with the clamp and said "with five asset classes, rho = −0.3 gives a risk-free portfolio." That sentence is wrong as written** — it is true only for the *equal-weight, equal-volatility* case the table above it was constructed from, and that qualifier did not survive into the sentence. With five **realistic** asset classes the clamp does not fire until about **rho = −0.5**:

| n = 5, clamp fires at | |
|---|---|
| equal weights, all volatilities 10% | rho ≈ −0.30 |
| equal weights, real volatilities 18.5/19/17/7/1 | rho ≈ −0.40 |
| realistic weights 35/20/10/25/10, real volatilities | rho ≈ −0.50 |

**So −1/(n−1) is where the *matrix* becomes invalid, not where the *clamp* fires.** The clamp fires later, and how much later depends on weights and volatilities — the variance is dominated by the high-volatility assets, so an unequal portfolio tolerates a more negative rho before the sum goes negative.

**Which means the gap between the two bounds is the actual defect**, and it is larger and more reachable than the clamp:

- At **rho = −0.3 with five realistic classes**, the matrix is already non-positive-semidefinite. The engine returns **4.867%** — an entirely plausible number that nothing flags — and the success rate is **+15.20 pp** higher than it should be. **No clamp, no warning, no signal of any kind.**
- The clamp at rho = −0.5, by contrast, is **detectable after the fact**: `q10` equals the median **exactly** ($24,549,567 for both) and `failureAge` is `none`. A degenerate distribution leaves fingerprints. A merely-invalid one does not.

**That inverts the severity argument rather than weakening it.** The original framing — a dramatic clamp to zero — describes the case that a reviewer could catch. The real exposure is the band above it, where the answer is wrong by fifteen percentage points and looks entirely ordinary. This is FC-02's lesson again, and the entry stated the lesson while committing the error: *a finite wrong answer is harder to catch than an infinite one.*

**Also worth keeping: correlation is a high-leverage input even inside the valid range.** At five classes, moving rho from 0 to −0.25 — both legal, both PSD — moves success by **+11.63 pp**. That strengthens direction (d), a calibrated matrix, relative to the three patch options: a single scalar this sensitive is carrying more weight than a single scalar should.

### Why calibration was necessary, and the corpus finding it produced

**The golden fixture could not show any of this.** At its own spending it sits at **98.8%** success, where the metric is saturated against the ceiling — the full rho sweep moved it only 98.8% → 99.95%, which reads as noise. Spending had to be bisected up to ~$109k–$115k to put the baseline in the sensitive band at all.

**That is a corpus finding, not just a measurement detail.** A Monte Carlo corpus whose scenarios all succeed ~99% of the time **cannot detect a defect in volatility**, because volatility only expresses itself through failure. It is the same shape as **CL-07** — the three historical sequence-risk fixtures carrying zero investments and zero spending, and therefore not exercising sequence risk at all. Routed to **S4 task 4**.

### Not fixed, deliberately

This moves financial output, so it needs its own change with its own before/after
per the one-output-moving-change-per-commit rule. It is also partly a **product
decision**, which is why it is recorded rather than repaired:

**Status: DECIDED 2026-09-13 (the owner) — (d), replace equicorrelation with a
real calibrated matrix.** Explicitly a feature build (`MARKET` P1), deferred
to S103 rather than closed in S5 — the `MARKET` P1-shaped vectors get
recorded as `UNSUPPORTED` (retired from `UNREPRESENTABLE`, S5 task 4.3,
2026-09-14) in S5 task 5.10, and `Math.max(0,
variance)` stays the only guard for the life of the old engine. Full
record: `S5_TASK_CHECKLIST.md` block 2d.3 / Task 00 item 4. Decided, not
repaired — and nothing in S5 touches this.
*(As it stood before the decision — not mutually exclusive:)*

- **(a) Reject below the floor.** Make the validator's range depend on
  `assetClasses.length`: `checkRange(..., -1/(n-1), 1)`. Honest and cheap, but
  the bound moves when a user adds a class, which can retroactively invalidate a
  saved scenario — that needs a migration answer.
- **(b) Clamp to the floor with a warning** rather than clamping variance to zero
  silently. Keeps every scenario runnable; changes results for anyone currently
  below the floor.
- **(c) Set `calculationErrorCode` and refuse**, treating it as the
  result-contract failure it is. Strictest, and consistent with what Q43 concluded
  about silent insolvency.
- **(d) Replace equicorrelation with a real calibrated matrix** — this is
  `MARKET` P1, a feature build rather than a correction, and it is the only option
  that makes the question go away permanently.

**Whichever is chosen, `Math.max(0, variance)` must stop being the only thing
standing between an invalid input and a silent answer.** A clamp that converts a
mathematically impossible input into a plausible number is not a guard.

**Reproduce:** extract `accountVolatility` from `src/engine.js` and call it with
`advanced.assetsOn = true`, five asset classes, equal allocation, and
`advanced.correlation = -0.3`.

---

## 2026-09-12 — Q46. The senior tax deduction's documented 2028 expiration is not implemented anywhere

**A discovered defect, not a judgment call**, same shape as Q43/Q44. Full
trace in `SIMULATION_LOG.md` (Batch 12, 2026-09-12).

**The defect.** `RULES.federal.seniorDeduction` (the embedded 2026 rules
JSON, `v2b-rules-2026`) carries `"expiresAfter": 2028`. `seniorDeduction(magi,
ages, filing)` (`src/engine.js:164`) has an arity of exactly 3 — no year or
date parameter exists anywhere in its signature or body, so the function
structurally cannot know what calendar year is being evaluated and cannot
implement a sunset. It applies the full deduction, MAGI-phased exactly as
documented, in every single year of every projection, forever.

**Confirmed, not just inferred from the signature.** The phaseout formula
itself is correct at every point checked: $6,000 per eligible person (age
65+) under a $150,000 MFJ MAGI; still the full $6,000 exactly at the $150k
phaseout start; fully phased to $0 at $250k MAGI (6% of the $100k excess =
exactly $6,000). Ran a live 40-year household (MFJ, age 66 retiring at 66,
horizon to age 95 — crossing 2028 in year 2 of the projection): the
deduction keeps reducing taxable income for the full ~30 years past 2028
with no discontinuity anywhere in the run.

**Why this is a different class of finding from the inert-field observations
already noted in `SIMULATION_LOG.md`** (`debt.taxDeductible`,
`expenses[].kind`, `debt.owner`, `returnPreset` — all UI/data fields nothing
in `engine.js` reads at all). This deduction *is* implemented and *is* used,
every year, by every projection that includes anyone 65 or older — which is
most retirement projections this calculator will ever run. The RULES table
itself is the source that says current law sunsets it after 2028; the
engine simply never checks. Every multi-decade projection silently assumes
this deduction persists forever, understating taxes for the affected
years by up to $6,000-per-eligible-person's marginal rate, every year past
2028, for the remainder of the projection.

**Status: CLOSED — not a defect (withdrawn 2026-09-12).** Disclosed,
intentional behaviour, not an undiscovered gap — see "Revised status"
below. Corrected 2026-09-14: this entry's only parser-readable status
line said "OPEN, undecided" for two days after the same-day withdrawal
below, which is exactly the resurrection hazard `S5_TASK_CHECKLIST.md`
block 2g.4 exists to prevent (found while auditing 2g.4 during S5).

**Status, superseded above, kept as history: OPEN, undecided.** Candidate directions, none chosen here: (a)
thread a projection year (or the row's calendar year, derivable from
`p.profile.age` plus elapsed duration and the "current year" the plan was
built in) into `seniorDeduction()` and zero it out past 2028, matching
current law exactly; (b) treat "assume current law persists" as the
calculator's deliberate simplification elsewhere too (worth checking whether
any *other* provision in the rules table carries a similar sunset/expiry
metadata field that is likewise unenforced, since if this is a pattern
rather than a one-off, the fix belongs at the rules-loading layer, not
inside one function); (c) leave it as-is and remove or caveat the
`expiresAfter` field so the documentation stops claiming a behavior the code
doesn't have. Whoever triages this should also check whether it needs S2/S3
exclusion-table routing — unlike Q43, this is squarely in `engine.js`'s
always-reachable tax path, not one of the P19-excluded modules.

**Correction, same day (2026-09-12), before this went to anyone's triage
queue:** should have checked the app's own "Rules used" disclosure page
before filing this as undecided. `src/app-shell.html:1020` renders this
sentence directly to the user, unconditionally, whenever the senior
deduction is used: *"The temporary senior deduction is $6,000 per eligible
person. It phases out above the stored MAGI thresholds and expires after
2028, but this fixed 2026 package intentionally does not roll tax law
forward."* That is candidate (c) above, already chosen and already shipped
— the app tells the user directly that it will not implement the sunset,
by design, as part of a stated "fixed 2026 rules package" policy that
applies more broadly (the same page also discloses, in the same tone, that
the SECURE 2.0 high-wage Roth catch-up rule is stored but not forced for
2026 for the same reason).

**Revised status: not a defect.** This is disclosed, intentional behavior,
not an undiscovered gap. Downgrading from "OPEN, undecided" to a documentation
note: `RULES.federal.seniorDeduction.expiresAfter` is metadata for a human
maintainer deciding when to refresh the *rules table itself* for a future
tax year package, not a runtime instruction the engine is missing — exactly
analogous to how a new `v2b-rules-2027` package would presumably supersede
this one rather than this one growing a live sunset clause. No action
needed against `engine.js`. Leaving this entry in place rather than deleting
it, since the reasoning (and the "is this pattern true of other
`expiresAfter`-shaped fields" question in candidate (b)) may still be useful
to a future reader who hits the same instinct — but the underlying question
is closed.

---

## 2026-09-12 — Q47. The Social Security earnings test is claimed as implemented and is not

**A discovered defect, not a judgment call**, same shape as Q43/Q44. Full
trace in `SIMULATION_LOG.md` (Batch 13, 2026-09-12). Checked against Q46's
lesson before filing this one: this is a genuine gap, not a disclosed
simplification — see the disclosure-text comparison below.

**The defect.** `src/app-shell.html:1038` renders this sentence to the user
directly, unconditionally, whenever Social Security is configured (`used`
list includes it as soon as `ssBenefit` is set): *"The earnings-test amounts
are $24,480 below full retirement age and $65,160 in the year full
retirement age is reached."* No caveat follows it. Compare that to its two
neighbors on the same disclosure page — the senior deduction (*"but this
fixed 2026 package intentionally does not roll tax law forward"*) and the
Roth catch-up rule (*"this package does not force Roth catch-ups in
2026"*) — both of which explicitly tell the user what isn't implemented.
The earnings-test sentence carries no such caveat; it reads as, and is
presented alongside, a plain statement of applied behavior.

**Confirmed by source, not just inference.** `engine.js` never references
`earningsTest`, `underFRA`, or `fraYear` anywhere — grepped directly.
`ssaBenefitAtClaim()` (`src/engine.js:728`) computes only the early/delayed
claiming actuarial factor; nothing anywhere checks a claimant's current
wages against the earnings-test limit or withholds any portion of the
benefit for it.

**Fully reachable — not an edge case.** Claiming Social Security as early
as 62 while working full-time at any salary, independent of `retireAge`, is
a completely ordinary, fully-supported combination of inputs. It is exactly
the situation the real earnings test exists to govern, and exactly the
scenario real financial advisors most commonly warn against for this
specific reason.

**Quantified.** A $120,000/yr earner claiming at 62 with a $2,500/mo
($30,000/yr) benefit is $95,520 over the $24,480 earnings-test limit. At the
real $1-withheld-per-$2-over-limit rate that's $47,760 withheld — more than
the entire benefit, i.e. 100% should be suspended until earnings drop or
FRA is reached. This calculator pays the full $30,000 regardless, every
year, with no reduction of any kind. Checked the boundary case too: claiming
exactly at FRA while still working shows no reduction either, which happens
to match reality (the real test also stops at FRA) — coincidentally
correct, not because the code knows FRA is the relevant boundary.

**A second, related gap exists but is NOT being filed as an open item**:
`ssaBenefitAtClaim()`'s delayed-credit formula has no ceiling at
`RULES.socialSecurity.latestClaimAge` (70), so a claim age of 75 computes
40% more benefit than 70 when real SSA rules cap credits at 70. Checked
reachability before writing this up (the lesson from Q46, applied in the
other direction this time): the `v2-ss-claim` HTML input has `max="70"` and
`scenario-validator.js:452` independently range-checks `ssClaim` to
`[62, 70]`. No real user or import path can produce a claim age above 70.
Recorded here for completeness only — it needs no triage.

> **Heading qualified 2026-09-12 (external closeout CQ-3c).** "Claimed as
> implemented" overstates. `src/app-shell.html:369` — and the shipped artifact —
> already told the user the model *"does not reproduce every SSA family-maximum,
> earnings-test, government-pension, divorce, disability, or survivor eligibility
> rule."* The defect was narrower: the rules-page sentence stating the
> earnings-test amounts carried no caveat of its own. The shipped
> `investment-calculator-v2c.html` is stale by design and does **not** yet carry
> the `c9f76ee` caveat; it reaches users with the S5 task 10 rebuild.

> **DISCLOSED 2026-09-12 — candidate (b), `c9f76ee`. Candidate (a) remains
> undecided.** The rules paragraph now reads: "…in the year full retirement
> age is reached, but this package does not apply the earnings test: a benefit
> claimed before full retirement age while still working is modeled in full,
> with nothing withheld." That is the form its two neighbours already use.
> Re-verified before writing it, at the tree that became `c9f76ee`:
> `engine.js` has no reference to `earningsTest`, `underFRA` or `fraYear`, and
> the same search finds two in `app-shell.html`, so the absence is not an
> artefact of the pattern.
>
> The witness, `tests/audit-q47-earnings-test-disclosure.test.js`, is
> **two-sided** — its engine half is a **characterization test** of current
> non-withholding behaviour, not proof of a correct earnings test (CQ-3c) —
> because a disclosure is a claim about the engine and is only
> honest while the engine still behaves as it says. It reads the paragraph from
> a **scratch build** — the pinned artifact is stale by design, so a test run
> through `tests/lib/harness.js` would read the old sentence whatever the shell
> says — and it pins the engine fact the caveat asserts: claiming at 62 against
> FRA 67 while earning 120,000 changes row `income` by exactly the salary
> (21,000 benefit-only, 141,000 with wages), with a control that the benefit is
> paid at all (without it, a benefit of zero satisfies "differs by exactly the
> salary"). If the earnings test is ever implemented, the engine half fails and
> forces the caveat to be revisited. Against `5d34573` the disclosure test fails
> on the caveat assertion and the engine test passes, by design.
>
> Implementing (a) changes every projection that claims before full retirement
> age while working: an engine behaviour change and a baseline move that needs
> its own decision, and must land before the S5 task 10 freeze if taken. Line
> references in this entry have drifted: `ssaBenefitAtClaim()` is no longer at
> `src/engine.js:728`.

**Status: SUPERSEDED 2026-09-20 by S5AA task 4.6 (Q91, F5 and N3) — candidate (a) WAS implemented.**
The 2026-09-13 decision below stood for seven days and is recorded here rather than removed. It was
overtaken by a later instruction of the owner's own: the S5AA checklist the sprint started on carries
**4.6 (F5 + N3) Social Security earnings test** as a row in its own right, requiring the withholding,
the adjustment at full retirement age, and "**Fix N3 so the Rules page says one thing**" — which is
this question's disclosure. **A plan that names the disclosure as the thing to fix is not compatible
with leaving the disclosure as the repair.** The later instruction wins; the earlier decision is not
reinterpreted, it is superseded, and the owner should see that it was.

`tests/audit-q47-earnings-test-disclosure.test.js` was built **two-sided on purpose** and its header
said what to do if this ever happened: *"If someone implements the earnings test, (2) fails and forces
the caveat to be revisited, instead of leaving a disclosure that has quietly become false in the other
direction."* **It fired, and it was right to.** Both sides are inverted and neither is loosened — the
page must now state the withholding and the adjustment, and the engine must now withhold.

*(The original decision, retained:)* **DECIDED 2026-09-13 (the owner) — leave disclosed-only.** Candidate (a)
is closed as "not implementing," not left open — the disclosure fix
(`c9f76ee`) is the final state for the old engine. Full record:
`S5_TASK_CHECKLIST.md` block 2f.2 / Task 00 item 6.
*(As it stood before the decision:)*

**Original status, retained as history: OPEN, undecided.** Candidate directions: (a) implement the
earnings test in `householdSocialSecurityForPeriod()`/`ssaBenefitAtClaim()`
against current wages, matching the disclosed $24,480/$65,160 amounts and
the $1-per-$2 (under FRA) / $1-per-$3 (FRA year) withholding rates; (b)
disclose the omission honestly instead, matching the senior-deduction and
Roth-catchup pattern already used two paragraphs above it on the same page
("earnings-test amounts are stored but not yet applied to reduce the
modeled benefit," or similar) — the cheaper fix, and consistent with this
project's stated preference elsewhere for an honest gap over a silent one;
(c) do both, disclosing now and implementing later. This is squarely in
`engine.js`'s always-reachable Social Security path, not one of the P19
excluded modules, so ordinary triage routing applies.

---

## 2026-09-12 — Q48. A circular reference inside an account object crashes `runPlan()` with an uncaught exception

**A discovered defect, not a judgment call.** Full trace in
`SIMULATION_LOG.md` (Batch 16, 2026-09-12).

**The defect.** `clone()` (`src/engine.js:19`) is literally
`JSON.parse(JSON.stringify(o))`, called on `p.accounts`,
`p.advanced.otherAssets`, and `p.advanced.debts` at the top of
`simulatePlan()`. If any object reachable from one of those arrays contains
a circular reference (an object property that, directly or indirectly,
points back to itself), `JSON.stringify` throws
`TypeError: Converting circular structure to JSON` — uncaught, straight out
of `runPlan()`.

**Why this is notable relative to this project's own standard, not just
in isolation.** Every other malformed-input case tested this session —
duplicate account ids (`SCENARIO_DUPLICATE_ACCOUNT_ID`), a 270-year horizon
that overflows floating-point precision (`QUOTE_SETTLEMENT_UNVERIFIED`), and
six different placements of `NaN`/`Infinity` across accounts, debts,
otherAssets, and top-level scalars (Batch 16) — all get caught and converted
into a clean `{rows: null, status: "calculation_error", ...}` result.
`nonFiniteScenarioInputCode()`'s own comment states the standard directly:
*"the check has to live where every execution path passes, before
`clone()` and before any cash moves."* A circular reference defeats that
standard at the exact point it names — inside `clone()` itself — in a way
none of the existing checks anticipate, because none of them are checking
for cycles.

**Reachability, stated plainly rather than left implicit.** This is the
mitigating factor, and it is a real one: valid JSON cannot encode a cycle,
so this can never arrive through a saved-scenario import — the entire
`scenario-validator.js` import path is JSON-shaped by construction. Nothing
in the live UI's own form-building code (`app-shell.html`) has any apparent
reason to construct a circular object either. The only realistic path to
this is direct programmatic construction of a plan object — a
developer/embedding scenario, not an ordinary user action.

> **REPAIRED 2026-09-12 — candidate (b), as a boundary gate, `c9f76ee`.**
> `nonSerializableScenarioInputCode()` stringifies exactly `clone()`'s three
> inputs before simulation and returns `SCENARIO_NONSERIALIZABLE_INPUT` when
> that throws. It is registered in `app-shell.html`'s `workerFunctions`.
>
> **Three mechanisms, not one.** Measured before the repair: a cycle, a
> `BigInt`, and a `toJSON` that throws all escaped `runPlan()`, on all three
> arrays. The `toJSON` case throws `Error`, not `TypeError`, so the catch is
> deliberately not narrowed — a guard written for "circular reference" would
> have passed every cycle test and missed it.
>
> **Scoped to the three arrays, by measurement.** A cycle on `profile` is never
> cloned and ran to `ok`; stringifying the whole plan would have turned that
> working run into an error. For ordinary data, `JSON.stringify` throws exactly
> when `clone()` would. **Withdrawn as a general claim (BC-02, closeout verdict
> 2026-09-13):** the gate serializes the input a second time, so a `toJSON`
> callback runs twice. One that succeeds once and throws on the next call was
> called once and returned `ok` on engine `e3f008ab…`, and is called twice and
> throws uncaught on `34b2ab9a…` — reproduced; a harmless callback also now
> runs twice. Stateful callbacks are excluded from the verified repair; carried
> to S5 engine input defence. A
> missing or non-array field is **Q55's** question and is not claimed — a scope
> test pins that the gate returns `null` for `accounts: {}`.
>
> **The first version was incomplete, and only the Worker arm saw it.** The
> generated Worker calls `runScenario()`, not `runPlan()`. `runScenario()` is
> `runPlan()` plus `buildSimulationIdentity()`, whose `inputHash` recursed on
> the same cycle and posted `RangeError: Maximum call stack size exceeded`
> after `runPlan()` had already rejected correctly. Every main-thread
> `runPlan()` test passed while that was true. `runScenario()` now sets
> `identity: null` for this one rejection — narrowed so the fingerprint every
> captured result carries is not touched. The main-thread `runScenario()` arm
> was added after, so a failure names the function rather than the transport.
>
> Witness `tests/audit-q48-nonserializable-input.test.js`, 15 tests. Against
> `5d34573`, 11 fail; the 4 that pass are the controls and the scope pin.
> Engine `68c8bc9d…b6d2` → `494de216…ad51`.
>
> **Residuals, recorded not repaired.** (1) A cycle outside the three arrays
> still throws `RangeError` through `runScenario()` — measured, pre-dating this
> entry, outside its scope. (2) The historical heat map calls `simulatePlan()`
> directly after its own `clone(p)`, and `simulatePlan` is exported, so neither
> path passes `runPlan()`'s gates (see Q49).

**Original status, retained as history: OPEN, undecided.** Candidate directions: (a) do nothing — the
reachability bar is high enough that this may not be worth the code to
guard against; (b) wrap the `clone()` calls (or `runPlan()` as a whole) in
a try/catch that converts a `TypeError` here into the same
`calculation_error` contract every other rejection uses, for defense in
depth even though no known path triggers it; (c) replace `clone()`'s
JSON-round-trip implementation with something that can't throw on a cycle
(e.g. `structuredClone`, which also would not have Q49's `NaN`→`null`
side effect below — worth deciding both at once since they share a root
cause). Not routed through the P19 exclusion table — `clone()` is called
from `simulatePlan()` directly, not from an excluded module.

*Corrected 2026-09-12 (P13-H1): the phrase "which also would not have Q49's
`NaN`→`null` side effect below" assumed Q49's contribution value passes
through `clone()`. It does not — see the correction in Q49. Q48 and Q49 should
still be triaged together, but they do **not** share that root cause, and
replacing `clone()` addresses Q48 without touching Q49's path.*

## 2026-09-12 — Q49. `account.contribution` has no explicit validation anywhere, and what protects it depends on eligibility rather than on `clone()`

*Heading corrected 2026-09-12 (P13-H1). It previously read "its only protection is a `clone()` implementation detail", which is the claim the correction below disproves — the contribution is read from the original plan, never through `clone()`.*

**A discovered defect, not a judgment call.** Full trace in
`SIMULATION_LOG.md` (Batch 16, 2026-09-12) — **note that Batch 16's
explanation is superseded by the correction below; the observation stands,
its attribution does not.** Reviewed jointly with Q48, but **not the same
root cause**: Q48 is genuinely about `clone()`'s `JSON.parse(JSON.stringify(o))`
implementation, and Q49's contribution value never passes through `clone()`
at all. *(Corrected 2026-09-12, P13-H1. This line previously read "Related to
Q48 — same root cause … a different consequence." Joint triage is still
sensible; a shared cause is not, and must not drive implementation.)*

**The defect.** Mapped every input-validity check touching accounts,
field by field. `accounts[].balance` and (for taxable accounts)
`accounts[].basisPct` are checked twice over — once by the engine's own
`nonFiniteScenarioInputCode()` boundary gate, once by
`scenario-validator.js` on import. `accounts[].priority` is checked once,
by the validator (`scenario-validator.js:324`), though not by the engine
gate. **`accounts[].contribution` is checked by neither** — grepped
`scenario-validator.js` directly for any reference to `.contribution`:
none exists.

**Why this hasn't caused a visible problem yet.** ~~`JSON.stringify` silently
turns `NaN` and `Infinity` into `null` (a well-known JS behavior, not
specific to this codebase), and `clone()` runs every account object through
exactly that round-trip. A non-finite `contribution` therefore arrives on
the far side of `clone()` as `null`, and the arithmetic that reads it
(patterns like `Number(x)||0` elsewhere in `engine.js`) treats `null` as
`0` — so today, a corrupted contribution silently becomes a $0 contribution
rather than propagating `NaN` or crashing. Confirmed directly: `runPlan()`
with `accounts[0].contribution = NaN` completes normally, no
`calculationError`, no non-finite row value, that account simply
contributes nothing that year.~~

> **CORRECTED 2026-09-12 (external re-audit P13-H1). The struck paragraph
> above is wrong, and it is retained rather than deleted so that anyone who
> read it elsewhere can see what happened to it.**
>
> **`clone()` does not sanitise the contribution — because the contribution
> is never read from the clone.** The precise mechanism, in execution order:
>
> `simulatePlan()` **first** clones the full account objects into mutable
> working accounts (`src/engine.js:1240`, and `clone()` at `:19` is
> `JSON.parse(JSON.stringify(o))` — it copies whole objects, not selected
> fields). **Later**, `auditContributions(p, …)` (`:1264`) computes requested
> and allowed contributions from **the original `p.accounts`**, and
> `accountPlannedContribution()` reads the original contribution value. When
> contributions are eligible, an invalid value on the original plan reaches
> contribution arithmetic and is caught by downstream calculation checks;
> when ineligible, eligibility sets the allowed contribution to zero.
> **Sanitising a copied account does not validate the original value used for
> the contribution calculation.**
>
> *Two overstatements corrected here 2026-09-12 (P13-H1), both ours:* this
> box previously said the amount is `NaN` "before any clone is involved" —
> **that is not the execution order**, the clone happens first — and
> described the clone as copying "account balances", which is field-selective
> and wrong. It also offered *"the original is still `NaN` after the run"* as
> proof; **it is not**, since a deep clone ordinarily leaves its source
> unchanged and that observation says nothing about the copy. The decisive
> evidence is the **source path reading the original plan**, together with the
> active/inactive finite and invalid controls below.
>
> **The original observation was real but came from an ineligible fixture.**
> Reproduced here over six one-year deterministic controls (age 40→41,
> salary 100,000, one taxable account at 500,000, zero returns/inflation/
> fees/spending; contributions eligible at `retireAge` 41, ineligible at 40).
> `NaN` is assigned as an actual JavaScript value, not a JSON string:
>
> | Eligible? | `contribution` | Result |
> |---|---:|---|
> | Yes | `0` | `ok`, contributions 0 |
> | Yes | `1000` | `ok`, **contributions 1,000** — the control proving the path runs |
> | Yes | `NaN` | **`calculation_error`, rows `null`** |
> | No | `0` | `ok`, contributions 0 |
> | No | `1000` | `ok`, contributions 0 — eligibility zeroes it |
> | No | `NaN` | `ok`, contributions 0 — **identical to the zero control** |
>
> The last row is where "silently becomes a $0 contribution" came from. It is
> an accurate description of the *ineligible* case and was generalised to all
> cases. **The eligible case is a calculation error, not a quiet zero.**
>
> *Divergence worth recording:* the audit reported error code
> `TAX_QUOTE_NONFINITE_ACCOUNT`; this reproduction returns
> `TAX_QUOTE_NONFINITE_CONTEXT`. The containment behaviour is identical and
> the difference is presumably fixture-dependent, but the two fixtures are
> not byte-identical and the codes are not interchangeable in a witness.
>
> **This is downstream containment, not validation**, and the field still has
> no explicit check. Do not close Q49 because the active case errors, and do
> not call the inactive case harmless. **Exposure limit:** an actual `NaN`
> cannot be encoded in ordinary JSON, so this is the direct-JavaScript-input
> case only — it does **not** show that a saved JSON file can carry `NaN` or
> that the live UI produces one. JSON-reachable wrong-type inputs are a
> separate question and must not be conflated with this witness.
>
> **Consequence for the eventual repair:** replacing `clone()` alone does not
> fix this path, because the contribution never went through `clone()`. Trace
> the original plan *and* the mutable copy before changing either.

**~~Why this is worth a Q entry despite currently being harmless.~~
SUPERSEDED 2026-09-12 (P13-H1) — retained below as history, and it must not
be read as current guidance.** ~~The safety here is a side effect of *how*
`clone()` happens to be implemented, not a decision anyone made about
`contribution` specifically. If `clone()` is ever reimplemented for
performance (a JSON round-trip is a relatively slow way to deep-clone three
arrays every simulated period across every Monte Carlo path) — for instance
swapped for a structural/manual clone, or `structuredClone` (which preserves
`NaN` faithfully rather than nulling it) — this field goes from
silently-defused to genuinely live, with nothing else in place to catch it.
A future editor of `clone()` would have no way to know `contribution`'s
safety depends on it, because nothing documents that dependency today.~~

**Why this is worth a Q entry — current rationale.** The field has **no
explicit validation anywhere**, and that is the entry. What happens to an
invalid value today depends on **eligibility**, not on `clone()`: eligible,
it reaches contribution arithmetic and is caught downstream as a calculation
error; ineligible, eligibility zeroes it and the run looks ordinary. Neither
outcome is validation — the first is **downstream containment** and the
second is **coincidence of configuration**. So the entry does not depend on
anyone changing `clone()`: **there is nothing here for a `clone()` change to
make live, because the contribution never passes through `clone()`.** The
work is to establish contribution-field validity at the validator and the
public execution boundary, before contribution arithmetic.

> **REPAIRED 2026-09-12 — candidate (a), `5d34573`.** Validator: `WRONG_TYPE`
> for a present non-finite or wrong-typed value, and a `NEGATIVE_CONTRIBUTION`
> warning — the `Math.max(0, amount)` ending `accountPlannedContribution()` is
> a floor that erases negatives, not a check. Public boundary:
> `nonFiniteScenarioInputCode()` returns `SCENARIO_NONFINITE_CONTRIBUTION`
> before `clone()`, with its own message branch (a new code would otherwise
> have inherited the cash-holding message).
>
> **Absence is not flagged at either layer, by decision.** `normalizeAccount()`
> backfills `contribution: 0`; that is the explicitly supported missing-field
> default this entry says to preserve, and `tests/scenario-validator.test.js`
> pins the same lenient posture for id/priority/balance. A draft of the repair
> flagged absence as `MISSING_FIELD`; it contradicted both and was withdrawn
> before commit.
>
> Witness `tests/audit-q49-contribution-validity.test.js`, 21 tests (as of
> `4c00cbb`, which added the negative-contribution arm in the ineligible
> state; re-run directly to confirm — `node --test` reports `tests 21`, `pass
> 21`): both
> eligibility arms with finite non-zero controls; the generated Worker; and the
> real import path through a **scratch build** — an old saved file without the
> field restores at 0, and a `null` is refused and named. The refusal control
> is what makes the restore test mean anything: without it, "import succeeded"
> cannot tell "the check passed" from "the check was never reached". Against
> the unrepaired sources, 11 of the 16 core tests fail; the 5 that pass are the
> controls and the pinned absence decision. Baseline: the real exported gate
> returns `null` on 600 generated plans (1,786 accounts), after a positive
> control showed it returns the code on an injected `NaN` — **compatibility
> evidence only** (CQ-5a): it shows no generated plan is rejected, not that
> results are unchanged. Unchanged execution was measured separately: 15 of 16
> fixtures byte-identical against `4c0f4cf`, the one difference being this
> rejection (`Handover temp/S2_CQ5A_REVERIFICATION_20260912.md`). Engine
> `e3f008ab…e034` → `68c8bc9d…b6d2`: **the byte-identical engine streak ends
> here.**
>
> **Residuals, stated rather than closed.** (1) A direct `runPlan()` caller
> that bypasses normalisation and omits the field still gets only downstream
> containment. (2) The historical heat map calls `simulatePlan()` directly after
> its own `clone(p)`, and `simulatePlan` is exported, so neither path passes
> `runPlan()`'s gates. That is equally true of the pre-existing balance and
> basisPct gate, whose comment says it covers "every public execution path".
> (3) Candidate (b)'s narrowed sweep of `debts[].balance` and
> `otherAssets[].value` was not done.
>
> Building the JSON wrong-type arm found a separate mechanism: a string
> contribution was **concatenated** rather than added. Filed as **Q57**.

**Original status, retained as history: OPEN, undecided.** *Candidate directions revised 2026-09-12
(P13-H1): (a) survives unchanged and is now the main line; (b) is narrowed
because its premise was the retracted one; (c) is withdrawn.*

**(a) — the main line.** Add an explicit `isFiniteNumber` check for
`accounts[].contribution` to `scenario-validator.js`, matching the treatment
`balance` and `priority` already get, **and** establish the same validity at
the public execution boundary before contribution arithmetic. Preserve
legitimate zero and any explicitly supported missing-field default, and use
the project's named invalid-result convention rather than silently coercing
a malformed value to zero. Verification must cover **active and inactive
eligibility**, with finite non-zero controls that prove the contribution path
actually runs, plus non-finite JavaScript inputs and separately chosen
JSON-reachable wrong-type inputs — and must confirm the original plan is left
unmodified.

**(b) — narrowed.** The sweep is still worth doing, but not under the
heading "only safe because of `clone()`'s JSON quirk", which is the retracted
explanation. `advanced.debts[].balance` and `advanced.otherAssets[].value`
were observed to behave identically; **whether that is for the same reason is
now an open question, not an established fact**, because this entry's own
shared-mechanism claim did not survive checking. Re-derive each field's
actual read path before grouping them.

**~~(c)~~ — withdrawn.** ~~If `clone()` is ever changed per Q48's candidate
(c), re-verify this specific dependency doesn't silently break at the same
time.~~ There is no such dependency: the contribution is read from the
original plan, so changing `clone()` cannot break or expose it. Q48 and Q49
should still be **triaged together** — they touch adjacent input-validity
ground — but they must not be **implemented** as one fix.

Not routed through the P19 exclusion table.

---

## 2026-09-12 — Q50. `dividendQualified` above 100% silently understates taxes — an ordinary out-of-range JSON number, not a JavaScript-only edge case

**A discovered defect, not a judgment call.** Full trace in
`SIMULATION_LOG.md` (Batch 20, 2026-09-12).

**The defect.** `qualifiedDividends = dividendCash * dividendQualified /
100` (`src/engine.js:1381`) carries no clamp. Once `dividendQualified`
exceeds 100, `qualifiedDividends` exceeds `dividendCash` itself, which
makes `ordinaryDividends = dividendCash - qualifiedDividends` **negative**.
That negative value flows straight into `ordinaryIncome`, which is
subtracted from nowhere and simply comes out smaller than it should —
silently reducing taxable income and tax owed below even the genuinely
best-case (100%-qualified) result.

**Quantified, not just derived from the formula.** Same household, same
age (63), `dividendQualified` swept from 0 to 200: **0% → $5,636 tax, 50%
→ $4,558, 100% → $3,481 (the true floor — every dollar is qualified), 150%
→ $2,604, 200% → $1,726.** The line continues in a smooth, perfectly
linear slope straight through the 100% boundary — there is no plateau, no
discontinuity, no error, nothing a reader would notice. It presents as an
ordinary, favorable tax result, not a broken one.

**Why this belongs in a different bucket than Q48 and Q49, and is arguably
the most reachable of the three.** Q48 needs a circular JavaScript
reference; Q49's live consequence needs a `NaN` assigned directly in code —
neither is expressible in a JSON file at all, so neither can arrive via a
saved-scenario import. `dividendQualified: 150` is an entirely ordinary
JSON number. Checked both layers of defense this project uses elsewhere:
the live UI input (`v2-dividend-qualified`, `src/app-shell.html:315`) does
carry `min="0" max="100"`, so typing through the form is safe — but grepped
`scenario-validator.js` directly for the field's name: **zero references,
anywhere.** Compare `ssClaim` (UI max *and* validator range, confirmed
Batch 13/Q47's investigation) or `priority` (validator range even without
an engine-side gate, confirmed Batch 16/Q49) — both are defended on the
import path even where the engine itself doesn't check them.
`dividendQualified` has exactly one line of defense, and a hand-edited,
migrated, or otherwise imperfectly-produced JSON scenario file skips it
completely, with no `NaN`/`Infinity`/cycle required to do so.

**The other direction, checked for completeness.** A negative
`dividendQualified` (e.g. `-50`) makes `ordinaryDividends` *exceed*
`dividendCash`, **overstating** tax instead of understating it. Same root
cause, lower practical severity — a household is more likely to notice and
investigate unexpectedly high taxes than unexpectedly favorable ones, but
the underlying gap (no validator check) is identical in both directions.

> **Verification note, 2026-09-12 (added after a cross-session
> re-verification, no correction needed to the finding above — the
> quantification here already uses the isolated per-row measurement it
> needs).** A second session independently re-checked this finding using
> `lifetimeTaxes` over the full plan first, and got the **opposite sign**:
> tax *rising* from 100% to 150% ($8.25M → $11.16M lifetime). That is not a
> contradiction of the finding — isolating through `estimateTaxes()`
> directly, one year, no compounding (dividend cash $10,000 against a
> $80,000 ordinary-income base): tax falls monotonically, $5,965 at 100% →
> $5,365 at 150% → $1,625 at 500%, exactly matching the per-row sweep
> above. The lifetime aggregate rises because the understated tax leaves
> more money invested every year of a 45-year plan, which compounds into a
> larger portfolio, which throws off more dividends and gains than the
> defect ever removed — the feedback loop dominates and reverses the
> aggregate's apparent direction. **Do not re-verify this finding against
> `lifetimeTaxes` or any other whole-plan aggregate** — check a single
> row, or call `estimateTaxes()`/`strategySpending()` directly, the way the
> quantification above already does. Worth keeping as a general caution
> for this log: an aggregate computed over a feedback loop can move
> *opposite* to the defect sitting inside it, so a correctly-taken,
> correctly-reported measurement can still point the wrong way if it's the
> wrong measurement to take.

**Status: REPAIRED 2026-09-14, (c) both, as decided.** A validator range
WARNING (`DIVIDEND_QUALIFIED_OUT_OF_RANGE`) catches it outside 0–100 at
import; an engine-level clamp to 0–100 (`DIVIDEND_QUALIFIED_CLAMPED`, one
WARNING per run when dividends are on) keeps the arithmetic safe for
direct callers too (`567be43`). Full record: `S5_TASK_CHECKLIST.md` block
2h.4.

**Status, superseded above: OPEN — not covered by the 2h.5–2h.6 swap decision.** On
2026-09-13 (the owner) a related question — inverted `clamp()` bounds at ~8 call
sites (floor/ceiling, `vpwMinRate`/`vpwMaxRate`, and the others
`S5_TASK_CHECKLIST.md` block 2h.5 enumerates) — was decided as "disclose
and swap": the smaller value becomes the floor/min and the larger the
ceiling/max, with a visible warning. **This field is not one of those
sites.** `dividendQualified`'s defect is a **single unclamped value**
exceeding its own valid range, not an inverted two-argument pair — a
different mechanism, confirmed against `S5_TASK_CHECKLIST.md` 2h.5's own
text: *"Q50 is not covered by any `clamp()` change — it needs a bound that
does not exist."* This entry's own three candidates ((a) validator range
check, (b) engine-level clamp, (c) both) remain genuinely undecided. Full
record of the swap decision, for context only: `S5_TASK_CHECKLIST.md`
blocks 2h.5–2h.6 / Task 00 item 7. *(Corrected 2026-09-13, later the same
day, on a report from `investment-calculator-84`: this status line
originally led with "DECIDED — disclose and swap" before its own
correction paragraph, which `tools/requirements-register.js`'s parser
never reaches — it reads only the first bold `**Status: …**` match. Led
with OPEN instead, so the parsed status matches the entry's actual
disposition.)*
*(As it stood before the decision:)*

**Original status, retained as history: OPEN, undecided.** Candidate directions: (a) add a
`checkRange(c, retirement.dividendQualified, ..., 0, 100)` to
`scenario-validator.js`, matching the treatment most percentage-shaped
fields already get there; (b) additionally clamp
`dividendQualified`/`qualifiedDividends` at the engine level
(`clamp(p.retirement.dividendQualified, 0, 100)` before the multiplication,
or clamp the resulting `qualifiedDividends` to `[0, dividendCash]`
directly) so the arithmetic can't produce a negative `ordinaryDividends`
regardless of what upstream validation does or doesn't catch; (c) do both —
consistent with this project's general pattern of validating at the
boundary *and* keeping the engine's own arithmetic safe rather than relying
on the validator alone. Not routed through the P19 exclusion table —
`estimateTaxes()`'s dividend handling is in `engine.js`'s always-reachable
tax path.

---

## 2026-09-12 — Q51. `retirement.floor > retirement.ceiling` silently locks spending to a constant in three withdrawal strategies

**A discovered defect, not a judgment call.** Full trace in
`SIMULATION_LOG.md` (Batch 21, 2026-09-12). Found by systematically
auditing `scenario-validator.js` for other percentage/rate-shaped fields
after Q50 — this is the first of two confirmed instances of a second,
shared root cause; see Q52 for the other.

**The defect, two causes acting together.** `clamp(v,a,b)` (`src/engine.js:21`)
is `Math.min(b, Math.max(a,v))`, with no defense against `a > b`: when the
bounds are inverted, `Math.max(v,a) >= a > b` for any `v` at all, so the
function **always returns `b`**, completely independent of `v`. Three
withdrawal strategies — `floorCeiling`, `guardrails`, and `guyton` — all end
their own spending formula with `amount = clamp(amount,
floor*inflationFactor, ceiling*inflationFactor)`. Neither `floor` nor
`ceiling` is checked anywhere in `scenario-validator.js` (grepped directly:
zero references, either name), and nothing in `engine.js` itself guarantees
`floor <= ceiling` before the clamp runs. The live UI's `readStatic()` does
compute `ceiling: Math.max(floor, ceiling)` when reading the form — but
that guarantee lives in exactly one function, gating manual typing only,
not the import/validation path and not the engine's own arithmetic.

**Confirmed live, not just derived from the formula.** Ran all three
strategies with `floor: 90000` and `ceiling: 40000` (a plausible data-entry
swap — whichever field a UI happens to list first): **all three produced
byte-identical output** (`lifetimeTaxes: $16,533.09`, matching row for row).
That means `guardrails`' and `guyton`'s own dynamic, market-responsive
adjustment logic — the entire reason someone picks those strategies over a
flat one — runs and is then thrown away every single year, silently
replaced by a constant $40,000. ~~Selecting three different,
differently-named strategies produces one identical outcome, with nothing
to indicate why.~~

> **Precision correction, 2026-09-12 (relayed cross-session, independently
> re-verified before editing — does not weaken the finding, narrows its
> stated scope).** The original repro used `method: 'simple'` (the
> unmodified default), under which `guardrails` and `guyton` were **already
> byte-identical before any inversion** — confirmed directly with
> non-binding bounds (`floor: 0, ceiling: 10,000,000`): `guardrails ===
> guyton` row-for-row, while `floorCeiling` differs from both. `guyton`
> only diverges from `guardrails` through `guytonSkipInflation &&
> priorReturn < 0`, and `'simple'` never produces a negative return, so
> that branch can never fire under this method. **The inversion in this
> reproduction therefore collapses two already-identical-under-`'simple'`
> behaviors into one, not three into one** — `floorCeiling` was never
> distinct from `guardrails`/`guyton` here regardless of the bug, because
> the ordered-bounds control makes it clear those two are one strategy in
> disguise under `'simple'`. Re-run with `method: 'monteCarlo'` or
> `'historical'` (where genuine negative-return periods exist), all three
> should be pairwise distinct under sane bounds and the inversion would
> collapse a genuine three into one. State the method whenever this is
> reproduced — counting "three" under `'simple'` will overcount by one.
> The defect itself (the clamp discards each strategy's own logic) is
> unaffected by this correction; only the headline "three strategies
> collapse" claim needed the method named.

**Reachability matches Q50's, not Q48/Q49's.** No `NaN`, `Infinity`, or
circular reference needed — `floor: 90000, ceiling: 40000` is an entirely
ordinary pair of JSON numbers. A hand-edited scenario file, a
programmatically-generated one, or a future migration that swaps two field
names would all trigger this with no error anywhere in the pipeline.

**Verified this is genuinely the same mechanism as Q52, not an assumed one
(the mistake corrected in Q49).** Both this entry and Q52 were confirmed by
independently running the affected strategy with the two bounds reversed
and observing the same "output collapses to the constant upper bound"
signature; the shared cause is `clamp()`'s own missing `a <= b` check, read
directly at `src/engine.js:21`, not inferred by analogy.

**Status: REPAIRED 2026-09-14, both halves.** Engine half: the swap lands
at the three user-bounded `clamp()` sites with one WARNING per run in
`result.issues` (`6950422`). App half: `readStatic()` no longer silently
raises the ceiling to the floor (or the VPW max to the min) on read — it
passes the entered pair through and shows the engine's swap-and-warn on
the results page (`885c354`). **Measured correction, made while repairing
the app half:** this entry originally said the form guard gates "manual
typing only, not the import/validation path" — measured through a
restored backup, it does reach import: a saved plan with floor 80,000 /
ceiling 50,000 was previously written back as 80,000 / 80,000, because a
restored plan is read through the same form. Full record:
`S5_TASK_CHECKLIST.md` blocks 2h.5–2h.6.

**Status, superseded above: DECIDED 2026-09-13 (the owner) — disclose and swap.** A third option,
not one of (a)/(b)/(c) below: `floor`/`ceiling` is one of the `clamp()`
call sites 2h.5 enumerates that this decision governs directly (per
`S5_TASK_CHECKLIST.md` 2h.5's own list: "basis percentages, access
percentages, glide progress, return bounds, survivor reduction" plus
floor/ceiling and `vpwMinRate`/`vpwMaxRate`). An inverted pair swaps so the
smaller value becomes the floor and the larger the ceiling, **with a
visible warning recording that the swap happened** — not silent, and not a
hard refusal, and not candidate (b)'s "reject" as originally offered. Full
record: `S5_TASK_CHECKLIST.md` blocks 2h.5–2h.6 / Task 00 item 7. Decided,
not repaired: the swap-and-warn behaviour has not landed, and 2h.5 still
needs to confirm per site that swapping is coherent there (a constant,
non-invertible bound needs no swap logic at all). The validator-side
candidate (a) — adding `checkRange`/relational coverage for the other
zero-coverage fields this entry's audit surfaced — is a separate, still-open
hardening question the swap decision doesn't resolve on its own.
*(As it stood before the decision:)*

**Original status, retained as history: OPEN, undecided.** Candidate directions: (a) add
`checkRange`/relational validation for `floor`/`ceiling` (and the other
zero-coverage fields the same audit surfaced —
`dividendYield`, `dividendGrowth`, `rmdMultiplier`, `rmdFloor`, `matchRate`,
`matchCap`, `profitShare`, `vesting`, `upperGuardrail`, `lowerGuardrail`,
`adjustment`, `withdrawalRate` — to `scenario-validator.js`, including a
relational check that `floor <= ceiling`; (b) harden `clamp()` itself to
swap or reject inverted bounds rather than silently honoring `b`
unconditionally, which would fix this site and Q52 and any future caller
with the same shape of mistake; (c) do both. Whoever triages this should
decide whether (b) is safe given how many other `clamp()` call sites exist
in this file and whether any of them *intentionally* rely on the current
behavior (none were found in this session's audit, but this session did not
exhaustively check every call site). Not routed through the P19 exclusion
table — all three strategies are in `engine.js`'s always-reachable
withdrawal-strategy dispatch.

## 2026-09-12 — Q52. `retirement.vpwMinRate > vpwMaxRate` silently forces every VPW withdrawal to a constant percentage of balance

**A discovered defect, not a judgment call.** Full trace in
`SIMULATION_LOG.md` (Batch 21, 2026-09-12). The second of two confirmed
instances of Q51's root cause — same `clamp()` gap, a different call site
inside the same audit.

**The defect.** The `vpw` strategy's spending formula computes an amount
from the household's remaining life expectancy and expected real return,
then clamps it: `amount = clamp(amount, balance*vpwMinRate/100,
balance*vpwMaxRate/100)`. Neither `vpwMinRate` nor `vpwMaxRate` is
referenced anywhere in `scenario-validator.js` (grepped directly: zero for
both), and nothing upstream guarantees `vpwMinRate <= vpwMaxRate`. When
inverted, the same `clamp()` behavior from Q51 applies: the function always
returns the second bound (here, `balance*vpwMaxRate/100`), discarding the
VPW formula's actual output entirely.

**Confirmed live and precisely quantified.** Called `strategySpending()`
directly with `vpwMinRate: 50, vpwMaxRate: 10` at four different balances:

| Balance | Spend returned | As % of balance |
|---:|---:|---:|
| $500,000 | $50,000 | 10.00% |
| $1,000,000 | $100,000 | 10.00% |
| $2,000,000 | $200,000 | 10.00% |
| $5,000,000 | $500,000 | 10.00% |

Exactly 10.00% every time, regardless of the household's actual remaining
horizon or expected return — the two inputs the VPW strategy exists to
account for. A full-plan run (age 65 VPW retiree, inverted rates) confirmed
the same signature end to end with no reconciliation issue and no error of
any kind — the plan just silently runs a flat-percentage strategy while
reporting that it's running VPW.

**A negative single value is not the same failure, and this session
checked the difference rather than assuming it.** `withdrawalRate: 0%`
(`fixedReal`) vs. `withdrawalRate: -5%` (`constantPercent`) produced
byte-identical output in the same audit — traced and found to be a
coincidence, not a third instance: a negative single rate is already
floored to `$0` by **two independent** `Math.max(0, ...)` guards already in
the code (`applyStage()`'s own return, and `strategySpending()`'s final
return). The bug in Q51/Q52 is specifically about an **inverted pair** of
bounds passed to `clamp()` — nothing anywhere checks the relationship
between two arguments, which is a different and unguarded failure mode from
a single value going negative.

**Status: REPAIRED 2026-09-14, same commits as Q51.** Engine half at
`6950422` (WARNING on swap); the app half's `readStatic()` no longer
silently normalizes VPW min/max on read either (`885c354`). Full record:
`S5_TASK_CHECKLIST.md` blocks 2h.5–2h.6.

**Status, superseded above: DECIDED 2026-09-13 (the owner) — disclose and swap**, same decision and
same record as Q51: `vpwMinRate`/`vpwMaxRate` is named directly among the
`clamp()` sites `S5_TASK_CHECKLIST.md` 2h.5 enumerates. An inverted pair
swaps so the smaller value becomes the min and the larger the max, with a
visible warning — not silent, not a hard refusal. Full record:
`S5_TASK_CHECKLIST.md` blocks 2h.5–2h.6 / Task 00 item 7. Decided, not
repaired, and per 2h.5's own caution a shared cause does not mean one
repair discharges both this site and Q51's — each is still its own code
location needing the fix applied. *(As it stood before the decision:)*

**Original status, retained as history: OPEN, undecided.** Same candidate directions as Q51 — hardening
`clamp()` (candidate (b) there) fixes both sites at once; adding validator
coverage for `vpwMinRate`/`vpwMaxRate` plus a relational `vpwMinRate <=
vpwMaxRate` check is the validator-side complement, same as `floor`/
`ceiling` in Q51. Triage jointly with Q51 given the identical mechanism,
but as with Q48/Q49, a joint root cause does not mean either fix should
assume the other's implementation — the `vpw` strategy's own call site and
the three floor/ceiling strategies' call site are still independent code
locations that both need the fix applied, whichever direction is chosen.
Not routed through the P19 exclusion table.

---

## 2026-09-12 — Q53. Nearly every boolean flag in the plan schema accepts any truthy value — the string `"false"` is silently treated as `true`

**A discovered defect, not a judgment call.** Full trace in
`SIMULATION_LOG.md` (Batch 22, 2026-09-12). Different in shape from every
prior finding this session — one repeated code pattern across the schema,
not one field or one mechanism.

**The defect.** Every boolean-shaped flag this session has touched —
`profile.spouseOn`, `retirement.dividendOn`/`survivor`/
`homeEquityFallback`, `advanced.rmdOn`/`conversionOn`/`ltcOn`/`healthOn`/
`reserveOn`/`bondTentOn`/`glideOn`/`rule55`/`networthOn`/`armRecastOnReset`,
and others — is read with a plain JavaScript truthy check (`if(p.X)`),
never a strict `=== true`. JavaScript truthiness treats **any non-empty
string as `true`**, including the strings `"false"` and `"0"`.

**Confirmed systematically, not from one field.** Swept 14 boolean flags at
`true`, `false`, `"false"`, and `"0"`. **9 of 9 fields where the test setup
could actually detect a difference confirmed the bug** —
`spouseOn`, `dividendOn`, `rmdOn`, `conversionOn`, `ltcOn`, `healthOn`,
`reserveOn`, `bondTentOn`, `armRecastOnReset`. In every one, `"false"` and
`"0"` produced results identical to real `true` and different from real
`false`. Five more (`survivor`, `homeEquityFallback`, `rule55`,
`networthOn`, `glideOn`) were inconclusive only because that batch's
specific test setup didn't happen to make `true` and `false` diverge at
all — **not** confirmed safe, just untested by that design. Zero fields
were found where `"false"` behaved as `false`.

**The contrast that pins down where the actual defense lives.**
`scenario-validator.js` contains exactly two genuine boolean type checks in
the entire file: `account.cashHolding`, and `advanced.armRecastOnReset`
(via a one-entry `ADVANCED_BOOLEAN_FIELDS` list, added for a prior FM-09
finding per its own comment, never generalized to any other flag).
Confirmed directly that the validator does reject
`armRecastOnReset: "false"` (`WRONG_TYPE`, `valid: false`) on import — but
also confirmed that **the raw engine still exhibits the identical
truthy-coercion bug on that same field once the validator is bypassed**,
which is what every scenario this entire session has done. The engine code
itself does not distinguish a "protected" flag from an "unprotected" one;
only whether a name happens to appear on that one-entry list decides
whether malformed input is ever caught before it reaches the engine. Two
fields are on that list. Roughly twenty comparable boolean flags across
`profile`, `retirement`, and `advanced` are not.

**Quantified end to end, not just as a synthetic value check.** A household
with `retirement.survivor: "false"` (data that says survivor modeling is
off) reports `lifetimeTaxes: $25,305.34` — identical to `survivor: true`,
and nothing like the real `survivor: false` result of `$147,115.08`. The
plan's own stated configuration and its actual behavior disagree by
roughly 6x, silently.

**Why this is a wider risk than any single-field finding this session.**
Q43/Q44/Q47/Q50/Q51/Q52 are each one field or one mechanism. This is one
code pattern, confirmed present at every field the audit could check,
defended at 2 of roughly 22 sites. Reachability matches Q50/Q51/Q52's
profile — no `NaN`, `Infinity`, or circular reference needed. A string
where a boolean was expected is one of the most ordinary bug shapes there
is: a form library returning `.value` instead of `.checked`, a URL
query-string import, a spreadsheet/CSV round-trip, or a JSON migration
script that copies a field without checking its type.

**Status: REPAIRED 2026-09-14.** Engine (`ca28d66`) and validator (`e15e187`)
both now apply the documented default when a flag is truly absent, refuse
a present non-boolean value, and preserve an explicit `false`, from one
shared contract. Full record: `S5_TASK_CHECKLIST.md` block 2l. Two files
outside this run's own scope went stale with the repair and still need
updating: `BOOLEAN_FLAG_CONTRACT.md` ("Enforcement: S5 block 2l, not yet
built") and `src/boolean-flag-contract.json`'s
`openQuestions.absentOnEngineRoutes` ("Repair is S5 2l.2, not yet landed").

**Status, superseded above: DECIDED 2026-09-13 (the owner) — the one question S4 left open.** A
property that is truly absent takes its documented default, so a missing
default-true flag is `true`. A present value that is not a boolean is
refused, never coerced, and an explicit `false` is preserved. The production
repair is `S5_TASK_CHECKLIST.md` block 2l, built on S4 2b.2e's contract.
Decided, not closed: the repair has not landed. *(As it stood before the
decision:)* Candidate directions: (a) generalize
`ADVANCED_BOOLEAN_FIELDS`'s pattern to every boolean-shaped field across
`profile`, `retirement`, and `advanced` in `scenario-validator.js`, closing
the import-time gap for all of them at once, the same mechanism that
already protects `armRecastOnReset`; (b) hold the engine itself to a
stricter read (`p.X === true` instead of `if(p.X)`) at each site, so a
malformed value fails toward "feature off" rather than toward "feature
silently on" even when the validator is bypassed entirely (as this
session's harness and, per the `armRecastOnReset` result, real imported
data both can be); (c) do both, matching this project's usual pattern of
validating at the boundary and keeping the engine's own logic defensive
rather than relying on the validator alone. Given how many call sites this
touches, whoever triages this should decide whether to fix it as one sweep
(consistent naming/pattern across every flag) rather than field by field,
the same shape of decision Q51/Q52 already flagged for `clamp()`'s eight
call sites. Not routed through the P19 exclusion table — every confirmed
field this session tested is in `engine.js`'s always-reachable path.

## 2026-09-12 — Q54. The scenario generator draws debt payments independently of the balance and rate they service, so about a third of corpus debts negative-amortize

**A discovered defect, not a judgment call**, and found sideways: Q43's repair
warned on a payment that does not cover its own interest, and two tests failed.
One of them — *"a clean corpus should trip no warnings, not merely no errors"* —
failed because the corpus is full of them.

**The mechanism.** `tests/lib/scenario-generator.js:614` draws
`paymentMonthly: d.float(200, 3500)` from a flat range. `balance` and `rate` are
drawn separately. Nothing relates the three, so whether a generated debt
services its own interest is decided by an accident of three independent draws.

**Measured across five independent seed ranges**, counting debts with a positive
balance and a positive rate:

| Batch | Debts | Payment ≤ own monthly interest | Share | Median cover |
|---|---:|---:|---:|---:|
| 120 @ seed 1 | 91 | 33 | **36.3%** | 1.41× |
| 120 @ seed 1000 | 84 | 31 | **36.9%** | 1.48× |
| 120 @ seed 5000 | 98 | 33 | **33.7%** | 1.39× |
| 500 @ seed 1 | 345 | 110 | **31.9%** | 1.83× |
| 500 @ seed 20000 | 324 | 112 | **34.6%** | 1.69× |

**Stable at roughly a third.** This is not a tail: the median debt covers its
interest only 1.4–1.8 times over, so the distribution sits close to the
boundary and a third of it falls the wrong side.

**The worst case in 500 @ seed 1** is a balance of **$418,773 at 11.77%** paying
**$224** against **$4,107/month** of interest — it services **5.5%** of its own
interest, and carries `payoffAge: 77`. That is Q43's exact shape: a balance that
grows every period and is then forced out in one, inside the reference corpus,
generated rather than authored.

**What this is not.** It is **not** an engine defect. `projectDebts()`
negative-amortizes these correctly and deliberately — the B-6 fix, covered by
`tests/debt-projection-divergence.test.js`. The arithmetic is right. The
question is whether the reference corpus should contain a third of its debts in
a state no one chose.

**Why it matters beyond tidiness.** The corpus is the instrument the rebuild
will be judged against: the accepted baseline captures its outputs, and the
differential gate is an empty diff over it. A third of its debts being
underwater is a property of that instrument, and **nobody decided it** — it is a
consequence of three `d.float()` calls that do not know about each other. It
also already distorted a repair: Q43's check had to be scoped to an explicit
zero rather than to underpayment generally, because the broader and
arithmetically correct check fires on a third of the reference corpus.

**Status: DECIDED — S4-PA-12, SPLIT AND VERSION, the owner 2026-09-13.** Neither (a),
(b) nor (c) as originally framed: keep the underpaying debts as a
**deliberately labelled adversarial set**, and generate a **separate ordinary
set** with consistent balance, rate, term and payment — every member
classified (zero-interest, ordinary amortizing, interest-only,
negative-amortizing/underpaying, payoff, zero-balance) with an independent
closed-form expectation, tested at, just below and just above the payment
boundary. Admissibility of underpayment is a product-contract question and is
**not** decided by this — both sets ship, and the validator warns rather than
refuses. Done at `d3dc52a` (classes and expectations) and `b9db405` (the
sets); gate met at `9fa2713` (`S4_TASK_CHECKLIST.md` 4.6). The freeze
deadline named below is now **S5b task 4** (**not** "S5 task 10" — that
task no longer exists under that name after the 2026-09-12 S5/S5b split;
S5's tax-block task 10 is now the QCD cap). *(Corrected 2026-09-13, later
the same day, on a report from `investment-calculator-bd`: this entry's
own text was never updated after S4 settled it, and still named a task
number that moved.)*

*(As it stood before the decision:)* Candidate directions, none chosen: (a) derive
`paymentMonthly` from the balance and rate — for example a draw around the
interest-only payment — so coverage is a *chosen* distribution rather than an
accident; (b) keep the current draw and **state** that roughly a third of corpus
debts negative-amortize, so the property is deliberate and documented rather
than discovered; (c) split the difference — generate a declared proportion of
underwater debts on purpose, so the stress coverage is real and the share is a
decision. **Any of these changes the corpus and therefore moves the reference
baseline**, so it must land before the S5 task 10 freeze or not at all. Not
routed through the P19 exclusion table: the generator is test infrastructure,
not a shipped module.

---

## 2026-09-12 — Q55. Every array-shaped plan field crashes `runPlan()` uncaught on a non-array value — eight confirmed sites, all validator-defended, none engine-defended

**A discovered defect, not a judgment call.** Full trace in
`SIMULATION_LOG.md` (Batch 23, 2026-09-12). Structurally close to Q48 (same
"engine has no defense of its own once the validator is bypassed" shape)
but broader in site count and more ordinary in reachability.

**The defect.** `scenario-validator.js` checks array-shape comprehensively
— `retirement.stages`/`expenses`/`otherIncomes`, `advanced.assetClasses`/
`debts`/`otherAssets`, and `accounts` all get an explicit `Array.isArray()`
check with a `WRONG_TYPE` error on failure (confirmed by reading the
validator directly, not assumed). But `engine.js` reads every one of these
with a bare `(x || []).forEach`/`.reduce` pattern that is falsy-safe for
`null`/`undefined` and **not** safe for a stray `{}` — an empty object is
truthy, survives the `|| []` fallback unchanged, and plain objects have no
array methods.

**Confirmed live, eight for eight, with the validator run side by side on
the identical plan each time:**

| Field set to `{}` (or wrong-type value) | `runPlan()` | `validateScenario()` on the same plan |
|---|---|---|
| `retirement.stages` | **throws**: `.forEach is not a function` | `WRONG_TYPE`, rejected |
| `retirement.expenses` | **throws**: `.reduce is not a function` | `WRONG_TYPE`, rejected |
| `retirement.otherIncomes` | **throws**: `.forEach is not a function` | `WRONG_TYPE`, rejected |
| `advanced.assetClasses` (with `assetsOn`) | **throws**: `.forEach is not a function` | `WRONG_TYPE`, rejected |
| `advanced.debts` | **throws**: `.reduce is not a function` | `WRONG_TYPE`, rejected |
| `advanced.otherAssets` | **throws**: `.reduce is not a function` | `WRONG_TYPE`, rejected |
| `accounts` (top level) | **throws**: `.reduce is not a function` | `WRONG_TYPE`, rejected |
| `retirement.manualOrder = 1234` (number, `withdrawalOrder: 'manual'`) | **throws**: `.split is not a function` | `WRONG_TYPE`, rejected |

Every single one is an uncaught `TypeError` thrown straight out of
`runPlan()` — none converts to the project's own `{rows: null, status:
"calculation_error", ...}` contract the way duplicate ids or an extreme
horizon do.

**Contrast cases, checked so the fallback pattern isn't mischaracterized as
broken everywhere:** `advanced.assetClasses = []` (a valid, empty array)
runs to completion with no division-by-zero or empty-loop issue.
`retirement.otherIncomes = null` also runs cleanly end to end — `null` is
falsy, so `|| []` correctly absorbs it. (The validator rejects `null` too,
which is *stricter* than the engine needs; harmless overcaution, not a
defect, but worth knowing `null` and `{}` get identical validator
treatment despite only one being unsafe at the engine level.)

**Reachability: ordinary JSON, no exotic input required.** Unlike Q48
(needs a circular reference, impossible in valid JSON) and closer to
Q50-Q53's profile, `{}` where an array was expected is a completely normal
shape for a migration script, a serialization bug, or a hand-edited
scenario file to produce. The only reason this sits in a different bucket
from Q50-Q53 is that the validator here is *already* comprehensive — the
gap is entirely that the engine has no defense of its own once that one
layer is skipped, which is the exact standard
`nonFiniteScenarioInputCode()`'s own comment states ("the check has to live
where every execution path passes, before `clone()` and before any cash
moves") and the standard Q48 was judged against.

**Status: REPAIRED 2026-09-14.** All 9 sites (the 8 named here plus
`accounts[].futureChanges`) now refuse at the boundary with
`SCENARIO_NON_ARRAY_LIST_FIELD`, instead of crashing. Measured harness
EMPTY (`d3308d4`). Full record: `S5_TASK_CHECKLIST.md` block 2i.

**Status, superseded above: DECIDED 2026-09-13 (the owner) — reject, as in (a).** The engine
itself refuses a non-array list field with its existing invalid-result error,
instead of crashing and instead of normalizing the field to `[]`. The repair
is `S5_TASK_CHECKLIST.md` block 2i (2i.5). Decided, not closed: the repair has
not landed. *(As it stood before the decision:)* Candidate directions: (a) add a shared guard
at the top of `runPlan()`/`simulatePlan()` that normalizes each of these
fields to `[]` (or rejects the plan via the existing `calculation_error`
contract) if it isn't genuinely an array, closing all eight sites with one
change rather than eight; (b) leave the validator as the sole defense and
accept that any caller bypassing it (this session's entire harness, and by
extension any embedding context that calls `runPlan()` directly rather than
through the validated import path) inherits the crash risk; (c) treat this
alongside Q53 as one broader "engine boundary hardening" pass, since both
findings share the same root standard even though the concrete defect
differs (truthy-coercion vs. missing array-method safety). Not routed
through the P19 exclusion table — every confirmed site is in `engine.js`'s
always-reachable path.

---

## 2026-09-12 — Q56. `retirement.optimizationGoal` ("smart withdrawal" presets) frequently produce identical output across all five values — recorded for the post-rebuild redesign, not for repair here

**Not a defect to fix in the current system — filed as reference material,
per the owner's explicit direction.** Full trace in `SIMULATION_LOG.md` (Batch
17 and Batch 24, 2026-09-12). Unlike every other entry in this file, this
one is not "OPEN, undecided" awaiting a chosen repair — the owner has said
directly that the current smart-withdrawal system is not to be fixed, and
intends to use its present behavior as inspiration for a new
smart-withdrawal system built after the engine rebuild (see
`[[project_cpu_rebuild_tracker_artifact]]`/the CPU Engine Rebuild tracker).
This entry exists so the *characterization* of the current system's actual
behavior is on record for whoever designs the replacement, not to route
this into ordinary triage.

**What was measured.** `retirement.optimizationGoal` has five values
(`balanced`/`success`/`taxes`/`spending`/`legacy`), read only by
`smartWithdrawalOrder()` (`src/engine.js:736`) and only when
`withdrawalOrder: 'optimized'` — under `'manual'` it's a complete no-op
(confirmed Batch 17). Ran all five presets across three deliberately
different household shapes chosen to stress different parts of the
scoring function (RMD proximity, IRMAA guard margin, legacy/Roth
preference):

| Household shape | Distinct withdrawal orders (of 5) | Distinct `lifetimeTaxes` outcomes (of 5) |
|---|---|---|
| Moderate mixed-account retiree near RMD age (66) | 1 | 2 |
| PreTax-heavy household near the joint IRMAA cliff (64) | **1** | **1** |
| Legacy-minded household, large Roth, low spending need | 2 | **1** |

The middle household collapsed completely — all five presets, including
the nominally tax-minimizing (`'taxes'`) and legacy-protecting
(`'legacy'`) goals, produced byte-identical results. The third showed two
distinct order *strings*, but even that difference didn't change the tax
outcome, because the only positions that swapped were both tax-free
withdrawal classes.

**Why it collapses, mechanically.** Every goal nudges a handful of
per-class scores by single-digit-to-teens point amounts
(`smartWithdrawalOrder()`'s own `if(goal==="taxes"){scores.taxable-=6;
scores.roth+=5;...}`-shaped branches). Those nudges compete against much
larger, goal-independent adjustments already baked into the same scoring —
the pre-59.5 penalty (+45 to `preTax`), RMD proximity (-20 to -14), and the
IRMAA guard margin (+18) all dwarf what any `optimizationGoal` branch can
move. In household shapes where one of those larger signals dominates, the
goal cannot change the resulting order at all.

**Methodological note, kept for whoever revisits this measurement (not a
finding of its own):** a *single* direct call to `smartWithdrawalOrder()`
at one age can understate a goal's real effect, because the function is
recomputed fresh every period inside `simulatePlan()` using that period's
own age/balance/`priorReturn` state — one household showed identical
order-strings at its starting age yet still produced measurably different
`lifetimeTaxes` end to end, because the order evidently diverged at a
later, unsampled age. Only a full `runPlan()` comparison reflects the
actual effect; a one-shot snapshot can miss it.

**Status: closed to repair, open as design input.** Not routed through
triage, not assigned a fix. If useful to the rebuild: the failure mode
worth avoiding in the replacement is a set of user-facing "goal" presets
whose real-world effect depends on which unrelated, larger signal happens
to dominate for a given household — a design that makes the presets
*look* like five different strategies while frequently behaving as one.

---

## 2026-09-12 — Q57. A string-typed contribution amount is concatenated, not added — closed for `contribution` by Q49, still engine-undefended for `futureChanges[].value`

**A discovered defect, not a judgment call.** Found while building Q49's
"separately chosen JSON-reachable wrong-type inputs" arm. A distinct mechanism
from Q49's: Q49 is a non-finite number reaching arithmetic; this is a
**string** reaching `+`. Not traced in `SIMULATION_LOG.md` — that file belongs
to another session; the measurements are recorded here.

**The mechanism.** `accountPlannedContribution()` builds the planned amount
with `+=`: `amount+=a.annualChange*periods`, and for an additive future change
`amount+=c.value`. When the running amount or `c.value` is a string, `+`
concatenates. `*` and `/` coerce, so percent mode and the `annualChange*periods`
product are unaffected; `+=` is where it bites.

**Measured on `contribution`, before Q49** (engine `e3f008ab…e034`). Age 40 to
46, `annualChange` 5, amount mode:

| `contribution` | per-year deposits | status | validator |
|---|---|---|---|
| `1000` | 1,000 · 1,005 · 1,010 · 1,015 · 1,020 | ok | silent |
| `"1000"` | **10,000 · 10,005 · 100,010 · 100,015 · 100,020** | **ok** | **silent** |
| `"25"` | 250 · 255 · 2,510 · 2,515 · 2,520 | ok | silent |

The deposit is set by the **digit count of the increment**, not its value: a
$5 raise moved it from 10,005 to 100,010 in one year, because `"1000" + 10` is
`"100010"`. The first attempt to separate concatenation from coercion used a
one-year plan, where `elapsed` is 0 in the only contributing year and the
increment never entered the arithmetic; it could not discriminate, and the
five-year run above was the one that did.

**`contribution` itself is now closed at both layers by Q49 (`5d34573`).**
Measured at the tree that became `c9f76ee`: `"1000"` returns
`SCENARIO_NONFINITE_CONTRIBUTION` from `runPlan()`
(`isFiniteNumberValue("1000")` is `false`), and the validator reports
`WRONG_TYPE`.

**Still live: `accounts[].futureChanges[].value`.** Measured at the same tree,
contribution `1000` and a change from age 40:

| change | deposits | status | validator |
|---|---|---|---|
| additive `500` (control) | 1,500 | ok | — |
| additive `"500"` | **1,000,500** | **ok** | `WRONG_TYPE` on `.value` |
| set `"500"`, then additive `5` | 500, then **5,005** | **ok** | `WRONG_TYPE` on `.value` |

The probe used mode `'add'`, which the validator reports as `UNRECOGNIZED_VALUE`
(its enum is `set`/`percent`/`dollar`). The engine branches only on `set` and
`percent` and treats every other mode as additive, so the UI's own `dollar`
mode takes the same branch — **established by reading, not by a run with
`dollar`**. A witness for this entry should use `dollar`.

**Reachability: direct JavaScript input only, today.** The validator refuses a
string `value` (`WRONG_TYPE`, an ERROR, and import refuses on any ERROR), and
the UI assigns `item.value=Number(value.value)`. So this has Q55's profile —
validator-defended, engine-undefended — not Q43's. Before Q49, the
`contribution` half had no validator check either; whether a saved file
carrying `"1000"` would have travelled the real import path end to end was
**not measured**.

**Status: REPAIRED 2026-09-14, candidate (a).** `futureChanges[].value` is
now refused at the boundary alongside `contribution`, the same
non-finite-input shape Q49 used (`b1f983b`). Measured harness EMPTY. Full
record: `S5_TASK_CHECKLIST.md` block 2j.1.

**Status, superseded above: OPEN, undecided.** Candidate directions: (a) extend
`nonFiniteScenarioInputCode()` to a present `futureChanges[].value`, the same
shape as Q49 — cannot move any run whose values are numbers; (b) coerce with
`Number()` inside `accountPlannedContribution()` — an arithmetic change in the
contribution path, which turns today's 1,000,500 into 1,500, and needs the
corpus's `futureChanges` values measured before anyone calls it baseline-safe;
(c) fold into Q55's engine-boundary hardening pass. Not routed through the P19
exclusion table — `accountPlannedContribution()` is on the always-reachable
path.

> **Verification note, 2026-09-12 (independent reproduction, closes the
> `dollar`-mode gap this entry itself flagged).** The measurement above used
> mode `'add'` and stated explicitly that the `dollar`-mode path was
> established by reading the branch logic, not by a run — "*A witness for
> this entry should use `dollar`*." Ran that witness directly:
> `accountPlannedContribution()` with `contribution: 1000` and
> `futureChanges: [{ age: 35, mode: 'dollar', value: '500' }]` (a string)
> returns **1,000,500**; the identical setup with the real number `500`
> returns **1,500**. Matches the table above exactly, confirming the `dollar`
> branch behaves the same as the `'add'` placeholder used to establish it —
> not a new mechanism, the missing data point for the one already described.
>
> **Also confirmed end to end through `runPlan()`, not just the isolated
> function.** Built a full plan with the same malformed `futureChanges`
> entry (`contribution: 1000`, `dollar` mode, `value: '500'` at age 35): the
> plan runs to completion with `failed: false`, `calculationError: false` —
> no rejection, no warning, nothing — and the published row at age 36 shows
> `contributions: 1,000,500`, carried straight into that period's `total`.
> `isFiniteNumberValue()`-style gates don't catch this because the
> concatenated result is a real, finite, entirely plausible-looking number,
> not `NaN`/`Infinity` — the same reason Q50/Q51/Q52 evade a naive
> finiteness check. Confirms this entry's own read that nothing downstream
> intercepts it, with a live `runPlan()` result rather than only the
> isolated function call.

---

## 2026-09-12 — Q58. `retirement.strategy` has no enum validation anywhere — any unrecognized value silently substitutes `incomeFirst`, with no error or warning

> **Correction, 2026-09-13 — the `engine.js:1174` citation below is stale.**
> Relayed by `investment-calculator-84`, verified before being folded in:
> this entry was filed at `c3467df`, where `strategySpending()` sat at
> line 1229 — `1174` matches an even earlier engine (pre-Q49, `e3f008ab…`,
> where the function was at `:1173`), not the commit this entry names. At
> `d825182` it is at line **1259**. Re-locate by symbol, not by the line
> number in the paragraph below, per this project's own standing rule.

**A discovered defect, not a judgment call.** Full trace in
`SIMULATION_LOG.md` (Batch 25, 2026-09-12).

**The defect.** `retirement.strategy` selects among nine dispatched values
in `strategySpending()` (`src/engine.js:1174`, an `if`/`else if` chain:
`fixedReal`, `fixedNominal`, `constantPercent`, `guardrails`, `guyton`,
`vpw`, `rmd`, `floorCeiling`, `incomeFirst`). The chain's final branch is a
bare `else amount=r.spending*inflationFactor` — identical to the explicit
`incomeFirst` branch just above it. There is no `else` that flags an
unrecognized value; any string that doesn't exactly match one of the nine
known names silently receives `incomeFirst` behavior. Grepped
`scenario-validator.js` for any enum check on `retirement.strategy`: **none
exists** — not `checkEnum`, not any hand-rolled equivalent, for any
strategy name in either the right or wrong case.

**Confirmed live.** `retirement.strategy: 'Guardrails'` (wrong case — the
real value is lowercase `guardrails`) produced output numerically identical
to the `incomeFirst` control on the same household. A household whose plan
data has this strategy field mistyped, wrong-cased, or set to a since-
renamed/removed strategy name gets a *materially different withdrawal
policy* than the one they selected, with nothing anywhere — not an error,
not a warning, not a validator rejection — to indicate the substitution
happened.

**Where this sits relative to the session's other case-sensitivity checks
(same batch, checked side by side rather than assumed to generalize):**
`account.taxClass` and `retirement.withdrawalOrder` are both
mis-case-vulnerable in the raw engine the same way, but **both are
validator-defended** (`checkEnum` against `TAX_CLASSES` and
`WITHDRAWAL_ORDERS` respectively) — the same "engine unsafe, validator
catches it on import" shape as Q53/Q55, not filed again here.
`retirement.strategy` is the one enum-shaped field in this comparison set
with **no defense at either layer** — not validated on import, and silently
substituted rather than erroring in the engine.

**Status: REPAIRED 2026-09-14, per the decision below.** Engine and
validator both land at `0a463ab`; the app's load path at `0464571`. A
wrong-case name normalises silently; an unrecognized name warns, runs
`incomeFirst`, keeps the saved name on the plan, and shows a results-page
card naming it — including on load, so a saved plan's strategy is no
longer silently erased. Measured harness EMPTY, both commits. Full record:
`S5_TASK_CHECKLIST.md` block 2k.

**Status, superseded above: DECIDED 2026-09-13 (the owner) — (b)+(c) in spirit: warn, then default
to `incomeFirst`** (not a hard refusal); wrong-case values (e.g.
`'Guardrails'`) normalise silently rather than erroring; a saved plan whose
strategy was since renamed or removed gets the same warn-and-default
treatment on load, uniformly — no separate migration pass, since the app
does persist scenarios (`localStorage`, `app-shell.html:515-516`). Full
record: `S5_TASK_CHECKLIST.md` blocks 2k.3–2k.5 / Task 00 item 8, which
also folds in two corrections from `investment-calculator-84` (the
`withdrawalOrder` control, and this entry's own stale `engine.js:1174`
citation for `strategySpending()` — it's at line 1259 as of `d825182`).
Decided, not repaired: the checks have not landed.
*(As it stood before the decision:)*

**Status, superseded above, kept only for history — this line pre-dates the 2026-09-13 decision and was left stranded below it: OPEN, undecided.** Candidate directions: (a) add
`checkEnum(c, retirement.strategy, 'retirement.strategy', STRATEGIES)` to
`scenario-validator.js`, closing the import-time gap the same way `taxClass`
and `withdrawalOrder` are already closed — the nine dispatched names would
need to be exported or otherwise kept in sync with `strategySpending()`'s
own `if`/`else if` chain, the same "harvest the enumeration from the source
of truth" approach `tests/lib/scenario-generator.js` already uses for this
exact list per Q38's comment in `engine.js`; (b) make the engine's own
fallback branch explicit and loud (an unrecognized `strategy` value routes
to a `calculation_error` rather than a silent `incomeFirst` substitution),
consistent with this project's general preference for a visible failure
over a silently-substituted default; (c) do both. Not routed through the
P19 exclusion table — `strategySpending()` is on `engine.js`'s
always-reachable path.

## 2026-09-13 — Q59. The engine has no household budget before retirement: a contribution can be made from no cash, and a debt payment outside spending is funded by nothing

**This records a measured model boundary with a defect-shaped consequence. It records the finding and does not decide it (ground rule 8).** S4 task 6's household cash-flow ledger found it (`HOUSEHOLD_LEDGER.md`; `tests/household-ledger.test.js`, committed at `11196b1`). The ledger classifies every projection row instead of forcing it to balance.

**What was measured.** The sweep covered both capture corpora and L4's generated set, with Monte Carlo checked path by path. It found **0 failures**: every retired row with no wages, no contributions and no off-budget debt closes exactly. Every other row falls into one of two classes.

1. **Unallocated wages.** Wages left over after contributions, taxes and debt payments are unaccounted for: 2,870 of 6,478 control rows. **The engine models no pre-retirement consumption**, so this is a boundary of the model, not a leak.
2. **Contributions or debt payments with no modelled cash source.** This covers 49 of 6,478 control rows and 2,578 of 12,366 rows in L4's generated set. It takes three forms:
   - **A contribution with no income.** A hand-built household with `salary: 0` and a $500 Roth IRA contribution grows by $500 a year with no income and no withdrawal. `runPlan()` reports `status: ok`, and the validator raises only an unrelated warning. In the corpus, generated seeds 2, 10, 12 and 14 contribute $4,400–$71,030 a year with zero wages.
   - **Contributions far beyond income.** Generated seeds 3, 4, 15 and 20 contribute between $2.7M and $152M a year against salaries near $100,000. Taxable accounts have no contribution limit, and nothing ties a contribution to cash the household has.
   - **Debt payments outside spending.** A debt with `includePayment: false` reduces its balance with no modelled source, and so does every debt payment made during working years. A $500-a-month loan outside spending is $6,000 a year paid from nothing. This appears in corpus seeds 1, 3 and 14, where a payoff balloon lands outside spending.

**Why it matters.** A plan can build wealth from contributions nothing funds, and pay down debt with money it does not have. Every other check — L4, the result contract, the validator — treats that as ordinary. `MODEL_ASSUMPTIONS.md` section 7 already says the model "cannot establish that a contribution or a tax payment was actually funded". This entry measures how often that happens in the corpus, and shows two ways it becomes large.

**Not a duplicate.** Q43 is a payoff lump sum landing *inside* retirement spending. Q49 is about whether a contribution is a valid number. Q44 is about whether a toggle gates home-equity draws. None of them asks whether a contribution or an off-budget payment was funded.

**Status: REPAIRED 2026-09-14, both warnings.** `CONTRIBUTIONS_ABOVE_EARNED_INCOME` (WARNING) uses household earned income, not owner-only, so a legitimate spousal IRA isn't false-flagged. `DEBT_PAYMENT_OUTSIDE_SPENDING` (WARNING) fires when `includePayment` is explicitly false on a debt with a balance. No engine output change; measured harness EMPTY (`c2ff61b`). The frozen corpus's own zero-warnings test (`tests/scenario-generator.test.js`) now exempts exactly these two codes, per the owner's answer. Full record: `S5_TASK_CHECKLIST.md` block 2q.

**Status, superseded above: DECIDED 2026-09-13 (the owner) — (a) and (b), not (c).** The boundary is documented in `MODEL_ASSUMPTIONS.md` §7. The two validator warnings — planned contributions above wages (earned income, for IRA and Roth), and a debt whose payments are excluded from spending — are `S5_TASK_CHECKLIST.md` block 2q. No engine output changes. Decided, not closed: the warnings have not landed. *(As it stood before the decision:)* Candidate directions:

- **(a) Document the boundary** in `MODEL_ASSUMPTIONS.md`: there is no pre-retirement household budget, and contributions and off-budget debt payments are treated as funded from outside the model. The ledger's classes stay as the disclosure.
- **(b) Validate.** Warn when planned contributions exceed wages (for IRA and Roth, earned income), and when a debt's payments are excluded from spending.
- **(c) Model a working-period budget**: wages − taxes − contributions − debt payments = consumption, with a shortfall when negative. This changes engine output, so it belongs to S5, not S4.

Whatever is chosen, the ledger's two diagnostic classes stay as they are, and only a FAIL row is a failure.

## 2026-09-13 — Q60. In Monte Carlo mode, only path 0 of N ever writes to the returned `issues[]` diagnostic log — every other path is silently blind, independent of S4-IR-05's 200-item cap

**A discovered defect, not a judgment call.** Full trace in
`SIMULATION_LOG.md` (Batch 27, 2026-09-13). `src/engine.js` at `d825182`,
unchanged since `89dc893` when this was run.

**The defect.** `runPlan()`'s Monte Carlo branch (`src/engine.js:1943-1944`):

```
for(var i=0;i<p.assumptions.runs;i++){
  runs.push(simulatePlan(p,rng(baseSeed+i*2),0,rng(baseSeed+i*2+1),i===0?issues:null));
}
```

passes the real `issues` collector only when `i===0`; every other path
gets `null`. `recordIssue()` (`engine.js:1317`) opens with
`if(!issues||issues.length>=200)return;` — a `null` collector is a silent
no-op, not merely "capped." So of a batch of N Monte Carlo paths, only
path 0's own diagnostics can ever reach the returned result, regardless of
N, regardless of how many of the other N−1 paths independently hit a real
`calculationErrorCode`, and regardless of whether the 200-item cap S4-IR-05
already flagged would otherwise bind.

**What is NOT affected.** `aggregateMonteCarloRuns()` (`engine.js:1807`)
determines `calculationError`, `calculationErrorPaths`, and the
representative `calculationErrorCode` by scanning every run's own `rows[]`
directly (`engine.js:1821`, `1838`) — never the shared `issues` array. The
pass/fail verdict itself is correct and complete. Only the diagnostic
`issues[]` log attached to the result is blind past path 0.

**Confirmed live, with a real deterministic failure (not a synthetic
probe).** Batch 26's scenario #22 — `retirement.strategy:'incomeFirst'`
with a $150,000 pension that overshoots spending — trips a genuine
per-row `TAX_QUOTE_NONFINITE_CONTEXT` / `NON_FINITE_ROW_VALUE` pair every
year from age 66 through the plan's end, independent of market returns
(so every Monte Carlo path fails identically, isolating this mechanism
from any randomness-driven variation in *which* paths fail):

- Single path (`engine.simulatePlan()` called directly): **70 entries**
  recorded (2 codes/year × 35 years, ages 66–100).
- Same plan, Monte Carlo, 25 runs: `requestedPathCount:25`,
  `validPathCount:0`, `calculationErrorPaths:25`, `calculationError:true`,
  `calculationErrorCode:"TAX_QUOTE_NONFINITE_CONTEXT"` — all correctly
  reflect that all 25 paths failed. `issues.length:70` — **byte-identical**
  to the single-path run. 24 entire failing paths contributed nothing.

**Why this is a bigger gap than S4-IR-05's cap, not a restatement of it.**
S4-IR-05 (carried to S5, the owner decided to raise the engine's 200-item cap)
assumes the collector is actually being fed by the run(s) in question and
asks what happens once it fills. This finding is upstream of that: in
Monte Carlo mode the collector is fed by **at most one path**, so the cap
is reachable only if path 0 alone produces 200+ diagnostic rows in a
single path — a much narrower condition than "the batch generates 200+
issues total." In the reproduction above, the honest total across all 25
failing paths would have been 25 × 70 = 1,750, which the 200-item cap
would still truncate hard — but the cap never gets the chance to matter,
because 24 of 25 paths never get to write in the first place. Raising the
cap (S4-IR-05's carried fix) does nothing for this gap on its own.

**Why it matters.** A consumer reading `result.issues` off a Monte Carlo
batch — a debug panel, an automated triage script, a support workflow —
has no way to tell "one path had this one problem" from "24 of 25 paths
had this problem for the same reason." The aggregate `calculationErrorPaths`
count is right there and does carry the true magnitude, but nothing about
`issues[]`'s shape signals that it is not itself a complete or
representative sample once more than one path is involved.

**Status: OPEN, undecided.** Candidate directions: (a) accumulate `issues`
across every path (each path still individually gated by the existing
200-item cap, or a per-path sub-cap plus a batch-level cap, once S4-IR-05's
carried cap change lands); (b) leave per-path collection as path-0-only by
design (cheap sampling), but say so explicitly in the returned shape —
e.g. an `issuesSampled:true`/`issuesPathCount:1` flag — so a consumer can't
mistake a one-path sample for a complete log; (c) do nothing, on the
premise that `calculationErrorPaths`/`calculationErrorCode` already carry
the actionable signal and `issues[]` was only ever meant as a
single-path debug aid, never a Monte Carlo–complete log. Not routed
through the P19 exclusion table — `runPlan()`'s Monte Carlo branch is on
the always-reachable public path (`assumptions.method:'monteCarlo'` is a
named golden scenario, `monte-carlo-fixed-seed`).

## 2026-09-13 — Q61. `assumptions.runs` of 0, a negative number, `null`, or `NaN` crashes Monte Carlo mode uncaught, the same failure shape as Q48

**A discovered defect, not a judgment call.** Full trace in
`SIMULATION_LOG.md` (Batches 26–27, 2026-09-13). `src/engine.js` at
`d825182`, unchanged since `89dc893` when this was run.

**The defect.** `runPlan()`'s Monte Carlo branch loops
`for(var i=0;i<p.assumptions.runs;i++){runs.push(...)}`
(`src/engine.js:1943`) with no lower-bound check on `assumptions.runs`,
then unconditionally calls `aggregateMonteCarloRuns(runs)`, which
immediately reads `runs[0].rows.length` (`engine.js:1819`) to size the
per-year output. If the loop body never executes, `runs` is `[]` and
`runs[0]` is `undefined` — an uncaught `TypeError`, not a clean
`calculationErrorCode` rejection. Neither `nonFiniteScenarioInputCode()`
nor `accountContractCode()` — the two gates `runPlan()` runs before any
path starts (`engine.js:1881`) — inspect `assumptions.runs` at all, so a
bad value reaches the unguarded loop every time.

**Confirmed live, bounded precisely:**

| Input | Result |
|---|---|
| `runs:0` | **THREW UNCAUGHT** — `TypeError: Cannot read properties of undefined (reading 'rows')` |
| `runs:-1` / `runs:-5` | **THREW UNCAUGHT**, same error |
| `runs:null` | **THREW UNCAUGHT**, same error |
| `runs:NaN` | **THREW UNCAUGHT**, same error |
| `runs:0.5` | Accepted — loop body runs once, `requestedPathCount:1` |
| `runs:"20"` (numeric string) | Accepted — `<` coerces the string, `requestedPathCount:20` |
| `runs:undefined` (field omitted) | Accepted — defaults to `1000` |

**Same shape as Q48.** Q48 is an uncaught crash from an unguarded
`clone()` on a circular reference; this is an uncaught crash from an
unguarded array index on an empty `runs` array. Both bypass the engine's
own "reject cleanly with a `calculationErrorCode`" contract that every
other malformed-input path in `runPlan()` observes
(`SCENARIO_NONFINITE_ACCOUNT`, `SCENARIO_NONFINITE_CONTRIBUTION`,
`SCENARIO_DUPLICATE_ACCOUNT_ID`, etc.) — this input simply never reaches
that gate.

**Status: OPEN, undecided.** Candidate directions: (a) add a
`p.assumptions.runs` check to `nonFiniteScenarioInputCode()` (or a
sibling gate), rejecting non-positive, non-finite, or non-integer values
with a new `SCENARIO_INVALID_RUN_COUNT`-shaped code, closing this the same
way Q49 closed `account.contribution`; (b) coerce defensively inside the
Monte Carlo branch itself (e.g. `Math.max(1, Math.floor(Number(p.assumptions.runs)||1))`)
before the loop, so a bad value degrades to a 1-path run rather than
crashing; (c) both. No real UI path can currently produce a non-positive
`runs` value (the UI's own Monte Carlo run-count control almost certainly
has a `min` — not checked in this batch), so this is reachable only by
calling the engine directly or via a malformed saved/imported scenario
file, the same reachability class as Q48's circular reference.

## 2026-09-13 — Q62. PMI never cancels — charged as a flat annual cost for the life of any loan with `pmiMonthly`, never dropping at the 78–80% LTV threshold real mortgages cancel it at

**A modeling gap, not a wrong answer — filed for visibility and routing rather than as a defect.** Full trace in `SIMULATION_LOG.md` (Batch 11, 2026-09-12). Traced `debtHousing` (PMI + property tax + insurance + HOA) across the full 20-year payoff of a mortgage that started at exactly 80% loan-to-value: the $2,160/yr PMI charge is **perfectly flat every single year**, age 46 through 65, only dropping to $0 the year *after* the loan is completely paid off. Real mortgages cancel PMI automatically once the balance drops to 78–80% LTV under the Homeowners Protection Act, typically years before full payoff — the model has no such logic; PMI is charged as a flat cost for the entire life of any loan with a nonzero `pmiMonthly` and `balance > 0`.

**Not a numerical error.** 0 reconciliation mismatches. Every dollar charged is charged consistently with the model's own (incomplete) rule; the rule itself just doesn't represent LTV-based cancellation. Under this sprint's own wrong-answer-versus-not-modeled test, this reads as the *not-modeled* side — closer to the deferred capital-gain-character buckets than to Q43's silent drain — but it does make any long mortgage payoff with PMI entered read more expensive than reality for however many years PMI would actually have been cancelled, which is worth a household knowing before they trust the number.

**Status: OPEN, undecided.** Candidate directions: (a) model LTV-based automatic PMI cancellation (the Homeowners Protection Act's 78% mandatory / 80% requested-cancellation thresholds) — a real feature, needs the current property value tracked against the original balance, which `advanced.debts[]` doesn't currently carry a growth-adjusted view of; (b) disclose the simplification in `MODEL_ASSUMPTIONS.md` and leave the flat charge as-is, consistent with how the property-tax fallback rate is already disclosed as a rough estimate rather than fixed; (c) both — disclose now, model later. Not routed through the P19 exclusion table — the housing-cost path is on `engine.js`'s always-reachable path. No sprint currently owns this; candidate (a), if chosen, is a feature build appropriate to S103 alongside the rest of the deferred housing/debt UI work.

## 2026-09-13 — Q63. No non-negative range check on `balance`, `contribution`, or `spending` anywhere in `scenario-validator.js`

**A hardening gap, not a confirmed defect — filed at the engineering-log author's own suggestion rather than as a judgment call already made.** Full trace in `SIMULATION_LOG.md` (Batch 15, 2026-09-12). A deliberately invalid raw-input scenario (negative salary, negative starting balance, negative spending, fed directly to `engine.runPlan()`) was **not** rejected the way a duplicate account id or an extreme `endAge` is — it ran normally and carried the negative account balance through as a literal negative number, reconciling correctly (not a computation error, just what was fed in). `scenario-validator.js` has no `balance >= 0` (or similar) range check on accounts, contributions, or spending fields.

**Narrower than it first sounds.** The live UI's own number inputs almost certainly carry `min="0"` on these fields, the same way `v2-ss-claim` carries `max="70"` — so ordinary use through the UI is unaffected. Unlike `ssClaim`, though, there is no second line of defense in the import/validation path specifically for sign, so a malformed saved/imported scenario or a direct engine caller can pass a negative balance/contribution/spending value straight through. No realistic accidental-user path was found for this in Batch 15.

**Status: OPEN, undecided.** Candidate directions: (a) add a non-negative range check for `balance`, `contribution`, and `spending` in `scenario-validator.js`, closing the import-time gap the same way `ssClaim`'s range is already closed; (b) leave it — the reachability is narrow (direct engine callers or malformed imports only) and every case so far reconciles correctly rather than producing a wrong-looking number, so the case for a defect is weaker than for Q55's non-array crash or Q57's string-concatenation bug. Not routed through the P19 exclusion table.

## 2026-09-13 — Q64. `flexibility` and `guardrails` compound on the same down-year signal instead of being alternatives, with no UI cue that combining them stacks

**A discovered interaction, not a judgment call already made — filed for visibility.** Full trace in `SIMULATION_LOG.md` (Batch 17, 2026-09-12). Called `strategySpending()` directly with guardrails already triggering a cut from `priorReturn = -10%`, at three `flexibility` values: `0` → $54,000, `20` → $43,200 (a further 20% cut on top of guardrails' own adjustment), `50` → $27,000 (a further 50% cut). Both mechanisms read the same `priorReturn < 0` signal and apply independently — a household using both gets a compounded reduction, not the larger of the two or a blended one.

**Not necessarily wrong.** A sophisticated user might deliberately stack two conservative levers, and nothing in the engine claims otherwise. But nothing signals that's what combining them does either, and the two features' names read like separate strategies more than components meant to be layered — the same shape of gap as Q36's `advanced` typo problem, one level up: not a wrong answer, but a UI/documentation gap around what a combination of settings actually does.

**Status: OPEN, undecided.** Candidate directions: (a) add a UI cue (a note, or a disabled/warned state) when both `flexibility` and `guardrails` are active together, so the compounding is visible rather than discovered; (b) document the compounding explicitly in `MODEL_ASSUMPTIONS.md` as the intended interaction; (c) leave it — the two settings compose the way any two independently configurable settings compose, and that may simply be correct. This is judgment-call territory the simulation log isn't positioned to resolve, filed here so it isn't lost. Not routed through the P19 exclusion table.

## 2026-09-13 — Q65. Overlapping `percent`-mode spending stages compound multiplicatively with no warning; only `amount`-mode overlaps resolve by simple array order

**A discovered defect, not a judgment call — the mechanism is confirmed, the policy response is not.** Full trace in `SIMULATION_LOG.md` (Batch 18, 2026-09-12, corrected in place the same day under "P19-H1" after a first pass mis-stated the mechanism). Also recorded in the Roadmap artifact's R22 entry ("a claim we adopted because it was adjacent to checked work"), which reproduced it independently against the shipped engine.

**The defect.** `applyStage()` (`src/engine.js`, re-locate by symbol — was `:1130`) composes overlapping stages **sequentially by mode**, in `forEach` array order, with no break after the first match and no validator check on stage overlap at all. An `amount`-mode stage *replaces* the running base, so "the later stage in the array wins" holds for `amount`-mode overlaps. A `percent`-mode stage *multiplies* the running base, and multiplication **composes across every matching stage in the same pass** — it does not replace. Confirmed directly, called against the shipped engine: one 120%-mode stage on a $100,000 base gives $120,000; **two overlapping 120% stages give $144,000** (120% of 120% of the base), not $120,000 as "later wins" would predict. Two 100%-mode stages compound to 144,000 the same way.

**Why this is a defect rather than a not-modeled gap.** The engine returns a specific, computed number for overlapping percent-mode stages — it doesn't refuse, warn, or flag the overlap in any way — and that number is a silent multiplicative compounding a user who set up two independent percent-mode spending stages almost certainly did not intend. This is the same "flag, don't guess" shape `TAX §10.2`/`ACCOUNT §19` name for other findings (Q43, Q44, Q45): the engine has an answer, it just isn't disclosed as anything other than an ordinary number.

**Status: OPEN, undecided.** Candidate directions: (a) validate against stage overlap entirely — reject a scenario whose stages' age ranges overlap, forcing the user to make ranges disjoint or explicit about priority; (b) keep overlap legal but warn when two or more `percent`-mode stages' ranges intersect, since that's specifically where compounding (not simple override) happens; (c) change the resolution rule itself — sum, take the max, or otherwise define a deliberate precedence for overlapping stages instead of array order — a bigger engine-behavior change that would move financial output for any scenario with overlapping stages today; (d) leave it and disclose the mechanism in `MODEL_ASSUMPTIONS.md`, on the premise that array-order composition is a legitimate if surprising modeling choice. Whichever is chosen moves financial output only if (c) is taken — predict the diff first if so, per ground rule 10. Not routed through the P19 exclusion table — `applyStage()` is on `engine.js`'s always-reachable path.

## 2026-09-13 — Q66. `advanced.reserveYears`'s "years of spending in reserve" is computed per account, not against the whole portfolio — splitting the same balance across more accounts silently weakens the protection

**A discovered defect, not a judgment call.** Full trace in
`SIMULATION_LOG.md` (Batch 29, 2026-09-13).

**The defect.** `accountReturnForPeriod()` (`src/engine.js:1309`):

```
if(p.advanced.reserveOn&&age>=p.profile.retireAge){
  var reserve=Math.min(ac.balance,p.retirement.spending*p.advanced.reserveYears),
      share=reserve/Math.max(1,portfolioTotal);
  ret=ret*(1-share)+.03*share
}
```

runs once per account. `reserve` is capped by **that account's own
balance**, not by how much of a portfolio-wide reserve target has already
been accounted for by other accounts. The UI's own label for
`reserveYears` is "Years of spending in reserve" (`app-shell.html:333`) —
a single quantity a user would reasonably expect to mean "this many
dollars of my whole portfolio sit in reserve," not "this many dollars of
each individual account, independently."

**Confirmed live** with a $1,500,000 household, `spending:$60,000`,
`reserveYears:5` (target: $300,000), 10-year horizon, `reserveOn` toggled
as a control:

| Split | `reserveOn` | Ending total |
|---|---|---|
| 1 account, $1.5M | `false` | $3,210,727 |
| 10 accounts x $150k | `false` | $3,210,727 — identical, account count alone never matters without the mechanic |
| 1 account, $1.5M | `true` | $2,880,417 |
| 3 accounts x $500k (each still >= the $300k target) | `true` | $2,880,417 — identical to the 1-account case, since every account's own balance already clips `reserve` to the same target |
| 10 accounts x $150k (each < the $300k target) | `true` | $2,979,498 — **different from both `reserveOn:true` rows above**, ~$99,081 higher, purely from how the same $1.5M was partitioned |

The 10-small-accounts case sits closer to the `reserveOn:false` baseline
than the 1-account/3-large-accounts case does: once individual accounts
fall below the reserve target, `reserve` clips to each account's own
(smaller) balance instead of the target, so `share` shrinks and the
reserve's blended 3% treatment applies to less of the household's money
in aggregate — with the identical `reserveYears` input and identical
total balance.

**Why this is a defect, not a modeling choice.** Nothing in the UI,
the result, or `MODEL_ASSUMPTIONS.md` discloses that the reserve
protection depends on account fragmentation. A user who reorganizes which
account holds what — opening a new account, spreading savings across
institutions, a purely administrative choice with no financial
consequence in the household's actual life — changes how much of their
configured "5 years of spending in reserve" the engine actually protects,
silently and with no indication the dependency exists.

**Status: OPEN, undecided.** Candidate directions: (a) compute the
reserve dollar amount and `share` once against `portfolioTotal`, and
apply that same `share` to every account's return, rather than
re-deriving a per-account `reserve`/`share` pair; (b) track a running
"reserve budget already allocated" total across accounts within the same
period, so the sum across all accounts never exceeds
`spending*reserveYears`; (c) leave the per-account computation as
designed, and document explicitly that `reserveYears` is applied per
account rather than portfolio-wide (a much narrower disclosure than the
UI's current "Years of spending in reserve" label implies). Not routed
through the P19 exclusion table — `accountReturnForPeriod()` is on
`engine.js`'s always-reachable path for every account, every period.

## 2026-09-13 — Q67. An asset-class id spelled like an `Object.prototype` property (`constructor`, `toString`, `__proto__`, …) silently replaces an account's Monte Carlo volatility with the flat assumption

**A discovered defect on a live path, found by S5 task 1.7's sweep.** The
sweep looks for dictionaries built on `Object.prototype`. This site is not a
`= {}` initialiser: it is a READ of a JSON-parsed plan object keyed by a
user-editable id. The sweep's shape cannot see that, so it was probed
through `runPlan()` directly. Measured at `0125772`; the engine blob is
unchanged since `18ab807`.

**The defect.** `accountVolatility()` (`src/engine.js`, re-locate by symbol)
weights each asset class by `Math.max(0,a.allocation[ac.id]||0)`. A plan's
`allocation` is an ordinary object, so it inherits `Object.prototype`, and
`scenario-validator.js` accepts any non-empty string as an asset-class id.
When an id is an inherited property name and an account has no OWN
allocation entry for it, the read returns the inherited value (the
`Object` constructor, `Object.prototype` itself, or a built-in method)
instead of `undefined`. That value is truthy, so `||0` never applies.
`Math.max(0,…)` is `NaN`, the weight total is `NaN`, and `if(!total)`
returns the flat `assumptions.volatility` in place of the
allocation-weighted value. No flag, no warning, `status: "ok"`.

**Measured**, each id against a neutral id (`zzctrl`) given byte-identical
renames. The neutral id is the control: absent means weight 0.

| Case | Neutral id | `constructor` / `valueOf` / `__proto__` |
|---|---:|---:|
| Minimal plan: one account `{stocks: 60}`, classes stocks (vol 18) + X (vol 6), `assumptions.volatility` 12 | 0.18 | **0.12** (the flat fallback) |
| Control corpus `seed:9`, account "Generated 1", `{stocks: 58, cash: 35}`, id renamed from `bonds` | 0.11690 | **0.10950** (`assumptions.volatility` 10.95) |
| `seed:9` end to end through `runPlan()`, Monte Carlo, `rows[1].total` | 4,081,417.31 | **4,077,508.90**, `status: "ok"` |

**Where it does NOT show, stated so it is not over-read.**
- **Not in `simple` mode.** Same output for all six names, and a +40 allocation edit does move output, so that equality is meaningful.
- **Historical mode proves nothing here.** Its control could not fail: returns come from history, not allocation.
- **Not when every account holds its own entry for the id.** An own property shadows the inherited one.
- **`accountExpected()` reads the same way and is accidentally safe.** Its `NaN` weight is rescued by `(weights[ac.id]||0)` and `(weightTotal||1)`, only because normalised weights sum to 1.

**Reachability.**
- **Import:** reachable. The validator accepts the id (`advanced.assetClasses[].id`: a non-empty string).
- **Direct programmatic input:** reachable.
- **The UI:** NOT reachable. The UI mints ids with `uid("asset")` and zero-fills every account's allocation when a class is added, so every account holds an own entry.

**Siblings probed in the same pass**, each against a NON-prototype unknown string, so the prototype collision is measured rather than unknown-value handling in general:
- **`accounts[].type` and `accounts[].owner`:** no observable effect. `accountType()` returns `ACCOUNT_TYPES["constructor"]`, a function, where an unknown string falls back to `customTaxable`, yet `seed:12`'s output is identical either way.
- **`profile.filing`:** programmatic only; the validator rejects it with `INVALID_ENUM`, so import is blocked. The unknown control `"xx"` returns `calculation_error` with `TAX_QUOTE_NONFINITE_CONTEXT`. `"constructor"` and `"hasOwnProperty"` instead **throw an uncaught `TypeError`**, while `"toString"` and `"__proto__"` match the control. This is Q55's shape: the engine has no defence of its own once the validator is bypassed, and an uncaught throw is not the invalid-result contract.

**Status: REPAIRED — S5 task 1.7, in the commit that adds `tests/audit-q67-prototype-named-asset-class.test.js`.** `accountVolatility()` and `accountExpected()` now read only OWN allocation entries, so an absent entry weighs 0 whatever the id is spelled. That is the behaviour the code already intended, so no policy was chosen. The witness goes through `runPlan()` only. Against the unrepaired parent it failed for exactly the six prototype names, with controls that can fail; after the repair it passes. The differential diff over the control and expanded corpora is empty, as predicted: their ids are `stocks`, `bonds` and `cash`. **Still not decided:** whether the validator should reject prototype-named ids, which is a separate policy. The `profile.filing` sibling is its own question, Q68.

## 2026-09-13 — Q68. A `profile.filing` value spelled like an `Object.prototype` property makes `runPlan()` throw an uncaught `TypeError`, where any other unknown value returns the invalid-result shape

**A discovered defect on the programmatic path, found while probing Q67's
siblings.** Measured at `0125772` on control corpus `seed:12`. The engine
blob is unchanged since `18ab807`.

**The defect.** The engine reads its filing-status tables as
`RULES.federal.<table>[filing]`, about twenty sites (re-locate by symbol:
`marginalTax()`, `capitalGainsTax()`, `estimateTaxes()` and others). Several
of them fall back with `||RULES….single`. `RULES` is parsed JSON, so each
table inherits `Object.prototype`. For `filing = "constructor"` the read
returns the `Object` constructor, which is truthy, so no fallback applies.
`marginalTax()` then walks it as a bracket list: `brackets.length` is the
function's arity (1), so `brackets[0][0]` throws.

**Measured**, each value against a NON-prototype unknown string, so the
prototype collision is measured rather than unknown-value handling in general:

| `profile.filing` | `validateScenario()` | `runPlan()` |
|---|---|---|
| `"xx"` (control) | `INVALID_ENUM` | returns `status: "calculation_error"`, `TAX_QUOTE_NONFINITE_CONTEXT` |
| `"constructor"` | `INVALID_ENUM` | **throws** `TypeError: Cannot read properties of undefined (reading '0')` |
| `"hasOwnProperty"` | `INVALID_ENUM` | **throws**, the same `TypeError` |
| `"toString"`, `"__proto__"` | `INVALID_ENUM` | same as the control (an inherited value whose `length` is 0 or absent walks no brackets) |

**Reachability: programmatic only.** The validator enum-checks
`profile.filing` (`FILING_STATUSES`), so import refuses it, and the UI offers
a `<select>`. A direct `runPlan()` caller and the two paths that bypass
`runPlan()`'s gates (the exported `simulatePlan()` and the heat map, S5 2n)
reach it.

**Why it is recorded and not folded into Q67's repair.**
- **It is Q55's shape.** The engine has no defence of its own once the validator is bypassed, and an uncaught exception is not the documented invalid-result shape. Q55's decision for list fields was "reject, do not normalize", which argues for a named refusal at the boundary, not for making a prototype name behave like `"xx"`.
- **The control's own outcome is not a good answer either.** `TAX_QUOTE_NONFINITE_CONTEXT` names a symptom, not the input.

**Status: REPAIRED 2026-09-14 (S5 run), answer (c), in the commit that adds `tests/audit-q68-filing-status-refusal.test.js` and `tests/audit-q68-filing-table-own-keys.test.js`.** Decided 2026-09-14 (the owner): (c), both halves. Every filing-table read, all 24, now goes through an own-key read (`filingEntry()`), so a prototype-named filing status takes the path any unknown string took. The input gate refuses a present `profile.filing` that the tax tables do not define as `SCENARIO_UNKNOWN_FILING_STATUS`; an absent one is not claimed, and still returns `TAX_QUOTE_NONFINITE_CONTEXT`, as measured. **A correction to the reachability recorded above:** the validator's filing check is `checkEnum()`, which only warns (`INVALID_ENUM`), so import accepted `"constructor"` and the engine threw; this was not programmatic-only. Measured before the repair: `"constructor"` and `"hasOwnProperty"` threw, and `"toString"`, `"__proto__"`, `"valueOf"`, `"xx"`, `"MFJ"`, `""`, null, 5 and true each returned `TAX_QUOTE_NONFINITE_CONTEXT`. Witness, red first: 4 tests (prototype names and other unknown values through `runPlan()`; `"constructor"` through `runScenario()`, a fresh build's main thread and its generated Worker; and, on the seven exported tax functions, a prototype name answered exactly as `"xx"`), beside 2 controls. Mutants without the refusal, without the own-key read, or with either function left out of the Worker's list each fail as predicted; without the own-key read the refusal itself lets `"constructor"` through. Every generated plan carries a listed filing status, so no stored result is predicted to move.

**Status, superseded above: OPEN, undecided.** Candidate directions:
- (a) a `runPlan()`-boundary enum refusal for `profile.filing` with a named code, the shape `5d34573` used for Q49;
- (b) own-property reads of the filing tables, so every unknown value takes one path;
- (c) both.

Placement proposed to the plan owner: S5 2i (engine input defence) or 2n (the bypass paths' gates). **Adjacent, recorded only:** `accountType()` returns `ACCOUNT_TYPES["constructor"]`, a function, where an unknown type falls back to `customTaxable`. No observable effect was measured on `seed:12`, and the validator does not enum-check `accounts[].type`.

## 2026-09-14 — Q69. An `otherIncomes[]` record without `owner` is rejected by the validator but silently re-timed by `runPlan()` — "require it" holds on import, not at the engine boundary

**Found while verifying S5 task 2.3**, where the owner decided on 2026-09-13 that an
absent `owner` is "rejected, not defaulted or warned-through". Measured at
`9c9386c`.

**What already holds.** Decision-register P7 (`14b2a68`, 2026-09-10) closed
Q32 at the validator. `MATERIAL_RECORD_FIELDS` in `src/scenario-validator.js`
reports an absent `otherIncomes[].owner` as ERROR `MISSING_FIELD`,
unconditionally. `tests/near-miss-survivor-sweep.test.js` holds it ("Q32a
CLOSED (P7): omitting otherIncomes[].owner is now rejected, not silently
re-timed"). So the import path and the UI enforce the decision.

**What does not.** `runPlan()` does not run the validator; engine `:691`
says so. `otherIncomeFor()` still reads `i.owner === "spouse" &&
p.profile.spouseOn`, so an absent owner times a spouse-owned stream against
SELF's age. Measured on generator seed 100006, Q32's own seed: self 69,
spouse 77, a spouse-owned `investment` income of $24,091.72 from age 84.

| | `validateScenario()` | `runPlan()` |
|---|---|---|
| `owner: "spouse"` | valid | `status: "ok"`, lifetime taxes **374,241.59** |
| `owner` absent | **invalid**, `ERROR MISSING_FIELD @ retirement.otherIncomes[0].owner` | `status: "ok"`, `calculationErrorCode` null, lifetime taxes **542,126.43** (+167,884.85); 45 row values move across `income`, `taxes`, `total` and `shortfall` |

*(Q32's figures, 398,269.81 → 568,735.44, were measured on the 2026-09-10
engine. The mechanism is the same; the amounts moved with later repairs.)*

**Reachability: programmatic only.** Import validates, and the UI always
writes an owner. A direct `runPlan()` caller reaches it, as do the two paths
that bypass `runPlan()`'s gates (the exported `simulatePlan()` and the heat
map, S5 2n).

**Shape.** Q49's and Q55's: the validator catches it and the engine does not.
Q49's repair (`5d34573`) defended both layers; Q55's decision was "reject,
do not normalize".

**Status: REPAIRED 2026-09-14 (S5 run), answer (a), in the commit that adds `tests/audit-q69-income-owner-refusal.test.js`.** Decided 2026-09-14 (the owner): (a), refuse at input with a named code. The input gate now refuses an other income whose `owner` is absent as `SCENARIO_MISSING_INCOME_OWNER`, instead of timing it against self. Absent means undefined, the validator's own `MISSING_FIELD` test, and it applies to every income type. Measured before the repair on the witness's couple (self 60, spouse 52): an ownerless pension, an ownerless one-time inheritance, and an ownerless third income after two owned ones each returned status ok, and so did the ownerless pension through `runScenario()`, a fresh build's main thread and its generated Worker. Witness, red first: 2 tests beside 1 control (self-, spouse- and household-owned incomes still run). Mutants checking only the first income, exempting one-time incomes, or leaving the Worker's function list unchanged each fail as predicted. **Still held, unchanged by this repair:** how a household-owned income is timed, Q32's unanswered half. Every generated income carries an owner, so no stored result is predicted to move.

**Status, superseded above: OPEN — a boundary refusal is the reading consistent with 2.3's decision, but it was not what was asked.** The 2.3 question was framed as Q32's validator-level fork (require / default / warn), and P7 had already implemented "require" there. **Candidate:** a `runPlan()`-boundary refusal with a named code, the shape `5d34573` used for Q49. It predicts no movement on the stored corpora, because every generated income carries an owner. Placement proposed to the plan owner: S5 2i (engine input defence). **Still undecided, and unchanged by this entry:** Q32's `household` question. A household-owned income is also timed against self, and whether that is intended is not written down anywhere.

---

## 2026-09-14 — Q70. A Social Security claim age outside 62–70 is paid as if the law allowed it, and an imported plan reaches it — S5 2f.5's "no user or import path reaches it" holds for typing, not for import

**Found while verifying S5 2f.5**, which records the delayed-credit ceiling as
"closed-by-unreachability, not as an open item". Measured at `f7eaf3c`.

**The engine.** `ssaBenefitAtClaim()` (`src/engine.js`, re-locate by symbol)
applies a delayed factor of `1 + (claim − fra) × delayedCreditAnnual` to any
claim above full retirement age. For any claim below it, it applies an early
reduction that keeps growing. Neither side stops at a legal boundary: delayed
retirement credits end at 70, and a retirement benefit cannot start before 62.

| Claim (FRA 67, COLA 0) | `ssaBenefitAtClaim()`, a year | Through `runPlan()`, row `income` |
|---|---|---|
| Spouse, $1,500/month, claim 70 | $22,320 | 22,320 at age 90 |
| Spouse, claim 75 | $29,520 | — |
| Spouse, claim 80 | $36,720 | **36,720** at age 90 |
| Self, $2,000/month, claim 62 (control) | $16,800 | 0 at 62, 16,800 at 70 |
| Self, claim 60 | $14,400 | 0 at 60, **14,400** at 61 |
| Self, claim 56 | $9,600 | 0 at 56, **9,600** at 60 |

Every run returned `status: "ok"`.

**Reachability, measured.**

- **Typing: clamped.** Both claim-age inputs carry `min="62" max="70"`, and
  the app's protected-input blur handler clamps a typed value to them
  (`src/app-shell.html:495`).
- **Import and restore: not clamped.** `reviewImportedScenarios()` (`:869`)
  and `reviewRawScenarios()` (`:878`) refuse a backup only on ERROR issues.
  The validator's claim-age check is `checkRange()`, which emits a WARNING
  (`src/scenario-validator.js:79–83`). So `retirement.ssClaim` at 75 or 56
  imports as valid, with one `SS_CLAIM_OUT_OF_RANGE` warning.
  **`retirement.spouseClaim` has no validator check at all**, so it imports
  silently. A loaded value is written into its input (`:526`) and read back
  through `half()` alone (`:528`). The clamp runs only when that field loses
  focus.
- **Programmatic `runPlan()`: always.**

**Why this is filed although S5 2f.5 says not to.** 2f.5 rests on a
reachability check: `v2-ss-claim` has `max="70"`, and the validator
range-checks `ssClaim` to [62, 70]. The typing half holds. The import half
does not: the range check warns rather than refuses, it never covered the
spouse's claim age, and the lower bound is as open as the upper. Filed under
the executor's Q67+ authority. 2f.5 is left open with a pointer here, not
rewritten.

**Status: REPAIRED 2026-09-14 (S5 run), answer (c), in the commit that adds `tests/audit-q70-claim-age-bounds.test.js`.** Decided 2026-09-14 (the owner): (c), both halves. The engine now bounds a claim age, for self and spouse: the benefit factor reads an age held to 62 through the rules' `latestClaimAge` (70), and payments start no earlier than 62, while a later claim still starts when it is made. A bounded age is disclosed with an `SS_CLAIM_AGE_BOUNDED` WARNING, as the dividend-share clamp is. The validator refuses a claim age outside 62–70 as `SS_CLAIM_OUT_OF_RANGE` at ERROR, for `ssClaim` and, newly, `spouseClaim`; `checkRange()` gained a severity argument rather than a sibling function, so the scenario generator still parses both bounds. Measured before the repair (full retirement age 67, COLA 0): a self claim at 75 paid $39,360 a year where a claim at 70 pays $29,760; a claim at 56 paid $9,600 a year from 56; a spouse claim at 80 paid $36,720 where 70's is $22,320. Witness, red first: 6 tests (the credit cap, the start floor, the spouse's bounds, the disclosure, the validator's ERROR, and a fresh build's main thread and generated Worker), beside 1 control. Mutants without the credit cap, the start floor, the disclosure or the ERROR, or with the two helpers left out of the Worker's list, each fail as predicted. Measured on both corpora before the repair: every claim age lies inside 62–70 (36 control, 49 expanded scenarios), so no stored result is predicted to move and no stored scenario becomes invalid. Two test texts that described the old WARNING, in `tests/scenario-validator.test.js` and `tests/scenario-generator.test.js`, are brought up to date, and `tests/ssa-benefit-adversarial.test.js`'s zero-floor test, which reached a negative raw factor through a claim at 40, now reaches it through a claim at 62 against a full retirement age of 100, with its assertion unchanged.

**Status, superseded above: OPEN, undecided.** Candidate directions, none chosen: (a) bound the claim age inside `ssaBenefitAtClaim()`, with no credit past 70 and no benefit before 62, which moves output only for plans outside the range; (b) make the validator refuse (ERROR) a claim age outside [62, 70] for both `ssClaim` and `spouseClaim`, a rejection-policy change for saved plans that carry one today; (c) both. **Whether anything moves on the stored corpora is unmeasured.**

---

## 2026-09-14 — Q71. A list element that is not a record crashes `runPlan()` uncaught — in every list when it is `null`, and in other assets and debts when it is a number, string or boolean — while the validator refuses all of them

**Found by S5 block 2i's census, and not covered by Q55's decision.** Q55 is
a list field that is not a list. This is a list of the right type holding an
element of the wrong one. Measured at `60a874e` on a validator-clean
fixture, by setting element `[0]` of each list.

| Element `[0]` of | `"x"`, `5` or `true` | `null` |
|---|---|---|
| `accounts` | refused, `SCENARIO_NONFINITE_ACCOUNT` | **throws** (`reading 'balance'`) |
| `accounts[].futureChanges` | runs `ok` | **throws** (`reading 'age'`) |
| `retirement.stages` | runs `ok` | **throws** (`reading 'start'`) |
| `retirement.expenses` | runs `ok` | **throws** (`reading 'age'`) |
| `retirement.otherIncomes` | `TAX_QUOTE_NONFINITE_CONTEXT`, downstream | **throws** (`reading 'owner'`) |
| `advanced.assetClasses` | `TAX_QUOTE_NONFINITE_CONTEXT`, downstream | **throws** (`reading 'id'`) |
| `advanced.otherAssets` | **throws** (`Cannot create property 'value'`) | **throws** (`reading 'value'`) |
| `advanced.debts` | **throws** (`Cannot create property 'balance'`) | **throws** (`reading 'balance'`) |

The other-asset throw comes from `growOtherAssets()`, which writes `a.value`
onto each element; debts write `d.balance` the same way.

**The validator refuses them.** `validateScenario()` reports `WRONG_TYPE` at
the element's path; checked for `otherAssets[0]`, `debts[0]`, `stages[0]` and
`accounts[0]`. So the shape is Q55's and Q49's: the validator catches it and
the engine does not. `validateRawContainers()` does not check these elements.

**Reachability: programmatic.** Import runs the validator, and the app always
writes records, so this reaches `runPlan()` or `runScenario()` only from a
caller that has not validated. The exported `simulatePlan()` and the heat
map are S5 2n's paths.

**Why it is not repaired with Q55.** The owner's Q55 decision refuses a non-array
list field. Extending that refusal to non-record elements is a natural
reading, but it is a different input class, and the lists already answer it
four different ways: a named refusal, a quiet `ok`, downstream containment,
and a crash. S5 2i's boundary check is written so it does not claim these.

**Status: REPAIRED 2026-09-14 (S5 run), answer (a), in the commit that adds `tests/audit-q71-list-element-records.test.js`.** Decided 2026-09-14 (the owner): (a), refuse any element that is not a record. The input gate now refuses, as `SCENARIO_NON_RECORD_LIST_ELEMENT`, an element of any of the eight lists (accounts, an account's future changes, stages, expenses, other incomes, asset classes, other assets, debts) that the validator's `isPlainObject()` would not accept: null, a number, string or boolean, or an array. It is a check of its own beside the list-shape gate, which still answers only whether a list is a list. Measured before the repair on the witness's validator-clean fixture: a null element threw in all eight lists; a primitive or array account was refused as `SCENARIO_NONFINITE_ACCOUNT`; a primitive future change ran ok. Witness, red first: 3 tests (null in each list, and a number, string, boolean or array in each, through `runPlan()`; a null debt and a string stage through `runScenario()`, a fresh build's main thread and its generated Worker), beside 1 control (records in every list, and six lists emptied one at a time, still run). Mutants without the null case, accepting arrays, skipping future changes, or leaving the Worker's function list unchanged each fail as predicted. Neither corpus holds such an element, so no stored result is predicted to move.

**Status, superseded above: OPEN, undecided.** Candidate directions, none chosen: (a) extend the 2i boundary refusal to any list element that is not a plain object; (b) refuse only where it crashes — `null` elements everywhere, plus any non-record element of `otherAssets` or `debts`; (c) leave it to the validator and document the engine's answers. Neither corpus holds such an element (measured: 0 in control's 36 and expanded's 49), so (a) and (b) predict no movement on stored results.

---

## 2026-09-14 — Q72. A string-typed other-asset value or debt balance is concatenated into each row's `otherAssets` and `debtBalance` (`"0400000"`) — the validator refuses it, the engine does not

**Found by S5 block 2j's census.** Every numeric leaf of a validator-clean,
multi-year plan was replaced by its own numeric string, and `runPlan()` was
compared with the numeric baseline. Measured at `f9ca319`, src clean.

| Field set to its numeric string | First differing row field |
|---|---|
| `advanced.otherAssets[0].value` (`"400000"`) | row 0 `otherAssets`: `400000` → **`"0400000"`** |
| `advanced.debts[0].balance` (`"150000"`) | row 0 `debtBalance`: `150000` → **`"0150000"`** |

The result carries a string where the result contract has a number.

**The read path, re-derived per S5 2g.3a rather than grouped by analogy.**
Each row's `otherAssets` and `debtBalance` come from `sum(otherAssets,
function(x){return x.value})` and the matching `sum(debts, …)`: once for the
opening row, and again each period (`src/engine.js`, re-locate by symbol). The
helper `sum(a,fn)` is `a.reduce(function(t,x){return t+(fn?fn(x):x)},0)`, so
the first string turns `0 + "400000"` into `"0400000"`. **Both fields share
this one mechanism.** It is **not** Q57's site, which is contribution
arithmetic (`amount += c.value`). `debtTotal()` is not the site either, since it
coerces with `Number(x.balance)`.

**The validator refuses both.** `validateScenario()` reports `WRONG_TYPE` at
`advanced.otherAssets[0].value` and at `advanced.debts[0].balance`.

**Reachability: programmatic.** Import runs the validator, and the app writes
numbers.

**Status: REPAIRED 2026-09-14 (S5 run), answer (a), in the commit that adds `tests/audit-q72-holding-value-type.test.js`.** Decided 2026-09-14 (the owner): (a), the boundary type check. The input gate now refuses a present `otherAssets[].value` or `debts[].balance` that is not a finite number, by type and before any arithmetic, as `SCENARIO_NONFINITE_OTHER_ASSET_VALUE` or `SCENARIO_NONFINITE_DEBT_BALANCE`; present means not undefined, as in the validator, and an element that is not a record is not claimed. Measured before the repair, each with status ok: a numeric string reached the rows as a concatenated string (`"0400000"`), `true` as 1, and null, NaN and Infinity as 0. Witness, red first: 3 tests (five non-numbers on an other asset, and on a debt, through `runPlan()`; a numeric string on each through `runScenario()`, a fresh build's main thread and its generated Worker), beside 1 control. The Worker's function list names the check, and a mutant that leaves it out fails on the Worker route. Neither corpus holds such a value, so no stored result is predicted to move.

**Status, superseded above: OPEN, undecided.** Candidate directions, none chosen: (a) extend the runPlan() boundary type check (the Q49 / S5 2j shape) to a present `otherAssets[].value` and `debts[].balance`; (b) coerce inside the two accessors with `Number()`, an arithmetic change; (c) leave it to the validator and document it. Neither corpus holds such a value (measured: 0 in control's 36 and expanded's 49), so (a) predicts no movement on stored results.

---

## 2026-09-14 — Q73. The scenario generator draws a spending stage's mode twice, so 51 of 120 seeds pair one mode with the other mode's value range — U4's dead `seed:1` is one of them, and repairing the draw re-points eight frozen control names

**Found by S5 block 2s's census** (U4, the dead `seed:1`). Measured at
`b7078e7`, src clean.

**The mechanism.** `generateNestedRecords()` in
`tests/lib/scenario-generator.js` (re-locate by symbol) builds each spending
stage with:

- `mode: d.pick(NESTED_RECORD_SPECS.stages.enums.mode),`
- `value: d.pick(NESTED_RECORD_SPECS.stages.enums.mode) === 'percent' ? d.float(50, 120) : d.float(10000, 90000),`

The value's range is chosen by a **second, independent pick**, not by the mode
just drawn. The two ranges do not overlap, so every mismatch is exact: a
`percent` stage valued at 10,000 or more, or an `amount` stage valued at 120
or less.

| Set | Plans | `percent` with a dollar value | `amount` with a percent value | Plans carrying either |
|---|---|---|---|---|
| control composition | 36 | 5: `seed:1`, `seed:12`, `seed:16`, `seed:19`, `seed:20` | 4: `seed:2`, `seed:5`, `seed:6`, `seed:20` | 8 |
| expanded composition | 49 | the same 5 | the same 4 | 8 |
| generator seeds 1–120 | 120 | 26 | 34 | 51 |

**U4 is one consequence.** `seed:1` retires at 53 with `stage1` (ages 53–60)
set to `mode: "percent"`, `value: 49103.07`. `applyStage()` multiplies the
strategy amount by `value/100`, so row 1 spends $38,598,882 against a
configured $78,607.88, and the portfolio is $0 from row 1 on. Without its
stages the same plan survives (row 1 spends $78,608). Its pretax→taxable
transfer at 63 is the only such pairing in either composition, and turning the
transfer off changes no row: CR2-01's repaired path is configured once and
executed nowhere.

**Why nothing noticed.** Every drawn value is finite and every mode is
recognised. The validator checks a stage's `value` for type only, so all 120
seeds stay validator-clean, as `tests/scenario-generator.test.js` requires.

**Two in-place repairs, measured in memory** against the committed generator
over seeds 1–120. The committed generator reproduces the corpus's `seed:1`
byte for byte, and neither repair raises a validator WARNING or ERROR.

| Repair | Plans that change | Control seeds that move | `seed:1` after |
|---|---|---|---|
| Draw the mode once and branch on it, still consuming the second pick | 51, **only** in `retirement.stages[i].value` | 8: 1, 2, 5, 6, 12, 16, 19, 20 | survives; its pretax→taxable transfer executes |
| Draw the mode once and drop the second pick | 86, across many fields | 13 | survives, but no longer configures a transfer |

**Why this is a decision, not a repair.** The seeds are generated live
(`corpusWithDiagnostics()` calls `generateScenario(defaultPlan, seed)`), and
`tools/control-corpus.json` freezes the control. Its rule 1 says a name never
comes to mean a different plan, and `tests/control-corpus.test.js` holds the
live corpus to the control inputs, scenario by scenario. Even the narrowest
repair re-points eight control names. Rule 3 allows a generator edit as its own
versioned change, but no rule says how the control record then moves. S5b task
4.5a freezes the corpus denominator at S5b 4.6, which is also S5 2s.4's
deadline.

**Status: REPAIRED 2026-09-14 at `a96b2b2`, per (a).** The draw-preserving repair landed as a versioned corpus commit, carrying Q77's resolution (the off-branch tagged capture) with it. Full record: `S5_TASK_CHECKLIST.md` block 2s.1.

**Status, superseded above: OPEN, undecided.** Candidate directions, none chosen: (a) the draw-preserving repair as its own versioned corpus commit, with a successor control record and a new capture beside the old one (rule 5); it moves exactly the eight named control scenarios. (b) Leave the generator and the control as they are, add a named expansion member that runs CR2-01's pretax→taxable path live, and record `seed:1` as dead by this defect; no stored result moves. (c) (b) now, and (a) at the next versioned corpus change before S5b 4.6. Held in the S5 run state as Open for the owner 7.

---

## 2026-09-14 — Q74. A `percent`-mode spending stage has no upper bound, and the app's mode switch keeps the dollar figure — a new stage switched to "Percent of strategy amount" spends 600× and empties a $13M portfolio in one year, validator-clean

**Found by S5 block 2s**, while tracing Q73. Measured at `b7078e7`, src clean.

**The engine.** `applyStage()` (`src/engine.js`, re-locate by symbol) applies
a `percent` stage as `base *= value/100`. Nothing bounds `value`.

**The validator.** `NESTED_RECORD_SPECS.stages` (`src/scenario-validator.js`)
marks `value` as `numeric` only, and `validateRecordEntry()` checks it for a
finite number. No range applies, and none depends on `mode`.

**The app route, read from source; no browser run is claimed.** The add-stage
button (`$("v2-add-stage").onclick`, `src/app-shell.html`) creates a stage
with `mode: "amount"` and `value: r.spending`. The stage row's
`mode.onchange` sets `item.mode` and re-renders, leaving `item.value` as it
was, and the value input carries no minimum or maximum. So adding a stage and
choosing "Percent of strategy amount" turns a $60,000 spending figure into
60,000%.

**Measured on `golden:baseline`** (validator-clean; `incomeFirst`, spending
60,000, retiring at 55), with the stage built as the button builds it (ages
55–65):

| Stage | Validator | Spending at 56 | Portfolio |
|---|---|---|---|
| none | clean | $144,255 | never $0 |
| as created: `amount`, 60,000 | clean | $144,255 | never $0 |
| mode switched to `percent`, value kept | **clean** | **$86,552,859** | **$0 at 56**, from $13,057,537 at 55 |
| `percent`, 100 (control) | clean | $144,255 | never $0 |

The switched stage spends exactly 600× the control (60,000 / 100). `status` is
`"ok"`, with no error code.

**Reachability: the app, import, and programmatic callers.** Import runs the
validator, which accepts the value. Q73's generator mismatch puts the same kind
of value into the corpus.

**Not Q65.** Q65 is overlapping `percent` stages compounding; this is one stage.

**Status: REPAIRED 2026-09-14, both halves.** App half (`tests/audit-q74-stage-mode-switch.test.js`) at `7ab9881`; validator half at `864f109`, now that U4's repair landed (`a96b2b2`) — `STAGE_PERCENT_OUT_OF_RANGE` (WARNING) fires when a percent-mode stage's value is below 0 or above 200, the ceiling measured on the repaired generator (600 seeds draw 50.36–119.94; both corpora hold 50.42–114.97). Decided 2026-09-14 (the owner): (c) — now, the app rescales or resets the value on a mode switch; after U4's repair lands, a validator WARNING, with the ceiling measured then. The app resets rather than rescales: a real switch to "Percent of strategy amount" sets the value to 100 (the strategy amount unchanged), and a switch back to "Set annual spending" sets it to the plan's spending, which is what the add-stage button seeds; choosing the mode a stage already has changes nothing. Reset, not rescale, because a percent of the strategy amount has no fixed dollar equivalent across strategies and years. Witness (jsdom on the fresh build's own app; no browser run is claimed), red first: 2 tests beside 1 control. Mutants that reset only a switch to percent, or never reset, fail as predicted. Engine arithmetic is unchanged, so no stored result is predicted to move. **No longer open:** the validator bound landed at `864f109` (see the status line above) — an imported or programmatic plan now warns rather than carrying an unbounded percent silently.

**Status, superseded above: OPEN, undecided.** Candidate directions, none chosen: (a) a validator range for a `percent` stage's `value`, as a WARNING or an ERROR, with a ceiling to choose; (b) the app rescales or resets `value` when `mode` changes; (c) both. Neither changes engine arithmetic. Any ceiling between 120% and 10,000% would fire on 26 of the generator's 120 test seeds, five of them control members (`seed:1`, `seed:12`, `seed:16`, `seed:19`, `seed:20`). As a WARNING, (a) conflicts with `tests/scenario-generator.test.js`'s zero-warnings test unless Q73's draw is repaired first; as an ERROR, it refuses those five control scenarios.

## 2026-09-14 — Q75. A debt's absent `includePayment` still reads as `false` on a direct `simulatePlan()` call, though `runPlan()` now applies the documented default `true`

**Filed by the S5 run at the owner's instruction.** It is filed separately from Q43's fix rather than closed with it (run state, the owner's answers item 3, relayed by `bd9f75`). It was found at S5 2b.1 (`3b22c35`) as part of Q43's reproduction. Measured again at `ebdc4ad`, src clean, before Q43's repair.

**What changed since it was found.** At `3b22c35` a debt with `includePayment` absent spent $277,330 at 75 instead of $166,441,431. `normalizeDebt()` (`src/app-shell.html`) writes `true`, but `projectDebts()` (`src/engine.js`) gates the drain on `if(d.includePayment)`, so the raw engine read absent as `false`. Then `ca28d66` (Q53, S5 2l) applied `src/boolean-flag-contract.json`'s documented defaults on the engine routes (`openQuestions.absentOnEngineRoutes`, decided (b); `withDocumentedFlagDefaults()`). The contract lists `advanced.debts[].includePayment` with default `true`.

**Measured at `ebdc4ad`** (`scratchpad/s5-2b-includepayment-probe.js`). Default plan, `simple`, retiring at 65, one $600,000 debt at 6% paying $3,100 (still paying at 66). Debt payments counted at 66:

| `includePayment` | `runPlan()` | direct `simulatePlan()` |
|---|---|---|
| `true` (control) | $37,200 | $37,200 |
| `false` (control) | $0 | $0 |
| absent | **$37,200** (documented default) | **$0** (read as `false`) |

**So the mismatch is closed on `runPlan()`, `runScenario()` and the Worker, and open on direct calls.** Those are `simulatePlan()`, which stays public (S5 2n.1), and `projectDebts()` itself.
- **Reachability: direct programmatic callers only.** The app's plans pass through `normalizeDebt()`, which writes the field. S5 2n measured the direct per-path callers as the device benchmark, `tools/bench-simulation.js` and `tests/lib/household-ledger.js`, plus the heat map, whose plans are normalized.
- **No stored plan is affected.** Census at `ebdc4ad` (`scratchpad/s5-2b-includepayment-census.js`): every debt sets the field. That is 91 debts in the 120 generated seeds, 11 in the control composition and 19 in the expanded one. None is absent.

**Related, not the same:** S5 2n (CQ-6) moves `runPlan()`'s gates into `simulatePlan()` under the owner's answer (a). If the moved gates include the documented flag defaults, this closes with 2n. 2n should say whether they do.

**Status: REPAIRED 2026-09-14 on the `simulatePlan()` route, candidate (a) — not wholly closed.** 2n's gate move applies the documented flag defaults inside `simulatePlan()` (`0348418`), so a direct call now reads an absent `includePayment` as `true`, matching `runPlan()`. **The 2026-09-14 S5 audit (finding S5-D01) asks that direct `projectDebts()` truthiness be kept as a separate, lower-level contract question** — `projectDebts()` itself still reads an absent flag as falsy when called beneath `simulatePlan()`'s new gate rather than through it, so this entry should not read as wholly closed until that lower layer is addressed too.

**Status, superseded above: OPEN, undecided.** Candidate directions, none chosen: (a) apply the documented flag defaults inside `simulatePlan()` as part of 2n's gate move; (b) have `projectDebts()` read an absent flag as its documented default itself; (c) record direct calls as outside the flag contract, and say so in `BOOLEAN_FLAG_CONTRACT.md`.

## 2026-09-14 — Q76. Warning on any debt payment below its own interest, not only an explicit zero — a rebuild candidate, not S5 work

**Filed by the S5 run at the owner's instruction.** This is option (ii) of the run's Q43 question, which the owner did not choose for S5. The owner's words, recorded in the run state (answers item 2, relayed by `bd9f75`): widening "should be recorded as a candidate for the rebuild rather than dropped". Ground rule 9 (S5 is defects-only) still applies, so this is filed as rebuild scope.

**What S5 landed instead** (Q43, option (i), at S5 2b). The validator's `PAYMENT_BELOW_INTEREST` warning stays scoped to a payment of exactly 0 on a positive balance and rate (`c71c24d`). The engine now refuses that case's forced payoff at `payoffAge` as a calculation error (`DEBT_ZERO_PAYMENT_FORCED_PAYOFF`). A positive payment below the debt's own interest still negatively amortizes. At `payoffAge` it is still forced out as one payment, with no warning and no code.

**Why it was not widened in S5, measured.** Census at `ebdc4ad` (`scratchpad/s5-2b-includepayment-census.js`), counting debts with 0 < payment < monthly interest:

| Plans | Debts | Underpaying |
|---|---|---|
| 120 generated seeds (the zero-warnings test) | 91 | **33**, in 31 plans |
| control composition (36) | 11 | **4**: `seed:1`, `seed:3`, `seed:14`, `seed:17` |
| expanded composition (49) | 19 | **6**: the same four, plus `expansion:debt-adversarial-q54-worst` and `expansion:debt-adversarial-a-cent-below` |

- `tests/scenario-generator.test.js` asserts that the 120 seeds raise no warnings at all. The widened warning would fail it unless the generator changes, and the generator draws `paymentMonthly` from a flat 200–3,500 regardless of balance and rate (`tests/lib/scenario-generator.js`; Q54).
- The control corpus is frozen for S5b task 4's definitive capture. Flagging a forced payoff after any negative amortization (option (iii)) would make those same four control scenarios invalid results before that freeze.
- Capping the payoff (option (iv)) is a modelling change. It needs a debt cash-flow contract first (`c71c24d`).

**For the rebuild:** decide the warning's scope together with the debt cash-flow contract, and with a generator that draws a payment relative to the debt it pays.

**Status: OPEN — rebuild scope, by the owner's decision (2026-09-14).** Not S5 work, and not dropped.

## 2026-09-14 — Q77. U4's corpus commit cannot record its own control capture: a qualified capture of the repaired corpus must name a commit that no ordinary branch commit can be

**Filed by the S5 run while designing 2s.1.** U4 was decided by the owner's answer (a): repair the generator's stage draw corpus-wide, "as its own versioned corpus commit (control rule 3), with a successor control record and a new capture beside the old one (rule 5)". Measured at `7016cc4`; nothing committed.

**Why an ordinary commit cannot carry it.** Three facts, each checked in code:

- `tests/control-corpus.test.js` holds three things at every commit:
  - the live corpus hashes to `tools/control-corpus.json`'s `corpusInputHash` ("4.7: the live corpus still reproduces the control inputs, scenario by scenario");
  - the record's capture file carries the record's hashes and names its `controlCapture.commit` ("4.7: the control record agrees with every piece of evidence it cites");
  - the capture's bytes are pinned by sha256.
- A capture is qualified only when every declared input equals the committed bytes of the commit checked out where it runs (`boundaryOf()` in `tools/capture-baseline.js`). `tests/lib/scenario-generator.js` is a declared input. The control record, the corpus specs and `tools/baseline-registry.json` are not.
- An unqualified capture cannot hold the status "baseline" (`registryProblems()` in `tools/verify-baseline-provenance.js`).

So the commit that repairs the generator must also carry the successor record and its capture. That capture cannot record the commit's parent, which has the old generator. Nor can it record the commit itself, since a file cannot name the commit that contains it. S4's control record never met this: at `38f1a97` → `e123644`, 4.7 (1/2) changed no corpus input, so the capture could record the parent.

**What was measured** (`scratchpad/s5-2s-mechanism-probe.sh`, `scratchpad/s5-2s-mechanism-check.js`). The probe built a commit object T (`ce6db6c`), on no branch, holding `7016cc4`'s tree with only the generator repaired.

- Measured captures of both compositions, taken in a scratch worktree at T, record T. They are qualified, complete and integrity-clean, and `sourceConsistency()` at T matches every source hash.
- Every prediction written before the captures held:
  - exactly 8 names change in each composition (`seed:1`, `seed:2`, `seed:5`, `seed:6`, `seed:12`, `seed:16`, `seed:19`, `seed:20`), only in stage values;
  - 28 control and 41 expanded entries are byte-identical, and all 8 changed entries move;
  - `seed:1` survives, and CR2-01's preTax→taxable transfer executes.
- The control output hash goes from `91c2eb99` to `994eb8cf`, and the expanded from `be74d634` to `c468b1e6`.
- The provenance tool reads git objects at the recorded commit; it does not check ancestry. A commit object with no ref is not carried by a clone and may be pruned by `git gc`. So a capture recording T needs T to be kept.

**Options:**

- **(a) Record the capture at an off-branch commit T, and keep T with a tag.**
  - The corpus commit carries the repaired generator, both corpus specs, the successor record, the capture and its registry entry.
  - The branch stays linear, and every branch commit passes its gate.
  - T's own tree fails "4.7: the live corpus still reproduces the control inputs" by construction, because it holds the new generator with the old record. That is why T is not on the branch.
- **(b) The same T, kept as the second parent of the corpus commit (a merge).** T is then reachable without a tag and travels with every clone. The history gains one merge whose side commit fails the gate; `git bisect --first-parent` never visits it.
- **(c) A versioned composition, so every commit is an ordinary one.** An instrument commit lets the capture tool build a second control composition with the repaired draw, leaving `control` as it is. A capture at that commit is qualified and on the branch, and a later commit makes the successor record name it. This means several commits, and new capture-tool surface just before S5b task 4.6's freeze.
- **(d) One disclosed red commit on the branch.** The generator lands first with the old record, so that commit fails "4.7: the live corpus still reproduces the control inputs". The capture is taken there, and the record follows in the next commit. Every other gate stays green, but the branch holds a commit that fails its own gate.

**Run's recommendation: (a).** It adds no instrument surface and no red commit to the branch, and the provenance tool already checks a capture recorded that way. (b) is the alternative if a tag is unwanted. Under either, the record's `takenIn` and the registry note name T and say why it is off the branch.

**Unblocked meanwhile:** 2s.2's check (option (ii)) does not depend on this, and proceeds. Q73's repair itself is measured and ready (`scratchpad/s5-2s-generator-apply.js`).

**Status: REPAIRED 2026-09-14 at `a96b2b2`, per (a).** The corpus commit carries the repaired generator, both corpus specs, the successor control record and its qualified capture together, at an off-branch commit tagged and kept — the tag is `s5-u4-successor-control`, and the successor record's own name is `s5-control`. The owner pushes the tag (this session's permission classifier refused the push). Full record: `S5_TASK_CHECKLIST.md` block 2s.1.

## 2026-09-14 — Q78. runPlan() throws, instead of returning a calculation error, when an adjustable-rate recast's remaining term is over 1,800 months

**Filed by the S5 run during 2r (EXT-03).**
- EXT-03's term contract (`src/debt-amortization.js`, `normalizeTerm()`, B2) refuses a term above `MAX_TERM_MONTHS` = 1,800 months by throwing a `RangeError`.
- The engine reaches it in one place. When `advanced.armRecastOnReset` is on, `projectDebts()` recasts an adjustable-rate debt at its reset over `Math.max(1, Math.round((payoffAge − monthAge) × 12))` months.

**What was measured** (`scratchpad/s5-2r-rb-ext03-probe.js`, at `c36541b`), on the ST2-05 guard's household: 60 and retired, a $90,000 adjustable mortgage at 5% that resets to 6% at 60, recast on.
- **Payoff at 80** (240 months): `runPlan()` returns `ok`, with row 1 debt payments of $7,737.46 and a balance of $87,597.18.
- **Payoff at 999:** `runPlan()` **throws** `RangeError: debt-amortization: monthlyPayment requires a term of at most 1800 months (150 years), got 11268`. There is no result and no invalid-result contract.
- The engine catches exceptions in only two places (plan serialization and the strategy name's display), so the throw reaches the caller.
- Before B2, `monthlyPayment()` returned a finite payment for that term.

**Why it can reach a user.**
- Nothing bounds `payoffAge` on the way to `runPlan()`. `validateScenario()` checks only that it is a finite number.
- In the app, the remaining-term field caps the derived payoff age at 100, but the payoff field itself accepts any typed value.
- 999 is the test corpus's own "never pays off" value (`tests/audit-debt-timing.test.js`, `tests/contribution-and-debt-projection.test.js`).
- The public entry points' own contract, stated by R2R-001's tests, is "never a throw and never an ordinary result".

**Options:**
- **(a) Turn the refusal into the invalid-result contract.** The engine checks the recast term before calling the module, or catches the module's `RangeError` at that one call, and records a calculation error with a named code, so `runPlan()` returns `calculation_error`. Ordinary plans do not change.
- **(b) Refuse at the boundary.** `runPlan()`'s input gate rejects a `payoffAge` implying more than 1,800 months from the plan's start, as a scenario refusal before simulation, and the validator gains the same range.
- **(c) Clip the recast term to 1,800 months in the engine, disclosed.** This contradicts B2's "refused rather than clipped".
- **(d) Leave it, and document that recast is unsupported for payoff ages over 150 years ahead.**

**Run's recommendation: (a).** The throw becomes the same kind of result every other failed calculation already produces, and (b) can follow for importers. Either is an engine change, which S5 block 2r does not make.

**Effect on 2r:** EXT-03 is not given a guard that would pin the throw. It is recorded under 2r.3 pending this question.

**Status: REPAIRED 2026-09-14 (S5 run), answer (a), in the commit that adds `tests/public-route-ext03.test.js`.** Decided 2026-09-14 (the owner): (a), a calculation error. `projectDebts()` now checks an adjustable-rate recast's remaining term against the amortization module's own exported `MAX_TERM_MONTHS` before asking for a payment. A longer term is recorded on the debt, and `simulatePlan()` raises `DEBT_RECAST_TERM_UNSUPPORTED` in the row check Q43's forced payoff uses, so `runPlan()` returns the invalid-result contract instead of throwing; the loan is not clipped, and no unrelated exception is caught. Witness, red first: 4 tests (over the limit; exactly 1,800 months runs and 1,801 is the error; Monte Carlo and historical; a fresh build's main thread and its generated Worker), beside 2 controls. `COUPLED-ONLY-EXT-03` leaves the coupled-only list, and its schedule entry is removed.

**Status, superseded above: OPEN, for the owner.**

## 2026-09-14 — Q79. The authority-status vocabulary: four committed sources name four different sets, and S5 task 4.2 is the one place that chooses

**Filed by the S5 run for task 4.1** ("Record the three-way disagreement as a question").
- S5 task 4 must come before tasks 5, 8, 11 and 12, all of which write the field.
- S5b's ground rule 5 and S6 task 1b.2 inherit whatever task 4 chooses.

**The sets, as committed (cited at `8f32602`):**
- **`Resource Documents/TAX_RULES_ENGINE_REFERENCE_2026.md` §1.2, "Parameter-status vocabulary": six values.** They are `ENACTED`, `OFFICIAL_2026`, `INFERRED`, `FORM_PENDING`, `MODEL_ASSUMPTION` and `UNSUPPORTED`, each with a production treatment. For `UNSUPPORTED`, that treatment is "Stop, route, or return a bounded estimate with a warning".
- **`Resource Documents/ACCOUNT_RULES_ENGINE_REFERENCE_2026.md` §2.2, "Recommended `authority_status` values": eight, lower-case.** They are `statute_enacted`, `final_regulation`, `official_guidance`, `official_publication`, `proposed_regulation`, `interpretive_inference`, `plan_specific` and `state_conformity_pending`. Its worked example is the 1959 RMD cohort: `"authority_status": "proposed_regulation"`, `"authority_refs": ["REG-103529-23"]`, `"warning_code": "PROPOSED_RULE_USED"`.
- **The S4 brief's ground rule 5** (`archive/s4-pre-rescope/SPRINT_BRIEF_20260910_S4.md`): four values, `ENACTED`, `INFERRED`, `PROPOSED_REGULATION` and `FORM_PENDING`.
- **`S6_TASK_CHECKLIST.md` task 1b.2** repeats the brief's four as "the typed authority status S5 task 4 introduced", before task 4 has chosen anything.
- **A fifth name for one value.** S5 task 5.7 sorts vectors into `PASS`, `FAIL` and `UNREPRESENTABLE`, and Q45's decision and S5 task 5.10 already use `UNREPRESENTABLE`. S5 task 4 notes that this is TAX §1.2's `UNSUPPORTED` under another name.

**What mapping ACCOUNT's eight onto TAX's six loses:**
- `statute_enacted` becomes `ENACTED`, and `interpretive_inference` becomes `INFERRED`.
- `final_regulation`, `official_guidance` and `official_publication` all become `OFFICIAL_2026`, losing the distinction between a regulation and a publication. S5 task 5.6b's invariant #10 turns on exactly that tier: a 1959 owner cannot receive `final_regulation`.
- `proposed_regulation` has no TAX value. It covers the 1959 cohort, which is the one field S5 builds (tasks 5.4 and 5.6b).
- `plan_specific` has no TAX value: an employer plan's own document is neither law nor a projection convention.
- `state_conformity_pending` comes closest to `FORM_PENDING`, but that value is about forms, not state conformity.
- TAX's `MODEL_ASSUMPTION` and `UNSUPPORTED` have no ACCOUNT value, and the brief has neither.
- The case also differs: TAX is upper case, ACCOUNT lower case.

**Options:**
- **(a) TAX §1.2's six, plus `PROPOSED_REGULATION`,** the one value the mapping genuinely loses: seven values, upper case. `UNREPRESENTABLE` is retired in favour of `UNSUPPORTED`, and ACCOUNT's eight are mapped as above and recorded. This is S5 task 4.2's own recommendation, made concrete.
- **(b) ACCOUNT's eight, plus the two TAX values it lacks** (`model_assumption`, `unsupported`): ten values, lower case, keeping the regulation tiers.
- **(c) Two typed fields.** One records authority, using ACCOUNT's eight (where a rule's force comes from). The other records treatment, using TAX's six (how the engine may use the rule).
- **(d) The brief's four, plus `MODEL_ASSUMPTION` and `UNSUPPORTED`.** This matches S6 1b.2's text most closely, but it has no value for official guidance.

**Run's recommendation: (a), as S5 task 4.2 recommends.**
- It is the operational set, it keeps both load-bearing values, and it adds only what the 1959 cohort needs.
- It also needs S6 1b.2's list re-pointed at the chosen set (Proposal 21, for bd9f75).
- If the regulation tiers matter to invariant #10 beyond the 1959 case, (c) keeps them without mixing the two meanings.

**Effect on the run:**
- S5 tasks 4.2–4.5 are held per Task 00.B.
- Tasks 5, 8, 11 and 12 write the field, so they wait on the answer, as does task 5's choice between `UNREPRESENTABLE` and `UNSUPPORTED`.
- The run continues with work that does not write the field.

**Status: IMPLEMENTED 2026-09-14/16 — (a), TAX §1.2's six plus `PROPOSED_REGULATION`.** Seven values, upper case: `ENACTED`, `OFFICIAL_2026`, `INFERRED`, `FORM_PENDING`, `MODEL_ASSUMPTION`, `UNSUPPORTED`, `PROPOSED_REGULATION`. `UNREPRESENTABLE` is retired in favour of `UNSUPPORTED`. ACCOUNT's eight map as recorded above. `S6_TASK_CHECKLIST.md` task 1b.2 is re-pointed at this set (Proposal 21). S5 tasks 4.2–4.5 landed at `84f2036` — `src/authority-status-vocabulary.json` pins the seven values, `tests/authority-status-vocabulary.test.js` enforces them, and every forward-facing `UNREPRESENTABLE` mention across S5, S5b, S103 and this file's own record migrated to `UNSUPPORTED`. Tasks 5, 8, 11 and 12 wrote the field. *(Corrected 2026-09-16: this line led with "DECIDED (the owner)" — the parser reads only the first bold Status marker, so it never saw the implemented state buried later in the same paragraph. Led with IMPLEMENTED instead, flagged by `investment-calculator-4c`/S5 Kickoff.)*

## 2026-09-14 — Q80. Filling a missing default-true flag copies the plan outside the serialization check: an array's toJSON callback is dropped, and a throwing getter escapes runPlan()

**Filed by the S5 run from the external S5 audit's first finding** (`Handover temp/S5_AUDIT_DISPOSITION_20260914.md`, S5-A01). Reproduced on Windows 11 / Node 24.17.0, at `b84edfc`.

**The mechanism.**
- `scenarioInputGate()` (S5 2n, `0348418`) runs `withDocumentedFlagDefaults()` (Q53, `ca28d66`) *before* `nonSerializableScenarioInputCode()`, the serialize-once check (`1a2e065`).
- When a debt lacks a default-true flag (`includePayment`, or `includeHousingCosts` on a mortgage), the defaults step copies the plan, `advanced`, the debt list and the debt record, outside any `try`:
  - the list with `.slice()`, which drops the list's own `toJSON`;
  - the record with `Object.assign()`, which evaluates every enumerable getter.

**What was measured.** The audit's `contracts.test.js`, read first, was run against a fresh clone at `b84edfc`: 13 tests, 7 pass, 6 fail. That matches the audit's own run.
- **An always-throwing `toJSON` on `advanced.debts`:**
  - with `includePayment` explicit: refused as `SCENARIO_NONSERIALIZABLE_INPUT`, after one call;
  - with it absent: no refusal, and the callback is never called.
- **An enumerable throwing getter on the debt record:**
  - explicit: refused;
  - absent: `runPlan()` throws.
- Both hold through the Node engine and through a fresh build's main thread. The ordinary controls pass: explicit flags keep their refusal, and ordinary missing flags still take their documented defaults.

**Reach.** Callback-bearing programmatic input only. A JSON import cannot carry a callback, and the Worker transport rejects function-valued data.

**Decided 2026-09-14 (the owner): repair before the rest of S5** ("Fix first, then S5"). The repair must:
- keep the serialize-once policy;
- let default preparation neither discard a supported serialization hook nor evaluate an accessor outside the refusal boundary;
- keep ordinary defaults, an explicit `false`, the caller's plan unchanged, and exactly one call to a supported hook;
- not reject callbacks wholesale;
- not change the raw readers `debtTotal()` and `auditContributions()`.

**Status: REPAIRED 2026-09-14 (S5 run), in the commit that adds `tests/audit-q80-flag-defaults-serialize-once.test.js`.** The gate now serializes before it fills documented flag defaults. A default held in a serialized list (accounts, other assets, debts) is written into the parsed text the simulation reads; any other default is written into copies made by `copyOwnRecord()`, which copies property descriptors and reads no property. A supported serialization hook is called exactly once; a throwing hook or getter is refused as `SCENARIO_NONSERIALIZABLE_INPUT` and never escapes; a successful hook's data takes the documented default; ordinary absent flags, an explicit `false` and the caller's plan behave as before. Witness: 8 tests red first on the unrepaired parent, beside 5 controls, through `runPlan()`, `runScenario()` and a fresh build's main thread. The audit's four callback tests pass on the repaired tree.

**Status, superseded above: OPEN — decided, repair next in the S5 run.**

## 2026-09-14 — Q81. A case-variant strategy name runs as itself through runPlan(), but falls back to income-first on a direct simulatePlan() call and the heat map's call shape

**Filed by the S5 run from the external S5 audit's second finding** (`Handover temp/S5_AUDIT_DISPOSITION_20260914.md`, S5-A02). Reproduced on Windows 11 / Node 24.17.0, at `b84edfc`.

**The mechanism.**
- Q58's resolution (`0a463ab`) normalises a wrong-case name to the declared one, and warns then runs `incomeFirst` for an unknown name. It lives only in `runPlan()`.
- Since S5 2n (`0348418`), a direct `simulatePlan()` call runs the input gates itself, but not the strategy resolution.
- `strategySpending()` compares exact spellings, so on that route `"CONSTANTPERCENT"` falls through to income-first spending.
- Before S5, both routes fell back for this spelling. S5 introduced the disagreement by repairing one route.

**What was measured.** The audit's `contracts.test.js`, read first and run against a fresh clone at `b84edfc`. Both strategy-parity tests fail: a direct simple-mode call, and the heat map's shallow-copy call in historical mode. Two controls pass: the Node, built-page and generated-Worker `runPlan()` routes agree, and a canonical name on a direct call matches `runPlan()`.
- The audit's own fixture: retired at 60, a $1,000,000 Roth, zero return, `withdrawalRate` 4, spending $10,000, `strategy: "CONSTANTPERCENT"`, and the plan validates.
  - `runPlan()` spends $40,000 in the first year.
  - A direct `simulatePlan()` spends $10,000.
- Those dollar figures are the audit's; this reproduction checked the tests' pass/fail outcomes.

**Reach.** The exported `simulatePlan()`, and the heat map's call shape. The app's form canonicalises the selection before a run, which can mask it in the live UI.

**Decided 2026-09-14 (the owner): repair before the rest of S5** ("Fix first, then S5"). The repair must:
- keep Q58's policy: case-only variants normalise silently; an unrecognised name warns and runs `incomeFirst`;
- apply that interpretation on every supported simulation route;
- leave the caller's plan unchanged;
- not repeat a run-level warning across Monte Carlo paths.

**Status: REPAIRED 2026-09-14 (S5 run), in the commit that adds `tests/audit-q81-strategy-direct-routes.test.js` and `tests/audit-q81-strategy-public-routes.test.js`.** One resolution of the strategy name, `withResolvedStrategy()`, runs in `runPlan()` before its paths and in a direct `simulatePlan()` call after its input gates, so the exported function and the heat map's call apply the same policy: a wrong-case name maps silently, an unrecognised name is reported once and runs as income-first. `runPlan()`'s own per-path calls skip it, so a Monte Carlo run reports once; the caller's plan is unchanged. Witnesses: 3 direct-route tests red first on the parent, beside a direct-route control and 2 public-route tests. The audit's contract tests pass 13 of 13 on the repaired tree.

**Status, superseded above: OPEN — decided, repair next in the S5 run.**

## 2026-09-16 — Q82. A callback-bearing list is validated as the caller passed it, but simulated as its serialized copy, so the two can disagree

**Filed by the S5 run from the 2026-09-16 external audit** (`Handover temp/S5_EXTERNAL_AUDIT_AND_CLAUDE_HANDOVER_20260916.md`, S5R-01, priority 1). Reproduced by the S5 run on 2026-09-16 (Windows 11 / Node 24.17.0) against the whole-model package extraction at `4024bb5` (engine unchanged since `dd75d79`), with `scratchpad/s5r-probe.js`. The auditor's probe and witness files were not supplied.

**The mechanism.**
- The input gate checks list shapes, flags, numbers, ids and the holding contract against the caller's objects. It then serializes the lists once, which runs any supported `toJSON` hook.
- Accounts, debts and other assets are simulated from that serialized copy, which is not validated again, while other readers, such as the contribution audit, still read the original plan.

**What was measured.**
- A hook on `accounts` that returns the same IRA with contribution 0: `runPlan()` says `ok` and deposits $7,500 (the auditor measured $8,600 on its fixture); the same plan with a plain zero deposits nothing.
- A hook that returns two accounts with one id: `ok`, no duplicate-id refusal.
- A hook that returns balance `"6000000"`: `ok`, opening total `"06000000"`.
- A hook that returns null: a TypeError escapes.

**Reach.** Every public route that runs the input gates: `runPlan()`, `runScenario()`, the exported `simulatePlan()`, and the heat map. The generated Worker cannot carry functions, so its route sees only plain data.

**Status: REPAIRED 2026-09-16 at `9697cfc`.** The engine now runs on one validated execution snapshot at the input gate: what was checked is what is simulated, and every reader downstream of the gate sees the same object. Full record: `S5_AUDIT_HANDOVER_20260916_CLOSEOUT.md`.

## 2026-09-16 — Q83. The QCD exclusion cap is pooled across spouses without attributing the distribution to the IRA's owner

**Filed by the S5 run from the 2026-09-16 external audit** (`Handover temp/S5_EXTERNAL_AUDIT_AND_CLAUDE_HANDOVER_20260916.md`, S5R-02, priority 1; introduced by S5 task 10). Reproduced by the S5 run on 2026-09-16 (Windows 11 / Node 24.17.0) against the whole-model package extraction at `4024bb5` (engine unchanged since `dd75d79`), with `scratchpad/s5r-probe.js`. The auditor's probe and witness files were not supplied.

**The mechanism.**
- The cap is `$111,000 × (1 + an eligible spouse)`, applied to the household's one QCD request, regardless of which spouse owns the IRA the distribution comes from.
- The exclusion is per taxpayer for their own IRA distributions (IRS Publication 590-B; Notice 2025-67).

**What was measured.**
- Both spouses 80, MFJ, one $6,000,000 traditional IRA owned by self, a QCD request of $250,000: $222,000 excluded, row tax $4,274.31. The owner can exclude at most $111,000.
- `tests/qcd-annual-cap.test.js` asserts the $222,000, so the test enforced the wrong rule.

**Reach.** Every married plan with QCDs where only one spouse holds a funded IRA, or the spouses' IRA balances are unequal.

**Decided 2026-09-16 (the owner), answer 2 (A):** split the household QCD across eligible spouses by each one's share of their own traditional-IRA balance, and cap each spouse at $111,000 against their own share. A spouse with no IRA adds no exclusion. Correct the test's expectation, and keep the original figure beside it.

**Status: REPAIRED 2026-09-16, in two commits.** `a2d5d00` split the exclusion cap by each spouse's own IRA share, per the decision above. The re-audit found that split partial (S5RR-01): the required distribution was still withdrawn in the household's pre-tax order, so a 401(k) or the other spouse's IRA could fund a QCD whose exclusion was attributed elsewhere. `9190ed4` repaired the rest, on the owner's answer of 2026-09-16: each eligible owner's QCD is now paid first from that owner's own traditional IRAs, before the rest of the RMD. Full record: `S5_AUDIT_HANDOVER_20260916_CLOSEOUT.md`.

## 2026-09-16 — Q84. The annual QCD exclusion cap is multiplied by a projection row's duration

**Filed by the S5 run from the 2026-09-16 external audit** (`Handover temp/S5_EXTERNAL_AUDIT_AND_CLAUDE_HANDOVER_20260916.md`, S5R-03, priority 2; introduced by S5 task 10). Reproduced by the S5 run on 2026-09-16 (Windows 11 / Node 24.17.0) against the whole-model package extraction at `4024bb5` (engine unchanged since `dd75d79`), with `scratchpad/s5r-probe.js`. The auditor's probe and witness files were not supplied.

**The mechanism.**
- The cap term is multiplied by the row's duration, as the giving request is. The statutory limit is annual (26 USC 408(d)(8)), so a shorter row does not shrink it.

**What was measured.**
- Single, age 80.5, a half-year first row, a $150,000 annual QCD: the period request is $75,000, but $55,500 is excluded; row tax $12,473.93 against $7,458.64 with $75,000 excluded.

**Reach.** Plans whose first or last row is a partial year, with QCDs.

**Decided 2026-09-16 (the owner), answer 4 (A):** the annual cap is not prorated. An opening partial row assumes no QCD earlier in that calendar year, so the full $111,000 is available; disclosed.

**Status: REPAIRED 2026-09-16 at `a2d5d00`.** The cap term is no longer multiplied by the row's duration; a partial opening row carries the full annual cap, with the assumption disclosed (warning `QCD_OPENING_YEAR_CAP_ASSUMED`) per the decision above. Full record: `S5_AUDIT_HANDOVER_20260916_CLOSEOUT.md`.

## 2026-09-16 — Q85. A recurring income keeps paying past its end age inside a row

**Filed by the S5 run from the 2026-09-16 external audit** (`Handover temp/S5_EXTERNAL_AUDIT_AND_CLAUDE_HANDOVER_20260916.md`, S5R-04, priority 1; older than S5, and inherited by S5's self-employment type). Reproduced by the S5 run on 2026-09-16 (Windows 11 / Node 24.17.0) against the whole-model package extraction at `4024bb5` (engine unchanged since `dd75d79`), with `scratchpad/s5r-probe.js`. The auditor's probe and witness files were not supplied.

**The mechanism.**
- `otherIncomeFor()` clips the start of the active interval but computes `activeDuration = ownerEnd - activeAge`, never limited by the income's end. It also pays a row that starts exactly at the end age.

**What was measured.**
- A self-employment income of $100,000 a year from 60 to 60.5: `runPlan()` credits $100,000 over ages 60–61, where the overlap is half a year, $50,000.

**Reach.** Every recurring income (pension, rental, employment, investment, Social Security type, tax-free, other, self-employment) whose end age falls inside a row.

**Decided 2026-09-16 (the owner), answer 3 (A):** an income stops the moment its owner reaches the end age, prorated within the year, as the "End age" label says.

**Status: REPAIRED 2026-09-16 at `9818a1f`.** `otherIncomeFor()` now clips `activeDuration` at the owner's end age, prorated within the row, per the decision above. An absent end age never stops the income. Full record: `S5_AUDIT_HANDOVER_20260916_CLOSEOUT.md`.

## 2026-09-16 — Q86. effectiveMarginalRate() accepts inherited source names and a non-numeric or infinite step

**Filed by the S5 run from the 2026-09-16 external audit** (`Handover temp/S5_EXTERNAL_AUDIT_AND_CLAUDE_HANDOVER_20260916.md`, S5R-05, priority 2; introduced by S5 task 9). Reproduced by the S5 run on 2026-09-16 (Windows 11 / Node 24.17.0) against the whole-model package extraction at `4024bb5` (engine unchanged since `dd75d79`), with `scratchpad/s5r-probe.js`. The auditor's probe and witness files were not supplied.

**The mechanism.**
- The source is looked up in a plain object, so `toString` and `constructor` resolve to functions and pass the check; the step is accepted whenever `delta > 0`.

**What was measured.**
- At $100,000 ordinary income, age 80: `"toString"` and `"constructor"` return a rate of 0; a step of `"100"` returns 394353.5975 (string concatenation); `Infinity` returns NaN. The control, `"ordinary"` with 100, returns 0.2582.

**Reach.** Direct callers only: `runPlan()` does not call the helper.

**Status: REPAIRED 2026-09-16, in two commits.** `9818a1f` fixed the source lookup and the step-value check. The re-audit found the base value still unguarded: a malformed or non-record base priced as zero rather than being refused. `52833d6` repaired that: `effectiveMarginalRate()` now refuses a base that is not a record, or a base amount that is not a finite number, per the owner's answer of 2026-09-16 ("A: the helper refuses a base value that isn't a finite number"). Registered as a requirement at `64ae440`, guarded by its two rejection tests. Full record: `S5_AUDIT_HANDOVER_20260916_CLOSEOUT.md`.

## 2026-09-19 — Q87. A traditional IRA contribution is never deducted from taxable income (F1, with G15)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, first pass (`Handover temp/S5AA_EXTERNAL_AUDIT_FIRST_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_F1_F9_F10_contributions.js`.

**The mechanism.**
- The contribution loop adds to `preTaxDeferrals` only for a workplace pre-tax plan or an HSA. A traditional IRA is `taxClass:"preTax"` with `limitGroup:"ira"`, so the deduction follows the LIMIT GROUP rather than the tax class. The account is still `preTax`, so the same money is taxed again on withdrawal.

**What was measured.**
- Single filer, 30, $50,000 wages, first working year. $7,500 into a traditional IRA leaves tax at **$8,530** — identical to contributing nothing. The same $7,500 into a traditional 401(k) cuts it to **$7,443**.

**Reach.** Every household contributing to a traditional IRA. Overstates current tax, understates success, misstates lifetime tax.

**Status: STEP 1 REPAIRED 2026-09-20, S5AA task 3.6. STEP 2 (per-owner Form 8606 basis) IS NOT IMPLEMENTED — see F-05.** The task is explicit that *“nondeductible or basis cases are not qualified until both exist”*, and that qualifier is kept.

**STEP 2 LANDED 2026-09-20 — FORM 8606 PER-OWNER BASIS.** The nondeductible remainder step 1 identified is now **basis**, and distributing it no longer taxes the same dollar twice. Read from the Form 8606 instructions **before** it was coded: the form is filed **per person** (*"file a separate 2025 Form 8606 for each of you"*) and **basis never combines between spouses**; line 6 pools **all** of that owner's traditional IRAs, so **the nontaxable fraction is a property of the OWNER, not of the account drawn from**.

**Measured, on two households identical but for salary.** Each contributes the full IRA limit and draws it back down. Wholly nondeductible: `federalAgi` **0.00** on a $5,000 draw, then **1.00** on the final $2,501 — the $1 being the traditional 401(k) dollar, which keeps its basis on the plan and is **not** in the IRA pro-rata pool. Wholly deductible: **5,000.00** and **2,501.00**. **The difference between the two households is exactly the basis.**

**A bug in the first version, caught by reading the rows rather than the totals:** the pool was measured from **live** balances, after `a.balance -= w`, which made the fraction self-referential — a draw that emptied an account left a pool of zero and taxed the whole distribution, while a partial draw inflated the fraction to 1. **The two errors cancelled in the one year that was being watched.** Form 8606 line 6 is the **pre-distribution** pool, and it is now captured before any dollar leaves.

**The funding solver's preTax class is now split per account UNCONDITIONALLY**, which task 4.1 predicted in the engine comment itself. **Corpus: two members move, `seed:4` and `seed:9` — the exact two 4.1 named — and NEITHER holds a traditional IRA**, so the movement is the float reassociation of the split, not the basis rule. **The basis rule moves nothing on the corpus** because no member makes a nondeductible contribution (F-05). 24 differences declared.

**Disclosed, not assumed away:** basis also arises from nontaxable rollover amounts and from contributions made **before the plan starts**, and the engine has no input for an opening basis. A household that arrives with basis is **under-credited**, making the modelled tax too **high** — the safe direction, still wrong, and said via `IRA_BASIS_FROM_PROJECTION_ONLY`.

**The step-1 test that pinned this gap was a deliberate tripwire and it fired**, exactly as its own header instructed: *"If step 2 lands, this test FAILS and must be replaced by the real basis assertions."* It is replaced, not deleted.

**Step 1, done.** A traditional IRA contribution was not deducted **at all** — an IRA is `limitGroup "ira"`, and only `"workplace"` and `"hsa"` reach `preTaxDeferrals` — so $7,500 into an IRA moved the tax by **$0** where the same $7,500 into a 401(k) moved it by **$1,087.50**. It now deducts identically, with the IRC § 219(g) phase-out applied. **The citations were checked against the primary sources BEFORE the rule was coded** (task 8.6): Notice 2025-67 for the 2026 amounts and Publication 590-A for the rules, both read from the IRS PDFs. Recorded in `Handover temp/S5AA_CITATION_CHECKS_20260920.md`.

**Whose coverage matters depends on the filing status, and that is the easy error.** For a single or head-of-household filer only the owner's own coverage counts; on a **joint return an UNCOVERED contributor married to a COVERED spouse has their own, much higher range** — $242,000–$252,000 under § 219(g)(7)(A) against $129,000–$149,000 — and a household where **neither** is covered has no phase-out at any income. All three are asserted, including at an income between the two ranges where a filing-status-blind repair denies a deduction the statute allows.

**The measure is AGI computed WITHOUT the IRA deduction** (§ 219(g)(3)(A)), so there is no circularity; it comes from a preliminary `estimateTaxes()` made **only when a deductible contribution exists**, so it does not cost every row a fourth tax computation. *Disclosed:* that MAGI is the **pre-commit** figure, so the deduction is fixed before the tax-funding withdrawal is solved rather than becoming a second fixed point inside the one the solver already walks.

**G15 confirmed from the source and honoured.** Publication 590-A **Worksheet 2-1** enters *“any traditional IRA deduction”* at line 4 and line 10 says to **ADD** the lines — so the deduction is **added back** for Roth purposes. `rothPhaseoutFactor()` is untouched, and a test asserts it depends on salary alone, with a control proving the test could detect the feed if it existed.

**Worksheet 1-2 carries two adjustments the ranges alone do not imply.** The **$200 minimum allowance is applied**. The **round-up to the next $10 is NOT** — the publication's own **Example 1** certifies a deduction of **$6,825** for a 2025 joint filer at $126,500 of MAGI, which the round-up would make $6,830. Matching the certified value was preferred to matching an instruction the certifying example contradicts; the omission is worth at most $9 a person a year, always in the taxpayer's disfavour, and is a fair candidate for the plan owner to overrule. That same Example 1 is used as an independent check of the taper: `7,000 × (146,000 − 126,500) / 20,000 = 6,825`, exactly.

**The bounded inference, and exactly what it misses.** An owner counts as an active participant in any year their workplace plan receives an **employee or employer** contribution. Pub. 590-A is explicit that a **defined benefit** participant is covered merely by being eligible — *“even if you declined to participate … didn't make a required contribution, or didn't perform the minimum service”* — so a contribution-based inference misses exactly that class. **The engine models no defined benefit plan at all**, so the case cannot arise from its own inputs, and **an excluded case never supplies a certified expected value.**

Guarded by `tests/audit-s5aa-ira-deduction.test.js`, nine tests. **Corpus effect: NONE, and that is part of F-05** — the corpus holds **4** traditional IRA accounts and **0** of them contribute, so it cannot exercise the deduction at all and cannot detect a regression in it. Same shape as F-03; both want a corpus member with a working owner who actually contributes, which is **6.2**'s decision.

**STEP 2 REMAINS.** Per-owner basis on the annual Form 8606 aggregate computation, with a QCD out of the pre-tax part first. Until it lands, a contribution the phase-out makes **nondeductible** still enters a `preTax` account and is **taxed again on withdrawal** — which was already true when nothing was deducted, so step 1 is a strict improvement rather than a new defect. **The gap is pinned as a test**, not only as prose: the last test asserts `engine.form8606Basis` does not exist, so **when step 2 lands that test fails** and forces the basis cases to be qualified.

## 2026-09-19 — Q88. The regular age-65 additional standard deduction is missing (F2, with G16)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, first pass (`Handover temp/S5AA_EXTERNAL_AUDIT_FIRST_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_F2_F3_tax_layer.js`.

**The mechanism.**
- `estimateTaxes()` builds the deduction as the basic standard deduction plus `seniorDeduction()`, which is the temporary ENHANCED senior deduction only. `TAX_RULES_ENGINE_REFERENCE_2026.md` §3.2's separate age-65 addition is never applied. Neither amount ($1,650 / $2,050) occurs anywhere in `src/engine.js`.

**What was measured.**
- Single at 67: the engine applies **$22,100**; §3.2 expects **$24,150**. MFJ both 65+ short by **$3,300**; one spouse by **$1,650**. The age-64 control applies exactly the basic amount, so the shortfall is not a bracket artefact.

**Reach.** Every filer 65 and older.

**Status: REPAIRED 2026-09-20, S5AA task 3.1.** The IRC § 63(f) amount is applied per qualifying person by their own age, beside the enhanced senior deduction. **The citation was checked against the primary source BEFORE the rule was coded**, as task 8.6 requires (*“a citation that fails the check stops the task that depends on it”*): Rev. Proc. 2025-32 § 4.14(3) was read from the IRS PDF itself, not from a summary page, and the check is recorded in `Handover temp/S5AA_CITATION_CHECKS_20260920.md` (C-01). **It passed — and it corrected the plan's own paraphrase.** The checklist reads *“$1,650 per qualifying married person”*, but the statute does not key on *married*: it sets $1,650 generally and **increases it to $2,050 when the individual is unmarried AND NOT A SURVIVING SPOUSE**. A **head of household is unmarried and is not a surviving spouse, so a head-of-household senior receives $2,050**, and a `filing === "single"` or spouse-present reading would have underpaid every one of them by $400 per qualifying person, silently. The qualifying statuses are therefore named as a **set** in the engine rather than written as `filing!=="mfj"`, so a status added later lands on the smaller amount by default. **The surviving-spouse boundary is EXCLUDED EXPLICITLY**, as the task permits: the engine models exactly `single`, `mfj` and `hoh`, none of which is a qualifying surviving spouse, so the boundary cannot be reached — and a test pins the filing-status vocabulary so that introducing one fails loudly and forces the § 63(f) branch to be revisited. Blindness (§ 63(f)(2)) stays out of scope, disclosed in the rule record and the engine comment. **G16, the mirrored pair, moved in this same commit** (ground rule 4): `taxSegmentLocal()` takes the amount as a **constant with zero slope**, because unlike the enhanced senior deduction the § 63(f) amount has no phaseout. **The mirror test is confirmed to cover the age-65 branch by execution, not by reading**: `R2-T01` holds `taxSegmentLocal()` against `estimateTaxes()` at every affine landing across **79 of its 150 seeded cases with the taxpayer 65 or older**, and it passes. **A caution worth recording about Task 3's named gate:** `TAX_SETTLEMENT_MISMATCH` and `QUOTE_SETTLEMENT_UNVERIFIED` are silent on all 36 corpus members, but they are **necessary and not sufficient** — a positive control that deliberately desynchronised the mirror did **not** make them fire, because they compare the *quote* against the *commit* and both flow through the same machinery. R2-T01, not the settlement codes, is what actually guards G16. Guarded by `tests/audit-s5aa-additional-standard-deduction.test.js`, nine tests, whose measurement instrument is itself controlled (an age-64 filer must recover the basic amount to the cent, or every other number in the file is meaningless). The auditor's $24,150 is asserted **by its three components**, because $24,150 is *also* the 2026 head-of-household basic standard deduction and an implementation that reached it by treating a single senior as a head of household would match the reported total for entirely the wrong reason. **Corpus effect, measured exhaustively across all 36 members rather than sampled:** a member moves **if and only if** some year at 65 or over has federal AGI above the deduction that year already had — 24 members, **zero disagreements in either direction**. The six that never reach 65 are unchanged **to the cent**; six more reach 65 but have no federal taxable income for the new amount to reduce. **`seed:13` is the sharpest of those and confirms the Arizona condition independently:** it owes $78 in a senior year and still does not move, because every cent of that $78 is **Arizona**, and its federal AGI of $19,213 sat below even the old $22,100 deduction. Arizona is untouched, as the tracked reference requires — it keeps its own $2,100 age-65 exemption and its own standard deduction record and never reads the federal figure, verified three ways (by reading the code, by a dedicated test, and by `seed:13`). Two pre-existing fixtures moved by exactly the predicted amount and were updated **with their derivation, not fitted**: the RMD checkpoint's $2,445.00 falls to **$2,199.00**, a drop of exactly $2,050 × 12% = $246, with **Arizona unchanged at $545**. Declared at task 7.3's instrument: 8,770 → 8,915 (4,424 added, 4,279 resolved). **One finding recorded, not repaired here (out of scope, ground rule 12):** `p.profile.filing` is static for the whole projection and nothing changes it on a death, and `seniorAges` carries no death check, so a deceased spouse still contributes a full $6,000 enhanced senior deduction and the household still files `mfj`. See `Handover temp/S5AA_BLOCKED_LOG.md`.

## 2026-09-19 — Q89. Ordinary dividends are excluded from the NIIT base (F3, with G17)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, first pass (`Handover temp/S5AA_EXTERNAL_AUDIT_FIRST_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_F2_F3_tax_layer.js`.

**The mechanism.**
- `investmentIncome = Math.max(0, capitalGains + qualifiedDividends)`. An ordinary dividend reaches `estimateTaxes()` inside `ordinaryIncome` and never enters the NIIT base. `ordinaryDividends` occurs **zero** times in `estimateTaxes()` and zero times in its mirror.

**What was measured.**
- At an identical $250,000 MAGI, single: the same $10,000 draws **$380** of NIIT as a qualified dividend or a capital gain, and **$0** as an ordinary dividend. A below-threshold control is zero for the right reason.

**Reach.** High-income households with ordinary dividends in taxable accounts.

**Status: REPAIRED 2026-09-20, S5AA task 3.2.** **The citation was checked against the primary source BEFORE the rule was coded** (task 8.6): Form 8960 Part I was read from the IRS PDF itself, and the check with the full income mapping is `Handover temp/S5AA_CITATION_CHECKS_20260920.md` (C-02). Part I counts taxable interest (1), **ordinary dividends (2)**, annuities (3), rental real estate and other passive activities (4a), and net gain on the disposition of property (5a–d).

**The naming trap, which is the whole of the double-counting question 3.2 asks about.** “Ordinary dividends” means two different things: on **Form 8960 line 2** (= Form 1040 line 3b) it is the **TOTAL**, of which qualified dividends are a **SUBSET**; in `src/engine.js` **`ordinaryDividends` is the NON-QUALIFIED REMAINDER**, `dividendCash - qualifiedDividends`. So the engine's base term is `qualifiedDividends + ordinaryDividends`, the two **ADD without double counting**, and their sum is exactly line 2. **Had the variable carried the form's meaning, adding it would have counted every qualified dollar twice** — and nothing in the name warns you.

**The obvious repair was the wrong one, and this is the more valuable half of the finding.** `investmentIncome` inside `estimateTaxes()` feeds **seven** things: the Social Security provisional base, `federalAgi`, `ssProvisionalIncome`, the **capital-gains stacking base**, the NIIT cap, the Arizona base and the reported field. But the caller folds ordinary dividends into `ordinaryIncome` *before* calling it, so **AGI, the Social Security base and Arizona already counted them**. Adding them to `investmentIncome` would have counted them a second time in all three **and handed them the preferential capital-gains rate** — a larger error than the surtax it was meant to fix, in the taxpayer's favour, so nothing would have complained. The repair therefore gives the surtax its **own** quantity, `netInvestmentIncome`, and changes **only the cap**. Each of those must-not-move properties is asserted.

**Every modelled income was checked against the list, so the base is fixed once.** Added: the non-qualified dividend remainder, and the **`rental`** (line 4a) and **`investment`** (lines 1, 2, 5) income streams, which `otherIncomeFor()` now reports as a separate `nii` share alongside `ordinary` — two different questions, since a dollar can bear ordinary tax, the surtax, both or neither. Correctly **out**: pensions and pre-tax withdrawals (§ 1411(c)(5)), Social Security, wages, self-employment income and tax-free income. **Two disclosures rather than guesses:** `other` and `oneTime` carry **no tax character** — their labels fix nothing about whether the money is interest, a gift or a settlement — so they stay out, and including them would have raised tax for everyone using a generic row for something that is not investment income at all; and **real-estate-professional status is not modelled**, so `rental` is treated as passive and therefore in scope.

**G17's mirror moved in the same commit** (ground rule 4). The audit quoted an expression for it that is not there — mechanism right, line wrong — and the real mirror builds its base from its own `ctx`, so it takes `ctx.niiOther` as a **constant with zero slope**: a withdrawal does not change dividends or rental income already fixed for the period.

**THE ENGINE'S THREE INDEPENDENT RECOMPUTATIONS EARNED THEIR KEEP.** The obligation is deliberately recomputed in three places — the solver's mirror, `verifyQuoteObligation()` before ever reporting “funded”, and a post-commit check in `simulatePlan()`. An incomplete first version of this repair passed every unit test and **still broke the corpus member `seed:7`**, first as `QUOTE_SETTLEMENT_UNVERIFIED` and then, once that was fixed, as `TAX_SETTLEMENT_MISMATCH` — each failure naming the next site that had not been given the new base. That is the redundancy working exactly as designed, and it is worth recording that **the unit tests alone would have shipped it**.

Guarded by `tests/audit-s5aa-niit-base.test.js`, eight tests, including the auditor's case carried three ways (as qualified dividends, as a gain, as ordinary dividends) all drawing the same **$380**; every split of the same $10,000 between qualified and ordinary drawing the same surtax, which is what “counted once” means; the cap binding from both sides; and the mirror checked at every affine landing.

**Corpus effect, measured by DIFFERENTIAL COMPARISON rather than against the stored reference**, because `matchPrediction` keys a difference on `(scenario, kind, path)` and **not on its value** — so a path that already differed from the reference because of an earlier task still reads as “found” when this task moves it again, and the reference comparison is structurally blind to it. Running the corpus against the same engine with the repair neutralised: **exactly one member moves, `seed:7`, by +$463.82 across two years**, every delta positive, no row-count or error change anywhere. **And the others are explained, not assumed:** the surtax is `3.8% × min(net investment income, the MAGI excess)`, and in every above-threshold year of `seed:3`, `seed:6` and `seed:18` the existing base had **already filled the cap** — `seed:3` at 68 carries $182,865 of base against a $15,558 excess, twelve times over — so the added income is genuinely inert. `seed:7` is the only member whose base sat **below** its excess ($0 against $4,092), which is why it is the only one that moves.

## 2026-09-19 — Q90. One RMD is computed on the pooled pre-tax balance, on one person's age, and scaled by row duration (F4, N2, G3, with G18)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, first pass (`Handover temp/S5AA_EXTERNAL_AUDIT_FIRST_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_F4_N2_rmd.js`.

**The mechanism.**
- `rmdFor(accounts, age, p, priorYearBalance)` sums `taxClassBalance(preTax)` across every account and divides by one divisor. It has no owner parameter, and the call site multiplies by row `duration`. `preTaxConvertible()` repeats both in a single expression.

**What was measured.**
- **Pooling:** $500,000 IRA + $500,000 401(k) at 75 returns $40,650 and the whole amount is drawn from the IRA; the 401(k) closes the year at $500,000, its own $20,325 never taken. **Owner:** a spouse-owned IRA distributes $20,325 when the spouse is 65 and the primary is 75, and $0 when the spouse is 78 and the primary is 65 — wrong in both directions. **Partial year:** a plan opened at 74.5 distributes exactly half the annual obligation.

**Reach.** Any household holding both IRA and 401(k) pre-tax money; any two-person household; any plan opened mid-year at or after the start age.

**Status: PARTLY REPAIRED 2026-09-20 at `ea25433` (S5AA task 4.2; F4, N2, G18).** Required distributions are computed per owner and per plan, each on its own age, start age and opening balances. **The partial-year half (G3) is not built:** the engine still scales the obligation by row duration (`rmdPlan.total*duration`), so partial-year behaviour is unchanged, not newly broken. Carried to S5b (the owner, 2026-09-21, the verdict's Q7, now Q118). *(Added 2026-09-24 (UTC−7) by the plan owner from the S5AA session's relay; the commit exists and the `* duration` scaling was seen in the engine at HEAD, the rest not re-derived.)*

*Original status, kept as history (its markup was malformed):* OPEN. S5AA task 4.2: per owner and per plan, each on their own age and start age. **`preTaxConvertible()` reserves in the same commit** or a conversion consumes balance the RMD is owed from. **Removing `* duration` alone is not enough** — the opening date, the applicable obligation, the prior 31 December balances, distributions already taken and first-distribution timing all have to be defined. `ACCOUNT-18-8` leaves the todo list here, with its registry entry removed in the same commit.

## 2026-09-19 — Q91. The Social Security earnings test is stored and never applied, and the Rules page contradicts itself (F5, N3)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, first pass (`Handover temp/S5AA_EXTERNAL_AUDIT_FIRST_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_F5_F6_N3_socialsecurity.js`.

**The mechanism.**
- `RULES.socialSecurity.earningsTest` carries the 2026 thresholds. The string `earningsTest` occurs **0 times** in `src/engine.js` and 3 times in the rules payload. `householdSocialSecurityForPeriod(p, age, rowAge, spouseAge, startHistory)` has **no wages parameter**, so it could not withhold even in principle.

**What was measured.**
- Claimed at 62, $3,000/month, measured at 63: wages of $200,000 against $0 move the row by exactly $200,000 and the benefit by **nothing**. The shipped page carries two sentences on the earnings test, one of which states the package "does not apply the earnings test" (N3).

**Reach.** Early claimants who continue working.

**Status: REPAIRED 2026-09-20, S5AA task 4.6.** All four figures had been in the rules package since it was written and **nothing read them**. `ssEarningsTestBand()` and `ssEarningsTestWithholding()` now do, and `householdSocialSecurityDetail()` applies the test **per person, on that person's own age clock and that person's own earnings** — wages plus net self-employment income, including the employment-type other-income streams task 3.4 made owner-aware.

**Confirmed against SSA before anything was coded** (task 8.6; recorded in the citation-check file). Both `ssa.gov` hosts refuse an automated fetch with **HTTP 403**, which is not the same as an absent source — the pages were read in a browser. All four stored values are right: **$24,480 / $65,160**, **$1 per $2** below full retirement age and **$1 per $3** in the year it is reached, with the higher amount applying only to months before attainment and earnings from that month onward not tested at all. **No record needed changing; what was missing was that nothing applied them.**

**THE ADJUSTMENT IS THE HALF THAT IS EASY TO GET WRONG, AND POMS SETTLES IT.** RS 00615.480: *"An adjustment of the reduction factor eliminates certain deduction and non-entitlement months from the original reduction factor"*, automatically, at full retirement age — so the benefit is **permanently raised**, not refunded. RS 00615.482 grants a crediting month *"for months of **full or partial** work deduction"*: **the reduction factor counts MONTHS, not dollars.** A month in which one dollar was withheld is a whole crediting month. Crediting the dollar-equivalent number of whole months is the obvious implementation and it understates the lifetime benefit.

**Measured.** A claimant at 62 with a $2,000 monthly benefit earning $40,000 has **$7,760** withheld of $16,800; at $100,000 the **whole** benefit goes and no more. Four such years credit **24 months** back, moving the reduction factor from **0.70 to 0.80** permanently from 67 — asserted as that exact ratio, which COLA cancels out of. One year earning **$2** over the exempt amount withholds **$1** and still buys back **one whole month**, worth 5/9 of 1% for life.

**Partial-year treatment is a stated scope default, not a derivation.** The exempt amounts are calendar-annual and a projection row need not be a year long, so a row's earnings — already prorated to its length — are tested against an exempt amount prorated to match, and the row that crosses full retirement age tests only the part before it. Said on the Rules page in those terms.

**N3 is repaired with it:** the page said both that the package uses the earnings test and that it does not apply it. It now says one thing, and that thing is true.

**This SUPERSEDES Q47's 2026-09-13 "leave disclosed-only" decision**, on the later authority of the S5AA checklist. `tests/audit-q47-earnings-test-disclosure.test.js` was built two-sided precisely so that implementing the test would force the caveat to be revisited rather than let a disclosure become quietly false in the other direction. **It fired, and it was right to.** Both sides are inverted; neither is loosened.

## 2026-09-19 — Q92. A survivor benefit is gated on the retirement claim age, so a widow at 60 or 61 is paid nothing (F6, with G19)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, first pass (`Handover temp/S5AA_EXTERNAL_AUDIT_FIRST_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_F5_F6_N3_socialsecurity.js`.

**The mechanism.**
- The survivor branch pays `selfClaimedHere ? survivorAmount : 0`, and `selfClaimedHere` derives from `ssClaimStartAge()`, whose floor is the retirement claim age of 62. Survivor eligibility generally begins at 60.

**What was measured.**
- A surviving spouse, own benefit $1,000/month, deceased $3,000/month: **$0** at 60 and at 61; **$25,200** at 62 claiming 62, and at 67. The two controls show the branch is live, so the zeroes are the gate.

**Reach.** Early widows and widowers.

**Status: REPAIRED 2026-09-20, S5AA task 4.7.** The survivor branch gated payment on the recipient's **own RETIREMENT claim age**, so a widow of 60 whose own claim age is 67 was paid **nothing for seven years**. That gate is not wrong — a prior repair restored it after an aliveness-only test paid a 50-year-old survivor — it was **incomplete**. The survivor now has a floor of their own, and it is 60. The survivor receives the **larger** of their own benefit and the deceased's, each with its own gate, which is what preserves the accepted case that a survivor with no benefit of their own still receives the larger.

**Ground rule 4's set moved in one commit:** the survivor amount, the eligibility gate and the sub-interval `points` list. A survivor start inside a row now splits it, and the row bills both halves — pinned by an exact figure, because a missing boundary is invisible in a total.

**The reduction was DERIVED and then CHECKED, not assumed.** SSA publishes only the endpoints and three checkpoints: *"Payments start at 71.5% … Over 75% at age 61. Over 80% at age 63. Over 90% at age 65 … up to 100% when you reach your Full Retirement Age for Survivor benefits."* The reduction is **28.5 points spread evenly over the months** between 60 and survivor full retirement age, and that form lands on **all three** checkpoints — 75.57%, 83.71%, 91.86% — each an independent constraint. A test asserts all three, so the derivation is pinned and not just the two endpoints.

**The reduction is fixed at the age the benefit STARTS and never recomputed from a later birthday.** SSA's "increase the longer you wait" is about the age of **application**; a benefit that grew back toward 100% because its recipient kept having birthdays would quietly undo the reduction it was given. Pinned across eleven years of one household.

**Two things are disclosed rather than assumed away.** **Survivor full retirement age is its own table**, *"between ages 66–67"*, approximated here by the stored retirement figure — exact for anyone born 1962 or later, up to two months early for the 1960–61 cohorts, which the engine has no birth month to distinguish anyway. And **the deceased's early-claim cap is NOT applied**: POMS RS 00615.320 limits a widow(er) benefit to the larger of **82.5% of the deceased's death PIA** or the reduced benefit they would have had, and that needs a PIA this engine does not hold for a household that entered a monthly figure. An affected result is an **over-estimate**, so it carries `SURVIVOR_BENEFIT_APPROXIMATED` with **`approximation: true`** and **`capApplied: false`** — machine readable, as the task requires — naming remarriage, disability and children as also not modelled.

**Corpus scope: zero numeric movement, and that is a GAP IN THE CORPUS, not an inert repair (F-09).** Only **two of 36** members have survivor benefits on. `seed:4`'s first death is at self-age 85, its horizon end, so nobody is ever widowed inside it; `targeted:survivor-stateful` widows at **68**, past survivor full retirement age, where the factor is exactly 1. Two disclosure differences declared.

**Four tests of a prior external audit's repair (R2-003 / T04) moved, and none was loosened.** Their amounts fell because a reduction now exists that did not before — written out as `36000 * (1 - 0.285 * n / 84)` rather than read back from the engine, so they stay independent. **Two had their PREMISE superseded:** they asserted a survivor is paid only from their own retirement claim age, and that one who has not reached it is paid **nothing**. That zero *is* the defect F6 names. Both are restated to assert the new rule, and each says so in its own header.

## 2026-09-19 — Q93. A pre-tax transfer escapes the 10% penalty, and the Rule of 55 is applied to IRAs (F7, N1, with G2, G6)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, first pass (`Handover temp/S5AA_EXTERNAL_AUDIT_FIRST_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_F7_N1_penalty.js`.

**The mechanism.**
- The transfer block computes `transferTaxable` and adds it to ordinary income but never increments `penalties`. Separately, `withdrawFromClass()`'s gate is `age<59.5 && !penaltyException && !(rule55 && age>=55)` — it consults the tax class and a household flag, never the account, so it cannot tell a 401(k) from an IRA.

**What was measured.**
- **Transfer:** at 50, $50,000 IRA→taxable. Turning the engine's OWN `penaltyException` switch on moves the transfer year by **$0** — there is no penalty there to exempt — while the same $50,000 through `withdrawFromClass()` is charged $5,000 and drops to $0 when the switch flips. **Rule of 55:** at 56 with the flag on, an IRA draw is charged **$0**, identical to a 401(k); controls charge $5,000 with the flag off and $5,000 at age 54.

**Reach.** Early retirees moving pre-tax money to a brokerage account, and anyone toggling the Rule of 55 while holding an IRA.

**Status: REPAIRED 2026-09-20, S5AA task 4.1.** **Two defects, one cause: the penalty test was restated in THREE places and omitted in a fourth.** `withdrawFromClass()` had it inline, `penaltyApplies` re-derived it for the row, `quoteTaxFunding()` re-derived it again per class — and the **transfer block, which moves pre-tax money to a taxable account and adds it to ordinary income, never charged it at all.** The repair states it once, in `earlyWithdrawalPenaltyRate(p, age, account)`, and has all four sites read it.

**Measured:** the auditor's $50,000 pre-tax→taxable transfer at 50 now costs exactly **$5,000**, against **$0** before. The same transfer at 60 costs nothing, and a pre-tax→**Roth** transfer — a conversion — stays penalty-free at every age. **The comparison partner matters and the obvious one is not clean:** measuring against the Roth conversion leaves **$18.75** that has nothing to do with the penalty, because money landing in a taxable account is taxed differently thereafter. The test uses the **same plan with `penaltyException` on** — identical in every respect except the charge under test — and the figure lands on the nose.

**The Rule of 55 now reads the ACCOUNT.** § 72(t)(2)(A)(v) exempts a distribution from a qualified **employer** plan after separation from service in or after the year the employee turns 55; it does not reach an IRA. The old gate read the tax **class** and a household flag and never the account, so it exempted both. An account the engine **cannot identify** as employer-plan money also does not get the exemption — the safe direction — and that case is asserted on its own. **The row is added to the account reference's early-distribution matrix**, as the task asks, recording IRA = **No**.

**A structural consequence worth recording:** the funding solver built **one piece for the whole `preTax` class**, so it could not express a rate that differs between accounts inside it. `preTax` is now split **per account** when the rates differ, exactly as `taxable` already was; `orderedAccountsInClass()` is the same filter and comparator `withdrawFromClass()` draws in, so quote and commit walk the accounts in the same order, and `rIncome` stays 1 on every piece so the **shape** of the affine model is unchanged. **This also removes the structural blocker recorded against task 3.6 step 2**, which needs exactly this split before IRA basis can vary `rIncome` per account.

**THE SPLIT IS CONDITIONAL, and the reason is worth keeping.** Taken unconditionally it **reassociates the floating-point arithmetic** — one subtraction becomes several — and that moved `seed:4` and `seed:9` in their **last bits** (for example `892574.0635829048` against `892574.063582905`, about 5×10⁻¹⁰ relative), breaking task 4.7's exact comparison for no behavioural reason at all. The differential scope check **could not see it**, because it neutralised the penalty rule and left the split in both arms — only the exact instrument caught it. Where every `preTax` account carries the same rate, which is every corpus member and every household that does not mix employer-plan and IRA money under the Rule of 55, the original single piece is kept and those households stay **bit-for-bit identical**. Corpus effect after the correction: **0 differences, declared or found.**

**A trap this repair hit and the reproduction caught:** the transfer happens EARLIER in the row than the withdrawal accounting, so `penalties += …` at the transfer block was **silently wiped** by the later `penalties = 0` initialiser — it compiled, ran, and changed nothing. `penalties` is now seeded with the transfer charge. Relatedly, **`penalties` is not a row field** (it is folded into the row's `taxes`), so a first reproduction that read `row.penalties` measured nothing at all.

**Two pre-existing tests were updated, and it is not a weakening:** their Rule-of-55 fixtures carried no account `type`, which they never needed before the rule gained that dimension. Every assertion is unchanged; the fixtures simply say what kind of pre-tax money they hold, and the untyped case is now asserted separately. Guarded by `tests/audit-s5aa-early-withdrawal-penalty.test.js`, six tests.

**Corpus effect: NONE, and it is verified rather than assumed — see F-06.** The only pre-tax→taxable transfer in the corpus happens at **age 63**, past 59½; the other three transfers are taxable→taxable, taxable→HSA and HSA→pre-tax, none of which is a pre-tax distribution; and **no member combines `rule55` with an IRA**. This is the **third consecutive rule** the corpus cannot exercise, after § 415(c) (F-03) and the IRA deduction (F-05), and the missing ingredient is the same each time: a household still working and contributing, at an age where the rule bites.

## 2026-09-19 — Q94. An ARM resets its rate but keeps its payment, and the flag is unreachable (F8)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, first pass (`Handover temp/S5AA_EXTERNAL_AUDIT_FIRST_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_F8_arm.js`.

**The mechanism.**
- `projectDebts()` re-amortises only when `advanced.armRecastOnReset` is true. It defaults false, and the key occurs **once** in the entire shipped page — inside the default plan object, with no input element, no id-to-key mapping entry and no read-back. The engine's own comments call it a transitional migration flag whose intended end state is unconditional re-amortisation.

**What was measured.**
- A $400,000 ARM at 3% resetting to 6% at 45: the payment holds at **$20,232** across the reset, while the recast control rises to **$25,588**; the balance at 55 is **$73,142** worse. Positive control: `rule55` occurs 7 times and IS mapped to a control, so the search works.

**Reach.** Any household modelling an adjustable-rate mortgage.

**Status: REPAIRED 2026-09-20, S5AA task 5.1.** `projectDebts()` takes four arguments now and re-amortises **unconditionally**, which is the end state the engine's own comment already described: *"real ARMs re-amortise unconditionally, so this flag is a transitional migration flag, not a modelling choice … SPRINT_QUESTIONS records the intended end state (unconditional re-amortisation once the audit lands)."* The audit landed, and it found the transitional state was **the only state**.

**The default was not merely conservative — it amortised BACKWARDS.** A $400,000 loan at 3% resetting to 6% at 45 held its payment at **$20,232** a year while 6% interest on the $355,652 balance is **$21,339**. The payment did not cover the interest, so the balance **grew** every year from the reset and the loan never paid off. With the recast the payment rises to **$27,497.68** and the balance falls. Q78's refusal is kept: a recast term beyond the amortisation module is still `DEBT_RECAST_TERM_UNSUPPORTED`, never clipped — and making the recast unconditional makes that path **more** reachable, so it is pinned.

**THE FIELD IS KEPT; THE SWITCH IS GONE.** `advanced.armRecastOnReset` stays in the default plan, still type-checked, and the engine still reads it **once** — to tell a plan that carries it, and holds a resetting adjustable debt, that its projection has moved. Two reasons, both recorded: a saved scenario must still import, and **removing the field from the default plan changes the input hash of every generated corpus scenario**. That is a versioned corpus change belonging to task 6.2, and it was measured rather than guessed: removing the field failed 20 corpus-machinery tests that keeping it does not touch. **That one remaining read is also what keeps FM-09's repair** — the validator type-checks a flag whose reader is "engine", and FM-09's hazard was that the string `"false"` ENABLED the feature because `Boolean("false")` is true. A non-boolean is still refused.

**Corpus scope: zero numeric movement, and the reason is a defect IN THE CORPUS (F-10).** Five members carry a debt typed `rateType: "adjustable"`. **Four of them have `nextRateResetAge` and `resetRate` UNDEFINED** — adjustable in name only, never reaching a reset at all. The fifth, `targeted:arm-flag-on`, is the one scenario built to set the old flag *and* carry a resetting debt, so it already re-amortised. One disclosure difference declared.

**Nine tests across six files moved, and none was loosened.** Every one of them built its control by turning the switch **off**, a state that no longer exists; each is restated against a control that does — a fixed-rate loan, a reset pushed outside the projection, or the pre-reset years of the same loan. **Two of them record something better than a restatement:** task 1.5's teaser-ARM cases are **resolved by this repair rather than re-pinned**. A 0%-payment ARM that resets to a positive rate used to be force-paid-off at its payoff age and flagged; its reset now supplies a payment and it amortises. The flag is not dead — a zero payment on a **fixed** debt, and an adjustable one whose reset lands after its payoff age, are both still errors, and the control test proves it.

## 2026-09-19 — Q95. 415(c) employer-match room is reduced by the employee catch-up (F9)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, first pass (`Handover temp/S5AA_EXTERNAL_AUDIT_FIRST_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_F1_F9_F10_contributions.js`.

**The mechanism.**
- `match = Math.min(match, totalEmployeeEmployer * itemDuration - c)` where `c` includes the catch-up. A catch-up contribution is outside the §415(c) limit.

**What was measured.**
- Age 55, compensation at the $360,000 limit, an employer contribution deliberately oversized so only the 415(c) cap binds: employer room is **$47,500** without the catch-up and **$39,500** with it — lower by exactly the $8,000 catch-up. The auditor's figures exactly.

**Reach.** High earners using catch-up contributions.

**Status: REPAIRED 2026-09-20, S5AA task 3.3.** IRC § 414(v)(3)(A)(ii) disregards a catch-up contribution for § 415(c), so the employer room is measured against the **non-catch-up** deferral. **The citation was checked against the primary source BEFORE the rule was coded** (task 8.6): Notice 2025-67 was read from the IRS PDF itself and **every figure the engine carries was confirmed against it** — § 415(c)(1)(A) $72,000, § 402(g)(1) $24,500, § 414(v)(2)(B)(i) $8,000, § 401(a)(17) $360,000. The check is recorded in `Handover temp/S5AA_CITATION_CHECKS_20260920.md`. **Two details a summary would have flattened:** the ages 60–63 catch-up under § 414(v)(2)(E)(i) **“remains $11,250”** — it did *not* rise with the others, so an engine indexing it alongside them would be wrong — and the Roth catch-up threshold under § 414(v)(7)(A) is a **prior-year wage test**: $150,000 of **2025** wages decides whether **2026** catch-ups must be Roth. Both matched the engine as it already stood.

**The repair HOISTED an existing definition rather than writing a second one.** The catch-up share was already computed in `auditContributions()` — but only inside the branch guarded by `a.taxClass!=="roth"`, where it served the Roth warning. It is now computed for **every** workplace account and reported on the item, with two callers reading the one definition. This is RA-03's lesson applied in the same file: *“Stating the rule once is the repair; applying it branch by branch is what let the two diverge.”* **It also fixed a second case for free:** a **Roth 401(k)** catch-up is still a catch-up and § 414(v)(3) does not ask about its tax character, but the old placement could never have seen one. The share is measured against the **running total across accounts**, so two workplace accounts cannot each claim the catch-up room.

**Measured:** at 55, deferring $24,500 plus an $8,000 catch-up, the employer room goes **$39,500 → $47,500**; at 61 with the $11,250 enhanced catch-up, **$36,250 → $47,500**; under 50 it is unchanged at $47,500, which is the control. **$47,500 remains the remaining DOLLAR-LIMIT room in this simplified case only** — not unconditional employer eligibility — and that is asserted rather than asserted away: with a 2% profit share the plan terms still bind, the § 401(a)(17) limit still caps eligible compensation (a $400,000 salary is already limited to $360,000), and the annual addition **less the catch-up** is still exactly $72,000 and never more. `ACCOUNT-17-8` (415(c) per **employer group**) is a DIFFERENT item and stays a named todo; the fixtures use a single employer so the two cannot be confused. Guarded by `tests/audit-s5aa-415c-catchup-room.test.js`, seven tests.

**Corpus effect: NONE, and that is itself a finding.** Measured differentially — the corpus against the same engine with the repair neutralised — because comparing against the stored reference is blind to a path an earlier task already moved. **Zero members move**, and the reason was verified at the § 415(c) line itself rather than assumed: across **13,078 recorded samples** in the five members that have a matched workplace account, the cap bound **0 times** (plan terms of ~$10,491 against a ~$57,000 cap) and a catch-up was present **0 times**. **The corpus does not exercise this rule at all**, so this repair is pinned by its own tests and by nothing else — logged as **F-03** in `Handover temp/S5AA_BLOCKED_LOG.md`.

## 2026-09-19 — Q96. A Roth 401(k) employer match is untaxed and routed to the Roth bucket, and the reported remedy is wrong (F10)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, first pass (`Handover temp/S5AA_EXTERNAL_AUDIT_FIRST_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_F1_F9_F10_contributions.js`.

**The mechanism.**
- The match is added to the target account's balance and never enters income. The engine draws no pre-tax/Roth distinction for the match at all.

**What was measured.**
- A 5% match on a Roth 401(k) at $100,000 salary adds **$5,000** to the ROTH balance and changes tax by **$0**.

**Reach.** Households with a Roth 401(k) employer match.

**Status: REPAIRED 2026-09-20, S5AA task 4.5 — the CORRECTED remedy, not the audit's.** The audit's premise (a Roth 401(k) match is "generally taxable") was incomplete: under SECURE 2.0 §604 an employer match is **pre-tax by default** and Roth only by the employee's election, so taxing it because the employee chose a Roth deferral would have been a second error in the other direction. Built as a **per-account election, `matchRoth`, defaulting to pre-tax**, listed in `src/boolean-flag-contract.json` with an absent witness.

**The defect.** `target.balance+=match` added the match to the account that earned it, so a match on a Roth 401(k) went into the Roth bucket and was **never taxed at all** — free employer money into a tax-free account. Measured: a 5% match on $100,000 of salary gave a Roth balance of **$15,000** with **$0** pre-tax; it now gives **$10,000** Roth and **$5,000** pre-tax, and on election **$15,000** Roth with `federalAgi` **exactly $5,000 higher**.

**The citation check changed the plan.** Notice 2024-2 was read from the notice itself before any rule was coded (task 8.6). Its section L answer 3 makes **full vesting a condition of the election, not a proportion of it** — a partially vested employee "may not designate any part" — so anything short of 100 refuses the election outright and the match falls back to pre-tax. Its section L answer 2 makes an elected match includible **in the taxable year of allocation**.

**And its section L answer 6 CONTRADICTED THE CHECKLIST'S OWN TEST LIST.** The checklist asked for "the separate FICA treatment". **There is none** for the plan types this engine models: a designated Roth match to a 401(a) or 403(b) plan is excluded from wages under §3121(a)(5)(A) and (D) and is expressly **not added back** under §3121(v)(1)(A). The separate treatment is in section L answer 7 and is for eligible **governmental** plans, which this engine does not model. The test asserts the negation: **a Roth election moves income tax and no payroll tax at all.**

The rule is added to `Resource Documents/ACCOUNT_RULES_ENGINE_REFERENCE_2026.md` §7.3a with its source, as the task requires, **after** the check and not before it.

**Corpus scope: zero of 36 members move**, measured against the previous commit's engine and rules at 1e-9, with a positive control reading $15,000/$0 → $10,000/$5,000. **No member has a match on a Roth-class account and none carries the new field**, so neither the routing nor the election can differ for any of them — the same instrument gap as F-03, F-05, F-06 and F-07, logged as **F-08**.

**A register trap fired and was caught by diffing the ID set:** the engine comments cited the notice's Q&A labels, and `tools/requirements-register.js` harvests `[A-Z]{1,5}-\d{1,3}` out of engine comments, so `L-1`, `L-2`, `L-3`, `L-6` and `C-07` were minted as **five phantom requirements** in one commit. They are now written as "section L answer 3", which is the notice's own wording said a different way.

## 2026-09-19 — Q97. A Roth conversion is capped by the first pre-tax account in array order (G1)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, second pass (`Handover temp/S5AA_EXTERNAL_AUDIT_SECOND_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_G_remaining.js`.

**The mechanism.**
- `preTaxConvertible()` reads the TOTAL pre-tax balance for capacity, but the conversion is then clamped by `Math.min(pre.balance, …)` where `pre` is `accounts.find(x => x.taxClass === "preTax")` — whichever account sorts first. The destination is likewise the first Roth account.

**What was measured.**
- The identical household, same balances and same priorities, converts a different amount depending on how `accounts[]` is WRITTEN: a $20,000 old 401(k) written first converts **$20,000** against a $50,000 request; the same two accounts in the other order convert **$50,000**.

**Reach.** Any household with more than one pre-tax account — an un-rolled old 401(k) plus a current IRA is the common case.

**Status: REPAIRED 2026-09-20, S5AA task 4.3 (decision 12.1).** The routing is stated once, in `conversionRoutes(accounts, p, priorReturn)`. **SOURCES** sort on `withdrawalComparator()` — the engine's one definition of draw order, and the one every other pre-tax draw already used — so `priority` decides and array position no longer does. **DESTINATIONS** sort on plain `priority` ascending, following the RMD cash deposit's precedent: the optimizer's score answers "which account should we spend from", which a deposit is not. **OWNERSHIP IS A CONDITION, NOT A PREFERENCE** — a source is routed only to a Roth account of its own owner (IRC 408A(d)(3): a qualified rollover contribution is made to *the individual's* Roth), and an owner holding pre-tax money with no Roth of their own has nothing to convert.

**Measured.** $50,000 requested against pre-tax accounts of $20,000 and $80,000 converted **$20,000** with the small one first in the array and **$50,000** with the big one first — the checklist's figure on the nose. Both orderings now return **$50,000**, and that equality, asserted between two runs of the same household, is the test that matters. A **self** pre-tax account converting into a **spouse** Roth moved $50,000 before and moves **$0** now. The third clamp the old line carried, `pre.balance`, was never a capacity clamp at all: it was the first array element's balance standing in for the household's.

**Corpus scope: zero of 36 members move, and the reason is a finding (F-07).** Eight members have `conversionOn`. Three hold more than one pre-tax account but **no Roth account at all**, so nothing converts in either arm; the rest hold at most one pre-tax account, where the routing is identical by construction. **Not one member has both several pre-tax accounts and a Roth destination**, so the control corpus cannot exercise this repair and the rule is pinned by its own tests alone. Measured differentially against the same engine with the repair neutralised, with a positive control proving the instrument reads the $20,000/$50,000 difference.

## 2026-09-19 — Q98. An `employment`-type other income attracts no payroll tax (G4)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, second pass (`Handover temp/S5AA_EXTERNAL_AUDIT_SECOND_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_G_remaining.js`.

**The mechanism.**
- `otherIncomeFor()` routes it into the `ordinary` bucket. `estimateTaxes()` applies OASDI and Medicare to its `wages` argument and to the self-employment net-earnings arguments only, so the income never touches the payroll base.

**What was measured.**
- The same $80,000 entered as `employment.salary` and as an `otherIncomes[]` entry of type `"employment"` produces materially different tax in the same year. The type IS offered in the shipped UI dropdown.

**Reach.** Anyone entering a second job or a spouse's income through the income list rather than the salary fields.

**Status: REPAIRED 2026-09-20, S5AA task 3.4.** An `employment` stream is now routed into the wage payroll-tax base, **per owner**. Measured: the same $60,000 cost **$8,312.50** as `employment.salary` and **$3,722.50** as a stream — a gap of exactly **$4,590.00**, which is 7.65% of it. **The income tax was already right**: `estimateTaxes()` takes `ordinaryIncome` and `wages` as **separate parameters** and uses `wages` only for payroll, so the stream already bore income tax through `other.ordinary` and adding it to the wage channel does not double count it. Had the two roles shared one parameter, the obvious repair would have counted it twice.

**The owner is the load-bearing part, exactly as the question warned.** The self's wages are derived as `wages - spouseWages` and **each person's OASDI is capped separately**, so crediting a spouse's job to the self pushes both onto one cap and **undercharges** a two-earner household. That is the failure an owner-blind repair makes **while every single-earner test still passes**, so it is asserted directly: two jobs at 75% of the wage base, one each, must cost what two salaries cost, and the test records that the pooled answer differs by over $1,000 so the assertion has teeth. The *second job for one person* case is asserted too, and it goes the other way — one person's salary and stream share **one** wage base, so the excess bears Medicare only.

**Not moved, and asserted:** no other income type gains payroll tax, and `selfEmployment` in particular is **not** charged FICA — it bears SE tax through its own channel, at the whole rate with a deductible half, and charging both would tax the same dollars twice. Guarded by `tests/audit-s5aa-employment-stream-payroll.test.js`, six tests, with the expected payroll **derived from the rule tables** (per-person OASDI cap, uncapped Medicare, and the additional Medicare threshold by filing status) rather than from the engine.

**DISCLOSED:** an owner of **`household`** is attributed to **self**, and so takes one person's OASDI cap rather than being split across two. That is not a choice made here — `seSelf`/`seSpouse` already resolve it the same way, because only `"spouse"` is tested — and splitting it would be new modelling that would have to move both accumulators together.

**Corpus effect, measured differentially:** exactly the **three** members carrying an employment stream move — `seed:10` (self), `seed:12` (spouse), `seed:15` (household) — every delta positive, **none without such a stream, and none with one left unmoved**, with row counts and calculation errors unchanged everywhere. The predicate was exact on the first attempt, unlike 3.1–3.3 where the cap or the deduction had already absorbed the change. Declared at task 7.3's instrument: 8,927 → 8,970.

## 2026-09-19 — Q99. Every HSA withdrawal is modelled as a qualified medical distribution (G5)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, second pass (`Handover temp/S5AA_EXTERNAL_AUDIT_SECOND_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_G_remaining.js`.

**The mechanism.**
- `withdrawFromClass()` assigns no gains, no ordinary income and no penalty for `taxClass === "hsa"`, and `simulatePlan()` routes only `preTax` withdrawals into `ordinaryWithdrawal`. There is no HSA basis, no medical-expense ledger, no age-65 branch and no 20% path.

**What was measured.**
- A $30,000 HSA draw is charged **$0** penalty and **$0** gains at 50 and at 70; the pre-tax control at 50 is charged $3,000. The optimizer actively steers here: under the `success` goal with `healthOn` and age 65+, the HSA score sorts ahead of preTax and Roth.

**Reach.** Any household with a meaningful HSA balance drawn for general spending — and the defaults steer toward it.

**Status: REPAIRED 2026-09-20, S5AA task 4.4 (decision 12.3 (d)).** The five definitions were settled before any code was written, in `Handover temp/S5AA_TASK_4_4_DEFINITIONS_20260920.md`: **0–100** (every other share on an account record is a percentage out of 100 — `basisPct`, `vesting`, `matchRate` — and a second convention on the same object is a defect generator); **per account**, because IRC 223(f) makes the income and the tax the ACCOUNT BENEFICIARY's; **every distribution** from an `hsa`-class account; an **optional** field where **absent means 100**; validated on type and range like `basisPct`.

**Checked against the statute first (C-06).** 223(f)(2) includes the non-qualified amount in the beneficiary's gross income. 223(f)(4)(A) increases the tax by **20 percent of the amount so includible — not of the distribution**. 223(f)(4)(C) stops the increase once the beneficiary attains the age in section 1811 of the Social Security Act, **which is the OWNER's age**: a 66-year-old does not exempt their 50-year-old spouse's HSA. Both figures are rule records under `retirement.hsa.nonQualified`.

**Measured.** $10,000 of spending funded entirely from an HSA at 50: wholly non-qualified costs **$2,500** (the engine solves the fixed point — $12,500 has to leave the account so $10,000 survives), 60% qualified costs **$869.57**, and fully qualified costs **$0.00**. Were the 20% charged on the distribution rather than the includible amount, the 60% case would pay $2,500 too.

**The rule is stated ONCE and read by all three sites the task names** — the commit, the quote and the optimizer's ranking. Building it uncovered a SECOND site that re-derived ordinary income from the class NAME: the tax-funding commit read `if(cls==="preTax") committedOrdinary+=w.amount`, so an HSA funding draw recognised nothing there while the quote had already priced it, and `TAX_SETTLEMENT_MISMATCH` rejected every row whose draw was large enough to owe income tax. The draw now reports the ordinary income it made and nobody re-derives it. **A fifth function was missing from the Worker's name list and worker parity caught it** — the task 1.1 trap.

**Corpus scope: zero numeric movement across all 36 members**, at 1e-9, measured against HEAD's engine and HEAD's rules, with a positive control reading $0.00 → $2,500.00. No member carries the new field, so every one is 100% qualified by default — which is exactly the pre-repair treatment. **That zero is the design, not an accident.** What does appear is the disclosure: `HSA_QUALIFIED_SHARE_ASSUMED`, recorded once by each of the **12** members that hold an HSA, and declared as 12 `LENGTH` differences in `tools/control-candidate-prediction.json`.

**Scope boundary, disclosed not assumed away:** 223(f)(4)(B)'s **disability and death** exceptions are not modelled, and the disclosure says so in its own text rather than leaving it to be inferred from silence. The share is **not** capped at the year's modelled medical spending, which would be wrong: a reimbursement may concern an expense from any earlier year back to the account's establishment.

## 2026-09-19 — Q100. The engine's input gates are narrower than the validator's: `runs` and a missing `retirement` section throw, a null owner and a non-numeric rate are accepted (G7, G12, H-03, H-06)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, second pass (`Handover temp/S5AA_EXTERNAL_AUDIT_SECOND_PASS_20260917.md`) and the S5a local hunt (`Handover temp/S5A_HUNT_FINDINGS_HANDOVER_20260919.md`) — **a local qwen3.8 hunt, not the external audit**. **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_G7_G8_G9_G12_contract.js`.

**The mechanism.**
- `scenarioInputGate()` does not check `assumptions.runs`, and requires `p.retirement`'s CONTENTS rather than its PRESENCE. Separately `missingIncomeOwnerCode` tests `income.owner === undefined`, so `null` passes; and a debt `rate` that is not a number is charged 0% interest.

**What was measured.**
- Through the public `runPlan()`: `runs: 0`, `-1` and `NaN` **throw** `TypeError`, while `runs: 1.5` returns `status=ok` — not refused at all. A plan with no `retirement` key throws; `retirement: {}` returns the contract properly. `owner: null` is accepted and the income is timed against self ($30,000 booked from 62), while the validator refuses it as `ERROR:UNRECOGNIZED_VALUE`. A debt `rate` of `"abc"` or `null` yields **$0** of lifetime interest while the validator refuses it as `ERROR:WRONG_TYPE`.

**Reach.** Direct programmatic callers, the import route and the Worker route. `RESULT_CONTRACT.md` §3 promises the invalid-result shape from every public path.

**Status: REPAIRED 2026-09-19, S5AA task 1.1.** Four refusals were added to `scenarioInputGate()`, in one pass: `SCENARIO_INVALID_RUN_COUNT`, `SCENARIO_MISSING_SCENARIO_SECTION`, `SCENARIO_UNRECOGNIZED_INCOME_OWNER` and `SCENARIO_NONFINITE_DEBT_RATE`. Guarded by `tests/audit-s5aa-input-gate.test.js`, nine tests, written failing first and shown red against the unrepaired engine (7 of 9 failing; the two that passed were the controls). **ONE GATE, ONE PASS**: H-03 and H-06 are the same defect as G7 and G12 seen from the other side, so this is not a second validator-repair project. The engine's gates refuse everything the validator refuses, kept in step by a shared table or by a test that walks the validator's own refusals against the gate. **Each case owes a NAMED CODE**, and each got one — `1.5` fails differently from `0` and is not answered by one blanket rule.

**Three things the repair had to learn, recorded because each would have shipped a worse defect than the one being fixed.**
- **`Infinity` does not throw, it never returns.** The Monte Carlo loop is `for(i=0;i<runs;i++)`. Tested in process, `runs: Infinity` and `runs: 1e6` do not fail — they take the whole test file down (measured: V8 “Ineffective mark-compacts near heap limit” after 56 s). Those cases run in a child process with a 512 MB cap and a deadline, so the unrepaired engine dies contained and is reported rather than aborting the suite.
- **`buildWorkerSource()` serializes a hand-maintained list of named functions.** A new top-level `var` in `engine.js` does not exist inside the Worker at all. Declared that way, the run-count ceiling threw a ReferenceError there, which the gate’s own try/catch turned into `SCENARIO_UNREADABLE_INPUT` **for every plan the Worker ran** — invisible from the main thread. The ceiling now lives inside its function, and the three new gate functions were added to that list.
- **`runScenario()` built an identity from the caller’s plan after the gate refused,** and `buildSimulationIdentity()` reads `p.retirement.dividendOn` — so a scenario with no `retirement` section threw the very TypeError the new gate exists to prevent, one line after it had correctly refused. That code now joins the two refusals which already skip identity.

**The ceiling of 10,000 runs is not invented:** the shipped page clamps its own control with `clamp(…,100,10000)`, so that is the largest count the product itself produces. An absent `assumptions.runs` is not claimed, because the simple and historical methods do not read it.

## 2026-09-19 — Q101. The row reconciliation check runs on Monte Carlo path 0 only (G8)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, second pass (`Handover temp/S5AA_EXTERNAL_AUDIT_SECOND_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_G7_G8_G9_G12_contract.js`.

**The mechanism.**
- Two lines decide it. `engine.js:2570` hands the issues collector to `i===0?issues:null`; `engine.js:2238` gates the check on `if(issues)`. So `checkRowInvariants()` reconciles one path out of N.

**What was measured.**
- Both lines confirmed present at the pinned commit (positive control: `RECONCILIATION_MISMATCH` is findable by the same means). Given a collector, an irreconcilable row IS named `RECONCILIATION_MISMATCH`, so the gate is the only thing between paths 1..N−1 and that diagnostic. The function raises exactly three codes: `RECONCILIATION_MISMATCH`, `NON_FINITE_ROW_VALUE`, `NEGATIVE_ACCOUNT_BALANCE`.

**Reach.** Monte Carlo reliability: a contaminated path is not reported, is not reproducible from outside, and its value still enters the median.

**Status: REPAIRED 2026-09-20, S5AA task 1.2 (decisions 12.5 (b), 19.1 (a)).** Every Monte Carlo path now receives a collector, and a failed **essential** invariant takes the batch to the invalid-result contract: no success rate, no financial figures. **The essential/informational split was named before any code was written** (`Handover temp/S5AA_ESSENTIAL_INVARIANTS_20260920.md`) and the line is the engine's own — `recordIssue()`'s `isInvariant()` already treats `RECONCILIATION_MISMATCH`, `NON_FINITE_ROW_VALUE` and `NEGATIVE_ACCOUNT_BALANCE` as a distinct class with its own evidence budget. **A depleted household stays valid**, pinned by its own control: depletion is a financial outcome, not a fault. The diagnostic is **one batch summary** naming paths, pathsAffected, findings, codes and the first affected path — so a faulted path is counted, never dropped from the denominator. Each later path's collector is scanned and released inside the loop, so a broad fault cannot accumulate findings across a long batch. Guarded by `tests/audit-s5aa-monte-carlo-invariants.test.js`, seven tests, written failing first (5 of 7 red; the two that passed were the controls), using an in-memory engine variant so no engine byte moves. **Measured cost of checking every path: about 6%** (2,000 paths 1,035 ms → 1,095 ms; 5,000 paths 2,457 ms → 2,544 ms). Original recommendation: check every path; a failed **essential** invariant produces the invalid-result status with one batch summary as the diagnostic. **Name which of the three checks are essential and which informational BEFORE building.** A valid depletion outcome stays valid.

## 2026-09-19 — Q102. Historical replay wraps back onto its first year instead of refusing (G9)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, second pass (`Handover temp/S5AA_EXTERNAL_AUDIT_SECOND_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_G7_G8_G9_G12_contract.js`.

**The mechanism.**
- `histIndex = (startHistory + yi) % HIST_RETURNS.length`, and `historyIndex()` does the same. The series covers 1928–2025, 98 entries.

**What was measured.**
- With `historyStart` 1928, offset 97 gives 2025 and offset **98 gives index 0 — 1928 again**. A 99-row historical plan returns `status=ok` with no error code. `MARKET_DATA_ENGINE_REFERENCE_2026.md` §11.1 is explicit: do not wrap, do not recycle a short sequence to fill a longer horizon.

**Reach.** Very-long-horizon historical runs; dormant for 30–50 year horizons.

**Status: HELD, not built (S5AA task 1.3, B-01).** Historical replay still wraps, and no `HISTORY_SEQUENCE_EXHAUSTED` error exists in the source. Held open at the S5AA close (close record section 4, E1: "G9 / task 1.3 (B-01)"). Dormant for 30 to 50 year horizons. *(Added 2026-09-24 (UTC−7) by the plan owner from the S5AA session's relay; the absence of the error code was checked in `src/` at HEAD.)*

*Original status, kept as history (its markup was malformed):* OPEN. S5AA task 1.3 (decision 12.6): return a documented calculation error (for example `HISTORY_SEQUENCE_EXHAUSTED`) and disclose the maximum horizon for a start year. No implicit wrap.

## 2026-09-19 — Q103. `projectDebts()` writes a private field onto the caller's debt object (G10)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, second pass (`Handover temp/S5AA_EXTERNAL_AUDIT_SECOND_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_G_remaining.js`.

**The mechanism.**
- `d._armScheduledPayment = scheduledPayment` writes into the caller's debt record. The module's docstring does not describe this mutation surface.

**What was measured.**
- **At the direct call the mutation is real:** the field is absent before `projectDebts()` and present after. **At the public entry point it is not observable:** `simulatePlan()` deep-clones the debts array, so a caller's own plan object is NOT mutated by `runPlan()`, and repeat runs agree to the cent.

**Reach.** A future second use of the same debt object. Not reachable through the shipped app.

**Status: VERIFIED, NO REPAIR — closed 2026-09-19, S5AA task 1.4, CLASS V.** Decision 12.7 made this row conditional: verify at the supported public entry points first, and repair only if public input or a later run is affected. Neither is. The mutation is real at a direct `projectDebts()` call, and `simulatePlan()` deep-clones the debts array, so a caller's own plan object comes back byte-identical, three repeated runs of the same plan object agree to the cent, and call order does not change the answer. **An isolated, documented internal mutation does not trigger a pre-rebuild refactor.** Guarded by `tests/audit-s5aa-arm-scheduled-payment.test.js`, four characterization tests (A-02: a verified-no-repair row is evidenced by a characterization check plus a written reason the alleged defect does not apply). **What is pinned is the isolation the disposition rests on** — if a future change stops cloning the debts array, or lets one run inherit another, those tests fail and this disposition has to be revisited. Original wording: Decision 12.7 makes this conditional: S5AA task 1.4 repairs only if public input or a later run is affected. On the evidence above, neither is. An isolated, documented internal mutation does not trigger a pre-rebuild refactor. **The disposition is recorded either way.**

## 2026-09-19 — Q104. An HSA payroll contribution reduces income tax but not the FICA wage base (G11)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, second pass (`Handover temp/S5AA_EXTERNAL_AUDIT_SECOND_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_G_remaining.js`.

**The mechanism.**
- `preTaxDeferrals` reduces ordinary income, but `estimateTaxes()` computes OASDI and Medicare on its raw `wages` argument.

**What was measured.**
- The auditor's case, $50,000 wages with $4,400 contributed through payroll: the engine charges payroll tax on the full $50,000 rather than on $45,600.

**Reach.** Anyone modelling an HSA through payroll. Overstates payroll tax.

**Status: REPAIRED 2026-09-20, S5AA task 3.5.** **The citation was checked against the primary source BEFORE the rule was coded** (task 8.6): Publication 969 was read rather than summarised, and the check is recorded in `Handover temp/S5AA_CITATION_CHECKS_20260920.md`. It says a contribution an employer makes *“using the amount of an employee's salary reduction through a cafeteria plan”* is treated as an **employer contribution**, and that employer HSA contributions *“aren't generally subject to employment taxes”*.

**The narrowing was honoured exactly, and the question was right that it is the point.** The HSA share is tracked **separately from `preTaxDeferrals`** and **per owner**; `preTaxDeferrals` still mixes all three routes and still feeds only the **income** tax base. Three pre-tax routes, three different answers: an HSA cafeteria-plan salary reduction is out of income tax **and** out of FICA; an ordinary 401(k) elective deferral is out of income tax but **remains wages**; a direct personal HSA contribution is an **above-the-line deduction**, and Pub. 969's silence about its employment-tax effect is the answer rather than a gap — FICA is computed on wages at the employer, before any Form 1040 deduction exists, so a deduction has no mechanism by which it could reach it. **The exclusion comes from the money never being wages, which only the cafeteria-plan route achieves.**

**Measured:** on $50,000 of wages, a $4,400 HSA and an identical $4,400 401(k) deferral used to cost **the same $8,004.50**; they now differ by exactly FICA on $4,400. The exclusion is **capped at the owner's own wages** — a salary reduction cannot exceed the salary and the base never goes negative — and follows the **owner**, for the same reason as Q98: OASDI is capped per person. **Above the OASDI cap the exclusion is worth the Medicare rates alone**, because the OASDI side was already clamped; that interaction is asserted. Guarded by `tests/audit-s5aa-hsa-fica-exclusion.test.js`, six tests, with the expected payroll derived from the rule tables rather than the engine.

**DISCLOSED, not invented around:** there is no cafeteria-plan or via-payroll flag anywhere in `src/engine.js`, so a **direct** personal contribution cannot be entered. What the engine already does is subtract HSA contributions from wages through `preTaxDeferrals`, which **is** the salary-reduction model, so the exclusion is applied to the route actually modelled. Adding an input would be feature wiring that ground rule 12 does not permit here.

**Corpus effect, measured differentially:** six members move — `seed:4`, `seed:5`, `seed:8`, `seed:9`, `seed:15`, `seed:19` — and **nothing without a contributing HSA moves**. The six that carry one and do not move are explained rather than assumed: four have **no wages at all**, and `seed:7` and `seed:13` have `contributionStop` equal to their starting age, so no contributing year exists. **On the sign, worth recording:** the DIRECT effect is a reduction in every mover's **first moved year** (−682.81, −118.42, −340.38, −336.60, −403.59, −103.40 — and `seed:9`'s is exactly FICA on $4,400, the auditor's figure arriving from the corpus). `seed:8`'s **total** is nonetheless **+71.95**, because less tax early leaves more invested and the larger portfolio pays more tax later: 4 years down, 22 up. **The first-order sign is the claim, not the sum** — the same compounding seen in task 3.1's golden fixtures. Declared at task 7.3's instrument: 8,970 → 9,206.

**A finding about the INSTRUMENT, raised by this task and logged as F-04:** `tools/requirements-register.js` matches a question id with `/(Q\d{2})/` — **exactly two digits** — so **Q104 and every other S5AA question numbered 100 or above is never harvested**. Measured against the committed engine: **29 of 29** two-digit ids cited in engine comments are carried, and **0 of 6** three-digit ones are (Q100, Q101, Q104, Q107, Q108, Q109 — six repairs this sprint has already landed). The repairs are guarded; the **bookkeeping** is blind, so none of them can be reported unguarded or trigger `COUPLED-ONLY`. Not widened here: it would harvest about eleven new requirements at once, mid-sprint, and `tools/` is the plan owner's.

## 2026-09-19 — Q105. The imputed-dividend branch ignores `dividendStart` (G13)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, second pass (`Handover temp/S5AA_EXTERNAL_AUDIT_SECOND_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_G_remaining.js`.

**The mechanism.**
- The imputed branch (`dividendOn === false`) charges 1.5% of dividend-eligible balances from year 0 and never consults `retirement.dividendStart`. The cash branch is gated by its duration and does start at `dividendStart`.

**What was measured.**
- At 45 with $1,000,000 taxable: `dividendStart` 55 and `dividendStart` 40 give **identical** tax with dividends off; with dividends on and the same start age, nothing is charged before 55. (A zero-return holding pays no dividend at all — RA-03 — so the case needs a live return.)

**Reach.** Interpretation of `MODEL_ASSUMPTIONS.md` §5's comparison, which is understated when `dividendStart` is in the future.

**Status: RECORDED 2026-09-20, S5AA task 5.2 — DOCUMENTATION AND PINS ONLY, NO OUTPUT CHANGE** (the owner, decision 12.9 (b)). **`dividendStart` means WHEN MODELLED DIVIDEND CASH STARTS BEING PAID OUT TO SPEND**, and the imputed 1.5% charge stays as the stated assumption that a diversified taxable portfolio has been producing dividend income all along. The asymmetry the audit reported is the model, not a defect, and what was missing was the definition that makes it so.

**Written down in two places:** a new **Dividends** section on the Rules page, stating both branches, the floor at retirement age, and the known limit; and an engine comment at the imputed branch itself, so the next reader of `*.015*duration` finds the decision rather than re-reporting it.

**Four pins, and one of them is a control.** The auditor's own case is recorded as today's behaviour (a `dividendStart` of 55 and of 40 give identical tax with dividends off). Stronger than that: **no value of `dividendStart` -- 0, 40, 45, 50, 55, 60 or 99 -- moves a dividends-off projection at all**, compared over the whole row shape rather than one total. With dividends on, a start at or below retirement age changes nothing, because retirement age is already the floor. **The control** is that a start AFTER retirement age does delay the cash: without it, "changes nothing" would be satisfied by a field nothing reads.

**The test the draft first described is deliberately NOT built** — it asserted no imputed tax before `dividendStart`, which is the opposite of the decided behaviour, and writing it would have pinned a decision nobody made. **Carried to S5b task 1 by name:** with dividends on, no dividend is taxed before retirement whatever the yield (one synthetic probe put it near $29,000 over 15 years — a single scenario, not a general figure).

## 2026-09-19 — Q106. The opening row's `realTotal` is nominal (G14)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the 2026-09-17 external audit, second pass (`Handover temp/S5AA_EXTERNAL_AUDIT_SECOND_PASS_20260917.md`). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_G_remaining.js`.

**The mechanism.**
- The opening row sets `realTotal = initial` and `inflationFactor = 1`; every later row computes `total / inflationFactor`.

**What was measured.**
- Confirmed: the opening row has `realTotal == total` with factor 1, and row 10 is properly deflated. This is exactly what `RESULT_CONTRACT.md` §5 (R-OPENING) specifies.

**Reach.** Interpretation only. A consumer reading `realTotal` as “today's dollars” reads the opening row wrong.

**Status: RECORDED 2026-09-20, S5AA task 5.3 — VERIFIED CORRECT, NO ENGINE CHANGE, CLASS V.** The opening row's `realTotal` is nominal **and that is right**: every row reports `total ÷ inflationFactor`, the opening factor is **1 by definition** because no time has elapsed, and `RESULT_CONTRACT.md` specified exactly this under `R-OPENING` before the audit ran. **No value was altered, and the pins exist so none is altered later.**

**What WAS genuinely missing is the BASE DATE.** The real series is denominated in dollars of the projection's **start date**, and nothing said so — the contract described the ratio, and the CSV column was headed *"Inflation-adjusted balance"* with no base named. "Inflation-adjusted" alone does not say *adjusted to when*. A consumer reading it as "today's dollars" is right only if "today" is the day the projection starts, and comparing two projections that start on different dates is wrong without restating one of them.

**Two changes, neither numeric:** a callout in `RESULT_CONTRACT.md` naming the base date, saying what the figure is not, and stating that a correct opening value must not be "fixed"; and the export column is now **"Inflation-adjusted balance (start-of-plan dollars)"**.

**Four pins, one of which is the control.** The opening row is real and nominal at once; every later row IS deflated by exactly the stated ratio (**without this, "realTotal equals total on row 0" would be satisfied by an engine that never deflated anything at all**); at zero inflation every row coincides; and both documents carry what they now claim.

## 2026-09-19 — Q107. The Q43 forced-payoff flag misses a negative payment and a teaser-rate ARM (H-01, H-02)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the S5a local hunt (`Handover temp/S5A_HUNT_FINDINGS_HANDOVER_20260919.md`) — **a local qwen3.8 hunt, not the external audit**. **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/S5AA_atstart_repro_hunt_420a910_change01.js`.

**The mechanism.**
- The condition is `d.paymentMonthly===0 && baseRate>0 && balance>.01`. A negative payment is coerced to $0 for the dollar path but tested raw, so `===0` is false. And `baseRate` is the PRE-RESET rate, so a 0% teaser that resets to a positive rate is never seen as interest-bearing.

**What was measured.**
- Payment −50 at 20%: status **`ok`, unflagged**, **$166,164,101** forced out at 75 (validator warns `NEGATIVE_PAYMENT`). A 0% teaser ARM resetting to 5%: status **`ok`, unflagged**, **$164,701** forced out — and **the validator says nothing at all**. The decided control (payment 0 at 20%) correctly errors `DEBT_ZERO_PAYMENT_FORCED_PAYOFF`.

**Reach.** Any household entering a negative payment or a teaser-rate ARM with no payment.

**Status: REPAIRED 2026-09-19, S5AA task 1.5 (decision 17.1).** The condition now tests the EFFECTIVE payment (entered plus extra, both already floored at zero, which is what the amortization loop actually spends) against any rate that ACTUALLY APPLIES before the debt ends (the current rate, or an adjustable reset rate when the reset falls before the payoff age). Guarded by `tests/audit-s5aa-forced-payoff-flag.test.js`, five tests, written failing first: 4 of 5 red against the unrepaired engine, and the one that passed was the control. **H-02 could not have been reached any other way** — its input is valid and the validator raises nothing, so no gate widening touches it; only the flag's own condition could. Controls pinned: zero payment at zero rate stays `ok`; a reset after the payoff age, a reset past the horizon and a reset to 0% are all unflagged; extra principal counts toward the effective payment. Original recommendation: flag “effective payment ≤ 0 while any rate that applies during the projection is positive”. **H-02 is unreachable by any gate widening** — its input is valid, so the flag's own condition has to change. If validation rejects a negative payment, that case expects invalid input, not a successful result with a flag. The wider closure obligation stays at S5b task 2b; **link this evidence once.**

## 2026-09-19 — Q108. A percent spending stage compounds every year under `fixedReal` (H-04)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the S5a local hunt (`Handover temp/S5A_HUNT_FINDINGS_HANDOVER_20260919.md`) — **a local qwen3.8 hunt, not the external audit**. **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/S5AA_atstart_repro_hunt_420a910_p1_pattern08.js`.

**The mechanism.**
- The carried spending base is built from the ALREADY-ADJUSTED amount in both branches, so a percentage stage re-applies itself to its own output each year and never recovers — the same defect RC-02 corrected for the survivor reduction.

**What was measured.**
- A 50% stage on an $80,000 base: **80,000 → 40,000 → 20,000 → 10,000 → 5,000 → 2,500 → 1,250**, and it stays at 1,250 after the stage window ends. A one-off 50% cut would hold near 40,000 through the window and return afterwards.

**Reach.** Any plan using a percent spending stage with the `fixedReal` strategy. **Reported as an understatement of spending up to about 98%, with the portfolio overstated to match — and pinned by no test.**

**Status: REPAIRED 2026-09-20, S5AA task 2.1.** The carried spending base is now the UNADJUSTED amount. `applyStage()` sat inside BOTH branches of `base`, and `fixedReal` computes each year as `priorSpend * inflationStep`, so the adjustment re-applied to its own output every year. **RC-02 had already made exactly this correction once**, for the survivor reduction — the stage was the adjustment it did not reach — so both branches now carry the same unadjusted amount and the ternary is gone with them. **A second symptom the finding did not name:** the same base made an `amount`/`set` stage PERMANENT, because the set value became the next year's starting point; one repair covers both and both are pinned. Guarded by `tests/audit-s5aa-stage-carried-base.test.js`, eight tests, expectations taken from a **control run with no stage** rather than hard-coded, so an engine that stopped applying stages altogether could not pass. **Corpus effect, measured exhaustively:** the scenarios whose differences changed are exactly `{seed:6, seed:11, seed:13, seed:19}`, which is exactly the set of corpus members that are `fixedReal` AND have stages — none moved outside it, none inside it failed to move, and `seed:1` (`fixedNominal` with two stages) correctly did not move. Declared at task 7.3's instrument: 8,141 → 8,344 (461 added, 258 resolved). **It also SHRANK a coverage gap:** `retirement.preserveRoth` was configured in five scenarios and executed by none, because staged plans collapsed toward zero spending and never reached that branch — the defect was suppressing corpus coverage of real code. Original detail S5AA task 2.1: build the carried base from the **unadjusted** amount in both branches. **Reproduce before any long-horizon expected output is refreshed**, and trace requested spending, funded spending and the carried base SEPARATELY, asserting the actual cash and account effect as well as the displayed amount. **No golden baseline may incorporate this defect.**

## 2026-09-19 — Q109. The down-year flexibility cut compounds the same way (H-05)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the S5a local hunt (`Handover temp/S5A_HUNT_FINDINGS_HANDOVER_20260919.md`) — **a local qwen3.8 hunt, not the external audit**. **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/S5AA_atstart_repro_hunt_420a910_p1_pattern08.js`.

**The mechanism.**
- The same carried-base mechanism: each down-year cut is applied to the already-cut base.

**What was measured.**
- A 10% flexibility cut: **80,000 → 72,000 → 64,800 → 58,320 → 52,488**, instead of holding at 90% of the uncut base.

**Reach.** Any plan with a non-zero flexibility setting through a run of down years.

**Status: REPAIRED 2026-09-20, S5AA task 2.2.** The down-year cut is now a **level, not a ratchet**: `base*=1-r.flexibility/100` sat beside the spending cut in the same expression as Q108's defect, writing the cut into what the next year starts from, so each year's 10% came off the previous year's already-cut figure. **Because A-02 reads this as a decided policy rather than a proven defect, the policy was written out BEFORE the implementation** — `Handover temp/S5AA_FLEXIBILITY_POLICY_20260920.md` fixes the return signal (the immediately preceding period's return), the lookback (exactly one period), the trigger (strictly negative, so a zero return does not fire), the size (not scaled by depth), the transition (no hysteresis, no phase-in, no recovery ramp), the inflation interaction (the cut multiplies the post-inflation figure and is NOT a suspension of the inflation increase — that is `guytonSkipInflation`, untouched) and the stage interaction (stage first, then cut). **None of that changed. Only whether the cut is REMEMBERED changed.** The document also records what is deliberately NOT decided: whether a one-period lookback on a raw return is the right signal at all is new modelling and needs the owner's decision. Guarded by `tests/audit-s5aa-flexibility-cut.test.js`, six tests, and **which years should be cut is DERIVED FROM `HIST_RETURNS` rather than listed** — a hard-coded list of ages would merely restate whatever the engine does, whereas deriving "row N is cut if and only if row N-1's series return was negative" is an independent statement of the policy. It carries a control that a repair which simply STOPPED cutting would fail, since that would make every ratio test pass trivially. **Corpus effect, measured exhaustively:** the scenarios that moved are exactly `{seed:8, seed:11, seed:18}` plus the three targeted historical starts (1929, 1966, 2000) — exactly the `fixedReal` members whose method can produce a negative return AND whose flexibility is above zero. The sharpest confirmation is from the other side: `seed:6`, `seed:13` and `seed:19` are `fixedReal` with flexibility 3–23 and correctly did NOT move, because they run on `simple`, whose constant positive return never fires the cut. Declared at task 7.3's instrument: 8,344 → 8,770 (1,438 added, 1,012 resolved). Original detail S5AA task 2.2: the cut applies to the **uncut** base, holds at 90%, and lifts when returns recover. **This is a chosen policy, not a newly proven tax or account defect** — record it in `MODEL_ASSUMPTIONS.md` (task 8.1).

## 2026-09-19 — Q110. Credit cards are offered but projected as fixed-term loans (X01)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the projection-scope review's X rows (S5AA checklist section 18). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_X_rows.js`.

**The mechanism.**
- `DEBT_TYPES` in the shell defines `creditCard` with its own 20% default rate and the UI offers it, but `projectDebts()` runs every debt through fixed-term amortization. `src/debt-revolving.js` implements the real mechanic and has its own tests; `engine.js` names it **0 times** (positive control: it names `DebtAmortization` 4 times).

**What was measured.**
- Confirmed by the three facts above. The module's own tests record the same balance and rate retiring roughly **four times later** under the revolving mechanic.

**Reach.** Any household modelling a credit card — a materially optimistic payoff.

**Status: REPAIRED in S5AA at `cb470cf` (2026-09-20).** A credit card is modelled as minimum-payment revolving debt and disclosed by `REVOLVING_DEBT_MINIMUM_MODELLED`, which is a disclosure, not an exclusion; `UNSUPPORTED_REVOLVING_DEBT` no longer exists (supported-domain record erratum, 2026-09-22). *(Added 2026-09-24 (UTC−7) by the plan owner from the S5AA session's relay; the commit and the code names were checked to exist at `fab88f0`, the behaviour was not re-derived.)*

*Original status, kept as history (its markup was malformed, so the register read it as unrecorded):* OPEN, CLASS B, an S5AA candidate under decision 18.3 (A). S5AA task 5.4: repair the live calculation **and its Worker binding together**, comparing minimum-only against extra-payment schedules, or record an accepted narrower scope. **Amendment A-06 applies here specifically:** ground rule 12's “no feature wiring” permits the wiring this needs, because it repairs accepted existing behaviour. The P19-excluded comparison modules stay excluded.

## 2026-09-19 — Q111. Roth withdrawals have no basis, ordering or five-year clocks (X02)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the projection-scope review's X rows (S5AA checklist section 18). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_X_rows.js`.

**The mechanism.**
- `withdrawFromClass()` assigns no gains and no penalty for `taxClass === "roth"`, and no clock or contribution-basis term appears in the engine.

**What was measured.**
- A $30,000 Roth draw is charged **$0** penalty and **$0** gains at **40** and at **70**. Controls: the taxable class DOES track basis and the pre-tax class DOES charge the penalty, so both mechanisms exist and are simply not applied here.

**Reach.** Any household drawing a Roth account before 59½ or within five years of a conversion.

**Status: DECIDED, an exclusion from the supported domain.** It is detectable (`UNSUPPORTED_ROTH_ORDERING`, `outsideSupportedDomain`, carried to the new-engine Roth block) but not enforced at the corpus boundary. Enforcement (label, not refuse) is carried to S5b task 4 (the owner, 2026-09-24; exit gate E7, ChatGPT R21G-01), and **7 of r15's 70 members carry it, each drawing a Roth dollar early** (still 7 of r16's 70, the same 7, counted 2026-09-25 from `tools/baseline-20260924-s5aa-expanded-r16.json`; R24 changed only the flag's message, Q136). Before S5AA R23 the flag was raised from inputs (a Roth held, with an early draw or a conversion possible): r14's 13 included 7 that never drew a Roth dollar early (three golden scenarios among them) and missed 1 that did (ChatGPT's R22-01, repaired at `9d58372`, on the owner's decision of 2026-09-24, Q135). *(Counts 13 in r14 and 7 in r15 checked 2026-09-24 by counting members whose entries contain the code in `tools/baseline-20260923-s5aa-expanded-r14.json` and `tools/baseline-20260924-s5aa-expanded-r15.json`; the 7 and 1 split is the S5AA session's.)* *(Added 2026-09-24 (UTC−7) by the plan owner from the S5AA session's relay. The owner decision is as reported by that session, not confirmed in the plan owner's chat; the code name exists at `fab88f0`. No S5b text edited.)*

*Original status, kept as history (its markup was malformed):* OPEN, CLASS S, an S5AA candidate. S5AA task 5.4: qualify ordering, basis and clocks, **or** restrict the reference to qualified withdrawals as an accepted scope decision. If restricted, the exclusion must be **detectable and enforced at the runner or corpus boundary** (task 5.5) — an unsupported notice alone is not enough if an affected result is still presented as a qualified reference value.

## 2026-09-19 — Q112. Historical replay ignores each account's allocation (X03)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the projection-scope review's X rows (S5AA checklist section 18). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_X_rows.js`.

**The mechanism.**
- In `accountReturnForPeriod()` the historical branch is `ret = histRate` — one S&P 500 return for every account. The Monte Carlo and simple branches both call `accountExpected(ac, p, …)`, which does consult the account.

**What was measured.**
- The same household from a 1990 start, changing only the allocation: a **100% stock** portfolio and a **100% bond** portfolio end at the **identical** total. A bond portfolio replays the S&P 500 exactly.

**Reach.** Every historical-method run with a non-equity allocation.

**Status: DECIDED, an exclusion from the supported domain, as for Q111.** `UNSUPPORTED_HISTORICAL_ALLOCATION` is carried to the new-engine market-data block; enforcement goes to S5b task 4 (the owner, 2026-09-24, as reported by the S5AA session). 4 of r14's 70 members carry it (still 4 of r15's 70, checked 2026-09-24; R23 moved only Roth issue lists) (`seed:3` also carries Q111's). *(Added 2026-09-24 (UTC−7) by the plan owner from the S5AA session's relay; the code name exists at `fab88f0`; the owner decision is not confirmed in the plan owner's chat. No S5b text edited.)*

*Original status, kept as history (its markup was malformed):* OPEN, CLASS S, an S5AA candidate. S5AA task 5.4: qualify allocation-aware replay with **existing** data, or state and **enforce** a fixed-proxy replay scope. **No invented bond series and no CRSP migration** — the data is not in the tree, and inventing it would be worse than declaring the scope.

## 2026-09-19 — Q113. PMI is charged for the life of the loan and never cancels (X04)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the projection-scope review's X rows (S5AA checklist section 18). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_X_rows.js`.

**The mechanism.**
- The housing block charges `pmiMonthly` whenever `d.balance > 0`. No LTV or cancellation term occurs anywhere in `engine.js`.

**What was measured.**
- A live $300,000 mortgage at 5% paid down to **$152,991** — 51% of the original balance — is still charged **$2,400** of PMI that year. (Measured with a payment that leaves the loan outstanding: an earlier probe repaid it first, so PMI stopped for the wrong reason.)

**Reach.** Any modelled mortgage carrying PMI.

**Status: OPEN, not built, and undisclosed.** The engine has no PMI cancellation term. It is listed as not built in the supported-domain record (S5AA task 5.6, row 13), which notes it has no disclosure. *(Added 2026-09-24 (UTC−7) by the plan owner from the S5AA session's relay; not re-derived.)*

*Original status, kept as history (its markup was malformed):* OPEN, CLASS B, an S5AA candidate — but conditional. S5AA task 5.4 repairs it **if affected mortgages are in reference scope**. **Honest qualification:** statutory termination is measured against the ORIGINAL VALUE OF THE PROPERTY, not the original loan balance; whether the schema carries a property value is what decides between a repair and a stated scope boundary. A conservative bias is still a wrong expectation.

## 2026-09-19 — Q114. Tax-exempt interest is left out of Social Security provisional income (X09)

**Filed by the S5AA run on 2026-09-19 (UTC−7) at the start commit `14b7095`** (task 0.4). Source: the projection-scope review's X rows (S5AA checklist section 18). **Reproduced before any repair** (task 0.3, the barrier A-03 keeps on the owner's POR-03b answer), Windows 11 / Node 24.17.0, against a `git archive` extraction of the start commit whose `src/engine.js` was verified to hash to `git show 14b7095:src/engine.js`. Evidence: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md` and `Handover temp/S5AA_REPROS_20260919/repro_X_rows.js`.

**The mechanism.**
- `ssProvisionalIncome = incomeTaxOrdinary + investmentIncome + 0.5 × ssBenefit`. A `taxFree` income stream is excluded from ordinary income and never added back, though Pub. 915 adds tax-exempt interest back for exactly this comparison.

**What was measured.**
- A $50,000 tax-free income stream leaves `ssProvisionalIncome` **unmoved**. **The row's other half is different:** the Additional Medicare base IS built from wages plus both persons' self-employment net earnings together, so combined wage-and-SE Medicare looks supported.

**Reach.** Households holding municipal bonds alongside Social Security — the taxable share of the benefit is understated.

**Status: HELD, half one (X09a, tax-exempt interest left out of Social Security provisional income) is a reproduced defect, not built; half two (the combined wage and self-employment Medicare base) is supported.** The held patch is diagnosed in `audit/S5AA/sprint/S5AA_X09A_HELD/README.md`: it misses one of the engine's three recomputations of the tax obligation, `verifyQuoteObligation()`. *(Added 2026-09-24 (UTC−7) by the plan owner from the S5AA session's relay; the README exists, the engine claim was not re-derived.)*

*Original status, kept as history (its markup was malformed):* OPEN, CLASS S, an S5AA candidate, recorded as a SPLIT row so the supported half is not lost inside one verdict. S5AA task 5.4: support and correct the provisional-income measure, or declare it an unsupported boundary — and an “unsupported” answer must still be **enforced** (task 5.5), not merely disclosed. The Medicare half owes an independent expected case (X08, task 6.4) but is not a defect.

---

## 2026-09-21 — Q115. A deceased person's wages and contributions end at the death (the S5AA verdict's Q3)

**Registered 2026-09-24 (UTC−7) by the plan owner (bd9f75)**, on the owner's instruction "register the S5AA decisions as questions". The owner gave the answer to the S5AA session in conversation on 2026-09-21; it was never filed as a question, so the engine's comments cite it as "Q3 (the owner, 2026-09-21)". **That is not this entry's number** and not the older Q3 of this file: cite the engine text as this entry (Q115). Source: `S5AA_RELAY_TO_EB_20260924_COMBINED_R5_TO_R21.md` §6 and the S5AA round records under `audit/S5AA/`.

**The decision (the owner, 2026-09-21; answered twice, the second time on a corrected question).** When one spouse dies inside the projection, that person's wages and contributions stop at the death, prorated within the year, as they stop at retirement. Employment and self-employment streams in their name stop too; rental, investment and other streams continue.

**Status: IMPLEMENTED 2026-09-21 at `4e97830`.** The work duration ends at the death, prorated inside a row. Modelling text: `MODEL_ASSUMPTIONS.md` §18.1.

## 2026-09-21 — Q116. A surviving spouse takes the deceased's retirement accounts as their own (the S5AA verdict's Q4)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115. The engine's comments cite this as "Q4 (the owner, 2026-09-21)"; it is this entry (Q116), not the R9 round's Q4 (see Q125).

**The decision (the owner, 2026-09-21).** The spousal rollover: from the year after a death the survivor takes the deceased's IRAs, Roth IRAs, 401(k)s and Roth 401(k)s as their own (Treas. Reg. 1.408-8(c); IRC 402(c)(9)), with any nondeductible IRA basis; a required distribution the deceased had not taken in the year of death is still due on their schedule. Keeping an account as an inherited IRA is not modelled.

**Status: IMPLEMENTED 2026-09-21 at `fd76c95`** (with `60e3c41`, which names a spouse who died before the plan starts in the succession disclosure). Modelling text: `MODEL_ASSUMPTIONS.md` §18.1.

## 2026-09-21 — Q117. Beneficiaries and post-death distribution rules are not modelled (the S5AA verdict's Q5)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115.

**The decision (the owner, 2026-09-21).** Beneficiaries, inherited accounts and estate taxes are not modelled. They are already UNSUPPORTED in the successor spec (`ACCOUNT` section 18, test 9), and the engine names what stays on a dead owner.

**Status: DECIDED 2026-09-21 (the owner), no code change: an accepted unsupported boundary, disclosed.** Carried to the CPU engine rebuild's supported-domain record.

## 2026-09-21 — Q118. Two carries to S5b: G3 and a warnings panel (the S5AA verdict's Q7 and Q8)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115. Recording a decision is not S5b work; **S5b has not started and no S5b text was changed** (the owner's hold of 2026-09-16 stands).

**The decisions (the owner, 2026-09-21).** Q7: G3, S5b task 4.2's partial-year required distribution, is carried to S5b, unchanged by S5AA. Q8: a warnings panel is carried to S5b: the app renders exactly one engine issue code, so most disclosures are recorded but never shown to a user; proposed scope is to list every WARNING and ERROR issue on a result.

**Status: DECIDED 2026-09-21 (the owner), carried to S5b, not started.** The S5b plan text that would state these two carries is held for the owner's S5b go.

## 2026-09-21 — Q119. Four succession assumptions are kept and disclosed (the S5AA decisions D-2, D-3, D-3b, D-11 and D-5)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115. Options are in `audit/S5AA/R06/S5AA_R6_EXTERNAL_AUDIT_REPAIR_REPORT_20260921.md` section 8 (D-11 added at R8).

**The decisions (the owner, 2026-09-21).** D-2 (a): an HSA passes to the survivor, disclosed as assuming they are its designated beneficiary. D-3 and D-11 (a): a taxable account, including a joint one, passes with the decedent's cost basis, with no step-up, disclosed (the survivor's gains are overstated). D-3b: custom accounts pass like an IRA of their tax class, disclosed. D-5: the HSA family limit after a death keeps the entered coverage, disclosed.

**Status: DECIDED 2026-09-21 (the owner), no code change: all four were already disclosed** (`SPOUSAL_ROLLOVER_ASSUMED` names the designated-beneficiary assumption). Modelling text: `MODEL_ASSUMPTIONS.md` §18.1.

## 2026-09-21 — Q120. The 10% additional tax is not charged on IRA basis (the S5AA decision D-4)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115.

**The decision (the owner, 2026-09-21).** Repair: the 10% early-withdrawal tax applies only to the taxable part of an IRA withdrawal, in the draw, the quote's slope and the transfer, together.

**Status: IMPLEMENTED 2026-09-21 at `ad9bbf0`.** Not modelled, by decision: re-figuring the 10% after the annual settlement.

## 2026-09-21 — Q121. Health costs and the survivor spending factor follow who is alive (the S5AA decisions D-6 and D-7)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115.

**The decisions (the owner, 2026-09-21).** D-6: health costs are chosen per person, not keyed to the self's age. D-7: the spending survivor factor's death boundary aligns with `householdSurvivorship()`.

**Status: IMPLEMENTED 2026-09-21.** D-6 at `2c220e6`; D-7 at `26d9757`. Modelling text: `MODEL_ASSUMPTIONS.md` §18.1 and §18.4; the survivor factor still applies only when the survivor-benefit switch is on.

## 2026-09-21 — Q122. The projection stops at the last death, and a plan with nobody alive is refused (the S5AA decisions D-1 and D-8, and the 2026-09-22 answers)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115.

**The decisions (the owner).** D-8 (2026-09-21): after the last death the projection stops (not continue-and-mark, not a domain status). D-1: keep the "nobody alive" exclusion for a household of one, made moot by D-8. 2026-09-22: the spending-strategy horizon follows the modelled death (VPW and the RMD-style strategy pace to the last death), and a plan in which nobody is alive at the start is refused.

**Status: IMPLEMENTED 2026-09-21 to 2026-09-22.** `2bec613` (stop at the last death), `02b921a` (strategy pacing), `6f46457` (nobody alive at the start is refused, `NOBODY_ALIVE_AT_START`). Result-contract version 4 (`831e393`) makes the death cut a versioned rule. Modelling text: `MODEL_ASSUMPTIONS.md` §18.1 and §18.4.

## 2026-09-21 — Q123. IRA conversions go only into a Roth account of the same owner (the S5AA decision D-10)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115.

**The decision (the owner, 2026-09-21).** Repair a conversion routing a traditional IRA into a Roth 401(k): a traditional IRA converts only into a Roth IRA (or a custom Roth account); a 401(k) may convert into a Roth-class account of the same owner.

**Status: IMPLEMENTED 2026-09-21 at `6701577`.** Modelling text: `MODEL_ASSUMPTIONS.md` §18.3.

## 2026-09-21 — Q124. The validator restricts account owners by type (the S5AA decision D-12)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115.

**The decision (the owner, 2026-09-21; D-12 added at R8).** An IRA, workplace plan or HSA belongs to one person; joint is allowed only on taxable and custom accounts.

**Status: IMPLEMENTED 2026-09-21 at `3e6dcd9`** (`INVALID_ACCOUNT_OWNER`, an ERROR that import rejects on).

## 2026-09-21 — Q125. QCDs are paid from age 70½ per owner, with no scaling, and a year-of-death QCD uses the decedent's age (the R9 round's Q3, and N-4)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115. **This is the R9 round's Q3, not the verdict's Q3 (Q115).** It removes the proportional-scaling statement that `MODEL_ASSUMPTIONS.md` §14 recorded as provisional.

**The decisions (the owner).** R9 round Q3 (2026-09-21): a QCD is allowed from 70½, independent of whether a required distribution is due, per owner, capped per person per year. N-4 (2026-09-22): keep a year-of-death QCD on the decedent's age.

**Status: IMPLEMENTED 2026-09-21 at `a7cc852`** (N-4 kept, no code). Modelling text: `MODEL_ASSUMPTIONS.md` §18.3.

## 2026-09-21 — Q126. Dividends: taxed every year with the option on; the imputed 1.5% stays with it off (the R9 round's Q4)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115. **This is the R9 round's Q4, not the verdict's Q4 (Q116).**

**The decisions (the owner).** 2026-09-21: with dividends on, the entered yield is taxed every year. 2026-09-22 (the half first held): with dividends off, keep the imputed 1.5% taxed, because it is the tax on reinvested dividends. `dividendStart` means when modelled dividend cash starts being paid out to spend (S5AA 12.9 (b), 2026-09-19: no output change).

**Status: IMPLEMENTED 2026-09-21 at `823666b` (the option-on half); the option-off half is a kept behaviour, no code.** *(Corrected 2026-09-24 (UTC−7), on ChatGPT's R22-02 finding, relayed by the S5AA session and checked against `tests/audit-s5aa-r9-dividends-taxed-every-year.test.js` and `823666b`: this line first carried a "Known gap, carried to S5b task 1", saying that with the option on the engine taxes nothing on dividends before retirement. That was wrong: it was repaired at `823666b`. Both paths now tax dividends from the first year, the entered yield with the option on and the imputed 1.5% with it off. The S5b task 1 note that describes a gap is stale and waits for the owner's S5b go. The app's Rules-page sentence that repeated the same false claim was removed by S5AA R23 at `3bc8946`, and the rendered-disclosure test now sweeps for it.)* Modelling text: `MODEL_ASSUMPTIONS.md` §18.4.

## 2026-09-21 — Q127. A one-time income can be marked tax-free (the R9 round's Q5)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115.

**The decision (the owner, 2026-09-21).** One-time income was always taxed; add a tax-free option (a gift or an inheritance).

**Status: IMPLEMENTED 2026-09-21 at `e4c582c`.**

## 2026-09-22 — Q128. An RMD shortfall is an error only where the model promised the distribution, and the app shows due, paid and unmet (the owner, 2026-09-22)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115.

**The decisions (the owner, 2026-09-22).** A projection is refused only when the model promised to protect a required distribution and failed to; otherwise the shortfall is shown as unmet. The app shows RMD due, paid and unmet. The CL-02 timing repair, deferred since S2, is made: a drawn required distribution is held out of the row's return (R11-01).

**Status: IMPLEMENTED 2026-09-22.** `9af145f` (shortfall rule), `149ca0d` (columns), `b4741ea` ("paid" is what satisfied the requirement), `4492088` (the CL-02 timing repair, R11-01; the contract-version-4 bump, `831e393`, is the death cut and is cited in Q122, not here). *(Corrected 2026-09-24: this line first cited `831e393` for the shortfall work, a wrong citation found by the S5AA session.)* The IRS excise tax on a missed RMD is not modelled. Modelling text: `MODEL_ASSUMPTIONS.md` §18.3.

## 2026-09-22 — Q129. Pre-tax to taxable transfers count toward their own RMD, pulled forward from S103 (the owner, 2026-09-22)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115. This is S2 carried item U1, decided 2026-09-13 and routed to S103.

**The decision (the owner, 2026-09-22).** Pull U1 forward from S103 into S5AA.

**Status: IMPLEMENTED 2026-09-22 at `4b5aff1`** (regression R15-01 repaired at `dcd7247`). U2 stays in S103. Register row: `S2_CARRIED_WORK_REGISTER.md` U1.

## 2026-09-22 — Q130. The basis workstreams are built in S5AA, not S5b: dollar basis (B) and the annual IRA settlement with the tax ledger (A) (the owner, 2026-09-22 and 2026-09-23)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115.

**The decisions (the owner).** 2026-09-22: build the basis workstreams in S5AA (they had been routed toward S5b). 2026-09-23: build workstream A now; an unpaid final tax is a plan failure.

**Status: IMPLEMENTED.** Workstream B (taxable basis in dollars) at `235eb5f`, R18; workstream A (the annual per-owner IRA settlement and the tax-liability ledger, result-contract version 5) at `31a7895`, R19. Modelling text: `MODEL_ASSUMPTIONS.md` §18.2, §18.3 and §18.5.

## 2026-09-23 — Q131. A capital loss lowers taxable Social Security, and adjusted gross income may be negative (R18-01, the owner, 2026-09-23)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115.

**The decision (the owner, 2026-09-23).** Repair R18-01: the $3,000 capital-loss deduction is taken whatever the other income, so it can lower taxable Social Security, and negative AGI is shown, as on Form 1040.

**Status: IMPLEMENTED 2026-09-23 at `25b0c37`.** Related self-audit repairs: `8566c9c` (a year uses only the carryover its taxable income can absorb), `dbf2f5d` (a decedent's loss carry is not the survivor's).

## 2026-09-23 — Q132. The glide path, the account owner's age and the Rule of 55 ranking (R18F-01 to R18F-03, the owner, 2026-09-23)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115.

**The decisions (the owner, 2026-09-23).** Repair R18F-01 to R18F-03, and an all-stock glide goes into bonds: a glide path's return and risk come from one allocation; the early-distribution tax and the Rule of 55 read the account owner's age; the optimized order prices the early-distribution tax the way the draw charges it.

**Status: IMPLEMENTED 2026-09-23.** `f75bd78` (R18F-01, glide; an all-stock account glides into bonds when the plan defines a bonds class), `8580eda` (R18F-02, owner age; the Rule of 55 applies to workplace plans only), `653ef46` (R18F-03, optimized-order pricing). Modelling text: `MODEL_ASSUMPTIONS.md` §18.3 and §18.5.

## 2026-09-23 — Q133. Monte Carlo draws each account's return independently: disclose now, replace with shared market shocks in the engine rebuild (the owner, 2026-09-23)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115. Relates to Q45 (correlation calibration) and Q66 (per-account reserve).

**The decision (the owner, 2026-09-23).** Splitting the same investments across more accounts makes Monte Carlo look less volatile than it is. Disclose the limitation now; change it in the CPU engine rebuild (shared market shocks), not in the old engine.

**Status: DECIDED 2026-09-23 (the owner), disclosed, not repaired in the old engine.** Carried as row U6 of `S2_CARRIED_WORK_REGISTER.md`; modelling text `MODEL_ASSUMPTIONS.md` §18.6 (the S5AA session's figures, mechanism checked, numbers not re-derived).

## 2026-09-23 — Q134. An allocation key for an asset class the plan does not define is rejected at validation (R20-01, the owner, 2026-09-23)

**Registered 2026-09-24 (UTC−7) by the plan owner**, as for Q115.

**The decision (the owner, 2026-09-23).** Reject an unknown allocation key at validation.

**Status: IMPLEMENTED 2026-09-23 at `4dd674b`** (tag `s5aa-r21-source`; `UNKNOWN_ALLOCATION_CLASS`, an ERROR on import; a plan already saved in the browser is not re-checked on open). ChatGPT's change audit of R21 (PR #9) requalified it. Modelling text: `MODEL_ASSUMPTIONS.md` §18.5.

**Process decisions not registered.** The owner's 2026-09-23 answers that ChatGPT publishes its own audit reports as pull requests, that R19 and R20 be audited together, and that R21 be audited as a change only with no zip package are workflow rules, recorded in `audit/S5AA/WORKING_RULES.md` and `audit/S5AA/README.md`, not model behaviour.

## 2026-09-24 — Q135. The Roth exclusion is keyed on an actual Roth draw by the owner's age (R22-01, the owner, 2026-09-24)

**Registered 2026-09-24 (UTC−7) by the plan owner**, from the S5AA session's relay (`audit/S5AA/R23/S5AA_RELAY_TO_EB_20260924_R23.md`). The owner's answer was given to the S5AA session directly ("Repair now as R23"); it is **as reported by that session, not confirmed in the plan owner's chat.** Relates to Q111.

**The decision (the owner, 2026-09-24).** ChatGPT's R22-01 found that `UNSUPPORTED_ROTH_ORDERING` was raised from inputs, not from what happened: it missed a $20,000 one-time expense drawn from a Roth at 45, and flagged a household aged 45 to 50 whose $300,000 Roth never moved (the two witnesses of R22-01, `audit/S5AA/R22/S5AA_R22_EXTERNAL_AUDIT_AND_CLAUDE_HANDOVER_20260924.md` section 2). *(The S5AA session then measured the reach on r14: 6 of 13 flagged members drew a Roth dollar early, 7 never did (three golden scenarios among them), and 1 unflagged member did. The 13 is checked; the 6/7/1 split is that session's. Corrected 2026-09-24: this paragraph first credited the golden scenarios to ChatGPT; they came from the S5AA session's own measurement.)* Repair it now, as round R23: raise it where a Roth dollar is actually drawn (the spending or tax-funding draw, or a manual transfer to a non-Roth account) while its owner is under 59 1/2, once per run, with `state.firstDrawOwnerAge`; a conversion into a Roth no longer raises it; in Monte Carlo a draw on any path marks the run.

**Status: IMPLEMENTED 2026-09-24 at `9d58372`** (S5AA R23; merged as `132235d`; audited source `s5aa-r23.1-source` = `3bc8946`). No figure moves; 7 of r15's 70 members carry the flag (13 of r14's did). Enforcement at the corpus boundary stays carried to S5b task 4 (Q111). Contract text: `RESULT_CONTRACT.md` issue table. *(Updated 2026-09-25: ChatGPT's R23 change audit (PR #20, `1d31edc`) found R23-01, a transfer scheduled at 59 1/2 judged at the year's opening age; **refined by R24 for scheduled transfers (Q136)**, requalified in PR #22 (`01449e0`). The first version of this line said "awaiting ChatGPT's change audit"; that has since returned.)*

## 2026-09-24 — Q136. A scheduled transfer is judged at its own age, for the Roth flag and for the 10% on a pre-tax transfer to taxable (R23-01, the owner, 2026-09-24)

**Registered 2026-09-25 (UTC−7) by the plan owner**, from the S5AA session's relay (`audit/S5AA/R24/S5AA_RELAY_TO_EB_20260925_R24.md`). The owner's answer, "Repair now as R24", was given to the S5AA session directly; it is **as reported by that session, not confirmed in the plan owner's chat.** Relates to Q135 and Q111.

**The finding.** ChatGPT's R23 change audit (`audit/S5AA/R23/S5AA_R23_EXTERNAL_AUDIT_AND_CLAUDE_HANDOVER_20260924.md`, R23-01, priority 2): a Roth transfer scheduled at exactly 59 1/2, in a projection year opening at 59, was flagged as an early draw, because the engine judged it at the year's opening age. The S5AA session then found the 10% additional tax on a pre-tax transfer to taxable had the same slip: a $20,000 IRA-to-cash transfer at 59.5 paid $2,000 that IRC 72(t)(2)(A)(i) does not charge.

**The decision.** Repair both now, as round R24: a scheduled transfer is judged at its own age (`advanced.transferAge`, moved to the source account's owner).

**Status: IMPLEMENTED 2026-09-24 at `0acc073`** (S5AA R24; merged as `698a88d`; audited source `s5aa-r24-source` = `d67b618`). ChatGPT's R24 change audit (PR #22, merged `01449e0`) found no new findings and requalified R23-01. No corpus figure moves; baseline r16 differs from r15 only in the Roth flag's message. Contract text: `RESULT_CONTRACT.md` issue table.

## 2026-09-24 — Q137. A pooled draw is judged at the age its projection year opened at (the owner, 2026-09-24: "Keep it and disclose it")

**Registered 2026-09-25 (UTC−7) by the plan owner**, as for Q136 (the owner's answer as reported by the S5AA session).

**The question.** A year's recurring spending, one-time expenses and tax funding are pooled and drawn as one amount with no date inside the year, so a year that opens before 59 1/2 and ends after it has its whole draw judged before 59 1/2, for the 10% additional tax and for the Roth flag. Part of that draw may in fact fall after 59 1/2.

**The decision.** Keep the convention and disclose it. Alternatives offered and not chosen: prorate the 10% over the year; or carry each dated one-time expense's age through the draw. Either can be decided with the engine rebuild.

**Status: DECIDED 2026-09-24 (the owner, as reported), kept and disclosed; not repaired.** Disclosed in the flag's message (`0acc073`) and in `MODEL_ASSUMPTIONS.md` §18.3 ("Age 59½ inside a projection year"). The S5AA session measured on r15 (its figures, not re-derived here): 3 of 70 members pay more 10% than a split year would charge, and `expansion:s5aa-gap-early-retiree` pays $8,820 more lifetime tax.

## 2026-09-25 — Q138. The engine refuses a plan value the validator rejects as not a number (R24F-04, the owner, 2026-09-25)

**Registered 2026-09-26 (UTC−7) by the plan owner**, from the S5AA session's relay (`audit/S5AA/R25/S5AA_RELAY_TO_EB_20260925_R25.md`). The owner's answers were given to the S5AA session directly; they are **as reported by that session, not confirmed in the plan owner's chat.** Finding: ChatGPT's R24F deep audit (`audit/S5AA/R24/S5AA_R24F_EXTERNAL_AUDIT_AND_CLAUDE_HANDOVER_20260925.md`, PR #31, `43d9043`, priority 2).

**The finding.** The validator rejects a non-number in 14 plan fields as `WRONG_TYPE`, but the engine ran them.

**The decision.** "Repair: refuse it", for all 14 fields, "with a parity test".

**Status: IMPLEMENTED 2026-09-25 at `95bf5d0`** (S5AA R25; merged `ea8f155`; audited source `s5aa-r25-source` = `4b7d516`; awaiting ChatGPT's change audit). `profile.age` also joined, making 15 fields; the engine returns `SCENARIO_NONNUMBER_PLAN_VALUE` (ERROR, `state.path` names the field, no rows), and a NaN Monte Carlo seed is refused while an absent seed still means 0. I read the 15-field list and the refusal in `src/engine.js` (`nonNumberPlanValuePath`) on `main`. Contract text: `RESULT_CONTRACT.md`.

## 2026-09-25 — Q139. A debt with a payoff age inside a year is settled in its payoff month (R24F-03, the owner, 2026-09-25)

**Registered 2026-09-26 (UTC−7) by the plan owner**, as for Q138 (ChatGPT's R24F, priority 2; the owner's answer as reported).

**The finding.** A mid-year debt payoff charged interest to year end.

**The decision.** "Repair: settle at the payoff month."

**Status: IMPLEMENTED 2026-09-25 at `aeba9a0`.** A payoff age strictly inside a year ends the monthly loop at its month and the balance is settled there; a payoff at a year boundary, or before the year began, runs as before. Witness `tests/audit-s5aa-r25-debt-payoff-at-its-month.test.js`. Modelling text: `MODEL_ASSUMPTIONS.md` §19.

## 2026-09-25 — Q140. A spending stage that starts or ends inside a year is prorated by time (R24F-01, the owner, 2026-09-25)

**Registered 2026-09-26 (UTC−7) by the plan owner**, as for Q138. The reading of the end age is Q141.

**The finding.** The app takes a stage's start and end ages in half-year steps, but a half-year stage was shifted to whole years.

**The decision.** "Repair: prorate the stage."

**Status: IMPLEMENTED 2026-09-25 at `9a40562`.** A year that a boundary splits spends the time-weighted average; a year no boundary splits is evaluated directly, so whole-year figures are unchanged. Witness `tests/audit-s5aa-r25-stage-prorated-by-age.test.js`. Modelling text: `MODEL_ASSUMPTIONS.md` §19.

## 2026-09-25 — Q141. A spending stage's end age means the last year it covers (R24F-01, the owner, 2026-09-25)

**Registered 2026-09-26 (UTC−7) by the plan owner**, as for Q138. Related: Q140.

**The question.** ChatGPT's expected values for R24F-01 read the end age as the moment the stage ends. The engine has always covered the years opening at the start and at the end age.

**The decision.** A stage's end age means "the last year covered": a stage from 65 to 66 covers ages 65 up to 67, `[start, end + 1)`. The alternative, "the moment it ends", would have changed every whole-year stage (all 17 in the corpus, golden scenarios among them).

**Status: DECIDED 2026-09-25 (the owner, as reported), implemented in `9a40562`** with Q140. It is a disclosed reading, not a defect: `MODEL_ASSUMPTIONS.md` §19. One consequence: a plan that starts at 65.5 has a first year from 65.5 to 66, and a stage whose last year is 65 now covers it.

## 2026-09-25 — Q142. A scheduled transfer's moved dollars earn the source's return until the transfer date (R24F-02, the owner, 2026-09-25)

**Registered 2026-09-26 (UTC−7) by the plan owner**, as for Q138. Related: Q136, Q137 (a transfer's age tests use its own age).

**The finding.** A mid-year transfer's dollars earned the destination's return all year.

**The decision.** "Repair: split growth at the date."

**Status: IMPLEMENTED 2026-09-25 at `4b7d516`.** The transfer's accounting (what moves, its tax, its RMD credit) stays at the year's opening; only the growth of the moved dollars is corrected, after the year's growth, so the reconciliation invariant sees it. Witness `tests/audit-s5aa-r25-transfer-growth-at-its-date.test.js`. Modelling text: `MODEL_ASSUMPTIONS.md` §19.

## 2026-09-25 — Q143. A validator-valid plan fails with TAX_SETTLEMENT_MISMATCH from age 50 (found in passing by the S5AA session, R25)

**Registered 2026-09-26 (UTC−7) by the plan owner**, as for Q138. Not a ChatGPT finding: the S5AA session found it while probing R24F, and it predates R25 (present at `d67b618`).

**The mechanism and witness.** A plan that starts at 29.5, has no salary and a 10% return, and a $200,000 traditional IRA contributing $5,000 a year past 50, ends in `calculation_error` / `TAX_SETTLEMENT_MISMATCH` from age 50. It passes with the IRA contribution at 0, with contributions stopping at 49, or with a 0% return. The engine refuses the plan rather than presenting a wrong figure, but a valid plan cannot be projected. Witness: `audit/S5AA/R25/S5AA_R25_FOUND_IN_PASSING_SETTLEMENT_WITNESS.js` (Run on `main` at `ea8f155` on 2026-09-26: the plan is valid, 0 validator errors, and the run returns `calculation_error` with `TAX_SETTLEMENT_MISMATCH` at age 50.)

**The decision (the owner, 2026-09-25, as reported).** Hand R25 out as it is, and repair this test-first as R26.

**Status: IMPLEMENTED 2026-09-26 by S5AA R26 at `5a928d5` and `0b90445`** (merged as `6d958ce` (#34); source tag `s5aa-r26-source` = `04f0426`, awaiting ChatGPT's change audit). The cause was an IRA contribution with no compensation behind it: the IRA compensation limit is now enforced (`5a928d5`, Q144) and the tax quote and the committed tax read an IRA deduction with one rule (`0b90445`, Q145). *(Updated 2026-09-26 (UTC−7) from the S5AA session's relay; the two commits exist on `main`, the repair itself was not re-run by the plan owner. The line before this update read "OPEN, going to S5AA round R26 (test-first); not repaired. Not in R25's change.")*

## 2026-09-26 — Q144. IRA contributions are limited to the owner's taxable compensation (S5AA R26, the owner, 2026-09-26)

**Registered 2026-09-26 (UTC−7) by the plan owner**, from the S5AA session's relay (`audit/S5AA/R26/S5AA_RELAY_TO_EB_20260926_R26.md`). The owner's answers were given to the S5AA session directly; they are **as reported by that session, not confirmed in the plan owner's chat.** Found in R25's self-audit (SA25-10); see Q143.

**The decision (the owner, 2026-09-26).** "Enforce it": Traditional and Roth IRA contributions together are limited to the owner's taxable compensation (IRS Publication 590-A), with the couple sharing combined compensation on a joint return.

**Status: IMPLEMENTED 2026-09-26 at `5a928d5`** (S5AA R26; merged as `6d958ce` (#34); source tag `s5aa-r26-source` = `04f0426`, awaiting ChatGPT's change audit). It moves 4 of 70 corpus members (`seed:2`, `seed:10`, `seed:14`, `seed:17`; checked by comparing the r16 and r17 baseline files), each of which contributed to a Roth IRA on a $0 salary. Modelling text: `MODEL_ASSUMPTIONS.md` §20. The IRS citation is unchecked (S5AA task 8.6).

**Refined 2026-09-26 (S5AA R28; placed 2026-09-30), on ChatGPT's R26-01 (priority 2; the owner: "Repair").** R26 compared the annual contribution *rate* with the salary rate plus the other income received, and then multiplied what was allowed by the contribution duration, so a wage stream ending inside the year was prorated twice: a $6,000-a-year stream running 40.5 allowed $1,500 of an IRA where its $3,000 allows $3,000. The limit now compares dollars with dollars: the IRA contributions credited in a year are at most the compensation actually earned in it (the salary over the months worked, plus the employment and self-employment income received, less the pre-tax workplace and HSA contributions credited). Implemented at `6938519`. As reported by the S5AA session; the commit and the engine's own comment (`src/engine.js`, the "S5AA R28 (R26-01" block) agree with it. Modelling text: `MODEL_ASSUMPTIONS.md` §20.

## 2026-09-26 — Q145. The tax quote and the committed tax read an IRA deduction with one rule (S5AA R26, the owner, 2026-09-26)

**Registered 2026-09-26 (UTC−7) by the plan owner**, as for Q144.

**The decision (the owner, 2026-09-26).** "Same rule in both", the law's: an IRA deduction larger than ordinary income reduces AGI, and with it the dividends and gains taxed at the preferential rates (IRC 62(a)(7), 1(h)(1)).

**Status: IMPLEMENTED 2026-09-26 at `0b90445`.** No corpus figure moves. Modelling text: `MODEL_ASSUMPTIONS.md` §20.

## 2026-09-26 — Q146. A mid-year transfer moves at most what its source holds on the date (R25-01, the owner, 2026-09-26)

**Registered 2026-09-26 (UTC−7) by the plan owner**, as for Q144. Finding: ChatGPT's R25 change audit (PR #33, NO-GO), R25-01, priority 1: a down-market mid-year transfer left its source negative. Related: Q142.

**The decision (the owner, 2026-09-26).** "Move what's there."

**Status: IMPLEMENTED 2026-09-26 at `5f48505`, with a follow-up at `73e24c7`** (found in R27's self-audit: a transfer's source drawn by the year's withdrawals now ends at zero, not below, the moved dollars' loss being borne by the destination). Merged with R27 (#35, `fd491d6`); source tag `s5aa-r27-source` = `73e24c7`, awaiting ChatGPT's change audit. No corpus figure moves; r17 stands. The remaining case is Q148. Witness `tests/audit-s5aa-r27-transfer-capped-at-date.test.js`. Modelling text: `MODEL_ASSUMPTIONS.md` §20.

**Refined 2026-09-26 (S5AA R28; placed 2026-09-30), on ChatGPT's R27-01 (priority 1; the owner: "Repair").** A mid-year transfer could not move what its source had earned before its date. The transfer's transaction now runs at the source's value on its date, at `56c8847`; the destination is credited on the transfer date, at `227635e` (Q170). The "remaining case" named above, Q148, is closed by `56c8847`.

## 2026-09-26 — Q147. Mortgage PMI is charged only while the mortgage has a balance (R25-02, the owner, 2026-09-26)

**Registered 2026-09-26 (UTC−7) by the plan owner**, as for Q146 (ChatGPT's R25 audit, priority 2: PMI kept being charged after a mid-year payoff). Related: Q139, Q113.

**The decision (the owner, 2026-09-26).** "PMI while owed."

**Status: IMPLEMENTED 2026-09-26 at `7318d89`** (R27). Witness `tests/audit-s5aa-r27-pmi-while-owed.test.js`. Q113 (PMI never cancels at an LTV threshold) is a separate item and stays as recorded there.

## 2026-09-26 — Q148. If the household runs out of money in a transfer's year, an account ends negative (a known gap, the owner, 2026-09-26)

**Registered 2026-09-26 (UTC−7) by the plan owner**, as for Q144. Related: Q146.

**The gap.** When the year's spending empties the household and a mid-year transfer's source lost money before the transfer date, no account is left to bear that loss: an account ends negative (`NEGATIVE_ACCOUNT_BALANCE`), the run reports status ok, and a Monte Carlo run with such a path is refused. Witness: `audit/S5AA/R27/S5AA_R27_KNOWN_GAP_WITNESS.js` (run by the plan owner on `main` at `27a6758`: valid plan, status ok, destination ends at −$2,565.84).

**The decision (the owner, 2026-09-26).** "Keep R27, record the gap." Alternatives offered and not chosen: move the money physically at the engine's withdrawal point, or go back to moving it at the year's opening.

**Status: IMPLEMENTED 2026-09-26 at `56c8847`** (S5AA R28, repairing ChatGPT's R27-01; placed 2026-09-30): the gap no longer holds, so this entry's limit is closed. Checked by the plan owner on 2026-09-30 by running the witness above at each commit of the R28 round and on current `main`: at `6938519` (R28's first commit, which does not touch transfers) the destination still ends at −$2,565.84 with `NEGATIVE_ACCOUNT_BALANCE`; at `56c8847`, `227635e`, `62e263d` and on `main` (`00dbb4b`) the same plan is valid, status ok, no error, and the household ends at 0. Modelling text: `MODEL_ASSUMPTIONS.md` §20.

*Earlier status, kept as history (superseded):* ~~DECIDED 2026-09-26 (the owner, as reported), a known limit, kept and recorded; not repaired.~~

## 2026-09-28 — Q149. A transfer into a 401(k) from a different kind of account is refused (S5AA R29, the owner, 2026-09-28)

**Registered 2026-09-28 (UTC−7) by the plan owner**, from the S5AA session's R29 relay (`audit/S5AA/R29/S5AA_R29_RELAY_TO_EB_20260928.md`). The owner's answer was given to the S5AA session directly; it is **as reported by that session, not confirmed in the plan owner's chat.**

**The decision.** A 401(k) takes payroll, same-character rollovers and conversions only. A transfer into it from a different kind of account is refused.

**Status: IMPLEMENTED 2026-09-28 at `3a02ed1`** (S5AA R29; merged `993f76b`, PR #4; audited source `s5aa-r29.1-source` = `aaff3f1`; ChatGPT's R29 audit, PR #6 `df8f8b4`, is NO-GO but neither of its two findings, R29-01 and R29-02, touches this rule). Witness: `tests/audit-s5aa-r29-transfer-into-workplace-refused.test.js`. Modelling text: `MODEL_ASSUMPTIONS.md` §21.

## 2026-09-28 — Q150. A transfer into an IRA or HSA from a different kind of account is a contribution, held to the year's room (S5AA R29, the owner, 2026-09-28)

**Registered 2026-09-28 (UTC−7) by the plan owner**, as for Q149 (PCF-02, ChatGPT's public-copy migration audit).

**The decision.** Count it against the year's room: the IRA limit and compensation, or the HSA limit. Under the redirect policy only what fits moves and the rest stays in the source; under warn all of it moves, with a warning.

**Status: IMPLEMENTED 2026-09-28 at `7c93220`.** Witness: `tests/audit-s5aa-r29-transfer-as-contribution.test.js`. Modelling text: `MODEL_ASSUMPTIONS.md` §21; `FEATURES.md` line 155 corrected.

## 2026-09-28 — Q151. A traditional IRA into its owner's own HSA is a qualified HSA funding distribution (S5AA R29, the owner, 2026-09-28)

**Registered 2026-09-28 (UTC−7) by the plan owner**, as for Q149.

**The decision.** Tax-free, not deductible, within the HSA room, following the funding rule.

**Status: IMPLEMENTED 2026-09-28 at `c07c01f`; PARTLY REPAIRED, one open finding.** Witness: `tests/audit-s5aa-r29-ira-to-hsa-funding.test.js`. **R29-02 (ChatGPT's R29 audit, priority 1, open):** the funding amount does not yet draw down the IRA's nondeductible basis, per IRS Notice 2008-51 (taxable value first, then basis); leftover basis later shelters deductible money, understating tax. The owner has not yet decided the repair. Modelling text: `MODEL_ASSUMPTIONS.md` §21.

## 2026-09-28 — Q152. Money leaving a taxable account for a non-taxable one realises its gain (found in passing, S5AA R29)

**Registered 2026-09-28 (UTC−7) by the plan owner**, as for Q149. Found while building R29, not a ChatGPT finding.

**The repair.** A transfer out of a taxable account into a non-taxable one is a sale: the moved dollars realise their share of the gain at the account's pro-rata basis.

**Status: IMPLEMENTED 2026-09-28 at `83647e0`.** Witness: `tests/audit-s5aa-r29-transfer-realises-gain.test.js`. Modelling text: `MODEL_ASSUMPTIONS.md` §21.

**R29-01 is repaired, at Q153 below** (S5AA R30, `66c406c`).

## 2026-09-28 — Q153. A transfer's dividends follow the dollars that actually move, and each account pays its own (R29-01, S5AA R30, the owner, 2026-09-28)

**Registered 2026-09-28 (UTC−7) by the plan owner**, from the S5AA session's R30 relay (`audit/S5AA/R30/S5AA_R30_RELAY_TO_EB_20260928.md`). The owner's answers were given to the S5AA session directly; they are **as reported by that session, not confirmed in the plan owner's chat.**

**The finding.** ChatGPT's R29 change audit of `aaff3f1` (priority 1): a late-in-year transfer that the contribution-room cap held to $0, or to less than asked, still removed the requested dollars from the source's dividend base for the rest of the year, understating dividends, income and tax.

**The decision.** Repair: the moved dollars' dividends belong to whichever account holds them, source before the transfer date and destination after. A taxable source that sends everything can send only what its dividends leave.

**Status: IMPLEMENTED 2026-09-28 at `66c406c`** (S5AA R30; merged `3cac133`, PR #7; source tag `s5aa-r30-source` = `66c406c`; sent to ChatGPT for audit). Witness: `tests/audit-s5aa-r30-transfer-dividends-follow-the-move.test.js`. Modelling text: `MODEL_ASSUMPTIONS.md` §21.3.

## 2026-09-28 — Q154. A transfer dated after the year's spending draw pays its destination after the move (found in passing, S5AA R30)

**Registered 2026-09-28 (UTC−7) by the plan owner**, as for Q153. Found beside R29-01, not a separate ChatGPT finding.

**The decision.** Repair: such a transfer's destination is credited after the move, on what moved; that cash comes after the year's spending draw, so it is kept or spent under the dividends policy.

**Status: IMPLEMENTED 2026-09-28 at `66c406c`.** Witness: `tests/audit-s5aa-r30-transfer-dividends-follow-the-move.test.js`. Modelling text: `MODEL_ASSUMPTIONS.md` §21.3.

## 2026-09-28 — Q155. A late transfer out of a dividend-paying taxable account is protected from the year's spending draw, only for that case (S5AA R30, the owner, 2026-09-28)

**Registered 2026-09-28 (UTC−7) by the plan owner**, as for Q153. A separate decision, on the case R29-01's preview could not see: the year's own spending draw taking the source first. *(Corrected 2026-09-28: this line first called Q155 a "mirror of Q154". It is not — Q154's case is an early transfer that empties a taxable account into an IRA, Roth or HSA, where the destination used to pay the source's pre-date dividends, and that case is Q153's, not a fourth entry. Found by the S5AA session.)*

**The decision.** For a transfer dated after the year's spending draw, out of a dividend-paying taxable account, the draw leaves the transfer's dollars in the source. The owner confirmed 2026-09-28 that this protection applies only to that case — a dividend-paying taxable source — not to every late transfer or every taxable account.

**Status: IMPLEMENTED 2026-09-28 at `66c406c`.** Witness: `tests/audit-s5aa-r30-transfer-dividends-follow-the-move.test.js`. **Known limit, kept:** a late destination's dividend cash does not fund that year's spending. Modelling text: `MODEL_ASSUMPTIONS.md` §21.3.

## 2026-09-28 — Q156. A pre-tax distribution counts toward the year's required minimum distribution whatever it lands in, including into an HSA (an unnumbered ChatGPT R29 finding, S5AA R30, the owner, 2026-09-28)

**Registered 2026-09-28 (UTC−7) by the plan owner**, as for Q153. Includes R29-02's basis repair.

**The finding.** ChatGPT's R29 audit raised, unnumbered, that a pre-tax transfer into an HSA did not count toward the year's required distribution. The owner's decision: research first, then repair. The research found that every pre-tax distribution counts, whatever it lands in.

**The decisions.**
- A pre-tax distribution counts toward the year's RMD whatever it lands in: a taxable account, or an HSA (either a distribution then a contribution, or a qualified HSA funding distribution). A rollover or a conversion does not count. A transfer dated after the year's spending draw counts neither way, since the draw already paid the year's requirement. (26 CFR 1.408-8(g)(1).)
- **R29-02, repair:** a qualified HSA funding distribution comes out of the IRA's taxable value first, and only the rest draws down its nondeductible basis, dollar for dollar (IRC 408(d)(9)(E); Notice 2008-51).

**Status: IMPLEMENTED 2026-09-28 at `c9f6556`** (the RMD credit) **and `bf4d3d8`** (R29-02, the basis rule). Witnesses: `tests/audit-s5aa-r30-transfer-to-hsa-counts-toward-rmd.test.js`, `tests/audit-s5aa-r30-hsa-funding-uses-ira-basis.test.js`. The "funding distribution's credit toward an RMD" line in `MODEL_ASSUMPTIONS.md` §21's not-modelled list is removed; both are now modelled. Modelling text: `MODEL_ASSUMPTIONS.md` §21.1 and §21.2.

## 2026-09-28 — Q157. A qualified HSA funding distribution's basis is measured on the funding's date, not year-end (R30-01, S5AA R31, the owner, 2026-09-28)

**Registered 2026-09-28 (UTC−7) by the plan owner**, from the S5AA session's R31 relay (`audit/S5AA/R31/S5AA_R31_RELAY_TO_EB_20260928.md`). The owner's answer was given to the S5AA session directly; it is **as reported by that session, not confirmed in the plan owner's chat.** Extends Q156's R29-02 basis rule.

**The finding.** ChatGPT's R30 change audit of `66c406c` (priority 1): the year-end settlement measured a qualified HSA funding distribution's basis from the December 31 value, so growth after the funding brought back basis the funding had already used (understating tax), and a loss did the opposite.

**The decision.** "Repair in R31": the taxable value the funding takes first is measured on the funding's date — the owner's IRAs then, plus what the year had already distributed or converted, less the year's basis. Later growth or loss does not change the basis the funding used (Notice 2008-51 reads the basis "immediately after" the funding). The year's ordinary draws and conversions are still settled pro rata at the year's end, on the basis the funding left.

**Status: IMPLEMENTED 2026-09-28 at `8afe16d`** (S5AA R31; merged `35c8d9a`, PR #11; source tag `s5aa-r31-source` = `8afe16d`; sent to ChatGPT for audit). Witnesses: `tests/audit-s5aa-r31-hsa-funding-basis-at-the-funding-date.test.js`, `tests/audit-s5aa-r31-hsa-funding-settlement-dated.test.js`. **Known limit, kept:** the funding's taxable value counts the whole year's nondeductible contributions as basis, wherever in the year they fall, as the settlement already does for conversions. Modelling text: `MODEL_ASSUMPTIONS.md` §21.2.

## 2026-09-29 — Q158. A surviving spouse gets the deceased's FRA benefit plus earned delayed credits, reduced for the survivor's age (SA32F-02, the owner, 2026-09-29)

**Registered 2026-09-29 (UTC−7) by the plan owner**, from the S5AA session's R32F relay (committed with the next S5AA records commit as `audit/S5AA/R32/S5AA_R32F_RELAY_TO_EB_20260929.md`). The owner's answer was given to the S5AA session directly, and is recorded in the R32F report's §4 (merged by the owner, PR #17, `b5424ff`); it is not confirmed in the plan owner's chat. Finding: Claude's full-model audit at the R32 source (SA32F-02, `audit/S5AA/R32/SA32F/`).

**The decision.** "Pay by law": when someone dies before claiming Social Security, the surviving spouse gets the deceased's FRA benefit plus the delayed credits earned before death, reduced for the survivor's own age (42 USC 402(e)). This reverses R2-003(b)'s "posthumous claim" removal, which is Q3a's context. **Q3a and Q3b are superseded by law** (42 USC 402(e)(1); 20 CFR 404.335): Q3a's "no claim established" reading is wrong — the survivor benefit rests on the deceased's PIA and earned delayed credits whether or not they filed; Q3b's "survivor-side claim-age gate stays" is replaced below.

**Amended 2026-09-29 (S5AA R34, the owner: "Start at 60 or the death").** The survivor benefit is paid from the later of age 60 and the death, reduced for that age; the recipient's own-claim-age gate (Q3b, above) is dropped.

**Status: IMPLEMENTED 2026-09-29 at `7b61b88`** (S5AA R34; source tag `s5aa-r34-source` = `7b61b88`).

## 2026-09-29 — Q159. A spousal Social Security benefit, up to half the worker's FRA amount, is built (SA32F-03, the owner, 2026-09-29)

**Registered 2026-09-29 (UTC−7) by the plan owner**, as for Q158.

**The decision.** "Build it": up to half the worker's FRA benefit, with the spousal reduction and no delayed credits. It cannot start before the worker files (20 CFR 404.333, 404.410).

**Status: IMPLEMENTED 2026-09-29 at `7b61b88`** (S5AA R34).

## 2026-09-29 — Q160. The entered Social Security benefit is in today's dollars, and grows at the COLA field to claim (SA32F-04, the owner, 2026-09-29)

**Registered 2026-09-29 (UTC−7) by the plan owner**, as for Q158.

**The decision.** "Today's dollars": the entered figure grows at the COLA assumption from the plan's start to the claim. The earnings-based path takes COLAs from age 62 (20 CFR 404.271). The input field is relabelled to say so.

**Status: IMPLEMENTED 2026-09-29 at `7b61b88`** (S5AA R34).

## 2026-09-29 — Q161. A decedent's sole taxable account steps up in full at death; a joint account steps up half (SA32F-17, the owner, 2026-09-29)

**Registered 2026-09-29 (UTC−7) by the plan owner**, as for Q158. Corrects §18.1's stated reason for no step-up, which covered only joint accounts.

**The decision.** "Own full, joint half": a decedent's own taxable accounts are fully stepped up (IRC 1014(a)); joint accounts step up half. A disclosure notes Arizona community property (1014(b)(6)) can step up more.

**Refined 2026-09-29 on ChatGPT's R32V §5 (the owner: "a loss also resets"):** the decedent's share takes its date-of-death value as basis whether that is above or below its cost, so the reset can be a step-down as well as a step-up. Own accounts reset in full; joint accounts reset half.

**Status: IMPLEMENTED 2026-09-29 at `beb246a`** (S5AA R35). §18.1's reason for no step-up is corrected in `MODEL_ASSUMPTIONS.md` §18.1 itself.

## 2026-09-29 — Q162. Three contribution conventions: each owner's own age, a 6-year vesting ramp, and a spousal IRA while jointly filed past retirement (SA32F-12, -13, -15, the owner, 2026-09-29)

**Registered 2026-09-29 (UTC−7) by the plan owner**, as for Q158.

**The decisions.**
- **5a (SA32F-12).** "Each owner's own": a spouse's contribution stop age is that owner's own age, not the primary person's.
- **5b (SA32F-13).** "Vest over 6 years": the entered vested percentage rises to 100% within 6 years (IRC 411(a)(2)(B)); only what remains unvested at retirement is lost.
- **5c (SA32F-15).** "Allow while joint pay": a spousal IRA is allowed after the non-working spouse's retirement age while the joint return has compensation (219(c); 219(d)(1) is repealed).

**Status: IMPLEMENTED 2026-09-29.** 5a and 5c at `5d85480` (S5AA R33); 5b at `26ef26d` (S5AA R35).

## 2026-09-29 — Q163. Fixed-nominal spending entered "in today's dollars" inflates to the retirement date, then holds flat (SA32F-36, the owner, 2026-09-29)

**Registered 2026-09-29 (UTC−7) by the plan owner**, as for Q158.

**The decision.** "Inflate to retirement": with a later retirement, the entered fixed-nominal spending figure is inflated forward to the retirement date and then held flat from there.

**Status: IMPLEMENTED 2026-09-29 at `f9f37a8`** (S5AA R35).

## 2026-09-29 — Q164. "Expected annual return" keeps its arithmetic-mean meaning, disclosed as such (SA32F-42, the owner, 2026-09-29)

**Registered 2026-09-29 (UTC−7) by the plan owner**, as for Q158.

**The decision.** "Keep average, disclose": Monte Carlo keeps "Expected annual return" as the arithmetic mean. A disclosure states that simple mode shows the average path, not the typical (median) one.

**Status: IMPLEMENTED 2026-09-29 at `890ff72`** (S5AA R37).

## 2026-09-29 — Q165. Tax law after 2026: price-linked amounts index at the plan's inflation, disclosed as a model assumption; statutory-fixed amounts stay fixed (SA32F-D1, the owner, 2026-09-29)

**Registered 2026-09-29 (UTC−7) by the plan owner**, as for Q158.

**The decision.** "Index, own round": amounts that are price-linked by law are indexed at the plan's own inflation assumption and labelled a model assumption; amounts fixed by statute stay fixed. Built in a round of its own.

**Refined 2026-09-29 on ChatGPT's R32V §5 (the owner: "Keep it even after 2028"):** the senior deduction continues after 2028 as a model assumption, continuing Q46, though IRC 151(d)(5)(C) ends it for tax years beginning after 2028; its $6,000 amount and $75,000/$150,000 thresholds stay fixed. The engine has no calendar year, so it never stopped applying the deduction; this decision makes that the deliberate choice rather than an omission.

**Status: IMPLEMENTED 2026-09-29 at `cf643a8`** (S5AA R36; source tag `s5aa-r36-source` = `cf643a8`).

## 2026-09-29 — Q166. IRA deduction rounding, spouse contribution stop age, and Arizona's age-65 exemption timing (S5AA R33, the owner, 2026-09-29)

**Registered 2026-09-29 (UTC−7) by the plan owner**, from the S5AA session's R33 relay (`audit/S5AA/R33/S5AA_R33_RELAY_TO_EB_20260929.md`). The owner's answers were given to the S5AA session directly; they are as reported by that session, not confirmed in the plan owner's chat.

**The decisions.**
- (a) Apply the IRA deduction's $10 rounding (IRC 219(g)(2)(B)–(C)): "yes".
- (b) A spouse's future contribution changes on the spouse's own age, not the primary person's: "Yes".
- (c) Arizona's age-65 exemption reads the age reached by the row's close (year-end age): "Yes".
- **Overnight instruction: "Follow law everywhere"** — where the law gives a rule, build it rather than disclose a gap. This governs R33 through R38.

**Status: IMPLEMENTED 2026-09-29 at `f4e8294`** (S5AA R33; source tag `s5aa-r33-source` = `f4e8294`). Modelling text: `MODEL_ASSUMPTIONS.md` §23 (IRA deduction, contributions, tax rules).

## 2026-09-29 — Q167. Default filing status, HSA age-65 exception, joint-account salary base, the 1959 card, and Monte Carlo shortfall guidance (R37's five open items, the owner, 2026-09-29)

**Registered 2026-09-29 (UTC−7) by the plan owner**, from the S5AA session's R37 and R38 relays. Claude's R32F audit left these as its own choices or as questions for the owner, not decided. The owner's answer, given to the S5AA session directly, was "go with your recommendations" — adopting Claude's reading on all five. As reported by that session, not confirmed in the plan owner's chat.

**The decisions.**
1. **The default plan now files single**, not joint with no spouse — the joint-with-no-spouse default made every untouched plan show the filing-mismatch warning. Linking the default to the spouse switch is possible later as a convenience.
2. **The HSA's age-65 exception to the 20% additional tax follows Q137's opening-age convention**: a year that opens before 65 and ends after has its whole non-qualified draw charged the 20%. The 59½ and 65 conventions are to be decided together at the engine rebuild.
3. **A joint account's percent of salary reads the household's salary** — the owner's plus the spouse's, counted only when a spouse is included and working.
4. **The 1959 RMD proposed-rule card stays visible**, for both spouses.
5. **Monte Carlo guidance keeps withholding the shortfall dollar amount and the spending-cut percentage** in the current engine. Figures from the failing paths (not just the median row) are a wanted feature for the engine rebuild — see `FEATURES.md`, "Features — wanted".

**Status: decisions 2–5 IMPLEMENTED 2026-09-29 at `890ff72` and `503db3c`** (S5AA R37); **decision 1 IMPLEMENTED 2026-09-29 at `678c556`** (S5AA R38; the test corpus keeps the joint return it was written on, so no corpus figure moves). Decision 2 additionally at `e7fabeb` (test `audit-s5aa-r37-hsa-65-opening-age.test.js`); decision 3 at `05f35fa`. Modelling text: `MODEL_ASSUMPTIONS.md` §18.3, §24 and §26.

## 2026-09-29 — Q168. A Roth match with vesting 100 and no years of service is taxed as Roth, then mostly forfeited (found by S5AA R38, the owner, 2026-09-29)

**Registered 2026-09-29 (UTC−7) by the plan owner**, from the S5AA session's R38 relay.

**The question.** With `vesting` at 100 and `yearsOfService` at 0, an elected Roth match is taxed as Roth (immediately, at contribution) and then mostly forfeited at separation — the two inputs disagree about what actually happens to the money. The rule: IRS Notice 2024-2, Q&A L-3 (IRS PDF, page 72), backed by IRC 402A(f)(3) — a match "may be designated as a Roth contribution only if the employee is fully vested in matching contributions at the time the contribution is allocated to the employee's account." ChatGPT's R38 audit (#27, merged) raised the same rule from the other direction as R38-03: someone who becomes fully vested mid-plan keeps a pre-tax match, because the engine checks only the entered `vesting === 100`. The `vesting` 100 / `yearsOfService` 0 case above is a second symptom of that same check.

**Status: IMPLEMENTED 2026-09-29 at `252faba`** (S5AA R39, repairing ChatGPT's R38-03). An elected match is Roth only when the employee is fully vested at allocation, by the same vested share that decides forfeiture. Modelling text: `MODEL_ASSUMPTIONS.md` §24.

## 2026-09-29 — Q169. Part-year contribution limits, an inherited workplace plan's employer flag, and the QCD's opening-age convention (S5AA R39, the owner, 2026-09-29)

**Registered 2026-09-29 (UTC−7) by the plan owner**, from the S5AA session's R39 relay (`audit/S5AA/R39/S5AA_R39_RELAY_TO_EB_20260929.md`). R39 repairs ChatGPT's R38-01, R38-02, R38-04 and R38-05, and declares the QCD's opening-age convention. The owner's instruction was "start R39, go with your recommendations" (2026-09-29).

**The decisions.**
- (a) **Annual contribution limits hold the dollars deposited in the tax year**, not a rate cut by part-year work (repairing R38-01): a plan year that is itself part of a tax year keeps the limit for that share of the year. The HSA limit stays prorated by the months of the contribution window.
- (b) **A workplace plan that passes to a surviving spouse is not the survivor's current employer's plan** (repairing R38-05): the still-working exception to required distributions does not follow an inherited plan, including where the current-employer flag was only inferred from the contribution field.
- (c) **The QCD keeps the opening-age convention, declared on the form**: a QCD is available from the first projection year that starts at 70½ or older (the plan records no gift date, so eligibility is read at the row's start, the same convention as 59½ and R37's HSA 65). To be decided with those two at the engine rebuild.

**Status: IMPLEMENTED 2026-09-29** (S5AA R39). (a) at `8a51aaf` (R38-01); the Rule of 55's separation-age repair (not itself a new decision — R38-02, "separation at 55 or later" rather than only the calendar-year reading) at `4995761`; (b) at `85fe621` (R38-05); Social Security's claim-inside-a-year COLA repair (R38-04, likewise not itself a new decision) at `f6dbb2a`; (c) declared at `f7ea076`. Modelling text: `MODEL_ASSUMPTIONS.md` §4/§22, §18.3, §23.

**Amended 2026-09-30 (S5AA R39.1, repairing ChatGPT's R39-01):** the R38-04 COLA repair above narrows to living claimants. A claim planned for after the claimant's death no longer prices the PIA at the claim, so it cannot move the survivor's benefit. Landed at `a2ee714`.

## 2026-09-26 — Q170. A transfer's destination is credited on the transfer date; dividends and the imputed yield on the moved dollars follow them; a transfer dated after the year's draw runs after it (R27F-01, R27F-02, S5AA R28.1, the owner, 2026-09-26)

**Registered 2026-09-30 (UTC−7) by the plan owner**, late: from the S5AA session's R28 relay (`audit/S5AA/R28/S5AA_RELAY_TO_EB_20260926_R28.md`, in the private archive), written 2026-09-26 and not placed before the repository moved. It is numbered after Q169 for that reason and dated by the decisions it records. The owner's answers were given to the S5AA session directly; they are **as reported by that session, not confirmed in the plan owner's chat.** Related: Q146, Q148, and Q154 (R30), which covers the dividends on a transfer dated after the draw.

**The findings.** ChatGPT's R27F full-model audit of R27, priority 1 each: **R27F-01**, the destination's zero floor erased an owed growth correction, so money was created and a shortfall hidden; **R27F-02**, a taxable destination was paid dividends before the money arrived. R28.1's own self-audit added a transfer dated after the year's spending draw, which ran before the draw and so spent dollars that had not yet arrived, and the imputed 1.5% yield on moved dollars, which needed the same treatment as R27F-02.

**The decisions (the owner, 2026-09-26).** R27F-01: "Repair". R27F-02: "Repair". A transfer dated after the year's draw: "Repair in R28.1". Where the repairs go: "Add to R28 as R28.1", so the next audit covers the R28 change only.

**Status: IMPLEMENTED 2026-09-26** (S5AA R28.1; source tag `s5aa-r28.1-source` = `62e263d`). R27F-01 at `227635e`; R27F-02 at `5a5cb39`; a transfer dated after the draw at `c480f72`; the imputed yield at `62e263d`. The relay reports that no corpus figure moves (r17 stands); the plan owner did not re-check that. The commits are in the repository's first commit (it contains `ee9757d`), not in its own history. **No change audit of R28 or R28.1 was ever returned** (the R40 handover says so); ChatGPT's later full-model PCF audit of the same engine found PCF-03, a gap in R28's dividend repair, which R29 then repaired. Modelling text: `MODEL_ASSUMPTIONS.md` §20.

## 2026-09-28 — Q171. A traditional IRA rolls only its taxable money into a 401(k); a Roth IRA cannot roll into a 401(k); a rollover stays with its owner; the IRA pool counts every IRA; a catch-up reads the year-end age (R30A-01, R30A-02, R30A-03, R31-01, S5AA R32, the owner, 2026-09-28)

**Registered 2026-09-30 (UTC−7) by the plan owner**, late: from the S5AA session's R32 relay (`audit/S5AA/R32/S5AA_R32_RELAY_TO_EB_20260928.md`), which was not placed before now (the R32F relay of the next day was). The entry is numbered after Q170 for that reason and dated by the decisions it records. The owner's answers were given to the S5AA session directly; they are **as reported by that session, not confirmed in the plan owner's chat.** Related: Q149 to Q152 (R29), Q157 (R31).

**The findings.** ChatGPT's R30A account and transfer audit (priority in brackets): **R30A-01** (1), an IRA's after-tax money rolled into a 401(k) as pre-tax; **R30A-02** (2), a Roth IRA rolled into a Roth 401(k); **R30A-03** (2), a rollover between two living owners. It also raised the catch-up age convention. ChatGPT's R31 change audit: **R31-01** (1), the HSA-funding pool dated only the sending IRA.

**The decisions (the owner, 2026-09-28).** R30A-01: "Move taxable part only". R30A-02: "Refuse it". R30A-03: "Refuse it". R31-01: "Repair in R32". The catch-up age: "Use the year-end age".

**Status: IMPLEMENTED 2026-09-28** (S5AA R32; source tag `s5aa-r32-source` = `3017351`). R30A-01 and R31-01 at `8ef84d3`; R30A-02 and R30A-03 at `0413792`; the catch-up age at `3017351`. Witnesses: `tests/audit-s5aa-r32-ira-pool-at-the-transfer-date.test.js`, `tests/audit-s5aa-r32-rollovers-stay-with-the-owner.test.js`, `tests/audit-s5aa-r32-catch-up-age-at-year-end.test.js`. The relay reports that the catch-up age moves corpus members `seed:10`, `seed:11` and `seed:20`, declared; the plan owner did not re-check that. **Known limit:** a rollover into a 401(k) measures the IRA's basis as it stands on the date, without that year's nondeductible contributions. ChatGPT's R32 change audit accepted the repair with carried limits and no new findings. Modelling text: `MODEL_ASSUMPTIONS.md` §21, §23.

## 2026-09-30 — Q172. Close the exit-gate gaps first; amendment A-10; four undisclosed limits repaired; the partial-row tax reverted and disclosed; the audit's other fixes (S5AA R40, the owner, 2026-09-30)

**Registered 2026-09-30 (UTC−7) by the plan owner**, from the S5AA session's R40 relay (`audit/S5AA/R40/S5AA_R40_RELAY_TO_EB_20260930.md`). After the merge the S5AA session corrected three commit citations in that relay, and this entry uses the corrected ones: `9fd61c2` and `c300508`, where the relay named `2881ceb` and `434f19c`, the first forms of two commits amended before they were pushed. The owner's answers were given to the S5AA session directly; they are **as reported by that session, not confirmed in the plan owner's chat.**

**The context.** The owner asked for a GO/NO-GO handover for ChatGPT. Claude's check of the exit gate found gaps that R29 to R39.1 had left open, and the owner decided to close them first. The owner then asked for an audit of the pull request before merge ("you do a audit on #35 before we merge"); three independent reviews found a priority-1 problem in two of the four repairs.

**The decisions (the owner, 2026-09-30).**
- (a) **"Close gaps first":** a round of its own, R40, before the handover. It registers a baseline (r18 and on), records the R29 to R37 codes in `RESULT_CONTRACT.md`, reads R36's card as it renders, updates the conservation grid, and writes the combined unrepaired list.
- (b) **Amendment A-10** (in `S5AA_TASK_CHECKLIST.md`): for R29 to R39.1 the traced-and-declared control record stands in for E10's predicted-versus-actual record, disclosed as not a prediction. From R40 on, A-01 applies as written.
- (c) **"Repair all four now":** the long-term-care cost grows at healthcare inflation and its insurance benefit stays as entered (`8f20d90`); each person on Medicare pays the Part D base premium (`d1572b1`); an RMD reads the age reached in the row by the engine's own birth year (`d51d30d`, corrected at `3fbe9dc`); and the partial-row tax (`607101a`), which (d) then reverted.
- (d) **"Revert and disclose" the partial-row tax** (`b97fe0a`). Taxing a partial row as its share of a year annualizes one-time amounts too: a $100,000 expense in a row a tenth of a year long was taxed $56,958 against $20,221.85. The whole-year treatment stays, disclosed. A rule that tells recurring income from one-time items goes to the engine rebuild.
- (e) **"All of them",** for the audit's other fixes: the validator and the engine agree on malformed debt reset terms (`7cd1a1a`); healthcare inflation is validated (`c300508`); the app states the Part D premium and the care cost's growth (`9fd61c2`).
- (f) **A planning fact, not a model decision:** "The UI will be rebuilt. but we can use the old ui as a reference." Engine disclosures the current app does not render stay an explicit exception (the R40 handover's E14 row).

**Status: IMPLEMENTED 2026-09-30 (S5AA R40; merged as #35 at `54d6a9e`; source tag `s5aa-r40.1-source` = `978a6e4`), except the partial-row tax, which was reverted and is a disclosed limit.** Checked by the plan owner: the commits are on `main`, each repair has a test under `tests/audit-s5aa-r40-*.test.js`, the engine and validator text matches the modelling text, and the $38.99 Part D figure was re-read at CMS. Not re-checked: the corpus and baseline movement (r18 to r20) the relay reports. The combined unrepaired list is `audit/S5AA/R40/S5AA_R40_UNREPAIRED_LIST_20260930.md`. ChatGPT's R40 audit had not been merged when this was written. Modelling text: `MODEL_ASSUMPTIONS.md` §18.3, §18.4, §25, §26.

**Update 2026-09-30, later the same day:** ChatGPT's R40.1 change audit and status determination (PR #36, merged `6688403`) found no new R40-NN source finding in the cases checked and determined S5AA NO-GO at `978a6e4`, because exit-gate line E15 is unmet: the task 6.5 comparison of the main thread against an actual Worker in a desktop browser, with an exception and a raw export, has not been run on the final source. The R40 repairs above are not reversed by it.

**Update 2026-09-30, evening:** R41 (PR #38, merged `020c6f3`) ran task 6.5 and brought the evidence back, and repaired the one defect it found; see Q173. ChatGPT has not yet determined E15 on that evidence.

## 2026-09-30 — Q173. Run task 6.5 for E15; an end age before the starting age is refused (S5AA R41, the owner, 2026-09-30)

**Registered 2026-09-30 (UTC−7), that evening, by the plan owner**, from the S5AA session's R41 relay (`audit/S5AA/R41/S5AA_R41_RELAY_TO_EB_20260930.md`). The decisions were made on 2026-09-30 (Arizona); the round merged as PR #38 at `020c6f3` the same evening, 6:05 pm. The relay's claims were read against `main` before this entry was written: the repair, the validator rule, the witness test and the evidence document are in the merged commits, and the gate figures below come from the evidence document's own table.

**The context.** ChatGPT's R40.1 audit (PR #36) determined S5AA NO-GO on exit-gate line E15 alone: task 6.5, the desktop-browser comparison of the main thread against an actual Worker, with an exception and a raw export, had not run on the final source (Q172). Its handover asked Claude and the owner to arrange and record it and bring SHA-bound evidence back.

- (a) **"Go with your recommendations": run task 6.5.** Done. It ran on `978a6e4` (the source ChatGPT audited) and, in full, on the final candidate `s5aa-r41-source` = `984197c` (built artifact SHA-256 `7e2e5aaf…43f8`), in the Claude app's built-in Chromium 152 on Windows 11. The Worker and the main thread agree on all 75 plans (the 71-plan expanded corpus, three refusals and one edge). The projection CSV is byte-identical between the two paths on the 70 plans the app's import accepts. The exception paths behave as designed: a throwing Worker and a Worker that fails to load each fall back to the main thread with an identical CSV, and when both paths throw the results page shows the calculation-error card and the CSV is refused. Compare mode ran four concurrent Workers. Three Monte Carlo plans differ from Node by at most 1.83 × 10⁻¹⁵ relative, from `Math.log`, `Math.cos` and `Math.exp` rounding, never between the Worker and the main thread. Evidence: `audit/S5AA/R41/S5AA_R41_E15_BROWSER_EVIDENCE_20260930.md`.
- (b) **"Repair now": an end age before the starting age is refused.** The check found that a backup whose end age is before its starting age was restored with one warning and projected backwards (ages 29.5, then 28.5). The form cannot produce it, since it raises the end age to at least the retirement age and the retirement age to at least the starting age. The engine now refuses it as `SCENARIO_END_AGE_BEFORE_START`, with no rows. The validator reports `END_AGE_BEFORE_START` as an error, so "Restore backup" refuses it. An end age equal to the starting age is still projected, as one row. Predicted in `03d6ed4`, repaired in `984197c`. Witness: `tests/audit-s5aa-r41-end-age-before-start-refused.test.js` (six cases; before the repair its three refusal cases failed and its three controls passed). No corpus figure moves: control 4.7 has no unpredicted member and the expanded capture equals r20.

**Status: IMPLEMENTED 2026-09-30 (S5AA R41; merged as #38 at `020c6f3`; source tag `s5aa-r41-source` = `984197c`): (a) task 6.5 ran, (b) the end-age refusal is built.** The gate at `984197c` and at the records commit `ffb7d1c`: 3,152 tests, 0 failing, 9 todo; closeout accepted 12, refused 0. **ChatGPT has not determined E15 on this evidence.** The run ChatGPT's R40.1 handover asked for now exists, and the determination is ChatGPT's (WORKING_RULES §1 and §7) and S5AA stays NO-GO and not closed until it reports.

**Disclosed limits.** One browser (the Chrome extension was not connected), and the check is not the post-S6 phone campaign. The self-audit also observed three things and did not repair them: the error card's "reconciliation problem" wording on an engine throw (for the UI rebuild); an end age equal to the start projecting one row; and two known corpus fixtures the import refuses (`seed:9` by R29's design, and `targeted:spouse-cola-income`, Q29).

**A correction to Q172's source.** The R40 relay's three wrong commit citations are also recorded in the R41 evidence document, §7; Q172 already carries the corrected commits. Modelling text: `MODEL_ASSUMPTIONS.md` §26.

**Update 2026-09-30, later that evening:** ChatGPT's R41 change audit and status determination (PR #40, merged `70766a8`) found no new R41-NN finding, accepted the repair, found E15 met on the task 6.5 record under the archive close record's revised second-machine condition (one Chromium build; ChatGPT did not rerun the browser itself), and **determined S5AA GO at `984197c` under amendments A-01 to A-10**. The GO is administrative. Closing the milestone, setting `s5aa-closed` and starting S5b are the owner's, and none has been decided.

**Update 2026-09-30, the same evening (8:15 pm):** ChatGPT's R41F whole-model audit (PR #42, merged `dedcb7d`) of the same source (`984197c`) **superseded this GO for status purposes with a NO-GO**, on five findings the R41 audit had not looked for; see Q174. The R41 browser record for E15 and A-09's exceptions stand. S5AA later reached GO again at R44.1 (Q181).

## 2026-09-30 — Q174. Repair all five whole-model findings in R42 (ChatGPT's R41F audit, the owner, 2026-09-30)

**Registered 2026-10-02 (UTC−7) by the plan owner**, from the S5AA session's R42 relay (`audit/S5AA/R42/S5AA_R42_RELAY_TO_EB_20260930.md`). Late-placed: R42's decisions were made on 2026-09-30 and the round merged that evening as PR #43 (`0537493`, 8:22 pm), so this entry is dated by its decisions. The relay's claims were read against the merged reports, commits and tests before this entry was written.

**The context.** ChatGPT's R41F whole-model audit (PR #42, merged `dedcb7d`, 8:15 pm on 2026-09-30) audited the unchanged R41 source (`984197c`) and **determined NO-GO**, with five new reproducible findings. It said this supersedes the R41 GO for status purposes: the R41 GO had covered only the R41 change and E15. E15's browser record and the A-09 exceptions stand. Claude reproduced all five and read the two Social Security rules at SSA's POMS.

**The decision (the owner, 2026-09-30): "Repair all five in R42".**
- **R41F-01 (P1).** A worker's earnings-test excess is charged against the benefits on the worker's record, the worker's own and the spouse's spousal benefit, in whole months (POMS RS 02501.095). Before, the spousal benefit was still paid: $18,000 a year too much income in the witness.
- **R41F-02 (P2).** A survivor's 82.5% limit reads the deceased's reduced benefit with the months the earnings test withheld while the deceased was alive, effective from the deceased's (would-be) full retirement age (RS 00615.320, RS 00615.598). Before, the survivor got $6,300 a year too little in the witness.
- **R41F-03 (P2).** On a joint return, an IRA owner's contribution window is the longer of the owner's own work and the spouse's. This completes Q162 5c. Before, an owner who stopped halfway through a row the spouse worked in full got half a year ($3,750 less in the witness).
- **R41F-04 (P2).** The Roth IRA limit's salary-only MAGI proxy reads each salary at its share actually worked in the row. It confirms and repairs the suspicion the R40 unrepaired list named ("the Roth MAGI proxy's partial row").
- **R41F-05 (P2).** A Social Security benefit (`ssBenefit`, `spouseSS`) that is present and not a number is refused: the validator reports `WRONG_TYPE` and the engine refuses it with `SCENARIO_NONNUMBER_PLAN_VALUE`. Before, it ran as a zero benefit with no error.

**Status: IMPLEMENTED 2026-09-30 (S5AA R42; merged as #43 at `0537493`; source tag `s5aa-r42-source` = `c67c713`).** ChatGPT's independent replay of the five witnesses at R42 reproduced the predicted figures; its R42 audit nevertheless found a new regression in the R41F-01 repair (R42-01, Q175). Modelling text: `MODEL_ASSUMPTIONS.md` §20, §22, §23 and §26.

## 2026-09-30 — Q175. R42's audit, Claude's own R42F audit, and what R43 repairs (S5AA R43, the owner, 2026-09-30)

**Registered 2026-10-02 (UTC−7) by the plan owner**, from the S5AA session's R43 relay (`audit/S5AA/R43/S5AA_R43_RELAY_TO_EB_20261001.md`), read against `main`. Dated by its decisions. R43 merged as PR #46 at `247635c` (12:21 am on 2026-10-01).

**The context.** Two reports merged at 9:41 pm on 2026-09-30:
- **ChatGPT's R42 change audit** (PR #44, merged `054fd73`) determined **NO-GO** at `c67c713` on two findings. **R42-01 (P2):** a staggered spousal claim averaged the worker's credited withholding months over the row, so one month too few was credited and the worker's benefit after full retirement age was $144 a year too low in the witness. **R42-02:** R42's pre-edit prediction ("no corpus plan moves") missed `seed:20`, whose 313 control differences were declared only after the edit; under A-01 (A-10 relaxed it only for R29 to R39.1) an after-the-fact declaration does not make the prediction correct.
- **Claude's R42F full-model audit** (PR #45, merged `7d5340d`): 34 findings, SA42F-01 to SA42F-34 (2 P1, 19 P2, 13 P3), from eight area audits to one written standard. The two P1s: no IRC 199A deduction on self-employment profit, and a half-year Social Security claim permanently losing one COLA. SA42F-16 is R42's own Roth repair missing its one-time mirror.

**The decisions (the owner, 2026-09-30):**
- **R42-01:** repair it.
- **R42-02:** accept it as a disclosed miss (for R42 only).
- **R42F:** repair all 34 in one round, R43, together with R42's local one-time Roth fix (SA42F-16). ChatGPT reviews the R42F findings and audits their repairs in one report (no separate R42V report). A finding it refutes has its repair reverted in a later round if the owner agrees.
- **Three declared items change** (Q176, Q177, Q178 below).
- **Three choices on how findings are repaired:** SA42F-20 uses today's dollars in every growth mode; SA42F-11 charges Medicare to each person 65 or over; survivor costs start at the death unless the surviving spouse has a salary.

**Status: IMPLEMENTED 2026-10-01 (S5AA R43; merged as #46 at `247635c`; source tag `s5aa-r43-source` = `5b8f0d5`), except R42-02, which is an accepted disclosed miss.** All 34 R42F findings and R42-01 are repaired. A new expanded baseline, **r22**, is registered (19 movements from r21), and S5b task 4 builds on it in place of r21; its input hash also moves, because the Monte Carlo band member was re-chosen by its rule under the new seeds. Every Monte Carlo figure moved once (the per-path seed mix, `MODEL_ASSUMPTIONS.md` §18.6). The R40 unrepaired list's "Medicare coverage is not modelled" item, as it applied to HSA contributions past 65, is closed by Q177. The R43 prediction records are dated 2026-10-01 but were written on 2026-09-30 between 9:58 and 11:37 pm Arizona (SA43-J); the commit timestamps are authoritative. Modelling text: `MODEL_ASSUMPTIONS.md` §18.1, §18.6, §19, §20, §22, §23, §25 and §26; the full list of repairs is in the R43 change handover and `audit/S5AA/R42F/`.

**Update 2026-10-01:** ChatGPT's R43 audit (PR #47, merged `38640aa`) **determined NO-GO** at `5b8f0d5`. It confirmed all 34 R42F findings (SA42F-20 qualified) and refuted none, so every R43 repair stands, and it found four R43 defects: R43-01, R43-02 and R43-03 (Q179) and R43-04, five prediction misses under A-01 (Q180). R42-02's disposition covers R42 only, not these.

## 2026-09-30 — Q176. The spousal IRA follows IRC 219(c)(2) (the owner, 2026-09-30)

**Registered 2026-10-02 (UTC−7) by the plan owner**, from the R43 relay. On a joint return, the spouse with the higher (or equal) compensation is limited to their own compensation, after workplace deferrals and HSA contributions. The spouse with less is limited to their own plus the other's, less the other's IRA contributions. Before R43 the couple shared one pool, so the higher earner could use the lower earner's pay. This replaces the shared-pool sentence in `MODEL_ASSUMPTIONS.md` §20 and refines Q162 5c.

**Status: IMPLEMENTED 2026-10-01 (S5AA R43; merged #46 at `247635c`).**

## 2026-09-30 — Q177. HSA contributions stop at 65 (the owner, 2026-09-30)

**Registered 2026-10-02 (UTC−7) by the plan owner**, from the R43 relay. An owner's HSA deposits stop at their 65th birthday, prorated within the row (IRC 223(b)(7), assuming Medicare enrolment at 65; disclosed). A deposit stopped this way is not a limit excess, so it is not redirected. Before R43 an HSA owner could keep contributing past 65. This closes the age part of §21's "Not modelled: HSA eligibility (coverage, or Medicare from 65)" and the matching R40 unrepaired-list item. Q179 corrects how the limit is prorated.

**Status: IMPLEMENTED 2026-10-01 (S5AA R43; merged #46 at `247635c`); proration refined in R44 (Q179).**

## 2026-09-30 — Q178. Survivor costs start at the death, unless the survivor has a salary (the owner, 2026-09-30)

**Registered 2026-10-02 (UTC−7) by the plan owner**, from the R43 relay. The rule applies when the self dies after the start and before the retirement age, the spouse is alive at that death, and the spouse has no salary in their work window at that death. Then these costs start at the death instead of at the retirement age: the spending strategy with its anchor and inflation latches, health costs, and the retirement-span debt payments. Pensions, wages and contributions still follow the retirement age, and with a salary nothing changes. Before R43, the survivor's spending and health costs waited for the dead self's retirement age, within the declared Q59 / §7 boundary (R42F §4).

**Status: IMPLEMENTED 2026-10-01 (S5AA R43; merged #46 at `247635c`).** This changes declared text in Q59 and `MODEL_ASSUMPTIONS.md` §7 and §18.1. **A correction to the relay, checked in the code on 2026-10-02:** the R43 relay, and a comment in the engine, say long-term-care costs start at the death too. They do not: the long-term-care cost's start reads the retirement age (the later of 65 and ten years after it, `ltcStart`) and is not moved by this ruling, and the "years of spending in reserve" is still sized only from the retirement age. `MODEL_ASSUMPTIONS.md` §18.1 says so. Whether the ruling was meant to reach it is for the S5AA session to say.

## 2026-10-01 — Q179. The HSA limit in the 65th-birthday row, and the other R43 repairs (S5AA R44, the owner, 2026-10-01)

**Registered 2026-10-02 (UTC−7) by the plan owner**, from the R44 relay (`audit/S5AA/R44/S5AA_R44_RELAY_TO_EB_20261001.md`), read against `main`. R44 merged as PR #48 at `9ce336a` (2:19 am on 2026-10-01).

**The context.** ChatGPT's R43 audit determined NO-GO on R43-01 (a one-time HSA contribution after 65), R43-02 (one-time IRA compensation without the income latch) and R43-03 (negative employer percentages accepted), plus the process finding R43-04 (Q180).

**The decision (the owner, 2026-10-01): "Prorate the limit, both routes".** IRC 223(b)(1) to (3) and (7): in the row an owner turns 65, the HSA limit is the share of the row before 65 times (base + catch-up), for planned and one-time contributions alike, and from 65 it is zero. R43-01 to R43-03 are repaired: a one-time contribution's compensation limit reads income streams the way the planned contributions do (today's dollars latched at the stream's start); an employer match rate, match cap or profit-sharing percentage below zero is refused.

**Status: IMPLEMENTED 2026-10-01 (S5AA R44; merged as #48 at `9ce336a`; source tag `s5aa-r44-source` = `06e551e`).** The expanded baseline is **r23** (S5b task 4 builds on it in place of r22). ChatGPT's R44 audit (PR #49, merged `2c68b29`) requalified R43-01, R43-02 and R43-03 and found no new financial defect. Modelling text: `MODEL_ASSUMPTIONS.md` §23 and §26. One correction to R43's own records, which needs no model-text change: R43 attributed the Monte Carlo band member's movement to an IRMAA charge (SA43-B); it moved through the optimized withdrawal order's IRMAA guard, as `audit/S5AA/R44/S5AA_R44_R43_04_RETRO_PROOF_20261001.md` records.

## 2026-10-01 — Q180. R43-04, the prediction misses: a written checklist and a proof, not a disclosed miss (S5AA R44, the owner, 2026-10-01)

**Registered 2026-10-02 (UTC−7) by the plan owner**, from the R44 relay. ChatGPT's R43 audit recorded five prediction misses in R43 under A-01 (two unpredicted expanded-corpus movements, one in the opposite direction). The owner decided **not to accept them as a disclosed miss**, as was done for R42-02 (Q175), and instead chose: **"Fix the scan method"**, a written checklist (`audit/S5AA/R44/S5AA_R44_PREDICTION_CHECKLIST_20261001.md`) that every prediction from R44 on follows; and **"Prove it on R43"**, corrected scans run on R43's own pre-repair trees.

**Status: DONE 2026-10-01 (S5AA R44; merged #48).** ChatGPT's R44 audit found the checklist in place and the retrospective scans correct for R43 parts 3, 4a and 4b, but the part 2 scan named two Monte Carlo plans where only one published result moved, so R43-04 stayed open and **R44-01** (a process finding) blocked E10. Q181 resolves it.

## 2026-10-01 — Q181. Monte Carlo predictions are made at the path level: amendment A-11 (S5AA R44.1, the owner, 2026-10-01)

**Registered 2026-10-02 (UTC−7) by the plan owner**, from the R44.1 relay (`audit/S5AA/R44.1/S5AA_R44_1_RELAY_TO_EB_20261001.md`), read against `main`. R44.1 changes no source. It merged as PR #50 at `894e0ff` (4:23 am on 2026-10-01).

**The decision (the owner, 2026-10-01): "Owner exception for Monte Carlo"**, recorded as amendment **A-11** in `S5AA_TASK_CHECKLIST.md` after A-10 (added by the S5AA session, as A-10 was, with nothing above it rewritten). Under A-11, a Monte Carlo plan's prediction is made at the path level: it names the plan, its exposed paths (by a necessary-condition test on every path) and a published result that "may move". After the build, both levels are compared: a named plan that does not move is not a miss, and an unnamed plan that moves, or a changed path not named, is. Every other plan keeps A-01 as written. The revised prediction checklist (`audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md`) supersedes R44's. If an amendments list is kept elsewhere: **A-11 (2026-10-01): A-01's prediction for a Monte Carlo plan is path-level; the published result may move (R44-01).**

**Status: DECIDED and recorded 2026-10-01 (S5AA R44.1; merged #50 at `894e0ff`).** ChatGPT's R44.1 audit (PR #51, merged `c05208c`) ruled **R44-01 resolved under A-11 and R43-04 requalified**, made no R44.1-NN finding, found E10 met under A-11, and **determined S5AA GO for administrative close at R44.1**; see the README and `ROADMAP_EXTERNAL_REVIEW.md`. The GO is administrative, not a release or household-reference qualification. S5AA is not closed.
