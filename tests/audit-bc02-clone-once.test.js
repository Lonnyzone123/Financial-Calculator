/* BC-02 -- Q48's precheck serialized the input, then simulation serialized it
 * again, so a caller's toJSON callback ran TWICE on runPlan()'s own path.
 *
 * findingIds: BC-02
 *
 * Decided 2026-09-13 (the owner, S5 2m.1): clone the input once, under the error
 * boundary, and reuse that clone. The copy is taken once, and every later step
 * works on data that carries no callback. So a callback runs exactly once, and
 * callback-bearing programmatic input stays supported. Rejecting such input by
 * non-executing descriptor inspection was the option not chosen.
 *
 * Acceptance, per the external closeout verdict (S2_CARRIED_WORK_REGISTER.md,
 * BC-02): ordinary data, cycles, BigInt, always-throwing and stateful callbacks;
 * status, callback counts under the chosen policy, and balance/flow results;
 * valid controls. Q55's non-array issue (S5 2i) and R6's identity cycle (S5 2n)
 * are separate findings with their own witnesses, and nothing here covers them.
 *
 * Scope: direct programmatic input only. JSON cannot encode a callback, and a
 * function cannot cross the Worker's structured-clone boundary, so the Worker
 * route is not a callback route.
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

function plainPlan() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 5, inflation: 2, fee: 0, volatility: 0 });
  Object.assign(p.profile, { age: 60, retireAge: 62, endAge: 70 });
  Object.assign(p.employment, { salary: 80000, contributionStop: 62 });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 400000, contribution: 5000, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  return p;
}

/* Puts a toJSON callback on accounts[0]. It returns the account's own data, so
   a plan carrying it describes exactly the same household as plainPlan(). */
function withCallback(kind) {
  const p = plainPlan();
  const data = JSON.parse(JSON.stringify(p.accounts[0]));
  let calls = 0;
  p.accounts[0].toJSON = function () {
    calls += 1;
    if (kind === 'always') throw new Error('never serializable');
    if (kind === 'stateful' && calls >= 2) throw new Error('second serialization');
    return data;
  };
  return { p, calls: () => calls };
}

test('BC-02: an ordinary toJSON callback runs exactly once through runPlan()', () => {
  const { p, calls } = withCallback('ordinary');
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok');
  assert.equal(calls(), 1, 'the chosen policy copies the input once, so the callback runs once; it ran ' + calls() + ' times');
});

test('BC-02: a stateful toJSON that succeeds once runs through runPlan() with status ok', () => {
  const { p, calls } = withCallback('stateful');
  let r;
  assert.doesNotThrow(() => { r = engine.runPlan(p); }, 'a callback that succeeds on its only call must not be invoked a second time');
  assert.equal(r.status, 'ok');
  assert.equal(calls(), 1);
});

test('BC-02: runScenario() invokes the callback exactly once too (identity hashing does not call toJSON)', () => {
  const { p, calls } = withCallback('stateful');
  let r;
  assert.doesNotThrow(() => { r = engine.runScenario(p); });
  assert.equal(r.status, 'ok');
  assert.ok(r.identity, 'a successful run carries its identity');
  assert.equal(calls(), 1);
});

test('BC-02: an always-throwing toJSON is still refused as SCENARIO_NONSERIALIZABLE_INPUT, after one call', () => {
  const { p, calls } = withCallback('always');
  const r = engine.runPlan(p);
  assert.equal(r.calculationErrorCode, 'SCENARIO_NONSERIALIZABLE_INPUT');
  assert.equal(r.rows, null, 'the invalid-result shape carries no rows');
  assert.equal(calls(), 1);
});

test('BC-02: a cycle and a BigInt in an account are still refused as SCENARIO_NONSERIALIZABLE_INPUT', () => {
  const cyclic = plainPlan();
  cyclic.accounts[0].self = cyclic.accounts[0];
  const big = plainPlan();
  big.accounts[0].note = 10n;
  for (const [label, p] of [['cycle', cyclic], ['BigInt', big]]) {
    const r = engine.runPlan(p);
    assert.equal(r.calculationErrorCode, 'SCENARIO_NONSERIALIZABLE_INPUT', label);
    assert.equal(r.rows, null, label);
  }
});

test('BC-02 control: a callback-bearing plan gives exactly the result of the same household as plain data', () => {
  const { p } = withCallback('ordinary');
  const withHook = engine.runPlan(p);
  const plain = engine.runPlan(plainPlan());
  assert.equal(plain.status, 'ok', 'CONTROL: the plain plan runs');
  assert.ok((plain.rows || []).some((row) => Number(row.contributions) > 0), 'CONTROL: the fixture exercises the account (contributions flow)');
  assert.equal(JSON.stringify(withHook), JSON.stringify(plain),
    'copying the input once must not change balances or flows: the callback returns the account\'s own data');
});
