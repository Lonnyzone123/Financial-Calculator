/* S5AA R35 (SA32F-13; Claude's R32F full-model audit CONTRIB-06, qualified P1 by ChatGPT's R32V note F; the owner's decision 5b, 2026-09-29:
 * "vest over six years") -- VESTING IS DECIDED AT SEPARATION, ON CREDITED SERVICE.
 *
 * `vesting` multiplied every employer deposit by the entered percentage forever, so a 20%-vested employee kept 20% of every match however
 * long they stayed. IRC 411(a)(2)(B): employer money vests on years of service, fully within six years on a graded schedule (20% after
 * two years, 20 points a year to 100% after six) or three on a cliff; what is unvested is forfeited only when the employee separates.
 * R32V: decision 5b is a chosen schedule, and must "track vested/unvested employer money and forfeit only the relevant unvested balance
 * at modeled separation". Built:
 *   - employer money is deposited in full and its share of the account is tracked (growth and pro-rata draws leave the share alone);
 *   - service at the plan's start is `yearsOfService` if entered, else read from the entered vested percentage on the schedule
 *     (graded: 20% = two years, ... 100% = six); each completed year to separation adds one;
 *   - `vestingSchedule` is "graded6" (default) or "cliff3";
 *   - at the owner's separation (their retirement age, on their own clock) the unvested share of the employer money is forfeited.
 *
 * R32V's case: 45, a $100,000 salary, $6,000 a year deferred and matched 100% up to 6%, 20% vested, a 0% return, no spending. */
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

function plan(retireAge, acct) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 45, retireAge, endAge: retireAge + 2, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 100000, spouseSalary: 0, growth: 0, contributionStop: retireAge });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, stages: [], expenses: [], otherIncomes: [], pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, selfLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [Object.assign({ id: 'k', name: '401(k)', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 0, contribution: 6000,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {},
    matchOn: true, matchRate: 100, matchCap: 6, profitShare: 0, vesting: 20, priority: 1 }, acct || {})];
  return p;
}
function preTaxAt(retireAge, closing, acct) {
  const r = engine.runPlan(plan(retireAge, acct));
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return +r.rows.find((x) => Math.abs(x.age - closing) < 1e-9).preTax.toFixed(2);
}

test('R35 SA32F-13: staying long enough vests every match', () => {
  /* Ten years to 55: service 2 + 10 = 12 years, 100% vested at separation. 60,000 deferred + 60,000 matched = 120,000.
     The engine kept 20% of each match: 60,000 + 12,000 = 72,000. */
  assert.strictEqual(preTaxAt(55, 56), 120000);
});

test('R35 SA32F-13: an early separation forfeits only what is unvested then', () => {
  /* Two years to 47: service 2 + 2 = 4, 60% vested. 12,000 of match, 60% kept: 12,000 + 7,200 = 19,200 (the engine: 14,400). */
  assert.strictEqual(preTaxAt(47, 48), 19200);
  /* Service entered directly overrides the percentage: 5 years + 2 = 7, fully vested: 24,000. */
  assert.strictEqual(preTaxAt(47, 48, { yearsOfService: 5 }), 24000);
  /* A three-year cliff: 20% entered reads as under three years (0), and 2 more years is still under three -- all 12,000 forfeited. */
  assert.strictEqual(preTaxAt(47, 48, { vestingSchedule: 'cliff3' }), 12000);
});

test('R35 SA32F-13: a fully vested account is unchanged, and the validator reads the new fields', () => {
  assert.strictEqual(preTaxAt(47, 48, { vesting: 100 }), 24000);
  const bad = validateScenario(plan(47, { vestingSchedule: 'monthly', yearsOfService: -1 }));
  assert.ok(bad.issues.some((i) => i.path === 'accounts[0].vestingSchedule'));
  assert.ok(bad.issues.some((i) => i.path === 'accounts[0].yearsOfService'));
});
