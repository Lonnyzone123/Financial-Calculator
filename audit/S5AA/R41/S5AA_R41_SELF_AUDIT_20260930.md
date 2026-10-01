# S5AA R41 — self-audit

*Written by Claude, 2026-09-30 (Arizona, UTC−7), before the round went to the owner. Each item names what went wrong, how it
was found, and what stands now.*

## Claude's own errors this round

| | what went wrong | found by | where it stands |
|---|---|---|---|
| SA41-01 | **The first Worker-against-Node comparison hashed the whole result,** `identity.runId` included, so all 74 plans with an identity looked different, Worker against main thread too. `runId` is `fastHash(Date.now() + Math.random() + …)` (`src/engine.js`, `buildSimulationIdentity()`), the one field already documented as free to differ across the Worker boundary (`tools/capture-baseline.js`, the format-2 note) | the first browser run: Worker and main thread differed from each other on a deterministic plan, which located the field | `r41Mask()` masks that one field, records its presence (`runId: "string"` on all 74), and leaves the key order unmasked; nothing else is masked. The recorded runs use it |
| SA41-02 | **The first app-level comparison held the plan the app posted against the corpus plan.** The import upgrades a plan (on `golden:baseline` it set `advanced.v210Migrated`, dropped the stored `retirement.ssFra`
and changed each account record), and the harness itself sets `id`, `name` and `setupComplete`, so no posted plan could equal its corpus plan | the same run: 0 of 71 equal, uniformly | replaced by the comparison that answers the question: each app Worker message against the main-thread engine on the exact plan the app posted (71 of 71 equal on `978a6e4`) |
| SA41-03 | **A browser step timed out with both injected faults still active** (the Worker fault and `Math.pow` throwing). Clicking Results on the page already showing Results started no calculation, so the wait never ended | the tool's 45-second timeout | the faults were removed in the next step, before anything else ran, and checked (`Math.pow(2,3) === 8`, the original `Worker` restored). The recorded script imports onto the Results page, bounds its wait at 20 seconds and restores in a `finally` block |
| SA41-04 | **The first name for the fourth added plan, `refusal:negative-end-age-order`, was wrong:** the engine did not refuse it | its own run, at once | renamed `edge:end-age-before-start` before anything was recorded. Following up why it was not refused found the defect R41 repairs |

## The defect found, and the decision

`edge:end-age-before-start` (the baseline plan, age 29.5, end age 28.5) was restored by the app and projected
backwards: rows at 29.5, then 28.5, `status` `"ok"`. The validator's only age check on the end age compares it with the
retirement age. The form cannot produce the plan; measured in the browser, an age of 90 with an end age of 80 posted an
end age of 90 (`readStatic()`). The owner decided "Repair now". The prediction (`03d6ed4`) was committed before the edit;
the new test failed in its three refusal cases on the unrepaired tree and passed its three controls
(`prediction/new_test_against_4a31a28.txt`).

## Observed, not repaired (for the owner)

- **The error card's wording.** On `ENGINE_RUN_FAILED` the card says the projection "hit an internal reconciliation
  problem". Here the engine threw. The card shows no figures and points to the debug file, which records the actual
  error, so nothing misleads about the numbers; the words describe the wrong cause. The UI will be rebuilt (the owner,
  2026-09-30), so this is listed for the rebuild, not repaired.
- **An end age equal to the starting age** projects one row, the opening balances, with no projected year. The form
  produces it at an age of 90 or more. It is the same class as R10's refused "nobody alive at the start" (a result for a
  projection with no years in it), but no decision covers it, so R41 leaves it unchanged and names it here.
- **Two corpus plans the app's import refuses,** both already known: `seed:9` carries a transfer into a 401(k) from an
  HSA, which the validator refuses and the engine declines with `TRANSFER_INTO_WORKPLACE_REFUSED` (R29's design), and
  `targeted:spouse-cola-income` uses the income type `"recurring"`, recorded as `SPRINT_QUESTIONS.md` Q29.

## Checks

Listed with their results in `S5AA_R41_E15_BROWSER_EVIDENCE_20260930.md` §6.
