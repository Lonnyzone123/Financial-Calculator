/* Q48's serialization gate, tested at the export level (split out at S5 block 2r).
 *
 * tests/audit-q48-nonserializable-input.test.js guards Q48 through runPlan(), runScenario() and the Worker only.
 * This file holds the two tests that call the engine's exported gate function directly: it claims no field
 * outside its own inputs, and it is null-safe on malformed containers. It depends on the gate's name, so a
 * rebuild re-points or retires it with that internal. The tests are moved verbatim, with the setup and plan
 * helper they use.
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

test('Q48 scope: the gate does not claim Q55\'s non-array fields', () => {
  const gate = engine.nonSerializableScenarioInputCode;
  assert.equal(typeof gate, 'function',
    'the gate must be exported -- otherwise the assertions below measure nothing');
  const plan = makePlan();
  plan.accounts = {};
  assert.equal(gate(plan), null, 'accounts: {} is Q55\'s array-shape question, not a serialisation failure');
  const debts = makePlan();
  debts.advanced.debts = {};
  assert.equal(gate(debts), null);
});

test('Q48 gate is null-safe: malformed containers must not make the gate itself a crash site', () => {
  const gate = engine.nonSerializableScenarioInputCode;
  assert.equal(typeof gate, 'function');
  for (const p of [null, undefined, {}, { accounts: null }, { advanced: null }, { advanced: {} }]) {
    assert.doesNotThrow(() => gate(p), `gate threw on ${JSON.stringify(p)}`);
    assert.equal(gate(p), null);
  }
});
