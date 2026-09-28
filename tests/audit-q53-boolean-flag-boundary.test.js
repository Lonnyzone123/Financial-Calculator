/* S5 block 2l -- Q53: the engine boundary refuses a flag value that is not a
 * boolean, and gives an absent flag its documented default. Public routes
 * only -- runPlan(), runScenario() and the generated Worker -- so these
 * witnesses survive a rebuild of the engine. The validator layer is
 * witnessed here too, through validateScenario().
 *
 * Decided 2026-09-13 (the owner): a present non-boolean is refused, never coerced;
 * a truly absent flag takes its documented default; an explicit false is
 * preserved. Before this, the string "false" switched a feature on, and an
 * absent default-true flag ran as false.
 *
 * The whole contract -- every flag, every value class, the validator -- is
 * tests/boolean-flag-contract.test.js. That file also checks the contract is
 * complete against the app's record normalizers, which ties it to internals.
 * This one reads only the public entry points, so Q53 keeps a guard that does
 * not depend on how the engine is built.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const { liveWorkerSource, postToWorker, cleanup } = require('./lib/worker-source.js');
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

test.after(() => cleanup());

const CODE = 'SCENARIO_NONBOOLEAN_FLAG';
const ROUTES = [
  ['runPlan()', async (p) => engine.runPlan(p)],
  ['runScenario()', async (p) => engine.runScenario(p)],
  ['the generated Worker', async (p) => {
    const message = postToWorker(await liveWorkerSource(), p);
    assert.equal(message.error, undefined, 'the worker threw: ' + message.error);
    return message.result;
  }],
];

/* A couple a year from retirement, with a matched 401k and a fixed-rate
   mortgage, so a plan-section flag, an account flag and a debt flag each have
   something to act on. */
