# S5AA R40 — the prediction record, written before the engine is edited

*Written by Claude, 2026-09-30 (local, UTC−7), under amendment A-01 as A-10 (3) applies it from R40 on. It is committed before any
commit that edits `src/engine.js` for these four repairs. The branch's history is the proof of order. The implementation commits
follow it, and the round's handover compares each prediction here with what was measured.*

**The owner's decision (2026-09-30):** "Repair all four now". Claude's R40 work found four undisclosed limits, each of which
understates a cost or a distribution:

1. **LTC.** The long-term-care cost is never inflated.
2. **Part D.** No Part D base premium is charged, only the IRMAA surcharge.
3. **Partial row.** A partial first or last row is taxed with a whole year's deduction and brackets.
4. **Spouse RMD.** A spouse whose birthday falls inside a row has their first RMD year skipped, and is given a divisor a year too young afterwards.

The corpus reach below was read from the plans' **inputs**, with no engine run
(`prediction/S5AA_R40_REACH_SCAN.js`, outputs `prediction/S5AA_R40_REACH_{CONTROL,EXPANDED}.json`). The magnitudes are worked by
hand or by the formulas in `prediction/S5AA_R40_PREDICT_LTC_PARTD.js`, which use only plan inputs
(`prediction/S5AA_R40_PREDICTED_LTC_PARTD_{CONTROL,EXPANDED}.json`). Each script reproduces its stored output.

## 1. The LTC cost is inflated at the health-inflation rate

**Mechanism, as it will be built.** The care cost is inflated at `advanced.healthInflation` from the plan's start, the same way
the pre-Medicare health cost is: `cost × (1 + healthInflation)^(rowOpening − start)`. The insurance benefit stays at its entered
amount, since a policy's benefit is a contract figure that does not rise without an inflation rider, which the plan does not
model. The engine's own timing is unchanged: in a deterministic run the event starts at `max(65, round(retireAge + 10))` and is
weighted by its probability.

**Reach.** In the control corpus: `seed:1`, `seed:3`, `seed:6` and `seed:16`. The expanded corpus has the same four.

**Predicted.** Row `spending` (the requested total, which includes the LTC cost) rises in each care row by exactly
`cost × ((1 + hi)^(open − start) − 1) × overlap × probability`:

| member | method, strategy | care rows | added to `spending`, all rows |
|---|---|---|---|
| `seed:1` | simple, fixedNominal | 65 to 69 | **+101,987.33** (first row +21,598.09) |
| `seed:3` | historical, floorCeiling | 69 to 75 | **+761,321.21** (first +95,222.06) |
| `seed:6` | simple, fixedReal | 65 to 70 | **+420,522.21** (first +69,972.08) |
| `seed:16` | simple, fixedNominal | 67 to 68 | **+66,692.08** |

- **Exact where the strategy does not react.** A fixed-nominal or fixed-real strategy does not react to the portfolio, so for
  `seed:1`, `seed:6` and `seed:16` the spending increase should be exact, row by row.
- **`seed:3` only as a first-order figure.** Its floor-and-ceiling strategy spends from the portfolio, which the added cost lowers.
- **Everything else follows the extra cost.** Withdrawals and taxes rise, totals and net worth fall, by at least the added cost in
  each care row and by that shortfall grown afterwards. A first-failure age can come earlier.
- **Must not move.** Every member without `ltcOn`, and every row before a member's care starts.

## 2. The Part D base premium

**Mechanism.** Each person the engine charges Medicare for is also charged the 2026 Part D base beneficiary premium, **$38.99 a
month**. The source is CMS, "Annual Release of Part D National Average Monthly Bid Amount and Other Part C & D Bid Information",
July 28, 2025, read in the document: "the Part D base beneficiary premium is $38.99". It is the statutory base that plan premiums
are set around (42 CFR 423.286(c)), used here as the proxy for a Part D premium. Like the other Medicare premiums it stays at 2026's
(`MODEL_ASSUMPTIONS.md`, the Medicare line in the later-years section). The IRMAA surcharge is unchanged.

**Reach.** In the control corpus: `seed:10` and `seed:16`. The expanded corpus adds `expansion:s5aa-r6-gap-survivor-health-roth`.

**Predicted.** Row `spending` rises by `467.88 × people65 × retiredDuration` in each retired row with health costs on:

| member | added to `spending`, all rows |
|---|---|
| `seed:10` (historical, constantPercent) | **+10,293.36** (+467.88 a row, one person) |
| `seed:16` | **+14,036.40** |
| `expansion:s5aa-r6-gap-survivor-health-roth` | **+6,082.44** |

- **Where `seed:10` may differ.** Its constant-percent strategy spends a share of the portfolio, so its base spending may itself
  fall a little after the first year. The premium part is exact.
- **Must not move.** Any member without `healthOn`, and any row with no one on Medicare.

## 3. A partial row takes its share of each annual tax amount

