# S5AA R33 — change audit handover: tax and contributions (16 items from R32F / R32V)

*Written by Claude, 2026-09-29 (local, UTC−7), during the owner's overnight run of R33–R37, for the owner to send to ChatGPT. Every
figure was measured on Windows 11 / Node 24.17.0 at the commits named.*

## 1. What to audit

- **The change:** from `main` at `66854d0` (your R32V report merged) to **`s5aa-r33-source`** at **`f4e8294`**.
- **Eight commits, each test-first and each gated green:**

| commit | findings | what changed |
|---|---|---|
| `6db8e94` | SA32F-10, -28, -29 | the IRA phase-outs reduce the LIMIT, with the $10 rounding and $200 minimum |
| `fd80c78` | SA32F-11, -30, -31 | deferrals excluded only as far as the law excludes them |
| `5d85480` | SA32F-12, -14, -15 | each owner's own contribution clock, profit sharing on its own, the spousal IRA |
| `f3a7b46` | SA32F-16 | the age-65 amounts at the row's close, federal and Arizona |
| `d8731a6` | SA32F-33 | a married couple on a non-joint return |
| `66de9c7` | SA32F-32 | the capital-gains worksheet's line 25 |
| `998af8a` | SA32F-34 | the loss carryover adds back the section 151 deduction |
| `f4e8294` | SA32F-09, -23 | IRMAA reads the lookback year's own filing status; the top tier includes its threshold |

- **Please number findings R33-NN**, in the usual report-only pull request, on a branch like `audit/chatgpt/r33-f4e8294`.

## 2. The owner's decisions this round implements

- **Of 2026-09-29, recorded in the R32F report's §4 and in `SPRINT_QUESTIONS.md` Q158–Q165:**
  - 5a: each owner's own stop age;
  - 5c: the spousal IRA while there is joint pay.
- **Of the same night, for R33:**
  - (a) apply the IRA deduction's $10 rounding: "yes";
  - (b) a spouse's future contribution changes on the spouse's age: "Yes";
  - (c) Arizona's age-65 exemption at the year-end age if the statute reads the year's close: "Yes".
- **The overall instruction:** "Follow law everywhere": where the law gives a rule, build it rather than disclose a gap.

## 3. The rules, as built, with their sources

**IRA phase-outs** (`6db8e94`).
- **The rule:** IRC 219(g)(1) reduces the dollar limitation, not the contribution. 219(g)(2)(B) sets a $200 minimum unless the
  limit is reduced to zero, and 219(g)(2)(C) rounds the reduction down to $10.
- **The worksheets:** Publication 590-A Worksheet 1-2, lines 4 and 7, and Worksheet 2-2, lines 8, 10 and 11, were read on
  irs.gov. Their line 4 rounds the reduced limit up to $10; its Example 1 prints $6,825 where line 4 and the statute give $6,830,
  so the statute is followed and the old test is re-fixtured.
- **The Roth limit** is the lesser of the reduced limit and the limit less other IRA contributions (408A(c)(2)–(3)). The declared
  salary proxy for Roth MAGI is unchanged.

**Deferrals** (`fd80c78`).
- A deferral that salary wages cannot absorb is excluded from employment-stream and self-employment pay (402(g)).
- A workplace deferral is capped at the owner's own pay (415(c)(1)(B), with 415(c)(3)(D)).
- Each item carries `lawful`. Under the "warn" policy the deposit stays, but only the lawful part is excluded or deducted
  (402(g)(1)(A); 223(b); 219(b)).

**Contribution clocks** (`5d85480`).
- `ownerContributionWindow()`: the stop age is read on each owner's own age (5a). A future change on a spouse's account uses the
  spouse's age (b).
- On a joint return an owner who isn't working can fund an IRA while the other spouse works (219(c); 219(d)(1) is repealed). This
  holds up to that owner's own stop age, and only while they are alive (5c).
- Profit sharing is paid without the match switch (415(c)(2)).

**Age 65** (`f3a7b46`).
- 63(f)(1)(A), 151(d)(5)(C)(ii)(I), and A.R.S. 43-1023(E) (read on azleg.gov) all read the age attained "before the close of"
  the taxable year.
- `householdSeniorAgesAtClose()` carries each living person to the row's close, or to their death inside the row.
- The row, the tax context and the quote verification pass the same span.

**Married, not joint** (`d8731a6`). Under "follow law everywhere", a spouse who is included is read as married. On a single or
head-of-household return:
- the spouse's age amounts are not taken (151(d)(5)(C)(ii)(II); 63(f)(1)(B));
- neither spouse gets the senior deduction (151(d)(5)(C)(v));
- the self's own amount is the married $1,650 (63(f)(3)).

`ageAmountAges()` is the one rule. The solver's context carries it, and `quoteTaxFunding()` derives it for a context that doesn't
state it.

