# S5AA R39.1 — change audit handover: a claim the worker never reaches (R39-01)

*Written by Claude, 2026-09-30 (local, UTC−7), for the owner to send to ChatGPT. Every figure was measured on Windows 11 / Node 24.17.0 at
the commits named.*

## 1. What to audit

- **The change:** from `main` at `96ce07f` (R39, ChatGPT's R39 change audit #30, and eb's placement #31) to **`s5aa-r39.1-source`** at
  **`a2ee714`**. The diff to audit is `96ce07f..a2ee714`.
- **One commit.** It repairs R39-01, a regression R39's `f6dbb2a` introduced.
- **Please number findings R39.1-NN**, in the usual report-only pull request, on a branch like `audit/chatgpt/r39.1-a2ee714`.

## 2. The decision

"fix it" (the owner, 2026-09-30), on Claude's recommendation. The claim-date price applies only to a claimant alive at the claim. R39's
own-claim pricing, R38-04, is kept.

## 3. What changed — `a2ee714`

**The defect.** R39 (R38-04) priced each person's PIA at their claim when the claim falls inside the row, without asking whether the
person is alive then. ChatGPT's witness: a worker dying at 67.25 with a claim planned for 67.5. The PIA was priced at 67.5, a COLA the plan
had not reached at the death, and `ssSurvivorMonthly()` paid the survivor from it: 20,196 in the row to 68, where a claim planned at 68 or
69 gave 18,360.

**The repair.** In `householdSocialSecurityDetail()`:
- `selfClaimPriced` and `spouseClaimPriced` require the claim to fall strictly inside the row **and** before the claimant's death. The
  death is `selfDeath`, and for the spouse `spouseDeathAtSelfAge`, both on the self's clock.
- Otherwise the PIA is priced at the row's opening, as before R39.
- A lifespan that is not a finite number ends nothing.

**The rule.** A planned claim never reached cannot move the survivor benefit. POMS RS 00615.690 makes the deceased's delayed credits
effective at death. As ChatGPT notes, 20 CFR 404.271(b) still allows COLAs to the PIA of someone who dies before eligibility. This repair
does not decide the survivor's COLA timing: it only stops the unreached claim date from triggering one.

## 4. Evidence

**New test, `tests/audit-s5aa-r39-1-posthumous-claim-not-priced.test.js` (3 tests).**
- **The self dying before planned claims at 67.5, 68 and 69:** 18,360 each.
- **The mirror, with the spouse dying and the self surviving:** 18,360 at 67.5 and 68.
- **Control:** a claim reached alive inside the row keeps R39's claim-date price (R38-04, 13,728).
- **Before the change,** the first two failed at 20,196 each.

**Worked by hand** on the model's row-constant convention:
- no COLA anniversary before the death (the plan opened at 66.5);
- three months of delayed credit past FRA 67, so 3 × 2/3% = 2%;
- 2,000 × 1.02 = 2,040 a month × 9 months = 18,360.

**Other runs at `a2ee714`:**
- ChatGPT's script (`audit/S5AA/R39/S5AA_R39_EXTERNAL_REPRO_20260930.js`) now stops at its assertion. That assertion pins the defect,
  expecting [20,196, 18,360, 18,360], and now finds [18,360, 18,360, 18,360].
- ChatGPT's R38 script still prints 13,728 for R38-04.
- R34's Social Security reference: 25 cases, 0 mismatches.
- The Social Security tests: 187 pass.

**The gate at `a2ee714`**, run in a separate worktree: 3,123 tests, 3,114 passing, 0 failing, 9 authorised todo; closeout 12 / 0.

## 5. What moved

**The control (4.7).** Nothing: 0 unpredicted differences, and golden is unchanged.

**The expanded corpus at `a2ee714`:** 71 entries, qualified boundary, invariant 7/7. Nothing moved: the output hash `aaa16de138f2e72889e7861880e9c25fed272583e08d65294dfd7c504e5f3e22` and the input hash are unchanged. No corpus plan has a death before a planned claim inside the same row, so the repair is witnessed by its hand tests only.

## 6. Known limits

- The survivor's own COLA timing after a death before eligibility (20 CFR 404.271(b)) is unchanged. The survivor's PIA is priced at each
  row's opening, as before R39.
- A claim reached alive inside the row, followed by a death later in the same row, prices the survivor from the claim-date PIA. The claim
  was reached.

## 7. Where I would look first

1. A death exactly at a planned claim (the boundary is "at or after the death": not priced).
2. Spouses of different ages, where the spouse's death and claim are converted to the self's clock.
