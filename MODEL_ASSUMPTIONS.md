# Model assumptions

**What this is.** The modelling choices your results depend on that are **not
derivable from tax law or arithmetic** — places where more than one defensible
answer exists and this engine picked one.

It is not a list of features, and not a list of known defects. Those live in
[`FEATURES.md`](FEATURES.md) and [`SPRINT_QUESTIONS.md`](SPRINT_QUESTIONS.md).
Everything here is a **decision**, recorded so it can be challenged without
excavating the code.

Created 2026-09-10 to discharge decision-register items P3 and P4, which the
re-audit asked to be "recorded in the eventual public model assumptions".

---

## 1. Tax funded from several cash pools is allocated pro-rata

**The situation.** One tax bill can be funded from more than one pool at once —
proceeds from a required minimum distribution, and each source of outside
income. Which pool pays changes how much of each is left to direct under its
own policy, so the split is a real choice.

**The choice.** The surviving fraction is applied uniformly. That is the
pro-rata split, and it conserves exactly: the per-source residuals sum to the
pooled residual.

**Why.** It is order-independent, so results do not depend on an arbitrary
sequence. The same rule is reused to attribute outside surplus back to pension,
Social Security, other income and dividends, which means one rule to audit
rather than two.

**What was rejected, and it is defensible.** "RMD proceeds are spent first" and
"outside income is spent first" are both reasonable models of a real household.
If you believe a household spends its forced distributions before touching a
pension, this engine will differ from you in mixed cases. Nothing in any audit
requires pro-rata.

*Decision register P3. Recorded at `SPRINT_QUESTIONS.md` Q19(a).*

---

## 2. An account the engine creates mid-year uses the expected return, not a draw

**The situation.** Some settlement paths create a destination account partway
through a projected year — a retained-cash holding, for instance. It has no
entry in the index-aligned array of period returns that every pre-existing
account draws from.

**The choice.** Under Monte Carlo it receives the **expectation** for that
period rather than consuming a random draw.

**Why.** Computing a draw the normal way would advance the shared random stream,
shifting the returns of every later period of every run — moving results far
outside the change that created the account, and making a run non-reproducible
against its own seed.

**Scope, stated precisely.** Under `simple` and `historical` this is *exactly*
what an equivalent pre-existing account receives, because neither method draws
at all. The divergence exists in **one method, for one period, for an account
that did not exist when the period opened**.

**What was rejected.** Consuming the draw and accepting the stream shift. That
is defensible if you think distributional fidelity in that single period matters
more than reproducibility across the run.

*Decision register P4. Recorded at `SPRINT_QUESTIONS.md` Q19(b).*

---

## 3. Outside income always reduces portfolio withdrawals

**The situation.** A household with a pension, Social Security or other income
can be modelled two ways: the income reduces what must be sold from the
portfolio, or the portfolio funds spending regardless.

**The choice.** Outside income **always** offsets the draw. There is no toggle.

**Why.** There used to be one, labelled *"Use outside income before portfolio
withdrawals"*. Switching it off did not merely change sequencing — the household
sold assets for its full spending, received the income, and the income then had
nowhere to go, so it ceased to exist. Portfolio bookkeeping stayed internally
consistent, which is why nothing flagged it.

Both readings of the flag were considered. Neither survived: the setting
duplicated something the app can already express, since a household that wants
its portfolio stressed as though the income were absent can set that income to
zero and get exactly that.

**If you have a saved plan with the setting off**, it is migrated on load and
your projected balances will be **higher** than that plan previously showed.

*Decision register P2. Closes `SPRINT_QUESTIONS.md` Q18 and Q26.*

---

## 4. A benefit claimed before the projection opens indexes at the assumed COLA

**The situation.** If Social Security was claimed before the first projected
year, the entered figure is an FRA-referenced amount that still needs bringing
to the present. The COLA actually awarded in those past years is not available
to the model.

**The choice, and it is explicitly interim.** Those pre-projection years index
at the **configured COLA assumption** — the same rate `simple` and `monteCarlo`
use for every year.

**What it replaced.** In historical mode those years were previously grown on
the projection's *own first history years* — borrowing later calendar years to
reconstruct earlier ones.

**What was rejected.** Not growing at all. The entered figure needs indexing
from the claim forward or a legitimate year of it is silently lost.

**The successor, and why it is blocked.** The correct answer is the real
historical COLA for the calendar years the claim implies. This engine carries
**no calendar anchor at all** — no start year — and its history setting is a
*sequence* start deliberately decoupled from real dates. Supplying one is a
feature with migration consequences, not a repair.

*Decision register P1. Closes `SPRINT_QUESTIONS.md` Q16 with a named successor.*

**Since S5AA R34** (2026-09-29, Q160) the entered benefit is read in today's dollars. A claim after the plan's start
takes every COLA from the start to the claim; a claim before the start is indexed from the claim at the configured
rate, as above; the earnings-based PIA takes its COLAs from eligibility at 62 (20 CFR 404.271). Each COLA'd PIA is
rounded down to the dime and each monthly benefit to the dollar (20 CFR 404.212(c), 404.275(c), 404.304(f)).

---

## 5. Turning dividends OFF does not mean no dividends

**Read this one before interpreting any tax figure.**

With dividend modelling **disabled**, the engine charges an imputed **1.5% of
eligible taxable balances** as qualified dividends. With it **enabled** and the
yield set to zero, it charges nothing.

So the feature switched *on* at a 0% yield produces **less** dividend income
than the same plan with it switched *off*. In one measured scenario the two
differ by **$568.20** of tax.

The imputation is deliberate: a taxable brokerage account realistically throws
off dividends whether or not you have chosen to model them explicitly. Retained
cash holdings are excluded from the imputed base, because cash pinned to a zero
return cannot produce dividend income.

The naming is the trap, not the arithmetic. It is recorded here rather than
repaired because changing it would move every projection that relies on the
default.

---

## 6. Where the debt ledger stops

Each projected year reports debt payments split into **interest**, **principal
reduction** and **housing costs** (property tax, insurance, HOA, PMI), and they
reconcile exactly against total payments.

Two boundaries:

- **Principal reduction can be negative.** A loan whose payment is smaller than
  its monthly interest grows, and the honest figure is negative principal —
  capitalized interest — rather than zero.
- **Monte Carlo carries no breakdown.** Its rows are percentile aggregates
  across runs, and the median of a component need not come from the same run as
  the median of the total, so an aggregated split would not reconcile. Q40
  named three choices: aggregate each component and state that the identity
  fails across percentiles; carry one run's whole breakdown at each percentile
  of the total, which reconciles but is a sample, not a quantile; or keep no
  breakdown. **Decided 2026-09-13: one run's whole breakdown at each
  percentile of the total**, labelled as a sample. It is built with the
  household cash-flow ledger in S103; until then these rows carry no breakdown.

**Exactly which modes, as measured on 2026-09-13 (S4 task 5.2).** The breakdown is on every row in `simple` and `historical`, and on no row in `monteCarlo`.
Two things follow for `monteCarlo`:

- **No check can run on the rows it reports.** That covers the debt ledger and
  any household cash-flow check built on it. Such a check has to run on
  individual paths, before aggregation, and that instrumentation does not exist
  yet.
- **It is unqualified for the household-ledger exit criterion (S4 E4).** That
  criterion can be claimed for `simple` and `historical` only.

**Repair deadline: S103 task 9.7, decided 2026-09-13.** No S5 task holds Q40,
by decision: the ledger that inherits the choice is built in S103
(`S103_TASK_CHECKLIST.md` task 9), and the breakdown is built with it.

`tests/debt-ledger-mode-coverage.test.js` holds these mode lists to the engine.
If any mode gains or loses the breakdown, the test fails until the lists are
corrected.

*Decision register P9. `SPRINT_QUESTIONS.md` Q35 (partial) and Q40.*

---

## 7. What this document does not yet cover

A full household cash-flow ledger — wages, spending, contributions, external
income, debt principal and interest, taxes, transfers and residual destinations
reconciling as actual sources and uses — is **not part of any result**. The
identity every result is checked against reconstructs net worth from
portfolio, assets and debt, and **that cannot establish that a contribution or
a tax payment was actually funded**.

Two findings in the September 2026 re-audit hid behind exactly that gap.

*(Updated 2026-09-13, S4 task 6.)* That ledger now exists **as a test
instrument**, not as a result field. It is defined in `HOUSEHOLD_LEDGER.md`
and checked by `tests/household-ledger.test.js`. Each row either closes
exactly or falls into a named class.

- **Scope:** every row in `simple` and `historical`, and each path of a
  50-path sample in `monteCarlo`, before aggregation. See section 6 for why the
  reported Monte Carlo rows cannot be checked.
- **What it proves:** it goes red on injected unfunded movements.
- **What it does not prove:** working-year rows are bounded, not conserved,
  because the engine models no spending before retirement.
- **What it found:** Q59. Before retirement a plan can make contributions and
  off-budget debt payments that no income funds, and nothing in a result shows
  it.

**The pre-retirement budget boundary (Q59, decided 2026-09-13).** The engine
models no household budget before retirement. Planned contributions, and the
payments of a debt excluded from spending, are treated as funded from outside
the model: nothing in a result shows whether wages covered them. This is a
documented boundary, not a modelled constraint, and no engine output changes
because of it. Two validator warnings will make the common cases visible when
a plan is checked — planned contributions above wages (earned income, for IRA
and Roth), and a debt whose payments are excluded from spending
(`S5_TASK_CHECKLIST.md` block 2q). The ledger's two diagnostic classes stay as
they are.

*Since S5AA R49 (Q188; §28.6) a warning, `WORKING_YEARS_NOT_FUNDED_BY_PAY`, names the first working year whose pay does not cover the contributions and debt payments the engine makes then. It changes no figure; the budget boundary above otherwise stands.*

---

## 8. Insurance will count in net worth from the first year, even for a plan that starts past `selfLife` — **built** (S5 task 2o)

> **Corrected 2026-09-29 (UTC−7), on Claude's full-model audit (SA32F-48), checked directly (`audit/S5AA/R32/SA32F/LIFE-EVENTS/repro-LIFE-07-insurance-doc-stale.js` run against `main`: a plan starting at age 70 with `selfLife` 70 and $250,000 of insurance shows an opening `networth` of $2,250,000 against a total of $2,000,000, i.e. counted).** The heading and the "Today the engine still does not do this" sentence below were stale: `S5_TASK_CHECKLIST.md` task 2o.2 landed this at `4c104e9` (2026-09-14, a private-archive commit — the private repo is archived, kept as the full record). Read the paragraphs below as history; the fix is built.

**Added 2026-09-13, on a decision that was made the same day and belonged here.**
`RESULT_CONTRACT.md`'s written rule (L4b) has always said insurance counts in
`networth` once age ≥ `selfLife`. The engine's opening row disagreed: it
omitted insurance from `networth` whenever a plan's projection **starts**
past `selfLife`, rather than crossing it partway through — a conflict between
the written rule and the code, carried as **C6** and pinned by a
characterization test rather than resolved, since S2.

