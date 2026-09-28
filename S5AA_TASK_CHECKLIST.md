# S5AA — task and subtask checklist

| Field | Value |
|---|---|
| Sprint | **S5AA** |
| Track | **N** — sits between S5 and S5b |
| Theme | **Repair the closed S5 engine after the external audit.** Correct the reported financial and input-contract defects, in the corrected form, before S5b captures the definitive reference baseline. |
| Runs after | S5 (correct the reference engine) |
| Runs before | S5b (close the books) |
| Questions | Findings are filed as `SPRINT_QUESTIONS.md` entries (task 7.1). **Re-check the next free number at sprint start** — it was Q87 at `3ec8adf`. |
| Handover | Ask at close-out: whole model, new code only, or whole model plus a focus section. Do not presume. |
| Status | **RUNNING.** Started 2026-09-19 (UTC−7) at `14b7095` on the owner's own go (task 0.1). Task 0 is in progress; the run state is `Handover temp/S5AA_RUN_STATE.md`. |

---

## What this file is, and what it is not

**This is the plan of record for S5AA. The verdict on every decision is the owner's.** It was written on 2026-09-19 (UTC−7) by the S5AA task-list session [a90ab6], on the owner's instruction, from three untracked drafts in `Handover temp/`:

- `S5AA_TASK_LIST_DRAFT_20260917.md` — the repair list, 19 sections, with every decision's options, recommendation and the owner's answer on its own line. **It is the record of the reasoning; this file is what is executed. Where they differ, this file wins.**
- `S5AA_CLOSEOUT_TASK_LIST_DRAFT_20260919.md` — 53 close-out tasks, folded into the tasks, exit gate and close-out below.
- `S5AA_SCOPE_HANDOVER_20260919.md` — what the sprint will do, as decided.

**Not verified, and carried as such:**

