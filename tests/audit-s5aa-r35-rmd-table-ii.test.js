/* S5AA R35 (SA32F-08; Claude's R32F full-model audit RMDROTH-01 / LIFE-03, qualified P2 by ChatGPT's R32V note C) -- THE JOINT AND
 * LAST SURVIVOR TABLE.
 *
 * 26 CFR 1.401(a)(9)-5(c)(2): if the employee's sole designated beneficiary is a spouse more than ten years younger, the
 * distribution period is the joint and last survivor life expectancy of the two, from the Joint and Last Survivor Table of
 * 1.401(a)(9)-9(d) (Publication 590-B, Table II), not the Uniform Lifetime Table. R32V: "Future spousal succession is not enough to
 * establish today's beneficiary designation" -- so it is an input: each pre-tax account's `spouseSoleBeneficiary`, default true
 * (the plan already assumes the spouse inherits, MODEL_ASSUMPTIONS 18.1), and false restores the Uniform table. Whether the spouse
 * qualifies is read at the start of the year (1.401(a)(9)-5(c)(2): "determined as of January 1"): alive at the row's opening.
 *
 * The table's values are the regulation's, read from eCFR (26 CFR 1.401(a)(9)-9(d)) and pinned in the rules package; R32V's case:
 * owner 75, spouse 64, $100,000: 100,000 / 25.3 = 3,952.57, against 4,065.04 on the Uniform table's 24.6. */
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
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 75, retireAge: 60, endAge: 78, spouseOn: true, spouseAge: o.spouseAge, filing: 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 50 });
  Object.assign(p.retirement, { strategy: 'incomeFirst', spending: 0, dividendOn: false, stages: [], expenses: [], otherIncomes: [], pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, selfLife: 95, spouseLife: o.spouseLife || 95, qcdOn: false });
  Object.assign(p.advanced, { rmdOn: true, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [Object.assign({ id: 'ira', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', owner: 'self', balance: 100000, contribution: 0,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {},
    matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }, o.account || {})];
  return p;
}
function rmdAt75(o) {
  const r = engine.runPlan(plan(o));
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return +r.rows[1].rmd.toFixed(2);
}

test('R35 SA32F-08: a spouse more than ten years younger and the sole beneficiary gives the Table II divisor', () => {
  assert.strictEqual(rmdAt75({ spouseAge: 64 }), +(100000 / 25.3).toFixed(2), 'Table II at 75/64: 25.3. The engine used 24.6.');
});

test('R35 SA32F-08: the Uniform table where the conditions fail', () => {
  const uniform = +(100000 / 24.6).toFixed(2);
  assert.strictEqual(rmdAt75({ spouseAge: 66 }), uniform, 'nine years younger: Uniform');
  assert.strictEqual(rmdAt75({ spouseAge: 65 }), uniform, 'exactly ten years younger is not MORE than ten: Uniform');
  assert.strictEqual(rmdAt75({ spouseAge: 64, account: { spouseSoleBeneficiary: false } }), uniform, 'not the sole beneficiary: Uniform');
  assert.strictEqual(rmdAt75({ spouseAge: 64, spouseLife: 60 }), uniform, 'a spouse who died before the year opened: Uniform');
});

test('R35 SA32F-08: the validator reads the field as a yes/no', () => {
  const bad = validateScenario(plan({ spouseAge: 64, account: { spouseSoleBeneficiary: 'yes' } }));
  assert.ok(bad.issues.some((i) => i.path === 'accounts[0].spouseSoleBeneficiary'), 'a non-boolean is reported');
  assert.ok(!validateScenario(plan({ spouseAge: 64, account: { spouseSoleBeneficiary: false } })).issues.some((i) => /spouseSoleBeneficiary/.test(i.path || '')));
});
