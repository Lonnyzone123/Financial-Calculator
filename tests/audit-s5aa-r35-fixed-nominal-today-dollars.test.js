/* S5AA R35 (SA32F-36; Claude's R32F full-model audit FLOWS-02, confirmed P2 by ChatGPT's R32V; the owner's decision 6, 2026-09-29:
 * "inflate fixed-nominal spending to retirement") -- FIXED-NOMINAL SPENDING IS ENTERED IN TODAY'S DOLLARS.
 *
 * The input is labelled "Annual spending in today's dollars". `incomeFirst` reads it that way (spending x the row's inflation
 * factor); `fixedNominal` paid the bare figure however far off retirement was. Decision 6, as R32V qualified it: grow the
 * today's-dollar base through the retirement date, then hold that nominal amount. The first retired row therefore spends what
 * `incomeFirst` spends in it, and every later row the same nominal figure. A chosen convention, not a law.
 *
 * The audit's case: 40 today, retiring at 65, 3.5% inflation, $60,000: 60,000 x 1.035^25 = 141,794.70 (the engine paid 60,000). */
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

function run(strategy, age, retireAge) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age, retireAge, endAge: retireAge + 3, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 3.5, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: age });
  Object.assign(p.retirement, { strategy, spending: 60000, dividendOn: false, stages: [], expenses: [], otherIncomes: [], pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, selfLife: 100 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [{ id: 'roth', name: 'Roth', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 50000000, contribution: 0,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return (opening) => r.rows.find((x, k) => k > 0 && Math.abs(r.rows[k - 1].age - opening) < 1e-9).spending;
}

test('R35 SA32F-36: fixed-nominal spending is today\'s dollars grown to the retirement date, then held', () => {
  const spend = run('fixedNominal', 40, 65);
  const atRetirement = 60000 * Math.pow(1.035, 25);   /* 141,794.70 */
  assert.ok(Math.abs(spend(65) - atRetirement) < 0.01, 'the first retired year: ' + spend(65) + ' against ' + atRetirement.toFixed(2));
  assert.ok(Math.abs(spend(66) - atRetirement) < 0.01, 'and then held, nominal: ' + spend(66));
  assert.ok(Math.abs(spend(67) - atRetirement) < 0.01);
  /* The first retired year is what incomeFirst spends in it. */
  assert.ok(Math.abs(run('incomeFirst', 40, 65)(65) - spend(65)) < 1e-6);
});

test('R35 SA32F-36: a household already retired spends the entered figure, unchanged, as before', () => {
  const spend = run('fixedNominal', 65, 65);
  assert.strictEqual(spend(65), 60000);
  assert.strictEqual(spend(67), 60000);
});
