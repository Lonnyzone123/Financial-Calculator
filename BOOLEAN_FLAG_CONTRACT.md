# Boolean flag contract — Q53

**Version 1 · written 2026-09-13, S4 task 2b.2e.** Machine-readable form: `src/boolean-flag-contract.json` (authoritative wherever this page and it disagree). Qualification: `tests/boolean-flag-contract.test.js`. **Enforcement: built in S5 block 2l** (engine `ca28d66`, validator `e15e187`; corrected 2026-09-14, this line previously read "not yet built"). **2026-09-14 S5 audit (S5-A01, medium):** `withDocumentedFlagDefaults()` copies records and arrays outside the serialization boundary, so it drops an array's own `toJSON` and runs getters unguarded — the run will file this as its own `SPRINT_QUESTIONS.md` entry and repair it red-first; S5 stays stopped pending correction, not closed on this basis.

*Measurements on this page were taken at `ba657e2` unless a line says otherwise.*

---

## 1. What this is

`SPRINT_QUESTIONS.md` Q53 found that the engine reads the plan's boolean flags by truthiness (`if(p.X)`), so the string `"false"` switches a feature **on**. The validator type-checks two of them.

This contract is the **one definition** both layers will read when S5 repairs that:

- **It defines** which fields are boolean flags, what a flag's default is, which values are accepted, and what each layer must do with every other value.
- **It does not enforce anything yet.** Enforcement changes rejection behaviour, and S4's ground rule 9 holds behaviour still. The refusal witnesses are `todo` tests owned by S5 2l, in `tools/test-exception-registry.json`.
- **It replaces a pattern, not just a list.** `ADVANCED_BOOLEAN_FIELDS` in `src/scenario-validator.js` is a one-element hand-written list. S5 2l retires it in favour of this file. A second hand-written flag list is the defect shape of Q20, Q33 and Q38.

## 2. The value rules

| Value | Rule |
|---|---|
| `true`, `false` | accepted |
| absent | legal. The import route fills the documented default; the engine routes read it as `false` (§6) |
| `null` | **rejected**, not treated as absent |
| any number, `0` and `1` included | rejected |
| any string, including `""`, `"true"`, `"false"`, `"0"`, `"1"` | rejected |
| arrays, objects | rejected |

**Never coerced.** `Boolean("false")` is `true`, so coercion is the defect written differently, not a repair. A legacy non-boolean encoding is supported only through an explicit, versioned import migration.

**What each layer does with a rejected value:**

- **Engine boundary** — `runPlan()`, `runScenario()`, and the generated Worker. It covers flags whose reader is `engine`. It refuses with `SCENARIO_NONBOOLEAN_FLAG`, returning the documented invalid-result shape (`calculationError: true`, `rows: null`) and one issue whose `state.path` names the flag, indexed for record fields (`accounts[0].matchOn`). `accounts[].cashHolding` keeps its existing `SCENARIO_INVALID_CASH_HOLDING`.
- **Validator** — covers flags whose reader is `engine` or `app`. It raises `WRONG_TYPE` at severity `ERROR`, at the flag's indexed path, the form the validator already uses.

## 3. Inventory

**How the list was found.** It was derived from the data, not written from what was believed to exist:

1. The schema catalogue fixture's boolean leaves: 30.
2. The live `defaultPlan`'s boolean values, plus what the app's record normalizers fill in: 30.
3. A scan of `src/engine.js` for property reads in a boolean context. It found no plan flag outside the first two sources.
4. A scan of `src/app-shell.html` for properties it writes as booleans. It found one more field: `advanced.v210Migrated`.

That makes **32 flags.** The test re-derives sources 1 and 2 on every run, so a new boolean field without a contract entry fails by name.

**Reader** says who reads the value:

- `engine` — a malformed value changes a projection.
- `app` — only the app shell reads it. A malformed value changes app behaviour, not a projection.
- `migration` — `normalizedPlan()` overwrites it before anything reads it.

**Engine today** was measured in a setup where `true` and `false` give different results; "true result" means the value behaved as `true`.

