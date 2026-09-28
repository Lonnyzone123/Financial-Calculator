/* S5 block 2j -- a future change's value is refused by TYPE at the runPlan()
 * boundary, before the contribution arithmetic can concatenate it.
 *
 * accountPlannedContribution() adds a dollar change's value with +, so a
 * numeric string concatenates: contribution 1000 plus "500" deposits 1000500,
 * and the run completes with status "ok", because the result is finite. A set
 * change stores the string for a later dollar change to concatenate onto.
 * The contribution boundary check already refused a string contribution; it
 * now refuses a present futureChanges[].value that is not a finite number,
 * with the same code. That is the plan's 2j.1: one fix layer, by type, because
 * the validator already refuses the input.
 *
 * Per 2j.3 and 2j.4: a multi-year plan (a one-year plan cannot tell
 * concatenation from coercion), and real FUTURE_CHANGE_SPEC modes (dollar,
 * set, percent). A percent change's string would coerce, but it is refused by
 * type too: the check does not depend on which arithmetic a mode happens to use.
 *
 * Not claimed: a future-change element that is not a record, a separate
 * question. Reachability is programmatic: import runs the validator, and the
 * app writes numbers.
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

const CODE = 'SCENARIO_NONFINITE_CONTRIBUTION';

/* Age 55, working to 62: seven contribution years, so a change at 57 enters the
   arithmetic several times. */
function plan(futureChanges) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 5, inflation: 2, fee: 0, volatility: 0 });
  Object.assign(p.profile, { age: 55, retireAge: 62, endAge: 80, spouseOn: false });
  Object.assign(p.employment, { salary: 90000, contributionStop: 62 });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 100000, contribution: 1000,
    contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
    changeTiming: 'year', futureChanges, allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  return p;
}
const contributionsAt = (r, age) => { const row = (r.rows || []).find((x) => Number(x.age) === age); return row ? row.contributions : undefined; };

const CASES = [
  ['a dollar change', [{ age: 57, mode: 'dollar', value: '500' }]],
  ['a set change followed by a dollar change', [{ age: 56, mode: 'set', value: '2000' }, { age: 58, mode: 'dollar', value: 300 }]],
  ['a percent change', [{ age: 57, mode: 'percent', value: '10' }]],
];
for (const [label, changes] of CASES) {
  test('future change value: ' + label + ' carrying a numeric string is refused with ' + CODE + ', not run', () => {
    const r = engine.runPlan(plan(changes));
    assert.equal(r.calculationErrorCode, CODE,
      'a string value must be refused before the arithmetic; instead the run returned ' + r.status + ' with contributions at 59 of ' + JSON.stringify(contributionsAt(r, 59)));
    assert.equal(r.rows, null, 'the invalid-result shape carries no rows');
    const s = engine.runScenario(plan(changes));
    assert.equal(s.calculationErrorCode, CODE, 'runScenario() refuses it too');
  });
}

test('future change value: NaN, Infinity and null are refused by the same check', () => {
  for (const value of [NaN, Infinity, -Infinity, null]) {
    const r = engine.runPlan(plan([{ age: 57, mode: 'dollar', value }]));
    assert.equal(r.calculationErrorCode, CODE, 'value ' + String(value) + ' returned ' + r.status + ' / ' + r.calculationErrorCode);
  }
});

test('future change value controls: numeric values in every mode run and are applied, and a non-record element is not claimed', () => {
  const none = engine.runPlan(plan([]));
  assert.equal(none.status, 'ok', 'CONTROL: the plan without changes runs');
  for (const changes of [
    [{ age: 57, mode: 'dollar', value: 500 }],
    [{ age: 56, mode: 'set', value: 2000 }, { age: 58, mode: 'dollar', value: 300 }],
    [{ age: 57, mode: 'percent', value: 10 }],
  ]) {
    const r = engine.runPlan(plan(changes));
    assert.equal(r.status, 'ok', 'numeric ' + JSON.stringify(changes) + ' runs');
    assert.notEqual(JSON.stringify(r.rows), JSON.stringify(none.rows), 'CONTROL: ' + JSON.stringify(changes) + ' is applied, so the multi-year plan can tell a change from none');
  }
  const element = engine.runPlan(plan([5]));
  assert.notEqual(element.calculationErrorCode, CODE, 'a future-change element that is not a record is a separate question, not this check\'s');
});

/* ---- the generated Worker, which rebuilds the engine from app-shell.html ---- */

const { liveWorkerSource, postToWorker, cleanup } = require('./lib/worker-source.js');
test.after(() => cleanup());

test('future change value worker: the Worker refuses a string dollar value too, instead of posting a concatenated result', async () => {
  const source = await liveWorkerSource();
  const message = postToWorker(source, plan([{ age: 57, mode: 'dollar', value: '500' }]));
  assert.equal(message.error, undefined, 'the Worker posted an error: ' + message.error);
  assert.equal(message.result.calculationErrorCode, CODE, 'the Worker returned ' + message.result.status + ' without the refusal');
});

test('future change value worker control: the Worker still runs a numeric future change', async () => {
  const source = await liveWorkerSource();
  const message = postToWorker(source, plan([{ age: 57, mode: 'dollar', value: 500 }]));
  assert.equal(message.error, undefined, 'the Worker posted an error: ' + message.error);
  assert.equal(message.result.status, 'ok');
});
