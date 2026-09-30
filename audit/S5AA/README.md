# S5AA audit records

This repository began on 2026-09-28 as a one-commit copy of a private development repository (its `main` at
`ee9757d`). The records of S5AA's rounds up to R28 (with R28.1), their packages, tags and ChatGPT's reports are in that
private archive. Documents here that cite them name the private commits and paths, which don't open in this repository.

| round | folder | what it holds |
|---|---|---|
| the move | [`PC/`](PC/) | the migration audit of this copy against its source: the handover, `pc_compare.js`, and the report, findings PC-NN |
| R29 | [`R29/`](R29/) | PCF-01 to PCF-03 and the transfer rules: the change handover, self-audit and its sweep, the cover note and the relay to eb; source `s5aa-r29.1-source` (`aaff3f1`), after `s5aa-r29-source` (`4ead57c`); ChatGPT's R29 change audit (NO-GO, R29-01 and R29-02) and its repro |
| R30 | [`R30/`](R30/) | R29-01, R29-02, the RMD credit and three owner decisions on transfer dividends: the change handover, self-audit and its sweep, the cover note and the relay to eb; source `s5aa-r30-source` (`66c406c`); ChatGPT's R30 change audit (NO-GO, R30-01) and its R30A account and transfer audit (NO-GO, R30A-01 to R30A-03), each with its repro |
| R31 | [`R31/`](R31/) | R30-01, a funding distribution's basis measured on its date: the change handover, self-audit and its sweep, the cover note and the relay to eb; source `s5aa-r31-source` (`8afe16d`); ChatGPT's R31 change audit (NO-GO, R31-01) and its repro |
| R32 | [`R32/`](R32/) | R30A-01 to R30A-03, R31-01 and the catch-up age: the change handover, self-audit and its sweep, the cover note and the relay to eb; source `s5aa-r32-source` (`3017351`). Also R32F, Claude's full-model audit of that source (SA32F-NN; `SA32F/` holds the eight area reports and scripts) with the owner's decisions of 2026-09-29, and its cover note |
| R33 | [`R33/`](R33/) | 16 items from R32F and R32V (tax and contributions) and R32V-02: the change handover, self-audit and its tax sweep and corrected reference, the cover note and the relay to eb; source `s5aa-r33-source` (`f4e8294`). The R32F relay to eb is in `R32/` |
| R34 | [`R34/`](R34/) | 11 Social Security items from R32F and R32V (SA32F-01 to -07, -18, -25; R32V-03): the change handover, self-audit and its reference over all 25 R32F Social Security cases, the cover note and the relay to eb; source `s5aa-r34-source` (`7b61b88`) |
| R35 | [`R35/`](R35/) | 13 items from R32F and R32V (cash flows, Medicare and life events: SA32F-08, -13, -17, -18, -19, -20, -22, -24, -26, -36, -37, -39; R32V-01): the change handover, self-audit, cover note and relay to eb; source `s5aa-r35-source` (`26ef26d`) |
| R36 | [`R36/`](R36/) | SA32F-D1 by decision 8 (with D8): later tax years index the 2026 figures, each by its statute's rule and rounding: the change handover, self-audit, cover note and relay to eb; source `s5aa-r36-source` (`cf643a8`) |
| R37 | [`R37/`](R37/) | The rest of the R32F/R32V register: engine safeguards, the validator gaps, three plan warnings shown as cards, housing costs, the HSA at 65, Monte Carlo guidance and disclosures, contributions and strategy text, the marginal-rate helper, inert mortgage fields and stale texts: the change handover, self-audit, cover note and relay to eb; source `s5aa-r37-source` (`4a9a15e`) |
| R38 | [`R38/`](R38/) | ChatGPT's R35-01 (the row of separation's employer money), full vesting at normal retirement age 65, and a new plan filing single: the change handover, self-audit, cover note and relay to eb; source `s5aa-r38-source` (`678c556`) |
| R39 | [`R39/`](R39/) | ChatGPT's R38-01 to R38-05 (part-year contribution limits, the Rule of 55 from a fractional start, the Roth match at allocation, the COLA before a claim inside a year, a survivor's inherited workplace plan) and the QCD's 70 1/2 convention declared: the change handover, self-audit, cover note and relay to eb; source `s5aa-r39-source` (`f7ea076`) |
| R37 on | `audit/S5AA/RNN/` | each round's cover note, response, self-audit, handover and evidence |

The working rules for ChatGPT and Claude are in [`WORKING_RULES.md`](WORKING_RULES.md).
