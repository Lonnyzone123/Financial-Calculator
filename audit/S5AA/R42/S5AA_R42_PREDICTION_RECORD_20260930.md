# S5AA R42 — prediction record: R41F-01 to R41F-05

*Written by Claude on 2026-09-30 (Arizona, UTC−7). Committed before the engine or validator is edited, as amendment A-01
requires. Base: `main` at `02e6715`, whose `src/`, `tests/`, `tools/` and built app are those of `s5aa-r41-source`
(`984197c`).*

## The decision

ChatGPT's R41F whole-model audit (PR #42) found five defects at `984197c` and determined NO-GO. Claude reproduced all
five exactly with its script, and checked the two Social Security premises at the source:
- POMS RS 02501.095: "Withhold the excess earnings of the NH from the total family benefit"; the only exception is an
  entitled divorced spouse.
- RS 00615.320: the widow(er)'s limit uses the reduced benefit the worker "would have been entitled [to] if they had
  lived", with the adjustment for months withheld applied for the months the worker was alive (also RS 00615.598).

The owner decided on 2026-09-30: **"Repair all five in R42"**.

## The repairs, as they will be built

- **R41F-05.** `retirement.ssBenefit` and `retirement.spouseSS`, when present, must be finite numbers:
  - the validator reports `WRONG_TYPE`, so Restore backup refuses the backup;
  - the engine joins them to the plan fields refused as `SCENARIO_NONNUMBER_PLAN_VALUE`, and the R25 parity test holds;
  - an absent field is unchanged.
- **R41F-03.** An IRA owner's contribution window is the longer of the owner's own work and, on a joint return, the
  spouse's work, each bounded by the owner's stop age and life, as Q162 5c decided. Until now the spouse's work counted
  only when the owner did not work at all.
- **R41F-04.** The Roth IRA limit's declared salary-only MAGI proxy reads each salary at its share actually worked in
  the row. The salary-only proxy itself is unchanged and stays disclosed.
- **R41F-01.**
  - A worker's earnings-test excess is charged against the worker's own benefit **and** the spousal benefit paid on
    the worker's record, as one pool, with the grace-year cap applied to the family's service months.
  - The spouse's own earnings test then applies to what is left of the spouse's benefit.
  - The worker's credited months are counted as before. The spouse's own-benefit months are untouched, because only the
    spousal part is withheld.
  - **Disclosed limit:** the adjustment of the spousal reduction factor for spousal months withheld before the spouse's
    full retirement age is not modelled. In the witness the spouse is past full retirement age.
- **R41F-02.** A survivor's 82.5% limit reads the deceased's reduced benefit **with the deceased's credited months**,
  effective from the month the deceased reached, or would have reached, full retirement age. The months are counted
  only while the deceased was alive.

## Predictions

### 1. No corpus plan moves

`audit/S5AA/R42/prediction/r41f_corpus_scan.js`, run on `02e6715`, tests each repair's condition row by row with the
engine's own exported helpers. It found **no plan** in the control (36) or the expanded (71) corpus meeting any of the
five conditions. Its **positive control flags all five of ChatGPT's witnesses**: R41F-03 at row 46 (window 0.5 → 1.0),
R41F-04 at row 45 (Roth limit 0 → 7,500), R41F-01 at rows 63 to 67, R41F-02 at rows 69 and 70, and R41F-05.

So:
- **control 4.7:** zero unpredicted, and no declaration added;
- **expanded capture:** equal to r20 (`tools/baseline-20260930-s5aa-expanded-r20.json`) in all 71 entry hashes;
- **no new baseline.**

The scan's limits:
- it passes `startHistory` 0, so a historical COLA is not modelled; no flagged plan is historical;
- three corpus plans (`seed:10`, `-12`, `-15`) carry employment streams, which it counts as the engine does.

**A correction made before this record.** The first version of the R41F-01 condition read the household's total
withholding, and named `seed:20` (rows 68 and 69). There the self is past full retirement age, so the withholding is
the spouse's own. Tested alone, and requiring that the spouse's own test has not already withheld the whole spousal
benefit, it names none. The corrected condition still flags the witness.

### 2. The witnesses, hand-derived from the rules and the inputs

Every witness uses zero return, inflation, spending and COLA. Rows are labelled by their closing age.

| | witness (ChatGPT's inputs) | today | predicted after the repair, and why |
|---|---|---|---|
| R41F-01 | worker 62, PIA $3,000 claimed at 62, salary $200,000 to 67; spouse 67, no own PIA, spousal claim at 67 | row 63 income $218,000 | **$200,000** in rows 63 to 67:<br>- the worker's reduced benefit is 70% of $3,000 = $2,100 a month, $25,200 a year;<br>- the spousal benefit is 50% = $1,500 a month, $18,000 a year (the spouse, born 1959, is past full retirement age);<br>- the excess is (200,000 − 24,480) / 2 = $87,760, more than the family's $43,200, so all of it is withheld |
| R41F-02 | the same plan; the worker dies at 67.5; survivor on | row 69 $29,700 (82.5% × $3,000 × 12) | **$36,000** in rows 69 and 70, and row 68 **$45,000** (was $41,850):<br>- all 60 early months were withheld, so the adjusted factor is 1 at 67;<br>- the limit is therefore the greater of $3,000 and $2,475, which is $3,000;<br>- in row 68, $18,000 is the worker's own and $9,000 the spousal part for half a year, then $18,000 of survivor benefit for half a year |
| R41F-02 control | the worker lives (life 120) | row 69 $54,000 | **$54,000**, unchanged |
| R41F-03 | joint; self 45, spouse 44, retire 45.5, stop 55; self salary $10,000, spouse $100,000; self traditional IRA $7,500 | row 46: deposit $3,750, AGI $101,250, taxes $17,548.75 | **deposit $7,500, AGI $97,500, taxes $17,005.00**:<br>- federal: (97,500 − 32,200) = 65,300 taxable; 10% × 24,800 + 12% × 40,500 = $7,340;<br>- Arizona: 2.5% × 65,300 = $1,632.50;<br>- payroll: 7.65% × 105,000 = $8,032.50 |
| R41F-03 controls | both stop halfway; owner and spouse reversed | — | both stop halfway: **$3,750**, unchanged; reversed: **$7,500** |
| R41F-04 | joint; self 44, spouse 45, retire 45.5; self salary $0, spouse $260,000; self Roth IRA $7,500 | row 45: AGI $130,000, Roth $0 | **Roth deposit $7,500**:<br>- the proxy is $260,000 × 0.5 = $130,000, below the $242,000 start of the phaseout;<br>- the self's window is the full row (the self works until 45.5 on a $0 salary), and the joint compensation of $130,000 covers it |
| R41F-04 control | spouse works the full row at $260,000 | — | proxy $260,000, above the $252,000 end of the phaseout: **Roth $0**, unchanged |
| R41F-05 | single, 66 to 68, claim 67, `ssBenefit` `"abc"` | valid, `status` ok, $0 | the validator reports **`WRONG_TYPE` at `retirement.ssBenefit`**, and the engine refuses with **`SCENARIO_NONNUMBER_PLAN_VALUE`**, path `retirement.ssBenefit`. The control, with `ssBenefit` 2500, keeps **$30,000** in row 68 |

### 3. The gate and the browser

- **Gate:** passes, with the new tests added; closeout 12/0/0.
- **Browser:** the app changes, so the task 6.5 browser check is repeated on the final candidate (A-04). It is
  predicted to give the same results as on `984197c`, since no corpus plan moves. The browser corpus has 75 plans; none
  carries a non-number benefit.
