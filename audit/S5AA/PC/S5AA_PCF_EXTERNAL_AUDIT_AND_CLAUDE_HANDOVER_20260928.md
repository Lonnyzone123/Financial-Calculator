# NO-GO: PCF full-model audit at 8396626148c68a767af6ccecf777b861d0b659ac

Independent review, 2026-09-28. Three inherited model defects are recorded below. A passing migration comparison
and passing tests do not qualify this model as a household reference. No source, test, fixture or policy repair is
included. PCF identifies the full-model findings separately from the PC migration review.

## Scope and Identity

The owner asked for both the PC cover-note review and a full-model audit, emphasizing account floors and ceilings.
This audit is not restricted to the migration changes. Frozen source:
`8396626148c68a767af6ccecf777b861d0b659ac`, tree `873baa4f3fdd1490953117f8c90e76b768c744fb`.
Main at review start and pre-publication refresh:
`8357c7e6f73d734076751a10f36d218f8fdd2dd6` (handover records merged, not a new model source).

The original comparison source is `ee9757ddd91989ab6d95616eab02b83b13e8c225`. Its local HEAD and the engine,
validator, rules shell, capture tooling and default-scenario helper were verified against that pin before interpreting
the reproduction there. The model probes produce the same results in both checkouts. The engine's parsed syntax
tree also equals the original `s5aa-r28.1-source` engine at `62e263d794ba0589909fe5407a2685957956b02d`.
This establishes inheritance of the engine defects; it is not a replacement for recording the separate R28 change
audit's complete documentary and source-diff disposition.

Source review covered contributions and compensation, taxable-dollar basis, withdrawals and tax funding, dated
transfers, RMD/QCD capacities, dividends, debt payment/payoff accounting, spending strategies, end-row numerical
invariants, survivor boundaries, and invalid Monte Carlo/historical result handling. The full repository gate was run;
independent new arithmetic was concentrated on financial flow boundaries, not every legal provision or every ported
standalone module. The coverage and limitations below distinguish those forms of evidence.

## PCF-01 (P1): Nonmedical HSA-to-Taxable Transfer Omits Income and Additional Tax

1. **Evidence at the frozen SHA.** A validator-valid plan with an age-60 owner, a $10,000 HSA, an empty taxable
   destination and a $10,000 transfer at age 60.5 returns `status=ok`, HSA $0, taxable $10,000, federal AGI $0,
   taxes $0 and ending total $10,000. The HSA's `qualifiedMedicalPct` is explicitly zero. No disability, death,
   qualified medical reimbursement, repayment or HSA rollover is part of this witness.
2. **Affected code.** `src/engine.js:3373` recognizes a transfer distribution only from `preTax`; line 3376 computes
   only the pre-tax transfer penalty. The transfer bypasses the HSA includible-share/additional-tax path used by
   `withdrawFromAccountList` at line 2022. `moveFunds` at line 2225 deposits the proceeds into taxable basis without
   creating the missing tax obligation. The runtime statement at line 4245 nevertheless says the nonqualified part
   is ordinary income and carries the additional tax before the owner's age-65 exception.
