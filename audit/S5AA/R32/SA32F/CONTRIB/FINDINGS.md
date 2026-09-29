# CONTRIB — auditor's report (saved by the coordinating session; the auditor could not write .md files)

Contributions and contribution limits, frozen `main` at `2b2d5f2`. Report-only. Every repro is in this folder and runs with
`node <file>`; each builds its plan from `../harness.js` and checks `validateScenario(...).valid` and `runPlan(...).status ===
'ok'` (`lib.js`, `check()`). The final rerun's output is in `final_run.txt`: 80 `runPlan` calls (20 across the 11 repros, 60
in `sweep_limits.js`), plus about 25 exploratory runs. No 2026 constant was wrong.

## Findings
| ID | Sev | Claim | Impact in the repro |
|---|---|---|---|
| CONTRIB-01 | P1 | The IRA deduction phase-out shrinks the **contribution**. IRC 219(g)(1) shrinks the **limit**, so the deduction should be min(reduced limit, contribution). | Deduction $2,000 instead of $3,750: AGI +$1,750, federal tax +$385 a year. Joint spouse-covered case: AGI +$1,250 |
| CONTRIB-02 | P2 | In the Roth phase-out band the engine allows 7,500 × factor − traditional. 408A(c)(2)-(3) and Worksheet 2-2 take the smaller of the reduced limit and 7,500 − traditional. | Roth $750 instead of $3,750; $3,000 a year pushed to taxable |
| CONTRIB-03 | P2 | The Roth phase-out has no $200 minimum and no $10 rounding (408A(c)(3)(A) imports 219(g)(2)). | Roth $100 instead of $200 at $167,800; $0.50 instead of $200 at $167,999 |
| CONTRIB-04 | P2 | A 401(k) deferral above the owner's pay is deposited and excluded in full; 415(c)(1)(B) caps it at 100% of compensation. No warning (the validator compares household totals only). | Spouse earning $15,000 who defers $24,500: AGI −$9,500, federal tax −$1,140 a year |
| CONTRIB-05 | P1 | `contributionStop` is read on the **self's** age for the spouse's accounts, while the spouse works on their own clock. The default setup (stop = retireAge) triggers it. | Younger spouse loses $10,000 a year of deferrals; tax +$1,450 a year |
| CONTRIB-06 | P1 | `vesting` forfeits the unvested share of every match at deposit, and it never vests (411(a)(2)(B): 100% after at most 6 years). | −$48,000 of pre-tax balance after 10 years (20% vested, $6,000 a year match) |
| CONTRIB-07 | P1 | `profitShare` is paid only when `matchOn` is true, so profit sharing with no match is dropped. | −$5,000 a year |
| CONTRIB-08 | P2 | Under `limitPolicy: "warn"`, the deferral above 402(g) is still excluded from income; 402(g)(1)(A) includes it. | AGI −$5,500, federal tax −$1,210 a year |
| CONTRIB-09 | P3 | A joint percent-of-salary account: the UI total (`app-shell.html:553`) uses both salaries, the engine the self's only. | Shows $16,000; engine deposits $10,000 |
| CONTRIB-10 | P3 | "Add future contribution change" pre-fills a dollar "set" with the account's **percent**. | A 10%-of-salary account drops to $10 a year |
| CONTRIB-11 | P1 | A spousal IRA is silently dropped once the non-working spouse passes retireAge, though the joint return has pay behind it (219(c)) and the age limit is repealed (219(d)(1); 408A(c)(4)). | −$7,500 a year |

For the owner to rule on:
- **05, 06 and 11** go against conventions recorded only in engine comments: the work-window proxy, the self's clock for the stop
  age, and "existing treatment" of vesting. None appears in the declared documents.
- **06** becomes a documentation item rather than a money error if `vesting` means "the share kept at an assumed separation".

Federal tax deltas use Rev. Proc. 2025-32 brackets, each measured inside one bracket: single 22% and joint 12%. No Arizona
amount is claimed.

## 1. Scope covered
**Functions read** (`src/engine.js`):
- `accountPlannedContribution` (:31), `contributionLimit` (:32), `rothPhaseoutFactor` (:40)
- `householdWorkDurations` (:68), `ownerContributionEligibility` (:77), `rothCatchupStatus` (:117), `ownerCompensation` (:134)
- `auditContributions` (:142–167, including the R29 one-time path)
- `iraDeductionPhaseoutRange` and `iraDeductibleAmount` (:552–577)
- `employerMatchIsRoth` and `employerMatchDestination` (:2413–2440)
- the row's contribution, match, 415(c), redirect and IRA-deduction code (:3371–3407, :3680–3690)

**Also read:** the validator's `validatePlannedContributions` (:914) and filing-status list; the UI's account editor, presets,
account summary and guidance text (`app-shell.html` :531, :536–553, :933, :1024–1029).

