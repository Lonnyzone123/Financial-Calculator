# S5AA R39 — change audit handover: ChatGPT's R38-01 to R38-05, and the QCD at 70½

*Written by Claude, 2026-09-29 (local, UTC−7), for the owner to send to ChatGPT. Every figure was measured on Windows 11 / Node 24.17.0 at
the commits named.*

## 1. What to audit

- **The change:** from `main` at `d02c509` (R38 and ChatGPT's R38 change audit, #27) to **`s5aa-r39-source`** at **`f7ea076`**. The diff
  to audit is `d02c509..f7ea076`.
- **Six commits,** one per finding, plus the QCD declaration.
- **Please number findings R39-NN**, in the usual report-only pull request, on a branch like `audit/chatgpt/r39-f7ea076`.

## 2. The decisions this round applies

- **"start R39, go with your recommendations"** (the owner, 2026-09-29). It covers:
  - repairing R38-01 to R38-04;
  - for R38-01, holding a row that is itself part of a tax year to that share of the annual limit (§3.1);
  - for R38-05, clearing the current-employer flag when a workplace plan passes to a surviving spouse;
  - for the QCD at 70½, keeping the opening-age convention and saying so on the form.
- **The owner's earlier "check the roth match rule later"** is answered by R38-03's law (§3.3).

## 3. What changed

### 3.1 R38-01: annual limits and part-year work — `8a51aaf`

**The defect.** `auditContributions()` capped each account's planned **annual rate** at the annual limit. The row then multiplied the capped
rate by the part of the row the owner worked, so a retirement at 45.5 allowed half of each limit. The 415(c) room and the 401(a)(17)
compensation limit were cut the same way at the match. All four of ChatGPT's witnesses reproduced exactly on `d02c509`: 3,750, 12,250,
36,000 and 18,500.

**The law.** The IRS does not prorate these limits merely because a participant is eligible for part of a full limitation year. See its
Issue Snapshots on the 415(c) short limitation year and the 401(a)(17) short plan year. The 2026 amounts are Notice 2025-67's.

**The repair.**
- **The stretch.** `stretchFor(owner, ira)` is the row's length over the owner's contribution span. The capped rate is `limit × stretch`,
  so the dollars deposited are held to the annual limit times the row's share of a tax year.
  - In a whole row, that is the whole limit.
  - In a row that is itself part of a tax year (a plan opening at 45.5), it is that share. This is the owner's decision: the plan does not
    know what was deposited before it opened.
  - The Roth IRA's reduced limit and the catch-up split scale the same way.
- **401(a)(17)** now holds the pay the row pays (salary × the part worked) to the limit × the row's length.
- **415(c)'s room** is the row's share of the annual limit.
- **The HSA keeps its proration.** Its limit is a sum of monthly limits for the months of eligibility (IRC 223(b)(2)), and the model reads
  eligibility from the contribution window.

### 3.2 R38-02: the Rule of 55 from a fractional start — `4995761`

**The law.** IRC 72(t)(2)(A)(v) exempts a distribution "after separation from service after attainment of age 55". The IRS reads it as a
separation "during or after the year the employee reaches age 55" (its exceptions page).

**The defect.** R35 tested only the calendar-year reading, on the plan's birth-year convention:
`floor(retireAge − startAge) + floor(startAge) ≥ 55`. From a start of 54.5 with a separation at 55 that reads 0 + 54. ChatGPT's witness
paid 9,667.50 where 4,667.50 is right.

**The repair.** A separation at 55 or later has attained 55, so it now qualifies outright. The calendar-year reading still admits a
separation earlier in the year of 55.

### 3.3 R38-03: the Roth match election at allocation — `252faba`

**The law.** IRS Notice 2024-2, Q&A L-3 (read in the IRS PDF, page 72), under IRC 402A(f)(3): a match "may be designated as a Roth
contribution only if the employee is fully vested in matching contributions at the time the contribution is allocated to the employee's
account."

**The defect.** `employerMatchIsRoth()` read only the entered `vesting === 100`, while `employerVestedShare()` vests on service and at 65.
Two symptoms:
- ChatGPT's witness: a match allocated after full vesting stayed pre-tax, 9,000 where 6,000 is right.
- The case R38 reported to the owner: `vesting: 100` with `yearsOfService: 0` was taxed as Roth and then mostly forfeited.

**The repair.**
- The row computes `vestedAtAllocation` once, and passes it to `employerMatchIsRoth(account, vestedShare)`.
- The same figure decides whether the employer share is tracked for forfeiture.
- Other callers pass no share, and the entered 100 still decides for them.

**A correction to R38's records:** R38's handover and self-audit said the statute does not condition a Roth match on full vesting. That
was wrong: 402A(f)(3) does, as L-3 says. I had read only 402A(a) and (c).

### 3.4 R38-04: a claim inside a projection year — `f6dbb2a`

**The defect.** `householdSocialSecurityDetail()` priced each person's PIA at the row's opening age. A claim inside the row missed a COLA
completed between the opening and the claim. The entered benefit takes each COLA from the plan's start to the claim (R34, decision 3; 20
CFR 404.271).

