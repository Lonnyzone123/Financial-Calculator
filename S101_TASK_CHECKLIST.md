# S101 — task and subtask checklist

| Field | Value |
|---|---|
| Sprint | **S101** |
| Theme | **Adopt the CRSP market total-return series.** One output-moving change, audited as a financial model change. |
| Runs after | S100 (cutover closed out, new engine packaged) |
| Package | `Resource Documents/MARKET_DATA_FF_MONTHLY_PACKAGE_2026.md` — prepared, hash-pinned, decision taken 2026-09-10 |

## Why this is a whole sprint for one data swap

The two series **agree on the century and disagree on the years.** Geometric means match to 4 basis points across 98 years, so any test checking long-run terminal wealth cannot tell them apart. But the median absolute annual difference is **1.85 pp**, the maximum is **7.24 pp**, and **four years disagree on the direction of the market**: 1934, 1939, 1953, 1994.

Historical replay walks actual sequences, and sequence-of-returns risk is driven by individual years rather than the long-run mean. This will move failure ages, guardrail crossings and success rates. **It is a financial model change and must be audited as one — never landed as a data refresh.**

It waited for cutover because the rebuild's acceptance gate was an empty diff against the old engine, and two engines on different market data cannot produce one.

## Preconditions

- [ ] S100 is closed; the new engine is the only engine on the ship path
- [ ] A baseline is captured **from the new engine** — this sprint diffs against that, not against any pre-cutover baseline
- [ ] The versioned data package machinery from S6 task 1 is in place and has already carried CPI-U successfully
- [ ] `npm test` exits 0

## Tasks

### 1. Ingest the package through the data-package machinery

- [ ] 1.1 Load `ff-market-monthly` through the three-layer structure (raw → normalized → engine) built in S6
- [ ] 1.2 Verify the archive SHA-256 matches the package's §2 — a mismatch means a new source vintage, not a refresh
- [ ] 1.3 Wire the package's §8 validation invariants as ingestion assertions: 1,201 contiguous monthly observations, month continuity, every return in (-1, 1), the compounding identity, and agreement with the library's published annual rows to within 0.052 pp
- [ ] 1.4 Confirm the transform is `(Mkt-RF + RF) / 100` per `MARKET §4.2` — **the divide by 100 is mandatory**
- [ ] 1.5 Record the **CIZ methodology family** in the package metadata. Do not splice with any pre-2025-vintage extract

**Gate:** all eight invariants assert green; the vintage and hash are recorded in the engine package metadata.

### 2. Predict the movement before regenerating anything

**The fixture protocol, applied to a data change.** Predict, then explain every number that moved, and treat an unpredicted movement as a finding rather than widening the prediction to fit.

- [ ] 2.1 Write the prediction down first: which scenarios move, in which direction, and roughly how far
- [ ] 2.2 The four sign-flip years are the sharpest test — **name in advance** which scenarios span 1934, 1939, 1953 or 1994 and what should happen to them
- [ ] 2.2b **Verify the sequence-risk fixtures actually exercise sequence risk before relying on them.** The S2 closure re-audit's **CL-07** found that the three named historical sequence-risk fixtures — the 1929/1966/2000 start years added in S3 — carry **zero initial investments and zero spending**. A fixture with no portfolio and no withdrawals cannot demonstrate sequence-of-returns sensitivity to anything, so it will report "no movement" for an index change that genuinely moves other scenarios. **If CL-07 was not repaired before this sprint, repair it here** — otherwise the strongest evidence this task could produce is vacuous.
- [ ] 2.3 Predict what should *not* move: `simple` and `monteCarlo` modes do not read the historical series at all, so **only `historical` mode should move.** A movement in `simple` mode is a finding, not a consequence

**Gate:** a written prediction, committed before the swap.

### 3. Swap the series

- [ ] 3.1 Replace `HIST_RETURNS` with the package's derived annual series (the rebuild ships annual; S102 handles monthly)
- [ ] 3.2 Coverage changes from 1928–2025 to **1927–2025** — two extra years. Confirm the historical-window construction handles the wider range rather than silently ignoring it
- [ ] 3.3 Remove the literal array. A versioned package and a hardcoded constant must not coexist
- [ ] 3.4 Update every citation that calls this an S&P 500 series. **`MARKET §4.2`: "Do not label it S&P 500 return."**

**Gate:** no literal return array remains in the engine; the series identity is CRSP value-weighted market everywhere it is named.

### 4. Reconcile every movement

- [ ] 4.1 Run the full baseline diff
- [ ] 4.2 Attribute **every** moved scenario to a cause
- [ ] 4.3 Investigate any movement not in the prediction — that is a finding
- [ ] 4.4 Confirm `simple` and `monteCarlo` are untouched
- [ ] 4.5 Regenerate the golden fixtures only after the direction is confirmed at first order

**Gate:** every difference explained. An unexplained movement stops the sprint.

### 5. Record it where users will see it

