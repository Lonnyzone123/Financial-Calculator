'use strict';

/*
 * S5 block 2r -- RC-01 through the public entry point.
 *
 * A conversion may not consume the dollars the year's required distribution is
 * owed from. Before the repair a conversion took the whole pretax balance, the
 * required distribution then drew on an empty account, and the row still
 * reported the obligation as met. Now the engine reserves the required amount
 * first, and a run that leaves it unfunded is invalid. The coupled guard's file
 * also loads unbundled debt modules; this file reaches the behaviour only
 * through runPlan(), with a fixture of its own.
 *
 * Household: single, 80 and retired, zero returns and inflation, no spending,
 * $400,000 held as cash, a $200,000 traditional IRA and an empty Roth, required
 * distributions on. The Uniform Lifetime divisor at 80 is 20.2, so the year owes
 * 200,000 / 20.2 -- computed here, not read from the result.
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

const REQUIRED = 200000 / 20.2;

const account = (o) => Object.assign({
  owner: 'self', contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
}, o);
function plan(conversion) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.profile, { filing: 'single', spouseOn: false, age: 80, retireAge: 65, endAge: 81 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  p.accounts = [
    account({ id: 'cash', name: 'Cash', type: 'taxable', taxClass: 'taxable', balance: 400000, cashHolding: true, priority: 1, basisPct: 100 }),
    account({ id: 'ira', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', balance: 200000, priority: 2, basisPct: 0 }),
    account({ id: 'roth', name: 'Roth', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 3, basisPct: 100 }),
  ];
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, pension: 0, ssBenefit: 0, spouseSS: 0, flexibility: 0, dividendOn: true, dividendYield: 0, otherIncomes: [], expenses: [], stages: [] });
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  Object.assign(p.advanced, { rmdOn: true, conversionOn: conversion > 0, conversionAmount: conversion, transferOn: false });
  return p;
}
const close = (a, b) => Math.abs(a - b) < 1e-6;

test('RC-01 (runPlan): a conversion leaves the dollars the required distribution is owed from, and the distribution is taken in full', () => {
  const r = engine.runPlan(plan(250000));
  assert.equal(r.status, 'ok',
    'a conversion that takes the dollars the required distribution is owed from invalidates the run (' + r.calculationErrorCode + '); it must leave them to be distributed');
  const row = r.rows[1];
  assert.ok(close(row.rmdDistributed, REQUIRED), 'the required distribution is taken in full: expected ' + REQUIRED + ', got ' + row.rmdDistributed);
  assert.ok(close(row.rmdUnmet, 0), 'nothing is left unmet; got ' + row.rmdUnmet);
  assert.ok(close(row.roth, 200000 - REQUIRED), 'the conversion takes only what is left: expected ' + (200000 - REQUIRED) + ', got ' + row.roth);
  assert.ok(close(row.preTax, 0), 'the IRA ends empty; got ' + row.preTax);
});

test('RC-01 (runPlan): a conversion with room to spare converts the whole request, and with no conversion the distribution is taken in full', () => {
  const small = engine.runPlan(plan(50000));
  assert.equal(small.status, 'ok');
  assert.ok(close(small.rows[1].roth, 50000), 'the whole $50,000 is converted; got ' + small.rows[1].roth);
  assert.ok(close(small.rows[1].rmdDistributed, REQUIRED) && close(small.rows[1].preTax, 150000 - REQUIRED),
    'and the required distribution is taken beside it: distributed ' + small.rows[1].rmdDistributed + ', IRA ' + small.rows[1].preTax);
  const none = engine.runPlan(plan(0));
  assert.equal(none.status, 'ok');
  assert.ok(close(none.rows[1].rmdDistributed, REQUIRED) && close(none.rows[1].roth, 0) && close(none.rows[1].preTax, 200000 - REQUIRED),
    'with no conversion: distributed ' + none.rows[1].rmdDistributed + ', Roth ' + none.rows[1].roth + ', IRA ' + none.rows[1].preTax);
});
