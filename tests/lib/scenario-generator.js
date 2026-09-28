'use strict';

// Seeded, valid-by-construction Scenario generation for Track B's L4
// integration layer (tests/reconciliation-invariant.test.js).
//
// WHY IT EXISTS. The entire regression and integration corpus is five
// hand-written scenarios (GOLDEN_SCENARIOS in ./golden-scenario-defs.js).
// An invariant asserted across five plans is a spot check; asserted across a
// structurally varied seeded sweep it is an invariant. This module produces
// the sweep.
//
// THE RULE, AND ITS ONE DECLARED EXCEPTION (S3 task 1, 2026-09-11).
//
// This generator derives what it can rather than inventing it. It USED to
// derive everything, and that rule -- honourable as it was -- is what made
// Q17 and Q21 possible: a field the validator does not constrain got jittered
// around defaultPlan's own value, so a default of 0 stayed 0 for every seed,
// and a field nothing mentioned stayed constant forever. `spouseSS` was 0
// across all 200 seeds while four corpus scenarios LOOKED like they covered
// FM-01, and the baseline harness reported IDENTICAL for a genuine P1 repair.
// `surplusPolicy` was "retain" and `dividendOn` was false everywhere, so
// RA-02 (P1) and RA-03 were unreachable by any generated scenario.
//
// So there is now exactly one place where this file states values of its own:
// the DECLARED RANGES and DECLARED POLICY SPACE inside generateScenario(),
// each marked and each recorded in SPRINT_QUESTIONS.md as Q24. Everything
// else still derives. The exception is written here rather than left to be
// discovered, because a header that claims a property the code no longer has
// is the failure mode this project has already been bitten by (RA-01: a
// comment described the intended design while the caller did the opposite,
// and the tests agreed with the comment).
//
// What is still derived, and must stay derived:
//
//   * Every field the validator RANGE-CHECKS is drawn from that check's own
//     bounds, read out of src/scenario-validator.js at load time (see
//     extractRangeBounds below) rather than copied here, so the two cannot
//     drift apart.
//   * Every field the validator ENUM-CHECKS is drawn from the enum array the
//     validator itself exports.
//   * Nested-record field sets come from the validator's own
//     NESTED_RECORD_SPECS / FUTURE_CHANGE_SPEC, read out of the same source.
//   * Withdrawal-strategy names are read out of src/engine.js's own dispatch.
//   * Every remaining numeric field -- the ones nothing constrains -- is
//     JITTERED AROUND defaultPlan'S OWN VALUE rather than given a range
//     someone made up here. The app's own defaults are the only non-arbitrary
//     anchor available for them.
//
// A scenario is a pure function of one integer seed, so any downstream
// failure is reproducible from that integer alone.
//
// SCOPE BOUNDARY: this module produces SCENARIOS. It asserts nothing about
// results -- that is the invariant layer's job.

const fs = require('node:fs');
const path = require('node:path');

const {
  buildScenario,
} = require('./golden-scenario-defs');

const {
  TAX_CLASSES, FILING_STATUSES, METHODS, WITHDRAWAL_ORDERS, RATE_TYPES, LIQUIDITY_TIERS,
} = require('../../src/scenario-validator.js');

const VALIDATOR_PATH = path.join(__dirname, '..', '..', 'src', 'scenario-validator.js');
const ENGINE_PATH = path.join(__dirname, '..', '..', 'src', 'engine.js');
const VALIDATOR_SOURCE = fs.readFileSync(VALIDATOR_PATH, 'utf8');
const ENGINE_SOURCE = fs.readFileSync(ENGINE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// Reading the constraints out of the code that owns them
// ---------------------------------------------------------------------------

/*
 * The validator's numeric bounds live as inline literals inside its
 * checkRange() calls and are not exported. Copying them here would create
 * exactly the silent drift this project has already been bitten by, and
 * exporting them would mean editing src/scenario-validator.js -- which this
 * sprint does not do. So they are parsed out of the source instead. There is
 * precedent in this same directory: golden-scenario-defs.js brace-extracts
 * defaultPlan straight out of app-shell.html.
 *
 * Paths built with a template literal (`${path}.basisPct`) are normalized to
 * a '*' prefix, since the concrete index is irrelevant to the bound.
 * assertBoundsPresent() below turns a validator rename into a loud failure
 * rather than a silent fallback.
 */
function extractRangeBounds(source) {
  const bounds = {};
  const re = /checkRange\(\s*c\s*,\s*[^,]+?,\s*(?:'([^']*)'|`([^`]*)`)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const raw = m[1] !== undefined ? m[1] : m[2];
    const key = raw.replace(/\$\{[^}]*\}/g, '*');
    const min = Number(m[3]);
    const max = Number(m[4]);
    if (bounds[key] && (bounds[key].min !== min || bounds[key].max !== max)) {
      throw new Error(
        'scenario-generator: scenario-validator.js range-checks "' + key + '" with two different ' +
        'bounds (' + JSON.stringify(bounds[key]) + ' and ' + JSON.stringify({ min, max }) + '). ' +
        'Resolve which one is authoritative before generating against it.'
      );
    }
    bounds[key] = { min, max };
  }
  return bounds;
}

