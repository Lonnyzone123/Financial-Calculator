# S5AA R34 — self-audit

*Claude's check of the round before it goes to ChatGPT, 2026-09-29 (local, UTC−7), at `7b61b88`.*

## 1. What was checked, and how

**Every rule, read at its primary source:**
- SSA, Normal Retirement Age (ssa.gov/oact/progdata/nra.html), and 20 CFR 404.409 (survivor full retirement age);
- 20 CFR 404.212(c), 404.271, 404.275(c), 404.304(f) (the PIA, COLAs and rounding);
- 20 CFR 404.313, 404.330, 404.333, 404.335, 404.338, 404.410, 404.429, 404.435;
- 42 USC 402(a), 402(e)(1), 402(r); SS Act 211(a)(12);
- POMS RS 00615.301 and RS 00615.320 (the original benefit and the widow(er)'s limit).

**Each finding reproduced on R33's engine.** Each new R34 test fails there with the audit's figure, and the reference below
differs from R33 in 24 of its 25 cases.

**An independent reference, run against both engines.** `S5AA_R34_SELF_AUDIT_SS_REFERENCE.js` re-derives all 25 Social Security
cases of the R32F audit, with the repros' own inputs, from `tests/lib/ssa-reference.js`, which does not import the engine:
**0 mismatches at `7b61b88`; 24 of 25 at R33.**

**Every moved control plan was traced before it was declared**, R33's engine against R34's, first moved row by first moved row:
each seed's entered `ssFra` against its birth year, each historical plan's COLA chain, and seed:11's fifteen historical COLAs by
an independent chain, matched to the dollar. The moved expansion members were traced the same way (handover §5).

**The Monte Carlo band member** was re-chosen by its declared rule, and the move was attributed: at step 24 with the COLA set to
0, R33 and R34 both give 84.8%; with it as entered, R33 84.8% and R34 86.6%. The whole move is SA32F-04.

## 2. What the checks caught

- **My R32F repros read every full retirement age as the entered 67, and did not round.** Six of their "law" figures were
  therefore not the law: SOCSEC-03 A/B (a 67-year-old was born 1959, 66y10m), SOCSEC-05 A/B and LIFE-C (the dollar round-down),
  SOCSEC-08's second case and LIFE-D (**a 70-year-old was born 1956, 66y4m: 44 months of credit, not 36** — an error in the R32F
  record itself), and LIFE-E (a 1958 birth's survivor full retirement age is 66y4m). SOCSEC-03 C1/C2 entered the spouse's benefit
  as an own PIA, which the engine now reads as one. The reference in §1 states the law for each.
- **The survivor disclosure had become false.** It still said the early-claim cap was "NOT applied" and that survivor full
  retirement age was approximated. Both are built now; the text, `capApplied` and the rules package's note are corrected.
- **The form's full-retirement-age field decided nothing.** It is now read-only and shows the birth-year figure.
- **A re-fixtured public-route test read engine internals** (`public-route-fm01` read the history tables for the calendar's COLA),
  which made FM-01 coupled-only and the closeout refused it. It now measures that COLA through `runPlan()` alone; the closeout
  accepts 12, refuses 0.
- **Finding IDs in the re-fixtures** first cited SA32F-04 for the survivor items; corrected to SA32F-01 and -02 before commit.
- **Gate failures traced to test premises, not code**, each re-fixtured by intent with the reason in the test: the claim-factor unit tests (exact fractions and rounding; the "FRA 100" case), the FM-01 and Q16 calendar tests (the
  zero-benefit partner now draws the spouse's benefit, so it files at 70 there), and the survivor files (the spouse's benefit,
  birth-year ages, rounding, and the inverted "no posthumous claim" premise).

## 3. What remains

The handover's §6 known limits, and three points for the owner:
- the today's-dollar reading (decision 3) makes a young household's nominal benefit at the claim large — golden:baseline ×2.78 —
  and in historical mode it takes the history's own COLAs;
- the R32F repros' hand figures in the SOCSEC and LIFE folders stay as published (they are a record); §2 lists which of them the
  law as built replaces;
- r17 still cannot be diffed directly, and the expanded corpus's input hash changed again (the band member, handover §5).
