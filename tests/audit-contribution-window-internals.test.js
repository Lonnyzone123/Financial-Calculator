'use strict';

/* The one internals test of tests/audit-contribution-window.test.js, split out at S5 block 2r.
 *
 * That file guards the owner-specific contribution window through runPlan() only. This file holds the single
 * test that runs the engine's internal simulation directly, with diagnostics on, to show the reconciliation
 * invariant stays clean across a mid-row retirement. It depends on internal names, so a rebuild re-points or
 * retires it with them. The test is moved verbatim, with the setup and helpers it uses.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

const defaultPlanMatch = shell.match(/var defaultPlan=(\{.*?\});/);
// eslint-disable-next-line no-eval
const defaultPlan = eval('(' + defaultPlanMatch[1] + ')');

function dollarAccount(overrides = {}) {
  return Object.assign({
    id: 'a1', name: 'Account', type: 'traditional401k', taxClass: 'preTax', owner: 'self',
    balance: 100000, contribution: 12000, contributionMode: 'amount', priority: 1, basisPct: 0,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }, overrides);
}

function planFor(profileOverrides, employmentOverrides, accounts) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.assumptions.returnRate = 0;
  p.assumptions.method = 'simple';
  Object.assign(p.profile, profileOverrides);
  Object.assign(p.employment, employmentOverrides);
  p.accounts = accounts;
  return p;
}

test('AUD-005: reconciliation invariant holds exactly across a mid-row retirement with dollar contributions', () => {
  const p = planFor(
    { age: 60, retireAge: 60.5, endAge: 61 },
    { salary: 100000, contributionStop: 65 },
    [dollarAccount({ matchOn: true, matchCap: 5, matchRate: 100 })],
  );
  const issues = [];
  engine.simulatePlan(p, engine.rng(p.assumptions.seed), 0, null, issues);
  assert.deepEqual(issues, [], `expected a clean run, got ${JSON.stringify(issues.slice(0, 2))}`);
});