const RANGE_BOUNDS = extractRangeBounds(VALIDATOR_SOURCE);

const EXPECTED_BOUND_KEYS = [
  'profile.age', 'profile.endAge', '*.basisPct',
  'retirement.ssClaim', 'advanced.correlation', '*.accessPct',
];

function assertBoundsPresent() {
  const missing = EXPECTED_BOUND_KEYS.filter(function (k) { return !RANGE_BOUNDS[k]; });
  if (missing.length) {
    throw new Error(
      'scenario-generator: could not find checkRange bounds for [' + missing.join(', ') + '] in ' +
      'src/scenario-validator.js. The validator changed shape -- update the extractor rather ' +
      'than letting the generator invent ranges of its own.'
    );
  }
}
assertBoundsPresent();

function bound(key) {
  const b = RANGE_BOUNDS[key];
  if (!b) throw new Error('scenario-generator: no bound for ' + key);
  return b;
}

/*
 * Brace-extracts a named object literal from source and evaluates it.
 * Deliberately a local copy of golden-scenario-defs.js's braceExtract rather
 * than an import of it: exporting that helper would mean editing an existing
 * file, and this sprint's defining constraint is that it creates new files
 * only. The duplication is four lines and is noted here so it can be
 * collapsed in a later sprint.
 */
