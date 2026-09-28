/* Q48 -- a circular reference inside an account, debt or other-asset entry
 * crashed runPlan() with an uncaught exception.
 *
 * findingIds: Q48
 *
 * clone() is JSON.parse(JSON.stringify(o)), and simulatePlan() opens by
 * cloning exactly three arrays. JSON.stringify throws on three things, not
 * one -- a cycle, a BigInt, and a toJSON that throws -- and all three were
 * measured escaping runPlan() before this repair. The toJSON case throws
 * Error rather than TypeError, which is why it is a case of its own below: a
 * guard narrowed to TypeError would pass the cycle tests and miss it.
 *
 * Scope limits, stated because each is easy to overclaim:
 *  - Direct JavaScript input only. JSON cannot encode a cycle or a BigInt, so
 *    no saved file and no live-UI path reaches this.
 *  - This is NOT Q55. A missing or non-array field is Q55's open question and
 *    is deliberately not claimed by this gate; a scope test pins that.
 *  - The historical heat map calls simulatePlan() directly after its own
 *    clone(p) of the whole plan, and simulatePlan is exported, so neither
 *    path passes runPlan()'s gates. Not repaired here.
 *
 * The two tests that call the engine's exported gate function directly live in
 * tests/audit-q48-gate-export.test.js, split out at S5 block 2r, so this file reaches the engine only through its
 * public entry points and the Worker.
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

const CODE = 'SCENARIO_NONSERIALIZABLE_INPUT';

/* One-year deterministic control with a live contribution, so the control
   below proves simulation actually ran rather than returning early. */
function makePlan() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { returnRate: 0, inflation: 0, method: 'simple', volatility: 0 });
  Object.assign(p.profile, { age: 40, retireAge: 41, endAge: 41 });
  Object.assign(p.employment, { salary: 100000, contributionStop: 41 });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 500000, contribution: 1000, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  return p;
}

const deposited = (out) => (out.rows || [])
  .reduce((t, r) => t + (Number(r.contributions) || 0), 0);

function runNoThrow(plan) {
  let out;
  assert.doesNotThrow(() => { out = engine.runPlan(plan); },
    'runPlan() must return a result through the calculation_error contract, not throw');
  return out;
}

test('Q48 control: an ordinary plan still runs and deposits its contribution', () => {
  const out = runNoThrow(makePlan());
  assert.equal(out.status, 'ok');
  assert.equal(Math.round(deposited(out)), 1000,
    'if this is 0 the fixture never reached simulation and nothing below is measured');
});

const CASES = [
  ['a cycle on accounts[0]', (p) => { p.accounts[0].self = p.accounts[0]; }],
  ['a cycle nested inside an account', (p) => { const o = {}; o.back = o; p.accounts[0].allocation = { meta: o }; }],
  ['a BigInt on accounts[0]', (p) => { p.accounts[0].tag = 10n; }],
  ['a toJSON that throws Error, not TypeError', (p) => { p.accounts[0].toJSON = () => { throw new Error('boom'); }; }],
  ['a cycle on advanced.debts[0]', (p) => {
    p.advanced.debts = [{ id: 'd1', name: 'D', balance: 1000, rate: 5, paymentMonthly: 100, owner: 'self', kind: 'other' }];
    p.advanced.debts[0].self = p.advanced.debts[0];
  }],
  ['a cycle on advanced.otherAssets[0]', (p) => {
    p.advanced.otherAssets = [{ id: 'o1', name: 'O', value: 1000 }];
    p.advanced.otherAssets[0].self = p.advanced.otherAssets[0];
  }],
];

for (const [label, mutate] of CASES) {
  test(`Q48: ${label} is rejected through the contract, not thrown`, () => {
    const plan = makePlan();
    mutate(plan);
    const out = runNoThrow(plan);
    assert.equal(out.calculationError, true);
    assert.equal(out.calculationErrorCode, CODE);
    assert.equal(out.rows, null);
    const issue = (out.issues || []).find((x) => x.code === CODE);
    assert.ok(issue, 'the rejection must be recorded as an issue');
    assert.match(issue.message, /cannot be copied for simulation/,
      'a new rejection code must not inherit another code\'s message');
  });
}

test('Q48: the caller\'s plan is left unmodified -- the cycle is still there', () => {
  const plan = makePlan();
  plan.accounts[0].self = plan.accounts[0];
  runNoThrow(plan);
  assert.strictEqual(plan.accounts[0].self, plan.accounts[0]);
});

test('Q48: runScenario() -- the path the Worker actually calls -- returns the rejection too', () => {
  /* runScenario() is runPlan() plus buildSimulationIdentity(), whose inputHash
     recursed on the same cycle and overflowed the stack AFTER runPlan() had
     correctly rejected the plan. Every runPlan() test above passed while that
     was true; the Worker test below is what found it. This is the same check
     without a Worker, so a failure here names the function, not the transport. */
  const plan = makePlan();
  plan.accounts[0].self = plan.accounts[0];
  let out;
  assert.doesNotThrow(() => { out = engine.runScenario(plan); },
    'runScenario() must not throw on an input runPlan() has already rejected');
  assert.equal(out.calculationErrorCode, CODE);
  assert.equal(out.identity, null, 'an unserialisable input has no input hash to build an identity from');
});

test('Q48 control: runScenario() still attaches a full identity to an ordinary run', () => {
  const out = engine.runScenario(makePlan());
  assert.equal(out.status, 'ok');
  assert.ok(out.identity && out.identity.inputHash,
    'the null identity must be confined to the rejection, not leak onto ordinary results');
});

/* ---- scope: what this gate must NOT do ---- */

test('Q48 scope: a cycle OUTSIDE clone()\'s three arrays still runs, as it did before', () => {
  /* profile is never cloned. Measured before this repair: status "ok".
     Stringifying the whole plan would have turned that working run into an
     error, which is why the gate reads exactly clone()'s three inputs. */
  const plan = makePlan();
  plan.profile.self = plan.profile;
  const out = runNoThrow(plan);
  assert.equal(out.status, 'ok');
  assert.equal(Math.round(deposited(out)), 1000);
});

/* ---- the generated Worker ---- */

const { liveWorkerSource, postToWorker, cleanup } = require('./lib/worker-source.js');
test.after(() => cleanup());

test('Q48 worker: a cyclic plan returns the rejection instead of a posted error', async () => {
  /* structuredClone -- the real Worker transport -- carries cycles, so a
     cyclic plan DOES reach the Worker's runPlan(). Before this repair the
     Worker's own try/catch posted {error: stack}. The Worker rebuilds the
     engine from app-shell.html's workerFunctions list, so this also proves
     the new gate is registered there: a missing entry would be a
     ReferenceError, the class Q15 was about. */
  const source = await liveWorkerSource();
  const plan = makePlan();
  plan.accounts[0].self = plan.accounts[0];
  const message = postToWorker(source, plan);
  assert.equal(message.error, undefined, `worker posted an error: ${message.error}`);
  assert.equal(message.result.calculationErrorCode, CODE);
});

test('Q48 worker control: the Worker still runs an ordinary plan', async () => {
  const source = await liveWorkerSource();
  const message = postToWorker(source, makePlan());
  assert.equal(message.error, undefined, `worker posted an error: ${message.error}`);
  assert.equal(message.result.status, 'ok');
  assert.equal(Math.round(deposited(message.result)), 1000);
});
