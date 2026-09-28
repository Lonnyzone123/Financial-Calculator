/* Q68 -- a profile.filing that is not a filing status the tax tables define is refused at the public boundary,
 * never thrown.
 *
 * The validator only warns about such a value, so an imported plan reached the engine with one. A prototype name
 * ("constructor", "hasOwnProperty") threw an uncaught TypeError from the bracket walk; any other unknown value failed
 * later with a code naming a symptom. Decided 2026-09-14 (the owner), answer (c): the boundary refuses a present value that
 * is not a filing status the tables define, and the tables are read by own key. This file holds the public half;
 * the own-key reads are witnessed beside it, directly on the tax functions, where the refusal cannot hide them.
 *
 * Public routes only: runPlan(), runScenario(), a fresh build's main thread and its generated Worker. Each title is a
 * literal, so the requirements register names every one.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { bootBuild } = require('./lib/build-routes.js');
const { postToWorker } = require('./lib/worker-source.js');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
/* The debt modules, installed exactly as the browser bundle provides them, before the engine is loaded. */
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const CODE = 'SCENARIO_UNKNOWN_FILING_STATUS';

/* A retired single drawing from a pre-tax IRA, so every year computes income tax through the filing tables. */
function fixture(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 63, spouseOn: false });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 5, inflation: 2 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 40000 });
  p.accounts = [{ id: 'a1', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', owner: 'self', balance: 800000, basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  if (edit) edit(p);
  return p;
}
const copy = (v) => JSON.parse(JSON.stringify(v));
const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
const attempt = (fn) => { try { return fn(); } catch (e) { return { threw: String(e && e.message).split('\n')[0] }; } };
const outcome = (r) => (r.threw !== undefined ? 'threw: ' + r.threw : r.status + ' / ' + r.calculationErrorCode + (r.rows === null ? ' / no rows' : ' / rows'));
const refused = (r) => r.threw === undefined && r.calculationErrorCode === CODE && r.rows === null;

let built;
test.before(async () => { built = await bootBuild(); });
test.after(() => { if (built) built.dom.window.close(); });

test('Q68: runPlan() refuses a filing status spelled like an Object.prototype member, instead of throwing', () => {
  const wrong = [];
  for (const filing of ['constructor', 'hasOwnProperty', 'toString', '__proto__', 'valueOf']) {
    const r = attempt(() => engine.runPlan(fixture((p) => { p.profile.filing = filing; })));
    if (!refused(r)) wrong.push(show(filing) + ' -> ' + outcome(r));
  }
  assert.deepStrictEqual(wrong, []);
});

test('Q68: runPlan() refuses any other filing status the tax tables do not define', () => {
  const wrong = [];
  for (const filing of ['xx', 'MFJ', '', null, 5, true]) {
    const r = attempt(() => engine.runPlan(fixture((p) => { p.profile.filing = filing; })));
    if (!refused(r)) wrong.push(show(filing) + ' -> ' + outcome(r));
  }
  assert.deepStrictEqual(wrong, []);
});

test('Q68: runScenario(), a fresh build\'s main thread and its generated Worker refuse a filing status of "constructor"', () => {
  const plan = fixture((p) => { p.profile.filing = 'constructor'; });
  const wrong = [];
  const scenario = attempt(() => engine.runScenario(copy(plan)));
  const page = attempt(() => built.engine.runPlan(copy(plan)));
  const worker = attempt(() => postToWorker(built.workerSource, copy(plan)));
  if (!refused(scenario)) wrong.push('runScenario(): ' + outcome(scenario));
  if (!refused(page)) wrong.push('the main thread: ' + outcome(page));
  if (worker.threw !== undefined) wrong.push('the Worker: threw: ' + worker.threw);
  else if (worker.error !== undefined) wrong.push('the Worker: posted error: ' + String(worker.error).split('\n')[0]);
  else if (!refused(worker.result)) wrong.push('the Worker: ' + outcome(worker.result));
  assert.deepStrictEqual(wrong, []);
});

test('Q68 control: single, mfj and hoh run through every route, and an absent filing status is not claimed by this refusal', () => {
  const wrong = [];
  for (const filing of ['single', 'mfj', 'hoh']) {
    const plan = fixture((p) => { p.profile.filing = filing; });
    const r = attempt(() => engine.runPlan(copy(plan)));
    if (r.threw !== undefined || r.status !== 'ok') wrong.push(filing + ' via runPlan() -> ' + outcome(r));
    const worker = attempt(() => postToWorker(built.workerSource, copy(plan)));
    if (worker.threw !== undefined || worker.error !== undefined || worker.result.status !== 'ok') wrong.push(filing + ' via the Worker -> ' + (worker.threw || worker.error || outcome(worker.result)));
  }
  const absent = attempt(() => engine.runPlan(fixture((p) => { delete p.profile.filing; })));
  if (absent.threw !== undefined || absent.calculationErrorCode === CODE) wrong.push('absent -> ' + outcome(absent));
  assert.deepStrictEqual(wrong, [], 'CONTROL: the three filing statuses are not claimed, nor is an absent one');
});