function braceExtract(src, marker) {
  const i = src.indexOf(marker);
  if (i === -1) throw new Error('scenario-generator: could not find "' + marker + '"');
  let j = src.indexOf('{', i), depth = 0, inStr = null;
  for (let k = j; k < src.length; k++) {
    const c = src[k];
    if (inStr) { if (c === '\\') { k++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(j, k + 1); }
  }
  throw new Error('scenario-generator: unbalanced braces after "' + marker + '"');
}

// The validator's own definition of a complete nested record. The near-miss
// mode below omits fields from exactly these `required` lists -- that is what
// makes a near miss a near miss rather than random noise.
const INCOME_TYPES = eval(
  '(' + VALIDATOR_SOURCE.slice(
    VALIDATOR_SOURCE.indexOf('const INCOME_TYPES ='),
    VALIDATOR_SOURCE.indexOf(';', VALIDATOR_SOURCE.indexOf('const INCOME_TYPES ='))
  ).replace('const INCOME_TYPES =', '') + ')'
);
const NESTED_RECORD_SPECS = eval('(' + braceExtract(VALIDATOR_SOURCE, 'const NESTED_RECORD_SPECS =') + ')');
const FUTURE_CHANGE_SPEC = eval('(' + braceExtract(VALIDATOR_SOURCE, 'const FUTURE_CHANGE_SPEC =') + ')');

/*
 * The withdrawal-strategy names, read from the engine's own declaration,
 * `var WITHDRAWAL_STRATEGIES=[...]` in src/engine.js (Q38, S5 task 1.2). The
 * validator has no enum for this field, so the engine is the only authority on
 * what values it recognizes.
 *
 * History, kept because it is the reason for the shape:
 * - This used to harvest the `strategy==="..."` comparisons out of the dispatch
 *   by regex, a second definition of a set the engine owns.
 * - Its first guard read `length < 5`, which survived losing FOUR of nine.
 * - P2 then collapsed the expression holding the only "incomeFirst" in
 *   engine.js. The harvest quietly returned eight names, d.pick() chose
 *   differently at every seed, and the whole corpus changed with no semantic
 *   cause -- a diff that looked like a severe financial regression and was not.
 * - The fix after that was an exact hand-written EXPECTED_STRATEGIES list: a
 *   third definition, held until the engine declared the set.
 * The engine now declares it, and tests/registry-single-definition.test.js holds
 * that declaration equal to the dispatch, which is where that check belongs.
 *
 * SORTED, deliberately: d.pick() indexes into this array, and every stored
 * corpus was generated from the harvest's sorted order. The declaration's own
 * order is not the corpus contract.
 */
function readDeclaredStrategies(source) {
  const m = source.match(/^var WITHDRAWAL_STRATEGIES=(\[[^\]\n]*\]);$/m);
  if (!m) {
    throw new Error('scenario-generator: src/engine.js does not declare `var WITHDRAWAL_STRATEGIES=[...]` on a ' +
      'line of its own. Every generated scenario picks its strategy from that declaration, so the corpus ' +
      'cannot be generated without it.');
  }
  const names = JSON.parse(m[1]);
  if (!Array.isArray(names) || names.length === 0 || names.some((n) => typeof n !== 'string' || !n) ||
      new Set(names).size !== names.length) {
    throw new Error('scenario-generator: WITHDRAWAL_STRATEGIES must be a non-empty list of distinct strategy names, got ' +
      JSON.stringify(names));
  }
  return names.slice().sort();
}
const STRATEGIES = readDeclaredStrategies(ENGINE_SOURCE);

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/** mulberry32 -- small, fast, and fully determined by its 32-bit seed. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDraw(rng) {
  const d = {
    unit: function () { return rng(); },
    int: function (lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); },
    float: function (lo, hi, decimals) {
      const v = lo + rng() * (hi - lo);
      const p = Math.pow(10, decimals === undefined ? 2 : decimals);
      return Math.round(v * p) / p;
    },
    pick: function (arr) { return arr[Math.floor(rng() * arr.length)]; },
    bool: function (p) { return rng() < (p === undefined ? 0.5 : p); },
    // Within a bound the validator itself declares.
    inBound: function (key, decimals) {
      const b = bound(key);
      return d.float(b.min, b.max, decimals === undefined ? 2 : decimals);
    },
    intInBound: function (key) {
      const b = bound(key);
      return d.int(Math.ceil(b.min), Math.floor(b.max));
    },
    // For fields nothing constrains: multiplicative jitter around the app's
    // own default, which is the only non-arbitrary anchor available.
    jitter: function (base, spread, min, max) {
      const b = Number(base) || 0;
      const factor = 1 + (rng() * 2 - 1) * spread;
      let v = Math.round(b * factor * 100) / 100;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      return v;
    },
    shuffle: function (arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },
  };
  return d;
}

// ---------------------------------------------------------------------------
// Primary mode -- valid scenarios
// ---------------------------------------------------------------------------

const ACCOUNT_TYPE_BY_CLASS = {
  taxable: 'taxable',
  preTax: 'traditional401k',
  roth: 'rothIRA',
  hsa: 'hsa',
};

function generateAccounts(d, count) {
  const accounts = [];
  for (let i = 0; i < count; i++) {
    const taxClass = d.pick(TAX_CLASSES);
    const futureChanges = [];
    const changeCount = d.int(0, 2);
    for (let k = 0; k < changeCount; k++) {
      // A COMPLETE record: every field FUTURE_CHANGE_SPEC marks required.
      futureChanges.push({
        age: d.int(30, 70),
        mode: d.pick(FUTURE_CHANGE_SPEC.enums.mode),
        value: d.float(0, 25000),
      });
    }
    accounts.push({
      id: 'gen-a' + (i + 1),
      name: 'Generated ' + (i + 1),
      type: ACCOUNT_TYPE_BY_CLASS[taxClass],
      taxClass,
      owner: 'self',
      balance: d.float(0, 1500000),
      contribution: d.float(0, 25000),
      contributionMode: 'amount',
      priority: i + 1,
      basisPct: d.inBound('*.basisPct'),
      annualChange: 0,
      annualChangeMode: 'amount',
      frequency: 1,
      changeTiming: 'year',
      futureChanges,
      allocation: {},
      matchOn: false,
      matchCap: 0,
      matchRate: 0,
      profitShare: 0,
      vesting: 100,
    });
  }
  // At least one account must actually hold money, or there is no portfolio
  // to reconcile and the sweep degenerates.
  if (accounts.every(function (a) { return a.balance <= 0; })) {
    accounts[0].balance = d.float(50000, 750000);
  }
  return accounts;
}

function generateNestedRecords(d, retireAge, endAge) {
  const stages = [];
  const stageCount = d.int(0, 2);
  let cursor = retireAge;
  for (let i = 0; i < stageCount && cursor < endAge; i++) {
    const start = cursor;
    const end = Math.min(endAge, start + d.int(3, 12));
    // COMPLETE: every field NESTED_RECORD_SPECS.stages marks required.
    /* Q73 (S5 2s.1): a stage's value range follows the mode just drawn. The mode was drawn twice, so 51 of the
       first 120 seeds paired one mode with the other's range (seed:1 spent 49,103% of its strategy amount). The
       second pick is still made and discarded, so every later draw in the plan is unchanged. */
    const stageMode = d.pick(NESTED_RECORD_SPECS.stages.enums.mode);
    d.pick(NESTED_RECORD_SPECS.stages.enums.mode);
    stages.push({
      name: 'stage' + (i + 1),
      start,
      end,
      mode: stageMode,
      value: stageMode === 'percent' ? d.float(50, 120) : d.float(10000, 90000),
      growthMode: d.pick(NESTED_RECORD_SPECS.stages.enums.growthMode),
      annualChange: d.float(0, 3),
    });
    cursor = end + 1;
  }

  const expenses = [];
  const expenseCount = d.int(0, 2);
  for (let i = 0; i < expenseCount; i++) {
    expenses.push({
      name: 'expense' + (i + 1),
      age: d.int(retireAge, endAge),
      amount: d.float(1000, 60000),
      kind: d.pick(NESTED_RECORD_SPECS.expenses.enums.kind),
    });
  }

  const otherIncomes = [];
  const incomeCount = d.int(0, 2);
  for (let i = 0; i < incomeCount; i++) {
    const type = d.pick(INCOME_TYPES);
    const start = d.int(retireAge, Math.max(retireAge, endAge - 1));
    const record = {
      name: 'income' + (i + 1),
      type,
      amount: d.float(2000, 45000),
      start,
      owner: d.pick(NESTED_RECORD_SPECS.otherIncomes.enums.owner),
      growthMode: d.pick(NESTED_RECORD_SPECS.otherIncomes.enums.growthMode),
      growth: d.float(0, 3),
    };
    // `end` is required unless the record is a one-time payment -- the
    // validator's own requiredUnlessOneTime rule, not a choice made here.
    if (type !== 'oneTime') record.end = d.int(start, endAge);
    otherIncomes.push(record);
  }

  return { stages, expenses, otherIncomes };
}

