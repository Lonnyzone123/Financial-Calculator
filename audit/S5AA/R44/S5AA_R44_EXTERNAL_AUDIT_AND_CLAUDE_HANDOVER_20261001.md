NO-GO

# S5AA R44 external change audit and handover

**Audited source:** `s5aa-r44-source` = `06e551e3feb46d15cc3eff6dfc10f5e1f84e6460`. **Frozen comparison:** `s5aa-r43-source` = `5b8f0d53db0d6214c9a4c09add37538a687f3df5`. The R44 records head reviewed is `9ce336a6456417d4b7605ca3b948ac733989a726`; `src/`, `tests/`, `tools/` and the built HTML at that head are identical to the R44 source. Local review: Windows 11 Pro, Node 24.17.0. This report is the only change in its pull request.

## Determination

R43-01, R43-02 and R43-03 are **requalified** at R44. The revised R30 RMD test keeps its original subject: a taxable IRA or 401(k) distribution used for the spouse's HSA contribution counts toward that source's RMD. I found no new financial defect in the changed source paths. The local gate passed: **3,260 tests, 3,251 passed, 0 failed, 0 skipped, 9 authorized todos**.

R43-04 remains **open**. The written checklist exists, and the retrospective scans correct the missed published movements in R43 parts 3, 4a and 4b. The part 2 scan still names two Monte Carlo plans where only one published result moved, and it misses one of the four changed paths in the other. Its new category, “paths change; the published result may move,” does not predict an affected published case, field, direction or approximate size. That is narrower evidence than the owner's requested proof and A-01's prospective prediction rule. **R44-01** below blocks E10 and therefore administrative GO. An owner decision to accept this narrower stochastic prediction contract could change that disposition; it has not been made in the R44 records. GO would be administrative only, with no release or household reliance qualification; milestone closure, the `s5aa-closed` tag and S5b remain the owner's decisions.

## Scope and checks

