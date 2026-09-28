/* The one internals test of tests/audit-cl-findings.test.js, split out at S5 block 2r.
 *
 * That file guards its findings through runPlan() and the capture tools. This file holds the single test that
 * calls the engine's internal helper for retained required-distribution cash, to show that a synthesized
 * account id is chosen with the same own-property semantics as the duplicate-id check. It depends on the
 * helper's name, so a rebuild re-points or retires it with that internal. The test is moved verbatim, with
 * the setup and account helper it uses.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { installDebtModules } = require('../tools/capture-baseline.js');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(
  shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
installDebtModules();
const engine = require('../src/engine.js');
const { validateScenario } = require('../src/scenario-validator.js');
const golden = require('./lib/golden-scenario-defs.js');

const clone = (v) => JSON.parse(JSON.stringify(v));
const defaultPlan = golden.extractDefaultPlan(shell);

function account(over) {
  return Object.assign({
    id: 'a1', name: 'A', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 0,
    contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0,
    annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }, over);
}

test('CL-01: the synthesized-id helper uses the same own-property semantics', () => {
  /* uniqueSynthesizedId() carried the identical assumption. An existing account
     called __proto__ must be seen, so a derived name cannot silently collide
     with it. */
  const accounts = [account({ id: '__proto__', balance: 1 }), account({ id: 'household-cash', balance: 1 })];
  const made = engine.retainExcessRmdCash(accounts, 5000, null, true);
  assert.notEqual(made.id, 'household-cash',
    'the synthesized holding must not reuse an id already present');
  const ids = accounts.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length,
    'and no two accounts may end up sharing an id: ' + JSON.stringify(ids));
});
