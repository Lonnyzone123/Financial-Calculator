/* S5AA R39 (R38-02, ChatGPT's R38 change audit, P2; the owner 2026-09-29: "go with your recommendations") -- A SEPARATION AT 55 OR LATER
 * QUALIFIES FOR THE RULE OF 55, WHATEVER THE PLAN'S STARTING AGE.
 *
 * IRC 72(t)(2)(A)(v) exempts a distribution "made to an employee after separation from service after attainment of age 55"; the IRS reads it
 * as a separation "during or after the year the employee reaches age 55" (Retirement topics - exceptions to tax on early distributions).
 * R35 tested only the calendar-year reading, with the plan's birth-year convention -- floor(retireAge - startAge) + floor(startAge) >= 55 --
 * which, from a fractional start, can deny a person who separated at 55 itself: starting at 54.5 and separating at 55 gives 0 + 54. A
 * separation at 55 or later has attained 55, so it now qualifies outright; the calendar-year reading still admits a separation earlier in
 * the year of 55.
 *
 * ChatGPT's witness: single, starting at 54.5, separating at 55 from a current employer, $50,000 moved from that employer's 401(k) to a
 * taxable account at 55.5; no wages, returns, spending or dividends. The age-56 row's tax on $50,000 of ordinary income, worked by hand on
 * the 2026 figures: 50,000 - 16,100 = 33,900; federal 10% of 12,400 + 12% of 21,500 = 3,820; Arizona 2.5% of 33,900 = 847.50; total
 * 4,667.50. With the 10% additional tax: 9,667.50. */
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

const acct = (extra) => Object.assign({ id: 'a', name: 'A', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 0,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
  futureChanges: [], allocation: {}, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0, vesting: 100, priority: 1 }, extra);

function taxAt56(start, separation, source) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: start, retireAge: separation, endAge: 56, filing: 'single', spouseOn: false });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: separation });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, pension: 0, ssBenefit: 0,
    spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: true, transferAge: 55.5, transferAmount: 50000,
    transferFrom: 'w', transferTo: 't', rule55: true, penaltyException: false });
  p.accounts = [acct(Object.assign({ id: 'w', name: 'Workplace plan', balance: 900000, currentEmployerPlan: true }, source)),
    acct({ id: 't', name: 'Taxable', type: 'taxable', taxClass: 'taxable', balance: 300000, basisPct: 100 })];
  assert.ok(validateScenario(p).valid, 'witness must be a valid plan');
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return +r.rows.find((x) => Math.abs(x.age - 56) < 1e-9).taxes.toFixed(2);
}

test('R39 R38-02: a separation at 55 from a fractional start qualifies', () => {
  assert.strictEqual(taxAt56(54.5, 55), 4667.5);   // ChatGPT's witness: 0 + 54 denied it (9,667.50)
  assert.strictEqual(taxAt56(53.5, 55), 4667.5);   // an earlier fractional start: 1 + 53 denied it too
  assert.strictEqual(taxAt56(54, 55), 4667.5);     // a whole start, as before
});

test('R39 R38-02: controls -- a separation before the year of 55, an IRA and another employer\'s plan still pay the 10%', () => {
  assert.strictEqual(taxAt56(53.5, 54), 9667.5);                                       // separated at 54, in the year of 54
  assert.strictEqual(taxAt56(54.5, 55, { type: 'traditionalIRA', currentEmployerPlan: undefined }), 9667.5);  // not a workplace plan
  assert.strictEqual(taxAt56(54.5, 55, { currentEmployerPlan: false }), 9667.5);      // a former employer's plan
});
