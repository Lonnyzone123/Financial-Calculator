# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R32F

*Written by Claude, 2026-09-29 (local, UTC−7). Prose for eb to place in eb's own files; no file of eb's has been edited.
Checked against `main` at `b5424ff`. Sent on the owner's instruction ("send eb the relay").*

## 0. What happened

At the owner's request, Claude audited the whole model at the R32 source. The report is
`audit/S5AA/R32/S5AA_R32F_CLAUDE_FULL_MODEL_AUDIT_20260929.md`, with eight area reports under `audit/S5AA/R32/SA32F/`. It was
merged as PR #17 (`b5424ff`).

- **What it found:** 55 findings, SA32F-01 to SA32F-55 (21 P1, 22 P2, 12 P3), and SA32F-D1.
- **The owner's decisions:** eight, made on 2026-09-29, in its §4.
- **What's next:** the owner has sent ChatGPT the cover note, asking for a check numbered R32V-NN.

**Nothing is repaired yet.** So this relay asks for three kinds of change:
- the decisions, recorded as decided;
- corrections to text that is already stale today;
- no description of decided behaviour as if it were built. Each decision's model text should come with its repair round.

## 1. `SPRINT_QUESTIONS.md`: the owner's decisions of 2026-09-29

Each was chosen from options Claude laid out, and every choice was the recommended one. Quote the choices as they stand:

| # | question | finding | the owner's choice |
|---|---|---|---|
| 1 | When someone dies before claiming Social Security, what does the surviving spouse get? | SA32F-02 | "Pay by law": the deceased's FRA benefit plus delayed credits earned before death, reduced for the survivor's age (42 USC 402(e)). The survivor-side claim-age gate (Q3b) stays. **This reverses R2-003(b)'s "posthumous claim" removal (Q3a's context).** |
| 2 | Add the spouse's 50% benefit? | SA32F-03 | "Build it": up to half the worker's FRA benefit, with the spousal reduction and no delayed credits; it cannot start before the worker files (20 CFR 404.333, 404.410). |
| 3 | What dollars is the entered Social Security benefit in? | SA32F-04 | "Today's dollars": grown at the COLA field from the plan's start to the claim; the earnings-based path takes COLAs from 62 (20 CFR 404.271); the field is relabelled. |
| 4 | Basis at a death? | SA32F-17 | "Own full, joint half": a decedent's own taxable accounts are fully stepped up (IRC 1014(a)) and joint accounts half, with a disclosure that Arizona community property (1014(b)(6)) can step up more. |
| 5a | Whose age stops a spouse's contributions? | SA32F-12 | "Each owner's own". |
| 5b | How does the vested percentage work? | SA32F-13 | "Vest over 6 years": the entered percentage rises to 100% within 6 years (411(a)(2)(B)); only what is unvested at retirement is lost. |
| 5c | A spousal IRA after the non-working spouse's retire age? | SA32F-15 | "Allow while joint pay" (219(c); 219(d)(1) repealed). |
| 6 | Fixed-nominal spending "in today's dollars" with a later retirement? | SA32F-36 | "Inflate to retirement", then hold flat. |
| 7 | What does "Expected annual return" mean? | SA32F-42 | "Keep average, disclose": Monte Carlo keeps it as the arithmetic mean; a disclosure says simple mode shows the average path, not the typical one. |
| 8 | Tax law after 2026? | SA32F-D1 | "Index, own round": price-linked amounts are indexed at the plan's inflation and labelled a model assumption; amounts fixed by statute stay fixed; this is done in a round of its own. |

**Status for each:** decided 2026-09-29, not yet built. None moves a figure until its repair round lands.

## 2. `MODEL_ASSUMPTIONS.md`: corrections that are true today

**§8's text is stale (SA32F-48).**
- The section's heading and body say opening-row insurance is "decided, not yet built", and that "Today the engine still does
  not do this".
- The engine does it. A plan starting at 70 with `selfLife` 70 and $250,000 of insurance shows an opening `networth` of
  $2,250,000 against a total of $2,000,000. The repro is `audit/S5AA/R32/SA32F/LIFE-EVENTS/repro-LIFE-07-insurance-doc-stale.js`.
- `S5_TASK_CHECKLIST.md` task 2o.2 records it as landed at `4c104e9` (a private-archive commit).
- Suggested heading: "Insurance counts in net worth from the first year, even for a plan that starts past `selfLife` —
  **built** (S5 task 2o)". The paragraph beginning "Today the engine still does not do this" would then say it landed.
- `RESULT_CONTRACT.md`'s C6 row is stale in the same way. That file is not yours; Claude will correct it in the next records
  commit, unless you'd rather.

**§9 is missing four inert fields (SA32F-50).**
- `mortgageType` (including "Interest-only"), `originalAmount`, `propertyValue` and `loanTermYears` are accepted, and the
  engine never reads them. A plan's results are byte-identical whatever they hold.
- `remainingTermYears` also changes nothing in the engine; in the app it only rewrites `payoffAge`.
- Suggested addition to §9:

> **Four mortgage fields are also accepted and change nothing** (S5AA R32F, SA32F-50): `mortgageType` (an "Interest-only"
> choice included), `originalAmount`, `propertyValue` and `loanTermYears`. The engine amortizes from the balance, rate,
> payment and payoff age. `remainingTermYears` is used only by the app, to set the payoff age.

**§18.1's reason for no step-up is wrong for a sole-owned account (SA32F-17).** The owner has decided the change (decision 4).
I'd leave the paragraph until the repair lands, then replace it with that round's text. If you'd rather correct the reason
now, one sentence would do:

> The stated reason covers joint accounts only: a solely-owned account is stepped up whatever the titling or state law (IRC
> 1014(a)).

## 3. `FEATURES.md`: two stale statements (SA32F-54)

- **Line 146:** it calls the ARM payment shock "Behind `advanced.armRecastOnReset`, **default off** … no UI control yet".
  Since S5AA task 5.1 (Q94), the re-amortisation at a reset is unconditional. The flag is read only to tell a plan carrying the
  old key that its projection moved (`src/engine.js`, the comment at :2089 and the check at :4421).
- **Line 185:** it still lists "wiring `src/debt-revolving.js` into `projectDebts()`" as wanted work ("module built, not
  wired"), and "a UI control for ARM payment shock, turned on by default once the external audit lands". The revolving module
  is wired: `projectDebts()` calls `DebtRevolving.minimumPaymentFor` (`src/engine.js:2139`), confirmed exact against Q110 by
  the audit. The ARM item is superseded by Q94, as above.

## 4. Where this round lives

The report and area files are on `main` (`b5424ff`). **Please place this on your own branch from `main`, and don't push until
the owner says yes.** I'll review the diff when you tell me it's ready.

This relay file will be committed with the next records commit (R33), beside the report.
