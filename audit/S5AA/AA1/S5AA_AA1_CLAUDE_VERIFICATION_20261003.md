# S5AA AA1 — Claude's verification of ChatGPT's assumptions audit, with the owner's choices

*Written by Claude on 2026-10-03 (Arizona, UTC−7), on the owner's request: "verify the findings and give me the choices, your
recommendations and how large of scope the fix would be." Checked at main `bde158f`
(the audit report is `S5AA_AA1_ASSUMPTIONS_AUDIT_20261003.md`, merged in PR #56). Records only: nothing in the model has
changed yet; the repairs are built in R45 and the rounds after it.*

## How this was checked

- **Monte Carlo, the reserve and R45:** Claude reran ChatGPT's experiments on the shipped engine (1,000 paths, seed 42791)
  and read the engine code for R45.
- **The other 32 findings:** three read-only agents checked each against the code (file and line), the app's own text, and
  the primary legal source (the IRC and Treasury regulations at law.cornell.edu and govinfo.gov, IRS publications, 20 CFR,
  CMS, SSA, A.R.S. at azleg.gov). Claude re-checked each agent's most load-bearing claims in the code.
- **Verdicts:** CONFIRMED (the finding stands as written); QUALIFIED (the finding stands but something is overstated or
  misplaced, and the note says what); REFUTED (the finding is wrong).

**Result: none refuted.** Of the 36 findings that were not CONSISTENT, 19 are confirmed and 17 qualified (one of those,
AA1-08, has the wrong mechanism). The 11 CONSISTENT rows were not re-checked. ChatGPT's scope estimates are often
too high, because several inputs and disclosures it asks for already exist.

**Three problems the audit did not name, which cut across many findings:**
1. **The app shows only five engine warnings as cards** (`planWarningTitles`, app-shell.html:938). The Roth-ordering flag
   (AA1-36), the IRMAA default (AA1-11), the survivor-filing and spousal-rollover notes (AA1-19/20) and others are computed but
   never shown.
2. **The validator runs only when a backup is imported** (app-shell.html:876), and only counts its warnings. Its "contributions
   above earned income" and "debt payment outside spending" warnings (AA1-07) never reach the screen while a plan is edited.
3. **Spending flexibility is on by default at 10%** with no help text: after any down year, spending is cut 10%, applied after
   the guardrail floor, so it can push spending below the floor the user entered (AA1-25).

**Two corrections to my own brief:** there are nine review-board entries (RB-01 to RB-09), not ten; and ChatGPT's report says
47 rule groups in its first line and 43 in its method text.

## Monte Carlo and the cash reserve (Claude reproduced)

| check | ChatGPT | Claude | verdict |
|---|---|---|---|
| MC-A: success, 1 → 20 identical Roth accounts ($1M, 7%/20%, $40,000 real, 30 years) | 59.8% → 99.2% | 59.8% → 99.2%; two accounts 70.7% | CONFIRMED |
| MC-A: one-year 10th–90th band, no spending | — | 1 account $789,286–$1,277,165; 20 accounts $970,408–$1,084,236 | CONFIRMED |
| MC-B: deterministic, 3-year reserve, after 1 year | $1,023,916.59 vs $1,026,662.37 | identical | CONFIRMED |
| MC-B: after 30 years | $190,597 apart | $1,965,007.27 vs $2,155,604.65 | CONFIRMED |
| MC-C: correlation −0.5 across five 20%-volatility classes | status ok, zero spread | status ok, no warning, 10th = 90th = $1,028,624 | CONFIRMED |
| MC-D: reversed account order / an empty account added | 69.8 → 71.4 / 72.2 | 70.6 → 71.9 / 73.9 (own 3-account case) | CONFIRMED |
| MC-E: "success" = no shortfall over one cent | engine line 4548 | engine.js:4548; app label "Success probability" | CONFIRMED |

- **Cause, MC-A and MC-D:** `accountReturnForPeriod()` (engine.js:3695) draws one independent shock per account, in account
  order; the correlation setting acts only inside one account (`accountVolatility()`, :2274).
- **Cause, MC-B:** the reserve share is `min(account balance, spending × years) / portfolio total` (engine.js:3697). The cap on
  the account's own balance makes small accounts under-reserve. Capping at the portfolio total instead gives every account the
  same household fraction.
- **Cause, MC-C:** `Math.sqrt(Math.max(0, variance))` with no feasibility check in the validator or the engine.

## R45: the spouse retirement rules (Claude, against the engine)

- **AA1-38, the first stop (JUDGMENT CALL): agree.** With no working-years budget (Q59), spending is zero before the household
  date and switches on in full at it, offset by any remaining net pay.
- **AA1-39, death as a stop (SHOULD CHANGE): QUALIFIED.** ChatGPT says the full retired budget starts at the death. The survivor
  spending reduction already applies after a death, and pay-first means the portfolio pays only what the survivor's net pay
  doesn't cover. The real gap is AA1-38's: today's alternative is zero spending while the survivor works.
- **AA1-40, what follows the first stop (SHOULD CHANGE): CONFIRMED for conversions; JUDGMENT for health; reserve fine.**
  - Conversions: today they start at the primary's retirement, so they never overlap the primary's own salary. Under rule 5,
    a spouse who stops first would start conversions on top of the primary's wages.
  - Health: pre-Medicare costs already follow the household date (`costRetiredDuration` × people under 65), so today a primary
    who retires first pays both people's health costs even if the spouse's employer still covers them. Whether coverage
    continues is a fact the model doesn't ask.
  - Reserve: starting it when portfolio draws can begin is sound.

## Federal tax and retirement accounts

| finding | verdict | what the check found | options (scope) | recommended |
|---|---|---|---|---|
| AA1-30 senior deduction after 2028 | CONFIRMED | `seniorDeduction()` (engine.js:394) never reads the stored `expiresAfter:2028`; the app card says the plan keeps it; IRC 151(d)(5)(C) ends it. This is the owner's Q165 decision. At 12% the 2029 effect is $1,440, at 22% $2,640 | a disclose that the law ends it (S); b end it after 2028 (M); c b plus an "assume extension" toggle (L) | b |
| AA1-31 partial first/last rows | QUALIFIED | the last row ending at a death is right (Pub 559: full deduction regardless of date of death); the real gap is the first row's missing earlier-in-year income; $1,291 includes Arizona (federal $1,090); no app text | a disclose in app (S); b "income earlier this tax year" input (L) | a now, b later |
| AA1-45 QBI | QUALIFIED | Treas. Reg. 1.199A-3(b)(1)(vi) confirmed; pre-tax deferrals from SE pay cut AGI but not QBI (understates tax); SE health insurance is missing from AGI too (overstates tax) | a disclose (S); b subtract SE-funded deferrals from QBI (M); c SE health-insurance input (L) | a+b, M |
| AA1-13 Roth catch-up | QUALIFIED | IRC 414(v)(7) applies in 2026; the prior-year-wage input already exists and the app already says catch-up stays pre-tax; extra gap: prior-year wages are one static figure | a state the tax effect (S); b route to the owner's Roth 401(k) if one exists, project wages from salary (M); c designated-Roth sub-balance in a pre-tax plan (L) | c (b as a step), L |
| AA1-26 SE compensation, spousal IRA | QUALIFIED | IRC 401(c)(2) confirmed; binds only when profit is at or below the IRA limit (at most about $530–610); the spousal IRA stops at the owner's own contribution-stop input, not at the other's retirement | a disclose (S); b subtract half SE tax in `ownerCompensation()` (M); c separate spousal-IRA stop (M) | b + disclose, M |
| AA1-32 HSA stop at 65 | CONFIRMED | IRC 223(b)(7) ties it to Medicare entitlement; already disclosed in the app; anyone claiming Social Security at 65 or earlier gets Part A automatically, so 65 is right for them | b Medicare start from the claim age (6-month backdating), with override (M); c HDHP coverage by person-year (L) | b, M |
| AA1-27 warn-and-permit excess | CONFIRMED | IRC 4973 6% a year on IRA/HSA excess, capped, absorbed by later room; no excise anywhere; not disclosed; default policy is redirect | a disclose (S); b remove "warn" for IRA/HSA (S/M); c annual 6% excise (M) | c + disclose now, M |
| AA1-36 Roth ordering, 5-year clocks | CONFIRMED | IRC 408A(d)(4)(B), (d)(2)(B), (d)(3)(F); the engine's warning is never shown in the app; Roth 401(k) uses pro-rata, not ordering | a show the warning now (S); b basis input + in-plan contribution/conversion ledger (L); c full ordering and clocks (XL) | a now; b or c later |
| AA1-18 missed-RMD excise | QUALIFIED | the app already says the excise isn't included; IRC 4974 25%/10% | a tag tax totals and CSV incomplete (S); b compute the excise (M) | a, S |
| AA1-22 thresholds at row opening | QUALIFIED | conventions lean to more tax; the 1949 birth-month point moves no figure (every 1949 owner is past both start ages) | a crossing-year note (S); b prorate the 10%/20% (M) | a, S |
| AA1-04 gains all long term | QUALIFIED | the engine realizes gains only on draws and transfers, so short-term gains are rare here | a app sentence (S); b short-term share assumption (M); c tax lots (XL) | a, S |
| AA1-05 dividend-off 1.5% | QUALIFIED | the dividend-on branch already has yield, qualified share and a true zero; the $2,250 is mostly timing (added to basis) | a relabel, point to the on-branch at 0% (S); b off-branch reads the qualified share (M) | a, S |

## Medicare, Social Security, survivors, Arizona

| finding | verdict | what the check found | options (scope) | recommended |
|---|---|---|---|---|
| AA1-11 first two IRMAA years | QUALIFIED | the two pre-plan MAGI inputs exist since R35; blank = 0 and the warning isn't shown; 20 CFR 418.1135(a) right; the audit misses the 418.1205 work-stoppage reduction | a show warning + help text (S); b prompt when 65+ and retired in plan years 0–1 (S–M); c model SSA-44 (L) | a+b, S |
| AA1-23 Medicare premiums flat | CONFIRMED | thresholds index, premiums don't; pre-65 cost grows, so real health cost drops at 65; not disclosed in the app | a disclose (S); b grow premiums at the existing health-inflation input (M); c Part D premium input + own rate (L) | b, M |
| AA1-28 Social Security estimate | CONFIRMED, judgment | an SSA statement assumes work to the claim age; no trust-fund scenario; **Q160's "today's dollars" relabel never reached the app** (app-shell.html:290, :364) | a relabel + note (S); b benefit-reduction scenario (M); c earnings-record AIME (L) | a now, b later |
| AA1-19 survivor filing, inherited IRA | QUALIFIED | qualifying-surviving-spouse status needs a dependent child (IRC 2(a)), so it rarely applies; the inherited-IRA election is real (no 10% under 59½ while inherited) | a show warnings (S); b keep the deceased's IRA inherited until the survivor is 59½ (L); c surviving-spouse status + child input (XL) | a+b, L |
| AA1-20 community-property basis | QUALIFIED | depends on property character, not title (A.R.S. 33-431); the audit missed A.R.S. 25-211: the survivor's own community account also gets a full step-up | a disclose both cases (S); b plan-level "Arizona community property" switch (M); c per-account character (L) | b, M |
| AA1-16 Arizona subtractions | CONFIRMED | A.R.S. 43-1022 ¶35 senior subtraction (from 2025, same Ch. 140 the model cites); ¶22(c) 25% gain subtraction for assets bought after 2011; 43-1041(I)(2) charity increase | a senior subtraction (M); b + gain subtraction with an input (L); c + charity input (L) | a now, b later |
| AA1-42 Arizona 2026 Form 140 | CONFIRMED unverified | the statute supports the inferred figures; no 2026 form published yet | a reconcile when published (S) | a |

## Plan structure, spending, debt, defaults

| finding | verdict | what the check found | options (scope) | recommended |
|---|---|---|---|---|
| AA1-33 10% default | CONFIRMED | default 10%, 18.5% volatility, 0 fee, 3.5% inflation, simple mode; presets Standard 10 / Conservative 6 / Aggressive 12; no fee guidance | a relabel + help (S); b lower balanced default, nonzero fee, range note (M); c asset-mix defaults (L) | b, M |
| AA1-07 working-years budget | CONFIRMED | debt payments count only in retired months; the two Q59 warnings never shown; bias runs both ways (unspent wages never saved) | a show warnings (S); b warning-only working-year affordability check (M); c full ledger with a working-years spending input (XL) | a+b, M |
| AA1-37 LTC onset, life ages | QUALIFIED | onset max(65, retire age + 10) weighted by probability, random in Monte Carlo; undisclosed anywhere; the life-age label hides that it ends the projection | a disclose + relabel (S); b onset-age input per person (M); c scenario sets (L) | a+b, M |
| AA1-25 stages and flexibility stacking | CONFIRMED | stages multiply; flexibility can breach the floor; Q64/Q65 still open | a document (S); b warnings, help text, a floor-after-flexibility rule (M); c new combination rule (L) | b, M |
| AA1-34 PMI | CONFIRMED | 12 USC 4901/4902 (78% scheduled, midpoint); FHA excluded and the form offers FHA | a disclose (S); b "PMI ends at age" input with an HPA-midpoint default (M); c full HPA test (L) | a+b, M |
| AA1-44 forced payoff | CONFIRMED | a small positive payment balloons silently | b show the residual lump sum + warning (M) | b, M |
| AA1-35 "optimizer" | CONFIRMED | fixed scores; app already says "planning heuristic" | a rename the controls (S); b a real solver (XL) | a now |
| AA1-09 inert fields | CONFIRMED | expense type and debt owner undisclosed; deductibility and mortgage fields disclosed | a notes on those two controls (S); c itemized deductions (XL) | a, S |
| AA1-10 household income age | QUALIFIED | the control already says "Household (your ages)" and offers Spouse | a help line (S); b calendar end date (L) | a, S |
| AA1-08 insurance in net worth | QUALIFIED, mechanism wrong | counts only from the insured's death age, with net worth on; never deposited; self only | a label as an estate measure + late-start warning (S); b deposit at death (M) | a now, b later |
| AA1-29 vesting, filing defaults | QUALIFIED | default is fully vested; the 6-year schedule is chosen and labelled | a help line (S) | a, S |
| AA1-06 Monte Carlo debt detail | CONFIRMED simplification | debt schedule is not path-dependent; no breakdown shown in any mode | one disclosure line (S) | S |
| AA1-02 account created midyear | QUALIFIED | very narrow; unbiased in expectation; example misattributed | no change | none |

## The owner's decisions (2026-10-03)

Chosen from the options above, via Claude's questions. Every recommended option was taken except the default return, where
the owner chose to relabel only, and two optional larger items the owner added (the Part D premium input, and the Roth basis
and earlier-this-year income inputs).

**R45 (spouse retirement dates), adjusted:**
- Roth conversions get their own **"Conversions start at age"** input, defaulting to the primary's retirement age (today's
  behaviour); conversions leave the household-date list (AA1-40).