**Line 25** (`66de9c7`). Form 1040 QDCG worksheet line 25, the smaller of line 23 and line 24. The funding solver's mirror uses
`pwaMin()`, with line 24's bracket breakpoint and the crossing point.

**The carryover** (`998af8a`). IRC 1212(b)(2)(B)(ii): adjusted taxable income adds back the section 151 (senior) deduction.

**IRMAA** (`f4e8294`).
- 20 CFR 418.1115 pairs the MAGI with that year's filing status; `filingHistory` is recorded beside `magiHistory`.
- CMS 2026: the top tier is "Greater than or equal to $500,000" ($750,000 joint).
- The survivor disclosure and the Q88 comment, which stated the single ranges as the rule, are corrected.

## 4. Evidence

**New tests** (9 files, 29 tests). Each expectation is worked by hand in the file, and each defect test failed before its change
with the audit's figure:
- `tests/audit-s5aa-r33-ira-phaseout-reduces-the-limit.test.js` (6)
- `…-deferrals-excluded-lawfully` (4)
- `…-employer-money-and-owner-clocks` (4)
- `…-age-65-at-year-end` (3)
- `…-married-on-a-non-joint-return` (3)
- `…-qdcg-worksheet-line-25` (3)
- `…-loss-carryover-adds-back-151` (1)
- `…-irmaa-lookback-status-and-top-tier` (2)

**Re-fixtured by intent.** Each file says why in place.
- `audit-s5aa-ira-deduction` (6,830);
- `audit-s5aa-r26-ira-deduction-one-rule` (no compensation, no deduction);
- `audit-s5aa-r30-hsa-funding-uses-ira-basis` and `audit-s5aa-r32-ira-pool-at-the-transfer-date` (your R29 basis plan, +$265);
- `contribution-and-debt-projection` (pay for two dollar-limit tests);
- `audit-sa05-shared-eligibility` (5a);
- `public-route-fm02` (under-65 spouses at 63);
- `audit-r2-tax-quote` (the affine check builds its context with `ageAmountAges()`);
- `audit-s5aa-r18-self-audit-capital-loss` (48,150 carries).

**Gate at `f4e8294`.** GATE PASSED: 2,998 tests, 2,989 passing, 0 failing, 9 authorised todo. Closeout accepted 12, refused 0.

**Your external repros at `f4e8294`:**

| repro | result |
|---|---|
| R31 | 162 of 162 plans pass |
| R32 | 266 runs, 0 mismatches |
| R30 | 0 |
| R29 | 3 mismatches on the basis plan |
| R30A | 2 mismatches, also the basis plan |

- **What the R29 and R30A mismatches are:** SA32F-11, as expected. The $1,000 401(k) deferral funded from $200,000 of stream wages
  is now excluded: AGI 199,000, tax −$265 (1,000 × (24% + 2.5%)), net worth 181,987.

**The R32F repros for these findings at `f4e8294`:**
- **Match:** CONTRIB-01 to -05, -07, -08; TAXFED-01 and -05; STATE-HEALTH I1–I7; LIFE-08; the deferral repro.
- **These three differ, and each difference is a decision of this round:**
  - **TAXFED-03:** −$52.50 per person, because Arizona now reads the age at the close too (decision c).
  - **TAXFED-04:** +$820.50. The repro treated the household as unmarried; the married reading (SA32F-33) gives 4,822 federal,
    and the spouse's Arizona exemption is off the return.
  - **CONTRIB-11:** that plan's stop age is 65 and the spouse is 66, so under 5a the spouse is past their own stop age and
    contributes nothing. With stop age 70, R33's own test gets $7,500. **For the owner:** the spousal IRA ends at the non-working
    spouse's own stop age. A household wanting it for an older spouse sets the stop age above that spouse's age.

**The self-audit sweep, correcting your R32V-02.** `audit/S5AA/R33/S5AA_R33_SELF_AUDIT_TAX_SWEEP.js`, against its reference:
- The reference adds back section 151 and applies the married, non-joint rules.
- It covers 13,815 isolated returns, with married couples on single and head-of-household returns now included.
- **0 mismatches at `f4e8294`; 4,820 at the R32 source.** The R32 mismatches are 3 line-25 cases, 81 carryovers and 4,736
  married, non-joint returns.

## 5. What moved

**The control (4.7).** Every move was traced before it was declared, and each declaration names its mechanism:
- `6db8e94`: the four golden plans on the default household. The Roth limit rounds up to 6,580 (was 6,576.54) and 1,110 (was
  1,103.83); hand-checked at 0%.
- `fd80c78`: seed:2 and seed:10. Both plan 401(k) deferrals in years with no compensation, and these are now 0.
- `f3a7b46`: the four golden plans and seeds 2, 3, 4, 5, 6, 11, 16, 17, 18 and 20. In each, the first row to move is the row a
  living person turns 65, and its tax falls. golden:baseline: −$610.20 = (1,650 × 24% + 2,100 × 2.5%) / 0.735.
