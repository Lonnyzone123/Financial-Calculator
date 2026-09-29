# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R32

*Written by Claude, 2026-09-28 (local, UTC−7). Prose for eb to place in eb's own files; no file of eb's has been edited.
Checked against the code at `3017351`.*

## 0. What happened

ChatGPT's R30A account and transfer audit found three problems:
- **R30A-01 (P1):** an IRA's after-tax money rolled into a 401(k).
- **R30A-02 (P2):** a Roth IRA rolled into a Roth 401(k).
- **R30A-03 (P2):** a rollover between two living owners.

It also raised the catch-up age convention. ChatGPT's R31 change audit found **R31-01 (P1)**: the HSA-funding pool dated
only the sending IRA.

R32 repairs all four and applies the owner's catch-up choice, on the owner's decisions of 2026-09-28. The source is
`s5aa-r32-source` = `3017351`, and the handover is `audit/S5AA/R32/S5AA_R32_CHANGE_AUDIT_HANDOVER_20260928.md`.

## 1. `MODEL_ASSUMPTIONS.md`, suggested text

For §21's categorization:

> - **A traditional IRA into a 401(k)** is a rollover of the IRA's taxable money only (IRC 408(d)(3)(A)(ii), (H)): at most the
>   owner's IRAs on the date less their basis. The after-tax money stays in the IRA, with a warning (S5AA R32).
> - **A Roth IRA cannot roll into a 401(k)** (Publication 590-A); the transfer is refused. A 401(k)'s Roth money can roll into a
>   Roth IRA (S5AA R32).
> - **A rollover stays with its owner.** Between two of the named retirement or HSA accounts of one kind -- traditional IRA,
>   traditional 401(k), Roth IRA, Roth 401(k), HSA -- a transfer to the other spouse's account is refused while both are
>   living (IRC 408(d)(3)(A), 223(f)(5)). Transfers between different kinds, taxable gifts, the custom accounts and the
>   handling at a death are unchanged (S5AA R32).

For §21.2, one sentence:

> The owner's IRA value on the funding date counts **every** one of that owner's traditional IRAs at its own return, not only
> the one sending the money (S5AA R32, R31-01).

For the contribution-limit section:

> **Catch-up contributions read the age reached by the year's end** (IRC 219(b)(5)(B), 414(v), 223(b)(3)): the row an owner
> turns 50 has the IRA and 401(k) catch-up, the row they turn 55 the HSA catch-up, the rows they turn 60 to 63 the 60-63
> amount, and the row they turn 64 the ordinary catch-up. Each projection row is treated as a tax year (S5AA R32; the owner,
> 2026-09-28: "Use the year-end age").

**New known limit:** a rollover into a 401(k) measures the IRA's basis as it stands on the date, without that year's
nondeductible contributions.

## 2. `SPRINT_QUESTIONS.md`, if you keep decisions there

The owner's decisions of 2026-09-28:
- R30A-01: "Move taxable part only".
- R30A-02: "Refuse it".
- R30A-03: "Refuse it".
- R31-01: "Repair in R32".
- The catch-up age: "Use the year-end age". It moves corpus members seed:10, seed:11 and seed:20, which are declared.

## 3. Where this round lives

In `Lonnyzone123/Financial-Calculator`, on branch `sprint/s5aa-r32`, in a pull request the owner merges. Please place this on
your own branch from `main` once it merges.
