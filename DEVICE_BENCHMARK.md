# Device benchmark — the protocol, and what a result can and cannot support

**S4 task 10.** The page, its measurement core and the protocol are built. **No device has been measured.**

- Hosting it (10.4) is open, for the owner.
- The Android measurement (10.5) and the iPhone measurement (10.6) are open, for the owner.
- Recording each `ROADMAP_EXTERNAL_REVIEW.md` §6 figure as confirmed, revised or still unmeasured (10.7) is open, for the owner.
- The acceptance in 10.8 is open, for the owner.

Until a device result exists, **every §6 figure is still unmeasured**: the ~450–500MB budget, the 50%/65%/100% pressure rungs and the tier table.

## 1. What is built

| Piece | What it is |
|---|---|
| `tools/build-device-benchmark.js` | Writes the page. `node tools/build-device-benchmark.js --out <file.html>`, with optional `--stages`, `--reps`, `--seed`, `--budget-ms` and `--max-lag-ms`. `--out` is required, so nothing lands in the repository by default. |
| `tools/device-benchmark-core.js` | The measurement core. Exactly this file runs in Node under test and inline in the page. |
| `tests/device-benchmark.test.js` | What can be proved without a device. That includes an end-to-end run of the page **in jsdom, which is not a browser**. |

**The page is self-contained.** It loads no library, fetches nothing and stores nothing. It embeds:

- **the build's own engine:** the debt-module block and engine body that `build.js` inlines into the calculator. The test holds the page to the build output, not to a copy of the sources.
- **the 2026 rules**, and the default plan forced to Monte Carlo — the same plan `tools/bench-simulation.js` uses for its `baseline` scenario.
- **Node's aggregate fingerprint for every stage**, computed from `src/engine.js`, so a device checks its own results against Node's.

## 2. What one run records

| 10.2 / 10.8 field | Where it comes from | Where the browser does not say |
|---|---|---|
| Device, OS, browser version | the operator's device field; `navigator.userAgent`; User-Agent Client Hints (model, platform version, full version list) | Client Hints are Chromium-only; they are recorded as `unavailable` elsewhere |
| Artifact identity | commit; SHA-256 of every input; whether every input is the committed bytes (the same boundary `tools/capture-baseline.js` applies); a content hash over everything embedded | a file cannot contain its own hash — **the generator prints the page file's SHA-256; record it beside every result** |
| Seed, workload | the protocol block: stages (path counts), warmed repetitions, seed, budget | — |
| Worker count | `execution: { thread: "main", workerCount: 0 }` | see §5 |
| Foreground / thermal condition | the operator's condition field; a checkbox confirming screen on and page in front; visibility at start; the run **stops** if the page leaves the foreground | no web API reports thermal state; it is the operator's record |
| `hardwareConcurrency`, device memory | `navigator` | recorded as `unavailable` |
| WebGPU availability and adapter | `navigator.gpu.requestAdapter()` then `adapter.info` | `{ available: false }`, `none returned`, or the error |
| Heap at each path count | read with the stage's paths still referenced: the precise memory API where the page is cross-origin isolated, otherwise `performance.memory` | **`unavailable`** — Safari exposes neither |
| Cold start | the first sample of the first stage, reported apart; engine load time; time from navigation to Start | — |
| Warmed repetitions | min, median, max and every sample, for simulation and aggregation separately | — |
| Per-path cost curve | microseconds per path at each stage (warmed median) | — |
| Completion, cancellation | `completed`, and `stopped: { stage, when, reason }` | — |
| Responsiveness | two figures, kept apart: how late a zero-delay timer fired **before** each sample, and how long each sample **blocked** the page — from a zero-delay heartbeat armed before simulation and another before aggregation, which cannot fire until that work ends. *Until S4-IR-04 (2026-09-13) only the first was measured; it fired before the work began, so it never saw a stall* | — |
| **Result correctness** | every repetition of a stage must give the same aggregate fingerprint (`consistent` / `INCONSISTENT`), and it is compared with Node's (`matches` / `DIFFERS`) | — |
| JIT-discard signature (10.3) | `signature.status`: `CANDIDATE` when a stage's per-path cost reaches 1.5× the first stage's; otherwise `not-observed` or `insufficient-stages` | — |

## 3. The stop policy

It is staged and bounded. Short stages run first. A run stops, and records why, when any of these holds:

| Condition | Default | Recorded as |
|---|---|---|
| The next stage is predicted to exceed the time budget. The prediction is this stage's per-path cost × the next path count × the samples per stage. | 20,000 ms | `before` that stage |
| Repeated errors | 2 in a row | `during` the stage |
| Lost responsiveness: a zero-delay timer fired too late before a sample, or a sample blocked the page too long | 1,000 ms, for each; `--max-lag-ms` sets it. The Android page is built with 5,000 ms (the owner, 2026-09-13), so a large stage that freezes the page for a few seconds is measured rather than cut off | `before` or `during`; after a blocking stall, before the next sample starts |
| The page left the foreground | — | `before` or `during` |
| The operator pressed Cancel | — | `before` or `during` |

The stages already run are kept, and a partial stage says how many of its samples completed.

**A stall is witnessed, not prevented.** The page runs on the main thread, and no main-thread timer can interrupt a sample that is already running. The heartbeat reports how long a sample blocked the page once it has finished, and the run stops before starting another. **A failed attempt is settled the same way** (S4-IR-04-R1, 2026-09-13 UTC−7): a stall, a cancellation or backgrounding stops the run even when the attempt threw. Its blocking is recorded on the stage's `failedAttempts`, apart from the samples' timings. A quick transient error can still be retried. Interrupting a running sample would need the work in a Worker — a separate design decision (§5).

**Memory pressure is not a stop condition.** No figure the page can read is a calibrated pressure measurement. Inferred percentages of a conjectured memory ceiling are not calibrated pressure measurements either, and none is computed (S4-PA-14). What stops a run under pressure is what pressure does: the run slows, errors or loses responsiveness.

## 4. Taking a measurement someone else can reproduce

1. **Generate from a clean checkout of a named commit.** The generator must print `inputs the committed bytes`; `UNQUALIFIED` means the page cannot be tied to a commit. Record the commit and the page SHA-256.
2. **Serve it (10.4)** from any static host a phone can reach. Nothing is fetched, so any host serves it identically.
3. **Prepare the device.**
   - Note the battery level and whether it is charging.
   - Let it cool, and close other apps.
   - Keep the screen on.
   - Fill in the device and condition fields, and tick the checkbox.
4. **A cold run means a cold browser.** Close the browser fully, reopen it, load the page and start once. A reload may reuse compiled code, so say in the condition field which it was.
5. **Run it again, at least twice more.** Repeat step 4 for each run, and **keep every result, not the best**. The page gives distributions within a run. Only repeated runs give the spread between runs.
6. **Copy the JSON.** Store it with the page SHA-256 beside it, outside any financial snapshot or baseline. Where it is stored is open (§6).
7. **Android first (10.5).** `chrome://inspect` over USB from Windows gives full DevTools, including memory panels the page cannot read.
8. **Then an iPhone (10.6)**, either over USB via `ios-webkit-debug-proxy` or by sending the link to someone who has one. No emulator answers this: on a simulator, memory limits and `hardwareConcurrency` reflect the host.

## 5. What a result cannot support

- **No tier threshold.** The page sets none and proposes none. Which tier fits which budget is a judgement for a watched session.
- **A `CANDIDATE` signature is not a JIT discard.** An elapsed-time rise alone is not proof of a JIT discard (S4-PA-14). Read it beside heap telemetry. Where telemetry is `unavailable` — every iPhone — the cause cannot be attributed from the page alone.
- **`performance.memory` is not retained heap.** A page cannot force a collection, so the reading includes garbage not yet swept, and Chromium quantizes it. `tools/bench-simulation.js`'s retained-bytes figure, taken after a forced collection, and this one measure different things.
- **A V8 figure does not transfer to JavaScriptCore.** This is `tools/bench-simulation.js`'s caveat, and it holds on devices too: an Android result says nothing about an iPhone's capacity.
- **Main thread only.** The calculator runs Monte Carlo in a Worker; this page does not. Whether a Worker changes these figures is unmeasured. A Worker lane could be built, but its execution could not be verified here in a real browser, so it was not.
- **`DIFFERS` is a finding about the device's JavaScript engine, not about the page.** It means the device's floating-point results differ from Node's for the same plan, seed and path count. That matters to any cross-device reproducibility claim. It is recorded, not judged.

## 6. Open, for the owner

- **10.4** where to host the page.
- **10.5 and 10.6** the device runs.
- **10.7** each §6 figure as confirmed, revised or still unmeasured.
- **10.8 acceptance:** a reproducible Android measurement, and either iPhone evidence or an owned date/decision limitation.
- **The task gate:** the harness runs on a real Android device and produces a result.
- **Where results are kept.** A result is benchmark evidence: it belongs outside financial snapshots and outside `tools/baseline-*`.
- **Whether a Worker lane is wanted** before S6 task 5 reads these figures.