- **Nothing in F1–F10, G1–G19, N1–N3 or the X rows has been reproduced.** They are source reads at `3ec8adf`; "confirmed" means the code does what the auditor describes. **H-01 to H-06 were run by script** in a local hunt (`Handover temp/S5A_HUNT_REPROS_20260919/`), and those results were not re-run when this file was written. Task 0.3 reproduces every finding before any repair.
- **The IRS and SSA citations are unverified.** They come from the external audit passes and from an external S6 prerequisite review. **No task writes a rule record from a citation until the citation has been checked against the primary source** (task 8.6).
- **Four of the earlier draft's own repair instructions were wrong** (the G15 Roth-phaseout remedy, blanket HSA taxation, the RMD `* duration`-only fix, and the FICA premise). This file carries the corrected forms only.
- **The 28 scope decisions in the external scope draft are reported, not confirmed.** Three of the owner's S5AA answers touch related points and only inside S5AA's own scope (which sprint owns each X row, the procedure for the reference's supported domain, the three failure policies). None confirms the 28 as a set.
- **The plan owner has not yet reviewed this file.** Where it disagrees with what the plan owner (`investment-calculator-eb-s5-kickoff`) commits, the plan owner's version is the one to reconcile against.

## Why this sprint exists, and why before S5b

S5 closed on 2026-09-16 at `420a910` on the owner's yes — not an external sign-off, and its provisional decisions are unsettled. Since then three separate reviews found wrong or missing behaviour: an external audit (F1–F10, plus N1–N3 found while checking), a second source-read pass (G1–G19, confirmed by a hand-traced third pass that ran nothing), and a local hunt (H-01–H-06, run not read; five further hunt findings were reproduced and **rejected**, and are not reopened).

**S5b task 4 captures the definitive reference baseline.** A capture taken now would lock these numbers in as the reference the rebuild is measured against. The owner decided S5AA goes first (0.5 below). **Every output-moving repair lands before that capture.**

**S5AA is not the answer to S5's handover** (0.4 below): S5b's "handover answered" condition stays unmet.

## Decisions recorded

The owner answered these in chat on 2026-09-19 (UTC−7) unless a date is given. The IDs are the draft's, so the reasoning can be found there.

| Draft ID | Decision |
|---|---|
| 0.4, 0.5 (2026-09-17) | Not S5's handover answer; S5AA before S5b. |
| 0.3 | Ask the auditor which build the passes reviewed; findings are pinned to `3ec8adf` meanwhile. |
| 11.1, 19.2 (b) | Order: build check; input and failure evidence; H-04 early; then the tax, account and contribution repairs in dependency groups, with the F findings ordered small, large, decision-led inside that step; then lifecycle, debt and the assigned X rows; then the full gate and external review. |
| 1.1 (2026-09-17), 1.2 | Traditional IRA deduction with the 2026 phaseouts, then per-owner basis, in two steps. Workplace coverage is a **bounded inference with its misses stated**, not a new input. |
| 2.1 | Age-only additional standard deduction; blindness not modelled, disclosed. |
| 3.1 | NIIT base: ordinary dividends plus each other income type Form 8960 counts; real-estate-professional status not modelled, disclosed. |
| 4.1 (2026-09-17) | RMDs per owner and per plan. |
| 5.1 | Earnings-test withholding, plus the adjustment at full retirement age. |
| 6.1, 6.2 | Survivor benefit from 60, reduced for age; deceased's early-claim cap disclosed and built later. |
| 7.1 | Rule of 55 limited to workplace-plan money, for withdrawals and transfers alike. |
| 8.1 | ARM switch removed; always re-amortise; saved plans change on load with a notice. |
| 10.1 | Roth 401(k) match: a per-account setting, pre-tax by default. |
| 12.1 | Conversion accounts chosen by each account's own `priority`, with ownership and capacity required to agree. |
| 12.2 | Employment-type other income routed into the wage payroll-tax base, keeping its owner. |
| 12.3 (d) | HSA: one new input, the qualified-medical share of draws, default 100%. |
| 12.4 | `runs < 1` and a missing `retirement` section return the invalid-result contract. |
| 12.5 (b), 19.1 (a) | Check every Monte Carlo path; a failed **essential** invariant invalidates the result, with one batch summary as the diagnostic. |
| 12.6 | Historical sequence exhaustion returns a calculation error, not a wrap. |
| 12.7 | G10 is conditional: verify at the public entry points first. |
| 12.8 | Only qualifying cafeteria-plan HSA payroll contributions leave the FICA base. |
| 12.9 (b) | **No output change.** `dividendStart` means when modelled dividend cash starts being paid out to spend; the imputed 1.5% charge stays. The dividends-on gap is **carried to S5b task 1**. |
| 17.1 (a), 17.2 (a), 17.3, 17.4 (a), 17.7 (A) | Q43 flag widened; engine gates refuse what the validator refuses; H-04 repaired; H-05's cut applies to the uncut base; scope on the hunt findings as they stand. |
| 18.3 (A), 18.4, 18.5 | X01–X04, X08, X09 are S5AA candidates and X05–X07, X10–X12 stay with S5b or S6; the supported domain is decided row by row after reproduction; the three failure policies are adopted as written. |

**Still open, and answered at the task that needs it, not before the start:** where the new fixtures live (6.2), whether `closeout-check` learns about S5AA (7.4), and who stops the hunt campaign (0.7).

## Preconditions

- [x] **0.1 the owner gives the go.** Nothing below starts without it. — **Given 2026-09-19 (UTC−7).**
- [x] **S5 is closed** at `420a910` (true; qualifiers carried, not softened). **Its handover is not answered, and this sprint does not answer it.**
- [x] `npm test` exits 0 — **verified at `14b7095`: GATE PASSED, 2224 / 2214 / 0 / 0 / 10, exit 0.** The ten todos were read out of the gate's own registry report and are exactly the ten named here. **Derive the todo set by name** with `tools/verify-test-gate.js`; it was ten at S5's close: `RB-03`…`RB-08`, `RC-03`, `RC-04`, `ACCOUNT-17-8`, `ACCOUNT-18-8`.
- [x] **Source unchanged since `3ec8adf`, or every difference explained.** — **`git diff 3ec8adf 14b7095 -- src build.js` is empty;** the whole difference is five tracker documents. At `fb15827` and `9bc166d` only tracker documents changed. Task 0.2 re-checks this at the start commit.
- [x] **A plan-owner-committed copy of this file is the plan of record.** — treated as met by A-05. If the plan owner commits a different version, reconcile to theirs before starting.

## Dependency order

```
0 (pin, reproduce, file) ──► 1 (input and failure evidence) ──► 2 (H-04, H-05) ──► 3 (income and tax foundations)
                                                                                      │
                                                          4 (account and lifecycle settlement) ◄┘
                                                                                      │
                                                                      5 (remaining live correctness, X rows)
                                                                                      │
                                                     6 (fixtures, evidence) · 7 (registers, gate, build) · 8 (documents)
                                                                                      │
                                                                     Exit gate ──► Close-out ──► S5b
```

**Task 1 is first because input and failure-contract defects can undermine the tests used to assess every other repair.** Task 2 follows because H-04 must be reproduced before any long-horizon expected output is refreshed. Inside task 3, small repairs go before large ones; inside task 4, the decision-led ones go last (11.1).

**Mirrored pairs move in the same commit** (ground rule 4). **Tasks 3, 4 and 5 move financial output;** every one predicts its diff before it runs (ground rule 10). **Task 6.2's answer decides whether the corpus moves,** and a moved corpus needs a versioned capture with the prior evidence preserved.

---

## Task 0 — Pin the evidence, reproduce every finding, file them

**Nothing in this task changes engine, validator or test code.**

- [x] **0.2 Pin one current evidence package.** — **DONE at `14b7095`,** in two parts (the zip of tracked files, and a hash pin for the untracked finding evidence the zip cannot carry); both verified against `git show`. See the run state. Source and built artifact from one commit; lockfile and runtime (Windows 11, Node 24.17.0); this checklist and the S5b and S6 checklists; the current question, repair and todo registers; tests, fixtures and captures; the result, flag and assumption contracts; the rule and data references; S5's final review dispositions; the commands behind every reported gate. **Re-check `git diff 3ec8adf HEAD -- src build.js` first** and record the result.
- [x] **0.3 Reproduce and classify every finding before any repair.** — **DONE at `14b7095`.** 32 defect rows reproduced, 19 R rows mapped as aliases, 12 X rows classified or routed; G10 and G14 close as verified-no-repair. **Nothing went back to the owner under ground rule 7.** Ledger: `Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md`; scripts in `Handover temp/S5AA_REPROS_20260919/`, hash-gated to the start commit. **Six rows first reported “did not reproduce” and all six were the harness** — the ledger names each. F1–F10, N1–N3, G1–G19, H-01–H-06, and the review rows R01–R19 and X01–X12. Each gets a class (**B** resolve before freezing any reference case that depends on it; **S** scope decision before freeze; **V** verify an existing protection before requiring a repair; **C** correct the contract or the remedy), a runnable reproduction at the start commit, and an evidence link. **A finding that does not reproduce goes back to the owner; it does not go into a repair.** Re-run the six hunt scripts and record the result. G10 (R17) and G14 (R19) may close as verified-no-repair.
- [x] **0.4 File every finding as a `SPRINT_QUESTIONS.md` entry,** — **DONE: Q87–Q114, 28 entries**, each OPEN until the evidence for its disposition exists (A-02). Aliases are not filed twice (A-03). each OPEN until repaired, H-05 as an open policy question rather than a defect. An engine comment that cites a question flips that question's status in the same commit, or `closeout-check` refuses.
- [ ] **0.5 HELD FOR THE OWNER — ask the auditor which build the three passes reviewed** and name the answer in the close record. Tell the auditor H-01 to H-06 came from a local hunt, not from the audit.
- [x] **0.6 Write the prediction record for the sprint's output-moving tasks** — **DONE (preliminary inventory): `Handover temp/S5AA_PREDICTION_RECORD_20260919.md`, covering Tasks 1–5 per A-01.** Each entry names the affected cases and fields, the direction, an independently justified magnitude and **what must not move**; each is refined from its reproduction before the implementation is edited. (3, 4, 5): what each is expected to move, roughly how much, and what it must leave alone. The measured harness is compared to it after each task.
- [ ] **0.7 HELD FOR THE OWNER — the hunt campaign's state on the day** is recorded (passes done, still running or stopped). **Ask the owner before it is stopped; it is the owner's to stop.** A finding that arrives after scoping is added or carried, by name.

**Gate:** the pin is named by commit; every finding has a class, a reproduction and an evidence link, or is with the owner; the findings are filed; nothing was repaired on this checklist's say-so.

---

## Task 1 — Input and failure evidence — *first, because everything else is judged by it*

- [ ] **1.1 (G7 + G12, H-03 + H-06) Public entry points reject invalid input through the documented contract.** `runs < 1`, non-finite, fractional and excessive counts, and a missing `retirement` section return the invalid-result contract and never throw; zero is distinguished from missing; **an oversized job is rejected before any large allocation.** The engine's gates refuse everything the validator refuses, kept in step by a shared table or by a test that walks the validator's own refusals against the gate. **One gate, one pass:** H-03 and H-06 are the same defect as G7 and G12 seen from the other side, so this is not a second validator-repair project. Financial validation rules are aligned on the canonical schema; importer-only file-envelope checks may stay importer-specific. **Tests:** `runs: 0`, `-1`, `1.5`, `NaN`, `Infinity`, an excessive count; a missing `retirement` key; `owner: null` income refused; a debt `rate` of `"abc"` and `null` refused; each with the validator's own code as the expected engine code where one exists; the same malformed payload through the import, public-engine and Worker routes; valid controls.
- [ ] **1.2 (G8) Check every Monte Carlo path.** A failed **essential** accounting or numerical invariant produces the **invalid-result status**, with one batch summary as the diagnostic. **Name which checks are essential and which are informational before building.** Informational diagnostics stay warnings. A valid depletion outcome stays valid. **Tests:** inject an error after path zero and assert invalid financial outputs, preserved counts and bounded evidence; no valid-looking success rate; a depletion control stays valid.
- [ ] **1.3 (G9) Historical sequence exhaustion is a calculation error, not a wrap.** Return a documented error code (for example `HISTORY_SEQUENCE_EXHAUSTED`) when the horizon exceeds the remaining sequence from `historyStart`; disclose the maximum horizon for a start year. **Tests:** a late start with a modest but unavailable horizon; the exact last valid period; one period beyond; 1928 start with a 99-year horizon; no implicit wrap.
- [ ] **1.4 (G10) Verify before repairing.** Prove at the supported public entry points, with frozen-input, repeat-run and call-order tests, whether the internal `_armScheduledPayment` write onto the caller's debt object is observable. **Repair only if public input or later runs are affected;** an isolated, documented internal mutation does not trigger a pre-rebuild refactor. Record the disposition either way.
- [ ] **1.5 (H-01 + H-02) Widen the Q43 forced-payoff flag.** Flag "effective payment ≤ 0 while any rate that applies during the projection is positive", so both a −50 payment coerced to zero and a 0% teaser ARM that resets to 5% are caught. **If validation rejects a negative payment, that case expects invalid input, not a successful result with a flag.** **Tests:** payment −50 at 20%; a 0% teaser resetting to 5% while the debt is active; the existing zero-payment-at-zero-rate control, which stays `ok`; a rate change outside the horizon and one after payoff. The wider closure obligation (S5b task 2b) stays there; **link the evidence once.**

**Gate:** each item has a red-then-green witness that reaches the defect (a test that passes before its repair exists is not a test of the repair); `npm test` green; the predicted output movement, if any, matches; the essential-versus-informational list is written down.

## Task 2 — The spending-base defects

- [ ] **2.1 (H-04) Repair the stage / `fixedReal` compounding defect.** Build the carried spending base from the **unadjusted** amount in both branches (the same correction RC-02 made for the survivor reduction). It is the largest single defect on the list (a reported understatement of spending up to about 98% in one case; **not re-measured**) and it has no multi-year test today. **Reproduce first, before any long-horizon expected output is refreshed.** **Tests:** short deterministic sequences with an independent unadjusted base — repeated years, a stage change, zero adjustment, recovery; trace **requested spending, funded spending and the carried base separately**; assert the actual cash and account effect as well as the displayed amount; a multi-year percent stage under `fixedReal` holds at the reduced level through the window and returns to the unreduced level after it.
- [ ] **2.2 (H-05) The down-year cut applies to the uncut base, holds at 90%, and lifts when returns recover.** Define the return signal, lookback, inflation and stage interaction, and transition timing. **Tests:** successive down years do not compound 90% into 81% and 72.9%; recovery restores the current uncut base. This is a chosen policy, not a newly proven tax or account defect; record it in `MODEL_ASSUMPTIONS.md` (task 8.1).

**Gate:** witnesses reach the defect; **no golden baseline incorporates a known repeated-compounding defect;** the predicted movement matches the measured one.

## Task 3 — Income and tax foundations — *moves financial output*

**Order inside this task: small first (3.1–3.3), then the payroll items, then the large one (3.6).**

- [ ] **3.1 (F2, G16) Age-65 additional standard deduction.** Add the 2026 amounts as sourced rule records ($1,650 per qualifying married person; $2,050 when unmarried **and not a qualifying surviving spouse**), applied per person by their own age, beside the enhanced senior deduction. **Use tax filing status, not a spouse-present flag;** support a survivor-filing transition or exclude that status explicitly. Blindness stays out of scope, disclosed. **The funding solver's mirror (`taxSegmentLocal()`, commented "MUST move with `estimateTaxes()`") moves in the same commit,** and the mirror test is confirmed to cover the age-65 branch. Arizona stays as the owner's earlier answer set it: check whether Arizona's base reads the federal deduction figure and keep the new amount out of it unless the owner decides otherwise. **Tests:** single at 67 gets $24,150 (the auditor's case); married with both 65 or older gets $3,300 more than today; one spouse only; age 64 gets nothing extra; the qualifying-surviving-spouse boundary; the phaseout interaction.
- [ ] **3.2 (F3, G17) NIIT base.** Include ordinary dividends and each other income type Form 8960 counts. **First check every modelled income against Form 8960's list, so the base is fixed once.** `taxSegmentLocal()`'s `investmentIncome` (`capitalGains + qualifiedDividends`) moves in the same commit. Specify whether the ordinary-dividend input includes or excludes qualified dividends, so nothing is counted twice. **Tests:** the auditor's $10,000 dividends at $250,000 MAGI (single); a below-threshold control; qualified and ordinary dividends, gains and other supported investment income without double counting.
- [ ] **3.3 (F9) 415(c) room for the employer match.** Subtract only the non-catch-up part of the employee deferral from the $72,000 room. **$47,500 is the remaining dollar-limit room in the auditor's simplified case only,** not unconditional employer eligibility: compensation, other annual additions and plan terms still matter. Verify how enhanced catch-up and 2026 Roth catch-up are treated where supported. **Tests:** $24,500 plus an $8,000 catch-up leaves $47,500; no catch-up is unchanged; the age 60–63 enhanced catch-up. (ACCOUNT-17-8, 415(c) per employer group, is a **different** item and stays a todo.)
- [ ] **3.4 (G4) Employment-type other income owes payroll tax.** Route it into the wage payroll-tax base **keeping its owner** (wage caps are per person). **Tests:** a second job; a spouse job; the wage-cap interaction.
- [ ] **3.5 (G11) HSA payroll contributions and FICA.** Only **qualifying cafeteria-plan HSA payroll contributions** leave the FICA wage base. **Do not copy a generic pre-tax deduction into every tax base:** ordinary employee 401(k) deferrals do **not** get the same FICA exclusion, and direct personal HSA contributions do not. **Tests:** the auditor's $50,000 wages / $4,400 HSA-through-payroll case (FICA on $45,600); a direct contribution as a control; a workplace deferral as a control; the wage-cap interaction.
- [ ] **3.6 (F1, G15) Traditional IRA contributions.** **Two steps, and nondeductible or basis cases are not qualified until both exist.**
  - **Step 1, the deduction:** the 2026 phaseouts from the account reference's table ($81,000–$91,000 single, $129,000–$149,000 joint, $242,000–$252,000 when only the spouse is covered), with a MAGI measure **computed before the IRA deduction itself**. Workplace coverage is a **bounded inference** (an owner counts as covered in any year their workplace plan receives an employee or employer contribution); **document exactly what it misses** (some defined-benefit participants), and **an excluded case never supplies a certified expected value.**
  - **Step 2, basis:** per-owner IRA basis on the **annual Form 8606 aggregate computation** (year-end balances, same-year contributions, distributions and conversions), **not** a fraction worked out before each withdrawal. A QCD comes out of the pre-tax part first.
  - **G15, corrected:** **do not feed the reduced ordinary-income figure into `rothPhaseoutFactor()`.** For Roth contribution eligibility the IRS worksheet adds the traditional IRA deduction back to MAGI, so that feed would create a second error. `rothPhaseoutFactor()` still reads raw `salary` as its MAGI proxy; **review that proxy once step 1 lands,** with an expected value taken from the worksheet and not from the engine.
  - **Tests:** the auditor's $50,000 wages / $7,500 contribution case; each phaseout edge; a household at the Roth phaseout edge with and without a deductible traditional contribution; basis recovered once and only once; contributions, distributions and conversions in the same year; both owners; independently derived expected taxes.