| Flag | Default | Reader | Engine reads (`src/engine.js`) | Validator today | Engine today, in a divergent setup |
|---|---|---|---|---|---|
| `accounts[].cashHolding` | `false` (absent; not filled) | engine | 660–662 boundary, 974 `=== true` | `WRONG_TYPE` | **already refused**, every non-boolean |
| `accounts[].matchOn` | `false` | engine | 1360 | — | truthy¹ |
| `advanced.armRecastOnReset` | `false` | engine | 1416 → 869 | `WRONG_TYPE` | truthy¹ |
| `advanced.assetsOn` | `false` | engine | 817, 818, 820, identity | — | truthy¹ |
| `advanced.bondTentOn` | `false` | engine | 1309, identity | — | truthy¹ |
| `advanced.conversionOn` | `false` | engine | 1379, identity | — | truthy¹ |
| `advanced.debts[].includeHousingCosts` | `true` for mortgage, else `false` | engine | 869 | — | truthy¹ |
| `advanced.debts[].includePayment` | `true` | engine | 869 | — | truthy¹ |
| `advanced.debts[].taxDeductible` | `true` for mortgage and heloc, else `false` | app | — | — | not read |
| `advanced.glideOn` | `false` | engine | 817, identity | — | truthy¹ |
| `advanced.healthOn` | `false` | engine | 821, 1414, identity | — | truthy¹ |
| `advanced.ltcOn` | `false` | engine | 1345, identity | — | truthy¹ |
| `advanced.networthOn` | `false` | engine | 1346, 1685, identity | — | truthy¹ |
| `advanced.otherAssets[].available` | `false` | engine | 871 | — | truthy¹ |
| `advanced.penaltyException` | `false` | engine | 821, 822, 1467 | — | truthy¹ |
| `advanced.reserveOn` | `false` | engine | 820, 821, 1309, identity | — | truthy¹ |
| `advanced.rmdOn` | `false` | engine | 1036, identity | — | truthy¹ |
| `advanced.rule55` | `false` | engine | 821, 822, 1467 | — | truthy¹ |
| `advanced.transferOn` | `false` | engine | 1361, identity | — | truthy¹ |
| `advanced.v210Migrated` | `false` (absent; set by migration) | app | — | — | not read |
| `assumptions.rollingHistory` | `false` | engine | identity only (2003) | — | identity only² |
| `profile.spouseOn` | `false` | engine | 10 sites, 29–1485 | — | truthy¹ |
| `retirement.dividendOn` | `false` | engine | 1415, 1467, identity | — | truthy¹ |
| `retirement.guytonSkipInflation` | `true` | engine | 1260 | — | truthy¹ |
| `retirement.homeEquityFallback` | `false` | engine | 1669 | — | truthy¹ |
| `retirement.incomeOffset` | `true` | migration | — | — | not read |
| `retirement.irmaaGuard` | `true` | engine | 821 | — | truthy¹ |
| `retirement.preserveRoth` | `false` | engine | 821 | — | **unverified**³ |
| `retirement.rmdSmoothing` | `true` | engine | 821 | — | truthy¹ |
| `retirement.ssAdvanced` | `false` | engine | 813 | — | truthy¹ |
| `retirement.survivor` | `false` | engine | 821, 1140, 1260 | — | truthy¹ |
| `setupComplete` | `false` | app | — | — | not read |

"identity" means `buildSimulationIdentity()`'s `featureFlags`, read with `!!`, so `"false"` is recorded as `true` there too.

¹ **Truthy:** `null`, `0` and `""` give the `false` result; `1`, `"true"`, `"false"`, `"0"`, `[]` and `{}` give the `true` result. `"1"` was not probed separately. Q53 confirmed nine flags. S4 measured the rest in divergent setups, including all five Q53 had left **inconclusive**:

| Flag | Setup |
|---|---|
| `survivor` | spouse present |
| `homeEquityFallback`, `available` | a shortfall with an available liquid home |
| `rule55`, `networthOn`, `matchOn`, `penaltyException`, `transferOn`, `ssAdvanced`, `includePayment`, `includeHousingCosts` | the busy household in the test file |
| `glideOn` | simple returns with asset classes on |
| `assetsOn` | simple returns with allocations |
| `rmdSmoothing` | the base plan |
| `guytonSkipInflation` | Monte Carlo, 40 runs, volatility 25, guyton at 5%, retiring at 51 |
| `irmaaGuard` | age 60, retiring at 61, $2.5M pre-tax, $150,000 spending, $3,500 Social Security |

The last two setups are not in the test file, because their flags default to `true` (§6). S5 2l.4 should re-derive them rather than trust this row.

² The engine reads `rollingHistory` only into `runScenario()`'s identity (`historicalPeriod.rolling`), so no projection differs. The heat map in the app shell reads it as well.

³ No setup S4 tried makes `preserveRoth`'s `true` and `false` differ: the base plan, the busy household, a Roth-heavy plan, and a plan near the IRMAA threshold. It only adjusts an account-order score. **Carried as unverified, not safe.**

## 4. What each route does today

Every value class was measured on every flag through `runPlan()` and `validateScenario()`: 12 value classes × 31 flags, 372 cells, at `ba657e2`. The test file adds `runScenario()` and the generated Worker.

