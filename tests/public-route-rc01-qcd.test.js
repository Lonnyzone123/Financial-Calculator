'use strict';

/*
 * S5 block 2r -- RC-01's charitable-distribution half, through the public entry
 * point.
 *
 * A qualified charitable distribution excludes from taxable income only what
 * the required distribution actually paid out, never the amount requested.
 * Before the repair the exclusion was the request, capped at the required
 * amount, whether or not the IRA could fund it. So when the IRA fell short, a
 * request larger than the distribution cut income below what was received.
 * This file reaches the behaviour only through runPlan(), with a fixture of its
 * own.
 *
 * Household: single, 90 and retired, $400,000 held as cash and a $200,000
 * traditional IRA, required distributions on, no conversion or transfer, annual
 * withdrawal timing, and a -95% return (the engine's floor). The whole period's
 * loss lands before the distribution, so the IRA pays only 5% of its balance,
 * $10,000, against a larger required amount, and the run still completes.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require('../src/engine.js');
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const account = (o) => Object.assign({
  owner: 'self', contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
}, o);
function plan(qcd) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: -95, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'annual' });
  Object.assign(p.profile, { filing: 'single', spouseOn: false, age: 90, retireAge: 65, endAge: 91 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  p.accounts = [
    account({ id: 'cash', name: 'Cash', type: 'taxable', taxClass: 'taxable', balance: 400000, cashHolding: true, priority: 1, basisPct: 100 }),
    account({ id: 'ira', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', balance: 200000, priority: 2, basisPct: 0 }),
  ];
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, pension: 0, ssBenefit: 0, spouseSS: 0, flexibility: 0, dividendOn: false, otherIncomes: [], expenses: [], stages: [] });
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  Object.assign(p.advanced, { rmdOn: true, conversionOn: false, conversionAmount: 0, transferOn: false });
  if (qcd !== undefined) p.advanced.qcd = qcd;
  return p;
}
const rowOf = (qcd) => {
  const r = engine.runPlan(plan(qcd));
  assert.equal(r.status, 'ok', 'the plan runs');
  return r.rows[1];
};
const close = (a, b) => Math.abs(a - b) < 1e-6;

test('RC-01 (runPlan): a charitable distribution larger than what the IRA paid out excludes only what it paid out', () => {
  const row = rowOf(15000);
  assert.ok(row.rmdUnmet > 0 && close(row.rmdDistributed, 10000), 'premise: the IRA pays $10,000 of a larger required amount; distributed ' + row.rmdDistributed + ', unmet ' + row.rmdUnmet);
  assert.ok(close(row.magi, 0),
    'the exclusion cannot exceed what was distributed, so $10,000 received less a $10,000 exclusion is 0; MAGI was ' + row.magi);
});

test('RC-01 (runPlan): a charitable distribution equal to what was paid out excludes all of it, and none excludes nothing', () => {
  const equal = rowOf(10000);
  assert.ok(close(equal.rmdDistributed, 10000) && close(equal.magi, 0), 'a $10,000 request against $10,000 paid out: MAGI ' + equal.magi);
  const none = rowOf(undefined);
  assert.ok(close(none.magi, none.rmdDistributed), 'with no request, the whole distribution is income: MAGI ' + none.magi + ', distributed ' + none.rmdDistributed);
});