**Decided 2026-09-13 (the owner): the written rule stands.** Insurance will count in
`networth` from the first row a plan's age is ≥ `selfLife`, including a plan
whose projection opens there. *(**Superseded 2026-09-29 — see the note above §8's heading:** "Today the engine still does not do this" was true on 2026-09-13 and is not true now.)* The engine was aligned to this
in `S5_TASK_CHECKLIST.md` task 2o, **landed** at `4c104e9`;
`tests/result-contract.test.js`'s C6 characterization test became a
conformance assertion in the same commit. *(**Update, 2026-09-29, S5AA R37:** `RESULT_CONTRACT.md`'s own C6 row —
not the plan owner's file — was corrected in R37, and `tests/result-contract.test.js` now asserts "conflict C6,
reconciled (S5 2o)". No longer flagged as outstanding.)*

**What this moves.** Only the opening row's `networth`, and only for plans
with net-worth accounting on, insurance configured, and a start age at or
past `selfLife`. Every other row and every other plan shape is unaffected —
the conflict was specifically about the **first** row of a **late-starting**
plan.

*`S2_CARRIED_WORK_REGISTER.md` §4 (C6); `RESULT_CONTRACT.md` §6 (C6);
`S5_TASK_CHECKLIST.md` task 2o.*

*(Corrected 2026-09-13, later the same day, on a report from
`investment-calculator-84`: the "Two findings..." sentence used to close this
section. It was written at `66a1be0` directly after §7's household-ledger
paragraph and refers to that gap, not to C6 — two later additions to §7, and
then this whole §8, pushed it away from its subject until it read as §8's own
closing line. Moved back to §7, where it was written.)*

---

## 9. Three debt and expense fields are accepted and change nothing — **declared inert until S103**

**Added 2026-09-14 (`S5_TASK_CHECKLIST.md` block 2e), on a decision made 2026-09-13.**
Three fields can be set in the app and pass validation, but the engine does not
read them. Changing any of them leaves every figure in a projection exactly as
it was:

- **`debt.taxDeductible`.** Marking a mortgage or HELOC tax-deductible (the app
  ticks it by default for both) produces no mortgage-interest deduction. The
  engine has no itemized-deduction path at all. The app's debt page already
  says so: deductibility is stored as a planning classification, and
  itemized-interest deductions are not applied.
- **`expenses[].kind`.** An entry marked "Other withdrawal" is handled exactly
  like one marked "Expense".
- **`debt.owner`.** Marking a debt as your spouse's rather than your own
  changes nothing.

**Decided 2026-09-13 (the owner): all three are to be implemented in S103, not in
S5.** They are features, not corrections, and S5 repairs defects only. Until
then they stay in the scenario shape, so nothing a user has entered is
discarded, and they are declared here rather than left silent.

**Where they land is not yet written into a plan.** No S103 task names these
fields yet. `debt.taxDeductible` needs an itemized-deduction path, the same
missing machinery that keeps the federal SALT cap unbuilt
(`S5_TASK_CHECKLIST.md` task 13), and no sprint plan builds one yet.

**Two fields that do nothing by design.**

- **`assumptions.returnPreset`** is a picker in the app that fills in the
  return fields the engine does read. The engine never reads the preset's
  name.
- **`advanced.glideOn`** moves an account's stock share toward
  `advanced.retirementStock` only while asset classes are on
  (`advanced.assetsOn`). With asset classes off, returns come from the single
  assumed rate, and the glide path has nothing to act on.

**Held to the engine.** `tests/inert-scenario-fields.test.js` runs a plan each
way through `runPlan()` and requires identical results, beside a control on the
same object that must move them. If a field starts to matter, the test fails
until this section is updated. If this section stops naming a field that still
does nothing, it fails too.

*`S5_TASK_CHECKLIST.md` block 2e; `SIMULATION_LOG.md` Batches 7–10.*

**Four more, added 2026-09-29 (S5AA R37, SA32F-50; Claude's R32F audit, confirmed by ChatGPT's R32V) — held to the
engine in the same test as the three above:**

- **`debt.mortgageType`, `debt.originalAmount`, `debt.propertyValue` and `debt.loanTermYears`** are recorded for
  reference and change nothing. The projection runs on the balance, rate, monthly payment and payoff age. An
  interest-only loan is modelled by entering its interest-only payment. The debt page says so.

`remainingTermYears` is not inert in the form — it sets the payoff age there — and the engine reads the payoff age;
it is not one of the held fields.

*Since S5AA R49 (Q188; §28.4), where PMI is charged, `mortgageType`, `loanTermYears` and `remainingTermYears` set the PMI default, so they are no longer inert there.*

---

## 10. A household-owned income is timed by the self member's ages

**The situation.** `otherIncomeFor()` decides whose age an other-income
entry's start/end ages are measured against with `i.owner === "spouse"`. An
entry owned by `"self"` or by `"household"` takes the same branch — both are
timed against the self member, not just `"self"` explicitly.

**The choice.** This is accepted as correct, not a defect. A household-owned
income (one belonging to the household as a whole, not to either named
person specifically) is timed by the self member's ages.

**Why.** The self member's ages are always present and always the plan's own
reference clock; a household-scoped income has no natural third clock to use
instead, and timing it against self keeps one consistent convention rather
than inventing a special case for the one ownership value that names no
person.

**What this does not cover.** An **absent** `owner` (as distinct from an
explicit `"household"`) used to reach this same branch silently — that case
is a different question, resolved separately: `Q69` now refuses an other
income with no owner at the input gate rather than timing it against
anyone.

*Decided 2026-09-14, night (the owner). `SPRINT_QUESTIONS.md` Q32 (the
household-owned sub-case); `S5_TASK_CHECKLIST.md` block 2.6.*

---

## 11. No IRMAA surcharge in a plan's first two years, because pre-plan income is assumed below the first tier

**The situation.** IRMAA looks back two years for the MAGI that sets the
current year's surcharge. A plan's own projection carries no history before
it starts, so years 0 and 1 have nothing real to look back to.

**The choice.** Both pre-plan years are assumed to have had MAGI below the
first IRMAA tier — no surcharge applies in plan years 0 or 1, however high
the plan's own income is once it starts. `runPlan()` records one
`IRMAA_PRE_PLAN_MAGI_ASSUMED` warning when health costs are on and IRMAA
would otherwise apply in one of those two years.

**Why.** The alternative the engine used to do by accident — clamping the
lookback to year 0's own MAGI once two years of history do not yet exist —
silently charged the plan's first-year income twice: once at a one-year lag
in year 1, and again correctly in year 2. That is a wrong answer under this
sprint's own wrong-answer-versus-not-modelled test. Assuming a low pre-plan
MAGI is a genuine assumption, not a repair claiming certainty the model
doesn't have — which is why it is disclosed with a warning rather than
applied silently.

**What was rejected.** Reusing year 0's own MAGI as a stand-in for the
missing pre-plan years, which is what produced the double charge. A
three-year lag was also considered and rejected — it doesn't match how
IRMAA actually works.

*Decided 2026-09-14, night (the owner), the S5 run's question 3, answer (A)
(the run's own session-local numbering, not a `SPRINT_QUESTIONS.md` entry).
`S5_TASK_CHECKLIST.md` block 6.6a.*

**Extended 2026-09-29 (S5AA R35): the two years before the plan are now optional inputs.** Entered, the MAGI (and
optionally the filing status) of the two tax returns before the plan price years 0 and 1 directly, and nothing is
assumed for them. A plan opening part-way through a calendar year completes that year for the lookback, at last
year's entered rate or at the first row's own rate, and says which it used. Left blank, the assumption above still
applies. **Also (S5AA R33): IRMAA reads the lookback year's own filing status**, recorded with its MAGI (20 CFR
418.1115); for the two years after a death, the survivor's premium reads the joint returns filed those years. The
top tier includes $500,000 / $750,000 (CMS 2026).

*Since S5AA R48 (Q187; §28.3) the app shows this assumption as the card "Medicare surcharge in the first two years" and the validator prompts for the prior-year income.*

---

## 12. RMD start age reads a whole age, not a birth date — 1949 is treated as "before July"

**The situation.** The RMD start age depends on exactly when someone was
born: 70½ before July 1949, 72 from July 1949 through 1950, and later ages
for 1951 onward (with 1959 itself carrying its own disputed authority
status — see the rules block's `birth1959AuthorityStatus`). The engine does
not store a birth date, only a whole age.

**The choice.** A birth year is derived as `2026 − age`, and that derived
year is always read as **before July** when the month matters (the
1949-only band). Every owner this affects is at least 76 in 2026, already
past every RMD-start age in question, so the choice never moves a result
today — it only affects how those historical rows are labelled.

**Why.** The engine has no finer-grained input to read, and choosing
"before July" versus "July or later" for a birth year the model cannot
actually distinguish needs to default to something; the choice is recorded
here so it is visible rather than an invisible default buried in a
comparison.

*Decided 2026-09-14, night (the owner). `S5_TASK_CHECKLIST.md` task 5a.*

---

## 13. A pre-tax 401(k)'s Roth catch-up is still modelled as pre-tax, even when the rule requires Roth

**The situation.** High earners' catch-up contributions are required to be
Roth once the statutory wage threshold applies (`ACCOUNT §7.4`). A
workplace account in this engine is either pre-tax or Roth as a whole — it
has no way to hold a designated-Roth *portion* inside an otherwise pre-tax
account.

**The choice.** When a pre-tax workplace account's catch-up room is used
and the rule requires Roth (the wage threshold is met, or the wages needed
to check it are missing), the engine still models that catch-up as pre-tax
money. The contribution audit warns when this happens — the warning reaches
the app's contribution check, not a `runPlan()` result field, so no
projected balance moves because of it.

**Why.** Modelling a split account is a real feature (a new account shape,
or a synthetic paired holding) that this sprint's defects-only scope does
not build. Warning rather than silently proceeding keeps the gap visible to
whoever configures the plan, consistent with this sprint's "flag, don't
guess" discipline elsewhere (Q43/Q44/Q45's family).

**What was rejected.** Silently proceeding with no warning — the same
"confident wrong number" shape those other findings share. Refusing the
contribution outright was also considered and rejected: the rule is about
tax treatment, not eligibility, so a refusal would be stricter than the law.

*Decided/repaired 2026-09-14, night (the owner), the S5 run's question 6, answer
(A) (the run's own session-local numbering, not a `SPRINT_QUESTIONS.md`
entry). `S5_TASK_CHECKLIST.md` task 11.*

*Superseded 2026-10-03 by S5AA R47 (Q186; §28.2): above the IRC 414(v)(7) wage threshold, a pre-tax workplace plan's catch-up is deposited as a designated Roth balance in the same plan and taxed that year, and a plan marked as offering no Roth contributions allows none.*

---

## 14. A QCD's exclusion belongs to the IRA's owner, is paid from that owner's own IRAs first, and its annual cap is never prorated

> **Corrected 2026-09-24 (UTC−7), from the S5AA session's combined relay, checked against the engine at `fab88f0` by reading the code that executes. Three statements below are superseded; they are kept as history, and §18 ("QCDs and required distributions") holds the active wording.** (1) The *Situation* says a QCD is requested "against the combined household RMD": a QCD is now paid from age 70½ whether or not a required distribution is due, per person. (2) The *Choice* says a QCD "counts toward the household RMD" and that the rest of the RMD is withdrawn "in the household's ordinary withdrawal order": it counts toward that owner's own IRA obligation only, never a 401(k) or the other owner, and the rest of each obligation is paid from that obligation's own accounts. (3) The *Choice* says that when the owners' shares exceed the household RMD "they are scaled down together, proportionally (provisional)": **there is no scaling**, and a QCD above the RMD is paid in full (the owner, 2026-09-21, the R9 round's Q3, not the verdict's Q3; see §18's citation note). What stays true: the $111,000 per-person cap and the limit by the owner's own IRAs, the exclusion being what was paid, the non-prorated annual cap with `QCD_OPENING_YEAR_CAP_ASSUMED`, and the mid-year-birthday note.

**The situation.** A household can hold more than one traditional IRA, owned
separately by each spouse, and can request a qualified charitable
distribution against the combined household RMD. The statutory exclusion
(26 USC 408(d)(8); IRS Notice 2025-67) is per taxpayer, against that
taxpayer's own IRA distributions — it has no household-pooled form.

**The choice.**
- Each eligible owner (70½ or older) gets a share of the household's QCD
  request: their share of the eligible owners' traditional-IRA balances,
  capped at $111,000 and by their own IRA balance. A spouse with no
  traditional IRA adds no exclusion.
- That share is paid first from the owner's own traditional IRAs, and
  counts toward the household RMD. The rest of the RMD is withdrawn in the
  household's ordinary withdrawal order.
- The exclusion recorded is what was actually paid this way — not the
  requested amount.
- When the owners' shares together exceed the household RMD, they are
  scaled down together, proportionally **(provisional — see §7.2 of the
  2026-09-16 close-out handover)**.
- The annual cap is not prorated by row length. A partial opening row
  assumes no QCD was taken earlier that same calendar year, so the full
  annual cap is available; this is disclosed with warning
  `QCD_OPENING_YEAR_CAP_ASSUMED`.
- Projection rows follow ages, not calendar years. A row that spans a
  mid-year birthday crosses two tax years but applies one annual cap to it,
  rather than splitting the cap across the two years it touches.

**Why.** Pooling the cap and ignoring which spouse's IRA actually funded
the distribution let a household exclude more than either spouse could
individually, and let the exclusion survive even when a 401(k) or the
other spouse's IRA paid the RMD instead of the IRA the exclusion was
attributed to — a "confident wrong number" in the same family as Q43/Q44/Q45.
Funding from the owner's own IRA first, before the household's general
order, is what makes the per-owner exclusion actually true of the money
that moved.

*Decided 2026-09-16 (the owner): Q83/Q84 answer 2 (A) and answer 4 (A)
(`SPRINT_QUESTIONS.md`); S5RR-01 (the re-audit's residual), answer 2 (A) of
the third set. `a2d5d00` (the per-owner cap and the non-prorated annual
cap), `9190ed4` (funding from the owner's own IRA first).*

---

## 15. A recurring income stops the instant its owner reaches its end age, prorated within the row

**The situation.** A recurring income (pension, rental, employment,
investment, Social Security, tax-free, other, self-employment) can carry an
end age. A projection row can span that end age partway through.

**The choice.** The income pays only for the portion of the row before its
owner reaches the end age, prorated within the row — matching the "End
age" label's plain meaning. An income with no end age set is never stopped
by this rule.

**Why.** Paying the income for the row's full duration regardless of where
the end age fell inside it silently overpaid every income whose end age
landed mid-row — the same class of defect as an unbounded percent-mode
spending stage (Q74): a control the UI presents as exact, quietly not
enforced by the engine.

*Decided 2026-09-16 (the owner), Q85 answer 3 (A). `9818a1f`.*

---

## 16. Arizona's return models only the basic standard deduction, the age-65 exemption, and the Social Security subtraction

**The situation.** Arizona's 2026 Form 140 is not yet final (Chapter 140 /
HB 4168), and the full return has provisions this engine does not model:
itemized deductions, the charitable cap for head of household, and others
named in `TAX §5.3`.

**The choice.** Arizona taxable income is computed as: federal AGI, less
federally taxable Social Security (`ENACTED`), less the 2026 basic standard
deduction (`INFERRED` until the final Form 140 — by filing status), less
$2,100 for each person 65 or older (`ENACTED`), never below zero. No other
Arizona subtraction, exemption, or itemization is modelled; what is not
built is named in the disclosure rather than silently omitted.

**Why.** This is the scope the owner chose from the four candidates task 8
presented, not the full return — narrower than "build all of Arizona," and
recorded here so the boundary is visible rather than discovered later by a
figure that should have moved and didn't.

*Decided 2026-09-14, night (the owner), question 5, answer (C) (the S5 run's own
session-local numbering). Held on question 10 (implemented 2026-09-16,
answer (A), `231ddf7`); task 8 itself landed at `917bfa7`.
`S5_TASK_CHECKLIST.md` task 8.*

---

## 17. Result-contract version 3: five named measures on every row, and `magi` as an alias

**The situation.** Downstream consumers (S6, the frozen corpus captures)
need to read specific tax measures off a projection row without depending
on the engine's internal variable names, and without silently accepting a
row shaped for a different contract version than the one they expect.

**The choice.**
- Every row carries five named measures at contract version 3:
  `federal_agi`, `ss_provisional_income`, `senior_deduction_magi`,
  `niit_magi`, `irmaa_magi`. They read 0 on an opening row and the median
  across paths on a Monte Carlo row.
- `magi` is an alias of `irmaa_magi`, not a sixth independent measure.
- **(R10, provisional — see §7.2 of the 2026-09-16 close-out handover.)**
  A capture may declare an older contract version than its producer's only
  when it is a recognised legacy capture of that version; `tools/result-
  contract.js`'s SHAPE check now also reports keys a declared version does
  not define, rather than passing a row with extra, unexplained fields.

**Why.** An un-versioned or silently-accepted-any-version row shape is
exactly how a captured control and today's engine can disagree without
either side raising it — the same failure family the differential harness
exists to catch, applied to row shape instead of row values.

*Decided 2026-09-16 (the owner), Q2 answer (A) (the S5 run's own session-local
numbering). `628bd36` (the five measures at version 3); `c3d8726` (R10's
legacy-version and extra-key checks, provisional).*

---

## 18. What S5AA (R5 to R21) settled about deaths, survivors, basis, settlement, RMDs, dividends and Monte Carlo

**Provenance and how to read this.** Written 2026-09-24 (UTC−7) from the S5AA session's combined relay
(`Handover temp/S5AA_RELAY_TO_EB_20260924_COMBINED_R5_TO_R21.md`, §3), **after a plan-owner check of every
behavioural claim against the engine at `fab88f0`** (`src/engine.js`, `src/app-shell.html`,
`src/scenario-validator.js`): read from the code that executes, not from comments or commit messages. Where the
relay's wording was wider or narrower than the code, the wording below follows the code and says so. The figures
in 18.6 are the S5AA session's; the mechanism was checked, the numbers were not re-derived. S5AA is **NO-GO** (the owner,
2026-09-21) and not closed; these are the engine's behaviours as of `fab88f0`, some of them disclosed assumptions
the owner chose to keep.

**Citing the owner's answers.** *(Updated 2026-09-24, later the same day: on the owner's instruction the answers are now registered as `SPRINT_QUESTIONS.md` **Q115 to Q134**; cite those numbers. The verdict's Q3, Q4 and Q5 are Q115, Q116 and Q117, the R9 round's Q3, Q4 and Q5 are Q125, Q126 and Q127, and the engine's comments that say "Q3 (the owner, 2026-09-21)" mean Q115. The paragraph below describes how they were first recorded and is kept as history.)* They were given in conversation, not as registered `SPRINT_QUESTIONS.md` entries. **Two
sets of questions dated 2026-09-21 both use the numbers Q1 to Q8**, so cite them with their set: *the verdict's
Q1–Q8* (Q3 wages end at a death, Q4 the spousal rollover, Q5 beneficiaries not modelled, Q7 and Q8 the S5b
carries) and *the R9 round's Q3–Q5* (Q3 QCDs from 70½ per owner with no scaling, Q4 dividends, Q5 a tax-free
one-time income type). Neither set is a `SPRINT_QUESTIONS.md` number; the highest real entry is Q114 (checked at `fab88f0`; Q109 to Q114 are dated 2026-09-19), so the next free number is Q115. The D-1 to
D-12 answers are listed in `audit/S5AA/R06/S5AA_R6_EXTERNAL_AUDIT_REPAIR_REPORT_20260921.md` §8 (with D-11 and D-12
added at R8).

### 18.1 Deaths and survivors

- When one spouse dies inside the projection, that person's wages and contributions end at the death, prorated
  within the year, as they end at retirement, and so do employment and self-employment income streams in their
  name. Rental, investment and other streams continue.
- The year of the death is filed jointly; the survivor files as single from the next year. This applies to a
  married-filing-jointly plan; other entered statuses are left as entered. Qualifying surviving spouse and head of
  household status are not modelled.
- Survivor spending reductions start the year after a death, as the filing status does, **and only when the
  "include simplified survivor benefit" switch is on** (the relay stated this unconditionally; the code does not).
- The projection stops at the last death: the final year is the year the last person dies, and its balances are
  what the household leaves. A one-person plan stops at that person's death. Beneficiaries, inherited accounts and
  estate taxes are not modelled. A plan in which nobody is alive at the start is refused (`NOBODY_ALIVE_AT_START`,
  a `runPlan` refusal).
- Medicare costs after a death count only the living, from the year after the death. The Roth IRA income limit
  follows the survivor's filing status: joint in the year of death, single after. The HSA family contribution limit
  after a death is a matter of health coverage, not filing status; with no coverage input, the plan keeps the limit
  the entered status implies.
- ~~The pension is assumed to continue in full to a surviving spouse (a 100% joint-and-survivor annuity), disclosed
  by `PENSION_AFTER_DEATH_ASSUMED`.~~ **Superseded 2026-09-29 (S5AA R35): an other-income pension stream pays its
  entered survivor share after its owner's death. Absent, it is 100% and the result says so** — the recommendation
  of record kept the same default, but it is now a stated field rather than a fixed assumption. In the year of a
  death it is paid as in any year the person lived in.
- **What passes to a surviving spouse** (the owner, 2026-09-21; disclosed as assumptions). The survivor takes the
  deceased's IRAs, Roth IRAs, 401(k)s and Roth 401(k)s as their own from the year after the death (the spousal
  election, Treas. Reg. 1.408-8(c); IRC 402(c)(9)), with any nondeductible IRA basis. A required distribution the
  deceased had not taken in the year of death is still due on their schedule. Keeping an account as an inherited IRA
  instead is not modelled. An HSA passes as the survivor's own, which is right only if the survivor is its
  designated beneficiary. *(**Superseded 2026-09-29, S5AA R35 (Q161, `beb246a`), on Claude's full-model audit
  (SA32F-17) and its D4 refinement ("a loss also resets"): the paragraph immediately below is built. The struck
  claim — "no step-up (or step-down) at death is applied" — was wrong even before the repair for a solely-owned
  account (IRC 1014(a) steps it up regardless of titling or state law); the stated reason covered joint accounts
  only.)* ~~A taxable account, including a joint one, passes with the decedent's cost basis: no step-up (or
  step-down) at death is applied, because how much is stepped up depends on titling and state law the plan does not
  record, so the survivor's capital gains are overstated.~~ **A taxable account's basis resets to its value when it
  passes, up or down (IRC 1014(a)): the decedent's own accounts in full, and a joint account half, the decedent's
  assumed share (2040(b)). The value is read at the first row after the death. Community property (1014(b)(6)) is
  not modelled.** Custom accounts pass
  like an IRA of their tax class.