- Pre-Medicare health costs get an **"Employer health coverage ends at"** input, defaulting to the household date (AA1-40).
- Rules 2 and 4 stay, with an optional **"Retired spending begins at"** age override (AA1-38, AA1-39).

**Monte Carlo and the reserve:** the full fix: one set of correlated asset-class returns per year shared by all accounts,
shocks keyed to asset class (MC-A, MC-D); impossible correlations refused (MC-C); success relabelled "all modeled spending
funded", with real spending shown (MC-E); the reserve computed once for the household (MC-B).

**Federal tax and accounts:**
- The senior deduction ends after 2028 (AA1-30; this reopens and reverses Q165).
- High earners' catch-up as a designated-Roth portion inside the pre-tax plan, with prior-year wages projected (AA1-13).
- IRC 4973's 6% excise on "warn and permit" IRA/HSA excess (AA1-27).
- SE-funded deferrals out of QBI; half of SE tax out of IRA compensation (AA1-45, AA1-26).
- HSA contributions stop at Medicare entitlement from the claim age, with an override (AA1-32).

**Medicare, survivors, Arizona:**
- Medicare premiums grow at the health-inflation input (AA1-23), plus a user-entered Part D premium and Medicare growth rate.
- The prior-income warning shown and prompted (AA1-11).
- A survivor under 59½ keeps the deceased's IRA as inherited until 59½ (AA1-19).
- A plan-level Arizona community-property switch (AA1-20).
- The Arizona senior subtraction and the 25% post-2011 capital-gain subtraction, with a "share bought after 2011" input
  (AA1-16).

