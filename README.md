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

## Current status (2026-10-04)

- **S5AA is NO-GO and not closed.** Since 2026-09-25 ChatGPT determines the GO / NO-GO status. Its R44.1 audit (PR #51,
  merged 2026-10-01 at `c05208c`) determined GO for administrative close at `06e551e` (`s5aa-r44-source`). The owner then
  asked for an assumptions audit (AA1, 2026-10-03), decided the repairs, and R45 to R51 built them, changing the model after
  that GO. ChatGPT's audit of R46 to R51 (PR #66) was NO-GO on four P2 findings; its whole-model audit R51F (PR #68) added
  a fifth, **R51F-01**, the Social Security grace-year earnings test, which any positive job stream disabled for the whole
  row. **R52** (PR #69, merged 2026-10-04 at `3afbd53`, source `s5aa-r52-source` = `4e1bb95`) repaired the four, and added
  two cards for Roth warnings the app did not show. **ChatGPT's R52 audit** (PR #70, merged at `cbce0ce`) closed the four
  and verified the cards, but **determined S5AA NO-GO** at the R52 source: R51F-01 was still open, and it found two new P2
  findings that predate R52, **R52-01** and **R52-02**, in Restore backup (it silently lengthened a working-only horizon
  and rounded a valid transfer date out of its year). **R53** (PR #71, merged 2026-10-04 at `b446b1d`, source
  `s5aa-r53-source` = `2a1f5ba`) repairs R51F-01, R52-01 and R52-02, and refuses an end age before the primary's retirement
  age. **ChatGPT has not audited R53.** The determination stands as NO-GO, administrative only, under amendments A-01 to
  A-11. The expanded baseline S5b task 4 builds on is r30 (`tools/baseline-20261003-s5aa-expanded-r30.json`; R52 and R53
  left the corpus unchanged); control 4.7's corpus is `s5aa-r51-control`, with `s5-control` kept as its predecessor.
  Closing the milestone, setting `s5aa-closed` and starting S5b are the owner's, and none has been decided.
- The latest merged rounds are **R45** to **R53**. R45 gave each spouse their own retirement date. R46 made Monte Carlo
  draw one set of market shocks per year shared by every account, and the reserve the household's. R47 ended the
  enhanced senior deduction after 2028 and added the designated-Roth catch-up, IRC 4973's excise, the
  self-employment fixes and the HSA stop at Medicare. R48 grew Medicare premiums and added the inherited IRA for a
  young survivor, an Arizona community-property switch and the Arizona subtractions. R49 made spending flexibility respect
  the floor, added a long-term-care onset age, a PMI end age and a working-years check, and showed the engine
  disclosures the app had hidden. R50 added a Roth IRA basis ledger and an input for income received earlier in the
  first year. R51 applied the owner's follow-ups: flexibility off by default, one Medicare date, and a "plan offers Roth"
  checkbox. R52 and R53 then repaired what ChatGPT's audits of those rounds found (IRA excess room, QBI and a spouse's salary, an inherited-IRA rollover's basis, the Roth conversion ledger, the Social Security grace year, and Restore backup's changes to a valid plan). Before them, R42 to R44.1 repaired the five whole-model findings of ChatGPT's R41F audit and the 34 findings
  of Claude's own R42F audit. The round index is [`audit/S5AA/README.md`](audit/S5AA/README.md).
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
