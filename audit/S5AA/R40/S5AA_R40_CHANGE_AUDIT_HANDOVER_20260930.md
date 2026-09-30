# S5AA R40 — change audit and GO/NO-GO status-determination handover

*Written by Claude, 2026-09-30 (local, UTC−7), for ChatGPT, on the owner's request of 2026-09-30: "give a handover file for chatgpt to
decide GO/NO_GO status". S5AA is **NO-GO** today, by ChatGPT's latest determination. Since 2026-09-25 that determination is ChatGPT's
(`audit/S5AA/WORKING_RULES.md` §1, §7). Declaring the milestone closed, the `s5aa-closed` tag and the go for S5b stay the owner's.*

**Source: `s5aa-r40.1-source` = `978a6e4`.** The change runs from `s5aa-r39.1-source` (`a2ee714`) to `978a6e4`. Between the two, `main`
also took the R39.1 records, your R39.1 audit (#33) and eb's R39.1 placement (#34), all documents (`00dbb4b`).

**Why `.1`.** R40 was first tagged `s5aa-r40-source` = `4a2250a`. Before merge, the owner had the pull request audited ("you do a
audit on #35 before we merge"), and three independent reviews found defects in two of R40's own repairs (§3.3). The fixes follow
`4a2250a` on the same branch, and the source to audit is `s5aa-r40.1-source`. `s5aa-r40-source` stays where it is, as tags do; do not
audit it on its own.

## 0. What is asked

In one report, on a branch named `audit/chatgpt/r40.1-978a6e4`:

1. **Audit the R40 change** (§3). Findings are numbered **R40-NN**.
2. **Determine S5AA's status, GO or NO-GO, at `978a6e4`,** against the exit gate E1 to E18 (`S5AA_TASK_CHECKLIST.md`) as amended by
   A-01 to A-10:
   - Does A-10 give E10 what it needs?
   - Is every other line true, or dispositioned explicitly?
   - For any line that blocks, what exactly is missing?

   Put **GO** or **NO-GO** on the report's first line.

A GO under A-09 is administrative. It is not release qualification and not household reliance, and it qualifies no
`outsideSupportedDomain` result (A-09 (4)). This document is meant to stand alone: the private archive the repository was copied
from is cited where it must be, but its files do not open here.

## 1. How the status got here

| when | what | status it set |
|---|---|---|
| 2026-09-25 | ChatGPT's **R24G2** determined **GO** under A-09 at `d67b618` (private archive, PR #30, `42ffe14`) | GO |
| 2026-09-25 | ChatGPT's whole-model **R24F** found R24F-01 to -04 (P2): "reopens S5AA's bounded administrative status" (archive PR #31, `43d9043`) | NO-GO |
| 2026-09-26 | R25, R26 and R27 each repaired the last findings; ChatGPT's R25, R26, R27 and R27F audits each found more (R25-01/-02, R26-01, R27-01, R27F-01/-02) | NO-GO |
| 2026-09-26 | R28 and R28.1 repaired R26-01, R27-01 and R27F-01/-02. **No change audit of R28 or R28.1 was ever returned** | — |
| 2026-09-28 | Moved to this public repository (a copy of the archive's `ee9757d`). ChatGPT's **PC** audit accepted the migration; its full-model **PCF** audit of the copy (whose engine is R28.1's) found PCF-01 to -03 | NO-GO |
| 2026-09-28 to 30 | R29 to R39: each round repaired the previous audit's findings; each ChatGPT change audit found new ones (below) | NO-GO |
| 2026-09-30 | ChatGPT's R39.1 audit: "R39-01 requalified; no new R39.1-NN findings". It "does not … determine the separate S5AA exit gate" | unchanged: NO-GO |

**R24G2's per-line assessments at `d67b618`** are summarised in §5, from the archive's report. §5 also says what has changed on each
line since.

## 2. Every ChatGPT finding since R24G2, and where it stands

| finding | sev | repaired | requalified by ChatGPT |
|---|---|---|---|
| R24F-01 to -04 | P2 | R25 (`95bf5d0`, `aeba9a0`, `9a40562`, `4b7d516`) | R25 audit: the "four targeted repairs reproduce" |
| R25-01, R25-02 | P1, P2 | R27 | R27 audit: "requalifies the two exact R25 witnesses" |
| R26-01 | P2 | R28 `6938519` | **none: no R28 change audit** |
| R27-01 | P1 | R28 `56c8847` | **none: no R28 change audit** |
| R27F-01, -02 | P1 | R28.1 `227635e`, `5a5cb39` (and `c480f72`, `62e263d`) | **none: no R28.1 change audit**. PCF audited the whole model on the same engine and found PCF-03, a gap in the R28 dividend repair |
| PCF-01, -02, -03 | P1, P1, P2 | R29 (`fc9c9d3`, `7c93220`, `9a95768`) | R29 audit: "accepted **as those witnesses**", not every combination. PCF had asked that requalification include account floor, ceiling and identifier controls; R29's audit does not say those were run |
| R29-01, R29-02 | P1 | R30 | R30 audit: requalified. R29-02 on its original zero-return witness; the general case became R30-01 |
| R30-01 | P1 | R31 `8afe16d` | **ambiguous.** R31's audit: "not fully requalified". R32's audit reports its seven cases passing but does not name it in its verdict; its residual became R31-01, which R32 accepted |
| R30A-01, -02, -03 | P1, P2, P2 | R32 (`8ef84d3`, `0413792`) | R32 audit: accepted within stated scopes |
| R31-01 | P1 | R32 `8ef84d3` | R32 audit: accepted |
| R32V-01, -02, -03 | P2, P3, P2 | R35 `efda32d`; R33 (reference `b5d749c`, engine `998af8a`); R34 | **not by ID.** The combined R33–R37 audit gave per-round verdicts ("no new blocker" for R33, R34, R36, R37) and reran the tax sweep and Social Security reference, 0 mismatches, but named no R32V or SA32F ID |
| Claude's SA32F items (R32F) | — | R33 to R37 | **not by ID**, as above |
| R35-01 | P1 | R38 `be30de3` | R38 audit: accepted within its tested scope |
| R38-01 to -05 | P1, P2 ×3, P2 cond. | R39 (`8a51aaf`, `4995761`, `252faba`, `f6dbb2a`, `85fe621`) | R39 audit: the five witnesses "reproduced at their expected values" |
| R39-01 | P2 | R39.1 `a2ee714` | R39.1 audit: requalified |

**Also open on the record:**
- R38's audit asked that the R32F conservation grid be updated before its flags are read. R40 does it (§4).
- The survivor's COLA timing after a death before eligibility remains unqualified (R39.1 audit).

## 3. What R40 changed

The owner's decisions of 2026-09-30:
- **"Close gaps first":** close the exit-gate gaps before this determination;
- **A-10:** amend E10's record for R29 to R39.1;
- **"Repair all four now":** repair the four undisclosed limits Claude's R40 review found;
- after the audit of the pull request, **"Revert and disclose"** the partial-row tax repair and **"All of them"** for the other fixes.

### 3.1 The gaps

| commit | what | evidence |
|---|---|---|
| `47a7333` | Tests: your R39.1 boundary cases kept (a death exactly at the claim, 12,480; a younger spouse, 18,000) | both fail on `96ce07f` |
| `8fb0aca` | **E8:** r18, the first baseline recorded in this repository (the corpus at `00dbb4b`), and `tests/baseline-provenance.test.js` holding a baseline recorded here to this repository's history (archive commits keep their all-or-none rule) | two clean captures, byte-identical |
| `d4fd3a9` | **Validator repair, found by Claude:** `validateScenario()` accepted an adjustable debt with a reset age but no reset rate or no payoff age, which `runPlan()` refuses (`SCENARIO_DEBT_RESET_TERMS_MISSING`, R37) | `tests/audit-s5aa-r40-validator-debt-reset-terms.test.js` |
| `03a0ca7` | **E17:** `RESULT_CONTRACT.md` records the 14 codes R29 to R37 added without a word. `contractVersion` stays 5, as for R25's refusal | each read against its introducing commit |
| `6dccadb` | **E14:** R36's "Later tax years" card read as the page renders it | `tests/audit-s5aa-r40-later-tax-years-card-rendered.test.js` |
| `e54125a` | **A-10** (E10) and **the prediction record**, committed before any engine edit | `S5AA_R40_PREDICTION_RECORD_20260930.md` |

### 3.2 The four repairs, as first built

| commit | repair | predicted against measured |
|---|---|---|
| `8f20d90` | **1. The long-term-care cost grows at healthcare inflation** from the plan's start, like the pre-Medicare cost; the insurance benefit stays as entered | `seed:1`, `seed:3`, `seed:6`: **equal to the cent in every care row**. `seed:16` was predicted to move and does not: its surplus policy is `spend`, so the cost displaces spent surplus (a miss, explained) |
| `d1572b1` | **2. Each person on Medicare pays the 2026 Part D base beneficiary premium**, $38.99 a month (CMS memo of July 28, 2025, read; 42 CFR 423.286(c), read). The IRMAA surcharge had been charged on a premium never charged | exact where the strategy does not react; `seed:16` only at about 1e-10 |
| `607101a` | **3. A partial row taxed as its share of a year** | exactly the predicted members; row-1 tax +2,809.17 against about +2,797.19 (a second-order sale, explained). **Reverted in §3.3** |
| `d51d30d` | **4. An RMD reads the age reached in the row** | no corpus movement, as predicted. **Corrected in §3.3** |
| `4a2250a` | r19, then the source `s5aa-r40-source` | twice, byte-identical |

### 3.3 The audit of the pull request, and its fixes

Three independent reviews of `f4183b9` found the defects below. Every one was reproduced before it was fixed. They are listed with the
reviewers' checks in `S5AA_R40_SELF_AUDIT_20260930.md` (AUD35-01 to -13). The fixes were **predicted before the engine was edited
again**, in `S5AA_R40_PREDICTION_ADDENDUM_AUDIT_FIXES_20260930.md` (`20e7a41`).

| commit | fix | measured |
|---|---|---|
| `b97fe0a` | **Repair 3 reverted** (AUD35-01, P1). Its premise, "a year earning at the row's rate", annualized one-time amounts too: a $100,000 expense in a tenth-of-a-year row was taxed $56,958, against $20,221.85. It also left the IRA deduction phase-out unscaled. A partial row is again taxed with the whole year's thresholds, **disclosed**. The proper rule, which counts recurring income at its rate and one-time items once, goes to the engine rebuild | exactly the four golden plans return to their values before the repair (3,747 control differences); `tests/audit-s5aa-r40-partial-row-whole-year-convention.test.js` pins the disclosed behaviour and the one-time case |
| `3fbe9dc` | **Repair 4 corrected** (AUD35-04, P1). It had read the spouse's calendar age against `rmdStartAge()`'s whole-age birth year (`2026 − floor(age at start)`), and at the 1959/1960 line the first RMD fell in a year neither reading gives. It had also moved the self's own Joint and Last Survivor figure (P2). **The age reached in row k is now the engine's birth year counted forward**, `floor(ageAtStart) + k`. For the self it is `floor(age)`; for a spouse it is the pre-R40 figure whenever the self starts on a whole age. The defect it repairs: with a fractional self start, a spouse whose fraction is smaller than the self's reached the start a year late | no control or corpus movement, as predicted. Witnesses: self 72.5 / spouse 72.3 gives 0, 3,773.58, 3,773.58, 3,758.25 (before R40: 0, 0, …); the 1960 line starts at 75 in the right year; the self's Table II figure is back to 4,784.69 |
| `7cd1a1a` | **Malformed debt reset terms** (AUD35-07, P2; it predates R40). A string reset age such as `"35"` had passed both refusals: 0% after the reset, or a RangeError. The engine now refuses it (`SCENARIO_NONFINITE_DEBT_RESET_AGE`), and the validator types the reset rate and age | no movement |
| `c300508` | **Healthcare inflation validated** (AUD35-10). Type; an error at −100 or below and above 100; a warning outside 0 to 20; missing when health or care costs are on. The engine refuses a non-number, as R25's parity test requires; that test caught the first form | no movement |
| `9fd61c2` | **The app states what R40 charges** (AUD35-09): the Part D premium to the cent on the Rules page, and "Healthcare inflation (also grows the care cost)" and "Annual care cost (today's dollars)" on the form, read rendered | wording only |
| `978a6e4` | **r20**, the corpus after the fixes | **exactly as predicted, entry hash for entry hash:** the five members repair 3 had moved equal their r18 entries, and the other 66 equal r19's |

**Net against R39.1:**
- R40 moves the corpus only through the long-term-care cost (`seed:1`, `seed:3`, `seed:6`) and the Part D premium (`seed:10`,
  `expansion:s5aa-r6-gap-survivor-health-roth`, and `seed:16` at the last binary digit).
- The RMD correction and the validation fixes move nothing.

## 4. Evidence at `978a6e4` (Windows 11, Node 24.17.0)

- **The gate:** 3,146 tests, 3,137 passed, 0 failed, 0 skipped, 9 authorized todo (the eight revival contracts and
  ACCOUNT-17-8), `GATE PASSED`; closeout 12 accepted, 0 refused, 0 errors. Every R40 commit's gate, read from its log, is in the
  self-audit.
- **Control test 4.7:** 15,717 differences, **0 unpredicted**, 0 declared-but-not-found. The declarations are 51 at `a2ee714` and 53
  now: repairs 1 and 2. Repair 3's was restored to its earlier state by the revert, and repair 4 moves nothing.
- **The corpus:** r20 at `9fd61c2`, 71 entries, invariants 7/7.
  - The settlement codes `TAX_SETTLEMENT_MISMATCH` and `QUOTE_SETTLEMENT_UNVERIFIED` appear in no entry.
  - **Nine** entries carry `outsideSupportedDomain`: r16's ten less `seed:19`, which no longer draws a Roth before 59½ since R36
    (`cf643a8`).
- **The conservation grid,** brought up to date (`S5AA_R40_CONSERVATION_GRID/`, R32F's left as it was), at the final engine, 3 seeds ×
  1,000 plans:
  - **0 leak flags**;
  - 2 to 4 wage-tax-clamp rows per seed, R35's disclosed mechanism, worst $750.50.
  - R32F's own grid, unchanged, gave 80 leak flags at `00dbb4b` (before the repairs).
  - The grid reads the engine's own `retiredPaySpent`, so it shows money is conserved, not that that amount is right.
- **The R33 tax sweep:** 13,815 returns, 0 mismatches. **The R34 Social Security reference:** 25 cases, 0 mismatches.
- **A desktop-browser smoke check** at `4a2250a`: the built app, served locally, completed guided setup and computed a projection with
  its cards, and logged no console errors. Only wording changed in the app since, and it is read rendered by test. This is not the
  comparator exercise and not a second machine.
- **Your repro scripts, each run at `978a6e4`:**

| script | result | why |
|---|---|---|
| R30, R31, R32, R33–R37 (with the checkout path), R38, R39.1 | pass | R38 prints every expected figure. Its R38-03 Roth balance is 11,565, the known $435 tax draw on the match |
| PC boundary probes | stops at "PCF-01 reproduced" | written to show the defect; the repaired figures print (AGI 10,000, tax 2,000, total 8,000) |
| R39 | stops at its assertion of the old `[20196, 18360, 18360]` | written to show R39-01; it now observes `[18360, 18360, 18360]` |
| R32V | stops at line 50, `engineCarry === referenceCarry` | the engine gives the lawful 8,150; the old R32F reference still says 10,000. R33 published the corrected reference |
| R29, R30A | the R29-02 basis plan: AGI 199,000 (expected 200,000), net worth 181,987 (expected 181,722) | R33's `fd80c78`: a $1,000 401(k) deferral from stream wages is now excluded (IRC 402(e)(3)). $1,000 × (24% + 2.5%) = $265. Declared in that commit, which named these scripts |

## 5. The exit gate, line by line

The **R24G2 at `d67b618`** column summarises ChatGPT's own report in the archive.

| line | R24G2 at `d67b618` | since then, and the evidence at `978a6e4` |
|---|---|---|
| **E1** | met; G9 (task 1.3), G3's partial-year half and X09a explicitly held | Every ChatGPT finding since is repaired (§2). G3's partial-year half: R39 gives the contribution limits a partial row's share; **the partial row's tax stays whole-year, disclosed** (R40 reverted its repair). **Your call** whether G3 is still held |
| **E2** | not met; accepted residual uncertainty (A-09 (3)) | unchanged |
| **E3** | met | Every finding since was reproduced at a named commit before repair (each round's handover). R40's witnesses each failed first; the audit's findings were each reproduced before their fixes |
| **E4** | met | The settlement codes are silent on r20 (checked). Ground rule 4's pairs: `estimateTaxes` and `taxSegmentLocal` read the same row rules and `capitalLossLimit()`; `rmdFor` and `preTaxConvertible` both go through `rmdObligations()`, the one function the corrected repair 4 changes |
| **E5** | met within the decided scope | unchanged |
| **E6** | met | `RESULT_CONTRACT.md` §7a is unchanged by R29 to R40 (byte-identical). The Monte Carlo invalidation rule is unchanged |
| **E7** | not met; A-09 defers enforcement to S5b task 4; flagged results unqualified | r20: 9 flagged entries. Enforcement is still deferred |
| **E8** | met | The corpus moved in R29 and R32 to R36 **without a registered capture** until r18 (R40). r18, r19 and r20 preserve the states at `00dbb4b`, `d51d30d` and `9fd61c2`; r17 is kept. **The intermediate states between r17 and r18 are recorded only as each round's diff**, not as captures |
| **E9** | met at `d67b618` | met at `978a6e4` (§4). ACCOUNT-18-8 left long ago; ACCOUNT-17-8 and the eight revival contracts remain, named |
| **E10** | met | **A-10:** for R29 to R39.1, traced-and-declared (control 35 → 51, originals kept) stands in, disclosed as not a prediction. R40 predicted first (`e54125a`, then `20e7a41` for the audit fixes), then measured (§3). Two first-build misses are recorded (`seed:16`; a second-order AGI change). **Whether A-10 is enough is yours** |
| **E11** | met | unchanged |
| **E12** | met | Before R29: the archive's list, as you accepted it. R29 to R40: `S5AA_R40_UNREPAIRED_LIST_20260930.md`, one A-07 label and a disclosure location each, including the partial-row tax |
| **E13** | met for the carry inventory; "does not prove E7" | Closeout is 12/0 at every gate. `tools/closeout-task-map.json`'s review note says the S5AA nodes were relayed to the plan owner and not treated as reviewed |
| **E14** | partly met; explicit exception (A-09 (3)) | The shipped HTML is rebuilt at every source commit and its pin moved. R37's cards, R36's card and R40's wording are read rendered. **The owner, 2026-09-30:** "The UI will be rebuilt. but we can use the old ui as a reference". So the rendering work E14 excepts belongs to the rebuilt UI, and the current app is its reference |
| **E15** | narrowed in the archive's close record §1 to a clean-checkout replay; cross-machine carried to S5b | r18, r19 and r20 were replayed in two clean worktrees. A desktop-browser smoke check ran. **The comparator exercise (6.5) did not run**, and there is no second machine |
| **E16** | met | unchanged |
| **E17** | met | Relays to eb every round, and placements merged (#28, #31, #34). R40's relay is written; eb places it after merge. The contract text is in, with R40's refusal. Citations were checked at primary sources, but two were cited before being read (SA40-05); both hold |
| **E18** | met | Your R39.1 and R40 audits are change audits. The last whole-model audits are PCF (`8396626`) and R32V (of Claude's R32F) |

## 6. Known limits, carried

- **What R29 to R40 knowingly left unrepaired:** `S5AA_R40_UNREPAIRED_LIST_20260930.md`, one label and a disclosure location each. Among
  them:
  - the partial-row tax (whole-year thresholds; a rule that tells recurring income from one-time items goes to the rebuild);
  - the wage-tax clamp;
  - the row-opening ages for the QCD, 59½, 65, Medicare and filing (the owner deferred them to the engine rebuild);
  - the LTC insurance benefit not being inflated (Claude's choice, told to the owner, not ruled on).
- **A direct call of the exported `simulatePlanRows()` leaves the last row's rules in place.** This predates R40, no production caller
  makes one, and it is not fixed (AUD35-13).
- **E7 and A-09:** the nine flagged results are unqualified reference values.
- **Documents:** `audit/S5AA/WORKING_RULES.md` §7's "current state" and §9's prompt are stale: they still describe R24G2 as awaiting a
  determination. This handover replaces them for this request. A policy-only correction is the owner's to order.
- **Not in the audited source:** eb's R40 placement, which comes after merge.

## 7. How to report

- **First line:** GO or NO-GO.
- **Findings:** R40-NN, five-part format, P1–P3, with file and line at `978a6e4` and hand-worked expectations.
- **Where:** report only, on `audit/chatgpt/r40.1-978a6e4`.

A passing gate is not certification.