**Spending, debt, defaults, disclosure:**
- Default return: **relabel only** ("historical US stocks, nominal, before fees", with help text); 10% stays (AA1-33).
- A warning-only working-years affordability check, with the two hidden validator warnings (AA1-07).
- A long-term-care onset age per person, disclosed, and the life-age label corrected (AA1-37).
- Spending flexibility never cuts below the floor, defaults to off, and stacked stages warn (AA1-25).
- A "PMI ends at age" input with a legal-midpoint default; the residual shown beside a forced payoff date (AA1-34, AA1-44).
- Hidden engine warnings shown as cards, and the validator run while editing.
- The relabels and notes (Social Security "today's dollars", the optimizer's name, the dividend control, insurance as an
  estate measure, partial years, the 59½ crossing year, long-term gains, the RMD excise, Monte Carlo debt detail).
- A Roth contribution and conversion basis ledger (AA1-36) and an "income received earlier this tax year" input (AA1-31).

**How the work is split:** R45 (spouse dates plus the three new R45 inputs), then themed rounds, each audited by ChatGPT:
Monte Carlo and the reserve; federal tax and accounts; Medicare, survivors and Arizona; spending, debt, defaults and
disclosure. S5AA closes after the last.

**Not chosen, carried as recorded limits:** a full working-years budget, itemized deductions, a tax-optimizing solver, full
Roth five-year clocks, surviving-spouse filing status with a child input, Social Security benefit-cut scenarios, the
SSA-44 IRMAA reduction, tax lots.
