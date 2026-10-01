# S5AA R43 — prediction record, part 2: federal tax and Medicare

*Written by Claude on 2026-10-01 (Arizona, UTC−7). Committed before the part 2 engine edits, as amendment A-01 requires.
Base: `d11017f`, part 1 built and gated (3,182 tests, 0 failing, 9 todo; closeout 12/0/0). The round's decisions are in
part 1.*

## The repairs, as they will be built

- **SA42F-01: the IRC 199A deduction on self-employment profit.**
  - **Qualified business income:** the stream's profit less the deductible half of its SE tax (Reg. 1.199A-3(b)(1)(vi)),
    per owner, summed on a joint return.
  - **The deduction:** the lesser of 20% of qualified business income and 20% of taxable income less net capital gain
    (199A(a)), taken below the line. It does not change AGI, MAGI, the IRMAA or NIIT measures, or Arizona (which starts
    from federal AGI).
  - **Above the threshold:** the threshold is $201,750 (single) or $403,500 (joint) for 2026 (Rev. Proc. 2025-32 §4.26),
    indexed to later years by the plan's inflation. Over it, the wage limit phases in over $75,000 ($150,000 joint)
    (199A(b)(3)(B)). The model's business has no W-2 wages and no qualified property, so the deduction falls in
    proportion to the way through the range and is zero above it.
  - **The minimum (199A(i)):** at least $400 once qualified business income reaches $1,000, indexed from 2027. The
    statute is "the greater of" the computed deduction and $400.
  - **Disclosed assumptions:** the business is not a specified service business, and the owner materially
    participates. SE health insurance and retirement contributions do not reduce qualified business income.
  - **The funding solver** mirrors the deduction in the same commit (ground rule 4).
- **SA42F-08.** Later-year indexing moves each IRA-deduction and Roth phase-out range's start; its end is the indexed start
  plus the 2026 width (219(g)(2)(A)(ii), (7), (8); 408A(c)(3)(A)).
- **SA42F-09.** In the row an owner separates in, under the Rule of 55, the row's pooled retirement draws follow the
  separation. The Rule of 55 test reads them as made at the separation, not at the row's opening (72(t)(2)(A)(v)). A
  dated transfer keeps its own age (R24).
- **SA42F-10.** A lookback return entered as married filing separately is priced on CMS's separate table (42 USC
  1395r(i)(3)(C)(ii)). Each tier amount is reduced by the single threshold. For 2026 that gives: up to $109,000 standard;
  above $109,000 and below $391,000, $649.20 of Part B and $83.30 of Part D; $391,000 or more, the top tier.
- **SA42F-22.** A later year's joint IRMAA thresholds are twice the indexed single thresholds (1395r(i)(3)(C)(i)). The top
  tier keeps its own indexed $750,000.
- **SA42F-23.** A row's age-65 amounts (63(f), 151(d)(5)(C), A.R.S. 43-1023(E)) are read at its **tax year's** close, the
  next whole age from the row's opening, still capped at a death. Only a partial last row changes.

## Predictions

### 1. The corpus

`audit/S5AA/R43/prediction/tax_corpus_scan.js`, run on `d11017f` (output: `prediction/tax_corpus_scan_at_d11017f.txt`). Its
**positive control flags all seven witnesses, and not the Rule of 55 control**.

| repair | control (36) | expanded (71) |
|---|---|---|
| SA42F-01 | none: no corpus plan has a self-employment stream | none |
| SA42F-08 | **`seed:3`** (Roth limits in rows 62 to 66) and **`seed:17`** (rows 61 and 62) | the same two |
| SA42F-09, -10, -22, -23 | none | none |

So:
- **Control 4.7:** `seed:3` and `seed:17` move, and nothing else. Their differences will be declared under those two
  scenarios.
- **Expanded capture:** the same two members move, and the other 69 entry hashes equal r21.
- **Direction:** in both, the narrower range lowers the Roth limit, so the Roth deposit falls and later balances move.

**Limits:**
- `seed:3` is historical. The scan indexes its rules at the plan's assumed inflation, so the rows it names are
  approximate. The plan is named either way.
- The traditional IRA's pre-deduction MAGI is bounded, not computed. No corpus row is flagged on it.
- The solver mirror changes no figure where no self-employment profit exists, and the part 2 code keeps that path's
  arithmetic unchanged.

### 2. The witnesses, hand-derived from the rules and the inputs

The tests are in `tests/audit-s5aa-r43-tax.test.js`. Each defect test was run on `d11017f` and fails at the figure shown as
"today"; the Rule of 55 control and the solver case pass.

| | witness | today | predicted |
|---|---|---|---|
| SA42F-01 | single 50, retired, $80,000 self-employment profit, an IRA | taxes $20,286.44 | **$18,103.67**: QBI $74,348.18; deduction the lesser of $14,869.64 and 20% × $58,248.18 = $11,649.64 |
| SA42F-01, in the range | the same at $280,000 | $93,165.54 | **$86,829.63**: 20% of QBI × (1 − (taxable − 201,750)/75,000) |
| SA42F-01, above it | $400,000 | $141,548.71 | **$141,408.71**: the $400 minimum |
| SA42F-01, the minimum | $1,200 of profit and a $16,500 pension | $358.96 | **$318.96**: QBI $1,115.22; the computed $223.04 is raised to $400 |
| SA42F-01, the solver | $30,000 of profit, $60,000 spending from an IRA | settles | settles: no unverified quote, no shortfall |
| SA42F-08 | an active participant at $156,000, $7,500 IRA, 3% inflation | tax year 2045 $32,844.10 | **$33,731.00**: the range is the indexed start plus $10,000; 2046 likewise |
| SA42F-09 | single 54, Rule of 55, separation 55.5, $40,000 spending from a 401(k) | row 56 $3,209.68 | **$557.14**: no 10% in the separation row |
| SA42F-09 control | separation at 54.5 | — | the 10% in the row closing at 56, unchanged |
| SA42F-10 | couple, self 66, two separate lookback returns at $150,000 | $6,070.48 a year | **$9,540.88**: ($649.20 + $83.30) × 12 + $283 + $38.99 × 12 |
| SA42F-22 | couple both 66, 2.5% inflation, 2027 lookback $223,500 joint | $8,668.16 | **$6,371.36**: the 2027 joint threshold is 2 × 112,000 = 224,000 |
| SA42F-23 | self 89, spouse 63, $120,000 pension, the plan ending at 90.5 | last row $2,657.50 | **$1,840**: the tax year closes with the spouse 65 |

### 3. The gate and the browser

- **Gate:** passes, with the new tests; closeout 12/0/0.
- **Browser:** repeated on the round's final candidate (A-04).
