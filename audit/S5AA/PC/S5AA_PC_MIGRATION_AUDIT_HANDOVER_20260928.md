# S5AA PC — audit of the move to this repository

*Written by Claude, 2026-09-28 (local, UTC−7), for the owner to send to ChatGPT. It follows the notice of 2026-09-28
(`audit/public-copy/PUBLIC_COPY_NOTICE_TO_CHATGPT_20260928.md` in the private repository), which asked for this audit.
Every figure below was measured on Windows 11 / Node 24.17.0 at the commits named.*

## 1. What to audit

| | repository | ref | tree |
|---|---|---|---|
| **source** | `Lonnyzone123/investment-calculator` (private, to be archived) | `main` at `ee9757d` | `66438ca` |
| **copy** | `Lonnyzone123/Financial-Calculator` (this repository, private until this audit is recorded) | `main` at `8396626` | `873baa4` |

`8396626` is this repository's first commit and has no parent. Its message lists every change.

**The question:** is every difference between the source and the copy one of the kinds listed in §3, and does every
figure that moves come only from one of them? In §6 I say where I think the risk is.

Please number findings **PC-NN**, with P1–P3 severities and the five-part format of
`audit/S5AA/WORKING_RULES.md` §5. Cite files and lines at `8396626`, and cite `ee9757d` for the source side. Publish
the report in the usual report-only pull request, on a branch named `audit/chatgpt/pc-8396626`, under
`audit/S5AA/PC/`. This repository will be public: name the owner as "the owner", and include no email address,
account detail or personal path.

## 2. The whole difference, file by file

`audit/S5AA/PC/pc_compare.js` compares the two refs through git objects only, so line-ending settings can't change a
result. The replaced name is a command-line argument, so it doesn't appear in this repository; the owner's cover note
gives it.

```
node audit/S5AA/PC/pc_compare.js <source clone> ee9757d <copy clone> 8396626 --name <name from the cover note>
```

Its output at these refs:

| class | files |
|---|---|
| source | 1,310 |
| copy | 566 |
| only in the source (left out) | 747: 452 `audit/`, 212 `archive/`, 53 at the root, 14 `reference-trees/`, 7 `Handover temp/`, 5 `fixtures/`, 2 `src/`, 2 `tests/` |
| only in the copy (added) | 3: `CREDITS.md`, `LICENSE`, `tests/lib/historical-source.js` |
| identical bytes | 392 |
| identical once the name and "the owner" are read as one placeholder | 143 |
| **other changes** | **28**, listed in §3 with the number of lines that still differ |

## 3. The kinds of difference

### 3.1 Left out (747 files)

- **Process records:** `audit/` (452 files), `archive/` (212) and `Handover temp/` (7).
- **At the root (53 files):**
  - 36 dated handover, brief and audit documents;
  - 16 package `.sha256` sidecars;
  - `SHA256_MANIFEST.txt`.
- **`reference-trees/` (14 files):** the engine that captured the stored control (`e157733`). Its sources hold the name
  17 times, in comments. `tools/historical-replay.js` verifies every declared input byte for byte against the hashes
  the control capture recorded, so no redacted copy could replay. The owner chose to leave the directory out (§3.4).
- **The S&P Dow Jones Indices dividend-history data (9 files):**
  - `src/ported/schd-history.js` and `src/ported/schd-history-data.json`;
  - `tests/ported/schd-history.test.js` and `tests/ported/schd-history-adversarial.test.js`;
  - five `fixtures/` files: `schd-history-data.json`, two projection fixture files and their two generators.

  Its terms don't allow redistribution. **No figure should move:** nothing in `src/engine.js`, `src/app-shell.html`,
  `build.js` or any other module requires `schd-history`. At `ee9757d` the only code that loads it is its own two test files; the other mentions are prose, the two Python
  generators that wrote the data, and `tools/test-classification.json`.
  Every other "schd" in the code is the name of an asset bucket in the ported models and holds no index data. The
  notice had expected this removal to move results; measured, it moves none.

### 3.2 The name (143 files changed only by it; 11 more also have the §3.5 edits)

The name becomes "the owner":
- 1,016 uses in 164 files, plus 48 in `audit/S5AA/WORKING_RULES.md`;
- "The owner" at a sentence start;
- "an owner decision" for "a <name> decision".

A second pass lower-cased 11 places where a wrapped line began mid-sentence. In
`tools/requirements-register.json` (a generated file), 31 lines hold the name, and each summary is cut to a fixed
length. Because "the owner" is longer than the name, 28 of those summaries now end a few characters earlier. That
accounts for all 56 differing lines the script reports there: 28 lines on each side.

### 3.3 The default age

The app's default plan starts at **30** (it was 29.5), self and spouse: `src/app-shell.html` line 480 and the two form
fallbacks on line 529. The built `investment-calculator-v2c.html` changes the same way.

**The tests keep 29.5.** `extractDefaultPlan()` in `tests/lib/golden-scenario-defs.js` sets `profile.age` and
`profile.spouseAge` to 29.5 after reading the app's default. That function is the one every corpus builder uses:
`tools/capture-baseline.js`, `tools/corpus-invariant.js`, `tools/historical-replay.js` and
`tests/lib/schema-catalogue.js`.

Why: at 30 everywhere, 26 tests failed. 22 of the 70 corpus plans copy the default plan directly, so their input
fingerprints moved even though their results didn't. Some tests read the default plan by their own regular expression,
not through `extractDefaultPlan()`. They now see 30, and every one of them passes. **Please check that none of them
should have seen 29.5.**

### 3.4 Tests that read history the copy doesn't have

