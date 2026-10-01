# R42F — Claude's full-model audit: the standard every area auditor follows

## What is audited
A personal retirement-planning calculator. The engine is `src/engine.js` (one file); the input validator is
`src/scenario-validator.js`; the app shell is `src/app-shell.html` (it embeds the 2026 rules JSON, id `v2b-rules-2026`).
The audited source is **`s5aa-r42-source` = `c67c713`**, frozen at:
`<frozen c67c713 tree>`
(a `git archive`, with a `node_modules` junction). **Read and run that tree. Do not edit it, and do not touch any git repository.**

Windows 11, Node 24.17.0. No installs, no downloads. Network: WebFetch only, for primary legal sources (irs.gov,
law.cornell.edu / uscode.house.gov / ecfr.gov, ssa.gov POMS at secure.ssa.gov, cms.gov, azdor.gov, azleg.gov).

## The shared loader
`.../scratchpad/r42f/work/harness.js` (same folder as this file). `const h = require('<absolute path>/harness.js')` gives:
- `h.grid.basePlan({...})` and `h.grid.account(id, type, balance, extra)` — the R40 conservation-grid plan builder (the
  easiest way to build a clean plan; read `tree/audit/S5AA/R40/S5AA_R40_CONSERVATION_GRID/lib.js` for its options);
- `h.plan`, `h.account`, `h.run`, `h.values` — the R29 helper (`tree/audit/S5AA/R29/S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js`);
- `h.engine` (every export of `src/engine.js`, e.g. `runPlan`, `runScenario`, `estimateTaxes`), `h.validateScenario`,
  `h.RULES` (the 2026 rules), `h.defaults` (the app's default plan), `h.TREE`.

Model conventions you need: rows are labelled by their **closing** age (the first row is the opening balances, flows 0);
row k is tax year 2026 + k; the engine's birth year is 2026 − floor(age at the plan's start); a plan can open at a
fractional age, which makes its first row a partial year. For clean witnesses use zero return, inflation, fee, spending
and COLA unless the case needs them.

## Write only here
Your area folder: `.../scratchpad/r42f/work/<AREA>/`. Put every probe and reproduction script there (`repro-<AREA>-NN-*.js`,
`probe-*.js`). You may not be able to write `.md` files; **return your report as the text of your final message.**

## The standard for a finding
1. **A runnable reproduction** (a node script in your folder) whose plan passes `validateScenario` (valid) and returns
   `runPlan` status `ok` — unless the defect is a crash, a wrong refusal, or a validator/engine disagreement.
2. **A hand expectation** computed from the rule and the inputs, arithmetic shown — **never** read from another engine run.
3. **The law read at its primary source** (URL, and the operative words, short).
4. **Not already declared.** Before reporting, check the behaviour is not a declared convention, limit or decision in:
   `tree/MODEL_ASSUMPTIONS.md`, `tree/SPRINT_QUESTIONS.md`, `tree/RESULT_CONTRACT.md`,
   `tree/audit/S5AA/R40/S5AA_R40_UNREPAIRED_LIST_20260930.md`, `tree/audit/S5AA/R32/S5AA_R32F_CLAUDE_FULL_MODEL_AUDIT_20260929.md`
   and `S5AA_R32V_*` (findings already decided), `tree/audit/S5AA/R41/*` (task 6.5, R41's self-audit), and the files in
   `.../r42f/work/known/` (ChatGPT's R41F whole-model audit, its R41 audit, and R42's handover, prediction and self-audit).
   A declared behaviour is NOT a finding. A finding already repaired is not a finding — check that the repair holds instead.
5. **Priority:** P1 = a material household figure wrong (income, tax, balance, spending, success) in a plausible plan;
   P2 = wrong in a narrower or less material case, or a refusal/validation gap that silently changes a figure;
   P3 = wording, a disclosure, or a figure off by a rounding step.

Be honest and exact. Label anything you suspect but could not confirm as an **unconfirmed suspicion**, with what you tried.
Do not inflate: one well-proven finding beats five guesses. Do not report the same defect twice.

## Where to look hardest
- **Cross-feature cases** — ChatGPT's R41F found five defects by combining features: work stopping inside a row, two
  spouses on different clocks, a death inside a row, a claim before full retirement age, a partial first or last row, a
  joint versus single return. Construct such combinations deliberately.
- **What changed since R32F** (R33 to R42): tax and contributions, Social Security, cash flows and life events, later-year
  indexing (R36), vesting, the Rule of 55, QCD conventions, the end-age refusal (R41), the R42 repairs themselves.
- **Mirrored code paths** (a figure computed in two places that must agree), and **validator versus engine parity**.

## Your report (the final message), in this shape
```
# <AREA> — R42F area report
## Method  (what you read, what you ran, how many cases)
## Findings
### <AREA>-01 (P?) — <one-line title>
- Reproduction: work/<AREA>/repro-....js  (how to run; what it prints)
- Inputs: ...
- Expected (hand): ... arithmetic ...
- Actual: ...
- Rule: <citation + URL + operative words>
- Why it is not declared: <files checked>
## Checked clean   (each item: what, how, result)
## Unconfirmed suspicions
## Not checked
```
