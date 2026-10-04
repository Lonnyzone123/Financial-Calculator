'use strict';
const { retireAtEnd } = require('./lib/working-horizon'); // S5AA R53 (the owner's decision 3, 2026-10-04): working-only horizons

/*
 * Q53 / S4 task 2b.2e -- the plan's boolean flags, held to ONE declarative
 * definition: src/boolean-flag-contract.json (explained in
 * BOOLEAN_FLAG_CONTRACT.md).
 *
 * THE DEFECT (SPRINT_QUESTIONS.md Q53, SIMULATION_LOG.md Batch 22). The engine
 * reads flags by truthiness, so the string "false" switches a feature ON. S4
 * does not repair it: a rejection-policy change is a behaviour change, and
 * ground rule 9 holds behaviour still while the instruments are built. S5
 * block 2l repairs it, from the contract this file checks.
 *
 * FOUR PARTS, none of them todo since S5 2l.
 *
 *  1. THE CONTRACT IS COMPLETE AND TRUE. Its flag list is hand-written -- it
 *     has to be, it carries decisions -- so it is checked against three
 *     sources it does not control: the schema catalogue's boolean leaves, the
 *     booleans in the live defaultPlan, and the booleans the app's own record
 *     normalizers produce. Each default is checked against the source it
 *     names, and each flag's reader against the code that reads it.
 *  2. WHAT THE REPAIR MUST NOT CHANGE. true and false are accepted on every
 *     route; an absent default-false flag gives the false result, witnessed
 *     only where true and false really diverge. A probe that cannot produce a
 *     difference cannot witness one -- Q53's five "inconclusive" flags were
 *     exactly that.
 *  3. CONTROLS FOR PART 4. The refusal check run over the flags that ARE
 *     already enforced (accounts[].cashHolding at both layers,
 *     advanced.armRecastOnReset at the validator) must find nothing. Without
 *     this, a todo that fails proves only that the check can fail.
 *  4. THE REFUSALS. Every non-boolean value through runPlan(), runScenario(),
 *     the generated Worker and validateScenario(), each saying which flag and
 *     value. The engine routes and validateScenario() refuse since S5 2l.
 *
 * NOT HERE, each for a recorded reason: the exported simulatePlan() and the
 * heat map (S5 2n.1 decided to move the gates into simulatePlan(); their
 * witnesses follow that repair); retirement.preserveRoth and
 * assumptions.rollingHistory in part 2 (see NO_DIVERGENT_SETUP).
 *
 * S5 2l (Q53, decided 2026-09-13 by the owner): an absent flag takes its documented
 * default on the engine routes too (contract openQuestions
 * .absentOnEngineRoutes), so part 2 also witnesses the default-TRUE flags.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SHELL = read('src/app-shell.html');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const { extractDefaultPlan } = require('./lib/golden-scenario-defs.js');
const { liveWorkerSource, postToWorker, cleanup } = require('./lib/worker-source.js');

test.after(() => cleanup());

const CONTRACT = JSON.parse(read('src/boolean-flag-contract.json'));
const CATALOGUE = JSON.parse(read('tests/fixtures/schema-catalogue.fixture.json'));
const DEFAULT_PLAN = extractDefaultPlan(SHELL);

const ENGINE_FLAGS = CONTRACT.flags.filter((f) => f.reader === 'engine');
const VALIDATED_FLAGS = CONTRACT.flags.filter((f) => f.reader === 'engine' || f.reader === 'app');
const flag = (p) => {
  const f = CONTRACT.flags.find((x) => x.path === p);
  assert.ok(f, `the contract has no entry for ${p}`);
  return f;
};

const NON_BOOLEANS = [
  ['null', null], ['0', 0], ['1', 1], ['""', ''], ['"true"', 'true'], ['"false"', 'false'],
  ['"0"', '0'], ['"1"', '1'], ['[]', []], ['{}', {}],
];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ABSENT = Symbol('absent');

const account = (over) => Object.assign({
  id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self',
  balance: 400000, contribution: 6000, contributionMode: 'amount', priority: 1, basisPct: 80,
  annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
  futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
}, over);

function basePlan() {
  const p = JSON.parse(JSON.stringify(DEFAULT_PLAN));
  p.setupComplete = true;
  Object.assign(p.assumptions, { returnRate: 5, inflation: 2.5, method: 'simple', volatility: 12, seed: 4242 });
  Object.assign(p.profile, { age: 50, retireAge: 60, endAge: 90 });
  Object.assign(p.employment, { salary: 110000, contributionStop: 60 });
  p.accounts = [account({}), account({ id: 'a2', name: '401k', type: 'traditional401k', taxClass: 'preTax', balance: 350000, contribution: 12000, priority: 2 })];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  return p;
}

/* A busy household, so that every flag has something to act on: early
   retirement, a spouse to survive, a mortgage, a home, a guyton strategy on
   historical returns. */
