# S5AA R41 — task 6.5, the desktop-browser check, for E15

*Written by Claude, 2026-09-30 (Arizona, UTC−7). Evidence for ChatGPT's E15 determination, as its R40.1 report asks: "Arrange
and record task 6.5 on the final candidate, explicitly covering the actual browser Worker, main-thread comparison,
exception and raw export … Bring the SHA-bound evidence back."* **This is not the post-S6 phone campaign.** It is the
desktop-browser smoke check that task 6.5 names, on one Windows desktop.

## 1. The candidate

| | |
|---|---|
| final candidate | **`s5aa-r41-source` = `984197c`**: `s5aa-r40.1-source` (`978a6e4`) plus R41's one repair (§5) |
| built artifact | `investment-calculator-v2c.html`, SHA-256 **`7e2e5aaf31f86a97080c0488a7d5e6905253ec9a8d01ac855cc26929486f43f8`**, 979,417 bytes; the pin in `tests/lib/harness.js` at `984197c`; `node build.js` at `984197c` reproduces it byte for byte |
| the Worker's source | built by the app at run time from its own function list; SHA-256 `6ebe4adefce4f35a7e59de963f4983e492d2ac78f6326f6a6b04ec7a7d7d1e77` (504,699 characters at `978a6e4`, whose Worker source hashed `9b61fbd8…`) |
| also checked | `978a6e4`, the source ChatGPT audited (artifact `498e6b740e3dc7ebd3451740a5b91c88e0897f856406ff5881431ee89af33d93`, also reproduced by a rebuild), before the repair. Every result below holds on both, except where §4 says otherwise |

A-04: "6.5's desktop-browser smoke runs on the rebuilt, hash-pinned candidate. If later work changes that artifact or the
exercised behaviour, repeat the affected check on the final candidate." The check ran on `978a6e4`, found the defect R41
repairs, and was **repeated in full on `984197c`** with the same scripts.

## 2. The environment

