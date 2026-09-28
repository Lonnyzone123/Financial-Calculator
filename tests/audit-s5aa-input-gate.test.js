/* S5AA task 1.1 -- the engine's input gates refuse everything the validator refuses, through the documented
 * invalid-result contract, and never by throwing.
 *
 * FOUR FINDINGS, ONE GATE, all four recorded in Q100. A run count of 0 throws out of the Monte Carlo
 * aggregation; a missing `retirement` section throws out of strategySpending(); an income owner of null is
 * accepted and the stream is timed against self; and a debt whose rate is not a number is charged 0% interest.
 * They are the same defect seen from two sides -- the validator refuses the input and the engine does not --
 * and they are repaired as ONE pass, not as two projects.
 *
 * WHY A THROW IS NOT AN ACCEPTABLE REFUSAL. RESULT_CONTRACT.md section 3 promises the invalid-result shape from
 * every public path. A caller that has not run the validator -- the import route, a direct Node caller, the Worker --
 * gets a TypeError naming an internal symptom ("Cannot read properties of undefined (reading 'rows')") instead of a
 * named refusal. Worse, H-03 and H-06 do not throw at all: they return status ok with a wrong number.
 *
 * THE KEEPER TEST IS THE LAST ONE. Any per-case list I write here goes stale the moment the validator learns a new
 * refusal. The last test walks the VALIDATOR'S OWN verdict for each payload and requires the engine to refuse
 * whenever the validator errors. That is what keeps the two in step after this sprint.
 *
 * Reproduced before repair at 14b7095 (S5AA task 0.3): Handover temp/S5AA_FINDING_REPRODUCTIONS_20260919.md.
 * Filed as Q100. Public routes only: runPlan(), runScenario(), a fresh build's main thread and its generated Worker.
 * Each title is a literal, so the requirements register names every one.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { bootBuild } = require('./lib/build-routes.js');
const { postToWorker } = require('./lib/worker-source.js');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const validator = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const RUN_COUNT = 'SCENARIO_INVALID_RUN_COUNT';
const SECTION = 'SCENARIO_MISSING_SCENARIO_SECTION';
const OWNER = 'SCENARIO_UNRECOGNIZED_INCOME_OWNER';
const DEBT_RATE = 'SCENARIO_NONFINITE_DEBT_RATE';

/* A household with a debt and an other income, so every gate below has something real to refuse. */
function fixture(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 55, retireAge: 60, endAge: 65, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 5, inflation: 2 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 40000 });
  p.retirement.otherIncomes = [{ id: 'i1', name: 'Pension', owner: 'self', type: 'pension', amount: 30000, start: 60, end: 65, growthMode: 'fixed', growth: 0 }];
  p.advanced.debts = [{ id: 'd1', name: 'Loan', type: 'otherDebt', owner: 'household', balance: 20000, rate: 6, rateType: 'fixed', paymentMonthly: 400, extraPrincipalMonthly: 0, payoffAge: 70, includePayment: true, includeHousingCosts: false }];
  p.accounts = [{ id: 'a1', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', owner: 'self', balance: 800000, basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  if (edit) edit(p);
  return p;
}
const copy = (v) => JSON.parse(JSON.stringify(v));
const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
const attempt = (fn) => { try { return fn(); } catch (e) { return { threw: String(e && e.message).split('\n')[0] }; } };
const outcome = (r) => (r.threw !== undefined ? 'threw: ' + r.threw : r.status + ' / ' + r.calculationErrorCode + (r.rows === null ? ' / no rows' : ' / rows'));
const refusedWith = (r, code) => r.threw === undefined && r.calculationErrorCode === code && r.rows === null;

let built;
test.before(async () => { built = await bootBuild(); });
test.after(() => { if (built) built.dom.window.close(); });

test('S5AA 1.1 runs: runPlan() refuses a Monte Carlo run count that is not a positive integer, instead of throwing', () => {
  const wrong = [];
  /* Infinity is NOT in this list, and its absence is deliberate: the Monte Carlo loop is `for(i=0;i<runs;i++)`,
   * so Infinity does not throw, it never terminates. It is exercised in the contained child-process test below,
   * with the other counts too large to run. Measured at 14b7095: in-process, it takes the whole file down. */
  for (const runs of [0, -1, 1.5, NaN, -Infinity, '100', null, true]) {
    const r = attempt(() => engine.runPlan(fixture((p) => { p.assumptions.method = 'monteCarlo'; p.assumptions.runs = runs; })));
    if (!refusedWith(r, RUN_COUNT)) wrong.push(show(runs) + ' -> ' + outcome(r));
  }
  assert.deepStrictEqual(wrong, []);
});

/* An oversized job is rejected BEFORE any large allocation, which is the whole point: a run count of a hundred
 * million must not be discovered to be a problem by exhausting memory first. The ceiling is not invented -- the
 * shipped page clamps its own control with clamp(..., 100, 10000), so 10,000 is the largest count the product
 * itself produces.
 *
 * THIS TEST RUNS IN A CHILD PROCESS, DELIBERATELY. Written the obvious way -- calling runPlan() in this process --
 * it does not FAIL against the unrepaired engine, it KILLS THE RUNNER: measured here at 14b7095, runs: 1e6 drove V8
 * to "Ineffective mark-compacts near heap limit" and took the whole file down with it after 56 seconds. A red test
 * that aborts the suite is not a red test, and this repository has been burned by exactly this before (an L4 fault
 * run reached ~49 GB off-heap). The child gets a small heap and a short deadline, so the unrepaired engine dies
 * CONTAINED and is reported as a failure, while the repaired engine returns its refusal in milliseconds. */
function runInChild(planJson, ms) {
  const script = [
    'const fs=require("node:fs"),path=require("node:path");',
    'const ROOT=' + JSON.stringify(ROOT) + ';',
    'const shell=fs.readFileSync(path.join(ROOT,"src","app-shell.html"),"utf8");',
    'global.RULES=JSON.parse(shell.match(/<script type="application\\/json" id="v2b-rules-2026">([\\s\\S]*?)<\\/script>/)[1]);',
    'require(path.join(ROOT,"tools","capture-baseline.js")).installDebtModules();',
    'const engine=require(path.join(ROOT,"src","engine.js"));',
    'const plan=JSON.parse(fs.readFileSync(0,"utf8"));',
    'try{const r=engine.runPlan(plan);',
    'process.stdout.write(JSON.stringify({status:r.status,code:r.calculationErrorCode,rows:r.rows===null?null:"rows"}));}',
    'catch(e){process.stdout.write(JSON.stringify({threw:String(e&&e.message).split("\\n")[0]}));}',
  ].join('');
  try {
    const out = execFileSync(process.execPath, ['--max-old-space-size=512', '-e', script], {
      input: planJson, timeout: ms, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(out);
  } catch (e) {
    if (e && e.killed) return { died: 'timed out after ' + ms + 'ms' };
    return { died: 'exited ' + (e && e.status) + ': ' + String((e && e.stderr) || e).split('\n').filter((l) => /FATAL|heap|Error/.test(l))[0] };
  }
}

test('S5AA 1.1 runs: runPlan() refuses an excessive run count before allocating for it', () => {
  const wrong = [];
  for (const runs of [10001, 1e6, 1e8, Number.MAX_SAFE_INTEGER, Infinity]) {
    const plan = fixture((p) => { p.assumptions.method = 'monteCarlo'; p.assumptions.runs = runs; });
    const started = Date.now();
    const r = runInChild(JSON.stringify(plan), 20000);
    const elapsed = Date.now() - started;
    if (r.died) wrong.push(show(runs) + ' -> the child ' + r.died + ' (it allocated instead of refusing)');
    else if (r.threw !== undefined) wrong.push(show(runs) + ' -> threw: ' + r.threw);
    else if (r.code !== RUN_COUNT || r.rows !== null) wrong.push(show(runs) + ' -> ' + r.status + ' / ' + r.code);
    else if (elapsed > 15000) wrong.push(show(runs) + ' -> refused, but took ' + elapsed + 'ms, so it allocated first');
  }
  assert.deepStrictEqual(wrong, []);
});

test('S5AA 1.1 sections: runPlan() refuses a scenario with a required section missing or not a record, instead of throwing', () => {
  const wrong = [];
  for (const key of ['profile', 'employment', 'assumptions', 'retirement', 'advanced']) {
    const absent = attempt(() => engine.runPlan(fixture((p) => { delete p[key]; })));
    if (!refusedWith(absent, SECTION)) wrong.push('absent ' + key + ' -> ' + outcome(absent));
    for (const value of [null, 5, 'x', []]) {
      const wrongType = attempt(() => engine.runPlan(fixture((p) => { p[key] = value; })));
      if (!refusedWith(wrongType, SECTION)) wrong.push(key + ' = ' + show(value) + ' -> ' + outcome(wrongType));
    }
  }
  assert.deepStrictEqual(wrong, []);
});

test('S5AA 1.1 income owner: runPlan() refuses an other income whose owner is present but not a recognized owner', () => {
  const wrong = [];
  for (const owner of [null, 'partner', '', 'Self', 5, true, {}]) {
    const r = attempt(() => engine.runPlan(fixture((p) => { p.retirement.otherIncomes[0].owner = owner; })));
    if (!refusedWith(r, OWNER)) wrong.push(show(owner) + ' -> ' + outcome(r));
  }
  assert.deepStrictEqual(wrong, []);
});

test('S5AA 1.1 income owner: an absent income owner keeps its own existing refusal, distinct from an unrecognized one', () => {
  const r = attempt(() => engine.runPlan(fixture((p) => { delete p.retirement.otherIncomes[0].owner; })));
  assert.strictEqual(r.threw, undefined, 'an absent owner must not throw');
  assert.strictEqual(r.calculationErrorCode, 'SCENARIO_MISSING_INCOME_OWNER',
    'absent is not the same defect as unrecognized, and Q69 already names it');
});

test('S5AA 1.1 debt rate: runPlan() refuses a debt whose rate is not a usable number, instead of charging 0% interest', () => {
  const wrong = [];
  for (const rate of ['abc', null, NaN, Infinity, true, {}, '6']) {
    const r = attempt(() => engine.runPlan(fixture((p) => { p.advanced.debts[0].rate = rate; })));
    if (!refusedWith(r, DEBT_RATE)) wrong.push(show(rate) + ' -> ' + outcome(r));
  }
  assert.deepStrictEqual(wrong, []);
});

test('S5AA 1.1: runScenario(), a fresh build\'s main thread and its generated Worker refuse each of the four inputs', () => {
  const cases = [
    ['runs: 0', RUN_COUNT, (p) => { p.assumptions.method = 'monteCarlo'; p.assumptions.runs = 0; }],
    ['no retirement section', SECTION, (p) => { delete p.retirement; }],
    ['owner: null', OWNER, (p) => { p.retirement.otherIncomes[0].owner = null; }],
    ['rate: "abc"', DEBT_RATE, (p) => { p.advanced.debts[0].rate = 'abc'; }],
  ];
  const wrong = [];
  for (const [label, code, edit] of cases) {
    const plan = fixture(edit);
    const scenario = attempt(() => engine.runScenario(copy(plan)));
    const page = attempt(() => built.engine.runPlan(copy(plan)));
    const worker = attempt(() => postToWorker(built.workerSource, copy(plan)));
    if (!refusedWith(scenario, code)) wrong.push(label + ' via runScenario(): ' + outcome(scenario));
    if (!refusedWith(page, code)) wrong.push(label + ' via the main thread: ' + outcome(page));
    if (worker.threw !== undefined) wrong.push(label + ' via the Worker: threw: ' + worker.threw);
    else if (worker.error !== undefined) wrong.push(label + ' via the Worker: posted error: ' + String(worker.error).split('\n')[0]);
    else if (!refusedWith(worker.result, code)) wrong.push(label + ' via the Worker: ' + outcome(worker.result));
  }
  assert.deepStrictEqual(wrong, []);
});

test('S5AA 1.1 control: valid run counts, complete sections, recognized owners and numeric rates all still run', () => {
  const wrong = [];
  for (const runs of [1, 2, 100, 1000, 10000]) {
    const r = attempt(() => engine.runPlan(fixture((p) => { p.assumptions.method = 'monteCarlo'; p.assumptions.runs = runs; })));
    if (r.threw !== undefined || r.status !== 'ok') wrong.push('runs ' + runs + ' -> ' + outcome(r));
  }
  for (const owner of ['self', 'spouse', 'household']) {
    const r = attempt(() => engine.runPlan(fixture((p) => { p.profile.spouseOn = true; p.profile.spouseAge = 53; p.retirement.otherIncomes[0].owner = owner; })));
    if (r.threw !== undefined || r.status !== 'ok') wrong.push('owner ' + owner + ' -> ' + outcome(r));
  }
  for (const rate of [0, 6, 20.5]) {
    const r = attempt(() => engine.runPlan(fixture((p) => { p.advanced.debts[0].rate = rate; })));
    if (r.threw !== undefined || r.status !== 'ok') wrong.push('rate ' + rate + ' -> ' + outcome(r));
  }
  const plain = attempt(() => engine.runPlan(fixture()));
  if (plain.threw !== undefined || plain.status !== 'ok') wrong.push('the unedited fixture -> ' + outcome(plain));
  /* An absent assumptions.runs is not claimed by the run-count gate: the simple and historical methods do not use it. */
  const absentRuns = attempt(() => engine.runPlan(fixture((p) => { delete p.assumptions.runs; })));
  if (absentRuns.threw !== undefined || absentRuns.calculationErrorCode === RUN_COUNT) wrong.push('absent runs -> ' + outcome(absentRuns));
  assert.deepStrictEqual(wrong, [], 'CONTROL: none of the four gates may claim a valid scenario');
});

/* THE KEEPER. Every list above is a snapshot of what I happened to think of. This one asks the validator what it
 * refuses and requires the engine to refuse the same payload, so the two cannot drift apart silently after S5AA.
 * It deliberately does NOT require the same code string: the engine has its own SCENARIO_* vocabulary and has had
 * since Q69, where the validator says MISSING_FIELD and the engine says SCENARIO_MISSING_INCOME_OWNER. What must
 * agree is the VERDICT, not the wording. */
test('S5AA 1.1: the engine refuses every payload the validator errors on, for the inputs this task covers', () => {
  const payloads = [
    ['assumptions.runs = 0', (p) => { p.assumptions.method = 'monteCarlo'; p.assumptions.runs = 0; }],
    ['assumptions.runs = -1', (p) => { p.assumptions.method = 'monteCarlo'; p.assumptions.runs = -1; }],
    ['assumptions.runs = 1.5', (p) => { p.assumptions.method = 'monteCarlo'; p.assumptions.runs = 1.5; }],
    ['assumptions.runs = NaN', (p) => { p.assumptions.method = 'monteCarlo'; p.assumptions.runs = NaN; }],
    ['no profile', (p) => { delete p.profile; }],
    ['no employment', (p) => { delete p.employment; }],
    ['no assumptions', (p) => { delete p.assumptions; }],
    ['no retirement', (p) => { delete p.retirement; }],
    ['no advanced', (p) => { delete p.advanced; }],
    ['retirement = null', (p) => { p.retirement = null; }],
    ['income owner = null', (p) => { p.retirement.otherIncomes[0].owner = null; }],
    ['income owner = "partner"', (p) => { p.retirement.otherIncomes[0].owner = 'partner'; }],
    ['debt rate = "abc"', (p) => { p.advanced.debts[0].rate = 'abc'; }],
    ['debt rate = null', (p) => { p.advanced.debts[0].rate = null; }],
  ];
  const validate = validator.validateScenario || validator.validate;
  const wrong = [];
  for (const [label, edit] of payloads) {
    const plan = fixture(edit);
    const issues = validate(copy(plan));
    const list = (issues && (issues.issues || issues.errors || issues)) || [];
    const validatorErrors = (Array.isArray(list) ? list : []).filter((i) => i && i.severity === 'ERROR');
    if (!validatorErrors.length) { wrong.push(label + ': the VALIDATOR did not error, so this case is mis-stated'); continue; }
    const r = attempt(() => engine.runPlan(copy(plan)));
    if (r.threw !== undefined) wrong.push(label + ': the validator errors and the engine THREW: ' + r.threw);
    else if (r.status === 'ok') wrong.push(label + ': the validator errors and the engine returned ok');
    else if (r.rows !== null) wrong.push(label + ': the engine refused but still returned rows');
  }
  assert.deepStrictEqual(wrong, [], 'the engine must refuse everything the validator errors on');
});