**2026 amounts, all checked at the primary source and all matching the rules JSON:**
- *Notice 2025-67:*
  - 402(g) deferral $24,500; catch-up $8,000; ages 60–63 catch-up $11,250.
  - 415(c) $72,000; 401(a)(17) $360,000.
  - IRA $7,500 plus $1,100 catch-up.
  - 414(v)(7) Roth catch-up wage threshold $150,000.
  - Roth IRA phase-out: single/HoH $153,000–$168,000; joint $242,000–$252,000; MFS $0–$10,000.
  - IRA deduction phase-out: single/HoH $81,000–$91,000; joint, contributor covered, $129,000–$149,000; joint, only the spouse
    covered, $242,000–$252,000; MFS $0–$10,000.
- *Rev. Proc. 2025-19:* HSA $4,400 self-only and $8,750 family.
- *IRC 223(b)(3):* HSA catch-up $1,000 at 55.

## 3. Per finding
### CONTRIB-01 (P1): the IRA deduction phase-out shrinks the contribution instead of the limit
- **Rule:**
  - IRC 219(g)(1): "each of the dollar limitations contained in subsections (b)(1)(A)… shall be reduced".
  - Pub 590-A (2025) Worksheet 1-2: line 7 enters "the smallest amount" of lines 4, 5 and 6, where line 6 is the contribution.
- **Repro:** `CONTRIB-01_ira_deduction_tapers_contribution.js`
- **Case A.** Single, salary $96,000, 401(k) $10,000 (so covered), traditional IRA $4,000.
  - Hand: MAGI = 96,000 − 10,000 = 86,000. Reduced limit = 7,500 × (91,000 − 86,000) / 10,000 = 3,750. Deduction =
    min(4,000, 3,750) = 3,750, so AGI = 82,250.
  - Engine: AGI $84,000 (deduction 4,000 × 0.5 = $2,000). That is +$1,750 of AGI and +$385 of federal tax a year.
  - Control: a $7,500 contribution matches the hand figure.
- **Case B** (joint, contributor uncovered, spouse covered; MAGI $247,000; IRA $5,000): hand 7,500 × 5,000 / 10,000 = 3,750, so
  AGI = 243,250; engine AGI $244,500.
- **Why not declared:** the engine comment (:561–565) and the rules JSON declare only the omitted $10 round-up. They describe
  the method as "the contribution tapered linearly", which is not what the worksheet or the statute does.

### CONTRIB-02 (P2): the Roth limit subtracts traditional contributions from the reduced limit
- **Rule:** 408A(c)(2) and (c)(3)(A); Worksheet 2-2, line 11: "the lesser of line 8 or line 10".
- **Repro:** `CONTRIB-02_roth_phaseout_after_traditional.js`
- **Hand.** MAGI proxy $160,500 (the declared salary proxy), so the ratio is 0.5. Line 8 = 7,500 − 3,750 = 3,750; line 10 =
  7,500 − 3,000 = 4,500. Limit 3,750, so Roth = 3,750 and taxable = 103,750.
- **Engine:** Roth $750, taxable $106,750.
- **Control:** with the Roth account first in priority, the engine gives the lawful figure.

### CONTRIB-03 (P2): no $200 minimum or $10 rounding in the Roth phase-out
- **Rule:** 408A(c)(3)(A), last sentence, imports 219(g)(2)(B) and (C): no limit is reduced "below $200" unless reduced to zero,
  and the reduction is rounded to "the next lowest $10".
- **Repro:** `CONTRIB-03_roth_phaseout_no_200_minimum.js`

| MAGI | Hand | Engine |
|---|---|---|
| $167,800 | reduction 7,400 → limit 100 → **$200** | $100 |
| $167,999 | reduction 7,499.50 → rounds to 7,490 → limit 10 → **$200** | $0.50 |
| $160,501 | reduction 3,750.50 → rounds to 3,750 → **$3,750** | $3,749.50 |

### CONTRIB-04 (P2): a deferral above the owner's pay is excluded in full
- **Rule:** 415(c)(1)(B), "100 percent of the participant's compensation"; 415(c)(2); 415(c)(3)(D).
- **Repro:** `CONTRIB-04_deferral_above_compensation.js`
- **Hand.** Joint; self $100,000; spouse $15,000 with a $24,500 deferral. The deferral is capped at $15,000, so AGI = 100,000.
- **Engine:** AGI $90,500, pre-tax $24,500. No warning: `CONTRIBUTIONS_ABOVE_EARNED_INCOME` compares only the household total.
- **Why not declared:** Q59 (§7) covers how contributions are funded; the R26 compensation cap covers IRAs only.

### CONTRIB-05 (P1): `contributionStop` runs on the self's clock for the spouse's accounts
- Wages end at retireAge on each person's own clock (`householdWorkDurations` :73–74; Q115). The UI label "Contributions stop
  at age" names no person, and setup sets it equal to retireAge (`app-shell.html` :531). But `ownerContributionEligibility`
  (:82) and the row loop (:3372) compare it with the self's age for both owners.
- **Repro:** `CONTRIB-05_contribution_stop_on_self_clock.js`. Plan A: self 60, spouse 50, spouse owns the 401(k). Plan B: the
  mirror image.
