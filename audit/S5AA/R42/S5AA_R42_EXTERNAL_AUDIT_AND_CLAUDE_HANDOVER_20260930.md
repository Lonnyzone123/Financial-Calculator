NO-GO

# S5AA R42 external change audit and Claude handover

**Audited source:** `s5aa-r42-source` = `c67c71308e83e632f7e269f9c63d9beb39ccacc8`. **Base:** `s5aa-r41-source` = `984197cc05706b45e60bcb39bee78ad75f9ceff4`. The R42 records are on `main` at `05374931b29941e72227daaf59187992152d964d`; its source, tests, tools and built HTML are byte-identical to the R42 tag. **Environment:** Windows 11, Node `v24.17.0`. The adjacent `S5AA_R42_EXTERNAL_REPRO_20260930.js` replays R42-01 through the public engine route on both frozen sources without editing either.

## Determination

**S5AA remains NO-GO.** All five R41F witnesses now produce their independently predicted results, but R42-01 is a new financial regression in the family earnings-test repair: a staggered spousal claim causes one fewer worker crediting month and understates later Social Security income. R42-02 records the separate A-01 prediction miss that Claude identified and disclosed; its after-the-fact corpus declaration does not turn the original zero-movement prediction into a correct pre-edit prediction. R42-01 requires a repair or an explicit owner disposition with its affected reference boundary; R42-02 requires an owner disposition under A-01. The owner retains milestone closure, tag and S5b decisions. A GO, if reached later, remains administrative and is not release qualification.

## R42-01 (P2): a spouse's later claim lowers the worker's credited withholding months

**Source and mechanism.** In `src/engine.js:3238-3240`, `familyTest()` totals the worker's benefit and the auxiliary spousal benefit for the whole row, then computes the worker's credited months as `ceil(withheld / (pool / nhMonths))`. That is an average *family* monthly benefit over the year. When the auxiliary starts partway through the year, the first months contain only the worker's benefit. The annual withholding amount can be right while the credited month count is too small. The count feeds the worker's `ssClaimFactor()` after full retirement age at `src/engine.js:3135` (and later the survivor limit). The R41 code at `:2087-2098` used the worker's actual monthly benefit for this case and did not have this regression.

