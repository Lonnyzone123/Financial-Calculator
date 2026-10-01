# S5AA R43 — prediction record, part 1: Social Security

*Written by Claude on 2026-10-01 (Arizona, UTC−7). Committed before the engine is edited, as amendment A-01 requires. Base:
`sprint/s5aa-r43` at `6a724fe`: `main` at `7d5340d` plus R42's one-time Roth repair (SA42F-16), carried from the local
commits `b32497d` and `4ab0e3f` as `63332a8` and `6a724fe`. Gate at `6a724fe`: 3,171 tests, 0 failing, 9 todo; closeout 12/0/0.*

## The round

ChatGPT's R42 change audit (PR #44) determined NO-GO on R42-01 and R42-02. Claude's R42F full-model audit (PR #45) reported
34 findings, SA42F-01 to -34. The owner decided on 2026-09-30:
- **R42-01:** repair.
- **R42-02:** accept as a disclosed miss. The R42 prediction stands as written, together with its actual comparison
  (SA42-06).
- **R42F:** "Finish R42F first, one bigger round". Then: **repair all 34**, building now while ChatGPT reviews R42F. A
  finding that ChatGPT's review refutes is dropped before the pull request.
- **Three declared items change** (R42F §4):
  - the spousal IRA follows IRC 219(c)(2), so the higher earner is limited to their own pay;
  - HSA contributions stop at 65;
  - a survivor's spending and health costs start at the death, unless the surviving spouse still has a salary.
- **Three choices on how findings are repaired:**
  - SA42F-20: a stage's or stream's amount is in today's dollars in every growth mode;
  - SA42F-11: each person 65 or over is charged Medicare;
  - the survivor-cost rule above, including its salary exception.

The round is built in parts. Each part's prediction is committed before that part's engine edits. This is part 1.

## Part 1: the repairs, as they will be built

- **SA42F-02.** The PIA at an age takes `floor(age − anchor)` COLAs from its anchor (the plan's start, or a claim made
  before it, or 62 on the AIME path), whatever the claim date. The claim no longer splits the count. A claim inside a
  row is still priced at the claim (R39).
- **SA42F-17.** On the AIME path, the wage-index exponent is `62 − floor(age)` with no floor at zero. Someone already past
  62 gets the bend points of the year they turned 62, and their AIME is indexed back alike (R36's own rule). The COLAs from
  62 follow as before.
- **SA42F-27.** The AIME switch's label stops saying "2026 bend points".
- **R42-01 and SA42F-18, one repair.** Each row's earnings-test withholding is still computed as before:
  - each person's excess, the family pool and the grace-year cap are unchanged;
  - so is the order: the worker's excess against the total family benefit first, then the auxiliary's own excess against
    what is left (POMS RS 02501.095 B.4).

  What changes is **which months are charged**:
  - the excess is charged month by month, in order, to the benefit actually payable in each month, using the row's
    existing claim, death and survivor segments, and only in service months in a grace year;
  - a month with a full or partial deduction counts once (RS 00615.482);
  - in a family test, the auxiliary's share is what the months charged took of it.

  Each benefit is credited for its own months (20 CFR 404.412):
  - a charged month credits the person's **own retirement benefit** if it is entitled in that month;
  - it credits their **survivor benefit** if that is entitled;
  - a dual entitlement credits both.

  The survivor benefit's reduction is adjusted for its months at the survivor's full retirement age, as the retirement
  benefit's already is. The spousal factor's adjustment stays not modelled and disclosed, as in R42.

  **Where each person's monthly pay is constant over the months charged, the arithmetic is kept exactly as it was.**

## Predictions

### 1. No corpus plan moves

`audit/S5AA/R43/prediction/ss_corpus_scan.js`, run on `6a724fe` (output: `prediction/ss_corpus_scan_at_6a724fe.txt`), tests
each repair's condition row by row with the engine's own exported helpers.

**Its positive control flags all four witnesses and none of their four controls:**
- SA42F-02, rows 69 to 71;
- SA42F-17;
- R42-01, both witnesses, row 63;
- SA42F-18, rows 61 to 63.

**In the corpus it flags one plan, in both corpora: `seed:20`.** Row 67 has both people withheld while the spouse is paid a
spousal part on the self's record. It does not move:
- **Self (the worker):** no claim, death or survivor start falls inside the row (both claims are at row openings, and
  the spousal start is the spouse's claim at self 66). So the family pool is paid at one rate all row. The ordered count
  equals the average count, 4 months, and the auxiliary's share equals the proportional share.
- **Spouse:** credited 12 months before. That needs the remainder withheld, t, to exceed 11/12 of the spouse's gross. In
  order, the 12th month is reached when t exceeds the first eleven months' remaining pay. That is the gross, less the
  spousal part already taken, less the untouched twelfth month (gross/12): 11/12 of the gross less the part taken, which
  is no more than 11/12 of the gross, and t exceeds that. So it is still 12.
- **The annual withholding is computed as before**, and the constant-rate arithmetic is kept, so no last-bit difference
  arises.

So:
- **control 4.7:** zero unpredicted, and no declaration added;
- **expanded capture:** equal to r21 (`tools/baseline-20260930-s5aa-expanded-r21.json`) in all 71 entry hashes.

**The scan's limits:**
- it passes `startHistory` 0, so a historical COLA is not modelled, and 16 control plans and 17 expanded plans are
  historical. The SA42F-02 count is a property of the ages, not the rates, but the AIME and earnings-test conditions read
  benefits at the assumed COLA;
- a flagged condition is necessary, not sufficient.

### 2. The witnesses, hand-derived from the rules and the inputs

Every witness uses zero return, inflation and spending. Rows are labelled by their closing age. The tests are in
`tests/audit-s5aa-r43-social-security.test.js`. Each defect test was run on `6a724fe` and fails at the figure shown as
"today", and each control passes.

| | witness | today | predicted |
|---|---|---|---|
| SA42F-02 | single, 62, $2,000 today's dollars, claim 67.5, COLA 2.8% | row 69 $28,644 | **$29,448:** the PIA after six dime-rounded 2.8% COLAs, × 1.04 (six delayed months), to the dollar, × 12. Rows 68, 70 and 71 likewise (five, seven and eight COLAs) |
| SA42F-02 control | claim 68 | — | unchanged |
| SA42F-02, spousal and survivor | same-age couple, spouse no PIA, spousal claim 67, the worker dies at 70, survivor on | row 69 $42,408 | **$43,608** (the worker's benefit plus half the PIA after six COLAs). Rows 71 and 72: the deceased's PIA after eight and nine COLAs with the delayed credits |
| SA42F-17 | single, 65, AIME $6,000, salary growth 3%, claim 67, COLA 0 | row 68 $31,980 | **$29,268:** bend points and AIME × 1.03^−3 (bend points rounded to $1), PIA to the dime, to the dollar, × 12 |
| SA42F-17 controls | 60 and 62 at the start | — | unchanged |
| R42-01 | ChatGPT's: worker 62, PIA $3,000 claimed 62, $45,000 to 63; spouse 67, no PIA, spousal claim 67.5 | row 68 $43,800 | **$43,944:** four $2,100 checks and part of a fifth carry the $10,260 excess, so five months are credited; 55 reduction months give $2,162; plus $1,500. Row 63 stays $68,940 |
| R42-01 control | spousal claim 68 | — | $43,944, unchanged |
| R42-01, a start while the excess is being charged | the same with $60,000 of salary and a spousal claim at 67.25 | row 68 $44,100 | **$44,244:** excess $17,760; three $2,100 months, then the family's $3,600 a month for three months and part of a fourth, so seven months credited ($2,187); row 63 stays $80,940 |
| SA42F-18 | self 60 (PIA $2,800, claim 62, $100,000 to 63); spouse 62 (PIA $3,000, never claims) dies at 62.5; survivor on | row 68 $27,996 | **$30,132:** the retirement benefit credited its 12 months (62 to 63), $2,100; the survivor benefit credited its 30 months (60.5 to 63), 1 − 0.285 × 48/84 of $3,000 = $2,511; the larger, × 12 |
| SA42F-18 control | no wages | — | $26,472, unchanged |

### 3. The gate and the browser

- **Gate:** passes, with the new tests added; closeout 12/0/0.
- **Browser:** the app's label changes, so the task 6.5 browser check is repeated on the round's final candidate (A-04).