/**
 * A complete, valid scenario, determined entirely by `seed`.
 *
 * Ages are drawn ordered (age <= retireAge <= endAge) inside the validator's
 * own 0..120 bounds. The ordering is not an invented extra constraint -- the
 * validator itself reports INCONSISTENT_AGES when it is violated, so an
 * unordered draw would generate scenarios that do not validate clean.
 */
/* Scalars this generator deliberately does NOT vary, each with a reason that
   is checkable rather than a matter of taste: THE ENGINE NEVER READS THEM.
   Varying a field src/engine.js does not look at cannot exercise anything --
   it only adds noise to every scenario's inputHash.

   tests/scenario-generator.test.js asserts that every scalar in defaultPlan is
   either varying across seeds or named here, so a field added to defaultPlan
   cannot land blind unnoticed. That is exactly how advanced.retainedCashOrder
   got in: added for the Q22 decision, live (the engine reads it, the validator
   validates it), and blind from birth because nothing connected the two.

   THAT THE ENGINE IGNORES THESE FIVE IS ITSELF WORTH A LOOK -- see Q25.
   advanced.home, advanced.debt and advanced.homeGrowth in particular are
   user-facing net-worth inputs that no projection consumes. */
const INTENTIONALLY_FIXED = {
  'profile.state': 'no state-tax model exists; RULES has no state table',
  'assumptions.returnPreset': 'a UI label that sets returnRate; the engine reads only the rate',
  'advanced.home': 'net worth is computed from accounts/otherAssets/debts; this input is unread',
  'advanced.debt': 'as advanced.home -- superseded by the debts array',
  'advanced.homeGrowth': 'appreciation rate for an unread input, so also unread',
  /* P2 (2026-09-10): no longer a toggle. Outside income always offsets the
     portfolio draw, so this is constant by decision rather than by the
     generator failing to reach it -- which is the distinction this map
     exists to record. Q18 and Q26 closed with it. */
  'retirement.incomeOffset': 'P2 removed the toggle; outside income always offsets the draw',
};