**The repair.**
- Each claimant's own PIA is priced at the claim when the claim falls strictly inside the row, the spouse's on the spouse's own clock.
- A benefit already being paid keeps the row-constant amount (R2-004).

### 3.5 R38-05: an inherited workplace plan and the still-working exception — `85fe621`

**The law.** The exception runs to the year the **employee** retires "from employment with the employer maintaining the plan" (IRC
401(a)(9)(C)(i)(II)).

**The defect.**
- The succession kept the decedent's `currentEmployerPlan`, so a survivor still working owed nothing: 0 where 3,905.63 is due.
- The same happened with the flag left blank: `rmdObligations()` infers it from the account's contribution field, and the decedent's field
  outlives them. Found in this round's check; it widens ChatGPT's reach.

**The repair.** A workplace plan that passes now has `currentEmployerPlan` set to false.
- The survivor does not work for the decedent's employer, whether the money stays in its plan or rolls to an IRA.
- Only a rollover into the survivor's own employer's plan could qualify, and the plan records no such election.

### 3.6 The QCD at 70½ — `f7ea076`, declared, no behaviour change

**The law.** IRC 408(d)(8)(B)(ii) allows a QCD from the day the owner is 70½.

**The model.** The plan records no gift date, so eligibility is read at each row's start: Q137's opening-age convention. `qcdOwnerRequests()`
now declares it, and the form's field reads "Annual qualified charitable distribution (from the first plan year that starts at 70 1/2 or
older)".

**The decision.** It is to be settled with the 59½ and 65 conventions at the engine rebuild.

## 4. Evidence

**Six new test files, 17 tests.** Each expectation is worked by hand in the file.

| file | cases | before the change |
|---|---|---|
| `part-year-contribution-limits` | ChatGPT's four; a part year over the limit under redirect (24,500) and warn (30,000); whole-year controls (24,500 / 30,000 / 7,500); a half-tax-year first row (12,250) | 3,750; 12,250 |
| `rule55-fractional-start` | separations at 55 from 54.5, 53.5 and 54 (4,667.50); controls paying the 10%: a separation at 54 in the year of 54, an IRA, a former employer's plan (9,667.50) | 9,667.50 |
| `roth-match-effective-vesting` | ChatGPT's witness (6,000 pre-tax; the elected row taxed ≥ 435 more); full vesting at 65 (6,000); vesting 100 with no service (2,400 pre-tax, 12,000 Roth); control, vesting 100 with no service figure | 9,000; 12,000; [0, 12,636] |
| `claim-inside-row-cola` | ChatGPT's witness (13,728); an age-gap spouse (15,096); controls (24,000; 30,192) | 12,480; 13,728 |
| `survivor-inherits-no-employer-flag` | flagged (3,905.63); blank flag inferred from a contribution field (3,905.63); control, an IRA | 0; 0 |
| `qcd-opening-age` | 70 → 71 gives none, 71 → 72 gives 10,000; the declaration; the label | the declaration and label |

