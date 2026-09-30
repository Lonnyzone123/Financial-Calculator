# Investment calculator

A retirement projection and simulation model: accounts, contributions, Social Security, pensions, federal and Arizona
tax, RMDs and QCDs, Roth conversions, capital gains on dollar cost basis, debts, other assets, survivorship, and
simple, historical and Monte Carlo return paths. It ships as **one self-contained HTML file** that runs locally in a
browser, and its engine also runs under Node for testing.

> **Not financial, tax or legal advice.** This is a planning model, provided as is, without warranty of any kind (see
> [`LICENSE`](LICENSE)). Its figures are estimates under the assumptions in
> [`MODEL_ASSUMPTIONS.md`](MODEL_ASSUMPTIONS.md), and its tax rules are 2026's, federal and Arizona only, carried into later
> years by the plan's own inflation and salary-growth rates standing in for the official indexes. It can be wrong. Check anything you act on with a qualified professional.

**Correct financial calculation comes before convenience.** Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before changing
anything, and [`docs/AI_REVIEW_INSTRUCTIONS.md`](docs/AI_REVIEW_INSTRUCTIONS.md) before reviewing.

## Licence and data

The code is under the [MIT licence](LICENSE). Data built into the calculator comes from the sources credited in
[`CREDITS.md`](CREDITS.md), under their own terms.

## History

This repository began on 2026-09-28 as a one-commit copy of a private development repository. The copy is the private
repository's `main` at `ee9757d`, with the changes listed in its first commit's message. Documents here cite commits,
tags and audit records from before that date. Those are in the private archive, not here. A test that reads that
history checks whether the recorded commits are present and stands down only when none of them are.

## Current status (2026-09-30)

- **S5AA is NO-GO and not closed.** Since 2026-09-25 ChatGPT determines the GO / NO-GO status, and every determination it
  has made since R29 has been NO-GO; its R32 and R39.1 change audits accepted their repairs and say they do not determine
  it.
- The latest merged round is **R40** (PR #35, merged 2026-09-30 at `54d6a9e`; source `s5aa-r40.1-source` = `978a6e4`),
  which closed the exit-gate gaps found on the way to a status determination. ChatGPT has not yet reported on it. The
  last round ChatGPT audited is **R39.1**, which repaired its R39-01; its change audit found no new finding. The round
  index is [`audit/S5AA/README.md`](audit/S5AA/README.md).
- **S5b has not started.** It needs the owner's own go.
- A passing test run is evidence for what the tests cover. It is not certification of the whole model.

The authoritative status and decision records:

| file | what it holds |
|---|---|
| [`S5AA_TASK_CHECKLIST.md`](S5AA_TASK_CHECKLIST.md) | the current sprint's plan of record |
| [`SPRINT_QUESTIONS.md`](SPRINT_QUESTIONS.md) | open and decided model questions |
| [`S2_CARRIED_WORK_REGISTER.md`](S2_CARRIED_WORK_REGISTER.md) | decided items not yet repaired (U2, Q45, Q54, …) |
| [`MODEL_ASSUMPTIONS.md`](MODEL_ASSUMPTIONS.md) | what the model assumes |
| [`FEATURES.md`](FEATURES.md) | what exists and where |
| [`RESULT_CONTRACT.md`](RESULT_CONTRACT.md) | the engine's output contract |
| [`ROADMAP_EXTERNAL_REVIEW.md`](ROADMAP_EXTERNAL_REVIEW.md) | the roadmap as reviewed |

How ChatGPT and Claude work together is in [`audit/S5AA/WORKING_RULES.md`](audit/S5AA/WORKING_RULES.md).
Audit rounds from R29 on keep their records under `audit/S5AA/`. Earlier rounds' records are in the private archive.

## Setup (Windows 11)

The supported envelope is **Windows 11 with Node 24.17.0** (npm 11). Other platforms are not a target.

```bash
npm ci
```

`npm ci` installs exactly what `package-lock.json` records. The only dependency is `jsdom` (dev), which the DOM tests
need. The gate fails if it is missing rather than skipping those tests.

## Testing

**The full gate**, about a minute on the reference machine (65 seconds at `0a38065`), and 10 to 15 minutes on the CI
runner:

```bash
npm test
```

`npm test` runs `tools/verify-test-gate.js`. It runs every registered test file, then checks the run itself: nothing
skipped, every todo authorised by name in `tools/test-exception-registry.json`, and the counts agreeing with one another.
**`GATE PASSED` on the last line is the only passing result.** On this repository's first commit it reports 2883 tests,
2874 passing, 0 failing, 0 skipped and 9 authorised todo.

**One file, while working:**

```bash
node --test tests/golden-scenarios.test.js
```

**A new test file** must be added to `package.json`'s `test:list`. The gate refuses an unregistered file.

**The expanded corpus (L7)**, by hand or in the `l7-expanded-corpus` workflow:

```bash
node tools/capture-baseline.js capture capture-expanded.json --composition expanded
node tools/corpus-invariant.js check capture-expanded.json --spec tools/corpus-spec-expanded.json
node tools/capture-baseline.js diff tools/baseline-20260926-s5aa-expanded-r17.json capture-expanded.json
```

## Building and running the app

```bash
npm run build
```

`build.js` assembles `src/app-shell.html`, `src/engine.js` and `src/scenario-validator.js` into
**`investment-calculator-v2c.html`**. Open that file
in a browser. Its SHA-256 is pinned in `tests/lib/harness.js`, so a rebuild that changes it must re-pin in the same
commit.

## Layout

| path | role |
|---|---|
| `src/engine.js` | the calculation engine (`runPlan`, `runScenario`; exported for Node) |
| `src/app-shell.html` | the UI, the tax and rules data (`v2b-rules-2026`), and the Web Worker's function list |
| `src/scenario-validator.js` | structural validation of a scenario |
| `tests/` | the test suite; `tests/lib/` holds shared helpers and the corpus definition |
| `tools/` | the gate, captures and baselines, the differential harness, registers, and `build-package.ps1` |
| `fixtures/` | oracle fixtures (independently generated expectations for the ported modules) |
| `reference/` | earlier handoff notes |

## Audit packages

`tools/build-package.ps1 -Name <name>` cuts a zip of the tracked files at `HEAD`, with a SHA-256 manifest and a
`.sha256` sidecar. It reproduces byte for byte from the same commit. Packages are not committed: `*.zip` is ignored.
The manifest (`SHA256_MANIFEST.txt`) is committed with each package.