- `d8731a6`: seeds 3, 4, 17 and 18, a spouse on a single or head-of-household return. seed:4's wage-only baseline was measured
  directly at +$858.83.
- `66de9c7`: last-digit floating-point differences only. Every row is within 1e-9, and the Monte Carlo plan within 1.5e-8.

**The expanded corpus at `f4e8294`:**
- 70 entries, qualified boundary, and the invariant passes all 7 checks.
- Output hash `b28601dd345109a0662466b550f2011446b6d9c1c5871a8728e80fc11a4c14c6`.
- **The input hash changed**, to `b03fb2249e79afd772dcb01049e26f910de41c41f2534daa05734ba48f477262` (r17:
  `9b107562…`). One member's input changed in `5d85480`: `expansion:s5aa-gap-working-household`'s stop age went from 55 to 67.
  Under 5a its 63-year-old spouse would otherwise stop contributing, and the member would leave the IRA phase-out band it exists
  to reach. Its fingerprint is re-pinned in `tools/corpus-spec-expanded.json`, that member only. **For the owner:** r17, S5b task
  4's baseline, can no longer be diffed directly. Both sides have to be recaptured over the same inputs.
- **Against R32, both captured over today's inputs, 28 members moved.** These are the headline figures:

| member | fields | lifetime tax | ending net worth |
|---|---:|---:|---:|
| golden:baseline | 723 | −670.48 | +12,503.85 |
| golden:monte-carlo-fixed-seed | 773 | −503.64 | +8,928.19 |
| golden:reserve-and-bond-tent | 728 | +39.84 | +6,132.29 |
| golden:guardrails-withdrawal-strategy | 723 | −672.06 | +12,514.17 |
| seed:2 | 304 | −211.79 | −3.41 |
| seed:3 | 87 | +1,547.45 | −2,031.46 |
| seed:4 | 235 | +10,056.04 | +27,063.87 |
| seed:5 | 3 | −770.00 | 0.00 |
| seed:6 | 33 | −1,991.74 | +1,991.74 |
| seed:10 | 240 | 0.00 | **−2,696,597.41** |
| seed:11 | 78 | −1,974.33 | +4,647.90 |
| seed:16 | 8 | −3,088.13 | 0.00 |
| seed:17 | 118 | +18,486.68 | −7,283.86 |
| seed:18 | 180 | +7,317.73 | −7,794.03 |
| seed:20 | 340 | −1,400.28 | −10,080.91 |
| expansion:monte-carlo-sensitive-band | 660 | −1,046.80 | +18,141.33 |
| expansion:s5aa-gap-working-household | 273 | −3,724.28 | +3,501.12 |
| expansion:s5aa-gap-widowed-before-fra | 68 | −1,503.47 | +1,503.47 |
| expansion:s5aa-gap-death-while-working | 216 | −1,534.39 | +999.52 |
| expansion:s5aa-r6-gap-survivor-health-roth | 210 | −1,304.29 | −307.86 |
| expansion:s5aa-r6-gap-basis-conversion | 80 | −52.73 | +65.44 |
| expansion:s5aa-sa18-loss-under-deduction | 14 | +46.90 | −46.90 |

- **Six further members** change fields with no headline movement: golden:rmd-and-roth-conversion (1), seed:15 (1),
  targeted:survivor-stateful (1), expansion:s5aa-gap-early-retiree (16), expansion:s5aa-r14-rmd-two-iras-distinct-returns (30),
  and expansion:s5aa-sa18-decedent-loss (1).
- **seed:10's −$2.7M:** its 401(k) deferrals had no pay behind them for five working years and no taxable account to redirect to.
  They were deposits from nowhere, and the loss is those deposits compounded over the horizon.

## 6. Known limits

- The Roth MAGI is still the declared salary proxy. Because of it, the Roth limit's compensation line (Worksheet 2-2 line 6)
  cannot bind below the limit inside the phase-out band.
- An IRA excess kept under "warn" is not deducted, but its 6% excise tax (IRC 4973) is not modelled.
- The pre-existing wage-only baseline (Q59) takes stream-funded deferrals against salary wages first. Household AGI is right; the
  split between wage-paid and portfolio-paid tax can be.
- Married, not joint: that the status itself is not available to a married couple is SA32F-35, the warning in R37.
- Medicare eligibility and the filing status keep their opening-age rules. Only the age-65 tax amounts read the close.

## 7. Where I would look first

1. The quote and commit agreement on a married, non-joint household with gains near the line-25 sliver.
2. The spousal IRA window beside the R26 compensation cap on partial rows.
3. `filingHistory` across a death in a partial row.
