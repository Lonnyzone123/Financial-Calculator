NO-GO

# S5AA R43 external audit, R42F review, and handover

**Audited source:** `s5aa-r43-source` = `5b8f0d53db0d6214c9a4c09add37538a687f3df5`. **Frozen base:** `s5aa-r42-source` = `c67c71308e83e632f7e269f9c63d9beb39ccacc8`. The R43 records head is `247635c13bccb58c8bccd0e594ba835d440fbb39`; its `src/`, `tests/`, `tools/`, and built HTML are byte-identical to the R43 tag. Review environment: Windows 11, Node 24.17.0. This pull request contains this report and the adjacent, read-only reproduction script only.

## Determination

**S5AA is NO-GO at R43.** The R42-01 Social Security regression and most inherited R42F witnesses are repaired, and the final-source test gate passes. Three financial/input defects remain in the R43 change: **R43-01** admits a one-time HSA contribution after the modeled Medicare start, **R43-02** understates the compensation limit for a one-time IRA contribution funded by a future employment stream, and **R43-03** leaves a negative employer profit-sharing percentage valid despite SA42F-05's range witness. **R43-04** records five prediction misses under A-01, including two unpredicted expanded-corpus movements and one movement in the opposite direction. R42-02's owner disposition covers R42 only; it does not disposition these R43 misses. E1, E10 and E12 remain open. A GO here would be administrative, not release or household-reliance qualification; milestone closure, the `s5aa-closed` tag and S5b remain the owner's decisions.

## Method and evidence boundary

