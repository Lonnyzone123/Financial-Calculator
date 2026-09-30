/* S5AA R38 (found in Claude's check of R35-01; the owner 2026-09-29: "include item 3 with age 65") -- EMPLOYER MONEY IS FULLY VESTED AT
 * NORMAL RETIREMENT AGE.
 *
 * IRC 411(a): a qualified plan must provide that "an employee's right to his normal retirement benefit is nonforfeitable upon the attainment
 * of normal retirement age". 411(a)(8): normal retirement age is the earlier of the plan's own normal retirement age and the later of age
 * 65 and the fifth anniversary of the participant's entry. The plan's own age is not an input; the owner chose 65, which the statute's
 * formula then also gives. R35 vested on service alone, so an employee retiring at 65 or later with fewer than six years (graded) or
 * three (cliff) forfeited employer money the law says is theirs.
 *
 * The case: 63, a $100,000 salary, $6,000 a year deferred and matched 100% up to 6%, 20% vested (two years of service), 0% return, no
 * spending. Each expectation is worked by hand below. */
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

function preTaxAfter(retireAge, acct) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 63, retireAge, endAge: 67, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 100000, spouseSalary: 0, growth: 0, contributionStop: retireAge });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, stages: [], expenses: [], otherIncomes: [], pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, selfLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [Object.assign({ id: 'k', name: '401(k)', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 0, contribution: 6000,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {},
    matchOn: true, matchRate: 100, matchCap: 6, profitShare: 0, vesting: 20, priority: 1 }, acct || {})];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return +r.rows[r.rows.length - 1].preTax.toFixed(2);
}

test('R38: retiring at 65 or later keeps every employer dollar (IRC 411(a), normal retirement age 65)', () => {
  /* 65.5: two and a half years, $15,000 deferred and $15,000 matched. Service 2 + 2 = 4 would be 60% (24,000); at 65 or later the match
     is nonforfeitable: 30,000. */
  assert.strictEqual(preTaxAfter(65.5), 30000);
  /* Exactly 65, on a row boundary: $12,000 each; 24,000, where service alone (4 years, 60%) gave 19,200. */
  assert.strictEqual(preTaxAfter(65), 24000);
  /* A three-year cliff with no service entered (0): after 2.5 years service alone vests nothing (15,000); at 65.5 it is all kept. */
  assert.strictEqual(preTaxAfter(65.5, { vestingSchedule: 'cliff3', vesting: 0 }), 30000);
});

test('R38: control -- retiring before 65 still forfeits the unvested share', () => {
  /* 64.5: $9,000 each; service 2 + 1 = 3, 40% vested: 9,000 + 3,600 = 12,600, before and after. */
  assert.strictEqual(preTaxAfter(64.5), 12600);
});
