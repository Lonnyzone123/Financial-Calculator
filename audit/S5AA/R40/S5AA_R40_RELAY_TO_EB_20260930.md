# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R40

*Written by Claude, 2026-09-30 (local, UTC−7). Prose for eb to place in eb's own files once R40 merges; no file of eb's has been
edited. Checked against the code at `2881ceb`, after the audit of PR #35.*

## 0. What happened

The owner asked for a GO/NO-GO handover for ChatGPT. Claude's check of the exit gate found gaps that R29 to R39.1 had left open.
The owner decided, on 2026-09-30, to close them first, and chose Claude's recommendations:
- **"Close gaps first":** a round of its own, R40, before the handover.
- **Amendment A-10:** E10's record for R29 to R39.1, in `S5AA_TASK_CHECKLIST.md` (not eb's).
- **"Repair all four now":** four undisclosed limits Claude found in R40.

**The owner then asked for an audit of the pull request before merge** ("you do a audit on #35 before we merge"). Three
independent reviews found a P1 in two of the four repairs, and the owner decided:
- **"Revert and disclose"** the partial-row tax repair;
- **"All of them"** for the other fixes.

The handover is `audit/S5AA/R40/S5AA_R40_CHANGE_AUDIT_HANDOVER_20260930.md`.

## 1. `SPRINT_QUESTIONS.md` — one new entry for the owner's decisions of 2026-09-30

- **(a) Close the exit-gate gaps before the status determination.** That means:
  - register a baseline (r18 and on);
  - record the R29–R37 codes in `RESULT_CONTRACT.md`;
  - read R36's card as it renders;
  - update the conservation grid;
  - write the combined unrepaired list.
- **(b) A-10.** For R29 to R39.1, the traced-and-declared control record stands in for E10's predicted-versus-actual record, disclosed
  as not a prediction. From R40 on, A-01 applies as written.
- **(c) "Repair all four now":**
  - the long-term-care cost grows at healthcare inflation, while the insurance benefit stays as entered (`8f20d90`);
  - each person on Medicare pays the Part D base premium (`d1572b1`);
  - an RMD reads the age reached in the row by the engine's own birth year (`d51d30d`, corrected at `3fbe9dc`);
  - the partial-row tax was built (`607101a`) and then **reverted** (`b97fe0a`), by (d).

  Status: IMPLEMENTED 2026-09-30 (S5AA R40), except the partial-row tax.
- **(d) "Revert and disclose" the partial-row tax.** Taxing a partial row as its share of a year annualizes one-time amounts too: a
  $100,000 expense in a tenth-of-a-year row was taxed $56,958 against $20,221.85. The whole-year treatment stays, disclosed. A rule
  that tells recurring income from one-time items goes to the engine rebuild.
- **(e) "All of them".** The audit's other fixes: the validator and the engine agree on malformed debt reset terms (`7cd1a1a`),
  healthcare inflation is validated (`434f19c`), and the app states the Part D premium and the care cost's growth (`2881ceb`).

## 2. `MODEL_ASSUMPTIONS.md`, suggested text

**§18.4, health costs.** Add: "The long-term-care cost is entered in today's dollars and grows at the plan's healthcare inflation from
its start, as the pre-Medicare health cost does. The insurance benefit stays at its entered amount, since a policy's benefit does not
rise without an inflation rider, which the plan does not model (R40)." Add: "Each person on Medicare pays the Part D base beneficiary
premium, $38.99 a month in 2026 (CMS, July 28, 2025; 42 CFR 423.286(c)). It stands in for a plan's own premium. The IRMAA surcharge
is added on top of it (R40)."

**§25, later tax years.** The sentence "Medicare premiums themselves stay at 2026's" now covers the Part D premium too. Please say so,
or name it: "Medicare premiums (Part B and the Part D base premium) stay at 2026's."

**§25 or a new subsection, partial rows (a disclosed limit).** Add: "A projection row shorter than a year — the first row of a plan
that opens at a fractional age, or the last row of one that ends at one — is taxed as a whole tax year holding only the row's income,
so the first year's tax is understated where the household earned before the plan opened. R40 built a share-of-a-year rule and
reverted it because it also annualized one-time amounts; the proper rule, which counts recurring income at its rate and one-time items
once, is for the engine rebuild (R40)."

**§18.3, required distributions.** Add: "An owner's RMD start and the Uniform Lifetime divisor read the age the owner reaches in the
distribution year, which is the engine's birth year (2026 − the whole age at the plan's start, §12) counted forward. For the self this
is the row's opening age. With a fractional self start, a spouse whose fraction was smaller than the self's had read an age a year
short, so their first RMD year was skipped (R40)."

**§21 or wherever validation is listed.** Add: "Healthcare inflation must be a number above −100% and at most 100%; outside the form's
0 to 20% is a warning (R40). A debt's reset rate or reset age that is present but not a number is refused (R40)."

## 3. `FEATURES.md`

If it lists health, long-term-care or Medicare costs, or required distributions, a short note of the R40 repairs in the R40 line.
Your call. The combined unrepaired list is `audit/S5AA/R40/S5AA_R40_UNREPAIRED_LIST_20260930.md`, if a pointer helps. **For the CPU
rebuild's wanted features:** a partial-row tax that annualizes recurring income and counts one-time items once.

## 4. For the Roadmap, a planning fact

The owner, 2026-09-30: "The UI will be rebuilt. but we can use the old ui as a reference." This is recorded in the R40 handover's E14
row, where the engine disclosures the current app does not render stay an explicit exception. Where and how to record it in the
Roadmap or the S5b and S6 text is yours.
