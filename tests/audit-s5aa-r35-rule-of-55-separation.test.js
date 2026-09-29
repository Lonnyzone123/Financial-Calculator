/* S5AA R35 (SA32F-22; Claude's R32F full-model audit STHLTH-02, confirmed P2 by ChatGPT's R32V note H) -- THE RULE OF 55 NEEDS THE
 * SEPARATION.
 *
 * IRC 72(t)(2)(A)(v): the 10% additional tax does not apply to a distribution "made to an employee after separation from service
 * after attainment of age 55" -- in or after the calendar year the employee turns 55 (IRS, Retirement topics -- exceptions) -- from
 * the plan of the employer separated from; never from an IRA. The engine exempted every workplace-plan draw at 55 or older under a
 * household switch, even after a separation at 50. R32V: the switch may stand as "a user certification of eligibility" if it states the
 * separation-year condition and detects contradictory facts. So the switch stays -- the household's statement that its workplace plans
 * are with the employer it leaves -- and the facts are checked: the owner has left work (their retirement age, on their own clock) in
 * or after the year they turn 55 (with the plan's birth-year reading, floor(retireAge - startAge) + floor(startAge) >= 55), and the
 * account is not marked as another employer's (`currentEmployerPlan: false`).
 *
 * A single 56-year-old, retired, $20,000 of spending from a $500,000 traditional 401(k) that was receiving contributions, a 0%
 * return. 2026: standard deduction 16,100, 10% federal band to 12,400, Arizona 2.5% after the same 16,100. The draw D pays the
 * spending and its own tax: without the penalty D = 20,000 + 0.125 (D - 16,100) = 20,557.14; with it D = 20,000 + 0.125 (D -
 * 16,100) + 0.10 D = 23,209.68. */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function draw(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 56, retireAge: o.retireAge, endAge: 58, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 50 });
  Object.assign(p.retirement, { strategy: 'incomeFirst', spending: 20000, dividendOn: false, stages: [], expenses: [], otherIncomes: [], pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, selfLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false, penaltyException: false, rule55: o.rule55 !== false });
  p.accounts = [Object.assign({ id: 'k', name: '401(k)', type: o.type || 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 500000,
    contribution: 5000, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }, o.account || {})];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return +r.rows[1].withdrawals.toFixed(2);
}
const FREE = +(17987.5 / 0.875).toFixed(2), PENALISED = +(17987.5 / 0.775).toFixed(2);

test('R35 SA32F-22: a separation before the year of 55 does not qualify', () => {
  assert.strictEqual(draw({ retireAge: 50 }), PENALISED, 'retired at 50, drawing at 56: the 10% applies. The engine waived it.');
});

test('R35 SA32F-22: a separation in or after the year of 55 qualifies, with the switch on', () => {
  assert.strictEqual(draw({ retireAge: 55 }), FREE, 'left at 55');
  assert.strictEqual(draw({ retireAge: 56 }), FREE, 'left at 56');
  assert.strictEqual(draw({ retireAge: 56, rule55: false }), PENALISED, 'CONTROL: the switch off, the household has not said its plan qualifies');
});

test('R35 SA32F-22: never an IRA, and never an old employer\'s plan', () => {
  assert.strictEqual(draw({ retireAge: 55, type: 'traditionalIRA' }), PENALISED, 'an IRA');
  assert.strictEqual(draw({ retireAge: 55, account: { currentEmployerPlan: false } }), PENALISED, 'the plan of an employer left earlier');
});
