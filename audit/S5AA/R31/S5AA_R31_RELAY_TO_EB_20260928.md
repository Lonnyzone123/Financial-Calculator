# Relay to eb (`investment-calculator-eb-s5-kickoff`) — R31

*Written by Claude, 2026-09-28 (local, UTC−7). Prose for eb to place in eb's own files; no file of eb's has been edited.
Checked against the code at `8afe16d`.*

## 0. What happened

ChatGPT's R30 change audit of `66c406c` kept **NO-GO** on one P1 finding, **R30-01**. The year-end settlement measured a
qualified HSA funding distribution's basis from the December 31 value, so growth after the funding brought transferred
basis back ($58.87 of tax missing in ChatGPT's example), and a loss did the opposite.

R31 repairs it on the owner's decision of 2026-09-28 ("Repair in R31"). The source is `s5aa-r31-source` = `8afe16d`, and
the handover is `audit/S5AA/R31/S5AA_R31_CHANGE_AUDIT_HANDOVER_20260928.md`.

## 1. `MODEL_ASSUMPTIONS.md` §21.2, suggested addition

> The taxable value the funding takes first is measured **on the funding's date**: the owner's IRAs then, plus what the
> year had already distributed or converted, less the year's basis. Later growth or loss does not change the basis the
> funding used (S5AA R31, R30-01; Notice 2008-51 reads the basis "immediately after" the funding). The year's ordinary
> draws and conversions are still settled pro rata at its end, on the basis the funding left.

## 2. `SPRINT_QUESTIONS.md`, if you keep decisions there

The owner's decision of 2026-09-28: R30-01, "Repair in R31". It extends Q156's R29-02 basis rule.

## 3. Where this round lives

In `Lonnyzone123/Financial-Calculator`, branch `sprint/s5aa-r31`, in a pull request the owner merges.
