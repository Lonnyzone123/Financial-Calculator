# S5AA R29 — change audit handover: PCF-01 to PCF-03, and the transfer rules

*Written by Claude, 2026-09-28 (local, UTC−7), for the owner to send to ChatGPT. Every figure was measured on Windows 11 /
Node 24.17.0 at the commits named. This is the first round in the public repository.*

## 1. What to audit

- **The change:** from `main` at `8009fd8` (your PC/PCF reports merged) to **`s5aa-r29.1-source`** at **`aaff3f1`**.
  `s5aa-r29-source` (`4ead57c`) came first; R29.1 adds one commit after PR #4's CodeQL check (below). The earlier tag
  stays where it is.
- **Ten commits.** Each is test-first, and each is its own task.
- **Please number findings R29-NN** and publish them in the usual report-only pull request, on a branch like
  `audit/chatgpt/r29-aaff3f1`, under `audit/S5AA/R29/`.

## 2. Your findings and the owner's decisions

| finding | what you found | decision (the owner, 2026-09-28) | commit |
|---|---|---|---|
| **PCF-01** (P1) | A transfer out of an HSA was untaxed: $10,000 kept where $8,000 is right. | "Tax it like a withdrawal" | `fc9c9d3` |
| **PCF-02** (P1) | A taxable → Roth IRA transfer bypassed the contribution limits: $50,000 sheltered with no compensation. | "As a contribution"; the excess "stays in the source" | `7c93220` |
| **PCF-03** (P2) | An account id `__proto__` doubled the dated dividends: $30,000 where $15,000 is right. | "Repair" | `9a95768` |

The owner also decided three cases your findings raised but did not settle:

| case | decision | commit |
|---|---|---|
| A transfer into a 401(k) from a different kind of account | "Refuse it" | `3a02ed1` |
| A traditional IRA into an HSA | "Model the funding rule" | `c07c01f` |
| Found in passing: a taxable → non-taxable transfer dropped its basis and never realised the gain | "Repair in R29" | `83647e0` |

When the repository went public, CodeQL raised **8 js/xss-through-dom** alerts on the rules page (`5e891c3`). None could
be reached: the data is the rules package shipped inside the page. The page is hardened anyway. CodeQL's 3 other alerts
were in test and fixture tooling, and were dismissed with reasons.

**R29.1 (`aaff3f1`):** PR #4's CodeQL check still flagged the source-link line. The `https:` test makes it safe, but
CodeQL's XSS model does not accept a scheme test as a sanitiser; it does accept removing HTML metacharacters. So the url
is stripped of raw `<`, `>`, `"` and `'` before the test and the assignment. No shipped url changes.

## 3. The transfer rules, as built

One scheduled transfer, from account F to account T:

| F → T | treatment |
|---|---|
| **same tax class** (a rollover; taxable → taxable in kind) | moves as before: untaxed, no limit |
| **pre-tax → Roth-class** | a conversion, unchanged (existing lawful-destination rule) |
| **pre-tax → taxable** | a distribution, unchanged: income, basis pro rata, 10% before 59½, RMD credit |
| **→ a 401(k), from a different class** (not a conversion) | **refused.** The validator reports `TRANSFER_INTO_WORKPLACE_PLAN`; the engine moves nothing and records `TRANSFER_INTO_WORKPLACE_REFUSED`. |
| **→ an IRA or HSA, from a different class** (not a conversion) | **a contribution**, held to the room the year's planned contributions leave. Under `redirect` only what fits moves and the rest never leaves F; under `warn` all of it moves. Either way a limit warning names what was asked, the room, and what moved. |
| **traditional IRA → its owner's own HSA** | a **qualified HSA funding distribution** (IRC 408(d)(9)): tax-free, not deductible, within the HSA room |
| **any other pre-tax account → HSA** (a 401(k), a custom tax-deferred account, or an IRA into the spouse's HSA) | a distribution (income, and 10% before 59½), then a deductible HSA contribution |
| **HSA → a non-HSA account** | an **HSA distribution** (PCF-01): the account's includible share is income, and 20% of it before its owner turns 65, at the transfer's age |
| **taxable → a non-taxable account** | a **sale**: the moved dollars realise their gain at the source's pro-rata basis on the date, by its owner |

**The contribution room** comes from `auditContributions(..., oneTime)`. It is measured in dollars, after the year's
planned items:
- **IRA:** the $7,500 limit, plus $1,100 from 50, times the Roth phase-out factor; then less the planned IRA dollars; then
  capped by the compensation left after the planned items (R26/R28), shared on a joint return.
- **HSA:** the household $4,400 or $8,750 base, plus the owner's own $1,000 catch-up from 55, less the planned HSA dollars.

The planned items' "works this year" proxy does not apply to a one-time contribution. An IRA's own limit is compensation,
which is measured. An HSA's is coverage, which the engine does not model (§6).

**The deduction:**
- Into a **traditional IRA**, the moved dollars join the owner's IRA contributions, so the existing deduction rule and the
  basis of any nondeductible part apply.
- Into an **HSA**, they are a *direct* contribution, deducted above the line (`transferHsaDeduction`) in the quote and in
  the commit alike (R26's one rule). This is a route the engine had noted it could not express (Q104's comment).

**PCF-03:** `heldReinvest` and `heldPaid` are created with `Object.create(null)`, as the engine's other id-keyed maps
already were.

**The rules page:** the package block builds its labels as elements and sets each value as text. A source becomes a link
only if its url is `https:`. `renderRulesLegacy()`, which nothing called, is removed.

## 4. Evidence

**New tests (test-first, hand arithmetic).** 42 tests in 7 files:

| file | tests |
|---|---|
| `tests/audit-s5aa-r29-held-dollars-prototype-ids.test.js` | 4 |
| `tests/audit-s5aa-r29-rules-page-text-not-markup.test.js` | 4 |
| `tests/audit-s5aa-r29-transfer-into-workplace-refused.test.js` | 5 |
| `tests/audit-s5aa-r29-hsa-transfer-out-taxed.test.js` | 7 |
| `tests/audit-s5aa-r29-transfer-as-contribution.test.js` | 10 |
| `tests/audit-s5aa-r29-ira-to-hsa-funding.test.js` | 5 |
| `tests/audit-s5aa-r29-transfer-realises-gain.test.js` | 7 |

Each file's header gives the arithmetic. Your three witnesses are in them:
- **PCF-01:** $8,000 kept.
- **PCF-02:** $0 moves, with a warning.
- **PCF-03:** $15,000, under the ids `__proto__`, `constructor`, `toString` and `hasOwnProperty`.

The rules-page test was also run against the previous commit. There its three protective tests fail and its markup control
passes.

**Re-fixtured by intent:**
- Two R28.1 tests (`...r28-transfer-dividends-by-holder`, `...r28-transfer-imputed-yield-by-holder`) move $300,000 taxable
  → Roth to test who is paid on the moved dollars. They now use the `warn` policy, under which all of it still moves. The
  reason is in each file.
- `tests/lib/decided-refusals.js`: the frozen generator produces three plans the 401(k) refusal makes invalid (seeds 9, 82
  and 100052). The generator-validity tests skip exactly those, only for exactly that refusal, and assert each still occurs.

**Gate at `aaff3f1`:** GATE PASSED, 2925 tests, 2916 passing, 0 failing, 9 authorised todo; closeout accepted 12, refused 0.

**The control (4.7):** declared in `tools/control-candidate-prediction.json` under three new `changes` entries (35 → 38;
PCF-01, the funding rule and the warning's wording had nothing to declare):
- `seed:9`: 4 differences;
- `seed:4`: 28, then 27 re-declared for the realised gain;
- `seed:13`: 1.

**The expanded corpus** at `4ead57c` (R29.1 changes only the rules page, which no capture reads) against `tools/baseline-20260926-s5aa-expanded-r17.json`: **3 of 70 scenarios differ,
33 fields.** The independent corpus invariant passes all 7 checks.

| member | what moves |
|---|---|
| `seed:4` | Taxable → HSA at 83 ($56,260 asked). $5,400 moves, deducted, with its gain realised. Lifetime taxes **$105,933,597.50 → $105,937,429.17** (+$3,831.67); ending net worth −$4,521.54. |
| `seed:9` | HSA → traditional 401(k) at 59: now refused, so nothing moves. A new `TRANSFER_INTO_WORKPLACE_REFUSED` issue, and three Monte Carlo percentiles move. |
| `seed:13` | Taxable → HSA at 65 ($54,280 asked). Its taxable account is empty by then, so $0 moves, as before. Only the new limit warning differs. |

**Self-audit sweep:** `audit/S5AA/R29/S5AA_R29_SELF_AUDIT_TRANSFER_SWEEP.js`, described in the self-audit. It covers every
pairing of 8 account types, over ages, amounts, wages, limit policies and HSA shares: 1,512 plans and 4,476 checks. Each is
held to expectations written from the rules above, not read from the engine.

| engine | problems |
|---|---|
| `4ead57c` | **0** |
| `8009fd8` (before R29) | **987**: 339 MOVED, 432 AGI, 216 AGREE |

## 5. Contracts

- `auditContributions()` gains an optional 7th argument, and returns `oneTime: {allowed, excess, group}` when given one.
  Its items gain `hsaBasePart` and `hsaCatchPart`. Existing callers are unchanged.
- New engine exports, all in the Worker's function list: `transferIntoWorkplaceRefused`, `transferIsContribution` and
  `transferIsHsaFunding`.
- New issue code `TRANSFER_INTO_WORKPLACE_REFUSED` (engine, WARNING). New validator code `TRANSFER_INTO_WORKPLACE_PLAN`
  (ERROR), with `WORKPLACE_PLAN_TYPES` pinned to the engine's workplace limit group by a test.
- A transfer's limit warning goes to `limitWarnings`, written after the move.

## 6. Known limits

- **HSA eligibility is not modelled.** A transfer into an HSA at 83 (`seed:4`) is allowed the full room, though a person
  on Medicare cannot contribute. The same is true of planned HSA contributions today.
- **Custom accounts have no limit group.** A transfer into a custom Roth or custom tax-deferred account from another class
  moves as before, with no contribution limit.
- **A funding distribution does not count toward the year's RMD.** No credit is given, as before for any non-taxable
  destination.
- **A Roth IRA's own five-year and ordering rules are still not modelled.** This limit is already disclosed.
- **Under `warn`, the whole amount is deducted as a contribution,** as planned contributions are treated under `warn`.
  The excess is warned about, not re-characterised.
- **No new expanded baseline is registered.** Every stored baseline before this repository records a commit that exists
  only in the private archive. Registering one recorded here needs `tests/baseline-provenance.test.js` to handle a mixed
  history, which is not in this round. The diff against r17 above is the record.

## 7. Where I would look first

1. `auditContributions()`'s one-time room (§3). Is it right for a joint return, for a spouse's account, and when planned
   contributions already exceed the limit under `warn`?
2. The HSA deduction in both income formulas. Could a quote and its commit ever disagree?
3. The gain on a transfer dated after the year's draw. Is it added exactly once?
4. The refusal's interaction with the pre-existing conversion refusal. Does any pairing get two refusals, or none?
