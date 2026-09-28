# S102 — task and subtask checklist

| Field | Value |
|---|---|
| Sprint | **S102** |
| Theme | **Flip the simulation timestep from annual to monthly.** One change, and it moves every number in the model. |
| Runs after | S101 (CRSP adopted) |
| Depends on | Both monthly data packages, already committed to `Resource Documents/` |

## What this actually changes, and what it deliberately does not

**Separate the simulation timestep from the reporting timestep.** Compute is driven by steps; memory is driven by retained rows. Conflating them is what makes "go monthly" look impossible.

| Reporting granularity | Rows/path | Retained memory at 40 fields × 10,000 paths |
|---|---|---|
| Annual (kept) | 72 | 230 MB f64 / 115 MB f32 |
| Monthly (rejected) | 864 | 2.8 GB — impossible |

So: **simulate monthly, report annually for Monte Carlo, and offer full monthly detail for the single deterministic path** — which is 276 KB and therefore free. That last part is a feature, not a compromise.

**Compute does not scale 12× either**, because the model already has two natural cadences:

- **Naturally sub-annual:** portfolio growth, withdrawals, spending, debt payments (`debt-amortization.js` is already monthly internally), Medicare premiums.
- **Naturally annual:** tax settlement, RMD, contribution limits, IRMAA tier (keyed to prior-year MAGI), SS COLA, Roth phaseouts, senior deduction.

Run monthly mechanics 12× and annual mechanics 1× and the realistic multiplier is **3–5×**.

## Preconditions

- [ ] S101 is closed; CRSP is adopted and reconciled
- [ ] The **monthly** series is ingested, not just the derived annual one — `ff-market-monthly` §11 and `cpi-u-monthly` §10
- [ ] The engine was built timestep-parametric per S6 design decision 6.3. **If steps-per-year is hardcoded anywhere, that is a finding about the rebuild** — record it before proceeding
- [ ] A baseline captured at annual, from the current engine

## Tasks

### 1. Confirm the parametrisation is real

