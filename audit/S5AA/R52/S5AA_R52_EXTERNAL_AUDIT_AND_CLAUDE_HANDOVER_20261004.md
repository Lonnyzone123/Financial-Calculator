NO-GO — S5AA overall at `s5aa-r52-source`, `4e1bb95d7fe2a90793ea6f817094cb04bca3b19d`. The four R46–R51 findings are repaired; R51F-01 remains open, and this review adds two P2 import findings. This is an administrative determination under E1–E18 and A-01–A-11, not release or household-reliance qualification.

# S5AA R52 external audit and handover

Auditor: ChatGPT. Date: 2026-10-04, Arizona. Source examined read-only. Findings are proposals for the owner; no financial source, test, fixture, baseline or decision record was changed.

## 1. Scope and pins

This follows the owner's full-model audit request and R52 cover note. It checks R52's repairs in sequence, reruns the preceding full-model probes, and examines the app's import boundary. It does not restart the earlier R46–R51 audit or treat their disclosed limits as new findings.

| Pin | Commit |
|---|---|
| R52 financial base, after the original external audit | `2fb8c6f` |
| Prospective prediction, before implementation | `ebc6f38` |
| Four financial repairs | `a148aa9` |
| Two Roth warning cards | `48f9c2e` |
| Citation-only correction | `da41b53` |
| Audited source tag `s5aa-r52-source` | **`4e1bb95d7fe2a90793ea6f817094cb04bca3b19d`** |
| Frozen main / report branch base | **`3afbd53daabe161b9112a2f689a5a8ff4a7d3b64`** |

The cover, change handover, build report, prediction record and relay were read before the review. Tag-to-main differences contain records only: `git diff 4e1bb95 3afbd53 -- src tests tools build.js package.json package-lock.json investment-calculator-v2c.html` is empty. The R51F report and script exist on main, after the tag. Their unchanged script was run against main's identical financial source. The new companion was also run directly against the exact tag.

Environment independently read: Windows 11 Pro 10.0.26200, Node 24.17.0, jsdom 30.0.1, Chrome 154. Local source-tag and main gates both pass: **3,507 tests, 3,498 pass, 0 fail, 0 skipped, 9 authorized todos, 445 files**. The focused repair/card files pass all **34** tests.

Fresh browser HTML SHA-256: `5a2093f5ac21d81167224e468e5da787a67a65bda544835a912a8d6d00c4845b`, 1,186,407 bytes; it matches the committed harness pin. Worker source SHA-256: `580b3ec0201d46cc528f1ecc040ecdd201d4d056e1e1bb41b62e142ab4a6a90f`.

