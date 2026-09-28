/* S5 block 2l.3 -- Q53 through the two direct routes: the exported simulatePlan() and the heat map's call.
 *
 * The engine refuses a flag value that is not a boolean, and gives an absent flag its documented default. Since
 * S5 block 2n those checks run inside simulatePlan() itself, so a direct call and the heat map (which hands
 * simulatePlan() a shallow copy of the plan with its own assumptions object) are held to the same rule as runPlan().
 *
 * This file is implementation-coupled on purpose: these two routes ARE the engine's internal export, and the check
 * being witnessed lives there. The public-route witnesses -- runPlan(), runScenario(), the generated Worker and the
 * validator -- are tests/audit-q53-boolean-flag-boundary.test.js, which reads no internal, so Q53 keeps a guard that
 * survives a rebuild of the engine.
 *
 * Values, as the block lists them: true, false, absent, null, 0, 1, "", "true", "false", "0", "1", arrays and objects.
 * Each test's title is a literal, so the requirements register names all six.
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
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const CODE = 'SCENARIO_NONBOOLEAN_FLAG';
const direct = (p, issues) => engine.simulatePlan(p, engine.rng(p.assumptions.seed), 0, null, issues);
/* The heat map's own call shape (src/app-shell.html): a shallow copy with its own assumptions object. */
const heatMap = (p, issues) => engine.simulatePlan(Object.assign({}, p, { assumptions: Object.assign({}, p.assumptions) }), engine.rng(p.assumptions.seed), 0, null, issues);

/* A couple a year from retirement, with a matched 401k and a fixed-rate mortgage, so a plan-section flag, an account
   flag and a debt flag each have something to act on (the public-route witness's household). */
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

const SAMPLES = [
  ['profile.spouseOn', (p, v) => { p.profile.spouseOn = v; }],
  ['accounts[1].matchOn', (p, v) => { p.accounts[1].matchOn = v; }],
  ['advanced.debts[0].includePayment', (p, v) => { p.advanced.debts[0].includePayment = v; }],
];
const NON_BOOLEANS = [['"true"', 'true'], ['"false"', 'false'], ['"0"', '0'], ['"1"', '1'], ['null', null], ['0', 0], ['1', 1], ['""', ''], ['[]', []], ['{}', {}]];
const rowsOf = (r) => JSON.stringify(r.rows);
const flagged = (r) => r.calculationErrorAge !== null && r.calculationErrorAge !== undefined;

function refusesNonBooleans(run) {
  const problems = [];
  for (const [at, set] of SAMPLES) {
    for (const [label, value] of NON_BOOLEANS) {
      const p = household((x) => set(x, value));
      const issues = [];
      const r = run(p, issues);
      if (!flagged(r)) { problems.push(`${at} = ${label}: ACCEPTED, ${r.rows ? r.rows.length + ' rows' : 'no rows'}`); continue; }
      if (r.calculationErrorCode !== CODE) { problems.push(`${at} = ${label}: refused as ${r.calculationErrorCode}, not ${CODE}`); continue; }
      if (r.rows !== null) problems.push(`${at} = ${label}: refused, but rows is not null`);
      if (r.calculationErrorAge !== p.profile.age) problems.push(`${at} = ${label}: the error age is ${r.calculationErrorAge}, not the starting age`);
      if (!issues.some((i) => i.code === CODE && i.state && i.state.path === at)) problems.push(`${at} = ${label}: no ${CODE} issue names ${at}`);
    }
  }
  assert.deepEqual(problems, [], 'a non-boolean flag must be refused on this route: ' + problems.slice(0, 3).join(' | '));
}
function runsTrueAndFalse(run) {
  for (const [at, set] of SAMPLES) {
    const t = run(household((p) => set(p, true)), []);
    const f = run(household((p) => set(p, false)), []);
    assert.ok(!flagged(t), at + ' = true must run: ' + t.calculationErrorCode);
    assert.ok(!flagged(f), at + ' = false must run: ' + f.calculationErrorCode);
    assert.notEqual(rowsOf(t), rowsOf(f), at + ': true and false must differ here, or the refusals prove less');
  }
}
function absentRunsAsTrue(run) {
  const t = rowsOf(run(household((p) => { p.advanced.debts[0].includePayment = true; }), []));
  const f = rowsOf(run(household((p) => { p.advanced.debts[0].includePayment = false; }), []));
  const a = rowsOf(run(household((p) => { delete p.advanced.debts[0].includePayment; }), []));
  assert.notEqual(t, f, 'CONTROL: includePayment true and false must differ here');
  assert.ok(a === t, 'advanced.debts[0].includePayment absent ran as ' + (a === f ? 'false' : 'neither true nor false') + '; its documented default is true');
}

test('Q53 (direct routes): the exported simulatePlan() refuses a non-boolean flag with its path, never runs it', () => refusesNonBooleans(direct));
test('Q53 (direct routes): the exported simulatePlan() still runs true and false, and they differ where the flag acts', () => runsTrueAndFalse(direct));
test('Q53 (direct routes): the exported simulatePlan() runs an absent default-true flag as true', () => absentRunsAsTrue(direct));
test("Q53 (direct routes): the heat map's call refuses a non-boolean flag with its path, never runs it", () => refusesNonBooleans(heatMap));
test("Q53 (direct routes): the heat map's call still runs true and false, and they differ where the flag acts", () => runsTrueAndFalse(heatMap));
test("Q53 (direct routes): the heat map's call runs an absent default-true flag as true", () => absentRunsAsTrue(heatMap));
