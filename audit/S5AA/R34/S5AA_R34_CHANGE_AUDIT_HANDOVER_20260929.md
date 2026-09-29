# S5AA R34 — change audit handover: Social Security (11 items from R32F / R32V)

*Written by Claude, 2026-09-29 (local, UTC−7), during the owner's overnight run of R33–R37, for the owner to send to ChatGPT. Every
figure was measured on Windows 11 / Node 24.17.0 at the commits named.*

## 1. What to audit

- **The change:** from `s5aa-r33-source` at `f4e8294` (R33's records at `b5d749c`) to **`s5aa-r34-source`** at **`7b61b88`**.
  R34 is stacked on R33's pull request; the diff to audit is `b5d749c..7b61b88`.
- **One engine commit.** Unlike R33, R34's findings share one code path — `householdSocialSecurityDetail()` and the helpers it
  calls — and they were built together and gated together. Each finding still has its own test file entry and its own tests:

| findings | what changed |
|---|---|
| SA32F-05, -25 | each person's full retirement age comes from their birth year; `retirement.ssFra` decides nothing |
| SA32F-04 | the entered benefit is in today's dollars and takes its COLA to the claim (decision 3) |
| R32V-03 | SSA's rounding: the PIA and each COLA'd PIA to the dime, each monthly benefit to the dollar; the reduction as exact fractions |
| SA32F-03 | the spouse's benefit: own benefit plus the spousal excess, its own reduction, no delayed credits, deemed filing (decision 2) |
| SA32F-01, -02 | the survivor benefit on the deceased's PIA, with delayed credits earned by the death and the widow(er)'s limit, whether or not the deceased had filed (decision 1) |
| SA32F-06 | the earnings test counts net earnings from self-employment |
| SA32F-07 | the grace year: no withholding for the non-service months after the owner stops working |
| SA32F-18 | a Social Security income stream ends at its owner's death |

- **Please number findings R34-NN**, in the usual report-only pull request, on a branch like `audit/chatgpt/r34-7b61b88`.

## 2. The owner's decisions this round implements

- **Of 2026-09-29, in the R32F report's §4:** decision 1, "Pay by law" (the survivor of a worker who never claimed); decision 2,
  "Build it" (the spouse's benefit); decision 3, "Today's dollars" (the entered benefit is today's).
- **For R34–R37, the same night:** "Follow law everywhere": where the law gives a rule, build it rather than disclose a gap, even if
  it needs new inputs.
- **Survivor start:** "Start at 60 or the death": paid from the later of 60 and the death, reduced for that age. The recipient's
  own-claim-age gate (Q3b) is dropped; it amends decision 1's "Q3b stays".

## 3. The rules, as built, with their sources

**Full retirement age** (SA32F-05, -25). SSA, Normal Retirement Age (ssa.gov/oact/progdata/nra.html): 65 through 1937; +2 months a
year to 65 and 10 months for 1942; 66 for 1943–54; +2 months a year from 66 and 2 months for 1955 to 66 and 10 months for 1959; 67
for 1960 and later. A survivor reads the year two later (20 CFR 404.409). The birth year is `2026 − floor(age)`, the reading the RMD
start age already uses; the birth month is not an input. `ssFra` is kept in saved plans but read by nothing, and the form shows the
birth-year figure read-only.

**Today's dollars** (SA32F-04). `ssPiaAt()`: the entered benefit takes every COLA from the plan's start to the claim and after it;
the AIME path takes its COLAs from eligibility at 62 (20 CFR 404.271). A claim before the plan's start is indexed from the claim at
the configured rate, as P1 already did. Historical mode reads the history table's COLA for each projection year and the configured
rate where the table has none (before 1975).

**Rounding** (R32V-03). 20 CFR 404.212(c) and 404.275(c): a PIA and each COLA-increased PIA to the next lower $0.10; 404.304(f):
the monthly benefit, after every reduction, to the next lower $1. The reduction is the regulation's exact fraction (404.410: 5/9 of
1% a month for 36 months, then 5/12 of 1%; 404.313: 2/3 of 1% a month of credit), because the rules package stores the rates as
rounded decimals, which put a whole-dollar benefit a hair below itself and lost the dollar.

**The spouse's benefit** (SA32F-03). 20 CFR 404.330 and 404.333: up to half the worker's PIA, less the recipient's own PIA, paid on
top of the recipient's own benefit; 404.410: reduced 25/36 of 1% a month for 36 months before the recipient's full retirement age
and 5/12 of 1% beyond; no delayed credits. Deemed filing (everyone born January 2, 1954 or later; 42 USC 402(r)): a claim for one is
a claim for both, so the excess starts at the later of the recipient's claim and the worker's. The family maximum is at least 150%
of the worker's PIA, so it cannot bind a worker and a spouse (or a lone survivor); it is stated, not built.

**The survivor benefit** (SA32F-01, -02). 42 USC 402(e)(1) and 20 CFR 404.335 need only that the worker "died fully insured".
The original benefit is the death PIA, or more with the delayed credits earned by the death, up to 70 (POMS RS 00615.301;
404.338; 404.313(e)). It is reduced for the survivor's age when it starts: 71.5% at 60, rising evenly by month to 100% at survivor
full retirement age. If the deceased received a reduced benefit, the result is limited to the larger of that benefit and 82.5% of
the PIA, after the age reduction (POMS RS 00615.320, RIB-LIM). It starts at the later of 60 and the death (the owner's decision).
The survivor disclosure no longer says the limit is not applied: `capApplied` is `true`.

**The earnings test** (SA32F-06, -07). 20 CFR 404.429(a) counts "net earnings from self-employment", and SS Act 211(a)(12) gives
profit × 0.9235. 20 CFR 404.435: no reduction "for any month in which … you had a non-service month in your grace year". The
grace year is the row an owner stops working in (no employment or self-employment stream continuing); withholding is capped at the
benefits for the service months before the stop. Each owner's retirement is a row boundary.

**A Social Security stream at a death** (SA32F-18). 42 USC 402(a): a benefit ends "with the month preceding the month in which he
dies". An other income of type `socialSecurity` now ends at its owner's death, as employment streams already did. A pension
stream's survivor share is R35's.

## 4. Evidence

**New tests** (3 files, 12 tests). Each expectation is worked by hand in the file, and each defect test failed on R33's engine with
the audit's figure:
- `tests/audit-s5aa-r34-fra-by-birth-year.test.js` (3): SA32F-05, -25;
- `tests/audit-s5aa-r34-social-security-core.test.js` (6): SA32F-01 (two), -02, -03, -04, and R32V-03;
- `tests/audit-s5aa-r34-earnings-test-and-streams.test.js` (3): SA32F-06, -07, -18.

**An independent reference for tests:** `tests/lib/ssa-reference.js`, written from the primary texts and never importing the
engine. Every re-fixtured expectation below is worked with it.

**Re-fixtured by intent** (14 test files). Each says why in place:
- **The unit tests of the claim factor** (`rules-derived-functions`, `ssa-benefit-adversarial`, `audit-s5aa-ss-earnings-test`):
  exact fractions and SSA's rounding. The case that entered a full retirement age of 100 to drive the factor below zero now shows
  that the entered figure cannot deepen the 30% reduction.
- **FM-01 and Q16** (`audit-fm01-ss-calendar`, `public-route-fm01`, `public-route-p1-q16`): a partner with no benefit of their own
  now draws the spouse's benefit, so these calendar tests have that partner file at 70, outside the rows tested. The expectations
  carry the holder's birth-year factor and the rounding. `public-route-fm01` measures the calendar's COLA through `runPlan()`
  alone.
- **The survivor files** (`audit-r2-survivor`, `audit-survivor`, `audit-s5aa-survivor-age-60`, `public-route-aud002`,
  `public-route-q92`, `public-route-r2-003`, `public-route-r2-004`):
  - the spouse's benefit while both are alive;
  - the birth-year full retirement ages, and survivor full retirement age two birth years on;
  - the rounding.
  - **Q3a and R2-003(b)'s "no posthumous claim" premise is inverted, with its probes kept.** A worker who dies before filing leaves
    a survivor benefit on the PIA, with the credits earned by the death (SA32F-02).
- **`monte-carlo-sensitive-band`:** the declared step moves to 26 (below).
- **Golden fixtures:** regenerated after the review in §5.

**Gate at `7b61b88`.** GATE PASSED: 3,010 tests, 3,001 passing, 0 failing, 9 authorised todo.

**Closeout:** accepted 12, refused 0 (the same as R33).

**The R32F repros, and a reference that re-derives them.** `audit/S5AA/R34/S5AA_R34_SELF_AUDIT_SS_REFERENCE.js` runs all 25
Social Security cases of the R32F audit through the published builders, with the repros' own inputs:
- SOCSEC-01 to -08;
- LIFE-01/02 A to E;
- LIFE-05.

It compares each with the law as built, worked from `tests/lib/ssa-reference.js`. **0 mismatches at `7b61b88`; 24 of 25 at R33.**

The R32F repros' own "hand" figures read every full retirement age as the entered 67 and did not round. Where those figures differ
from the law, the reference says so case by case. One of them is **an error in the R32F record:** SOCSEC-08's second case and
LIFE-D gave a 70-year-old 36 months of credit, but a 1956 birth has 44.

**Your external repros at `7b61b88`:**

| repro | result |
|---|---|
| R29 | 3 mismatches, the same as at R33: the basis plan (SA32F-11, AGI 199,000, net worth 181,987) |
| R30 | 0 |
| R30A | 2 mismatches, the same basis plan |
| R31 | every plan passes |
| R32 | 266 runs, 0 mismatches |
| R32V | stops at its line 50 |

- **Why R32V stops at line 50:** it asserts that the engine's R32V-02 carryover equals the old R32F reference's. Since R33 fixed
  SA32F-34, the engine gives the correct 8,150 and the old reference 10,000, so the assertion has failed since R33.
- **Read past that line** (in a local copy, not committed), R32V-03's two witnesses give 31,728 where they expect 31,317.60 and
  31,308.
  - The witness is 67 and claims at 67 with `ssFra` 67.
  - Born 1959, the full retirement age is 66 and 10 months, so the claim earns 2 months of credit.
  - floor(2,609.80 × 1.013333) = 2,644 a month, which is 31,728: the PIA rounding the witness asks for, and then the birth-year
    factor.

**The survivor disclosure.** It said the widow(er)'s limit was "NOT applied", and that survivor full retirement age was approximated
by the retirement figure. Both are built now. The message, `state.capApplied` (now `true`), `notModelled`, and the rules package's
note on the survivor record are all corrected.

**The form.** The full-retirement-age field is read-only and shows the birth-year figure. The form no longer writes `ssFra`.

## 5. What moved

**The control (4.7).** 22 plans moved. Every one was traced, R33's engine against R34's, before it was declared in one entry that
names each mechanism:

- **SA32F-04, today's dollars.**
  - golden:baseline is 29.5 and claims at 67. It is paid 99,972 at 68, where it was paid 36,000: 37.5 years of 2.8% on the PIA,
    each step to the dime.
  - targeted:historical-1929 and -1966 take two 2.8% fallback steps (the history table has no COLA before 1975): a PIA of 2,113.50,
    paid as 25,356.
  - targeted:historical-2000 takes 2000's 3.5% and 2001's 2.6%: 2,123.80, paid as 25,476.
  - seed:11's history opens in 1976. Fifteen historical COLAs take 2,258.30 to 5,438.20, paid as 48,936 at 0.75. An independent
    chain matched it to the dollar.
  - golden:rmd-and-roth-conversion claimed before the plan opened. It is indexed from the claim as before, now rounded, and has 4
    months of credit for a 1958 birth: +984.
- **SA32F-05, -25, full retirement age by birth year.**
  - Seeds 4, 5, 6, 10, 16 and 17 carry a jittered `ssFra` of 66, which R33 read for both people. The birth year gives 67 (66y10m for
    seed:4's self), so their factors fall. For example: 0.8667 to 0.80, 1.24 to 1.16, 1.08 to 1.00.
  - seed:5 loses one year of benefit, because its 66–67 row is now before full retirement age and the earnings test still
    withholds.
  - seed:10 is the AIME path: a PIA of 1,571.60 with one COLA from 62, at 0.75.
  - targeted:historical-spouse-ss and spouse-cola-income: the spouse, 67 and born 1959, gets 2 months of credit (1,824 a month).
    Both PIAs take 2020's 1.3% and 2021's 5.9%: 54,360 at 68, hand-matched.
- **SA32F-03, the spouse's benefit.** Seeds 6, 14, 18 and 20 have a lower-earning or zero-benefit spouse, who now draws the
  spouse's benefit once both have filed.
- **R32V-03, rounding,** in every moved plan.

**The expanded corpus at `7b61b88`:**
- 70 entries, qualified boundary (every input is the commit's bytes); the invariant passes all 7 checks.
- Output hash `7f96c731de492576b1ef1906d87910589723764f9f1564f834e90222fc9253dd`.
- **The input hash changed again,** to `a56770eacd67f906f85e2bbf8fe5e8f5548702ea441d3ee06f622fbc14ee3425`. The one member whose input changed is `expansion:monte-carlo-sensitive-band`.
  - The today's-dollar COLA lifted its declared step 24 to 86.6%, above the band. Re-applied, the rule declared before measuring
    picks step 26 (spending ×2.30), at 84.8%.
  - At half, full and one-and-a-half times the golden volatility, step 26 gives 100%, 84.8% and 55.6%.
  - **Attributed:** at step 24 with the COLA set to 0, R33 and R34 both give 84.8%. The whole move is SA32F-04.
  - Recorded as family version 4. Its fingerprint is re-pinned, that member only.
- **Against R33, both captured over today's inputs, 31 members moved.** These are the headline figures:

| member | fields | lifetime tax | ending net worth |
|---|---:|---:|---:|
| golden:baseline | 397 | −328,600.75 | +13,943,686.45 |
| golden:monte-carlo-fixed-seed | 479 | −40,051.12 | +14,774,924.04 |
| golden:rmd-and-roth-conversion | 442 | +7,565.83 | +152,025.43 |
| golden:reserve-and-bond-tent | 462 | −325,015.29 | +13,916,163.02 |
| golden:guardrails-withdrawal-strategy | 430 | −649,871.65 | +15,469,366.95 |
| seed:1 | 45 | −5,290.87 | +30,973.72 |
| seed:2 | 235 | +7,666.81 | +5,364.80 |
| seed:4 | 256 | +14,736.56 | +66,322.42 |
| seed:5 | 280 | +308,523.09 | +1,122,100.77 |
| seed:6 | 93 | +4,509.98 | +16,776.74 |
| seed:10 | 257 | −679.56 | −5,181.13 |
| seed:11 | 253 | −83,320.88 | +854,265.98 |
| seed:14 | 90 | 0.00 | +140,421.21 |
| seed:16 | 131 | +9,542.80 | 0.00 |
| seed:17 | 167 | +41,698.85 | +58,878.48 |
| seed:18 | 165 | +22,439.75 | +502,990.36 |
| seed:20 | 343 | +3,461.52 | +417,604.43 |
| targeted:historical-spouse-ss | 167 | 0.00 | +38,949.54 |
| targeted:spouse-cola-income | 199 | 0.00 | +55,528.50 |
| targeted:historical-1929 | 317 | −1,256.38 | +161,211.62 |
| targeted:historical-1966 | 331 | +20,631.73 | +193,180.87 |
| targeted:historical-2000 | 335 | −1,802.39 | +195,735.09 |
| expansion:other-asset-draw-historical | 46 | 0.00 | +3,303.62 |
| expansion:other-asset-two-assets-late-access | 43 | 0.00 | +2,846.23 |
| expansion:monte-carlo-sensitive-band | 474 | −218,502.06 | +12,700,636.94 |
| expansion:s5aa-gap-retired-couple | 113 | +193,683.41 | +1,103,049.43 |
| expansion:s5aa-gap-widowed-before-fra | 238 | +70,897.94 | +517,974.94 |

- **With no headline movement:** targeted:survivor-stateful, expansion:other-asset-draw-growth-0, expansion:other-asset-draw-growth-4, expansion:s5aa-r20-rule55-ira-ranking.

- **targeted:survivor-stateful and expansion:s5aa-r20-rule55-ira-ranking** change only the survivor disclosure: its text,
  `capApplied` and `notModelled` (3 fields each).
- **The four `expansion:other-asset-draw-*` members** share one household. Its 60-year-old's 1,500 takes seven 2.8% COLAs to the
  claim at 67: 1,819 a month (SA32F-04).
- **expansion:s5aa-gap-widowed-before-fra** is SA32F-01. The spouse claimed at 66, a year before full retirement age 67, and dies
  at 68. The survivor, widowed at 64, is now paid the PIA × the survivor's age factor (0.8779): 37,108 a month. R33 paid the deceased's reduced
  benefit × that factor, 34,634. The widow(er)'s limit (the larger of 39,453 and 82.5% of the PIA) does not bind. The rows before
  the death move only by the dollar round-down (37,333.33 to 37,333).
- **expansion:s5aa-gap-retired-couple** holds $42,000 and $18,000 monthly benefits, built for its RMD and QCD rows. Its first row
  gains 146,889, from three changes:
  - the self, born 1948 (full retirement age 66), now has 12 months of credit on a claim at 67, where the entered 67 gave none;
  - the spouse, born 1955, is 14 months early against 66 and 2 months;
  - the spouse now draws the excess on the self's record.

## 6. Known limits

- The birth year is read from the whole age in 2026; a birth in January or February against one late in the year is not
  distinguished, and SSA's "born on January 1" rule (the prior year's table) is not applied.
- The earnings test is still annual and prorated to the row, as Q91 stated; only the grace year's service months are new.
- The survivor reduction is the rules package's reading of SSA's published figures (71.5% at 60, 100% at survivor full retirement
  age, evenly by month), checked against SSA's three published checkpoints, as Q92 recorded; R34 changes only the full retirement
  age it runs to.
- Children's, disability and remarriage rules are not modelled, and the survivor disclosure says so.
- The today's-dollar reading is the owner's decision 3. For a young household it makes the nominal benefit at the claim large
  (golden:baseline, 29.5: ×2.78 by 67), and in historical mode the pre-claim COLAs are the history's own (seed:11, from 1976:
  ×2.41). That is what "today's dollars" means when spending is inflated the same way.

## 7. Where I would look first

1. The spouse's benefit when the worker files after the recipient (deemed filing), across a partial row.
2. The widow(er)'s limit when the deceased claimed early and died before full retirement age.
3. The grace year for an owner whose salary stops but whose self-employment stream continues.