- I read the cover note, all 34 R42F findings, the R43 seven-part handover and self-audit, the changed engine/validator/contract paths, the seven new R43 test files, and the relevant prior status record. I independently replayed all **41** published R42F `repro*.js` scripts against the **frozen R42 source** by rebinding their shared harness in memory to the R42 checkout. All 41 exited zero; the printed defect figures, including the $2,182.77 QBI tax difference, the RMD, HSA, employer match and seed cases, agreed with the R42F report. I did not use the post-repair source as the source of the R42 rulings.
- I replayed the same 41 scripts at R43, read their outputs, and used the new R43 tests and direct source paths to judge repairs. Three old scripts exit early at R43 because they assert R42 behavior or parse old contract wording. Several others print an old hard-coded conclusion after a new numeric result. In particular, the old contribution-card script still calls `ownerContributionEligibility()` by hand, although the **live app** calls `ownerContributionWindow()`; the old Monte Carlo script directly seeds `simulatePlan()` with `seed + 2i`, bypassing R43's `runPlan()` seed mixer; the old survivor-cut script retains its pre-R43 spending policy. These are stale probes of R43, not counterevidence to the tested repairs.
- Fresh `npm test` at the source-identical records head: **GATE PASSED**, 431 files, **3,249 tests / 3,240 passed / 0 failed / 0 skipped / 9 authorized todos**. The adjacent script executes the three new defects through `validateScenario()` and `runPlan()` at R43 and exits zero only while their measured behaviors persist. `git diff --check` passes.
- The final HTML SHA-256 is `eea770ab2b5c45bde41513c065fd5c457ed61acbd0e862ab122b7029df5ae94f`, matching its pin and the R43 browser record. I inspected the raw Chromium 152 / Windows 11 final-candidate evidence: 75/75 real-Worker versus main-thread results, 70/70 imported CSVs, the fault/fallback cases and four-worker compare are recorded as matching; 72/75 also equal Node exactly, with only the reported small Monte Carlo floating-point differences. I did **not** personally rerun that browser session. It supports E15's administrative browser condition, not independent financial correctness.
- The R43 handover reports control 4.7 at 15,940 found, zero unpredicted after declaration, and r22 at 19 movements from r21. The prospective-prediction comparison is different from a final declaration sweep: the five recorded misses below remain misses. The R42F broad 2026-figure and conservation sweeps are inherited evidence, not a fresh rerun of every statutory figure in this report. I spot-checked the new 199A threshold records against [Rev. Proc. 2025-32](https://www.irs.gov/irb/2025-45_IRB), and checked the legal premises used by the new witnesses against [IRS Publication 590-A](https://www.irs.gov/publications/p590a) and [IRS Publication 969](https://www.irs.gov/publications/p969).

## Part 1 — ruling on every SA42F finding at `c67c713`

“Confirm” means the **R42** defect or disclosure gap reproduces in its stated supported witness. “Qualify” keeps the observed R42 inconsistency but limits the claimed requirement. The repair column assesses **R43**, not the truth of the original finding. No SA42F finding is refuted, so the cover note's refuted-repair instruction does not arise. I found no separate **R42V-NN** finding in this pass.

| R42F | Ruling at R42 | R43 repair check |
|---|---|---|
| 01 | **Confirm.** $80,000 self-employment stream omitted 199A; total tax $20,286.44 instead of $18,103.67. | Witness now $18,103.67; tax quote mirror and new QBI records exercised. |
| 02 | **Confirm.** Half-year claim lost a COLA. | Own, spousal and survivor hand values now match. |
| 03 | **Confirm.** Death before the required beginning date still incurred that year's RMD, contrary to [Pub. 590-B](https://www.irs.gov/publications/p590b). | First-distribution-year IRA and still-working 401(k) death witnesses now owe zero. |
| 04 | **Confirm.** A spouse-owned account with no spouse had inconsistent RMD, QCD and penalty treatment. | Engine reads it as the only person's, and validator warns; the RMD/QCD/penalty witness matches. |
| 05 | **Confirm.** The listed malformed fields were coerced or left unchecked. The negative `profitShare` witness is part of this class. | **Partial.** The shared contract refuses the listed wrong types and many out-of-range values, but `profitShare: -10` still runs; **R43-03**. |
| 06 | **Confirm.** Ten validator-error plans ran in the engine. | The listed field, list and range witnesses now refuse on both sides. |
| 07 | **Confirm.** Three R35 booleans were outside the flag contract. | All three are in the shared boolean contract; string values refuse. |
| 08 | **Confirm.** Later-year IRA/Roth phase-out widths grew unlawfully. | Widths stay fixed; 2045–46 witness matches the hand range and tax. |
| 09 | **Confirm.** Separation-row Rule of 55 charged the 10% on post-separation 401(k) draws. | Separation at 55.5 now produces the $557.14 tax witness. |
| 10 | **Confirm.** A pre-plan MFS IRMAA return was priced as single. | MFS witness now $9,540.88 for each lookback year. |
| 11 | **Confirm.** A retired Medicare-age spouse was omitted while self worked. | Per-person $3,185.68 witness and role swap now agree under the owner's Medicare-at-65 policy. |
| 12 | **Confirm.** Employer additions exceeded 100% of compensation. | $30,000 pay witness caps total additions at $30,000; per-employer-group todo remains disclosed. |
| 13 | **Confirm.** Deceased owner's unvested employer money was forfeited on survivor retirement. | $40,000 survives that event. |
| 14 | **Confirm.** Spouse account presets used the primary person's age. | Presets stamp the spouse clock and start at the intended row. |
| 15 | **Confirm.** Family HSA base depended on account order. | Both orders produce $8,750 HSA and $4,375 redirected in the original witness. |
| 16 | **Confirm.** One-time Roth contribution missed the worked-share MAGI proxy. | Planned and one-time $7,500 cases both deposit $7,500. |
| 17 | **Confirm.** AIME claimant already past 62 used the wrong bend-point year. | Past-62 witness now matches $29,268 and its controls. |
| 18 | **Confirm.** Survivor withholding months incorrectly credited own retirement benefit. | Survivor witness at 68 now $30,132; the separate R42-01 staggered claim witness is covered by the chronological repair. |
| 19 | **Confirm.** Other asset available mid-row was delayed. | 65.5 availability funds the 65.75 expense, with no shortfall. |
| 20 | **Qualify.** The two R42 dollar origins demonstrably disagreed, but the record had not fixed whether a future amount meant today's or start-date dollars. | The owner chose today's dollars; fixed 3% and match-inflation stage/stream controls now agree. |
| 21 | **Confirm.** Reserve used hidden, uninflated spending. | Reserve now keys off projected $120,000, giving 6.68% in the witness regardless of hidden spending. |
| 22 | **Confirm.** Indexed joint IRMAA boundary differed from twice the single boundary. | 2027 $223,500 MAGI gets the correct standard joint tier; this repair caused disclosed SA43-B. |
| 23 | **Confirm.** Partial last row read age-65 amounts at row close instead of tax-year end. | Hand tax $1,840 matches. |
| 24 | **Confirm.** Live app limit cards dropped the spousal IRA window. | Live app call now reads `ownerContributionWindow()`; engine/card test covers $1,400 excess. Old script's handwritten “app check” call is stale. |
| 25 | **Confirm.** Mid-row contribution change waited until the next row. | 46.5 change now deposits $5,000 in the 46–47 row. |
| 26 | **Confirm as disclosure.** “Annual conversion” was restricted to retirement years without saying so. | Form label now says “each year from your retirement age”; execution unchanged. |
| 27 | **Confirm as disclosure.** AIME label said 2026 bend points regardless of year 62. | Label now names the year the person turns 62. |
| 28 | **Confirm as disclosure.** One-time income at/after plan end vanished without the expense's warning. | `INCOME_AFTER_PLAN_END` warning now appears; in-horizon control still pays. |
| 29 | **Confirm.** Survivor cut in a death-before-midrow-retirement row read the retirement date. | The row-opening test now charges $40,000 under the salary exception. The old R42 script's $60,000 at R43 includes the separately chosen survivor-cost policy and is not the isolated test. |
| 30 | **Confirm.** A whole-number lifespan equal to start age left nobody alive but ran. | Validator and engine refuse; R10's changed control follows this boundary. |
| 31 | **Confirm.** `seed + 2i` made neighboring Monte Carlo seeds share shifted paths. | `runPlan()` now mixes base seed, path and stream; the public-route and path tests pass. The old direct `simulatePlan()` call bypasses it. |
| 32 | **Confirm.** Validator accepted nobody alive at start while engine refused. | Both now refuse with aligned paths. |
| 33 | **Confirm.** Unknown-method refusal lacked contract `mode`, and codes were undocumented. | `mode: null` passes current contract check; codes are listed. Old script parses an obsolete sentence. |
| 34 | **Confirm.** Pre-data/between-year history starts silently substituted another year. | Validator and engine refuse those starts; data-year control runs. |

The three owner rulings outside the numbered R42F list are legitimate policy changes at R43: lower-earner spousal IRA pooling follows [Pub. 590-A](https://www.irs.gov/publications/p590a); planned HSA contributions stop under the assumed Medicare enrollment at 65, consistent with [Pub. 969](https://www.irs.gov/publications/p969); and survivor costs start at death subject to the stated salary exception. **R43-01** shows that the HSA implementation has not covered the one-time contribution route. R42-02 was explicitly accepted by the owner as a disclosed miss; I carry that disposition without treating the R42 prediction as accurate.

## Part 2 — R43 findings

The adjacent script is `node audit/S5AA/R43/S5AA_R43_EXTERNAL_REPRO_20261001.js`. It uses only the supported public validator and `runPlan()` routes, checks valid controls, and prints the measured R43 results. Its expected values below are hand-derived, not obtained from the failing branch.

### R43-01 (P2) — one-time HSA contribution survives the age-65 stop

The owner's R43 policy assumes Medicare enrollment at 65, and [IRS Pub. 969](https://www.irs.gov/publications/p969) says an HSA contribution limit becomes zero beginning with the first Medicare month. A taxable-to-HSA transfer is this model's **one-time contribution**, not an HSA rollover. Single worker, age 66, $10,000 pay, retirement at 70, $20,000 taxable balance, empty HSA: a planned $4,400 HSA contribution deposits **$0**, as chosen. Change only the route to a $4,400 one-time taxable-to-HSA transfer at 66: both entry points accept it, `runPlan()` returns `ok`, and HSA becomes **$4,400** without a limit warning. The expected one-time allowance is **$0**, so the transfer should remain in taxable. `auditContributions()` applies the age stop inside the planned HSA branch but its `oneTime` HSA room calculation does not apply it. Apply the same eligibility window to the one-time route, with controls before 65 and across a 65th birthday.

### R43-02 (P2) — one-time IRA compensation omits R43's future-income dollar latch

Single plan at 55, 10% inflation, no base salary; a **$5,000 today-dollar employment stream** starts at 65 and pays for one year. At 65 it pays **$5,000 × 1.10^10 = $12,968.71**, and [IRS Pub. 590-A](https://www.irs.gov/publications/p590a) counts that compensation for IRA contributions. A $7,500 planned traditional-IRA deposit is allowed. The otherwise corresponding $7,500 one-time taxable-to-IRA contribution moves only **$5,000**; $2,500 remains in taxable with a spurious limit warning. Both plans validate and run `ok`. The one-time route should allow **$7,500**, below both the compensation and the age-50 IRA dollar limit. R43 added `incomeStartFactors` to the planned `ownerCompensation()` call, but `transferRoom()` recomputes compensation without them. Pass the same latched factors to both routes and test a future employment stream plus a one-time contribution on its start row.

### R43-03 (P2) — SA42F-05's negative profit-sharing range witness remains accepted

`src/plan-value-contract.json` declares `accounts[].profitShare` a number with **no minimum**, despite SA42F-05 and its `CONTRIB-08` script including `profitShare: -10` as an unranged employer input. A worker with $100,000 pay, $10,000 401(k) deferral, 50% match up to 6% pay and 5% profit sharing has **$18,000** in the 401(k): $10,000 + $3,000 + $5,000. Set profit sharing to **−10%**: validator still says valid, engine returns `ok`, and the negative $10,000 term cancels the $3,000 match before the employer result is clamped, leaving **$10,000**. The malformed plan should be refused by both layers rather than silently lose $8,000 of employer additions. Add the nonnegative input bound to the shared contract and cover the direct engine and validator paths. Review the adjacent employer percentage fields for the same negative-value mechanism.

### R43-04 (P2, A-01 process) — five prospective predictions missed their measured movement

The seven predictions were committed before their edits, but the written comparison in `S5AA_R43_SELF_AUDIT_20261001.md` establishes five misses: **SA43-B** and **SA43-D** are unpredicted expanded-corpus movements; **SA43-C** gets `seed:4`'s direction wrong; **SA43-A** and **SA43-E** name plans that do not move. The first two meet A-01's explicit “unpredicted movement is a finding”; the direction and over-prediction errors also make E10's predicted-versus-actual record inaccurate. The final control declaration's zero unpredicted count and r22 preserve what actually happened, but they cannot make the pre-edit forecast correct. A-10's historical exception ends at R39.1. The owner's specific acceptance of R42-02 does not extend to R43. Preserve the original seven predictions and this comparison; the owner can explicitly disposition R43-04 as a disclosed process miss or require further work. The financial R43-01 to -03 remain separate blockers regardless of that choice.

## Exit gate E1–E18 at R43

The statuses below carry R41's previously determined administrative evidence where R43 gives no contrary evidence. “Met” does not certify household figures. A-09's exceptions and A-10's narrow history remain in force.

| Line | R43 determination |
|---|---|
| **E1** | **Open:** R43-01 and R43-02 require repair or an explicit held-case disposition; R43-03 leaves an inherited input repair incomplete. The numbered R42F repair checks above otherwise pass. |
| E2 | Original wording excepted by A-09, as in the prior status determination. |
| E3 | Met for inherited R42F witnesses: 41 frozen-source scripts replayed; the new R43 witnesses are pinned here before any next repair. |
| E4 | Recorded mirror and silent-settlement gate evidence stands; R43's QBI estimator/quote mirror has targeted tests. |
| E5 | Prior corrected-remedy decisions stand; this does not cure the new contribution-route gaps. |
| E6 | Result-contract failure policies stand; the R43 unknown-method mode is corrected. |
| E7 | Original enforcement wording excepted by A-09 and routed to S5b task 4; no household result is qualified by it. |
| E8 | Met on the registered r22 capture with r21 preserved, subject to R43-04's prospective-prediction finding. |
| E9 | Met: exact-source-equivalent gate 3,249/3,240/0 fail/0 skip/9 authorized todos. |
| **E10** | **Open:** predicted versus actual is recorded, but SA43-A to -E are misses under A-01; A-10 does not cover R43. |
| E11 | Prior X-row routing stands; no S5b/S6 item is declared closed. |
| **E12** | **Open:** R43-01 to -03 are not yet on an owner-accepted unrepaired/disclosure list. |
| E13 | The handover reports 12 accepted and zero refused at closeout; this does not settle E1 or E10. |
| E14 | Final HTML is hash-pinned; A-09's rendered-disclosure exception persists. |
| E15 | Final-candidate browser record and comparator evidence support the administrative line, with the stated one-browser limit. |
| E16 | Prior rejected-hunt accounting and campaign disposition stand. |
| E17 | R43 documents landed; this audit's legal premises were checked against the primary IRS publications and Rev. Proc. 2025-32. |
| E18 | Met by the owner's whole-model request followed by this combined R42F review and R43 change audit. |

**Handover to Claude and the owner:** reproduce R43-01 to -03 with the adjacent script at `5b8f0d5`; obtain the owner's disposition of R43-04 while preserving the seven original predictions. For chosen repairs, add independent red witnesses and a prospective affected/unaffected output forecast before implementation, including the one-time contribution routes. Re-run the Windows gate, the control and expanded corpus comparisons, the built-artifact pin and task 6.5 browser check on the final candidate. The source, tests, fixtures, records and baselines are untouched by this report-only pull request.