- An IRA, workplace plan or HSA belongs to one person. The validator refuses any other owner (joint is allowed only
  on taxable and custom accounts).
- **Refinements, S5AA R43** (the owner, 2026-09-30; registered as Q175 and Q178; written 2026-10-02 from the R43 relay,
  each sentence checked against the code and its test at `c05208c`):
  - ~~**Survivor costs start at the death when the survivor has no salary** (the owner's ruling, Q178). If the self dies
    after the start and before the retirement age, and the spouse is alive at that death with no salary in their work
    window, the household's retired spending (with its anchor and inflation latches), health costs and retirement-span
    debt payments start at the death, not at the dead self's retirement age. Pensions, wages and contributions still
    follow the retirement age, and with a salary nothing changes. This does not depend on the "include simplified
    survivor benefit" switch. **Not moved by it:** the long-term-care cost keeps its own start (the later of 65 and ten
    years after the retirement age), and the "years of spending in reserve" is still sized only from the retirement age.
    Before R43 these costs waited for the dead self's retirement age, within the declared Q59 and §7 boundary.~~ *Replaced 2026-10-03 by S5AA R45 (§27; Q183): a death before retiring starts the household's costs at the death (the primary's, whatever the spouse earns; an earning spouse's, whatever the primary earns), and the cash reserve and the spending strategy's starting balance now read the household date. Long-term-care onset still keys to the primary's retirement age (the owner, 2026-10-02).*
  - **The survivor test in the row of a death.** With the survivor-spending switch on and a spouse in the plan, the
    spending strategy's survivor test reads who is alive at the row's opening, even when a retirement falls inside the
    row (SA42F-29).
  - **A required distribution in the first distribution year.** The rule above, that an untaken required distribution
    is still due on the deceased's schedule, has an exception: an owner who dies inside the first distribution year (the
    year they reach their start age, or, for a still-working participant's current-employer 401(k), the year they
    retire) owes none for it, because they died before the required beginning date (26 CFR 1.401(a)(9)-2 and -3;
    SA42F-03). A 401(k) that is not a current-employer plan follows the IRA first-year rule.
  - **Medicare.** Each living person of 65 or over is charged Medicare from the household's retirement; a spouse who
    stopped working earlier is charged from the date they stopped, while the self still works (SA42F-11). A working
    person of 65 or over is not charged while they work. Costs before Medicare keep their household rule. Whether a
    spouse on a working partner's group plan would pay Part B is not modelled, and is disclosed.
  - **A spouse's account with no spouse.** With no spouse in the plan, an account owned by "spouse" is read as the only
    person's account, and the validator warns `SPOUSE_ACCOUNT_WITHOUT_SPOUSE` (SA42F-04).
  - **Succession, since S5AA R48.** A survivor under 59½ at the death holds the deceased's traditional IRAs as an inherited IRA, and the community-property switch changes the basis rule above (§28.3; Q187).

### 18.2 Cost basis and capital gains

Replaces any percentage-basis description of the model.

- A taxable account's cost basis is tracked in dollars. It starts at the entered basis percentage of the opening
  balance (`basisPct` is now only that opening input). Growth does not add basis; contributions and reinvested
  dividends do. A sale is taxed on its share of the gain, or realises its share of the loss. All gains are treated
  as long-term. (S5AA workstream B, `235eb5f`.)
- A net capital loss offsets up to $3,000 of other income a year, and the rest carries forward. A year uses only as
  much of the loss as its taxable income can absorb; the rest still carries (`8566c9c`). The deduction is taken
  whatever the other income, so it can lower taxable Social Security, and adjusted gross income can be negative, as
  on Form 1040. Qualified dividends and net gains keep their lower rates up to taxable income. Net investment income
  for the 3.8% tax includes the deductible loss.