- **Engine routes.** `accounts[].cashHolding` is refused for every non-boolean. Every other engine-read flag runs to `status: "ok"` with the truthy result above.
- **Validator.** It raises `WRONG_TYPE` for every non-boolean on `accounts[].cashHolding` and `advanced.armRecastOnReset`, and **nothing** on the other 30: 29 measured in the probe, and `advanced.v210Migrated` in the test file.
- **Absent.** Legal on every route.
- **Not measured:** the exported `simulatePlan()` and the historical heat map. They bypass `runPlan()`'s gates (CQ-6), and whether they get this check is S5 2n.1's decision.

## 5. Choices S4 made, from evidence — reviewable

1. **`null` is rejected, not absent.** This is precedent, not a new policy: all three existing boolean checks already reject `null`.
2. **Layer scope follows the reader.** The engine boundary refuses only flags the engine reads; refusing a plan over a field no projection reads would reject it for something that cannot change its result. The validator also covers app-read flags, because a malformed `setupComplete`, `taxDeductible` or `v210Migrated` does change what the app does: `"false"` on `v210Migrated` skips the v2.1.0 home-and-debt migration. `incomeOffset` is unchecked, because `normalizedPlan()` overwrites it on every import.
3. **One refusal code with a path, `SCENARIO_NONBOOLEAN_FLAG`.** It follows the `SCENARIO_*` shape Q49 used (`5d34573`). The path is there because 28 flags share one code. The name lives in the JSON only; change it there.
4. **`cashHolding` keeps its own code.** Its category contract (RB-02) refuses more than a wrong type.

## 6. Absent flags on the engine routes

> **DECIDED 2026-09-13 (the owner): (b) — the engine boundary applies the documented default.** Same decision as Q53's own resolution overall (absent takes its documented default; a present non-boolean is refused, never coerced; an explicit `false` is preserved). Recorded in `src/boolean-flag-contract.json`'s `openQuestions.absentOnEngineRoutes`, per §8's own instruction. **Repair is S5 2l.2, not yet landed** — the absent witnesses for the five default-`true` flags below still need adding to match, also per §8.

*(As it stood before the decision:)* **Not decided in S4 (ground rule 8). For the owner, before S5 2l.2.**

The engine applies no defaults, so a flag absent from a plan handed directly to `runPlan()`, `runScenario()` or the Worker reads as `false`. That matches the documented default for every default-`false` flag; the test witnesses this for 21 of them. It does **not** match for the five flags whose default is `true`:

- `advanced.debts[].includePayment`
- `retirement.guytonSkipInflation`
- `retirement.irmaaGuard`
- `retirement.rmdSmoothing`
- `advanced.debts[].includeHousingCosts` on a mortgage

Absent gave the `false` result for all five, each measured in a divergent setup. The app's import route is unaffected: `normalizedPlan()` fills defaults before anything runs.

**The options:**

- **(a)** The engine boundary refuses a plan missing an engine-read flag.
- **(b)** The engine boundary applies the documented default.
- **(c)** Absent stays `false` on the engine routes, and supplying these flags is documented as the direct caller's responsibility.

(b) and (c) give different results for a direct caller that omits a default-`true` flag; (a) refuses that call instead.

**What it would move, measured.** No stored scenario is affected by any option:

- The capture corpus (`tools/capture-baseline.js` `corpus()`, 36 plans) and the five golden scenarios carry every default-`true` plan-level flag.
- All 11 corpus debts carry `includePayment`.
- The 10 corpus debts without `includeHousingCosts` have no `type`, so their documented default is `false`, and none has a housing cost.

The question is about direct programmatic callers only.

## 7. Not covered, and why

- **`simulatePlan()` and the heat map** — S5 2n.1 decides first (§4).
- **`preserveRoth`'s absent witness** — no divergent setup exists (§3, note 3).
- **`rollingHistory`'s absent witness** — no projection reads it (§3, note 2).
- **The live UI's form layer.** It writes checkbox `.checked` values, which are booleans; it was not audited here.
- **`app.compare`** is a boolean the shell writes, but it is app state, not a plan field.
- **Two catalogue gaps, handled rather than fixed.** `advanced.otherAssets[].available` is absent from the schema catalogue, because the corpus specimen carries no such field, so the test takes it from `normalizeOtherAsset()`. `advanced.v210Migrated` is in no derived source at all, so its entry is held by the reader test.

## 8. Changing this contract

- **Edit `src/boolean-flag-contract.json`.** The test enforces completeness against the catalogue, `defaultPlan` and the normalizers; each default against the source it names; and each reader against the code.
- **When S5 2l lands a route's check,** that route's `todo` test starts passing. Remove its `todo` marker and its registry entry in the same commit; the gate refuses a passing authorized todo.
- **When §6 is decided,** record the decision in the JSON's `openQuestions`, and add absent witnesses for the default-`true` flags to match.
