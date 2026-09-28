'use strict';

/*
 * S5 block 2r -- RB-01 through the public entry points.
 *
 * Two accounts may not share an id. The contribution and transfer paths find
 * accounts by id, so a shared id sent one account's contribution into the
 * other: a brokerage account's $12,000 landed in a 401(k). runPlan() and
 * runScenario() now refuse such a plan at their own boundary, before any cash
 * moves, whatever the importer did. The coupled guard also calls the engine's
 * internal contribution helper. This file reads only what runPlan() and
 * runScenario() return.
 *
 * Plan: single, 40 and working at $120,000, a $100,000 traditional 401(k) with
 * no contribution and a $100,000 brokerage account contributing $12,000 a
 * year, no return or inflation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require('../src/engine.js');
// eslint-disable-next-line no-eval
const defaultPlan = () => JSON.parse(JSON.stringify(eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')')));

const account = (o) => Object.assign({
  owner: 'self', contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
}, o);
function plan(ids) {
  const p = defaultPlan();
  p.setupComplete = true;
  Object.assign(p.profile, { filing: 'single', spouseOn: false, age: 40, retireAge: 65, endAge: 42 });
  Object.assign(p.employment, { salary: 120000, spouseSalary: 0, growth: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0 });
  p.retirement.dividendOn = false;
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  p.accounts = [
    account({ id: ids[0], name: '401k', type: 'traditional401k', taxClass: 'preTax', balance: 100000, priority: 1, basisPct: 0 }),
    account({ id: ids[1], name: 'Brokerage', type: 'taxable', taxClass: 'taxable', balance: 100000, contribution: 12000, priority: 2, basisPct: 100 }),
  ];
  return p;
}
const entryPoints = [['runPlan', engine.runPlan], ['runScenario', engine.runScenario]];

test('RB-01 (runPlan): two accounts sharing an id are refused at the boundary by runPlan() and runScenario(), before any cash moves', () => {
  for (const [name, run] of entryPoints) {
    const r = run(plan(['same', 'same']));
    assert.equal(r.status, 'calculation_error',
      'a plan whose accounts share an id must be refused at the boundary: ' + name + ' returned status ' + r.status + ', code ' + r.calculationErrorCode);
    assert.equal(r.calculationErrorCode, 'SCENARIO_DUPLICATE_ACCOUNT_ID', name + ' names the refusal');
    assert.equal(r.rows, null, name + ' publishes no rows for a refused plan');
  }
});

test('RB-01 (runPlan): with distinct ids the contribution lands in the brokerage account and the 401(k) is untouched', () => {
  for (const [name, run] of entryPoints) {
    const r = run(plan(['a', 'b']));
    assert.equal(r.status, 'ok', name + ': the plan runs');
    assert.equal(Math.round(r.rows[1].preTax), 100000, name + ': the 401(k) receives no contribution');
    assert.ok(r.rows[1].taxable > 110000, name + ': the brokerage account receives the $12,000: ' + r.rows[1].taxable);
  }
});
