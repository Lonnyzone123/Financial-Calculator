'use strict';

/*
 * S5 block 2r -- RB-02 through the public entry points.
 *
 * An account enrols as household cash only when its cashHolding flag is the
 * boolean true and the account is taxable with a 100% basis. The string
 * "false" is truthy, and before the repair it enrolled a Roth IRA as cash: the
 * year's surplus went into the Roth instead of being retained as taxable cash.
 * runPlan() and runScenario() now refuse a malformed flag at their own
 * boundary. The coupled guard also calls engine internals. This file reads
 * only what runPlan() and runScenario() return.
 *
 * Plan: single, 65 and retired, a $100,000 Roth IRA at a 10% return, $20,000
 * fixed spending against a $60,000 pension from 65, no Social Security.
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

function plan(flag) {
  const p = defaultPlan();
  p.setupComplete = true;
  Object.assign(p.profile, { filing: 'single', spouseOn: false, age: 65, retireAge: 65, endAge: 67 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 10, inflation: 0, fee: 0 });
  Object.assign(p.retirement, { dividendOn: false, strategy: 'fixedNominal', spending: 20000, ssBenefit: 0, pension: 60000, pensionStart: 65 });
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  const roth = {
    id: 'roth1', name: 'Roth', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 100000, contribution: 0,
    contributionMode: 'amount', priority: 1, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
    changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  };
  if (flag !== undefined) roth.cashHolding = flag;
  p.accounts = [roth];
  return p;
}
const entryPoints = [['runPlan', engine.runPlan], ['runScenario', engine.runScenario]];

test('RB-02 (runPlan): a cashHolding flag given as the string "false" is refused at the boundary by runPlan() and runScenario()', () => {
  for (const [name, run] of entryPoints) {
    const r = run(plan('false'));
    assert.equal(r.status, 'calculation_error',
      'a non-boolean cashHolding flag must be refused at the boundary: ' + name + ' returned status ' + r.status + ', code ' + r.calculationErrorCode);
    assert.equal(r.calculationErrorCode, 'SCENARIO_INVALID_CASH_HOLDING', name + ' names the refusal');
    assert.equal(r.rows, null, name + ' publishes no rows for a refused plan');
  }
});

test('RB-02 (runPlan): cashHolding true on a Roth IRA is refused too, because cash holdings must be taxable', () => {
  for (const [name, run] of entryPoints) {
    const r = run(plan(true));
    assert.equal(r.status, 'calculation_error',
      'cashHolding true on a non-taxable account must be refused at the boundary: ' + name + ' returned status ' + r.status + ', code ' + r.calculationErrorCode);
    assert.equal(r.calculationErrorCode, 'SCENARIO_INVALID_CASH_HOLDING', name + ' names the refusal');
  }
});

test('RB-02 (runPlan): with no flag the Roth grows at 10% and the surplus is retained as taxable cash', () => {
  for (const [name, run] of entryPoints) {
    const r = run(plan(undefined));
    assert.equal(r.status, 'ok', name + ': the plan runs');
    assert.ok(Math.abs(r.rows[1].roth - 110000) < 0.01, name + ': the Roth grows to $110,000: ' + r.rows[1].roth);
    /* R6 (S5 task 8): $34,602.50 before Arizona's age-65 exemption left $52.50 more; it returns exactly with the exemption at $0. */
    /* S5AA task 3.1 (Q88): 34,655 before the IRC 63(f) additional deduction for the aged (+$246). */
    assert.ok(Math.abs(r.rows[1].taxable - 34901) < 0.01, name + ': the surplus is retained as taxable cash, $34,901.00: ' + r.rows[1].taxable);
  }
});
