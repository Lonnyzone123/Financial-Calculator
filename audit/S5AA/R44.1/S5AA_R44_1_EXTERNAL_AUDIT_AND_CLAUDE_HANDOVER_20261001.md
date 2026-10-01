GO

# S5AA R44.1 external audit and handover

**Determination:** S5AA is **GO for administrative close at R44.1**, under A-01 through A-11. This is not release or household-reliance qualification. Only the owner can close the milestone, set `s5aa-closed`, or authorize S5b.

**Audited source:** `s5aa-r44-source` = `06e551e3feb46d15cc3eff6dfc10f5e1f84e6460`. **R44.1 records head:** `894e0ff766c414643722e1b2bd96ef4ad020b067` (merged PR #50). I verified that `src/`, `tests/`, `tools/` and `investment-calculator-v2c.html` at that head are byte-identical to the source tag. The prior R44 report (PR #49) remains in the repository. This pull request changes only this external audit report.

## R44-01 and R43-04 ruling

**R44-01 is resolved under the owner's explicit A-11 exception, and R43-04 is requalified.** A-11 in `S5AA_TASK_CHECKLIST.md:409–433` changes the prospective prediction standard for **Monte Carlo plans only**: name the plan and all paths exposed under a necessary-condition test, say its published result may move, then compare actual changed paths and published output after the build. It explicitly permits an exposed path or named plan whose output does not change, but treats any unnamed changed path or unnamed published-result movement as a miss. Every non-Monte-Carlo plan retains A-01's affected fields, direction, approximate size and unaffected-control requirement. This is a real exception to the standard that blocked R44-01, not proof that the old published-result forecast was exact.

I independently reran `node audit/S5AA/R44.1/exposure_superset_check.js` against clean detached worktrees at `d11017f3523f21c49a5a684bb9ac0d599adf4f60` and `b131aebc194fd6816537d86e63ab908b029d5014`. The result matches the committed raw output:

| R43 part 2 Monte Carlo plan | Exposed paths | Actually changed paths | Published result |
|---|---:|---|---|
| `golden:monte-carlo-fixed-seed` | 5 of 500 | 4: 89, 174, 207, 390; all exposed | unchanged |
| `expansion:monte-carlo-sensitive-band` | 13 of 500 | 6: 125, 211, 219, 349, 377, 389; all exposed | moved |

These are the only two exposed Monte Carlo plans in the expanded corpus. I separately reran R44's `path_level_check.js` for the other two Monte Carlo members, `seed:9` (52 paths) and `seed:17` (24 paths): **zero paths changed** and their published results stayed equal. Thus the retrospective part 2 proof has no missed changed path or unnamed published movement in this corpus under A-11. R44 already verified exact published-plan sets for R43 parts 3, 4a and 4b.

I also reran `path390_check.js`. Golden path 390 first differs in row 59; the changed guard is encountered at age 87, but R44's reconstructed-state second stage reports the same withdrawal order under both tables and excludes that path. The R44.1 C4 revision at `audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md:22–36` correctly forbids an approximate-state stage from **removing** a path exposed by the necessary-condition test. The exposure test retains path 390. This establishes the correction on the two historical trees; it does not establish that every future exposure test will be necessary. Future rounds must check that condition against their own change and path seeding.

The C8 revision at `audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md:47–53` addresses SA44-A: before predicting a comparison level, the record must read how that comparator treats each field. For example, control 4.7 compares `limitWarnings` by length, while the expanded capture sees changed text. R44's pre-edit expanded prediction already named its two actual movers; the control-level overprediction is disclosed and is not an unpredicted movement under A-01.

**New findings:** none (`R44.1-NN` sequence empty). A-11 is limited and explicit, the revised checklist implements it, and the independently replayed R43 evidence meets its necessary-condition rule. No source or financial figure changed in R44.1.

## Verification and evidence boundary

- Local Windows 11 Pro / Node 24.17.0 `npm test` at the R44.1 records head: **3,260 tests; 3,251 passed; 0 failed; 0 skipped; 9 authorized todos; GATE PASSED**. The executable files are identical to the R44 source previously audited; this rerun checks their current checkout and registry state, not A-11's policy quality.
- The built HTML independently hashes to SHA-256 `720834cd9e695c50023963582070b92a94d0fdf9425b21d42f55ed3a85a2811d`, the unchanged R44 pin. R44's final-candidate browser evidence and r23 expanded baseline remain the applicable records. I did not rerun the browser, because R44.1 changed no executable or built file.
- The path replay used the R43 part 2 tree's `seed + 2i` and `seed + 2i + 1` streams, as the source at those commits does. It checked all paths in the four Monte Carlo expanded-corpus plans. It is a finite-corpus check of a retrospective proof, not a general guarantee about later Monte Carlo changes.

## Exit gate E1–E18 at R44.1

The R44 report's inherited evidence and exceptions remain in force where R44.1 did not change them. A-09 keeps E2's residual uncertainty accepted, E7's enforcement deferred to S5b task 4 with flagged results unqualified, and E14's rendered-disclosure exception. A-10 covers R29–R39.1 only. A-11 now governs Monte Carlo predictions from the R43-04 proof onward.

| Line | R44.1 determination |
|---|---|
| E1 | Met: R43-01 to -03 were requalified at R44; inherited repair dispositions stand. |
| E2 | Not met in its original form; residual uncertainty accepted by A-09. |
| E3 | Met on inherited pre-repair reproductions and R44's red/green witnesses. |
| E4 | Met on the inherited mirror and settlement evidence; no R44.1 source change. |
| E5 | Met on inherited corrected-remedy decisions; R44 repair witnesses remain passing. |
| E6 | Met on the existing result contract and aligned validator/engine refusals. |
| E7 | Enforcement deferred by A-09; flagged corpus results remain unqualified until S5b task 4. |
| E8 | Met: r22 is preserved and r23 registers R44's two expanded-corpus movements. |
| E9 | Met: the local Windows gate passed with 3,260/3,251/0 fail/0 skip/9 authorized todos. |
| **E10** | **Met under A-11:** the R43-04 part 2 path exposure is a superset of all changed paths; the other parts matched their actual movement; R44's prospective expanded prediction was accurate. C8 now requires comparator inspection. |
| E11 | Met on inherited X-row routing; nothing carried to S5b/S6 is declared closed here. |
| E12 | Met on the enumerated inherited residuals; R43-01 to -03 are repaired, and R44-01 is resolved by the scoped owner exception. |
| E13 | The prior handover's closeout-check evidence (12 accepted, zero refused) stands. |
| E14 | The built-file hash is verified; A-09's rendered-disclosure exception remains. |
| E15 | R44's unchanged final-candidate browser and comparator evidence stands, with its one-desktop limit. |
| E16 | Inherited rejected-hunt and campaign accounting stands. |
| E17 | R44.1's policy and response documents landed; R44's primary-source review of the unchanged financial repairs stands. |
| E18 | The prior whole-model second pass and subsequent change-audit chain satisfy the inherited requirement. |

**Handover to the owner and Claude:** no R44.1 source repair is requested. Preserve A-11's Monte Carlo-only scope, use the revised C4/C8 checklist prospectively, and compare every exposed/changed path and published result after future builds. This GO permits the owner to consider administrative S5AA closeout; it does not start S5b or qualify any household result.
