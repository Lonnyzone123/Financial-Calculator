/* S5AA R35 (SA32F-39; Claude's R32F full-model audit FLOWS-06, qualified P3 by ChatGPT's R32V: "Document or decide whether set
 * amounts are before/after survivor adjustment; do not blindly apply the reduction twice") -- A "SET ANNUAL SPENDING" STAGE AND
 * THE SURVIVOR SPENDING REDUCTION.
 *
 * The stage was applied to the already-reduced survivor amount, so a percent stage kept the reduction and a set amount replaced
 * it: a household that set $50,000 and asked for 20% less after a death kept spending $50,000. No law decides this. The rule
 * adopted: a set amount names the HOUSEHOLD's spending, before the survivor reduction, exactly as the entered spending does, so the
 * reduction applies to it once. A percent stage is unchanged (the order of two multiplications does not matter).
 *
 * A couple at 70, incomeFirst $60,000, 0% inflation and return, the survivor switch on with a 20% reduction; the spouse dies at
 * 71, so the row opening at 72 is the first survivor year. */
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

function spendAt(stage) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 70, retireAge: 60, endAge: 74, spouseOn: true, spouseAge: 70, filing: 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 50 });
  Object.assign(p.retirement, { strategy: 'incomeFirst', spending: 60000, dividendOn: false, expenses: [], otherIncomes: [], pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: true, survivorSpendingReduction: 20, selfLife: 95, spouseLife: 71, flexibility: 0,
    stages: stage ? [Object.assign({ name: 'set', start: 60, end: 100, growthMode: 'none', annualChange: 0 }, stage)] : [] });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [{ id: 'roth', name: 'Roth', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 5000000, contribution: 0,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return (opening) => r.rows.find((x, k) => k > 0 && Math.abs(r.rows[k - 1].age - opening) < 1e-9).spending;
}

test('R35 SA32F-39: a set spending amount takes the survivor reduction after a death', () => {
  const spend = spendAt({ mode: 'amount', value: 50000 });
  assert.strictEqual(spend(70), 50000, 'both alive: the set amount');
  assert.strictEqual(spend(72), 40000, 'a survivor: the set amount less 20%. The engine kept 50,000.');
});

test('R35 SA32F-39: a percent stage and no stage are unchanged', () => {
  assert.strictEqual(spendAt({ mode: 'percent', value: 50 })(72), 60000 * 0.5 * 0.8, 'percent: 24,000 before and after the repair');
  assert.strictEqual(spendAt(null)(72), 48000, 'no stage: 60,000 less 20%');
});