- **`tests/baseline-provenance.test.js`.** Its history checks need the 25 commits the stored baselines record, and all
  25 are in the private archive only.
  - A new test asserts that all 25 or none are present, never some.
  - The history checks run where they are present. Where none are, they assert that absence, with `PRESENT` equal to
    `[]`.
  - Measured: in the copy, 0 of 25 present; in a worktree of the private repository, 25 of 25 present, and all 8 tests
    run in full and pass there.
- **`tests/lib/historical-source.js`** (new), used at the top of 11 tests in:
  - `tests/historical-replay.test.js` (6);
  - `tests/historical-replay-inputs.test.js` (2);
  - `tests/reference-tree-archive-replay.test.js` (2);
  - `tests/control-corpus.test.js` (1).

  It decides whether the capturing engine is available from the two sources themselves: `git cat-file` for
  `e157733...`, and the `reference-trees/` directory. It does not ask the tool under test. Only when both are absent
  does a test stand down, and first it asserts that `tools/historical-replay.js` returns BLOCKED, naming both the
  missing commit and the missing tree. **A present but wrong source still fails.** In the private repository's worktree
  the engine is present, and all 29 tests in those four files ran in full and passed.

### 3.5 Wording fixes found in review

Found by eb's review of its files and by the sweep that followed:
- 16 gendered pronouns that referred to the owner, reworded by hand;
- 2 sentence starts capitalised;
- 11 labels that read "owner <name>" and became "owner the owner", now "for the owner".

These are the non-name lines in `DEVICE_BENCHMARK.md`, the `S100`, `S4`, `S5`, `S5AA` and `S6` checklists,
`S2_CARRIED_WORK_REGISTER.md`, `SIMULATION_LOG.md`, `SPRINT_QUESTIONS.md`, `tools/carry-forward-schedule.json` and
`tools/closeout-task-map.json`, and some of those in `audit/S5AA/WORKING_RULES.md`.

### 3.6 Public-repository files

- **Added:**
  - `LICENSE` (MIT);
  - `CREDITS.md`, for the historical returns (Damodaran), CPI-U (BLS), Social Security COLAs and mortality (SSA) and
    the 2026 rules sources.
- **Replaced:**
  - `README.md`: a not-financial-advice notice, the history of this copy, the status and the new test counts;
  - `audit/S5AA/README.md`: a short note on where the earlier records are.
- **Updated:**
  - `CONTRIBUTING.md`: branch protection is available on a public repository, and tags from before the move are in the
    archive;
  - `audit/S5AA/WORKING_RULES.md`: a dated "Moved" note, the new repository name, and "public" in §2 and §8;
  - `package.json` and the root entry of `package-lock.json`: licence `ISC` becomes `MIT`.

### 3.7 Regenerated, to match the above

- `investment-calculator-v2c.html`, rebuilt, with its pin in `tests/lib/harness.js` updated. Each rebuild adds a
  history paragraph there.
- `tools/requirements-register.json`: the name and summary lengths (§3.2).
- `tools/test-classification.json`: the two removed test files.

## 4. Evidence

At `8396626`'s tree, on Windows 11 / Node 24.17.0:

| check | result |
|---|---|
| `npm test` in the build copy | **GATE PASSED**: 2883 tests, 2874 passing, 0 failing, 0 skipped, 9 authorised todo |
| the same on a fresh clone (with this machine's `core.autocrlf=true`), check-only, nothing regenerated | **GATE PASSED**, the same counts; `git status` clean before and after |
| `node tools/closeout-check.js` | accepted 12, refused 0, errors 0 |
| requirements register / test classification | up to date / up to date |
| expanded corpus capture on that clone, diffed against `tools/baseline-20260926-s5aa-expanded-r17.json` | **IDENTICAL**, corpus hash `4ea4bc93...` |
| `node tools/corpus-invariant.js check ... --spec tools/corpus-spec-expanded.json` | PASS, 7 separate checks, none failed |
| a clone of this repository from GitHub | tree `873baa4`, identical to the tree gated above |
| search of `8396626` for the owner's names, email address and user path | none |

The source's gate, for comparison, run at `608e922` (whose tree `66438ca` is `ee9757d`'s): 2889 tests, 2880 passing,
0 failing, 9 todo. The six fewer tests are the 7 in the
two removed `schd-history` test files, less the 1 added to `tests/baseline-provenance.test.js`.

## 5. Known limits

- **Citations into the private archive don't resolve here.** Documents cite pre-move commits, tags and `audit/...`
  paths. No tool in either repository checks commit or path citations. `tools/xref-scan.py` and
  `tools/groundrule-scan.py` cross-check task references between the eight sprint checklists only, and all eight are
  in the copy. A citation checker would be new scope, and none is proposed.
- **The historical replay and the provenance history checks run only in the private archive** (§3.4).
- **The dividend-fund history feature is absent** until its data is licensed or replaced.
- **Commit timestamps carry the owner's time zone** (UTC−7), as all git commits do.
- **S5AA is still NO-GO, and the R28 change audit is still open**, at `s5aa-r28.1-source` (`62e263d`) in the private
  repository. This move changes neither.

## 6. Where I would look first

1. The 11 guards and the provenance test (§3.4). Could any of them stand down where a source is present?
2. The default-age split (§3.3). Is there a test that should see 29.5 but reads the app's default by itself?
3. The S&P removal (§3.1). Is anything left that reads the removed files, or any fixture derived from that data?
4. The name replacement (§3.2, §3.5). Is anything left that names the owner, a pronoun or label that reads wrong, or a
   replacement inside code rather than text?