- I reviewed the cover note, handover, prediction checklist and record, retrospective proof and scripts, self-audit, changed engine and contract, new R44 tests, revised R30 test, source identity and the exit gate. The source tags were dereferenced to the full commits above. The exact R44 source and records head have no differences in the executable model, tests, tools or built HTML.
- I ran `npm test` locally at the source-identical records head. The gate ran all 432 declared/discovered files and reported the figures above. I ran `node audit/S5AA/R44/prediction/retro/compare_retro.js`: part 2 named **2**, measured **1**, with `golden:monte-carlo-fixed-seed` named but unchanged in published output; parts 3, 4a and 4b each matched their measured plan sets exactly. `git diff --check` passed before this report was added.
- The built HTML SHA-256 independently hashes to `720834cd9e695c50023963582070b92a94d0fdf9425b21d42f55ed3a85a2811d`, matching the handover and harness pin. I inspected the raw final-candidate browser record under `audit/S5AA/R44/e15/`: it identifies this artifact, Windows/Chromium 152, 75 Worker/main plan comparisons, 70 import/CSV cases, fault/fallback cases and four concurrent Workers. I did **not** personally rerun that browser session. It supports E15's administrative condition, not financial correctness.
- The R44 prospective expanded capture identifies exactly `seed:4` and `seed:13`, as predicted; `seed:4`'s lifetime tax increase is $2,768.18 as predicted. The 4.7 control records only `seed:4`, because it compares warning-list length rather than text. SA44-A accurately discloses this control-level overprediction. It is not an unpredicted output movement under A-01, but C8 should explicitly require inspection of each comparator before a control-level prediction.
- The HSA legal premise and 2026 family amount agree with [IRS Publication 969](https://www.irs.gov/publications/p969) and [Rev. Proc. 2025-19](https://www.irs.gov/irb/2025-21_IRB): the monthly limit ends with Medicare eligibility; the 2026 family base is $8,750, with an individual age-55 catch-up of $1,000. This model's per-row share and Medicare-at-65 assumption are disclosed; I did not treat them as exact calendar-month tax calculations.

## R43 repair rulings

| Prior finding | R44 evidence and ruling |
|---|---|
| **R43-01** | **Requalified.** `src/engine.js:176–183` prorates the planned HSA base and catch-up rooms as well as the request; `:219–222` caps the one-time route by the owner's pre-65 share after planned use. At 66, the $4,400 one-time witness moves $0; for a spouse turning 65 halfway through the row, both routes cap a $6,000 flowing request at **($8,750 + $1,000) × 0.5 = $4,875**. The pre-65 controls still move their expected amounts. |
| **R43-02** | **Requalified.** `src/engine.js:4026` passes the same latched `incomeStartFactors` to `transferRoom()` that the planned route receives at `:3964`. The $5,000 today-dollar employment stream pays **$5,000 × 1.10^10 = $12,968.71** at 65, so the $7,500 one-time IRA contribution is within compensation and moves in full. [IRS Publication 590-A](https://www.irs.gov/publications/p590a) supplies the compensation rule. |
| **R43-03** | **Requalified.** `src/plan-value-contract.json:59–61` gives match cap, match rate and profit sharing a minimum of zero. The validator returns `OUT_OF_RANGE` at the field path and the engine refuses with `SCENARIO_PLAN_VALUE_OUT_OF_RANGE` for all three negative witnesses. Zero and the $18,000 positive match/profit-sharing control remain valid. |
| **R43-04** | **Partially addressed, not requalified.** The C1–C8 checklist is written and was committed before R44's source edit. Parts 3, 4a and 4b of the R43 retrospective proof match their measured plan sets. Part 2 has the remaining published-result overprediction and imperfect path classification described in R44-01. R44's prospective expanded prediction is accurate, with a disclosed 4.7 comparator mistake, but it does not prove the part 2 method has been corrected to A-01's published-output standard. |

## R44-01 (P2, prediction control) — R43 part 2's corrected scan still cannot predict published movement

**Evidence and reproduction at `06e551e`.** Run `node audit/S5AA/R44/prediction/retro/compare_retro.js`. Its part 2 line says `named 2, measured 1`, and identifies `golden:monte-carlo-fixed-seed` as the extra. The independently captured path comparison in `prediction/retro/path_level_check_d11017f_b131aeb.txt:2–6` says that plan had **4 of 500 paths change but identical aggregate rows and success rate**; the actual mover, `expansion:monte-carlo-sensitive-band`, had **6 of 500 paths change and different aggregate output**. The scan flagged 3 of the golden plan's 4 changed paths, missing path 390, and flagged 10 band paths although only 6 changed. Parts 3, 4a and 4b each have zero misses and zero extra plans in the same comparison.

**Affected code and requirement.** The retrospective tax scan at `audit/S5AA/R44/prediction/retro/tax_corpus_scan_v2.js:67–70,138–148` tests per-path threshold/withdrawal-order exposure and names the entire plan when any path is flagged. Checklist C4 at `audit/S5AA/R44/S5AA_R44_PREDICTION_CHECKLIST_20261001.md:28–34` deliberately recasts the expected published effect as “may move.” But `S5AA_TASK_CHECKLIST.md:319` (A-01) requires pre-edit affected cases and fields, independently justified direction and approximate magnitude, and unaffected controls; `:259` requires the predicted-versus-actual record. The owner's R44 cover asks for proof that corrected scans would have predicted **what actually moved** in R43. At the published-result level, the hand-computed expected set is **one** plan, the band member; the scan's reported set is **two**. A path-level exposure condition alone does not decide whether a changed path reaches a published median row or success rate.

**Consequence and reach.** No R44 household figure is shown wrong by this finding. The proposed proof overstates the R43 part 2 published-movement set by one of its 71 corpus plans, and its path list is not exact for either named Monte Carlo plan. It leaves the same class of prospective forecast uncertainty that R43-04 identified, so E10 cannot be marked met on the present evidence. This is a process/safeguard finding, not a claim that the R43 tax repair should be reverted.

**Proposed resolution.** Keep the existing raw captures and prediction record. Add a pre-edit aggregate-level prediction for the R43 part 2 trees, using the actual Monte Carlo quantile and success-rate selection to name the published rows/fields and an approximate direction or magnitude; show why the golden plan is an unaffected published-output control while the band member moves. Verify the scan against all 500 paths, including golden path 390, or explain why an exposure scan may intentionally be a superset while a second stage determines actual movement. Then run the same method prospectively on a held-out output-moving change. If the owner instead chooses to permit “published result may move” as the stochastic prediction standard, record that explicit A-01/E10 exception and its scope; the current A-10 exception ends at R39.1.

## Exit gate at R44

These statuses carry prior administrative evidence where R44 has no contrary movement. “Met” is not a household-reference certification. A-09 still excepts E2, E7 and E14, and A-10 applies only to R29–R39.1.

| Line | Determination |
|---|---|
| E1 | Met for the R43-01 to -03 repairs; inherited repair dispositions stand. |
| E2 | Not met, with residual uncertainty accepted under A-09. |
| E3 | Met: R44 has pre-repair red witnesses and hand-derived green results; inherited reproduction record stands. |
| E4 | Met on the recorded mirror and settlement evidence; R44 does not change those paths. |
| E5 | Met on inherited corrected-remedy decisions; the new HSA and compensation witnesses pass. |
| E6 | Met on the existing result contract; the R44 shared numeric bounds are mirrored by validator and engine. |
| E7 | Enforcement deferred to S5b task 4 under A-09; flagged entries remain unqualified. |
| E8 | Met: r22 remains registered and r23 preserves the two R44 expanded-corpus movements. |
| E9 | Met: local Windows 11/Node 24.17.0 gate, 3,260/3,251/0 failures/0 skips/9 authorized todos. |
| **E10** | **Open:** R43-04's requested corrected-scan proof remains incomplete at published-output level (R44-01). R44's prospective expanded prediction is accurate, with SA44-A's control-level overprediction disclosed. |
| E11 | Met on inherited X-row routing; no S5b/S6 item is declared closed here. |
| E12 | Met on the enumerated inherited residual list; R43-01 to -03 are repaired. R44-01 is a process finding requiring disposition, not an undisclosed model limit. |
| E13 | The handover reports closeout-check 12 accepted, zero refused; no contrary result found. |
| E14 | Built artifact hash verified; A-09's rendered-disclosure exception remains. |
| E15 | Raw final-candidate browser and comparator records support the administrative line, with the one-desktop limitation stated above. |
| E16 | Inherited rejected-hunt and campaign accounting stands. |
| E17 | R44 documents landed; the HSA and IRA legal premises above were checked against primary IRS material. |
| E18 | Prior whole-model second-pass requirement remains met by the R42F/R43 audit chain; this R44 review is a change audit. |

**Handover:** preserve the R44 financial repairs and r23 baseline. Resolve R44-01 and R43-04 against the published-output prediction standard, or obtain an explicit owner amendment for stochastic forecasts; correct C8's comparator inspection instruction so SA44-A does not recur. Then rerun the gate, control and expanded comparisons, artifact hash check and final-candidate browser task 6.5 before requesting another GO determination.