function richPlan(rateType) {
  const p = basePlan();
  Object.assign(p.profile, { age: 50, retireAge: 52, endAge: 95, spouseAge: 48 });
  Object.assign(p.employment, { salary: 150000, spouseSalary: 60000, contributionStop: 52 });
  Object.assign(p.retirement, {
    strategy: 'guyton', spending: 95000, dividendYield: 3, dividendStart: 52, aime: 6000,
    ssBenefit: 2800, spouseSS: 1500, pension: 12000, selfLife: 80, spouseLife: 92, survivorSpendingReduction: 20,
  });
  Object.assign(p.assumptions, { method: 'historical', historyStart: 1929, returnRate: 6 });
  Object.assign(p.advanced, {
    conversionAmount: 30000, transferAge: 53, transferFrom: 'a2', transferTo: 'a1', transferAmount: 20000,
    reserveYears: 3, bondTent: 60, retirementStock: 50, healthCost: 15000, ltcCost: 120000, ltcProbability: 100,
    ltcYears: 3, insurance: 250000, qcd: 0,
  });
  p.accounts = [
    account({ balance: 120000, allocation: { stocks: 80, bonds: 15, cash: 5 } }),
    account({ id: 'a2', name: '401k', type: 'traditional401k', taxClass: 'preTax', balance: 900000, contribution: 20000, priority: 2,
      matchRate: 100, matchCap: 5, allocation: { stocks: 90, bonds: 10, cash: 0 } }),
    account({ id: 'a3', name: 'Roth IRA', type: 'rothIRA', taxClass: 'roth', balance: 150000, contribution: 7000, priority: 3,
      allocation: { stocks: 100, bonds: 0, cash: 0 } }),
  ];
  p.advanced.otherAssets = [{ id: 'o1', type: 'primaryResidence', name: 'Home', owner: 'household', value: 600000, growth: 3,
    liquidity: 'illiquid', available: false, availableAge: 60, accessPct: 80 }];
  p.advanced.debts = [{ id: 'd1', type: 'mortgage', name: 'Mortgage', owner: 'household', balance: 300000, rate: 6.5,
    paymentMonthly: 2400, payoffAge: 75, includePayment: true, taxDeductible: true, mortgageType: 'conventional',
    rateType: rateType || 'fixed', originalAmount: 400000, propertyValue: 600000, remainingTermYears: 25, loanTermYears: 30,
    extraPrincipalMonthly: 0, annualPropertyTax: 5000, annualInsurance: 1800, hoaMonthly: 0, pmiMonthly: 0,
    includeHousingCosts: true, nextRateResetAge: 55, resetRate: 9 }];
  return p;
}

/* Where each part-2 witness is taken: a setup in which the flag's true and
   false results differ. Measured at ba657e2; each test re-checks it. */
