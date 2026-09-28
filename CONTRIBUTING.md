# Working agreement

Commits and pull requests are the units of implementation and of audit. **Claude implements; ChatGPT reviews,
independently, examining the source read-only and publishing only its own reports by a report-only pull request; the owner
decides and merges.** Nothing here replaces the project's decision records (see the
README): where they speak, they win.

## Branches

| branch | use |
|---|---|
| `main` | the reviewed line. Changes arrive only by pull request, with the `gate (windows, node 24.17.0)` check green. **This is a rule we keep, whether or not GitHub enforces it:** the repository is public on the Free plan, where branch protection is available once the owner turns it on. So: nobody pushes to `main` directly, nobody merges a pull request whose check is not green, and nobody force-pushes `main` or moves an `s5aa-*` tag |
| `sprint/<name>` | a sprint's working line (today `sprint/r2-t03-t07-r4f1-20260909`) |
| `repair/<finding-id>-<slug>` | one audit finding's repair, e.g. `repair/sa18-01-carryover-worksheet` |
| `setup/<topic>` | tooling and documentation with no financial behaviour change |
| `records/<topic>` | audit records only (`audit/`), with no source, test or tool change |
| `policy/<topic>` | a change to the working rules or this agreement only, merged by the owner before it takes effect |
| `audit/chatgpt/<round>-<short sha>` | **ChatGPT's only branches:** one external audit report under `audit/S5AA/RNN/` (and a reproduction script beside it), nothing else (`audit/S5AA/WORKING_RULES.md` §3) |
| `audit/<round>-review` | an auditor's notes for a round, if written into the repository. Notes only, never source changes |

## Tags

Tags record facts that were checked. **A tag never certifies accuracy by itself.** Tags are annotated, and never moved
or reused without the owner's explicit direction.

| tag | set when | message must name |
|---|---|---|
| `s5aa-rNN-source` | a round's package has been verified file by file against a commit | the manifest commit, the package name and SHA-256, the gate result, the date |
| `s5aa-rNN-audited` | the external audit of that source has returned and its result is recorded | the audit record, its verdict as written, the open findings |
| `s5aa-closed` | the sprint's closeout gate is met and the owner has said so | the close record and the closeout-check result |

Tags set before 2026-09-28, including `s5-u4-successor-control` (an S5 capture's recorded commit), are in the private
archive this repository was copied from, not here.

## A change, start to finish

1. **Branch** from the commit you mean to change, and name it as above.
2. **Tests first.** A financial change gets a test whose expectation is **computed by hand**, with the arithmetic in a
   comment, before the code changes. A test that compares two engine runs proves only consistency.
3. **One commit per task.** Keep setup commits apart from model repairs.
4. **Run the gate**, `npm test`, and read its last line. `GATE PASSED` is the only pass.
5. **Open a pull request** into `main` using the template. Draft until the gate is green and the description is
   complete.
6. **Review:** ChatGPT reads the diff at the stated base and head commits and publishes its findings (format below) in
   a report-only pull request. Claude answers each finding in its own response file, with a reproduction and a commit,
   or with evidence that it does not reproduce. Neither edits the other's document.
7. **The owner merges.** Nobody else does.

## An audit round, start to finish

1. The round's repairs land, one commit per task, each with the gate green.
2. The source is verified (the package, re-cut from that commit, matches its manifest file by file) and tagged
   `s5aa-rNN-source`.
3. A **records commit** adds `audit/S5AA/RNN/`: the cover note, response, self-audit, handover, anything for review,
   and the evidence scripts. It comes *after* the source commit, because a document cannot name the commit that
   contains it. `audit/S5AA/README.md` and `PACKAGES.md` are updated in the same commit.
4. One pull request carries both. The auditor reviews the code at the tag, and reads the round's documents in its
   folder.
5. The auditor publishes its report in a **separate report-only pull request** from an `audit/chatgpt/...` branch. The owner
   merges it; Claude lists it in the index with the next round's records.

## Rules that keep the numbers honest

- **Never weaken a test to make it pass.** If a fixture's premise changed, re-fixture it *by intent* and say why in the
  test and the commit.
- **Output that moves must be explained.**
  - Golden fixtures (`node tests/generate-golden-scenarios.js`) are regenerated only after reviewing the diff.
  - The control's movement is declared in `tools/control-candidate-prediction.json`.
  - A new expanded capture is registered in `tools/baseline-registry.json`.
  - The commit message names what moved and why.
- **Register every new test file** in `package.json`'s `test:list`.
- **Engine comments feed the requirements register.** An ID in a comment (for example `R10-06` or `SA18-01`) becomes a
  requirement that a test must guard. An engine comment citing a question that is still open makes closeout refuse.
- **Numbers must be finite.** Every numerical input and state transition either rejects NaN and infinity or handles
  them explicitly. Never let a nonfinite value pass silently.
- **Windows 11 with Node 24.17.0** is the envelope. Do not introduce a platform-specific runtime dependency.
- **Records with a maintainer:** `MODEL_ASSUMPTIONS.md`, `FEATURES.md`, the Roadmap and `S2_CARRIED_WORK_REGISTER.md`
  are maintained by eb (a separate Claude session). Propose text to eb; do not edit them in passing.

## Audit findings

Every finding, from any reviewer, states:

1. **Evidence:** what was observed, with the commit it was observed at.
2. **Affected code:** file and line at that commit.
3. **Reproduction:** a plan or command that shows it, with the expected and actual figures.
4. **Consequence:** which figures it moves, in which direction (tax over- or understated, cash created or destroyed),
   and how widely (members of the corpus, or "none reached").
5. **Proposed repair**, or the decision it needs.

A finding is closed only by a commit and a test, or by a recorded decision. A finding that checking shows cannot reach a
figure is **withdrawn openly**, with the reason.