- [ ] 1.1 Set steps-per-year to 12 and confirm the engine runs without a code change beyond the constant
- [ ] 1.2 Any site that assumed 12 rows ≈ 12 years, or that a step *is* a year, is a defect — find them by search, not by waiting for a wrong number
- [ ] 1.3 Confirm the reporting layer still emits 72 annual rows regardless of step count
- [ ] 1.4 **RNG stream independence at 12× the draws — computed 2026-09-12, and the answer is "no risk." Recorded so the question is asked once.**

  Monthly stepping multiplies draws per path by roughly twelve, which makes the obvious worry *"do adjacent paths' streams now overlap?"* The engine seeds path `i` with `rng(baseSeed + i*2)` and `rng(baseSeed + i*2 + 1)` — **mulberry32**, whose state advances by a fixed `C = 1831565813` per draw. Two streams seeded `d` apart first coincide after `k` draws where `k · C ≡ −d (mod 2³²)`:

  | Seed offset | First coincidence |
  |---|---|
  | 1 | ≈ 598,168,995 draws |
  | **2** (the engine's spacing) | **≈ 1,196,337,990 draws** |

  Against **~144 draws per path at annual cadence and ~1,728 at monthly**, the margin is about **700,000×**. Monthly stepping does not approach it.

  - [ ] Confirm the seeding formula is unchanged by the cadence flip — the margin is a property of the *spacing*, and it only holds while paths stay seeded 2 apart from the **global** path index (S6 task 6.12)
  - [ ] `tests/rng-seeding.test.js` proves independence at ~144 draws. **Extend it to the monthly draw count** rather than assuming the shorter proof carries — the arithmetic above says it does, but the test is what observes it
  - [ ] **This is a reassurance, not a task with a defect behind it.** It is written down because the question is natural, the answer is not obvious, and deriving it twice is waste

**Gate:** the constant is the only edit required to change cadence.

### 2. Assign each mechanic its true cadence

- [ ] 2.1 **Monthly:** growth, withdrawals, spending, debt payments, Medicare premiums
- [ ] 2.2 **Annual:** tax settlement, RMD, contribution limits, IRMAA tier, SS COLA, Roth phaseouts, senior deduction
- [ ] 2.3 Each assignment is justified against the real-world rule, in a comment citing the rule — not chosen for convenience
- [ ] 2.4 An annual mechanic running inside a monthly loop must fire **once**, on a defined month, and that month is recorded

**Gate:** a written cadence table; no mechanic runs at a cadence nobody chose.

### 3. Delete the `withdrawalTiming` fudge

The old engine approximated sub-annual withdrawal timing by scaling the growth fraction — `duration` for annual, `duration*.625` for quarterly, `duration*.5` for monthly. That was a midpoint hack standing in for actually stepping.

- [ ] 3.1 Remove the approximation
- [ ] 3.2 Decide what `assumptions.withdrawalTiming` now means — an actual within-year schedule, or a retired field. **Do not leave it as a scaling factor that no longer scales anything**
- [ ] 3.3 Migration for saved scenarios carrying the old field

**Gate:** no midpoint factor remains; the field is either meaningful or retired, with migration.

### 4. Collect the timing wins that motivated this

- [ ] 4.1 **ARM resets land on their true month** rather than being fought into place — FM-05/FM-06 were exactly this
- [ ] 4.2 **Social Security** delayed retirement credits accrue monthly; claiming age becomes month-granular
- [ ] 4.3 **Medicare premiums** are monthly in reality
- [ ] 4.4 Confirm the FM-07 partial-period inflation class is now structurally impossible rather than repaired — uniform steps remove the irregular-period problem at its root

**Gate:** each win has a test that would have failed at annual cadence.

### 5. Verify memory did not move

- [ ] 5.1 Retained memory should be **unchanged** — that is the entire point of decoupling simulation cadence from reporting cadence
- [ ] 5.2 If retained memory grew, something is retaining sub-annual rows. Find it
- [ ] 5.3 Measure the real compute multiplier against the 3–5× estimate and record the actual figure
- [ ] 5.4 Re-run the real-device benchmarks from S100 task 3 — this is a 3–5× compute increase on a phone and the tier table may need revising

**Gate:** retained memory flat; measured multiplier recorded; tier table still valid or revised with evidence.

### 6. Re-baseline and reconcile

- [ ] 6.1 **Every number moves.** There is no meaningful prediction of individual scenarios here — the prediction is structural: *finer stepping changes sequence exposure within each year* **See 6.2c: this holds for the corpus and not for a deliberately simple fixture.**
- [ ] 6.2 **Explain observed changes against independent reference cases. Either direction may be correct** — see ground rule 6 for the counterexample that disproved the directional version of this subtask
- [ ] 6.2a **Build the three acceptance cases that DO have independently predictable answers.** This is round 19's constructive half, and each is checkable without the engine:
  - [ ] A **zero-return, fixed-spending** case whose terminal balance agrees at both cadences
  - [ ] A **no-flow** case whose terminal balance equals the product of the return factors
  - [ ] A **known within-year return-order** case with explicitly timed withdrawals
- [ ] 6.2b Retain ground rule 6's counterexample as a **fourth independent reference case.** It needs no engine, it is checkable by hand, and it is the case that would have been misreported as a defect under the old rule
- [ ] 6.2c **6.1 is too strong, and these three prove it.** *"No meaningful prediction of individual scenarios"* is true of the 33-scenario corpus and **false of a deliberately simple fixture.** Simple scenarios can have independently predicted answers, and **building them is how a structural claim gets tested rather than asserted**
- [ ] 6.2d **Do not use blanket fixture regeneration as the source of truth for whether a movement was correct.** Regeneration records what happened; the reference cases establish whether it should have. See ground rule 3, which now says a fixture may be regenerated **once its movement has been explained**
- [ ] 6.3 Regenerate every fixture
- [ ] 6.4 Record the aggregate effect on success rates across the corpus — that is the number a user would notice

**Gate:** the aggregate direction is explained and defensible; no scenario moves in a direction the model cannot account for.

### 7. Record it

- [ ] 7.1 `MODEL_ASSUMPTIONS.md` — *"The simulation steps monthly and reports annually."* Users care: it changes their success rate
- [ ] 7.1a **Bump `ENGINE_VERSION` and regenerate the manifest — this sprint changes the engine and nothing versioned it.** *(Added 2026-09-12.)*

  `ENGINE_VERSION` appears in **S100 only** across the whole post-cutover plan. S101 is defensible without it: adopting CRSP is a *data* change, and S6 task 1.2 already requires every result to identify its dataset version, source vintage and transform version, so the provenance is carried.

  **S102 has no such cover.** Flipping the timestep is a change to the engine itself, and by task 6.1's own words *"every number moves."* A saved projection computed before this sprint and one computed after are materially different results with nothing distinguishing them.

  - [ ] Bump `ENGINE_VERSION` to a value that signals a behavioural change, not a patch increment
  - [ ] Regenerate `SHA256_MANIFEST.txt`, and cut it with `-c core.autocrlf=false` per the standing packaging rule — a manifest hashed from CRLF-rewritten text matches nothing this project has ever shipped
  - [ ] Confirm a stored result carries enough to answer **"was this computed monthly or annually?"** — if the rules and dataset vintages alone cannot answer it, the version is the only thing that can
- [ ] 7.2 Expose monthly detail for the deterministic path if the UI can carry it — it is nearly free and it is the visible upside
- [ ] 7.3 Record the calendar-alignment decision from `MARKET §10.2`: CPI is a whole-month reference period and the market return is month-end. **Label the mismatch rather than silently joining them**

## Ground rules — **PRELIMINARY, added 2026-09-12**

**Marked preliminary deliberately; review and amend at sprint start.** S102 had no ground-rules section at all, and that is worth stating plainly rather than quietly fixing: **this was the least-constrained sprint in the plan while being the one that changes every number in the model.** Its own task 6.1 says *"every number moves"* and task 6.3 says *"regenerate every fixture."*

**Why the missing rule was the expensive one.** *"No task may weaken an existing test to pass"* was present in six sprints and absent from this one. **A sprint that regenerates every fixture is exactly where it does its work** — because when everything legitimately moves, a test that was quietly relaxed is indistinguishable from a test that correctly tracked a real change. There is no diff to notice and no number that looks wrong.

1. Every task states its own gate. Not done until the gate passes **and** `npm test` is green.
2. Per-task durations are **floors, not targets.**
3. **No task may weaken an existing test to pass — and in this sprint that includes widening a tolerance.** A fixture may be regenerated **once its movement has been explained** — never as the source of truth for whether the movement was correct, which is regeneration standing in for verification. An assertion may not be loosened to accommodate a number nobody predicted. If a test cannot be made green without relaxing it, **stop and record why**
4. **Regenerating a fixture is not the same act as changing an assertion.** Do them in separate commits, always, so the diff shows which happened
5. **One output-moving change per commit, never batched.** The cadence flip is one change; the `withdrawalTiming` retirement in task 3 is another; the cadence assignments in task 2 are a third. They are not one commit because they all landed the same week
6. **Define the measures before comparing, and treat either direction as possibly correct.** *(Corrected 2026-09-12 at round 19 — the original rule was wrong, and is quoted below so the correction is legible rather than silent.)*

   **Define withdrawal timing, return aggregation and sensitivity measures before comparison. Explain observed changes using independent reference cases; either direction may be correct.** Keep the requirement to investigate an unexplained difference — but **do not identify a defect from a downward movement alone.**

   > **What this rule used to say, and why it was wrong:** *"finer stepping increases within-year sequence exposure, so monthly withdrawal against monthly returns should show **more** sequence sensitivity, not less. A scenario moving the other way is a finding."*
   >
   > **Disproved by counterexample, reproduced independently before this edit** — 52 elementary balance updates, no engine imports, no random draws. Start 100, spend 20/year, two years, no taxes, fees or inflation. Annual factors `[2, 0.5]` versus `[0.5, 2]`; the monthly cadence withdraws 20/12 before each month's return at the twelfth root of that year's factor, so **both cadences see the same annual compounded return and the same annual spending** — which is what makes it a fair comparison rather than a different experiment.
   >
   > | Cadence | up-then-down | down-then-up | sensitivity |
   > |---|---|---|---|
   > | Annual | 70.000000 | 40.000000 | **30.000000** |
   > | Monthly | 71.138077 | 42.276154 | **28.861923** |
   >
   > **Monthly is lower by 1.138077, and the arithmetic is correct.** Under the old rule that ordinary case is a finding — the gate would have reported a defect in a cadence change that behaved exactly right.
   >
   > **The defect was the form of the claim, not the intuition behind it.** *"Finer stepping changes within-year sequence exposure"* is a reasonable structural expectation. *"Therefore the measure must move in this direction, and the other direction is a bug"* is a different statement, and it needs a defined measure and a defined comparison before it can be true or false. **A prediction stated as an acceptance gate stops being a prediction — it can no longer be wrong, only disobeyed.**
   >
   > **It is this project's recurring family pointed the other way.** Every other instance was a check that could not **fail** for the right reason — ST2-02's empty sweep, FC-04's `inert`, P5-02's `rows: []`, 6.8's zero claimed modes. This one could not **pass** for the right reason: it manufactures a finding out of correct behaviour. **That is worse, because a silence gets investigated eventually and a false finding gets "fixed".**
7. **Aggregate movement is the number a user would notice**, so it is the number to state — the corpus-wide effect on success rates, not a scenario count
8. Each cadence assignment is justified against the **real-world rule** in a comment citing it, never chosen for convenience (task 2.3)
9. Re-locate by symbol, not by line. Record drift.
10. **Record findings rather than fix them** where a fix requires a policy judgment
11. **Retained memory must not move** (task 5). The whole point of separating simulation cadence from reporting cadence is that compute scales and memory does not. If retained memory grows, something is keeping sub-annual rows and the sprint has a defect rather than a cost
12. **The old engine cannot arbitrate any of this.** Its `historical` diffing ended at S101 and it was never timestep-parametric. **Every check in this sprint is new-engine-against-itself across the change**, which is weaker evidence than an empty diff and should be described that way
## Stopping points

- [ ] Steps-per-year turns out not to be a real parameter
- [ ] Retained memory grows — sub-annual rows are being kept somewhere
- [ ] The aggregate effect on success rates moves in a direction the model cannot explain
- [ ] The measured compute multiplier exceeds ~6×, which would mean an annual mechanic is running monthly

## Exit gate — what must be **true**, not merely **reported**

**Added 2026-09-12.** Six of the eight sprints had a close-out and no exit gate, and they are not the same document: **the close-out reports; the exit gate decides.** Every downstream precondition that reads *"S<prev> is closed"* resolved to whatever the closer said it meant. **A checklist that lists gates is not a checklist that collects them.**

**Common clauses, applying to every line below.** Each item **names its evidence and the commit it was true at** (S4 §N's stamping convention). `npm test` exit 0 is **recorded, not assumed**. **A no-go must name what is missing and what it blocks** — a verdict that can only say yes is 6.8's vacuous pass in another costume. The verdict is the user's, on a stated recommendation. **A line that cannot be made true is not a reason to soften it:** record it, say what it blocks, hand it forward. An exit gate relaxed to let a sprint close converts a known gap into an unknown one.

### This sprint is closed when every line below is true

- [ ] **E1. Withdrawal timing, return aggregation and the sensitivity measure were ALL DEFINED BEFORE any comparison was run.** Ground rule 6 as corrected — a measure defined after the result is a measure fitted to it
- [ ] **E2. All four reference cases pass, and each was predicted before it was run** — the three acceptance cases plus the counterexample retained in ground rule 6
- [ ] **E3. Every observed movement is explained by a reference case, or recorded as unexplained-and-open.** **Neither direction is treated as a defect by itself**
- [ ] **E4. No fixture was regenerated before its movement was explained**, per ground rule 3 as amended — regeneration records what happened, the reference cases establish whether it should have
- [ ] **E5. No commit both regenerates a fixture and changes an assertion.** Verifiable from the commit graph rather than from anyone's memory of intent, per ground rule 4
- [ ] **E6. Retained memory did not move.** That is the entire point of decoupling simulation cadence from reporting cadence; if it grew, sub-annual rows are being kept somewhere
- [ ] **E7. Ground rule 12 carried: every check in this sprint is new-engine-against-itself across the change, and is DESCRIBED AS SUCH** rather than as an empty diff. The old engine cannot arbitrate here — its `historical` diffing ended at S101 and it was never timestep-parametric
- [ ] **E8. `ENGINE_VERSION` bumped and the manifest regenerated**, per 7.1a — a stored result must be able to answer whether it was computed monthly or annually
- [ ] **E9. Every USER DECISION answered or owned**

## Close-out

- [ ] 1. The cadence table
- [ ] 2. Measured compute multiplier vs the 3–5× estimate
- [ ] 3. Retained memory before and after
- [ ] 4. Aggregate effect on success rates across the corpus
- [ ] 5. Real-device figures, and whether the tier table survived
- [ ] 6. `MODEL_ASSUMPTIONS.md` updated
- [ ] 6a. **The new `ENGINE_VERSION` and regenerated manifest** (7.1a) — this sprint changes the engine and a stored result must be able to answer whether it was computed monthly or annually
- [ ] 7. **Ask the user: whole-model or new-code-only.** This one moves every number, which argues strongly for whole-model.
