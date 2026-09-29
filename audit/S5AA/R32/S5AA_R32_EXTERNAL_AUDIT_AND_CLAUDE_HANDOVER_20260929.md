# S5AA R32: account and transfer repair acceptance

**Change-audit verdict: ACCEPTED WITH CARRIED LIMITS. No new R32 findings. R30A-01, R30A-02, R30A-03 and R31-01 are requalified within the scope below.**

Date: 2026-09-29 UTC and UTC-7. Independent external audit for the owner. This is the requested R32 change audit, not a new whole-model or E1-E18 GO-readiness audit. It does not change milestone closure, declare release qualification, or certify household reference figures.

## 1. Scope and provenance

- Repository: `Lonnyzone123/Financial-Calculator`.
- Cover note read: `S5AA_AUDITOR_COVER_NOTE_20260928_R32.md`, headed "Cover note - S5AA R32, on your R30A and R31 audits" (ASCII punctuation transcription).
- Change base: **`0be9911a43559e3587006020a306820aeafdd005`**.
- Frozen audited source: **`3017351f303b5939f610a00c283ad243350f4418`**, verified annotated tag **`s5aa-r32-source`**; tag object **`2dd0f49ce1a7b654585de754f17faabd19bb870d`**.
- Source changes: `0413792`, `8ef84d3`, `3017351`. Reviewed all 14 changed paths: engine, validator, Worker list, built HTML, three new tests, altered 415(c) fixture and R29 sweep oracle, package registration, artifact pin, requirements/test classifications, and structured control declarations.
- Publication base: current main **`2b2d5f22ebb861c69be5d25b27da44d5cfdeb186`**, the merge of [PR #15](https://github.com/Lonnyzone123/Financial-Calculator/pull/15). Source to main changes only six audit-record/index files. Calculator source is identical.
- Read the R32 cover, handover, self-audit and rollover-sweep source; working/review rules; prior R30A/R31 reports; the amended exit-gate boundaries. Financial checks below ran on the frozen source, not an unpinned moving main.

Source remained read-only. This report-only PR adds this report and its adjacent external repro only. No calculator implementation, registered tests, fixtures, baselines, index, decisions, tags or settings changed. No supplied zip package was used.

## 2. Repair dispositions

| Carried item | R32 result | Independent evidence |
|---|---|---|
| R30A-01, P1: after-tax IRA money rolled into a 401(k) | Accepted for the tested date-basis scope | Original all-basis witness now AGI $31,000, tax $4,207.50, net worth $181,722; the earlier $957 tax excess is gone. Added 162 two-IRA rollover plans and six other-owner-pool controls. |
| R30A-02, P2: Roth IRA into Roth 401(k) | Accepted | All six same-owner/date cases in the prior matrix now refuse. The allocation witness retains $10,000, not $11,000. Validator, direct engine and generated Worker exercised. |
| R30A-03, P2: ordinary rollover between living owners | Accepted for the five named sheltered types | All 54 directed same-class cross-owner/date cases now refuse. Taxable gifts, permitted same-owner routes, different-class distribution/contribution paths and disclosed custom wrappers retain their intended treatment. |
| R31-01, P1: aggregate funding pool dated only its sending IRA | Accepted | All 162 prior two-IRA funding plans and all 486 numerical assertions pass, including gains, losses, early/late dates and either owner. |
| Catch-up clock, previously conditional rather than a finding | Owner's policy implemented and verified | Closing age now controls IRA, workplace and HSA catch-ups, including one-time room. The prior 18 conditional differences are zero. Added 60 partial-row planned and 24 partial-row one-time cases. |

The three R30A findings and R31-01 must no longer be cited as reproduced blockers on this source. Their acceptance is not a statement that every sheltered-account rule is now modeled.

**Primary rules checked anew.** IRA-to-employer rollovers are limited to taxable money, with income-first aggregate treatment: [IRC 408(d)(3)(A)(ii) and (H)](https://www.law.cornell.edu/uscode/text/26/408). Ordinary IRA rollovers stay with the individual under 408(d)(3)(A); HSA rollovers stay with the beneficiary under [IRC 223(f)(5)(A)](https://www.law.cornell.edu/uscode/text/26/223). Divorce, QDRO and death paths are distinct from these ordinary living-owner transfers. Roth IRA money cannot roll into an employer plan, whereas designated Roth plan money can roll into a Roth IRA: [Publication 590-A, "Rollover From a Roth IRA"](https://www.irs.gov/publications/p590a).

Funding-date aggregate treatment and basis retained after funding were checked against [IRC 408(d)(9)(E)](https://www.law.cornell.edu/uscode/text/26/408) and [Notice 2008-51, tax treatment of qualified HSA funding distributions](https://www.irs.gov/irb/2008-25_IRB#NOT-2008-51). Catch-up age tests use taxable-year close under [IRC 219(b)(5)(B)](https://www.law.cornell.edu/uscode/text/26/219), [414(v)(5)(A) and (v)(2)(B)(i)](https://www.law.cornell.edu/uscode/text/26/414), and [223(b)(3)(A)](https://www.law.cornell.edu/uscode/text/26/223). The 2026 dollar limits were checked against [Notice 2025-67](https://www.irs.gov/pub/irs-drop/n-25-67.pdf) and [Rev. Proc. 2025-19, section 2.01](https://www.irs.gov/pub/irs-drop/rp-25-19.pdf). The publications' other-year contribution figures were not substituted for the 2026 rules.

## 3. Source trace and worked checks

### Transfer guards

[engine.js:2565](https://github.com/Lonnyzone123/Financial-Calculator/blob/3017351f303b5939f610a00c283ad243350f4418/src/engine.js#L2565) refuses a Roth IRA into a workplace destination. [engine.js:2582](https://github.com/Lonnyzone123/Financial-Calculator/blob/3017351f303b5939f610a00c283ad243350f4418/src/engine.js#L2582) tests named sheltered-account ownership. Both the late preview and execution consult the guards, so a refusal does not change the preview's source balances. Validator checks begin at [scenario-validator.js:978](https://github.com/Lonnyzone123/Financial-Calculator/blob/3017351f303b5939f610a00c283ad243350f4418/src/scenario-validator.js#L978).

The $10,000 source at 0% and empty destination at 10% is an allocation witness: refusal leaves $10,000; a move would produce $11,000 after a year. This is not an allegation of $1,000 cash creation. Same-account no-ops and the allowed Roth-plan-to-Roth-IRA reverse route retain their controls.

### Dated pool and rollover cap

The new measure at [engine.js:3458](https://github.com/Lonnyzone123/Financial-Calculator/blob/3017351f303b5939f610a00c283ad243350f4418/src/engine.js#L3458) values other same-owner traditional IRAs at their own rates through the transfer date without moving those balances. The cap reads that measure less the existing basis. QHFD recording at [engine.js:3475](https://github.com/Lonnyzone123/Financial-Calculator/blob/3017351f303b5939f610a00c283ad243350f4418/src/engine.js#L3475) uses the same dated pool. The annual settlement preserves its recorded date measure.

Hand check: $8,600 nondeductible basis made in the first year; source at +10%, another own IRA starting at $2,000 at +20%; transfer at 61.25:

```text
Source at date = 8,600 * 1.1^1.25 = 9,688.115498738853
Other IRA     = 2,000 * 1.2^1.25 = 2,511.924334541053
Own pool      = 12,200.039833279905
Taxable pool  = 12,200.039833279905 - 8,600 = 3,600.039833279905
```

For the $5,400 HSA funding, basis spent is $1,799.960166720095; $6,800.039833279905 remains. Later liquidation gives AGI **$32,552.188061473033** and tax **$4,432.567268913590**, matching the R31 external ledger. For an $8,600 IRA-to-workplace request, only **$3,600.039833279905** may move in this example. With the later $2,000 deductible IRA contribution and drain, the separate rollover ledger gives AGI **$36,835.46320791454**; R32 produces **$36,835.463207914545**.

The new external repro checks 162 rollover plans across three source rates, three other-IRA rates, three other-IRA openings, three dates and two owners. Six additional no-transfer comparisons demonstrate that a large other-owner IRA cannot create room for an all-basis source. Six funding-with-flow calculations exercise an earlier ordinary draw or executed conversion using the already disclosed funding-first annual settlement convention. They check funding-year AGI and each sheltered balance; they do not certify every legal chronological basis-allocation permutation.

### Closing-age catch-ups

[engine.js:134](https://github.com/Lonnyzone123/Financial-Calculator/blob/3017351f303b5939f610a00c283ad243350f4418/src/engine.js#L134) supplies row duration; [engine.js:142](https://github.com/Lonnyzone123/Financial-Calculator/blob/3017351f303b5939f610a00c283ad243350f4418/src/engine.js#L142) and [engine.js:166](https://github.com/Lonnyzone123/Financial-Calculator/blob/3017351f303b5939f610a00c283ad243350f4418/src/engine.js#L166) use closing age for planned and one-time room. The call sites pass the same actual row length, including partial rows.

Under the owner's row-as-tax-year convention, planned contributions over 49.5 -> 50 use $8,600 annual IRA room and credit $4,300 over the half-row. Over 59.5 -> 60, a workplace account credits $35,750 * 0.5 = $17,875; over 63.5 -> 64 it credits $32,500 * 0.5 = $16,250, not the enhanced amount. A one-time IRA contribution over 49.5 -> 50 may use the full $8,600 when source dollars and compensation suffice. These are verified model conventions, not an inferred mapping from age rows to calendar-year dates.

The altered 415(c) fixture shifts its opening ages by one by intent, preserving the enhanced-window test and age-64 exclusion. The R29 sweep's changed reverse-Roth oracle corrects the route premise; it does not weaken a financial assertion. Registration/classification changes accurately include the three new independent test files. Both added helpers appear in the [Worker function list, app-shell.html:618](https://github.com/Lonnyzone123/Financial-Calculator/blob/3017351f303b5939f610a00c283ad243350f4418/src/app-shell.html#L618).

## 4. Execution evidence

Local runtime: **Windows 11, NT 10.0.26200; Node v24.17.0; jsdom 30.0.1**. Dependencies were copied from the prior qualified checkout; the unchanged package lock was verified. The complete gate ran with local jsdom and without `NODE_PATH` substitution.

| Check actually run on R32 | Result |
|---|---|
| Complete `npm test` gate | 2,972 tests; 2,963 pass; 0 fail, skip or cancellation; 9 authorized TODOs |
| Three new R32 regression files, separately | 18 tests pass; 0 fail/skip/TODO |
| Prior R29 external repro | 10 grouped comparisons, no mismatch |
| Prior R30 external repro | Seven cases pass, including all three original R30-01 failures |
| Prior R30A external repro | 1,186 runPlan calls; 1,267 comparisons; 0 mismatch; 0 conditional differences |
| Prior R31 external repro | 162 plans; 486 numerical assertions; no mismatch |
| Adjacent R32 external repro | 266 runPlan calls; 260 numerical comparisons containing 446 numerical assertions; no mismatch |
| Generated Worker execution of new external cases | Seven cases, covering both refusal branches, both-owner rollovers, catch-up/one-time room and a funding/conversion case; exact parity except nondeterministic `identity.runId` |
| Fresh-build versus shipped artifact | Equal UTF-8 output; SHA-256 `cb53e7ff9954f4f084dd92540a991734a89d8f7ef85a390af47bfcc6bba38468` |
| Expanded corpus invariant | Seven checks pass; targeted-plan limitations described below |
| Carried-item closeout | `COMPLETE_WITH_CARRY_FORWARD`: accepted 12, refused 0, errors 0 |

Reproduction command from the source checkout:

```text
node audit/S5AA/R32/S5AA_R32_EXTERNAL_AUDIT_REPRO_20260929.js
```

The script accepts another checkout as its first argument. It imports prior plan-construction helpers, not their financial expectations. Its rollover, partial-row and adjacent-flow expectations are explicit arithmetic. Its owner-pool no-transfer comparisons and Worker parity are consistency controls, not independent legal oracles.

**CI checked separately.** [Run 36533127183](https://github.com/Lonnyzone123/Financial-Calculator/actions/runs/36533127183), job **109291066702**, succeeded. API head is records commit `29c4d86d9c27957c1fa9d9030ed09190bbd27cbd`; decoded checkout logs show synthetic PR merge **`9d29d36de84fb9181517f7310e0bffd9547d8358`**, not the source tag. Source to records head is audit-only. Logs report Windows Server 2025, NT 10.0.26100, Node v24.17.0, jsdom 30.0.1, and the same 2,972/2,963/0/9 gate result. Artifact metadata: ID **11017957033**, `gate-log-9d29d36de84fb9181517f7310e0bffd9547d8358`, 1,549 bytes, digest **`656e8be0f8f0b97d92baf5a098d0e98988e5bd3c7ccd47ef48bebb46883773be`**. Decoded job logs and artifact metadata were read; the ZIP payload itself was not independently extracted. CI Server is not substituted for local Windows 11 qualification.

## 5. Corpus movement reconciliation

Freshly rechecked R31 at `8afe16d2fec7e6ebd0b561bffbe1653249b10de7`: output hash **`5a67d57e35136788bba4d96f4f24dcb721fbf4f70ab7fc3077021d7c6d122766`**, identical to the retained R30 comparison capture. At R32, all 70 entries complete; qualified source boundary; zero mismatched, changed-during-capture or untracked input-graph files. Input hash remains **`9b107562529731ad36ac45395080bfc436be26ca2aed5f89722cfc1b0cf14827`**. Output hash is **`e659f746c65e0e6e91cb1baadb6a64e721f9d890407100c2c826574902c3164d`**, matching the handover. No baseline was rewritten by this audit.

| Member, R31 -> R32 | Changed leaves | Lifetime tax delta | Ending net worth delta |
|---|---:|---:|---:|
| seed:9 | 1, warning message only | $0.00 | $0.00 |
| seed:10 | 228 | $0.00 | +$124,273.65 |
| seed:11 | 272 | +$20,401.74 | +$74,962.48 |
| seed:20 | 421 | -$100.27 | +$1,329.21 |

**Three financial movers, four complete-output movers.** The handover's three-member financial explanation is correct. Full-precision zero-exclusion capture also changes `seed:9`'s existing workplace-refusal warning text. No balance, tax, status or issue code changes there. The updated control declaration contains the message; control test 4.7 passes. This distinction is recorded here as a clarification, not a new financial finding.

Traced the changed rows: seed:10's row closing at 50 gains $8,000 contributions; seed:11's gains $9,100. In seed:20 the total contribution is unchanged because excess is redirected, but $3,250 changes sheltered placement at the 60 and 64 boundaries: row taxes change by **-$970.0091324100067** and **+$1,090.9341213331936**, respectively. The longer-run headline figures match the declarations. The handover's six members against r17 are a different baseline comparison and are not described as six new R32 movers.

The seven invariant checks are not seven complete financial audits: the tool cannot independently rebuild 11 targeted plans and reports their INPUTS/ROUND-TRIP and plan-dependent shape subchecks as skipped. All 70 plans did execute in the capture. Worker parity and capture identity establish reproducibility, not statutory correctness.

## 6. Coverage and carried limits

Counts below are the scoped inventory, not an accuracy percentage or proof of exhaustive whole-model verification.

### Audit quality

| Category | Observed defects | Assessment |
|---|---|---|
| Usefulness/completeness | 0 / 5 | Four repair claims and the owner-decided catch-up policy checked. Complete for this change audit; partial for whole-model qualification. |
| Analytical clarity | 0 / 5 | Acceptance is separated from disclosed limitations and sprint closure; three financial movers are separated from the warning-only fourth. |
| Visual/interaction consistency | N/A | No UI layout change audited. Generated app/Worker execution is not a manual desktop/mobile browser smoke check. |

### Correctness and robustness

| Category | Observed defects | Assessment |
|---|---|---|
| Source authority/confidence | 0 / 5 | Applicable rollover, ownership, funding and catch-up provisions checked at primary sources. |
| Value accuracy | 0 / 260 | New scoped numerical comparisons pass; prior external repros also pass. Annual basis chronology outside the declared convention is not certified. |
| Within-chart agreement | N/A | No chart audit requested or performed. |
| Complete source details | N/A | No dashboard source-detail surface; code, source SHA and arithmetic are retained in this report/repro. |
| Cross-artifact consistency | 0 / 4 | Frozen source, shipped/fresh build, generated Worker and corpus/control records reconciled. |
| Data-quality controls | 0 / 4 | Owner partition, transfer-date partition, catch-up boundary and qualified input-graph controls checked; targeted invariant omissions retained explicitly. |
| Conclusion support | 0 / 5 | Five requested claims supported within their tested boundaries, not an assertion about every account-law condition. |

**Limits remain, and are not new findings:**

- The rollover cap does not include current-row nondeductible contributions until annual settlement; a rollover in such a row can move some of that contribution's basis. R32 handover section 6 explicitly discloses this. Such a plan is not requalified by the all-basis/prior-year-basis witnesses above.
- Each projection row is a modeled tax year. Partial rows close at their own end; there is no calendar/birthday mapping. Planned rates are prorated, one-time amounts use remaining dollar room.
- QHFD eligibility, coverage/Medicare facts, testing-period consequences and chronological annual basis/QCD ordering remain within the prior disclosed boundaries. The six adjacent-flow probes validate the chosen convention, not all real-world permutations.
- Salary-based Roth MAGI, high-earner pre-tax catch-up warnings rather than rerouting, employer-group 415(c), outside-funded working contributions, Roth ordering/five-year clocks, death assumptions and custom-wrapper legal status remain carried as previously disclosed.
- The nine authorized TODOs and other carried reference restrictions remain. A-09's administrative exceptions do not qualify flagged `outsideSupportedDomain` results or turn the corpus into a household-reference certification.

No new R32-NN finding or implementation repair is proposed. No source change is required by this audit. A fresh comprehensive GO-readiness determination, manual browser smoke, unmodeled account eligibility and unrestricted household-reference qualification were not performed; do not infer them from repair acceptance or a green gate. Milestone closure remains the owner's decision.
