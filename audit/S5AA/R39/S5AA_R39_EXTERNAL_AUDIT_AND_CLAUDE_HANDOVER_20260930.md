# S5AA R39 external change audit and Claude handover

**Audited source:** `s5aa-r39-source`, commit `f7ea076f1871d1c83fc4505098601a0cf1f0eae6`. **Change range:** `d02c509d3eacf47f912a6f7b32b92cc87cfb3b48..f7ea076f1871d1c83fc4505098601a0cf1f0eae6`. The report was written on the records merge at `45ae417e9d58758c47b0951c66371ee9ad0e7781`; that merge adds audit records after the frozen source. **Environment:** Windows 11 (`10.0.26200`), Node `v24.17.0`. No source, test, fixture, baseline, or decision record was changed for this audit.

## Verdict

**NO-GO for accepting R39 as complete:** one new P2 survivor-benefit error is caused by R39's claim-inside-row pricing. The five R38 repairs reproduced at their expected values in the independent R38 witness. The QCD opening-age declaration was checked in the source and form; it makes no behavior change. This is an R39 change verdict, not a fresh full-model certification.

## R39-01 — A deceased worker's never-reached claim date changes the survivor benefit (P2)

**Evidence and affected code.** At the frozen source, `src/engine.js:3089` prices `selfPia` at `selfClaim` whenever that claim falls inside the projection row. `src/engine.js:3096` then passes the same PIA to `ssSurvivorMonthly()` even when `selfClaim` is after `selfDeath`. The segment loop at `src/engine.js:3149` pays that survivor amount after death. The symmetrical spouse-to-self path is at `src/engine.js:3089,3095`. R39 added the conditional claim-age PIA at `f6dbb2a`; the earlier code always priced it at the row opening. The comment at `src/engine.js:2121-2127` and the emitted approximation warning at `src/engine.js:4760` describe a survivor benefit based on the deceased's record and credits earned **by death**. A planned retirement claim that the worker never reaches cannot determine their survivor's payment.

**Reproduction.** From the repository root run `node audit/S5AA/R39/S5AA_R39_EXTERNAL_REPRO_20260930.js`. It uses the public `validateScenario()` and `runPlan()` APIs and the app's own default plan and rule table. The household starts at age 66.5 with a spouse of the same age. It has no wages, investments, spending or other income; the worker's entered Social Security amount is $2,000 per month, COLA 10%, and the worker dies at 67.25. The spouse lives past the age-68 closing row and has a zero own benefit. Only the deceased worker's *planned* claim age changes:

| Worker planned claim | Relative to death | R39 age-68 row income | Pre-R39 PIA-pricing control |
|---|---|---:|---:|
| 67.5 | 3 months after death | **$20,196** | $18,360 |
| 68 | 9 months after death | **$18,360** | $18,360 |
| 69 | 21 months after death | **$18,360** | — |

**Independent expected figure under this model's row-constant convention.** At death 67.25, no model 10% COLA anniversary has elapsed since the plan opened at 66.5. The base PIA is $2,000. The model gives three months of delayed retirement credits after full retirement age 67, or `3 × (8% / 12) = 2%`; `$2,000 × 1.02 = $2,040` per month. Nine months of survivor payment to the age-68 row close give **`$2,040 × 9 = $18,360`**. In the 67.5 planned-claim case, the R39 conditional advances the PIA to a date after death and applies the hypothetical 10% COLA: `$2,200 × 1.02 × 9 = $20,196`. The **$1,836** difference is the defect. Even if a later COLA were due to a survivor under actual SSA rules, changing an unfulfilled planned claim age must leave two otherwise identical survivor plans equal. The witness also isolates the single R39 PIA expression in memory and restores the pre-change expression: both planned claims then yield $18,360, with no file changed.

SSA's [POMS RS 00615.690 §A.4 and §B](https://secure.ssa.gov/apps10/poms.nsf/lnx/0300615690) applies the deceased worker's delayed credits to a widow(er) and makes those credits effective at death. [20 CFR 404.271(b)](https://www.ssa.gov/OP_Home/cfr20/404/404-0271.htm) allows PIA COLAs for people who die before eligibility; this finding does **not** assert that a survivor can never receive a COLA after death. It asserts that the deceased's hypothetical, never-reached claim age is not the trigger for that COLA or the survivor amount. The $18,360 hand figure uses the calculator's disclosed row-constant payment convention.

**Consequence and reach.** In this witness, age-68 Social Security income is overstated by $1,836 when a worker dies before a planned claim inside the death row. In plans with spending or taxable Social Security, the extra income can flow into withdrawal and tax results. Neither the 71-member expanded corpus nor the 25-case Social Security reference set is reported to exercise this posthumous claim boundary; the unchanged corpus hashes therefore do not qualify it. This is a narrow but real household cash-flow error, hence P2.

**Proposed repair.** Price the deceased's PIA for the survivor using a death-aware valuation age when the scheduled claim is not attained. Preserve R39's claim-date PIA pricing for an own benefit actually claimed while alive. Keep the survivor PIA and credited-month calculation aligned with the existing row-constant convention, and add paired self-death and spouse-death public-plan tests where changing only an unreachable claim date leaves survivor income unchanged. Claude should work the expected figures independently and record any resulting baseline movement before implementation.

## Checks and limits

- Ran `npm test` at the exact frozen source on Windows 11 / Node 24.17.0: **GATE PASSED**, 411 test files, 3,116 tests, 3,107 passed, none failed or skipped, nine authorized todos. The gate includes R39's 17 new tests. A green gate does not resolve R39-01 because those tests have no posthumous claim comparison.
- Reran `node audit/S5AA/R38/S5AA_R38_EXTERNAL_REPRO_20260929.js` at that source. The R38-01 contribution witnesses returned $5,000, $15,000, $42,250 and $25,500; R38-02 Rule-of-55 tax and its exception control both returned $4,667.50; R38-03 returned $6,000 pre-tax, $11,565 Roth and $7,909 tax; R38-04 returned $13,728; R38-05 survivor RMD matched the own-IRA control at $3,905.63. These are requalification checks for the supplied witnesses, not proof of all adjacent cases.
- Read R39's source diff, six new test files, handover and self-audit, and the QCD code/form label. The owner's disclosed first-row contribution limit choice, QCD opening-age rule and other §6 known limits remain disclosed model choices; this report adds no finding for them.
- The handover says the control and expanded corpus did not move. I did not regenerate those captures or rerun the 13,815-case tax sweep; their unchanged results are Claude's reported evidence. I independently ran the full gate and the two witness scripts above. I did not run a new exhaustive full-model audit.

**Handover to Claude:** reproduce R39-01 on Windows at the frozen source, repair it test-first if the owner selects it, and account for any moved figures. Keep the earlier R38-04 own-claim witness ($13,728) passing.
