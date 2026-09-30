# S5AA R40 — change audit and GO/NO-GO status-determination handover

*Written by Claude, 2026-09-30 (local, UTC−7), for ChatGPT, on the owner's request of 2026-09-30: "give a handover file for chatgpt to
decide GO/NO_GO status". S5AA is **NO-GO** today, by ChatGPT's latest determination. Since 2026-09-25 that determination is ChatGPT's
(`audit/S5AA/WORKING_RULES.md` §1, §7). Declaring the milestone closed, the `s5aa-closed` tag and the go for S5b stay the owner's.*

**Source:** `s5aa-r40-source` = `4a2250a`. **The change:** from `s5aa-r39.1-source` (`a2ee714`) to `4a2250a`. Between the two, `main`
also took the R39.1 records, ChatGPT's R39.1 audit (#33) and eb's R39.1 placement (#34), all documents (`00dbb4b`).

## 0. What is asked

In one report, on a branch named `audit/chatgpt/r40-4a2250a`:

1. **Audit the R40 change** (§3): the four engine repairs, the validator repair, the baseline, the contract text and amendment A-10.
   Findings are numbered **R40-NN**.
2. **Determine S5AA's status, GO or NO-GO, at `4a2250a`,** against the exit gate E1 to E18 (`S5AA_TASK_CHECKLIST.md`) as amended by
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
- **"Repair all four now":** repair the four undisclosed limits Claude's R40 review found.

| commit | what | evidence |
|---|---|---|
| `47a7333` | Tests: your R39.1 boundary cases kept (a death exactly at the claim, 12,480; a younger spouse, 18,000) | both fail on `96ce07f` |
| `8fb0aca` | **E8:** r18, the first baseline recorded in this repository (the corpus at `00dbb4b`), and `tests/baseline-provenance.test.js` holding a baseline recorded here to this repository's history (archive commits keep their all-or-none rule) | two clean captures, byte-identical |
| `d4fd3a9` | **Validator repair, found by Claude:** `validateScenario()` accepted an adjustable debt with a reset age but no reset rate or no payoff age, which `runPlan()` refuses (`SCENARIO_DEBT_RESET_TERMS_MISSING`, R37). It now reports `DEBT_RESET_TERMS_MISSING` | `tests/audit-s5aa-r40-validator-debt-reset-terms.test.js` |
| `03a0ca7` | **E17:** `RESULT_CONTRACT.md` records the 14 codes R29 to R37 added without a word: 6 warnings, 4 refusals (`calculationErrorCode`) and 4 validator codes. `contractVersion` stays 5, as for R25's refusal | each read at `a2ee714` against its introducing commit |
| `6dccadb` | **E14:** R36's "Later tax years" card read as the page renders it | `tests/audit-s5aa-r40-later-tax-years-card-rendered.test.js` |
| `e54125a` | **A-10** (E10) and **the prediction record**, committed before any engine edit | `audit/S5AA/R40/S5AA_R40_PREDICTION_RECORD_20260930.md` |
| `8f20d90` | **Repair 1.** The long-term-care cost grows at healthcare inflation from the plan's start, like the pre-Medicare cost; the insurance benefit stays as entered | hand-worked: 100,000 × 1.05^10 = 162,889.46 |
| `d1572b1` | **Repair 2.** Each person on Medicare pays the 2026 Part D base beneficiary premium, $38.99 a month (CMS memo of July 28, 2025, read; 42 CFR 423.286(c), read). The IRMAA surcharge had been charged on a premium never charged | 202.90 × 12 + 283 + 38.99 × 12 = 3,185.68 |
| `607101a` | **Repair 3.** A partial row (a fractional first or last row) is taxed as its share `s` of a year: each annual dollar amount of the tax rules × `s` (`partialYearRules()`), which is `s` × the whole-year tax on the income annualized | a $60,000 pension: half a year 3,058.75, was 1,767.50 |
| `d51d30d` | **Repair 4.** An RMD's start and Uniform Lifetime divisor read the age the owner reaches in the row (Pub. 590-B: "use your age as of your birthday in 2026"). A spouse with a mid-row birthday had skipped their first RMD year | 3,773.58, 3,773.58, 3,758.25; was 0, 3,773.58, 3,773.58 |
| `4a2250a` | **r19**, the corpus after the four repairs | twice, byte-identical |

**Predicted and measured (A-01 as written).** Each repair was predicted in `e54125a` before `src/engine.js` was edited:

| repair | predicted | measured |
|---|---|---|
| 1. LTC | `seed:1`, `seed:3`, `seed:6`, `seed:16`; row spending up by a formula, exact for strategies that do not react | `seed:1`, `seed:3`, `seed:6` **equal to the cent in every care row**. **`seed:16` does not move**: its surplus policy is `spend`, so the cost displaces spent surplus (a miss, explained) |
| 2. Part D | `seed:10`, `seed:16`, `expansion:s5aa-r6-gap-survivor-health-roth`; +467.88 × people × retired duration | exact where the strategy does not react. `seed:10`'s constant-percent strategy lowers its own spending in five rows, as predicted it might. `seed:16` differs only at about 1e-10 |
| 3. Partial row | the four golden plans at 29.5 and the band member; row-1 taxes about +2,797.19; AGI unchanged | exactly those members. Row-1 taxes **+2,809.17**; the 11.98 is the sale that pays the extra tax realizing $68.48 of gain, so **AGI does move**, at the second order (a miss, explained) |
| 4. Spouse RMD | no corpus member reaches it | **no control or corpus movement** |

Control test 4.7 at `4a2250a`: 15,717 differences, **0 unpredicted**. The declarations grew from 51 to 54, and the first 51 are
unchanged.

## 4. Evidence at `4a2250a` (Windows 11, Node 24.17.0)

- **The gate:** 3,140 tests, 3,131 passed, 0 failed, 0 skipped, 9 authorized todo (the eight revival contracts and ACCOUNT-17-8),
  `GATE PASSED`; closeout 12 accepted, 0 refused, 0 errors.
- **The corpus:** r19 at `d51d30d`, 71 entries, invariants 7/7.
  - Eleven members move against r18, all predicted (the registry note names each with its lifetime tax and ending net worth).
  - The settlement codes `TAX_SETTLEMENT_MISMATCH` and `QUOTE_SETTLEMENT_UNVERIFIED` appear in no entry.
  - **Nine** entries carry `outsideSupportedDomain`: r16's ten less `seed:19`, which no longer draws a Roth before 59½ since R36
    (`cf643a8`).
- **The conservation grid,** brought up to date (`audit/S5AA/R40/S5AA_R40_CONSERVATION_GRID/`, R32F's left as it was), at the final
  engine, 3 seeds × 1,000 plans:
  - **0 leak flags**;
  - 2 to 4 wage-tax-clamp rows per seed, R35's disclosed mechanism, worst $750.50;
  - the old grid on the same code gave 80 leak flags.

  The grid reads the engine's own `retiredPaySpent`, so it shows money is conserved, not that that amount is right.
- **The R33 tax sweep:** 13,815 returns, 0 mismatches. **The R34 Social Security reference:** 25 cases, 0 mismatches.
- **A desktop-browser smoke check:** the built app served locally completed guided setup and computed a projection with its cards,
  and logged no console errors. This is not the comparator exercise and not a second machine.
- **Your repro scripts, each run at `4a2250a`:**

| script | result | why |
|---|---|---|
| R30, R31, R32, R33–R37 (with the checkout path), R38, R39.1 | pass | R38 prints every expected figure. Its R38-03 Roth balance is 11,565, the known $435 tax draw on the match |
| PC boundary probes | stops at "PCF-01 reproduced" | written to show the defect; the repaired figures print (AGI 10,000, tax 2,000, total 8,000) |
| R39 | stops at its assertion of the old `[20196, 18360, 18360]` | written to show R39-01; it now observes `[18360, 18360, 18360]` |
| R32V | stops at line 50, `engineCarry === referenceCarry` | the engine gives the lawful 8,150; the old R32F reference still says 10,000. R33 published the corrected reference |
| R29, R30A | the R29-02 basis plan: AGI 199,000 (expected 200,000), net worth 181,987 (expected 181,722) | R33's `fd80c78`: a $1,000 401(k) deferral from stream wages is now excluded (IRC 402(e)(3)). $1,000 × (24% + 2.5%) = $265. Declared in that commit, which named these scripts |

## 5. The exit gate, line by line

The **R24G2 at `d67b618`** column summarises ChatGPT's own report in the archive.

| line | R24G2 at `d67b618` | since then, and the evidence at `4a2250a` |
|---|---|---|
| **E1** | met; G9 (task 1.3), G3's partial-year half and X09a explicitly held | Every ChatGPT finding since is repaired (§2). G3's partial-year half: R39 (part-year limits) and R40 (partial-row tax) now cover the partial row. **Your call** whether G3 is closed or still held |
| **E2** | not met; accepted residual uncertainty (A-09 (3)) | unchanged |
| **E3** | met | Every finding since was reproduced at a named commit before repair (each round's handover). R40's four witnesses and the validator witness each failed first |
| **E4** | met | The settlement codes are silent on r19 (checked). No mirrored pair was split |
| **E5** | met within the decided scope | unchanged |
| **E6** | met | `RESULT_CONTRACT.md` §7a is unchanged by R29 to R40. The Monte Carlo invalidation rule is unchanged |
| **E7** | not met; A-09 defers enforcement to S5b task 4; flagged results unqualified | r19: 9 flagged entries, named in its registry note. Enforcement is still deferred |
| **E8** | met | The corpus moved in R29 and R32 to R36 **without a registered capture** until r18 (R40). r18 and r19 preserve the states at `00dbb4b` and `d51d30d`; r17 is kept. **The intermediate states between r17 and r18 are recorded only as each round's diff**, not as captures |
| **E9** | met at `d67b618` | met at `4a2250a` (§4). ACCOUNT-18-8 left long ago; ACCOUNT-17-8 and the eight revival contracts remain, named |
| **E10** | met | **A-10:** for R29 to R39.1, traced-and-declared (control 35 → 51, originals kept) stands in, disclosed as not a prediction. R40 predicted first (`e54125a`), then measured (§3). **Whether A-10 is enough is yours** |
| **E11** | met | unchanged |
| **E12** | met | Before R29: the archive's list, as you accepted it. R29 to R40: `audit/S5AA/R40/S5AA_R40_UNREPAIRED_LIST_20260930.md`, one A-07 label and a disclosure location each. It includes R32F's unconfirmed suspicions that R40 did not examine |
| **E13** | met for the carry inventory; "does not prove E7" | Closeout is 12/0 at every gate. `tools/closeout-task-map.json`'s review note says the S5AA nodes were relayed to the plan owner and not treated as reviewed |
| **E14** | partly met; explicit exception (A-09 (3)) | The shipped HTML is rebuilt at every engine commit and its pin moved (`tests/lib/harness.js`). R37's cards and now R36's card are read rendered. R40's LTC and Part D changes have no card of their own; the A-09 exception covers them. **The owner, 2026-09-30:** "The UI will be rebuilt. but we can use the old ui as a reference". So the rendering work E14 excepts belongs to the rebuilt UI, and the current app is its reference |
| **E15** | narrowed in the archive's close record §1 to a clean-checkout replay; cross-machine carried to S5b | r18 and r19 were replayed in two clean worktrees. A desktop-browser smoke check ran (§4). **The comparator exercise (6.5) did not run**, and there is no second machine |
| **E16** | met | unchanged |
| **E17** | met | Relays to eb every round, and placements merged (#28, #31, #34). R40's relay is written; eb places it after merge. The contract text is in (R40). Citations were checked at primary sources, but SA40-05 cited two before reading them; both hold |
| **E18** | met | Your R39.1 and R40 audits are change audits. The last whole-model audits are PCF (`8396626`) and R32V (of Claude's R32F) |

## 6. Known limits, carried

- **What R29 to R40 knowingly left unrepaired:** `audit/S5AA/R40/S5AA_R40_UNREPAIRED_LIST_20260930.md`, one label and a disclosure
  location each. Among them:
  - the wage-tax clamp;
  - the row-opening ages for the QCD, 59½, 65, Medicare and filing (the owner deferred them to the engine rebuild);
  - R40's own two: the IRA and Roth phase-out ranges are unscaled in a partial row, and the LTC insurance benefit is not inflated
    (Claude's choice, told to the owner, not ruled on).
- **E7 and A-09:** the nine flagged results are unqualified reference values.
- **Documents:** `audit/S5AA/WORKING_RULES.md` §7's "current state" and §9's prompt are stale: they still describe R24G2 as awaiting a
  determination. This handover replaces them for this request. A policy-only correction is the owner's to order.
- **Not in the audited source:** eb's R40 placement, which comes after merge.

## 7. How to report

- **First line:** GO or NO-GO.
- **Findings:** R40-NN, five-part format, P1–P3, with file and line at `4a2250a` and hand-worked expectations.
- **Where:** report only, on `audit/chatgpt/r40-4a2250a`.

A passing gate is not certification.