All file names start `tests/audit-s5aa-r39-`.

**Hand arithmetic:**
- **The Rule of 55 tax:** 50,000 − 16,100 = 33,900. Federal 1,240 + 12% of 21,500 = 3,820. Arizona 2.5% of 33,900 = 847.50. Total 4,667.50.
- **The spouse's two COLAs:** 2,000 → 2,200.00 → 2,420.00; × 1.04 = 2,516.80, paid as 2,516.
- **The survivor's RMD:** (100,000 − 100,000 / 25.5) / 24.6 = 3,905.63.

**Gates, each at its commit in a separate worktree:**

| commit | finding | tests | failing | closeout |
|---|---|---:|---:|---|
| `8a51aaf` | R38-01 | 3,102 | 0 | 12 / 0 |
| `4995761` | R38-02 | 3,104 | 0 | 12 / 0 |
| `252faba` | R38-03 | 3,108 | 0 | 12 / 0 |
| `f6dbb2a` | R38-04 | 3,111 | 0 | 12 / 0 |
| `85fe621` | R38-05 | 3,114 | 0 | 12 / 0 |
| `f7ea076` | the QCD | 3,116 | 0 | 12 / 0 |

Each gate also has 9 authorised todo. **ChatGPT's own witness script** (`audit/S5AA/R38/S5AA_R38_EXTERNAL_REPRO_20260929.js`), run at `f7ea076`, prints its expected figure for every case:
- **R38-01 to R38-04** match exactly.
- **R38-03:** pre-tax is 6,000, and Roth is 11,565: 12,000 less the 435 of tax on the Roth match. The year's tax is 7,909, which is 7,474 + 435.
- **R38-05:** the inherited 401(k) now gives 3,905.63, equal to the IRA destination.

## 5. What moved

**The control (4.7).** Nothing. `declare_r29` found 0 unpredicted differences after each of the five engine commits, and golden is
unchanged.

**The expanded corpus at `f7ea076`:**
- **71 entries, qualified boundary, invariant 7/7.**
- **Nothing moved.** The output hash `aaa16de138f2e72889e7861880e9c25fed272583e08d65294dfd7c504e5f3e22` and input hash `1d91d6733295298f22dcbce36b5c730fd014a7a51e1e7dfed1e9259c02fbc4ce` are unchanged from R37 and R38.
- **Witnessed only by the hand tests:** no corpus plan reaches any of the five repairs.

**The reference runners at `f7ea076`:**
- R33's federal tax sweep: 13,815 returns, 0 mismatches.
- R34's Social Security reference: 25 cases, 0 mismatches.

## 6. Known limits

- **R38-01:**
  - The one-time contribution path (a transfer into an IRA or HSA) still holds a partial row to the whole annual limit, as it did.
  - The limits' excess warnings still state the annual-rate excess.
- **R38-02:** a separation before 55 in the year of 55 still reads the plan's birth-year convention (§12's whole-age reading). From a
  fractional start that convention and the dated ages can disagree about which calendar year a separation falls in.
- **R38-03:** allocation is read at the row's opening, like the tracking. A row in which the employee becomes fully vested allocates its
  whole match by the opening's state.
- **R38-04:** a benefit already being paid is priced once per row, so a COLA that falls inside a row after the claim starts next row
  (R2-004).
- **R38-05:** a survivor who would roll the plan into their own employer's plan is not modelled.
- **The QCD, 59½ and 65** all read the row's opening age.

## 7. Where I would look first

1. `stretchFor()` for an owner whose IRA span and workplace span differ (a spousal IRA past the owner's retirement).
2. A claim inside the row for a survivor or spousal benefit, which are still priced from the opening-age PIAs of the other person.
3. The succession flag for a joint-to-self succession of a custom account with a workplace limit group.