**Mechanism.** A row shorter than a year, the first row of a plan opening at a fractional age or the last row of one ending at a
fractional age, is taxed as its share `s` of a tax year whose income runs at the row's rate. Each annual dollar amount of the tax
rules is multiplied by `s`: the standard and additional deductions, the senior deduction and its phase-out start, the ordinary and
capital-gains brackets, the Social Security taxation bases, the NIIT and Additional Medicare thresholds, the OASDI wage base, the
SALT cap, floor and phase-out, the self-employment $400 floor, Arizona's deduction and age-65 exemption, and the $3,000 capital-loss
limit. Each tax schedule is linear between its thresholds, so this equals `s ×` the whole-year tax on the income annualized by `1/s`.

This is the owner's rule for a partial row elsewhere:
- R39: a partial row gets its share of each contribution limit, because "the plan does not know what was deposited before it
  opened";
- R35: IRMAA completes a partial first year at "the first row's own annual rate".

Contribution limits and IRMAA thresholds are not scaled again. A row cut at the last death opens on a birthday, so it is never
partial, and a final return keeps its whole-year deduction.

**Reach.**
- **Control corpus:** the four golden plans that open at 29.5 — `golden:baseline`, `golden:monte-carlo-fixed-seed`,
  `golden:reserve-and-bond-tent` and `golden:guardrails-withdrawal-strategy`.
- **Expanded corpus:** the same four, plus `expansion:monte-carlo-sensitive-band`.
- **Last rows:** no member ends at a fractional age.

**Predicted, by hand, for the three deterministic golden plans.** The first row, 29.5 to 30, is half a year, `s = 0.5`. The
pre-repair row is filing jointly with no spouse (the tests' `TEST_FILING`), with wages $72,500 and AGI $66,981.26. Its measured
taxes of $9,855.78 break down as follows:
- **FICA:** 7.65% × $72,500 = $5,546.25;
- **Arizona:** 2.5% × ($66,981.26 − $32,200) = $869.53;
- **Federal:** $3,440.00.

$3,440.00 is the tax on $32,800 of ordinary taxable income (the wage-only AGI of $65,000 less $32,200), so the remaining $1,981.26
of AGI is preferential and sits in the 0% band.

With the thresholds halved:

| | before | after |
|---|---|---|
| **Ordinary taxable income** | $32,800 | $48,900 ($65,000 − $16,100) |
| **Tax on ordinary income** | — | 10% × $12,400 + 12% × $36,500 = $5,620.00 |
| **Preferential income** | $1,981.26, all at 0% | stacks from $48,900 to $50,881.26 against a 0% band ending at $49,450: $550 at 0%, $1,431.26 at 15% = $214.69 |
| **Federal tax** | $3,440.00 | $5,834.69 (**+$2,394.69**) |
| **Arizona tax** | $869.53 | 2.5% × $50,881.26 = $1,272.03 (**+$402.50**) |
| **FICA** | unchanged (the halved wage base, $92,250, is above the wages) | unchanged |

- **Row taxes rise by about $2,797.19**, to about **$12,652.97**. AGI does not move.
- **Most of that increase is paid by the wages, not the portfolio.** Wages pay their own wage-only tax (the Q59 baseline), and
  that tax is figured under the same halved thresholds.
  - Its federal part goes from $3,440.00 to $5,620.00.
  - Its Arizona part goes from $820.00 to $1,222.50.
- **What falls on the portfolio** is the tax on the dividends above that baseline. It rises from $0 to **$214.69**; Arizona's share
  stays $49.53.
- **Predicted effect on balances.** Row-1 totals about $214.69 lower. Every later row lower by that amount grown at the plan's
  return, with second-order changes in dividends and taxes. Nothing else changes in rows 2 onward.
- **The two Monte Carlo members** (`golden:monte-carlo-fixed-seed`, `expansion:monte-carlo-sensitive-band`) move the same way on
  each path. A success rate may change by a path or two. The sensitive-band member is chosen by its declared rule and may need to
  be re-chosen.
- **Must not move.** Every member that opens on a whole age, the first-row AGI, and every row after the first except through
  balances.

## 4. A spouse's RMD reads the age reached in the row

**Mechanism.** Rows follow the self's birthdays, and an owner's RMD start and Uniform Lifetime divisor were read at the row's
opening. A spouse whose birthday falls inside a row therefore skips the RMD for the year they reach 73 (or 75), since nothing
doubles up the next year. After that the spouse is given the divisor for the age a year younger than the one they reach that
year. The table is read at the age reached by the birthday in the distribution year.

Both the start and the divisor, and the other spouse's age in the Joint and Last Survivor table, will read the age reached within
the row: `floor(ageAtClose − ε)`, and the start when that age reaches the start age. For the self, whose birthdays fall on row
boundaries, this is today's figure.

**Reach.** **No member of either corpus**: no couple with RMDs on has a fractional age gap (the reach scan). **Predicted: no
corpus or control movement at all.** The repair is shown by its witnesses only. For a couple aged 72 (self) and 72.5 (spouse),
with the spouse's IRA at $100,000 and no return:
- the row closing at 73: 100,000 / 26.5 = **3,773.58** (was 0);
- the row closing at 74: 96,226.42 / 25.5 = **3,773.59**;
- the row closing at 75: 92,452.83 / 24.6 = **3,758.25**.

**Must not move.** Every self-owned RMD, and every couple whose ages differ by whole years.

## What no repair may move

Any member none of the four reaches. Control test 4.7's 51 existing declarations stay as they are. Any control difference not
named here is a finding.
