'use strict';

/*
 * S3 task 7 (F3) -- tests for src/mortgage-vs-investing.js.
 *
 * THE TEST THAT MATTERS IS THE FIRST ONE. D5's whole claim is that this
 * question has no single right framing, so the module reports a matrix rather
 * than an answer. If every preset always agreed, the matrix would be
 * decorative and one number would do. The first test constructs inputs where
 * endingNetWorth and totalInterestPaid pick OPPOSITE winners, which is what
 * makes the matrix load-bearing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { canonical, hashOf, installDebtModules } = require('../tools/capture-baseline.js');
const golden = require('./lib/golden-scenario-defs.js');
const mvi = require('../src/mortgage-vs-investing.js');
const { recastAnalysis } = require('../src/debt-recast.js');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(
  shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
installDebtModules();
const engine = require('../src/engine.js');
const defaultPlan = golden.extractDefaultPlan(shell);

const clone = (v) => JSON.parse(JSON.stringify(v));

/** A household with a mortgage and a taxable account -- the minimum shape this
 *  question needs. Rate and return are the two dials the answer turns on. */
function household(overrides) {
  const o = overrides || {};
  const plan = clone(defaultPlan);
  plan.setupComplete = true;
  plan.id = 'mvi-test';
  plan.profile.age = 40;
  plan.profile.retireAge = 65;
  plan.profile.endAge = 75;
  plan.employment.salary = 120000;
  plan.employment.spouseSalary = 0;
  plan.assumptions.method = o.method || 'simple';
  plan.assumptions.returnRate = o.returnRate === undefined ? 6 : o.returnRate;
  plan.assumptions.inflation = 0;
  if (o.runs) plan.assumptions.runs = o.runs;
  if (o.seed) plan.assumptions.seed = o.seed;
  plan.retirement.strategy = 'fixedNominal';
  plan.retirement.spending = 50000;
  plan.retirement.ssBenefit = 2000;
  plan.retirement.ssClaim = 67;
  plan.advanced.networthOn = true;
  plan.advanced.debts = [{
    id: 'm1', type: 'mortgage', name: 'Home', owner: 'household',
    balance: 300000, rate: o.mortgageRate === undefined ? 6 : o.mortgageRate,
    paymentMonthly: 1500, payoffAge: 70,
    includePayment: true, taxDeductible: true, mortgageType: 'conventional',
    rateType: 'fixed', originalAmount: 300000, propertyValue: 500000,
    remainingTermYears: 25, loanTermYears: 30, extraPrincipalMonthly: 0,
    annualPropertyTax: 0, annualInsurance: 0, hoaMonthly: 0, pmiMonthly: 0,
    includeHousingCosts: false, nextRateResetAge: 0, resetRate: 0,
  }];
  plan.accounts = [{
    id: 'tax1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 200000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  return plan;
}

/* runPlan is INJECTED -- see the module header. In the built app it resolves
   from script scope; in Node the caller hands it over, which keeps the
   dependency visible at every call site. */
const OPTIONS = { amount: 500, horizonYears: 25, atAge: 60, runPlan: engine.runPlan };

/** Every dotted path at which two plans differ. */
function deepDiffPaths(a, b, prefix, out) {
  out = out || [];
  prefix = prefix || '';
  const keys = Array.from(new Set(Object.keys(a || {}).concat(Object.keys(b || {}))));
  keys.forEach((k) => {
    const pa = a ? a[k] : undefined;
    const pb = b ? b[k] : undefined;
    const p = prefix ? prefix + (Array.isArray(a) ? '[' + k + ']' : '.' + k) : k;
    if (pa && pb && typeof pa === 'object' && typeof pb === 'object') {
      deepDiffPaths(pa, pb, p, out);
      return;
    }
    if (JSON.stringify(pa) !== JSON.stringify(pb)) out.push(p);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Criterion 1 -- THE test: two presets must be able to disagree
// ---------------------------------------------------------------------------

test('mortgage-vs-investing: two objectives pick OPPOSITE winners on the same inputs', () => {
  /* A 3% mortgage against a 9% expected return. Paying the mortgage down
     always buys less interest; investing may still leave the household richer.
     If these two ever agreed on every input, the matrix would be decorative
     and the module could return one number. */
  const plan = household({ mortgageRate: 3, returnRate: 9 });

  const byNetWorth = mvi.compareMethods(plan, 'extraPrincipalMonthly', 'investMonthly', 'endingNetWorth', OPTIONS);
  const byInterest = mvi.compareMethods(plan, 'extraPrincipalMonthly', 'investMonthly', 'totalInterestPaid', OPTIONS);

  assert.equal(byNetWorth.applicable, true);
  assert.equal(byInterest.applicable, true);
  assert.equal(byNetWorth.winner, 'investMonthly',
    'at a 3% mortgage and a 9% return, investing should end richer; got ' + byNetWorth.winner +
    ' (paydown ' + byNetWorth.a.value + ' vs invest ' + byNetWorth.b.value + ')');
  assert.equal(byInterest.winner, 'extraPrincipalMonthly',
    'paying the mortgage down must always buy less mortgage interest; got ' + byInterest.winner);

  assert.notEqual(byNetWorth.winner, byInterest.winner,
    'THE POINT OF THE MATRIX: the same inputs give different winners under different objectives. ' +
    'If this ever passes with equal winners on every constructible input, the presets are ' +
    'decorative and one number would do.');

  // Both are reported distinctly, with their own direction.
  assert.equal(byNetWorth.direction, 'higher');
  assert.equal(byInterest.direction, 'lower');
  assert.ok(byNetWorth.a.value !== byNetWorth.b.value, 'the two methods must produce distinct net worths');
  assert.ok(byInterest.a.value !== byInterest.b.value, 'and distinct interest totals');
});

// ---------------------------------------------------------------------------
// Criterion 2 -- the unambiguous directions
// ---------------------------------------------------------------------------

test('mortgage-vs-investing: a rate far above the return means paydown wins ending net worth', () => {
  const plan = household({ mortgageRate: 12, returnRate: 2 });
  const c = mvi.compareMethods(plan, 'extraPrincipalMonthly', 'investMonthly', 'endingNetWorth', OPTIONS);
  assert.equal(c.winner, 'extraPrincipalMonthly',
    'a 12% mortgage against a 2% return: paying it down must win; got ' + c.winner +
    ' (paydown ' + c.a.value + ' vs invest ' + c.b.value + ')');
});

test('mortgage-vs-investing: a rate far below the return means investing wins ending net worth', () => {
  const plan = household({ mortgageRate: 2, returnRate: 12 });
  const c = mvi.compareMethods(plan, 'extraPrincipalMonthly', 'investMonthly', 'endingNetWorth', OPTIONS);
  assert.equal(c.winner, 'investMonthly',
    'a 2% mortgage against a 12% return: investing must win; got ' + c.winner +
    ' (paydown ' + c.a.value + ' vs invest ' + c.b.value + ')');
});

// ---------------------------------------------------------------------------
// Criterion 3 -- the two runs differ in exactly the intended inputs
// ---------------------------------------------------------------------------

test('mortgage-vs-investing: each method changes exactly the fields it claims to', () => {
  const plan = household({});
  const expected = {
    extraPrincipalMonthly: ['advanced.debts[0].extraPrincipalMonthly'],
    lumpSumPrincipal: ['advanced.debts[0].balance'],
    lumpSumRecast: ['advanced.debts[0].balance', 'advanced.debts[0].paymentMonthly'],
    investMonthly: ['accounts[0].contribution'],
    investLumpSum: ['accounts[0].balance'],
  };
  mvi.METHODS.forEach((method) => {
    const applied = mvi.applyMethod(plan, method, 5000);
    assert.equal(applied.applicable, true, method + ' should apply to this household');
    const actual = deepDiffPaths(plan, applied.plan, '').sort();
    assert.deepEqual(actual, expected[method].slice().sort(),
      method + ' changed ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected[method]) +
      '. An accidental second difference would drive the result while looking like the method.');
    assert.deepEqual(applied.changedPaths.slice().sort(), actual,
      method + ': the reported changedPaths must match what actually changed');
  });
});

// ---------------------------------------------------------------------------
// Criterion 4 -- determinism
// ---------------------------------------------------------------------------

test('mortgage-vs-investing: a fixed seed reproduces exactly, through canonical()', () => {
  const plan = household({ method: 'monteCarlo', runs: 200, seed: 123456 });
  const first = mvi.evaluatePreset(plan, { method: 'investMonthly', objective: 'planSuccessRate' }, OPTIONS);
  const second = mvi.evaluatePreset(plan, { method: 'investMonthly', objective: 'planSuccessRate' }, OPTIONS);
  assert.equal(first.applicable, true);
  assert.equal(hashOf(canonical(first)), hashOf(canonical(second)),
    'the same preset on the same seeded plan must reproduce exactly');

  // ...and the whole engine result behind it, not just the summary number.
  const applied = mvi.applyMethod(plan, 'investMonthly', OPTIONS.amount);
  assert.equal(
    hashOf(canonical(engine.runPlan(clone(applied.plan)))),
    hashOf(canonical(engine.runPlan(clone(applied.plan)))),
    'the underlying runs must be identical too');
});

// ---------------------------------------------------------------------------
// Criterion 5 -- a zero amount is an exact no-op for EVERY method
// ---------------------------------------------------------------------------

test('mortgage-vs-investing: a zero amount changes nothing, for every method', () => {
  const plan = household({});
  const baseline = hashOf(canonical(engine.runPlan(clone(plan))));
  mvi.METHODS.forEach((method) => {
    const applied = mvi.applyMethod(plan, method, 0);
    assert.equal(applied.applicable, true, method + ' should still apply');
    assert.deepEqual(applied.changedPaths, [], method + ' must report no change at zero');
    assert.deepEqual(deepDiffPaths(plan, applied.plan, ''), [],
      method + ' must leave the plan byte-identical at a zero amount');
    assert.equal(hashOf(canonical(engine.runPlan(clone(applied.plan)))), baseline,
      method + ' at zero must produce identical engine output');
  });
});

test('mortgage-vs-investing: recasting ZERO dollars does not silently re-amortize the payment', () => {
  /* The specific case criterion 5 caught. The other four methods add zero to
     something and are naturally inert; a recast is not. Overwriting
     paymentMonthly with the freshly amortized figure would change the plan of
     any household whose entered payment differs from the schedule -- from an
     action that did nothing. */
  const plan = household({});
  const entered = plan.advanced.debts[0].paymentMonthly;
  const applied = mvi.applyMethod(plan, 'lumpSumRecast', 0);
  assert.equal(applied.plan.advanced.debts[0].paymentMonthly, entered,
    'the entered payment must survive a zero-dollar recast');
  // CONTROL: a non-zero recast DOES change it, so the assertion above is not vacuous.
  const real = mvi.applyMethod(plan, 'lumpSumRecast', 50000);
  assert.notEqual(real.plan.advanced.debts[0].paymentMonthly, entered,
    'CONTROL: a real recast must change the payment');
});

// ---------------------------------------------------------------------------
// Criterion 6 -- the horizon is explicit
// ---------------------------------------------------------------------------

test('mortgage-vs-investing: the horizon is an explicit input with a documented default', () => {
  assert.equal(mvi.DEFAULT_HORIZON_YEARS, 30);
  const plan = household({ mortgageRate: 6, returnRate: 6 });

  const short = mvi.evaluatePreset(plan, { method: 'extraPrincipalMonthly', objective: 'totalInterestPaid' },
    { amount: 500, horizonYears: 5, runPlan: engine.runPlan });
  const long = mvi.evaluatePreset(plan, { method: 'extraPrincipalMonthly', objective: 'totalInterestPaid' },
    { amount: 500, horizonYears: 25, runPlan: engine.runPlan });
  assert.ok(long.value > short.value,
    '25 years of mortgage interest (' + long.value + ') must exceed 5 years (' + short.value + ')');

  const shortWorth = mvi.evaluatePreset(plan, { method: 'investLumpSum', objective: 'endingNetWorth' },
    { amount: 50000, horizonYears: 5, runPlan: engine.runPlan });
  const longWorth = mvi.evaluatePreset(plan, { method: 'investLumpSum', objective: 'endingNetWorth' },
    { amount: 50000, horizonYears: 25, runPlan: engine.runPlan });
  assert.notEqual(shortWorth.value, longWorth.value,
    'net worth at two different horizons must differ, or the horizon is being ignored');
  assert.notEqual(shortWorth.rowAge, longWorth.rowAge, 'and they must read different rows');
});

// ---------------------------------------------------------------------------
// Criterion 7 -- planSuccessRate refuses non-monteCarlo modes
// ---------------------------------------------------------------------------

test('mortgage-vs-investing: planSuccessRate refuses simple and historical modes explicitly', () => {
  ['simple', 'historical'].forEach((method) => {
    const plan = household({ method });
    const evaluated = mvi.evaluatePreset(plan, { method: 'investMonthly', objective: 'planSuccessRate' }, OPTIONS);
    assert.equal(evaluated.applicable, false, method + ' must be refused');
    assert.match(evaluated.reason, /requires assumptions\.method === "monteCarlo"/);
    assert.equal(evaluated.value, undefined, 'a refusal must not also carry a number');
  });

  // CONTROL: monteCarlo IS accepted, so the refusal is about the mode.
  const mc = household({ method: 'monteCarlo', runs: 200, seed: 123456 });
  const ok = mvi.evaluatePreset(mc, { method: 'investMonthly', objective: 'planSuccessRate' }, OPTIONS);
  assert.equal(ok.applicable, true, 'CONTROL: monteCarlo must be accepted');
  assert.equal(typeof ok.value, 'number');
});

test('mortgage-vs-investing: the invest methods refuse when there is no taxable account', () => {
  const plan = household({});
  plan.accounts[0].taxClass = 'preTax';
  plan.accounts[0].type = 'traditional401k';

  ['investMonthly', 'investLumpSum'].forEach((method) => {
    const applied = mvi.applyMethod(plan, method, 500);
    assert.equal(applied.applicable, false, method + ' must refuse');
    assert.match(applied.reason, /no taxable account/);
    assert.equal(applied.plan, undefined, 'a refusal must not hand back a plan');
  });

  // It must NOT have quietly used the pre-tax account instead.
  const evaluated = mvi.evaluatePreset(plan, { method: 'investMonthly', objective: 'endingNetWorth' }, OPTIONS);
  assert.equal(evaluated.applicable, false);
  assert.equal(evaluated.value, undefined);

  // CONTROL: the mortgage methods still work on the same plan, so the refusal
  // is specific to the invest methods and not a broken scenario.
  assert.equal(mvi.applyMethod(plan, 'extraPrincipalMonthly', 500).applicable, true);
});

test('mortgage-vs-investing: the mortgage methods refuse when there is no mortgage', () => {
  const plan = household({});
  plan.advanced.debts = [];
  ['extraPrincipalMonthly', 'lumpSumPrincipal', 'lumpSumRecast'].forEach((method) => {
    const applied = mvi.applyMethod(plan, method, 500);
    assert.equal(applied.applicable, false, method + ' must refuse');
    assert.match(applied.reason, /no mortgage/);
  });
  assert.equal(mvi.applyMethod(plan, 'investMonthly', 500).applicable, true, 'CONTROL: invest still works');
});

// ---------------------------------------------------------------------------
// Criterion 8 -- lumpSumRecast composes with debt-recast.js, not a reimplementation
// ---------------------------------------------------------------------------

test('mortgage-vs-investing: lumpSumRecast agrees with recastAnalysis() rather than reimplementing it', () => {
  const plan = household({ mortgageRate: 6 });
  const mortgage = plan.advanced.debts[0];
  const lump = 40000;

  const applied = mvi.applyMethod(plan, 'lumpSumRecast', lump);
  assert.equal(applied.applicable, true);

  // Independently, from the module's only export.
  const expected = recastAnalysis({
    balance: mortgage.balance,
    annualRatePct: mortgage.rate,
    remainingTermMonths: Math.round(mortgage.remainingTermYears * 12),
    extraMonthlyPrincipal: mortgage.extraPrincipalMonthly,
  }, lump);

  assert.equal(applied.plan.advanced.debts[0].balance, expected.newBalance,
    'the recast balance must come from recastAnalysis()');
  assert.equal(applied.plan.advanced.debts[0].paymentMonthly, expected.recast.monthlyPayment,
    'the recast payment must come from recastAnalysis(), not from arithmetic repeated here');
  assert.equal(applied.recastAnalysis.recast.monthlyPayment, expected.recast.monthlyPayment,
    'and the analysis is handed back, so a caller can see the working');

  // A recast lowers the payment and leaves the clock alone -- its definition.
  assert.ok(expected.recast.monthlyPayment < expected.doNothing.monthlyPayment,
    'a recast must lower the payment');
});

// ---------------------------------------------------------------------------
// Criterion 9 -- every method x objective pair exercised
// ---------------------------------------------------------------------------

test('mortgage-vs-investing: every method x objective pair is exercised', () => {
  const all = mvi.presets();
  assert.equal(all.length, mvi.METHODS.length * mvi.OBJECTIVES.length,
    'presets() must expose the full matrix');
  assert.equal(all.length, 20, '5 methods x 4 objectives');

  /* monteCarlo, so planSuccessRate is applicable too -- otherwise a quarter of
     the matrix could never be exercised and "every pair" would be a weaker
     claim than it sounds. */
  const plan = household({ method: 'monteCarlo', runs: 120, seed: 123456, mortgageRate: 5, returnRate: 7 });
  const exercised = [];
  all.forEach((preset) => {
    const evaluated = mvi.evaluatePreset(plan, preset, OPTIONS);
    assert.equal(evaluated.method, preset.method);
    assert.equal(evaluated.objective, preset.objective);
    assert.equal(evaluated.applicable, true,
      preset.method + ' x ' + preset.objective + ' should be applicable on a fully-equipped ' +
      'monteCarlo household, got: ' + evaluated.reason);
    assert.equal(typeof evaluated.value, 'number',
      preset.method + ' x ' + preset.objective + ' must produce a number');
    assert.ok(Number.isFinite(evaluated.value),
      preset.method + ' x ' + preset.objective + ' produced ' + evaluated.value);
    exercised.push(preset.method + ' x ' + preset.objective);
  });
  assert.equal(exercised.length, all.length,
    'tested ' + exercised.length + ' combinations against the ' + all.length + ' the module exposes');
  assert.equal(new Set(exercised).size, all.length, 'and each exactly once');
});

test('mortgage-vs-investing: every objective declares a direction, and unknown names throw', () => {
  mvi.OBJECTIVES.forEach((objective) => {
    assert.ok(['higher', 'lower'].indexOf(mvi.OBJECTIVE_DIRECTION[objective]) >= 0,
      objective + ' must declare whether higher or lower is better -- without it "winner" is meaningless');
  });
  assert.throws(() => mvi.applyMethod(household({}), 'notAMethod', 1), /unknown method/);
  assert.throws(() => mvi.measure(household({}), { rows: [{}] }, 'notAnObjective', {}), /unknown objective/);
});

test('mortgage-vs-investing: accessibleLiquidityAtAge requires an explicit age', () => {
  const plan = household({});
  const missing = mvi.evaluatePreset(plan, { method: 'investLumpSum', objective: 'accessibleLiquidityAtAge' },
    { amount: 10000, runPlan: engine.runPlan });
  assert.equal(missing.applicable, false);
  assert.match(missing.reason, /requires an explicit `atAge`/);

  const present = mvi.evaluatePreset(plan, { method: 'investLumpSum', objective: 'accessibleLiquidityAtAge' },
    { amount: 10000, atAge: 60, runPlan: engine.runPlan });
  assert.equal(present.applicable, true);
  assert.ok(present.rowAge >= 60, 'the row read must be at or after the requested age');

  // Beyond the projection is refused, not silently clamped to the last row.
  const beyond = mvi.evaluatePreset(plan, { method: 'investLumpSum', objective: 'accessibleLiquidityAtAge' },
    { amount: 10000, atAge: 200, runPlan: engine.runPlan });
  assert.equal(beyond.applicable, false);
  assert.match(beyond.reason, /does not reach age 200/);
});

// ---------------------------------------------------------------------------
// Criterion 10 -- bundled, with every engine reference deferred
// ---------------------------------------------------------------------------

test('mortgage-vs-investing: registered as EXCLUDED, and genuinely absent from the built output', () => {
  const os = require('node:os');
  const builder = require('../build.js');

  /* P19 (decision register, 2026-09-10). This test used to assert the opposite:
     that MortgageVsInvesting resolves out of the shipped factory. It did -- and
     the Worker never bound it, so every call inside a Worker was a
     ReferenceError, and an external audit found six P1 defects (RB-03…RB-08,
     RC-03) in a comparison surface with no user interface that therefore never
     ran. The module is now excluded by decision rather than by accident.

     The module itself is unchanged and still fully tested above; what changed
     is that it does not ship. Revival is governed by P13 (funding and residual
     cash), P14 (a debt-inclusive metric), P15 (age-based horizons and an
     explicit success-rate window) and P17 (payoff status), not by deleting the
     registry line. tests/module-exclusion-registry.test.js enforces the set. */
  const entry = builder.DEBT_MODULES.find((m) => m.file === 'mortgage-vs-investing.js');
  assert.ok(entry, 'mortgage-vs-investing.js must stay REGISTERED -- an unregistered module is ' +
    'exactly the silent state the exclusion exists to replace');
  assert.equal(entry.namespace, 'MortgageVsInvesting');
  assert.equal(entry.bundled, false, 'and it must be registered as excluded');
  assert.match(entry.excludedReason, /RB-03|no user interface/,
    'the exclusion must state its reason');

  const scratch = path.join(os.tmpdir(), 'mvi-build-' + process.pid + '.html');
  const shipped = path.join(ROOT, 'investment-calculator-v2c.html');
  const before = fs.statSync(shipped).mtimeMs;
  let output;
  try {
    output = builder.build(scratch).output;
  } finally {
    try { fs.unlinkSync(scratch); } catch (e) { /* scratch cleanup only */ }
  }
  assert.equal(fs.statSync(shipped).mtimeMs, before, 'ground rule 2: the shipped artifact is not rebuilt');

  assert.ok(!output.includes('MortgageVsInvesting:MortgageVsInvesting'),
    'the factory must not return an excluded namespace');
  assert.ok(!output.includes('function MortgageVsInvestingNamespace'),
    'and the module source must not be inlined into the artifact at all');
});