- [ ] 5.1 `MODEL_ASSUMPTIONS.md` — this is exactly the kind of user-facing choice that file exists for: *"Historical replay uses the CRSP value-weighted total US market return, not the S&P 500."* Include that the two differ by a median of 1.85 pp in any given year
- [ ] 5.2 `FEATURES.md` if the change is user-recognisable
- [ ] 5.3 Track I provenance — the series now has a citable source, a vintage and a hash where it previously had a literal array

**Gate:** a user reading the assumptions page can tell which index their projection used.

## Ground rules — **PRELIMINARY, added 2026-09-12**

**Marked preliminary deliberately.** S101 had no ground-rules section while S4, S5, S5b, S6, S100 and S103 all did, which meant the standing rules were absent from one of the two sprints that move the most output. This set is derived from the standing ones and tailored to a data swap; **review and amend it at sprint start rather than inheriting it unexamined.**

1. Every task states its own gate. Not done until the gate passes **and** `npm test` is green.
2. Per-task durations are **floors, not targets.**
3. **No task may weaken an existing test to pass.** This rule matters more here than in the sprints that already carried it: when a market series legitimately moves `historical`-mode numbers, **a test that was quietly relaxed looks exactly like a test that correctly tracked a real change.** If an existing test and the new series disagree, that is a finding, not a threshold to widen.
4. **One output-moving change per commit, never batched.** This sprint carries exactly one — the series swap in task 3. Everything else is ingestion, prediction or reconciliation
5. **Predict before regenerating**, and treat an unpredicted movement as a finding rather than widening the prediction to fit. Task 2 is that rule made into work
6. Any figure from a specification or a data package is cited by document and section, with its vintage and hash
7. Re-locate by symbol, not by line. Record drift.
8. **Record findings rather than fix them** where a fix requires a policy judgment
9. **`simple` and `monteCarlo` must not move.** They do not read the historical series. A movement there is not a consequence of this sprint — it is a defect this sprint uncovered, and it stops the sprint per the stopping points below
10. **The differential harness cannot help after this sprint**, per S100 task 1.6: the old engine and the new one will be on different market data, so `historical`-mode diffing ends here. **Everything this sprint establishes about `historical` mode has to be established while it still can be**
## Stopping points

- [ ] A movement appears in `simple` or `monteCarlo` mode
- [ ] An unpredicted movement in `historical` mode cannot be attributed
- [ ] The published-annual agreement invariant (§8 item 6) fails — the parse or transform is wrong

## Exit gate — what must be **true**, not merely **reported**

**Added 2026-09-12.** Six of the eight sprints had a close-out and no exit gate, and they are not the same document: **the close-out reports; the exit gate decides.** Every downstream precondition that reads *"S<prev> is closed"* resolved to whatever the closer said it meant. **A checklist that lists gates is not a checklist that collects them.**

**Common clauses, applying to every line below.** Each item **names its evidence and the commit it was true at** (S4 §N's stamping convention). `npm test` exit 0 is **recorded, not assumed**. **A no-go must name what is missing and what it blocks** — a verdict that can only say yes is 6.8's vacuous pass in another costume. The verdict is the user's, on a stated recommendation. **A line that cannot be made true is not a reason to soften it:** record it, say what it blocks, hand it forward. An exit gate relaxed to let a sprint close converts a known gap into an unknown one.

### This sprint is closed when every line below is true

- [ ] **E1. The series swap was ONE output-moving change in its own commit**, per ground rule 4
- [ ] **E2. Every movement was predicted, and the aggregate movement is stated with no predetermined sign.** Predict the shape; do not decide the direction in advance — that is S102 ground rule 6's lesson arriving one sprint early
- [ ] **E3. Ground rule 9 is ASSERTED, not assumed: `simple` and `monteCarlo` did not move.** A movement there is **not a sprint consequence — it is a defect this sprint uncovered**, and the gate is where that distinction gets made while anyone still remembers
- [ ] **E4. Every acceptance case has a predicted answer derived INDEPENDENTLY of the new series.** A prediction derived from the thing being adopted proves only that the adoption was consistent with itself
- [ ] **E5. The prior series is retained and re-runnable for comparison**, not deleted. It is the only thing that can settle a later question about what changed
- [ ] **E6. The no-weaken rule held** — no assertion loosened, no tolerance widened
- [ ] **E7. STATED IN WRITING: from this point `historical` mode is no longer differentially gateable.** The old engine and the new one are on different market data. **S102 and later must not cite a reconciled historical change as though a differential gate stood behind it**, and this gate is where that changeover gets collected rather than remembered
- [ ] **E8. Every USER DECISION answered or owned**

## Close-out

- [ ] 1. The prediction, and how it held
- [ ] 2. Every moved scenario with its attribution
- [ ] 3. What the four sign-flip years did
- [ ] 4. `MODEL_ASSUMPTIONS.md` updated
- [ ] 5. **Ask the user: whole-model or new-code-only for the handover.** A single data swap with a written reconciliation argues for new-code-only, but the ripple is financial, so ask.