- **Windows 11 Pro** (10.0.26200), 32 logical processors. Node v24.17.0 for the reference hashes.
- **The browser:** the Claude desktop app's built-in browser pane, **Chromium 152.0.7977.130**. User agent:
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Claude/2.16120.0
  Chrome/152.0.7977.130 Safari/537.36 MSIX`. A secure context (`isSecureContext` true), so `crypto.subtle` hashed in
  the page.
- **Served** from a clean worktree of the candidate by `e15/server.js`: read-only, GET only, `127.0.0.1:8741`, no
  directory listing. At the start of each recorded run, the page fetched itself and hashed its own bytes; the SHA-256 matched the pin.
- **Not covered:** a stock Chrome or Edge. Claude tried the Chrome extension for the owner's own Chrome, and it was not
  connected, so this evidence rests on the one Chromium build above. The owner can rerun the same scripts in any browser
  (§8).

## 3. What was run, and how

Everything in the page is instrumentation from `audit/S5AA/R41/e15/`, evaluated after the app loaded. **No source file
was changed for the check.**
- `harness.js` records the app's real Worker traffic, by wrapping `window.Worker` so that each Worker the app creates
  is a real one that is also listened to. It captures a download's bytes in memory and writes nothing to disk. It
  imports plans through the app's own **Restore backup** input. Two faults can be injected, each named in its own error
  message: a Worker whose `runScenario` throws, or one whose script fails to load, and `Math.pow` throwing on the main
  thread. The engine is `Math.pow`'s only caller in the app (0 uses in `src/app-shell.html`, 23 in `src/engine.js`).
- `browser_checks.js` holds the checks, parts A to E, as run for the record.
- `canon.js` gives Node and the page one canonical serialization. It keeps `-0`, `NaN`, the infinities, `undefined`
  and array holes, and sorts keys; key order is compared separately. **`identity.runId` is the only field masked.** It
  is `fastHash(Date.now() + Math.random() + …)`, documented as free to differ across the Worker boundary
  (`tools/capture-baseline.js`), and its presence is recorded.
- **The plans:** the expanded corpus (71 plans: the five golden, 20 seeds, the targeted fixtures and the expansion),
  plus three refusals and one edge (§5). That is 75 in all, from `e15/dump_corpus.js`, JSON round-tripped so that Node,
  the main thread and the Worker start from the same bytes.
- **"Main thread"** means two things, both covered:
  - the app's own compatibility path, `plans.map(runScenario)`, reached by removing `window.Worker`;
  - the Worker's exact source text evaluated on the main thread, for a full-precision comparison of every plan.

## 4. Results on the final candidate, `984197c`

Run on 2026-09-30 at 5:42 pm (Arizona). Raw: `e15/browser_results_984197c.json`; Node's reference:
`e15/node_results_984197c.json`.

| part | check | result |
|---|---|---|
| A | all 75 plans: the app's Worker source in a **real Worker**, and the same source on the main thread, full result hashed | **Worker = main thread on 75 of 75**, key order included. **Equal to Node on 72.** The other three are Monte Carlo plans (part E). The three refusals and the edge return the same refusal code in all three |
| B | all 75 plans through the app's **Restore backup**: the real Worker path (`background-worker`, "Background calculation complete"), then the real main-thread path (`compatibility`, "Calculation complete"), each **exporting the projection CSV** (the raw export) | **70 imported, 70 CSVs byte-identical** between the two paths. One Worker message per plan. Each of the 70 app Worker results equals the main-thread engine on the exact plan the app posted. **5 refused at import**, each by a validator error: the two refusals, the edge (`endAge (28.5) is before the current age (29.5)`), and two corpus fixtures that are already known (§6) |
| C | **exceptions**, on `golden:baseline` (simple) and `golden:monte-carlo-fixed-seed` (500 runs) | see below: every path behaves as designed on both plans |
| D | **compare mode**, four scenarios (baseline, Monte Carlo, historical 1929, a retired couple) | the app announced **4 background workers**; 4 posted, 4 received, each equal to the main thread; the active scenario's CSV is byte-identical in compatibility mode |
| E | the three plans that differ from Node | Worker = main thread in the browser on each. Against Node: 122, 27 and 107 numbers differ, the largest by **1.83 × 10⁻¹⁵** relative. **No integer, count, rate, string or boolean differs**: success rates 100, 100 and 85 and valid paths 500, 52 and 500, the same in both |

**Part C, the exceptions,** identical on both plans:

| case | what happened | projection and export |
|---|---|---|
| the Worker's `runScenario` throws | the Worker posted `error: Error: R41 injected Worker fault: runScenario threw`; the app fell back to the main thread (`compatibility`, "Calculation complete") | CSV byte-identical to the Worker run |
| the Worker's script fails to load | no Worker message; `onerror` fell back to the main thread (`compatibility`) | CSV byte-identical to the Worker run |
| both paths throw (the Worker fault and the main-thread `Math.pow`) | "Calculation stopped"; status "The projection could not be completed…"; the results page shows the **"Calculation error detected" card** (code `ENGINE_RUN_FAILED`), **no dollar figure, no table, an empty chart** | **CSV refused**: "No CSV exported: this scenario reported a calculation error (ENGINE_RUN_FAILED)…". The **debug export** carries `ENGINE_RUN_FAILED`, CRITICAL, the injected error text, and `computeMode` "compatibility" |
| recovery, faults removed | `background-worker`, "Background calculation complete" | CSV byte-identical to the first run |

**The console** showed exactly one error per both-paths run, the injected `Math.pow` fault. Its stack runs through the
app's real main-thread `runScenario` under `Array.map`. There was no other error.

**Why Node differs in part E, and why it is expected.** IEEE 754 requires correct rounding for `+ − × ÷` and `sqrt`, but
not for `log`, `cos` or `exp`. `e15/mathprobe.js` passes the same 200,000 inputs through each function:
- Chromium 152 and Node 24.17.0 **agree on `pow`** and differ on `log`, `cos` and `exp`, and so on `sqrt(-2·log x)`;
- the browser's Worker and main thread agree on every function.

The engine's Monte Carlo draw, `normal()`, calls `Math.log` and `Math.cos`. This is the property `S100_TASK_CHECKLIST.md`
task 4 records, with its plan for deterministic transcendentals after cutover. It is not a Worker-versus-main-thread
difference. The deterministic plans agree with Node exactly.

**On `978a6e4`,** the same scripts ran at 5:32 pm (`e15/browser_results_978a6e4.json`, `e15/node_results_978a6e4.json`)
and gave the same results with one difference:
- the edge plan was **accepted** at import;
- 71 CSVs were identical (where `984197c` has 70);
- the engine projected the edge backwards in all three: Node, the Worker and the main thread.

Part E's figures were measured there by the same comparison, and the same numbers came out, before it was added to the
script; `984197c`'s figure is the scripted one.

## 5. The repair R41 made, and why the candidate moved

The check on `978a6e4` found that a backup whose end age is before its starting age was restored and projected
backwards (rows at 29.5, then 28.5). The form cannot produce it. The owner decided **"Repair now"** on 2026-09-30.
- **Prediction (`03d6ed4`),** committed before the edit: no corpus plan reaches the refusal; control 4.7 zero
  unpredicted; the expanded capture equal to r20.
- **Repair (`984197c`):**
  - the engine refuses the plan as `SCENARIO_END_AGE_BEFORE_START`, with no rows;
  - the validator reports `END_AGE_BEFORE_START` as an error, so the import refuses the backup;
  - an end age equal to the start is still projected;
  - `RESULT_CONTRACT.md` records the code; `contractVersion` stays 5.
- **Witness:** `tests/audit-s5aa-r41-end-age-before-start-refused.test.js`, 6 cases. Before the repair its three
  refusal cases failed and its three controls passed (`prediction/new_test_against_4a31a28.txt`).

## 6. The other checks, each read from its output

| check | result |
|---|---|
| gate at `03d6ed4` (the prediction) | GATE PASSED: 3,146 tests, 3,137 pass, 0 fail, 0 skipped, 9 todo; closeout accepted 12, refused 0 |
| gate at `984197c` (the source) | GATE PASSED: **3,152** tests (the 6 new), 3,143 pass, 0 fail, 0 skipped, 9 todo; closeout 12/0/0 |
| control 4.7 at `984197c` | found 15,717, **unpredicted 0**, declared-but-not-found 0, problems 0; nothing to declare (53 declarations stay 53) |
| expanded capture at `984197c` | **equal to r20 in all 71 entry hashes**, input hash `1d91d673…` unchanged; no new baseline |
| the two import refusals already known | `seed:9` holds a transfer into a 401(k) from an HSA. The validator refuses it (`TRANSFER_INTO_WORKPLACE_PLAN`) and the engine declines the transfer (`TRANSFER_INTO_WORKPLACE_REFUSED`), R29's design. `targeted:spouse-cola-income` uses the income type `"recurring"`, recorded as `SPRINT_QUESTIONS.md` Q29. Part A compares both at the engine level |

## 7. A correction to the R40 relay

`audit/S5AA/R40/S5AA_R40_RELAY_TO_EB_20260930.md` cites three commits that are not on `main`. They are the first forms of
two commits amended before they were pushed:
- its header ("checked against the code at `2881ceb`") should read **`9fd61c2`**;
- §1(e) "healthcare inflation is validated (`434f19c`)" should read **`c300508`**;
- §1(e) "the app states the Part D premium and the care cost's growth (`2881ceb`)" should read **`9fd61c2`**.

The prose is unchanged. eb placed the corrected commits in Q172. The file is left as merged, and this is its correction.

## 8. To reproduce

1. In a clean worktree of the candidate, generate the plans and Node's hashes:
   `node audit/S5AA/R41/e15/dump_corpus.js <tree> <out>`, and for part E
   `node audit/S5AA/R41/e15/dump_mc_raw.js <tree> golden:monte-carlo-fixed-seed seed:9 expansion:monte-carlo-sensitive-band`.
   Run both from the output folder, which also holds the e15 scripts.
2. Serve the tree: `node server.js <tree> 8741`. It serves the tree at `/` and its own folder at `/r41/`.
3. Open `http://127.0.0.1:8741/investment-calculator-v2c.html` in a desktop browser.
4. In its console, evaluate `canon.js`, `mathprobe.js`, `harness.js` and `browser_checks.js` from `/r41/`.
5. Run `await R41.env()`, then `checkA()` to `checkE()`, one at a time. `window.R41_RESULTS` holds the record.

`corpus.json` is not committed (262 KB, regenerated in step 1). Nothing is downloaded or written by the page.

## 9. What this does not establish

- It is one desktop browser on one machine, and it is not the post-S6 phone campaign.
- It checks that the Worker and the main thread compute the same thing, that the exceptions are handled, and that the
  raw export is identical. It does not check the figures' correctness against an outside reference.
- The partial-row tax convention, the wage-tax clamp and A-09's exclusions stay as disclosed.
- Claude observed three items and did not repair them (`S5AA_R41_SELF_AUDIT_20260930.md`):
  - the error card's wording;
  - an end age equal to the start, which projects one row;
  - the two known import refusals.