**Exact witness.** Married plan, worker age 62 and spouse age 67 at the opening; worker PIA $3,000/month claimed at 62 (reduced to $2,100/month), spouse PIA $0; worker salary $45,000 for the full opening row, retirement at 63, no later wages, return, spending or COLA; spouse claims the worker-record auxiliary benefit at age **67.5**, halfway through that row. The [2026 lower earnings-test amount and $1-for-$2 rule](https://www.ssa.gov/oact/cola/rtea.html) give `(45,000 - 24,480) / 2 = $10,260` of worker excess. The auxiliary is not yet entitled during the first six months. Under [SSA's charging order](https://secure.ssa.gov/apps10/poms.nsf/links/0302501095), deductions start with the first entitled monthly benefit and continue until the excess is charged. Four $2,100 worker checks consume $8,400; the fifth has a partial deduction of $1,860. [SSA credits a month of full **or partial** work deduction](https://secure.ssa.gov/poms.nsf/lnx/0300615482), so the worker earns **five** crediting months, before the spouse's auxiliary starts. This uses the engine's annual excess convention; it does not dispute that disclosed convention.

**Expected and actual.** At FRA 67, 60 original early-claim months less five credits leave 55 reduction months. Applying the first 36 months at 5/9 of 1% and the remaining 19 at 5/12 of 1% gives `floor($3,000 × (1 - 36×5/900 - 19×5/1200)) = $2,162/month`. The spouse is past FRA and receives $1,500/month. **Expected household income in the row ending at worker age 68: $43,944; R42 actual: $43,800** (`$2,150 + $1,500` monthly). The income is understated $144/year from that point, with possible later tax, portfolio and survivor effects. Both `validateScenario()` and `runPlan()` accept this plan; run status is `ok`. In the claim year, R42's $68,940 household income is correct; the error becomes visible only at FRA.

**Controls establish the cause.** Change only the spouse's claim age to **68**, after the year of withholding. Both R41 and R42 then produce $43,944 at age 68. With the half-year claim, R41 also produces $43,944, while R42 produces $43,800. Both scenarios have the same full-year spouse benefit by the age-68 row; the $144 difference is the R42 crediting-month calculation, not a later claim reduction. `node audit/S5AA/R42/S5AA_R42_EXTERNAL_REPRO_20260930.js` prints and asserts all four measurements. The new R42 tests use full-year auxiliary entitlement or benefits completely withheld and do not exercise this staggered start.

**Reach and proposed repair.** Any year in which a worker's excess is charged before an auxiliary starts or stops can have varying monthly family rates; averaging the annual pool can miscount the worker's credited months. Use the existing claim/death/retirement segments to charge the worker's excess chronologically to benefits actually payable in each month, count each month with a full or partial deduction once, and apply the auxiliary's own earnings test to its remaining benefit in SSA's order. Preserve the correct annual household withholding and grace-year boundaries. Add the half-year claim and after-withholding claim controls, and a case in which the auxiliary starts while excess is still being charged. Predict movement and unaffected corpus controls before editing.

## R42-02 (P2, exit-gate process): the zero-movement prediction missed `seed:20`

**Evidence.** The pre-edit `audit/S5AA/R42/S5AA_R42_PREDICTION_RECORD_20260930.md`, committed at `550764b`, predicted that no control or expanded corpus plan would move. After the Social Security edit, control 4.7 reported **313 unpredicted differences in `seed:20`**. R42's self-audit SA42-06 and change handover §4 explain the cause: the worker's $6,058.09 excess reaches $804.21 of the spouse's auxiliary benefit first, leaving less for the spouse's own test. The correct family income increases $804.21 at row 67 and later figures move. The control declaration was amended with the implementation commit `82856a3`, and expanded baseline **r21** was registered at `c67c713`. I find the stated SSA ordering consistent with [POMS RS 02501.095 §B.4](https://secure.ssa.gov/apps10/poms.nsf/links/0302501095); this finding does **not** allege that the `seed:20` movement is financially wrong.

**Contract and disposition.** `S5AA_TASK_CHECKLIST.md` A-01 says that an unpredicted movement is a finding. A-10 expressly relaxes the pre-edit record for **R29–R39.1 only** and says A-01 applies as written from R40 onward. Thus the after-the-fact explanation, revised declaration and r21 baseline make the movement traceable, but do not satisfy the prospective prediction for this round. The owner should explicitly disposition SA42-06 under A-01 and preserve both the original prediction and actual comparison. There is no source change that can retroactively make a prior prediction correct. This process finding is separate from R42-01's financial repair.

## Repairs and checks reviewed

| Item | Independent result at the R42 source |
|---|---|
| R41F-01 family withholding | Original $218,000 age-63 income becomes **$200,000** when the worker's $87,760 excess exceeds the $43,200 family benefit. The spouse's auxiliary is now withheld. |
| R41F-02 survivor ARF | Age-69 survivor income is **$36,000**, age-68 death-year income **$45,000**, living-worker control **$54,000**. The deceased worker's credited months now reach the RIB limit. |
| R41F-03 spousal IRA | Full-row deposit **$7,500**, federal AGI **$97,500**, modeled taxes **$17,005**; reciprocal and both-stop-halfway tests pass. |
| R41F-04 Roth phaseout | Actual $130,000 wages/proxy produce **$7,500 Roth deposit**; full-year $260,000 control remains at zero. |
| R41F-05 benefit input | `"abc"` is `WRONG_TYPE` at `retirement.ssBenefit` in the validator and `SCENARIO_NONNUMBER_PLAN_VALUE` in the engine; the valid $2,500/month control still pays **$30,000**. |
| Windows gate | Fresh `npm test`: **GATE PASSED**, 424 files, 3,170 tests, 3,161 pass, zero fail/skip, nine authorized todos. This validates the covered cases; it does not include R42-01. |
| Source, build and browser | No `src/`, tests, tools or built-HTML difference between `s5aa-r42-source` and the records merge. Built HTML SHA-256 is **`1e44b9ae91b11ab0b4ee6ca6f90349ed0b525c3370c50c9a43ed25abf5bf16cd`**, matching R42's record. I inspected the final-candidate Chromium/Windows result: 75/75 Worker versus main-thread outputs equal, 70/70 imported CSVs equal, error/fallback and four-worker cases recorded; 72/75 also equal Node exactly, with the same three tiny Monte Carlo numeric differences as R41. I did not personally rerun a desktop browser. |
| Control and expanded baseline | The gate reports control 4.7's 313 `seed:20` differences as declared; r21 holds the one moved expanded member. These compare recorded outputs, not independent SSA correctness. |

## Exit gate E1–E18 at `c67c713`

The table carries R41's A-01–A-10 status where R42 provides no new contrary evidence. “Met” is an administrative line status, not model release qualification.

| Line | Determination |
|---|---|
| **E1** | **Open:** the new R42-01 financial regression needs a repair or owner disposition naming its blocked reference cases. The five R41F repairs pass their witnesses. |
| E2 | Not met as originally written; residual uncertainty accepted under A-09. |
| E3 | Met for the new R42-01 finding by the pinned pre-repair witness in this report; R41F-01–05 have pre-repair runs and repaired checks. R42-01's future green repair check belongs to its E1 disposition. |
| E4 | Prior mirrored-pair and settlement records stand; R42 adds no contrary evidence. |
| E5 | Met within the owner's corrected-remedy scope, subject to E1's new case. |
| E6 | Result-contract failure policies remain; R42 adds the typed SS-benefit refusal. |
| E7 | Not met as originally written; A-09 defers enforcement to S5b task 4. Flagged corpus results remain unqualified. |
| E8 | r21 preserves the moved expanded case and predecessor baselines; original prediction is retained. |
| E9 | Met by the fresh 3,170-test Windows gate, with nine authorized todos. |
| **E10** | **Comparison recorded but A-01 finding open:** zero movement predicted, `seed:20` moved; A-10 does not except R42. |
| E11 | Prior X-row routing stands; no S5b or S6 item is declared closed here. |
| **E12** | **Open for R42-01:** it is neither repaired nor in an accepted, disclosed limitation list. R42's stated spousal ARF limit and earlier disclosed limits remain separate. |
| E13 | The recorded 12/0 closeout stands, without curing E7 or R42-01. |
| E14 | Final built HTML is hash-pinned; A-09's rendered-disclosure exception still applies. |
| E15 | Final-source task 6.5 browser record and comparator evidence reviewed as above; the one-browser and later phone limits remain. |
| E16 | Prior rejected-hunt accounting stands. |
| E17 | R42's rule citations were checked against primary SSA/IRS sources for the repaired witnesses; the new R42-01 premise is checked above. |
| E18 | The owner requested the R41F whole-model second pass and this R42 change audit; no extra scope decision is inferred. |

**Handover:** reproduce R42-01 at `c67c713` with the adjacent script and its hand calculation, preserve the zero-movement prediction and SA42-06 accounting, and obtain the owner's dispositions. For any chosen repair, write the independent red witness and prospective affected/unaffected output prediction before source edits, then repeat the Windows gate, control and expanded comparisons, and the final-source browser check if the built app or exercised behavior changes.