**Gate:** every mirrored pair moved in one commit and `TAX_SETTLEMENT_MISMATCH` and `QUOTE_SETTLEMENT_UNVERIFIED` stay silent on the corpus; expected values are derived independently of the engine; each moved number matches its prediction or is a finding.

## Task 4 — Account and lifecycle settlement — *moves financial output*

**Order inside this task: the small item first (4.1), the large one (4.2), then account routing, then the decision-led items.**

- [ ] **4.1 (F7 + N1, G2, G6) Early-withdrawal penalty.** Charge the 10% on a pre-tax → taxable transfer **under the same test as a withdrawal** (the transfer block computes the amount and never increments `penalties`). **Limit the Rule of 55 to workplace-plan money,** for withdrawals and transfers alike, and add the row to the account reference's early-distribution table. A Roth conversion stays penalty-free. **Tests:** the auditor's $50,000 transfer at 50; the same transfer at 60; a conversion unchanged; the Rule of 55 on an IRA versus a 401(k).
- [ ] **4.2 (F4 + N2, G3, G18) RMDs per owner and per plan.** Each owner's IRAs aggregated, each 401(k) separately, each paid from its own accounts, each owner on their own age and start age. **`preTaxConvertible()` reserves the same way in the same commit,** or it under-reserves and lets a conversion consume balance the RMD is owed from. An owner's QCD counts toward that owner's IRA RMD only (`MODEL_ASSUMPTIONS.md` §14). **Partial year (G3):** removing `* duration` alone is not enough — define the opening date, the applicable obligation, the **prior December 31 balances**, distributions already taken this year and first-distribution timing; scope defaults explicit and observable. **`ACCOUNT-18-8` moves from todo to passing, with its entry in `tools/test-exception-registry.json` removed in the same commit** (the registry refuses a todo that starts passing); the plan owner re-routes it off S103 task 7. **Tests:** the auditor's $500,000 IRA + $500,000 401(k) at 75; spouses of different ages and birth-year start ages; a 401(k)'s RMD is never paid from an IRA, and the reverse; a plan opened mid-year at or after RMD start age; a prior-distribution case; insufficient account capacity; the second year's RMD is not inflated by a carried-forward error.
- [ ] **4.3 (G1) Conversion source and destination.** Draw and credit by each account's own `priority`, **with ownership and capacity required to agree** — priority alone cannot authorise a cross-owner conversion. **Tests:** multiple source and destination accounts; an empty valid destination; explicit priorities; requested versus executed amount; quote/commit agreement.
- [ ] **4.4 (G5) HSA qualified-medical share.** One new input, the qualified share of HSA draws, **default 100% (today's behaviour), shown as an explicit assumption** in scenario review and in raw evidence. The non-qualified share is taxed as ordinary income plus 20% before 65. **Define before building:** whether the value is 0–1 or 0–100, its per-account or per-owner scope, which withdrawals it applies to, its saved-scenario representation and validation. **A share is an assumption about qualifying expenses, not proof they exist,** and a cap at this year's medical spending would be wrong (reimbursements can concern earlier expenses). Disability and death exceptions need a supported treatment or an explicit scope boundary. **Re-check the optimizer's HSA scoring.** **Tests:** 0%, a mixed share and 100%; invalid values; the age-65 transition; the quote, the execution and the optimizer ranking all use the same qualification.
- [ ] **4.5 (F10) Roth 401(k) employer match.** A per-account setting, **pre-tax by default**, Roth and taxed by election. **Add the rule to the account reference with its source first** (IRS Notice 2024-2 as cited; verify, task 8.6). An employee's Roth deferral does not decide the match's tax character. **Tests:** a 5% match on a Roth 401(k) under each treatment; a pre-tax 401(k) unchanged; **full-vesting eligibility** at allocation; income inclusion; the **separate FICA treatment**; employer contribution room; the receiving pre-tax or Roth bucket; quotes and settlement agree.
- [ ] **4.6 (F5 + N3) Social Security earnings test.** Withhold $1 for every $2 earned over the limit ($1 for every $3 over a higher limit in the year full retirement age is reached) and **adjust the benefit at full retirement age** for the months withheld. **Fix N3 so the Rules page says one thing.** **Confirm the stored thresholds against SSA** (neither 2026 reference document covers Social Security). **Tests:** a claim at 62 with wages over the limit; the year full retirement age is reached; wages under the limit change nothing; the later benefit adjustment.
- [ ] **4.7 (F6 + G19) Survivor benefit timing.** Pay a survivor benefit **from 60, reduced for age** (71.5% at 60, rising to 100% at the survivor's full retirement age); **nothing before 60** (the existing age-50 test stays). Remarriage, disability and children are not modelled, disclosed. **Thread it through the survivor amount, the eligibility gate and the sub-interval `points` list** the row segmentation reads, and confirm the row boundaries pick up the new age. **The deceased's early-claim cap is disclosed and built later; results it affects carry a machine-readable approximation flag and a stated reference boundary,** and are not certified by agreement alone. **Tests:** a widow at 60; a widow at full retirement age; the same early-start claimant across several years (a later birthday must not restore an unreduced benefit; COLA and any earnings-test adjustment kept separate); the existing age-50 and zero-own-benefit survivor tests still pass.

**Gate:** as task 3, plus `ACCOUNT-18-8` is passing and `ACCOUNT-17-8` is still a named todo; **the sprint's todo list is enumerated by name.**

## Task 5 — Remaining live correctness, and the X rows

- [ ] **5.1 (F8) ARM re-amortisation.** Remove the switch and always re-amortise (the end state the code comments describe). **Saved plans change when loaded, with a notice.** Keep Q78's handling of a term longer than the amortisation module allows: `DEBT_RECAST_TERM_UNSUPPORTED`, never clipped. **Tests:** a 3% → 6% reset raises the payment; a fixed-rate loan is unchanged; an older saved plan loads with the notice; repeat-run consistency.
- [ ] **5.2 (G13, decision 12.9 (b)) Dividend timing — documentation and pins only, no output change.** Define `dividendStart` in `MODEL_ASSUMPTIONS.md` §5 and on the Rules page as when modelled dividend cash starts being paid out to spend; keep the imputed 1.5% charge as the stated assumption; record the auditor's case (age 40, `dividendStart` 55, `dividendOn:false`) as **intended behaviour with a disclosure.** **The test the draft first described (no imputed tax before 55) is not built,** because it asserts the opposite of the chosen behaviour. **Pins:** the auditor's case documents today's behaviour; `dividendStart` does not move the dividends-off result at all; with dividends on, `dividendStart` at or below retirement age changes nothing because retirement age is already the floor. **Carry (c) to S5b task 1** by name (with dividends on, no dividend is taxed before retirement whatever the yield; one synthetic probe put it near $29,000 of tax over 15 years, a single scenario and not a general figure).
- [ ] **5.3 (G14) `realTotal` on the opening row.** Docs only: a callout in `RESULT_CONTRACT.md` (and possibly a tooltip) that the opening row's `realTotal` is nominal because the opening inflation factor is 1. **Confirm the base-date label and units in the exports; do not alter a correct opening value.**
- [ ] **5.4 The X rows.** **Candidate means reproduce and classify; it is not approval to implement the whole feature.** Record a class, an owner and an evidence link for each, or route it by name.
  - **S5AA candidates (18.3 A):** **X01** credit cards offered but reportedly projected as term loans (repair the live calculation and its Worker binding together, or record an accepted narrower scope; compare minimum-only and extra-payment schedules); **X02** Roth withdrawal ordering, basis and clocks (qualify, or restrict the reference to qualified withdrawals as an accepted scope decision); **X03** historical replay ignores allocation (qualify, or state and enforce a fixed-proxy replay scope; no invented bond series and no CRSP migration); **X04** PMI reportedly never cancels (repair if affected mortgages are in reference scope); **X08** payroll/FICA and Arizona independent expected cases, and verify the self-employment route and its interactions; **X09** tax-exempt interest in Social Security provisional income, and combined wage and self-employment Medicare (supported and correct, or an unsupported boundary).
  - **Stay with S5b or S6 (routed by name, evidence linked):** **X05** the S5b five-task block; **X06** Q43/Q44/Q45 and S5b 2b (link the H-01/H-02 evidence once); **X07** Q47/Q49/Q50 (retrieve the current entries, do not declare them closed or invent acceptance cases); **X10** S4 carry-forwards (verify IR-05's closure before the final capture, refresh the historical list of 57 coupled-only behaviours, satisfy or revise the second-machine condition); **X11** S5's closeout qualifiers (the unreviewed R9/R10 changes, the "handover answered" condition, the 7 pass / 3 fail / 15 unsupported vector results and the ten todos traced to current dispositions); **X12** `TAX §10.3`'s six release blockers and the six deferred Arizona subitems (obtain their contents; a full-product blocker is not automatically a rebuild-start blocker, but an affected reference calculation cannot be certified by omission).
- [ ] **5.5 The reference's supported domain (18.4), decided row by row after the reproductions.** Each exclusion must be **detectable, enforced at the runner or corpus boundary, checked for indirect reach through an automatic spending or conversion policy, and carried to a named new-engine task.** An unsupported notice alone is not enough if an affected result is still presented as a qualified reference value. IRA basis and per-owner, per-plan RMD coverage are already accepted and are not reopened.
- [ ] **5.6 List what S5AA deliberately did not repair,** each **decided-not-built with its disclosure** — at least blindness (2.1), real-estate-professional status (3.1), the deceased's early-claim cap (6.2), the dividends-on gap (5.2, carried to S5b task 1), and anything that went to a "leave it" option. This is the rebuild's known-defect-preservation list.

**Gate:** every X row has a class, an owner and evidence or a named route; the supported domain is recorded; the unrepaired list is enumerated; nothing is marked repaired on this checklist's say-so.

## Task 6 — Fixtures and independent evidence

- [ ] **6.1 Acceptance fixtures with expected values derived independently of the engine** for the S5AA-owned rows of the 27-row coverage-gap table (**use the row IDs, validated against the actual test assertions; the totals quoted in earlier documents do not reconcile**). Include H-04's missing multi-year stage test and the flexibility-cut gap. Record which rows got a fixture and which are left to the rebuild. **Expected values in the methodology's illustrative dollar examples are derived afresh before they become tests.**
- [ ] **6.2 Decide where the new fixtures live.** As tests only (no corpus change), or in `tests/lib/corpus-expansion.js` and the control's required-targeted list — which moves the corpus hash and `DIFFERENTIAL_CUTOVER.md` §5's counts and needs a re-capture under `tools/baseline-registry.json`. **Ask the owner; state the answer; do the follow-through.** A changed corpus needs a **versioned capture with the prior evidence preserved;** newly generated golden outputs alone do not show changed math is correct.
- [ ] **6.3 Exercise the existing separate-process comparator (`tools/differential-harness.js`) before relying on it:** a known mismatch, and corpus and provenance enforcement. Add a command only if a needed comparison is genuinely missing.
- [ ] **6.4 Audit and extend the independent-evidence assets that already exist** (debt oracles, the Python-derived fixtures, the household ledger, S5's tax spec vectors) rather than commissioning a second full tax engine. Add the independent payroll and Arizona expectations (X08).
- [ ] **6.5 A desktop-browser smoke check on the frozen candidate:** main thread versus an actual Worker, including an exception and a raw export. **State that this is not the post-S6 phone campaign.**
- [ ] **6.6 Second-machine reproducibility (S4 carry-forward condition 3):** check and close it, or record an evidence-based scope change. A second Windows development machine can satisfy it; an iPhone is not required for S6.
- [ ] **6.7 Six-family check.** For each family (a mirror, array-order selection, a household flag for a per-item fact, a partial-year rule on an annual obligation, a simplification applied inconsistently, a contract enforced on some paths only), record whether the repair closed the **family** or only its named instance.

**Gate:** each fixture reaches the code it guards and was shown failing against the pre-repair tree; the fixture location is stated.

## Task 7 — Registers, gate, instruments, build

- [ ] **7.1 Findings filed and final status recorded** (task 0.4 opened them).
- [ ] **7.2 The release gate.** `npm test` exits 0 through `tools/verify-test-gate.js`; record tests, pass, fail, skipped and todo (S5 closed at 2,224 / 2,214 / 0 / 0 / 10). **The excluded-witness set and the todos are enumerated by name.**
- [ ] **7.3 Control test 4.7.** Extend `tools/control-candidate-prediction.json`'s declaration of expected differences (8,141 at S5's close) and re-derive the golden fixtures **with the originals kept.** Record predicted versus actual for every output-moving task.
- [ ] **7.4 `node tools/closeout-check.js` accepts every carried item** (12 accepted at S5's close). **It recognises only S5, S5b and S6:** `tools/closeout-task-map.json` has no S5AA entry. Either every S5AA carry names a deadline task in S5b or S6, or the plan owner adds S5AA to the map. **Ask which.**
- [ ] **7.5 Rebuild `investment-calculator-v2c.html` from the final sources** and update the `EXPECTED_SHA256` pin in `tests/lib/harness.js` in the same commit. Record the hash.
- [ ] **7.6 Every disclosure that changed is read rendered** in `tests/rendered-rule-disclosures.test.js` and `tests/rendered-results-warnings.test.js`; the Rules page no longer contradicts itself on the earnings test.
- [ ] **7.7 State the envelope and who ran what:** Windows 11 and Node 24.17.0 only; a Linux run counts for nothing. Say which runs the executor made and which an external reviewer re-ran.

## Task 8 — Documents

- [ ] **8.1 `MODEL_ASSUMPTIONS.md`: one entry per decision** — including H-05's policy and 12.9 (b)'s definition of `dividendStart`. *(The plan owner's file: send prose.)*
- [ ] **8.2 `RESULT_CONTRACT.md` and `tools/result-contract.json`.** The G14 callout; any new error code or row field (for example the history-exhaustion code, new gate codes, the HSA share field, the approximation flag); state whether the contract version moved. **State the three failure policies in the contract before any new scheduler is built:** a valid household that depletes is a financial outcome; a path with a software or calculation error is preserved and invalidates the affected result, **never dropped from the denominator**; a campaign scenario failure is recorded and the campaign continues unless stability or evidence integrity is at risk.
- [ ] **8.3 Reference-document additions, each with its source:** the Rule-of-55 row in the early-distribution table (4.1); the Roth 401(k) match rule (4.5); the age-65 amounts as sourced rule records (3.1).
- [ ] **8.4 `TAX §10.3`'s six 2026 release blockers:** each marked resolved or still blocking, as S5's close-out 5a did. F1, F2 and F3 touch the federal deduction and NIIT layer.
- [ ] **8.5 `FEATURES.md` relay** (the plan owner's file: send prose). Its line that HSA withdrawals have no qualified-versus-non-qualified distinction is stale if 4.4 is built; check the Rule-of-55, earnings-test and survivor statements too.
- [ ] **8.6 Check the external citations against primary sources before any rule record is written from them:** Rev. Proc. 2025-32 §4.14(3), Notice 2025-67, Notice 2024-2 L-3 and L-6, the Form 8606 instructions, SSA's survivor-amount page and POMS RS 00615.320, Pub. 590-A and Pub. 969. **A citation that fails the check stops the task that depends on it.**
- [ ] **8.7 Tell the plan owner, in prose:** S5AA's closure and its qualifiers, that S5AA now sits before S5b, and the S5b precondition state. They update the CPU Engine Rebuild tracker, the Roadmap and its ledgers.

---

## Ground rules

**Carried from S5 and S5b unchanged.** The ones that bite hardest here are named.

1. Every task states its own gate. Not done until the gate passes **and** `npm test` is green.
2. Sizes are floors, not targets.
3. **No task may weaken an existing test to pass.** No tolerance is widened; a fixture regeneration and an assertion change go in separate commits.
4. **Mirrored pairs move in the same commit:** `estimateTaxes` with `taxSegmentLocal`; `rmdFor` with `preTaxConvertible`; the survivor amount, claim gate and sub-interval points; `rothPhaseoutFactor`.
5. **Implement the corrected remedy, never the original wording.** Where this file and an earlier document differ on a remedy, this file wins; the four withdrawn instructions are named above.
6. **Reproduce before repairing, and write a failing test first.** A test that passes before its repair exists is not a test of the repair. Show a deliberate fault being caught.
7. **A finding that does not reproduce goes back to the owner.** It does not go into a repair.
8. **Any rule figure from a specification is cited by document and section and checked against the primary source before a record is written.** No task invents a value.
9. Re-locate by symbol, not by line. Record drift. **Cite a commit, not the working tree.**
10. **Predict the diff before you run it.** Write down what you expect to move and roughly how much before running the harness. **An unpredicted movement is a finding.**
11. Commit per task. **Record findings rather than fix them** where a fix needs a policy judgment.
12. **No feature wiring and no new specialist products.** Defects and their disclosures only.
13. **Windows 11 and Node 24.17.0 only.** A Linux run is out of envelope, never a target.
14. **A count is stamped with the commit it was true at and the register it counts.** Say API or CLI, never both in one clause, when describing the comparator.

## Stopping points

Stop and hand over rather than continue if **any** of these occur:

- [ ] A repair produces a movement it did not predict (ground rule 10)
- [ ] A finding does not reproduce (ground rule 7)
- [ ] `TAX_SETTLEMENT_MISMATCH` or `QUOTE_SETTLEMENT_UNVERIFIED` fires on the corpus after a mirrored change
- [ ] An essential invariant (task 1.2) fires on the corpus, or `tests/reconciliation-invariant.test.js` goes red and is not green again within the task that broke it
- [ ] A citation fails its primary-source check (task 8.6) — stop that task, not the sprint
- [ ] The engine or validator at the start commit differs from `3ec8adf` in a way task 0.2 cannot explain
- [ ] The todo set changes by anything other than `ACCOUNT-18-8` leaving it
- [ ] Task 6.2's answer moves the corpus and no versioned capture exists to preserve the prior evidence

## Exit gate — what must be **true**, not merely **reported**

**The close-out reports; the exit gate decides.** Each item **names its evidence and the commit it was true at.** `npm test` exit 0 is **recorded, not assumed.** **A no-go must name what is missing and what it blocks.** **A line that cannot be made true is not a reason to soften it:** record it, say what it blocks, hand it forward. The verdict is the owner's, on a stated recommendation.

### This sprint is closed when every line below is true

- [ ] **E1. Every repair is passing, decided-not-built, or held open with what it blocks,** each named separately: F1, F2, F3, F4 + N2 + G3, F5 + N3, F6, F7 + N1 (with G2, G6), F8, F9, F10, G1, G4, G5, G7 + G12, G8, G9, G10, G11, G13, G14, and H-01 to H-06.
- [ ] **E2. The evidence package was pinned before repair started and is named in the close record** (task 0.2), and the auditor's answer on the reviewed build is recorded (0.5).
- [ ] **E3. A pre-repair reproduction is recorded for every finding,** and any that did not reproduce went back to the owner.
- [ ] **E4. Every mirrored pair moved in one commit,** and the two settlement codes stay silent on the corpus.
- [ ] **E5. Each corrected remedy was implemented in its corrected form:** 3.6 (a bounded coverage inference, and no feed of the reduced figure into the Roth phaseout), 4.2 (opening-year facts, not just `* duration`), 4.3 (ownership and capacity), 3.4 (owner into payroll), 4.4 (a supported HSA scope, not blanket taxation), 3.5 (FICA by contribution source), 5.2 (`dividendStart` defined first), 3.1 (filing status), 4.7 (an approximation flag).
- [ ] **E6. The three failure policies are in the contract** (8.2), and the Monte Carlo invalidation rule is unchanged or changed by an explicit decision.
- [ ] **E7. The reference's supported domain is recorded** (5.5); each exclusion is detectable, enforced, not reachable indirectly, and carried to a named new-engine task.
- [ ] **E8. The acceptance fixtures exist** (6.1), the fixture location is stated (6.2), and if the corpus moved, a versioned capture preserves the prior evidence.
- [ ] **E9. `npm test` exits 0 through the gate,** figures recorded; `ACCOUNT-18-8` has left the todo list with its registry entry removed in the same commit; `ACCOUNT-17-8` and the eight revival contracts remain, named.
- [ ] **E10. Predicted versus actual is recorded for every output-moving task,** and control test 4.7's declaration is extended with the originals kept.
- [ ] **E11. Every X row has a class, an owner and evidence,** or is routed by name; nothing that stays with S5b or S6 was declared closed here.
- [ ] **E12. The unrepaired list is enumerated** (5.6), with each item's disclosure.
- [ ] **E13. `closeout-check` accepts every carried item,** and the S5AA deadline question (7.4) is answered.
- [ ] **E14. The shipped HTML is rebuilt from the final sources and its hash pin updated** (7.5); every changed disclosure is read rendered (7.6).
- [ ] **E15. The desktop-browser smoke check and the comparator exercise ran** (6.3, 6.5), and the second-machine condition is closed or revised on evidence (6.6).
- [ ] **E16. Section 17's accounting:** the five rejected hunt findings are recorded as rejected with reasons and not reopened; the hunt campaign's state is recorded.
- [ ] **E17. The documents landed** (8.1–8.5) or were handed to their owners in prose; every external citation used was checked against a primary source (8.6).
- [ ] **E18. The owner was asked: whole model, new code only, or whole model plus a focus section** — and the handover asks the auditor for a second pass, saying H-01 to H-06 came from the local hunt.

**This sprint's closure is not an external sign-off** until the second pass returns, **not release qualification** (`TAX §10.3`), and **carries provisional decisions unsettled;** the close record lists them.

## Close-out

- [ ] 1. **A GO or NO-GO recommendation that names what is missing and what it blocks.** The verdict is the owner's.
- [ ] 2. **The predicted-versus-actual diff record for tasks 1–5.** Together with S5's and S5b's, this is the differential harness's full qualification record.
- [ ] 3. Any task whose real size materially exceeded its floor.
- [ ] 4. **The open-by-decision list with counts:** closed by decision and not built, owned elsewhere, stopping points that never fired.
- [ ] 5. **State S5b's precondition as it stands.** S5AA is not S5's handover answer, so "handover answered" stays unmet; S5b stays not started until the owner's own go; **task 4's definitive baseline is captured only after S5AA's last output-moving commit.**
- [ ] 6. **Write down what S5b consumes,** in a form it can read without re-reading commits: the decided directions, the fixture list, the `MODEL_ASSUMPTIONS.md` entries, and the dividends-on carry to S5b task 1.
- [ ] 7. **Route the rebuild-planning inputs to whoever owns S6 task 7:** the draft's Sections 13–16, `S5AA_REFACTOR_DESIGN_20260917.md`, the review's architecture list, the retention questions (which path a Q40 breakdown uses and how it replays; the processing order and its scratch allocation), and the hunt's structural finding that engine input gates were narrower than the validator. **The proposed PWL refactor is not to be used as written** (its own code returns `NaN` for a constant); the one-rule-definition requirement is decided by S6 and a candidate qualified in N0.
- [ ] 8. **Cut the packages with `tools/build-package.ps1` from a named commit** (autocrlf off; verify a file against `git show`). Decide whether the auditor gets `tests/`; `TESTS_HANDOVER_20260917.zip` was cut at `3ec8adf` and will be stale.
- [ ] 9. **Send the repairs back to the auditor for a second pass** (G1–G19 included).
- [ ] 10. **Write the close record:** final commit, gate figures, package names and hashes, the harness summary, and the run's state file.
- [ ] 11. **Ask the owner: whole model or new code only for the S5AA handover.** This sprint moves financial output in most tasks, which argues for whole model plus a focus section listing what is unaudited (S5AA's repairs, R9's and R10's S5 repairs which no external reviewer has examined, and S5's provisional decisions), but it is the owner's call.

---

## Draft ID → this file

| Draft | Here | Draft | Here | Draft | Here |
|---|---|---|---|---|---|
| 0.x, 18.1, 18.2 | 0 | F1, G15 (1.x, 1.6) | 3.6 | F7, N1, G2, G6 (7.x) | 4.1 |
| G7, G12, H-03, H-06 (12.4, 17.2) | 1.1 | F2, G16 (2.x) | 3.1 | F4, N2, G3, G18 (4.x) | 4.2 |
| G8 (12.5, 19.1) | 1.2 | F3, G17 (3.x) | 3.2 | G1 (12.1) | 4.3 |
| G9 (12.6) | 1.3 | F9 (9.x) | 3.3 | G5 (12.3) | 4.4 |
| G10 (12.7) | 1.4 | G4 (12.2) | 3.4 | F10 (10.x) | 4.5 |
| H-01, H-02 (17.1) | 1.5 | G11 (12.8) | 3.5 | F5, N3 (5.x) | 4.6 |
| H-04 (17.3) | 2.1 | F8 (8.x) | 5.1 | F6, G19 (6.x) | 4.7 |
| H-05 (17.4) | 2.2 | G13 (12.9) | 5.2 | G14 (12.10) | 5.3 |
| X01–X12 (18.3–18.5) | 5.4, 5.5 | A6–A9, B9–B10 | 5.6, 6 | B1–B8, C1–C6 | 7, 8 |


---

## Amendments

**Added 2026-09-19 (UTC−7), after `53aa5f9`, by the S5AA task-list session [a90ab6]. Nothing above is rewritten.** Where an amendment and the text above differ, **the amendment wins.** They come from `S5AA_PLAN_OF_RECORD_REVIEW_20260920.md` (an external review; its IDs are POR-01 to POR-08), read against this file line by line. **The owner's answer: keep the reproduction barrier (POR-03b), apply the rest.** They add no financial feature and reopen no recorded decision. **The plan owner has not reviewed these amendments.** Nothing here starts the sprint; the go (task 0.1) is the owner's.

| ID | Review ID | What it changes |
|---|---|---|
| A-01 | POR-01 | The prediction record covers Tasks 1–5 |
| A-02 | POR-02 | Evidence depends on the finding's disposition |
| A-03 | POR-03 (a) | Reproduction is for defect rows; register rows get a class, an owner and a route. **The barrier itself stays (03b, the owner).** |
| A-04 | POR-04 | Comparator and citation checks come before the repairs that rely on them |
| A-05 | POR-05 | The authority wording is brought up to date |
| A-06 | POR-06 | Ground rule 12 allows the wiring X01 needs |
| A-07 | POR-07 | Task 5.6's single list becomes labelled dispositions |
| A-08 | POR-08 | The dividend witness is preserved |

**A-01. The prediction record covers Tasks 1–5.** Task 0.6 and the dependency-order prose above say "3, 4 and 5". Close-out item 2 says tasks 1–5, ground rule 10 and E10 cover every output-moving task, and **H-04 (Task 2) is the largest reported mover in the sprint.** Read all of them as: **before each output-changing repair, write down the affected cases and fields, the independently justified expected change, roughly how much, and the unaffected controls; cover Tasks 1–5 and any result-contract or corpus change.** Validity, error-code and diagnostic changes are recorded as well as numeric ones. **Task 0.6 writes a preliminary inventory;** each entry is refined from its reproduction before the implementation is edited. After the repair, compare predicted with measured; **an unpredicted movement is a finding.** A large H-04 movement is not acceptable merely because a large one was expected.

**A-02. Evidence depends on the disposition.** "Red-then-green" (Task 1 gate, Task 6 gate, ground rules 6 and 7, E1, E3) applies to the first row below only.

| Disposition | Evidence required |
|---|---|
| Reproduced defect, or an implementation inconsistent with an adopted policy | A focused test that **fails on the pinned original implementation and passes after the repair**, with expected values derived independently |
| Verified correct, no repair needed (G10, G14 may land here) | A characterization check before and after the surrounding changes, and a written reason the alleged defect does not apply |
| Documentation or disclosure correction (G13 under 12.9 (b), G14) | The rendered meaning, labels and units inspected; numeric behaviour shown unchanged where the decision says so |
| Accepted unsupported boundary or approximation | The refusal, exclusion or machine-readable limitation demonstrated, and the affected reference boundary named |
| Work assigned to S5b or S6 | The underlying evidence linked, a named owner and deadline task; affected reference cases stay unqualified until met |

**Task 0.4's "each OPEN until repaired" is read as: OPEN until the evidence for its disposition exists.** **H-05 reads "policy decided (17.4 (a)); implementation and verification pending",** not an open policy question. Deliberate fault injection may show that a protection catches the intended failure; **it does not turn an already-correct case into a historical defect.** **A claimed defect that does not reproduce still goes back to the owner.**

**A-03. Reproduction is for defect rows.** Task 0.3 asks for "a runnable reproduction" of every F, G, H, N, R and X row. That cannot be met for register or qualification rows (for example X10, X11, X12: verify a closure, trace old vector results, obtain the six named tax blockers), and R rows are aliases of F/G findings. **Read 0.3 as:** map each R row and alias to its canonical finding and reproduce **once**; **every row that claims a calculation or contract defect is reproduced at the start commit before any repair (unchanged);** a row whose obligation is a register, a qualification condition or a route gets **a class, an owner and an evidence link or a named route**, not a failing program. Which rows are which is classified at 0.3, and X05–X07 are classified by whether the row claims a defect (X05's dividends-on gap and X06's H-01/H-02 already have witnesses). **The owner's decision (POR-03b): the global barrier stays.** Reproduction happens in Task 0 for every defect row, **before Task 1 begins,** as 0.3 says. The review's alternative (reproduce each defect just before its repair) was considered and not adopted. **Task 0’s gate and E3 read the same way:** every defect row has its pre-repair reproduction, and every other row its class, owner and evidence or route. **If a repair needs a prerequisite repair to expose a defect, keep both the original observation and the intermediate commit.**

**A-04. Comparator and citation checks come before the repairs that rely on them.** Tasks 6, 7 and 8 sit after the repairs in the diagram above, but some of their work is a prerequisite. **The diagram is not redrawn; this note controls.**

- **Task 6.3 runs before the first task whose acceptance rests on the harness.** The harness comparison that 0.6 and each task gate rely on is not evidence until 6.3 has shown it catches a known mismatch and enforces corpus and provenance identity.
- **Task 8.6 runs, citation by citation, before the task that implements a rule from that citation.** By the finding each supports: Rev. Proc. 2025-32 §4.14(3) before 3.1 (F2); Notice 2025-67 before 3.3 (F9); Form 8606 instructions and Pub. 590-A before 3.6 (F1, G15); Pub. 969 before 3.5 and 4.4 (G11, G5); Notice 2024-2 L-3 and L-6 before 4.5 (F10); SSA's survivor-amount page and POMS RS 00615.320 before 4.7 (F6, G19). **A citation that fails stops the task that depends on it** (as 8.6 says). Any rule the checklist implements that is not on this list gets the same check before it is coded.
- **Expected values are derived, and the defect test written, before the repair** (6.1, and the task gates).
- **Changed statuses, fields and policy meanings are specified with the implementation** (8.2), not afterwards.
- **After the repairs:** final coverage accounting (which 6.1 rows got a fixture), document reconciliation and the package checks.
- **6.5's desktop-browser smoke runs on the rebuilt, hash-pinned candidate.** If later work changes that artifact or the exercised behaviour, repeat the affected check on the final candidate.

**A-05. Authority wording.** The header note that the plan owner has not reviewed this file, and the precondition that a plan-owner-committed copy is the plan of record, are out of date. **The accepted version is this file at `53aa5f9`, committed by the S5AA task-list session [a90ab6] at the owner's request; the plan owner spot-verified it (not line by line against the drafts) and accepts it as the plan of record.** A duplicate commit by the plan owner is not required; that precondition is treated as met by this note. **A plan-owner version that expressly supersedes this file still wins, and the go remains the owner's.**

**A-06. Ground rule 12.** "No feature wiring and no new specialist products" is read as: **wiring needed to repair accepted existing behaviour is allowed** (X01's live revolving-debt calculation and its Worker binding, task 5.4). The comparison modules excluded under P19 and new specialist products stay excluded.

**A-07. Task 5.6 becomes labelled dispositions.** Its single "known-defect-preservation list" mixes items with different consequences. Give each item **one** label:

- **Unsupported scope:** blindness (2.1), real-estate-professional status (3.1).
- **Disclosed approximation:** the deceased's early-claim cap (6.2), with its machine-readable flag and reference boundary.
- **Intended assumption:** 12.9 (b)'s meaning of `dividendStart`, and the imputed 1.5% treatment.
- **Repair assigned before reference freeze:** **the dividends-on gap, S5b task 1.** It is **not** "decided-not-built", and **the rebuild is not to preserve it.** Affected reference cases stay unqualified until that repair lands.
- **Later feature work:** anything else that went to a "leave it" option.

An unsupported case is not a certified financial answer. **E1's allowance for items "held open with what they block" supports administrative closure; it does not certify the affected reference behaviour.**

**A-08. The dividend witness is preserved.** `Handover temp/S5AA_DIVIDEND_PROBE_20260919/` holds the script (`div_probe.js`, sha256 `7c89c641…74b7`), its output run at `22f2872` (engine blob unchanged from `3ec8adf`, Node 24.17.0) and a README. **It is one synthetic scenario and an observation: no expected value was derived independently, no IRS source on reinvested-dividend treatment was read, and the figure (557,206 vs 527,995 tax before 55, a gap of 29,211) is not general.** The folder is untracked, like the other drafts. **Task 0.2 and close-out item 8:** the auditor's second pass receives current tests and probes for the claims being made; **`TESTS_HANDOVER_20260917.zip` was cut at `3ec8adf` and cannot substantiate the repairs.** Whole model or new code only stays the owner's call (close-out item 11).


**Amendment notes, added 2026-09-19 (UTC−7) after `363287a`; nothing above is rewritten.**

- **A-07 correction: "assigned" means a pending note.** A-07 (and 5.6 and close-out item 6, which say "carried") describe the dividends-on gap as a repair **assigned to S5b task 1**. **`S5b_TASK_CHECKLIST.md` holds only a blockquote note under Task 1 (`9bc166d`), not a task.** The owner's S5b hold stands: the plan owner words it into a task only on the owner's S5b go. Until then, read "assigned" as **routed by the owner's 12.9 decision, recorded here and in that blockquote, and not yet a task in the S5b checklist.** The decision itself (12.9 (b), with route (c) to S5b task 1) is the owner's and unchanged. What A-07 concludes still holds: the rebuild is not to preserve the gap, and affected reference cases stay unqualified until it is repaired.
- **A-05, what the plan owner has done.** The plan owner's acceptance in A-05 covers the file at `53aa5f9`. They have since **read A-01 to A-08 in full and found no conflict with the S5b or S6 text,** but they **did not check the amendments against the review's POR-01 to POR-08 or the A-08 probe hash.** That is a review for conflicts, not a formal acceptance of the amendments.
- **Where the commits are.** When the plan owner reviewed, `53aa5f9` and `22f2872` were on origin (a push at 2026-09-19 21:35 −0700, not by the S5AA session) and `363287a` was the one local commit. The handover and pages that say "local, not pushed" for `53aa5f9` are out of date on that point.

**Amendment A-09, added 2026-09-25 (UTC−7) after `665335f`, by the S5AA session, on the owner's decision and in the words they
approved; nothing above is rewritten.** It answers ChatGPT's R24G-01
(`audit/S5AA/R24/S5AA_R24G_EXTERNAL_AUDIT_AND_CLAUDE_HANDOVER_20260925.md`, PR #27).

> **A-09 (the owner, 2026-09-25): E7 is amended for S5AA's administrative close.**
>
> 1. E7's enforcement, a machine-readable boundary that keeps a result carrying `outsideSupportedDomain` from being
>    admitted as a qualified reference value, is deferred to S5b task 4 (the corpus freeze), as decided on 2026-09-24
>    (close record §30). S5AA may close with E7 not met.
> 2. Until that boundary exists and a test prevents their admission, every corpus result carrying
>    `outsideSupportedDomain` is an **UNQUALIFIED** reference value. In r16 these are 10 entries:
>    golden:monte-carlo-fixed-seed, seed:3, seed:8, seed:9, seed:11, seed:14, seed:15, seed:19,
>    expansion:monte-carlo-sensitive-band, expansion:s5aa-r19-ira-contribution-conversion-same-year. Any later flagged
>    entry is unqualified on the same terms.
> 3. E2 stays not met; its residual uncertainty is accepted (§30). E14 is an explicit exception: most engine
>    disclosures are not rendered, and the warnings panel is S5b's (§30).
> 4. A close under this amendment is administrative. It does not qualify the model for release or for household
>    reliance, and every limit the close record carries stays carried.

*Not part of A-09 — the status, also the owner's on 2026-09-25:* S5AA is **NO-GO**, and from now on **ChatGPT determines the
GO / NO-GO status** ("no go, chatgpt determines no go/go status"). ChatGPT is asked for that determination under A-09
in `audit/S5AA/R24/`. Close record §35.
