# S5AA R45 — change audit handover: each spouse's own retirement date

*Written by Claude, 2026-10-03 (Arizona, UTC−7), for ChatGPT's audit of the change from `s5aa-r44-source` (`06e551e`) to the R45
source (`9c7790e`, to be tagged `s5aa-r45-source` on the owner's go). Every figure below was read from its output at the commit
named.*

## 1. What is asked

Audit the R45 change and number any findings **R45-NN**. Determine S5AA's status against E1 to E18 as amended by A-01 to A-11,
with GO or NO-GO on the report's first line. R45 changes the model after R44.1's administrative GO, so that GO does not carry
over by itself.

## 2. How the status got here

- **R44.1:** you determined **GO (administrative)** (PR #51) on `s5aa-r44-source`.
- **The owner, 2026-10-03:** "both spouses need their own retirement date", decided through a set of choices
  (`S5AA_R45_OWNER_DECISIONS_20261003.md`), to be built as S5AA round R45 before S5AA closes.
- **AA1, the same day:** your assumptions audit (PR #56) and Claude's verification with the owner's decisions (PR #57,
  `audit/S5AA/AA1/S5AA_AA1_CLAUDE_VERIFICATION_20261003.md`). On R45 the owner chose:
  - Roth conversions get their own start age (default: the retirement age, as before), and leave the household-date list
    (AA1-40);
  - pre-Medicare health costs get an "employer coverage ends at" age (default: the household date) (AA1-40);
  - the first-stop and death rules stay, with an optional "retirement spending begins at" age (AA1-38, AA1-39).
- The other AA1 decisions are assigned to later S5AA rounds and are **not** in R45.

## 3. The commits (`sprint/s5aa-r45`, from `main` `bde158f`)

| commit | what | gate |
|---|---|---|
| `ade9e9d` | **the prediction,** before any edit (A-01), held to the R44.1 checklist: the corpus scan, the test-exposure hook and its output, the pre-repair witness run | — (records only) |
| `1096145` | **the repair:** engine, validator, contract, app; the 23-case witness file; the three carried test gaps; two R43 life-events cases adapted | **failed:** 40 Worker-route tests (§6) |
| `c1ddc71` | the generated Worker carries the two new engine helpers | — |
| `265347a` | three tests that pinned what R45 changes, adapted by intent (§6) | **passed:** 3,289 tests, 3,280 pass, 0 fail, 9 authorized todos; closeout 12/0/0 |
| `1e1bf8e` | **r24 registered** (§7) | passed: 3,289 / 3,280 / 0 fail / 9 todos; closeout 12/0/0 |
| `9c7790e` | the R45 inputs and R35's two IRMAA inputs recalculate on change (§6, found by task 6.5); **the R45 source** | §8 |

## 4. The repair

**The engine** (`src/engine.js`):
- **`spouseRetireAgeOf(p)`**, new and exported: `profile.spouseRetireAge` when it is a finite number, else `retireAge`. Read by
  `householdWorkDurations()` (the spouse's work and wages), the Social Security service-month boundary, the 401(k)
  still-working RMD exception, the Rule of 55 separation and vesting at separation, each for the spouse's own accounts.
- **`householdRetireAge(p)`**, new and exported, replaces R43's inline `costRetireAge`:
  - `retirement.spendingStartAge` when entered;
  - otherwise the minimum of: the primary's retirement; an earning spouse's retirement on the primary's clock (not before the
    start); the primary's death before retiring with the spouse alive; an earning spouse's death before their own retirement
    with the primary alive.
- **What reads the household date:** retired spending, the strategy's anchor balance and inflation factor, debt-and-housing
  costs, the one-time-expense share, Medicare costs and R43's idle-spouse Medicare rule, the reserve (both readers), pay-first
  (from the household date, or from an earlier coverage end), and the IRMAA first-years disclosure.
- **Pre-Medicare health** runs on `healthDuration`, from `advanced.healthCoverageEndAge` (default: the household date).
- **Conversions** run on `conversionDuration`, from `advanced.conversionStartAge` (default: `retireAge`, today's rule).
- **Unchanged on `retireAge`:** the pension, LTC onset, the glide path, the bond tent, dividends paid from retirement and their
  disclosures.
- **Comments:** R43's survivor-costs comment said LTC moved at a death; it never did, and the replacement says so. The
  nobody-alive comment said an equal-age lifespan is "projected as before"; since SA42F-30 it is refused, and the comment now
  says so.

**The validator** (`src/scenario-validator.js`): INCONSISTENT_AGES on `profile.retireAge` only beside a salary, and on
`profile.spouseRetireAge` only beside a spouse salary; the spouse's contribution window reads `spouseRetireAge`; earned income
adds employment and self-employment streams paying at the starting age; `conversionStartAge` and `healthCoverageEndAge` are
known optional advanced keys.

**The contract** (`src/plan-value-contract.json`): the four fields are optional numbers, 0 to 120; text or a negative value is
refused by both layers.

**The app** (`src/app-shell.html`): four inputs, blank meaning the default date (spouse retirement age; retirement spending
begins at; conversions start at; employer health coverage ends at); the conversion amount's label says "each year from the
conversion start age"; the Worker function list carries both new helpers.

## 5. Predicted against measured (C8)

**The corpus.**

| level | predicted (`ade9e9d`) | measured |
|---|---|---|
| control 4.7 | no movement | the gate's 4.7 passes with no declaration: no control plan moved |
| expanded capture | exactly `expansion:s5aa-gap-working-household`, household date 67 → 56 | **exactly that entry.** A capture of `bde158f` equals r23 on all 71 entries; a capture of `265347a` differs from it in that one entry only |

The mover, before → after (`265347a`):
- **Spending** (with debt payments), row closing at 57: $0 → $143,048 (half a year from 56); then about $162,000 a year to 67.
- **Pay-first:** the self's net pay covers about $84,000 a year (predicted: about $85,000).
- **Withdrawals:** up $58,068 in the row closing at 57, about $78,000 a year to 60, about $102,000 a year from 61, when the draws move
  from the taxable account (down from $362,043 at 56 to $121,781 at 60) to the tax-deferred accounts and taxes rise from about
  $24,000 to about $48,000 a year.
- **Lifetime taxes** +$204,514.81 (predicted: rise). **Final total** −$1,678,276.53 (predicted: "several hundred thousand dollars
  to over a million").
- Conversions unchanged (they keep the self's 67). Status ok; no shortfall either side.

**The C1 check after the build:** the scan's household-date function equals the exported `householdRetireAge()` on all 107
corpus plans (`prediction/r45_c1_check.js`).

**The witnesses:** the 23 cases of `tests/audit-s5aa-r45-spouse-retirement-dates.test.js` all pass after the repair, each with
its hand-derived figure. The committed file equals the one run before the repair (SHA-256 `a952b993…0358d7` over its working-copy
CRLF bytes; `5a0918c9…` over the committed LF bytes).

## 6. What the prediction did not name

**The prediction said the two R43 life-events cases would be adapted; they were** (the salary control now starts spending at the
death, $25,000 then $50,000; SA42F-29's year of death is $60,000 from the death at 60.25, costed for two, where R43 gave
$40,000 from 60.5). The conservation invariants passed unchanged, as predicted.

**Four things it did not name:**
1. **The Worker function list (a defect, caught by the gate).** The app builds its Worker from a named list of engine functions;
   `1096145` added the two helpers to the engine but not to the list, so every Worker run threw and 40 Worker-route tests failed.
   Repaired in `c1ddc71`. No record claimed a pass before the repair.
2. **R41's already-retired control** pinned INCONSISTENT_AGES with no salary; rule 8 removes it. Adapted: no warning without a
   salary, the warning with one.
3. **SA42F-26's label test** pinned "(each year from your retirement age)". Adapted to the new label and the new input's
   default.
4. **The scenario generator** wrote `spouseRetireAge = retireAge` for every spouse (inert before R45). Generated seed 98 (a spouse
   older than the shared age, with a salary) then raised the new spouse warning in the "no warnings" test. The field is now left
   out for such a spouse, so the engine reads `retireAge`, the value written before; no corpus member is such a seed, and both
   corpus specs re-derive their pinned inputs unchanged.

Items 2 to 4 share one cause: C6's search covered the **engine's** readers and the exposure hook covered tests that **run the
engine**, but rule 9 and the app step also change the validator's warnings and the form's text, and no search was made for tests
pinning those. Claude's first `spouseRetireAge` search did list the generator line, and it was not followed up.

**A defect found by task 6.5 at `1e1bf8e`, repaired in `9c7790e`:** the form reads its inputs in `readStatic()`, but only ids in
`staticIds` have a change listener. The four R45 inputs, and R35's two IRMAA prior-income inputs, were not in it: in the browser a
conversion start of 66 stayed stored as 62, a blanked field stayed stored, and an IRMAA prior-year MAGI of 300,000 was never stored,
until some other input changed. R35's inputs have had this gap since R35 (its MAGI could silently fail to apply). All six join
`staticIds`; a new test holds every id `readStatic()` reads to the listener list, and against `1e1bf8e` it names exactly these six.

**A slip in a carried test, not a witness:** the SA42F-08 Roth case's first derivation left out the age-50 catch-up and expected
$670; the limit is $10,000 + $1,400 = $11,400, and $11,400 − $10,640 = $760, the engine's figure. The test text says so.

## 7. r24

`tools/baseline-20261003-s5aa-expanded-r24.json`: the expanded composition captured twice at `265347a` in clean worktrees,
byte-identical; invariants 7/7; 71 entries on r23's inputs (input hash `28e26d38…`); output `c65c9dca…`. One entry differs from
r23, as §5. The registry names r24 as the baseline S5b task 4 builds on; `tests/baseline-provenance.test.js` counts 30 reproduced. After
`265347a`, `src/engine.js` is unchanged: `1e1bf8e` adds only the registry and the capture, and `9c7790e` changes only the form's
listener list in `src/app-shell.html` (the rules package the capture reads from that file is unchanged). A capture of `9c7790e`
equals r24 entry for entry (§8), so r24 is the expanded output of the R45 source.

## 8. The source candidate `9c7790e`

- **Gate:** passed, 3,290 tests, 3,281 pass, 0 fail, 9 authorized todos; closeout 12 accepted, 0 refused, 0 errors.
- **Browser, task 6.5 on the final candidate (A-04):** R41's scripts, unchanged, in Chromium 152 on Windows 11 (artifact
  `f27d1a6b…`): A to E give the same results as at R44 (75/75 Worker equals main thread, 72 equal Node; 70 imported and 70 CSVs
  equal; fault fallback and recovery exact; four concurrent Workers equal; the same three Monte Carlo plans within 5.57 × 10⁻¹⁵
  relative, no count or rate moving). The six form inputs each store and recalculate on their own, and blanking removes them.
  Still one desktop browser.
- **Expanded capture of `9c7790e`:** equal to r24 on all 71 entries.
- **Self-audit:** `S5AA_R45_SELF_AUDIT_20261003.md` (SA45-A to -F).

## 9. Not changed, and carried

- Every AA1 decision other than the three R45 inputs is assigned to a later S5AA round and is not built here.
- The household date is one date for the whole household. A working spouse's employer coverage is modelled only through the
  coverage-ends input; Medicare costs follow the household date.
- R43's carried items stand (the spousal reduction factor's adjustment; R43 section 7's two validator-only rules, now pinned by
  `tests/audit-s5aa-r45-carried-test-gaps.test.js`; 199A's limits; Medicare at 65 assumed).
