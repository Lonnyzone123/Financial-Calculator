/* S5AA R35 (SA32F-26; Claude's R32F full-model audit RMDROTH-02, qualified P2 by ChatGPT's R32V note C) -- THE STILL-WORKING
 * EXCEPTION.
 *
 * IRC 401(a)(9)(C)(i)-(ii): for a participant in a qualified plan who is not a 5-percent owner, the required beginning date is
 * April 1 of the year after the LATER of the year they reach the applicable age and the year they retire from the employer
 * maintaining the plan. It reaches only that employer's plan, never an IRA, and never a 5-percent owner. R32V: "Employment alone
 * does not exempt old-employer plans or IRAs" -- so each workplace account says whether it is the plan of the employer the owner
 * still works for (`currentEmployerPlan`; absent, yes when the account receives contributions) and whether the owner owns 5% of it
 * (`fivePercentOwner`, default no). While the owner is paid and retires at least a year after the row opens, that plan owes no
 * distribution; the year of retirement is the first distribution year.
 *
 * R32F's case: 73, still working at $100,000 to 76, a $500,000 traditional 401(k) receiving contributions: the engine charged
 * 500,000 / 26.5 = 18,867.92; the law charges nothing. */
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
  Object.assign(p.profile, { age: 73, retireAge: o.retireAge === undefined ? 76 : o.retireAge, endAge: 78, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: o.salary === undefined ? 100000 : o.salary, spouseSalary: 0, growth: 0, contributionStop: 80 });
  Object.assign(p.retirement, { strategy: 'incomeFirst', spending: 0, dividendOn: false, stages: [], expenses: [], otherIncomes: [], pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, selfLife: 95, qcdOn: false });
  Object.assign(p.advanced, { rmdOn: true, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [Object.assign({ id: 'k', name: '401(k)', type: o.type || 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 500000,
    contribution: o.contribution === undefined ? 5000 : o.contribution, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    priority: 1 }, o.account || {})];
  return p;
}
function rmdRow(o, k) {
  const r = engine.runPlan(plan(o));
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return +r.rows[k || 1].rmd.toFixed(2);
}
const UNIFORM_73 = +(500000 / 26.5).toFixed(2);

test('R35 SA32F-26: the plan of the employer the owner still works for owes no distribution', () => {
  assert.strictEqual(rmdRow({}), 0, 'still working at 73: nothing. The engine charged 18,867.92.');
});

test('R35 SA32F-26: the exception does not reach an IRA, a 5% owner, an old employer\'s plan, or a retired owner', () => {
  assert.strictEqual(rmdRow({ type: 'traditionalIRA', contribution: 0 }), UNIFORM_73, 'an IRA');
  assert.strictEqual(rmdRow({ account: { fivePercentOwner: true } }), UNIFORM_73, 'a 5-percent owner');
  assert.strictEqual(rmdRow({ account: { currentEmployerPlan: false } }), UNIFORM_73, 'an old employer\'s plan');
  assert.strictEqual(rmdRow({ contribution: 0 }), UNIFORM_73, 'no contributions and nothing entered: not assumed to be the current employer\'s');
  assert.strictEqual(rmdRow({ contribution: 0, account: { currentEmployerPlan: true } }), 0, 'said to be the current employer\'s: exempt');
  assert.strictEqual(rmdRow({ retireAge: 73.5 }), UNIFORM_73, 'retiring inside the year: the first distribution year');
  assert.strictEqual(rmdRow({ salary: 0 }), UNIFORM_73, 'no pay: not employed');
});

test('R35 SA32F-26: the validator reads both fields as yes/no', () => {
  const bad = validateScenario(plan({ account: { currentEmployerPlan: 'yes', fivePercentOwner: 1 } }));
  assert.ok(bad.issues.some((i) => i.path === 'accounts[0].currentEmployerPlan'));
  assert.ok(bad.issues.some((i) => i.path === 'accounts[0].fivePercentOwner'));
});
