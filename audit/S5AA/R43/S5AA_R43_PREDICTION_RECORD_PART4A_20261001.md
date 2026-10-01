# S5AA R43 — prediction record, part 4a: life events, required distributions and Medicare

*Written by Claude on 2026-10-01 (Arizona, UTC−7). Committed before the part 4a engine, validator and app edits (A-01). Base:
`dd18f31`, part 3 built and gated (3,212 tests, 0 failing, 9 todo; closeout 12/0/0). The round's decisions are in part 1.*

## The repairs, as they will be built

- **SA42F-03.** An owner who dies inside the tax year that is their first distribution year owes no RMD for it. They died
  before the required beginning date (Pub. 590-B; 26 CFR 1.401(a)(9)-2(a)(3)(ii), -3). The first distribution year is the
  year they reach their start age, or, for a still-working participant's current-employer 401(k), the year they retire.
  A death in a later year still owes that year's RMD (MODEL_ASSUMPTIONS §18.1, which eb will be told to qualify).
- **SA42F-04.** With no spouse in the plan, an account whose owner is "spouse" is read as the only person's everywhere:
  RMD, QCD, the 10% age and the owner's age. The validator warns, `SPOUSE_ACCOUNT_WITHOUT_SPOUSE`, and the form's account
  owner select offers "Spouse" only while a spouse is included.
- **SA42F-11, as the owner chose.** Each living person of 65 or over is charged Medicare. Where the self works part of the
  row and a spouse of 65 or over is not working (on their own clock, as `householdWorkDurations()` reads it), that part of
  the row is charged for the spouse too. Rows in the retired span are charged exactly as before. Pre-Medicare costs keep
  their household rule; this is disclosed.
- **The owner's ruling, survivor costs.** When the self dies after the start and before the retirement age, the spouse is
  alive then, and the spouse has no salary in their work window at the death, the costs start at the death. That covers
  the spending strategy, its anchor and inflation latches, the health and LTC costs and the retirement-span debt payments,
  in place of the retirement age. Pensions, wages and contributions keep the retirement age. With a salary, nothing changes.
- **SA42F-29.** The spending strategy's survivor test reads who is alive at the row's opening (decision 7: the row opening
  at or before a lifespan is the year of death, costed for two). It used to read the retirement date when that fell inside
  the row.

## Predictions

### 1. The corpus

`audit/S5AA/R43/prediction/life_corpus_scan.js`, run on `dd18f31` (output: `prediction/life_corpus_scan_at_dd18f31.txt`). Its
**positive control flags every witness and none of the controls**.

**It flags no corpus plan, in either corpus, for any of the five repairs.** So:
- **Control 4.7:** zero unpredicted. The declarations stay as they are, including part 3's `seed:4`.
- **Expanded capture:** unchanged from part 3. `seed:4` and `expansion:monte-carlo-sensitive-band` differ from r21, and
  the other 69 entries equal it.

**Each repair keeps the old arithmetic outside its condition:**
- the Medicare term is added only where it is positive;
- the cost start equals the retirement age unless the ruling's condition holds;
- the survivor test differs only for a death between the row's opening and a retirement inside the row;
- the RMD is skipped only in the first distribution year of death;
- the owner reading changes only for a "spouse" account with no spouse.

### 2. The witnesses, hand-derived from the rules and the inputs

The tests are in `tests/audit-s5aa-r43-life-events.test.js`. Each defect test was run on `dd18f31` and fails at the figure shown
as "today". The controls pass.

| | witness | today | predicted |
|---|---|---|---|
| SA42F-03 | self 72 (born 1954), a $500,000 IRA, dies at 73.5; spouse 65 | RMD $18,867.92 in the row closing at 74 | **$0**; $500,000 kept |
| SA42F-03 control | the owner lives | — | $500,000 / 26.5, unchanged |
| SA42F-03, a 401(k) | still working, retires 75.3, dies 75.6 | $20,325.20 | **$0** |
| SA42F-04 | single, 75, a $300,000 IRA marked "spouse", QCD $5,000, a hidden spouse age of 50 | RMD $0, the 10% charged | **RMD $12,195.12** (÷ 24.6); the same tax and AGI as the account marked "self"; a validator warning at `accounts.1.owner` |
| SA42F-11 | self 60 working to 67; spouse 68, retired | $0 a row | **$3,185.68**: $202.90 × 12 + $283 + $38.99 × 12 |
| SA42F-11 control | the roles swapped | $3,185.68 | unchanged |
| ruling, survivor costs | self 55 (retiring 65, $100,000) dies 56.5; spouse 63, no salary; $50,000 spending | $0 until 65 | **$25,000** in the row closing at 57 (half the row, for two), then **$50,000** |
| ruling control | the spouse has a $40,000 salary | — | $0 until 65, unchanged |
| SA42F-29 | same-age couple of 60, the self dies 60.25, retirement 60.5, $80,000 income-first, 50% reduction (the spouse keeps a small salary) | $20,000 in the row closing at 61 | **$40,000** (half the row, for two), then $40,000 |
| SA42F-29 control | retirement at 60 | — | $80,000, unchanged |

### 3. The gate and the browser

- **Gate:** passes, with the new tests; closeout 12/0/0.
- **Browser:** the form changes, so the round's final candidate repeats task 6.5 (A-04).
