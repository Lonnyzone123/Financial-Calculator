# S5AA R39.1 external change audit and Claude handover

**Audited source:** `s5aa-r39.1-source`, commit `a2ee714ff5a3d32fd14ac4b1f0fcbfedeed8d5fd`. **Change range:** `96ce07f7d73fb9cfa5adfaa026b4d75fdffc69de..a2ee714ff5a3d32fd14ac4b1f0fcbfedeed8d5fd`. The R39.1 records merge on `main` is `995ea8ec980689a918dd2f14b3a5fb560be2d4ad`; those records follow the frozen source. **Environment:** Windows 11 (`10.0.26200`), Node `v24.17.0`.

## Verdict

**R39-01 requalified; no new R39.1-NN findings.** The one-commit repair keeps a scheduled claim that the worker never reaches from changing survivor income, while retaining R39's claim-date price for a claim reached alive. This verdict accepts the **R39.1 change within the cases checked**. It does not certify the full financial model or determine the separate S5AA exit gate. The survivor's COLA timing after death before eligibility remains the disclosed, unchanged model convention.

## Evidence

`src/engine.js:3094-3095` now requires `selfClaimPriced` or `spouseClaimPriced` to be strictly inside the row **and** before that person's death. The spouse's claim and death are both converted to the self's age clock at `src/engine.js:3038-3039`. Otherwise `ssPiaAt()` receives the row-opening age, matching the pre-R39 price. The same condition appears in the built `investment-calculator-v2c.html:4792-4793`. The new `tests/audit-s5aa-r39-1-posthumous-claim-not-priced.test.js` uses the public validator and `runPlan()` routes for self and spouse deaths, plus a living claimant. `package.json`, `tests/lib/harness.js`, and the test classification/register changes add and pin that test and rebuilt artifact; the financial source change is confined to this Social Security PIA condition.

I ran `node audit/S5AA/R39/S5AA_R39_1_EXTERNAL_REPRO_20260930.js` at the frozen source. It uses the app's actual default plan and rule table, the public `validateScenario()` and `runPlan()` APIs, and no source edits. All figures below are the age-68 closing row's household income, with no wages, assets, spending or other income, a $2,000 monthly PIA and a 10% model COLA:

| Witness | Changed planned claim(s) | Observed income | Independent model arithmetic |
|---|---|---:|---|
| Self dies at 67.25; spouse survives | 67.5 / 68 / 69, all after death | $18,360 / $18,360 / $18,360 | $2,000 × 1.02 death-earned delayed credit × 9 months |
| Spouse dies at 67.25; self survives | 67.5 / 68, both after death | $18,360 / $18,360 | same amount and duration |
| Self dies **exactly at** planned claim 67.5 | 67.5 / 68 | $12,480 / $12,480 | $2,000 × 1.04 death-earned credit × 6 months |
| Spouse is one year younger and dies at own age 66.25; self survives from age 67.25 | spouse claim 66.5 / 67, both after death | $18,000 / $18,000 | $2,000 × 9 months; deceased was before FRA, survivor after FRA |
| Claimant stays alive through claim 67.5 | 67.5 | $13,728 | $2,000 × 1.10 claim-date COLA × 1.04 credit × 6 months |

The original R39 defect script `S5AA_R39_EXTERNAL_REPRO_20260930.js` intentionally asserts the old defective `[20196,18360,18360]` triple and now stops at that assertion because it observes `[18360,18360,18360]`. That is expected evidence of the repair, not a release-gate failure. Both the new R39.1 test and R39's living-claim test passed independently. The R38-04 witness still prints $13,728.

The boundary is consistent with [SSA POMS RS 00615.690 §A.4 and §B](https://secure.ssa.gov/apps10/poms.nsf/lnx/0300615690), which applies the deceased worker's earned delayed retirement credits to a widow(er) at death. [20 CFR 404.271(b)](https://www.ssa.gov/OP_Home/cfr20/404/404-0271.htm) also allows a PIA COLA after death before eligibility. The figures above test this calculator's stated row-constant convention and the narrower invariant that an **unreached claim date** does not trigger a different survivor amount; they do not assert an exhaustive SSA survivor calculation.

## Gate, movement, and limits

- Ran `npm test` at the exact source on Windows 11 / Node 24.17.0: **GATE PASSED**, 412 files, 3,123 tests, 3,114 passed, zero failed or skipped, nine authorized todos.
- Read the one-commit source and test diff and the R39.1 handover and self-audit. The tracked build has the same condition as `src/engine.js`; its hash pin was updated in the harness.
- The handover reports zero control differences and an unchanged 71-member expanded corpus. I did not regenerate those captures or rerun its 25-case SSA reference set; those are Claude's reported checks, distinct from my gate and public-plan witnesses. None of the reported corpus plans reaches the repaired death-before-claim boundary.
- The disclosed survivor COLA timing after death before eligibility remains unqualified by this change audit. The broader S5AA GO/NO-GO determination requires its own exit-gate evidence.

**Handover to Claude:** R39-01 is requalified on this source. No new repair is requested from this change audit. Preserve the public-plan boundary cases and the live-claim $13,728 case in subsequent Social Security changes.