const SETUPS = {
  base: basePlan,
  cash: () => { const p = basePlan(); p.accounts[0].basisPct = 100; return p; },
  rich: () => richPlan('fixed'),
  richSpouse: () => { const p = richPlan('fixed'); p.profile.spouseOn = true; return p; },
  richShortfall: () => {
    const p = richPlan('fixed');
    p.retirement.spending = 220000;
    p.retirement.homeEquityFallback = true;
    /* S5 2c (Q44, decided 2026-09-14 UTC−7): the fallback spends other assets only while the plan
       includes them, so this setup includes them. Without it, fallback and `available` stopped
       diverging and this file's own control reported "absence proves nothing" -- the policy
       changed, the witnesses did not. */
    p.advanced.networthOn = true;
    Object.assign(p.advanced.otherAssets[0], { available: true, liquidity: 'liquid', availableAge: 52 });
    return p;
  },
  richAdjustable: () => richPlan('adjustable'),
  /* S5AA R35 (SA32F-22): the Rule of 55 needs a separation in or after the year of 55 (IRC 72(t)(2)(A)(v)). `rich` retires at 52, so the
     switch can no longer change it -- correctly -- and this witness retires at 55 instead, contributing to the 401(k) until then. */
  richRetire55: () => { const p = richPlan('fixed'); p.profile.retireAge = 55; p.employment.contributionStop = 55; return p; },
  simpleAssets: () => {
    const p = basePlan();
    Object.assign(p.profile, { retireAge: 55 });
    p.accounts[0].allocation = { stocks: 90, bonds: 5, cash: 5 };
    p.accounts[1].allocation = { stocks: 30, bonds: 60, cash: 10 };
    return p;
  },
  simpleAssetsOn: () => { const p = SETUPS.simpleAssets(); p.advanced.assetsOn = true; return p; },
  /* S5AA task 4.5 (Q96): the employer match on accounts[1] is switched on and fully vested, which is
     what makes the Roth election legal at all -- Notice 2024-2 permits it only for an employee fully
     vested in matching contributions at allocation. True and false then differ: elected, the match
     lands in Roth money and is the employee's income that year; absent or false, it is pre-tax and is
     not income at all. */
  matchingEmployer: () => {
    const p = richPlan('fixed');
    Object.assign(p.accounts[1], { matchOn: true, vesting: 100 });
    return p;
  },
  /* S5AA R43 (SA42F-07): an owner of 74 still working at the employer whose 401(k) (accounts[1], contributing) is deferred by the
     still-working exception -- unless they are a 5-percent owner, who owes the RMD now (IRC 401(a)(9)(C)(ii)). */
  stillWorking401k: () => {
    const p = basePlan();
    Object.assign(p.profile, { age: 74, retireAge: 77, endAge: 78 });
    Object.assign(p.employment, { salary: 100000, contributionStop: 77 });
    p.advanced.rmdOn = true;
    return p;
  },
  /* S5AA R43 (SA42F-07): an owner of 75 whose spouse is 60, more than ten years younger: the joint-life Table II divisor applies only
     while the spouse is the sole beneficiary (1.401(a)(9)-5(c)(2)), so true and false give different RMDs from accounts[1]. */
  /* S5AA R48 (AA1-20; the owner's AA1 decision of 2026-10-03): a couple of 70 whose one account is a JOINT taxable account at 40% basis;
     the self dies at 70.5 and the survivor draws on it. With community property the whole basis resets at the death (IRC 1014(b)(6)),
     without it half (2040(b)), so the gain on every later draw differs. */
  communityCouple: () => {
    const p = basePlan();
    Object.assign(p.profile, { age: 70, retireAge: 60, endAge: 74, spouseOn: true, spouseAge: 70, filing: 'mfj' });
    Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 60 });
    Object.assign(p.retirement, { selfLife: 70.5, spending: 60000 });
    p.accounts = [account({ owner: 'joint', basisPct: 40, contribution: 0 })];
    return p;
  },
  youngSoleSpouse: () => {
    const p = basePlan();
    Object.assign(p.profile, { age: 75, retireAge: 60, endAge: 77, spouseOn: true, spouseAge: 60, filing: 'mfj' });
    Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 60 });
    p.accounts[1].contribution = 0;
    p.advanced.rmdOn = true;
    return p;
  },
  /* S5AA R47 (AA1-13): a 55-year-old earning $200,000 who defers $32,500 to the 401(k) (accounts[1]) with $175,000 of prior-year FICA wages
     from its employer: the $8,000 catch-up must be designated Roth (IRC 414(v)(7)(A)). Absent or true, the plan offers Roth and the catch-up
     goes to its Roth balance; false allows no catch-up (414(v)(7)(B)), so the $8,000 is an excess redirected to taxable savings. */
  highEarnerCatchup: () => {
    const p = basePlan();
    Object.assign(p.profile, { age: 55, retireAge: 60, endAge: 58 });
    Object.assign(p.employment, { salary: 200000, contributionStop: 60 });
    Object.assign(p.accounts[1], { contribution: 32500, priorYearFicaWages: 175000 });
    retireAtEnd(p); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
    return p;
  },
};

/* The plan the value witnesses run on: every record flag has a record to sit
   on, and accounts[0] is taxable at cash basis so cashHolding: true is a
   valid household cash holding rather than a category refusal. */
function valuePlan() {
  const p = richPlan('fixed');
  p.accounts[0].basisPct = 100;
  return p;
}

function withFlag(plan, flagPath, value, index = 0) {
  const parts = flagPath.split('.');
  let node = plan;
  for (const seg of parts.slice(0, -1)) {
    node = seg.endsWith('[]') ? node[seg.slice(0, -2)][index] : node[seg];
    assert.ok(node, `the fixture has nothing at ${seg} for ${flagPath}`);
  }
  const leaf = parts[parts.length - 1];
  if (value === ABSENT) delete node[leaf];
  else node[leaf] = value;
  return plan;
}

const indexed = (flagPath, index = 0) => flagPath.replace(/\[\]/g, `[${index}]`);

/* A projection, for comparison: everything but provenance and diagnostics. */
function projection(result) {
  const copy = Object.assign({}, result);
  delete copy.identity;
  delete copy.issues;
  return JSON.stringify(copy);
}

const ROUTES = [
  ['runPlan()', async (p) => engine.runPlan(p)],
  ['runScenario()', async (p) => engine.runScenario(p)],
  ['the generated Worker', async (p) => {
    const message = postToWorker(await liveWorkerSource(), p);
    assert.equal(message.error, undefined, `the worker threw: ${message.error}`);
    return message.result;
  }],
];

// ---------------------------------------------------------------------------
// Sources the contract is checked against
// ---------------------------------------------------------------------------

function catalogueBooleanPaths() {
  const out = new Set();
  (function walk(node, at) {
    if (!node) return;
    if (node.kind === 'boolean') out.add(at);
    else if (node.kind === 'object') Object.keys(node.fields || {}).forEach((k) => walk(node.fields[k], at ? at + '.' + k : k));
    else if (node.kind === 'array') walk(node.element, at + '[]');
    else if (node.kind === 'union') {
      assert.ok(Array.isArray(node.variants), `the catalogue's union node at ${at} has no variants array -- its shape changed, so this walk would miss booleans`);
      node.variants.forEach((v) => walk(v, at));
    }
  })(CATALOGUE.scenario.shape, '');
  return out;
}

