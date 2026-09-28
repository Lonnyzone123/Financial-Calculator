'use strict';

/*
 * S5 block 2r -- Q22 through the public entry point.
 *
 * Retained household cash is spent before invested assets by default: it earns
 * nothing and carries full basis, so drawing it first leaves the invested
 * account growing and realises no gains. Before the repair the cash holding
 * sorted last in its tax class, so the engine sold stock while the cash sat.
 * The coupled guard calls the engine's internal withdrawal functions. This file
 * reads the effect from runPlan(), with a fixture that actually holds cash when
 * it must draw.
 *
 * Household: single, 75 and retired, $400,000 of taxable stock at 40% basis
 * and a $500,000 traditional IRA, 8% return, no inflation, fees, pension or
 * benefits, manual order taxable first. Nothing is spent at 75, and the
 * required distribution's surplus is kept as cash (the RMD source's surplus
 * policy set to "retain"; it defaults to "invest"). From 76 a stage spends
 * $40,000 a year, beyond the required distribution, so the taxable class must
 * be drawn: the cash first by default, or the stock first with the order
 * "last".
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

const account = (o) => Object.assign({
  owner: 'self', contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
}, o);
function plan({ order, retainRmdSurplus }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 75, retireAge: 65, endAge: 79, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 8, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, pension: 0, pensionCola: 0, ssBenefit: 0, spouseSS: 0, dividendOn: false,
    withdrawalOrder: 'manual', manualOrder: 'taxable,preTax,roth,hsa', expenses: [], otherIncomes: [], flexibility: 0,
  });
  p.retirement.stages = [{ name: 'later', start: 76, end: 79, mode: 'amount', value: 40000, growthMode: 'fixed', annualChange: 0 }];
  Object.assign(p.advanced, { rmdOn: true, conversionOn: false, transferOn: false, debts: [], otherAssets: [], healthOn: false, ltcOn: false, surplusPolicy: 'retain' });
  if (retainRmdSurplus) p.advanced.surplusPolicyBySource = Object.assign({}, p.advanced.surplusPolicyBySource, { rmd: 'retain' });
  if (order) p.advanced.retainedCashOrder = order;
  p.accounts = [
    account({ id: 'stocks', name: 'Stocks', type: 'taxable', taxClass: 'taxable', balance: 400000, basisPct: 40, priority: 1 }),
    account({ id: 'ira', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', balance: 500000, basisPct: 0, priority: 2 }),
  ];
  return p;
}
const outcome = (o) => {
  const r = engine.runPlan(plan(o));
  assert.equal(r.status, 'ok', 'the plan runs');
  return { ending: r.rows[r.rows.length - 1].total, lifetimeTaxes: r.lifetimeTaxes };
};

test('Q22 (runPlan): with retained cash to draw on, spending it first ends the plan richer and less taxed than spending it last', () => {
  const first = outcome({ retainRmdSurplus: true });
  const last = outcome({ retainRmdSurplus: true, order: 'last' });
  assert.ok(first.ending - last.ending > 1000,
    'retained cash spent first must end the plan higher than spending it last, by more than $1,000: ' + first.ending + ' vs ' + last.ending);
  assert.ok(last.lifetimeTaxes - first.lifetimeTaxes > 100,
    'and it must realise less tax, by more than $100: ' + first.lifetimeTaxes + ' vs ' + last.lifetimeTaxes);
});

test('Q22 (runPlan): with the surplus invested and no cash held, the order has nothing to choose between', () => {
  const first = outcome({ retainRmdSurplus: false });
  const last = outcome({ retainRmdSurplus: false, order: 'last' });
  assert.equal(first.ending, last.ending, 'no cash holding: both orders end identically');
  assert.equal(first.lifetimeTaxes, last.lifetimeTaxes, 'and pay identical tax');
});
