'use strict';

/*
 * S5 block 2r -- HR-02 through the public entry point.
 *
 * When a required distribution leaves cash over and no taxable account exists,
 * the engine creates a taxable holding for it partway through the year. Two
 * things make that holding behave as an ordinary account would:
 *   (A) it receives the rest of that year's growth, although it is created after
 *       the year's returns were set;
 *   (B) it takes the allocation of the pre-tax account the distribution came
 *       from, so with asset classes on it earns what that account earns, not the
 *       plan-wide return.
 * The coupled guard reaches both through internal functions, and its one
 * runPlan() test leaves asset classes off, where (B) cannot show. This file
 * compares whole runPlan() projections: a plan whose holding is created against
 * the same plan given an empty taxable account from the start.
 *
 * Household: single, 80 to 82 and retired, $2,000,000 in a 401(k) at 60/30/10
 * stocks, bonds and cash, $20,000 fixed spending, a 10% plan-wide return, no
 * inflation, fees, benefits or reserve, monthly timing. The distribution's
 * surplus follows its default policy (invested). With asset classes on, that
 * allocation expects 7.65% rather than 10%.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require('../src/engine.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs.js');
const defaultPlan = extractDefaultPlan(shell);

const SOURCE_ALLOCATION = { stocks: 60, bonds: 30, cash: 10 };
const account = (o) => Object.assign({
  owner: 'self', contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
}, o);
const pretax = () => account({
  id: 'p1', name: '401k', type: 'traditional401k', taxClass: 'preTax', balance: 2000000, priority: 1, basisPct: 0,
  allocation: Object.assign({}, SOURCE_ALLOCATION),
});
const emptyTaxable = (allocation) => account({
  id: 't1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', balance: 0, priority: 2, basisPct: 100,
  allocation: Object.assign({}, allocation),
});

/** The rows of one projection. With explicitAllocation, an empty taxable account at that allocation exists from the
 *  start and receives the surplus; without it, the engine creates the holding. */
function project({ assetsOn, explicitAllocation }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.accounts = explicitAllocation ? [pretax(), emptyTaxable(explicitAllocation)] : [pretax()];
  Object.assign(p.profile, { age: 80, retireAge: 80, endAge: 82, spouseOn: false });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', withdrawalTiming: 'monthly', returnRate: 10, inflation: 0, fee: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 20000, flexibility: 0, ssBenefit: 0, spouseSS: 0, pension: 0, dividendOn: false,
    survivor: false, stages: [], expenses: [], otherIncomes: [],
  });
  Object.assign(p.advanced, {
    rmdOn: true, qcd: 0, healthOn: false, ltcOn: false, conversionOn: false, transferOn: false, reserveOn: false,
    bondTentOn: false, assetsOn, debts: [], otherAssets: [],
  });
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', 'the plan runs');
  return r.rows;
}
const totals = (rows) => rows.map((w) => Math.round(w.total * 1e6) / 1e6);

test('HR-02 (runPlan): with asset classes off, a holding created for distribution surplus ends every year exactly as an empty taxable account held from the start', () => {
  const created = project({ assetsOn: false });
  const explicit = project({ assetsOn: false, explicitAllocation: SOURCE_ALLOCATION });
  assert.ok(created[1].taxable > 0, 'the first year must create a taxable holding for the surplus');
  assert.deepEqual(totals(created), totals(explicit),
    'with asset classes off, the created holding must grow for the rest of its first year as an existing account does: ' +
    JSON.stringify(totals(created)) + ' vs ' + JSON.stringify(totals(explicit)));
});

test('HR-02 (runPlan): with asset classes on, the created holding takes its source account allocation and ends every year exactly as an empty taxable account at that allocation', () => {
  const created = project({ assetsOn: true });
  const explicit = project({ assetsOn: true, explicitAllocation: SOURCE_ALLOCATION });
  assert.ok(created[1].taxable > 0, 'the first year must create a taxable holding for the surplus');
  assert.deepEqual(totals(created), totals(explicit),
    'with asset classes on, the created holding must earn what its source account allocation earns, not the plan-wide return: ' +
    JSON.stringify(totals(created)) + ' vs ' + JSON.stringify(totals(explicit)));
});

test('HR-02 (runPlan): with asset classes on, an explicit account at a different allocation ends differently, so the comparison can see an allocation', () => {
  const created = project({ assetsOn: true });
  const allStocks = project({ assetsOn: true, explicitAllocation: { stocks: 100 } });
  const gap = Math.abs(created[created.length - 1].total - allStocks[allStocks.length - 1].total);
  assert.ok(gap > 100, 'an all-stock account must end more than $100 away from the source allocation: ' + gap);
});