function defaultPlanBooleans() {
  const out = new Map();
  (function walk(v, at) {
    if (typeof v === 'boolean') out.set(at, v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, at + '[]'));
    else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k], at ? at + '.' + k : k));
  })(DEFAULT_PLAN, '');
  return out;
}

function shellLiteral(name) {
  const start = SHELL.indexOf('var ' + name + '=');
  assert.ok(start >= 0, `src/app-shell.html no longer declares var ${name}=`);
  const open = SHELL.indexOf('{', start);
  for (let j = open, depth = 0; j < SHELL.length; j++) {
    if (SHELL[j] === '{') depth++;
    else if (SHELL[j] === '}' && --depth === 0) return vm.runInNewContext('(' + SHELL.slice(open, j + 1) + ')');
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

/* The app's REAL record normalizers, compiled from src/app-shell.html. Each is
   one line there; a line that is not a whole function fails to compile. */
const NORMALIZERS = (() => {
  const names = ['normalizeAccount', 'normalizeOtherAsset', 'normalizeDebt'];
  const lines = SHELL.split('\n').map((l) => l.trim());
  const source = names.map((n) => {
    const line = lines.find((l) => l.startsWith(`function ${n}(`));
    assert.ok(line, `src/app-shell.html no longer defines ${n}() on one line`);
    return line;
  }).join('\n');
  const OTHER_ASSET_TYPES = shellLiteral('OTHER_ASSET_TYPES');
  const DEBT_TYPES = shellLiteral('DEBT_TYPES');
  const made = new Function('accountType', 'uid', 'OTHER_ASSET_TYPES', 'DEBT_TYPES',
    `${source}\nreturn { normalizeAccount, normalizeOtherAsset, normalizeDebt };`)(
    engine.accountType, (prefix) => prefix + '_contract', OTHER_ASSET_TYPES, DEBT_TYPES);
  return Object.assign(made, { OTHER_ASSET_TYPES, DEBT_TYPES });
})();

const NORMALIZER_FOR = {
  'accounts[]': ['normalizeAccount()', () => Object.keys(engine.ACCOUNT_TYPES), (type) => NORMALIZERS.normalizeAccount({ type })],
  'advanced.otherAssets[]': ['normalizeOtherAsset()', () => Object.keys(NORMALIZERS.OTHER_ASSET_TYPES), (type) => NORMALIZERS.normalizeOtherAsset({ type })],
  'advanced.debts[]': ['normalizeDebt()', () => Object.keys(NORMALIZERS.DEBT_TYPES), (type) => NORMALIZERS.normalizeDebt({ type })],
};

/* path -> Map(record type -> the boolean the normalizer fills in) */
function normalizerBooleans() {
  const out = new Map();
  for (const [prefix, [, types, normalize]] of Object.entries(NORMALIZER_FOR)) {
    for (const type of types()) {
      const record = normalize(type);
      for (const key of Object.keys(record)) {
        if (typeof record[key] !== 'boolean') continue;
        const p = `${prefix}.${key}`;
        if (!out.has(p)) out.set(p, new Map());
        out.get(p).set(type, record[key]);
      }
    }
  }
  return out;
}

/* Comments removed, line structure kept. engine.js carries no `//` after code
   on the same line; the compile check in the reader test guards the result. */
const withoutComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/^[ \t]*\/\/.*$/gm, '');

/* Reads of `.name` or `["name"]`, not assignments to it. */
function readCount(code, name) {
  const re = new RegExp(`(?:[\\w$)\\]]\\s*\\.\\s*${name}\\b|\\[\\s*["']${name}["']\\s*\\])(?!\\s*=(?!=))`, 'g');
  return (code.match(re) || []).length;
}

// ---------------------------------------------------------------------------
// 1. The contract is complete and true
// ---------------------------------------------------------------------------

test('Q53 contract: the file is well-formed', () => {
  assert.equal(CONTRACT.formatVersion, 1);
  for (const key of ['accepted', 'rejected', 'coercion', 'null', 'absent']) {
    assert.equal(typeof CONTRACT.valueRules[key], 'string', `valueRules.${key} must be stated`);
  }
  assert.match(CONTRACT.layers.engine.refusalCode, /^SCENARIO_[A-Z_]+$/);
  assert.equal(CONTRACT.layers.validator.code, 'WRONG_TYPE');
  assert.equal(CONTRACT.layers.validator.severity, 'ERROR');
  const readers = Object.keys(CONTRACT.layers.readers);
  const seen = new Set();
  for (const f of CONTRACT.flags) {
    const where = f.path || JSON.stringify(f);
    assert.match(String(f.path), /^[A-Za-z]+(\[\])?(\.[A-Za-z][A-Za-z0-9]*(\[\])?)*$/, `${where}: malformed path`);
    assert.ok(!seen.has(f.path), `${where}: listed twice`);
    seen.add(f.path);
    assert.ok(readers.includes(f.reader), `${where}: reader must be one of ${readers.join(', ')}, got ${f.reader}`);
    const d = f.default;
    assert.ok(typeof d === 'boolean' || (d && d.dependsOn === 'type' && Array.isArray(d.trueFor)),
      `${where}: default must be a boolean or {dependsOn: "type", trueFor: [...]}`);
    assert.equal(typeof f.defaultSource, 'string', `${where}: defaultSource must say where the default comes from`);
    if (f.refusalCode !== undefined) assert.match(f.refusalCode, /^SCENARIO_[A-Z_]+$/, `${where}: refusalCode`);
  }
});

test('Q53 contract: every boolean the schema, the default plan and the record normalizers carry is listed, and nothing else is', () => {
  const listed = new Set(CONTRACT.flags.map((f) => f.path));
  const catalogue = catalogueBooleanPaths();
  const defaults = defaultPlanBooleans();
  const normalized = normalizerBooleans();

  const unlisted = [...new Set([...catalogue, ...defaults.keys(), ...normalized.keys()])].filter((p) => !listed.has(p)).sort();
  assert.deepEqual(unlisted, [], `boolean fields with no contract entry -- add each with its default and reader: ${unlisted.join(', ')}`);

  const phantom = CONTRACT.flags
    .filter((f) => !catalogue.has(f.path) && !defaults.has(f.path) && !normalized.has(f.path) && !f.defaultSource.startsWith('none:'))
    .map((f) => f.path);
  assert.deepEqual(phantom, [], `contract entries no source knows about: ${phantom.join(', ')}`);

  /* Reach: the catalogue is derived from defaultPlan, so its walk must see
     every defaultPlan boolean. If it does not, the walk or the catalogue's
     shape changed and the first assertion is checking less than it says. */
  const unseen = [...defaults.keys()].filter((p) => !catalogue.has(p));
  assert.deepEqual(unseen, [], `the catalogue walk missed defaultPlan booleans: ${unseen.join(', ')}`);
  assert.ok(normalized.size > 0, 'the record normalizers produced no booleans -- the compile above is not reaching them');
});

test('Q53 contract: every default agrees with the source it names', () => {
  const defaults = defaultPlanBooleans();
  const normalized = normalizerBooleans();
  const wrong = [];
  for (const f of CONTRACT.flags) {
    const prefix = Object.keys(NORMALIZER_FOR).find((k) => f.path.startsWith(k + '.'));
    if (f.defaultSource === 'defaultPlan') {
      if (defaults.get(f.path) !== f.default) wrong.push(`${f.path}: defaultPlan has ${defaults.get(f.path)}, the contract says ${JSON.stringify(f.default)}`);
    } else if (prefix && f.defaultSource === NORMALIZER_FOR[prefix][0]) {
      const byType = normalized.get(f.path);
      if (!byType) { wrong.push(`${f.path}: ${f.defaultSource} fills no boolean for it`); continue; }
      for (const [type, value] of byType) {
        const want = typeof f.default === 'boolean' ? f.default : f.default.trueFor.includes(type);
        if (value !== want) wrong.push(`${f.path}, type ${type}: ${f.defaultSource} fills ${value}, the contract says ${want}`);
      }
      if (typeof f.default !== 'boolean') {
        f.default.trueFor.filter((t) => !byType.has(t)).forEach((t) => wrong.push(`${f.path}: trueFor names ${t}, which is not a record type`));
      }
    } else if (f.defaultSource.startsWith('none:')) {
      if (defaults.has(f.path) || normalized.has(f.path)) wrong.push(`${f.path}: says nothing fills it, but a source does`);
    } else {
      wrong.push(`${f.path}: defaultSource "${f.defaultSource}" is not defaultPlan, the normalizer for its record, or "none: <reason>"`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('Q53 contract: each flag is read where its reader says, and not where its reader rules out', () => {
  const engineCode = withoutComments(read('src/engine.js'));
  assert.doesNotThrow(() => new vm.Script(engineCode), 'engine.js with comments removed must still compile, or the counts below count a mangled file');
  const debtCode = fs.readdirSync(path.join(ROOT, 'src'))
    .filter((n) => /^debt-[\w-]+\.js$/.test(n))
    .map((n) => withoutComments(read(`src/${n}`)))
    .join('\n');
  assert.ok(debtCode.length > 1000, 'the src/debt-*.js modules were not read');
  const shellCode = SHELL.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const problems = [];
  for (const f of CONTRACT.flags) {
    const name = f.path.split('.').pop();
    const inEngine = readCount(engineCode, name);
    const inDebt = readCount(debtCode, name);
    const inShell = readCount(shellCode, name);
    if (f.reader === 'engine' && inEngine === 0) problems.push(`${f.path}: reader "engine", but src/engine.js never reads it`);
    if (f.reader !== 'engine' && inEngine + inDebt > 0) problems.push(`${f.path}: reader "${f.reader}", but the engine or a debt module reads it (${inEngine + inDebt}) -- a malformed value now changes a projection`);
    if (f.reader === 'app' && inShell === 0) problems.push(`${f.path}: reader "app", but src/app-shell.html never reads it`);
    if (f.reader === 'migration' && inShell > 0) problems.push(`${f.path}: reader "migration" claims nothing reads it after normalizedPlan() overwrites it, but the shell reads it ${inShell} time(s)`);
  }
  assert.deepEqual(problems, []);
});

// ---------------------------------------------------------------------------
// 2. What the repair must not change
// ---------------------------------------------------------------------------

for (const [route, run] of ROUTES) {
  test(`Q53 accepted, ${route}: true and false run for every engine-read flag`, async () => {
    const problems = [];
    for (const f of ENGINE_FLAGS) {
      for (const value of [true, false]) {
        const r = await run(withFlag(valuePlan(), f.path, value));
        if (r.status !== 'ok' || r.calculationError) problems.push(`${indexed(f.path)} = ${value}: status ${r.status}, code ${r.calculationErrorCode}`);
      }
    }
    assert.deepEqual(problems, []);
  });
}

test('Q53 accepted, validateScenario(): true, false and absent raise no error on any validated flag', () => {
  const problems = [];
  for (const f of VALIDATED_FLAGS) {
    for (const [label, value] of [['true', true], ['false', false], ['absent', ABSENT]]) {
      const res = validateScenario(withFlag(valuePlan(), f.path, value));
      const errors = (res.issues || []).filter((i) => i.severity === 'ERROR' && String(i.path) === indexed(f.path));
      if (errors.length) problems.push(`${indexed(f.path)} = ${label}: ${errors.map((i) => i.code).join(', ')}`);
    }
  }
  assert.deepEqual(problems, []);
});

/* [flag, setup, record index]. Default-false engine flags only: an absent
   default-TRUE flag is contract openQuestions.absentOnEngineRoutes. */
const ABSENT_WITNESSES = [
  ['accounts[].cashHolding', 'cash', 0],
  ['accounts[].fivePercentOwner', 'stillWorking401k', 1],   // S5AA R43 (SA42F-07)
  ['accounts[].matchOn', 'rich', 1],
  /* S5AA task 5.1 (Q94) RETIRED advanced.armRecastOnReset as a switch: an adjustable loan always
     re-amortises now and nothing reads the flag, so its reader is "migration" and it is no longer a
     default-false ENGINE flag. Its witness is removed rather than left claiming a difference that can
     no longer exist -- `richAdjustable` gives the same result for true, false and absent, which is the
     point of the repair. */
  ['advanced.assetsOn', 'simpleAssets', 0],
  ['advanced.bondTentOn', 'base', 0],
  ['advanced.conversionOn', 'rich', 0],
  ['advanced.glideOn', 'simpleAssetsOn', 0],
  ['advanced.healthOn', 'base', 0],
  ['advanced.ltcOn', 'base', 0],
  ['advanced.networthOn', 'rich', 0],
  ['advanced.otherAssets[].available', 'richShortfall', 0],
  ['advanced.penaltyException', 'rich', 0],
  ['advanced.reserveOn', 'base', 0],
  ['advanced.rmdOn', 'base', 0],
  ['advanced.rule55', 'richRetire55', 0],
  ['advanced.transferOn', 'rich', 0],
  ['profile.communityProperty', 'communityCouple', 0],   // S5AA R48 (AA1-20)
  ['profile.spouseOn', 'rich', 0],
  ['retirement.dividendOn', 'base', 0],
  ['retirement.homeEquityFallback', 'richShortfall', 0],
  ['retirement.ssAdvanced', 'rich', 0],
  ['retirement.survivor', 'richSpouse', 0],
  ['accounts[].matchRoth', 'matchingEmployer', 1],
];

const NO_DIVERGENT_SETUP = {
  'advanced.armRecastOnReset': 'S5AA task 5.1 (Q94, F8) RETIRED IT AS A SWITCH. An adjustable-rate loan '
    + 'always re-amortises at its reset now, so true, false and absent give the SAME projection by '
    + 'construction and no setup can make them differ -- that identity is asserted directly in '
    + 'tests/audit-s5aa-arm-always-recast.test.js over true, false, "false", "true", 0, 1 and null. The '
    + 'engine still reads the flag, for one purpose: a plan carrying it that holds an adjustable debt is '
    + 'told its projection has moved. That read is what keeps the validator type-checking it, which is '
    + 'FM-09 repair, so the reader stays "engine" rather than being tidied to "migration"',
  'retirement.preserveRoth': 'no setup S4 tried (base, rich, a Roth-heavy plan, a plan near the IRMAA threshold) makes true and false differ; it only adjusts an account-order score. Carried to S5 2l.4 as unverified',
  'assumptions.rollingHistory': 'the engine reads it only into runScenario()\'s identity (historicalPeriod.rolling); no projection differs',
  'accounts[].currentEmployerPlan': 'S5AA R43 (SA42F-07): absent is not one value. rmdObligations() and earlyWithdrawalPenaltyRate() read an absent flag as yes when the account receives contributions (a deferral, a match or profit sharing) and as no otherwise, so on a contributing account absent gives the TRUE result and on an idle one the FALSE result; no single default witness can stand for both. True and false are each typed and a non-boolean is refused (tests/audit-s5aa-r43-plan-value-contract.test.js)',
};

test('Q53 absent: every default-false engine-read flag has an absent witness or a recorded reason it cannot', () => {
  const covered = new Set(ABSENT_WITNESSES.map(([p]) => p));
  const expected = ENGINE_FLAGS.filter((f) => f.default === false).map((f) => f.path);
  const uncovered = expected.filter((p) => !covered.has(p) && !NO_DIVERGENT_SETUP[p]);
  assert.deepEqual(uncovered, [], `default-false engine flags with no absent witness and no recorded reason: ${uncovered.join(', ')}`);
  const stray = [...covered, ...Object.keys(NO_DIVERGENT_SETUP)].filter((p) => !expected.includes(p));
  assert.deepEqual(stray, [], `witnessed or excused flags that are not default-false engine flags: ${stray.join(', ')}`);
});

for (const [route, run] of ROUTES) {
  test(`Q53 absent, ${route}: an absent default-false flag gives the false result where true and false differ`, async () => {
    const problems = [];
    for (const [p, setup, index] of ABSENT_WITNESSES) {
      const once = async (value) => projection(await run(withFlag(SETUPS[setup](), p, value, index)));
      const t = await once(true);
      const f = await once(false);
      const a = await once(ABSENT);
      if (t === f) problems.push(`${p} @${setup}: CONTROL FAILED -- true and false give the same result here, so absence proves nothing`);
      else if (a !== f) problems.push(`${p} @${setup}: absent gives ${a === t ? 'the TRUE result' : 'a third result'}`);
    }
    assert.deepEqual(problems, []);
  });
}

/* S5 2l.2 (contract openQuestions.absentOnEngineRoutes, decided 2026-09-13 by
   the owner: (b)). An absent engine flag whose documented default is TRUE takes that
   default on the engine routes, so it gives the TRUE result, witnessed only
   where true and false really diverge. S5 2l.4 re-derived the last two
   setups, which S4 measured but kept out of this file. */
SETUPS.guytonMonteCarlo = () => {
  const p = basePlan();
  Object.assign(p.profile, { age: 50, retireAge: 51, endAge: 90 });
  Object.assign(p.employment, { contributionStop: 51 });
  Object.assign(p.assumptions, { method: 'monteCarlo', runs: 40, volatility: 25, seed: 4242 });
  Object.assign(p.retirement, { strategy: 'guyton', withdrawalRate: 5 });
  return p;
};
/* irmaaGuard only reorders account classes in smartWithdrawalOrder(), once
   past 63 with MAGI near the next IRMAA threshold. A household with pre-tax
   money alone has nothing to reorder, and its true and false results were
   measured identical; beside a taxable and a Roth account they differ. */
SETUPS.irmaaHousehold = () => {
  const p = basePlan();
  Object.assign(p.profile, { age: 60, retireAge: 61, endAge: 90 });
  Object.assign(p.employment, { contributionStop: 61 });
  p.accounts = [
    account({ id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', balance: 600000, contribution: 0, priority: 1, basisPct: 60 }),
    account({ id: 'a2', name: '401k', type: 'traditional401k', taxClass: 'preTax', balance: 2500000, contribution: 0, priority: 2 }),
    account({ id: 'a3', name: 'Roth IRA', type: 'rothIRA', taxClass: 'roth', balance: 300000, contribution: 0, priority: 3 }),
  ];
  Object.assign(p.retirement, { spending: 150000, ssBenefit: 3500 });
  return p;
};

/* [flag, setup, record index]. includeHousingCosts sits on the rich plan's
   mortgage, where its documented default is true. */
const ABSENT_TRUE_WITNESSES = [
  ['accounts[].planOffersRoth', 'highEarnerCatchup', 1],   // S5AA R47 (AA1-13)
  ['accounts[].spouseSoleBeneficiary', 'youngSoleSpouse', 1],   // S5AA R43 (SA42F-07)
  ['advanced.debts[].includeHousingCosts', 'rich', 0],
  ['advanced.debts[].includePayment', 'rich', 0],
  ['retirement.guytonSkipInflation', 'guytonMonteCarlo', 0],
  ['retirement.irmaaGuard', 'irmaaHousehold', 0],
  ['retirement.rmdSmoothing', 'base', 0],
];

test('Q53 absent: every engine-read flag whose documented default can be true has an absent witness', () => {
  const covered = ABSENT_TRUE_WITNESSES.map(([p]) => p).sort();
  const expected = ENGINE_FLAGS.filter((f) => f.default !== false).map((f) => f.path).sort();
  assert.deepEqual(covered, expected);
});

for (const [route, run] of ROUTES) {
  test(`Q53 absent, ${route}: an absent default-true flag gives the true result where true and false differ`, async () => {
    const problems = [];
    for (const [p, setup, index] of ABSENT_TRUE_WITNESSES) {
      const once = async (value) => projection(await run(withFlag(SETUPS[setup](), p, value, index)));
      const t = await once(true);
      const f = await once(false);
      const a = await once(ABSENT);
      if (t === f) problems.push(`${p} @${setup}: CONTROL FAILED -- true and false give the same result here, so absence proves nothing`);
      else if (a !== t) problems.push(`${p} @${setup}: absent gives ${a === f ? 'the FALSE result' : 'a third result'}`);
    }
    assert.deepEqual(problems, []);
  });
}

/* A guard, not a red-first witness: the default is written into copies, so a
   caller's plan never gains a field it did not send. */
test('Q53 absent, runPlan(): a documented default is applied to a copy, and the caller\'s plan is unchanged', () => {
  const plan = withFlag(SETUPS.rich(), 'advanced.debts[].includePayment', ABSENT, 0);
  const before = JSON.stringify(plan);
  engine.runPlan(plan);
  assert.equal(JSON.stringify(plan), before);
  assert.equal(Object.prototype.hasOwnProperty.call(plan.advanced.debts[0], 'includePayment'), false);
});

// ---------------------------------------------------------------------------
// 3 and 4. Refusals: controls on the enforced flags, then the refusal witnesses
// ---------------------------------------------------------------------------

async function engineRefusalProblems(run, flags) {
  const problems = [];
  for (const f of flags) {
    const code = f.refusalCode || CONTRACT.layers.engine.refusalCode;
    const at = indexed(f.path);
    for (const [label, value] of NON_BOOLEANS) {
      const r = await run(withFlag(valuePlan(), f.path, value));
      if (!r.calculationError) { problems.push(`${at} = ${label}: ACCEPTED, status ${r.status}`); continue; }
      if (r.calculationErrorCode !== code) { problems.push(`${at} = ${label}: refused as ${r.calculationErrorCode}, the contract says ${code}`); continue; }
      if (r.rows !== null) problems.push(`${at} = ${label}: refused, but rows is ${Array.isArray(r.rows) ? 'an array' : typeof r.rows}, not null`);
      if (!f.refusalCode && !(r.issues || []).some((i) => i.code === code && i.state && i.state.path === at)) {
        problems.push(`${at} = ${label}: refused, but no ${code} issue names state.path ${at}`);
      }
    }
  }
  return problems;
}

function validatorRefusalProblems(flags) {
  const { code, severity } = CONTRACT.layers.validator;
  const problems = [];
  for (const f of flags) {
    const at = indexed(f.path);
    for (const [label, value] of NON_BOOLEANS) {
      const res = validateScenario(withFlag(valuePlan(), f.path, value));
      if (!(res.issues || []).some((i) => i.code === code && i.severity === severity && i.path === at)) {
        problems.push(`${at} = ${label}: no ${code} ${severity} at ${at}${res.valid ? ', and the plan validates' : ''}`);
      }
    }
  }
  return problems;
}

const report = (problems, total) => `${problems.length} of ${total} flag/value pairs are not refused as the contract requires:\n  ${problems.slice(0, 40).join('\n  ')}${problems.length > 40 ? `\n  ... and ${problems.length - 40} more` : ''}`;

for (const [route, run] of ROUTES) {
  test(`Q53 control, ${route}: the refusal check finds nothing on accounts[].cashHolding, which the engine already enforces`, async () => {
    const problems = await engineRefusalProblems(run, [flag('accounts[].cashHolding')]);
    assert.deepEqual(problems, []);
  });
}

test('Q53 control, validateScenario(): the refusal check finds nothing on the two flags the validator already enforces', () => {
  const problems = validatorRefusalProblems([flag('accounts[].cashHolding'), flag('advanced.armRecastOnReset')]);
  assert.deepEqual(problems, []);
});

for (const [route, run] of ROUTES) {
  test(`Q53 contract, ${route}: every engine-read flag refuses every non-boolean value with its contract code`, async () => {
    const problems = await engineRefusalProblems(run, ENGINE_FLAGS);
    assert.deepEqual(problems, [], report(problems, ENGINE_FLAGS.length * NON_BOOLEANS.length));
  });
}

test('Q53 contract, validateScenario(): every engine- or app-read flag rejects every non-boolean value as WRONG_TYPE at its path', () => {
  const problems = validatorRefusalProblems(VALIDATED_FLAGS);
  assert.deepEqual(problems, [], report(problems, VALIDATED_FLAGS.length * NON_BOOLEANS.length));
});

/* S5 2l: the page has no file system, so the build must hand the engine the
   contract's own JSON in place of its Node read. The Worker route above proves
   the result computes; this names the mechanism. */
test('Q53 contract, the built page: the engine body carries the contract itself, not a Node file read', () => {
  const { build } = require(path.join(ROOT, 'build.js'));
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'q53-contract-build-'));
  const log = console.log;
  console.log = () => {};
  let parts;
  try { parts = build(path.join(dir, 'app.html')); } finally { console.log = log; fs.rmSync(dir, { recursive: true, force: true }); }
  assert.ok(parts.engineBody.includes(JSON.stringify(CONTRACT.flags[0].path)), 'the engine body must carry the contract\'s flags');
  assert.ok(!parts.engineBody.includes('require('), 'the page has no require(): the build must replace the engine\'s contract read');
});