function generateScenario(defaultPlan, seed) {
  const d = makeDraw(makeRng(seed));

  const ageBound = bound('profile.age');
  const endBound = bound('profile.endAge');
  const age = d.int(Math.max(25, ageBound.min), 70);
  const retireAge = Math.min(90, age + d.int(0, 25));
  const endAge = Math.min(endBound.max, retireAge + d.int(5, 30));

  const spouseOn = d.bool(0.4);
  // 'mfj' with no spouse is not a shape the app's own UI can produce. The
  // validator has no cross-field rule for it, so this is a conservative
  // consistency choice, not a bound.
  const filing = spouseOn ? d.pick(FILING_STATUSES) : d.pick(FILING_STATUSES.filter(function (f) { return f !== 'mfj'; }));

  const method = d.pick(METHODS);
  const withdrawalOrder = d.pick(WITHDRAWAL_ORDERS);

  const base = JSON.parse(JSON.stringify(defaultPlan));
  const nested = generateNestedRecords(d, retireAge, endAge);

  const assumptions = {
    method,
    returnRate: d.jitter(base.assumptions.returnRate, 0.5, 0),
    volatility: d.jitter(base.assumptions.volatility, 0.6, 0),
    inflation: d.jitter(base.assumptions.inflation, 0.6, 0),
    fee: d.float(0, 1.5),
    withdrawalTiming: d.pick(['annual', 'quarterly', 'monthly']),
  };
  if (method === 'historical') {
    // Only these two mean anything outside historical mode, and drawing them
    // unconditionally would put noise in every other scenario's inputHash.
    assumptions.historyStart = d.int(1928, 1990);
    assumptions.rollingHistory = d.bool(0.4);
  }
  if (method === 'monteCarlo') {
    // Kept small on purpose: this corpus is swept row-by-row by the L4
    // invariant, and path count buys nothing there.
    assumptions.runs = d.int(20, 60);
    assumptions.seed = d.int(1, 1000000);
  }

  /* S3 task 1 / Q17 -- DECLARED RANGES for fields the jitter could not reach.
     d.jitter() perturbs a field around defaultPlan's OWN value, so a field
     whose default is 0 stays 0 for every seed and a field the generator never
     mentions stays constant. That is why `spouseSS` was 0 across all 200
     seeds while four corpus scenarios LOOKED like they covered FM-01: the
     harness reported IDENTICAL for a genuine P1 repair.

     Ranges are stated here rather than derived, because nothing in the
     validator bounds them -- these are money, not percentages. Recorded as
     Q24. Zero is drawn deliberately some of the time: a household with no
     Social Security is a real shape, and one that only ever sees non-zero
     benefits is as blind as one that only ever sees zero. */
  const employment = {
    salary: d.bool(0.25) ? 0 : d.float(30000, 300000),
    spouseSalary: spouseOn ? (d.bool(0.35) ? 0 : d.float(20000, 220000)) : 0,
    growth: d.float(0, 6),
    // Contributions stop somewhere between today and retirement; outside that
    // window the field is inert and would not be exercising anything.
    contributionStop: d.int(Math.floor(age), Math.max(Math.floor(age), Math.floor(retireAge))),
  };

  const retirement = {
    spending: d.jitter(base.retirement.spending, 0.6, 0),
    strategy: d.pick(STRATEGIES),
    withdrawalOrder,
    ssClaim: d.intInBound('retirement.ssClaim'),
    ssBenefit: d.bool(0.15) ? 0 : d.float(800, 5000),
    ssFra: d.int(66, 67),
    ssCola: d.float(0, 4),
    // The strategy is drawn above; these are the parameters the strategies
    // read. Drawn unconditionally because each is inert under the strategies
    // that ignore it, and gating them would need a strategy->parameter map
    // that nothing in the engine exposes.
    withdrawalRate: d.float(2, 8),
    upperGuardrail: d.int(10, 30),
    lowerGuardrail: d.int(10, 30),
    adjustment: d.int(5, 20),
    guytonSkipInflation: d.bool(),
    vpwMinRate: d.float(0, 3),
    vpwMaxRate: d.float(5, 15),
    flexibility: d.int(0, 30),
    optimizationGoal: d.pick(['balanced', 'legacy', 'spending', 'success', 'taxes']),
    /* P2: incomeOffset is no longer a toggle. The DRAW IS STILL CONSUMED and
       discarded, deliberately -- this generator's fields come off one
       sequential stream, so deleting a draw would shift every field after it
       and rewrite the whole corpus for reasons unrelated to the decision.
       Consuming it keeps every other value at every seed exactly where it was,
       which makes the resulting delta readable as "this field, and nothing
       else". */
    incomeOffset: (d.bool(0.5), true),
    irmaaGuard: d.bool(),
    rmdSmoothing: d.bool(),
    preserveRoth: d.bool(0.3),
    homeEquityFallback: d.bool(0.3),
    rmdMultiplier: d.int(80, 150),
    rmdFloor: d.bool(0.7) ? 0 : d.float(1000, 20000),
    pension: d.bool(0.55) ? 0 : d.float(5000, 80000),
    pensionCola: d.float(0, 4),
    stages: nested.stages,
    expenses: nested.expenses,
    otherIncomes: nested.otherIncomes,
  };
  if (spouseOn) {
    retirement.spouseSS = d.bool(0.3) ? 0 : d.float(600, 4000);
    retirement.spouseClaim = d.intInBound('retirement.ssClaim');
    // Survivor modelling is the branch Q17 says has never been exercised by a
    // generated scenario, and it only runs when a spouse exists.
    retirement.survivor = d.bool(0.35);
    if (retirement.survivor) retirement.survivorSpendingReduction = d.int(0, 40);
  }

  /* S3 task 1 / Q21 -- A DECLARED POLICY SPACE, not just a numeric range.
     RR2-3 and RR2-4 both correctly predicted the entire corpus would be
     IDENTICAL after repairing RA-02 (P1) and RA-03. Both predictions holding
     WAS the finding: the generator varies numerics and never touches
     enumerated policy fields, so `surplusPolicy` was "retain" and
     `dividendOn` was false in every generated scenario, and neither defect
     was reachable by any of them.

     Marginals, not full combinations: each field is drawn independently, so
     combinations arise at their natural joint frequency rather than being
     enumerated. Exhaustive crossing would be a different and much larger
     corpus, and is a decision nobody has made (Q24). */
  retirement.dividendOn = d.bool(0.35);
  if (retirement.dividendOn) {
    retirement.dividendYield = d.float(1, 5);
    retirement.dividendQualified = d.int(0, 100);
    retirement.dividendStart = d.int(retireAge, endAge);
    retirement.dividendGrowth = d.float(0, 5);
  }
  // A floor above the ceiling is not a shape the UI can produce, so these are
  // derived from the spending actually drawn rather than picked independently.
  retirement.floor = retirement.spending * d.float(0.4, 0.8);
  retirement.ceiling = retirement.spending * d.float(1.2, 2.0);
  retirement.ssAdvanced = d.bool(0.25);
  if (retirement.ssAdvanced) retirement.aime = d.float(2000, 12000);
  if (withdrawalOrder === 'manual') {
    const order = d.shuffle(TAX_CLASSES).slice(0, d.int(1, TAX_CLASSES.length));
    retirement.manualOrder = order.join(',');
  }

  const advanced = {
    correlation: d.inBound('advanced.correlation'),
    rmdOn: d.bool(0.4),
    conversionOn: d.bool(0.3),
    reserveOn: d.bool(0.35),
    bondTentOn: d.bool(0.3),
    // Q21's policy space, continued. `invest` is where RA-02 Case B lived;
    // `spend` is the only preset that turns surplus into lifestyle spending.
    surplusPolicy: d.pick(['retain', 'invest', 'spend']),
    surplusPolicyBySource: { rmd: d.pick(['invest', 'retain', 'spend']) },
    retainedCashOrder: d.pick(['first', 'last']),
    // Every one of these was false in EVERY generated scenario -- seventeen
    // whole features the corpus had never entered. armRecastOnReset is the
    // sharpest: Q15, FM-05 and FM-06 were all raised, repaired and re-audited
    // on a flag no seed could turn on.
    assetsOn: d.bool(0.3),
    glideOn: d.bool(0.3),
    rule55: d.bool(0.25),
    penaltyException: d.bool(0.2),
    healthOn: d.bool(0.35),
    ltcOn: d.bool(0.3),
    networthOn: d.bool(0.35),
    transferOn: d.bool(0.25),
    armRecastOnReset: d.bool(0.4),
    qcd: d.bool(0.7) ? 0 : d.float(1000, 20000),
  };
  if (advanced.glideOn) advanced.retirementStock = d.int(20, 80);
  if (advanced.healthOn) {
    advanced.healthCost = d.float(4000, 30000);
    advanced.healthInflation = d.float(2, 9);
  }
  if (advanced.ltcOn) {
    advanced.ltcCost = d.float(40000, 200000);
    advanced.ltcProbability = d.int(5, 60);
    advanced.ltcYears = d.int(1, 6);
    advanced.ltcInsurance = d.bool(0.6) ? 0 : d.float(10000, 90000);
  }
  if (advanced.networthOn) {
    advanced.insurance = d.bool(0.6) ? 0 : d.float(50000, 900000);
    advanced.legacy = d.bool(0.6) ? 0 : d.float(50000, 900000);
  }
  if (advanced.transferOn) {
    advanced.transferAge = d.int(Math.floor(age), Math.floor(endAge));
    advanced.transferAmount = d.float(1000, 60000);
  }
  if (advanced.conversionOn) advanced.conversionAmount = d.float(5000, 50000);
  if (advanced.reserveOn) advanced.reserveYears = d.int(1, 5);
  if (advanced.bondTentOn) advanced.bondTent = d.int(20, 70);

  if (d.bool(0.45)) {
    const debtCount = d.int(1, 2);
    advanced.debts = [];
    for (let i = 0; i < debtCount; i++) {
      advanced.debts.push({
        id: 'gen-d' + (i + 1),
        name: 'Debt ' + (i + 1),
        balance: d.float(5000, 450000),
        rate: d.float(2, 12),
        rateType: d.pick(RATE_TYPES),
        paymentMonthly: d.float(200, 3500),
        payoffAge: d.int(retireAge, endAge),
        includePayment: d.bool(),
      });
    }
  }

  if (d.bool(0.35)) {
    const assetCount = d.int(1, 2);
    advanced.otherAssets = [];
    for (let i = 0; i < assetCount; i++) {
      advanced.otherAssets.push({
        id: 'gen-o' + (i + 1),
        name: 'Asset ' + (i + 1),
        value: d.float(10000, 800000),
        liquidity: d.pick(LIQUIDITY_TIERS),
        accessPct: d.inBound('*.accessPct'),
        availableAge: d.int(age, endAge),
      });
    }
  }

  const profile = { filing, age, retireAge, endAge, spouseOn };
  if (spouseOn) {
    profile.spouseAge = Math.max(0, age + d.int(-8, 8));
    profile.spouseRetireAge = retireAge;
  }

  const plan = buildScenario(defaultPlan, { profile, assumptions, retirement, advanced, employment });
  plan.id = 'generated-' + seed;
  plan.accounts = generateAccounts(d, d.int(1, 5));
  /* These three need the account list, so they are set after it exists.

     A transfer naming an account that is not there is inert -- moveFunds()
     finds nothing and the feature silently does not happen -- so pointing it
     at real ids is the difference between exercising the path and only
     appearing to. Same for allocations: accountExpected() falls back to the
     plan-wide rate when an allocation sums to zero, so assetsOn over the
     empty allocations generateAccounts() produces would flip the flag without
     reaching the asset-class arithmetic behind it. */
  if (plan.advanced.transferOn && plan.accounts.length >= 2) {
    const from = d.int(0, plan.accounts.length - 1);
    let to = d.int(0, plan.accounts.length - 1);
    if (to === from) to = (from + 1) % plan.accounts.length;
    plan.advanced.transferFrom = plan.accounts[from].id;
    plan.advanced.transferTo = plan.accounts[to].id;
  } else {
    plan.advanced.transferOn = false;
  }
  if (plan.advanced.assetsOn) {
    const classes = (plan.advanced.assetClasses || []).map(function (c) { return c.id; });
    plan.accounts.forEach(function (acct) {
      const weights = classes.map(function () { return d.int(0, 100); });
      const total = weights.reduce(function (x, y) { return x + y; }, 0);
      acct.allocation = {};
      if (total <= 0) { acct.allocation[classes[0]] = 100; return; }
      classes.forEach(function (id, i) { acct.allocation[id] = Math.round((weights[i] / total) * 100); });
    });
  }
  // The engine reads life ages off retirement; keep them consistent with the
  // horizon so a generated plan does not model a death before it starts.
  plan.retirement.selfLife = endAge;
  if (spouseOn) plan.retirement.spouseLife = endAge;
  return plan;
}