[PR 69 CI run 37201932583](https://github.com/Lonnyzone123/Financial-Calculator/actions/runs/37201932583) and job 111435236941 were inspected, including the job log. Its Windows Server 2025 gate passes with the same counts, on synthetic merge `9c9eb535fe12edf8c17b7907e955205e1ea20ef3`, not the exact tag. Its retained gate-log artifact is 11303108146. The independent local exact-tag gate supplies the Windows 11 qualification.

## 2. Sequential repair dispositions

### 2.1 R47-01 — repaired within the adopted excess ledger

`src/engine.js:4971` now gives an owner one unused IRA capacity: carried traditional excess absorbs it first; carried Roth excess gets the remaining capacity, additionally bounded by its own phaseout limit. Current scheduled and one-time contributions reduce room; distributions reduce carry before absorption; HSA capacity is separate.

The original S06 now produces **$300**, rather than $150, of second-year excise. New independent cases vary current traditional contributions from zero through a full $7,500, and reverse ownership. Expected second-year charges are $300/$360/$540/$750/$360; all match. The builder's current-contribution, distribution, multiple-account, HSA and separate-owner witnesses also pass.

The traditional-first treatment follows the recorded owner decision and the deemed-contribution mechanism in [IRC 219(f)(6)](https://www.law.cornell.edu/uscode/text/26/219), alongside [IRC 4973](https://www.law.cornell.edu/uscode/text/26/4973). The minimum of remaining combined capacity and the phaseout cap agrees with the ordering of [Pub. 590-A worksheet 2-2, lines 8–11](https://www.irs.gov/publications/p590a); that publication's dollar amounts are for 2025, while the witnesses use the calculator's 2026 rules.

This closes the shared-capacity finding. It does not close D3, spousal cross-compensation netting, or qualify the existing deduction treatment of absorbed traditional excess.

### 2.2 R47-02 — repaired within the recorded attribution convention

The new per-owner deferral tally (`src/engine.js:4352`, contribution accumulation at 4364) feeds the one QBI cut at 4694. I traced its uses in the preliminary IRA-deduction computation, funding quote, committed return, year-end settlement and working-pay check. The other owner's wages no longer shield a business-owner deferral.

Original S07 total tax is now **$35,912.62418**, including the previously missing $880. The five new cases cover reciprocal business ownership, partial salary funding, salary plus employment and business streams, and two deferring business owners. Independent tax arithmetic agrees in every case. Existing quote gross-up and working-pay shortfall witnesses also pass.

[Treas. Reg. 1.199A-3(b)(1)(vi)](https://www.law.cornell.edu/cfr/text/26/1.199A-3) attributes qualifying deductions to the individual's business income. This supports owner attribution. The salary-first/proportional stream convention remains the model's adopted approximation; these checks do not certify a business-by-business section 404 deduction. D4, assigning joint-account deferrals to the primary, remains disclosed.

### 2.3 R48-01 — repaired for the adopted inherited traditional IRA rollover

The dated move at `src/engine.js:4455` carries existing basis between distinct Form 8606 pools using `basis × moved / dated source pool`. Both provisional basis and the settlement's starting basis are updated. The validator exception at `src/scenario-validator.js:1246` requires the original source owner to be dead and the destination owner alive at the transfer row's opening. Death-row, living-owner and nontraditional cases remain outside that exception.

Original S10 now validates and produces **$30,000 AGI / $1,767.50 tax**, rather than $37,500 / $2,855. The new cases use a half-basis inherited pool, zero/partial/half/full transfers and reciprocal owners: basis remains exactly $7,500 in aggregate, with the expected allocation to each pool and zero rollover income. The builder's earlier withdrawal, later election and inherited-RMD-reserve witnesses pass.

[Pub. 590-B's inherited basis guidance](https://www.irs.gov/publications/p590b) supports retaining inherited basis and combining it when a spouse treats the IRA as their own. D1's older validator/engine disagreement for other post-death rollovers and D2's same-year contribution timing remain disclosed, not closed by this disposition.

### 2.4 R50-01 — repaired for the existing conversion record and its draws

The scheduled conversion and transfer-conversion routes now identify the traditional IRA source pool. Per-year conversion tallies and actual draws feed `rothSettleConversions()` (`src/engine.js:4088`); copies used for quotes do not accumulate actual draws. After Form 8606 settlement, the current record is rebuilt and its already-recorded draws are re-split taxable first. The additional-tax adjustment joins the existing true-up ledger at 4963. The function is included in the Worker/export lists.

Original S17's later draw now has **zero** conversion additional tax instead of $500. New cases verify fully nontaxable, half-taxable and three-quarter-taxable conversions, partial and complete depletion, and an exception. Settled tax, refund and remaining conversion principal all match independent calculations. The builder's two-year, scheduled-transfer, changing-pool, succession and five-year witnesses pass.

[Treas. Reg. 1.408A-6 A-5, A-8 and A-9](https://www.law.cornell.edu/cfr/text/26/1.408A-6) supports the conversion penalty base and taxable-first order. This closure is narrower than full statutory annual aggregation: `MODEL_ASSUMPTIONS.md:1466` explicitly excludes that feature. See §6 for its independently measured consequence.

### 2.5 Roth warning cards — verified

Fresh jsdom tests and real Chrome imports show the basis card at age 50 with basis omitted, the five-year card at age 60 with first year omitted, and neither on the entered-basis/2010-year control. Rendering agrees with the added title mappings. Existing assumptions still say “no card”; R52's relay already gives the document owner the correction, satisfying the prose-handover option without silently rewriting that owner's records.

## 3. Twenty new focused simulations and output analysis

Companion: `S5AA_R52_CHATGPT_BOUNDARY_SIMULATIONS_20261004.js`, SHA-256 **`377ab155cf858adb16166ac987c8817725c0c654d8a8baf25a1505b60d56e3a2`**.

**20/20 pass; 100 checks, including 60 independently derived financial/basis checks and 40 status/safeguard checks.** All plans validate. Read-only year-end taps are asserted to leave both rows and issues identical to the uninstrumented engine. The expectations are written before the execution in the companion; no expected figure comes from an engine tax helper.

| Case | Focus | Independent expected output, matched by R52 |
|---|---|---|
| E01 | No current IRA contribution | Second-year excise $300 |
| E02 | Current traditional $1,000 | Excise $360 |
| E03 | Current traditional $4,000 | Excise $540 |
| E04 | Current traditional $7,500 | Excise $750 |
| E05 | Reciprocal owner, current $1,000 | Excise $360 |
| Q01 | Primary business, spouse wages | Tax $28,542.827335 |
| Q02 | Reciprocal business owner | Tax $28,542.827335 |
| Q03 | Own salary funds part of deferral | Tax $29,001.827335 |
| Q04 | Own employment stream and business | Tax $28,260.884890 |
| Q05 | Both owners defer from business pay | Tax $20,028.512225 |
| I01 | Zero inherited rollover | Own/inherited basis $0 / $7,500 |
| I02 | $3,000 rollover from half-basis pool | Basis $1,500 / $6,000 |
| I03 | $7,500 rollover | Basis $3,750 / $3,750 |
| I04 | Whole $15,000 rollover | Basis $7,500 / $0 |
| I05 | Reciprocal original owners | Basis $1,500 / $6,000 |
| R01 | Nontaxable conversion, $1,000 draw | Settled tax $55,670.235; refund $2,087.50 |
| R02 | Entire nontaxable conversion drawn | Tax $55,670.235; refund $2,737.50 |
| R03 | Half taxable, $5,000 draw | Tax $57,038.985; refund $1,118.75 |
| R04 | Three-quarter taxable, $6,000 draw | Tax $57,723.360; refund $534.375 |
| R05 | Same inputs, penalty exception | Tax $57,160.860; refund $496.875 |

The excess results increase as current contributions consume room, without doubling absorption. Reciprocal QBI cases produce identical figures. Every inherited transfer conserves total basis. The Roth cases recover only the appropriate provisional penalty; the exception removes exactly the final conversion penalty. Those are correctness checks, not merely stable-output comparisons.

The original 20-simulation script independently passes **20/20** on R52. The prior full-model companion independently reruns **36 groups / 175 checks**: **33 groups pass; F01–F03 still fail on R51F-01**. It exercises federal/AZ tax, QBI, NIIT, payroll, IRA deduction, HSA, RMD/QCD, capital gains/losses, spending, income dates, debt/ARM, fallback, Monte Carlo, historical replay, validation and ownership. Its independent progressive-tax oracle also reruns 936 tax calculations, and its malformed/boolean input campaign refuses 656 mutations. These results qualify the tested inputs, not every possible plan.

The seeded conservation campaign reruns 1,000 valid plans / **20,405 rows**, with no unexplained failures and maximum portfolio residual **1.74623 × 10^-9**. Eight household/combined checks show the already identified wage-baseline clamp, maximum $276.37614. They were classified by the runner and not discarded as numerical noise. Conservation cannot detect a wrong legal tax rule or a silently changed input.

## 4. Prediction, capture and browser evidence

The chronology is genuinely prospective: `ebc6f38` precedes `a148aa9`. No existing test or fixture was adapted. Independent replay of the pre-repair tap scan agrees: no excess/QBI/pool-transfer/validator exposure in the corpus; three expanded conversion records change internally. The scan checks all seeded Monte Carlo paths and asserts output neutrality. None of the four corpus Monte Carlo plans is exposed to these four repairs.

The three post-settlement C1 traces independently agree with predicted records: the $10,000 conversion holds $3,881.408983 nontaxable; the same-year $3,750 conversion holds $2,756.25 after its $993.75 draw; the $5,000 conversion holds $4,000 nontaxable. The prediction's incorrect “no draw” explanation for the middle case is preserved and explicitly corrected by the builder. Its exception rate is zero, so this is a reasoning miss, not an unpredicted financial movement.

A fresh, committed-input-qualified 71-entry expanded capture has exactly the base/r30 output hash **`2c342c6c6bdc966cd34a8c7e35561fe598e2c50abd33c03cf85560b079dc5b04`** and input hash **`ed3731e2f72425d0e17bfb26558411c22d552d559f9038db7d431769dcb839c4`**. No baseline refresh is needed. E10/A-01/A-11 are met for the R52 changes; this does not certify the financial correctness of the unchanged corpus.

Fresh real Chrome results:

- 75/75 raw Worker results equal the browser main engine; 72 equal Node exactly. Three Monte Carlo differences have maximum relative size **1.13794 × 10^-15**, no discrete-field differences, and unchanged path counts/success rates.
- 70 accepted imports produce identical Worker/main CSVs and 70/70 replies agree with the engine **on the posted plan**. Five comparator inputs are refused at import, as enumerated by the comparator.
- Both tested Worker failure modes fall back successfully; combined failure suppresses figures/export and recovery restores the reference. Four concurrent Workers agree.
- A further 30 raw Worker/main comparisons cover all 20 new simulations, the limitation/control, three Social Security witnesses, three warning-card plans, manual-order import and the horizon witness. All agree.

**Posted-plan equivalence is not imported-plan preservation.** Comparing the requested plan with what the app posts reveals 11 horizon changes and six transfer-date changes in this additional set. R52-01/R52-02 below document them. The already disclosed unsupported manual order is also blanked. Consequently the 70/70 posted-plan result must not be presented as 70/70 faithful import execution.

## 5. New findings — both P2, pre-existing

### R52-01 — Restore backup silently extends a valid working-only horizon

**Evidence and location.** Confirmed at the exact R52 tag and in fresh real Chrome built from base `2fb8c6f`. [Source-tag `src/app-shell.html:552`](https://github.com/Lonnyzone123/Financial-Calculator/blob/4e1bb95d7fe2a90793ea6f817094cb04bca3b19d/src/app-shell.html#L552) overwrites `profile.endAge` with `max(retireAge,endAge)` in `readStatic()`, after the raw candidate has passed validation. This is distinct from R52's disclosed manual-order limitation.

**Reproduction and independent expectation.** Companion `ui.horizon` / U01: primary age 40, retirement 60, end 41, $10,000 wages, $100,000 Roth IRA with $100,000 entered basis, $1,000 annual contribution, 5% return, zero inflation/fee/spending/dividends. Validator accepts. The requested one-year closing balance is **`(100,000 + 1,000) × 1.05 = $106,050`**, which the direct engine produces. Restore backup reports successful save, but saved/posted end age is **60** and closing balance **$300,049.022322476**. Independently, this equals the 20-year recurrence `100,000 × 1.05^20 + 1,000 × 1.05 × (1.05^20 − 1) / .05`.

**Consequence and reach.** The app shows **$193,999.02 more** as the closing balance by adding 19 unrequested years. It also pays later excise/true-ups and future contributions outside the requested horizon. Eleven of the 30 additional browser plans are extended. The new witness is outside the baseline corpus; this is a narrow valid-import defect, not newly created R52 arithmetic.

**Proposed repair/decision.** Preserve a validated imported horizon. If the owner chooses to forbid a horizon ending before retirement, refuse it consistently at the raw import and engine boundaries with a clear reason; do not accept and silently lengthen it. Add an import-preservation assertion against the untouched candidate, with hand-computed endpoint balance and row count.

### R52-02 — Restore backup rounds a valid transfer date out of its year

**Evidence and location.** Confirmed at the exact tag in jsdom and real Chrome, and at `2fb8c6f` in real Chrome. [Source-tag `src/app-shell.html:553`](https://github.com/Lonnyzone123/Financial-Calculator/blob/4e1bb95d7fe2a90793ea6f817094cb04bca3b19d/src/app-shell.html#L553) applies `half()` to `advanced.transferAge`. The raw validator accepts finite quarter-year dates; the transfer engine models their dated growth/tax effects. The form offers half-year steps, but that does not disclose or authorize changing a valid backup's event.

**Reproduction and independent expectation.** Companion `ui.transfer` / U02 uses R03's full inputs: age 45 to 46, $200,000 salary, $7,500 opening IRA plus $7,500 nondeductible contribution, $1 workplace deferral, a $7,500 conversion, then a **$5,000 Roth-to-cash transfer at 45.75**. Final conversion fraction is one-half: $3,750 taxable conversion principal bears **$375** of additional tax. Base salary-year tax is $55,670.235; conversion income adds `.265 × 3,750 = $993.75`. Expected settled tax is **$57,038.985**, and direct R52 agrees.

Import changes the event to **46**, outside this projection's `[45,46)` interval. The transfer is omitted. Settled tax becomes **$56,663.985** and net worth **$114,007.25**, versus **$113,632.25** for the requested plan. The pre-R52 build also changes 45.75 to 46; its older conversion-ledger error is separate from this input mutation.

**Consequence and reach.** The imported plan omits **$375 of tax** and overstates endpoint net worth by that amount in this witness. The $5,000 move itself also disappears. Six additional browser inputs have their event dates rounded. It can affect growth timing, penalty-age boundaries or which row executes a transfer; broader financial magnitudes were not measured.

**Proposed repair/decision.** Preserve the validated transfer date during restore and calculation. Alternatively, if half-year precision is an explicit supported-domain decision, reject incompatible dates before normalization and use the same contract at direct entry points. Do not silently round them. Test an event just inside the final boundary, a 59½ boundary, and an untouched half-year control.

## 6. Carried failures and limits

- **R51F-01 remains open.** The original full-model F01–F03 reproduce unchanged and also reach real browser imports. Continuing $1,000/month wages after claiming should allow six $1,800 benefit payments under the [SSA special monthly rule](https://www.ssa.gov/benefits/retirement/planner/rule.html) and [20 CFR 404.435](https://www.law.cornell.edu/cfr/text/20/404.435). F02 still pays $4,540 instead of $10,800, settled tax is $4,907.58 instead of $5,546.10, and closing portfolio is $113,649.92 instead of $119,271.40: **$5,621.48 understated**. It was not one of R52's four assigned repairs. Do not close it on the four repaired dispositions.
- **Manual order import remains as disclosed in the R52 handover §7.** Real Chrome reproduces `roth,preTax,hsa,taxable` becoming an empty order. This is carried by name, not given a new finding number.
- **Year-end Roth aggregation remains explicitly excluded** in assumptions §28.5. H01 withdraws $2,000 before a later fully nontaxable conversion. Final statutory tax would be $55,670.235; actual is $56,400.235, **$730 excessive**, and remaining conversion principal is overstated by $2,000. The early-conversion control H02 agrees with the statute. This is an independent measurement of the disclosed limit, **not R52-03**. R50-01's repair must not be described as full statutory annual aggregation.
- **D1–D4 remain carried:** other post-death validator/engine disagreement; contribution basis created at settlement does not accompany a same-year earlier pool-changing transfer; spousal excess-room cross-compensation netting is absent; joint workplace deferrals belong to the primary. No full legal qualification of these approximations is claimed.
- The nine authorized todos and twelve closeout items retain their earlier dispositions. `closeout-check` accepts 12, refuses 0, errors 0; that inventory does not automatically close R51F-01 or either new finding.

## 7. Gate determination and handover

| Requirement | Determination |
|---|---|
| Exact source / Windows gate / registered witnesses | Met for R52 |
| E10, A-01 and A-11 prospective predictions and measured movement | Met for the four R52 changes; documented reasoning miss retained |
| E14 changed disclosures / build pin | Two new cards verified; broader exception remains under A-09 |
| E15 browser comparator | Routing/fallback/concurrency verified; input preservation is not met by posted-plan parity |
| E17 handover of document changes | Relay delivered in prose; source citations checked independently |
| E18 scope | Owner's full-model request honored through carried full-model reruns plus R52 focus and import audit |
| E2/E7 and older accepted uncertainty | Existing A-09 exceptions remain; no release qualification |
| Newly confirmed financial/input defects and open R51F-01 | **Block overall GO** |

**Repair dispositions:** close R47-01, R47-02, R48-01 and R50-01 as narrowly stated in §2. Record R52-01 and R52-02 as newly documented pre-existing P2 findings. Keep R51F-01 open. The owner decides the import contracts and whether to expand the disclosed annual Roth aggregation scope. No source repair is proposed in this report-only PR.

### Reproduction commands

Run from a checkout containing this report/companion. For the exact-tag run, give the companion a separate checkout at `4e1bb95d7fe2a90793ea6f817094cb04bca3b19d` with the declared dependencies installed. The companion intentionally exits **1** while the two import findings and statutory-limit mismatch reproduce; its separate `summary` must still show 20/20 passing boundary simulations. A harness exception exits 2.

```powershell
node audit/S5AA/R52/S5AA_R52_CHATGPT_BOUNDARY_SIMULATIONS_20261004.js <audited-tree> <output.json>
node audit/S5AA/R51/S5AA_R46_R51_CHATGPT_SIMULATIONS_20261004.js . <original20.json>
node audit/S5AA/R51/S5AA_R51F_FULL_MODEL_PROBES_20261004.js . <full-model.json>
node audit/S5AA/R52/prediction/r52_corpus_scan.js <base-tree-at-2fb8c6f>
node audit/S5AA/R52/prediction/r52_c1_check.js .
node tools/capture-baseline.js capture <capture.json> --composition expanded
node tools/capture-baseline.js diff audit/S5AA/R52/prediction/r52_expanded_capture_at_2fb8c6f.json <capture.json>
node audit/S5AA/R40/S5AA_R40_CONSERVATION_GRID/grid.js 1000 20261004
node tools/closeout-check.js
npm test
```

The full-model script exits 1 on the known Social Security failures. For financial expectations and machine-readable reproduction inputs/outputs, use the companion's `boundaryCases`, `huntCases` and `ui` sections. Local scratch retains full gate, capture, conservation and Chrome outputs; the durable report records their pins and measured results without publishing personal workspace paths. The real-browser driver is local audit orchestration around the repository's R41 comparator; browser executions are distinct from the portable jsdom reproduction.

Limit of this determination: neither a green gate nor stable corpus/Worker parity qualifies every tax return, market-data observation, imported plan or undisclosed combination. The full-model rerun preserves the independent checks and limits of the preceding R51F audit; this review adds independent R52 boundary arithmetic and actual import evidence rather than claiming a new exhaustive proof of every mathematical branch.