3. **Reproduction and independent expectation.** Run the companion `PC_FULL_MODEL_BOUNDARY_PROBES_20260928.js`.
   With no other income, spending or return, $10,000 times 100% nonmedical share is $10,000 includible income.
   At age 60, the additional tax is $10,000 times 20% = **$2,000**. The taxable destination can pay it, so the
   household should retain **$8,000**, not $10,000; the income is below the applicable standard deductions, making
   ordinary income tax zero in this simple witness. The IRS [Publication 969, Distributions From an HSA](https://www.irs.gov/publications/p969)
   and [Form 8889 instructions, lines 16 and 17b](https://www.irs.gov/instructions/i8889) support the includible-income
   and 20% additional-tax treatment and age/disability/death exceptions.
4. **Consequence and reach.** Taxes and AGI are understated and the ending household balance is overstated by $2,000
   in the witness. Every executed nonmedical outbound HSA transfer to ordinary taxable cash can take this route.
   No member of the 70-plan expanded corpus has this exact HSA-to-taxable transfer. `seed:9` configures an HSA-to-preTax
   transfer, a related classification concern, but its corrected lifetime figures were not independently calculated.
   `FEATURES.md:107` still contains an older blanket HSA-tax-free gap statement; this report does not silently treat
   it as absent. That statement conflicts with the implemented qualification primitive and the current runtime
   contract. The finding is the transfer-route bypass of that contract, not the already disclosed disability/death
   limitation or a claim that all HSA qualification logic is missing.
5. **Proposed repair/decision.** Classify transfers before moving balances. A nonmedical HSA distribution to a
   non-HSA destination must create income and additional tax consistently with ordinary HSA withdrawals. A genuine
   tax-free HSA rollover must satisfy its own destination/beneficiary rules. If such transactions are outside model
   scope, refuse them or explicitly mark their results unqualified. Reconcile the stale feature prose through its
   designated owner; do not fix it inside an audit report PR.

## PCF-02 (P1): Scheduled Taxable-to-Roth Transfer Bypasses the Contribution Ceiling

1. **Evidence at the frozen SHA.** A single age-60 owner with zero salary, other earned income and spousal compensation
   transfers $50,000 from an ordinary taxable account to an empty `rothIRA` at age 60.5. The default `redirect` limit
   policy applies. Validation passes without issues; the engine returns `status=ok` and no issues, taxable $0,
   Roth $50,000 and total $50,000.
2. **Affected code.** `src/engine.js:3360` invokes generic `moveFunds` (line 2225). Only pre-tax-to-Roth transfers
   receive the conversion-specific checks. This ordinary taxable source never enters `auditContributions` at
   line 135 or its row-dollar compensation cap at line 151, so neither remaining IRA room nor compensation limits
   constrain the Roth deposit.
3. **Reproduction and independent expectation.** Run the companion script's "Roth contribution with no compensation"
   case. This is ordinary brokerage money, not a retirement-plan rollover, conversion or special repayment. The
   permissible contribution is **min(remaining annual room, taxable compensation $0) = $0**. The model should refuse
   the unsupported transaction or leave $50,000 taxable and $0 Roth under its limit policy. IRS
   [Publication 590-A, Can You Contribute to a Roth IRA? / Roth IRAs only](https://www.irs.gov/publications/p590a)
   conditions ordinary Roth contributions on compensation and limits them to the lesser of the annual allowance
   and taxable compensation. This zero-compensation expectation does not depend on a year-specific dollar ceiling.
4. **Consequence and reach.** The current year's total conserves money, but **$50,000 is assigned an unavailable
   tax-free shelter**. Later taxable growth, dividends and sale taxes can be understated. No member of the 70-plan
   expanded corpus configures this exact taxable-to-Roth transfer. Two members, `seed:4` and `seed:13`, configure
   taxable-to-HSA transfers: related incoming-contribution classification requires review, but those figures are
   not presented as independently quantified findings here. This is not the disclosed absence of Roth withdrawal
   ordering/five-year rules or the explicitly chosen `warn` policy; the witness uses a real Roth IRA and `redirect`.
5. **Proposed repair/decision.** Separate contributions, distributions, conversions and eligible rollovers. Route an
   ordinary taxable-to-IRA deposit through the same owner/year room and compensation enforcement as contributions,
   including prior contributions and applicable Roth eligibility, or reject the transaction if its lawful category
   cannot be expressed. Do not impose contribution ceilings indiscriminately on genuine eligible rollovers.

## PCF-03 (P2): Prototype-Named Account ID Defeats Dated Dividend Ownership

1. **Evidence at the frozen SHA.** Moving $300,000 from a Roth source to an empty taxable destination at age 60.5,
   with zero investment return and a 10% paid dividend yield, is validator-valid. With destination ID `destination`,
   dividends and AGI are $15,000 and tax is $0. Change only its ID and transfer target to `__proto__`: the engine
   still returns `status=ok` without issues, but dividends and AGI become **$30,000**, tax becomes **$347.50**, and
   ending total becomes **$299,652.50** instead of $300,000. `constructor` and `toString` controls remain correct.
2. **Affected code.** `src/engine.js:3455` creates `heldReinvest={}` and `heldPaid={}`. Line 3464 writes the dated
   ownership adjustment with a user-supplied ID. Assigning a number to `heldPaid.__proto__` does not create an own
   numeric property on a normal object. `payOwnDividends` at line 2208 then finds no own-key adjustment and applies
   the unadjusted full-row dividend base. This is a missing-key financial error, not a demonstrated prototype
   pollution exploit.
3. **Reproduction and independent expectation.** Run the companion script's four identifier cases. The Roth source
   is not dividend-eligible in this model; the destination holds the transferred dollars for half a year.
   **$300,000 times 10% times 0.5 = $15,000**, independent of its identifier. The actual $30,000 is a full year's
   dividend. The unexpected $347.50 tax is observed secondary movement, not a separate independently requalified
   Arizona tax-law finding.
4. **Consequence and reach.** Dividends and AGI double in the witness, creating an unnecessary tax-funded balance
   reduction. Imported/direct plans can supply this validator-accepted ID even if normal UI-created IDs do not.
   No expanded-corpus member combines a prototype ID, an enabled transfer and enabled dividends. Its existing
   `expansion:s5aa-r14-rmd-prototype-ids` member has both transfers and dividends disabled, so it does not guard this
   new ownership map. The ordinary-ID R28 dividend repair is not universally requalified by its green tests.
5. **Proposed repair.** Use a null-prototype dictionary or `Map` for both held-dollar-year adjustments, with a
   consistent own-key read. Add hand-computed regressions for prototype IDs across paid and reinvested dividends,
   early/late transfers, and the shared browser/worker route. Validate or refuse unsupported IDs at the boundary
   only if the owner deliberately changes the otherwise supported identifier contract.

## Independent Boundary Controls and Gate

The companion reproduction runs on the unchanged frozen source. Its assertions intentionally pin the observed
defects; after repairs they should fail until replaced by the implementer's corrective regression tests.

```powershell
node audit/S5AA/PC/PC_FULL_MODEL_BOUNDARY_PROBES_20260928.js
```

The default helper supplies input shape only. Expected boundary values and the transfer oracle do not call engine
arithmetic helpers. The oracle keeps a chronological balance ledger and grows each account only between events.

| Boundary | Independent Observation |
|---|---|
| Balance exhaustion | $10,000 qualified Roth balance and $12,000 spending ends at $0, with $2,000 shortfall |
| Dated transfer/growth/spending sweep | 4,500 cases, zero discrepancies at half-cent tolerance |
| Sweep domain | Monthly/quarterly/annual draw points; source and destination returns -95%, -10%, 0%, 10%, 200%; transfer dates 0.25/0.5/0.75; requests $0/$10k/$100k/$200k; spending $0/$50k/$105k/$112k/$300k |
| Partial-year compensation | $6,000 annual wages for half a year permits $3,000 IRA contribution, not $1,500 |
| Loss-basis boundary | Selling $10,000 with $15,000 basis realizes -$5,000 and clears both balance and basis |
| Debt payment ceiling | $1,000 zero-interest debt at $200/month pays $1,000, not $2,400; remaining balance and interest are $0 |
| Finite-input overflow | Two $1e308 balances produce `calculation_error`; ordinary rows are null, not published financial figures |

The sweep covers qualified same-class Roth transfers with no taxes, dividends, contributions, death or RMDs. It
rechecks the source-cap and destination-growth/exhaustion failure classes independently; it is not a tax oracle or
a proof of all transfer combinations. Normal-object dividend controls passed; PCF-03 is a counterexample to treating
that repair as complete across accepted IDs.

Local execution: Windows 11 25H2 build `26200.9457` inferred from the read registry build/version pair and Microsoft's
[release table](https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information), Node `v24.17.0`.
`npm test` passed **2,874 of 2,883 tests**, with zero failures, zero skipped and nine existing TODO. Installed
dependencies were reused after offline clean install was blocked by a cache permission error. GitHub Actions listed
zero runs in the new repository, so no CI success is claimed.

The fresh 70-scenario expanded capture is complete and matches the recorded output hash
`4ea4bc9328b5eaad437e7c26e4409f8b1d730003f289ccd0ce11bb0a65ba3707`; its seven invariant checks passed with the
targeted-plan exclusions detailed in the migration report. Snapshot equality and implementation-coupled assertions
are consistency evidence, not independent financial correctness.

## Limits, Existing Exclusions, and Handover

This is a broad model review, not exhaustive financial/legal certification. The complete gate covers many more
paths than the new hand arithmetic, but full Social Security entitlement/mortality calculations, every tax bracket
boundary, every RMD/QCD and year-end Form 8606 interaction, every stochastic distribution, and every standalone
ported module were not independently re-derived. No fresh browser/mobile visual qualification was performed.

The R28 handover's disclosed planned-versus-executed late-transfer dividend approximation, later tax-funding timing,
IRA-pool timing approximation, RMD capacity scaling, reserve-share timing and self-employment compensation deduction
gap are not re-filed as new defects. Neither are the documented early Roth ordering/five-year exclusion, owner-age
pooled-draw approximation, disability/death HSA exceptions, historical-source absence, nine TODO or unresolved
closeout carry-forwards. No milestone or separate R28 change-audit closure is inferred.

**Disposition: NO-GO.** Reproduce PCF-01 to PCF-03 in the supported environment, obtain the owner's transaction-scope
decisions, repair test-first, and declare every changed corpus/headline figure. Requalification must include account
floor/ceiling and identifier controls, not only the original witnesses. This PR adds only the reviewer's two reports
and reproduction script; the owner alone decides repairs, merges, tags, visibility and closure.

