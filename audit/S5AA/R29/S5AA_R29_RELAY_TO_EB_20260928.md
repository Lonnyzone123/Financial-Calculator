# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R29

*Written by Claude, 2026-09-28 (local, UTC−7). Prose for eb to place in eb's own files; no file of eb's has been edited.
Every fact was checked on Windows 11 / Node 24.17.0 against the code at `4ead57c`.*

## 0. What happened

ChatGPT's PC migration review accepted the move. Its PCF full-model audit of `8396626` kept **NO-GO**, on three findings:
- **PCF-01 (P1):** an HSA transferred out untaxed.
- **PCF-02 (P1):** a taxable → Roth IRA transfer bypassed the contribution limits.
- **PCF-03 (P2):** a `__proto__` account id doubled the dated dividends.

R29 repairs all three, plus the cases they raised, on the owner's decisions of 2026-09-28. The source is
`s5aa-r29-source` = `4ead57c`, and the handover is `audit/S5AA/R29/S5AA_R29_CHANGE_AUDIT_HANDOVER_20260928.md`.

## 1. The model (`MODEL_ASSUMPTIONS.md`), suggested text

For your transfers section (§18.3 and §19–20):

> **What a transfer is depends on the two accounts** (S5AA R29, the owner, 2026-09-28).
> - A transfer between accounts of the same tax character is a rollover, or an in-kind move between taxable accounts: it
>   moves untaxed and outside every limit.
> - Pre-tax into a Roth-class account is a conversion.
> - Pre-tax into a taxable account is a distribution.
> - **Into a 401(k) from a different kind of account, it is refused.** A 401(k) takes payroll, same-character rollovers
>   and conversions only.
> - **Into an IRA or an HSA from a different kind of account, it is a contribution,** held to the room the year's planned
>   contributions leave: the IRA limit and compensation, or the HSA limit. Under the redirect policy only what fits moves
>   and the rest stays in the source; under warn all of it moves, with a warning.
> - Into a traditional IRA it is deductible under the IRA deduction rule. Into an HSA it is a direct contribution,
>   deducted above the line.
> - **A traditional IRA into its owner's own HSA is a qualified HSA funding distribution:** tax-free, not deductible,
>   and within the HSA room.
> - **Out of an HSA into any other account, it is an HSA distribution:** the account's includible share is income, plus
>   20% before its owner is 65.
> - **Out of a taxable account into a non-taxable one, it is a sale:** the moved dollars realise their gain at the
>   account's pro-rata basis.
>
> Not modelled: HSA eligibility (coverage, or Medicare from 65), limits on custom accounts, and a funding
> distribution's credit toward an RMD.

## 2. `FEATURES.md`

- **Line 107** still says HSA withdrawals have no qualified/non-qualified distinction. That has been stale since Q99 (the
  qualified-medical share and the 20% additional tax). Since R29 it also covers transfers out of an HSA.
- **Line 155** gives "taxable → Roth at a stated age" as the transfer example. Since R29 that is a contribution, held to
  the year's IRA room and compensation, and the gain on what moves is realised.

## 3. `SPRINT_QUESTIONS.md`, if you keep decisions there

Three decisions of 2026-09-28:
- **Refuse** a transfer into a 401(k) from a different kind of account.
- The excess over contribution room **stays in the source**.
- A traditional IRA into an HSA follows the **funding rule**.

Plus the found-in-passing repair: a taxable → non-taxable transfer realises its gain.

## 4. Where this round lives

In `Lonnyzone123/Financial-Calculator` (public), on branch `sprint/s5aa-r29`. Its pull request runs the gate, which the
`protect main` ruleset requires.
