# Instructions for an AI reviewer of this repository

You are reviewing a retirement projection model whose figures people may plan their lives on. **Find what is wrong.**
Summarising what is right is not the job. **Examine the source read-only**, and never push changes to source, tests,
fixtures or records. ChatGPT publishes its own report through the **report-only pull request** that
`audit/S5AA/WORKING_RULES.md` §3 authorizes (an `audit/chatgpt/...` branch adding only that report); any other reviewer
records findings in a document for the owner.

This file is for any reviewer (ChatGPT through the GitHub connection, or a Claude session asked to audit). No
tool-specific instruction file (`AGENTS.md` or similar) exists in this repository, so there is nothing that could
conflict with this one. If one is added, it must defer to this file or replace it.

## Before you start

1. **Name the commits.** Every finding is against a commit, not "the code". For a pull request, use its base and head.
   For an audit round, use the commit the package manifest verifies against. The round's cover note names it, and so
   does the `s5aa-rNN-source` tag once one exists.
2. **Read the round's own documents first**, in `audit/S5AA/RNN/` (indexed in `audit/S5AA/README.md`): the cover
   note, the response, the self-audit, the handover, and any contract out for review. The working rules between the
   reviewer and Claude are in `audit/S5AA/WORKING_RULES.md`.
   They say what changed, what is deliberately not built, and which figures are **not reference values** yet. A
   disclosed limitation is not a finding. A limitation that is not disclosed is one.
3. **Check the gate** for that commit: the `gate (windows, node 24.17.0)` run and its `gate-log` artifact. A green gate
   is evidence for what the tests cover, nothing more. It runs on GitHub's `windows-latest` runner, which is **Windows
   Server 2025**, not Windows 11 (MAIN-01, R20). The Windows 11 qualification is the local gate each round records.

## Review priorities, in order

1. **Money created or destroyed.** Cash, balances or basis that appear or vanish without a recorded source or use.
   Earlier audits found cash settlement that discarded cash; look for that class again.
2. **Nonfinite values.** Any path where NaN or infinity reaches a figure, a comparison or a settlement check without being
   refused or handled.
3. **Tax and rule correctness against the source.** Check the IRS publication, form instructions or statute at the
   source. **Do not accept a legal claim, in the code or in a document, because it is stated with confidence** -- and that
   includes a claim that a rule is ABSENT. Claude's R18 self-audit declared a Publication 590-B rule (date-of-death
   valuation for distributions before death in the year of death) nonexistent after reading only a summary of the page;
   the external audit found it in the publication (R18-02). Absence is proved by searching the source text, not a summary.
4. **Order within a year.** The row's order of events (contributions, growth, dividends, spending, withdrawals,
   conversions, RMDs and QCDs, tax quote and settlement, deaths and succession) is defined by `simulatePlan()` in
   `src/engine.js`. **No standalone document states it; that is a known gap.** A change that reorders events must say so,
   and its tests must show the figures it moves.
5. **Eligibility and ages.** Account ownership, contribution limits, penalty ages (59½, rule of 55, 72(t)), RMD start
   ages and QCD eligibility must follow the recorded decisions (`SPRINT_QUESTIONS.md`, the S5AA records).
6. **Reproducibility.** Historical paths are deterministic. Monte Carlo is reproducible from its seed. Inputs trace to
   the rules data in `src/app-shell.html` (`v2b-rules-2026`) and `Resource Documents/`.
7. **Test strength.** A test that compares the engine with itself proves consistency, not correctness. Ask whether each
   financial assertion has an **independent** expectation: hand-computed, an oracle fixture, or a closed form.

## Invariants, and where they are enforced

| invariant | enforced by | limits to know |
|---|---|---|
| portfolio sources equal uses, every row of every path | `tests/reconciliation-invariant.test.js` (L4) | an identity catches only what it contains; a flow missing from both sides passes |
| household cash in equals cash out | `tests/household-ledger.test.js` | as above |
| net worth reconciles within a row | `tests/networth-reconciliation.test.js` (L4b) | |
| taxable basis is conserved across events | the self-audit's conservation script (1,133 runs at `6e8f31e`) | not a gate test; it sees only the events it probes |
| nonfinite input is refused | the scenario gate's `NONFINITE_*` codes and their tests | a new input field needs its own guard |
| the tax quote equals the committed settlement | `verifyQuoteObligation()`, which raises `QUOTE_SETTLEMENT_UNVERIFIED` | |
| closed-form cases are exact | `tests/mathematical-oracles.test.js` (L3) | a handful of zeroed cases |
| scenarios do not silently change | `tests/golden-scenarios.test.js` (L6) | stability only, not correctness |
| the control corpus moves only as declared | `tests/control-corpus.test.js` test 4.7, against `tools/control-candidate-prediction.json` | a declaration explains a move; it does not prove it right |
| the expanded corpus matches its baseline | the `l7-expanded-corpus` workflow (manual) | run on demand, not on every pull request |

## How to write a finding

Use the format in [`CONTRIBUTING.md`](../CONTRIBUTING.md#audit-findings): evidence at a commit, file and line,
reproduction with expected and actual figures, consequence (direction and reach), and proposed repair. Rank findings
by what they do to a household's figures, not by how hard they are to fix. Say plainly when you could not check
something, and why.