- **Hand:** in rows 6–7 the younger person is 55–57, still paid, so each plan contributes $10,000 a year.
- **Engine:** spouse plan $0 contributed, AGI $100,000, tax $16,014.50; mirror plan $10,000, AGI $90,000, tax $14,564.50.
- It is called an "established convention" only in an engine comment (:55–57). A symmetry finding for the owner.

### CONTRIB-06 (P1): matches never vest
- **Rule:** 411(a)(2)(B)(iii), 100% at "6 or more" years; (ii), a 3-year cliff.
- **Repro:** `CONTRIB-06_vesting_never_vests.js`
- **Hand.** Ten years; $10,000 deferral; $6,000 match; 20% vested. On the slowest lawful schedule every match is vested by
  year 10: pre-tax = 160,000.
- **Engine:** $112,000 (a $1,200 match every year): −$48,000.
- "The engine's existing treatment" (:2405) is the only description. Caveat above.

### CONTRIB-07 (P1): profit sharing requires the match switch
- The editor shows "Employer match enabled", "Profit sharing" and "Vested percentage" as separate fields (`app-shell.html` :547);
  under 415(c)(2) profit sharing is its own employer contribution. The row code gates it inside `target.matchOn` (:3395).
- **Repro:** `CONTRIB-07_profit_share_needs_match_on.js`. Hand 15,000; engine 10,000; control (match on at 0%) 15,000.

### CONTRIB-08 (P2): an excess deferral under "warn" is still excluded from income
- **Rule:** 402(g)(1)(A): deferrals "shall be included in such individual's gross income to the extent" they exceed the limit.
- **Repro:** `CONTRIB-08_warn_policy_deducts_excess.js`. $30,000 against a $24,500 limit: hand AGI 75,500; engine 70,000; the
  redirect-policy control gives 75,500.
- **Likely the same for IRAs (read, not run):** `iraPreTax` uses `allowed = requested`.

### CONTRIB-09 (P3): the joint salary-percent total disagrees with the engine
- `renderAccountSummary` (`app-shell.html` :553) uses both salaries for `owner: "joint"`; the engine and validator use the
  self's. Repro `CONTRIB-09_joint_salary_pct_ui_total.js`: UI $16,000, engine $10,000.

### CONTRIB-10 (P3): the future-change pre-fill treats a percent as dollars
- `addFuture.onclick` (`app-shell.html` :548) pushes `{mode:"set", value:a.contribution}` into a "$" field. Repro
  `CONTRIB-10_future_change_prefill.js`: $10,000 becomes $10.

### CONTRIB-11 (P1): the spousal IRA is dropped once the non-working spouse passes retireAge
- **Rule:** 219(c) rests on the spouse's compensation; 219(d)(1) is repealed (Pub. L. 116–94); 408A(c)(4).
- **Repro:** `CONTRIB-11_spousal_ira_after_spouse_retires.js`. Self 55 working at $100,000; spouse 66 with no pay; spouse Roth
  $7,500. Hand $7,500; engine $0, with no redirect and no warning. Control (spouse aged 60): $7,500.
- The work window is called a "proxy" only in code comments (:103–110, :163). §20 names compensation as the IRA limit.

## 4. Declared behaviours confirmed
- **Year-end-age catch-up (R32) is applied consistently:** `contributionLimit` (IRA 50, 401(k) 50 and 60–63, HSA 55), the HSA
  catch-up in `auditContributions`, the R29 one-time path, and the UI's calls. The validator has no catch-up test. A 60-plan
  sweep over opening ages 48–64, self and spouse, found 0 mismatches.
- **415(c) room:** disregards the catch-up, applies 401(a)(17), and caps $63,000 of match plus profit sharing at $47,500.
- **Roth match election:** requires 100% vesting; the elected match is in AGI and routed to a Roth account.
- **Declared elsewhere:** the salary proxy for Roth MAGI; no MFS status; the HSA family limit follows the filing status
  (§18.1); the pre-tax Roth catch-up only warns (§13); 415(c) not aggregated per employer group (TODO ACCOUNT-17-8); no $10
  round-up in the IRA deduction; contributions funded outside the model (Q59); redirected excess is after-tax.
- **Limits are not indexed after 2026** (one tax-year scope). Not spelled out: a growing percent-of-salary deferral hits the
  frozen 402(g) limit and is redirected sooner than the law would require.

## 5. Suspicions, not confirmed
- The Roth MAGI proxy uses the annual salary rate even in a partial retirement row, and ignores wage and SE income streams.
- A single filer with a spouse on validates and taxes both salaries on one return (AGI $200,000 in a probe).
- `futureChanges[].age` uses the self's age for spouse-owned accounts.
- `changeTiming: "period"` compounds the "Annual change" once per deposit period.
- A fractional `endAge` truncates the last row, so the catch-up test reads the truncated close.
- Two workplace accounts with `matchOn` each get their own match cap and 415(c) room (the per-employer-group TODO).