/** `count` scenarios from consecutive seeds, each tagged with its own seed. */
function generateScenarios(defaultPlan, options) {
  const opt = options || {};
  const count = Math.max(0, Math.floor(opt.count === undefined ? 25 : opt.count));
  const startSeed = Math.floor(opt.startSeed === undefined ? 1 : opt.startSeed);
  const out = [];
  for (let i = 0; i < count; i++) {
    const seed = startSeed + i;
    out.push({ seed, plan: generateScenario(defaultPlan, seed) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Secondary mode -- bounded near-miss scenarios
// ---------------------------------------------------------------------------

/*
 * SA-01 was an INCOMPLETE nested record that passed both validators and
 * silently zeroed all retirement spending. `retirement.stages =
 * [{name:"Go-go"}]` applied to every year, because applyStage()'s
 * `age < s.start || age > s.end` test is false on both sides when the
 * boundaries are absent. Absent was not inert.
 *
 * This mode manufactures that shape deliberately: take a valid scenario and
 * delete ONE field the validator's own spec marks required, from ONE present
 * record. Every case therefore differs from a legal scenario by exactly one
 * omission, and names it.
 *
 * REPORT-ONLY, and capped. Ground rule 11 applies here with full force: if a
 * near miss is accepted where it should not be, that is a finding to record
 * with its seed -- never an engine or validator change made unattended.
 */
const NEAR_MISS_CAP = 200;

function nestedRecordSites(plan) {
  const sites = [];
  const r = plan.retirement || {};
  Object.keys(NESTED_RECORD_SPECS).forEach(function (key) {
    const list = r[key];
    if (!Array.isArray(list)) return;
    list.forEach(function (entry, i) {
      const spec = NESTED_RECORD_SPECS[key];
      let required = spec.required.slice();
      if (spec.requiredUnlessOneTime && entry.type !== 'oneTime') {
        required = required.concat(spec.requiredUnlessOneTime);
      }
      required.forEach(function (field) {
        if (entry[field] !== undefined) {
          sites.push({ container: 'retirement.' + key, index: i, field, path: 'retirement.' + key + '[' + i + '].' + field });
        }
      });
    });
  });
  (plan.accounts || []).forEach(function (a, ai) {
    if (!Array.isArray(a.futureChanges)) return;
    a.futureChanges.forEach(function (entry, j) {
      FUTURE_CHANGE_SPEC.required.forEach(function (field) {
        if (entry[field] !== undefined) {
          sites.push({
            container: 'accounts[' + ai + '].futureChanges', accountIndex: ai, index: j, field,
            path: 'accounts[' + ai + '].futureChanges[' + j + '].' + field,
          });
        }
      });
    });
  });
  return sites;
}

function applyOmission(plan, site) {
  if (site.container.indexOf('retirement.') === 0) {
    const key = site.container.slice('retirement.'.length);
    delete plan.retirement[key][site.index][site.field];
  } else {
    delete plan.accounts[site.accountIndex].futureChanges[site.index][site.field];
  }
  return plan;
}

/**
 * Up to `count` (hard-capped at NEAR_MISS_CAP) scenarios, each exactly one
 * required-field omission away from valid.
 *
 * Returns [{ seed, plan, omission: { path, field, container } }]. Seeds that
 * happen to generate a scenario with no nested records at all are skipped --
 * there is nothing to omit from them -- so the result can be shorter than
 * `count`, and `attempted` reports how many seeds were consumed.
 */
function generateNearMissScenarios(defaultPlan, options) {
  const opt = options || {};
  const requested = Math.max(0, Math.floor(opt.count === undefined ? NEAR_MISS_CAP : opt.count));
  const count = Math.min(requested, NEAR_MISS_CAP);
  const startSeed = Math.floor(opt.startSeed === undefined ? 100000 : opt.startSeed);

  const cases = [];
  let attempted = 0;
  // Bounded regardless of how many seeds turn out to be barren.
  const maxAttempts = count * 5 + 50;
  for (let i = 0; cases.length < count && attempted < maxAttempts; i++) {
    const seed = startSeed + i;
    attempted++;
    const plan = generateScenario(defaultPlan, seed);
    const sites = nestedRecordSites(plan);
    if (!sites.length) continue;
    // Which site is chosen is itself a function of the seed, so the case is
    // reproducible from the seed alone.
    const pickRng = makeRng(seed ^ 0x5f356495);
    const site = sites[Math.floor(pickRng() * sites.length)];
    cases.push({
      seed,
      plan: applyOmission(plan, site),
      omission: { path: site.path, field: site.field, container: site.container },
    });
  }
  return { cases, attempted, cap: NEAR_MISS_CAP };
}

// ---------------------------------------------------------------------------

/** What this generator read its constraints out of, for report headers. */
function describeSources() {
  return {
    rangeBounds: RANGE_BOUNDS,
    strategies: STRATEGIES,
    incomeTypes: INCOME_TYPES,
    nestedRecordSpecs: NESTED_RECORD_SPECS,
    futureChangeSpec: FUTURE_CHANGE_SPEC,
    enums: { TAX_CLASSES, FILING_STATUSES, METHODS, WITHDRAWAL_ORDERS, RATE_TYPES, LIQUIDITY_TIERS },
  };
}

module.exports = {
  INTENTIONALLY_FIXED,
  STRATEGIES,
  makeRng,
  generateScenario,
  generateScenarios,
  generateNearMissScenarios,
  nestedRecordSites,
  /* S3 task 4: exported so the survivor sweep can apply a CHOSEN omission to a
     CHOSEN site, deterministically. generateNearMissScenarios picks one random
     site per seed, which cannot enumerate every site -- and "every site is
     covered" was the criterion. Purely additive; authorised for task 4 only
     by ground rule 9. */
  applyOmission,
  describeSources,
  RANGE_BOUNDS,
  STRATEGIES,
  NEAR_MISS_CAP,
};