function household(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 5, inflation: 2.5, fee: 0, volatility: 0, runs: 20, seed: 7 });
  Object.assign(p.profile, { age: 62, retireAge: 63, endAge: 92, spouseOn: true, spouseAge: 60 });
  Object.assign(p.employment, { salary: 90000, spouseSalary: 0, contributionStop: 63 });
  const record = (over) => Object.assign({
    owner: 'self', contribution: 0, contributionMode: 'amount', basisPct: 100, annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }, over);
  p.accounts = [
    record({ id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', balance: 500000, contribution: 5000, priority: 1, basisPct: 70 }),
    record({ id: 'a2', name: '401k', type: 'traditional401k', taxClass: 'preTax', balance: 900000, contribution: 15000, priority: 2, matchOn: true, matchCap: 5, matchRate: 100 }),
  ];
  Object.assign(p.retirement, { spending: 80000, ssBenefit: 2400, spouseSS: 1200 });
  p.advanced.otherAssets = [];
  p.advanced.debts = [{
    id: 'd1', type: 'mortgage', name: 'Mortgage', owner: 'household', balance: 250000, rate: 6, paymentMonthly: 2000, payoffAge: 78,
    includePayment: true, taxDeductible: true, mortgageType: 'conventional', rateType: 'fixed', originalAmount: 350000, propertyValue: 500000,
    remainingTermYears: 20, loanTermYears: 30, extraPrincipalMonthly: 0, annualPropertyTax: 4000, annualInsurance: 1500, hoaMonthly: 0,
    pmiMonthly: 0, includeHousingCosts: true,
  }];
  if (edit) edit(p);
  return p;
}

/* Everything but provenance and diagnostics. */
const projection = (r) => { const c = Object.assign({}, r); delete c.identity; delete c.issues; return JSON.stringify(c); };

/* One flag on each kind of holder: a plan section, an account record, a debt record. */
const SAMPLES = [
  ['profile.spouseOn', (p, v) => { p.profile.spouseOn = v; }],
  ['accounts[1].matchOn', (p, v) => { p.accounts[1].matchOn = v; }],
  ['advanced.debts[0].includePayment', (p, v) => { p.advanced.debts[0].includePayment = v; }],
];
const NON_BOOLEANS = [['"false"', 'false'], ['"0"', '0'], ['null', null], ['0', 0], ['1', 1], ['""', ''], ['[]', []], ['{}', {}]];

for (const [route, run] of ROUTES) {
  test(`Q53 boundary, ${route}: a non-boolean flag is refused with its path, never run`, async () => {
    const problems = [];
    for (const [at, set] of SAMPLES) {
      for (const [label, value] of NON_BOOLEANS) {
        const r = await run(household((p) => set(p, value)));
        if (!r.calculationError) { problems.push(`${at} = ${label}: ACCEPTED, status ${r.status}`); continue; }
        if (r.calculationErrorCode !== CODE) { problems.push(`${at} = ${label}: refused as ${r.calculationErrorCode}, not ${CODE}`); continue; }
        if (r.rows !== null) problems.push(`${at} = ${label}: refused, but rows is not null`);
        if (!(r.issues || []).some((i) => i.code === CODE && i.state && i.state.path === at)) problems.push(`${at} = ${label}: no ${CODE} issue names ${at}`);
      }
    }
    assert.deepEqual(problems, []);
  });

  test(`Q53 boundary control, ${route}: true and false still run, and differ where the flag acts`, async () => {
    for (const [at, set] of SAMPLES) {
      const t = await run(household((p) => set(p, true)));
      const f = await run(household((p) => set(p, false)));
      assert.ok(!t.calculationError, at + ' = true must run: ' + t.calculationErrorCode);
      assert.ok(!f.calculationError, at + ' = false must run: ' + f.calculationErrorCode);
      assert.notEqual(projection(t), projection(f), at + ': true and false must differ here, or the refusals above prove less');
    }
  });

  test(`Q53 absent default, ${route}: an absent default-true flag runs as true`, async () => {
    const t = projection(await run(household((p) => { p.advanced.debts[0].includePayment = true; })));
    const f = projection(await run(household((p) => { p.advanced.debts[0].includePayment = false; })));
    const a = projection(await run(household((p) => { delete p.advanced.debts[0].includePayment; })));
    assert.notEqual(t, f, 'CONTROL: includePayment true and false must differ here');
    assert.ok(a === t, 'advanced.debts[0].includePayment absent ran as ' + (a === f ? 'false' : 'neither true nor false') + '; its documented default is true');
  });
}

test('Q53 absent default, runPlan(): the default is written to a copy, and the plan passed in is unchanged', () => {
  const plan = household((p) => { delete p.advanced.debts[0].includePayment; });
  const before = JSON.stringify(plan);
  engine.runPlan(plan);
  assert.equal(JSON.stringify(plan), before);
});

/* The validator layer (S5 2l's validator commit): import runs it, so a
   malformed flag is named there before any engine sees the plan. */
test('Q53 validator: a non-boolean flag is a WRONG_TYPE error at its path, and the plan does not validate', () => {
  const problems = [];
  for (const [at, set] of SAMPLES) {
    for (const [label, value] of NON_BOOLEANS) {
      const res = validateScenario(household((p) => set(p, value)));
      const hit = (res.issues || []).some((i) => i.code === 'WRONG_TYPE' && i.severity === 'ERROR' && i.path === at);
      if (!hit) problems.push(`${at} = ${label}: no WRONG_TYPE error at ${at}${res.valid ? ', and the plan validates' : ''}`);
      else if (res.valid) problems.push(`${at} = ${label}: WRONG_TYPE raised, yet the plan validates`);
    }
  }
  assert.deepEqual(problems, []);
});

test('Q53 validator control: true, false and absent raise no error at the flag', () => {
  for (const [at, set] of SAMPLES) {
    for (const value of [true, false, undefined]) {
      const res = validateScenario(household((p) => set(p, value)));
      const errors = (res.issues || []).filter((i) => i.severity === 'ERROR' && i.path === at);
      assert.deepEqual(errors, [], at + ' = ' + String(value) + ' must raise no error');
    }
  }
});
