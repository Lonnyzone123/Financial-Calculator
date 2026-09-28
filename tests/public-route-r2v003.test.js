'use strict';

/*
 * S5 block 2r -- R2V-003 through the public entry points.
 *
 * A calculation error is reported as one. calculationError is an explicit
 * top-level field, true, and the success rate is null rather than 0. Before the
 * repair, a simple-mode run that failed inside the simulation came back as an
 * ordinary 0% success, which reads as "this plan runs out of money". A plan that
 * genuinely runs out of money keeps its numeric 0% and its failure flag. The
 * coupled guards build path results by hand and call the simulation directly.
 * This file reads only what runPlan() and runScenario() return.
 *
 * Plans: 75 and retired, simple mode, required distributions on. The failing
 * plan has a 7% return on a 401(k) balance of 1e308, which passes every input
 * check and overflows during growth; the insolvent plan spends $500,000 from
 * $100,000.
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
  id: 'pretax', name: '401k', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 100000, contribution: 0,
  contributionMode: 'amount', priority: 1, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
}, o);
function plan({ balance, returnRate, spending }) {
  const p = defaultPlan();
  p.setupComplete = true;
  Object.assign(p.profile, { age: 75, retireAge: 65, endAge: 76 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { ssBenefit: 0, dividendOn: false, strategy: 'fixedNominal', spending });
  p.advanced.rmdOn = true;
  Object.assign(p.assumptions, { returnRate, method: 'simple' });
  p.accounts = [account({ balance })];
  return p;
}
const entryPoints = [['runPlan', engine.runPlan], ['runScenario', engine.runScenario]];

test('R2V-003 (runPlan): a calculation error inside a simple-mode run is flagged as one by runPlan() and runScenario(), with no success rate', () => {
  for (const [name, run] of entryPoints) {
    const r = run(plan({ balance: 1e308, returnRate: 7, spending: 0 }));
    assert.equal(r.calculationError, true,
      'a calculation error must be reported as one, not as a financial failure: ' + name + ' returned calculationError ' + r.calculationError + ', successRate ' + r.successRate);
    assert.equal(r.successRate, null, name + ': no success rate, not 0%');
    assert.ok(r.calculationErrorCode, name + ': a specific error code');
  }
});

test('R2V-003 (runPlan): a plan that genuinely runs out of money keeps a numeric 0% and its failure flag, with no calculation error', () => {
  for (const [name, run] of entryPoints) {
    const r = run(plan({ balance: 100000, returnRate: 0, spending: 500000 }));
    assert.equal(r.calculationError, false, name + ': insolvency is not a calculation error');
    assert.equal(r.successRate, 0, name + ': a numeric 0% success');
    assert.equal(r.failed, true, name + ': and the financial failure flag');
  }
});