- A loss belongs to the owner of the account that realised it (a joint account's to both). When a spouse dies, their
  unused loss ends with their final return and does not pass to the survivor (`dbf2f5d`).
- **Retired limitation:** "net investment income is reduced only by the part of the loss taken against qualified
  dividends" is no longer true. Any place that states it should be read as superseded.

### 18.3 IRA basis, the annual settlement, QCDs and required distributions

- **Form 8606 basis** is kept per person and does not cross between spouses **while both live; at a death the
  survivor takes the decedent's basis with the account (18.1)**. Each IRA distribution is taxed when it happens at
  the owner's basis over their IRA balance then. At the year's end each owner's year is settled as Form 8606 does
  it: the year's nondeductible contributions count as basis for that year, including for a conversion, and the
  fraction uses the December 31 value plus the year's distributions and conversions. Any difference in tax is paid,
  or refunded, the next year. A 401(k) is not part of it. A refund from the settlement is treated as other income
  for the surplus policy. (S5AA workstream A, `31a7895`; result-contract version 5.)
- **QCDs** (this supersedes the superseded parts of §14). A qualified charitable distribution is paid from each
  eligible person's own traditional IRAs from age 70½, whether or not a required distribution is due; it counts
  toward that owner's IRA obligation once one is due (never a 401(k) or the other owner), and is capped per person
  per year. It comes from the taxable part of an IRA first and uses no basis. **It is never scaled down**: a QCD
  above the required distribution is paid in full. Deductible IRA contributions made at 70½ or older reduce the part
  of later QCDs that is excluded from income, tracked per owner and ending at their death. In the year of a death, a
  QCD may be paid from the decedent's IRA on the decedent's age.
- **Not modelled:** Publication 590-B Worksheet 1-1's order for a partly deductible contribution in a year with a
  distribution (the deduction is figured before the settlement); re-figuring the 10% early-distribution tax after
  the settlement; and the tax ledger for Monte Carlo results.
- **Required distributions.** When a Roth conversion or a transfer draws on an owner's IRAs or a workplace plan in a
  year a required distribution is due, the required amount is treated as taken out first, as the law requires, so
  the year's return does not change it. Where an owner has more than one account it can come from, it is taken from
  the accounts in the same order the distribution itself is paid. The money it is owed from is reserved obligation by
  obligation (an owner's IRAs together, each employer plan on its own), so one person's balance never frees
  another's.
- A transfer from a pre-tax account to a taxable account is a distribution, and counts toward that account's required
  distribution for the year (for an IRA, toward the owner's IRAs together); only what is still owed after it is
  withdrawn (`4b5aff1`, with `dcd7247`; S2 carried item U1).
- If an account cannot pay its required distribution (for example, after a deep loss), the shortfall is shown as
  unmet. The IRS excise tax on a missed RMD is not modelled. A projection is refused only when the model promised to
  protect a distribution and failed to.
- **The 10% early-withdrawal tax** applies only to the taxable part of an IRA withdrawal; nondeductible basis bears
  none. It and the Rule of 55 depend on the age of the account's owner, not the primary person's. The Rule of 55
  applies only to workplace plans, never to IRAs. After a death the survivor treats the decedent's IRA as their own,
  so a survivor under 59½ owes the 10% on it.
- **Age 59½ inside a projection year** (the owner, 2026-09-24: "Keep it and disclose it"; S5AA R24, `0acc073`). Projection
  years follow ages, and a year's spending, one-time expenses and tax funding are drawn as one amount with no date
  inside the year. That draw is judged at the age the year opened at. So in a year that opens before 59½ and ends
  after it, the whole draw owes the 10% additional tax on its pre-tax part, and a Roth draw in it is flagged as
  outside the supported domain. Part of that draw may in fact fall after 59½, so this errs toward more tax and more
  flagging. A scheduled transfer has a date and is judged at it. The engine's own comment and the flag's message say
  the same (read in the code 2026-09-25). *Reported by the S5AA session, not re-measured here:* on r15, 3 of 70 members
  pay more 10% than a split year would charge, and `expansion:s5aa-gap-early-retiree` pays $8,820 more lifetime tax.
  The alternatives not chosen (Q137) can be decided with the engine rebuild. **Since S5AA R37 (SA32F-44), the HSA's
  20% additional-tax exception to the age-65 rule follows the same convention:** a year that opens before the
  owner turns 65 and ends after it has its whole non-qualified HSA draw charged the 20%. **Since S5AA R39, a QCD
  follows the same convention at 70½:** it is available from the first projection year that starts at 70½ or older
  (IRC 408(d)(8)(B)(ii) allows one from the day, but the plan records no gift date), declared and stated on the
  form. 59½, 65 and 70½ are to be decided together at the engine rebuild.
- **Required distributions, two more conventions** (S5AA R35). A spouse more than ten years younger who is the sole
  beneficiary gives the Joint and Last Survivor Table (26 CFR 1.401(a)(9)-5(c)(2)), the default of record when the
  plan doesn't say otherwise. A current employer's 401(k) owes no required distribution while its non-5%-owner
  participant still works there (401(a)(9)(C)); "current employer" defaults to whichever plan still receives
  contributions. **A workplace plan that passes to a surviving spouse is not the survivor's current employer's
  plan** (S5AA R39, repairing ChatGPT's R38-05): the still-working exception does not follow an inherited plan,
  including where the current-employer flag was only inferred from the contribution field. **The Rule of 55 needs
  the owner's separation at 55 or later, or earlier in the year they turn 55** (S5AA R39, repairing ChatGPT's
  R38-02; IRC 72(t)(2)(A)(v): "after separation from service after attainment of age 55", which the IRS reads as a
  separation "during or after the year the employee reaches age 55"). A separation at 55 or later qualifies
  outright; the calendar-year reading, on the plan's birth-year convention, still admits a separation earlier in
  the year of 55; the switch itself is read as the owner's certification that this holds, with the separation year
  enforced against the entered age.
- **A required distribution reads the age the owner reaches in the distribution year** (S5AA R40, `d51d30d`, corrected
  at `3fbe9dc`; the owner, 2026-09-30: "Repair all four now"). The RMD start and the Uniform Lifetime divisor use the
  engine's own birth year, 2026 less the whole age at the plan's start (§12), counted forward (Publication 590-B: "use
  your age as of your birthday in 2026"). For the self that is the row's opening age, as before. With a fractional self
  start, a spouse whose fraction was smaller than the self's had read an age a year short, so their first RMD year was
  skipped and the divisor a year young. R40 first read the calendar age at the row's close, which disagreed with the
  birth year the start age uses; the corrected reading agrees with it by construction. Witness:
  `tests/audit-s5aa-r40-spouse-rmd-age-reached.test.js`.
- **Conversions and transfers.** A conversion goes only into a Roth-class account of the same owner. A traditional
  IRA converts into a Roth IRA (or a custom Roth account); a 401(k) may convert into a Roth-class account of the same
  owner, including its own Roth 401(k). A manual transfer from a pre-tax account into a Roth account is a Roth
  conversion and follows the same rule. (The relay described this more narrowly than the code allows.)

### 18.4 Dividends, income, health costs and strategies

- With the dividend option on, the dividend is taxed every year: reinvested (and taxed) before its payout age, then
  paid as cash. With it off, the return assumptions already include reinvested dividends, so an **imputed 1.5% yield
  is taxed each year from the start of the projection, as qualified dividends, and added to cost basis** (the owner,
  2026-09-22: keep it, because it is the tax on reinvested dividends). `dividendStart` means when modelled dividend
  cash starts being paid out to spend (S5AA 12.9 (b): no output change). *(Corrected 2026-09-24 (UTC−7), on ChatGPT's R22-02 finding, relayed by the S5AA session and checked against the R9 witness `tests/audit-s5aa-r9-dividends-taxed-every-year.test.js` and commit `823666b`. This paragraph first ended with a "Known gap, carried to S5b task 1", saying that with the option on the engine taxes nothing on dividends before retirement. **That was wrong, and contradicted this bullet's own first sentence:** it was repaired at `823666b` on 2026-09-21. Both paths now tax dividends from the first year: with the option on, the entered yield, reinvested before its payout age; with it off, the imputed 1.5%. The S5b task 1 note that describes a gap predates that repair and no longer applies; it is S5b plan text and waits for the owner's S5b go.)*
- A one-time income can be entered as tax-free (a gift or an inheritance).
- Health costs are priced per living person: each person under 65 carries an equal share of the entered pre-Medicare
  cost, and each person 65 or over is charged Medicare.
- **The long-term-care cost grows at healthcare inflation** (S5AA R40, `8f20d90`; the owner, 2026-09-30: "Repair all
  four now"). It is entered in today's dollars and grows at the plan's healthcare inflation from the plan's start, as
  the pre-Medicare health cost does. The insurance benefit stays at its entered amount, since a policy's benefit does
  not rise without an inflation rider, which the plan does not model. Witness:
  `tests/audit-s5aa-r40-ltc-cost-inflated.test.js`.
- **Each person on Medicare pays the Part D base beneficiary premium** (S5AA R40, `d1572b1`): $38.99 a month in 2026
  (CMS's annual release of July 28, 2025; 42 CFR 423.286(c); the figure was re-read at CMS on 2026-09-30). It stands in
  for a plan's own premium, and the IRMAA surcharge is added on top of it. Witness:
  `tests/audit-s5aa-r40-part-d-base-premium.test.js`. Registered as `SPRINT_QUESTIONS.md` Q172.
  *(Since S5AA R48 an entered Part D premium replaces this base premium and Medicare premiums grow; since R51 each person's costs start at their Medicare start or the household date, whichever is later: §28.3.)*
- VPW and the RMD-style strategy divide by the years the projection models (to the last death or the projection's
  ending age, whichever comes first), and a final part-year is a fraction of a year. The VPW maximum annual rate still
  applies, so at a 100% cap a final part-year cannot draw the whole balance.

### 18.5 The tax ledger, the glide path and allocation keys

- "Taxes" in a year is the tax paid that year: the year's own tax plus any settlement from the year before. Lifetime
  tax is the tax assessed: the sum of each year's settled tax. A tax still owed at the plan's end comes off the
  ending net worth. If the money left cannot pay it, the plan fails in its last year.
- With asset classes on, the glide path moves an account's stock share toward the retirement target, and the rest of
  the account scales with it. Both the expected return and the Monte Carlo volatility use that same moving
  allocation. An account that holds only stocks glides into bonds **when the plan defines a bonds class**; with no
  bonds class, it keeps its allocation. The optimized order's down-year ranking of accounts still uses each
  account's starting allocation.
- Every weight in an account's allocation must belong to one of the plan's asset classes. A backup whose account
  names a class the plan does not define is refused on import (`UNKNOWN_ALLOCATION_CLASS`, an ERROR). A plan already
  saved in the browser is not re-checked when the app opens.

### 18.6 Monte Carlo: each account's return is drawn independently (the owner, 2026-09-23: disclose now, change in the engine rebuild)

~~In Monte Carlo, each account's return is drawn independently. Splitting the same investments across more accounts
therefore makes the portfolio look less volatile than it is: the S5AA session measured that with ten equal accounts,
a 20% volatility behaves like about 6.3%, and that in one tested retirement example the success rate rose from 35.9%
to 48.3% with no economic change (its figures, one example; the mechanism is confirmed in the engine, the numbers were
not re-derived here). Monte Carlo percentiles and success rates overstate diversification for households with several
accounts. This is to be replaced by shared market shocks in the CPU engine rebuild. It relates to Q45's correlation
calibration and Q66's per-account reserve; it is carried as row U6 of `S2_CARRIED_WORK_REGISTER.md`.~~ *Superseded 2026-10-03 by S5AA R46 (§28.1; Q185): the draws are one set of correlated asset-class shocks per year, shared by every account, and row U6 is repaired in the old engine.*

**Refinement, S5AA R43 (SA42F-31; written 2026-10-02):** each path's market and care generators are seeded with a 32-bit mix of
(seed, path, stream). They were seed + 2i and seed + 2i + 1, so two seeds 2 apart shared all paths but one. Every Monte
Carlo figure moved once, and the expanded baseline is r22 (then r23, Q179). This is a change of seeding, not of the
distribution.

*Decided 2026-09-21 to 2026-09-23 (the owner), in the S5AA session's chat, as itemised in the relay's §6 (the verdict's
Q3–Q5 and Q7–Q8, the D-1 to D-12 answers, the R9 round's Q3–Q5, and the 2026-09-22 and 2026-09-23 decisions); none
was a `SPRINT_QUESTIONS.md` entry when this section was first written; they are now Q115 to Q134. Landing commits named above; the rounds are indexed in `audit/S5AA/README.md`.*


---

## 19. Spending stages, debt payoffs and scheduled transfers are dated inside a projection year (S5AA R25)

**Provenance.** Written 2026-09-26 (UTC−7) from the S5AA session's relay (`audit/S5AA/R25/S5AA_RELAY_TO_EB_20260925_R25.md` §2)
and its R25 response (`audit/S5AA/R25/S5AA_R25_EXTERNAL_AUDIT_RESPONSE_20260925.md` §3 to §5), after ChatGPT's R24F
audit found four priority-2 findings. The owner's answers were given to the S5AA session and are **as reported by it**. The
statements were checked against the R25 witness tests named below and the engine on `main` at `ea8f155`; the worked
dollar figures are the S5AA session's and were not re-run here. S5AA is NO-GO and not closed.

- **A spending stage's end age is the last year it covers** (the owner, 2026-09-25; `9a40562`, R24F-01). A whole-year stage
  from 65 to 66 covers the years opening at 65 and at 66, so ages 65 up to 67, in continuous age `[start, end + 1)`.
  A stage whose start or end falls inside a projection year applies to that part of the year, prorated by time (the
  year spends the time-weighted average). The other reading, "the moment the stage ends", would have made every
  existing whole-year stage lose its last year (all 17 in the corpus, golden scenarios among them), so it was not
  chosen. A year that no boundary splits is evaluated directly, so whole-year figures are unchanged. Witness:
  `tests/audit-s5aa-r25-stage-prorated-by-age.test.js`.
- **A debt's payoff age takes effect in its month** (the owner, 2026-09-25; `aeba9a0`, R24F-03). A debt with a payoff age
  inside a projection year is paid off in that month, with interest only to then, and its balance is settled there. A
  payoff at a year boundary, or before the year began, runs as before. Witness:
  `tests/audit-s5aa-r25-debt-payoff-at-its-month.test.js`.
- **A scheduled transfer moves on its date** (the owner, 2026-09-25; `4b7d516`, R24F-02). The moved dollars earn the source
  account's return until the transfer date and the destination's after it. The transfer's tax and its RMD credit are
  still computed in its year, as before, and a transfer's age tests use its own age (§18.3, S5AA R24), so a transfer
  is dated throughout. Witness: `tests/audit-s5aa-r25-transfer-growth-at-its-date.test.js`.
  *(Refined 2026-09-26 by S5AA R27: a transfer is also capped at what its source holds on its date, and the loss the
  moved dollars took before the date is borne by the destination; see §20, `5f48505` and `73e24c7`.)*
- **The engine refuses a plan value the validator rejects as not a number** (the owner, 2026-09-25; `95bf5d0`, R24F-04):
  `SCENARIO_NONNUMBER_PLAN_VALUE`, an ERROR that names the field and returns no rows (`RESULT_CONTRACT.md`). A NaN
  Monte Carlo seed is now refused; an absent seed still means 0.
- **A stage amount or income stream is in today's dollars in every growth mode** (S5AA R43, SA42F-20; the owner, 2026-09-30,
  Q175): one that starts after the plan's start latches the inflation factor at its start, and a one-time income keeps its
  entered amount. "Years of spending in reserve" is sized on the projected spending once the household is retired
  (SA42F-21), and an other asset that becomes available inside a row covers the part of that row's need after its date
  (SA42F-19).

*Decided 2026-09-25 (the owner), as reported by the S5AA session; registered as `SPRINT_QUESTIONS.md` Q138 to Q142.*


---

## 20. IRA contributions are limited by compensation; an IRA deduction has one rule; a mid-year transfer is capped at what its source holds; PMI is charged while the mortgage has a balance (S5AA R26 and R27)

**Provenance.** Written 2026-09-26 (UTC−7) from the S5AA session's R26 and R27 relays (`audit/S5AA/R26/S5AA_RELAY_TO_EB_20260926_R26.md`,
`audit/S5AA/R27/S5AA_RELAY_TO_EB_20260926_R27.md`). The owner's answers were given to that session and are **as reported by
it**. Checked by the plan owner: the commits exist on `main`; the r17 baseline differs from r16 in exactly the four
members named; the compensation rule and its Publication 590-A citation are in `src/engine.js` (line 118); and the R27
known-gap witness was run on `main` and reproduces the negative destination balance. The dollar figures and the
Publication 590-A reading are the S5AA session's and were not re-derived, and IRS citations remain unchecked (S5AA task
8.6). S5AA is NO-GO and not closed.

- **IRA contributions and compensation** (the owner, 2026-09-26: "Enforce it"; `5a928d5`). Traditional and Roth IRA
  contributions together are limited to the owner's taxable compensation (IRS Publication 590-A). Compensation is
  salary, plus employment and self-employment income, less the owner's pre-tax workplace and HSA contributions. On a
  ~~joint return the couple shares their combined compensation (the spousal IRA).~~ *Replaced by S5AA R43 (the owner, 2026-09-30; Q176): on a joint return the spouse with the higher (or equal) compensation is limited to their own compensation, after pre-tax workplace deferrals and HSA contributions, and the spouse with less is limited to their own plus the other's, less the other's IRA contributions (IRC 219(c)(2)). Before R43 the couple shared one pool, so the higher earner could use the lower earner's pay. A joint return here means married filing jointly with the spouse in the plan.* An amount over the limit is handled as
  a dollar-limit excess is: under the default redirect policy it goes to a taxable account. Self-employment income is
  counted in full, without subtracting the deductible half of self-employment tax. It moved 4 of 70 corpus members
  (`seed:2`, `seed:10`, `seed:14`, `seed:17`), each of which had contributed to a Roth IRA on a $0 salary; baseline r17.
  Witness: `tests/audit-s5aa-r26-ira-compensation-limit.test.js`.
- **An IRA deduction larger than ordinary income** (the owner, 2026-09-26: "Same rule in both"; `0b90445`). It reduces AGI,
  and with it the dividends and gains taxed at the preferential rates (IRC 62(a)(7), 1(h)(1)). The tax-funding quote and
  the final tax now use the same figure. No corpus figure moves. Witness:
  `tests/audit-s5aa-r26-ira-deduction-one-rule.test.js`.
- **A mid-year transfer moves at most what its source holds on its date** (the owner, 2026-09-26: "Move what's there";
  `5f48505`, follow-up `73e24c7`). This refines §19: a transfer "moves on its date" and is now capped. It moves its
  opening balance at the year's return for the part of the year before the date. If the year's withdrawals draw on the
  source too, the loss the moved dollars took before the date is borne by the destination (`73e24c7`); a transfer's
  source drawn by the year's withdrawals ends at zero, not below. Witness:
  `tests/audit-s5aa-r27-transfer-capped-at-date.test.js`.
- **Superseded by S5AA R28 (`56c8847`): this limit no longer holds; see the R28 block below.** ~~**Known limit, kept by the owner's decision** (2026-09-26: "Keep R27, record the gap"). If the household runs out of money
  in the transfer's year, no account is left to bear that loss: an account ends negative (`NEGATIVE_ACCOUNT_BALANCE`),
  and a Monte Carlo run with such a path is refused. Alternatives not chosen: move the money physically at the engine's
  withdrawal point, or go back to moving it at the year's opening. Witness (run here on `main`; the destination ends at
  −$2,565.84): `audit/S5AA/R27/S5AA_R27_KNOWN_GAP_WITNESS.js`. Registered as Q148.~~
- **Mortgage PMI is charged only for the months the mortgage has a balance**, including after a payoff inside the
  year (the owner, 2026-09-26: "PMI while owed"; `7318d89`). Witness: `tests/audit-s5aa-r27-pmi-while-owed.test.js`. (Q113,
  that PMI never cancels at an LTV threshold, is a separate, still open item. *Since S5AA R49 a conventional mortgage's PMI stops after the midpoint of its amortization by default; the automatic 78% rule is still not modelled: §28.4.*)

*Decided 2026-09-26 (the owner), as reported by the S5AA session; registered as `SPRINT_QUESTIONS.md` Q144 to Q148 (and Q143's
repair).*

**S5AA R28 and R28.1 refine this section** (written 2026-09-30 (UTC−7), late, from the S5AA session's R28 relay of 2026-09-26,
`audit/S5AA/R28/S5AA_RELAY_TO_EB_20260926_R28.md`, which was not placed before the repository moved). The commits are
inside this repository's first commit, not in its own history. Checked by the plan owner: the six commits exist in the
private history and are all ancestors of `ee9757d`; the engine's own comments on current `main` describe the IRA rule,
the transfer-after-the-draw rule and the dividend and yield rule in the terms below; and the Q148 witness, run at each
commit of the round and on `main`, shows the known limit above closing at `56c8847`. The general statement below that
neither account ends below zero is the relay's; only that one witness plan was run here. The owner's answers were given to
the S5AA session and are **as reported by it**. Registered as Q170, with refinements noted on Q144 and Q146 and Q148
closed.

- **The IRA compensation limit is applied once, to dollars** (ChatGPT's R26-01; the owner: "Repair"; `6938519`). The
  IRA contributions credited in a year are at most the compensation actually earned in it: the salary over the months
  worked, plus the employment and self-employment income received, less the pre-tax workplace and HSA contributions
  credited. R26 had compared rates and then multiplied by the contribution duration, prorating a wage stream that
  ended inside the year twice. This refines the first bullet above.
- **A mid-year transfer runs at the source's value on its date** (ChatGPT's R27-01; the owner: "Repair"; `56c8847`;
  R28.1, R27F-01, `227635e`). The source gives up, and the destination receives, the value on that date: at most what
  the source holds then, at the year's returns for the part of the year before. Its basis and tax follow from what
  moved, and neither account ends below zero. **The known limit above, a household that runs out of money in the
  transfer's year, is closed.** If the date falls after the point in the year where spending is drawn (half way through
  for monthly timing, 0.625 for quarterly, the end for annual), the spending is drawn first, and the transfer then moves
  at most what the source has left (the owner: "Repair in R28.1"; `c480f72`).
- **Yield on moved money follows the money** (ChatGPT's R27F-02; the owner: "Repair"; `5a5cb39`; the imputed-yield case
  `62e263d`). Dividends, paid or reinvested, and the imputed 1.5% yield with dividends off, count for the account that
  held the moved money in each part of the year, each only if it is taxable. A taxable destination is no longer paid
  dividends on money that had not yet arrived. (Q154, from R30, covers the destination's dividends for a transfer dated
  after the draw.)

---

## 21. What a transfer is depends on the two accounts (S5AA R29)

**Provenance.** Written from the S5AA session's R29 relay (`audit/S5AA/R29/S5AA_R29_RELAY_TO_EB_20260928.md`), checked
against `main` at `df8f8b4`: the six R29 commits exist and the test file names (`tests/audit-s5aa-r29-*.test.js`) match
every rule below. The owner's decisions were given to the S5AA session directly and are **as reported by it**. Two
priority-1 findings on the audited source (`s5aa-r29.1-source` = `aaff3f1`) were open when this section was first
written — R29-01, a late-in-year transfer capped by the contribution-room rule still removed the requested dollars
from the source's dividend base for the rest of the year; R29-02, a traditional-IRA-to-HSA funding transfer never drew
down the IRA's nondeductible basis. **Neither changed the categorisation below**, and both are now repaired: see §21.1
and §21.2, added 2026-09-28 from the S5AA session's R30 relay (`audit/S5AA/R30/S5AA_R30_RELAY_TO_EB_20260928.md`),
checked against `main` at `bf9c6ef` (the three R30 commits exist and the test file names match).

- A transfer between accounts of the same tax character is a rollover, or an in-kind move between taxable accounts: it
  moves untaxed and outside every limit. *(Refined by S5AA R32, 2026-09-28: a rollover stays with its owner, a Roth IRA
  cannot roll into a 401(k), and an IRA rolls only its taxable money into one. See the three bullets after the next one.)*
- Pre-tax into a Roth-class account is a conversion.
- Pre-tax into a taxable account is a distribution.
- **Into a 401(k) from a different kind of account, it is refused.** A 401(k) takes payroll, same-character rollovers
  and conversions only. Witness: `tests/audit-s5aa-r29-transfer-into-workplace-refused.test.js`.
- *Added 2026-09-30 (UTC−7), late, from the S5AA session's R32 relay (`audit/S5AA/R32/S5AA_R32_RELAY_TO_EB_20260928.md`),
  which was not placed before now. Checked by the plan owner: the three R32 commits are in this repository's history
  (`0413792`, `8ef84d3`, `3017351`), each rule below has a test of that name under `tests/audit-s5aa-r32-*.test.js`, and
  the engine's own comments on `main` state each rule as written here. The owner's decisions were given to the S5AA
  session directly and are as reported by it. Registered as Q171.*
- **A traditional IRA into a 401(k) rolls its taxable money only** (ChatGPT's R30A-01; the owner: "Move taxable part
  only"; `8ef84d3`). IRC 408(d)(3)(A)(ii) and (H): what goes into an employer plan may not exceed the part includible in
  income, and the part rolled over is treated as income first, across all the owner's IRAs. So at most the owner's IRAs
  on the date less their basis moves; the after-tax money stays in the IRA, with a warning. Before R32 the after-tax
  money went in as pre-tax, its basis stayed on an empty IRA, and the 401(k) was taxed in full.
- **A Roth IRA cannot roll into a 401(k)** (ChatGPT's R30A-02; the owner: "Refuse it"; `0413792`; Publication 590-A). The
  transfer is refused, including into a Roth 401(k). A designated Roth account into a Roth IRA is still a rollover.
- **A rollover stays with its owner** (ChatGPT's R30A-03; the owner: "Refuse it"; `0413792`). Between two of the named
  retirement or HSA accounts of one kind (traditional IRA, traditional 401(k), Roth IRA, Roth 401(k), HSA), a transfer to
  the other spouse's account is refused while both are living (IRC 408(d)(3)(A), 223(f)(5)). A divorce instrument, a
  QDRO and a death are separate paths, and marriage alone is not one. Transfers between different kinds, taxable gifts,
  the custom accounts and the handling at a death are unchanged.
- **Known limit (R32):** a rollover into a 401(k) measures the IRA's basis as it stands on the date, without that year's
  nondeductible contributions.
- **Into an IRA or an HSA from a different kind of account, it is a contribution**, held to the room the year's planned
  contributions leave: the IRA limit and compensation, or the HSA limit. Under the redirect policy only what fits
  moves and the rest stays in the source; under warn all of it moves, with a warning. Witness:
  `tests/audit-s5aa-r29-transfer-as-contribution.test.js`.
- Into a traditional IRA it is deductible under the IRA deduction rule (§20). Into an HSA it is a direct contribution,
  deducted above the line.
- **A traditional IRA into its owner's own HSA is a qualified HSA funding distribution:** tax-free, not deductible, and
  within the HSA room, and it counts toward the year's required distribution (S5AA R30, §21.1 below). Witness:
  `tests/audit-s5aa-r29-ira-to-hsa-funding.test.js`. *(R29-02, repaired at `bf4d3d8`: the funding amount comes out of
  the IRA's taxable value first, and only the rest draws down its nondeductible basis, per IRS Notice 2008-51 —
  §21.2 below.)*
- **Out of an HSA into any other account, it is an HSA distribution:** the account's includible share is income, plus
  20% before its owner is 65. Witness: `tests/audit-s5aa-r29-hsa-transfer-out-taxed.test.js`.
- **Out of a taxable account into a non-taxable one, it is a sale:** the moved dollars realise their gain at the
  account's pro-rata basis. Witness: `tests/audit-s5aa-r29-transfer-realises-gain.test.js`.

~~**Not modelled:** HSA eligibility (coverage, or Medicare from 65), and limits on custom accounts.~~ *Since S5AA R43 (the owner, 2026-09-30; Q177), Medicare from 65 is modelled as a stop on HSA deposits (§23). The rest stands:* **not modelled:** HSA coverage, and limits on custom accounts.

*Decided 2026-09-28 (the owner), as reported by the S5AA session; registered as `SPRINT_QUESTIONS.md` Q149 to Q152. R32's
refinements (2026-09-28, placed 2026-09-30): Q171.*

### 21.1 Required distributions (S5AA R30)

A pre-tax transfer that is a distribution counts toward the year's required minimum distribution, whatever it lands
in. That covers a transfer into a taxable account, and one into an HSA: either a distribution then a contribution, or
a qualified HSA funding distribution (26 CFR 1.408-8(g)(1): distributions count "regardless of whether the amount is
includible in income"). A rollover or a conversion does not count. A transfer dated after the year's spending draw
counts neither way: the draw has already paid the year's requirement. Witness:
`tests/audit-s5aa-r30-transfer-to-hsa-counts-toward-rmd.test.js`; landed at `c9f6556`.

### 21.2 Funding distributions and basis (S5AA R30)

A qualified HSA funding distribution comes out of the IRA's taxable value first. Only the part beyond that uses up
basis, dollar for dollar (IRC 408(d)(9)(E); Notice 2008-51). Witness:
`tests/audit-s5aa-r30-hsa-funding-uses-ira-basis.test.js`; landed at `bf4d3d8`.

**The taxable value is measured on the funding's date** (S5AA R31, R30-01): the owner's IRAs on that date, plus what
the year had already distributed or converted, less the year's basis. Later growth or loss does not change the basis
the funding used — Notice 2008-51 reads the basis "immediately after" the funding. The year's ordinary draws and
conversions are still settled pro rata at its end, on the basis the funding left. **Known limit:** the funding's
taxable value counts the whole year's nondeductible contributions as basis, wherever in the year they fall, as the
settlement already does for conversions. Witness: `tests/audit-s5aa-r31-hsa-funding-basis-at-the-funding-date.test.js`,
`tests/audit-s5aa-r31-hsa-funding-settlement-dated.test.js`; landed at `8afe16d`.

**The owner's IRA value on the funding date counts every one of that owner's traditional IRAs at its own return**, not
only the one sending the money (S5AA R32, ChatGPT's R31-01; the owner: "Repair in R32"; `8ef84d3`; placed 2026-09-30).
R31 carried only the sending IRA to the date and read the others at the row's opening, so a second IRA at +20% overstated
the tax and one at −20% understated it. Witness: `tests/audit-s5aa-r32-ira-pool-at-the-transfer-date.test.js`.

### 21.3 Dividends on moved dollars (S5AA R30)

The moved dollars' dividends belong to the account holding them: the source before the date, the destination after
it. Each account pays its own.
- A taxable source that sends everything can send only what its dividends leave.
- A transfer dated after the year's spending draw pays its destination after the move, on what moved. That cash
  comes after the draw, so it is kept or spent under the dividends policy.
- For such a transfer out of a dividend-paying taxable account, the year's spending draw leaves the transfer's
  dollars in the source. The owner confirmed 2026-09-28 that this protection applies only to dividend-paying taxable
  sources, not to every late transfer or every taxable account.

**Known limit:** a late destination's dividend cash does not fund that year's spending. Witness:
`tests/audit-s5aa-r30-transfer-dividends-follow-the-move.test.js`; landed at `66c406c`.

*Decided 2026-09-28 (the owner), as reported by the S5AA session; registered as `SPRINT_QUESTIONS.md` Q153 to Q156.*


---

## 22. Social Security: spousal and survivor benefits, full retirement age, the earnings test (S5AA R34)

**Provenance.** Written 2026-09-29 (UTC−7) from the S5AA session's R34 relay (`audit/S5AA/R34/S5AA_R34_RELAY_TO_EB_20260929.md`),
checked against `main`: the commit exists and lands under S5AA task 5.1's line. Decisions are the owner's, given to the S5AA
session directly, as reported by it. Registered as `SPRINT_QUESTIONS.md` Q158–Q160.

- **Full retirement age comes from each person's birth year** (SSA's table; a survivor reads the year two later, 20 CFR
  404.409). The birth year is 2026 minus the whole age, as §12 reads it; it is shown, not entered — the app's entered
  full retirement age field is kept in saved plans but read by nothing.
- **A spouse receives the spousal benefit**: up to half the other's PIA, less their own, on top of their own benefit,
  reduced 25/36 of 1% a month for 36 months before their full retirement age and 5/12 of 1% beyond, with no delayed
  credits (20 CFR 404.330, 404.333, 404.410). It cannot start before the worker files. Deemed filing makes a claim for
  one a claim for both, so it starts at the later of the two filings. The family maximum cannot bind a worker and a
  spouse and is not modelled beyond that.
- **A survivor's benefit rests on the deceased's PIA**, with the delayed credits the deceased earned by the death (up
  to 70), whether or not they had filed (42 USC 402(e)(1); 20 CFR 404.335) — this reverses the earlier "posthumous
  claim establishes nothing" reading. It starts at the later of age 60 and the death, reduced from 71.5% at 60 evenly
  by month to 100% at the survivor's own full retirement age, and, if the deceased had taken a reduced benefit, is
  limited to the larger of that reduced benefit and 82.5% of the PIA (POMS RS 00615.320's early-claim cap, now
  applied and disclosed).
- **The earnings test counts net earnings from self-employment** (profit × 0.9235; 20 CFR 404.429, SS Act 211(a)(12)),
  and in the grace year withholds only from the months before the owner stops working (20 CFR 404.435).
- **An other income of type Social Security ends at its owner's death**, the same as an employment stream (42 USC
  402(a)).
- **A benefit that starts inside a projection year is priced at the claim**, with every COLA from the plan's start
  to the claim (S5AA R39, repairing ChatGPT's R38-04). A benefit already in payment is priced at each projection
  year's opening (R2-004), so a COLA falling inside a year is paid from the next. **Only a claim the claimant
  reaches alive is priced at the claim** (S5AA R39.1, repairing ChatGPT's R39-01): a claim planned for after the
  claimant's death leaves the PIA at the year's opening price, so a planned claim the worker never reaches does not
  change the survivor's benefit.

**Refinements, S5AA R42 and R43** (written 2026-10-02 from the R42 and R43 relays, each sentence checked against the code and
its test at `c05208c`; Q174 and Q175):
- **The earnings test is charged to the family's benefits on the worker's record** (R42, R41F-01; refined in R43, R42-01
  and SA42F-18). A worker's earnings-test excess is charged against the benefits payable on the worker's record, the
  worker's own and a spouse's spousal benefit, as SSA withholds them (POMS RS 02501.095). The charge runs month by month,
  in order, to the benefit payable in each month, and the other person's own earnings test applies to what is left of
  their benefit. Each benefit is credited for its own months: a month with a full or partial deduction credits the
  person's own retirement benefit if it is entitled in that month, and their survivor benefit if that is entitled. The
  survivor benefit's reduction is adjusted at the survivor's full retirement age (20 CFR 404.412; RS 00615.482). **Not
  modelled:** the adjustment of the spousal reduction factor for spousal months withheld before the recipient's full
  retirement age.
- **The survivor's 82.5% limit carries the deceased's adjustment** (R42, R41F-02). The reduced benefit in that limit
  carries the deceased's adjustment for months the earnings test withheld while they were alive, effective from the
  month they reached, or would have reached, full retirement age (RS 00615.320, RS 00615.598), where they had claimed
  before it.
- **COLAs** (R43, SA42F-02). A benefit takes every COLA from its anchor to the age, whatever the claim date, so a claim
  inside a year no longer loses one. The anchor is age 62 on the AIME path, and otherwise the plan's start (or the claim,
  if it is before the start).
- **The AIME path** (R43, SA42F-17). The self, on the AIME path, already past 62 at the start gets the bend points of the
  year they turned 62, with the AIME indexed back to that year. The salary-growth rate stands in for the wage index, and
  the age is taken as a whole year.

*Decided 2026-09-29 (the owner), as reported by the S5AA session. Landed at `7b61b88`; the claim-year COLA repair
added 2026-09-29 (S5AA R39) at `f6dbb2a`, narrowed to living claimants 2026-09-30 (S5AA R39.1) at `a2ee714`.
Registered as `SPRINT_QUESTIONS.md` Q169.*

---

## 23. Contributions and tax figures follow the law more closely (S5AA R33)

**Provenance.** Written 2026-09-29 (UTC−7) from the S5AA session's R33 relay (`audit/S5AA/R33/S5AA_R33_RELAY_TO_EB_20260929.md`).
Decisions are the owner's, given to the S5AA session directly, as reported by it. Registered as `SPRINT_QUESTIONS.md` Q166.

**IRA deduction (replaces the earlier note that the $10 round-up was not applied).** The IRA phase-outs reduce the
deduction limit, not the contribution itself (IRC 219(g)(1)). The reduction is rounded down to $10, and the limit is
at least $200 unless it reduces to zero (219(g)(2)(B)–(C)). The deduction is the smaller of that limit and the
contribution (Publication 590-A Worksheet 1-2, line 7). A Roth IRA contribution is the lesser of the reduced Roth
limit and the limit less the year's other IRA contributions (Worksheet 2-2, line 11).

**Contributions.**
- A deferral is excluded only as far as the law allows: excluded from whichever pay funds it, stream wages included;
  capped at the owner's own compensation (415(c)(1)(B)); and under the "warn" policy the excess stays on deposit but
  counts as income (402(g)(1)(A)).
- **Each person's contributions stop at that person's own stop age** — a spouse's future contribution changes now
  read the spouse's own age, not the primary person's.
- ~~On a joint return, a spouse who is not working can fund an IRA while the other spouse works, up to that spouse's
  own stop age.~~ *Replaced, in two steps, by S5AA R42 and R43: an IRA owner can contribute while either spouse works, and the limit follows IRC 219(c)(2); see §20 and the block below.*
- Profit sharing is paid without the employer-match switch.
- **Annual limits hold the dollars deposited in the tax year** (the IRA and 401(k) limits, catch-ups, 415(c)'s total
  additions and 401(a)(17)'s compensation limit) — they are not cut because someone worked part of it (S5AA R39,
  repairing ChatGPT's R38-01). A plan year that is itself part of a tax year (a plan opening mid-year) keeps the
  limit for that share. The HSA limit stays prorated by the months of the contribution window (IRC 223(b)(2)).
- **Catch-up contributions read the age reached by the year's end** (S5AA R32, raised in ChatGPT's R30A audit; the owner,
  2026-09-28: "Use the year-end age"; `3017351`; placed 2026-09-30): the row an owner turns 50 has the IRA and 401(k)
  catch-up, the row they turn 55 the HSA catch-up, the rows they turn 60 to 63 the 60-63 amount, and the row they turn 64
  the ordinary catch-up (IRC 219(b)(5)(B), 414(v), 223(b)(3)). The model has no calendar, so each projection row is a
  tax year and its close is the opening age plus the row's length. Before R32 the age at the row's opening was tested,
  so the row an owner turned 50, 55 or 60 in was denied the catch-up and the row they turned 64 in kept the 60-63
  amount. Witness: `tests/audit-s5aa-r32-catch-up-age-at-year-end.test.js`. Registered as Q171.

**Refinements, S5AA R42 to R44** (the owner, 2026-09-30 and 2026-10-01; registered as `SPRINT_QUESTIONS.md` Q174 to Q181;
written 2026-10-02 from the S5AA session's R42 to R44.1 relays, each sentence checked against the code and its test at
`c05208c`):
- **The spousal IRA window.** On a joint return, an IRA owner can contribute while either spouse works: the window is
  the longer of the owner's own work and the spouse's, up to the owner's own stop age and life (R42, R41F-03). The limit
  follows IRC 219(c)(2); see §20 (R43).
- **The Roth limit's MAGI proxy.** The salary-only proxy reads each salary at the share of the row actually worked
  (R42, R41F-04).
- **Employer money.** Employer money (match and profit sharing) is limited so that the owner's non-catch-up deferrals
  plus employer money do not exceed the owner's pay for the row (415(c)(1)(B)), and a "Contribution limit" warning says
  so (R43, SA42F-12).
- **The HSA.** The family limit is shared in dollars across both owners' accounts (R43, SA42F-15). HSA contributions
  stop at 65, assuming Medicare enrolment at 65 (coverage is still not modelled). In the row an owner turns 65, their
  HSA limit is the share of the row before 65 times the annual amount plus the catch-up (IRC 223(b)(1) to (3) and (7);
  Publication 969), for planned and one-time contributions alike, and from 65 the limit is zero. A flow stopped by the
  age is not a limit excess and is not redirected; an amount above the prorated limit is. A one-time HSA contribution
  also gives up what the owner's planned HSA contributions already used (R43, R44; the owner, 2026-09-30 and
  2026-10-01, "Prorate the limit, both routes"). *Since S5AA R47 and R51 the stop is at the person's Medicare start, not at 65 (§28.2; Q186).*
- **One-time contributions.** A one-time IRA contribution's compensation limit reads income streams the way planned
  contributions do, in today's dollars latched at the stream's start (R44, R43-02).
- **Timing.** A planned contribution change dated inside a row is time-weighted across the owner's contribution window
  within the row (R43, SA42F-25).
- **Forfeiture.** A deceased owner's unvested employer money is not forfeited at the survivor's retirement (R43,
  SA42F-13).

**Tax.**
- The age-65 amounts — the additional standard deduction, the senior deduction, and Arizona's $2,100 exemption — read
  the age reached by the row's close, its year-end age (IRC 63(f), 151(d)(5)(C); A.R.S. 43-1023(E)).
- An included spouse is a married spouse: on a single or head-of-household return the spouse's age amounts are not
  taken, neither spouse gets the senior deduction, and the self's own addition is the married $1,650 amount (IRC
  151(d)(5)(C)(v), 63(f)(3)).
- Qualified dividends and gains pay the smaller of the preferential rate and the regular tax (Form 1040 QDCG
  worksheet, line 25).
- A capital-loss carryover adds back the senior deduction (IRC 1212(b)(2)(B)(ii)).

**Overnight instruction, governing R33 through R38: "Follow law everywhere"** — where the law gives a rule, build it
rather than disclose a gap.

*Decided 2026-09-29 (the owner), as reported by the S5AA session. Landed at `f4e8294`; the part-year contribution
limit added 2026-09-29 (S5AA R39) at `8a51aaf`. Registered as `SPRINT_QUESTIONS.md` Q169.*

---

## 24. Vesting reaches normal retirement age; a new plan defaults to single (S5AA R35 and R38)

**Provenance.** Written 2026-09-29 (UTC−7) from the S5AA session's R35 and R38 relays, checked against `main`: both
commits exist. Registered as `SPRINT_QUESTIONS.md` Q162 (5b), Q167 (filing status).

- Employer money vests on service, six-year graded unless a three-year cliff is chosen, and only the part still
  unvested at separation is forfeited (IRC 411(a)(2)(B)).
- **Employer money earned in the year of separation vests or forfeits along with the rest** (S5AA R38, repairing
  ChatGPT's R35-01).
- **At a separation at 65 or later, all employer money is kept.** IRC 411(a) makes it nonforfeitable at normal
  retirement age, and the plan's own normal retirement age is taken as 65 (411(a)(8) gives 65 for such a plan).
  There is no input for an earlier plan-defined normal retirement age.
- **A new plan files single, matching its default of no spouse.** A saved plan keeps its own filing status. The test
  corpus keeps the joint return it was written on, so no corpus figure moves. Linking the default to the spouse
  switch is a possible later convenience, not built.
- **An elected Roth match is Roth only when the employee is fully vested at allocation** (S5AA R39, repairing
  ChatGPT's R38-03), by the same vested share that decides forfeiture. IRS Notice 2024-2, Q&A L-3 (IRS PDF, page
  72), backed by IRC 402A(f)(3): a match "may be designated as a Roth contribution only if the employee is fully
  vested in matching contributions at the time the contribution is allocated to the employee's account."
  `employerMatchIsRoth()` had read only the entered `vesting === 100`, apart from `employerVestedShare()`, which
  decides forfeiture; the two now agree. This settles the `vesting` 100 / `yearsOfService` 0 case above. Registered
  as `SPRINT_QUESTIONS.md` Q168.

*Decided 2026-09-29 (the owner), as reported by the S5AA session. Vesting through separation at `26ef26d` (R35),
year-of-separation and age-65 vesting at `cc3217f` (R38), the filing default at `678c556` (R38), the Roth-match
vesting rule at `252faba` (R39).*

---

## 25. Later tax years index the 2026 figures (S5AA R36)

**Provenance.** Written 2026-09-29 (UTC−7) from the S5AA session's R36 relay, checked against `main`: the commit
exists. Registered as `SPRINT_QUESTIONS.md` Q165. This replaces any earlier statement that the tax rules are 2026's
for every projected year.

The rules package holds 2026's figures. Each later tax year indexes them as the law does, with each statute's own
rounding:
- brackets, capital-gains thresholds, the standard deduction and the age-65 addition (Arizona's standard deduction
  conforms);
- contribution limits (IRA, 401(k), catch-ups, total additions, the compensation limit, HSA, the QCD cap), the IRA
  and Roth phase-outs, and the Roth catch-up wage threshold;
- the IRMAA thresholds, the top tier from 2028.

These rise with one whole year of the plan's inflation assumption per tax year — a stand-in for the C-CPI-U or
CPI-U each statute names. The Social Security wage base, the earnings-test amounts and the bend points rise with the
salary-growth rate instead, a stand-in for the national average wage index; a person's bend points are those of the
year they turned 62.

**Amounts the law fixes stay fixed:** the NIIT and Additional Medicare thresholds, the Social Security taxation
bases, the $3,000 capital-loss limit, ~~the senior deduction and its thresholds (kept after 2028 by the owner's
decision, D8 — see `SPRINT_QUESTIONS.md` Q165)~~ *(the enhanced senior deduction ends after 2028 since S5AA R47: Q184, §28.2)*, and Arizona's $2,100 exemption.

Projection row `n` is tax year `2026 + n`. Indexing starts from the 2026 figure rather than each statute's own base
year, so a figure can differ by one rounding step from the one the IRS eventually publishes. ~~Medicare premiums
themselves stay at 2026's.~~ *(Since S5AA R40 that covered the Part D base premium as well as Part B, see §18.4. **Since S5AA R48 Medicare premiums grow:** §28.3.)*

**A disclosed limit: a partial row is taxed as a whole tax year** (S5AA R40; the owner, 2026-09-30: "Revert and
disclose"; `b97fe0a`). A projection row shorter than a year, the first row of a plan that opens at a fractional age or
the last row of one that ends at one, is taxed as a whole tax year holding only the row's income. The first year's tax
is therefore understated where the household earned before the plan opened: a $60,000 pension over a half-year first
row is taxed as $30,000 against the whole year's figures, $1,767.50, where taxed as half of a $60,000 year it would be
$3,058.75. R40 built a share-of-a-year rule (`607101a`) and reverted it, because it also annualized one-time amounts:
a $100,000 expense in a row a tenth of a year long was taxed $56,958 against $20,221.85. The proper rule, which counts
recurring income at its rate and one-time items once, is for the engine rebuild (`FEATURES.md`, "Features — wanted").
Witness, pinning the disclosed behaviour and the one-time case: `tests/audit-s5aa-r40-partial-row-whole-year-convention.test.js`.
*Refined by S5AA R50: when income received earlier in the first tax year is entered, the first row's income tax is the tax on the whole year less the tax on that earlier income alone (§28.5; Q189). Blank, the convention above stands.*

**Refinements, S5AA R43** (SA42F-08, -10, -22, -23 and -01; written 2026-10-02 from the R43 relay, each checked against the code):
- The IRA-deduction and Roth phase-out ranges keep their statutory widths: only the start of each range is indexed.
- Later-year joint IRMAA thresholds are twice the indexed single thresholds, except the top tier, which is indexed on its
  own.
- A pre-plan lookback return entered as married filing separately is priced on CMS's separate table. The plan's own
  return stays joint.
- A row's age-65 amounts are read at its tax year's close, which in practice changes only a partial last row.
- **The 199A deduction.** Self-employment profit earns the IRC 199A deduction: the lesser of 20% of qualified business
  income (profit less the deductible half of SE tax) and 20% of the ordinary part of taxable income (taxable income
  less net capital gain), with the 199A(i) $400 minimum, which applies once the qualified business income reaches
  $1,000. The deduction phases out over the threshold, because the modelled business has no W-2 wages or qualified
  property. The threshold and the minimum index with the plan's inflation. It is taken below the line, so AGI, MAGI and
  Arizona are unchanged. Assumed and disclosed, in the app's methodology text: the business is not a specified service
  business, and the owner materially participates.

*Decided 2026-09-29 (the owner), "Index, own round", with D8 "Keep it even after 2028"; as reported by the S5AA
session. Landed at `cf643a8`. The Part D note and the partial-row limit were added 2026-09-30 (S5AA R40), registered
as `SPRINT_QUESTIONS.md` Q172.*

---

## 26. Housing costs, input refusals, disclosure warnings, Monte Carlo detail, and a joint account's salary base (S5AA R37)

**Provenance.** Written 2026-09-29 (UTC−7) from the S5AA session's R37 relay, checked against `main`: the commit
exists. Some items below are the S5AA session's own reading, adopted by the owner's "go with your recommendations"
(2026-09-29) — see `SPRINT_QUESTIONS.md` Q167.

- **Housing costs.** A mortgage's property tax, insurance and HOA rise with the plan's inflation, at the price level
  the year's spending uses. PMI is a term of the loan and stays as entered.
- **Input refusals.** An adjustable debt that resets at an age needs its reset rate and its payoff age. A debt's
  extra principal, PMI, property tax, insurance or HOA must be a number of zero or more, and its payment a number.
  An asset class's volatility must be zero or more. A historical start must be a data year. `runs` is at most
  10,000. Each is refused by name, and the validator agrees. **Since S5AA R40:** healthcare inflation must be a
  number above −100% and at most 100%, and a value outside the form's 0 to 20% is a warning (`c300508`); a debt's reset
  rate or reset age that is present but not a number is refused, where before only an absent one was (`7cd1a1a`).
  Witnesses: `tests/audit-s5aa-r40-health-inflation-validated.test.js`,
  `tests/audit-s5aa-r40-validator-debt-reset-terms.test.js`.
  **Since S5AA R41:** a projection whose ending age is before its starting age is refused
  (`SCENARIO_END_AGE_BEFORE_START`), and the validator reports it as an error (`END_AGE_BEFORE_START`), so a backup
  carrying it is not restored. The form cannot produce it, since it raises the ending age to at least the retirement
  age and the retirement age to at least the starting age. An ending age equal to the starting age is projected as one
  row (`984197c`; Q173). Witness: `tests/audit-s5aa-r41-end-age-before-start-refused.test.js`.
  **Since S5AA R42 to R44** (Q174 to Q181):
  - an entered Social Security benefit (`ssBenefit`, `spouseSS`) that is present and not a number is refused: the
    validator reports `WRONG_TYPE`, and the engine refuses it with `SCENARIO_NONNUMBER_PLAN_VALUE` (R42, R41F-05);
  - every plan value the engine reads is checked by one contract, `src/plan-value-contract.json`, in both the
    validator and the engine. A wrong type, a missing value, an out-of-range value or unknown text is refused
    (`SCENARIO_NONNUMBER_PLAN_VALUE`, `SCENARIO_PLAN_VALUE_OUT_OF_RANGE`, `SCENARIO_UNKNOWN_PLAN_VALUE`), and the
    validator reports its own codes for the same cases (R43, SA42F-05 and -06). An employer match rate, match cap or
    profit-sharing percentage below zero is refused (R44);
  - two validator-only rules stay declared divergences: the legacy `"recurring"` income type, which the validator
    refuses and the engine reads as ordinary income, and `TRANSFER_INTO_WORKPLACE_PLAN`, a validator error where the
    engine moves nothing and the plan still runs;
  - a lifespan equal to the starting age is not alive at the start, and a plan with nobody alive is refused by both
    layers (R43, SA42F-30 and -32);
  - a historical start before 1928, or between data years, is refused with `SCENARIO_HISTORY_START_NOT_A_DATA_YEAR`
    (R43, SA42F-34), which completes "a historical start must be a data year" above.
- **Disclosure warnings.** A joint return with no spouse included, or a single or head-of-household return with one,
  is reported. So is an expense at or after the plan's end age, which no year charges, and each person born in 1959
  whom the plan carries to age 73 — the 1959 card stays visible for both spouses (Q167). The results page shows all
  three. *Since S5AA R43,* a one-time income at or after the plan's end age is also warned
  (`INCOME_AFTER_PLAN_END`, the engine only) and shown as a card (SA42F-28).
- **Monte Carlo.**
  - The expected return stays the arithmetic mean, disclosed as such (Q164). Each year's draw is held to
    [−95%, +200%], which raises the realised mean only at very high volatility.
  - A partial year grows by (1 + r)^t.
  - Guidance gives the unsuccessful paths' median ages and withholds a shortfall dollar amount and a spending-cut
    percentage in the current engine (Q167); figures from the failing paths themselves are wanted for the engine
    rebuild — see `FEATURES.md`, "Features — wanted".
  - Simple mode shows the average path, not the typical one.
- **A joint account's percent of salary reads the household's salary** — the owner's plus the spouse's, counted only
  when a spouse is included and working (Q167).

*Decided 2026-09-29 (the owner). Landed at `890ff72` and `503db3c` (R37); the filing-status and salary-base items
also at `678c556` (R38) and `05f35fa`.*

## 27. Retirement dates and the household date (S5AA R45)

**Provenance.** Written 2026-10-04 (UTC−7) from the S5AA session's R45 relay (`audit/S5AA/R45/S5AA_R45_RELAY_TO_EB_20261003.md`),
each sentence checked against the code and its test at `02f6cbf` (R45 landed at `1096145`, PR #58). Decisions are the owner's,
2026-10-03; registered as `SPRINT_QUESTIONS.md` Q183.

- **Each person retires on their own clock.** The primary retires at `retireAge`, the spouse at `spouseRetireAge`, and where
  that is absent at `retireAge`, each on that person's own age. The spouse's work, wages, Social Security service months, the
  still-working 401(k) exception to required distributions, the Rule of 55 and vesting follow the spouse's own date. The
  pension, the long-term-care onset (§28.4), the glide path, the bond tent and dividends paid from retirement keep the
  primary's retirement age.
- **The household date is the first stop.** It is the earliest of: the primary's retirement; an earning spouse's retirement
  (a spouse with a salary; employment and self-employment streams do not make a spouse an earner for this rule); the
  primary's death before retiring, with the spouse alive, whatever the spouse earns; and an earning spouse's death before
  their own retirement, with the primary alive. A spouse with no salary stops nothing by retiring or dying. An optional
  "Retirement spending begins at" age (the primary's age) replaces the first stop.
- **What starts at the household date:** the household's retired spending, the spending strategy's starting balance (and its
  anchor and inflation latches), debt and housing costs, Medicare costs (§28.3) and the cash reserve. Whoever still works pays
  these costs first from their net pay (from the earlier of the household date and the end of employer coverage when health
  costs are on). A death before retiring therefore starts the costs at the death even if the survivor has a salary, and the
  survivor's pay funds them first. This replaces R43's salary exception (§18.1).
- **Two things have their own age,** both on the primary's age: pre-Medicare health costs start when employer coverage ends
  ("Employer health coverage ends at"; absent, the household date), and Roth conversions start at "Conversions start at"
  (absent, the primary's retirement age).
- **Validation.** The "retirement age before the current age" warning fires only beside a salary, for either spouse; the
  spouse's warning fires only when `spouseRetireAge` is entered. The earned-income warning
  (`CONTRIBUTIONS_ABOVE_EARNED_INCOME`) counts employment and self-employment streams by owner, at face value in today's
  dollars, for an eligible owner.

*Decided 2026-10-03 (the owner): "both spouses need their own retirement date"; the first stop chosen over "last one retires".
Registered as `SPRINT_QUESTIONS.md` Q183.*

---

## 28. The AA1 repairs: Monte Carlo, federal tax, Medicare, spending, the Roth ledger (S5AA R46 to R51)

**Provenance.** Written 2026-10-04 (UTC−7) from the S5AA session's R46-to-R50 and R51 relays
(`audit/S5AA/R50/S5AA_R46_R50_RELAY_TO_EB_20261003.md`, `audit/S5AA/R51/S5AA_R51_RELAY_TO_EB_20261003.md`), each sentence checked against
the code and its test at `02f6cbf`. The relays' wording was corrected where the code differs (the Medicare date, prior-year
wages, the required distribution after a death, the conversion's 10%, what the app discloses). Decisions are the owner's,
2026-10-03 and 2026-10-04, on ChatGPT's AA1 assumptions audit; registered as `SPRINT_QUESTIONS.md` Q182 to Q191. Landed at `8d2e288` (R46),
`f02e26a` (R47), `126c7f1` (R48), `62964a1` (R49), `2d9ede3` (R50) and `b722884`, `8732bb8`, `2f73b85` (R51).

### 28.1 Monte Carlo and the reserve (R46)

- **One set of shocks per year, shared by every account.** Each simulated year draws one shock per asset class, correlated at
  the plan's correlation, or one household shock when asset classes are off. Every account's return is its expected return plus
  its allocation's share of those shocks. Splitting the same investments across more accounts, reordering them or adding an
  empty one changes nothing: one $1,000,000 Roth and twenty $50,000 Roths both succeed on 59.8% of 1,000 paths (7% return, 20%
  volatility, $40,000 of fixed-real spending, ages 65 to 95, seed 42791, asset classes off); before, the twenty succeeded on 99.2%.
  An account created mid-year takes that year's shared shock. The seeds are still the 32-bit mix of §18.6.
- **An impossible correlation is refused,** for the Monte Carlo method with asset classes on: below −1/(n−1) for the n active
  classes (a class some account weights above zero at the start or end of its glide; at least two), or above 1. The validator
  reports `INFEASIBLE_CORRELATION` as an error; the engine refuses with `SCENARIO_INFEASIBLE_CORRELATION`.
- **The reserve is the household's,** in every method and from the household date: every account blends in the same share
  (spending × years ÷ the portfolio, at most all of it) at the reserve's 3%. Before, it was capped at each account's own balance,
  so an account smaller than the reserve under-reserved.
- **The result.** The headline figure is the share of paths with no modeled shortfall over one cent in any year, labelled "All
  modeled spending funded". An adaptive strategy can reach it by cutting spending, so Monte Carlo shows the final year's spending
  in today's dollars beside it, at the median and the 10th percentile (`finalYearRealSpending`, optional; the result contract stays
  at version 5).
- **What moved.** Monte Carlo figures for plans with several accounts. The golden Monte Carlo plan's success fell from 100% to
  96.8% at R46, and is 95.8% since R51's flexibility default (its lifetime taxes moved too).

### 28.2 Federal tax and accounts (R47, with R51)

- **The enhanced senior deduction applies only to tax years before 2029** (IRC 151(d)(5)(C)). Plan year k is tax year 2026 + k,
  so there is none from plan year 3. A direct caller whose rules carry no tax year keeps it.
- **The designated Roth catch-up** (IRC 414(v)(7)). Above $150,000 of prior-year FICA wages (the 2026 figure, indexed and rounded
  down to $5,000), a pre-tax workplace plan's catch-up is deposited to a linked designated Roth balance in the same plan and taxed
  that year. Prior-year wages are, per owner, the owner's one entered salary times the work in that year, less the HSA salary
  reduction, never below zero; employment streams are not counted. The entered `priorYearFicaWages` is used for the first year,
  until a projected prior row exists. A traditional 401(k) can be marked as not offering Roth contributions (`planOffersRoth`, a
  checkbox, offering by default): where the Roth rule applies and the plan offers none, the catch-up share is not allowed and
  becomes a limit excess, which the limit policy then handles (414(v)(7)(B); R51).
- **IRC 4973's excise.** Under "Show warning and permit it", an IRA or HSA excess stays in the account and pays 6% each year on
  the excess carried at the year's end, per owner and kind, at most 6% of that account's value. The charge is reduced by
  distributions included in income (any Roth IRA distribution, a conversion's taxable part, an HSA distribution included in
  income) and by later unused contribution room, and is paid with the next year's taxes. 401(k) excess deferrals are not charged it.
- **Self-employment.** It counts as compensation net of the deductible half of its SE tax, and pre-tax workplace deferrals funded
  from SE pay (the part the salary cannot cover) reduce qualified business income in proportion; an HSA contribution does not.
- **The Medicare start, and the HSA's stop.** A person's Medicare start is the age entered (`profile.medicareStartAge`,
  `spouseMedicareStartAge`); otherwise 65 if they claim Social Security by 65 or have no benefit entered, otherwise half a year
  before the claim (Part A is backdated up to six months), never before 65. HSA contributions stop at that date, prorated in the
  row, replacing "stop at 65" (§23). Until then the person carries their share of the pre-Medicare cost.

### 28.3 Medicare, survivors and Arizona (R48, with R51)

- **Medicare costs** are Part B with any IRMAA amount, the Part B deductible and the Part D premium. They start at the later of
  the person's Medicare start and the household date; a retired spouse beside a working primary is charged from their own Medicare
  start (§18.1). A primary still working past their Medicare start pays no Medicare cost until the household date, though their
  HSA stops at the Medicare start. The Part B late-enrollment increase (42 USC 1395r(b)) is not modelled.
- **They grow** over the projection, from the plan's start, at the Medicare growth rate the plan enters, or at healthcare
  inflation, by the same factor as the pre-Medicare cost; the income thresholds rise with the plan's inflation (§25). An entered
  Part D premium (monthly, per person, today's dollars) replaces the national base premium, and any income-related Part D amount
  is added. A blank prior-year income is assumed below the first surcharge tier (`IRMAA_PRE_PLAN_MAGI_ASSUMED`; §11).
- **An inherited IRA for a young survivor.** A survivor under 59½ at the death holds the deceased's traditional IRAs as an
  inherited IRA, with no 10% additional tax. Where the death came before the deceased's required beginning date, the required
  distribution is on the survivor's single life expectancy, from the year the deceased would have reached the required age;
  where it came on or after it, it starts the year after the death and the divisor is the longer of the survivor's and the
  deceased's remaining life expectancy, less one for each year since the death. The deceased's IRA basis is kept in its own pool.
  From the first year that opens at 59½ or later, or the year after a contribution to it, the survivor treats it as their own. A
  workplace plan passes as the survivor's own; only traditional IRAs are inherited here.
- **Community property.** With the plan's Arizona community-property switch on (`profile.communityProperty`), every taxable
  account's basis resets to its value at the first death (IRC 1014(b)(6); A.R.S. 25-211(A)): joint accounts and both spouses' own,
  excluding household-cash holdings. With it off, the decedent's resets in full and half of a joint account (§18.1).
- **Arizona.** Arizona AGI subtracts the federal senior deduction the return takes (A.R.S. 43-1022(35)), so it follows the federal
  deduction's phase-out and its end after 2028, and is zero wherever the federal deduction is not taken. It also subtracts 25% of
  net long-term capital gain, after a carried loss, on assets bought after 2011 (43-1022(22)(c)), for the share of realized gains
  the plan enters (none by default; the owner confirmed 0%).

### 28.4 Spending flexibility, long-term care and debt (R49, with R51)

- **Flexibility.** After a year whose portfolio return is negative, spending is cut by the flexibility percentage for the next
  year only, and the cut never takes spending below the floor entered for the strategy: the floor of guardrails, Guyton-Klinger and
  floor-and-ceiling, the remaining-life strategy's minimum withdrawal, and VPW's minimum rate. Spending already below the floor (a
  stage, the survivor reduction) is neither cut further nor raised. **The default is 0 (off) since R51** (it was 10). Overlapping
  percentage stages multiply; the validator warns about them (`SPENDING_STAGES_OVERLAP`, percentage stages only) and when flexibility
  stacks on guardrails or Guyton-Klinger (`FLEXIBILITY_WITH_GUARDRAILS`).
- **Long-term care.** Care starts at `advanced.ltcOnsetAge` when entered (the primary's age), as entered in the simple and historical
  projections, where it is weighted by the care probability; Monte Carlo draws the start uniformly from 10 years before to 10 years
  after it, never before the plan's start, with care happening on the probability's share of paths. Blank, care starts at the later of 65
  and the retirement age plus ten, weighted by the probability; in Monte Carlo it starts, with that probability, at the later of 65
  and the retirement age plus 5 + 20u. The onset keys to the primary's retirement age and is not moved by the household date (§27).
- **PMI** stops at the debt's `pmiEndAge` when entered. Otherwise a conventional mortgage with its original and remaining terms
  stops PMI after the midpoint of its amortization (12 USC 4902(c)), on the primary's clock, at the start of the projection month
  after the one holding the midpoint. FHA, VA, USDA and other programs, and a conventional loan with missing or inconsistent terms,
  keep PMI while a balance is owed. **The automatic 78% termination (4902(b)) is not modelled**; the default is the latest the law
  allows. The validator warns (`DEBT_PAYOFF_RESIDUAL`) when the scheduled payments leave $0.50 or more at the payoff age (not when
  an adjustable-rate reset precedes it), the plan pays it in one sum, and the debt editor shows that sum.

### 28.5 The Roth IRA ledger and income received earlier in the year (R50, with R51)

- **A basis ledger per owner** (IRC 408A(d)(4); Treas. Reg. 1.408A-6), with three layers: regular contributions, then each year's
  conversions (the oldest year first, the taxable part first), then earnings. A distribution is not qualified when the owner is
  under 59½ at the year's opening (a transfer is judged at its own date) or the owner's five-year period has not run. It takes
  contributions tax-free; it bears the 10% on a conversion's taxable part within five years of that conversion and while under 59½
  (not where the household's penalty exception is on); and it is taxed on earnings, with the 10% under 59½.
- **Opening basis** is the entered contribution basis (`accounts[].contributionBasis`, summed per owner). Blank means none, the
  cautious reading, and the Roth IRA input says so. The engine records `ROTH_IRA_BASIS_NOT_ENTERED` when that default prices a
  dollar; **the app shows no card for it.**
- **The five-year period** runs from the entered first-contribution year. With no year entered and a Roth balance or basis held, it
  is taken as met (`ROTH_FIVE_YEAR_ASSUMED`, recorded by the engine for a draw at 59½ or later in plan years 0 to 4; **the app shows
  no card for it**); with none held, it starts at the first tax year money arrives. A surviving spouse takes over the ledger: bases
  and conversions combine and the earlier five-year start is kept.
- **A Roth 401(k) or custom tax-free account** is still modelled as untaxed at every age, and is flagged when drawn before 59½
  (`UNSUPPORTED_ROTH_ORDERING`, shown as the card "Roth withdrawal before 59 1/2"; judged at the year-opening age for a pooled draw).
  The owner kept this, disclosed.
- **Not modelled:** conversions before the plan (enter those older than five years as basis), the disability and first-home
  exceptions, and the law's year-end aggregation (a contribution made after the year's draw counts before that draw by law; the
  engine counts it after).
- **The rule-based withdrawal order ranks the Roth class by the cost of the next dollar it would pay** (R51; the owner rejected the
  exposed-share weight): nothing while the next dollar is basis, a conversion's nontaxable part, or a conversion past five years;
  nothing when the owner is qualified, or when the next account in the class's draw order is not a Roth IRA (a Roth 401(k) or custom
  tax-free account, modelled tax-free; the owner kept this, 2026-10-04); the 10% on a conversion's taxable part inside five years
  before 59½ (nothing under the penalty exception); and tax and the 10% on earnings.
- **Income received earlier in the first tax year** (`profile.priorIncomeThisYear`, an optional positive figure). For a first row
  shorter than a year at a fractional start age, the row's federal tax (with NIIT) and Arizona tax is the tax on the whole year's
  ordinary income less the tax on the earlier income alone, the row's gains, Social Security and dividends stacked on top. Payroll
  tax is unchanged and the row's MAGI (IRMAA, the IRA deduction) is still the row's own. Blank, the convention of §25 stands. The last
  row, ending at a death, is correct as it is (IRS Publication 559).

### 28.6 Working years and disclosures (R49, with R51)

- **The working-years check.** A warning, `WORKING_YEARS_NOT_FUNDED_BY_PAY`, once per run, names the first working year whose pay is
  below zero. Pay is the working share of salary plus the employment and self-employment income paid while working, each net of the
  tax it adds (the salary net of its wage-only payroll and income tax; each stream net of its marginal share of the same return with
  it added: federal, NIIT and Arizona income tax, payroll tax and self-employment tax), less the contributions and less the debt
  payments and PMI made in the working months. Rental and other non-pay streams are not counted. No figure moves. A full
  working-years budget is not modelled.
- **Disclosures.** The app shows the engine's disclosures listed in R49's build report as cards (21 codes), runs the validator on the
  active plan at each calculation and at load and lists its warnings as "Plan checks", and has a card on how the tax figures are
  estimated. The optimizer is now the "Rule-based withdrawal order" with a "Tax-sensitive ordering goal (heuristic)". The 10% default
  return is relabelled "historical US stocks, nominal, before fees", not changed.

*Decided 2026-10-03 and 2026-10-04 (the owner), on the AA1 assumptions audit. Registered as `SPRINT_QUESTIONS.md` Q182 to Q191.*
